/**
 * Semaphore class for go-go-scope - Rate limiting primitive
 */

/**
 * A Semaphore for limiting concurrent access to a resource.
 *
 * Semaphores control access to a shared resource through the use of permits.
 * When a task wants to use the resource, it must acquire a permit. If no permits
 * are available, the task waits until one becomes available. When done, the task
 * releases the permit, allowing another waiting task to proceed.
 *
 * Features:
 * - Configurable number of permits (concurrency level)
 * - Priority-based acquisition (higher priority tasks are processed first)
 * - Timeout support for non-blocking operations
 * - Bulk acquire/release for batch operations
 * - Automatic cleanup on scope disposal
 * - Supports both blocking and non-blocking acquisition
 *
 * Note: For most use cases, prefer `scope({ concurrency: n })` instead
 * of creating a Semaphore directly. Scope-level concurrency automatically
 * applies limits to all tasks spawned in the scope.
 *
 * @example
 * ```typescript
 * // Automatic concurrency via scope (recommended approach)
 * await using s = scope({ concurrency: 3 });
 *
 * await s.parallel([
 *   () => fetchData(),
 *   () => fetchData(),
 *   () => fetchData(),
 *   () => fetchData(),
 *   () => fetchData(),
 * ]);
 * // Only 3 run concurrently, others wait
 * ```
 *
 * @example
 * ```typescript
 * // Direct Semaphore usage for specific resources
 * await using s = scope();
 * const dbSemaphore = new Semaphore(5); // Limit DB connections to 5
 *
 * // Acquire and release automatically
 * const result = await dbSemaphore.acquire(async () => {
 *   const connection = await getDbConnection();
 *   return await connection.query('SELECT * FROM users');
 * });
 * ```
 *
 * @see {@link Scope} with concurrency option for automatic task limiting
 * @see {@link token-bucket} for rate limiting based on request rate
 */

/**
 * Queue item for pending acquire operations.
 *
 * @internal
 */
interface QueueItem {
	resolve: () => void;
	reject: (reason: unknown) => void;
	priority?: number;
}

/**
 * A Semaphore for limiting concurrent access to a resource.
 * Respects scope cancellation and supports priority-based acquisition.
 *
 * @see Semaphore (module-level documentation for detailed examples)
 */
/* #__PURE__ */
export class Semaphore implements AsyncDisposable {
	private permits: number;
	private initialPermits: number;
	private queue: QueueItem[] = [];
	private aborted = false;
	private abortReason: unknown;

	/**
	 * Creates a new Semaphore.
	 *
	 * @param initialPermits - Number of permits (concurrent access slots) to allow
	 * @param parentSignal - Optional AbortSignal from parent scope for automatic cleanup
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * // Create a semaphore allowing 3 concurrent operations
	 * const sem = new Semaphore(3, s.signal);
	 *
	 * // All operations respect the 3-permit limit
	 * await Promise.all([
	 *   sem.acquire(() => downloadFile('file1.zip')),
	 *   sem.acquire(() => downloadFile('file2.zip')),
	 *   sem.acquire(() => downloadFile('file3.zip')),
	 *   sem.acquire(() => downloadFile('file4.zip')), // Waits for a permit
	 * ]);
	 * ```
	 */
	constructor(initialPermits: number, parentSignal?: AbortSignal) {
		this.permits = initialPermits;
		this.initialPermits = initialPermits;

		if (parentSignal) {
			parentSignal.addEventListener(
				"abort",
				() => {
					this.aborted = true;
					this.abortReason = parentSignal.reason;
					this.drainQueue();
				},
				{ once: true },
			);
		}
	}

