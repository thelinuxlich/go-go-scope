/**
 * Race function for go-go-scope
 *
 * Provides utilities for racing multiple tasks against each other with
 * structured concurrency guarantees. The first task to settle wins, and
 * all other tasks are automatically cancelled.
 */

import createDebug from "debug";

import { Scope } from "./scope.js";
import type { RaceOptions, Result } from "./types.js";
import { WorkerPool } from "./worker-pool.js";

const debugScope = createDebug("go-go-scope:race");

// Type for task result with index
type TaskResult<T> = { idx: number; result: Result<unknown, T> };

// Type guard to check if value is a Result tuple
type ResultTuple<E, T> = readonly [E, undefined] | readonly [undefined, T];
function isResultTuple<T>(value: unknown): value is ResultTuple<unknown, T> {
	return Array.isArray(value) && value.length === 2;
}

// Helper to create aggregate error
function createAggregateError(errors: unknown[]): Error {
	// Use AggregateError if available, otherwise create a regular Error
	if (typeof AggregateError !== "undefined") {
		return new AggregateError(errors, "All race competitors failed");
	}
	const message = `All race competitors failed (${errors.length} errors)`;
	return new Error(message);
}

/**
 * Races multiple tasks - the first to settle wins, others are cancelled.
 *
 * Implements structured concurrency: all tasks run within a scope and are
 * automatically cancelled when a winner is determined. This prevents resource
 * leaks from abandoned tasks.
 *
 * Features:
 * - First settled task wins (success or error by default)
 * - Optional `requireSuccess` to wait for first successful result
 * - Timeout support with automatic cancellation
 * - Concurrency limiting for controlled execution
 * - Staggered start (hedging pattern) for latency-sensitive operations
 * - Worker thread support for CPU-intensive tasks
 * - Structured concurrency - losers are cancelled
 *
 * @typeParam T - The type of value returned by the task factories
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional race configuration
 * @param options.signal - AbortSignal to cancel the race
 * @param options.requireSuccess - If true, only successful results count. Errors continue racing (default: false)
 * @param options.timeout - Timeout in milliseconds. If no task wins within this time, the race fails
 * @param options.concurrency - Maximum concurrent tasks. When limit reached, new tasks start as others fail
 * @param options.workers - Worker thread configuration for CPU-intensive tasks
 * @param options.workers.threads - Number of worker threads (default: CPU count - 1)
 * @param options.workers.idleTimeout - Idle timeout in ms before workers terminate (default: 60000)
 * @param options.staggerDelay - Delay in ms between starting each task (hedging pattern)
 * @param options.staggerMaxConcurrent - Maximum concurrent tasks when using staggered start
 * @returns A Promise that resolves to a Result tuple of the winning task
 *
 * @example
 * ```typescript
 * import { race } from 'go-go-scope';
 *
 * // Basic race - first to settle wins
 * const [err, winner] = await race([
 *   ({ signal }) => fetch('https://api-primary.com/data', { signal }),
 *   ({ signal }) => fetch('https://api-backup.com/data', { signal }),
 * ]);
 *
 * if (!err) {
 *   console.log('Winner:', winner);
 * }
 * // Losing fetch is automatically cancelled
 * ```
 *
 * @example
 * ```typescript
 * // Race for first success only
 * const [err, winner] = await race([
 *   ({ signal }) => fetchWithRetry('https://a.com', { signal }),
 *   ({ signal }) => fetchWithRetry('https://b.com', { signal }),
 * ], { requireSuccess: true });
 *
 * // If first task errors, race continues until one succeeds
 * // If all fail, returns aggregate error
 * ```
 *
 * @example
 * ```typescript
 * // Race with timeout
 * const [err, winner] = await race([
 *   ({ signal }) => fetch('https://slow.com', { signal }),
 *   ({ signal }) => fetch('https://fast.com', { signal }),
 * ], { timeout: 5000 });
 *
 * if (err) {
 *   console.log('No winner within 5 seconds');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Hedging pattern - staggered start
 * // Start first task, wait 50ms, start second if still running
 * const [err, winner] = await race([
 *   ({ signal }) => fetchFromPrimary({ signal }),
 *   ({ signal }) => fetchFromBackup({ signal }),
 *   ({ signal }) => fetchFromFallback({ signal }),
 * ], {
 *   staggerDelay: 50,           // 50ms between starts
 *   staggerMaxConcurrent: 2     // Max 2 tasks running concurrently
 * });
 *
 * // Reduces load on backup servers while maintaining low latency
 * ```
 *
 * @example
 * ```typescript
 * // Race with limited concurrency
 * const [err, winner] = await race([
 *   () => searchEngineA(query),
 *   () => searchEngineB(query),
 *   () => searchEngineC(query),
 *   () => searchEngineD(query),
 *   () => searchEngineE(query),
 * ], { concurrency: 2 });
 *
 * // Only 2 engines queried at a time
 * // If first fails and requireSuccess is true, next starts
 * ```
 *
 * @example
 * ```typescript
 * // Race with worker threads for CPU-intensive tasks
 * const [err, hash] = await race([
 *   () => computeHashVariantA(data),
 *   () => computeHashVariantB(data),
 *   () => computeHashVariantC(data),
 * ], {
 *   workers: { threads: 3 },
 *   requireSuccess: true
 * });
 *
 * // Fastest algorithm wins, others cancelled
 * ```
 *
 * @example
 * ```typescript
 * // Race with cancellation
 * const controller = new AbortController();
 *
 * const racePromise = race([
 *   ({ signal }) => longRunningTask1({ signal }),
 *   ({ signal }) => longRunningTask2({ signal }),
 * ], { signal: controller.signal });

 * // Cancel the race externally
 * setTimeout(() => controller.abort('User cancelled'), 1000);
 *
 * const [err, winner] = await racePromise;
 * if (err) {
 *   console.log('Race was cancelled');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Database query with multiple strategies
 * const [err, result] = await race([
 *   // Try cache first (usually fast)
 *   () => cache.get(key),
 *
 *   // If cache miss, query primary DB
 *   () => primaryDB.query(sql),
 *
 *   // Fallback to replica if primary slow
 *   () => replicaDB.query(sql),
 * ], {
 *   requireSuccess: true,
 *   staggerDelay: 10  // Small delay between strategies
 * });
 * ```
 *
 * @see {@link parallel} - For running all tasks in parallel
 * @see {@link Scope#race} - For scoped race execution
 * @see {@link RaceOptions} - For all available options
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<Result<unknown, T>> {
	const totalTasks = factories.length;
	const requireSuccess = options?.requireSuccess ?? false;
	const timeout = options?.timeout;
	const concurrency = options?.concurrency ?? 0;
	const staggerDelay = options?.staggerDelay ?? 0;
	const staggerMaxConcurrent = options?.staggerMaxConcurrent ?? 0;

	if (totalTasks === 0) {
		return [new Error("Cannot race empty array of factories"), undefined];
	}

	if (debugScope.enabled) {
		debugScope(
			"starting race with %d competitors (requireSuccess: %s, timeout: %s, concurrency: %s, stagger: %s)",
			totalTasks,
			requireSuccess,
			timeout ?? "none",
			concurrency > 0 ? concurrency : "unlimited",
			staggerDelay > 0 ? `${staggerDelay}ms` : "none",
		);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugScope.enabled) {
			debugScope("already aborted");
		}
		return [options.signal.reason, undefined];
	}

	// Use worker threads if requested
	if (options?.workers && options.workers.threads > 0) {
		if (debugScope.enabled) {
			debugScope("using worker threads: %d", options.workers.threads);
		}
		return raceWithWorkers(factories, {
			workers: options.workers.threads,
			workerIdleTimeout: options.workers.idleTimeout,
			requireSuccess,
			timeout,
			concurrency,
			signal: options.signal,
		});
	}

	const s = new Scope({ signal: options?.signal });
	let settledCount = 0;
	let _successCount = 0;
	let winnerIndex = -1;
	const errors: { index: number; error: unknown }[] = [];

	try {
		// Create combined signal with optional timeout
		const signals: AbortSignal[] = [s.signal];
		if (timeout) {
			signals.push(AbortSignal.timeout(timeout));
		}
		const combinedSignal = AbortSignal.any(signals);

		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			// Use combined signal for abort detection
			if (combinedSignal.aborted) {
				resolve([combinedSignal.reason, undefined]);
				return;
			}
			combinedSignal.addEventListener(
				"abort",
				() => {
					if (debugScope.enabled) {
						debugScope(
							"aborted, %d/%d tasks settled",
							settledCount,
							totalTasks,
						);
					}
					resolve([combinedSignal.reason, undefined]);
				},
				{ once: true },
			);
		});

		const debugEnabled = debugScope.enabled;

		// Helper to process a single task
		const processTask = async (
			factory: (signal: AbortSignal) => Promise<T>,
			idx: number,
		): Promise<TaskResult<T>> => {
			const result = await s.task(async () => {
				// Use combined signal (includes timeout if specified)
				const r = await factory(combinedSignal);
				settledCount++;
				return r;
			});
			const [err, value] = result;

			if (err) {
				errors.push({ index: idx, error: err });
				if (debugEnabled) {
					debugScope("task %d/%d failed", idx + 1, totalTasks);
				}
				return { idx, result: [err, undefined] };
			}

			// Success case
			_successCount++;
			if (winnerIndex === -1) {
				winnerIndex = idx;
				if (debugEnabled) {
					debugScope("winner! task %d/%d won the race", idx + 1, totalTasks);
				}
			} else if (debugEnabled) {
				debugScope("task %d/%d settled (loser)", idx + 1, totalTasks);
			}

			return { idx, result: [undefined, value as T] };
		};

		// Handle staggered start (hedging pattern)
		if (staggerDelay > 0) {
			if (debugEnabled) {
				debugScope(
					"using staggered start with %dms delay (maxConcurrent: %s)",
					staggerDelay,
					staggerMaxConcurrent > 0 ? staggerMaxConcurrent : "unlimited",
				);
			}

			const runningTasks: Promise<TaskResult<T>>[] = [];
			const taskIdxMap = new Map<Promise<TaskResult<T>>, number>();
			let currentIndex = 0;
			let staggerTimer: ReturnType<typeof setTimeout> | null = null;

			// Helper to start next task with stagger
			const startNextTask = (): void => {
				if (currentIndex >= totalTasks) return;
				if (
					staggerMaxConcurrent > 0 &&
					runningTasks.length >= staggerMaxConcurrent
				) {
					return;
				}

				const factory = factories[currentIndex];
				if (!factory) return;

				const task = processTask(factory, currentIndex);
				runningTasks.push(task);
				taskIdxMap.set(task, currentIndex);
				currentIndex++;

				if (debugEnabled) {
					debugScope("started task %d/%d (stagger)", currentIndex, totalTasks);
				}

				// Schedule next task if more remain
				if (currentIndex < totalTasks) {
					staggerTimer = setTimeout(startNextTask, staggerDelay);
				}
			};

			// Start first task immediately
			startNextTask();

			try {
				// Keep racing until we have a winner
				while (runningTasks.length > 0) {
					const competitors: Promise<TaskResult<T> | Result<unknown, T>>[] = [
						...runningTasks,
						abortPromise,
					];

					const winner = await Promise.race(competitors);

					// If it's a direct Result (from abort/timeout), return it
					if (isResultTuple<T>(winner)) {
						if (staggerTimer) clearTimeout(staggerTimer);
						return winner;
					}

					// Find and remove the finished task
					const finishedTaskIdx = runningTasks.findIndex(
						(t) => taskIdxMap.get(t) === winner.idx,
					);
					if (finishedTaskIdx >= 0) {
						const finishedTask = runningTasks[finishedTaskIdx];
						if (finishedTask) {
							runningTasks.splice(finishedTaskIdx, 1);
							taskIdxMap.delete(finishedTask);
						}
					}

					// Check if this is a valid winner
					if (!requireSuccess || !winner.result[0]) {
						if (debugEnabled) {
							debugScope(
								"winner! task %d/%d won the race (stagger)",
								winner.idx + 1,
								totalTasks,
							);
						}
						if (staggerTimer) clearTimeout(staggerTimer);
						return winner.result;
					}

					// Winner was an error and requireSuccess is true - need to continue
					if (debugEnabled) {
						debugScope(
							"task %d/%d failed (requireSuccess), continuing (stagger)...",
							winner.idx + 1,
							totalTasks,
						);
					}

					// Start next task if we're below max concurrent
					if (
						currentIndex < totalTasks &&
						(staggerMaxConcurrent <= 0 ||
							runningTasks.length < staggerMaxConcurrent)
					) {
						// Clear existing timer and start immediately
						if (staggerTimer) clearTimeout(staggerTimer);
						startNextTask();
					} else if (runningTasks.length === 0) {
						// No more tasks to start and none running - all failed
						if (staggerTimer) clearTimeout(staggerTimer);
						return [
							createAggregateError(errors.map((e) => e.error)),
							undefined,
						];
					}
				}

				// Should not reach here
				if (staggerTimer) clearTimeout(staggerTimer);
				return [createAggregateError(errors.map((e) => e.error)), undefined];
			} finally {
				if (staggerTimer) clearTimeout(staggerTimer);
			}
		}

		// If no concurrency limit, run all tasks at once
		if (concurrency <= 0 || concurrency >= totalTasks) {
			// Spawn all tasks with tracking
			const tasks = factories.map((factory, idx) => processTask(factory, idx));

			// Race all tasks with abort/timeout detection
			const racePromise = Promise.race([...tasks, abortPromise]);

			const winner = await racePromise;

			if (debugEnabled) {
				if (isResultTuple<T>(winner)) {
					debugScope("ended with error: %s", winner[0]);
				} else {
					debugScope(
						"race complete, winner was task %d/%d",
						winner.idx + 1,
						totalTasks,
					);
				}
			}

			// If it's a direct Result (from abort/timeout), return it
			if (isResultTuple<T>(winner)) {
				return winner;
			}

			// If requireSuccess and the winner is an error, we need to keep racing
			if (requireSuccess && winner.result[0]) {
				if (debugEnabled) {
					debugScope("first finisher failed, waiting for success...");
				}

				// Wait for remaining tasks
				const remainingResults = await Promise.all(tasks);

				// Find first success
				const firstSuccess = remainingResults.find((r) => !r.result[0]);
				if (firstSuccess) {
					return firstSuccess.result;
				}

				// All failed
				if (errors.length === totalTasks) {
					return [createAggregateError(errors.map((e) => e.error)), undefined];
				}

				return winner.result;
			}

			return winner.result;
		}

		// With concurrency limit - run tasks in batches
		if (debugEnabled) {
			debugScope("running with concurrency limit: %d", concurrency);
		}

		let currentIndex = 0;
		const runningTasks: Promise<TaskResult<T>>[] = [];
		const taskIdxMap = new Map<Promise<TaskResult<T>>, number>();

		// Start initial batch
		const initialBatch = Math.min(concurrency, totalTasks);
		for (let i = 0; i < initialBatch; i++) {
			const factory = factories[currentIndex];
			if (!factory) break;
			const task = processTask(factory, currentIndex);
			runningTasks.push(task);
			taskIdxMap.set(task, currentIndex);
			currentIndex++;
		}

		// Keep racing until we have a winner
		while (runningTasks.length > 0) {
			// Build race competitors for this iteration
			// combinedSignal (via abortPromise) handles both parent abort and timeout
			const competitors: Promise<TaskResult<T> | Result<unknown, T>>[] = [
				...runningTasks,
				abortPromise,
			];

			// Race current batch
			const winner = await Promise.race(competitors);

			// If it's a direct Result (from abort/timeout), return it
			if (isResultTuple<T>(winner)) {
				return winner;
			}

			// Find and remove the finished task
			const finishedTaskIdx = runningTasks.findIndex(
				(t) => taskIdxMap.get(t) === winner.idx,
			);
			if (finishedTaskIdx >= 0) {
				const finishedTask = runningTasks[finishedTaskIdx];
				if (finishedTask) {
					runningTasks.splice(finishedTaskIdx, 1);
					taskIdxMap.delete(finishedTask);
				}
			}

			// Check if this is a valid winner
			if (!requireSuccess || !winner.result[0]) {
				if (debugEnabled) {
					debugScope(
						"winner! task %d/%d won the race",
						winner.idx + 1,
						totalTasks,
					);
				}
				return winner.result;
			}

			// Winner was an error and requireSuccess is true - need to continue
			if (debugEnabled) {
				debugScope(
					"task %d/%d failed (requireSuccess), starting next...",
					winner.idx + 1,
					totalTasks,
				);
			}

			// Start next task if available
			if (currentIndex < totalTasks) {
				const factory = factories[currentIndex];
				if (factory) {
					const nextTask = processTask(factory, currentIndex);
					runningTasks.push(nextTask);
					taskIdxMap.set(nextTask, currentIndex);
					currentIndex++;
				}
			} else if (runningTasks.length === 0) {
				// No more tasks to start and none running - all failed
				if (debugEnabled) {
					debugScope("all tasks failed");
				}
				return [createAggregateError(errors.map((e) => e.error)), undefined];
			}
		}

		// Should not reach here, but just in case
		return [createAggregateError(errors.map((e) => e.error)), undefined];
	} finally {
		// Clean up scope - cancels all tasks
		await (s as unknown as AsyncDisposable)[Symbol.asyncDispose]();
	}
}

/**
 * Races multiple tasks using worker threads.
 *
 * This is for CPU-intensive synchronous functions that need to run in parallel
 * without blocking the main thread. Factory functions are serialized and
 * executed in worker threads.
 *
 * @internal
 * @typeParam T - The type of value returned by the task factories
 * @param factories - Array of factory functions
 * @param options - Worker thread configuration
 * @param options.workers - Number of worker threads
 * @param options.workerIdleTimeout - Timeout in ms before idle workers are terminated
 * @param options.requireSuccess - If true, only successful results count
 * @param options.timeout - Timeout in milliseconds for the race
 * @param options.concurrency - Maximum concurrent tasks
 * @param options.signal - AbortSignal to cancel the race
 * @returns Promise resolving to Result of the winning task
 */
