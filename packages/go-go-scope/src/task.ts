/**
 * Task class for go-go-scope
 * Optimized version with lazy AbortController creation
 *
 * Provides the Task class - a lazy, disposable Promise-like object that
 * enables structured concurrency with automatic cancellation propagation.
 */

let taskIdCounter = 0;

// Pre-allocated resolved promises for fast paths
/**
 * Pre-allocated resolved promise with value `true`.
 * Used for fast-path optimizations in hot code paths.
 */
const RESOLVED_TRUE = Promise.resolve(true);

/**
 * Pre-allocated resolved promise with value `false`.
 * Used for fast-path optimizations in hot code paths.
 */
const RESOLVED_FALSE = Promise.resolve(false);

/**
 * Pre-allocated resolved promise with value `undefined`.
 * Used for fast-path optimizations in hot code paths.
 */
const RESOLVED_UNDEFINED = Promise.resolve(undefined);

export { RESOLVED_FALSE, RESOLVED_TRUE, RESOLVED_UNDEFINED };

/**
 * A disposable task that runs within a Scope.
 *
 * Task implements `PromiseLike` for await support and `Disposable` for cleanup
 * via the `using` syntax. Execution is lazy - the task only starts when
 * awaited or `.then()` is called. This enables efficient task composition
 * without creating unnecessary promises.
 *
 * Key features:
 * - Lazy execution - only starts when consumed
 * - Automatic cancellation propagation from parent scope
 * - Disposable cleanup via `Symbol.dispose`
 * - Promise-like interface with `then`, `catch`, `finally`
 * - Unique task ID for debugging and tracing
 *
 * Optimizations:
 * - Lazy AbortController creation (only when needed)
 * - Reduced memory allocations in hot paths
 * - Efficient parent signal linking
 *
 * @typeParam T - The type of the value the task will resolve with
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * // Create a task (doesn't execute yet)
 * const task = s.task(async ({ signal }) => {
 *   const response = await fetch('/api/data', { signal });
 *   return response.json();
 * });
 *
 * // Task starts executing when awaited
 * const [err, data] = await task;
 * if (!err) {
 *   console.log('Data:', data);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Task with cancellation propagation
 * await using s = scope();
 *
 * const task = s.task(async ({ signal }) => {
 *   // Listen for cancellation
 *   signal.addEventListener('abort', () => {
 *     console.log('Task cancelled');
 *   });
 *
 *   try {
 *     await longRunningOperation({ signal });
 *   } catch (e) {
 *     if (signal.aborted) {
 *       console.log('Operation was aborted');
 *     }
 *     throw e;
 *   }
 * });
 *
 * // If scope is disposed, task receives abort signal
 * await s[Symbol.asyncDispose]();
 * ```
 *
 * @example
 * ```typescript
 * // Manual task disposal (without execution)
 * await using s = scope();
 *
 * {
 *   using task = s.task(() => fetchData());
 *
 *   // Task not executed, just disposed
 *   // Parent signal listener cleaned up
 * }
 *
 * // Task resources cleaned up without ever running
 * ```
 *
 * @example
 * ```typescript
 * // Promise-like interface
 * await using s = scope();
 *
 * const task = s.task(() => computeValue());
 *
 * // Use .then(), .catch(), .finally() like a regular promise
 * const result = await task
 *   .then(([err, value]) => {
 *     if (err) throw err;
 *     return value;
 *   })
 *   .catch(error => {
 *     console.error('Failed:', error);
 *     return defaultValue;
 *   })
 *   .finally(() => {
 *     console.log('Task completed');
 *   });
 * ```
 *
 * @example
 * ```typescript
 * // Check task state before execution
 * await using s = scope();
 *
 * const task = s.task(() => fetchData());
 *
 * console.log(task.isStarted); // false - not yet executed
 * console.log(task.isSettled); // false - not completed
 * console.log(task.id); // unique task identifier
 *
 * await task;
 *
 * console.log(task.isStarted); // true
 * console.log(task.isSettled); // true
 * ```
 *
 * @see {@link Scope#task} - For creating tasks within a scope
 * @see {@link Scope} - For structured concurrency context
 */
/* #__PURE__ */
export class Task<T> implements PromiseLike<T>, Disposable {
	/**
	 * Unique identifier for this task.
	 * Auto-incremented for each created task. Useful for debugging,
	 * logging, and correlating traces.
	 */
	readonly id: number;

	private promise: Promise<T> | undefined;
	private abortController: AbortController | undefined;
	private settled = false;
	private readonly fn: (signal: AbortSignal) => Promise<T>;
	private readonly parentSignal: AbortSignal;
	private parentAbortHandler: (() => void) | undefined;

