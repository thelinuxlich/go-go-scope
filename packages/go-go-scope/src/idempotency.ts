/**
 * Idempotency provider implementations for go-go-scope
 *
 * Provides in-memory and distributed idempotency support for task results.
 */

import { InMemoryCache } from "./cache.js";
import type { IdempotencyProvider } from "./persistence/types.js";

/**
 * Options for InMemoryIdempotencyProvider
 */
export interface InMemoryIdempotencyProviderOptions {
	/** Maximum number of entries to store (default: unlimited) */
	maxSize?: number;
}

/**
 * Idempotency entry with metadata
 */
interface IdempotencyEntry<T> {
	value: T;
	expiresAt: number | undefined;
}

/**
 * In-memory idempotency provider for testing and development.
 * Uses InMemoryCache internally for consistent caching behavior.
 *
 * Note: This provider does not persist across process restarts.
 * For production use, use a distributed provider like Redis.
 *
 * @example
 * ```typescript
 * await using s = scope({
 *   persistence: {
 *     idempotency: new InMemoryIdempotencyProvider({ maxSize: 1000 })
 *   }
 * })
 *
 * // First call executes and caches
 * const r1 = await s.task(() => processPayment(orderId), {
 *   idempotency: { key: `payment:${orderId}`, ttl: 60000 }
 * })
 *
 * // Second call returns cached result
 * const r2 = await s.task(() => processPayment(orderId), {
 *   idempotency: { key: `payment:${orderId}`, ttl: 60000 }
 * })
 * // r2 === r1 (same result, no re-execution)
 * ```
 */
export class InMemoryIdempotencyProvider
	implements IdempotencyProvider, Disposable
{
	private readonly cache: InMemoryCache;

	constructor(options: InMemoryIdempotencyProviderOptions = {}) {
		this.cache = new InMemoryCache({ maxSize: options.maxSize });
	}

	/**
	 * Get a cached value by key
	 * @param key - Cache key
	 * @returns Object with value and optional expiry timestamp, or null if not found/expired
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
	 * Store a value with optional TTL
	 * @param key - Cache key
	 * @param value - Value to cache
	 * @param ttl - Time-to-live in milliseconds (optional)
	 */
	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const entry: IdempotencyEntry<T> = {
			value,
			expiresAt: ttl !== undefined ? Date.now() + ttl : undefined,
		};

		await this.cache.set(key, entry, ttl);
	}

	/**
	 * Delete a cached value
	 * @param key - Cache key
	 */
	async delete(key: string): Promise<void> {
		await this.cache.delete(key);
	}

	/**
	 * Clear all cached values
	 */
	async clear(): Promise<void> {
		await this.cache.clear();
	}

	/**
	 * Get the number of cached entries
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Clean up expired entries
	 * @returns Number of entries removed
	 */
	cleanup(): number {
		return this.cache.prune();
	}

	/**
	 * Dispose the provider and clean up resources
	 */
	[Symbol.dispose](): void {
		this.cache[Symbol.dispose]();
	}
}

/**
 * Create an in-memory idempotency provider
 * @param options - Provider options
 * @returns InMemoryIdempotencyProvider instance
 *
 * @example
 * ```typescript
 * const provider = createIdempotencyProvider({ maxSize: 1000 })
 *
 * await using s = scope({
 *   persistence: { idempotency: provider }
 * })
 * ```
 */
export function createIdempotencyProvider(
	options?: InMemoryIdempotencyProviderOptions,
): InMemoryIdempotencyProvider {
	return new InMemoryIdempotencyProvider(options);
}
