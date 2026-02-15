/**
 * Race function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { RaceOptions, Result } from "./types.js";

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
 * Race multiple tasks - the first to settle wins, others are cancelled.
 * Implements structured concurrency: all tasks run within a scope.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional race configuration
 * @returns A Promise that resolves to the value of the first settled task
 *
 * @example
 * ```typescript
 * // Basic race - first to settle wins
 * const winner = await race([
 *   ({ signal }) => fetch('https://a.com', { signal }),
 *   ({ signal }) => fetch('https://b.com', { signal }),
 * ])
 *
 * // Race with timeout
 * const winner = await race([
 *   ({ signal }) => fetch('https://slow.com', { signal }),
 *   ({ signal }) => fetch('https://fast.com', { signal }),
 * ], { timeout: 5000 })
 *
 * // Race for first success only
 * const winner = await race([
 *   () => fetchWithRetry('https://a.com'),  // might fail then retry
 *   () => fetchWithRetry('https://b.com'),  // might fail then retry
 * ], { requireSuccess: true })
 *
 * // Race with limited concurrency
 * const winner = await race([
 *   () => fetch(url1),
 *   () => fetch(url2),
 *   () => fetch(url3),
 *   () => fetch(url4),
 *   () => fetch(url5),
 * ], { concurrency: 2 })
 * ```
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<Result<unknown, T>> {
	const totalTasks = factories.length;
	const requireSuccess = options?.requireSuccess ?? false;
	const timeout = options?.timeout;
	const concurrency = options?.concurrency ?? 0;

	if (totalTasks === 0) {
		return [new Error("Cannot race empty array of factories"), undefined];
	}

	if (debugScope.enabled) {
		debugScope(
			"starting race with %d competitors (requireSuccess: %s, timeout: %s, concurrency: %s)",
			totalTasks,
			requireSuccess,
			timeout ?? "none",
			concurrency > 0 ? concurrency : "unlimited",
		);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugScope.enabled) {
			debugScope("already aborted");
		}
		return [options.signal.reason, undefined];
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let settledCount = 0;
	let successCount = 0;
	let winnerIndex = -1;
	const errors: { index: number; error: unknown }[] = [];

	try {
		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			s.signal.addEventListener(
				"abort",
				() => {
					if (debugScope.enabled) {
						debugScope(
							"aborted, %d/%d tasks settled",
							settledCount,
							totalTasks,
						);
					}
					resolve([s.signal.reason, undefined]);
				},
				{ once: true },
			);
		});

		// Create timeout promise if timeout is specified
		const timeoutPromise = timeout
			? new Promise<never>((_, reject) => {
					setTimeout(() => {
						if (debugScope.enabled) {
							debugScope("timeout after %dms", timeout);
						}
						reject(new Error(`Race timeout after ${timeout}ms`));
					}, timeout);
				})
			: null;

		const debugEnabled = debugScope.enabled;

		// Helper to process a single task
		const processTask = async (
			factory: (signal: AbortSignal) => Promise<T>,
			idx: number,
		): Promise<TaskResult<T>> => {
			const result = await s.task(async ({ signal }) => {
				const r = await factory(signal);
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
			successCount++;
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

		// If no concurrency limit, run all tasks at once
		if (concurrency <= 0 || concurrency >= totalTasks) {
			// Spawn all tasks with tracking
			const tasks = factories.map((factory, idx) => processTask(factory, idx));

			// Race all tasks with optional timeout
			const racePromise = timeoutPromise
				? Promise.race([Promise.race(tasks), timeoutPromise])
				: Promise.race([...tasks, abortPromise]);

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
			const task = processTask(factories[currentIndex]!, currentIndex);
			runningTasks.push(task);
			taskIdxMap.set(task, currentIndex);
			currentIndex++;
		}

		// Keep racing until we have a winner
		while (runningTasks.length > 0) {
			// Build race competitors for this iteration
			const competitors: Promise<TaskResult<T> | Result<unknown, T>>[] = [
				...runningTasks,
				abortPromise,
			];
			if (timeoutPromise) {
				competitors.push(timeoutPromise as Promise<never>);
			}

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
				const finishedTask = runningTasks[finishedTaskIdx]!;
				runningTasks.splice(finishedTaskIdx, 1);
				taskIdxMap.delete(finishedTask);
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
				const nextTask = processTask(factories[currentIndex]!, currentIndex);
				runningTasks.push(nextTask);
				taskIdxMap.set(nextTask, currentIndex);
				currentIndex++;
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
		await s[Symbol.asyncDispose]();
	}
}
