/**
 * Token Bucket Rate Limiter for go-go-scope
 *
 * @module go-go-scope/token-bucket
 *
 * @description
 * Implements the token bucket algorithm for rate limiting. Supports both local
 * (in-memory) and distributed (via persistence) rate limiting.
 *
 * The token bucket algorithm allows bursts up to capacity while maintaining
 * a steady rate over time. Tokens are added at a fixed refill rate up to the
 * maximum capacity.
 *
 * Features:
 * - Local in-memory rate limiting
 * - Distributed rate limiting via cache providers (Redis, etc.)
 * - Burst capacity support
 * - Blocking and non-blocking acquire methods
 * - Timeout-based acquire with fallback
 * - State inspection and reset capabilities
 *
 * @see {@link Scope.tokenBucket} For creating token buckets via scope
 * @see {@link TokenBucketOptions} Configuration options
 */

import type { CacheProvider } from "./persistence/types.js";

/**
 * Options for creating a token bucket rate limiter.
 *
 * @interface
 *
 * @see {@link createTokenBucket} Factory function
 * @see {@link TokenBucket} The token bucket class
 *
 * @example
 * ```typescript
 * // Local rate limiting
 * const options: TokenBucketOptions = {
 *   capacity: 100,
 *   refillRate: 10,  // 10 tokens per second
 *   initialTokens: 100
 * };
 *
 * // Distributed rate limiting
 * const distributedOptions: TokenBucketOptions = {
 *   capacity: 1000,
 *   refillRate: 100,
 *   cache: redisCacheProvider,
 *   key: 'api-rate-limit:user-123'
 * };
 * ```
 */
export interface TokenBucketOptions {
	/** Maximum number of tokens in the bucket (burst capacity) */
	capacity: number;
	/** Rate at which tokens are added (tokens per second) */
	refillRate: number;
	/** Initial number of tokens (defaults to capacity) */
	initialTokens?: number;
	/** Optional cache provider for distributed rate limiting */
	cache?: CacheProvider;
	/** Key for distributed rate limiting (required if cache is provided) */
	key?: string;
}

/**
 * Token bucket state for persistence.
 *
 * @internal
 */
interface TokenBucketState {
	tokens: number;
	lastRefill: number;
}

/**
 * A token bucket rate limiter.
 *
 * Use for rate limiting API calls, requests, or any operation that needs
 * to be limited to a certain rate over time. The token bucket allows
 * bursts up to capacity while maintaining a steady refill rate.
 *
 * Supports both local (in-memory) and distributed (via persistence) modes.
 * In distributed mode, the token state is stored in a cache provider
 * (e.g., Redis) allowing rate limiting across multiple processes.
 *
 * @see {@link createTokenBucket} Factory function
 * @see {@link Scope.tokenBucket} Factory on scope
 * @see {@link TokenBucketOptions} Configuration options
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * // Local rate limiter: 100 requests per second
 * const bucket = s.tokenBucket({
 *   capacity: 100,
 *   refillRate: 100
 * })
 *
 * // Use the bucket
 * await bucket.acquire(async () => {
 *   await makeApiCall()
 * })
 *
 * // Check if allowed without consuming
 * if (bucket.tryConsume(1)) {
 *   await makeApiCall()
 * }
 * ```
 */
export class TokenBucket {
	private tokens: number;
	private lastRefill: number;
	private readonly capacity: number;
	private readonly refillRate: number;
	private readonly cache?: CacheProvider;
	private readonly key?: string;

	/**
	 * Creates a new TokenBucket instance.
	 *
	 * @param options - Configuration options for the token bucket
	 * @param options.capacity - Maximum number of tokens in the bucket (burst capacity)
	 * @param options.refillRate - Rate at which tokens are added (tokens per second)
	 * @param options.initialTokens - Initial number of tokens (defaults to capacity)
	 * @param options.cache - Optional cache provider for distributed rate limiting
	 * @param options.key - Key for distributed rate limiting (required if cache is provided)
	 *
	 * @throws {Error} If cache is provided but key is missing
	 *
	 * @see {@link createTokenBucket} Use this factory function instead
	 * @see {@link Scope.tokenBucket} Or use the scope factory method
	 */
	constructor(options: TokenBucketOptions) {
		this.capacity = options.capacity;
		this.refillRate = options.refillRate;
		this.tokens = options.initialTokens ?? options.capacity;
		this.lastRefill = Date.now();
		this.cache = options.cache;
		this.key = options.key;

		if (this.cache && !this.key) {
			throw new Error("TokenBucket: key is required when using cache");
		}
	}

