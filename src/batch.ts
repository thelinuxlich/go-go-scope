/**
 * Batch processing utilities with progress tracking and error handling.
 */

import type { Scope } from "./scope.js";
import type { Result } from "./types.js";

/**
 * Options for batch processing.
 */
export interface BatchOptions<T, R> {
	/** Function to process each item */
	process: (item: T, index: number) => Promise<R>;
	/** Maximum concurrent operations (default: unlimited) */
	concurrency?: number;
	/** Called after each item is processed */
	onProgress?: (
		completed: number,
		total: number,
		result: Result<unknown, R>,
	) => void;
	/** Continue processing on error (default: false) */
	continueOnError?: boolean;
	/** Signal for cancellation */
	signal?: AbortSignal;
}

/**
 * Result of a batch operation.
 */
export interface BatchResult<T, R> {
	/** Successfully processed results */
	successful: { item: T; index: number; result: R }[];
	/** Failed items */
	failed: { item: T; index: number; error: unknown }[];
	/** Total number of items */
	total: number;
	/** Number successfully processed */
	completed: number;
	/** Number that failed */
	errors: number;
	/** Whether all items were processed successfully */
	allSuccessful: boolean;
}

/**
 * Process an array of items with concurrency control and progress tracking.
 *
 * @param items - Array of items to process
 * @param options - Batch processing options
 * @returns Batch result with successful and failed items
 *
 * @example
 * ```typescript
 * const results = await batch(urls, {
 *   process: (url) => fetch(url).then(r => r.json()),
 *   concurrency: 5,
 *   onProgress: (completed, total) => console.log(`${completed}/${total}`),
 *   continueOnError: true
 * })
 *
 * console.log(`Successful: ${results.successful.length}`)
 * console.log(`Failed: ${results.failed.length}`)
 * ```
 */
export async function batch<T, R>(
	items: readonly T[],
	options: BatchOptions<T, R>,
): Promise<BatchResult<T, R>> {
	const {
		process,
		concurrency = Infinity,
		onProgress,
		continueOnError = false,
		signal,
	} = options;

	// Check cancellation before starting
	if (signal?.aborted) {
		throw signal.reason;
	}

	const total = items.length;
	const successful: { item: T; index: number; result: R }[] = [];
	const failed: { item: T; index: number; error: unknown }[] = [];

	// Process with concurrency limit
	if (concurrency === Infinity) {
		// Process all in parallel
		const promises = items.map((item, index) =>
			processItem(item, index, process, signal),
		);

		const results = await Promise.all(promises);

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			if (!result) continue;

			const [err, value] = result;
			const batchResult: Result<unknown, R> = result;

			if (err) {
				failed.push({ item: items[i]!, index: i, error: err });
				if (!continueOnError) {
					onProgress?.(successful.length + failed.length, total, batchResult);
					break;
				}
			} else {
				successful.push({ item: items[i]!, index: i, result: value as R });
			}

			onProgress?.(successful.length + failed.length, total, batchResult);
		}
	} else {
		// Process with concurrency limit
		const executing: Promise<void>[] = [];
		let index = 0;

		for (const item of items) {
			// Check cancellation
			if (signal?.aborted) {
				throw signal.reason;
			}

			const currentIndex = index++;

			const promise = processItem(item, currentIndex, process, signal).then(
				(result) => {
					const [err, value] = result;
					const batchResult: Result<unknown, R> = result;

					if (err) {
						failed.push({
							item,
							index: currentIndex,
							error: err,
						});
						if (!continueOnError) {
							onProgress?.(
								successful.length + failed.length,
								total,
								batchResult,
							);
							// Cancel remaining
							throw new Error("Batch stopped on first error");
						}
					} else {
						successful.push({
							item,
							index: currentIndex,
							result: value as R,
						});
					}

					onProgress?.(successful.length + failed.length, total, batchResult);
				},
			);

			executing.push(promise);

			if (executing.length >= concurrency) {
				try {
					await Promise.race(executing);
				} catch {
					// Error occurred and continueOnError is false
					break;
				}
			}
		}

		// Wait for remaining
		if (continueOnError || failed.length === 0) {
			await Promise.all(executing).catch(() => {});
		}
	}

	return {
		successful,
		failed,
		total,
		completed: successful.length,
		errors: failed.length,
		allSuccessful: failed.length === 0 && successful.length === total,
	};
}

/**
 * Helper to process a single item and return Result tuple.
 */
async function processItem<T, R>(
	item: T,
	index: number,
	process: (item: T, index: number) => Promise<R>,
	signal?: AbortSignal,
): Promise<Result<unknown, R>> {
	if (signal?.aborted) {
		return [signal.reason, undefined];
	}

	try {
		const result = await process(item, index);
		return [undefined, result];
	} catch (error) {
		return [error, undefined];
	}
}

/**
 * Batch processing method for Scope.
 * This is added to the Scope class via declaration merging.
 */
export interface BatchMethod {
	/**
	 * Process an array of items with concurrency control.
	 *
	 * @param items - Items to process
	 * @param options - Processing options
	 * @returns Batch result
	 *
	 * @example
	 * ```typescript
	 * await using s = scope({ concurrency: 5 })
	 *
	 * const results = await s.batch(urls, {
	 *   process: (url) => fetch(url).then(r => r.json()),
	 *   onProgress: (completed, total) => console.log(`${completed}/${total}`)
	 * })
	 * ```
	 */
	batch<T, R>(
		items: readonly T[],
		options: Omit<BatchOptions<T, R>, "signal">,
	): Promise<BatchResult<T, R>>;
}
