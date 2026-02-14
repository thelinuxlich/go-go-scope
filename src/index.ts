/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type {
	PollController,
	PollOptions,
	RaceOptions,
	Result,
	Tracer,
} from "./types.js";
import { SpanStatusCode } from "./types.js";

export { Channel } from "./channel.js";
// Re-export classes
export { CircuitBreaker } from "./circuit-breaker.js";
// Re-export rate limiting utilities
export { debounce, throttle } from "./rate-limiting.js";
// Re-export ScopeOptions from scope.ts
export type {
	ScopeOptions,
	ScopeOptions as ScopeOptionsType,
} from "./scope.js";
export { AsyncDisposableResource, Scope } from "./scope.js";
export { Semaphore } from "./semaphore.js";
export { Task } from "./task.js";
// Re-export all types from types.ts
export type {
	CircuitBreakerOptions,
	CircuitState,
	Context,
	DebounceOptions,
	Failure,
	PollController,
	PollOptions,
	RaceOptions,
	Result,
	ScopeHooks,
	ScopeMetrics,
	Span,
	SpanOptions,
	Success,
	TaskOptions,
	ThrottleOptions,
	Tracer,
} from "./types.js";

const debugScope = createDebug("go-go-scope:scope");

/**
 * Create a new Scope for structured concurrency.
 *
 * @param options - Optional configuration for the scope
 * @returns A new Scope instance
 *
 * @example
 * ```typescript
 * await using s = scope({ timeout: 5000 })
 * const t = s.spawn(() => fetchData())
 * const result = await t
 * ```
 *
 * @example With OpenTelemetry tracing
 * ```typescript
 * import { trace } from "@opentelemetry/api"
 *
 * await using s = scope({ tracer: trace.getTracer("my-app") })
 * const t = s.spawn(() => fetchData())  // Creates "scope.task" span
 * const result = await t
 * // Scope disposal creates "scope" span with task count
 * ```
 */
export function scope<
	TServices extends Record<string, unknown> = Record<string, unknown>,
>(options?: import("./scope.js").ScopeOptions<TServices>): Scope<TServices> {
	return new Scope(options) as Scope<TServices>;
}

/**
 * Race multiple tasks - the first to settle wins, others are cancelled.
 * Implements structured concurrency: all tasks run within a scope.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional race configuration
 * @returns A Promise that resolves to the value of the first settled task
 *
 * @example
 * ```typescript
 * const winner = await race([
 *   ({ signal }) => fetch('https://a.com', { signal }),
 *   ({ signal }) => fetch('https://b.com', { signal }),
 * ])
 * ```
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<Result<unknown, T>> {
	const totalTasks = factories.length;

	if (totalTasks === 0) {
		return [new Error("Cannot race empty array of factories"), undefined];
	}

	if (debugScope.enabled) {
		debugScope("[race] starting race with %d competitors", totalTasks);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugScope.enabled) {
			debugScope("[race] already aborted");
		}
		return [options.signal.reason, undefined];
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let settledCount = 0;
	let winnerIndex = -1;

	try {
		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			s.signal.addEventListener(
				"abort",
				() => {
					if (debugScope.enabled) {
						debugScope(
							"[race] aborted, %d/%d tasks settled",
							settledCount,
							totalTasks,
						);
					}
					resolve([s.signal.reason, undefined]);
				},
				{ once: true },
			);
		});

		const debugEnabled = debugScope.enabled;
		// Spawn all tasks with tracking
		const tasks = factories.map((factory, idx) =>
			s
				.task(async ({ signal }) => {
					const result = await factory(signal);
					settledCount++;
					if (winnerIndex === -1) {
						winnerIndex = idx;
						if (debugEnabled) {
							debugScope(
								"[race] winner! task %d/%d won the race",
								idx + 1,
								totalTasks,
							);
						}
					} else if (debugEnabled) {
						debugScope(
							"[race] task %d/%d settled (loser)",
							idx + 1,
							totalTasks,
						);
					}
					return result;
				})
				.then(([err, result]): Result<unknown, T> => {
					if (err) return [err, undefined];
					return [undefined, result as T];
				}),
		);

		// Race all tasks against abort
		const result = await Promise.race([...tasks, abortPromise]);
		if (debugEnabled) {
			debugScope(
				"[race] race complete, winner was task %d/%d",
				winnerIndex + 1,
				totalTasks,
			);
		}
		return result;
	} finally {
		// Clean up scope - cancels all tasks
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Run multiple tasks in parallel with optional concurrency limit.
 * All tasks run within a scope and are cancelled together on failure.
 * Returns an array of Result tuples - never throws by default.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit and failFast
 * @returns A Promise that resolves to an array of Result tuples (or throws if failFast is true)
 *
 * @example
 * ```typescript
 * const results = await parallel(
 *   urls.map(url => ({ signal }) => fetch(url, { signal })),
 *   { concurrency: 3 }
 * )
 * // results is [[undefined, Response], [Error, undefined], ...]
 * ```
 */
