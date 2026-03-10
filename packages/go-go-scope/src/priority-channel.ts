/**
 * Priority Channel implementation for go-go-scope
 *
 * @module go-go-scope/priority-channel
 *
 * @description
 * A channel that delivers items based on priority rather than FIFO order.
 * Uses a binary heap for efficient O(log n) insertions and extractions.
 *
 * Features:
 * - Priority-based message delivery (not FIFO)
 * - Configurable capacity with backpressure
 * - O(log n) insertions and extractions via binary heap
 * - Custom comparator for flexible priority schemes
 * - Async iterable support for `for await...of` loops
 * - Drop-on-full capability with callback
 * - Graceful close and cleanup
 *
 * @see {@link Scope.priorityChannel} For creating priority channels via scope
 * @see {@link PriorityChannelOptions} Configuration options
 * @see {@link PriorityComparator} Comparator function type
 */

// AbortSignal is a global type in modern Node.js/TypeScript

/**
 * Interface for items that have a priority value.
 *
 * This is a helper interface for common use cases where items
 * have an explicit numeric priority. You can also use any type
 * with a custom comparator function.
 *
 * @template T The type of the item value
 *
 * @see {@link PriorityComparator} For custom comparison logic
 *
 * @example
 * ```typescript
 * interface Task extends PrioritizedItem<string> {
 *   id: string;
 * }
 *
 * const task: Task = {
 *   value: 'process-data',
 *   priority: 1,  // Lower = higher priority
 *   id: 'task-123'
 * };
 * ```
 */
export interface PrioritizedItem<T> {
	/** The item value */
	value: T;
	/** Priority - lower numbers = higher priority */
	priority: number;
}

/**
 * Comparator function for determining priority order.
 *
 * Return negative if a < b (a has higher priority),
 * 0 if equal priority,
 * positive if a > b (b has higher priority).
 *
 * For numeric priorities, simply subtract: `(a, b) => a.priority - b.priority`
 *
 * @template T The type of items being compared
 * @param a - First item to compare
 * @param b - Second item to compare
 * @returns {number} Negative if a < b, 0 if equal, positive if a > b
 *
 * @see {@link PriorityChannelOptions.comparator} Where this is used
 *
 * @example
 * ```typescript
 * // Numeric priority (lower = higher priority)
 * const numericComparator: PriorityComparator<Task> = (a, b) => a.priority - b.priority;
 *
 * // Reverse priority (higher = higher priority)
 * const reverseComparator: PriorityComparator<Task> = (a, b) => b.priority - a.priority;
 *
 * // Complex multi-field sorting
 * const complexComparator: PriorityComparator<Job> = (a, b) => {
 *   if (a.priority !== b.priority) {
 *     return a.priority - b.priority;
 *   }
 *   // Secondary sort by deadline
 *   return a.deadline - b.deadline;
 * };
 * ```
 */
export type PriorityComparator<T> = (a: T, b: T) => number;

/**
 * Options for creating a priority channel.
 *
 * @template T The type of items in the channel
 *
 * @see {@link PriorityChannel} The channel class
 * @see {@link Scope.priorityChannel} Factory on scope
 *
 * @example
 * ```typescript
 * const options: PriorityChannelOptions<Task> = {
 *   capacity: 100,
 *   comparator: (a, b) => a.priority - b.priority,
 *   onDrop: (task) => console.warn(`Dropped task: ${task.id}`)
 * };
 * ```
 */
export interface PriorityChannelOptions<T> {
	/** Maximum number of items in the channel */
	capacity?: number;
	/** Comparator function for ordering items by priority */
	comparator: PriorityComparator<T>;
	/** Optional callback when an item is dropped due to capacity */
	onDrop?: (value: T) => void;
}

// Queue item types for type safety
/**
 * Internal type for queued send operations.
 *
 * @internal
 */
interface SendQueueItem<T> {
	resolve: () => void;
	reject: (reason: unknown) => void;
	value: T;
}

