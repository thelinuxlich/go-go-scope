/**
 * Retry delay strategies for configurable backoff and jitter.
 *
 * @module go-go-scope/retry-strategies
 *
 * @description
 * Provides configurable delay strategies for retry operations.
 * These functions generate delay functions that can be used with
 * the retry option in task configuration.
 *
 * Features:
 * - Exponential backoff with configurable parameters
 * - Fixed delay with jitter
 * - Linear increasing delay
 * - Decorrelated jitter (Azure-style)
 * - Full jitter (AWS-style) for high contention
 *
 * @see {@link RetryDelayFn} Type for delay functions
 * @see {@link Scope.task} Where retry options are used
 */

import type { RetryDelayFn } from "./types.js";

/**
 * Exponential backoff with optional jitter.
 *
 * Returns a delay function that increases exponentially with each attempt,
 * optionally capped at a maximum delay and with optional jitter to prevent
 * thundering herd problems.
 *
 * Supports both partial jitter (jitter factor 0-1) and full jitter (AWS-style)
 * where delays are random between 0 and the calculated delay.
 *
 * @param options - Configuration options for exponential backoff
 * @param options.initial - Initial delay in milliseconds (default: 100)
 * @param options.max - Maximum delay in milliseconds (default: 30000)
 * @param options.multiplier - Multiplier for each attempt (default: 2)
 * @param options.jitter - Jitter factor 0-1 (default: 0). 0 = no jitter, 1 = full jitter
 * @param options.fullJitter - Use AWS-style full jitter (random value between 0 and calculated delay)
 * @returns {RetryDelayFn} Delay function for retry option
 *
 * @see {@link jitter} For fixed delay with jitter
 * @see {@link linear} For linear backoff
 * @see {@link decorrelatedJitter} For Azure-style jitter
 *
 * @example
 * ```typescript
 * import { scope, exponentialBackoff } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Basic exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000 })
 *   }
 * });
 *
 * // With 30% jitter to prevent thundering herd
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
 *   }
 * });
 * // Delays: ~70-130ms, ~140-260ms, ~280-520ms, etc.
 *
 * // With full jitter (AWS-style)
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000, fullJitter: true })
 *   }
 * });
 * // Delays: 0-100ms, 0-200ms, 0-400ms, 0-800ms, etc.
 * ```
 */
/* #__PURE__ */
export function exponentialBackoff({
	initial = 100,
	max = 30000,
	multiplier = 2,
	jitter = 0,
	fullJitter = false,
}: {
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
	/** Multiplier for each attempt (default: 2) */
	multiplier?: number;
	/** Jitter factor 0-1 (default: 0). 0 = no jitter, 1 = full jitter */
	jitter?: number;
	/** Use AWS-style full jitter (random value between 0 and calculated delay) */
	fullJitter?: boolean;
} = {}): RetryDelayFn {
	return (attempt: number, _error: unknown): number => {
		// Calculate exponential delay
		const expDelay = initial * multiplier ** (attempt - 1);

		// Apply max cap
		const cappedDelay = Math.min(expDelay, max);

		// Full jitter: random value between 0 and cappedDelay (AWS-style)
		if (fullJitter) {
			return Math.floor(Math.random() * cappedDelay);
		}

		// Apply partial jitter if specified
		if (jitter > 0) {
			const jitterAmount = cappedDelay * jitter;
			const minDelay = Math.max(0, cappedDelay - jitterAmount);
			const maxDelay = cappedDelay + jitterAmount;
			return Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
		}

		return cappedDelay;
	};
}

/**
 * Fixed delay with jitter.
 *
 * Returns a delay function that produces a fixed base delay with
 * random jitter applied. Useful when you want consistent delays
 * with some randomization to prevent synchronization.
 *
 * @param baseDelay - Base delay in milliseconds
 * @param jitterFactor - Jitter factor 0-1 (default: 0.1). 0 = no jitter, 1 = full jitter
 * @returns {RetryDelayFn} Delay function for retry option
 *
 * @see {@link exponentialBackoff} For exponential delays
 * @see {@link linear} For linear increasing delays
 * @see {@link decorrelatedJitter} For Azure-style jitter
 *
 * @example
 * ```typescript
 * import { scope, jitter } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Fixed 1000ms with 20% jitter: ~800-1200ms each attempt
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: jitter(1000, 0.2)
 *   }
 * });
 *
 * // For API rate limiting with consistent backoff
 * await s.task(() => callRateLimitedApi(), {
 *   retry: {
 *     max: 10,
 *     delay: jitter(2000, 0.1)  // ~1800-2200ms
 *   }
 * });
 *
 * // No jitter (consistent delays)
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 3,
 *     delay: jitter(1000, 0)  // Exactly 1000ms each time
 *   }
 * });
 * ```
 */
