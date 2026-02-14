/**
 * Polling function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { PollController, PollOptions } from "./types.js";

const debugScope = createDebug("go-go-scope:poll");

/**
 * Poll a function at regular intervals with structured concurrency.
 * Automatically stops when the scope is disposed.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const controller = s.poll(async ({ signal }) => {
 *   const config = await fetchConfig({ signal })
 *   updateConfig(config)
 * }, { interval: 30000 })
 *
 * // Polls every 30 seconds until scope exits
 *
 * // Check status
 * console.log(controller.status())
 *
 * // Stop polling
 * controller.stop()
 *
 * // Restart polling
 * controller.start()
 * ```
 */
function createPoll<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	onValue: (value: T) => void | Promise<void>,
	options: PollOptions = {},
): PollController {
	const interval = options.interval ?? 5000;
	const immediate = options.immediate ?? true;
	const debugEnabled = debugScope.enabled;

	if (debugEnabled) {
		debugScope(
			"creating poll controller (interval: %dms, immediate: %s)",
			interval,
			immediate,
		);
	}

	// Check if already aborted
	if (options.signal?.aborted) {
		if (debugEnabled) {
			debugScope("already aborted, throwing");
		}
		throw options.signal.reason;
	}

	let pollCount = 0;
	let lastPollTime: number | undefined;
	let nextPollTime: number | undefined;
	let running = false;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const s = new Scope({ signal: options.signal });

	const executePoll = async () => {
		if (!running || s.signal.aborted) return;

		pollCount++;
		lastPollTime = performance.now();
		nextPollTime = lastPollTime + interval;
		if (debugEnabled) {
			debugScope("executing poll #%d", pollCount);
		}

		try {
			const startTime = performance.now();
			const [err, value] = await s.task(({ signal }) => fn(signal));
			const duration = performance.now() - startTime;
			if (err) {
				if (debugEnabled) {
					debugScope(
						"poll #%d failed: %s",
						pollCount,
						err instanceof Error ? err.message : String(err),
					);
				}
				// Continue polling even on error
			} else {
				if (debugEnabled) {
					debugScope(
						"poll #%d succeeded in %dms",
						pollCount,
						Math.round(duration),
					);
				}
				await onValue(value as T);
			}
		} catch (error) {
			if (debugEnabled) {
				debugScope(
					"poll #%d failed: %s",
					pollCount,
					error instanceof Error ? error.message : String(error),
				);
			}
			// Continue polling even on error
		}

		// Schedule next poll if still running
		if (running && !s.signal.aborted) {
			timeoutId = setTimeout(executePoll, interval);
		}
	};

	const start = () => {
		if (running) {
			if (debugEnabled) {
				debugScope("already running, ignoring start()");
			}
			return;
		}
		if (s.signal.aborted) {
			if (debugEnabled) {
				debugScope("cannot start, already aborted");
			}
			return;
		}
		running = true;
		if (debugEnabled) {
			debugScope("starting poll");
		}

		if (immediate) {
			// Execute immediately
			void executePoll();
		} else {
			// Schedule first execution
			nextPollTime = performance.now() + interval;
			timeoutId = setTimeout(executePoll, interval);
		}
	};

	const stop = () => {
		if (!running) {
			if (debugEnabled) {
				debugScope("not running, ignoring stop()");
			}
			return;
		}
		running = false;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		nextPollTime = undefined;
		if (debugEnabled) {
			debugScope("stopped poll, total executions: %d", pollCount);
		}
	};

	const status = () => {
		const now = performance.now();
		let timeUntilNext = 0;

		if (running && nextPollTime) {
			timeUntilNext = Math.max(0, nextPollTime - now);
		} else if (running && !immediate && pollCount === 0) {
			// Hasn't started yet and not immediate
			timeUntilNext = interval;
		}

		return {
			running,
			pollCount,
			timeUntilNext,
			lastPollTime,
			nextPollTime,
		};
	};

	// Clean up when signal is aborted
	options.signal?.addEventListener(
		"abort",
		() => {
			if (debugEnabled) {
				debugScope("abort signal received, stopping");
			}
			stop();
			s[Symbol.asyncDispose]().catch(() => {});
		},
		{ once: true },
	);

	// Auto-start if immediate
	if (immediate) {
		start();
	}

	return {
		start,
		stop,
		status,
	};
}

/**
 * Poll a function at regular intervals with structured concurrency.
 * Automatically starts polling and returns a controller.
 *
 * @deprecated Use `createPoll()` or `scope().poll()` for better control
 */
export function poll<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	onValue: (value: T) => void | Promise<void>,
	options: PollOptions = {},
): PollController {
	const controller = createPoll(fn, onValue, options);
	// Auto-start if immediate (createPoll already handles this)
	// If not immediate, user needs to call start()
	return controller;
}