	/**
	 * Get the current number of tokens available.
	 *
	 * Automatically refills tokens based on elapsed time since last check.
	 * In distributed mode, retrieves state from the cache provider.
	 *
	 * @returns {Promise<number>} Current token count (0 to capacity)
	 *
	 * @see {@link TokenBucket.getState} For full state including capacity and rate
	 *
	 * @example
	 * ```typescript
	 * const tokens = await bucket.getTokens();
	 * console.log(`Available tokens: ${tokens}/${bucket.capacity}`);
	 *
	 * if (tokens >= 5) {
	 *   // We have enough tokens for a batch operation
	 * }
	 * ```
	 */
	async getTokens(): Promise<number> {
		if (this.cache && this.key) {
			return this.getDistributedTokens();
		}
		this.refill();
		return this.tokens;
	}

	/**
	 * Try to consume tokens without blocking.
	 *
	 * Returns true if tokens were consumed, false otherwise.
	 * Does not wait for tokens to become available.
	 *
	 * @param tokens - Number of tokens to consume (default: 1)
	 * @returns {Promise<boolean>} True if tokens were consumed
	 *
	 * @see {@link TokenBucket.acquire} For blocking until tokens are available
	 * @see {@link TokenBucket.acquireWithTimeout} For blocking with timeout
	 *
	 * @example
	 * ```typescript
	 * // Check if we can make a request without blocking
	 * if (await bucket.tryConsume(1)) {
	 *   await makeApiCall();
	 * } else {
	 *   // Rate limited - skip or queue for later
	 *   console.log('Rate limited, skipping request');
	 * }
	 *
	 * // Consume multiple tokens for a batch operation
	 * if (await bucket.tryConsume(10)) {
	 *   await processBatch(10);
	 * }
	 * ```
	 */
	async tryConsume(tokens = 1): Promise<boolean> {
		if (this.cache && this.key) {
			return this.tryConsumeDistributed(tokens);
		}
		return this.tryConsumeLocal(tokens);
	}

	/**
	 * Acquire tokens and execute a function.
	 *
	 * Blocks until the required tokens are available, then executes
	 * the provided function. The tokens are consumed before the
	 * function executes.
	 *
	 * @template T Return type of the function
	 * @param tokens - Number of tokens to acquire
	 * @param fn - Function to execute after acquiring tokens
	 * @returns {Promise<T>} Result of the function
	 *
	 * @see {@link TokenBucket.acquireWithTimeout} For timeout-based acquire
	 * @see {@link TokenBucket.tryConsume} For non-blocking consume
	 *
	 * @example
	 * ```typescript
	 * // Execute an API call with rate limiting
	 * const result = await bucket.acquire(1, async () => {
	 *   return await fetchUserData(userId);
	 * });
	 *
	 * // Batch processing with higher token cost
	 * await bucket.acquire(5, async () => {
	 *   await processBatch(items);
	 * });
	 * ```
	 */
	async acquire<T>(tokens: number, fn: () => Promise<T>): Promise<T> {
		await this.waitForTokens(tokens);
		return fn();
	}