	/**
	 * Acquire a permit and execute the function.
	 *
	 * Blocks if no permits are available until one becomes free.
	 * The permit is automatically released when the function completes
	 * (whether successful or not).
	 *
	 * @typeParam T - Return type of the function
	 * @param fn - Function to execute with the permit
	 * @param priority - Higher priority tasks are processed first (default: 0)
	 * @returns Promise that resolves to the function's return value
	 * @throws {unknown} If the scope is aborted while waiting
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(2);
	 *
	 * // High priority task (processed before lower priority)
	 * const criticalResult = await sem.acquire(
	 *   () => processCriticalData(),
	 *   10 // High priority
	 * );
	 *
	 * // Normal priority task
	 * const normalResult = await sem.acquire(
	 *   () => processNormalData(),
	 *   0 // Default priority
	 * );
	 * ```
	 *
	 * @see {@link execute} for an alias of this method
	 */
	async acquire<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
		await this.wait(priority);
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	/**
	 * Execute a function with an acquired permit.
	 *
	 * Alias for {@link acquire}. Use whichever method name reads better
	 * in your code context.
	 *
	 * @typeParam T - Return type of the function
	 * @param fn - Function to execute with the permit
	 * @returns Promise that resolves to the function's return value
	 * @throws {unknown} If the scope is aborted while waiting
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const rateLimiter = new Semaphore(10);
	 *
	 * // Execute API calls with rate limiting
	 * const result = await rateLimiter.execute(async () => {
	 *   const response = await fetch('/api/data');
	 *   return await response.json();
	 * });
	 * ```
	 */
	execute<T>(fn: () => Promise<T>): Promise<T> {
		return this.acquire(fn);
	}

	/**
	 * Try to acquire a permit without blocking.
	 *
	 * Returns immediately, indicating whether a permit was acquired.
	 * Use this when you want to fail fast rather than wait.
	 *
	 * @returns true if permit was acquired, false otherwise
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(1);
	 *
	 * // First acquire succeeds
	 * if (sem.tryAcquire()) {
	 *   console.log('Got permit!');
	 *   // ... do work ...
	 *   sem.release(); // Must manually release
	 * }
	 *
	 * // Second acquire fails immediately (no waiting)
	 * if (!sem.tryAcquire()) {
	 *   console.log('No permit available, doing something else...');
	 * }
	 * ```
	 *
	 * @see {@link tryAcquireWithFn} for automatic release after execution
	 */
	tryAcquire(): boolean {
		if (this.aborted) {
			return false;
		}

		if (this.permits > 0) {
			this.permits--;
			return true;
		}

		return false;
	}

	/**
	 * Try to acquire a permit and execute a function.
	 *
	 * If a permit is available, executes the function and returns its result.
	 * If no permit is available, returns undefined immediately without waiting.
	 *
	 * @typeParam T - Return type of the function
	 * @param fn - Function to execute if permit is acquired
	 * @returns Promise that resolves to the function's return value, or undefined if no permit was available
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(3);
	 *
	 * // Try to process with rate limiting
	 * const result = await sem.tryAcquireWithFn(async () => {
	 *   return await expensiveOperation();
	 * });
	 *
	 * if (result === undefined) {
	 *   console.log('System busy, request queued for later');
	 * } else {
	 *   console.log('Result:', result);
	 * }
	 * ```
	 */
	async tryAcquireWithFn<T>(fn: () => Promise<T>): Promise<T | undefined> {
		if (this.tryAcquire()) {
			try {
				return await fn();
			} finally {
				this.release();
			}
		}
		return undefined;
	}

	/**
	 * Acquire a permit with a timeout.
	 *
	 * Waits up to the specified timeout for a permit to become available.
	 *
	 * @param timeoutMs - Maximum time to wait in milliseconds
	 * @returns Promise that resolves to true if permit was acquired, false if timeout was reached
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(1);
	 *
	 * // Hold the only permit
	 * await sem.acquire(async () => {
	 *   await sleep(5000); // Hold for 5 seconds
	 * });
	 *
	 * // Try to acquire with 1 second timeout (will fail)
	 * const acquired = await sem.acquireWithTimeout(1000);
	 * console.log(acquired); // false (timeout)
	 * ```
	 */
	async acquireWithTimeout(timeoutMs: number): Promise<boolean> {
		return new Promise((resolve) => {
			if (this.aborted) {
				resolve(false);
				return;
			}

			if (this.permits > 0) {
				this.permits--;
				resolve(true);
				return;
			}

			const timeoutId = setTimeout(() => {
				// Remove from queue if still waiting
				const index = this.queue.findIndex(
					(item) => item.resolve === resolveFn,
				);
				if (index !== -1) {
					this.queue.splice(index, 1);
				}
				resolve(false);
			}, timeoutMs);

			const resolveFn = () => {
				clearTimeout(timeoutId);
				resolve(true);
			};

			this.queue.push({
				resolve: resolveFn,
				reject: () => {
					clearTimeout(timeoutId);
					resolve(false);
				},
				priority: 0,
			});
		});
	}

