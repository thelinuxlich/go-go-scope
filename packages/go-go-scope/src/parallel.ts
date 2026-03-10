/**
 * Parallel execution function for go-go-scope
 *
 * Provides utilities for running multiple tasks concurrently with structured
 * concurrency guarantees. Includes support for concurrency limiting, progress
 * tracking, error handling strategies, and worker threads for CPU-intensive tasks.
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { ParallelResults, Result } from "./types.js";
import { WorkerPool } from "./worker-pool.js";

const debugScope = createDebug("go-go-scope:parallel");

/**
 * Options for configuring parallel execution behavior.
 *
 * @example
 * ```typescript
 * const options = {
 *   concurrency: 3,           // Run max 3 tasks at once
 *   continueOnError: true,    // Continue even if some tasks fail
 *   onProgress: (completed, total, result) => {
 *     console.log(`${completed}/${total} done`);
 *   }
 * };
 * ```
 */
export interface ParallelOptions {
	/** Maximum number of concurrent tasks. 0 or undefined means unlimited. */
	concurrency?: number;
	/** AbortSignal to cancel all running tasks. */
	signal?: AbortSignal;
	/** Callback invoked after each task completes. */
	onProgress?: (
		completed: number,
		total: number,
		result: Result<unknown, unknown>,
	) => void;
	/** If true, continue running tasks even if some fail. */
	continueOnError?: boolean;
	/** Use worker threads for CPU-intensive tasks. */
	workers?: {
		/** Number of worker threads. */
		threads: number;
		/** Timeout in ms before idle workers are terminated. Default: 60000. */
		idleTimeout?: number;
	};
}

/**
 * Runs multiple tasks in parallel with optional concurrency limit and progress tracking.
 *
 * All tasks run within a scope and are cancelled together on parent cancellation.
 * Returns a tuple of Results where each position corresponds to the factory
 * at the same index. This preserves individual return types for type-safe destructuring.
 *
 * Features:
 * - Type-safe parallel execution with individual result types
 * - Optional concurrency limiting
 * - Progress tracking via callback
 * - Configurable error handling (fail fast or continue on error)
 * - Worker thread support for CPU-intensive tasks
 * - Automatic cancellation propagation
 * - Structured concurrency - all tasks cancelled together on failure
 *
 * @typeParam T - Tuple type of factory functions
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration for parallel execution
 * @param options.concurrency - Maximum number of concurrent tasks. 0 or undefined means unlimited
 * @param options.signal - AbortSignal to cancel all running tasks
 * @param options.onProgress - Callback invoked after each task completes. Receives completed count, total count, and the result tuple
 * @param options.continueOnError - If true, continue running tasks even if some fail. Default: false
 * @param options.workers - Worker thread configuration for CPU-intensive tasks
 * @param options.workers.threads - Number of worker threads to use
 * @param options.workers.idleTimeout - Timeout in ms before idle workers are terminated. Default: 60000
 * @returns A Promise that resolves to a tuple of Results (one per factory)
 *
 * @example
 * ```typescript
 * import { parallel } from 'go-go-scope';
 *
 * // With type inference - each result is typed individually
 * const [userResult, ordersResult, settingsResult] = await parallel([
 *   (signal) => fetchUser(1, { signal }),      // Result<Error, User>
 *   (signal) => fetchOrders({ signal }),       // Result<Error, Order[]>
 *   (signal) => fetchSettings({ signal }),     // Result<Error, Settings>
 * ]);
 *
 * // Destructure each result
 * const [userErr, user] = userResult;
 * const [ordersErr, orders] = ordersResult;
 * const [settingsErr, settings] = settingsResult;
 *
 * if (!userErr && !ordersErr && !settingsErr) {
 *   console.log('All data loaded:', { user, orders, settings });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With concurrency limit
 * const results = await parallel(
 *   urls.map(url => (signal) => fetch(url, { signal }).then(r => r.json())),
 *   { concurrency: 5 } // Only 5 requests at a time
 * );
 *
 * // Process results
 * for (const [err, data] of results) {
 *   if (!err) {
 *     console.log('Fetched:', data);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With progress tracking
 * const results = await parallel(
 *   largeDataset.map(item => async (signal) => {
 *     return await processItem(item, { signal });
 *   }),
 *   {
 *     concurrency: 3,
 *     onProgress: (completed, total, result) => {
 *       const percentage = Math.round((completed / total) * 100);
 *       console.log(`Progress: ${percentage}% (${completed}/${total})`);
 *
 *       if (result[0]) {
 *         console.log('Task failed:', result[0].message);
 *       }
 *     }
 *   }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Continue on error - get results even if some fail
 * const [r1, r2, r3, r4] = await parallel([
 *   () => fetch('/api/a'),  // Might succeed
 *   () => fetch('/api/b'),  // Might fail
 *   () => fetch('/api/c'),  // Might succeed
 *   () => fetch('/api/d'),  // Might fail
 * ], { continueOnError: true });
 *
 * // r1[0] is error if failed, undefined if succeeded
 * // r1[1] is data if succeeded, undefined if failed
 * console.log('A result:', r1[0] ? 'failed' : r1[1]);
 * console.log('B result:', r2[0] ? 'failed' : r2[1]);
 * ```
 *
 * @example
 * ```typescript
 * // With cancellation
 * const controller = new AbortController();
 *
 * const promise = parallel(
 *   longRunningTasks.map(t => signal => t.execute({ signal })),
 *   { signal: controller.signal }
 * );
 *
 * // Cancel after 5 seconds
 * setTimeout(() => controller.abort('Timeout'), 5000);
 *
 * try {
 *   const results = await promise;
 * } catch (e) {
 *   console.log('Parallel execution was cancelled');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With worker threads for CPU-intensive tasks
 * const [hash1, hash2, hash3] = await parallel([
 *   () => computeHash(data1),  // CPU-intensive
 *   () => computeHash(data2),
 *   () => computeHash(data3),
 * ], {
 *   workers: {
 *     threads: 3,           // Use 3 worker threads
 *     idleTimeout: 30000    // Keep workers alive for 30s
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Error handling - fail fast (default)
 * try {
 *   const results = await parallel([
 *     () => fetch('/api/a'),
 *     () => fetch('/api/b'),  // If this fails immediately...
 *     () => fetch('/api/c'),
 *   ]);
 * } catch (error) {
 *   // Other tasks are cancelled, error is thrown
 *   console.log('A task failed:', error);
 * }
 * ```
 *
 * @see {@link race} - For racing tasks (first to complete wins)
 * @see {@link Scope#parallel} - For scoped parallel execution
 */