	/**
	 * Acquire tokens with a timeout.
	 *
	 * Attempts to acquire tokens within the specified timeout.
	 * Returns undefined if timeout is reached before tokens are available.
	 *
	 * @template T Return type of the function
	 * @param tokens - Number of tokens to acquire
	 * @param timeoutMs - Timeout in milliseconds
	 * @param fn - Function to execute after acquiring tokens
	 * @returns {Promise<T | undefined>} Result of the function, or undefined if timeout
	 *
	 * @see {@link TokenBucket.acquire} For blocking without timeout
	 * @see {@link TokenBucket.tryConsume} For immediate non-blocking attempt
	 *
	 * @example
	 * ```typescript
	 * // Try to acquire with 1 second timeout
	 * const result = await bucket.acquireWithTimeout(
	 *   1,
	 *   1000,
	 *   async () => await fetchData()
	 * );
	 *
	 * if (result === undefined) {
	 *   console.log('Request timed out due to rate limiting');
	 * } else {
	 *   console.log('Data received:', result);
	 * }
	 * ```
	 */
	async acquireWithTimeout<T>(
		tokens: number,
		timeoutMs: number,
		fn: () => Promise<T>,
	): Promise<T | undefined> {
		const acquired = await this.waitForTokensWithTimeout(tokens, timeoutMs);
		if (!acquired) return undefined;
		return fn();
	}

	/**
	 * Reset the bucket to full capacity.
	 *
	 * Sets tokens to capacity and updates the last refill time.
	 * In distributed mode, updates the state in the cache.
	 *
	 * @returns {Promise<void>} Resolves when reset is complete
	 *
	 * @see {@link TokenBucket.getTokens} For checking current tokens
	 *
	 * @example
	 * ```typescript
	 * // Reset after a rate limit error from upstream
	 * try {
	 *   await makeApiCall();
	 * } catch (err) {
	 *   if (isRateLimitError(err)) {
	 *     // Reset our bucket to sync with upstream
	 *     await bucket.reset();
	 *   }
	 * }
	 *
	 * // Manual reset for testing
	 * await bucket.reset();
	 * expect(await bucket.getTokens()).toBe(100);
	 * ```
	 */
	async reset(): Promise<void> {
		if (this.cache && this.key) {
			await this.resetDistributed();
		} else {
			this.tokens = this.capacity;
			this.lastRefill = Date.now();
		}
	}

	/**
	 * Get the current bucket state.
	 *
	 * Returns the current token count along with capacity and refill rate.
	 * Tokens are refilled before returning the state.
	 *
	 * @returns {Promise<Object>} Current bucket state
	 * @returns {number} returns.tokens Current token count
	 * @returns {number} returns.capacity Maximum bucket capacity
	 * @returns {number} returns.refillRate Tokens added per second
	 *
	 * @see {@link TokenBucket.getTokens} For just the token count
	 *
	 * @example
	 * ```typescript
	 * const state = await bucket.getState();
	 * console.log(`Tokens: ${state.tokens}/${state.capacity}`);
	 * console.log(`Refill rate: ${state.refillRate}/sec`);
	 *
	 * const usagePercent = (state.tokens / state.capacity) * 100;
	 * if (usagePercent < 10) {
	 *   console.warn('Token bucket nearly empty!');
	 * }
	 * ```
	 */
	async getState(): Promise<{
		tokens: number;
		capacity: number;
		refillRate: number;
	}> {
		const tokens = await this.getTokens();
		return {
			tokens,
			capacity: this.capacity,
			refillRate: this.refillRate,
		};
	}

	/**
	 * Refill tokens based on elapsed time.
	 *
	 * @internal
	 */
	private refill(): void {
		const now = Date.now();
		const elapsedMs = now - this.lastRefill;
		const tokensToAdd = (elapsedMs / 1000) * this.refillRate;

		this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
		this.lastRefill = now;
	}

	/**
	 * Try to consume tokens locally.
	 *
	 * @internal
	 */
	private tryConsumeLocal(tokens: number): boolean {
		this.refill();
		if (this.tokens >= tokens) {
			this.tokens -= tokens;
			return true;
		}
		return false;
	}