/**
 * Internal type for queued receive operations.
 *
 * @internal
 */
interface ReceiveQueueItem<T> {
	resolve: (value: T | undefined) => void;
	reject: (reason: unknown) => void;
}

/**
 * Binary min-heap implementation for efficient priority queue operations.
 *
 * Provides O(log n) insertion and extraction, O(1) peek at highest priority item.
 *
 * @template T The type of items in the heap
 *
 * @internal Used internally by PriorityChannel
 */
class BinaryHeap<T> {
	private heap: T[] = [];

	/**
	 * Creates a new BinaryHeap.
	 *
	 * @param comparator - Function to compare item priorities
	 */
	constructor(private readonly comparator: PriorityComparator<T>) {}

	/**
	 * Number of items in the heap.
	 */
	get size(): number {
		return this.heap.length;
	}

	/**
	 * Check if the heap is empty.
	 *
	 * @returns {boolean} True if heap has no items
	 */
	isEmpty(): boolean {
		return this.heap.length === 0;
	}

	/**
	 * Peek at the highest priority item without removing it.
	 *
	 * @returns {T | undefined} The highest priority item, or undefined if empty
	 */
	peek(): T | undefined {
		return this.heap[0];
	}

	/**
	 * Insert an item into the heap.
	 *
	 * @param value - Item to insert
	 */
	insert(value: T): void {
		this.heap.push(value);
		this.bubbleUp(this.heap.length - 1);
	}

	/**
	 * Extract and return the highest priority item.
	 *
	 * @returns {T | undefined} The highest priority item, or undefined if empty
	 */
	extract(): T | undefined {
		if (this.heap.length === 0) return undefined;
		if (this.heap.length === 1) return this.heap.pop();

		const min = this.heap[0];
		this.heap[0] = this.heap.pop()!;
		this.bubbleDown(0);
		return min;
	}

	/**
	 * Remove all items from the heap.
	 */
	clear(): void {
		this.heap.length = 0;
	}

	/**
	 * @internal Restore heap property by bubbling up
	 */
	private bubbleUp(index: number): void {
		const parent = Math.floor((index - 1) / 2);
		if (
			parent >= 0 &&
			this.comparator(this.heap[index]!, this.heap[parent]!) < 0
		) {
			[this.heap[index], this.heap[parent]] = [
				this.heap[parent]!,
				this.heap[index]!,
			];
			this.bubbleUp(parent);
		}
	}

	/**
	 * @internal Restore heap property by bubbling down
	 */
	private bubbleDown(index: number): void {
		const left = 2 * index + 1;
		const right = 2 * index + 2;
		let smallest = index;

		if (
			left < this.heap.length &&
			this.comparator(this.heap[left]!, this.heap[smallest]!) < 0
		) {
			smallest = left;
		}
		if (
			right < this.heap.length &&
			this.comparator(this.heap[right]!, this.heap[smallest]!) < 0
		) {
			smallest = right;
		}

		if (smallest !== index) {
			[this.heap[index], this.heap[smallest]] = [
				this.heap[smallest]!,
				this.heap[index]!,
			];
			this.bubbleDown(smallest);
		}
	}
}

/**
 * A Priority Channel for concurrent communication with priority ordering.
 *
 * Unlike regular channels that use FIFO ordering, priority channels deliver
 * items based on priority as determined by a comparator function.
 *
 * Items are stored in a binary heap for efficient O(log n) insertions and
 * extractions. The highest priority item (as determined by the comparator)
 * is always delivered first.
 *
 * @template T The type of items in the channel
 *
 * @implements {AsyncIterable<T>} For `for await...of` iteration
 * @implements {AsyncDisposable} For automatic cleanup with `await using`
 *
 * @see {@link Scope.priorityChannel} Factory method on scope
 * @see {@link PriorityChannelOptions} Configuration options
 * @see {@link PriorityComparator} Comparator function type
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * // Create a priority channel with numeric priorities (lower = higher priority)
 * const pq = s.priorityChannel<Task>({
 *   capacity: 100,
 *   comparator: (a, b) => a.priority - b.priority
 * })
 *
 * // Send tasks with priorities
 * await pq.send({ value: task1, priority: 3 })
 * await pq.send({ value: task2, priority: 1 })  // Higher priority
 * await pq.send({ value: task3, priority: 2 })
 *
 * // Receive in priority order: task2, task3, task1
 * const item = await pq.receive() // task2
 * ```
 */