export async function parallel<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: {
		concurrency?: number;
		signal?: AbortSignal;
		failFast?: boolean;
		tracer?: Tracer;
	},
): Promise<Result<unknown, T>[]> {
	if (factories.length === 0) {
		if (debugScope.enabled) {
			debugScope("[parallel] no factories, returning empty array");
		}
		return [];
	}

	const concurrency = options?.concurrency ?? 0;
	const failFast = options?.failFast ?? false;
	const totalTasks = factories.length;
	const debugEnabled = debugScope.enabled;

	if (debugEnabled) {
		debugScope(
			"[parallel] starting parallel execution (tasks: %d, concurrency: %d, failFast: %s)",
			totalTasks,
			concurrency > 0 ? concurrency : "unlimited",
			failFast,
		);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugEnabled) {
			debugScope("[parallel] already aborted");
		}
		return factories.map(() => [options.signal?.reason, undefined]);
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let completedCount = 0;
	let errorCount = 0;

	try {
		// Helper to process a single task - always returns Result
		const processTask = async (
			factory: (signal: AbortSignal) => Promise<T>,
			_idx: number,
		): Promise<Result<unknown, T>> => {
			const result = await s.task(({ signal }) => factory(signal));
			if (result[0]) {
				errorCount++;
				if (debugEnabled) {
					debugScope(
						"[parallel] task %d/%d failed (failFast: %s)",
						errorCount,
						totalTasks,
						failFast,
					);
				}
			} else {
				completedCount++;
				if (debugEnabled) {
					debugScope(
						"[parallel] task %d/%d completed",
						completedCount,
						totalTasks,
					);
				}
			}
			return result;
		};

		// If no concurrency limit, run all in parallel
		if (concurrency <= 0 || concurrency >= factories.length) {
			if (debugEnabled) {
				debugScope("[parallel] running all tasks in parallel");
			}
			const results = await Promise.all(
				factories.map((f, i) => processTask(f, i)),
			);

			// Check for errors if failFast
			if (failFast) {
				const firstError = results.find((r) => r[0]);
				if (firstError?.[0]) {
					throw firstError[0];
				}
			}

			return results;
		}

		// Run with limited concurrency using a worker pool
		if (debugEnabled) {
			debugScope("[parallel] running with concurrency limit: %d", concurrency);
		}
		const results: Result<unknown, T>[] = new Array(factories.length);
		let index = 0;
		let hasError = false;

		const worker = async (workerId: number): Promise<void> => {
			if (debugEnabled) {
				debugScope("[parallel] worker %d started", workerId);
			}
			let tasksProcessed = 0;
			while (index < factories.length) {
				// Check if we should stop due to error in failFast mode
				if (failFast && hasError) {
					if (debugEnabled) {
						debugScope("[parallel] worker %d stopping due to error", workerId);
					}
					break;
				}

				const currentIndex = index++;
				const factory = factories[currentIndex];
				if (!factory) continue;

				if (debugEnabled) {
					debugScope(
						"[parallel] worker %d processing task %d",
						workerId,
						currentIndex,
					);
				}

				const result = await processTask(factory, currentIndex);
				results[currentIndex] = result;
				if (result[0]) {
					hasError = true;
					if (failFast) {
						if (debugEnabled) {
							debugScope(
								"[parallel] worker %d aborting due to error",
								workerId,
							);
						}
						break;
					}
				}
				tasksProcessed++;
			}
			if (debugEnabled) {
				debugScope(
					"[parallel] worker %d finished, processed %d tasks",
					workerId,
					tasksProcessed,
				);
			}
		};

		const workers: Promise<void>[] = [];
		const workerCount = Math.min(concurrency, factories.length);
		for (let i = 0; i < workerCount; i++) {
			workers.push(worker(i));
		}

		await Promise.all(workers);

		// Check for errors if failFast
		if (failFast && hasError) {
			const firstError = results.find((r) => r[0]);
			if (firstError?.[0]) {
				throw firstError[0];
			}
		}

		debugScope(
			"[parallel] all tasks completed: %d/%d, errors: %d",
			completedCount,
			totalTasks,
			errorCount,
		);
		return results;
	} finally {
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Wrap an AsyncIterable with structured concurrency.
 * Automatically stops iteration when the scope is aborted.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * for await (const chunk of s.stream(readableStream)) {
 *   await processChunk(chunk)
 *   // Automatically stops if scope is cancelled
 * }
 * ```
 */
export async function* stream<T>(
	source: AsyncIterable<T>,
	signal?: AbortSignal,
): AsyncGenerator<T> {
	const iterator = source[Symbol.asyncIterator]();

	try {
		while (true) {
			// Check for abort before each iteration
			if (signal?.aborted) {
				throw signal.reason;
			}

			const result = await iterator.next();

			if (signal?.aborted) {
				throw signal.reason;
			}

			if (result.done) break;
			yield result.value;
		}
	} finally {
		// Ensure cleanup
		await iterator.return?.();
	}
}

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
			"[poll] creating poll controller (interval: %dms, immediate: %s)",
			interval,
			immediate,
		);
	}

	// Check if already aborted
	if (options.signal?.aborted) {
		if (debugEnabled) {
			debugScope("[poll] already aborted, throwing");
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
			debugScope("[poll] executing poll #%d", pollCount);
		}

		try {
			const startTime = performance.now();
			const [err, value] = await s.task(({ signal }) => fn(signal));
			const duration = performance.now() - startTime;
			if (err) {
				if (debugEnabled) {
					debugScope(
						"[poll] poll #%d failed: %s",
						pollCount,
						err instanceof Error ? err.message : String(err),
					);
				}
				// Continue polling even on error
			} else {
				if (debugEnabled) {
					debugScope(
						"[poll] poll #%d succeeded in %dms",
						pollCount,
						Math.round(duration),
					);
				}
				await onValue(value as T);
			}
		} catch (error) {
			if (debugEnabled) {
				debugScope(
					"[poll] poll #%d failed: %s",
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
				debugScope("[poll] already running, ignoring start()");
			}
			return;
		}
		if (s.signal.aborted) {
			if (debugEnabled) {
				debugScope("[poll] cannot start, already aborted");
			}
			return;
		}
		running = true;
		if (debugEnabled) {
			debugScope("[poll] starting poll");
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
				debugScope("[poll] not running, ignoring stop()");
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
			debugScope("[poll] stopped poll, total executions: %d", pollCount);
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
				debugScope("[poll] abort signal received, stopping");
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

// Export SpanStatusCode enum
export { SpanStatusCode };
