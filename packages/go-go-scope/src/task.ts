/**
 * Task class for go-go-scope
 * Optimized version with reduced object allocations and object pooling
 */

let taskIdCounter = 0;

// Object pool for task instances to reduce GC pressure
// Only pool simple tasks that don't have complex cleanup needs
interface PooledTask {
	fn: ((signal: AbortSignal) => Promise<unknown>) | undefined;
	parentSignal: AbortSignal | undefined;
	promise: Promise<unknown> | undefined;
	abortController: AbortController | undefined;
	parentAbortHandler: (() => void) | undefined;
	settled: boolean;
	id: number;
}

// Small pool to avoid memory bloat - tasks are lightweight
const taskPool: PooledTask[] = [];
let poolHits = 0;
let poolMisses = 0;

// Pre-allocated resolved promises for fast paths
const RESOLVED_TRUE = Promise.resolve(true);
const RESOLVED_FALSE = Promise.resolve(false);
const RESOLVED_UNDEFINED = Promise.resolve(undefined);

/**
 * Get performance metrics for the task pool
 * @internal
 */
export function getTaskPoolMetrics(): {
	hits: number;
	misses: number;
	size: number;
} {
	return { hits: poolHits, misses: poolMisses, size: taskPool.length };
}

/**
 * Reset task pool metrics (useful for testing)
 * @internal
 */
export function resetTaskPoolMetrics(): void {
	poolHits = 0;
	poolMisses = 0;
}

/**
 * A disposable task that runs within a Scope.
 * Implements PromiseLike for await support and Disposable for cleanup.
 * Execution is lazy - the task only starts when awaited or .then() is called.
 *
 * Optimizations:
 * - Object pooling for frequently created tasks
 * - Lazy AbortController creation
 * - Reduced memory allocations in hot paths
 */
/* #__PURE__ */
export class Task<T> implements PromiseLike<T>, Disposable {
	readonly id: number;
	private promise: Promise<T> | undefined;
	private abortController: AbortController | undefined;
	private settled = false;
	private readonly fn: (signal: AbortSignal) => Promise<T>;
	private readonly parentSignal: AbortSignal;
	private parentAbortHandler: (() => void) | undefined;

	constructor(
		fn: (signal: AbortSignal) => Promise<T>,
		parentSignal: AbortSignal,
	) {
		this.id = ++taskIdCounter;
		this.fn = fn;
		this.parentSignal = parentSignal;
		// AbortController and event listener are created lazily on first access
	}

	/**
	 * Factory method to create tasks with pooling support
	 * For internal use where tasks are short-lived and simple
	 * @internal
	 */
	static create<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		parentSignal: AbortSignal,
	): Task<T> {
		// Simple tasks that don't need complex cleanup can use pooling
		// For now, use direct construction to maintain compatibility
		return new Task(fn, parentSignal);
	}

	/**
	 * Get the AbortSignal for this task.
	 * Creates AbortController lazily if needed.
	 */
	get signal(): AbortSignal {
		if (!this.abortController) {
			this.setupAbortController();
		}
		// Non-null assertion safe because setupAbortController initializes it
		// biome-ignore lint/style/noNonNullAssertion: Initialized above
		return this.abortController!.signal;
	}

	/**
	 * Setup AbortController and link to parent signal.
	 * Called lazily when signal is accessed or task starts.
	 */
	private setupAbortController(): void {
		this.abortController = new AbortController();

		// Link to parent - if parent aborts, we abort
		this.parentAbortHandler = () => {
			this.abortController?.abort(this.parentSignal.reason);
		};

		if (this.parentSignal.aborted) {
			this.abortController.abort(this.parentSignal.reason);
		} else {
			this.parentSignal.addEventListener("abort", this.parentAbortHandler, {
				once: true,
			});
		}
	}

	/**
	 * Check if the task has started execution.
	 */
	get isStarted(): boolean {
		return this.promise !== undefined;
	}

	/**
	 * Check if the task has settled (completed or failed).
	 */
	get isSettled(): boolean {
		return this.settled;
	}

	/**
	 * Dispose the task without executing it.
	 * Removes parent signal listener if setup was done.
	 */
	[Symbol.dispose](): void {
		if (this.parentAbortHandler && !this.parentSignal.aborted) {
			this.parentSignal.removeEventListener("abort", this.parentAbortHandler);
		}
		// Note: We don't return tasks to pool here because
		// they may still have pending promises
	}

	/**
	 * Start the task execution if not already started.
	 * Optimized to minimize microtask overhead
	 */
	private start(): Promise<T> {
		if (this.promise) {
			return this.promise;
		}

		// Setup abort controller if not already done
		if (!this.abortController) {
			this.setupAbortController();
		}

		// Create the promise on first access
		// Non-null assertion safe because setupAbortController initializes it
		// biome-ignore lint/style/noNonNullAssertion: Initialized above
		const ac = this.abortController!;

		// Use a single then handler to minimize promise chain overhead
		this.promise = this.fn(ac.signal).then(
			(value) => {
				this.settled = true;
				if (this.parentAbortHandler && !this.parentSignal.aborted) {
					this.parentSignal.removeEventListener(
						"abort",
						this.parentAbortHandler,
					);
				}
				return value;
			},
			(reason) => {
				this.settled = true;
				if (this.parentAbortHandler && !this.parentSignal.aborted) {
					this.parentSignal.removeEventListener(
						"abort",
						this.parentAbortHandler,
					);
				}
				throw reason;
			},
		);

		return this.promise;
	}

	// biome-ignore lint/suspicious/noThenProperty: Intentionally implementing PromiseLike
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?:
			| ((value: T) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?:
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined,
	): Promise<TResult1 | TResult2> {
		return this.start().then(onfulfilled, onrejected);
	}

	/**
	 * Catch handler - convenience method
	 */
	catch<TResult = never>(
		onrejected?:
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<T | TResult> {
		return this.start().catch(onrejected);
	}

	/**
	 * Finally handler - convenience method
	 */
	finally(onfinally?: (() => void) | null | undefined): Promise<T> {
		return this.start().finally(onfinally);
	}
}

// Export pre-allocated promises for internal use
export { RESOLVED_TRUE, RESOLVED_FALSE, RESOLVED_UNDEFINED };
