/**
 * Redis persistence adapter for go-go-scope
 *
 * Provides distributed locks, rate limiting, and circuit breaker state
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
 * using lock = await s.acquireLock('resource:123')
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
	RateLimitConfig,
	RateLimitProvider,
	RateLimitResult,
} from "./types.js";

/**
 * Redis persistence adapter
 */
export class RedisAdapter
	implements
		LockProvider,
		RateLimitProvider,
		CircuitBreakerStateProvider,
		PersistenceAdapter
{
	private readonly redis: Redis;
	private readonly keyPrefix: string;
	private readonly defaultLockTTL: number;

	constructor(redis: Redis, options: PersistenceAdapterOptions = {}) {
		this.redis = redis;
		this.keyPrefix = options.keyPrefix ?? "";
		this.defaultLockTTL = options.defaultLockTTL ?? 30000;
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
	// Rate Limit Provider
	// ============================================================================

	async checkAndIncrement(
		key: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const now = Date.now();
		const windowStart = now - config.windowMs;

		// Use Redis sorted set for sliding window
		const multi = this.redis.multi();

		// Remove old entries outside the window
		multi.zremrangebyscore(fullKey, 0, windowStart);

		// Count current entries in window
		multi.zcard(fullKey);

		// Add current request
		multi.zadd(fullKey, now, `${now}-${Math.random()}`);

		// Set expiry on the key
		multi.pexpire(fullKey, config.windowMs);

		const results = await multi.exec();
		if (!results) {
			throw new Error("Redis transaction failed");
		}

		const currentCount = results[1][1] as number;
		const allowed = currentCount < config.max;
		const remaining = Math.max(0, config.max - currentCount - 1);

		// Calculate reset time (oldest entry in window + window size)
		const oldestEntry = await this.redis.zrange(fullKey, 0, 0, "WITHSCORES");
		const resetTimeMs =
			oldestEntry.length > 0
				? Number(oldestEntry[1]) + config.windowMs - now
				: config.windowMs;

		return {
			allowed,
			remaining,
			limit: config.max,
			resetTimeMs: Math.max(0, resetTimeMs),
		};
	}

	async reset(key: string): Promise<void> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		await this.redis.del(fullKey);
	}

	async getCount(key: string, windowMs: number): Promise<number> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const windowStart = Date.now() - windowMs;
		await this.redis.zremrangebyscore(fullKey, 0, windowStart);
		return await this.redis.zcard(fullKey);
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
		const fullKey = this.prefix(`circuit:${key}`);

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
		const fullKey = this.prefix(`circuit:${key}`);

		// Get current state
		const state = await this.getState(key);

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
