/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

import createDebug from "debug";

const debugScope = createDebug("go-go-scope:scope");
const debugTask = createDebug("go-go-scope:task");

export type Result<E, T> = readonly [E | undefined, T | undefined];
export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];

/**
 * OpenTelemetry Tracer interface (minimal subset for optional integration)
 * This avoids a hard dependency on @opentelemetry/api
 */
export interface Tracer {
	startSpan(name: string, options?: SpanOptions): Span;
}

/**
 * OpenTelemetry Span interface (minimal subset)
 */
export interface Span {
	end(): void;
	recordException(exception: unknown): void;
	setStatus(status: { code: number; message?: string }): void;
	setAttributes?(attributes: Record<string, unknown>): void;
}

/**
 * Options for span creation
 */
export interface SpanOptions {
	attributes?: Record<string, unknown>;
}

/**
 * Options for spawning a task with tracing.
 */
export interface TaskOptions {
	/**
	 * Optional name for the task span. Defaults to "scope.task".
	 */
	name?: string;
	/**
	 * Optional additional attributes to add to the task span.
	 */
	attributes?: Record<string, unknown>;
}

/**
 * Span status codes (from OpenTelemetry)
 */
export const SpanStatusCode = {
	UNSET: 0,
	OK: 1,
	ERROR: 2,
} as const;

/**
 * Options for creating a Scope
 */
export interface ScopeOptions {
	/**
	 * Optional timeout in milliseconds.
	 * If set, the scope will be aborted after this duration.
	 */
	timeout?: number;
	/**
	 * Optional parent AbortSignal to link cancellation.
	 */
	signal?: AbortSignal;
	/**
	 * Optional OpenTelemetry tracer for automatic tracing.
	 * When provided, the scope will create spans for lifecycle events.
	 */
	tracer?: Tracer;
	/**
	 * Optional name for the scope span. Defaults to "scope".
	 */
	name?: string;
}

/**
 * A disposable task that runs within a Scope.
 * Implements PromiseLike for await support and Disposable for cleanup.
 */
let taskIdCounter = 0;

export class Task<T> implements PromiseLike<T>, Disposable {
	private readonly promise: Promise<T>;
	private readonly abortController: AbortController;
	private settled = false;
	private readonly id: number;

	constructor(
		fn: (signal: AbortSignal) => Promise<T>,
		parentSignal: AbortSignal,
	) {
		this.id = ++taskIdCounter;
		debugTask("[%d] creating task", this.id);
		this.abortController = new AbortController();

		// Link to parent - if parent aborts, we abort
		const parentAbortHandler = () => {
			debugTask("[%d] aborting due to parent signal", this.id);
			this.abortController.abort(parentSignal.reason);
		};

		if (parentSignal.aborted) {
			debugTask("[%d] parent already aborted, aborting immediately", this.id);
			this.abortController.abort(parentSignal.reason);
		} else {
			parentSignal.addEventListener("abort", parentAbortHandler, {
				once: true,
			});
		}

		// Create the promise
		this.promise = fn(this.abortController.signal)
			.then((value) => {
				debugTask("[%d] completed successfully", this.id);
				return value;
			})
			.catch((error) => {
				debugTask("[%d] failed with error: %s", this.id, error);
				throw error;
			})
			.finally(() => {
				this.settled = true;
				if (!parentSignal.aborted) {
					parentSignal.removeEventListener("abort", parentAbortHandler);
				}
			});
	}

	/**
	 * Get the AbortSignal for this task.
	 */
	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	/**
	 * Check if the task has settled (completed or failed).
	 */
	get isSettled(): boolean {
		return this.settled;
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
		return this.promise.then(onfulfilled, onrejected);
	}

	/**
	 * Dispose the task by aborting it.
	 * Called automatically when using `using` keyword.
	 */
	[Symbol.dispose](): void {
		if (!this.settled) {
			debugTask("[%d] disposing (aborting)", this.id);
			this.abortController.abort("task disposed");
		} else {
			debugTask("[%d] already settled, skipping dispose", this.id);
		}
	}
}

/**
 * An async disposable resource wrapper.
 */
