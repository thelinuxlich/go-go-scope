/**
 * Redis cache adapter for go-go-scope
 */

import type { CacheProvider, CacheStats } from "go-go-scope";
import type { Redis } from "ioredis";

export interface RedisCacheAdapterOptions {
	/** Key prefix for all cache entries */
	keyPrefix?: string;
}

/**
 * Redis cache adapter implementing CacheProvider
 */
export class RedisCacheAdapter implements CacheProvider {
	private readonly redis: Redis;
	private readonly keyPrefix: string;

	constructor(redis: Redis, options: RedisCacheAdapterOptions = {}) {
		this.redis = redis;
		this.keyPrefix = options.keyPrefix ?? "cache:";
	}

	private prefix(key: string): string {
		return `${this.keyPrefix}${key}`;
	}

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(key);
		const data = await this.redis.get(fullKey);

		if (!data) {
			return null;
		}

		try {
			return JSON.parse(data) as T;
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

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(key);
		const exists = await this.redis.exists(fullKey);
		return exists === 1;
	}

	async clear(): Promise<void> {
		const pattern = `${this.keyPrefix}*`;
		const keys = await this.redis.keys(pattern);
		if (keys.length > 0) {
			await this.redis.del(...keys);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		const fullPattern = pattern
			? `${this.keyPrefix}${pattern}`
			: `${this.keyPrefix}*`;
		const keys = await this.redis.keys(fullPattern);
		// Remove prefix from returned keys
		return keys.map((k) => k.slice(this.keyPrefix.length));
	}

	/**
	 * Get cache statistics (requires Redis INFO command)
	 */
	async stats(): Promise<CacheStats> {
		const pattern = `${this.keyPrefix}*`;
		const keys = await this.redis.keys(pattern);
		return {
			hits: 0, // Not tracked by default
			misses: 0,
			size: keys.length,
			hitRatio: 0,
		};
	}
}
