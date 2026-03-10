/**
 * Stream class for go-go-scope - Lazy async iterable processing
 *
 * Provides composable, lazy stream operations with structured concurrency.
 * Integrates with Scope for automatic cancellation.
 */

import type { Result, Scope, ScopePlugin } from "go-go-scope";

/**
 * A lazy stream that processes async iterables with composable operations.
 *
 * The Stream class provides a powerful, functional API for processing asynchronous
 * data streams. All operations are lazy - they don't execute until a terminal
 * operation like `toArray()`, `forEach()`, or `runDrain()` is called.
 *
 * Streams integrate seamlessly with go-go-scope's structured concurrency system,
 * automatically respecting scope cancellation and cleaning up resources.
 *
 * @template T - The type of values in the stream
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope'
 * import { streamPlugin } from '@go-go-scope/stream'
 *
 * await using s = scope({ plugins: [streamPlugin] })
 *
 * // Transform data with a pipeline of operations
 * const [err, results] = await s.stream(fetchData())
 *   .map(x => x * 2)
 *   .filter(x => x > 10)
 *   .take(5)
 *   .toArray()
 * ```
 *
 * @example
 * ```typescript
 * // Real-world: Processing paginated API results
 * const [err, users] = await s.stream(fetchUsers())
 *   .flatMap(page => page.items)
 *   .filter(user => user.isActive)
 *   .map(user => ({
 *     id: user.id,
 *     name: user.name,
 *     email: user.email.toLowerCase()
 *   }))
 *   .take(100)
 *   .toArray()
 * ```
 *
 * @see streamPlugin for adding stream support to Scope
 * @see {@link map} for transforming values
 * @see {@link filter} for filtering values
 * @see {@link toArray} for collecting results
 */
/* #__PURE__ */
export class Stream<T> implements AsyncIterable<T>, AsyncDisposable {
	private source: () => AsyncGenerator<T>;
	private scope: Scope<Record<string, unknown>>;

