/**
 * Cancellation utilities for AbortSignal
 *
 * Lightweight helpers for working with AbortSignal without
 * introducing new classes or concepts.
 */

import createDebug from "debug";

const debugCancel = createDebug("go-go-scope:cancellation");

/**
 * Throws the abort reason if the signal is aborted.
 *
 * @param signal - The AbortSignal to check
 * @throws The signal's reason if aborted
 *
 * @example
 * ```typescript
 * await s.task(({ signal }) => {
 *   throwIfAborted(signal)  // Throws if scope was cancelled
 *
 *   // Continue with operation...
 *   return await fetchData()
 * })
 * ```
 */
export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw signal.reason;
	}
}

/**
 * Registers a callback to be invoked when the signal is aborted.
 * Returns a disposable that can be used to unregister the callback.
 *
 * The callback is automatically unregistered after it's invoked (once).
 *
 * @param signal - The AbortSignal to listen to
 * @param callback - Function to call when aborted
 * @returns A Disposable that can be used to unregister
 *
 * @example
 * ```typescript
 * await s.task(({ signal }) => {
 *   // Register cleanup
 *   const disposable = onAbort(signal, () => {
 *     console.log('Task was cancelled')
 *   })
 *
 *   try {
 *     return await longRunningOperation()
 *   } finally {
 *     // Unregister if not aborted (optional, auto-cleaned on abort)
 *     disposable[Symbol.dispose]()
 *   }
 * })
 * ```
 */
export function onAbort(
	signal: AbortSignal,
	callback: (reason: unknown) => void,
): Disposable {
	// If already aborted, call immediately
	if (signal.aborted) {
		if (debugCancel.enabled) {
			debugCancel("signal already aborted, calling callback immediately");
		}
		callback(signal.reason);
		return {
			[Symbol.dispose]: () => {},
		};
	}

	let disposed = false;

	const handler = () => {
		if (disposed) return;
		disposed = true;
		if (debugCancel.enabled) {
			debugCancel("abort callback invoked with reason:", signal.reason);
		}
		callback(signal.reason);
	};

	signal.addEventListener("abort", handler, { once: true });

	return {
		[Symbol.dispose]: () => {
			if (!disposed) {
				disposed = true;
				signal.removeEventListener("abort", handler);
				if (debugCancel.enabled) {
					debugCancel("abort callback unregistered");
				}
			}
		},
	};
}

/**
 * Creates a promise that rejects when the signal is aborted.
 * Useful for racing operations against cancellation.
 *
 * @param signal - The AbortSignal to watch
 * @returns A promise that rejects with the abort reason
 *
 * @example
 * ```typescript
 * await s.task(async ({ signal }) => {
 *   // Race between operation and cancellation
 *   const result = await Promise.race([
 *     fetchData(),
 *     abortPromise(signal).then(() => { throw new Error('Cancelled') })
 *   ])
 * })
 * ```
 */
export function abortPromise(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}

		signal.addEventListener(
			"abort",
			() => {
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

/**
 * Races multiple abort signals and returns a new signal that aborts
 * when any of the input signals abort.
 *
 * @param signals - Array of AbortSignals to race
 * @returns A new AbortSignal that aborts when any input aborts
 *
 * @example
 * ```typescript
 * const combined = raceSignals([scope.signal, timeoutSignal])
 *
 * await fetch(url, { signal: combined })
 * // Aborts if either scope is disposed OR timeout fires
 * ```
 */
export function raceSignals(signals: AbortSignal[]): AbortSignal {
	// Edge cases
	if (signals.length === 0) {
		return new AbortController().signal;
	}
	if (signals.length === 1) {
		return signals[0]!;
	}

	// Check if any are already aborted
	const alreadyAborted = signals.find((s) => s.aborted);
	if (alreadyAborted) {
		return alreadyAborted;
	}

	const controller = new AbortController();

	// Subscribe to all signals
	const handlers: { signal: AbortSignal; handler: () => void }[] = [];

	signals.forEach((signal) => {
		const handler = () => {
			if (debugCancel.enabled) {
				debugCancel("raced signal aborted, propagating reason:", signal.reason);
			}
			controller.abort(signal.reason);
			// Clean up other handlers
			handlers.forEach((h) => {
				if (h.handler !== handler) {
					h.signal.removeEventListener("abort", h.handler);
				}
			});
		};

		signal.addEventListener("abort", handler, { once: true });
		handlers.push({ signal, handler });
	});

	// Return signal that will abort when any input aborts
	return controller.signal;
}

/**
 * Waits for a signal to be aborted.
 * Returns immediately if already aborted.
 *
 * @param signal - The AbortSignal to wait for
 * @returns Promise that resolves when aborted
 *
 * @example
 * ```typescript
 * await s.task(async ({ signal }) => {
 *   // Wait for cancellation
 *   await whenAborted(signal)
 *   console.log('Scope was cancelled')
 * })
 * ```
 */
export function whenAborted(signal: AbortSignal): Promise<unknown> {
	if (signal.aborted) {
		return Promise.resolve(signal.reason);
	}

	return new Promise((resolve) => {
		signal.addEventListener(
			"abort",
			() => {
				resolve(signal.reason);
			},
			{ once: true },
		);
	});
}
