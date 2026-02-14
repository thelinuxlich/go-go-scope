/**
 * BroadcastChannel class for go-go-scope - Pub/sub pattern
 *
 * Unlike regular Channel where each message goes to one consumer,
 * BroadcastChannel sends each message to ALL active consumers.
 */

/**
 * A BroadcastChannel for pub/sub patterns.
 * All consumers receive every message (unlike regular Channel where messages
 * are distributed to one consumer each).
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const broadcast = s.broadcast<string>()
 *
 * // Subscribe multiple consumers
 * s.task(async () => {
 *   for await (const msg of broadcast.subscribe()) {
 *     console.log('Consumer 1:', msg)
 *   }
 * })
 *
 * s.task(async () => {
 *   for await (const msg of broadcast.subscribe()) {
 *     console.log('Consumer 2:', msg)
 *   }
 * })
 *
 * // Publish messages (all consumers receive each message)
 * await broadcast.send('hello')
 * await broadcast.send('world')
 * broadcast.close()
 * ```
 */
export class BroadcastChannel<T> implements AsyncDisposable {
	private subscribers: Array<{
		queue: T[];
		resolve: ((value: IteratorResult<T>) => void) | null;
		closed: boolean;
	}> = [];
	private closed = false;
	private aborted = false;
	private abortReason: unknown;

	constructor(parentSignal?: AbortSignal) {
		if (parentSignal) {
			parentSignal.addEventListener(
				"abort",
				() => {
					this.aborted = true;
					this.abortReason = parentSignal.reason;
					this.close();
				},
				{ once: true },
			);
		}
	}

	/**
	 * Subscribe to the broadcast channel.
	 * Returns an async iterable that receives all messages.
	 *
	 * @example
	 * ```typescript
	 * for await (const msg of broadcast.subscribe()) {
	 *   console.log(msg)
	 * }
	 * ```
	 */
	subscribe(): AsyncIterable<T> {
		if (this.closed) {
			throw new Error("Cannot subscribe to closed broadcast channel");
		}

		const subscriber = {
			queue: [] as T[],
			resolve: null as ((value: IteratorResult<T>) => void) | null,
			closed: false,
		};
		this.subscribers.push(subscriber);

		return {
			[Symbol.asyncIterator]: (): AsyncIterator<T> => ({
				next: async (): Promise<IteratorResult<T>> => {
					if (this.aborted) {
						return Promise.reject(this.abortReason);
					}

					// If there are queued messages, return the first one
					if (subscriber.queue.length > 0) {
						const value = subscriber.queue.shift();
						if (value !== undefined) {
							return { value, done: false };
						}
					}

					// If channel is closed and empty, end iteration
					if (
						subscriber.closed ||
						(this.closed && subscriber.queue.length === 0)
					) {
						return { value: undefined, done: true };
					}

					// Wait for next message
					return new Promise<IteratorResult<T>>((resolve) => {
						subscriber.resolve = resolve;
					});
				},
				return: async (): Promise<IteratorResult<T>> => {
					subscriber.closed = true;
					return { value: undefined, done: true };
				},
			}),
		};
	}

	/**
	 * Send a value to all subscribers.
	 * Resolves when all subscribers have received the message.
	 * Returns false if the channel is closed.
	 */
	async send(value: T): Promise<boolean> {
		if (this.closed) {
			return false;
		}

		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// Send to all subscribers
		for (const subscriber of this.subscribers) {
			if (subscriber.closed) continue;

			if (subscriber.resolve) {
				// Subscriber is waiting, resolve immediately
				const resolve = subscriber.resolve;
				subscriber.resolve = null;
				resolve({ value, done: false });
			} else {
				// Subscriber not waiting, queue the message
				subscriber.queue.push(value);
			}
		}

		return true;
	}

	/**
	 * Get the number of active subscribers.
	 */
	get subscriberCount(): number {
		return this.subscribers.filter((s) => !s.closed).length;
	}

	/**
	 * Check if the channel is closed.
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Close the channel. No more messages can be sent.
	 * Existing subscribers will drain their queues then end.
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;

		// Signal all subscribers that channel is closed
		for (const subscriber of this.subscribers) {
			if (subscriber.resolve) {
				const resolve = subscriber.resolve;
				subscriber.resolve = null;
				resolve({ value: undefined, done: true });
			}
		}
	}

	/**
	 * Dispose the channel, aborting all pending operations.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.close();
		this.aborted = true;
		this.abortReason = new Error("broadcast channel disposed");
		this.subscribers = [];
	}
}