	/**
	 * Wait for tokens to become available.
	 *
	 * @internal Blocks until tokens are available
	 */
	private async waitForTokens(tokens: number): Promise<void> {
		while (!(await this.tryConsume(tokens))) {
			// Wait for tokens to refill
			const tokensNeeded = tokens - (await this.getTokens());
			const waitTimeMs = (tokensNeeded / this.refillRate) * 1000;
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(waitTimeMs, 100)),
			);
		}
	}

	/**
	 * Wait for tokens with timeout.
	 *
	 * @internal
	 * @returns True if tokens were acquired, false if timeout
	 */
	private async waitForTokensWithTimeout(
		tokens: number,
		timeoutMs: number,
	): Promise<boolean> {
		const startTime = Date.now();
		while (!(await this.tryConsume(tokens))) {
			if (Date.now() - startTime >= timeoutMs) {
				return false;
			}
			const tokensNeeded = tokens - (await this.getTokens());
			const waitTimeMs = (tokensNeeded / this.refillRate) * 1000;
			const remainingTimeout = timeoutMs - (Date.now() - startTime);
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(waitTimeMs, 100, remainingTimeout)),
			);
		}
		return true;
	}

	// Distributed implementation using cache provider

	/**
	 * Get tokens from distributed cache.
	 *
	 * @internal
	 */
	private async getDistributedTokens(): Promise<number> {
		if (!this.cache || !this.key) return this.tokens;

		const state = await this.cache.get<TokenBucketState>(
			`token-bucket:${this.key}`,
		);

		if (!state) {
			return this.capacity;
		}

		const now = Date.now();
		const elapsedMs = now - state.lastRefill;
		const tokensToAdd = (elapsedMs / 1000) * this.refillRate;

		return Math.min(this.capacity, state.tokens + tokensToAdd);
	}

	/**
	 * Try to consume tokens in distributed mode.
	 *
	 * @internal
	 */
	private async tryConsumeDistributed(tokens: number): Promise<boolean> {
		if (!this.cache || !this.key) return false;

		// This is a simplified implementation - real distributed rate limiting
		// would need atomic compare-and-swap operations
		const currentTokens = await this.getDistributedTokens();

		if (currentTokens >= tokens) {
			const newState: TokenBucketState = {
				tokens: currentTokens - tokens,
				lastRefill: Date.now(),
			};
			await this.cache.set(`token-bucket:${this.key}`, newState, 86400000); // 24h TTL
			return true;
		}

		return false;
	}

	/**
	 * Reset bucket in distributed mode.
	 *
	 * @internal
	 */
	private async resetDistributed(): Promise<void> {
		if (!this.cache || !this.key) return;

		const state: TokenBucketState = {
			tokens: this.capacity,
			lastRefill: Date.now(),
		};
		await this.cache.set(`token-bucket:${this.key}`, state, 86400000);
	}
}

/**
 * Create a token bucket rate limiter.
 *
 * Factory function for creating TokenBucket instances. Supports both local
 * (in-memory) and distributed (via cache provider) rate limiting.
 *
 * @param options - Configuration options for the token bucket
 * @param options.capacity - Maximum number of tokens in the bucket (burst capacity)
 * @param options.refillRate - Rate at which tokens are added (tokens per second)
 * @param options.initialTokens - Initial number of tokens (defaults to capacity)
 * @param options.cache - Optional cache provider for distributed rate limiting
 * @param options.key - Key for distributed rate limiting (required if cache is provided)
 * @returns {TokenBucket} A new token bucket instance
 *
 * @throws {Error} If cache is provided without a key
 *
 * @see {@link TokenBucket} The token bucket class
 * @see {@link Scope.tokenBucket} Factory method on scope
 * @see {@link TokenBucketOptions} Configuration options
 *
 * @example
 * ```typescript
 * // Local rate limiter - 100 requests per second burst
 * const localBucket = createTokenBucket({
 *   capacity: 100,
 *   refillRate: 10  // 10 tokens per second
 * });
 *
 * // Distributed rate limiter using Redis
 * const distributedBucket = createTokenBucket({
 *   capacity: 1000,
 *   refillRate: 100,
 *   cache: redisAdapter,
 *   key: 'api-rate-limit:endpoint-users'
 * });
 *
 * // Use the bucket
 * await localBucket.acquire(1, async () => {
 *   await processRequest();
 * });
 *
 * // Check without blocking
 * if (await localBucket.tryConsume(1)) {
 *   await processRequest();
 * } else {
 *   console.log('Rate limited');
 * }
 * ```
 */
export function createTokenBucket(options: TokenBucketOptions): TokenBucket {
	return new TokenBucket(options);
}
