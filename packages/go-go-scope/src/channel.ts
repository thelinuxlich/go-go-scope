/**
 * Channel class for go-go-scope - Go-style concurrent communication
 * Optimized version with ring buffer and fast paths
 */

import { ChannelFullError } from "./errors.js";
import { RESOLVED_FALSE, RESOLVED_TRUE, RESOLVED_UNDEFINED } from "./task.js";
import type { BackpressureStrategy, ChannelOptions } from "./types.js";

/**
 * Ring buffer implementation for O(1) enqueue/dequeue operations.
 * Used internally by Channel for efficient message buffering.
 *
 * The ring buffer provides constant-time operations by using a circular
 * array that wraps around when reaching capacity limits.
 *
 * @internal
 */
class RingBuffer<T> {
	private buffer: (T | undefined)[];
	private head = 0;
	private tail = 0;
	private count = 0;
	private capacity: number;

	/**
	 * Creates a new RingBuffer with the specified capacity.
	 *
	 * @param capacity - Maximum number of items the buffer can hold
	 */
	constructor(capacity: number) {
		this.capacity = capacity;
		this.buffer = new Array(capacity);
	}

	/**
	 * Get the current number of items in the buffer.
	 */
	get size(): number {
		return this.count;
	}

	/**
	 * Get the buffer capacity.
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Check if the buffer is empty.
	 *
	 * @returns true if buffer contains no items
	 */
	isEmpty(): boolean {
		return this.count === 0;
	}

	/**
	 * Check if the buffer is full.
	 *
	 * @returns true if buffer has reached capacity
	 */
	isFull(): boolean {
		return this.count === this.capacity;
	}

	/**
	 * Add an item to the buffer.
	 *
	 * @param value - Item to enqueue
	 * @returns true if item was added, false if buffer is full
	 */
	enqueue(value: T): boolean {
		if (this.isFull()) {
			return false;
		}
		this.buffer[this.tail] = value;
		this.tail = (this.tail + 1) % this.capacity;
		this.count++;
		return true;
	}

	/**
	 * Remove and return the oldest item from the buffer.
	 *
	 * @returns The dequeued item, or undefined if buffer is empty
	 */
	dequeue(): T | undefined {
		if (this.isEmpty()) {
			return undefined;
		}
		const value = this.buffer[this.head];
		this.buffer[this.head] = undefined; // Help GC
		this.head = (this.head + 1) % this.capacity;
		this.count--;
		return value;
	}

	/**
	 * Peek at the oldest item without removing it.
	 *
	 * @returns The oldest item, or undefined if buffer is empty
	 */
	peek(): T | undefined {
		if (this.isEmpty()) {
			return undefined;
		}
		return this.buffer[this.head];
	}

	/**
	 * Clear all items from the buffer.
	 */
	clear(): void {
		// Help GC by clearing references
		for (let i = 0; i < this.capacity; i++) {
			this.buffer[i] = undefined;
		}
		this.head = 0;
		this.tail = 0;
		this.count = 0;
	}

	/**
	 * Resize the buffer to a new capacity.
	 * Creates a new buffer and copies existing data.
	 *
	 * @param newCapacity - New capacity for the buffer
	 */
	resize(newCapacity: number): void {
		const newBuffer = new Array(newCapacity);
		for (let i = 0; i < this.count; i++) {
			newBuffer[i] = this.buffer[(this.head + i) % this.capacity];
		}
		this.buffer = newBuffer;
		this.head = 0;
		this.tail = this.count;
		this.capacity = newCapacity;
	}
}

/**
 * Queue item for pending send operations.
 *
 * @internal
 */
interface SendQueueItem {
	resolve: () => void;
	reject: (reason: unknown) => void;
	value: unknown;
}

/**
 * Queue item for pending receive operations.
 *
 * @internal
 */
