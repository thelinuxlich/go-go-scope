/**
 * Cloudflare Durable Objects persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state using
 * Cloudflare Durable Objects as the backend. Ideal for edge deployments.
 *
 * @example
 * ```typescript
 * import { DurableObjectAdapter } from "@go-go-scope/persistence-cloudflare-do";
 *
 * export class MyDurableObject extends DurableObject {
 *   private persistence: DurableObjectAdapter;
 *
 *   constructor(state: DurableObjectState, env: Env) {
 *     super(state, env);
 *     this.persistence = new DurableObjectAdapter(state.storage);
 *   }
 *
 *   async fetch(request: Request) {
 *     await using s = scope({ persistence: this.persistence });
 *
 *     // Acquire a distributed lock
 *     const lock = await s.acquireLock("resource:123", 30000);
 *     if (!lock) {
 *       return new Response("Lock failed", { status: 423 });
 *     }
 *
 *     // Process request
 *     return new Response("Success");
 *   }
 * }
 * ```
 */

import type {
	CacheProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";

/**
 * Durable Object storage interface
 */
interface DurableObjectStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<void>;
	transaction<T>(closure: (txn: DurableObjectTransaction) => Promise<T>): Promise<T>;
	list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
}

/**
 * Durable Object transaction interface
 */
interface DurableObjectTransaction {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): void;
	delete(key: string): void;
}

/**
 * Cloudflare Durable Objects persistence adapter
 */
export class DurableObjectAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CacheProvider,
		PersistenceAdapter
{
	private readonly storage: DurableObjectStorage;
	private readonly keyPrefix: string;

	constructor(storage: DurableObjectStorage, options: PersistenceAdapterOptions = {}) {
		this.storage = storage;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// Durable Objects storage is always available
	}

	async disconnect(): Promise<void> {
		// Nothing to disconnect
	}

	isConnected(): boolean {
		return true;
	}

	// ============================================================================
	// Lock Provider
	// ============================================================================

	async acquire(
		key: string,
		ttl: number,
		owner?: string,
	): Promise<LockHandle | null> {
		const fullKey = this.prefix(`lock:${key}`);
		const lockOwner = owner ?? this.generateOwner();
		const expiry = Date.now() + ttl;

		try {
			// Use transaction for atomic check-and-set
			const acquired = await this.storage.transaction(async (txn) => {
				const existing = await txn.get<{ owner: string; expiry: number }>(fullKey);

				// Check if lock exists and hasn't expired
				if (existing && existing.expiry > Date.now()) {
					// Lock is held by someone else
					if (existing.owner !== lockOwner) {
						return false;
					}
					// Same owner - extend the lock
				}

				// Acquire/extend lock
				txn.put(fullKey, { owner: lockOwner, expiry });
				return true;
			});

			if (!acquired) {
				return null;
			}

			return this.createLockHandle(key, lockOwner);
		} catch {
			return null;
		}
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const newExpiry = Date.now() + ttl;

		try {
			return await this.storage.transaction(async (txn) => {
				const existing = await txn.get<{ owner: string; expiry: number }>(fullKey);

				if (!existing || existing.owner !== owner) {
					return false;
				}

				txn.put(fullKey, { owner, expiry: newExpiry });
				return true;
			});
		} catch {
			return false;
		}
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.storage.delete(fullKey);
	}

	private createLockHandle(key: string, owner: string): LockHandle {
		const self = this;

		return {
			async release() {
				const fullKey = self.prefix(`lock:${key}`);
				const existing = await self.storage.get<{ owner: string }>(fullKey);
				if (existing?.owner === owner) {
					await self.storage.delete(fullKey);
				}
			},

			async extend(ttl: number) {
				return self.extend(key, ttl, owner);
			},

			async isValid() {
				const fullKey = self.prefix(`lock:${key}`);
				const existing = await self.storage.get<{ owner: string; expiry: number }>(fullKey);
				return existing?.owner === owner && existing.expiry > Date.now();
			},
		};
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(
		key: string,
	): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`cb:${key}`);
		const state = await this.storage.get<CircuitBreakerPersistedState>(fullKey);
		return state ?? null;
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`cb:${key}`);
		await this.storage.put(fullKey, state);
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		const fullKey = this.prefix(`cb:${key}`);
		const now = Date.now();

		return this.storage.transaction(async (txn) => {
			const existing = await txn.get<CircuitBreakerPersistedState>(fullKey);

			const currentState = existing ?? {
				state: "closed" as const,
				failureCount: 0,
			};

			const newState: CircuitBreakerPersistedState = {
				...currentState,
				state:
					currentState.failureCount + 1 >= maxFailures ? "open" : "closed",
				failureCount: currentState.failureCount + 1,
				lastFailureTime: now,
			};

			txn.put(fullKey, newState);
			return newState.failureCount;
		});
	}

	async recordSuccess(key: string): Promise<void> {
		const fullKey = this.prefix(`cb:${key}`);
		const now = Date.now();

		return this.storage.transaction(async (txn) => {
			const existing = await txn.get<CircuitBreakerPersistedState>(fullKey);

			if (!existing) {
				return;
			}

			const newState: CircuitBreakerPersistedState = {
				...existing,
				state: "closed",
				failureCount: 0,
				lastSuccessTime: now,
			};

			txn.put(fullKey, newState);
		});
	}

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);
		const entry = await this.storage.get<{ value: T; expiresAt?: number }>(fullKey);

		if (!entry) {
			return null;
		}

		// Check expiration
		if (entry.expiresAt && entry.expiresAt < Date.now()) {
			await this.storage.delete(fullKey);
			return null;
		}

		return entry.value;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const expiresAt = ttl ? Date.now() + ttl : undefined;
		await this.storage.put(fullKey, { value, expiresAt });
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		await this.storage.delete(fullKey);
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(`cache:${key}`);
		const entry = await this.storage.get<{ expiresAt?: number }>(fullKey);

		if (!entry) {
			return false;
		}

		// Check expiration
		if (entry.expiresAt && entry.expiresAt < Date.now()) {
			await this.storage.delete(fullKey);
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		// List all keys with our prefix and delete them
		const prefix = this.prefix("cache:");
		const entries = await this.storage.list<{ value: unknown }>({ prefix });

		for (const [key] of entries) {
			await this.storage.delete(key);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		const prefix = this.prefix("cache:");
		const entries = await this.storage.list<{ expiresAt?: number }>({ prefix });
		const keys: string[] = [];
		const prefixLength = prefix.length;

		for (const [key, value] of entries) {
			// Check expiration
			if (value.expiresAt && value.expiresAt < Date.now()) {
				await this.storage.delete(key);
				continue;
			}

			const shortKey = key.slice(prefixLength);
			if (!pattern || shortKey.includes(pattern)) {
				keys.push(shortKey);
			}
		}

		return keys;
	}
}

export type {
	LockHandle,
	CircuitBreakerPersistedState,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";
