/**
 * Task class for go-go-scope
 */

let taskIdCounter = 0;

/**
 * A disposable task that runs within a Scope.
 * Implements PromiseLike for await support and Disposable for cleanup.
 * Execution is lazy - the task only starts when awaited or .then() is called.
 */
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
	}

	/**
	 * Start the task execution if not already started.
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
		this.promise = this.fn(this.abortController!.signal).finally(() => {
			this.settled = true;
			if (this.parentAbortHandler && !this.parentSignal.aborted) {
				this.parentSignal.removeEventListener("abort", this.parentAbortHandler);
			}
		});

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
}