interface ReceiveQueueItem {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

/**
 * Sample buffer entry for sample backpressure strategy.
 *
 * @internal
 */
interface SampleEntry<T> {
	value: T;
	timestamp: number;
}

/**
 * A Channel for Go-style concurrent communication between tasks.
 *
 * Channels provide a typed, buffered communication mechanism that supports
 * multiple producers and consumers. They implement backpressure strategies
 * for when the buffer is full and automatically close when the parent scope
 * is disposed.
 *
 * Features:
 * - Ring buffer for O(1) enqueue/dequeue operations
 * - Multiple backpressure strategies: 'block', 'drop-oldest', 'drop-latest', 'error', 'sample'
 * - AsyncIterable support for for-await-of loops
 * - Automatic cleanup on scope disposal
 * - Functional operations: map, filter, reduce, take
 *
 * @example
 * ```typescript
 * await using s = scope();
 *
 * // Create a buffered channel with capacity 10
 * const ch = s.channel<string>(10);
 *
 * // Producer task
 * s.task(async () => {
 *   for (const item of ['a', 'b', 'c']) {
 *     await ch.send(item);
 *   }
 *   ch.close();
 * });
 *
 * // Consumer using for-await-of
 * for await (const value of ch) {
 *   console.log(value); // 'a', 'b', 'c'
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using backpressure strategies
 * await using s = scope();
 *
 * // Drop oldest when buffer is full
 * const ch = s.channel<number>({
 *   capacity: 5,
 *   backpressure: 'drop-oldest',
 *   onDrop: (value) => console.log(`Dropped: ${value}`)
 * });
 *
 * // Send without blocking
 * for (let i = 0; i < 100; i++) {
 *   await ch.send(i); // Older values will be dropped when full
 * }
 * ```
 *
 * @see {@link Scope.channel} for creating channels within a scope
 * @see {@link BroadcastChannel} for pub/sub communication
 */
/* #__PURE__ */
export class Channel<T> implements AsyncIterable<T>, AsyncDisposable {
	private buffer: RingBuffer<T>;
	private sendQueue: SendQueueItem[] = [];
	private sendQueueHead = 0;
	private receiveQueue: ReceiveQueueItem[] = [];
	private receiveQueueHead = 0;
	private closed = false;
	private aborted = false;
	private abortReason: unknown;

	// Backpressure-related properties
	private backpressure: BackpressureStrategy;
	private onDrop?: (value: T) => void;
	private sampleWindow: number;
	private sampleBuffer: SampleEntry<T>[] = [];
	private capacity: number;

	// Batch notification support
	private notifyScheduled = false;

	/**
	 * Creates a new Channel.
	 *
	 * @param capacityOrOptions - Either a number specifying buffer capacity, or a {@link ChannelOptions} object
	 * @param parentSignal - Optional AbortSignal from parent scope for automatic cleanup
	 */
	constructor(
		capacityOrOptions?: number | ChannelOptions<T>,
		parentSignal?: AbortSignal,
	) {
		// Parse options
		let capacity = 0;
		if (typeof capacityOrOptions === "number") {
			capacity = capacityOrOptions;
			this.backpressure = "block";
			this.onDrop = undefined;
			this.sampleWindow = 1000;
		} else if (capacityOrOptions !== undefined) {
			capacity = capacityOrOptions.capacity ?? 0;
			this.backpressure = capacityOrOptions.backpressure ?? "block";
			this.onDrop = capacityOrOptions.onDrop;
			this.sampleWindow = capacityOrOptions.sampleWindow ?? 1000;
		} else {
			this.backpressure = "block";
			this.onDrop = undefined;
			this.sampleWindow = 1000;
		}
		this.capacity = capacity;
		this.buffer = new RingBuffer<T>(capacity);

		if (parentSignal) {
			parentSignal.addEventListener(
				"abort",
				() => {
					this.aborted = true;
					this.abortReason = parentSignal.reason;
					this.drainQueues();
				},
				{ once: true },
			);
		}
	}

	/**
	 * Get effective buffer size.
	 *
	 * @internal
	 */
	private get bufferSize(): number {
		if (this.backpressure === "sample") {
			return this.sampleBuffer.length;
		}
		return this.buffer.size;
	}

	/**
	 * Clean up expired sample buffer entries.
	 *
	 * @internal
	 */
	private cleanupSampleBuffer(): void {
		if (this.backpressure !== "sample") return;
		const now = Date.now();
		const cutoff = now - this.sampleWindow;
		// Remove entries older than the window
		while (
			this.sampleBuffer.length > 0 &&
			this.sampleBuffer[0]!.timestamp < cutoff
		) {
			const dropped = this.sampleBuffer.shift();
			if (dropped) {
				this.onDrop?.(dropped.value);
			}
		}
	}

