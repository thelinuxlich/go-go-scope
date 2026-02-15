/**
 * Parallel execution function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { ParallelAggregateResult, Result, Tracer } from "./types.js";

const debugScope = createDebug("go-go-scope:parallel");

/**
 * Run multiple tasks in parallel with optional concurrency limit and progress tracking.
 * All tasks run within a scope and are cancelled together on failure.
 * Returns a structured result with both successes and failures separated.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit, progress callback, and error handling
 * @returns A Promise that resolves to a structured result with completed and failed tasks
 *
 * @example
 * ```typescript
 * const result = await parallel(
 *   urls.map(url => ({ signal }) => fetch(url, { signal })),
 *   { concurrency: 3, continueOnError: true }
 * )
 *
 * console.log(result.completed.length) // Successfully fetched
 * console.log(result.errors.length)    // Failed
 * ```
 */
export async function parallel<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: {
		concurrency?: number;
		signal?: AbortSignal;
		tracer?: Tracer;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, T>,
		) => void;
		continueOnError?: boolean;
	},
): Promise<ParallelAggregateResult<T>> {
	const {
		concurrency = 0,
		onProgress,
		continueOnError = false,
	} = options ?? {};

	if (factories.length === 0) {
		if (debugScope.enabled) {
			debugScope("no factories, returning empty result");
		}
		return { completed: [], errors: [], allCompleted: true };
	}

	const total = factories.length;
	const debugEnabled = debugScope.enabled;

	if (debugEnabled) {
		debugScope(
			"starting parallel execution (tasks: %d, concurrency: %d, continueOnError: %s)",
			total,
			concurrency > 0 ? concurrency : "unlimited",
			continueOnError,
		);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugEnabled) {
			debugScope("already aborted");
		}
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	const completed: { index: number; value: T }[] = [];
	const errors: { index: number; error: unknown }[] = [];

	try {
		if (concurrency <= 0 || concurrency >= factories.length) {
			// No concurrency limit - run all in parallel
			if (debugEnabled) {
				debugScope("running all tasks in parallel");
			}

			const promises = factories.map((factory, idx) =>
				s
					.task(({ signal }) => factory(signal))
					.then((result): [number, Result<unknown, T>] => [idx, result]),
			);

			// If not continuing on error, use Promise.all to fail fast
			const results = continueOnError
				? await Promise.all(promises)
				: await Promise.all(promises).catch((error) => {
						return [[-1, [error, undefined]] as [number, Result<unknown, T>]];
					});

			for (const [idx, result] of results) {
				if (idx === -1) continue;

				const [err, value] = result;
				if (err) {
					errors.push({ index: idx, error: err });
					if (onProgress) {
						onProgress(completed.length + errors.length, total, result);
					}
					if (!continueOnError) break;
				} else {
					completed.push({ index: idx, value: value as T });
					if (onProgress) {
						onProgress(completed.length + errors.length, total, result);
					}
				}
			}
		} else {
			// With concurrency limit
			if (debugEnabled) {
				debugScope("running with concurrency limit: %d", concurrency);
			}

			const executing: Promise<void>[] = [];
			let index = 0;

			for (const factory of factories) {
				// Check cancellation
				if (options?.signal?.aborted) {
					throw options.signal.reason;
				}

				const currentIndex = index++;

				const promise = (async () => {
					try {
						const result = await s.task(({ signal }) => factory(signal));
						const [err, value] = result;

						if (err) {
							errors.push({ index: currentIndex, error: err });
							if (onProgress) {
								onProgress(completed.length + errors.length, total, result);
							}
							if (!continueOnError) {
								throw new Error("parallel stopped on first error");
							}
						} else {
							completed.push({
								index: currentIndex,
								value: value as T,
							});
							if (onProgress) {
								onProgress(completed.length + errors.length, total, result);
							}
						}
					} catch (error) {
						// Handle unexpected errors
						errors.push({ index: currentIndex, error });
						if (onProgress) {
							onProgress(completed.length + errors.length, total, [
								error,
								undefined,
							]);
						}
						if (!continueOnError) {
							throw error;
						}
					}
				})();

				executing.push(promise);

				if (executing.length >= concurrency) {
					try {
						await Promise.race(executing);
					} catch {
						if (!continueOnError) break;
					}
				}
			}

			// Wait for remaining
			if (continueOnError || errors.length === 0) {
				await Promise.all(executing).catch(() => {});
			}
		}

		debugScope(
			"all tasks completed: %d/%d, errors: %d",
			completed.length,
			total,
			errors.length,
		);

		return {
			completed,
			errors,
			allCompleted: errors.length === 0,
		};
	} finally {
		await s[Symbol.asyncDispose]();
	}
}