/* #__PURE__ */
export function jitter(baseDelay: number, jitterFactor = 0.1): RetryDelayFn {
	return (_attempt: number, _error: unknown): number => {
		if (jitterFactor <= 0) return baseDelay;

		const jitterAmount = baseDelay * jitterFactor;
		const minDelay = Math.max(0, baseDelay - jitterAmount);
		const maxDelay = baseDelay + jitterAmount;
		return Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
	};
}

/**
 * Linear increasing delay.
 *
 * Returns a delay function that increases linearly with each attempt.
 * The delay for attempt n is: baseDelay + increment * (n - 1)
 *
 * @param baseDelay - Base delay in milliseconds for first attempt
 * @param increment - Amount to add each attempt in milliseconds
 * @returns {RetryDelayFn} Delay function for retry option
 *
 * @see {@link exponentialBackoff} For exponential growth
 * @see {@link jitter} For fixed delays with jitter
 *
 * @example
 * ```typescript
 * import { scope, linear } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Linear backoff: 100ms, 150ms, 200ms, 250ms, 300ms
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: linear(100, 50)
 *   }
 * });
 *
 * // Slower progression: 500ms, 700ms, 900ms, 1100ms, 1300ms
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: linear(500, 200)
 *   }
 * });
 *
 * // For predictable, non-aggressive backoff
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 10,
 *     delay: linear(1000, 500)  // Increases by 0.5s each attempt
 *   }
 * });
 * ```
 */
/* #__PURE__ */
export function linear(baseDelay: number, increment: number): RetryDelayFn {
	return (attempt: number, _error: unknown): number => {
		return baseDelay + increment * (attempt - 1);
	};
}

/**
 * Decorrelated jitter (Microsoft Azure-style).
 *
 * Returns a delay function that uses decorrelated jitter, which is
 * better for high-contention scenarios. Each delay is calculated as
 * a random value between the initial delay and 3x the previous delay,
 * capped at max.
 *
 * This strategy prevents clusters of retries that can occur with
 * simple exponential backoff.
 *
 * @param options - Configuration options for decorrelated jitter
 * @param options.initial - Initial delay in milliseconds (default: 100)
 * @param options.max - Maximum delay in milliseconds (default: 30000)
 * @returns {RetryDelayFn} Delay function for retry option
 *
 * @see {@link exponentialBackoff} For standard exponential backoff
 * @see {@link jitter} For simple jitter
 *
 * @example
 * ```typescript
 * import { scope, decorrelatedJitter } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Azure-style decorrelated jitter
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: decorrelatedJitter({ initial: 100, max: 5000 })
 *   }
 * });
 * // Possible delays: 100-300ms, 100-900ms, 100-2700ms (capped at 5000ms)
 *
 * // Recommended for distributed systems with high contention
 * await s.task(() => accessSharedResource(), {
 *   retry: {
 *     max: 10,
 *     delay: decorrelatedJitter({ initial: 50, max: 10000 })
 *   }
 * });
 *
 * // For database connection retries
 * await s.task(() => connectToDatabase(), {
 *   retry: {
 *     max: 5,
 *     delay: decorrelatedJitter({ initial: 100, max: 30000 })
 *   }
 * });
 * ```
 */
/* #__PURE__ */
export function decorrelatedJitter({
	initial = 100,
	max = 30000,
}: {
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
} = {}): RetryDelayFn {
	let lastDelay = initial;

	return (_attempt: number, _error: unknown): number => {
		// Pick random value between initial and 3x the last delay
		const min = initial;
		const maxDelay = Math.min(max, lastDelay * 3);
		lastDelay = Math.floor(Math.random() * (maxDelay - min) + min);
		return lastDelay;
	};
}
