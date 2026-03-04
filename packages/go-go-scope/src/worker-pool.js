/**
 * Worker Pool for go-go-scope
 * Provides structured concurrency for CPU-intensive operations using Worker Threads
 */
import { Worker } from "node:worker_threads";
import createDebug from "debug";

const debugWorker = createDebug("go-go-scope:worker");
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
export class WorkerPool {
	workers = [];
	pending = [];
	taskIdCounter = 0;
	disposed = false;
	idleCheckInterval;
	options;
	constructor(options = {}) {
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
	async execute(fn, data, transferList) {
		if (this.disposed) {
			throw new Error("WorkerPool has been disposed");
		}
		return new Promise((resolve, reject) => {
			const task = {
				fn,
				data,
				transferList,
				resolve: resolve,
				reject,
			};
			// Try to execute immediately
			const worker = this.findIdleWorker();
			if (worker) {
				this.runTask(worker, task);
			} else if (this.workers.length < this.options.size) {
				// Create new worker if under limit
				const newWorker = this.createWorker();
				this.runTask(newWorker, task);
			} else {
				// Queue the task
				this.pending.push(task);
				debugWorker("Task queued, %d pending", this.pending.length);
			}
		});
	}
	/**
	 * Execute multiple tasks in parallel using the worker pool.
	 * Maintains order by default.
	 */
	async executeBatch(items, fn, options = {}) {
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
					(result) => [undefined, result],
					(error) => [
						error instanceof Error ? error : new Error(String(error)),
						undefined,
					],
				),
			);
			return Promise.all(promises);
		}
		// Fastest-first: Use Promise.all with index tracking
		const results = new Array(items.length);
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
	stats() {
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
	async [Symbol.asyncDispose]() {
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
			const currentTask = worker.currentTask;
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
	get isDisposed() {
		return this.disposed;
	}
	createWorker() {
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
		const pooledWorker = {
			worker,
			busy: false,
			idleSince: Date.now(),
			taskId: null,
		};
		worker.on("message", (message) => {
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
	findIdleWorker() {
		return this.workers.find((w) => !w.busy);
	}
	runTask(worker, task) {
		const taskId = ++this.taskIdCounter;
		worker.busy = true;
		worker.taskId = taskId;
		// Serialize function to string
		const fnString = task.fn.toString();
		const message = {
			type: "execute",
			id: taskId,
			data: task.data,
		};
		// Store task reference for result handling
		worker.currentTask = task;
		worker.worker.postMessage({ ...message, fn: fnString }, task.transferList);
		debugWorker("Task %d assigned to worker", taskId);
	}
	handleWorkerMessage(worker, message) {
		const currentTask = worker.currentTask;
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
	handleWorkerError(worker, err) {
		const currentTask = worker.currentTask;
		if (currentTask && !currentTask.settled) {
			currentTask.settled = true;
			currentTask.reject(err);
		}
		this.removeWorker(worker);
	}
	releaseWorker(worker) {
		worker.busy = false;
		worker.taskId = null;
		worker.idleSince = Date.now();
		delete worker.currentTask;
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
	removeWorker(worker) {
		const index = this.workers.indexOf(worker);
		if (index >= 0) {
			this.workers.splice(index, 1);
		}
		// Reject any pending task on this worker
		const currentTask = worker.currentTask;
		if (currentTask && !currentTask.settled) {
			currentTask.settled = true;
			currentTask.reject(new Error("Worker terminated unexpectedly"));
		}
	}
	startIdleCleanup() {
		this.idleCheckInterval = setInterval(() => {
			if (this.disposed) return;
			const now = Date.now();
			const toRemove = [];
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
function getDefaultWorkerCount() {
	// biome-ignore lint/suspicious/noExplicitAny: Using Node.js built-in
	const os = require("node:os");
	return Math.max(1, os.cpus().length - 1);
}
/**
 * Create a worker pool with the given options.
 * Convenience function for API consistency.
 */
export function workerPool(options) {
	return new WorkerPool(options);
}