	/**
	 * Process pending notifications in a batch.
	 * Reduces event loop pressure by batching resolve calls.
	 *
	 * @internal
	 */
	private scheduleNotifications(): void {
		if (this.notifyScheduled) return;
		this.notifyScheduled = true;

		// Use queueMicrotask for faster scheduling than setImmediate
		queueMicrotask(() => {
			this.notifyScheduled = false;
			this.processNotifications();
		});
	}

	/**
	 * Process pending send and receive notifications.
	 *
	 * @internal
	 */
	private processNotifications(): void {
		// Unblock waiting receivers first
		while (
			this.receiveQueueHead < this.receiveQueue.length &&
			this.bufferSize > 0
		) {
			const receiver = this.receiveQueue[this.receiveQueueHead++];
			if (receiver) {
				const value = this.dequeueInternal();
				receiver.resolve(value);
			}
		}

		// Unblock waiting senders
		while (
			this.sendQueueHead < this.sendQueue.length &&
			!this.buffer.isFull()
		) {
			const sender = this.sendQueue[this.sendQueueHead++];
			if (sender) {
				this.buffer.enqueue(sender.value as T);
				sender.resolve();
			}
		}

		// Compact queues occasionally to prevent unbounded growth
		if (
			this.sendQueueHead > 100 &&
			this.sendQueueHead > this.sendQueue.length / 2
		) {
			this.sendQueue = this.sendQueue.slice(this.sendQueueHead);
			this.sendQueueHead = 0;
		}
		if (
			this.receiveQueueHead > 100 &&
			this.receiveQueueHead > this.receiveQueue.length / 2
		) {
			this.receiveQueue = this.receiveQueue.slice(this.receiveQueueHead);
			this.receiveQueueHead = 0;
		}
	}

	/**
	 * Internal dequeue that handles different backpressure strategies.
	 *
	 * @internal
	 */
	private dequeueInternal(): T | undefined {
		if (this.backpressure === "sample") {
			const entry = this.sampleBuffer.shift();
			if (entry) {
				// Also remove from regular buffer if present
				if (this.buffer.size > 0) {
					this.buffer.dequeue();
				}
				return entry.value;
			}
			return undefined;
		}
		return this.buffer.dequeue();
	}

