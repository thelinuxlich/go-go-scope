/**
 * Rate limiting utilities for go-go-scope - Debounce and throttle
 */

import type { Scope } from "./scope.js";
import type { DebounceOptions, Result, ThrottleOptions } from "./types.js";

/**
 * Create a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last time it was invoked.
 * Automatically cancelled when the scope is disposed.
 *
 * @param scope - The scope to bind the debounced function to
 * @param fn - The function to debounce
 * @param options - Debounce options
 * @returns A debounced function that returns a Promise
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const search = debounce(s, async (query: string) => {
 *   return await fetchSearchResults(query)
 * }, { wait: 300 })
 *
 * // Will only execute after 300ms of no calls
 * const [err, results] = await search("hello")
 * ```
 */
export function debounce<T, Args extends unknown[]>(
	scope: Scope<Record<string, unknown>>,
	fn: (...args: Args) => Promise<T>,
	options: DebounceOptions = {},
): (...args: Args) => Promise<Result<unknown, T>> {
	const wait = options.wait ?? 300;
	const leading = options.leading ?? false;
	const trailing = options.trailing ?? true;

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: Args | undefined;
	let lastCallTime: number | undefined;
	let resultPromise: Promise<Result<unknown, T>> | undefined;
	let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

	const invoke = async (args: Args): Promise<void> => {
		lastCallTime = performance.now();
		try {
			const result = await fn(...args);
			resolveFn?.([undefined, result]);
		} catch (error) {
			resolveFn?.([error, undefined]);
		}
	};

	const startTimer = (_args: Args): void => {
		timeoutId = setTimeout(() => {
			if (trailing && lastArgs) {
				void invoke(lastArgs);
			}
			timeoutId = undefined;
			lastArgs = undefined;
		}, wait);
	};

	// Clean up on scope disposal
	const cleanupDisposable: AsyncDisposable = {
		async [Symbol.asyncDispose]() {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			if (resolveFn) {
				resolveFn([new Error("Scope disposed"), undefined]);
			}
		},
	};
	scope.registerDisposable(cleanupDisposable);

	return (...args: Args): Promise<Result<unknown, T>> => {
		// Check if scope is disposed
		if (scope.isDisposed || scope.signal.aborted) {
			return Promise.resolve([new Error("Scope disposed"), undefined]);
		}

		lastArgs = args;
		const now = performance.now();

		// Create a new promise for this call
		resultPromise = new Promise<Result<unknown, T>>((resolve) => {
			resolveFn = resolve;
		});

		// Clear existing timeout
		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		// Check for leading edge execution
		if (leading) {
			const isFirstCall = lastCallTime === undefined;
			const timeSinceLastCall = lastCallTime ? now - lastCallTime : wait + 1;

			if (isFirstCall || timeSinceLastCall >= wait) {
				if (timeoutId) clearTimeout(timeoutId);
				void invoke(args);
				startTimer(args);
				return resultPromise;
			}
		}

		// Schedule trailing execution
		startTimer(args);
		return resultPromise;
	};
}

/**
 * Create a throttled function that only invokes the provided function
 * at most once per every `interval` milliseconds.
 * Automatically cancelled when the scope is disposed.
 *
 * @param scope - The scope to bind the throttled function to
 * @param fn - The function to throttle
 * @param options - Throttle options
 * @returns A throttled function that returns a Promise
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const save = throttle(s, async (data: string) => {
 *   await saveToServer(data)
 * }, { interval: 1000 })
 *
 * // Will execute at most once per second
 * await save("data1")
 * await save("data2") // Throttled, returns same promise
 * ```
 */
export function throttle<T, Args extends unknown[]>(
	scope: Scope<Record<string, unknown>>,
	fn: (...args: Args) => Promise<T>,
	options: ThrottleOptions = {},
): (...args: Args) => Promise<Result<unknown, T>> {
	const interval = options.interval ?? 300;
	const leading = options.leading ?? true;
	const trailing = options.trailing ?? false;

	let lastInvokeTime = 0;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: Args | undefined;
	let pendingPromise: Promise<Result<unknown, T>> | undefined;
	let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

	const invoke = async (args: Args): Promise<void> => {
		lastInvokeTime = performance.now();
		pendingPromise = undefined;
		try {
			const result = await fn(...args);
			resolveFn?.([undefined, result]);
		} catch (error) {
			resolveFn?.([error, undefined]);
		}
	};

	// Clean up on scope disposal
	const cleanupDisposable: AsyncDisposable = {
		async [Symbol.asyncDispose]() {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			if (resolveFn) {
				resolveFn([new Error("Scope disposed"), undefined]);
			}
		},
	};
	scope.registerDisposable(cleanupDisposable);

	return (...args: Args): Promise<Result<unknown, T>> => {
		// Check if scope is disposed
		if (scope.isDisposed || scope.signal.aborted) {
			return Promise.resolve([new Error("Scope disposed"), undefined]);
		}

		const now = performance.now();
		const timeSinceLastInvoke = now - lastInvokeTime;

		lastArgs = args;

		// Return existing promise if we're still throttled
		if (timeSinceLastInvoke < interval) {
			// Schedule trailing execution if needed
			if (trailing && !timeoutId) {
				pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
					resolveFn = resolve;
				});
				timeoutId = setTimeout(() => {
					if (lastArgs) void invoke(lastArgs);
					timeoutId = undefined;
				}, interval - timeSinceLastInvoke);
			}
			return pendingPromise ?? Promise.resolve([undefined, undefined as T]);
		}

		// Clear any pending timeout
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}

		// Execute immediately if leading edge is enabled
		if (leading) {
			pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
				resolveFn = resolve;
			});
			void invoke(args);
			return pendingPromise;
		}

		// Schedule for trailing execution
		if (trailing) {
			pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
				resolveFn = resolve;
			});
			timeoutId = setTimeout(() => {
				if (lastArgs) void invoke(lastArgs);
				timeoutId = undefined;
			}, interval);
			return pendingPromise;
		}

		return Promise.resolve([undefined, undefined as T]);
	};
}