	constructor(source: AsyncIterable<T>, scope: Scope<Record<string, unknown>>) {
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
	 * Transform each value in the stream using the provided function.
	 *
	 * This operation is lazy - the transformation is only applied when values
	 * are consumed from the stream. The original stream is not modified.
	 *
	 * @template R - The return type of the transformation function
	 * @param fn - Transformation function that receives each value and its index
	 * @returns A new Stream with transformed values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const numbers = s.stream([1, 2, 3, 4, 5])
	 *
	 * const doubled = numbers.map(x => x * 2)
	 *
	 * const [err, result] = await doubled.toArray()
	 * // result: [2, 4, 6, 8, 10]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Chaining multiple operations
	 * const [err, result] = await s.stream(users)
	 *   .map(u => u.name)
	 *   .filter(name => name.length > 3)
	 *   .take(10)
	 *   .toArray()
	 * ```
	 *
	 * @see {@link flatMap} for mapping to multiple values
	 * @see {@link filter} for filtering values
	 * @see {@link filterMap} for mapping and filtering in one operation
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
	 * Filter values based on a predicate function.
	 *
	 * This operation is lazy - values are tested as they flow through,
	 * and only those matching the predicate are yielded. The original
	 * stream is not modified.
	 *
	 * @param predicate - Function that returns true for values to keep
	 * @returns A new Stream containing only values that match the predicate
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [err, evens] = await s.stream([1, 2, 3, 4, 5, 6])
	 *   .filter(x => x % 2 === 0)
	 *   .toArray()
	 * // evens: [2, 4, 6]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Filtering with index
	 * const [err, result] = await s.stream(['a', 'b', 'c', 'd'])
	 *   .filter((_, index) => index % 2 === 0)
	 *   .toArray()
	 * // result: ['a', 'c']
	 * ```
	 *
	 * @see {@link filterMap} for filtering and mapping in one operation
	 * @see {@link map} for transforming values
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
	 *
	 * Applies a function to each value that returns an iterable, then
	 * flattens the results into a single stream. Useful for operations
	 * like fetching related data or expanding nested structures.
	 *
	 * This operation is lazy - flattening happens as values flow through.
	 *
	 * @template R - The type of values in the inner iterables
	 * @param fn - Function that returns an iterable for each value
	 * @returns A new Stream with all flattened values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Flatten arrays
	 * const [err, result] = await s.stream([[1, 2], [3, 4], [5, 6]])
	 *   .flatMap(arr => arr)
	 *   .toArray()
	 * // result: [1, 2, 3, 4, 5, 6]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Fetch related data for each item
	 * const [err, comments] = await s.stream(postIds)
	 *   .flatMap(async function* (id) {
	 *     const post = await fetchPost(id)
	 *     for (const comment of post.comments) {
	 *       yield comment
	 *     }
	 *   })
	 *   .take(50)
	 *   .toArray()
	 * ```
	 *
	 * @see {@link map} for simple transformation
	 * @see {@link concatMap} for sequential flatMap
	 * @see {@link exhaustMap} for ignoring emissions during processing
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
	flat<R>(this: Stream<Iterable<R> | AsyncIterable<R>>): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				for await (const iterable of self) {
					for await (const item of iterable) {
						yield item;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Tap into the stream to perform side effects without modifying values.
	 *
	 * This operation is lazy - the side effect is executed as values flow
	 * through the stream. The original values are passed through unchanged.
	 * Useful for logging, debugging, or triggering external actions.
	 *
	 * @param fn - Side effect function that receives each value
	 * @returns A new Stream with the same values (unchanged)
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [err, result] = await s.stream([1, 2, 3])
	 *   .tap(x => console.log('Processing:', x))
	 *   .map(x => x * 2)
	 *   .tap(x => console.log('Doubled:', x))
	 *   .toArray()
	 * // Logs: Processing: 1, Doubled: 2, Processing: 2, Doubled: 4, ...
	 * // result: [2, 4, 6]
	 * ```
	 *
	 * @see {@link map} for transforming values
	 * @see {@link forEach} for terminal side effects
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
	 * Take the first n elements from the stream.
	 *
	 * Limits the stream to at most n elements. After n elements have
	 * been yielded, the stream completes. If the source has fewer than
	 * n elements, all are yielded.
	 *
	 * This operation is lazy - it stops consuming after n elements.
	 *
	 * @param n - Number of elements to take (must be non-negative)
	 * @returns A new Stream with at most n elements
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [err, result] = await s.stream([1, 2, 3, 4, 5])
	 *   .take(3)
	 *   .toArray()
	 * // result: [1, 2, 3]
	 * ```
	 *
	 * @see {@link takeWhile} for conditional taking
	 * @see {@link takeUntil} for predicate-based taking
	 * @see {@link drop} for skipping elements
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
	 *
	 * Allows up to `limit` elements per `interval` milliseconds. This is useful for
	 * rate limiting streams to prevent overwhelming downstream consumers or APIs.
	 *
	 * This operation is lazy - throttles as values flow through.
	 *
	 * @param options - Throttle configuration options
	 * @param options.limit - Maximum number of elements to emit per interval (default: 1)
	 * @param options.interval - Time window in milliseconds (default: 1000)
	 * @returns A new Stream that emits throttled values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Allow up to 5 values per second
	 * const [_, results] = await s.stream(fastSource)
	 *   .throttle({ limit: 5, interval: 1000 })
	 *   .toArray()
	 * ```
	 *
	 * @see {@link debounce} for waiting for quiet periods
	 * @see {@link auditTime} for emitting latest on interval
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
	 *
	 * Waits for `ms` milliseconds of silence (no new values) before
	 * emitting the most recent value. Useful for handling rapid-fire
	 * events like search input or resize events.
	 *
	 * This operation is lazy - emits only after the quiet period.
	 *
	 * @param ms - Quiet period duration in milliseconds
	 * @returns A new Stream that emits debounced values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Search as user types, but wait for pause
	 * await s.stream(searchInputEvents)
	 *   .debounce(300)
	 *   .forEach(({ query }) => {
	 *     return performSearch(query)
	 *   })
	 * ```
	 *
	 * @see {@link throttle} for rate limiting
	 * @see {@link auditTime} for emitting latest on interval
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

	/**
	 * Sample the stream at regular intervals.
	 * Emits the most recent value at each interval.
	 * Lazy - only samples when interval fires.
	 */
	sample(intervalMs: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let latest: T | undefined;
				let hasValue = false;
				let done = false;

				// Producer: collect values
				const producer = (async () => {
					for await (const value of self) {
						latest = value;
						hasValue = true;
					}
					done = true;
				})();

				// Consumer: sample at intervals
				while (!done) {
					scope.signal.throwIfAborted();
					await new Promise((resolve) => setTimeout(resolve, intervalMs));
					if (hasValue) {
						yield latest!;
					}
					if (done) break;
				}

				await producer;
			})(),
			scope,
		);
	}

	/**
	 * Audit time - emit the last value, then silence for duration.
	 * Unlike throttle which emits first then silences, audit waits
	 * for the duration then emits the most recent value.
	 * Lazy - applies timing per emission.
	 */
	auditTime(durationMs: number): Stream<T> {
		const self = this;
		const scope = this.scope;

		return new Stream<T>(
			(async function* () {
				let pending: T | undefined;
				let hasPending = false;
				let auditTimeout: ReturnType<typeof setTimeout> | null = null;

				for await (const value of self) {
					scope.signal.throwIfAborted();

					pending = value;
					hasPending = true;

					// Start audit window if not already running
					if (!auditTimeout) {
						const auditPromise = new Promise<void>((resolve) => {
							auditTimeout = setTimeout(() => {
								auditTimeout = null;
								resolve();
							}, durationMs);
						});

						await auditPromise;

						if (hasPending) {
							yield pending;
							hasPending = false;
						}
					}
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
	 *
	 * Consumes both streams concurrently and yields values from whichever
	 * stream produces them first. Values from both streams are interleaved
	 * in the order they arrive.
	 *
	 * This operation is lazy - merges as values arrive from either stream.
	 *
	 * @param other - Stream to merge with
	 * @returns A new Stream with interleaved values from both streams
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const stream1 = s.stream(interval(100)).map(() => 'A')
	 * const stream2 = s.stream(interval(150)).map(() => 'B')
	 *
	 * const [err, result] = await stream1.merge(stream2).take(5).toArray()
	 * // result might be: ['A', 'B', 'A', 'A', 'B'] (order depends on timing)
	 * ```
	 *
	 * @see {@link concat} for sequential combination
	 * @see {@link zip} for pairing values
	 * @see {@link interleave} for round-robin combination
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
	 *
	 * Pairs elements from both streams into tuples [T, R].
	 * Stops when either stream ends. Both streams are consumed
	 * in lockstep.
	 *
	 * This operation is lazy - zips as values arrive from both streams.
	 *
	 * @template R - The type of values in the other stream
	 * @param other - Stream to zip with
	 * @returns A new Stream of tuples [T, R]
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const names = s.stream(['Alice', 'Bob', 'Carol'])
	 * const ages = s.stream([25, 30, 35])
	 *
	 * const [err, result] = await names.zip(ages).toArray()
	 * // result: [['Alice', 25], ['Bob', 30], ['Carol', 35]]
	 * ```
	 *
	 * @see {@link zipWith} for zipping with a combining function
	 * @see {@link zipWithIndex} for adding indices
	 * @see {@link zipLatest} for using latest values
	 * @see {@link zipAll} for continuing until both end
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

							const iterator = iterators[i];
							if (!iterator) continue;
							const result = await iterator.next();

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
	 * Collect values using a partial function.
	 * Only emits values where the partial function returns a non-undefined result.
	 * Lazy - filters and maps as values flow through.
	 *
	 * @example
	 * ```typescript
	 * // Parse numbers from mixed array
	 * const [_, nums] = await s.stream(['1', 'a', '2', 'b', '3'])
	 *   .collect((x) => {
	 *     const n = parseInt(x, 10);
	 *     return isNaN(n) ? undefined : n;
	 *   })
	 *   .toArray()
	 * // nums = [1, 2, 3]
	 * ```
	 */
	collect<R>(pf: (value: T) => R | undefined): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const result = pf(value);
					if (result !== undefined) {
						yield result;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Collect values using a partial function while it returns defined values.
	 * Stops when the partial function returns undefined for the first time.
	 * Lazy - collects while defined, then stops.
	 *
	 * @example
	 * ```typescript
	 * // Parse numbers until non-numeric string
	 * const [_, nums] = await s.stream(['1', '2', '3', 'stop', '4'])
	 *   .collectWhile((x) => {
	 *     const n = parseInt(x, 10);
	 *     return isNaN(n) ? undefined : n;
	 *   })
	 *   .toArray()
	 * // nums = [1, 2, 3] (stops at 'stop')
	 * ```
	 */
	collectWhile<R>(pf: (value: T) => R | undefined): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const result = pf(value);
					if (result === undefined) {
						break;
					}
					yield result;
				}
			})(),
			scope,
		);
	}

	/**
	 * Group elements into fixed-size chunks.
	 * Alias for `buffer(size)` with better semantics for grouping.
	 * Lazy - groups as values flow through.
	 *
	 * @example
	 * ```typescript
	 * const [_, groups] = await s.stream([1, 2, 3, 4, 5, 6, 7])
	 *   .grouped(3)
	 *   .toArray()
	 * // groups = [[1, 2, 3], [4, 5, 6], [7]]
	 * ```
	 */
	grouped(size: number): Stream<T[]> {
		return this.buffer(size);
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
				// @ts-expect-error - Tracking for future time-based logic
				let _lastEmit = Date.now();
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
							_lastEmit = Date.now();
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
								_lastEmit = Date.now();
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
				// @ts-expect-error - Fire-and-forget prefetch
				const _prefetchPromise = prefetchOuter();

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

	/**
	 * Pairwise - emit [previous, current] tuples.
	 * Useful for computing diffs or detecting changes.
	 *
	 * @example
	 * ```typescript
	 * const [_, pairs] = await s.stream([1, 2, 3, 4])
	 *   .pairwise()
	 *   .toArray()
	 * // pairs = [[1, 2], [2, 3], [3, 4]]
	 * ```
	 */
	pairwise(): Stream<[T | undefined, T]> {
		const self = this;
		const scope = this.scope;

		return new Stream<[T | undefined, T]>(
			(async function* () {
				let previous: T | undefined;
				let isFirst = true;

				for await (const value of self) {
					scope.signal.throwIfAborted();
					if (isFirst) {
						previous = value;
						isFirst = false;
					} else {
						yield [previous, value] as [T | undefined, T];
						previous = value;
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * Sliding window - emit arrays of up to `size` elements.
	 * Each new element shifts the window forward by one.
	 *
	 * @example
	 * ```typescript
	 * const [_, windows] = await s.stream([1, 2, 3, 4, 5])
	 *   .window(3)
	 *   .toArray()
	 * // windows = [[1, 2, 3], [2, 3, 4], [3, 4, 5]]
	 * ```
	 */
	window(size: number): Stream<T[]> {
		if (size <= 0) throw new Error("Window size must be positive");
		const self = this;
		const scope = this.scope;

		return new Stream<T[]>(
			(async function* () {
				const window: T[] = [];

				for await (const value of self) {
					scope.signal.throwIfAborted();
					window.push(value);
					if (window.length > size) {
						window.shift();
					}
					if (window.length === size) {
						yield [...window];
					}
				}
			})(),
			scope,
		);
	}

	/**
	 * ConcatMap - sequential flatMap.
	 * Maps each value to an async iterable, then concatenates them in order.
	 * Unlike flatMap which interleaves results, concatMap waits for each inner
	 * iterable to complete before starting the next.
	 *
	 * @example
	 * ```typescript
	 * const [_, urls] = await s.stream([url1, url2])
	 *   .concatMap(url => fetchPages(url)) // fetchPages returns AsyncIterable
	 *   .toArray()
	 * ```
	 */
	concatMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				for await (const value of self) {
					scope.signal.throwIfAborted();
					const inner = fn(value);
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
	 * ExhaustMap - ignore new emissions while processing.
	 * Maps each value to an async iterable, but ignores new source values
	 * while the previous inner iterable is still running.
	 *
	 * @example
	 * ```typescript
	 * // Search input with exhaustMap - ignore new queries while fetching
	 * const results = s.stream(searchInput)
	 *   .exhaustMap(query => fetchResults(query))
	 * ```
	 */
	exhaustMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R> {
		const self = this;
		const scope = this.scope;

		return new Stream<R>(
			(async function* () {
				let isProcessing = false;
				const queue: T[] = [];
				let outerDone = false;

				const iterator = self[Symbol.asyncIterator]();

				try {
					while (true) {
						scope.signal.throwIfAborted();

						// Try to get next value if not processing
						if (!isProcessing) {
							const result = await iterator.next();
							if (result.done) {
								outerDone = true;
								if (queue.length === 0) break;
							} else {
								queue.push(result.value);
							}
						}

						// Process next item if available and not busy
						if (!isProcessing && queue.length > 0) {
							isProcessing = true;
							const value = queue.shift()!;
							const inner = fn(value);

							// Process inner iterable
							for await (const innerValue of inner) {
								scope.signal.throwIfAborted();
								yield innerValue;
							}

							isProcessing = false;
						}

						// Small yield to prevent tight loop
						if (isProcessing || queue.length === 0) {
							await new Promise((r) => setTimeout(r, 0));
						}

						if (outerDone && queue.length === 0 && !isProcessing) {
							break;
						}
					}
				} finally {
					await iterator.return?.(undefined);
				}
			})(),
			scope,
		);
	}

	/**
	 * Share - multicast to multiple subscribers.
	 *
	 * Returns a new Stream that can be subscribed to multiple times,
	 * with all subscribers receiving the same values. This is useful for
	 * broadcasting a single source to multiple consumers without re-executing
	 * the source for each subscriber.
	 *
	 * @param options - Share configuration options
	 * @param options.bufferSize - Number of values to buffer for late subscribers (default: 1)
	 * @returns A new shared Stream that multicasts to multiple subscribers
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const shared = s.stream(source).share({ bufferSize: 5 });
	 *
	 * // Both subscribers receive the same values
	 * shared.forEach(v => console.log('A:', v));
	 * shared.forEach(v => console.log('B:', v));
	 * ```
	 *
	 * @see {@link broadcast} for splitting into multiple independent streams
	 */
	share(options?: { bufferSize?: number }): Stream<T> {
		const bufferSize = options?.bufferSize ?? 1;
		const scope = this.scope;
		const shared = new SharedStream(this, scope, bufferSize);
		return shared.asStream();
	}

	// ============================================================================
	// Splitting
	// ============================================================================

	/**
	 * Partition stream into two based on predicate.
	 *
	 * Returns [pass, fail] tuple where elements matching the predicate go to the
	 * first stream and non-matching elements go to the second. Uses queue-based
	 * distribution - each stream has an independent buffer.
	 *
	 * @param predicate - Function that returns true for values that should go to the first stream
	 * @param options - Partition configuration options
	 * @param options.bufferSize - Size of the buffer for each partition (default: 16)
	 * @returns A tuple of [passingStream, failingStream]
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [evens, odds] = s.stream([1, 2, 3, 4, 5, 6]).partition(n => n % 2 === 0)
	 * const [_, evenArr] = await evens.toArray() // [2, 4, 6]
	 * const [__, oddArr] = await odds.toArray()   // [1, 3, 5]
	 * ```
	 *
	 * @see {@link splitAt} for splitting at a specific position
	 * @see {@link broadcast} for broadcasting to multiple consumers
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
	 *
	 * Returns [firstN, rest] tuple where the first stream contains the first n elements
	 * and the second stream contains the remaining elements. Uses queue-based
	 * distribution with independent consumption.
	 *
	 * @param n - Number of elements for the first stream
	 * @param options - Split configuration options
	 * @param options.bufferSize - Size of the buffer for each stream (default: 16)
	 * @returns A tuple of [firstNStream, restStream]
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [head, tail] = s.stream([1, 2, 3, 4, 5, 6]).splitAt(3)
	 * const [_, firstThree] = await head.toArray() // [1, 2, 3]
	 * const [__, rest] = await tail.toArray()       // [4, 5, 6]
	 * ```
	 *
	 * @see {@link partition} for splitting based on predicate
	 * @see {@link take} for taking only the first n elements
	 * @see {@link drop} for dropping the first n elements
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
	 *
	 * Returns an array of streams that all receive the same values from the source.
	 * Uses queue-based distribution with independent consumption, allowing each
	 * consumer to process at its own pace. Auto-registers with scope for cleanup.
	 *
	 * @param n - Number of streams to create
	 * @param options - Broadcast configuration options
	 * @param options.bufferSize - Size of the buffer for each consumer (default: 0, unbounded)
	 * @returns An array of streams, each receiving all values from the source
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [stream1, stream2, stream3] = s.stream(source).broadcast(3, { bufferSize: 10 })
	 *
	 * // Each consumer gets all values
	 * const [_, results1] = await stream1.toArray()
	 * const [__, results2] = await stream2.toArray()
	 * const [___, results3] = await stream3.toArray()
	 * ```
	 *
	 * @see {@link share} for multicasting with shared subscription
	 * @see {@link partition} for splitting based on predicate
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
	 * Collect all values from the stream into an array.
	 *
	 * This is a terminal operation that consumes the entire stream and
	 * collects all values into an array. Returns a Result tuple for
	 * type-safe error handling.
	 *
	 * @returns A Promise resolving to a Result tuple [error, values]
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [err, values] = await s.stream([1, 2, 3, 4, 5])
	 *   .filter(x => x % 2 === 0)
	 *   .toArray()
	 * // values: [2, 4]
	 * ```
	 *
	 * @see {@link forEach} for iterating without collecting
	 * @see {@link runDrain} for consuming without collecting
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
	 * Get element at specific index.
	 * Returns undefined if index is out of bounds.
	 */
	async elementAt(index: number): Promise<Result<unknown, T | undefined>> {
		if (index < 0) {
			return [undefined, undefined];
		}
		try {
			let i = 0;
			for await (const value of this) {
				if (i === index) {
					return [undefined, value];
				}
				i++;
			}
			return [undefined, undefined];
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
	 * Calculate the average of numeric values.
	 * Returns undefined if stream is empty.
	 */
	async avg(): Promise<Result<unknown, number | undefined>> {
		let sum = 0;
		let count = 0;
		for await (const value of this) {
			sum += value as unknown as number;
			count++;
		}
		return [undefined, count > 0 ? sum / count : undefined];
	}

	/**
	 * Get the maximum value.
	 * Returns undefined if stream is empty.
	 */
	async max(): Promise<Result<unknown, T | undefined>> {
		let max: T | undefined;
		let first = true;
		for await (const value of this) {
			if (first || value > max!) {
				max = value;
				first = false;
			}
		}
		return [undefined, max];
	}

	/**
	 * Get the minimum value.
	 * Returns undefined if stream is empty.
	 */
	async min(): Promise<Result<unknown, T | undefined>> {
		let min: T | undefined;
		let first = true;
		for await (const value of this) {
			if (first || value < min!) {
				min = value;
				first = false;
			}
		}
		return [undefined, min];
	}

	/**
	 * Get the first element.
	 * Alias for `first()` - follows Effect naming convention.
	 * Returns undefined if stream is empty.
	 */
	async runHead(): Promise<Result<unknown, T | undefined>> {
		return this.first();
	}

	/**
	 * Get the last element.
	 * Alias for `last()` - follows Effect naming convention.
	 * Returns undefined if stream is empty.
	 */
	async runLast(): Promise<Result<unknown, T | undefined>> {
		return this.last();
	}

	/**
	 * Sum all numeric values.
	 * Alias for `sum()` - follows Effect naming convention.
	 */
	async runSum(): Promise<Result<unknown, number>> {
		return this.sum();
	}

	/**
	 * Pipe the stream through a series of transformation functions.
	 *
	 * Enables functional composition of stream operations by applying
	 * a chain of transformation functions in order.
	 *
	 * @template U - The type of values in the resulting stream
	 * @param fns - Array of transformation functions to apply
	 * @returns A new Stream transformed by all functions in the pipe
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const [_, result] = await s.stream([1, 2, 3, 4, 5])
	 *   .pipe(
	 *     s => s.filter(x => x % 2 === 0),
	 *     s => s.map(x => x * 10),
	 *     s => s.take(2)
	 *   )
	 *   .toArray()
	 * // result: [20, 40]
	 * ```
	 *
	 * @see {@link map} for single transformation
	 */
	pipe<U>(...fns: Array<(stream: Stream<T>) => Stream<U>>): Stream<U> {
		// biome-ignore lint/suspicious/noExplicitAny: Pipe transforms stream type through chain
		return fns.reduce((acc, fn) => fn(acc), this as any) as Stream<U>;
	}

	/**
	 * Retry the stream on failure with configurable delay.
	 *
	 * When the stream encounters an error, it will automatically retry up to `max` times
	 * with a `delay` milliseconds between attempts. If all retries are exhausted,
	 * the error is re-thrown.
	 *
	 * This operation is eager - retries immediately on failure.
	 *
	 * @param options - Retry configuration options
	 * @param options.max - Maximum number of retry attempts (default: 3)
	 * @param options.delay - Delay in milliseconds between retry attempts (default: 0)
	 * @returns A new Stream with retry logic applied
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Retry up to 5 times with 1 second delay between attempts
	 * const [_, results] = await s.stream(unreliableSource)
	 *   .retry({ max: 5, delay: 1000 })
	 *   .toArray()
	 * ```
	 *
	 * @see {@link catchAll} for catching errors without retrying
	 * @see {@link orElse} for providing a fallback stream
	 */
	retry(options?: { max?: number; delay?: number }): Stream<T> {
		const self = this;
		const scope = this.scope;
		const max = options?.max ?? 3;
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
						if (attempt > max) {
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
 * Shared stream for multicasting to multiple subscribers.
 * All subscribers receive the same values from the source.
 */
class SharedStream<T> implements AsyncDisposable {
	private source: Stream<T>;
	private scope: Scope<Record<string, unknown>>;
	private bufferSize: number;
	private subscribers: Set<(value: T) => void> = new Set();
	private errorHandlers: Set<(error: unknown) => void> = new Set();
	private completeHandlers: Set<() => void> = new Set();
	private buffer: T[] = [];
	private started = false;

	constructor(
		source: Stream<T>,
		scope: Scope<Record<string, unknown>>,
		bufferSize: number,
	) {
		this.source = source;
		this.scope = scope;
		this.bufferSize = bufferSize;
	}

	subscribe(
		onValue: (value: T) => void,
		onError?: (error: unknown) => void,
		onComplete?: () => void,
	): () => void {
		this.subscribers.add(onValue);
		if (onError) this.errorHandlers.add(onError);
		if (onComplete) this.completeHandlers.add(onComplete);

		if (!this.started) {
			this.started = true;
			this._start();
		}

		return () => {
			this.subscribers.delete(onValue);
			if (onError) this.errorHandlers.delete(onError);
			if (onComplete) this.completeHandlers.delete(onComplete);
		};
	}

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
			const value = this.buffer.shift();
			if (value === undefined) {
				taker.reject(new Error("Channel buffer empty"));
			} else {
				taker.resolve({
					done: false,
					value,
					error: undefined,
				});
			}
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

// ============================================================================
// Stream Plugin for go-go-scope
// ============================================================================

/**
 * Stream plugin for go-go-scope.
 *
 * This plugin adds the `stream()` method to Scope, enabling lazy stream
 * processing with structured concurrency. Install this plugin when creating
 * a scope to access stream functionality.
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope'
 * import { streamPlugin } from '@go-go-scope/stream'
 *
 * // Create a scope with the stream plugin
 * await using s = scope({ plugins: [streamPlugin] })
 *
 * // Now you can use s.stream() to create streams
 * const [err, result] = await s.stream([1, 2, 3, 4, 5])
 *   .filter(x => x % 2 === 0)
 *   .map(x => x * 2)
 *   .toArray()
 * // result: [4, 8]
 * ```
 *
 * @see {@link Stream} for stream operations
 */
export const streamPlugin: ScopePlugin = {
	name: "stream",
	install(scope: Scope) {
		// Add stream method to scope prototype
		const proto = Object.getPrototypeOf(scope);
		proto.stream = function <T>(source: AsyncIterable<T>): Stream<T> {
			const stream = new Stream(source, this);
			this.disposables.push({
				async [Symbol.asyncDispose]() {
					await stream[Symbol.asyncDispose]();
				},
			});
			return stream;
		};
	},
};

// Also export as default for convenience
export default Stream;
