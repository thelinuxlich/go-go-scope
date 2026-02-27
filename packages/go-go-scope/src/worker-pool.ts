/**
 * Worker Pool for go-go-scope
 * Provides structured concurrency for CPU-intensive operations using Worker Threads
 */

import { Worker } from "node:worker_threads";
import createDebug from "debug";
import type { Result } from "./types.js";

const debugWorker = createDebug("go-go-scope:worker");

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
 * Message types for worker communication
 */
interface WorkerMessage<T = unknown> {
	type: "execute" | "result" | "error" | "ping";
	id: number;
	data?: T;
	error?: {
		message: string;
		stack?: string;
	};
}

/**
 * Internal worker state
 */
interface PooledWorker {
	worker: Worker;
	busy: boolean;
	idleSince: number;
	taskId: number | null;
}

/**
 * Task pending execution
 */
interface PendingTask<T, R> {
	fn: (data: T) => R;
	data: T;
	transferList?: ArrayBuffer[];
	resolve: (result: R) => void;
	reject: (error: Error) => void;
	settled?: boolean;
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
export class WorkerPool implements AsyncDisposable {
	private workers: PooledWorker[] = [];
	private pending: PendingTask<unknown, unknown>[] = [];
	private taskIdCounter = 0;
	private disposed = false;
	private idleCheckInterval?: ReturnType<typeof setInterval>;
	private readonly options: Required<WorkerPoolOptions>;

	constructor(options: WorkerPoolOptions = {}) {
		this.options = {
			size: options.size ?? getDefaultWorkerCount(),
			idleTimeout: options.idleTimeout ?? 60000,
			sharedMemory: options.sharedMemory ?? false,
			resourceLimits: options.resourceLimits ?? {
				maxOldGenerationSizeMb: 512,
				maxYoungGenerationSizeMb: 128,
			},
		};

		// Start idle worker cleanup
		this.startIdleCleanup();

		debugWorker("WorkerPool created with %d workers", this.options.size);
	}

	/**
	 * Execute a function in a worker thread.
	 * If no workers are available, queues the task.
	 */
	async execute<T, R>(
		fn: (data: T) => R,
		data: T,
		transferList?: ArrayBuffer[],
	): Promise<R> {
		if (this.disposed) {
			throw new Error("WorkerPool has been disposed");
		}

		return new Promise<R>((resolve, reject) => {
			const task: PendingTask<T, R> = {
				fn,
				data,
				transferList,
				resolve: resolve as (result: unknown) => void,
				reject,
			};

			// Try to execute immediately
			const worker = this.findIdleWorker();
			if (worker) {
				this.runTask(worker, task as PendingTask<unknown, unknown>);
			} else if (this.workers.length < this.options.size) {
				// Create new worker if under limit
				const newWorker = this.createWorker();
				this.runTask(newWorker, task as PendingTask<unknown, unknown>);
			} else {
				// Queue the task
				this.pending.push(task as PendingTask<unknown, unknown>);
				debugWorker("Task queued, %d pending", this.pending.length);
			}
		});
	}

	/**
	 * Execute multiple tasks in parallel using the worker pool.
	 * Maintains order by default.
	 */
	async executeBatch<T, R>(
		items: T[],
		fn: (data: T) => R,
		options: { ordered?: boolean } = {},
	): Promise<Result<Error, R>[]> {
		const { ordered = true } = options;

		if (this.disposed) {
			throw new Error("WorkerPool has been disposed");
		}

		if (items.length === 0) {
			return [];
		}

		debugWorker("Executing batch of %d items", items.length);

		if (ordered) {
			// Execute all and preserve order
			const promises = items.map((item) =>
				this.execute(fn, item).then(
					(result): Result<Error, R> => [undefined, result],
					(error): Result<Error, R> => [
						error instanceof Error ? error : new Error(String(error)),
						undefined,
					],
				),
			);
			return Promise.all(promises);
		}

		// Fastest-first: Use Promise.all with index tracking
		const results = new Array<Result<Error, R>>(items.length);
		const promises = items.map((item, index) =>
			this.execute(fn, item).then(
				(result) => {
					results[index] = [undefined, result];
				},
				(error) => {
					results[index] = [
						error instanceof Error ? error : new Error(String(error)),
						undefined,
					];
				},
			),
		);

		await Promise.all(promises);
		return results;
	}

