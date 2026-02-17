/**
 * Redis persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * using Redis as the backend.
 *
 * @example
 * ```typescript
 * import { Redis } from 'ioredis'
 * import { RedisAdapter } from 'go-go-scope/persistence/redis'
 *
 * const redis = new Redis(process.env.REDIS_URL)
 * const persistence = new RedisAdapter(redis, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 *
 * // Acquire a lock with 30 second TTL
 * const lock = await s.acquireLock('resource:123', 30000)
 * if (!lock) {
 *   throw new Error('Could not acquire lock')
 * }
 *
 * // Lock automatically expires after TTL via Redis native expiry
 * // Optional: release early with await lock.release()
 * ```
 */

import type { Redis } from "ioredis";
import type {
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "./types.js";

/**
 * Redis persistence adapter
 */
export class RedisAdapter
	implements LockProvider, CircuitBreakerStateProvider, PersistenceAdapter
{
	private readonly redis: Redis;
	private readonly keyPrefix: string;

	constructor(redis: Redis, options: PersistenceAdapterOptions = {}) {
		this.redis = redis;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
		const acquired = await this.redis.set(fullKey, lockOwner, "PX", ttl, "NX");

		if (!acquired) {
			return null;
		}

		const handle: LockHandle = {
			release: async () => {
				// Only delete if we still own the lock
				const current = await this.redis.get(fullKey);
				if (current === lockOwner) {
					await this.redis.del(fullKey);
				}
			},
			extend: async (newTtl: number) => {
				return this.extend(key, newTtl, lockOwner);
			},
			isValid: async () => {
				const current = await this.redis.get(fullKey);
				return current === lockOwner;
			},
		};

		return handle;
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const current = await this.redis.get(fullKey);

		if (current !== owner) {
			return false;
		}

		await this.redis.pexpire(fullKey, ttl);
		return true;
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.redis.del(fullKey);
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);
		const data = await this.redis.get(fullKey);

		if (!data) {
			return null;
		}

		try {
			return JSON.parse(data) as CircuitBreakerPersistedState;
		} catch {
			return null;
		}
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`circuit:${key}`);
		await this.redis.setex(fullKey, 3600, JSON.stringify(state)); // 1 hour TTL
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		// Get current state
		const state = await this.getState(key);

		const newState: CircuitBreakerPersistedState = {
			state: state?.state ?? "closed",
			failureCount: (state?.failureCount ?? 0) + 1,
			lastFailureTime: Date.now(),
		};

		// Open circuit if max failures reached
		if (newState.failureCount >= maxFailures) {
			newState.state = "open";
		}

		await this.setState(key, newState);
		return newState.failureCount;
	}

	async recordSuccess(key: string): Promise<void> {
		// Reset to closed on success
		const newState: CircuitBreakerPersistedState = {
			state: "closed",
			failureCount: 0,
			lastSuccessTime: Date.now(),
		};

		await this.setState(key, newState);
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		if (this.redis.status === "wait") {
			await this.redis.connect();
		}
	}

	async disconnect(): Promise<void> {
		await this.redis.quit();
	}

	isConnected(): boolean {
		return this.redis.status === "ready";
	}
}
