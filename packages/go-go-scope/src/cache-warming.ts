/**
 * Cache Warming for go-go-scope
 *
 * Provides proactive cache management with:
 * - Async cache warming
 * - Automatic refresh before TTL expiration
 * - Background refresh to prevent cache stampedes
 * - Multi-tier cache support
 */

import type { CacheProvider } from "./persistence/types.js";
import type { Scope } from "./scope.js";
import type { Result } from "./types.js";

/**
 * Cache warming options
 */
export interface CacheWarmingOptions<T> {
	/** Cache key */
	key: string;
	/** Function to fetch the value */
	fetcher: () => Promise<T>;
	/** TTL in milliseconds */
	ttl: number;
	/** Refresh threshold (0-1) - refresh when remaining TTL is below this percentage */
	refreshThreshold?: number;
	/** Background refresh - true to refresh in background, false to wait */
	backgroundRefresh?: boolean;
	/** Stale-while-revalidate - serve stale data while refreshing */
	staleWhileRevalidate?: boolean;
	/** On error callback */
	onError?: (error: Error) => void;
	/** On refresh callback */
	onRefresh?: (value: T) => void;
}

/**
 * Cache warming configuration
 */
export interface CacheWarmerConfig {
	/** Default TTL in milliseconds */
	defaultTTL: number;
	/** Default refresh threshold (0-1) */
	defaultRefreshThreshold: number;
	/** Default background refresh */
	defaultBackgroundRefresh: boolean;
	/** Default stale-while-revalidate */
	defaultStaleWhileRevalidate: boolean;
	/** Refresh check interval in milliseconds */
	checkInterval: number;
	/** Maximum concurrent refreshes */
	maxConcurrentRefreshes: number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
	value: T;
	expiresAt: number;
	refreshing: boolean;
	lastAccessed: number;
	accessCount: number;
}

/**
 * Cache Warmer for proactive cache management
 *
 * @example
 * ```typescript
 * const warmer = new CacheWarmer(scope, cacheProvider, {
 *   defaultTTL: 60000,
 *   defaultRefreshThreshold: 0.2,
 *   checkInterval: 5000
 * })
 *
 * // Register a warmed cache
 * const userCache = warmer.register('user:123', {
 *   fetcher: () => fetchUser(123),
 *   ttl: 60000,
 *   refreshThreshold: 0.2,
 *   backgroundRefresh: true
 * })
 *
 * // Get value (automatically refreshes if needed)
 * const user = await userCache.get()
 * ```
 */
export class CacheWarmer<T = unknown> {
	private provider: CacheProvider;
	private config: CacheWarmerConfig;
	private entries = new Map<string, CacheWarmingOptions<T>>();
	private refreshInProgress = new Set<string>();
	private checkIntervalId?: ReturnType<typeof setInterval>;
	private refreshSemaphore: {
		acquire: () => Promise<void>;
		release: () => void;
	};

	constructor(
		scope: Scope,
		provider: CacheProvider,
		config: Partial<CacheWarmerConfig> = {},
	) {
		this.provider = provider;
		this.config = {
			defaultTTL: 60000,
			defaultRefreshThreshold: 0.2,
			defaultBackgroundRefresh: true,
			defaultStaleWhileRevalidate: true,
			checkInterval: 5000,
			maxConcurrentRefreshes: 10,
			...config,
		};

		// Simple semaphore for concurrent refresh limit
		let permits = this.config.maxConcurrentRefreshes;
		const queue: Array<() => void> = [];

		this.refreshSemaphore = {
			acquire: async () => {
				if (permits > 0) {
					permits--;
					return;
				}
				return new Promise<void>((resolve) => queue.push(resolve));
			},
			release: () => {
				if (queue.length > 0) {
					const next = queue.shift();
					next?.();
				} else {
					permits++;
				}
			},
		};

		// Start background refresh checker
		this.startBackgroundRefresh();

		// Register cleanup
		scope.onDispose(() => this.dispose());
	}

	/**
	 * Register a cache entry for warming
	 */
	register(
		key: string,
		options: Omit<CacheWarmingOptions<T>, "key">,
	): { get: () => Promise<Result<Error, T>> } {
		const fullOptions = { key, ...options } as CacheWarmingOptions<T>;
		this.entries.set(key, fullOptions);

		// Initial warm
		this.warm(key).catch(() => {});

		return {
			get: () => this.get(key),
		};
	}

