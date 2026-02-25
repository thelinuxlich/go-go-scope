/**
 * Redis idempotency adapter for go-go-scope
 */

import type { IdempotencyProvider } from "go-go-scope";
import type { Redis } from "ioredis";

export interface RedisIdempotencyAdapterOptions {
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * Redis idempotency adapter implementing IdempotencyProvider
 */
export class RedisIdempotencyAdapter implements IdempotencyProvider {
	private readonly redis: Redis;
	private readonly keyPrefix: string;

	constructor(redis: Redis, options: RedisIdempotencyAdapterOptions = {}) {
		this.redis = redis;
		this.keyPrefix = options.keyPrefix ?? "idempotency:";
	}

	private prefix(key: string): string {
		return `${this.keyPrefix}${key}`;
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);
		const data = await this.redis.get(fullKey);

		if (!data) {
			return null;
		}

		// Get remaining TTL in milliseconds
		const pttl = await this.redis.pttl(fullKey);
		const expiresAt = pttl > 0 ? Date.now() + pttl : undefined;

		try {
			return { value: JSON.parse(data) as T, expiresAt };
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const serialized = JSON.stringify(value);

		if (ttl) {
			await this.redis.setex(fullKey, Math.ceil(ttl / 1000), serialized);
		} else {
			await this.redis.set(fullKey, serialized);
		}
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.redis.del(fullKey);
	}
}
