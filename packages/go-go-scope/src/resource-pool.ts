/**
 * ResourcePool class for go-go-scope - Managed pool of resources
 *
 * @module go-go-scope/resource-pool
 *
 * @description
 * Provides a managed pool of resources with automatic lifecycle management,
 * health checking, and acquire/release semantics. Ideal for database connections,
 * HTTP clients, worker threads, or any resource that benefits from pooling.
 *
 * Features:
 * - Automatic resource lifecycle management (create/destroy)
 * - Configurable min/max pool size
 * - Blocking acquire with timeout support
 * - Automatic health checks with periodic verification
 * - Graceful shutdown with resource cleanup
 * - Queue-based fairness for waiting acquirers
 * - Statistics tracking
 *
 * @see {@link Scope.resourcePool} For creating pools via scope
 * @see {@link HealthCheckResult} For health check return type
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Create a database connection pool
 * const pool = s.resourcePool({
 *   create: async () => {
 *     const conn = await createDatabaseConnection();
 *     return conn;
 *   },
 *   destroy: async (conn) => {
 *     await conn.close();
 *   },
 *   min: 2,
 *   max: 10,
 *   acquireTimeout: 5000,
 *   healthCheck: async (conn) => {
 *     try {
 *       await conn.query('SELECT 1');
 *       return { healthy: true };
 *     } catch (err) {
 *       return { healthy: false, message: String(err) };
 *     }
 *   },
 *   healthCheckInterval: 30000
 * });
 *
 * // Use with manual acquire/release
 * const conn = await pool.acquire();
 * try {
 *   const result = await conn.query('SELECT * FROM users');
 * } finally {
 *   await pool.release(conn);
 * }
 *
 * // Or use execute for automatic release
 * const result = await pool.execute(async (conn) => {
 *   return await conn.query('SELECT * FROM users');
 * });
 * ```
 */

import type { ResourcePoolOptions } from "./types.js";

/**
 * Health check result for a resource.
 *
 * Returned by the health check function to indicate whether a resource
 * is healthy and can continue to be used.
 *
 * @interface
 *
 * @example
 * ```typescript
 * const healthCheck = async (connection: DatabaseConnection): Promise<HealthCheckResult> => {
 *   try {
 *     await connection.ping();
 *     return { healthy: true };
 *   } catch (error) {
 *     return { healthy: false, message: "Ping failed: " + String(error) };
 *   }
 * };
 * ```
 */
export interface HealthCheckResult {
	/** Whether the resource is healthy and can be used */
	healthy: boolean;
	/** Optional message explaining the health status or failure reason */
	message?: string;
}