	/**
	 * Acquire a permit with timeout and execute a function.
	 *
	 * If the timeout is reached before a permit becomes available,
	 * returns undefined without executing the function.
	 *
	 * @typeParam T - Return type of the function
	 * @param timeoutMs - Maximum time to wait in milliseconds
	 * @param fn - Function to execute if permit is acquired
	 * @returns Promise that resolves to the function's return value, or undefined if timeout was reached
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(1);
	 *
	 * const result = await sem.acquireWithTimeoutAndFn(
	 *   5000, // Wait up to 5 seconds
	 *   async () => {
	 *     return await fetchCriticalData();
	 *   }
	 * );
	 *
	 * if (result === undefined) {
	 *   console.log('Could not acquire permit in time');
	 * } else {
	 *   console.log('Data:', result);
	 * }
	 * ```
	 */
	async acquireWithTimeoutAndFn<T>(
		timeoutMs: number,
		fn: () => Promise<T>,
	): Promise<T | undefined> {
		const acquired = await this.acquireWithTimeout(timeoutMs);
		if (!acquired) return undefined;

		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	/**
	 * Acquire multiple permits at once.
	 *
	 * Blocks until all requested permits are available.
	 * Useful when a task needs exclusive access or multiple resources.
	 *
	 * @typeParam T - Return type of the function
	 * @param count - Number of permits to acquire
	 * @param fn - Function to execute with the permits
	 * @returns Promise that resolves to the function's return value
	 * @throws {Error} If count is not positive or exceeds total permits
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(5);
	 *
	 * // Need 3 permits for a batch operation
	 * const result = await sem.bulkAcquire(3, async () => {
	 *   // We hold 3 permits, so only 2 are available to others
	 *   return await processBatch(largeDataset);
	 * });
	 * ```
	 */
	async bulkAcquire<T>(count: number, fn: () => Promise<T>): Promise<T> {
		if (count <= 0) {
			throw new Error("bulkAcquire: count must be positive");
		}
		if (count > this.initialPermits) {
			throw new Error(
				`bulkAcquire: count (${count}) exceeds total permits (${this.initialPermits})`,
			);
		}

		await this.waitForMultiple(count);
		try {
			return await fn();
		} finally {
			this.releaseMultiple(count);
		}
	}

	/**
	 * Try to acquire multiple permits without blocking.
	 *
	 * Returns immediately, indicating whether the permits were acquired.
	 *
	 * @param count - Number of permits to acquire
	 * @returns true if permits were acquired, false otherwise
	 * @throws {Error} If count is not positive or exceeds total permits
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(5);
	 *
	 * // Try to get 3 permits
	 * if (sem.tryBulkAcquire(3)) {
	 *   console.log('Got 3 permits!');
	 *   // ... do work ...
	 *   sem.releaseMultiple(3);
	 * } else {
	 *   console.log('Not enough permits available');
	 * }
	 * ```
	 */
	tryBulkAcquire(count: number): boolean {
		if (count <= 0) {
			throw new Error("tryBulkAcquire: count must be positive");
		}
		if (count > this.initialPermits) {
			return false;
		}
		if (this.aborted) {
			return false;
		}

		if (this.permits >= count) {
			this.permits -= count;
			return true;
		}

		return false;
	}

	/**
	 * Wait for a permit to become available.
	 *
	 * @param priority - Higher priority tasks are processed first (default: 0)
	 * @returns Promise that resolves when a permit is acquired
	 * @throws {unknown} If the scope is aborted
	 *
	 * @internal
	 */
	private wait(priority = 0): Promise<void> {
		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		if (this.permits > 0) {
			this.permits--;
			return Promise.resolve();
		}

		let resolveSem!: () => void;
		let rejectSem!: (reason: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolveSem = res;
			rejectSem = rej;
		});

		// Insert into queue sorted by priority (higher first)
		const item: QueueItem = {
			resolve: resolveSem,
			reject: rejectSem,
			priority,
		};
		const index = this.queue.findIndex((q) => (q.priority ?? 0) < priority);
		if (index === -1) {
			this.queue.push(item);
		} else {
			this.queue.splice(index, 0, item);
		}

		return promise;
	}