	/**
	 * Send a value to the channel.
	 *
	 * Behavior depends on backpressure strategy:
	 * - **'block'**: Blocks if buffer full until space is available (default)
	 * - **'drop-oldest'**: Removes oldest item to make room
	 * - **'drop-latest'**: Drops the new item when buffer full
	 * - **'error'**: Throws {@link ChannelFullError} when buffer full
	 * - **'sample'**: Keeps only values within time window
	 *
	 * @param value - The value to send
	 * @returns Promise that resolves to true if send was successful, false if channel is closed
	 * @throws {unknown} If the scope is aborted
	 * @throws {ChannelFullError} If backpressure strategy is 'error' and buffer is full
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const ch = s.channel<string>(10);
	 *
	 * const success = await ch.send('hello');
	 * if (success) {
	 *   console.log('Message sent successfully');
	 * }
	 * ```
	 */
	send(value: T): Promise<boolean> {
		if (this.closed) {
			return RESOLVED_FALSE as Promise<boolean>;
		}

		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// Fast path: there's a waiting receiver - give directly
		while (this.receiveQueueHead < this.receiveQueue.length) {
			const receiver = this.receiveQueue[this.receiveQueueHead++];
			if (receiver) {
				receiver.resolve(value);
				return RESOLVED_TRUE as Promise<boolean>;
			}
		}

		// Handle based on backpressure strategy
		switch (this.backpressure) {
			case "sample": {
				// Clean up expired entries first
				this.cleanupSampleBuffer();

				// Add new value with timestamp
				this.sampleBuffer.push({ value, timestamp: Date.now() });

				// If we have space in capacity, also add to regular buffer
				if (this.bufferSize <= this.capacity) {
					this.buffer.enqueue(value);
				}
				return RESOLVED_TRUE as Promise<boolean>;
			}

			case "drop-oldest": {
				// If buffer is full, drop the oldest item
				if (this.buffer.isFull() && this.capacity > 0) {
					const dropped = this.buffer.dequeue();
					if (dropped !== undefined) {
						this.onDrop?.(dropped);
					}
				}
				this.buffer.enqueue(value);

				// Schedule notifications for waiting receivers
				if (this.receiveQueueHead < this.receiveQueue.length) {
					this.scheduleNotifications();
				}
				return RESOLVED_TRUE as Promise<boolean>;
			}

			case "drop-latest": {
				// If buffer is full, drop the new item
				if (this.buffer.isFull() && this.capacity > 0) {
					this.onDrop?.(value);
					return RESOLVED_TRUE as Promise<boolean>;
				}
				this.buffer.enqueue(value);

				// Schedule notifications for waiting receivers
				if (this.receiveQueueHead < this.receiveQueue.length) {
					this.scheduleNotifications();
				}
				return RESOLVED_TRUE as Promise<boolean>;
			}

			case "error": {
				// If buffer is full, throw error
				if (this.buffer.isFull() && this.capacity > 0) {
					return Promise.reject(new ChannelFullError());
				}
				this.buffer.enqueue(value);

				// Schedule notifications for waiting receivers
				if (this.receiveQueueHead < this.receiveQueue.length) {
					this.scheduleNotifications();
				}
				return RESOLVED_TRUE as Promise<boolean>;
			}

			default: {
				// Default behavior: block if buffer full
				if (!this.buffer.isFull()) {
					this.buffer.enqueue(value);

					// Schedule notifications for waiting receivers
					if (this.receiveQueueHead < this.receiveQueue.length) {
						this.scheduleNotifications();
					}
					return RESOLVED_TRUE as Promise<boolean>;
				}

				// Otherwise, wait for space
				let resolveSend!: () => void;
				let rejectSend!: (reason: unknown) => void;
				const promise = new Promise<void>((res, rej) => {
					resolveSend = res;
					rejectSend = rej;
				});
				this.sendQueue.push({
					resolve: resolveSend,
					reject: rejectSend,
					value,
				});
				return promise.then(() => true);
			}
		}
	}

	/**
	 * Receive a value from the channel.
	 *
	 * @returns Promise that resolves to the received value, or undefined if channel is closed and empty
	 * @throws {unknown} If the scope is aborted
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const ch = s.channel<string>(10);
	 *
	 * // In a producer task
	 * s.task(async () => {
	 *   await ch.send('hello');
	 *   ch.close();
	 * });
	 *
	 * // In a consumer task
	 * const value = await ch.receive();
	 * console.log(value); // 'hello'
	 *
	 * const empty = await ch.receive();
	 * console.log(empty); // undefined (channel closed)
	 * ```
	 */
	receive(): Promise<T | undefined> {
		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// For sample strategy, clean up and get latest
		if (this.backpressure === "sample") {
			this.cleanupSampleBuffer();
			if (this.sampleBuffer.length > 0) {
				const entry = this.sampleBuffer.shift();
				if (entry) {
					// Also remove from regular buffer if present
					if (this.buffer.size > 0) {
						this.buffer.dequeue();
					}
					return Promise.resolve(entry.value);
				}
			}

			// If closed and empty, return undefined
			if (this.closed) {
				return RESOLVED_UNDEFINED as Promise<undefined>;
			}

			// Otherwise, wait for a value
			let resolveRecv!: (value: T | undefined) => void;
			let rejectRecv!: (reason: unknown) => void;
			const promise = new Promise<T | undefined>((res, rej) => {
				resolveRecv = res;
				rejectRecv = rej;
			});
			this.receiveQueue.push({
				resolve: resolveRecv as (value: unknown) => void,
				reject: rejectRecv,
			});
			return promise;
		}

		// Fast path: buffer has items, return from buffer
		if (!this.buffer.isEmpty()) {
			const value = this.buffer.dequeue();

			// Schedule notifications for waiting senders
			if (this.sendQueueHead < this.sendQueue.length) {
				this.scheduleNotifications();
			}

			return Promise.resolve(value);
		}

		// If closed and empty, return undefined
		if (this.closed) {
			return RESOLVED_UNDEFINED as Promise<undefined>;
		}

		// Otherwise, wait for a value
		let resolveRecv!: (value: T | undefined) => void;
		let rejectRecv!: (reason: unknown) => void;
		const promise = new Promise<T | undefined>((res, rej) => {
			resolveRecv = res;
			rejectRecv = rej;
		});
		this.receiveQueue.push({
			resolve: resolveRecv as (value: unknown) => void,
			reject: rejectRecv,
		});
		return promise;
	}

