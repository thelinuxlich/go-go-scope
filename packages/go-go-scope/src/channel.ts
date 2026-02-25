/**
 * Channel class for go-go-scope - Go-style concurrent communication
 * Optimized version with ring buffer and fast paths
 */

import { ChannelFullError } from "./errors.js";
import { RESOLVED_FALSE, RESOLVED_TRUE, RESOLVED_UNDEFINED } from "./task.js";
import type { BackpressureStrategy, ChannelOptions } from "./types.js";

// Ring buffer implementation for O(1) enqueue/dequeue
class RingBuffer<T> {
	private buffer: (T | undefined)[];
	private head = 0;
	private tail = 0;
	private count = 0;
	private capacity: number;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.buffer = new Array(capacity);
	}

	get size(): number {
		return this.count;
	}

	get cap(): number {
		return this.capacity;
	}

	isEmpty(): boolean {
		return this.count === 0;
	}

	isFull(): boolean {
		return this.count === this.capacity;
	}

	enqueue(value: T): boolean {
		if (this.isFull()) {
			return false;
		}
		this.buffer[this.tail] = value;
		this.tail = (this.tail + 1) % this.capacity;
		this.count++;
		return true;
	}

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

	peek(): T | undefined {
		if (this.isEmpty()) {
			return undefined;
		}
		return this.buffer[this.head];
	}

	clear(): void {
		// Help GC by clearing references
		for (let i = 0; i < this.capacity; i++) {
			this.buffer[i] = undefined;
		}
		this.head = 0;
		this.tail = 0;
		this.count = 0;
	}

	// Resize the buffer (creates new buffer, copies data)
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

// Queue item types for type safety
interface SendQueueItem {
	resolve: () => void;
	reject: (reason: unknown) => void;
	value: unknown;
}

interface ReceiveQueueItem {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

// Sample buffer entry for sample backpressure strategy
interface SampleEntry<T> {
	value: T;
	timestamp: number;
}

/**
 * A Channel for Go-style concurrent communication.
 * Supports multiple producers/consumers with configurable backpressure strategies.
 * Automatically closes when the parent scope is disposed.
 *
 * Optimizations:
 * - Ring buffer for O(1) operations
 * - Fast paths for common cases (buffer has space/data)
 * - Batched notification to reduce event loop pressure
 * - Reduced object allocations
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const ch = s.channel<string>(10)
 *
 * // Producer
 * s.spawn(async () => {
 *   for (const item of items) {
 *     await ch.send(item)  // Blocks if buffer full (default strategy)
 *   }
 *   ch.close()
 * })
 *
 * // Consumer
 * for await (const item of ch) {
 *   await process(item)
 * }
 * ```
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
	 */
	private get bufferSize(): number {
		if (this.backpressure === "sample") {
			return this.sampleBuffer.length;
		}
		return this.buffer.size;
	}

	/**
	 * Clean up expired sample buffer entries.
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
	 * Behavior depends on backpressure strategy:
	 * - 'block': Blocks if buffer full until space is available
	 * - 'drop-oldest': Removes oldest item to make room
	 * - 'drop-latest': Drops the new item when buffer full
	 * - 'error': Throws ChannelFullError when buffer full
	 * - 'sample': Keeps only values within time window
	 *
	 * Returns false if channel is closed.
	 * Throws if scope is aborted.
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
	 * Returns undefined if the channel is closed and empty.
	 * Throws if the scope is aborted.
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
			this.receiveQueue.push({ resolve: resolveRecv as (value: unknown) => void, reject: rejectRecv });
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
		this.receiveQueue.push({ resolve: resolveRecv as (value: unknown) => void, reject: rejectRecv });
		return promise;
	}

	/**
	 * Close the channel. No more sends allowed.
	 * Consumers will drain the buffer then receive undefined.
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.drainQueues();
	}

	/**
	 * Check if the channel is closed.
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get the current buffer size.
	 */
	get size(): number {
		return this.bufferSize;
	}

	/**
	 * Get the buffer capacity.
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Get the current backpressure strategy.
	 */
	get strategy(): BackpressureStrategy {
		return this.backpressure;
	}

	/**
	 * Async iterator for the channel.
	 * Yields values until channel is closed and empty.
	 * Automatically handles cleanup.
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
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		// Prevent double disposal
		if (this.aborted) return;
		this.close();
		this.aborted = true;
		this.abortReason = new Error("channel disposed");
		this.drainQueues();
	}

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
	 * @param fn - Mapping function
	 * @returns New channel with mapped values
	 *
	 * @example
	 * ```typescript
	 * const numbers = s.channel<number>(10)
	 * const doubled = numbers.map(x => x * 2)
	 *
	 * await numbers.send(5)
	 * console.log(await doubled.receive()) // 10
	 * ```
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
	 * @param predicate - Filter function
	 * @returns New channel with filtered values
	 *
	 * @example
	 * ```typescript
	 * const numbers = s.channel<number>(10)
	 * const evens = numbers.filter(x => x % 2 === 0)
	 *
	 * await numbers.send(1)
	 * await numbers.send(2)
	 * console.log(await evens.receive()) // 2 (1 was filtered out)
	 * ```
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
	 * @param fn - Reducer function
	 * @param initial - Initial accumulator value
	 * @returns Promise with final accumulated value
	 *
	 * @example
	 * ```typescript
	 * const numbers = s.channel<number>(10)
	 *
	 * const sumPromise = numbers.reduce((acc, x) => acc + x, 0)
	 *
	 * await numbers.send(1)
	 * await numbers.send(2)
	 * await numbers.send(3)
	 * numbers.close()
	 *
	 * const sum = await sumPromise // 6
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
	 * @param count - Number of values to take
	 * @returns New channel limited to n values
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