	/**
	 * Get current pool statistics
	 */
	stats(): {
		total: number;
		busy: number;
		idle: number;
		pending: number;
	} {
		return {
			total: this.workers.length,
			busy: this.workers.filter((w) => w.busy).length,
			idle: this.workers.filter((w) => !w.busy).length,
			pending: this.pending.length,
		};
	}

	/**
	 * Dispose the worker pool and terminate all workers.
	 * Pending tasks will be rejected.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;

		debugWorker("Disposing WorkerPool...");
		this.disposed = true;

		// Stop idle cleanup
		if (this.idleCheckInterval) {
			clearInterval(this.idleCheckInterval);
		}

		// Reject pending tasks
		for (const task of this.pending) {
			if (!task.settled) {
				task.settled = true;
				task.reject(new Error("WorkerPool disposed"));
			}
		}
		this.pending = [];

		// Reject any running tasks on workers
		for (const worker of this.workers) {
			const currentTask = (worker as unknown as Record<string, unknown>)
				.currentTask as PendingTask<unknown, unknown> | undefined;
			if (currentTask && !currentTask.settled) {
				currentTask.settled = true;
				currentTask.reject(new Error("WorkerPool disposed"));
			}
		}

		// Terminate all workers
		const terminationPromises = this.workers.map(async (w) => {
			try {
				await w.worker.terminate();
			} catch (err) {
				debugWorker("Error terminating worker: %O", err);
			}
		});

		await Promise.all(terminationPromises);
		this.workers = [];

		debugWorker("WorkerPool disposed");
	}

	/**
	 * Check if pool is disposed
	 */
	get isDisposed(): boolean {
		return this.disposed;
	}

	private createWorker(): PooledWorker {
		const workerCode = `
      const { parentPort } = require('worker_threads');
      
      parentPort.on('message', async (message) => {
        if (message.type === 'execute') {
          try {
            const fn = eval('(' + message.fn + ')');
            const result = await fn(message.data);
            parentPort.postMessage({
              type: 'result',
              id: message.id,
              data: result
            });
          } catch (error) {
            parentPort.postMessage({
              type: 'error',
              id: message.id,
              error: {
                message: error.message,
                stack: error.stack
              }
            });
          }
        }
      });
    `;

		const worker = new Worker(workerCode, {
			eval: true,
			resourceLimits: this.options.resourceLimits,
		});

		const pooledWorker: PooledWorker = {
			worker,
			busy: false,
			idleSince: Date.now(),
			taskId: null,
		};

		worker.on("message", (message: WorkerMessage) => {
			this.handleWorkerMessage(pooledWorker, message);
		});

		worker.on("error", (err) => {
			debugWorker("Worker error: %O", err);
			this.handleWorkerError(pooledWorker, err);
		});

		worker.on("exit", (code) => {
			if (code !== 0) {
				debugWorker("Worker exited with code %d", code);
			}
			this.removeWorker(pooledWorker);
		});

		this.workers.push(pooledWorker);
		debugWorker("Created new worker, total: %d", this.workers.length);

		return pooledWorker;
	}

	private findIdleWorker(): PooledWorker | undefined {
		return this.workers.find((w) => !w.busy);
	}

