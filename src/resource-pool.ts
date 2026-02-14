/**
 * ResourcePool class for go-go-scope - Managed pool of resources
 */

import type { ResourcePoolOptions } from "./types.js";

/**
 * A managed pool of resources with automatic lifecycle management.
 * Useful for connection pooling (databases, HTTP clients, etc.).
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const pool = s.pool({
 *   create: () => createDatabaseConnection(),
 *   destroy: (conn) => conn.close(),
 *   min: 2,
 *   max: 10,
 *   acquireTimeout: 5000
 * })
 *
 * // Acquire a resource
 * const conn = await pool.acquire()
 * try {
 *   await conn.query('SELECT 1')
 * } finally {
 *   await pool.release(conn)
 * }
 * ```
 */
export class ResourcePool<T> implements AsyncDisposable {
	private resources: T[] = [];
	private available: T[] = [];
	private waiters: Array<{
		resolve: (resource: T) => void;
		reject: (reason: unknown) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}> = [];
	private creating = 0;
	private disposed = false;
	private abortReason: unknown;
	private aborted = false;

	constructor(
		private options: ResourcePoolOptions<T>,
		parentSignal?: AbortSignal,
	) {
		if (parentSignal) {
			parentSignal.addEventListener(
				"abort",
				() => {
					this.aborted = true;
					this.abortReason = parentSignal.reason;
					this.drainWaiters();
				},
				{ once: true },
			);
		}
	}

	/**
	 * Initialize the pool with minimum resources.
	 * Called automatically on first acquire if not already initialized.
	 */
	async initialize(): Promise<void> {
		if (this.disposed || this.aborted) {
			throw new Error("Pool is disposed");
		}

		const min = this.options.min ?? 0;
		while (this.resources.length < min) {
			await this.createResource();
		}
	}

	/**
	 * Acquire a resource from the pool.
	 * Blocks if no resources are available until one is returned or timeout.
	 *
	 * @throws Error if pool is disposed
	 * @throws Error if acquire timeout is reached
	 */
	async acquire(): Promise<T> {
		if (this.disposed) {
			throw new Error("Pool is disposed");
		}
		if (this.aborted) {
			throw this.abortReason;
		}

		// Initialize if needed
		if (this.options.min && this.resources.length < this.options.min) {
			await this.initialize();
		}

		// Return available resource immediately
		if (this.available.length > 0) {
			const resource = this.available.pop();
			if (resource !== undefined) {
				return resource;
			}
		}

		// Create new resource if under max
		if (this.resources.length + this.creating < this.options.max) {
			return await this.createResource();
		}

		// Wait for a resource to become available
		return new Promise<T>((resolve, reject) => {
			const acquireTimeout = this.options.acquireTimeout ?? 30000;
			const timeoutId = setTimeout(() => {
				const index = this.waiters.findIndex((w) => w.resolve === resolve);
				if (index !== -1) {
					this.waiters.splice(index, 1);
				}
				reject(new Error(`Acquire timeout after ${acquireTimeout}ms`));
			}, acquireTimeout);

			this.waiters.push({ resolve, reject, timeoutId });
		});
	}

	/**
	 * Release a resource back to the pool.
	 * The resource should have been acquired from this pool.
	 */
	async release(resource: T): Promise<void> {
		if (this.disposed) {
			// Destroy the resource if pool is disposed
			await this.options.destroy(resource);
			return;
		}

		if (this.aborted) {
			await this.options.destroy(resource);
			return;
		}

		// Check if there are waiting acquirers
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			if (waiter) {
				clearTimeout(waiter.timeoutId);
				waiter.resolve(resource);
				return;
			}
		}

		// No waiters, add to available pool
		this.available.push(resource);
	}

	/**
	 * Execute a function with an acquired resource.
	 * The resource is automatically released after the function completes.
	 *
	 * @example
	 * ```typescript
	 * await pool.execute(async (resource) => {
	 *   await resource.doSomething()
	 * })
	 * ```
	 */
	async execute<R>(fn: (resource: T) => Promise<R>): Promise<R> {
		const resource = await this.acquire();
		try {
			return await fn(resource);
		} finally {
			await this.release(resource);
		}
	}

	/**
	 * Get pool statistics.
	 */
	get stats(): {
		total: number;
		available: number;
		inUse: number;
		waiting: number;
		creating: number;
	} {
		return {
			total: this.resources.length,
			available: this.available.length,
			inUse: this.resources.length - this.available.length,
			waiting: this.waiters.length,
			creating: this.creating,
		};
	}

	/**
	 * Dispose the pool and destroy all resources.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		// Reject all waiting acquirers
		this.drainWaiters();

		// Destroy all resources
		await Promise.all(
			this.resources.map(async (resource) => {
				try {
					await this.options.destroy(resource);
				} catch {
					// Ignore destruction errors
				}
			}),
		);

		this.resources = [];
		this.available = [];
	}

	private async createResource(): Promise<T> {
		this.creating++;
		try {
			const resource = await this.options.create();
			this.resources.push(resource);
			return resource;
		} finally {
			this.creating--;
		}
	}

	private drainWaiters(): void {
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			if (waiter) {
				clearTimeout(waiter.timeoutId);
				waiter.reject(
					this.aborted ? this.abortReason : new Error("Pool disposed"),
				);
			}
		}
	}
}
