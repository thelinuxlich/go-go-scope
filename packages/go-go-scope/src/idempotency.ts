/**
 * Idempotency provider implementations for go-go-scope
 *
 * Provides in-memory and distributed idempotency support for task results.
 */

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
 * Stores task results in memory with optional TTL support.
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
	private readonly store = new Map<string, IdempotencyEntry<unknown>>();
	private readonly maxSize: number | undefined;

	constructor(options: InMemoryIdempotencyProviderOptions = {}) {
		this.maxSize = options.maxSize;
	}

	/**
	 * Get a cached value by key
	 * @param key - Cache key
	 * @returns Object with value and optional expiry timestamp, or null if not found/expired
	 */
	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const entry = this.store.get(key);

		if (!entry) {
			return null;
		}

		// Check if expired
		if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
			this.store.delete(key);
			return null;
		}

		return {
			value: entry.value as T,
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
		// Evict if at capacity (LRU - remove oldest entries)
		if (this.maxSize !== undefined && this.store.size >= this.maxSize) {
			this.evictOldest();
		}

		const entry: IdempotencyEntry<T> = {
			value,
			expiresAt: ttl !== undefined ? Date.now() + ttl : undefined,
		};

		this.store.set(key, entry as IdempotencyEntry<unknown>);
	}

	/**
	 * Delete a cached value
	 * @param key - Cache key
	 */
	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}

	/**
	 * Clear all cached values
	 */
	async clear(): Promise<void> {
		this.store.clear();
	}

	/**
	 * Get the number of cached entries
	 */
	get size(): number {
		return this.store.size;
	}

	/**
	 * Clean up expired entries
	 * @returns Number of entries removed
	 */
	cleanup(): number {
		const now = Date.now();
		let removed = 0;

		for (const [key, entry] of this.store.entries()) {
			if (entry.expiresAt !== undefined && entry.expiresAt < now) {
				this.store.delete(key);
				removed++;
			}
		}

		return removed;
	}

	/**
	 * Dispose the provider and clean up resources
	 */
	[Symbol.dispose](): void {
		this.store.clear();
	}

	/**
	 * Evict the oldest entries when at capacity
	 */
	private evictOldest(): void {
		if (this.maxSize === undefined) return;

		// Remove 10% of entries to make room
		const entriesToRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
		const entries = Array.from(this.store.entries());

		// Sort by key (simple eviction strategy)
		entries.sort((a, b) => a[0].localeCompare(b[0]));

		for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
			const entry = entries[i];
			if (entry) {
				this.store.delete(entry[0]);
			}
		}
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