	private runTask(
		worker: PooledWorker,
		task: PendingTask<unknown, unknown>,
	): void {
		const taskId = ++this.taskIdCounter;
		worker.busy = true;
		worker.taskId = taskId;

		// Serialize function to string
		const fnString = task.fn.toString();

		const message: WorkerMessage = {
			type: "execute",
			id: taskId,
			data: task.data,
		};

		// Store task reference for result handling
		(worker as unknown as Record<string, unknown>).currentTask = task;

		worker.worker.postMessage({ ...message, fn: fnString }, task.transferList);

		debugWorker("Task %d assigned to worker", taskId);
	}

	private handleWorkerMessage(
		worker: PooledWorker,
		message: WorkerMessage,
	): void {
		const currentTask = (worker as unknown as Record<string, unknown>)
			.currentTask as PendingTask<unknown, unknown> | undefined;

		if (message.type === "result" && currentTask) {
			if (!currentTask.settled) {
				currentTask.settled = true;
				currentTask.resolve(message.data);
			}
			this.releaseWorker(worker);
		} else if (message.type === "error" && currentTask) {
			const error = new Error(message.error?.message ?? "Worker error");
			if (message.error?.stack) {
				error.stack = message.error.stack;
			}
			if (!currentTask.settled) {
				currentTask.settled = true;
				currentTask.reject(error);
			}
			this.releaseWorker(worker);
		}
	}

	private handleWorkerError(worker: PooledWorker, err: Error): void {
		const currentTask = (worker as unknown as Record<string, unknown>)
			.currentTask as PendingTask<unknown, unknown> | undefined;

		if (currentTask && !currentTask.settled) {
			currentTask.settled = true;
			currentTask.reject(err);
		}

		this.removeWorker(worker);
	}

	private releaseWorker(worker: PooledWorker): void {
		worker.busy = false;
		worker.taskId = null;
		worker.idleSince = Date.now();
		delete (worker as unknown as Record<string, unknown>).currentTask;

		// Check for pending tasks
		if (this.pending.length > 0 && !this.disposed) {
			const nextTask = this.pending.shift();
			if (nextTask) {
				this.runTask(worker, nextTask);
				return;
			}
		}

		debugWorker("Worker released, %d pending tasks", this.pending.length);
	}

	private removeWorker(worker: PooledWorker): void {
		const index = this.workers.indexOf(worker);
		if (index >= 0) {
			this.workers.splice(index, 1);
		}

		// Reject any pending task on this worker
		const currentTask = (worker as unknown as Record<string, unknown>)
			.currentTask as PendingTask<unknown, unknown> | undefined;
		if (currentTask && !currentTask.settled) {
			currentTask.settled = true;
			currentTask.reject(new Error("Worker terminated unexpectedly"));
		}
	}

	private startIdleCleanup(): void {
		this.idleCheckInterval = setInterval(() => {
			if (this.disposed) return;

			const now = Date.now();
			const toRemove: PooledWorker[] = [];

			// Find idle workers beyond minimum size
			const minWorkers = Math.min(1, this.options.size);
			let idleCount = this.workers.filter((w) => !w.busy).length;

			for (const worker of this.workers) {
				if (
					!worker.busy &&
					now - worker.idleSince > this.options.idleTimeout &&
					this.workers.length - toRemove.length > minWorkers &&
					idleCount > 1
				) {
					toRemove.push(worker);
					idleCount--;
				}
			}

			for (const worker of toRemove) {
				void worker.worker.terminate();
				this.removeWorker(worker);
			}

			if (toRemove.length > 0) {
				debugWorker("Cleaned up %d idle workers", toRemove.length);
			}
		}, 10000); // Check every 10 seconds
	}
}

/**
 * Get default worker count based on CPU cores
 */
function getDefaultWorkerCount(): number {
	// biome-ignore lint/suspicious/noExplicitAny: Using Node.js built-in
	const os: { cpus(): unknown[] } = require("node:os");
	return Math.max(1, os.cpus().length - 1);
}

/**
 * Create a worker pool with the given options.
 * Convenience function for API consistency.
 */
export function workerPool(options?: WorkerPoolOptions): WorkerPool {
	return new WorkerPool(options);
}