async function raceWithWorkers<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options: {
		workers: number;
		workerIdleTimeout?: number;
		requireSuccess: boolean;
		timeout?: number;
		concurrency: number;
		signal?: AbortSignal;
	},
): Promise<Result<unknown, T>> {
	const {
		workers,
		workerIdleTimeout,
		requireSuccess,
		timeout,
		concurrency,
		signal,
	} = options;
	const totalTasks = factories.length;

	// Create worker pool
	const pool = new WorkerPool({
		size: workers,
		idleTimeout: workerIdleTimeout,
	});

	// Set up cancellation handling
	let abortHandler: (() => void) | undefined;
	if (signal) {
		abortHandler = () => {
			void pool[Symbol.asyncDispose]();
		};
		signal.addEventListener("abort", abortHandler, { once: true });
	}

	// Set up timeout if specified
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		const debugEnabled = debugScope.enabled;

		// Create timeout promise if needed - resolves with error Result on timeout
		const timeoutPromise = timeout
			? new Promise<{ idx: number; result: Result<unknown, T> }>((resolve) => {
					timeoutId = setTimeout(() => {
						resolve({
							idx: -1,
							result: [new Error("Race timeout"), undefined],
						});
					}, timeout);
				})
			: undefined;

		// Helper to execute a factory in a worker
		const executeInWorker = async (
			factory: (signal: AbortSignal) => Promise<T>,
			idx: number,
		): Promise<{ idx: number; result: Result<unknown, T> }> => {
			const factoryFn = factory.toString();

			try {
				const result = await pool.execute<string, T>((fnString) => {
					// biome-ignore lint/security/noGlobalEval: Required for worker threads
					const fn = eval(`(${fnString})`);
					return fn({ aborted: false });
				}, factoryFn);

				if (debugEnabled) {
					debugScope("worker task %d/%d completed", idx + 1, totalTasks);
				}

				return { idx, result: [undefined, result] };
			} catch (error) {
				if (debugEnabled) {
					debugScope("worker task %d/%d failed", idx + 1, totalTasks);
				}
				return {
					idx,
					result: [
						error instanceof Error ? error : new Error(String(error)),
						undefined,
					],
				};
			}
		};

		// If no concurrency limit, run all tasks at once
		if (concurrency <= 0 || concurrency >= totalTasks) {
			const promises = factories.map((factory, idx) =>
				executeInWorker(factory, idx),
			);

			// Race all tasks with optional timeout
			const racePromise = timeoutPromise
				? Promise.race([Promise.all(promises), timeoutPromise])
				: Promise.race(promises);

			const winner = await racePromise;

			// Clear timeout if set
			if (timeoutId) clearTimeout(timeoutId);

			// Handle array result from Promise.all (timeout case)
			if (Array.isArray(winner)) {
				// Timeout occurred, all tasks completed but we need to check for success
				if (requireSuccess) {
					const firstSuccess = winner.find((w) => !w.result[0]);
					if (firstSuccess) return firstSuccess.result;
					return [new Error("All tasks failed"), undefined];
				}
				return winner[0]?.result ?? [new Error("Race failed"), undefined];
			}

			// If requireSuccess and winner is an error, find first success
			if (requireSuccess && winner.result[0]) {
				const allResults = await Promise.all(promises);
				const firstSuccess = allResults.find((r) => !r.result[0]);
				if (firstSuccess) return firstSuccess.result;
				return [
					createAggregateError(
						allResults.map((r) => r.result[0]).filter(Boolean),
					),
					undefined,
				];
			}

			return winner.result;
		}

		// With concurrency limit - run tasks in batches
		if (debugEnabled) {
			debugScope(
				"running race with workers and concurrency limit: %d",
				concurrency,
			);
		}

		let currentIndex = 0;
		const runningTasks: Promise<{ idx: number; result: Result<unknown, T> }>[] =
			[];
		const taskIdxMap = new Map<
			Promise<{ idx: number; result: Result<unknown, T> }>,
			number
		>();

		// Start initial batch
		const initialBatch = Math.min(concurrency, totalTasks);
		for (let i = 0; i < initialBatch; i++) {
			const factory = factories[currentIndex];
			if (!factory) break;
			const task = executeInWorker(factory, currentIndex);
			runningTasks.push(task);
			taskIdxMap.set(task, currentIndex);
			currentIndex++;
		}

		// Keep racing until we have a winner
		while (runningTasks.length > 0) {
			const competitors: Promise<
				{ idx: number; result: Result<unknown, T> } | Result<unknown, T>
			>[] = [...runningTasks];
			if (timeoutPromise) competitors.push(timeoutPromise);

			const winner = await Promise.race(competitors);

			// Check if it's a timeout result
			if (isResultTuple<T>(winner)) {
				return winner;
			}

			// Find and remove the finished task
			const finishedTaskIdx = runningTasks.findIndex(
				(t) => taskIdxMap.get(t) === winner.idx,
			);
			if (finishedTaskIdx >= 0) {
				const finishedTask = runningTasks[finishedTaskIdx];
				if (finishedTask) {
					runningTasks.splice(finishedTaskIdx, 1);
					taskIdxMap.delete(finishedTask);
				}
			}

			// Check if this is a valid winner
			if (!requireSuccess || !winner.result[0]) {
				if (debugEnabled) {
					debugScope(
						"worker race winner: task %d/%d",
						winner.idx + 1,
						totalTasks,
					);
				}
				// Clear timeout if set
				if (timeoutId) clearTimeout(timeoutId);
				return winner.result;
			}

			// Winner was an error and requireSuccess is true - continue
			if (debugEnabled) {
				debugScope(
					"worker task %d/%d failed (requireSuccess), continuing...",
					winner.idx + 1,
					totalTasks,
				);
			}

			// Start next task if available
			if (currentIndex < totalTasks) {
				const factory = factories[currentIndex];
				if (factory) {
					const nextTask = executeInWorker(factory, currentIndex);
					runningTasks.push(nextTask);
					taskIdxMap.set(nextTask, currentIndex);
					currentIndex++;
				}
			} else if (runningTasks.length === 0) {
				// No more tasks and none running - all failed
				if (timeoutId) clearTimeout(timeoutId);
				return [new Error("All race competitors failed"), undefined];
			}
		}

		// Should not reach here
		if (timeoutId) clearTimeout(timeoutId);
		return [new Error("Race failed"), undefined];
	} finally {
		// Clean up
		if (timeoutId) clearTimeout(timeoutId);
		if (signal && abortHandler) {
			signal.removeEventListener("abort", abortHandler);
		}
		await pool[Symbol.asyncDispose]();
	}
}
