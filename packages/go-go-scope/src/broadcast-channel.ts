/**
 * BroadcastChannel class for go-go-scope - Pub/sub pattern
 *
 * Unlike regular Channel where each message goes to one consumer,
 * BroadcastChannel sends each message to ALL active consumers.
 */

/**
 * A BroadcastChannel for pub/sub patterns.
 *
 * All consumers receive every message (unlike regular {@link Channel} where messages
 * are distributed to one consumer each). This is useful for event broadcasting,
 * notifications, and fan-out scenarios.
 *
 * Features:
 * - Multiple subscribers receive all messages
 * - Per-subscriber message queuing
 * - Automatic cleanup on scope disposal
 * - AsyncIterable support for subscribers
 *
 * @example
 * ```typescript
 * await using s = scope();
 * const broadcast = s.broadcast<string>();
 *
 * // Subscribe multiple consumers
 * s.task(async () => {
 *   for await (const msg of broadcast.subscribe()) {
 *     console.log('Consumer 1:', msg);
 *   }
 * });
 *
 * s.task(async () => {
 *   for await (const msg of broadcast.subscribe()) {
 *     console.log('Consumer 2:', msg);
 *   }
 * });
 *
 * // Publish messages (all consumers receive each message)
 * await broadcast.send('hello');
 * await broadcast.send('world');
 * broadcast.close();
 * ```
 *
 * @example
 * ```typescript
 * // Real-world: System notifications
 * await using s = scope();
 * const notifications = s.broadcast<{
 *   type: 'info' | 'warning' | 'error';
 *   message: string;
 * }>();
 *
 * // Logger subscriber
 * s.task(async () => {
 *   for await (const notif of notifications.subscribe()) {
 *     console.log(`[${notif.type.toUpperCase()}] ${notif.message}`);
 *   }
 * });
 *
 * // Analytics subscriber
 * s.task(async () => {
 *   for await (const notif of notifications.subscribe()) {
 *     await trackEvent('notification', { type: notif.type });
 *   }
 * });
 *
 * // UI subscriber
 * s.task(async () => {
 *   for await (const notif of notifications.subscribe()) {
 *     showToast(notif.type, notif.message);
 *   }
 * });
 *
 * // Publish from anywhere
 * await notifications.send({ type: 'info', message: 'System ready' });
 * await notifications.send({ type: 'warning', message: 'Low memory' });
 * ```
 *
 * @see {@link Channel} for point-to-point communication
 * @see {@link Scope.broadcast} for creating broadcast channels
 */
/* #__PURE__ */
export class BroadcastChannel<T> implements AsyncDisposable {
	private subscribers: Array<{
		queue: T[];
		resolve: ((value: IteratorResult<T>) => void) | null;
		closed: boolean;
	}> = [];
	private closed = false;
	private aborted = false;
	private abortReason: unknown;

	/**
	 * Creates a new BroadcastChannel.
	 *
	 * @param parentSignal - Optional AbortSignal from parent scope for automatic cleanup
	 */
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
	 *
	 * Returns an async iterable that receives all messages published to the channel.
	 * Each subscriber maintains its own queue, so slow consumers don't block others.
	 *
	 * @returns AsyncIterable that yields all broadcast messages
	 * @throws {Error} If the channel is already closed
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const broadcast = s.broadcast<string>();
	 *
	 * // Subscribe and consume messages
	 * for await (const msg of broadcast.subscribe()) {
	 *   console.log('Received:', msg);
	 * }
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Using break to stop subscribing
	 * s.task(async () => {
	 *   let count = 0;
	 *   for await (const msg of broadcast.subscribe()) {
	 *     console.log(msg);
	 *     if (++count >= 10) break; // Stop after 10 messages
	 *   }
	 *   // Subscriber is automatically cleaned up
	 * });
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
	 *
	 * Resolves when all subscribers have received the message.
	 * If a subscriber is not actively waiting, the message is queued for them.
	 *
	 * @param value - The value to broadcast to all subscribers
	 * @returns Promise that resolves to true if sent successfully, false if channel is closed
	 * @throws {unknown} If the scope is aborted
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const events = s.broadcast<{ type: string; data: unknown }>();
	 *
	 * // Multiple subscribers
	 * s.task(async () => {
	 *   for await (const event of events.subscribe()) {
	 *     console.log('Handler 1:', event.type);
	 *   }
	 * });
	 *
	 * s.task(async () => {
	 *   for await (const event of events.subscribe()) {
	 *     console.log('Handler 2:', event.type);
	 *   }
	 * });
	 *
	 * // Both handlers receive this message
	 * await events.send({ type: 'user.login', data: { userId: 123 } });
	 * ```
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
	 *
	 * @returns Number of subscribers that haven't been closed
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const broadcast = s.broadcast<string>();
	 *
	 * console.log(broadcast.subscriberCount); // 0
	 *
	 * const sub1 = broadcast.subscribe();
	 * const sub2 = broadcast.subscribe();
	 *
	 * console.log(broadcast.subscriberCount); // 2
	 * ```
	 */
	get subscriberCount(): number {
		return this.subscribers.filter((s) => !s.closed).length;
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
	 * Close the channel. No more messages can be sent.
	 *
	 * Existing subscribers will drain their queued messages, then
	 * their iterators will complete (done: true).
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const broadcast = s.broadcast<string>();
	 *
	 * const sub = broadcast.subscribe();
	 *
	 * await broadcast.send('message 1');
	 * await broadcast.send('message 2');
	 *
	 * broadcast.close();
	 *
	 * // Subscriber can still drain queued messages
	 * for await (const msg of sub) {
	 *   console.log(msg); // 'message 1', 'message 2'
	 * }
	 *
	 * // After this, sends will return false
	 * const result = await broadcast.send('message 3'); // false
	 * ```
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
	 *
	 * This immediately terminates all subscribers and clears all queues.
	 *
	 * @returns Promise that resolves when disposal is complete
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.close();
		this.aborted = true;
		this.abortReason = new Error("broadcast channel disposed");
		this.subscribers = [];
	}
}
