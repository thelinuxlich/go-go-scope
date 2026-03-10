/**
 * Cache implementation for go-go-scope
 *
 * Provides in-memory caching with TTL support and LRU eviction.
 * For distributed caching across multiple processes, use a persistence provider
 * like Redis, PostgreSQL, or other adapters from @go-go-scope/persistence-*.
 *
 * @module cache
 *
 * @example
 * ```typescript
 * import { scope, createCache } from "go-go-scope";
 *
 * // Create a cache with max 1000 entries
 * const cache = createCache({ maxSize: 1000 });
 *
 * // Use within a scope
 * await using s = scope();
 *
 * // Store values with optional TTL
 * await cache.set("user:123", { name: "John" }, 60000); // 60 second TTL
 *
 * // Retrieve values
 * const user = await cache.get("user:123");
 * if (user) {
 *   console.log(user.name); // "John"
 * }
 *
 * // Check if key exists (respects TTL)
 * const exists = await cache.has("user:123");
 *
 * // Get cache statistics
 * const stats = cache.stats();
 * console.log(`Hit ratio: ${stats.hitRatio}`);
 *
 * // Clean up expired entries
 * const removed = cache.prune();
 *
 * // Clear all entries
 * await cache.clear();
 * ```
 */

import type { CacheProvider, CacheStats } from "./persistence/types.js";

/**
 * Internal cache entry with metadata for TTL and LRU tracking.
 * @internal
 */
interface CacheEntry<T> {
	/** The cached value */
	value: T;
	/** Expiration timestamp (null if no TTL) */
	expiresAt: number | null;
	/** Last access timestamp for LRU eviction */
	lastAccessed: number;
}

/**
 * In-memory cache provider with TTL and LRU (Least Recently Used) support.
 *
 * This cache automatically evicts entries when:
 * - The maximum size is reached (LRU eviction)
 * - An entry's TTL expires
 *
 * For distributed caching across multiple processes, configure a persistence provider
 * in your scope options instead.
 *
 * @implements {CacheProvider}
 *
 * @example
 * ```typescript
 * import { InMemoryCache } from "go-go-scope";
 *
 * // Create cache with default size (1000)
 * const cache = new InMemoryCache();
 *
 * // Create cache with custom size
 * const cache = new InMemoryCache({ maxSize: 500 });
 *
 * // Basic operations
 * await cache.set("key", "value", 60000); // 60 second TTL
 * const value = await cache.get("key");
 * const exists = await cache.has("key");
 * await cache.delete("key");
 *
 * // Pattern matching for keys
 * await cache.set("user:1", { name: "Alice" });
 * await cache.set("user:2", { name: "Bob" });
 * const userKeys = await cache.keys("user:*"); // ["user:1", "user:2"]
 *
 * // Statistics
 * const stats = cache.stats();
 * console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
 *
 * // Clean up (disposes resources)
 * cache[Symbol.dispose]();
 * ```
 */
export class InMemoryCache implements CacheProvider {
	private readonly cache = new Map<string, CacheEntry<unknown>>();
	private readonly maxSize: number;
	private hits = 0;
	private misses = 0;

	/**
	 * Creates a new InMemoryCache instance.
	 *
	 * @param options - Cache configuration options
	 * @param options.maxSize - Maximum number of entries (default: 1000)
	 *
	 * @example
	 * ```typescript
	 * const cache = new InMemoryCache({ maxSize: 500 });
	 * ```
	 */
	constructor(options: { maxSize?: number } = {}) {
		this.maxSize = options.maxSize ?? 1000;
	}

	/**
	 * Retrieves a value from the cache.
	 *
	 * Returns `null` if:
	 * - The key doesn't exist
	 * - The entry has expired (entry is also deleted)
	 *
	 * Updates the last accessed time for LRU tracking on successful retrieval.
	 *
	 * @typeParam T - The expected type of the cached value
	 * @param key - The cache key
	 * @returns The cached value or `null` if not found/expired
	 *
	 * @example
	 * ```typescript
	 * const user = await cache.get<User>("user:123");
	 * if (user) {
	 *   console.log(user.name);
	 * }
	 * ```
	 */
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

	/**
	 * Stores a value in the cache with optional TTL.
	 *
	 * If the cache is at capacity and the key doesn't exist,
	 * the least recently used entry is evicted before insertion.
	 *
	 * @typeParam T - The type of the value to cache
	 * @param key - The cache key
	 * @param value - The value to store
	 * @param ttl - Time-to-live in milliseconds (optional, no expiration if omitted)
	 * @returns Promise that resolves when the value is stored
	 *
	 * @example
	 * ```typescript
	 * // Store without expiration
	 * await cache.set("config", { theme: "dark" });
	 *
	 * // Store with 5 minute TTL
	 * await cache.set("session", sessionData, 5 * 60 * 1000);
	 * ```
	 */
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