export async function parallel<
	T extends readonly ((signal: AbortSignal) => Promise<unknown>)[],
>(
	factories: T,
	options?: {
		concurrency?: number;
		signal?: AbortSignal;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, unknown>,
		) => void;
		continueOnError?: boolean;
		/** Use worker threads for CPU-intensive tasks */
		workers?: {
			/** Number of worker threads */
			threads: number;
			/** Timeout in ms before idle workers are terminated. Default: 60000 */
			idleTimeout?: number;
		};
	},
): Promise<ParallelResults<T>> {
	const {
		concurrency = 0,
		onProgress,
		continueOnError = false,
		workers,
	} = options ?? {};

	if (factories.length === 0) {
		if (debugScope.enabled) {
			debugScope("no factories, returning empty result");
		}
		return [] as unknown as ParallelResults<T>;
	}

	const total = factories.length;
	const debugEnabled = debugScope.enabled;

	if (debugEnabled) {
		debugScope(
			"starting parallel execution (tasks: %d, concurrency: %d, workers: %s, continueOnError: %s)",
			total,
			concurrency > 0 ? concurrency : "unlimited",
			workers ? workers.threads : "none",
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

	// Use worker threads if specified
	if (workers !== undefined && workers.threads > 0) {
		return parallelWithWorkers(factories, {
			workers: workers.threads,
			workerIdleTimeout: workers.idleTimeout,
			onProgress,
			continueOnError,
			signal: options?.signal,
		});
	}

	const s = new Scope({ signal: options?.signal });

	// Use a fixed-size array to preserve order and types
	const results: Result<unknown, unknown>[] = new Array(factories.length);

	try {
		if (concurrency <= 0 || concurrency >= factories.length) {
			// No concurrency limit - run all in parallel
			if (debugEnabled) {
				debugScope("running all tasks in parallel");
			}

			const promises = factories.map((factory, idx) =>
				s
					.task(({ signal }) => factory(signal))
					.then((result): [number, Result<unknown, unknown>] => [idx, result]),
			);

			// If not continuing on error, use Promise.all to fail fast
			const settledResults = continueOnError
				? await Promise.all(promises)
				: await Promise.all(promises).catch((error) => {
						return [
							[-1, [error, undefined]] as [number, Result<unknown, unknown>],
						];
					});

			for (const [idx, result] of settledResults) {
				if (idx === -1) continue;
				results[idx] = result;
				if (onProgress) {
					onProgress(
						results.filter((r) => r !== undefined).length,
						total,
						result,
					);
				}
				if (!continueOnError && result[0]) {
					break;
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
						results[currentIndex] = result;
						if (onProgress) {
							onProgress(
								results.filter((r) => r !== undefined).length,
								total,
								result,
							);
						}
						if (!continueOnError && result[0]) {
							throw result[0];
						}
					} catch (error) {
						results[currentIndex] = [error, undefined];
						if (onProgress) {
							onProgress(results.filter((r) => r !== undefined).length, total, [
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
			if (continueOnError || results.every((r) => r !== undefined)) {
				await Promise.all(executing).catch(() => {});
			}
		}

		// Fill in any missing results (if we broke early due to !continueOnError)
		for (let i = 0; i < results.length; i++) {
			if (results[i] === undefined) {
				results[i] = [new Error("Task did not complete"), undefined];
			}
		}

		debugScope(
			"all tasks completed: %d/%d, errors: %d",
			results.filter((r) => !r[0]).length,
			total,
			results.filter((r) => r[0]).length,
		);

		return results as ParallelResults<T>;
	} finally {
		await (s as unknown as AsyncDisposable)[Symbol.asyncDispose]();
	}
}

/**
 * Execute factories in worker threads.
 *
 * This is for CPU-intensive synchronous functions that need to run in parallel
 * without blocking the main thread. The factory functions are serialized and
 * executed in separate worker threads.
 *
 * @internal
 * @typeParam T - Tuple type of factory functions
 * @param factories - Array of factory functions
 * @param options - Worker thread configuration
 * @param options.workers - Number of worker threads to create
 * @param options.workerIdleTimeout - Timeout in ms before idle workers are terminated
 * @param options.onProgress - Callback invoked after each task completes
 * @param options.continueOnError - If true, continue running tasks even if some fail
 * @param options.signal - AbortSignal to cancel all running tasks
 * @returns Promise resolving to tuple of Results
 */
async function parallelWithWorkers<
	T extends readonly ((signal: AbortSignal) => Promise<unknown>)[],
>(
	factories: T,
	options: {
		workers: number;
		workerIdleTimeout?: number;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, unknown>,
		) => void;
		continueOnError?: boolean;
		signal?: AbortSignal;
	},
): Promise<ParallelResults<T>> {
	const { workers, workerIdleTimeout, onProgress, continueOnError, signal } =
		options;

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

	try {
		const total = factories.length;
		const results: Result<unknown, unknown>[] = new Array(total);

		// Execute all tasks - serialize each factory and execute in worker
		const promises = factories.map((factory, idx) => {
			// Serialize the factory function to string
			const factoryFn = factory.toString();

			return pool
				.execute<string, unknown>((fnString) => {
					// This runs in the worker thread
					// biome-ignore lint/security/noGlobalEval: Required for serializing functions to worker threads
					const fn = eval(`(${fnString})`);
					// Execute the factory with a mock AbortSignal
					const result = fn({ aborted: false });
					// Handle both sync and async results
					return result;
				}, factoryFn)
				.then(
					(result): [number, Result<unknown, unknown>] => [
						idx,
						[undefined, result],
					],
					(error): [number, Result<unknown, unknown>] => [
						idx,
						[
							error instanceof Error ? error : new Error(String(error)),
							undefined,
						],
					],
				);
		});

		// Wait for all results
		const settledResults = continueOnError
			? await Promise.all(promises)
			: await Promise.all(promises).catch((error) => {
					return [
						[-1, [error, undefined]] as [number, Result<unknown, unknown>],
					];
				});

		// Process results
		for (const [idx, result] of settledResults) {
			if (idx === -1) continue;
			results[idx] = result;
			if (onProgress) {
				onProgress(
					results.filter((r) => r !== undefined).length,
					total,
					result,
				);
			}
		}

		// Fill in any missing results
		for (let i = 0; i < results.length; i++) {
			if (results[i] === undefined) {
				results[i] = [new Error("Task did not complete"), undefined];
			}
		}

		return results as ParallelResults<T>;
	} finally {
		// Clean up abort handler
		if (signal && abortHandler) {
			signal.removeEventListener("abort", abortHandler);
		}
		// Dispose the pool
		await pool[Symbol.asyncDispose]();
	}
}
