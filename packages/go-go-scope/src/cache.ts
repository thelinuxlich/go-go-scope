/**
 * Cache implementation for go-go-scope
 *
 * Provides in-memory caching with TTL support and LRU eviction.
 */

import type { CacheProvider, CacheStats } from "./persistence/types.js";

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
	value: T;
	expiresAt: number | null;
	lastAccessed: number;
}

/**
 * In-memory cache provider with TTL and LRU support
 */
export class InMemoryCache implements CacheProvider {
	private readonly cache = new Map<string, CacheEntry<unknown>>();
	private readonly maxSize: number;
	private hits = 0;
	private misses = 0;

	constructor(options: { maxSize?: number } = {}) {
		this.maxSize = options.maxSize ?? 1000;
	}

	async get<T>(key: string): Promise<T | null> {
		const entry = this.cache.get(key);

		if (!entry) {
			this.misses++;
			return null;
		}

		// Check expiration
		if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			this.misses++;
			return null;
		}

		// Update last accessed for LRU
		entry.lastAccessed = Date.now();
		this.hits++;
		return entry.value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		// Evict if at capacity and key doesn't exist
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.evictLRU();
		}

		const entry: CacheEntry<T> = {
			value,
			expiresAt: ttl ? Date.now() + ttl : null,
			lastAccessed: Date.now(),
		};

		this.cache.set(key, entry);
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	async has(key: string): Promise<boolean> {
		const entry = this.cache.get(key);

		if (!entry) {
			return false;
		}

		// Check expiration
		if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	async keys(pattern?: string): Promise<string[]> {
		const keys = Array.from(this.cache.keys());

		if (!pattern) {
			return keys;
		}

		// Simple pattern matching (supports * wildcard)
		const regex = new RegExp(pattern.replace(/\*/g, ".*"));
		return keys.filter((k) => regex.test(k));
	}

	/**
	 * Get cache statistics
	 */
	stats(): CacheStats {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			size: this.cache.size,
			hitRatio: total > 0 ? this.hits / total : 0,
		};
	}

	/**
	 * Clear expired entries
	 */
	prune(): number {
		const now = Date.now();
		let count = 0;

		for (const [key, entry] of this.cache) {
			if (entry.expiresAt !== null && now > entry.expiresAt) {
				this.cache.delete(key);
				count++;
			}
		}

		return count;
	}

	/**
	 * Evict least recently used entry
	 */
	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache) {
			if (entry.lastAccessed < oldestTime) {
				oldestTime = entry.lastAccessed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
		}
	}

	/**
	 * Get the number of entries in the cache
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Dispose the cache and clear all entries
	 */
	[Symbol.dispose](): void {
		this.cache.clear();
	}
}

/**
 * Create an in-memory cache provider
 */
export function createCache(options?: { maxSize?: number }): InMemoryCache {
	return new InMemoryCache(options);
}