	/**
	 * Creates a new Task instance.
	 *
	 * @param fn - The async function to execute when the task starts.
	 *   Receives an AbortSignal for cancellation support.
	 * @param parentSignal - The parent AbortSignal to link for cancellation propagation.
	 *   When parent aborts, this task will also abort.
	 *
	 * @internal Use `Scope.task()` to create tasks instead of calling directly
	 */
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
	 * Gets the AbortSignal for this task.
	 *
	 * Creates the AbortController lazily if it hasn't been accessed yet.
	 * The signal is linked to the parent scope's signal - if the parent
	 * aborts, this signal will also abort.
	 *
	 * @returns The AbortSignal for this task
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const task = s.task(async ({ signal }) => {
	 *   // Use signal directly or access via task.signal
	 *   const response = await fetch(url, { signal });
	 *   return response.json();
	 * });
	 *
	 * // Access the signal before awaiting the task
	 * console.log('Signal aborted?', task.signal.aborted);
	 * ```
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
	 *
	 * Called lazily when signal is accessed or task starts.
	 * @internal
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
	 *
	 * A task starts executing when `.then()`, `.catch()`, `.finally()`,
	 * or `await` is called on it. Before that, it's in a lazy, unstarted state.
	 *
	 * @returns `true` if the task has started execution, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *	 *
	 * const task = s.task(() => fetchData());
	 * console.log(task.isStarted); // false
	 *
	 * // Start the task
	 * task.then(console.log);
	 * console.log(task.isStarted); // true
	 * ```
	 */
	get isStarted(): boolean {
		return this.promise !== undefined;
	}

	/**
	 * Check if the task has settled (completed or failed).
	 *
	 * A task is settled after its promise has either resolved with a value
	 * or rejected with an error.
	 *
	 * @returns `true` if the task has settled, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const task = s.task(() => fetchData());
	 *
	 * console.log(task.isSettled); // false
	 *
	 * await task;
	 *
	 * console.log(task.isSettled); // true
	 * ```
	 */
	get isSettled(): boolean {
		return this.settled;
	}

	/**
	 * Dispose the task without executing it.
	 *
	 * Removes the parent signal listener if the abort controller was set up.
	 * This allows for cleanup of tasks that were created but never started.
	 *
	 * Safe to call multiple times - subsequent calls are no-ops.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * {
	 *   using task = s.task(() => fetchData());
	 *   // Task created but not started
	 *
	 *   if (shouldSkip) {
	 *     return; // Task disposed here, no execution
	 *   }
	 *
	 *   // Would start task if we got here
	 *   await task;
	 * }
	 * ```
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
	 *
	 * Optimized to minimize microtask overhead. This is called
	 * automatically when the task is awaited or `.then()` is called.
	 *
	 * @internal
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

	/**
	 * Attaches callbacks for the resolution and/or rejection of the task.
	 *
	 * Implements the PromiseLike interface. Calling this method starts
	 * task execution if it hasn't started yet.
	 *
	 * @typeParam TResult1 - The type of the value returned from the onfulfilled callback
	 * @typeParam TResult2 - The type of the value returned from the onrejected callback
	 * @param onfulfilled - Optional callback to execute when the task resolves
	 * @param onrejected - Optional callback to execute when the task rejects
	 * @returns A Promise for the completion of the callback
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const task = s.task(() => fetchData());
	 *
	 * const result = await task.then(
	 *   ([err, data]) => {
	 *     if (err) throw err;
	 *     return processData(data);
	 *   },
	 *   (error) => {
	 *     console.error('Failed:', error);
	 *     return defaultValue;
	 *   }
	 * );
	 * ```
	 */
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
	 * Attaches a callback for only the rejection of the task.
	 *
	 * Convenience method equivalent to `.then(undefined, onrejected)`.
	 * Calling this method starts task execution if it hasn't started yet.
	 *
	 * @typeParam TResult - The type of the value returned from the onrejected callback
	 * @param onrejected - Callback to execute when the task rejects
	 * @returns A Promise for the completion of the callback
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const task = s.task(() => fetchData());
	 *
	 * const result = await task.catch(error => {
	 *   console.error('Fetch failed:', error);
	 *   return defaultData;
	 * });
	 * ```
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
	 * Attaches a callback that is invoked when the task settles (resolves or rejects).
	 *
	 * Convenience method equivalent to `.then(onfinally, onfinally)`.
	 * The callback receives no arguments - it doesn't matter if the task
	 * succeeded or failed.
	 *
	 * Calling this method starts task execution if it hasn't started yet.
	 *
	 * @param onfinally - Callback to execute when the task settles
	 * @returns A Promise for the completion of the callback
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const task = s.task(() => fetchData());
	 *
	 * const result = await task.finally(() => {
	 *   console.log('Task finished (success or failure)');
	 *   cleanupResources();
	 * });
	 * ```
	 */
	finally(onfinally?: (() => void) | null | undefined): Promise<T> {
		return this.start().finally(onfinally);
	}
}