	/**
	 * Release a permit.
	 *
	 * If there are waiting tasks, the permit is given to the highest
	 * priority waiter. Otherwise, it becomes available for future acquires.
	 *
	 * @internal
	 */
	private release(): void {
		if (this.queue.length > 0) {
			const next = this.queue.shift();
			if (next) {
				next.resolve();
			}
		} else {
			this.permits++;
		}
	}

	/**
	 * Wait for multiple permits to become available.
	 *
	 * @param count - Number of permits to wait for
	 * @returns Promise that resolves when all permits are acquired
	 * @throws {unknown} If the scope is aborted
	 *
	 * @internal
	 */
	private async waitForMultiple(count: number): Promise<void> {
		const acquireOne = (): Promise<void> => {
			if (this.aborted) {
				return Promise.reject(this.abortReason);
			}

			if (this.permits > 0) {
				this.permits--;
				return Promise.resolve();
			}

			let resolveSem!: () => void;
			let rejectSem!: (reason: unknown) => void;
			const promise = new Promise<void>((res, rej) => {
				resolveSem = res;
				rejectSem = rej;
			});
			this.queue.push({ resolve: resolveSem, reject: rejectSem, priority: 0 });
			return promise;
		};

		// Acquire permits one by one
		const acquisitions: Promise<void>[] = [];
		for (let i = 0; i < count; i++) {
			acquisitions.push(acquireOne());
		}
		await Promise.all(acquisitions);
	}

	/**
	 * Release multiple permits.
	 *
	 * @param count - Number of permits to release
	 *
	 * @internal
	 */
	private releaseMultiple(count: number): void {
		for (let i = 0; i < count; i++) {
			this.release();
		}
	}

	/**
	 * Get the number of available permits.
	 *
	 * @returns Number of permits currently available for acquisition
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(5);
	 *
	 * console.log(sem.available); // 5
	 *
	 * await sem.acquire(async () => {
	 *   console.log(sem.available); // 4
	 * });
	 *
	 * console.log(sem.available); // 5
	 * ```
	 */
	get available(): number {
		return this.permits;
	}

	/**
	 * Get the number of waiting acquirers.
	 *
	 * @returns Number of tasks waiting for a permit
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const sem = new Semaphore(1);
	 *
	 * // Hold the permit
	 * sem.acquire(async () => {
	 *   await sleep(1000);
	 * });
	 *
	 // Queue up waiters
	 * sem.acquire(() => Promise.resolve());
	 * sem.acquire(() => Promise.resolve());
	 *
	 * console.log(sem.waiting); // 2
	 * ```
	 */
	get waiting(): number {
		return this.queue.length;
	}

	/**
	 * Get the total number of permits (initial capacity).
	 *
	 * @returns The total number of permits configured for this semaphore
	 */
	get totalPermits(): number {
		return this.initialPermits;
	}

	/**
	 * Dispose the semaphore, aborting all pending acquires.
	 *
	 * All waiting tasks will be rejected with the abort reason.
	 *
	 * @returns Promise that resolves when disposal is complete
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.aborted = true;
		this.abortReason = new Error("semaphore disposed");
		this.drainQueue();
	}

	/**
	 * Drain the queue, rejecting all pending acquires.
	 *
	 * @internal
	 */
	private drainQueue(): void {
		while (this.queue.length > 0) {
			const waiter = this.queue.shift();
			if (waiter) {
				waiter.reject(this.abortReason);
			}
		}
	}
}