export class AsyncDisposableResource<T> implements AsyncDisposable {
	private acquired = false;
	private resource: T | undefined;
	private readonly acquireFn: () => Promise<T>;
	private readonly disposeFn: (resource: T) => Promise<void>;

	constructor(
		acquire: () => Promise<T>,
		dispose: (resource: T) => Promise<void>,
	) {
		this.acquireFn = acquire;
		this.disposeFn = dispose;
	}

	/**
	 * Acquire the resource.
	 */
	async acquire(): Promise<T> {
		if (this.acquired) {
			throw new Error("Resource already acquired");
		}
		this.resource = await this.acquireFn();
		this.acquired = true;
		return this.resource;
	}

	/**
	 * Get the acquired resource, or undefined if not acquired.
	 */
	get value(): T | undefined {
		return this.resource;
	}

	/**
	 * Dispose the resource.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.acquired && this.resource !== undefined) {
			await this.disposeFn(this.resource);
			this.acquired = false;
			this.resource = undefined;
		}
	}
}

/**
 * A Scope for structured concurrency.
 * All tasks spawned within a scope are automatically cancelled when the scope exits.
 *
 * Implements AsyncDisposable for use with `await using`.
 *
 * @example
 * ```typescript
 * await using s = scope({ timeout: 5000 })
 * using t1 = s.spawn(() => fetchData())
 * using t2 = s.spawn(() => fetchMore())
 * const [r1, r2] = await Promise.all([t1, t2])
 * ```
 */
let scopeIdCounter = 0;

export class Scope implements AsyncDisposable {
	private readonly abortController: AbortController;
	private readonly disposables: (Disposable | AsyncDisposable)[] = [];
	private readonly timeoutId: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private readonly tracer?: Tracer;
	private readonly span?: Span;
	private taskCount = 0;
	private spanHasError = false;
	private readonly startTime: number;
	private readonly id: number;
	private readonly name: string;

	constructor(options?: ScopeOptions) {
		this.id = ++scopeIdCounter;
		this.name = options?.name ?? `scope-${this.id}`;
		debugScope(
			"[%s] creating scope (timeout: %d, parent signal: %s)",
			this.name,
			options?.timeout ?? 0,
			options?.signal ? "yes" : "no",
		);
		this.abortController = new AbortController();
		this.tracer = options?.tracer;
		this.startTime = performance.now();

		// Create span if tracer is provided
		if (this.tracer) {
			this.span = this.tracer.startSpan(options?.name ?? "scope", {
				attributes: {
					"scope.timeout": options?.timeout,
					"scope.has_parent_signal": !!options?.signal,
				},
			});
		}

		// Link to parent signal if provided
		if (options?.signal) {
			const parentSignal = options.signal;
			const parentHandler = () => {
				const reason = parentSignal.reason;
				debugScope("[%s] aborting due to parent signal: %s", this.name, reason);
				this.span?.recordException(
					reason instanceof Error ? reason : new Error(String(reason)),
				);
				this.span?.setStatus({
					code: SpanStatusCode.ERROR,
					message: "aborted by parent",
				});
				this.spanHasError = true;
				this.abortController.abort(reason);
			};
			if (options.signal.aborted) {
				debugScope("[%s] parent already aborted", this.name);
				this.abortController.abort(options.signal.reason);
			} else {
				options.signal.addEventListener("abort", parentHandler, { once: true });
			}
		}

		// Set up timeout if provided
		if (options?.timeout !== undefined && options.timeout > 0) {
			this.timeoutId = setTimeout(() => {
				const error = new Error(`timeout after ${options.timeout}ms`);
				debugScope("[%s] timeout after %dms", this.name, options.timeout);
				this.span?.recordException(error);
				this.span?.setStatus({
					code: SpanStatusCode.ERROR,
					message: "timeout",
				});
				this.spanHasError = true;
				this.abortController.abort(error);
			}, options.timeout);
		}
	}

	/**
	 * Get the AbortSignal for this scope.
	 */
	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	/**
	 * Check if the scope has been disposed.
	 */
	get isDisposed(): boolean {
		return this.disposed;
	}

