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
		return new Promise((resolve, reject) => {
			this.sendQueue.push({
				resolve: () => {
					this.buffer.push(value);
					resolve(true);
				},
				reject,
			});
		});
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
		return new Promise((resolve, reject) => {
			this.receiveQueue.push({ resolve, reject });
		});
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
}
