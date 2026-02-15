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
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     maxRetries: 5,
 *     delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
 *   }
 * })
 * // Delays: ~100ms, ~200ms, ~400ms, ~800ms, ~1600ms (with ±30% jitter)
 * ```
 */
export function exponentialBackoff({
	initial = 100,
	max = 30000,
	multiplier = 2,
	jitter = 0,
}: {
	initial?: number;
	max?: number;
	multiplier?: number;
	jitter?: number;
} = {}): RetryDelayFn {
	return (attempt: number, _error: unknown): number => {
		// Calculate exponential delay
		const expDelay = initial * multiplier ** (attempt - 1);

		// Apply max cap
		const cappedDelay = Math.min(expDelay, max);

		// Apply jitter if specified
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
 *     maxRetries: 5,
 *     delay: jitter(1000, 0.2)  // 1000ms ± 20%
 *   }
 * })
 * // Delays: ~800-1200ms each time
 * ```
 */
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
 *     maxRetries: 5,
 *     delay: linear(100, 50)  // 100, 150, 200, 250, 300ms
 *   }
 * })
 * ```
 */
export function linear(baseDelay: number, increment: number): RetryDelayFn {
	return (attempt: number, _error: unknown): number => {
		return baseDelay + increment * (attempt - 1);
	};
}

/**
 * Full jitter exponential backoff (AWS-style).
 * More aggressive jitter that picks a random value between 0 and the calculated delay.
 *
 * @param options.initial - Initial delay in ms (default: 100)
 * @param options.max - Maximum delay in ms (default: 30000)
 * @param options.multiplier - Multiplier for each attempt (default: 2)
 * @returns Delay function for retry option
 *
 * @example
 * ```typescript
 * await s.task(() => fetchData(), {
 *   retry: {
 *     maxRetries: 5,
 *     delay: fullJitterBackoff({ initial: 100, max: 5000 })
 *   }
 * })
 * // Delays: 0-100ms, 0-200ms, 0-400ms, etc.
 * ```
 */
export function fullJitterBackoff({
	initial = 100,
	max = 30000,
	multiplier = 2,
}: {
	initial?: number;
	max?: number;
	multiplier?: number;
} = {}): RetryDelayFn {
	return (attempt: number, _error: unknown): number => {
		const expDelay = initial * multiplier ** (attempt - 1);
		const cappedDelay = Math.min(expDelay, max);
		return Math.floor(Math.random() * cappedDelay);
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
 *     maxRetries: 5,
 *     delay: decorrelatedJitter({ initial: 100, max: 5000 })
 *   }
 * })
 * ```
 */
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