	/**
	 * Options for spawning a task.
	 */
	spawn<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		options?: TaskOptions,
	): Task<T> {
		if (this.disposed) {
			throw new Error("Cannot spawn task on disposed scope");
		}
		if (this.abortController.signal.aborted) {
			throw new Error("Cannot spawn task on aborted scope");
		}

		this.taskCount++;
		const taskIndex = this.taskCount;
		const taskName = options?.name ?? `task-${taskIndex}`;
		debugScope('[%s] spawning task #%d "%s"', this.name, taskIndex, taskName);

		// Merge default attributes with custom ones
		const attributes: Record<string, unknown> = {
			"task.index": taskIndex,
			...options?.attributes,
		};

		const taskSpan = this.tracer?.startSpan(options?.name ?? "scope.task", {
			attributes,
		});

		const taskStartTime = performance.now();

		const wrappedFn = async (signal: AbortSignal): Promise<T> => {
			try {
				const result = await fn(signal);
				taskSpan?.setStatus({ code: SpanStatusCode.OK });
				return result;
			} catch (error) {
				taskSpan?.recordException(
					error instanceof Error ? error : new Error(String(error)),
				);
				taskSpan?.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : String(error),
				});
				throw error;
			} finally {
				// Calculate and record task duration in milliseconds
				const duration = performance.now() - taskStartTime;
				taskSpan?.setAttributes?.({ "task.duration_ms": duration });
				taskSpan?.end();
			}
		};

		const task = new Task(wrappedFn, this.abortController.signal);
		this.disposables.push(task);
		debugScope(
			"[%s] task #%d added to disposables (total: %d)",
			this.name,
			taskIndex,
			this.disposables.length,
		);
		return task;
	}

	/**
	 * Spawn a task that returns a Result tuple.
	 * Automatically wraps the function with error handling.
	 *
	 * @param fn - Function that receives an AbortSignal and returns a Promise
	 * @param options - Optional task configuration for tracing
	 * @returns A disposable Task that resolves to a Result
	 */
	task<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		options?: TaskOptions,
	): Task<Result<string, T>> {
		return this.spawn(async (signal) => {
			try {
				const result = await fn(signal);
				return [undefined, result] as Success<T>;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return [message, undefined] as Failure<string>;
			}
		}, options);
	}

	/**
	 * Acquire a resource that will be automatically disposed when the scope exits.
	 *
	 * @param acquire - Function to acquire the resource
	 * @param dispose - Function to dispose the resource
	 * @returns The acquired resource
	 */
	async acquire<T>(
		acquire: () => Promise<T>,
		dispose: (resource: T) => Promise<void>,
	): Promise<T> {
		if (this.disposed) {
			throw new Error("Cannot acquire resource on disposed scope");
		}

		const resource = new AsyncDisposableResource(acquire, dispose);
		this.disposables.push(resource);
		debugScope(
			"[%s] acquired resource (total disposables: %d)",
			this.name,
			this.disposables.length,
		);
		return resource.acquire();
	}

	/**
	 * Dispose the scope and all tracked resources.
	 * Resources are disposed in LIFO order (reverse of creation).
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) {
			debugScope("[%s] already disposed, skipping", this.name);
			return;
		}

		debugScope(
			"[%s] disposing scope (tasks: %d, disposables: %d)",
			this.name,
			this.taskCount,
			this.disposables.length,
		);
		this.disposed = true;

		// Clear timeout if set
		if (this.timeoutId !== undefined) {
			clearTimeout(this.timeoutId);
		}

		// Abort all tasks
		debugScope("[%s] aborting all tasks", this.name);
		this.abortController.abort(new Error("scope disposed"));

		// Dispose all resources in reverse order (LIFO)
		const errors: unknown[] = [];
		let disposeIndex = 0;
		for (const disposable of [...this.disposables].reverse()) {
			disposeIndex++;
			try {
				debugScope(
					"[%s] disposing resource %d/%d",
					this.name,
					disposeIndex,
					this.disposables.length,
				);
				if (Symbol.asyncDispose in disposable) {
					await disposable[Symbol.asyncDispose]();
				} else if (Symbol.dispose in disposable) {
					disposable[Symbol.dispose]();
				}
			} catch (error) {
				debugScope(
					"[%s] error disposing resource %d: %s",
					this.name,
					disposeIndex,
					error,
				);
				errors.push(error);
			}
		}

		// Clear the disposables list
		const disposedCount = this.disposables.length;
		this.disposables.length = 0;
		debugScope("[%s] cleared %d disposables", this.name, disposedCount);

		// End the scope span
		if (errors.length > 0) {
			const errorMessages = errors.map((e) =>
				e instanceof Error ? e.message : String(e),
			);
			this.span?.setStatus({
				code: SpanStatusCode.ERROR,
				message: `Disposal errors: ${errorMessages.join(", ")}`,
			});
			for (const error of errors) {
				this.span?.recordException(
					error instanceof Error ? error : new Error(String(error)),
				);
			}
			this.spanHasError = true;
		}
		// Only set OK if we haven't already recorded an error
		if (!this.spanHasError) {
			this.span?.setStatus({ code: SpanStatusCode.OK });
		}

		// Calculate and record scope duration in milliseconds
		const duration = performance.now() - this.startTime;
		this.span?.setAttributes?.({ "scope.duration_ms": duration });

		this.span?.end();
		debugScope(
			"[%s] scope disposed (duration: %dms, errors: %d)",
			this.name,
			Math.round(duration),
			errors.length,
		);

		// If any disposals threw, aggregate and rethrow
		if (errors.length > 0) {
			if (errors.length === 1) {
				throw errors[0];
			}
			const aggregate = new Error(
				`Multiple errors during scope disposal: ${errors.map((e) => (e instanceof Error ? e.message : String(e))).join(", ")}`,
			);
			throw aggregate;
		}
	}

	/** Create a channel within this scope. */
	channel<T>(capacity?: number): Channel<T> {
		const ch = new Channel<T>(capacity ?? 0, this.signal);
		this.acquire(
			async () => ch,
			async () => ch[Symbol.asyncDispose](),
		).catch(() => {});
		return ch;
	}

	/** Create a semaphore within this scope. */
	semaphore(permits: number): Semaphore {
		const sem = new Semaphore(permits, this.signal);
		this.acquire(
			async () => sem,
			async () => sem[Symbol.asyncDispose](),
		).catch(() => {});
		return sem;
	}

	/** Create a circuit breaker within this scope. */
	circuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
		const cb = new CircuitBreaker(options, this.signal);
		this.acquire(
			async () => cb,
			async () => cb[Symbol.asyncDispose](),
		).catch(() => {});
		return cb;
	}

	/** Wrap an AsyncIterable with scope cancellation. */
	stream<T>(source: AsyncIterable<T>): AsyncGenerator<T> {
		return stream(source, this.signal);
	}

	/** Poll a function at regular intervals. */
	poll<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		onValue: (value: T) => void | Promise<void>,
		options?: Omit<PollOptions, "signal">,
	): Promise<void> {
		return poll(fn, onValue, { ...options, signal: this.signal });
	}
}

