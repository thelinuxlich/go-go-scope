/**
 * Idempotency provider implementations for go-go-scope
 *
 * Provides in-memory and distributed idempotency support for task results.
 *
 * Idempotency ensures that operations are executed only once, even if called
 * multiple times with the same key. This is critical for:
 *
 * - Payment processing (prevent double charges)
 * - Webhook handlers (prevent duplicate processing)
 * - API retries (safe to retry without side effects)
 * - Message queue consumers (handle duplicate messages)
 *
 * ## How Idempotency Works
 *
 * When an idempotency key is specified in task options:
 * 1. First execution runs normally and caches the result
 * 2. Subsequent executions with the same key return the cached result
 * 3. Cached results expire based on the specified TTL
 *
 * ## Persistence Integration
 *
 * For production use across multiple processes/servers, use a distributed
 * idempotency provider from @go-go-scope/persistence-* packages.
 *
 * @module idempotency
 *
 * @example
 * ```typescript
 * import { scope, InMemoryIdempotencyProvider } from "go-go-scope";
 *
 * await using s = scope({
 *   persistence: {
 *     idempotency: new InMemoryIdempotencyProvider({ maxSize: 1000 })
 *   }
 * });
 *
 * const orderId = "order-123";
 *
 * // First call executes and caches the result
 * const [err1, result1] = await s.task(
 *   async () => {
 *     console.log("Processing payment...");
 *     return await processPayment(orderId);
 *   },
 *   {
 *     idempotency: { key: `payment:${orderId}`, ttl: 60000 } // 60 second window
 *   }
 * );
 * // Output: "Processing payment..."
 *
 * // Second call with same key returns cached result (no re-execution)
 * const [err2, result2] = await s.task(
 *   async () => {
 *     console.log("Processing payment...");
 *     return await processPayment(orderId);
 *   },
 *   {
 *     idempotency: { key: `payment:${orderId}`, ttl: 60000 }
 *   }
 * );
 * // No output - cached result returned immediately
 *
 * // result1 === result2 (identical)
 * ```
 */

import { InMemoryCache } from "./cache.js";
import type { IdempotencyProvider } from "./persistence/types.js";

/**
 * Configuration options for {@link InMemoryIdempotencyProvider}.
 */
export interface InMemoryIdempotencyProviderOptions {
	/**
	 * Maximum number of entries to store in memory.
	 *
	 * When the limit is reached, oldest entries are evicted using LRU.
	 * Set to `undefined` for unlimited (not recommended for long-running processes).
	 *
	 * @default undefined (unlimited)
	 */
	maxSize?: number;
}

/**
 * Internal idempotency entry with metadata.
 * @internal
 */
interface IdempotencyEntry<T> {
	/** The cached result value */
	value: T;
	/** Expiration timestamp (undefined if no TTL) */
	expiresAt: number | undefined;
}

/**
 * In-memory idempotency provider for testing and development.
 *
 * Stores idempotency results in memory. All data is lost when the process exits.
 * Uses {@link InMemoryCache} internally for consistent caching behavior with
 * LRU eviction and TTL support.
 *
 * **Note:** This provider does not persist across process restarts.
 * For production use, use a distributed provider like Redis from
 * @go-go-scope/persistence-redis.
 *
 * @implements {IdempotencyProvider}
 * @implements {Disposable}
 *
 * @example
 * ```typescript
 * import { scope, InMemoryIdempotencyProvider } from "go-go-scope";
 *
 * // Create provider with max 1000 entries
 * const provider = new InMemoryIdempotencyProvider({ maxSize: 1000 });
 *
 * await using s = scope({
 *   persistence: { idempotency: provider }
 * });
 *
 * // Use in tasks - first execution is cached
 * const [r1] = await s.task(() => computeExpensiveResult(), {
 *   idempotency: { key: "computation:123", ttl: 60000 }
 * });
 *
 * // Second execution returns cached result
 * const [r2] = await s.task(() => computeExpensiveResult(), {
 *   idempotency: { key: "computation:123", ttl: 60000 }
 * });
 * // r1 === r2
 *
 * // Check provider stats
 * console.log(`Cached entries: ${provider.size}`);
 *
 * // Clean up expired entries
 * const cleaned = provider.cleanup();
 * console.log(`Removed ${cleaned} expired entries`);
 *
 * // Clear all entries
 * await provider.clear();
 * ```
 */
