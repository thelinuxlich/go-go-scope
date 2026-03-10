/**
 * Async iterator helpers for go-go-scope
 *
 * Provides utilities for working with async iterables
 */

/**
 * Options for async iterable operations
 */
export interface AsyncIteratorFromOptions {
	/** Signal to abort the iterator */
	signal?: AbortSignal;
}

/**
 * Options for fromArray
 */
export interface FromArrayOptions extends AsyncIteratorFromOptions {
	/** Delay between items in ms */
	delay?: number;
}

/**
 * Create an async iterator from an array with async delay between items
 *
 * @param array - The source array to convert to an async iterable
 * @param options - Optional configuration for delay and abort signal
 * @returns An async iterable that yields array elements
 *
 * @example
 * ```typescript
 * import { fromArray } from "go-go-scope";
 *
 * const asyncIter = fromArray([1, 2, 3, 4, 5], { delay: 100 });
 *
 * for await (const value of asyncIter) {
 *   console.log(value); // 1, 2, 3, 4, 5 (with 100ms delay between each)
 * }
 * ```
 */
export function fromArray<T>(
	array: T[],
	options: FromArrayOptions = {},
): AsyncIterable<T> {
	const { signal, delay = 0 } = options;

	if (signal?.aborted) {
		return (async function* () {})();
	}

	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			for (const item of array) {
				if (signal?.aborted) break;

				if (delay > 0) {
					await new Promise<void>((resolve) => {
						const timeout = setTimeout(resolve, delay);
						signal?.addEventListener(
							"abort",
							() => {
								clearTimeout(timeout);
								resolve();
							},
							{ once: true },
						);
					});
				}

				if (signal?.aborted) break;
				yield item;
			}
		},
	};
}

/**
 * Convert an async iterable to an array
 *
 * @param iterable - The async iterable to convert
 * @returns A promise that resolves to an array of all values
 *
 * @example
 * ```typescript
 * import { fromArray, toArray } from "go-go-scope";
 *
 * const asyncIter = fromArray([1, 2, 3, 4, 5]);
 * const result = await toArray(asyncIter);
 *
 * console.log(result); // [1, 2, 3, 4, 5]
 * ```
 */
export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const item of iterable) {
		result.push(item);
	}
	return result;
}

/**
 * Convert an async iterable to a promise that resolves with the first value
 *
 * @param iterable - The async iterable to get the first value from
 * @returns A promise that resolves to the first value, or undefined if empty
 *
 * @example
 * ```typescript
 * import { fromArray, first } from "go-go-scope";
 *
 * const asyncIter = fromArray([10, 20, 30]);
 * const firstValue = await first(asyncIter);
 *
 * console.log(firstValue); // 10
 * ```
 */
export async function first<T>(
	iterable: AsyncIterable<T>,
): Promise<T | undefined> {
	for await (const item of iterable) {
		return item;
	}
	return undefined;
}

/**
 * Merge multiple async iterables into one
 * Values are yielded as they arrive (order not guaranteed)
 *
 * @param iterables - The async iterables to merge
 * @returns An async iterable that yields values from all iterables as they arrive
 *
 * @example
 * ```typescript
 * import { fromArray, merge, toArray } from "go-go-scope";
 *
 * const stream1 = fromArray([1, 2, 3], { delay: 50 });
 * const stream2 = fromArray(['a', 'b', 'c'], { delay: 30 });
 *
 * const merged = merge(stream1, stream2);
 * const result = await toArray(merged);
 *
 * console.log(result); // Values from both streams interleaved (order depends on timing)
 * ```
 */
export function merge<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			const iterators = iterables.map((it) => it[Symbol.asyncIterator]());
			const pending = new Map(
				iterators.map((it, idx) => [
					idx,
					it.next().then((result) => ({ idx, result })),
				]),
			);

			while (pending.size > 0) {
				const { idx, result } = await Promise.race(pending.values());
				pending.delete(idx);

				if (!result.done) {
					yield result.value;
					pending.set(
						idx,
						iterators[idx]!.next().then((r) => ({ idx, result: r })),
					);
				}
			}

			// Cleanup
			await Promise.all(iterators.map((it) => it.return?.()));
		},
	};
}

/**
 * Zip multiple async iterables together
 * Yields arrays of [value1, value2, ...]
 * Stops when any iterable is exhausted
 *
 * @param iterables - The async iterables to zip together
 * @returns An async iterable that yields arrays of values at each position
 *
 * @example
 * ```typescript
 * import { fromArray, zip, toArray } from "go-go-scope";
 *
 * const names = fromArray(['Alice', 'Bob', 'Charlie']);
 * const ages = fromArray([25, 30, 35]);
 * const cities = fromArray(['NYC', 'LA', 'Chicago']);
 *
 * const zipped = zip(names, ages, cities);
 * const result = await toArray(zipped);
 *
 * console.log(result);
 * // [['Alice', 25, 'NYC'], ['Bob', 30, 'LA'], ['Charlie', 35, 'Chicago']]
 * ```
 */