/**
 * Create a new Scope for structured concurrency.
 *
 * @param options - Optional configuration for the scope
 * @returns A new Scope instance
 *
 * @example
 * ```typescript
 * await using s = scope({ timeout: 5000 })
 * using t = s.spawn(() => fetchData())
 * const result = await t
 * ```
 *
 * @example With OpenTelemetry tracing
 * ```typescript
 * import { trace } from "@opentelemetry/api"
 *
 * await using s = scope({ tracer: trace.getTracer("my-app") })
 * using t = s.spawn(() => fetchData())  // Creates "scope.task" span
 * const result = await t
 * // Scope disposal creates "scope" span with task count
 * ```
 */
export function scope(options?: ScopeOptions): Scope {
	return new Scope(options);
}

/**
 * Options for the race function
 */
export interface RaceOptions {
	/**
	 * Optional signal to cancel the race.
	 */
	signal?: AbortSignal;
}

/**
 * Race multiple tasks - the first to settle wins, others are cancelled.
 * Implements structured concurrency: all tasks run within a scope.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional race configuration
 * @returns A Promise that resolves to the value of the first settled task
 *
 * @example
 * ```typescript
 * const winner = await race([
 *   (signal) => fetch('https://a.com', { signal }),
 *   (signal) => fetch('https://b.com', { signal }),
 * ])
 * ```
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<T> {
	if (factories.length === 0) {
		throw new Error("Cannot race empty array of factories");
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options?.signal });

	try {
		// Create abort promise that rejects when signal aborts
		const abortPromise = new Promise<never>((_, reject) => {
			s.signal.addEventListener(
				"abort",
				() => {
					reject(s.signal.reason);
				},
				{ once: true },
			);
		});

		// Spawn all tasks, passing the scope's signal
		const tasks = factories.map((factory) =>
			s.spawn((signal) => factory(signal)),
		);

		// Race all tasks against abort
		return await Promise.race([...tasks, abortPromise]);
	} finally {
		// Clean up scope - cancels all tasks
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Options for the timeout function
 */
