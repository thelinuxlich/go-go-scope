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
