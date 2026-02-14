/**
 * Parallel execution function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { Result, Tracer } from "./types.js";

const debugScope = createDebug("go-go-scope:parallel");

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
			debugScope("no factories, returning empty array");
		}
		return [];
	}

	const concurrency = options?.concurrency ?? 0;
	const failFast = options?.failFast ?? false;
	const totalTasks = factories.length;
	const debugEnabled = debugScope.enabled;

	if (debugEnabled) {
		debugScope(
			"starting parallel execution (tasks: %d, concurrency: %d, failFast: %s)",
			totalTasks,
			concurrency > 0 ? concurrency : "unlimited",
			failFast,
		);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugEnabled) {
			debugScope("already aborted");
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
						"task %d/%d failed (failFast: %s)",
						errorCount,
						totalTasks,
						failFast,
					);
				}
			} else {
				completedCount++;
				if (debugEnabled) {
					debugScope("task %d/%d completed", completedCount, totalTasks);
				}
			}
			return result;
		};

		// If no concurrency limit, run all in parallel
		if (concurrency <= 0 || concurrency >= factories.length) {
			if (debugEnabled) {
				debugScope("running all tasks in parallel");
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
			debugScope("running with concurrency limit: %d", concurrency);
		}
		const results: Result<unknown, T>[] = new Array(factories.length);
		let index = 0;
		let hasError = false;

		const worker = async (workerId: number): Promise<void> => {
			if (debugEnabled) {
				debugScope("worker %d started", workerId);
			}
			let tasksProcessed = 0;
			while (index < factories.length) {
				// Check if we should stop due to error in failFast mode
				if (failFast && hasError) {
					if (debugEnabled) {
						debugScope("worker %d stopping due to error", workerId);
					}
					break;
				}

				const currentIndex = index++;
				const factory = factories[currentIndex];
				if (!factory) continue;

				if (debugEnabled) {
					debugScope("worker %d processing task %d", workerId, currentIndex);
				}

				const result = await processTask(factory, currentIndex);
				results[currentIndex] = result;
				if (result[0]) {
					hasError = true;
					if (failFast) {
						if (debugEnabled) {
							debugScope("worker %d aborting due to error", workerId);
						}
						break;
					}
				}
				tasksProcessed++;
			}
			if (debugEnabled) {
				debugScope(
					"worker %d finished, processed %d tasks",
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
			"all tasks completed: %d/%d, errors: %d",
			completedCount,
			totalTasks,
			errorCount,
		);
		return results;
	} finally {
		await s[Symbol.asyncDispose]();
	}
}