export interface TimeoutOptions {
	/**
	 * Optional signal to cancel the timeout.
	 */
	signal?: AbortSignal;
}

/**
 * Run a function with a timeout.
 * The function receives an AbortSignal that's aborted when the timeout expires.
 *
 * @param ms - Timeout in milliseconds
 * @param fn - Function to execute
 * @param options - Optional configuration
 * @returns A Promise that resolves to the function's return value
 * @throws Error if the timeout is reached
 *
 * @example
 * ```typescript
 * const result = await timeout(5000, async (signal) => {
 *   const response = await fetch(url, { signal })
 *   return response.json()
 * })
 * ```
 */
export async function timeout<T>(
	ms: number,
	fn: (signal: AbortSignal) => Promise<T>,
	options?: TimeoutOptions,
): Promise<T> {
	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options?.signal });

	try {
		// Create the user promise
		const userPromise = fn(s.signal);

		// Create the timeout promise
		const timeoutPromise = new Promise<never>((_, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`timeout after ${ms}ms`));
			}, ms);

			// Clean up timeout if scope is aborted
			s.signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timeoutId);
					reject(s.signal.reason);
				},
				{ once: true },
			);
		});

		// Race between user function and timeout
		return await Promise.race([userPromise, timeoutPromise]);
	} finally {
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Run multiple tasks in parallel with optional concurrency limit.
 * All tasks run within a scope and are cancelled together on failure.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit
 * @returns A Promise that resolves to an array of results
 *
 * @example
 * ```typescript
 * const results = await parallel(
 *   urls.map(url => (signal) => fetch(url, { signal })),
 *   { concurrency: 3 }
 * )
 * ```
 */
export async function parallel<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: { concurrency?: number; signal?: AbortSignal },
): Promise<T[]> {
	if (factories.length === 0) {
		return [];
	}

	const concurrency = options?.concurrency ?? 0;

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options?.signal });

	try {
		// Create abort promise that rejects when signal aborts
		const abortPromise = new Promise<never>((_, reject) => {
			s.signal.addEventListener(
				"abort",
				() => {
					reject(s.signal.reason);
				},
				{ once: true },
			);
		});

		// If no concurrency limit, run all in parallel
		if (concurrency <= 0 || concurrency >= factories.length) {
			const tasks = factories.map((factory) =>
				s.spawn((signal) => factory(signal)),
			);
			return await Promise.race([Promise.all(tasks), abortPromise]);
		}

		// Run with limited concurrency using a worker pool
		const results: T[] = new Array(factories.length);
		let index = 0;

		async function worker(): Promise<void> {
			while (index < factories.length) {
				const currentIndex = index++;
				const factory = factories[currentIndex];
				if (!factory) continue;
				const task = s.spawn((signal) => factory(signal));
				results[currentIndex] = await task;
			}
		}

		const workers: Promise<void>[] = [];
		const workerCount = Math.min(concurrency, factories.length);
		for (let i = 0; i < workerCount; i++) {
			workers.push(worker());
		}

		await Promise.race([Promise.all(workers), abortPromise]);
		return results;
	} finally {
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Run multiple tasks in parallel and return Results (never throws).
 * Failed tasks return Failure, successful tasks return Success.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit
 * @returns A Promise that resolves to an array of Results
 *
 * @example
 * ```typescript
 * const results = await parallelResults([
 *   (signal) => fetchUser(1, { signal }),
 *   (signal) => fetchUser(2, { signal }),
 * ])
 * // results is [Result<string, User>, Result<string, User>]
 * ```
 */
export async function parallelResults<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: { concurrency?: number; signal?: AbortSignal },
): Promise<Result<string, T>[]> {
	if (factories.length === 0) {
		return [];
	}

	const concurrency = options?.concurrency ?? 0;

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options?.signal });

	try {
		// Create abort promise that rejects when signal aborts
		const abortPromise = new Promise<never>((_, reject) => {
			s.signal.addEventListener(
				"abort",
				() => {
					reject(s.signal.reason);
				},
				{ once: true },
			);
		});

		// Create a task for each factory that catches errors
		const createTask = (factory: (signal: AbortSignal) => Promise<T>) =>
			s.spawn(async (signal) => {
				try {
					const result = await factory(signal);
					return [undefined, result] as Success<T>;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					return [message, undefined] as Failure<string>;
				}
			});

		// If no concurrency limit, run all in parallel
		if (concurrency <= 0 || concurrency >= factories.length) {
			const tasks = factories.map((factory) => createTask(factory));
			return await Promise.race([Promise.all(tasks), abortPromise]);
		}

		// Run with limited concurrency
		const results: Result<string, T>[] = new Array(factories.length);
		let index = 0;

		async function worker(): Promise<void> {
			while (index < factories.length) {
				const currentIndex = index++;
				const factory = factories[currentIndex];
				if (!factory) continue;
				const task = createTask(factory);
				results[currentIndex] = await task;
			}
		}

		const workers: Promise<void>[] = [];
		const workerCount = Math.min(concurrency, factories.length);
		for (let i = 0; i < workerCount; i++) {
			workers.push(worker());
		}

		await Promise.race([Promise.all(workers), abortPromise]);
		return results;
	} finally {
		await s[Symbol.asyncDispose]();
	}
}