/* #__PURE__ */
export class PriorityChannel<T> implements AsyncIterable<T>, AsyncDisposable {
	private buffer: BinaryHeap<T>;
	private sendQueue: SendQueueItem<T>[] = [];
	private receiveQueue: ReceiveQueueItem<T>[] = [];
	private closed = false;
	private aborted = false;
	private abortReason: unknown;
	private readonly capacity: number;
	private readonly onDrop?: (value: T) => void;

	/**
	 * Creates a new PriorityChannel instance.
	 *
	 * @param options - Configuration options for the priority channel
	 * @param options.comparator - Comparator function for ordering items by priority
	 * @param options.capacity - Maximum number of items in the channel (default: 0, unbounded)
	 * @param options.onDrop - Optional callback when an item is dropped due to capacity
	 * @param parentSignal - Optional AbortSignal for cancellation propagation
	 *
	 * @internal Use {@link Scope.priorityChannel} instead of constructing directly
	 */
	constructor(options: PriorityChannelOptions<T>, parentSignal?: AbortSignal) {
		this.capacity = options.capacity ?? 0;
		this.onDrop = options.onDrop;
		this.buffer = new BinaryHeap<T>(options.comparator);

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
	 * Send a value to the channel.
	 *
	 * If the buffer has space, the value is inserted immediately.
	 * If the buffer is full, blocks until space is available.
	 *
	 * @param value - The value to send
	 * @returns {Promise<void>} Resolves when the value is sent
	 *
	 * @throws {Error} If the channel is closed
	 * @throws {Error} If the channel is aborted
	 *
	 * @see {@link PriorityChannel.trySend} For non-blocking send
	 * @see {@link PriorityChannel.sendOrDrop} For drop-on-full behavior
	 *
	 * @example
	 * ```typescript
	 * // Send with blocking if buffer full
	 * await channel.send({ task: 'process', priority: 1 });
	 *
	 * // Send in a loop
	 * for (const task of tasks) {
	 *   await channel.send(task);
	 * }
	 * ```
	 */
	async send(value: T): Promise<void> {
		if (this.closed) {
			throw new Error("Cannot send on closed channel");
		}
		if (this.aborted) {
			throw new Error(`Channel aborted: ${this.abortReason}`);
		}

		// Fast path: buffer has space
		if (this.buffer.size < this.capacity) {
			this.buffer.insert(value);
			this.notifyReceivers();
			return;
		}

		// Slow path: wait for space
		return new Promise((resolve, reject) => {
			this.sendQueue.push({ resolve, reject, value });
		});
	}

	/**
	 * Try to send a value without blocking.
	 *
	 * Returns true if the value was sent, false if the buffer is full.
	 *
	 * @param value - The value to send
	 * @returns {boolean} True if sent, false if buffer full
	 *
	 * @see {@link PriorityChannel.send} For blocking send
	 * @see {@link PriorityChannel.sendOrDrop} For drop-on-full with callback
	 *
	 * @example
	 * ```typescript
	 * // Try to send without blocking
	 * if (!channel.trySend(urgentTask)) {
	 *   // Buffer full - handle differently
	 *   await fallbackQueue.send(urgentTask);
	 * }
	 *
	 * // Send multiple items, skipping if full
	 * for (const item of items) {
	 *   if (!channel.trySend(item)) {
	 *     console.log(`Skipped ${item.id}: buffer full`);
	 *   }
	 * }
	 * ```
	 */
	trySend(value: T): boolean {
		if (this.closed || this.aborted) return false;

		if (this.buffer.size < this.capacity) {
			this.buffer.insert(value);
			this.notifyReceivers();
			return true;
		}

		return false;
	}

	/**
	 * Send a value or drop it if the buffer is full.
	 *
	 * If the buffer has space, inserts the value.
	 * If the buffer is full, calls the onDrop callback if configured.
	 *
	 * @param value - The value to send
	 *
	 * @see {@link PriorityChannelOptions.onDrop} Callback configuration
	 * @see {@link PriorityChannel.trySend} For non-blocking without callback
	 * @see {@link PriorityChannel.send} For blocking send
	 *
	 * @example
	 * ```typescript
	 * const channel = s.priorityChannel({
	 *   capacity: 10,
	 *   comparator: (a, b) => a.priority - b.priority,
	 *   onDrop: (item) => metrics.increment('dropped_tasks')
	 * });
	 *
	 * // Send or drop
	 * channel.sendOrDrop(lowPriorityTask);  // May be dropped if buffer full
	 * channel.sendOrDrop(highPriorityTask); // May be dropped if buffer full
	 *
	 * // Process important items without blocking
	 * for (const event of events) {
	 *   if (event.urgent) {
	 *     await channel.send(event); // Block for urgent
	 *   } else {
	 *     channel.sendOrDrop(event); // Drop if full for non-urgent
	 *   }
	 * }
	 * ```
	 */
	sendOrDrop(value: T): void {
		if (this.closed || this.aborted) {
			this.onDrop?.(value);
			return;
		}

		if (this.buffer.size < this.capacity) {
			this.buffer.insert(value);
			this.notifyReceivers();
		} else {
			this.onDrop?.(value);
		}
	}

	/**
	 * Receive the highest priority value from the channel.
	 *
	 * Returns the highest priority item immediately if available.
	 * If the buffer is empty, blocks until an item is sent or the channel is closed.
	 *
	 * @returns {Promise<T | undefined>} The highest priority item, or undefined if channel closed and empty
	 *
	 * @throws {Error} If the channel is aborted
	 *
	 * @see {@link PriorityChannel.tryReceive} For non-blocking receive
	 * @see {@link PriorityChannel.peek} For viewing without removing
	 *
	 * @example
	 * ```typescript
	 * // Receive single item
	 * const task = await channel.receive();
	 * if (task) {
	 *   await processTask(task);
	 * }
	 *
	 * // Receive until closed
	 * while (true) {
	 *   const item = await channel.receive();
	 *   if (item === undefined) break;
	 *   await process(item);
	 * }
	 * ```
	 */
	async receive(): Promise<T | undefined> {
		// Fast path: buffer has items
		if (!this.buffer.isEmpty()) {
			const value = this.buffer.extract();
			this.processWaitingSenders();
			return value;
		}

		// Channel closed and empty
		if (this.closed) {
			return undefined;
		}

		if (this.aborted) {
			throw new Error(`Channel aborted: ${this.abortReason}`);
		}

		// Slow path: wait for value
		return new Promise((resolve, reject) => {
			this.receiveQueue.push({ resolve, reject });
		});
	}

	/**
	 * Try to receive without blocking.
	 *
	 * Returns the highest priority value immediately if available,
	 * or undefined if the buffer is empty.
	 *
	 * @returns {T | undefined} The highest priority item, or undefined if empty
	 *
	 * @see {@link PriorityChannel.receive} For blocking receive
	 * @see {@link PriorityChannel.peek} For viewing without removing
	 *
	 * @example
	 * ```typescript
	 * // Process all available items
	 * while (true) {
	 *   const item = channel.tryReceive();
	 *   if (!item) break;
	 *   process(item);
	 * }
	 *
	 * // Check for work without blocking
	 * const task = channel.tryReceive();
	 * if (task) {
	 *   await processTask(task);
	 * } else {
	 *   // Do other work
	 *   await checkOtherQueues();
	 * }
	 * ```
	 */
	tryReceive(): T | undefined {
		if (!this.buffer.isEmpty()) {
			const value = this.buffer.extract();
			this.processWaitingSenders();
			return value;
		}
		return undefined;
	}

	/**
	 * Peek at the highest priority value without removing it.
	 *
	 * @returns {T | undefined} The highest priority item, or undefined if empty
	 *
	 * @see {@link PriorityChannel.receive} For removing items
	 * @see {@link PriorityChannel.tryReceive} For non-blocking removal
	 *
	 * @example
	 * ```typescript
	 * // Check next task without removing
	 * const nextTask = channel.peek();
	 * if (nextTask && nextTask.priority === 0) {
	 *   console.log('Urgent task waiting!');
	 * }
	 *
	 * // Get priority of next item
	 * const next = channel.peek();
	 * if (next) {
	 *   console.log(`Next priority: ${next.priority}`);
	 * }
	 * ```
	 */
	peek(): T | undefined {
		return this.buffer.peek();
	}

	/**
	 * Close the channel.
	 *
	 * No more sends are allowed after closing.
	 * Pending receives will get remaining values.
	 * Waiting senders will be rejected.
	 *
	 * @see {@link PriorityChannel.isClosed} Check if closed
	 * @see {@link PriorityChannel.[Symbol.asyncDispose]} For cleanup
	 *
	 * @example
	 * ```typescript
	 * // Signal no more items
	 * producerTask: async () => {
	 *   for (const item of items) {
	 *     await channel.send(item);
	 *   }
	 *   channel.close();
	 * }
	 *
	 * // Consumer knows when to stop
	 * consumerTask: async () => {
	 *   while (true) {
	 *     const item = await channel.receive();
	 *     if (item === undefined) break; // Channel closed
	 *     await process(item);
	 *   }
	 * }
	 * ```
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;

		// Reject all waiting senders
		for (const sender of this.sendQueue) {
			sender.reject(new Error("Channel closed"));
		}
		this.sendQueue = [];

		// Notify waiting receivers that no more values are coming
		if (this.buffer.isEmpty()) {
			for (const receiver of this.receiveQueue) {
				receiver.resolve(undefined);
			}
			this.receiveQueue = [];
		}
	}

	/**
	 * Check if the channel is closed.
	 *
	 * @returns {boolean} True if the channel is closed
	 *
	 * @see {@link PriorityChannel.close} To close the channel
	 *
	 * @example
	 * ```typescript
	 * if (!channel.isClosed) {
	 *   await channel.send(item);
	 * }
	 *
	 * // Guard against sending on closed channel
	 * const safeSend = (item: Task) => {
	 *   if (channel.isClosed) {
	 *     return false;
	 *   }
	 *   return channel.trySend(item);
	 * };
	 * ```
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get the current number of items in the buffer.
	 *
	 * @returns {number} Current buffer size
	 *
	 * @see {@link PriorityChannel.cap} For buffer capacity
	 * @see {@link PriorityChannel.isFull} Check if at capacity
	 * @see {@link PriorityChannel.isEmpty} Check if empty
	 *
	 * @example
	 * ```typescript
	 * console.log(`Queue: ${channel.size}/${channel.cap}`);
	 *
	 * if (channel.size > 50) {
	 *   console.warn('Channel backlog building up');
	 * }
	 * ```
	 */
	get size(): number {
		return this.buffer.size;
	}

	/**
	 * Get the buffer capacity.
	 *
	 * @returns {number} Maximum number of items the buffer can hold
	 *
	 * @see {@link PriorityChannel.size} For current size
	 *
	 * @example
	 * ```typescript
	 * const utilization = channel.size / channel.cap;
	 * if (utilization > 0.8) {
	 *   console.warn('Channel at 80% capacity');
	 * }
	 * ```
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Check if the buffer is empty.
	 *
	 * @returns {boolean} True if no items in buffer
	 *
	 * @see {@link PriorityChannel.size} Get item count
	 * @see {@link PriorityChannel.isFull} Check if full
	 *
	 * @example
	 * ```typescript
	 * while (!channel.isEmpty) {
	 *   const item = channel.tryReceive();
	 *   if (item) await process(item);
	 * }
	 * ```
	 */
	get isEmpty(): boolean {
		return this.buffer.isEmpty();
	}

	/**
	 * Check if the buffer is full.
	 *
	 * @returns {boolean} True if buffer is at capacity
	 *
	 * @see {@link PriorityChannel.size} Get item count
	 * @see {@link PriorityChannel.isEmpty} Check if empty
	 *
	 * @example
	 * ```typescript
	 * // Only send if not full
	 * if (!channel.isFull) {
	 *   await channel.send(item);
	 * }
	 *
	 * // Monitor backpressure
	 * if (channel.isFull) {
	 *   await backpressureHandler.wait();
	 * }
	 * ```
	 */
	get isFull(): boolean {
		return this.buffer.size >= this.capacity;
	}

	/**
	 * Async iterator for the channel.
	 *
	 * Allows using `for await...of` to iterate over channel values.
	 * Iteration continues until the channel is closed and empty.
	 *
	 * @returns {AsyncIterator<T>} Async iterator yielding channel values
	 *
	 * @implements {AsyncIterable<T>}
	 *
	 * @see {@link PriorityChannel.receive} For single receives
	 *
	 * @example
	 * ```typescript
	 * // Iterate with for await...of
	 * for await (const task of channel) {
	 *   await processTask(task);
	 * }
	 *
	 * // Process with early exit
	 * for await (const item of channel) {
	 *   if (item.type === 'shutdown') break;
	 *   await handle(item);
	 * }
	 *
	 * // Collect all items
	 * const items: Task[] = [];
	 * for await (const item of channel) {
	 *   items.push(item);
	 * }
	 * ```
	 */
	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		while (true) {
			const value = await this.receive();
			if (value === undefined) return;
			yield value;
		}
	}