	/**
	 * Close the channel. No more sends allowed.
	 * Consumers will drain the buffer then receive undefined.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const ch = s.channel<string>(10);
	 *
	 * await ch.send('message');
	 * ch.close();
	 *
	 * // After close, send returns false
	 * const result = await ch.send('another'); // false
	 * ```
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.drainQueues();
	}

	/**
	 * Check if the channel is closed.
	 *
	 * @returns true if the channel has been closed
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get the current buffer size (number of items in buffer).
	 *
	 * @returns Current number of buffered items
	 */
	get size(): number {
		return this.bufferSize;
	}

	/**
	 * Get the buffer capacity.
	 *
	 * @returns Maximum number of items the buffer can hold
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Get the current backpressure strategy.
	 *
	 * @returns The configured backpressure strategy
	 * @see {@link BackpressureStrategy}
	 */
	get strategy(): BackpressureStrategy {
		return this.backpressure;
	}

	/**
	 * Async iterator for the channel.
	 * Yields values until channel is closed and empty.
	 * Automatically handles cleanup.
	 *
	 * @returns AsyncIterator that yields channel values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const ch = s.channel<string>(10);
	 *
	 * // Producer
	 * s.task(async () => {
	 *   await ch.send('a');
	 *   await ch.send('b');
	 *   ch.close();
	 * });
	 *
	 * // Consumer using for-await-of
	 * for await (const value of ch) {
	 *   console.log(value); // 'a', then 'b'
	 * }
	 * ```
	 */
	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		while (true) {
			const value = await this.receive();
			if (value === undefined) break;
			yield value;
		}
	}

	/**
	 * Dispose the channel, aborting all pending operations.
	 *
	 * @returns Promise that resolves when disposal is complete
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		// Prevent double disposal
		if (this.aborted) return;
		this.close();
		this.aborted = true;
		this.abortReason = new Error("channel disposed");
		this.drainQueues();
	}

	/**
	 * Drain all pending queues on close/abort.
	 *
	 * @internal
	 */
	private drainQueues(): void {
		// Reject all waiting senders
		for (let i = this.sendQueueHead; i < this.sendQueue.length; i++) {
			const sender = this.sendQueue[i];
			if (sender) {
				sender.reject(this.abortReason);
			}
		}
		this.sendQueue.length = 0;
		this.sendQueueHead = 0;

		// Resolve all waiting receivers with undefined
		for (let i = this.receiveQueueHead; i < this.receiveQueue.length; i++) {
			const receiver = this.receiveQueue[i];
			if (receiver) {
				receiver.resolve(undefined);
			}
		}
		this.receiveQueue.length = 0;
		this.receiveQueueHead = 0;

		// Clear sample buffer and call onDrop for remaining items
		if (this.backpressure === "sample") {
			for (const entry of this.sampleBuffer) {
				this.onDrop?.(entry.value);
			}
			this.sampleBuffer.length = 0;
		}
	}

	/**
	 * Transform each value using a mapping function.
	 * Returns a new channel with transformed values.
	 *
	 * The original channel continues to operate normally. Values are
	 * forwarded through the mapping function as they arrive.
	 *
	 * @typeParam R - Return type of the mapping function
	 * @param fn - Mapping function to apply to each value
	 * @returns New channel with mapped values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const numbers = s.channel<number>(10);
	 * const doubled = numbers.map(x => x * 2);
	 *
	 * await numbers.send(5);
	 * await numbers.send(10);
	 * numbers.close();
	 *
	 * console.log(await doubled.receive()); // 10
	 * console.log(await doubled.receive()); // 20
	 * ```
	 *
	 * @see {@link filter} for filtering values
	 * @see {@link take} for limiting the number of values
	 */
	map<R>(fn: (value: T) => R): Channel<R> {
		const mapped = new Channel<R>(this.capacity);

		// Start async mapping process
		(async () => {
			try {
				for await (const value of this) {
					if (value !== undefined) {
						await mapped.send(fn(value));
					}
				}
			} finally {
				mapped.close();
			}
		})();

		return mapped;
	}

