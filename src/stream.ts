/**
 * Stream class for go-go-scope - Lazy async iterable processing
 *
 * Provides composable, lazy stream operations with structured concurrency.
 * Integrates with Scope for automatic cancellation.
 */

import type { Scope } from "./scope.js";
import type { Result } from "./types.js";

/**
 * A lazy stream that processes async iterables with composable operations.
 * Integrates with Scope for automatic cancellation.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const [err, results] = await s.stream(fetchData())
 *   .map(x => x * 2)
 *   .filter(x => x > 10)
 *   .take(5)
 *   .toArray()
 * ```
 */
export class Stream<T> implements AsyncIterable<T>, AsyncDisposable {
	private source: () => AsyncGenerator<T>;
	private scope: Scope;

	constructor(source: AsyncIterable<T>, scope: Scope) {
		this.scope = scope;
		const iterator = source[Symbol.asyncIterator]();

		// Wrap iterator with cancellation support
		this.source = async function* () {
			try {
				while (true) {
					// Check cancellation before each iteration
					if (scope.signal.aborted) {
						throw scope.signal.reason;
					}

					const result = await iterator.next();

					if (scope.signal.aborted) {
						throw scope.signal.reason;
					}

					if (result.done) break;
					yield result.value;
				}
			} finally {
				// Ensure iterator cleanup
				await iterator.return?.(undefined);
			}
		};
	}