	/**
	 * Async dispose - closes the channel.
	 *
	 * Called automatically when using `await using` syntax.
	 *
	 * @returns {Promise<void>} Resolves when closed
	 *
	 * @implements {AsyncDisposable}
	 *
	 * @see {@link PriorityChannel.close} Manual close method
	 *
	 * @example
	 * ```typescript
	 * await using channel = s.priorityChannel({
	 *   capacity: 100,
	 *   comparator: (a, b) => a.priority - b.priority
	 * });
	 *
	 * // Use channel...
	 * // Automatically closed when scope exits
	 * ```
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.close();
	}

	/**
	 * Notify waiting receivers that items are available.
	 *
	 * @internal
	 */
	private notifyReceivers(): void {
		// Unblock waiting receivers
		while (this.receiveQueue.length > 0 && !this.buffer.isEmpty()) {
			const receiver = this.receiveQueue.shift()!;
			const value = this.buffer.extract();
			receiver.resolve(value);
		}
	}

	/**
	 * Process waiting senders when space becomes available.
	 *
	 * @internal
	 */
	private processWaitingSenders(): void {
		// Unblock waiting senders if there's space
		while (this.sendQueue.length > 0 && this.buffer.size < this.capacity) {
			const sender = this.sendQueue.shift()!;
			this.buffer.insert(sender.value);
			sender.resolve();
			this.notifyReceivers();
		}
	}

	/**
	 * Drain all queues on abort.
	 *
	 * @internal
	 */
	private drainQueues(): void {
		// Reject all pending operations
		for (const sender of this.sendQueue) {
			sender.reject(new Error(`Channel aborted: ${this.abortReason}`));
		}
		this.sendQueue = [];

		for (const receiver of this.receiveQueue) {
			receiver.reject(new Error(`Channel aborted: ${this.abortReason}`));
		}
		this.receiveQueue = [];
	}
}