	/**
	 * Unregister a cache entry
	 */
	unregister(key: string): void {
		this.entries.delete(key);
	}

	/**
	 * Get value from cache (with automatic refresh)
	 */
	async get(key: string): Promise<Result<Error, T>> {
		const options = this.entries.get(key);
		if (!options) {
			return [new Error(`Cache entry '${key}' not registered`), undefined];
		}

		try {
			// Try to get from cache
			const cached = await this.provider.get<CacheEntry<T>>(key);

			if (cached) {
				const now = Date.now();
				const remainingRatio = (cached.expiresAt - now) / options.ttl;
				const threshold =
					options.refreshThreshold ?? this.config.defaultRefreshThreshold;

				// Check if refresh is needed
				if (remainingRatio < threshold && !cached.refreshing) {
					if (
						options.backgroundRefresh ??
						this.config.defaultBackgroundRefresh
					) {
						// Trigger background refresh
						this.warm(key).catch(() => {});
					} else {
						// Wait for refresh
						return this.warm(key);
					}
				}

				// Check if stale-while-revalidate applies
				if (cached.expiresAt < now) {
					const allowStale =
						options.staleWhileRevalidate ??
						this.config.defaultStaleWhileRevalidate;
					if (!allowStale) {
						// Serve stale and refresh
						this.warm(key).catch(() => {});
						return [undefined, cached.value];
					}
					// Expired and no stale-while-revalidate
					return this.warm(key);
				}

				return [undefined, cached.value];
			}

			// Cache miss - fetch and store
			return this.warm(key);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			options.onError?.(err);
			return [err, undefined];
		}
	}

	/**
	 * Warm the cache for a specific key
	 */
	async warm(key: string): Promise<Result<Error, T>> {
		// Prevent duplicate concurrent refreshes
		if (this.refreshInProgress.has(key)) {
			// Wait for existing refresh
			while (this.refreshInProgress.has(key)) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			// Return cached value
			const cached = await this.provider.get<CacheEntry<T>>(key);
			if (cached) {
				return [undefined, cached.value];
			}
			return [new Error("Cache warm failed"), undefined];
		}

		const options = this.entries.get(key);
		if (!options) {
			return [new Error(`Cache entry '${key}' not registered`), undefined];
		}

		await this.refreshSemaphore.acquire();
		this.refreshInProgress.add(key);

		try {
			const value = await options.fetcher();
			const entry: CacheEntry<T> = {
				value,
				expiresAt: Date.now() + options.ttl,
				refreshing: false,
				lastAccessed: Date.now(),
				accessCount: 0,
			};

			await this.provider.set(key, entry, options.ttl);
			options.onRefresh?.(value);

			return [undefined, value];
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			options.onError?.(err);

			// Try to return stale value on error
			const cached = await this.provider.get<CacheEntry<T>>(key);
			if (
				cached &&
				(options.staleWhileRevalidate ??
					this.config.defaultStaleWhileRevalidate)
			) {
				return [undefined, cached.value];
			}

			return [err, undefined];
		} finally {
			this.refreshInProgress.delete(key);
			this.refreshSemaphore.release();
		}
	}

	/**
	 * Warm all registered caches
	 */
	async warmAll(): Promise<Map<string, Result<Error, T>>> {
		const results = new Map<string, Result<Error, T>>();

		for (const key of this.entries.keys()) {
			const result = await this.warm(key);
			results.set(key, result);
		}

		return results;
	}

	/**
	 * Invalidate a cache entry
	 */
	async invalidate(key: string): Promise<void> {
		await this.provider.delete(key);
	}

