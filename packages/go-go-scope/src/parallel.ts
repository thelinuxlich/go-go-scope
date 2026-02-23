/**
 * Parallel execution function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { ParallelResults, Result, Tracer } from "./types.js";

const debugScope = createDebug("go-go-scope:parallel");

/**
 * Run multiple tasks in parallel with optional concurrency limit and progress tracking.
 * All tasks run within a scope and are cancelled together on failure.
 *
 * Returns a tuple of Results where each position corresponds to the factory
 * at the same index. This preserves individual return types for type-safe destructuring.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit, progress callback, and error handling
 * @returns A Promise that resolves to a tuple of Results (one per factory)
 *
 * @example
 * ```typescript
 * // With type inference - each result is typed individually
 * const [userResult, ordersResult] = await parallel([
 *   (signal) => fetchUser(1, { signal }),      // Result<Error, User>
 *   (signal) => fetchOrders({ signal }),       // Result<Error, Order[]>
 * ])
 *
 * const [userErr, user] = userResult
 * const [ordersErr, orders] = ordersResult
 * ```
 */
export async function parallel<
	T extends readonly ((signal: AbortSignal) => Promise<unknown>)[],
>(
	factories: T,
	options?: {
		concurrency?: number;
		signal?: AbortSignal;
		tracer?: Tracer;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, unknown>,
		) => void;
		continueOnError?: boolean;
	},
): Promise<ParallelResults<T>> {
	const {
		concurrency = 0,
		onProgress,
		continueOnError = false,
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
		await s[Symbol.asyncDispose]();
	}
}
