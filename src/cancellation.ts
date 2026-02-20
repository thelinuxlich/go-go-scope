/**
 * Cancellation utilities for AbortSignal
 *
 * Lightweight helpers for working with AbortSignal without
 * introducing new classes or concepts.
 */

import createDebug from "debug";

const debugCancel = createDebug("go-go-scope:cancellation");

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
