/**
 * Channel class for go-go-scope - Go-style concurrent communication
 */

/**
 * A Channel for Go-style concurrent communication.
 * Supports multiple producers/consumers with backpressure.
 * Automatically closes when the parent scope is disposed.
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const ch = s.channel<string>(10)
 *
 * // Producer
 * s.spawn(async () => {
 *   for (const item of items) {
 *     await ch.send(item)  // Blocks if buffer full
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
export class Channel<T> implements AsyncIterable<T>, AsyncDisposable {
	private buffer: T[] = [];
	private bufferHead = 0; // Index of first valid element (avoids O(n) shift)
	private sendQueue: Array<{
		resolve: () => void;
		reject: (reason: unknown) => void;
	}> = [];
	private sendQueueHead = 0; // Index of first valid sender (avoids O(n) shift)
	private receiveQueue: Array<{
		resolve: (value: T | undefined) => void;
		reject: (reason: unknown) => void;
	}> = [];
	private receiveQueueHead = 0; // Index of first valid receiver (avoids O(n) shift)
	private closed = false;
	private aborted = false;
	private abortReason: unknown;

	constructor(
		private capacity: number,
		parentSignal?: AbortSignal,
	) {
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
	 * Get effective buffer size (accounting for head offset).
	 */
	private get bufferSize(): number {
		return this.buffer.length - this.bufferHead;
	}

	/**
	 * Send a value to the channel.
	 * Blocks if the buffer is full until space is available.
	 * Resolves to false if the channel is closed.
	 * Throws if the scope is aborted.
	 */
	send(value: T): Promise<boolean> {
		if (this.closed) {
			return Promise.resolve(false);
		}

		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// If there's a waiting receiver, give directly
		while (this.receiveQueueHead < this.receiveQueue.length) {
			const receiver = this.receiveQueue[this.receiveQueueHead++];
			if (receiver) {
				receiver.resolve(value);
				return Promise.resolve(true);
			}
		}

		// If buffer has space, add to buffer
		if (this.bufferSize < this.capacity) {
			this.buffer.push(value);
			return Promise.resolve(true);
		}

		// Otherwise, wait for space
		let resolveSend!: (value: boolean) => void;
		let rejectSend!: (reason: unknown) => void;
		const promise = new Promise<boolean>((res, rej) => {
			resolveSend = res;
			rejectSend = rej;
		});
		this.sendQueue.push({
			resolve: () => {
				this.buffer.push(value);
				resolveSend(true);
			},
			reject: rejectSend,
		});
		return promise;
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

		// If buffer has items, return from buffer
		if (this.bufferSize > 0) {
			const value = this.buffer[this.bufferHead++];

			// Compact buffer occasionally to prevent unbounded growth
			if (this.bufferHead > 100 && this.bufferHead > this.buffer.length / 2) {
				this.buffer = this.buffer.slice(this.bufferHead);
				this.bufferHead = 0;
			}

			// Unblock a waiting sender if any
			while (this.sendQueueHead < this.sendQueue.length) {
				const sender = this.sendQueue[this.sendQueueHead++];
				if (sender) {
					sender.resolve();
					break;
				}
			}

			return Promise.resolve(value);
		}

		// If closed and empty, return undefined
		if (this.closed) {
			return Promise.resolve(undefined);
		}

		// Otherwise, wait for a value
		let resolveRecv!: (value: T | undefined) => void;
		let rejectRecv!: (reason: unknown) => void;
		const promise = new Promise<T | undefined>((res, rej) => {
			resolveRecv = res;
			rejectRecv = rej;
		});
		this.receiveQueue.push({ resolve: resolveRecv, reject: rejectRecv });
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
