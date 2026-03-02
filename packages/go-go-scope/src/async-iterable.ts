/**
 * Async iterator helpers for go-go-scope
 *
 * Provides utilities for working with async iterables, including
 * conversion from EventTarget, ReadableStream, and other sources.
 */

// Result type not used directly - IteratorResult<T> is from the iterator protocol

/**
 * Options for asyncIteratorFrom
 */
export interface AsyncIteratorFromOptions {
	/** Signal to abort the iterator */
	signal?: AbortSignal;
	/** Buffer size for backpressure (default: 1) */
	bufferSize?: number;
}

/**
 * Create an async iterator from an EventTarget
 *
 * @example
 * ```typescript
 * const button = document.getElementById('myButton')
 * for await (const event of asyncIteratorFrom(button, 'click')) {
 *   console.log('Clicked!', event)
 * }
 * ```
 */
export function asyncIteratorFrom<T extends Event>(
	target: EventTarget,
	eventName: string,
	options: AsyncIteratorFromOptions = {},
): AsyncIterable<T> {
	const { signal, bufferSize = 1 } = options;

	if (signal?.aborted) {
		return (async function* () {})();
	}

	const buffer: T[] = [];
	let resolveNext: ((value: IteratorResult<T>) => void) | null = null;
	let done = false;

	const eventHandler = (event: Event) => {
		if (done) return;

		const typedEvent = event as T;

		if (resolveNext) {
			resolveNext({ value: typedEvent, done: false });
			resolveNext = null;
		} else if (buffer.length < bufferSize) {
			buffer.push(typedEvent);
		}
	};

	target.addEventListener(eventName, eventHandler);

	if (signal) {
		signal.addEventListener("abort", () => {
			done = true;
			if (resolveNext) {
				resolveNext({ value: undefined as unknown as T, done: true });
			}
		});
	}

	return {
		[Symbol.asyncIterator](): AsyncIterator<T> {
			return {
				next(): Promise<IteratorResult<T>> {
					if (done) {
						return Promise.resolve({
							value: undefined as unknown as T,
							done: true,
						});
					}

					if (buffer.length > 0) {
						return Promise.resolve({ value: buffer.shift()!, done: false });
					}

					return new Promise((resolve) => {
						resolveNext = resolve;
					});
				},

				return(): Promise<IteratorResult<T>> {
					done = true;
					target.removeEventListener(eventName, eventHandler);
					return Promise.resolve({
						value: undefined as unknown as T,
						done: true,
					});
				},
			};
		},
	};
}

/**
 * Create an async iterator from a WebSocket
 *
 * @example
 * ```typescript
 * const ws = new WebSocket('wss://example.com')
 * for await (const message of asyncIteratorFromWebSocket(ws)) {
 *   console.log('Received:', message.data)
 * }
 * ```
 */
export function asyncIteratorFromWebSocket(
	ws: WebSocket,
	options: AsyncIteratorFromOptions = {},
): AsyncIterable<MessageEvent> {
	const { signal } = options;

	if (signal?.aborted) {
		return (async function* () {})();
	}

	const buffer: MessageEvent[] = [];
	let resolveNext: ((value: IteratorResult<MessageEvent>) => void) | null =
		null;
	let done = false;

	const messageHandler = (event: MessageEvent) => {
		if (done) return;

		if (resolveNext) {
			resolveNext({ value: event, done: false });
			resolveNext = null;
		} else {
			buffer.push(event);
		}
	};

	const closeHandler = () => {
		done = true;
		if (resolveNext) {
			resolveNext({ value: undefined as unknown as MessageEvent, done: true });
		}
	};

	ws.addEventListener("message", messageHandler);
	ws.addEventListener("close", closeHandler);
	ws.addEventListener("error", closeHandler);

	if (signal) {
		signal.addEventListener("abort", () => {
			ws.close();
		});
	}

	return {
		[Symbol.asyncIterator](): AsyncIterator<MessageEvent> {
			return {
				next(): Promise<IteratorResult<MessageEvent>> {
					if (done && buffer.length === 0) {
						return Promise.resolve({
							value: undefined as unknown as MessageEvent,
							done: true,
						});
					}

					if (buffer.length > 0) {
						return Promise.resolve({ value: buffer.shift()!, done: false });
					}

					return new Promise((resolve) => {
						resolveNext = resolve;
					});
				},

				return(): Promise<IteratorResult<MessageEvent>> {
					done = true;
					ws.removeEventListener("message", messageHandler);
					ws.removeEventListener("close", closeHandler);
					ws.removeEventListener("error", closeHandler);
					ws.close();
					return Promise.resolve({
						value: undefined as unknown as MessageEvent,
						done: true,
					});
				},
			};
		},
	};
}

/**
 * Create an async iterator that yields values at a fixed interval
 *
 * @example
 * ```typescript
 * for await (const i of interval(1000)) {
 *   console.log('Tick', i)
 *   if (i >= 5) break
 * }
 * ```
 */
export function interval(
	ms: number,
	options: AsyncIteratorFromOptions = {},
): AsyncIterable<number> {
	const { signal } = options;

	if (signal?.aborted) {
		return (async function* () {})();
	}

	let count = 0;
	let done = false;

	return {
		[Symbol.asyncIterator](): AsyncIterator<number> {
			return {
				next(): Promise<IteratorResult<number>> {
					if (done || signal?.aborted) {
						return Promise.resolve({
							value: undefined as unknown as number,
							done: true,
						});
					}

					return new Promise((resolve) => {
						const timeout = setTimeout(() => {
							resolve({ value: count++, done: false });
						}, ms);

						if (signal) {
							signal.addEventListener(
								"abort",
								() => {
									clearTimeout(timeout);
									resolve({
										value: undefined as unknown as number,
										done: true,
									});
								},
								{ once: true },
							);
						}
					});
				},

				return(): Promise<IteratorResult<number>> {
					done = true;
					return Promise.resolve({
						value: undefined as unknown as number,
						done: true,
					});
				},
			};
		},
	};
}

/**
 * Create an async iterator from an array with async delay between items
 *
 * @example
 * ```typescript
 * for await (const item of fromArray([1, 2, 3], { delay: 100 })) {
 *   console.log(item) // 1, 2, 3 with 100ms delay
 * }
 * ```
 */
export interface FromArrayOptions extends AsyncIteratorFromOptions {
	/** Delay between items in ms */
	delay?: number;
}

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
 * Catch errors in an async iterable and continue with fallback
 */
export function catchError<T>(
	iterable: AsyncIterable<T>,
	handler: (error: unknown) => AsyncIterable<T> | Promise<AsyncIterable<T>>,
): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			try {
				yield* iterable;
			} catch (error) {
				yield* await handler(error);
			}
		},
	};
}

/**
 * Type guard to check if something is async iterable
 */
export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"
	);
}

/**
 * Convert a promise to an async iterable that yields the result once
 */
export function fromPromise<T>(promise: Promise<T>): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			yield await promise;
		},
	};
}

/**
 * Create an async iterable that yields a single value
 */
export function of<T>(value: T): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			yield value;
		},
	};
}

/**
 * Create an empty async iterable
 */
export function empty<T>(): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator](): AsyncIterator<T> {
			// No values
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
