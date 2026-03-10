/**
 * Worker Pool for go-go-scope
 * Provides structured concurrency for CPU-intensive operations using Worker Threads
 */
import type { Result } from "./types.js";
/**
 * Options for creating a WorkerPool
 */
export interface WorkerPoolOptions {
	/** Number of worker threads in the pool. Default: CPU count */
	size?: number;
	/** Timeout in ms before idle workers are terminated. Default: 60000 */
	idleTimeout?: number;
	/** Enable SharedArrayBuffer for zero-copy transfers. Default: false */
	sharedMemory?: boolean;
	/** Maximum memory per worker in MB. Default: 512 */
	resourceLimits?: {
		maxOldGenerationSizeMb?: number;
		maxYoungGenerationSizeMb?: number;
	};
}
/**
 * A pool of worker threads for executing CPU-intensive tasks.
 * Implements AsyncDisposable for structured concurrency.
 *
 * @example
 * ```typescript
 * await using pool = new WorkerPool({ size: 4 });
 *
 * const result = await pool.execute(
 *   (n) => fibonacci(n),
 *   40
 * );
 * ```
 */
export declare class WorkerPool implements AsyncDisposable {
	private workers;
	private pending;
	private taskIdCounter;
	private disposed;
	private idleCheckInterval?;
	private readonly options;
	constructor(options?: WorkerPoolOptions);
	/**
	 * Execute a function in a worker thread.
	 * If no workers are available, queues the task.
	 */
	execute<T, R>(
		fn: (data: T) => R,
		data: T,
		transferList?: Transferable[],
	): Promise<R>;
	/**
	 * Execute multiple tasks in parallel using the worker pool.
	 * Maintains order by default.
	 */
	executeBatch<T, R>(
		items: T[],
		fn: (data: T) => R,
		options?: {
			ordered?: boolean;
		},
	): Promise<Result<Error, R>[]>;
	/**
	 * Get current pool statistics
	 */
	stats(): {
		total: number;
		busy: number;
		idle: number;
		pending: number;
	};
	/**
	 * Dispose the worker pool and terminate all workers.
	 * Pending tasks will be rejected.
	 */
	[Symbol.asyncDispose](): Promise<void>;
	/**
	 * Check if pool is disposed
	 */
	get isDisposed(): boolean;
	private createWorker;
	private findIdleWorker;
	private runTask;
	private handleWorkerMessage;
	private handleWorkerError;
	private releaseWorker;
	private removeWorker;
	private startIdleCleanup;
}
/**
 * Create a worker pool with the given options.
 * Convenience function for API consistency.
 */
export declare function workerPool(options?: WorkerPoolOptions): WorkerPool;
