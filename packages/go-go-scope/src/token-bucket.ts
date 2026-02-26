/**
 * Token Bucket Rate Limiter for go-go-scope
 *
 * Supports both local (in-memory) and distributed (via persistence) rate limiting.
 * The token bucket algorithm allows bursts up to capacity while maintaining
 * a steady rate over time.
 */

import type { CacheProvider } from "./persistence/types.js";

/**
 * Options for creating a token bucket
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
 * Token bucket state for persistence
 */
interface TokenBucketState {
	tokens: number;
	lastRefill: number;
}

/**
 * A token bucket rate limiter.
 *
 * Use for rate limiting API calls, requests, or any operation that needs
 * to be limited to a certain rate over time.
 *
 * Supports both local (in-memory) and distributed (via persistence) modes.
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
	 * Get current number of tokens (refills first)
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
	 * Returns true if tokens were consumed, false otherwise.
	 */
	async tryConsume(tokens = 1): Promise<boolean> {
		if (this.cache && this.key) {
			return this.tryConsumeDistributed(tokens);
		}
		return this.tryConsumeLocal(tokens);
	}

	/**
	 * Acquire tokens and execute the function.
	 * Blocks until tokens are available.
	 */
	async acquire<T>(tokens: number, fn: () => Promise<T>): Promise<T> {
		await this.waitForTokens(tokens);
		return fn();
	}

	/**
	 * Acquire tokens with a timeout.
	 * Returns undefined if timeout is reached.
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
	 * Get current bucket state.
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

	private refill(): void {
		const now = Date.now();
		const elapsedMs = now - this.lastRefill;
		const tokensToAdd = (elapsedMs / 1000) * this.refillRate;

		this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
		this.lastRefill = now;
	}

	private tryConsumeLocal(tokens: number): boolean {
		this.refill();
		if (this.tokens >= tokens) {
			this.tokens -= tokens;
			return true;
		}
		return false;
	}

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
 * @example
 * ```typescript
 * // Local rate limiter
 * const bucket = createTokenBucket({
 *   capacity: 100,
 *   refillRate: 10  // 10 tokens per second
 * })
 *
 * // Distributed rate limiter
 * const bucket = createTokenBucket({
 *   capacity: 100,
 *   refillRate: 10,
 *   persistence: redisAdapter,
 *   key: 'api-rate-limit'
 * })
 * ```
 */
export function createTokenBucket(options: TokenBucketOptions): TokenBucket {
	return new TokenBucket(options);
}
