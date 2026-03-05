/**
 * Deno KV persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * using Deno's native KV store as the backend.
 *
 * @example
 * ```typescript
 * import { DenoKVAdapter } from "@go-go-scope/persistence-deno-kv";
 *
 * const kv = await Deno.openKv();
 * const persistence = new DenoKVAdapter(kv, { keyPrefix: "myapp:" });
 *
 * await using s = scope({ persistence });
 *
 * // Acquire a lock with 30 second TTL
 * const lock = await s.acquireLock("resource:123", 30000);
 * if (!lock) {
 *   throw new Error("Could not acquire lock");
 * }
 *
 * // Lock automatically expires after TTL via KV atomic operations
 * // Optional: release early with await lock.release()
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
 * Deno KV key type
 */
type DenoKVKey = [string, ...Array<string | number>];

/**
 * Deno KV persistence adapter
 */
export class DenoKVAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CacheProvider,
		PersistenceAdapter
{
	private readonly kv: Deno.Kv;
	private readonly keyPrefix: string;
	private readonly inMemoryLocks = new Map<
		string,
		{ owner: string; expiry: number }
	>();

	constructor(kv: Deno.Kv, options: PersistenceAdapterOptions = {}) {
		this.kv = kv;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private toDenoKey(key: string): DenoKVKey {
		// Key is already prefixed by the caller, just wrap in array
		return [key];
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// Deno KV is already connected when passed to constructor
		// No additional setup needed
	}

	async disconnect(): Promise<void> {
		// Close the KV connection
		this.kv.close();
	}

	isConnected(): boolean {
		// Deno KV doesn't expose a connection state, assume connected
		// until explicitly closed
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
		const now = Date.now();
		const expiry = now + ttl;

		// Try to acquire lock using atomic operation
		const atomic = this.kv.atomic();
		const existing = await this.kv.get<{ owner: string; expiry: number }>(
			this.toDenoKey(fullKey),
		);

		// If lock exists and hasn't expired, check owner
		if (existing.value && existing.value.expiry > now) {
			if (existing.value.owner === lockOwner) {
				// Same owner, extend the lock
				await this.kv.set(this.toDenoKey(fullKey), {
					owner: lockOwner,
					expiry,
				});
				return this.createLockHandle(key, lockOwner);
			}
			// Different owner, lock is held
			return null;
		}

		// Try to set the lock atomically
		const result = await atomic
			.check({ key: this.toDenoKey(fullKey), versionstamp: existing.versionstamp })
			.set(this.toDenoKey(fullKey), { owner: lockOwner, expiry })
			.commit();

		if (!result.ok) {
			// Someone else acquired the lock in the meantime
			return null;
		}

		// Also store in memory for quick access
		this.inMemoryLocks.set(fullKey, { owner: lockOwner, expiry });

		return this.createLockHandle(key, lockOwner);
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const now = Date.now();
		const newExpiry = now + ttl;

		const existing = await this.kv.get<{ owner: string; expiry: number }>(
			this.toDenoKey(fullKey),
		);

		if (!existing.value) {
			return false;
		}

		if (existing.value.owner !== owner) {
			return false;
		}

		// Extend using atomic operation
		const result = await this.kv
			.atomic()
			.check({ key: this.toDenoKey(fullKey), versionstamp: existing.versionstamp })
			.set(this.toDenoKey(fullKey), { owner, expiry: newExpiry })
			.commit();

		if (result.ok) {
			// Update in-memory cache
			this.inMemoryLocks.set(fullKey, { owner, expiry: newExpiry });
		}

		return result.ok;
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.kv.delete(this.toDenoKey(fullKey));
		this.inMemoryLocks.delete(fullKey);
	}

	private createLockHandle(key: string, owner: string): LockHandle {
		const self = this;

		return {
			async release() {
				const fullKey = self.prefix(`lock:${key}`);
				const existing = await self.kv.get<{ owner: string }>(
					self.toDenoKey(fullKey),
				);
				if (existing.value?.owner === owner) {
					await self.kv.delete(self.toDenoKey(fullKey));
					self.inMemoryLocks.delete(fullKey);
				}
			},

			async extend(ttl: number) {
				return self.extend(key, ttl, owner);
			},

			async isValid() {
				const fullKey = self.prefix(`lock:${key}`);
				const existing = await self.kv.get<{ owner: string; expiry: number }>(
					self.toDenoKey(fullKey),
				);
				return existing.value?.owner === owner && existing.value.expiry > Date.now();
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
		const result = await this.kv.get<CircuitBreakerPersistedState>(
			this.toDenoKey(fullKey),
		);
		return result.value;
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`cb:${key}`);
		await this.kv.set(this.toDenoKey(fullKey), state);
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		const fullKey = this.prefix(`cb:${key}`);
		const now = Date.now();

		// Use atomic operation to increment failure count
		while (true) {
			const existing = await this.kv.get<CircuitBreakerPersistedState>(
				this.toDenoKey(fullKey),
			);

			const currentState = existing.value ?? {
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

			const result = await this.kv
				.atomic()
				.check({ key: this.toDenoKey(fullKey), versionstamp: existing.versionstamp })
				.set(this.toDenoKey(fullKey), newState)
				.commit();

			if (result.ok) {
				return newState.failureCount;
			}

			// Retry on conflict
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	async recordSuccess(key: string): Promise<void> {
		const fullKey = this.prefix(`cb:${key}`);
		const now = Date.now();

		// Use atomic operation to reset failure count
		while (true) {
			const existing = await this.kv.get<CircuitBreakerPersistedState>(
				this.toDenoKey(fullKey),
			);

			if (!existing.value) {
				// No state to update
				return;
			}

			const newState: CircuitBreakerPersistedState = {
				...existing.value,
				state: "closed",
				failureCount: 0,
				lastSuccessTime: now,
			};

			const result = await this.kv
				.atomic()
				.check({ key: this.toDenoKey(fullKey), versionstamp: existing.versionstamp })
				.set(this.toDenoKey(fullKey), newState)
				.commit();

			if (result.ok) {
				return;
			}

			// Retry on conflict
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);
		const result = await this.kv.get<{ value: T; expiresAt?: number }>(
			this.toDenoKey(fullKey),
		);

		if (!result.value) {
			return null;
		}

		// Check expiration
		if (result.value.expiresAt && result.value.expiresAt < Date.now()) {
			await this.kv.delete(this.toDenoKey(fullKey));
			return null;
		}

		return result.value.value;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const expiresAt = ttl ? Date.now() + ttl : undefined;
		await this.kv.set(this.toDenoKey(fullKey), { value, expiresAt });
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		await this.kv.delete(this.toDenoKey(fullKey));
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(`cache:${key}`);
		const result = await this.kv.get<{ expiresAt?: number }>(
			this.toDenoKey(fullKey),
		);

		if (!result.value) {
			return false;
		}

		// Check expiration
		if (result.value.expiresAt && result.value.expiresAt < Date.now()) {
			await this.kv.delete(this.toDenoKey(fullKey));
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		// List all keys and filter by prefix
		const cachePrefix = this.prefix("cache:");
		const entries = this.kv.list({ prefix: [] });
		const keysToDelete: DenoKVKey[] = [];

		for await (const entry of entries) {
			const key = (entry.key as string[])[0];
			if (key.startsWith(cachePrefix)) {
				keysToDelete.push(entry.key as DenoKVKey);
			}
		}

		// Delete in batches
		for (const key of keysToDelete) {
			await this.kv.delete(key);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		// List all keys and filter by prefix
		const cachePrefix = this.prefix("cache:");
		const entries = this.kv.list({ prefix: [] });
		const keys: string[] = [];

		for await (const entry of entries) {
			// Extract key from the KV key array
			const kvKey = (entry.key as string[])[0];

			// Check if it starts with our cache prefix
			if (!kvKey.startsWith(cachePrefix)) {
				continue;
			}

			const key = kvKey.slice(cachePrefix.length);

			// Check expiration
			const value = entry.value as { expiresAt?: number } | undefined;
			if (value?.expiresAt && value.expiresAt < Date.now()) {
				await this.kv.delete(entry.key as DenoKVKey);
				continue;
			}

			if (!pattern || key.includes(pattern)) {
				keys.push(key);
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