	/**
	 * Async iterator - allows for await...of loops.
	 * Automatically disposes when the loop breaks or completes.
	 */
	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		const gen = this.source();
		try {
			while (true) {
				const result = await gen.next();
				if (result.done) break;
				yield result.value;
			}
		} finally {
			await gen.return?.(undefined);
		}
	}

	/**
	 * Dispose the stream - cancels any pending operations.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		// The scope handles cancellation
		// This method exists for compatibility with 'await using'
	}

	// ============================================================================
	// Transformations
	// ============================================================================

	/**
	 * Transform each value.
	 * Lazy - applies as values flow through.
	 */
	map<R>(fn: (value: T, index: number) => R): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				let index = 0;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					yield fn(value, index++);
				}
			})(),
			scope,
		);
	}

	/**
	 * Filter values based on predicate.
	 * Lazy - filters as values flow through.
	 */
	filter(predicate: (value: T, index: number) => boolean): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let index = 0;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (predicate(value, index++)) {
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Map and flatten in one operation.
	 * Lazy - flattens as values flow through.
	 */
	flatMap<R>(
		fn: (value: T, index: number) => Iterable<R> | AsyncIterable<R>,
	): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				let index = 0;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const inner = fn(value, index++);
					for await (const innerValue of inner) {
						scope.signal.throwIfAborted();
						yield innerValue;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Flatten a stream of iterables.
	 * Lazy - flattens one level.
	 */
	flatten<R>(this: Stream<Iterable<R> | AsyncIterable<R>>): Stream<R> {
		return this.flatMap((x) => x);
	}

	/**
	 * Tap into the stream to perform side effects without modifying values.
	 * Lazy - executes effect as values flow through.
	 */
	tap(fn: (value: T) => void | Promise<void>): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					await fn(value);
					scope.signal.throwIfAborted();
					yield value;
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Error Handling
	// ============================================================================

	/**
	 * Catch errors and recover with a fallback stream.
	 * Lazy - catches errors as they occur.
	 */
	catchAll<R>(handler: (error: unknown) => AsyncIterable<R>): Stream<T | R> {
		const self = this;
		const scope = this.scope;

		return new Stream<T | R>(
			(async function* () {
				try {
					for await (const value of self) {
						scope.signal.throwIfAborted();
						yield value;
					}
				} catch (err) {
					scope.signal.throwIfAborted();
					for await (const value of handler(err)) {
						scope.signal.throwIfAborted();
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Transform failures into successes, or provide fallback for empty streams.
	 * On error, discards all values and yields from fallback instead.
	 * Lazy - catches errors as they occur, or uses fallback if stream is empty.
	 */
	orElse<R>(fallback: Stream<R>): Stream<T | R> {
		const self = this;
		const scope = this.scope;

		return new Stream<T | R>(
			(async function* () {
				const buffer: T[] = [];
				let hasError = false;
				try {
					for await (const value of self) {
						buffer.push(value);
					}
				} catch (_err) {
					hasError = true;
				}

				// If error occurred or no values, use fallback
				if (hasError || buffer.length === 0) {
					for await (const value of fallback) {
						yield value;
					}
				} else {
					// Success - yield buffered values
					for (const value of buffer) {
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Provide fallback if stream is empty (no values yielded).
	 * Lazy - uses fallback only if source completes without values.
	 */
	orElseIfEmpty<R>(fallback: Stream<R>): Stream<T | R> {
		const self = this;
		const scope = this.scope;

		return new Stream<T | R>(
			(async function* () {
				let hasValue = false;
				for await (const value of self) {
					hasValue = true;
					yield value;
				}
				if (!hasValue) {
					for await (const value of fallback) {
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Provide a fallback value if the stream fails.
	 * Lazy - catches errors as they occur.
	 */
	orElseSucceed(fallback: T): Stream<T> {
		return this.catchAll(() =>
			(async function* () {
				yield fallback;
			})(),
		);
	}

	/**
	 * Alias for catchAll - catch errors and recover with a fallback stream.
	 * Lazy - catches errors as they occur.
	 */
	catchError<R>(handler: (error: unknown) => AsyncIterable<R>): Stream<T | R> {
		return this.catchAll(handler);
	}

	/**
	 * Tap into errors to perform side effects without modifying the error.
	 * Lazy - executes effect when errors occur.
	 */
	tapError(fn: (error: unknown) => void | Promise<void>): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				try {
					for await (const value of self) {
						yield value;
					}
				} catch (err) {
					await fn(err);
					throw err;
				}
			})(),
			scope,
		);
	}

	/**
	 * Transform errors using a mapping function.
	 * Lazy - transforms errors as they occur.
	 */
	mapError(fn: (error: unknown) => unknown): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				try {
					for await (const value of self) {
						yield value;
					}
				} catch (err) {
					throw fn(err);
				}
			})(),
			scope,
		);
	}

	/**
	 * Run a cleanup effect when the stream completes (success or error).
	 * Lazy - runs cleanup on completion.
	 */
	ensuring(cleanup: () => void | Promise<void>): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				try {
					for await (const value of self) {
						yield value;
					}
				} finally {
					await cleanup();
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Slicing
	// ============================================================================

	/**
	 * Take first n elements.
	 * Lazy - stops after n elements.
	 */
	take(n: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let count = 0;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (count >= n) break;
					yield value;
					count++;
				}
			})(),
			scope,
		);
	}

	/**
	 * Take elements while predicate holds.
	 * Lazy - stops when predicate fails.
	 */
	takeWhile(predicate: (value: T) => boolean): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (!predicate(value)) break;
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Take elements until predicate holds (inclusive).
	 * Lazy - stops when predicate succeeds, including that element.
	 */
	takeUntil(predicate: (value: T) => boolean): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					yield value;
					if (predicate(value)) break;
				}
			})(),
			scope,
		);
	}

	/**
	 * Drop first n elements.
	 * Lazy - skips first n elements.
	 */
	drop(n: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let count = 0;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (count < n) {
						count++;
						continue;
					}
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Drop elements while predicate holds.
	 * Lazy - skips while predicate holds.
	 */
	dropWhile(predicate: (value: T) => boolean): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let dropping = true;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (dropping && predicate(value)) {
						continue;
					}
					dropping = false;
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Drop elements until predicate holds (inclusive).
	 * Lazy - skips until predicate succeeds, then yields that element and rest.
	 */
	dropUntil(predicate: (value: T) => boolean): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let dropping = true;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (dropping) {
						if (predicate(value)) {
							dropping = false;
							yield value;
						}
					} else {
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Alias for drop - skip first n elements.
	 */
	skip(n: number): Stream<T> {
		return this.drop(n);
	}

	/**
	 * Map and filter in one operation - returns Option-like behavior.
	 * Lazy - transforms and filters as values flow through.
	 */
	filterMap<R>(fn: (value: T) => R | undefined | null): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const result = fn(value);
					if (result !== undefined && result !== null) {
						yield result;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Group consecutive elements by key function.
	 * Emits arrays of consecutive elements with the same key.
	 * Lazy - groups as values flow through.
	 */
	groupAdjacentBy<K>(keyFn: (value: T) => K): Stream<T[]> {
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				let currentGroup: T[] = [];
				let currentKey: K | undefined;
				let hasKey = false;

				for await (const value of self) {
					scope.signal.throwIfAborted();
					const key = keyFn(value);

					if (!hasKey) {
						// First element
						currentKey = key;
						hasKey = true;
						currentGroup = [value];
					} else if (key === currentKey) {
						// Same key - add to current group
						currentGroup.push(value);
					} else {
						// Different key - yield current group and start new
						yield currentGroup;
						currentKey = key;
						currentGroup = [value];
					}
				}

				// Yield final group
				if (currentGroup.length > 0) {
					yield currentGroup;
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Accumulating
	// ============================================================================

	/**
	 * Scan (running fold) - emit intermediate results.
	 * Lazy - emits as values accumulate.
	 */
	scan<R>(fn: (acc: R, value: T) => R, initial: R): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				let acc = initial;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					acc = fn(acc, value);
					yield acc;
				}
			})(),
			scope,
		);
	}

	/**
	 * Buffer values into chunks.
	 * Lazy - buffers as values flow through.
	 */
	buffer(size: number): Stream<T[]> {
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				const buffer: T[] = [];
				for await (const value of self) {
					scope.signal.throwIfAborted();
					buffer.push(value);
					if (buffer.length >= size) {
						yield buffer.splice(0, buffer.length);
					}
				}
				if (buffer.length > 0) {
					yield buffer;
				}
			})(),
			scope,
		);
	}

	/**
	 * Buffer values into chunks within time windows.
	 * Emits chunks when size is reached OR when window expires.
	 * Lazy - buffers as values flow through.
	 */
	bufferTime(windowMs: number): Stream<T[]> {
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				const buffer: T[] = [];
				let lastEmit = Date.now();

				for await (const value of self) {
					scope.signal.throwIfAborted();
					buffer.push(value);

					const now = Date.now();
					if (now - lastEmit >= windowMs) {
						yield buffer.splice(0, buffer.length);
						lastEmit = now;
					}
				}

				// Emit remaining values
				if (buffer.length > 0) {
					yield buffer;
				}
			})(),
			scope,
		);
	}

	/**
	 * Buffer values into chunks within time windows or when size limit is reached.
	 * Emits chunks when size is reached OR when window expires.
	 * Lazy - buffers as values flow through.
	 */
	bufferTimeOrCount(windowMs: number, count: number): Stream<T[]> {
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				const buffer: T[] = [];
				let lastEmit = Date.now();

				for await (const value of self) {
					scope.signal.throwIfAborted();
					buffer.push(value);

					const now = Date.now();
					const timeExceeded = now - lastEmit >= windowMs;
					const countExceeded = buffer.length >= count;

					if (timeExceeded || countExceeded) {
						yield buffer.splice(0, buffer.length);
						lastEmit = now;
					}
				}

				// Emit remaining values
				if (buffer.length > 0) {
					yield buffer;
				}
			})(),
			scope,
		);
	}

	/**
	 * Emit only changed values (compared with ===).
	 * Lazy - filters duplicates as they occur.
	 */
	distinct(): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const seen = new Set<T>();
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (!seen.has(value)) {
						seen.add(value);
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Emit only changed values based on key function.
	 * Lazy - filters duplicates as they occur.
	 */
	distinctBy<K>(keyFn: (value: T) => K): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const seen = new Set<K>();
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const key = keyFn(value);
					if (!seen.has(key)) {
						seen.add(key);
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Emit only values different from the previous one.
	 * Lazy - filters consecutive duplicates.
	 */
	distinctAdjacent(): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let last: T | undefined;
				let hasLast = false;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (!hasLast || last !== value) {
						last = value;
						hasLast = true;
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Emit only values different from the previous one based on key function.
	 * Lazy - filters consecutive duplicates.
	 */
	distinctAdjacentBy<K>(keyFn: (value: T) => K): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let lastKey: K | undefined;
				let hasLast = false;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const key = keyFn(value);
					if (!hasLast || lastKey !== key) {
						lastKey = key;
						hasLast = true;
						yield value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Prepend values to the stream.
	 * Lazy - prepends then continues with source.
	 */
	prepend(...values: T[]): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for (const value of values) {
					scope.signal.throwIfAborted();
					yield value;
				}
				for await (const value of self) {
					scope.signal.throwIfAborted();
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Append values to the stream.
	 * Lazy - appends after source completes.
	 */
	append(...values: T[]): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					yield value;
				}
				for (const value of values) {
					scope.signal.throwIfAborted();
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Concatenate another stream after this one.
	 * Lazy - continues with other after this completes.
	 */
	concat(other: Stream<T>): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					yield value;
				}
				for await (const value of other) {
					scope.signal.throwIfAborted();
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Intersperse a separator between values.
	 * Lazy - intersperses as values flow through.
	 */
	intersperse(separator: T): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let first = true;
				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (!first) yield separator;
					first = false;
					yield value;
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Timing
	// ============================================================================

	/**
	 * Add delay between elements.
	 * Lazy - delays as values flow through.
	 */
	delay(ms: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					await new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(resolve, ms);
						scope.signal.addEventListener(
							"abort",
							() => {
								clearTimeout(timeout);
								reject(scope.signal.reason);
							},
							{ once: true },
						);
					});
					scope.signal.throwIfAborted();
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Throttle the stream (limit rate).
	 * Allows up to `limit` elements per `interval` milliseconds.
	 * Lazy - throttles as values flow through.
	 */
	throttle(options: { limit: number; interval: number }): Stream<T> {
		const self = this;
		const scope = this.scope;
		const { limit, interval } = options;

		return new Stream<T>(
			(async function* () {
				let windowStart = Date.now();
				let count = 0;

				for await (const value of self) {
					scope.signal.throwIfAborted();

					const now = Date.now();
					const elapsed = now - windowStart;

					// Reset window if interval has passed
					if (elapsed >= interval) {
						windowStart = now;
						count = 0;
					}

					// If we've exceeded the limit, wait for next window
					if (count >= limit) {
						const waitTime = interval - elapsed;
						await new Promise<void>((resolve, reject) => {
							const timeout = setTimeout(resolve, waitTime);
							scope.signal.addEventListener(
								"abort",
								() => {
									clearTimeout(timeout);
									reject(scope.signal.reason);
								},
								{ once: true },
							);
						});
						windowStart = Date.now();
						count = 0;
					}

					scope.signal.throwIfAborted();
					count++;
					yield value;
				}
			})(),
			scope,
		);
	}

	/**
	 * Debounce the stream (wait for quiet period).
	 * Emits only after ms of silence.
	 * Lazy - debounces as values flow through.
	 */
	debounce(ms: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let timeoutId: ReturnType<typeof setTimeout> | undefined;
				let latestValue: T | undefined;
				let hasValue = false;
				let sourceDone = false;
				let deferredResolve: (() => void) | undefined;

				// Start consuming the source
				const consumePromise = (async () => {
					try {
						for await (const value of self) {
							scope.signal.throwIfAborted();
							latestValue = value;
							hasValue = true;

							// Clear existing timeout
							if (timeoutId) {
								clearTimeout(timeoutId);
							}

							// Set new timeout
							timeoutId = setTimeout(() => {
								if (deferredResolve) {
									deferredResolve();
								}
							}, ms);
						}
					} finally {
						sourceDone = true;
						// One final timeout for the last value
						if (timeoutId) {
							clearTimeout(timeoutId);
						}
						if (hasValue) {
							timeoutId = setTimeout(() => {
								if (deferredResolve) {
									deferredResolve();
								}
							}, ms);
						} else if (deferredResolve) {
							// No pending value, signal completion immediately
							deferredResolve();
						}
					}
				})();

				try {
					// Yield debounced values
					while (true) {
						scope.signal.throwIfAborted();

						// Wait for timeout
						await new Promise<void>((resolve, reject) => {
							deferredResolve = resolve;
							scope.signal.addEventListener(
								"abort",
								() => {
									reject(scope.signal.reason);
								},
								{ once: true },
							);
						});

						scope.signal.throwIfAborted();

						// Emit the debounced value
						if (hasValue) {
							yield latestValue!;
							hasValue = false;
							latestValue = undefined;
						}

						// Exit if source is done and no more values pending
						if (sourceDone && !hasValue) {
							break;
						}
					}
				} finally {
					// Cleanup
					if (timeoutId) clearTimeout(timeoutId);
					// Ensure iterator cleanup
					try {
						await consumePromise;
					} catch {
						/* ignore */
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Add delay between elements (space them out).
	 * Waits the specified delay after yielding each element.
	 * Lazy - spaces elements as they flow through.
	 */
	spaced(delayMs: number): Stream<T> {
		return this.delay(delayMs);
	}

	/**
	 * Timeout the entire stream.
	 * Fails if stream doesn't complete within duration.
	 * Lazy - applies timeout to the entire stream.
	 */
	timeout(durationMs: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const timeoutPromise = new Promise<never>((_, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error(`Stream timed out after ${durationMs}ms`));
					}, durationMs);
					scope.signal.addEventListener(
						"abort",
						() => {
							clearTimeout(timeout);
							reject(scope.signal.reason);
						},
						{ once: true },
					);
				});

				const streamPromise = (async function* () {
					for await (const value of self) {
						scope.signal.throwIfAborted();
						yield value;
					}
				})();

				// Race between timeout and stream
				const iterator = streamPromise[Symbol.asyncIterator]();
				try {
					while (true) {
						const result = await Promise.race([
							iterator.next(),
							timeoutPromise,
						]);
						if (result.done) break;
						yield result.value;
					}
				} finally {
					await iterator.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Combining
	// ============================================================================

	/**
	 * Merge with another stream (interleave values).
	 * Both streams are consumed concurrently.
	 * Lazy - merges as values arrive from either stream.
	 */
	merge(other: Stream<T>): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const selfQueue: T[] = [];
				const otherQueue: T[] = [];
				let selfDone = false;
				let otherDone = false;

				// Start consuming self
				const selfPromise = (async () => {
					try {
						for await (const value of self) {
							selfQueue.push(value);
						}
					} finally {
						selfDone = true;
					}
				})();

				// Start consuming other
				const otherPromise = (async () => {
					try {
						for await (const value of other) {
							otherQueue.push(value);
						}
					} finally {
						otherDone = true;
					}
				})();

				// Interleave from queues
				while (
					!selfDone ||
					!otherDone ||
					selfQueue.length > 0 ||
					otherQueue.length > 0
				) {
					scope.signal.throwIfAborted();

					// Yield from self if available
					if (selfQueue.length > 0) {
						yield selfQueue.shift()!;
					}

					// Yield from other if available
					if (otherQueue.length > 0) {
						yield otherQueue.shift()!;
					}

					// If both queues empty but not done, wait a bit
					if (
						selfQueue.length === 0 &&
						otherQueue.length === 0 &&
						(!selfDone || !otherDone)
					) {
						await new Promise((r) => setTimeout(r, 1));
					}
				}

				// Wait for cleanup
				try {
					await selfPromise;
				} catch {
					/* ignore */
				}
				try {
					await otherPromise;
				} catch {
					/* ignore */
				}
			})(),
			scope,
		);
	}

	/**
	 * Zip with another stream - pair elements.
	 * Stops when either stream ends.
	 * Lazy - zips as values arrive.
	 */
	zip<R>(other: Stream<R>): Stream<[T, R]> {
		const self = this;
		const scope = this.scope;

		return new Stream<[T, R]>(
			(async function* () {
				const selfIterator = self[Symbol.asyncIterator]();
				const otherIterator = other[Symbol.asyncIterator]();

				try {
					while (true) {
						scope.signal.throwIfAborted();

						const [selfResult, otherResult] = await Promise.all([
							selfIterator.next(),
							otherIterator.next(),
						]);

						if (selfResult.done || otherResult.done) break;

						yield [selfResult.value, otherResult.value];
					}
				} finally {
					await selfIterator.return?.(undefined);
					await otherIterator.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	/**
	 * Zip with index.
	 * Lazy - adds index as values flow through.
	 */
	zipWithIndex(): Stream<[T, number]> {
		return this.map((value, index) => [value, index]);
	}

	/**
	 * Zip with another stream using a combining function.
	 * Stops when either stream ends.
	 * Lazy - zips as values arrive.
	 */
	zipWith<R, Z>(other: Stream<R>, fn: (a: T, b: R) => Z): Stream<Z> {
		return this.zip(other).map(([a, b]) => fn(a, b));
	}

	/**
	 * Zip with another stream, using the latest value from each.
	 * Emits whenever either stream emits, using the most recent value from the other.
	 * Stops when either stream ends.
	 * Lazy - emits as values arrive.
	 *
	 * @example
	 * ```typescript
	 * const s1 = s.stream(interval(100)).map(() => 'a')
	 * const s2 = s.stream(interval(150)).map(() => 'b')
	 * const combined = s1.zipLatest(s2) // ['a', undefined], ['a', 'b'], ['a', 'b'], ...
	 * ```
	 */
	zipLatest<R>(other: Stream<R>): Stream<[T | undefined, R | undefined]> {
		const self = this;
		const scope = this.scope;

		return new Stream<[T | undefined, R | undefined]>(
			(async function* () {
				const selfIter = self[Symbol.asyncIterator]();
				const otherIter = other[Symbol.asyncIterator]();

				let selfValue: T | undefined;
				let otherValue: R | undefined;
				let selfDone = false;
				let otherDone = false;

				try {
					while (!selfDone || !otherDone) {
						scope.signal.throwIfAborted();

						const raceResult = await Promise.race([
							selfDone
								? new Promise<never>(() => {})
								: selfIter
										.next()
										.then((r) => ({ source: "self" as const, result: r })),
							otherDone
								? new Promise<never>(() => {})
								: otherIter
										.next()
										.then((r) => ({ source: "other" as const, result: r })),
						]);

						if (raceResult.source === "self") {
							if (raceResult.result.done) {
								selfDone = true;
							} else {
								selfValue = raceResult.result.value;
								yield [selfValue, otherValue];
							}
						} else {
							if (raceResult.result.done) {
								otherDone = true;
							} else {
								otherValue = raceResult.result.value;
								yield [selfValue, otherValue];
							}
						}
					}
				} finally {
					await selfIter.return?.(undefined);
					await otherIter.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	/**
	 * Zip with another stream, padding the shorter stream with a default value.
	 * Continues until both streams end.
	 * Lazy - zips as values arrive.
	 *
	 * @example
	 * ```typescript
	 * const s1 = s.stream(fromArray([1, 2, 3]))
	 * const s2 = s.stream(fromArray(['a', 'b']))
	 * const zipped = s1.zipAll(s2, 'default') // [1, 'a'], [2, 'b'], [3, 'default']
	 * ```
	 */
	zipAll<R, D>(
		other: Stream<R>,
		defaultSelf: T,
		defaultOther: D,
	): Stream<[T, R | D]> {
		const self = this;
		const scope = this.scope;

		return new Stream<[T, R | D]>(
			(async function* () {
				const selfIter = self[Symbol.asyncIterator]();
				const otherIter = other[Symbol.asyncIterator]();
				let selfValue: T | undefined;
				let otherValue: R | D | undefined;
				let selfDone = false;
				let otherDone = false;
				let selfYielded = false;
				let otherYielded = false;

				try {
					while (!selfDone || !otherDone) {
						scope.signal.throwIfAborted();

						if (!selfDone && !selfYielded) {
							const result = await selfIter.next();
							if (result.done) {
								selfDone = true;
							} else {
								selfValue = result.value;
								selfYielded = true;
							}
						}

						if (!otherDone && !otherYielded) {
							const result = await otherIter.next();
							if (result.done) {
								otherDone = true;
							} else {
								otherValue = result.value;
								otherYielded = true;
							}
						}

						if (selfYielded || otherYielded) {
							yield [
								selfYielded ? selfValue! : defaultSelf,
								otherYielded ? otherValue! : defaultOther,
							];
							selfYielded = false;
							otherYielded = false;
						} else if (selfDone && otherDone) {
							break;
						}
					}
				} finally {
					await selfIter.return?.(undefined);
					await otherIter.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	/**
	 * Interleave values from multiple streams fairly.
	 * Takes one value from each stream in round-robin fashion.
	 * Stops when all streams end.
	 * Lazy - interleaves as values arrive.
	 *
	 * @example
	 * ```typescript
	 * const s1 = s.stream(fromArray([1, 2, 3]))
	 * const s2 = s.stream(fromArray(['a', 'b', 'c']))
	 * const interleaved = s1.interleave(s2) // 1, 'a', 2, 'b', 3, 'c'
	 * ```
	 */
	interleave(...others: Stream<T>[]): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const streams = [self, ...others];
				const iterators = streams.map((s) => s[Symbol.asyncIterator]());
				const hasValues = iterators.map(() => true);
				let activeCount = iterators.length;

				try {
					while (activeCount > 0) {
						scope.signal.throwIfAborted();

						for (let i = 0; i < iterators.length; i++) {
							if (!hasValues[i]) continue;

							const result = await iterators[i].next();

							if (result.done) {
								hasValues[i] = false;
								activeCount--;
							} else {
								yield result.value;
							}
						}
					}
				} finally {
					await Promise.all(iterators.map((it) => it.return?.(undefined)));
				}
			})(),
			scope,
		);
	}

	/**
	 * Cartesian product of two streams.
	 * Emits all combinations of values from both streams.
	 * Collects the entire 'other' stream into memory.
	 * Lazy for the primary stream, buffers the secondary.
	 *
	 * @example
	 * ```typescript
	 * const s1 = s.stream(fromArray([1, 2]))
	 * const s2 = s.stream(fromArray(['a', 'b']))
	 * const product = s1.cross(s2) // [1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']
	 * ```
	 */
	cross<R>(other: Stream<R>): Stream<[T, R]> {
		const self = this;
		const scope = this.scope;

		return new Stream<[T, R]>(
			(async function* () {
				// Buffer the other stream (cross product requires full materialization of one side)
				const otherValues: R[] = [];
				const otherIter = other[Symbol.asyncIterator]();

				try {
					while (true) {
						scope.signal.throwIfAborted();
						const result = await otherIter.next();
						if (result.done) break;
						otherValues.push(result.value);
					}
				} finally {
					await otherIter.return?.(undefined);
				}

				// Yield cross product with each value from self
				for await (const selfValue of self) {
					scope.signal.throwIfAborted();
					for (const otherValue of otherValues) {
						yield [selfValue, otherValue];
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Group elements into chunks by size and/or time window.
	 * Emits a chunk when either the size limit is reached OR the time window expires.
	 * Lazy - groups as values flow through.
	 *
	 * @example
	 * ```typescript
	 * // Group by size (10 items) or time (100ms), whichever comes first
	 * const grouped = s.stream(source).groupedWithin(10, 100)
	 * // Yields: [[1,2,...,10], [11,12,...,20], ...] or partial groups after 100ms
	 * ```
	 */
	groupedWithin(size: number, windowMs: number): Stream<T[]> {
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				const buffer: T[] = [];
				let lastEmit = Date.now();
				let timeoutId: ReturnType<typeof setTimeout> | undefined;
				let resolveTimeout: (() => void) | undefined;

				const flushBuffer = async () => {
					if (buffer.length > 0) {
						const chunk = buffer.splice(0, buffer.length);
						return chunk;
					}
					return undefined;
				};

				const waitForTimeout = () =>
					new Promise<void>((resolve) => {
						resolveTimeout = resolve;
						timeoutId = setTimeout(() => {
							resolveTimeout = undefined;
							resolve();
						}, windowMs);
					});

				try {
					const iterator = self[Symbol.asyncIterator]();

					while (true) {
						scope.signal.throwIfAborted();

						const timeoutPromise = waitForTimeout();
						const nextPromise = iterator.next();

						const result = await Promise.race([timeoutPromise, nextPromise]);

						if (result === undefined) {
							// Timeout fired - flush buffer
							const chunk = await flushBuffer();
							if (chunk) yield chunk;
							lastEmit = Date.now();
						} else {
							// Got a value
							clearTimeout(timeoutId);
							resolveTimeout?.();

							if ((result as IteratorResult<T>).done) {
								// Stream ended - flush remaining
								const chunk = await flushBuffer();
								if (chunk) yield chunk;
								break;
							}

							buffer.push((result as IteratorResult<T>).value);

							if (buffer.length >= size) {
								const chunk = await flushBuffer();
								if (chunk) yield chunk;
								lastEmit = Date.now();
							}
						}
					}
				} finally {
					if (timeoutId) clearTimeout(timeoutId);
				}
			})(),
			scope,
		);
	}

	/**
	 * Group elements by a key function into substreams.
	 * Returns a Map where keys are the group keys and values are Streams of that group's elements.
	 * Each group stream buffers elements until consumed.
	 * Lazy - groups as values flow through.
	 *
	 * @example
	 * ```typescript
	 * const grouped = await s.stream(fromArray([1, 2, 3, 4, 5, 6])).groupByKey(x => x % 2 === 0 ? 'even' : 'odd')
	 * // await grouped.get('even').toArray() -> [2, 4, 6]
	 * // await grouped.get('odd').toArray() -> [1, 3, 5]
	 * ```
	 */
	groupByKey<K>(keyFn: (value: T) => K): {
		groups: Map<K, Stream<T>>;
		done: Promise<void>;
	} {
		const scope = this.scope;
		const buffers = new Map<K, BoundedQueue<T>>();
		const groups = new Map<K, Stream<T>>();

		// Create a getter that creates streams on demand
		const getOrCreateStream = (key: K): Stream<T> => {
			if (!groups.has(key)) {
				const buffer = new BoundedQueue<T>(Infinity);
				buffers.set(key, buffer);

				const stream = new Stream<T>(
					(async function* () {
						try {
							while (true) {
								if (scope.signal.aborted) throw scope.signal.reason;
								const result = await buffer.take(scope.signal);
								if (result.done) break;
								yield result.value;
							}
						} finally {
							buffer.complete();
						}
					})(),
					scope,
				);

				groups.set(key, stream);
			}
			return groups.get(key)!;
		};

		// Wrap the map to create streams on demand
		const proxiedGroups = new Proxy(groups, {
			get(target, prop) {
				if (prop === "get") {
					return (key: K) => getOrCreateStream(key);
				}
				return (target as unknown as Record<string | symbol, unknown>)[
					prop as string | symbol
				];
			},
		});

		// Start background distribution
		const done = (async () => {
			for await (const value of this) {
				if (scope.signal.aborted) break;
				const key = keyFn(value);

				// Ensure stream exists for this key
				if (!buffers.has(key)) {
					getOrCreateStream(key);
				}

				const buffer = buffers.get(key)!;
				await buffer.offer(value, scope.signal);
			}

			// Close all buffers when source ends
			for (const buffer of buffers.values()) {
				buffer.complete();
			}
		})();

		return { groups: proxiedGroups as Map<K, Stream<T>>, done };
	}

	// ============================================================================
	// Advanced
	// ============================================================================

	/**
	 * Switch map - cancel previous inner stream when new outer value arrives.
	 * Lazy - switches as outer values arrive.
	 *
	 * With synchronous outer streams, inner streams are cancelled after yielding
	 * their first value (reactive cancellation).
	 */
	switchMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				const outerIterator = self[Symbol.asyncIterator]();
				let currentInnerIterator: AsyncIterator<R> | undefined;
				const outerQueue: T[] = [];
				let outerDone = false;
				let innerDone = false;

				// Pre-fetch outer values into queue
				const prefetchOuter = async () => {
					try {
						while (!outerDone) {
							const result = await outerIterator.next();
							if (result.done) {
								outerDone = true;
							} else {
								outerQueue.push(result.value);
							}
						}
					} catch {
						// Ignore errors - they'll be handled by main loop
					}
				};

				// Start prefetching
				const prefetchPromise = prefetchOuter();

				try {
					while (true) {
						scope.signal.throwIfAborted();

						// Get next outer value
						let outerValue: T;
						if (outerQueue.length > 0) {
							outerValue = outerQueue.shift()!;
						} else if (outerDone) {
							// No more outer values - drain current inner and exit
							if (currentInnerIterator && !innerDone) {
								while (true) {
									const r = await currentInnerIterator.next();
									if (r.done) break;
									yield r.value;
								}
							}
							break;
						} else {
							// Wait for outer value
							await new Promise<void>((resolve) => setTimeout(resolve, 1));
							continue;
						}

						// Cancel previous inner
						if (currentInnerIterator) {
							await currentInnerIterator.return?.(undefined);
						}

						// Start new inner
						const inner = fn(outerValue);
						currentInnerIterator = inner[Symbol.asyncIterator]();
						innerDone = false;

						// Try to get one value from inner, but cancel if outer has more
						while (!innerDone) {
							scope.signal.throwIfAborted();

							// Check if outer has more values (reactive cancellation)
							if (outerQueue.length > 0) {
								// Cancel current inner and switch
								break;
							}

							// Check if outer is done
							if (outerDone) {
								// Drain remaining inner values
								while (true) {
									const r = await currentInnerIterator.next();
									if (r.done) break;
									yield r.value;
								}
								return;
							}

							// Get next inner value
							const innerResult = await currentInnerIterator.next();
							if (innerResult.done) {
								innerDone = true;
							} else {
								yield innerResult.value;
							}
						}
					}
				} finally {
					if (currentInnerIterator) {
						await currentInnerIterator.return?.(undefined);
					}
					await outerIterator.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	// ============================================================================
	// Splitting
	// ============================================================================

	/**
	 * Partition stream into two based on predicate.
	 * Returns [pass, fail] tuple.
	 * Uses queue-based distribution - each stream has independent buffer.
	 * The faster stream can advance up to bufferSize elements ahead.
	 *
	 * @example
	 * ```typescript
	 * const [evens, odds] = s.stream(nums).partition(n => n % 2 === 0)
	 * const [_, evenArr] = await evens.toArray()
	 * const [__, oddArr] = await odds.toArray()
	 * ```
	 */
	partition(
		predicate: (value: T) => boolean,
		options?: { bufferSize?: number },
	): [Stream<T>, Stream<T>] {
		const bufferSize = options?.bufferSize ?? 16;

		// Create bounded queues for each partition
		const scope = this.scope;
		const trueQueue = new BoundedQueue<T>(bufferSize);
		const falseQueue = new BoundedQueue<T>(bufferSize);

		// Start background distribution immediately
		const startDistribution = async () => {
			const iterator = this[Symbol.asyncIterator]();
			try {
				while (!scope.signal.aborted) {
					const result = await iterator.next();
					if (result.done) break;

					if (predicate(result.value)) {
						await trueQueue.offer(result.value, scope.signal);
					} else {
						await falseQueue.offer(result.value, scope.signal);
					}
				}
			} catch (err) {
				trueQueue.fail(err);
				falseQueue.fail(err);
			} finally {
				await iterator.return?.(undefined);
				trueQueue.complete();
				falseQueue.complete();
			}
		};

		// Fire and forget
		startDistribution().catch(() => {});

		// Create streams from queues
		const trueStream = new Stream<T>(this.queueToGenerator(trueQueue), scope);
		const falseStream = new Stream<T>(this.queueToGenerator(falseQueue), scope);

		return [trueStream, falseStream];
	}

	/**
	 * Split stream at position n into two streams.
	 * Returns [firstN, rest] tuple.
	 * Uses queue-based distribution with independent consumption.
	 *
	 * @example
	 * ```typescript
	 * const [head, tail] = s.stream(items).splitAt(5)
	 * const [_, firstFive] = await head.toArray()
	 * const [__, rest] = await tail.toArray()
	 * ```
	 */
	splitAt(
		n: number,
		options?: { bufferSize?: number },
	): [Stream<T>, Stream<T>] {
		const scope = this.scope;
		const bufferSize = options?.bufferSize ?? 16;

		// Create bounded queues
		const headQueue = new BoundedQueue<T>(bufferSize);
		const tailQueue = new BoundedQueue<T>(bufferSize);

		// Start background distribution immediately
		const startDistribution = async () => {
			const iterator = this[Symbol.asyncIterator]();
			try {
				let count = 0;
				while (!scope.signal.aborted) {
					const result = await iterator.next();
					if (result.done) break;

					if (count < n) {
						await headQueue.offer(result.value, scope.signal);
						count++;
					} else {
						await tailQueue.offer(result.value, scope.signal);
					}
				}
			} catch (err) {
				headQueue.fail(err);
				tailQueue.fail(err);
			} finally {
				await iterator.return?.(undefined);
				headQueue.complete();
				tailQueue.complete();
			}
		};

		// Fire and forget
		startDistribution().catch(() => {});

		// Create streams from queues
		const headStream = new Stream<T>(this.queueToGenerator(headQueue), scope);
		const tailStream = new Stream<T>(this.queueToGenerator(tailQueue), scope);

		return [headStream, tailStream];
	}

	/**
	 * Helper to convert a bounded queue to an async generator.
	 */
	private queueToGenerator<R>(queue: BoundedQueue<R>): AsyncIterable<R> {
		const scope = this.scope;
		return (async function* () {
			while (true) {
				scope.signal.throwIfAborted();
				const result = await queue.take(scope.signal);
				if (result.done) break;
				if (result.error) throw result.error;
				yield result.value;
			}
		})();
	}

	/**
	 * Broadcast stream to multiple consumers.
	 * Returns array of streams that all receive the same values.
	 * Uses queue-based distribution with independent consumption.
	 * Auto-registers with scope for cleanup.
	 *
	 * @example
	 * ```typescript
	 * const [stream1, stream2, stream3] = s.stream(source).broadcast(3)
	 *
	 * // Each consumer gets all values
	 * const [_, results1] = await stream1.toArray()
	 * const [__, results2] = await stream2.toArray()
	 * ```
	 */
	broadcast(n: number, options?: { bufferSize?: number }): Stream<T>[] {
		const bufferSize = options?.bufferSize ?? 0;
		const scope = this.scope;

		// Create bounded queues for each consumer
		const queues: BoundedQueue<T>[] = Array.from(
			{ length: n },
			() => new BoundedQueue<T>(bufferSize),
		);

		// Start background distribution immediately (not as a task)
		const startDistribution = async () => {
			const iterator = this[Symbol.asyncIterator]();
			try {
				while (!scope.signal.aborted) {
					const result = await iterator.next();
					if (result.done) break;

					// Offer to all queues in parallel
					await Promise.all(
						queues.map((q) => q.offer(result.value, scope.signal)),
					);
				}
			} catch (err) {
				for (const q of queues) q.fail(err);
			} finally {
				await iterator.return?.(undefined);
				for (const q of queues) q.complete();
			}
		};

		// Fire and forget the distributor
		startDistribution().catch(() => {});

		// Create streams from queues
		const streams = queues.map(
			(queue) => new Stream<T>(this.queueToGenerator(queue), scope),
		);

		return streams;
	}

	// ============================================================================
	// Terminal Operations
	// ============================================================================

	/**
	 * Collect all values into an array.
	 * Returns Result tuple for type-safe error handling.
	 */
	async toArray(): Promise<Result<unknown, T[]>> {
		try {
			const result: T[] = [];
			for await (const value of this) {
				result.push(value);
			}
			return [undefined, result];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Run the stream and discard values.
	 * Useful for side effects.
	 */
	async runDrain(): Promise<Result<unknown, void>> {
		try {
			for await (const _ of this) {
				// Just drain
			}
			return [undefined, undefined];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Alias for runDrain - consumes the stream without collecting values.
	 */
	drain(): Promise<Result<unknown, void>> {
		return this.runDrain();
	}

	/**
	 * Execute effect for each value.
	 * Similar to forEach but returns Result tuple.
	 */
	async forEach(
		fn: (value: T) => void | Promise<void>,
	): Promise<Result<unknown, void>> {
		try {
			for await (const value of this) {
				await fn(value);
			}
			return [undefined, undefined];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Fold the stream into a single value.
	 * Returns Result tuple for type-safe error handling.
	 */
	async fold<R>(
		initial: R,
		fn: (acc: R, value: T) => R,
	): Promise<Result<unknown, R>> {
		try {
			let acc = initial;
			for await (const value of this) {
				acc = fn(acc, value);
			}
			return [undefined, acc];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Count elements in the stream.
	 */
	async count(): Promise<Result<unknown, number>> {
		return this.fold(0, (acc) => acc + 1);
	}

	/**
	 * Find first element matching predicate.
	 * Returns undefined if not found.
	 */
	async find(
		predicate: (value: T) => boolean,
	): Promise<Result<unknown, T | undefined>> {
		try {
			for await (const value of this) {
				if (predicate(value)) {
					return [undefined, value];
				}
			}
			return [undefined, undefined];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Get first element.
	 * Returns undefined if empty.
	 */
	async first(): Promise<Result<unknown, T | undefined>> {
		return this.find(() => true);
	}

	/**
	 * Get last element.
	 * Returns undefined if empty.
	 */
	async last(): Promise<Result<unknown, T | undefined>> {
		try {
			let last: T | undefined;
			for await (const value of this) {
				last = value;
			}
			return [undefined, last];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Check if any element satisfies predicate.
	 */
	async some(
		predicate: (value: T) => boolean,
	): Promise<Result<unknown, boolean>> {
		const [err, result] = await this.find(predicate);
		if (err) return [err, undefined];
		return [undefined, result !== undefined];
	}

	/**
	 * Check if all elements satisfy predicate.
	 */
	async every(
		predicate: (value: T) => boolean,
	): Promise<Result<unknown, boolean>> {
		try {
			for await (const value of this) {
				if (!predicate(value)) {
					return [undefined, false];
				}
			}
			return [undefined, true];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Check if stream includes a value (using ===).
	 */
	async includes(value: T): Promise<Result<unknown, boolean>> {
		return this.some((v) => v === value);
	}

	/**
	 * Group elements by key function.
	 * Materializes all values into a Map.
	 */
	async groupBy<K>(
		keyFn: (value: T) => K,
	): Promise<Result<unknown, Map<K, T[]>>> {
		try {
			const groups = new Map<K, T[]>();
			for await (const value of this) {
				const key = keyFn(value);
				const group = groups.get(key);
				if (group) {
					group.push(value);
				} else {
					groups.set(key, [value]);
				}
			}
			return [undefined, groups];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Reduce to a single value.
	 * Returns Result tuple for type-safe error handling.
	 */
	async reduce(
		fn: (acc: T, value: T) => T,
	): Promise<Result<unknown, T | undefined>> {
		try {
			let acc: T | undefined;
			let first = true;
			for await (const value of this) {
				if (first) {
					acc = value;
					first = false;
				} else {
					acc = fn(acc!, value);
				}
			}
			return [undefined, acc];
		} catch (err) {
			return [err, undefined];
		}
	}

	/**
	 * Sum all numeric values.
	 */
	async sum(): Promise<Result<unknown, number>> {
		return this.fold(0, (acc, v) => acc + (v as unknown as number));
	}

	/**
	 * Retry the stream on failure with configurable delay.
	 * Eager - retries immediately on failure.
	 */
	retry(options?: { maxRetries?: number; delay?: number }): Stream<T> {
		const self = this;
		const scope = this.scope;
		const maxRetries = options?.maxRetries ?? 3;
		const delay = options?.delay ?? 0;

		return new Stream<T>(
			(async function* () {
				let attempt = 0;
				while (true) {
					try {
						for await (const value of self) {
							scope.signal.throwIfAborted();
							yield value;
						}
						return; // Success - we're done
					} catch (err) {
						attempt++;
						if (attempt > maxRetries) {
							throw err;
						}
						if (delay > 0) {
							await new Promise<void>((resolve, reject) => {
								const timeout = setTimeout(resolve, delay);
								scope.signal.addEventListener(
									"abort",
									() => {
										clearTimeout(timeout);
										reject(scope.signal.reason);
									},
									{ once: true },
								);
							});
						}
					}
				}
			})(),
			scope,
		);
	}
}

/**
 * Bounded queue for stream distribution.
 * Provides backpressure via blocking offer when full.
 */
class BoundedQueue<T> {
	private buffer: T[] = [];
	private waiters: Array<{
		resolve: () => void;
		reject: (e: unknown) => void;
	}> = [];
	private takers: Array<{
		resolve: (r: QueueResult<T>) => void;
		reject: (e: unknown) => void;
	}> = [];
	private completed = false;
	private error: unknown = undefined;

	constructor(private capacity: number) {}

	/**
	 * Offer a value to the queue.
	 * Blocks if queue is full until space is available.
	 */
	async offer(value: T, signal: AbortSignal): Promise<void> {
		if (this.completed) return;
		if (signal.aborted) throw signal.reason;

		// Wait until there's space
		while (
			this.buffer.length >= this.capacity &&
			!this.completed &&
			!signal.aborted
		) {
			await new Promise<void>((resolve, reject) => {
				const abortHandler = () => {
					const idx = this.waiters.findIndex((w) => w.resolve === resolve);
					if (idx >= 0) this.waiters.splice(idx, 1);
					reject(signal.reason);
				};

				const waiter = {
					resolve: () => {
						signal.removeEventListener("abort", abortHandler);
						resolve();
					},
					reject: (e: unknown) => {
						signal.removeEventListener("abort", abortHandler);
						reject(e);
					},
				};

				this.waiters.push(waiter);
				signal.addEventListener("abort", abortHandler, { once: true });
			});
		}

		if (signal.aborted) throw signal.reason;
		if (this.completed) return;

		// Add to buffer
		this.buffer.push(value);

		// Wake up a taker if any
		const taker = this.takers.shift();
		if (taker) {
			taker.resolve({
				done: false,
				value: this.buffer.shift()!,
				error: undefined,
			});
		}

		// Wake up next waiter if there's now space
		if (this.buffer.length < this.capacity) {
			const waiter = this.waiters.shift();
			if (waiter) waiter.resolve();
		}
	}

	/**
	 * Take a value from the queue.
	 * Blocks until value is available.
	 */
	async take(signal: AbortSignal): Promise<QueueResult<T>> {
		if (signal.aborted) throw signal.reason;

		// Return immediately if buffer has values
		if (this.buffer.length > 0) {
			const value = this.buffer.shift()!;

			// Wake up a waiter if there was backpressure
			const waiter = this.waiters.shift();
			if (waiter) waiter.resolve();

			return { done: false, value, error: undefined };
		}

		// Return if completed
		if (this.completed) {
			if (this.error) {
				return {
					done: true,
					value: undefined as unknown as T,
					error: this.error,
				};
			}
			return { done: true, value: undefined as unknown as T, error: undefined };
		}

		// Wait for a value
		return new Promise<QueueResult<T>>((resolve, reject) => {
			const abortHandler = () => {
				const idx = this.takers.findIndex((t) => t.resolve === resolve);
				if (idx >= 0) this.takers.splice(idx, 1);
				reject(signal.reason);
			};

			const taker = {
				resolve: (r: QueueResult<T>) => {
					signal.removeEventListener("abort", abortHandler);
					resolve(r);
				},
				reject: (e: unknown) => {
					signal.removeEventListener("abort", abortHandler);
					reject(e);
				},
			};

			this.takers.push(taker);
			signal.addEventListener("abort", abortHandler, { once: true });
		});
	}

	/**
	 * Mark queue as complete.
	 */
	complete(): void {
		this.completed = true;
		// Wake up all waiters
		while (this.waiters.length > 0) {
			this.waiters.shift()?.resolve();
		}
		// Wake up all takers with done
		while (this.takers.length > 0) {
			this.takers.shift()?.resolve({
				done: true,
				value: undefined as unknown as T,
				error: this.error,
			});
		}
	}

	/**
	 * Mark queue as failed.
	 */
	fail(err: unknown): void {
		this.error = err;
		this.completed = true;
		// Wake up all waiters with error
		while (this.waiters.length > 0) {
			this.waiters.shift()?.reject(err);
		}
		// Wake up all takers with error
		while (this.takers.length > 0) {
			this.takers
				.shift()
				?.resolve({ done: true, value: undefined as unknown as T, error: err });
		}
	}
}

interface QueueResult<T> {
	done: boolean;
	value: T;
	error: unknown;
}

/**
 * Hot observable - values are broadcast to all active subscribers.
 * @deprecated Use stream.broadcast() instead which provides queue-based distribution.
 */
export class SharedStream<T> implements AsyncDisposable {
	private source: Stream<T>;
	private scope: Scope;
	private bufferSize: number;
	private subscribers: Set<(value: T) => void> = new Set();
	private errorHandlers: Set<(error: unknown) => void> = new Set();
	private completeHandlers: Set<() => void> = new Set();
	private buffer: T[] = [];
	private started = false;

	constructor(source: Stream<T>, scope: Scope, bufferSize: number) {
		this.source = source;
		this.scope = scope;
		this.bufferSize = bufferSize;
	}

	/**
	 * Subscribe to the shared stream (internal use).
	 * Returns a dispose function to unsubscribe.
	 * @internal
	 */
	subscribe(
		onValue: (value: T) => void,
		onError?: (error: unknown) => void,
		onComplete?: () => void,
	): () => void {
		// Add to subscribers
		this.subscribers.add(onValue);
		if (onError) this.errorHandlers.add(onError);
		if (onComplete) this.completeHandlers.add(onComplete);

		// Replay buffered values to new subscriber
		for (const value of this.buffer) {
			onValue(value);
		}

		// Start consuming if not already started
		if (!this.started) {
			this.started = true;
			this._start();
		}

		// Return unsubscribe function
		return () => {
			this.subscribers.delete(onValue);
			if (onError) this.errorHandlers.delete(onError);
			if (onComplete) this.completeHandlers.delete(onComplete);
		};
	}

	/**
	 * Create a new Stream from this SharedStream.
	 * Each call creates a new consumer stream.
	 */
	asStream(): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				const buffer: T[] = [];
				let done = false;
				let streamError: unknown;

				const unsubscribe = self.subscribe(
					(v) => buffer.push(v),
					(e) => {
						streamError = e;
						done = true;
					},
					() => {
						done = true;
					},
				);

				try {
					while (!done || buffer.length > 0) {
						scope.signal.throwIfAborted();

						if (buffer.length > 0) {
							yield buffer.shift()!;
						} else {
							// Wait a bit for more values
							await new Promise((resolve, reject) => {
								const timeout = setTimeout(resolve, 10);
								scope.signal.addEventListener(
									"abort",
									() => {
										clearTimeout(timeout);
										reject(scope.signal.reason);
									},
									{ once: true },
								);
							});
						}

						if (streamError) throw streamError;
					}
				} finally {
					unsubscribe();
				}
			})(),
			scope,
		);
	}

	private async _start(): Promise<void> {
		try {
			for await (const value of this.source) {
				if (this.scope.signal.aborted) break;

				// Add to buffer
				this.buffer.push(value);
				if (this.buffer.length > this.bufferSize) {
					this.buffer.shift();
				}

				// Broadcast to all subscribers
				for (const sub of this.subscribers) {
					try {
						sub(value);
					} catch {
						// Ignore errors from subscribers
					}
				}
			}

			// Completed successfully
			// Notify completion
			for (const handler of this.completeHandlers) {
				try {
					handler();
				} catch {
					// Ignore errors
				}
			}
		} catch (err) {
			// Store error for potential future use
			// Notify error
			for (const handler of this.errorHandlers) {
				try {
					handler(err);
				} catch {
					// Ignore errors
				}
			}
		}
	}

	async [Symbol.asyncDispose](): Promise<void> {
		this.subscribers.clear();
		this.errorHandlers.clear();
		this.completeHandlers.clear();
	}
}
