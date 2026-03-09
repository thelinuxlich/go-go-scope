/**
 * Retry delay strategies for configurable backoff and jitter.
 */

import type { RetryDelayFn } from "./types.js";

/**
 * Exponential backoff with optional jitter.
 *
 * @param options.initial - Initial delay in ms (default: 100)
 * @param options.max - Maximum delay in ms (default: 30000)
 * @param options.multiplier - Multiplier for each attempt (default: 2)
 * @param options.jitter - Jitter factor 0-1 (default: 0). 0 = no jitter, 1 = full jitter
 * @param options.fullJitter - Use AWS-style full jitter (random value between 0 and calculated delay)
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
 *   }
 * })
 * // Delays: ~100ms, ~200ms, ~400ms, ~800ms, ~1600ms (with ±30% jitter)
 *
 * // With full jitter (AWS-style)
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000, fullJitter: true })
 *   }
 * })
 * // Delays: 0-100ms, 0-200ms, 0-400ms, etc.
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
	initial?: number;
	max?: number;
	multiplier?: number;
	jitter?: number;
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
 * @param baseDelay - Base delay in ms
 * @param jitterFactor - Jitter factor 0-1 (default: 0.1). 0 = no jitter, 1 = full jitter
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: jitter(1000, 0.2)  // 1000ms ± 20%
 *   }
 * })
 * // Delays: ~800-1200ms each time
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
 * @param baseDelay - Base delay in ms for first attempt
 * @param increment - Amount to add each attempt
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: linear(100, 50)  // 100, 150, 200, 250, 300ms
 *   }
 * })
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
 * Better for high-contention scenarios.
 *
 * @param options.initial - Initial delay in ms (default: 100)
 * @param options.max - Maximum delay in ms (default: 30000)
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     max: 5,
 *     delay: decorrelatedJitter({ initial: 100, max: 5000 })
 *   }
 * })
 * ```
 */
/* #__PURE__ */
export function decorrelatedJitter({
	initial = 100,
	max = 30000,
}: {
	initial?: number;
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
