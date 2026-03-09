/**
 * Batch utility for go-go-scope - Collect items and process in batches
 */

import type { Scope } from "./scope.js";
import type { Result } from "./types.js";

/**
 * Options for batch processing
 */
export interface BatchOptions<T, R> {
	/** Maximum number of items per batch (default: 100) */
	size?: number;
	/** Maximum time in ms to wait before flushing (default: 1000) */
	timeout?: number;
	/** Function to process a batch of items */
	process: (items: T[]) => Promise<R>;
}

/**
 * Batch collector that accumulates items and processes them in batches.
 * Automatically flushes when batch is full or timeout is reached.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const batcher = s.batch({
 *   size: 100,
 *   timeout: 5000,
 *   process: async (users) => {
 *     await db.users.insertMany(users)
 *     return users.length
 *   }
 * })
 *
 * // Add items - they accumulate
 * await batcher.add({ name: 'Alice' })
 * await batcher.add({ name: 'Bob' })
 *
 * // Manually flush when needed
 * const [err, count] = await batcher.flush()
 *
 * // Auto-flush on scope disposal
 * ```
 */
export class Batch<T, R> {
	private items: T[] = [];
	private timeoutId: ReturnType<typeof setTimeout> | null = null;
	private pendingFlush: Promise<Result<unknown, R>> | null = null;
	private flushResolve: ((result: Result<unknown, R>) => void) | null = null;
	private stopped = false;

	constructor(
		private scope: Scope<Record<string, unknown>>,
		private options: BatchOptions<T, R>,
	) {
		// Register cleanup on scope disposal
		this.scope.onDispose(() => {
			this.stopped = true;
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = null;
			}
			// Note: We don't auto-flush on disposal because the scope may already
			// be disposed. Call stop() before disposal to ensure items are processed.
		});
	}

	/**
	 * Add an item to the batch.
	 * If batch reaches size limit, it auto-flushes.
	 * Returns a promise that resolves when the item is processed (if batch flushes).
	 */
	async add(item: T): Promise<Result<unknown, R> | undefined> {
		if (this.stopped) {
			return [new Error("Batch is stopped"), undefined];
		}

		this.items.push(item);

		const size = this.options.size ?? 100;

		// Auto-flush if batch is full
		if (this.items.length >= size) {
			return this.flush();
		}

		// Start timeout if not already running
		this.startTimeout();

		return undefined;
	}

	/**
	 * Add multiple items at once.
	 * May trigger multiple flushes if items exceed batch size.
	 */
	async addMany(items: T[]): Promise<Result<unknown, R>[]> {
		if (this.stopped) {
			return [[new Error("Batch is stopped"), undefined]];
		}

		const results: Result<unknown, R>[] = [];

		for (const item of items) {
			const result = await this.add(item);
			if (result) {
				results.push(result);
			}
		}

		return results;
	}

	/**
	 * Manually flush the current batch.
	 * Returns a Result tuple with the process result.
	 */
	async flush(): Promise<Result<unknown, R>> {
		if (this.pendingFlush) {
			return this.pendingFlush;
		}

		if (this.items.length === 0) {
			return [new Error("Batch is empty"), undefined];
		}

		// Clear any pending timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		// Create pending flush promise
		this.pendingFlush = new Promise((resolve) => {
			this.flushResolve = resolve;
		});

		// Capture items and clear
		const itemsToProcess = this.items;
		this.items = [];

		// Process in a task for proper cancellation support
		this.scope
			.task(async () => this.options.process(itemsToProcess))
			.then((result) => {
				if (this.flushResolve) {
					this.flushResolve(result);
				}
			})
			.catch((error) => {
				if (this.flushResolve) {
					this.flushResolve([error, undefined]);
				}
			})
			.finally(() => {
				this.pendingFlush = null;
				this.flushResolve = null;
			});

		return this.pendingFlush;
	}

	/**
	 * Stop the batch processor.
	 * Flushes any pending items and prevents new items from being added.
	 */
	async stop(): Promise<Result<unknown, R> | undefined> {
		if (this.stopped) {
			return this.pendingFlush ?? undefined;
		}

		this.stopped = true;

		// Clear timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		// Flush remaining items
		if (this.items.length > 0) {
			return this.flush();
		}

		return this.pendingFlush ?? undefined;
	}

	/**
	 * Get the current number of items in the batch.
	 */
	get size(): number {
		return this.items.length;
	}

	/**
	 * Check if batch is stopped.
	 */
	get isStopped(): boolean {
		return this.stopped;
	}

	private startTimeout(): void {
		if (this.timeoutId) return;

		const timeout = this.options.timeout ?? 1000;

		this.timeoutId = setTimeout(() => {
			this.timeoutId = null;
			if (this.items.length > 0 && !this.stopped) {
				void this.flush();
			}
		}, timeout);
	}
}