	/**
	 * Filter values based on a predicate.
	 * Returns a new channel with only values that match the predicate.
	 *
	 * The original channel continues to operate normally. Only values
	 * that satisfy the predicate are forwarded to the new channel.
	 *
	 * @param predicate - Filter function that returns true for values to keep
	 * @returns New channel with filtered values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const numbers = s.channel<number>(10);
	 * const evens = numbers.filter(x => x % 2 === 0);
	 *
	 * await numbers.send(1);
	 * await numbers.send(2);
	 * await numbers.send(3);
	 * await numbers.send(4);
	 * numbers.close();
	 *
	 * console.log(await evens.receive()); // 2 (1 was filtered out)
	 * console.log(await evens.receive()); // 4 (3 was filtered out)
	 * ```
	 *
	 * @see {@link map} for transforming values
	 * @see {@link take} for limiting the number of values
	 */
	filter(predicate: (value: T) => boolean): Channel<T> {
		const filtered = new Channel<T>(this.capacity);

		// Start async filtering process
		(async () => {
			try {
				for await (const value of this) {
					if (value !== undefined && predicate(value)) {
						await filtered.send(value);
					}
				}
			} finally {
				filtered.close();
			}
		})();

		return filtered;
	}

	/**
	 * Reduce all values to a single value.
	 * Returns a promise that resolves when the channel is closed.
	 *
	 * This is a terminal operation - it consumes all values from the
	 * channel and produces a single accumulated result.
	 *
	 * @typeParam R - Type of the accumulator and result
	 * @param fn - Reducer function that combines accumulator with each value
	 * @param initial - Initial accumulator value
	 * @returns Promise that resolves to the final accumulated value
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const numbers = s.channel<number>(10);
	 *
	 * const sumPromise = numbers.reduce((acc, x) => acc + x, 0);
	 *
	 * await numbers.send(1);
	 * await numbers.send(2);
	 * await numbers.send(3);
	 * numbers.close();
	 *
	 * const sum = await sumPromise; // 6
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Building a string from messages
	 * const words = s.channel<string>(10);
	 * const sentence = words.reduce((acc, word) => acc + ' ' + word, '');
	 *
	 * await words.send('Hello');
	 * await words.send('World');
	 * words.close();
	 *
	 * console.log(await sentence); // ' Hello World'
	 * ```
	 */
	async reduce<R>(fn: (accumulator: R, value: T) => R, initial: R): Promise<R> {
		let result = initial;
		try {
			for await (const value of this) {
				if (value !== undefined) {
					result = fn(result, value);
				}
			}
		} catch (error) {
			// Channel was disposed, return accumulated result
			if (error instanceof Error && error.message === "channel disposed") {
				return result;
			}
			throw error;
		}
		return result;
	}

	/**
	 * Take only the first n values from the channel.
	 * Returns a new channel that automatically closes after n values.
	 *
	 * This is useful for limiting the amount of data processed from
	 * an unbounded stream of values.
	 *
	 * @param count - Number of values to take before closing
	 * @returns New channel limited to n values
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const infinite = s.channel<number>(100);
	 * const firstFive = infinite.take(5);
	 *
	 * // Producer sends many values
	 * s.task(async () => {
	 *   for (let i = 0; i < 1000; i++) {
	 *     await infinite.send(i);
	 *   }
	 * });
	 *
	 * // Consumer only receives first 5
	 * const values: number[] = [];
	 * for await (const value of firstFive) {
	 *   values.push(value);
	 * }
	 * console.log(values); // [0, 1, 2, 3, 4]
	 * ```
	 *
	 * @see {@link map} for transforming values
	 * @see {@link filter} for filtering values
	 */
	take(count: number): Channel<T> {
		const taken = new Channel<T>(this.capacity);
		let takenCount = 0;

		(async () => {
			try {
				for await (const value of this) {
					if (value !== undefined) {
						await taken.send(value);
						takenCount++;
						if (takenCount >= count) {
							break;
						}
					}
				}
			} finally {
				taken.close();
			}
		})();

		return taken;
	}
}

// RingBuffer is for internal use only