/**
 * A managed pool of resources with automatic lifecycle management.
 *
 * Useful for connection pooling (databases, HTTP clients, etc.) and any scenario
 * where creating resources is expensive and reusing them improves performance.
 *
 * The pool maintains a minimum number of resources (warming) and scales up to
 * a maximum under load. Resources can be health-checked periodically and
 * unhealthy resources are automatically replaced.
 *
 * @template T The type of resource being pooled
 *
 * @implements {AsyncDisposable}
 *
 * @see {@link Scope.resourcePool} Factory method on scope
 * @see {@link ResourcePoolOptions} Configuration options
 * @see {@link HealthCheckResult} Health check return type
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const pool = s.resourcePool({
 *   create: () => createDatabaseConnection(),
 *   destroy: (conn) => conn.close(),
 *   healthCheck: async (conn) => {
 *     try {
 *       await conn.query('SELECT 1')
 *       return { healthy: true }
 *     } catch {
 *       return { healthy: false, message: 'Connection failed health check' }
 *     }
 *   },
 *   healthCheckInterval: 30000, // Check every 30s
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
/* #__PURE__ */
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
	private healthCheckTimer?: ReturnType<typeof setInterval>;
	private unhealthyResources = new Set<T>();

	/**
	 * Creates a new ResourcePool instance.
	 *
	 * @param options - Configuration options for the pool
	 * @param options.create - Factory function to create a new resource
	 * @param options.destroy - Function to destroy a resource when removed from pool
	 * @param options.min - Minimum number of resources to maintain (default: 0)
	 * @param options.max - Maximum number of resources allowed (default: 10)
	 * @param options.acquireTimeout - Timeout in milliseconds for acquiring a resource (default: 30000)
	 * @param options.healthCheck - Optional function to check resource health
	 * @param options.healthCheckInterval - Interval in milliseconds between health checks (default: 30000)
	 * @param parentSignal - Optional AbortSignal from parent scope for cancellation propagation
	 *
	 * @throws {Error} If options are invalid or create callback is missing
	 *
	 * @internal Use {@link Scope.resourcePool} instead of constructing directly
	 */
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

		// Set up periodic health checks if configured
		if (
			options.healthCheck &&
			options.healthCheckInterval &&
			options.healthCheckInterval > 0
		) {
			this.startHealthChecks();
		}
	}

	/**
	 * Initialize the pool with minimum resources.
	 *
	 * Called automatically on first acquire if not already initialized.
	 * Pre-warms the pool by creating resources up to the configured minimum.
	 *
	 * @returns {Promise<void>} Resolves when minimum resources are created
	 *
	 * @throws {Error} If the pool has been disposed
	 *
	 * @example
	 * ```typescript
	 * const pool = s.resourcePool({
	 *   create: () => createConnection(),
	 *   destroy: (c) => c.close(),
	 *   min: 5
	 * });
	 *
	 * // Pre-warm the pool before accepting requests
	 * await pool.initialize();
	 * console.log('Pool ready with 5 connections');
	 * ```
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
	 *
	 * Returns an available resource immediately if one exists.
	 * If no resources are available, creates a new one if under max capacity.
	 * Otherwise, blocks until a resource is returned or timeout occurs.
	 *
	 * @returns {Promise<T>} A resource from the pool
	 *
	 * @throws {Error} If the pool is disposed
	 * @throws {Error} If acquire timeout is reached
	 * @throws {unknown} If the parent scope was aborted
	 *
	 * @see {@link ResourcePool.release} For returning the resource
	 * @see {@link ResourcePool.execute} For automatic resource management
	 *
	 * @example
	 * ```typescript
	 * const conn = await pool.acquire();
	 * try {
	 *   // Use the connection
	 *   await conn.query('SELECT * FROM users');
	 * } catch (err) {
	 *   console.error('Query failed:', err);
	 * } finally {
	 *   // Always release back to pool
	 *   await pool.release(conn);
	 * }
	 * ```
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
	 *
	 * The resource should have been acquired from this pool using {@link acquire}.
	 * If there are waiting acquirers, the resource is handed off immediately.
	 * Otherwise, it's returned to the available pool.
	 *
	 * If the pool has been disposed or aborted, the resource is destroyed instead
	 * of being returned to the pool.
	 *
	 * @param resource - The resource to release back to the pool
	 *
	 * @returns {Promise<void>} Resolves when the resource is released
	 *
	 * @see {@link ResourcePool.acquire} For acquiring resources
	 * @see {@link ResourcePool.execute} For automatic acquire/release
	 *
	 * @example
	 * ```typescript
	 * const conn = await pool.acquire();
	 * try {
	 *   await conn.doWork();
	 * } finally {
	 *   // Release back to pool even if work fails
	 *   await pool.release(conn);
	 * }
	 * ```
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
	 *
	 * Automatically acquires a resource, executes the provided function,
	 * and releases the resource back to the pool (even if the function throws).
	 * This is the recommended way to use pool resources as it ensures
	 * proper cleanup.
	 *
	 * @template R Return type of the function
	 * @param fn - Function to execute with the acquired resource
	 * @returns {Promise<R>} Result of the function
	 *
	 * @throws {Error} If pool is disposed or acquire times out
	 * @throws {*} Any error thrown by the provided function
	 *
	 * @see {@link ResourcePool.acquire} For manual acquire
	 * @see {@link ResourcePool.release} For manual release
	 *
	 * @example
	 * ```typescript
	 * const result = await pool.execute(async (resource) => {
	 *   const data = await resource.fetchData();
	 *   const processed = await processData(data);
	 *   return processed;
	 * });
	 *
	 * // Resource is automatically released, even if an error occurs
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
	 *
	 * Returns current metrics about the pool state including total resources,
	 * available resources, waiting acquirers, and health check status.
	 *
	 * @returns {Object} Pool statistics
	 * @returns {number} returns.total Total number of resources in the pool
	 * @returns {number} returns.available Number of available (idle) resources
	 * @returns {number} returns.inUse Number of resources currently acquired
	 * @returns {number} returns.waiting Number of acquirers waiting for resources
	 * @returns {number} returns.creating Number of resources being created
	 * @returns {number} returns.unhealthy Number of resources that failed health checks
	 * @returns {boolean} returns.healthChecksEnabled Whether health checks are enabled
	 *
	 * @example
	 * ```typescript
	 * const stats = pool.stats;
	 * console.log(`Available: ${stats.available}/${stats.total}`);
	 * console.log(`Waiting: ${stats.waiting}`);
	 * console.log(`Unhealthy: ${stats.unhealthy}`);
	 * ```
	 */
	get stats(): {
		total: number;
		available: number;
		inUse: number;
		waiting: number;
		creating: number;
		/** Number of resources that failed health checks */
		unhealthy: number;
		/** Whether health checks are enabled */
		healthChecksEnabled: boolean;
	} {
		return {
			total: this.resources.length,
			available: this.available.length,
			inUse: this.resources.length - this.available.length,
			waiting: this.waiters.length,
			creating: this.creating,
			unhealthy: this.unhealthyResources.size,
			healthChecksEnabled: !!this.options.healthCheck,
		};
	}

	/**
	 * Manually trigger a health check on all resources.
	 *
	 * Iterates through all resources and runs the configured health check.
	 * Unhealthy resources are destroyed and replaced (if min pool size is set).
	 * This is called automatically if healthCheckInterval is configured.
	 *
	 * @returns {Promise<number>} Number of unhealthy resources found and removed
	 *
	 * @see {@link ResourcePoolOptions.healthCheck} For configuring health checks
	 * @see {@link ResourcePoolOptions.healthCheckInterval} For automatic health checks
	 *
	 * @example
	 * ```typescript
	 * // Check health manually before a critical operation
	 * const unhealthyCount = await pool.checkHealth();
	 * if (unhealthyCount > 0) {
	 *   console.warn(`Removed ${unhealthyCount} unhealthy connections`);
	 * }
	 * ```
	 */
	async checkHealth(): Promise<number> {
		if (!this.options.healthCheck) {
			return 0;
		}

		const healthCheck = this.options.healthCheck;
		const resourcesToCheck = [...this.resources];
		let unhealthyCount = 0;

		for (const resource of resourcesToCheck) {
			try {
				const result = await healthCheck(resource);
				if (!result.healthy) {
					unhealthyCount++;
					this.unhealthyResources.add(resource);
					await this.removeResource(resource);
				}
			} catch {
				// Treat exceptions as unhealthy
				unhealthyCount++;
				this.unhealthyResources.add(resource);
				await this.removeResource(resource);
			}
		}

		// Replenish pool if we're below min size
		const min = this.options.min ?? 0;
		if (this.resources.length < min) {
			const needed = min - this.resources.length;
			for (let i = 0; i < needed; i++) {
				try {
					const resource = await this.createResource();
					this.available.push(resource);
				} catch {
					// Ignore creation failures during replenishment
				}
			}
		}

		return unhealthyCount;
	}

	/**
	 * Start periodic health checks.
	 *
	 * @internal Called by constructor when healthCheckInterval is configured
	 */
	private startHealthChecks(): void {
		const interval = this.options.healthCheckInterval ?? 30000;
		this.healthCheckTimer = setInterval(() => {
			void this.checkHealth();
		}, interval);
	}

	/**
	 * Remove a resource from the pool and destroy it.
	 *
	 * @internal
	 */
	private async removeResource(resource: T): Promise<void> {
		// Remove from resources array
		const index = this.resources.indexOf(resource);
		if (index > -1) {
			this.resources.splice(index, 1);
		}

		// Remove from available array
		const availableIndex = this.available.indexOf(resource);
		if (availableIndex > -1) {
			this.available.splice(availableIndex, 1);
		}

		// Destroy the resource
		try {
			await this.options.destroy(resource);
		} catch {
			// Ignore destruction errors
		}

		this.unhealthyResources.delete(resource);
	}

	/**
	 * Dispose the pool and destroy all resources.
	 *
	 * Stops health checks, rejects all waiting acquirers, and destroys
	 * all resources. Called automatically when the parent scope is disposed.
	 *
	 * @returns {Promise<void>} Resolves when all resources are cleaned up
	 *
	 * @implements {AsyncDisposable}
	 *
	 * @example
	 * ```typescript
	 * await using pool = s.resourcePool({ ... });
	 * // Use pool...
	 * // Automatically disposed when scope exits
	 * ```
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		// Stop health checks
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
			this.healthCheckTimer = undefined;
		}

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
		this.unhealthyResources.clear();
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