export function zip<T extends unknown[]>(
	...iterables: { [K in keyof T]: AsyncIterable<T[K]> }
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			const iterators = iterables.map((it) => it[Symbol.asyncIterator]());

			try {
				while (true) {
					const results = await Promise.all(iterators.map((it) => it.next()));

					if (results.some((r) => r.done)) {
						break;
					}

					yield results.map((r) => r.value) as T;
				}
			} finally {
				await Promise.all(iterators.map((it) => it.return?.()));
			}
		},
	};
}

/**
 * Transform an async iterable with a mapping function
 *
 * @param iterable - The async iterable to transform
 * @param fn - The mapping function that receives each value and its index
 * @returns An async iterable with transformed values
 *
 * @example
 * ```typescript
 * import { fromArray, map, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3, 4, 5]);
 * const doubled = map(numbers, (n) => n * 2);
 * const result = await toArray(doubled);
 *
 * console.log(result); // [2, 4, 6, 8, 10]
 * ```
 */
export function map<T, R>(
	iterable: AsyncIterable<T>,
	fn: (value: T, index: number) => R | Promise<R>,
): AsyncIterable<R> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<R> {
			let index = 0;
			for await (const item of iterable) {
				yield await fn(item, index++);
			}
		},
	};
}

/**
 * Filter an async iterable
 *
 * @param iterable - The async iterable to filter
 * @param predicate - A function that returns true for values to keep
 * @returns An async iterable with only values that pass the predicate
 *
 * @example
 * ```typescript
 * import { fromArray, filter, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
 * const evens = filter(numbers, (n) => n % 2 === 0);
 * const result = await toArray(evens);
 *
 * console.log(result); // [2, 4, 6, 8, 10]
 * ```
 */
export function filter<T>(
	iterable: AsyncIterable<T>,
	predicate: (value: T, index: number) => boolean | Promise<boolean>,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let index = 0;
			for await (const item of iterable) {
				if (await predicate(item, index++)) {
					yield item;
				}
			}
		},
	};
}

/**
 * Take first n items from an async iterable
 *
 * @param iterable - The async iterable to take from
 * @param n - The number of items to take
 * @returns An async iterable that yields at most n items
 *
 * @example
 * ```typescript
 * import { fromArray, take, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
 * const firstThree = take(numbers, 3);
 * const result = await toArray(firstThree);
 *
 * console.log(result); // [1, 2, 3]
 * ```
 */
export function take<T>(
	iterable: AsyncIterable<T>,
	n: number,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let count = 0;
			for await (const item of iterable) {
				if (count >= n) break;
				yield item;
				count++;
			}
		},
	};
}

/**
 * Skip first n items from an async iterable
 *
 * @param iterable - The async iterable to skip from
 * @param n - The number of items to skip
 * @returns An async iterable that yields items after the first n
 *
 * @example
 * ```typescript
 * import { fromArray, skip, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
 * const afterFive = skip(numbers, 5);
 * const result = await toArray(afterFive);
 *
 * console.log(result); // [6, 7, 8, 9, 10]
 * ```
 */
export function skip<T>(
	iterable: AsyncIterable<T>,
	n: number,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let count = 0;
			for await (const item of iterable) {
				if (count >= n) {
					yield item;
				}
				count++;
			}
		},
	};
}

/**
 * Buffer items from an async iterable into chunks
 *
 * @param iterable - The async iterable to buffer
 * @param size - The maximum size of each chunk
 * @returns An async iterable that yields arrays (chunks) of items
 *
 * @example
 * ```typescript
 * import { fromArray, buffer, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
 * const chunked = buffer(numbers, 3);
 * const result = await toArray(chunked);
 *
 * console.log(result); // [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]
 * ```
 */
export function buffer<T>(
	iterable: AsyncIterable<T>,
	size: number,
): AsyncIterable<T[]> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T[]> {
			const chunk: T[] = [];
			for await (const item of iterable) {
				chunk.push(item);
				if (chunk.length >= size) {
					yield chunk.splice(0, chunk.length);
				}
			}
			if (chunk.length > 0) {
				yield chunk;
			}
		},
	};
}

/**
 * Add a side effect to an async iterable without modifying values
 *
 * @param iterable - The async iterable to tap into
 * @param fn - A side effect function called for each value
 * @returns An async iterable that yields the same values unchanged
 *
 * @example
 * ```typescript
 * import { fromArray, tap, toArray } from "go-go-scope";
 *
 * const numbers = fromArray([1, 2, 3]);
 * const logged = tap(numbers, (n, index) => {
 *   console.log(`Processing item ${index}: ${n}`);
 * });
 * const result = await toArray(logged);
 *
 * // Logs:
 * // Processing item 0: 1
 * // Processing item 1: 2
 * // Processing item 2: 3
 * console.log(result); // [1, 2, 3]
 * ```
 */
export function tap<T>(
	iterable: AsyncIterable<T>,
	fn: (value: T, index: number) => void | Promise<void>,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let index = 0;
			for await (const item of iterable) {
				await fn(item, index++);
				yield item;
			}
		},
	};
}