/**
 * A Channel for Go-style concurrent communication.
 * Supports multiple producers/consumers with backpressure.
 * Automatically closes when the parent scope is disposed.
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const ch = s.channel<string>(10)
 *
 * // Producer
 * s.spawn(async () => {
 *   for (const item of items) {
 *     await ch.send(item)  // Blocks if buffer full
 *   }
 *   ch.close()
 * })
 *
 * // Consumer
 * for await (const item of ch) {
 *   await process(item)
 * }
 * ```
 */
export class Channel<T> implements AsyncIterable<T>, AsyncDisposable {
	private buffer: T[] = [];
	private sendQueue: Array<{
		resolve: () => void;
		reject: (reason: unknown) => void;
	}> = [];
	private receiveQueue: Array<{
		resolve: (value: T | undefined) => void;
		reject: (reason: unknown) => void;
	}> = [];
	private closed = false;
	private aborted = false;
	private abortReason: unknown;

	constructor(
		private capacity: number,
		parentSignal?: AbortSignal,
	) {
		if (parentSignal) {
			parentSignal.addEventListener(
				"abort",
				() => {
					this.aborted = true;
					this.abortReason = parentSignal.reason;
					this.drainQueues();
				},
				{ once: true },
			);
		}
	}

	/**
	 * Send a value to the channel.
	 * Blocks if the buffer is full until space is available.
	 * Resolves to false if the channel is closed.
	 * Throws if the scope is aborted.
	 */
	send(value: T): Promise<boolean> {
		if (this.closed) {
			return Promise.resolve(false);
		}

		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// If there's a waiting receiver, give directly
		if (this.receiveQueue.length > 0) {
			const receiver = this.receiveQueue.shift();
			if (receiver) {
				receiver.resolve(value);
				return Promise.resolve(true);
			}
		}

		// If buffer has space, add to buffer
		if (this.buffer.length < this.capacity) {
			this.buffer.push(value);
			return Promise.resolve(true);
		}

		// Otherwise, wait for space
		return new Promise((resolve, reject) => {
			this.sendQueue.push({
				resolve: () => {
					this.buffer.push(value);
					resolve(true);
				},
				reject,
			});
		});
	}