	/**
	 * Invalidate all cache entries matching a pattern
	 */
	async invalidatePattern(pattern: string): Promise<void> {
		const keys = await this.provider.keys(pattern);
		await Promise.all(keys.map((key) => this.provider.delete(key)));
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{
		registered: number;
		refreshing: number;
		hits: number;
		misses: number;
	}> {
		return {
			registered: this.entries.size,
			refreshing: this.refreshInProgress.size,
			hits: 0, // Would need to track separately
			misses: 0,
		};
	}

	/**
	 * Start background refresh checker
	 */
	private startBackgroundRefresh(): void {
		this.checkIntervalId = setInterval(() => {
			this.checkAndRefresh().catch(() => {});
		}, this.config.checkInterval);
	}

	/**
	 * Check all entries and refresh as needed
	 */
	private async checkAndRefresh(): Promise<void> {
		for (const [key, options] of this.entries) {
			if (this.refreshInProgress.has(key)) continue;

			try {
				const cached = await this.provider.get<CacheEntry<T>>(key);
				if (!cached) {
					// Cache miss - warm it
					this.warm(key).catch(() => {});
					continue;
				}

				const now = Date.now();
				const remainingRatio = (cached.expiresAt - now) / options.ttl;
				const threshold =
					options.refreshThreshold ?? this.config.defaultRefreshThreshold;

				if (remainingRatio < threshold) {
					// Trigger background refresh
					this.warm(key).catch(() => {});
				}
			} catch {
				// Ignore errors in background check
			}
		}
	}

	/**
	 * Dispose the cache warmer
	 */
	dispose(): void {
		if (this.checkIntervalId) {
			clearInterval(this.checkIntervalId);
			this.checkIntervalId = undefined;
		}
		this.entries.clear();
		this.refreshInProgress.clear();
	}
}

/**
 * Create a cache warmer helper function
 *
 * @example
 * ```typescript
 * const getUser = createWarmedCache(scope, cacheProvider, {
 *   defaultTTL: 60000,
 *   defaultRefreshThreshold: 0.2
 * })
 *
 * // Create warmed cache instance
 * const user123 = getUser('user:123', () => fetchUser(123), {
 *   ttl: 60000,
 *   refreshThreshold: 0.2
 * })
 *
 * const user = await user123.get()
 * ```
 */
export function createWarmedCache(
	scope: Scope,
	provider: CacheProvider,
	config: Partial<CacheWarmerConfig> = {},
) {
	const warmer = new CacheWarmer(scope, provider, config);

	return function get<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: Partial<Omit<CacheWarmingOptions<T>, "key" | "fetcher">> = {},
	) {
		return warmer.register(key, { fetcher, ...options } as Omit<
			CacheWarmingOptions<unknown>,
			"key"
		>);
	};
}

/**
 * Multi-tier cache with warming
 *
 * Supports L1 (memory) and L2 (persistent) caching with warming
 */
export class MultiTierCache<T = unknown> {
	private l1Cache = new Map<string, CacheEntry<T>>(); // Memory
	private warmer: CacheWarmer<T>;
	private l1MaxSize: number;

	constructor(
		scope: Scope,
		l2Provider: CacheProvider,
		config: Partial<CacheWarmerConfig> & { l1MaxSize?: number } = {},
	) {
		const { l1MaxSize = 1000, ...warmerConfig } = config;
		this.l1MaxSize = l1MaxSize;
		this.warmer = new CacheWarmer(scope, l2Provider, warmerConfig);

		// Cleanup L1 on scope dispose
		scope.onDispose(() => this.l1Cache.clear());
	}

	/**
	 * Register a key for warming
	 */
	register(
		key: string,
		options: Omit<CacheWarmingOptions<T>, "key">,
	): { get: () => Promise<Result<Error, T>> } {
		// Register with L2 warmer
		const l2Entry = this.warmer.register(key, options);

		return {
			get: async () => {
				// Check L1 first
				const l1Entry = this.l1Cache.get(key);
				if (l1Entry && l1Entry.expiresAt > Date.now()) {
					return [undefined, l1Entry.value];
				}

				// Fall through to L2 (with warming)
				const result = await l2Entry.get();
				if (!result[0] && result[1] !== undefined) {
					// Populate L1
					this.setL1(key, result[1], options.ttl);
				}

				return result;
			},
		};
	}

	/**
	 * Set value in L1 cache with LRU eviction
	 */
	private setL1(key: string, value: T, ttl: number): void {
		// Evict if at capacity
		if (this.l1Cache.size >= this.l1MaxSize) {
			const oldestKey = this.l1Cache.keys().next().value;
			if (oldestKey) {
				this.l1Cache.delete(oldestKey as string);
			}
		}

		this.l1Cache.set(key, {
			value,
			expiresAt: Date.now() + ttl,
			refreshing: false,
			lastAccessed: Date.now(),
			accessCount: 0,
		});
	}

	/**
	 * Invalidate a key from both tiers
	 */
	async invalidate(key: string): Promise<void> {
		this.l1Cache.delete(key);
		await this.warmer.invalidate(key);
	}

	/**
	 * Dispose the multi-tier cache
	 */
	dispose(): void {
		this.l1Cache.clear();
		this.warmer.dispose();
	}
}
