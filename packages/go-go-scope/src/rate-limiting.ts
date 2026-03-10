/**
 * Rate limiting utilities for go-go-scope - Debounce and throttle
 *
 * @module go-go-scope/rate-limiting
 *
 * @description
 * Provides debounce and throttle utilities for rate-limiting function execution.
 * These utilities are bound to a scope and automatically cleaned up when the
 * scope is disposed.
 *
 * Features:
 * - Debounce: Delay execution until after a period of inactivity
 * - Throttle: Limit execution to once per time interval
 * - Leading/trailing edge execution options
 * - Automatic cleanup on scope disposal
 * - Promise-based results
 *
 * @see {@link debounce} For debouncing function calls
 * @see {@link throttle} For throttling function calls
 * @see {@link Scope.debounce} Factory method on scope
 * @see {@link Scope.throttle} Factory method on scope
 */

import type {
	DebounceOptions,
	DisposableScope,
	Result,
	ThrottleOptions,
} from "./types.js";

/**
 * Create a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last time it was invoked.
 *
 * The debounced function returns a Promise that resolves with the result
 * of the function execution. If the scope is disposed before execution,
 * the promise resolves with an error.
 *
 * @template T Return type of the debounced function
 * @template Args Argument types of the debounced function
 *
 * @param scope - The scope to bind the debounced function to
 * @param fn - The function to debounce
 * @param options - Debounce configuration options
 * @param options.wait - Milliseconds to wait before execution (default: 300)
 * @param options.leading - Execute on the leading edge before wait (default: false)
 * @param options.trailing - Execute on the trailing edge after wait (default: true)
 * @returns {(...args: Args) => Promise<Result<unknown, T>>} A debounced function that returns a Promise
 *
 * @see {@link Scope.debounce} Factory method on scope
 * @see {@link throttle} For throttling instead of debouncing
 * @see {@link DebounceOptions} Options interface
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Basic debounce - execute 300ms after last call
 * const search = debounce(s, async (query: string) => {
 *   const results = await fetchSearchResults(query);
 *   return results;
 * }, { wait: 300 });
 *
 * // User typing triggers multiple calls
 * await search("h");      // Will be cancelled
 * await search("he");     // Will be cancelled
 * await search("hel");    // Will be cancelled
 * await search("hello");  // Executes after 300ms
 *
 * // Leading edge - execute immediately, then debounce
 * const save = debounce(s, async (data: string) => {
 *   await saveToServer(data);
 * }, { wait: 1000, leading: true, trailing: false });
 *
 * // Trailing edge only (default)
 * const log = debounce(s, async (message: string) => {
 *   await writeToLog(message);
 * }, { wait: 500, trailing: true });
 *
 * // Use with Result tuple
 * const [err, results] = await search("query");
 * if (err) {
 *   console.error("Search failed:", err);
 * } else {
 *   console.log("Results:", results);
 * }
 * ```
 */
/* #__PURE__ */
export function debounce<T, Args extends unknown[]>(
	scope: DisposableScope,
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
 *
 * The throttled function returns a Promise that resolves with the result
 * of the function execution. If throttled, returns a pending promise that
 * resolves when the next execution occurs (if trailing is enabled).
 *
 * @template T Return type of the throttled function
 * @template Args Argument types of the throttled function
 *
 * @param scope - The scope to bind the throttled function to
 * @param fn - The function to throttle
 * @param options - Throttle configuration options
 * @param options.interval - Minimum time between executions in milliseconds (default: 300)
 * @param options.leading - Execute on the leading edge (default: true)
 * @param options.trailing - Execute on the trailing edge (default: false)
 * @returns {(...args: Args) => Promise<Result<unknown, T>>} A throttled function that returns a Promise
 *
 * @see {@link Scope.throttle} Factory method on scope
 * @see {@link debounce} For debouncing instead of throttling
 * @see {@link ThrottleOptions} Options interface
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Basic throttle - execute at most once per second
 * const save = throttle(s, async (data: string) => {
 *   await saveToServer(data);
 *   return { saved: true };
 * }, { interval: 1000 });
 *
 * // Multiple calls within 1 second
 * const r1 = await save("data1");  // Executes immediately
 * const r2 = await save("data2");  // Throttled, returns undefined
 * const r3 = await save("data3");  // Throttled, returns undefined
 * // After 1 second, can execute again
 *
 * // With trailing execution
 * const log = throttle(s, async (event: Event) => {
 *   await sendAnalytics(event);
 * }, { interval: 5000, leading: true, trailing: true });
 *
 * // Leading: false, Trailing: true
 * const update = throttle(s, async (state: State) => {
 *   await updateDatabase(state);
 * }, { interval: 1000, leading: false, trailing: true });
 *
 * await update(state1);  // Schedules execution after 1s
 * await update(state2);  // Reschedules with new state
 * // Executes with state2 after 1s of inactivity
 *
 * // Scroll handler - limit to 60fps equivalent
 * const handleScroll = throttle(s, async () => {
 *   await updateScrollPosition();
 * }, { interval: 16, leading: true });  // ~60fps
 *
 * // Use with Result tuple
 * const [err, result] = await save("important data");
 * if (err) {
 *   console.error("Save failed:", err);
 * }
 * ```
 */
/* #__PURE__ */
export function throttle<T, Args extends unknown[]>(
	scope: DisposableScope,
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