	/**
	 * Receive a value from the channel.
	 * Returns undefined if the channel is closed and empty.
	 * Throws if the scope is aborted.
	 */
	receive(): Promise<T | undefined> {
		if (this.aborted) {
			return Promise.reject(this.abortReason);
		}

		// If buffer has items, return from buffer
		if (this.buffer.length > 0) {
			const value = this.buffer.shift();

			// Unblock a waiting sender if any
			if (this.sendQueue.length > 0) {
				const sender = this.sendQueue.shift();
				if (sender) {
					sender.resolve();
				}
			}

			return Promise.resolve(value);
		}

		// If closed and empty, return undefined
		if (this.closed) {
			return Promise.resolve(undefined);
		}

		// Otherwise, wait for a value
		return new Promise((resolve, reject) => {
			this.receiveQueue.push({ resolve, reject });
		});
	}

	/**
	 * Close the channel. No more sends allowed.
	 * Consumers will drain the buffer then receive undefined.
	 */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.drainQueues();
	}

	/**
	 * Check if the channel is closed.
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get the current buffer size.
	 */
	get size(): number {
		return this.buffer.length;
	}

	/**
	 * Get the buffer capacity.
	 */
	get cap(): number {
		return this.capacity;
	}

	/**
	 * Async iterator for the channel.
	 * Yields values until channel is closed and empty.
	 * Automatically handles cleanup.
	 */
	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		while (true) {
			const value = await this.receive();
			if (value === undefined) break;
			yield value;
		}
	}

	/**
	 * Dispose the channel, aborting all pending operations.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.close();
		this.aborted = true;
		this.abortReason = new Error("channel disposed");
		this.drainQueues();
	}

	private drainQueues(): void {
		// Reject all waiting senders
		while (this.sendQueue.length > 0) {
			const sender = this.sendQueue.shift();
			if (sender) {
				sender.reject(this.abortReason);
			}
		}

		// Resolve all waiting receivers with undefined
		while (this.receiveQueue.length > 0) {
			const receiver = this.receiveQueue.shift();
			if (receiver) {
				receiver.resolve(undefined);
			}
		}
	}
}

/**
 * A Semaphore for limiting concurrent access to a resource.
 * Respects scope cancellation.
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const sem = s.semaphore(3)
 *
 * await parallel([
 *   () => sem.acquire(() => heavyTask1()),
 *   () => sem.acquire(() => heavyTask2()),
 *   () => sem.acquire(() => heavyTask3()),
 * ])
 * ```
 */
export class Semaphore implements AsyncDisposable {
	private permits: number;
	private queue: Array<{
		resolve: () => void;
		reject: (reason: unknown) => void;
	}> = [];
	private aborted = false;
	private abortReason: unknown;