export class InMemoryIdempotencyProvider
	implements IdempotencyProvider, Disposable
{
	private readonly cache: InMemoryCache;

	/**
	 * Creates a new InMemoryIdempotencyProvider instance.
	 *
	 * @param options - Provider configuration options
	 * @param options.maxSize - Maximum number of entries to store
	 *
	 * @example
	 * ```typescript
	 * // Unlimited size (use with caution)
	 * const provider = new InMemoryIdempotencyProvider();
	 *
	 * // Limited to 1000 entries
	 * const provider = new InMemoryIdempotencyProvider({ maxSize: 1000 });
	 * ```
	 */
	constructor(options: InMemoryIdempotencyProviderOptions = {}) {
		this.cache = new InMemoryCache({ maxSize: options.maxSize });
	}

	/**
	 * Gets a cached value by key if it exists and hasn't expired.
	 *
	 * @typeParam T - The expected type of the cached value
	 * @param key - The idempotency key
	 * @returns Object with value and optional expiry timestamp, or `null` if not found/expired
	 *
	 * @example
	 * ```typescript
	 * const cached = await provider.get<PaymentResult>("payment:order-123");
	 * if (cached) {
	 *   console.log(`Cached result expires at: ${cached.expiresAt}`);
	 *   return cached.value;
	 * }
	 * ```
	 */
	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const entry = await this.cache.get<IdempotencyEntry<T>>(key);

		if (!entry) {
			return null;
		}

		return {
			value: entry.value,
			expiresAt: entry.expiresAt,
		};
	}

	/**
	 * Stores a value with an optional TTL.
	 *
	 * @typeParam T - The type of the value to cache
	 * @param key - The idempotency key
	 * @param value - The result value to cache
	 * @param ttl - Time-to-live in milliseconds (optional, no expiration if omitted)
	 * @returns Promise that resolves when the value is stored
	 *
	 * @example
	 * ```typescript
	 * // Cache with 5 minute TTL
	 * await provider.set("payment:order-123", result, 5 * 60 * 1000);
	 *
	 * // Cache without expiration
	 * await provider.set("config:default", config);
	 * ```
	 */
	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const entry: IdempotencyEntry<T> = {
			value,
			expiresAt: ttl !== undefined ? Date.now() + ttl : undefined,
		};

		await this.cache.set(key, entry, ttl);
	}

	/**
	 * Deletes a cached value by key.
	 *
	 * @param key - The idempotency key to delete
	 * @returns Promise that resolves when the key is deleted
	 *
	 * @example
	 * ```typescript
	 * // Manually invalidate a cached result
	 * await provider.delete("payment:order-123");
	 * ```
	 */
	async delete(key: string): Promise<void> {
		await this.cache.delete(key);
	}

	/**
	 * Clears all cached idempotency entries.
	 *
	 * @returns Promise that resolves when all entries are cleared
	 *
	 * @example
	 * ```typescript
	 * // Clear all cached results
	 * await provider.clear();
	 * console.log(provider.size); // 0
	 * ```
	 */
	async clear(): Promise<void> {
		await this.cache.clear();
	}

	/**
	 * Gets the number of cached idempotency entries.
	 *
	 * Note: This includes entries that may have expired but haven't been
	 * cleaned up yet.
	 *
	 * @returns The number of entries in the cache
	 *
	 * @example
	 * ```typescript
	 * console.log(`Tracking ${provider.size} idempotent operations`);
	 * ```
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Removes expired entries from the cache.
	 *
	 * This can be called periodically to free up memory. Expired entries
	 * are also removed automatically on access.
	 *
	 * @returns Number of expired entries removed
	 *
	 * @example
	 * ```typescript
	 * // Run periodic cleanup
	 * setInterval(() => {
	 *   const removed = provider.cleanup();
	 *   console.log(`Cleaned up ${removed} expired entries`);
	 * }, 60000);
	 * ```
	 */
	cleanup(): number {
		return this.cache.prune();
	}

	/**
	 * Disposes the provider and releases all resources.
	 *
	 * Clears all cached entries. Called automatically when using the `using` statement.
	 *
	 * @example
	 * ```typescript
	 * using provider = new InMemoryIdempotencyProvider({ maxSize: 1000 });
	 * // ... use provider
	 * // Automatically cleared on scope exit
	 * ```
	 */
	[Symbol.dispose](): void {
		this.cache[Symbol.dispose]();
	}
}

/**
 * Creates an in-memory idempotency provider.
 *
 * This is a convenience factory function that creates an
 * {@link InMemoryIdempotencyProvider} instance.
 *
 * For production use with persistence across restarts, use a distributed
 * provider from @go-go-scope/persistence-* packages.
 *
 * @param options - Provider configuration options
 * @param options.maxSize - Maximum number of entries to store
 * @returns A new InMemoryIdempotencyProvider instance
 *
 * @example
 * ```typescript
 * import { scope, createIdempotencyProvider } from "go-go-scope";
 *
 * // Create provider
 * const provider = createIdempotencyProvider({ maxSize: 1000 });
 *
 * // Use with scope
 * await using s = scope({
 *   persistence: { idempotency: provider }
 * });
 *
 * // Idempotent task execution
 * const [err, result] = await s.task(
 *   async () => await processPayment(orderId),
 *   {
 *     idempotency: {
 *       key: `payment:${orderId}`,
 *       ttl: 86400000 // 24 hours
 *     }
 *   }
 * );
 *
 * // Safe to retry - returns cached result on subsequent calls
 * const [err2, result2] = await s.task(
 *   async () => await processPayment(orderId),
 *   {
 *     idempotency: {
 *       key: `payment:${orderId}`,
 *       ttl: 86400000
 *     }
 *   }
 * );
 * // result === result2, processPayment only executed once
 * ```
 */
export function createIdempotencyProvider(
	options?: InMemoryIdempotencyProviderOptions,
): InMemoryIdempotencyProvider {
	return new InMemoryIdempotencyProvider(options);
}