/**
 * Concatenate multiple async iterables
 *
 * @param iterables - The async iterables to concatenate
 * @returns An async iterable that yields all items from the first iterable, then the second, etc.
 *
 * @example
 * ```typescript
 * import { fromArray, concat, toArray } from "go-go-scope";
 *
 * const stream1 = fromArray([1, 2, 3]);
 * const stream2 = fromArray([4, 5, 6]);
 * const stream3 = fromArray([7, 8, 9]);
 *
 * const combined = concat(stream1, stream2, stream3);
 * const result = await toArray(combined);
 *
 * console.log(result); // [1, 2, 3, 4, 5, 6, 7, 8, 9]
 * ```
 */
export function concat<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			for (const iterable of iterables) {
				yield* iterable;
			}
		},
	};
}

/**
 * Create an async iterable that completes after a delay
 *
 * @param ms - The delay in milliseconds
 * @param options - Optional configuration with abort signal
 * @returns An async iterable that yields undefined after the delay
 *
 * @example
 * ```typescript
 * import { delay } from "go-go-scope";
 *
 * // Wait for 1 second
 * for await (const _ of delay(1000)) {
 *   console.log("1 second has passed");
 * }
 *
 * // Use with AbortSignal for cancellable delays
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 500);
 *
 * for await (const _ of delay(2000, { signal: controller.signal })) {
 *   console.log("This may not print if aborted");
 * }
 * ```
 */
export function delay(
	ms: number,
	options: AsyncIteratorFromOptions = {},
): AsyncIterable<void> {
	const { signal } = options;

	return {
		async *[Symbol.asyncIterator](): AsyncIterator<void> {
			if (signal?.aborted) return;

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, ms);
				signal?.addEventListener(
					"abort",
					() => {
						clearTimeout(timeout);
						resolve();
					},
					{ once: true },
				);
			});

			yield undefined;
		},
	};
}

/**
 * Debounce an async iterable
 *
 * @param iterable - The async iterable to debounce
 * @param ms - The debounce delay in milliseconds
 * @returns An async iterable that yields the last value after the delay
 *
 * @example
 * ```typescript
 * import { fromArray, debounce, toArray } from "go-go-scope";
 *
 * // Simulate rapid updates (e.g., from user input)
 * async function* rapidUpdates() {
 *   yield 'a';
 *   yield 'ab';
 *   yield 'abc';
 *   await new Promise(r => setTimeout(r, 100));
 *   yield 'abcd';
 *   yield 'abcde';
 * }
 *
 * const debounced = debounce(rapidUpdates(), 50);
 * const result = await toArray(debounced);
 *
 * // Only yields values after the debounce delay
 * console.log(result); // ['abc', 'abcde']
 * ```
 */
export function debounce<T>(
	iterable: AsyncIterable<T>,
	ms: number,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let lastValue: T | undefined;
			let hasValue = false;
			let timeoutId: ReturnType<typeof setTimeout> | null = null;

			const scheduleYield = (): Promise<IteratorResult<T>> => {
				return new Promise((resolve) => {
					if (timeoutId) clearTimeout(timeoutId);
					timeoutId = setTimeout(() => {
						if (hasValue) {
							const value = lastValue!;
							hasValue = false;
							resolve({ value, done: false });
						}
					}, ms);
				});
			};

			const iterator = iterable[Symbol.asyncIterator]();

			try {
				while (true) {
					const raceResult = await Promise.race([
						iterator.next(),
						scheduleYield(),
					]);

					if ("done" in raceResult && raceResult.done) {
						// Yield final value if exists
						if (hasValue && timeoutId) {
							clearTimeout(timeoutId);
							yield lastValue!;
						}
						break;
					}

					// New value arrived
					if ("value" in raceResult) {
						lastValue = (raceResult as IteratorResult<T>).value;
						hasValue = true;
					}
				}
			} finally {
				if (timeoutId) clearTimeout(timeoutId);
				await iterator.return?.();
			}
		},
	};
}

/**
 * Throttle an async iterable
 *
 * @param iterable - The async iterable to throttle
 * @param ms - The minimum time between yields in milliseconds
 * @returns An async iterable that yields values at most once per ms milliseconds
 *
 * @example
 * ```typescript
 * import { fromArray, throttle, toArray } from "go-go-scope";
 *
 * // Rapid source that emits every 10ms
 * async function* rapidSource() {
 *   for (let i = 0; i < 10; i++) {
 *     yield i;
 *     await new Promise(r => setTimeout(r, 10));
 *   }
 * }
 *
 * // Throttle to allow at most one value per 50ms
 * const throttled = throttle(rapidSource(), 50);
 * const result = await toArray(throttled);
 *
 * // Fewer values due to throttling
 * console.log(result.length); // Approximately 2-3 items instead of 10
 * ```
 */
export function throttle<T>(
	iterable: AsyncIterable<T>,
	ms: number,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			let lastYield = 0;

			for await (const item of iterable) {
				const now = Date.now();
				const waitTime = lastYield + ms - now;

				if (waitTime > 0) {
					await new Promise((resolve) => setTimeout(resolve, waitTime));
				}

				lastYield = Date.now();
				yield item;
			}
		},
	};
}
