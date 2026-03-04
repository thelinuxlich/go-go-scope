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