	/**
	 * Deletes a key from the cache.
	 *
	 * @param key - The cache key to delete
	 * @returns Promise that resolves when the key is deleted
	 *
	 * @example
	 * ```typescript
	 * await cache.delete("user:123");
	 * ```
	 */
	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	/**
	 * Checks if a key exists in the cache and has not expired.
	 *
	 * Expired entries are automatically removed and return `false`.
	 *
	 * @param key - The cache key to check
	 * @returns `true` if the key exists and is not expired, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * if (await cache.has("session:abc")) {
	 *   // Session is valid
	 * }
	 * ```
	 */
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

	/**
	 * Clears all entries from the cache and resets statistics.
	 *
	 * @returns Promise that resolves when the cache is cleared
	 *
	 * @example
	 * ```typescript
	 * await cache.clear();
	 * console.log(cache.size); // 0
	 * ```
	 */
	async clear(): Promise<void> {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	/**
	 * Returns all keys matching an optional pattern.
	 *
	 * Pattern matching supports `*` as a wildcard that matches any characters.
	 * If no pattern is provided, all keys are returned.
	 *
	 * @param pattern - Optional glob pattern (supports `*` wildcard)
	 * @returns Array of matching keys
	 *
	 * @example
	 * ```typescript
	 * await cache.set("user:1", data);
	 * await cache.set("user:2", data);
	 * await cache.set("product:1", data);
	 *
	 * const userKeys = await cache.keys("user:*"); // ["user:1", "user:2"]
	 * const allKeys = await cache.keys(); // ["user:1", "user:2", "product:1"]
	 * ```
	 */
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
	 * Gets cache statistics including hits, misses, size, and hit ratio.
	 *
	 * @returns Cache statistics object
	 * @returns CacheStats.hits - Number of successful cache lookups
	 * @returns CacheStats.misses - Number of failed cache lookups
	 * @returns CacheStats.size - Current number of entries
	 * @returns CacheStats.hitRatio - Ratio of hits to total lookups (0-1)
	 *
	 * @example
	 * ```typescript
	 * const stats = cache.stats();
	 * console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
	 * console.log(`Entries: ${stats.size}`);
	 * ```
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
	 * Removes all expired entries from the cache.
	 *
	 * This can be called periodically to free up memory from expired entries
	 * that haven't been accessed yet.
	 *
	 * @returns The number of entries removed
	 *
	 * @example
	 * ```typescript
	 * // Clean up expired entries
	 * const removed = cache.prune();
	 * console.log(`Pruned ${removed} expired entries`);
	 * ```
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
	 * Evicts the least recently used entry when the cache is at capacity.
	 * @internal
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
	 * Gets the current number of entries in the cache.
	 *
	 * Note: This includes entries that may have expired but haven't been
	 * accessed or pruned yet.
	 *
	 * @returns The number of entries in the cache
	 *
	 * @example
	 * ```typescript
	 * console.log(`Cache has ${cache.size} entries`);
	 * ```
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Disposes the cache and clears all entries.
	 *
	 * This is called automatically when using the `using` statement.
	 *
	 * @example
	 * ```typescript
	 * using cache = new InMemoryCache();
	 * // ... use cache
	 * // automatically cleared on scope exit
	 * ```
	 */
	[Symbol.dispose](): void {
		this.cache.clear();
	}
}

/**
 * Creates an in-memory cache provider with the specified options.
 *
 * This is a convenience factory function that creates an {@link InMemoryCache} instance.
 * For distributed caching across multiple processes, use a persistence provider
 * from @go-go-scope/persistence-* packages.
 *
 * @param options - Cache configuration options
 * @param options.maxSize - Maximum number of entries (default: 1000)
 * @returns A new InMemoryCache instance
 *
 * @example
 * ```typescript
 * import { scope, createCache } from "go-go-scope";
 *
 * // Create cache
 * const cache = createCache({ maxSize: 500 });
 *
 * // Use with explicit resource management
 * using c = createCache();
 *
 * await c.set("key", "value", 60000);
 * const value = await c.get("key");
 * ```
 */
export function createCache(options?: { maxSize?: number }): InMemoryCache {
	return new InMemoryCache(options);
}
