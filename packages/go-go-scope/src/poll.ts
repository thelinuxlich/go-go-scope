/**
 * Polling function for go-go-scope
 *
 * Provides utilities for polling functions at regular intervals with
 * structured concurrency guarantees. Polling automatically stops when
 * the scope is disposed or the controller is stopped.
 */

import createDebug from "debug";
import type { PollController, PollOptions } from "./types.js";

const debugScope = createDebug("go-go-scope:poll");

/**
 * Creates a poll controller for executing a function at regular intervals.
 *
 * This is the internal implementation. Use `poll()` for the public API.
 *
 * @internal
 * @typeParam T - The type of value returned by the polled function
 * @param fn - The async function to poll. Receives AbortSignal for cancellation.
 * @param onValue - Callback invoked with each successful poll result
 * @param options - Polling configuration options
 * @param options.interval - Interval in milliseconds between polls (default: 5000)
 * @param options.signal - Optional AbortSignal to cancel polling
 * @param options.immediate - Run immediately on start, or wait for first interval (default: true)
 * @returns A PollController for managing the polling lifecycle
 * @throws Will throw if the initial signal is already aborted
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
	let aborted = false;
	const abortController = new AbortController();

	// Link to parent signal if provided
	if (options.signal) {
		options.signal.addEventListener(
			"abort",
			() => {
				abortController.abort(options.signal?.reason);
			},
			{ once: true },
		);
	}

	/**
	 * Executes a single poll iteration.
	 * Handles timing, error catching, and next poll scheduling.
	 */
	const executePoll = async () => {
		if (!running || aborted || abortController.signal.aborted) return;

		pollCount++;
		lastPollTime = performance.now();
		nextPollTime = lastPollTime + interval;
		if (debugEnabled) {
			debugScope("executing poll #%d", pollCount);
		}

		try {
			const startTime = performance.now();
			const value = await fn(abortController.signal);
			const duration = performance.now() - startTime;
			if (debugEnabled) {
				debugScope(
					"poll #%d succeeded in %dms",
					pollCount,
					Math.round(duration),
				);
			}
			await onValue(value);
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
		if (running && !aborted && !abortController.signal.aborted) {
			timeoutId = setTimeout(executePoll, interval);
		}
	};

	/**
	 * Starts or resumes polling.
	 *
	 * If immediate is true (default), executes the first poll immediately.
	 * Otherwise, schedules the first poll after the interval.
	 */
	const start = () => {
		if (running) {
			if (debugEnabled) {
				debugScope("already running, ignoring start()");
			}
			return;
		}
		if (aborted || abortController.signal.aborted) {
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

	/**
	 * Stops polling.
	 *
	 * Clears any pending poll and marks the controller as stopped.
	 * Can be restarted with start().
	 */
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

	/**
	 * Gets the current polling status.
	 *
	 * @returns Object containing running state, poll count, and timing information
	 */
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
			aborted = true;
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
		[Symbol.dispose]: () => {
			stop();
		},
	};
}

/**
 * Polls a function at regular intervals with structured concurrency.
 *
 * Automatically starts polling and returns a controller for managing the
 * polling lifecycle. Polling automatically stops when:
 * - The parent scope is disposed
 * - The abort signal is triggered
 * - The `stop()` method is called
 * - The controller is disposed via `Symbol.dispose`
 *
 * Features:
 * - Configurable polling interval
 * - Immediate or delayed first execution
 * - Automatic error handling (continues polling on errors)
 * - Status tracking (poll count, timing)
 * - Start/stop control
 * - Automatic cleanup on scope disposal
 *
 * @typeParam T - The type of value returned by the polled function
 * @param fn - The async function to poll. Receives AbortSignal for cancellation.
 * @param onValue - Callback invoked with each successful poll result.
 *   Can be async. Errors in this callback don't stop polling.
 * @param options - Polling configuration options
 * @param options.interval - Interval in milliseconds between polls (default: 5000)
 * @param options.signal - Optional AbortSignal to cancel polling
 * @param options.immediate - Run immediately on start, or wait for first interval (default: true)
 * @returns A PollController for starting, stopping, and monitoring the poll
 * @throws If the provided signal is already aborted
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope';
 * import { poll } from 'go-go-scope/poll';
 *
 * await using s = scope();
 *
 * // Poll for configuration updates every 30 seconds
 * const controller = poll(
 *   async ({ signal }) => {
 *     const response = await fetch('/api/config', { signal });
 *     return response.json();
 *   },
 *   (config) => {
 *     console.log('Config updated:', config);
 *     updateApplicationConfig(config);
 *   },
 *   { interval: 30000 }
 * );
 *
 * // Polling starts immediately (default)
 * // Scope disposal automatically stops polling
 * ```
 *
 * @example
 * ```typescript
 * // Poll with delayed start
 * await using s = scope();
 *
 * const controller = poll(
 *   ({ signal }) => fetchMetrics({ signal }),
 *   (metrics) => updateDashboard(metrics),
 *   {
 *     interval: 10000,   // 10 second interval
 *     immediate: false   // Don't poll immediately, wait for first interval
 *   }
 * );
 *
 * // Manually start when ready
 * controller.start();
 *
 * // Stop when not needed
 * setTimeout(() => controller.stop(), 60000);
 * ```
 *
 * @example
 * ```typescript
 * // Poll with status monitoring
 * await using s = scope();
 *
 * const controller = poll(
 *   ({ signal }) => checkJobStatus(jobId, { signal }),
 *   (status) => {
 *     if (status === 'complete') {
 *       console.log('Job done!');
 *       controller.stop();
 *     }
 *   },
 *   { interval: 5000 }
 * );
 *
 * // Check status periodically
 * setInterval(() => {
 *   const status = controller.status();
 *   console.log(`Polled ${status.pollCount} times, next in ${status.timeUntilNext}ms`);
 * }, 1000);
 * ```
 *
 * @example
 * ```typescript
 * // Poll with manual disposal
 * await using s = scope();
 *
 * {
 *   using controller = poll(
 *     ({ signal }) => fetchNotifications({ signal }),
 *     (notifications) => displayNotifications(notifications),
 *     { interval: 60000 }
 *   );
 *
 *   // Polling runs while in scope
 *   await delay(300000); // 5 minutes
 *
 * } // Controller automatically disposed, polling stops
 * ```
 *
 * @example
 * ```typescript
 * // Poll with cancellation
 * const controller = new AbortController();
 *
 * const pollController = poll(
 *   ({ signal }) => fetchData({ signal }),
 *   (data) => processData(data),
 *   {
 *     interval: 5000,
 *     signal: controller.signal
 *   }
 * );
 *
 * // Cancel polling externally
 * setTimeout(() => controller.abort('User cancelled'), 30000);
 * ```
 *
 * @example
 * ```typescript
 * // Poll with error resilience
 * await using s = scope();
 *
 * poll(
 *   async ({ signal }) => {
 *     // This might fail occasionally
 *     return await fetchUnreliableEndpoint({ signal });
 *   },
 *   (data) => {
 *     console.log('Got data:', data);
 *   },
 *   { interval: 10000 }
 * );
 *
 * // Even if fetch fails, polling continues
 * // Errors are logged but don't stop the poll
 * ```
 *
 * @example
 * ```typescript
 * // Multiple polls in one scope
 * await using s = scope();
 *
 * // Poll different data sources
 * const metricsPoll = s.poll(
 *   ({ signal }) => fetchMetrics({ signal }),
 *   (m) => updateMetrics(m),
 *   { interval: 5000 }
 * );
 *
 * const logsPoll = s.poll(
 *   ({ signal }) => fetchLogs({ signal }),
 *   (l) => updateLogs(l),
 *   { interval: 10000 }
 * );
 *
 * const healthPoll = s.poll(
 *   ({ signal }) => checkHealth({ signal }),
 *   (h) => updateHealth(h),
 *   { interval: 30000 }
 * );
 *
 * // All polls stop when scope is disposed
 * ```
 *
 * @see {@link PollController} - For the controller interface
 * @see {@link PollOptions} - For available options
 * @see {@link Scope#poll} - For scoped polling
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
