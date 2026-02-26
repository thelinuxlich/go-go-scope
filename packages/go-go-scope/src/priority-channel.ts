/**
 * Priority Channel implementation for go-go-scope
 *
 * A channel that delivers items based on priority rather than FIFO order.
 * Uses a binary heap for efficient O(log n) insertions and extractions.
 */

// AbortSignal is a global type in modern Node.js/TypeScript

/**
 * Interface for items that have a priority
 */
export interface PrioritizedItem<T> {
	/** The item value */
	value: T;
	/** Priority - lower numbers = higher priority */
	priority: number;
}

/**
 * Comparator function for priorities
 * Return negative if a < b, 0 if equal, positive if a > b
 */
export type PriorityComparator<T> = (a: T, b: T) => number;

/**
 * Options for creating a priority channel
 */
export interface PriorityChannelOptions<T> {
	/** Maximum number of items in the channel */
	capacity?: number;
	/** Comparator function for ordering items */
	comparator: PriorityComparator<T>;
	/** Optional callback when an item is dropped due to capacity */
	onDrop?: (value: T) => void;
}

// Queue item types for type safety
interface SendQueueItem<T> {
	resolve: () => void;
	reject: (reason: unknown) => void;
	value: T;
}

interface ReceiveQueueItem<T> {
	resolve: (value: T | undefined) => void;
	reject: (reason: unknown) => void;
}

/**
 * Binary min-heap implementation for priority queue
 */
class BinaryHeap<T> {
	private heap: T[] = [];

	constructor(private readonly comparator: PriorityComparator<T>) {}

	get size(): number {
		return this.heap.length;
	}

	isEmpty(): boolean {
		return this.heap.length === 0;
	}

	peek(): T | undefined {
		return this.heap[0];
	}

	insert(value: T): void {
		this.heap.push(value);
		this.bubbleUp(this.heap.length - 1);
	}

	extract(): T | undefined {
		if (this.heap.length === 0) return undefined;
		if (this.heap.length === 1) return this.heap.pop();

		const min = this.heap[0];
		this.heap[0] = this.heap.pop()!;
		this.bubbleDown(0);
		return min;
	}

	clear(): void {
		this.heap.length = 0;
	}

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
 * Items are delivered based on priority (determined by comparator) rather than FIFO.
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
	 * If buffer is full, waits until space is available.
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
	 * Try to send without blocking.
	 * Returns true if sent, false if buffer full.
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
	 * Send with drop behavior - drops the value if buffer is full.
	 * Calls onDrop callback if provided.
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
	 * Returns undefined if channel is closed and empty.
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
	 * Returns the value or undefined if empty.
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
	 */
	peek(): T | undefined {
		return this.buffer.peek();
	}

	/**
	 * Close the channel.
	 * No more sends allowed, but pending receives will get remaining values.
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
	 * Check if channel is closed.
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get current buffer size.
	 */
	get size(): number {
		return this.buffer.size;
	}

	/**
	 * Get buffer capacity.
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Check if buffer is empty.
	 */
	get isEmpty(): boolean {
		return this.buffer.isEmpty();
	}

	/**
	 * Check if buffer is full.
	 */
	get isFull(): boolean {
		return this.buffer.size >= this.capacity;
	}

	/**
	 * Async iterator for the channel.
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
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.close();
	}

	private notifyReceivers(): void {
		// Unblock waiting receivers
		while (this.receiveQueue.length > 0 && !this.buffer.isEmpty()) {
			const receiver = this.receiveQueue.shift()!;
			const value = this.buffer.extract();
			receiver.resolve(value);
		}
	}

	private processWaitingSenders(): void {
		// Unblock waiting senders if there's space
		while (this.sendQueue.length > 0 && this.buffer.size < this.capacity) {
			const sender = this.sendQueue.shift()!;
			this.buffer.insert(sender.value);
			sender.resolve();
			this.notifyReceivers();
		}
	}

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
