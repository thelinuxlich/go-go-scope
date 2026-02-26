/**
 * Semaphore class for go-go-scope - Rate limiting primitive
 */

/**
 * A Semaphore for limiting concurrent access to a resource.
 * Respects scope cancellation.
 *
 * Note: For most use cases, use `scope({ concurrency: n })` instead
 * of creating a Semaphore directly. This applies concurrency limits
 * automatically to all tasks spawned in the scope.
 *
 * @example
 * ```typescript
 * // Automatic concurrency via scope
 * await using s = scope({ concurrency: 3 })
 *
 * await parallel([
 *   () => s.spawn(() => heavyTask1()),
 *   () => s.spawn(() => heavyTask2()),
 *   () => s.spawn(() => heavyTask3()),
 * ])
 * ```
 */
/* #__PURE__ */
export class Semaphore implements AsyncDisposable {
	private permits: number;
	private initialPermits: number;
	private queue: Array<{
		resolve: () => void;
		reject: (reason: unknown) => void;
	}> = [];
	private aborted = false;
	private abortReason: unknown;

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
	 * Blocks if no permits available.
	 * Automatically releases permit when done.
	 */
	async acquire<T>(fn: () => Promise<T>): Promise<T> {
		await this.wait();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	/**
	 * Execute a function with an acquired permit.
	 * Alias for acquire().
	 */
	execute<T>(fn: () => Promise<T>): Promise<T> {
		return this.acquire(fn);
	}

	/**
	 * Try to acquire a permit without blocking.
	 * Returns true if permit was acquired, false otherwise.
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
	 * Returns the function result if permit was acquired, undefined otherwise.
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
	 * Returns true if permit was acquired within timeout, false otherwise.
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
			});
		});
	}

	/**
	 * Acquire a permit with timeout and execute a function.
	 * Returns undefined if timeout was reached.
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
	 * Blocks until all permits are available.
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
	 * Returns true if permits were acquired, false otherwise.
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
	 */
	private wait(): Promise<void> {
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
		this.queue.push({ resolve: resolveSem, reject: rejectSem });
		return promise;
	}

	/**
	 * Release a permit.
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
			this.queue.push({ resolve: resolveSem, reject: rejectSem });
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
	 */
	private releaseMultiple(count: number): void {
		for (let i = 0; i < count; i++) {
			this.release();
		}
	}

	/**
	 * Get the number of available permits.
	 */
	get available(): number {
		return this.permits;
	}

	/**
	 * Get the number of available permits (alias for available).
	 */
	get availablePermits(): number {
		return this.permits;
	}

	/**
	 * Get the number of waiting acquirers.
	 */
	get waiting(): number {
		return this.queue.length;
	}

	/**
	 * Get the number of waiting acquirers (alias for waiting).
	 */
	get waiterCount(): number {
		return this.queue.length;
	}

	/**
	 * Get the total number of permits (initial capacity).
	 */
	get totalPermits(): number {
		return this.initialPermits;
	}

	/**
	 * Dispose the semaphore, aborting all pending acquires.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.aborted = true;
		this.abortReason = new Error("semaphore disposed");
		this.drainQueue();
	}

	private drainQueue(): void {
		while (this.queue.length > 0) {
			const waiter = this.queue.shift();
			if (waiter) {
				waiter.reject(this.abortReason);
			}
		}
	}
}