	constructor(initialPermits: number, parentSignal?: AbortSignal) {
		this.permits = initialPermits;

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

		return new Promise((resolve, reject) => {
			this.queue.push({ resolve, reject });
		});
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
	 * Get the number of waiting acquirers.
	 */
	get waiting(): number {
		return this.queue.length;
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

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Options for the circuit breaker.
 */
export interface CircuitBreakerOptions {
	/** Number of failures before opening the circuit. Default: 5 */
	failureThreshold?: number;
	/** Time in ms before attempting to close. Default: 30000 */
	resetTimeout?: number;
}

/**
 * A Circuit Breaker that prevents cascading failures.
 * Automatically transitions between closed, open, and half-open states.
 * Respects scope cancellation via AbortSignal.
 *
 * @example
 * ```typescript
 * await using s = scope()
 * const cb = s.circuitBreaker({ failureThreshold: 3, resetTimeout: 10000 })
 *
 * const result = await cb.execute((signal) =>
 *   fetchData({ signal })
 * )
 * ```
 */
export class CircuitBreaker implements AsyncDisposable {
	private state: CircuitState = "closed";
	private failures = 0;
	private lastFailureTime?: number;
	private readonly failureThreshold: number;
	private readonly resetTimeout: number;

	constructor(
		options: CircuitBreakerOptions = {},
		private parentSignal?: AbortSignal,
	) {
		this.failureThreshold = options.failureThreshold ?? 5;
		this.resetTimeout = options.resetTimeout ?? 30000;
	}

	/**
	 * Execute a function with circuit breaker protection.
	 * @throws Error if circuit is open
	 * @throws Error from the function if it fails
	 */
	async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
		if (this.parentSignal?.aborted) {
			throw this.parentSignal.reason;
		}

		// Check if we should transition from open to half-open
		if (this.state === "open") {
			if (
				this.lastFailureTime &&
				Date.now() - this.lastFailureTime >= this.resetTimeout
			) {
				this.state = "half-open";
			} else {
				throw new Error("Circuit breaker is open");
			}
		}

		try {
			const controller = new AbortController();

			// Link to parent signal
			if (this.parentSignal) {
				this.parentSignal.addEventListener(
					"abort",
					() => controller.abort(this.parentSignal?.reason),
					{ once: true },
				);
			}

			const result = await fn(controller.signal);

			// Success - reset circuit
			this.onSuccess();
			return result;
		} catch (error) {
			// Failure - record and possibly open circuit
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Get the current state of the circuit breaker.
	 */
	get currentState(): CircuitState {
		if (this.state === "open") {
			// Check if we should transition to half-open
			if (
				this.lastFailureTime &&
				Date.now() - this.lastFailureTime >= this.resetTimeout
			) {
				return "half-open";
			}
		}
		return this.state;
	}

	/**
	 * Get the current failure count.
	 */
	get failureCount(): number {
		return this.failures;
	}

	/**
	 * Manually reset the circuit breaker to closed state.
	 */
	reset(): void {
		this.state = "closed";
		this.failures = 0;
		this.lastFailureTime = undefined;
	}

	/**
	 * Dispose the circuit breaker.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.reset();
	}

	private onSuccess(): void {
		this.failures = 0;
		this.state = "closed";
		this.lastFailureTime = undefined;
	}

	private onFailure(): void {
		this.failures++;
		this.lastFailureTime = Date.now();

		if (this.failures >= this.failureThreshold) {
			this.state = "open";
		} else if (this.state === "half-open") {
			// Failure in half-open goes back to open
			this.state = "open";
		}
	}
}

/**
 * Wrap an AsyncIterable with structured concurrency.
 * Automatically stops iteration when the scope is aborted.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * for await (const chunk of s.stream(readableStream)) {
 *   await processChunk(chunk)
 *   // Automatically stops if scope is cancelled
 * }
 * ```
 */
export async function* stream<T>(
	source: AsyncIterable<T>,
	signal?: AbortSignal,
): AsyncGenerator<T> {
	const iterator = source[Symbol.asyncIterator]();

	try {
		while (true) {
			// Check for abort before each iteration
			if (signal?.aborted) {
				throw signal.reason;
			}

			const result = await iterator.next();

			if (signal?.aborted) {
				throw signal.reason;
			}

			if (result.done) break;
			yield result.value;
		}
	} finally {
		// Ensure cleanup
		await iterator.return?.();
	}
}

/**
 * Options for the poll function.
 */
export interface PollOptions {
	/** Interval in milliseconds. Default: 5000 */
	interval?: number;
	/** Optional signal to cancel polling. */
	signal?: AbortSignal;
	/** Run immediately on start. Default: true */
	immediate?: boolean;
}

/**
 * Poll a function at regular intervals with structured concurrency.
 * Automatically stops when the scope is disposed.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * s.poll(async (signal) => {
 *   const config = await fetchConfig({ signal })
 *   updateConfig(config)
 * }, { interval: 30000 })
 *
 * // Polls every 30 seconds until scope exits
 * ```
 */
export async function poll<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	onValue: (value: T) => void | Promise<void>,
	options: PollOptions = {},
): Promise<void> {
	const interval = options.interval ?? 5000;
	const immediate = options.immediate ?? true;

	// Check if already aborted
	if (options.signal?.aborted) {
		throw options.signal.reason;
	}

	const s = new Scope({ signal: options.signal });

	try {
		let firstRun = true;
		while (!s.signal.aborted) {
			if (immediate || !firstRun) {
				try {
					const value = await s.spawn((sig) => fn(sig));
					await onValue(value);
				} catch (error) {
					// Continue polling even on error
					// Could add error callback option here
				}
			}
			firstRun = false;

			// Wait for interval or abort
			await new Promise<void>((resolve, reject) => {
				const timeoutId = setTimeout(resolve, interval);
				s.signal.addEventListener(
					"abort",
					() => {
						clearTimeout(timeoutId);
						reject(s.signal.reason);
					},
					{ once: true },
				);
			});
		}
	} finally {
		await s[Symbol.asyncDispose]();
	}
}
