/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

import type { Context, Span, SpanOptions, Tracer } from "@opentelemetry/api";
import { context as otelContext, trace } from "@opentelemetry/api";
import createDebug from "debug";

const debugScope = createDebug("go-go-scope:scope");
const debugTask = createDebug("go-go-scope:task");

export type Result<E, T> = readonly [E | undefined, T | undefined];
export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];

// Re-export OpenTelemetry types for users
export type { Context, Span, SpanOptions, Tracer };

/**
 * Options for spawning a task with tracing.
 */
export interface TaskOptions {
	/**
	 * OpenTelemetry tracing options.
	 */
	otel?: {
		/**
		 * Optional name for the task span. Defaults to "scope.task".
		 */
		name?: string;
		/**
		 * Optional additional attributes to add to the task span.
		 */
		attributes?: Record<string, unknown>;
	};
	/**
	 * Retry options for automatic retry logic.
	 */
	retry?: {
		/**
		 * Maximum number of retry attempts. Default: 3
		 */
		maxRetries?: number;
		/**
		 * Delay between retries in milliseconds.
		 * Can be a fixed number or a function that receives the attempt number (1-based) and error.
		 * Default: 0 (no delay)
		 */
		delay?: number | ((attempt: number, error: unknown) => number);
		/**
		 * Function to determine if an error should trigger a retry.
		 * Return true to retry, false to throw immediately.
		 * Default: retry all errors
		 */
		retryCondition?: (error: unknown) => boolean;
		/**
		 * Callback invoked when a retry is about to happen.
		 * Receives the error and the attempt number (1-based).
		 */
		onRetry?: (error: unknown, attempt: number) => void;
	};
	/**
	 * Timeout in milliseconds for this task.
	 * If set, the task will be aborted after this duration.
	 */
	timeout?: number;
	/**
	 * Optional cleanup function to run when the task completes or is cancelled.
	 * Runs alongside the default scope cleanup.
	 */
	onCleanup?: () => void | Promise<void>;
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
export interface ScopeOptions<
	ParentServices extends Record<string, unknown> = Record<string, never>,
> {
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
	/**
	 * Optional concurrency limit for tasks spawned within this scope.
	 * If set, tasks will acquire a permit before executing.
	 */
	concurrency?: number;
	/**
	 * Optional circuit breaker configuration for this scope.
	 * When set, all tasks will execute through a circuit breaker with these options.
	 */
	circuitBreaker?: CircuitBreakerOptions;
	/**
	 * Optional parent scope to inherit signal and services from.
	 * The child scope will share the parent's AbortSignal and have access to all parent services.
	 */
	parent?: Scope<ParentServices>;
}

/**
 * A disposable task that runs within a Scope.
 * Implements PromiseLike for await support and Disposable for cleanup.
 * Execution is lazy - the task only starts when awaited or .then() is called.
 */
let taskIdCounter = 0;

export class Task<T> implements PromiseLike<T>, Disposable {
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
		return this.abortController.signal;
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
		this.promise = this.fn(this.abortController.signal).finally(() => {
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
 * const t1 = s.spawn(() => fetchData())
 * const t2 = s.spawn(() => fetchMore())
 * const [r1, r2] = await Promise.all([t1, t2])
 * ```
 */
let scopeIdCounter = 0;

export class Scope<
	Services extends Record<string, unknown> = Record<string, never>,
> implements AsyncDisposable
{
	private readonly abortController: AbortController;
	private readonly disposables: (Disposable | AsyncDisposable)[] = [];
	private readonly timeoutId: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private readonly _tracer?: Tracer;
	private readonly span?: Span;
	private readonly context?: Context;
	private taskCount = 0;
	private spanHasError = false;
	private readonly activeTasks = new Set<Task<unknown>>();
	private readonly startTime: number;
	private readonly id: number;
	private readonly name: string;
	private readonly concurrencySemaphore?: Semaphore;
	private readonly scopeCircuitBreaker?: CircuitBreaker;
	private services: Services = {} as Services;

	constructor(options?: ScopeOptions<Record<string, unknown>>) {
		this.id = ++scopeIdCounter;
		this.name = options?.name ?? `scope-${this.id}`;

		// Inherit from parent scope if provided
		const parent = options?.parent;
		const parentSignal = parent?.signal ?? options?.signal;
		const parentServices = parent?.services;
		if (parentServices) {
			this.services = { ...parentServices } as Services;
		}

		// Inherit options from parent if not explicitly provided
		const tracer = options?.tracer ?? parent?.tracer;
		const concurrency = options?.concurrency ?? parent?.concurrency;
		const circuitBreaker = options?.circuitBreaker ?? parent?.circuitBreaker;

		debugScope(
			"[%s] creating scope (timeout: %d, parent signal: %s, concurrency: %s, circuitBreaker: %s, parent: %s)",
			this.name,
			options?.timeout ?? 0,
			parentSignal ? "yes" : "no",
			concurrency ?? "unlimited",
			circuitBreaker ? "yes" : "no",
			parent ? "yes" : "no",
		);
		this.abortController = new AbortController();
		this._tracer = tracer;
		this.startTime = performance.now();

		// Create concurrency semaphore if specified
		if (concurrency !== undefined && concurrency > 0) {
			this.concurrencySemaphore = new Semaphore(
				concurrency,
				this.abortController.signal,
			);
			debugScope(
				"[%s] created concurrency semaphore with %d permits",
				this.name,
				concurrency,
			);
		}

		// Create circuit breaker if specified
		if (circuitBreaker) {
			this.scopeCircuitBreaker = new CircuitBreaker(
				circuitBreaker,
				this.abortController.signal,
			);
			debugScope(
				"[%s] created circuit breaker (failureThreshold: %d)",
				this.name,
				circuitBreaker.failureThreshold ?? 5,
			);
		}

		// Create span if tracer is provided
		if (this.tracer) {
			// Get parent context from parent scope if available
			const parentContext = options?.parent?.otelContext;
			// Get active context from OpenTelemetry (root context if none active)
			const currentContext = parentContext ?? otelContext.active();

			// Create the span with parent context
			this.span = this.tracer.startSpan(
				options?.name ?? "scope",
				{
					attributes: {
						"scope.timeout": options?.timeout,
						"scope.has_parent_signal": !!parentSignal,
						"scope.has_parent_scope": !!options?.parent,
						"scope.concurrency": options?.concurrency,
					},
				},
				currentContext,
			);

			// Store the context with this span set as active
			if (this.span) {
				this.context = trace.setSpan(currentContext, this.span);
			} else {
				this.context = currentContext;
			}
		}

		// Link to parent signal if provided
		if (parentSignal) {
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
			if (parentSignal.aborted) {
				debugScope("[%s] parent already aborted", this.name);
				this.abortController.abort(parentSignal.reason);
			} else {
				parentSignal.addEventListener("abort", parentHandler, { once: true });
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
	 * Get the tracer for this scope (inherited from parent if not set directly).
	 * @internal Used for child scope inheritance
	 */
	get tracer(): Tracer | undefined {
		return this._tracer;
	}

	/**
	 * Get the concurrency limit for this scope (inherited from parent if not set directly).
	 * @internal Used for child scope inheritance
	 */
	get concurrency(): number | undefined {
		return this.concurrencySemaphore?.totalPermits;
	}

	/**
	 * Get the circuit breaker options for this scope (inherited from parent if not set directly).
	 * @internal Used for child scope inheritance
	 */
	get circuitBreaker(): CircuitBreakerOptions | undefined {
		return this.scopeCircuitBreaker
			? {
					failureThreshold: this.scopeCircuitBreaker.failureThreshold,
					resetTimeout: this.scopeCircuitBreaker.resetTimeout,
				}
			: undefined;
	}

	/**
	 * Get the OpenTelemetry span for this scope.
	 * @internal Used for linking child spans
	 */
	get otelSpan(): Span | undefined {
		return this.span;
	}

	/**
	 * Get the OpenTelemetry context for this scope.
	 * @internal Used for creating child spans with proper parent-child relationships
	 */
	get otelContext(): Context | undefined {
		return this.context;
	}

	/**
	 * Spawn a task that returns a Result tuple with the raw error object.
	 * Automatically wraps the function with error handling.
	 *
	 * Supports retry and timeout via TaskOptions.
	 * Scope-level concurrency and circuit breaker (if configured) are automatically applied.
	 *
	 * @param fn - Function that receives { services, signal } and returns a Promise
	 * @param options - Optional task configuration for tracing and execution
	 * @returns A disposable Task that resolves to a Result
	 */
	task<T>(
		fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>,
		options?: TaskOptions,
	): Task<Result<unknown, T>> {
		if (this.disposed) {
			throw new Error("Cannot spawn task on disposed scope");
		}
		if (this.abortController.signal.aborted) {
			throw new Error("Cannot spawn task on aborted scope");
		}

		this.taskCount++;
		const taskIndex = this.taskCount;
		const hasOtel = !!this._tracer;
		const hasDebug = debugScope.enabled;

		// Build task name (only used when needed)
		const taskName = options?.otel?.name ?? `task-${taskIndex}`;

		if (hasDebug) {
			debugScope('[%s] spawning task #%d "%s"', this.name, taskIndex, taskName);
		}

		// Create task span only if tracer is configured
		const taskSpan = hasOtel
			? this._tracer.startSpan(
					options?.otel?.name ?? "scope.task",
					{
						attributes: {
							"task.index": taskIndex,
							"task.has_retry": !!options?.retry,
							"task.has_timeout": !!options?.timeout,
							"task.has_circuit_breaker": !!this.scopeCircuitBreaker,
							"task.scope_concurrency":
								this.concurrencySemaphore?.totalPermits ?? 0,
							...(options?.timeout && { "task.timeout_ms": options.timeout }),
							...options?.otel?.attributes,
						},
					},
					this.otelContext ?? otelContext.active(),
				)
			: undefined;

		let retryAttempt = 0;

		const hasTaskDebug = debugTask.enabled;

		// Cache frequently accessed options for faster checks
		const hasCircuitBreaker = !!this.scopeCircuitBreaker;
		const hasConcurrency = !!this.concurrencySemaphore;
		const hasRetry = !!options?.retry;
		// hasTimeout is checked inline to avoid unused variable warning
		// const hasTimeout = !!options?.timeout;

		// Build the execution pipeline from innermost to outermost
		const wrappedFn = async (signal: AbortSignal): Promise<T> => {
			// Check if signal is already aborted
			if (signal.aborted) {
				if (hasTaskDebug) {
					debugTask(
						"[%s] task aborted before execution: %s",
						taskName,
						signal.reason,
					);
				}
				throw signal.reason;
			}

			// Helper to call fn with services injection
			const callFn = (sig: AbortSignal): Promise<T> => {
				return fn({ services: this.services, signal: sig });
			};

			// 1. Apply circuit breaker if configured at scope level
			let executeFn = callFn;
			if (hasCircuitBreaker) {
				const cb = this.scopeCircuitBreaker;
				const circuitState = cb.currentState;
				if (hasTaskDebug) {
					debugTask("[%s] circuit breaker state: %s", taskName, circuitState);
				}
				taskSpan?.setAttributes?.({
					"task.circuit_breaker.state": circuitState,
					"task.circuit_breaker.failure_count": cb.failureCount,
				});
				executeFn = async (sig) => {
					if (hasTaskDebug) {
						debugTask("[%s] executing through circuit breaker", taskName);
					}
					try {
						const result = await cb.execute(() => callFn(sig));
						if (hasTaskDebug) {
							debugTask("[%s] circuit breaker: success", taskName);
						}
						return result;
					} catch (error) {
						if (
							error instanceof Error &&
							error.message === "circuit breaker is open"
						) {
							taskSpan?.setAttributes?.({
								"task.circuit_breaker.rejected": true,
							});
						}
						throw error;
					}
				};
			}

			// 2. Apply concurrency limit if configured at scope level
			if (hasConcurrency) {
				const sem = this.concurrencySemaphore;
				const innerFn = executeFn;
				executeFn = async (sig) => {
					if (hasTaskDebug) {
						debugTask(
							"[%s] acquiring concurrency permit (available: %d, waiting: %d)",
							taskName,
							sem.availablePermits,
							sem.waiterCount,
						);
					}
					taskSpan?.setAttributes?.({
						"task.concurrency.available_before": sem.availablePermits,
						"task.concurrency.waiting_before": sem.waiterCount,
					});
					try {
						const result = await sem.execute(() => innerFn(sig));
						if (hasTaskDebug) {
							debugTask("[%s] concurrency permit released", taskName);
						}
						return result;
					} catch (error) {
						if (hasTaskDebug) {
							debugTask(
								"[%s] concurrency permit released with error",
								taskName,
							);
						}
						throw error;
					}
				};
			}

			// 3. Apply retry logic if specified
			if (hasRetry) {
				const retryOpts = options.retry;
				const innerFn = executeFn;
				executeFn = async (sig) => {
					const maxRetries = retryOpts.maxRetries ?? 3;
					const delay = retryOpts.delay ?? 0;
					const retryCondition = retryOpts.retryCondition ?? (() => true);
					const onRetry = retryOpts.onRetry;

					taskSpan?.setAttributes?.({
						"task.retry.max_retries": maxRetries,
						"task.retry.has_delay": !!delay,
						"task.retry.has_condition": !!retryOpts.retryCondition,
					});
					if (hasTaskDebug) {
						debugTask(
							"[%s] starting retry loop (maxRetries: %d)",
							taskName,
							maxRetries,
						);
					}

					for (let attempt = 0; attempt <= maxRetries; attempt++) {
						if (sig.aborted) {
							if (hasTaskDebug) {
								debugTask("[%s] task aborted during retry", taskName);
							}
							throw sig.reason;
						}

						try {
							if (hasTaskDebug) {
								debugTask(
									"[%s] attempt %d/%d",
									taskName,
									attempt + 1,
									maxRetries + 1,
								);
							}
							retryAttempt = attempt;
							const result = await innerFn(sig);
							if (attempt > 0) {
								if (hasTaskDebug) {
									debugTask(
										"[%s] succeeded on attempt %d",
										taskName,
										attempt + 1,
									);
								}
								taskSpan?.setAttributes?.({
									"task.retry.succeeded_after": attempt + 1,
								});
							}
							return result;
						} catch (error) {
							if (!retryCondition(error)) {
								if (hasTaskDebug) {
									debugTask(
										"[%s] error rejected by retryCondition, throwing",
										taskName,
									);
								}
								taskSpan?.setAttributes?.({
									"task.retry.condition_rejected": true,
								});
								throw error;
							}

							if (attempt >= maxRetries) {
								if (hasTaskDebug) {
									debugTask(
										"[%s] max retries (%d) exceeded, throwing",
										taskName,
										maxRetries,
									);
								}
								taskSpan?.setAttributes?.({
									"task.retry.max_retries_exceeded": true,
									"task.retry.attempts_made": attempt + 1,
								});
								throw error;
							}

							const delayMs =
								typeof delay === "function" ? delay(attempt + 1, error) : delay;

							debugTask(
								"[%s] attempt %d failed, waiting %dms before retry",
								taskName,
								attempt + 1,
								delayMs,
							);

							if (onRetry) {
								try {
									onRetry(error, attempt + 1);
								} catch {
									// Ignore errors in onRetry
								}
							}

							if (delayMs > 0) {
								await new Promise((resolve, reject) => {
									const timeoutId = setTimeout(resolve, delayMs);
									sig.addEventListener(
										"abort",
										() => {
											clearTimeout(timeoutId);
											reject(sig.reason);
										},
										{ once: true },
									);
								});
							}
						}
					}

					// Should never reach here
					throw new Error("Retry loop exited unexpectedly");
				};
			}

			// 4. Apply timeout if specified
			if (options?.timeout !== undefined && options.timeout > 0) {
				const timeoutMs = options.timeout;
				const innerFn = executeFn;
				executeFn = (sig) =>
					new Promise((resolve, reject) => {
						const timeoutId = setTimeout(() => {
							reject(new Error(`timeout after ${timeoutMs}ms`));
						}, timeoutMs);

						innerFn(sig)
							.then((result) => {
								clearTimeout(timeoutId);
								resolve(result);
							})
							.catch((err) => {
								clearTimeout(timeoutId);
								reject(err);
							});
					});
			}

			// Execute the pipeline
			debugTask("[%s] starting execution", taskName);
			const startTime = performance.now();
			try {
				const result = await executeFn(signal);
				const duration = performance.now() - startTime;
				debugTask("[%s] completed successfully in %dms", taskName, duration);
				taskSpan?.setAttributes?.({
					"task.duration_ms": Math.round(duration),
					"task.retry_attempts": retryAttempt,
				});
				return result;
			} catch (error) {
				const duration = performance.now() - startTime;
				debugTask("[%s] failed after %dms: %s", taskName, duration, error);

				// Determine error reason
				let errorReason = "exception";
				if (error instanceof Error) {
					if (error.message.startsWith("timeout after")) {
						errorReason = "timeout";
					} else if (error.message === "circuit breaker is open") {
						errorReason = "circuit_breaker_open";
					} else if (signal.aborted) {
						errorReason = "aborted";
					}
				} else if (signal.aborted) {
					errorReason = "aborted";
				}

				taskSpan?.recordException?.(
					error instanceof Error ? error : new Error(String(error)),
				);
				taskSpan?.setAttributes?.({
					"task.duration_ms": Math.round(duration),
					"task.error_reason": errorReason,
					"task.retry_attempts": retryAttempt,
				});
				throw error;
			}
		};

		// Create the task with the full pipeline
		const task = new Task<Result<unknown, T>>(async (signal) => {
			try {
				const result = await wrappedFn(signal);
				return [undefined, result] as Success<T>;
			} catch (error) {
				return [error, undefined] as Failure<unknown>;
			}
		}, this.abortController.signal);

		// Track active task
		this.activeTasks.add(task as Task<unknown>);

		// Record span status on completion and remove from active tasks
		task.then(
			() => {
				this.activeTasks.delete(task as Task<unknown>);
				taskSpan?.setStatus?.({ code: SpanStatusCode.OK });
				taskSpan?.end?.();
			},
			() => {
				this.activeTasks.delete(task as Task<unknown>);
				taskSpan?.setStatus?.({
					code: SpanStatusCode.ERROR,
					message: "task failed",
				});
				taskSpan?.end?.();
			},
		);

		// Register custom cleanup if provided - runs when scope exits
		if (options?.onCleanup) {
			const cleanupFn = options.onCleanup;
			const cleanupDisposable: AsyncDisposable = {
				async [Symbol.asyncDispose]() {
					debugTask("[%s] running task cleanup", taskName);
					try {
						await cleanupFn();
					} catch (err) {
						debugTask("[%s] cleanup error: %s", taskName, err);
					}
				},
			};
			this.disposables.push(cleanupDisposable);
		}

		debugScope(
			"[%s] task #%d added to disposables (total: %d)",
			this.name,
			taskIndex,
			this.disposables.length,
		);
		return task;
	}

	/**
	 * Provide a service that will be available to tasks in this scope.
	 * Services are automatically cleaned up when the scope exits.
	 *
	 * @param key - Unique key for the service
	 * @param factory - Function to create the service
	 * @param cleanup - Optional cleanup function (defaults to no-op)
	 * @returns The scope with the service added (for chaining)
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *   .provide('db', () => openDatabase(), (db) => db.close())
	 *   .provide('cache', () => createCache())
	 *
	 * const result = await s.spawn((svcs) => svcs.db.query('SELECT 1'))
	 * ```
	 */
	provide<K extends string, T>(
		key: K,
		factory: () => T,
		cleanup?: (service: T) => void | Promise<void>,
	): Scope<Services & Record<K, T>> {
		if (this.disposed) {
			throw new Error("Cannot provide service on disposed scope");
		}

		const service = factory();

		// Store service
		(this.services as Record<string, unknown>)[key] = service;

		// Register cleanup if provided
		if (cleanup) {
			const cleanupDisposable: AsyncDisposable = {
				async [Symbol.asyncDispose]() {
					// Errors propagate to scope disposal to be recorded in span
					await cleanup(service);
				},
			};
			this.disposables.push(cleanupDisposable);
		}

		debugScope(
			"[%s] provided service '%s' (total disposables: %d)",
			this.name,
			key,
			this.disposables.length,
		);

		// Return with updated type
		return this as Scope<Services & Record<K, T>>;
	}

	/**
	 * Get a service by key.
	 *
	 * @param key - The service key
	 * @returns The service
	 */
	use<K extends keyof Services>(key: K): Services[K] {
		if (this.disposed) {
			throw new Error("Cannot use service on disposed scope");
		}
		return this.services[key];
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

		// Wait for all active tasks to settle before ending the span
		// This ensures the scope duration includes all task execution time
		if (this.activeTasks.size > 0) {
			debugScope(
				"[%s] waiting for %d active tasks to settle",
				this.name,
				this.activeTasks.size,
			);
			await Promise.allSettled(
				Array.from(this.activeTasks).map((t) =>
					Promise.resolve(t).catch(() => {}),
				),
			);
			this.activeTasks.clear();
			debugScope("[%s] all tasks settled", this.name);
		}

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
		this.disposables.push({
			async [Symbol.asyncDispose]() {
				await ch[Symbol.asyncDispose]();
			},
		});
		return ch;
	}

	/** Wrap an AsyncIterable with scope cancellation. */
	stream<T>(source: AsyncIterable<T>): AsyncGenerator<T> {
		return stream(source, this.signal);
	}

	/** Poll a function at regular intervals.
	 * Returns a controller to start, stop, and check status.
	 */
	poll<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		onValue: (value: T) => void | Promise<void>,
		options?: Omit<PollOptions, "signal">,
	): PollController {
		return createPoll(fn, onValue, { ...options, signal: this.signal });
	}

	/**
	 * Race multiple tasks - the first to settle wins, others are cancelled.
	 * Tasks run within this scope and inherit its configuration.
	 * Returns a Result tuple [error, value] - never throws.
	 *
	 * @param factories - Array of factory functions that create promises
	 * @returns A Promise that resolves to a Result tuple of the first settled task
	 */
	async race<T>(
		factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	): Promise<Result<unknown, T>> {
		return race(factories, {
			signal: this.signal,
			tracer: this.tracer,
		});
	}

	/**
	 * Run multiple tasks in parallel.
	 * Tasks run within this scope and inherit its configuration.
	 * Returns an array of Result tuples - never throws by default.
	 *
	 * @param factories - Array of factory functions that create promises
	 * @param options - Optional configuration (failFast defaults to false)
	 * @returns A Promise that resolves to an array of Result tuples, or throws if failFast is true
	 */
	async parallel<T>(
		factories: readonly ((signal: AbortSignal) => Promise<T>)[],
		options?: { failFast?: boolean },
	): Promise<Result<unknown, T>[]> {
		// Use the parallel function with scope's configuration
		return parallel(factories, {
			signal: this.signal,
			concurrency: this.concurrencySemaphore?.totalPermits,
			failFast: options?.failFast ?? false,
			tracer: this.tracer,
		});
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
 * const t = s.spawn(() => fetchData())
 * const result = await t
 * ```
 *
 * @example With OpenTelemetry tracing
 * ```typescript
 * import { trace } from "@opentelemetry/api"
 *
 * await using s = scope({ tracer: trace.getTracer("my-app") })
 * const t = s.spawn(() => fetchData())  // Creates "scope.task" span
 * const result = await t
 * // Scope disposal creates "scope" span with task count
 * ```
 */
export function scope<
	TServices extends Record<string, unknown> = Record<string, unknown>,
>(options?: ScopeOptions<TServices>): Scope<TServices> {
	return new Scope(options) as Scope<TServices>;
}

/**
 * Options for the race function
 */
export interface RaceOptions {
	/**
	 * Optional signal to cancel the race.
	 */
	signal?: AbortSignal;
	/**
	 * Optional tracer for OpenTelemetry integration.
	 */
	tracer?: Tracer;
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
 *   ({ signal }) => fetch('https://a.com', { signal }),
 *   ({ signal }) => fetch('https://b.com', { signal }),
 * ])
 * ```
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<Result<unknown, T>> {
	const totalTasks = factories.length;

	if (totalTasks === 0) {
		return [new Error("Cannot race empty array of factories"), undefined];
	}

	debugScope("[race] starting race with %d competitors", totalTasks);

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		debugScope("[race] already aborted");
		return [options.signal.reason, undefined];
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let settledCount = 0;
	let winnerIndex = -1;

	try {
		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			s.signal.addEventListener(
				"abort",
				() => {
					debugScope(
						"[race] aborted, %d/%d tasks settled",
						settledCount,
						totalTasks,
					);
					resolve([s.signal.reason, undefined]);
				},
				{ once: true },
			);
		});

		// Spawn all tasks with tracking
		const tasks = factories.map((factory, idx) =>
			s
				.task(async ({ signal }) => {
					const result = await factory(signal);
					settledCount++;
					if (winnerIndex === -1) {
						winnerIndex = idx;
						debugScope(
							"[race] winner! task %d/%d won the race",
							idx + 1,
							totalTasks,
						);
					} else {
						debugScope(
							"[race] task %d/%d settled (loser)",
							idx + 1,
							totalTasks,
						);
					}
					return result;
				})
				.then(([err, result]): Result<unknown, T> => {
					if (err) return [err, undefined];
					return [undefined, result as T];
				}),
		);

		// Race all tasks against abort
		const result = await Promise.race([...tasks, abortPromise]);
		debugScope(
			"[race] race complete, winner was task %d/%d",
			winnerIndex + 1,
			totalTasks,
		);
		return result;
	} finally {
		// Clean up scope - cancels all tasks
		await s[Symbol.asyncDispose]();
	}
}

/**
 * Run multiple tasks in parallel with optional concurrency limit.
 * All tasks run within a scope and are cancelled together on failure.
 * Returns an array of Result tuples - never throws by default.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional configuration including concurrency limit and failFast
 * @returns A Promise that resolves to an array of Result tuples (or throws if failFast is true)
 *
 * @example
 * ```typescript
 * const results = await parallel(
 *   urls.map(url => ({ signal }) => fetch(url, { signal })),
 *   { concurrency: 3 }
 * )
 * // results is [[undefined, Response], [Error, undefined], ...]
 * ```
 */
export async function parallel<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: {
		concurrency?: number;
		signal?: AbortSignal;
		failFast?: boolean;
		tracer?: Tracer;
	},
): Promise<Result<unknown, T>[]> {
	if (factories.length === 0) {
		debugScope("[parallel] no factories, returning empty array");
		return [];
	}

	const concurrency = options?.concurrency ?? 0;
	const failFast = options?.failFast ?? false;
	const totalTasks = factories.length;

	debugScope(
		"[parallel] starting parallel execution (tasks: %d, concurrency: %d, failFast: %s)",
		totalTasks,
		concurrency > 0 ? concurrency : "unlimited",
		failFast,
	);

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		debugScope("[parallel] already aborted");
		return factories.map(() => [options.signal?.reason, undefined]);
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let completedCount = 0;
	let errorCount = 0;

	try {
		// Helper to process a single task - always returns Result
		const processTask = async (
			factory: (signal: AbortSignal) => Promise<T>,
			_idx: number,
		): Promise<Result<unknown, T>> => {
			const result = await s.task(({ signal }) => factory(signal));
			if (result[0]) {
				errorCount++;
				debugScope(
					"[parallel] task %d/%d failed (failFast: %s)",
					errorCount,
					totalTasks,
					failFast,
				);
			} else {
				completedCount++;
				debugScope(
					"[parallel] task %d/%d completed",
					completedCount,
					totalTasks,
				);
			}
			return result;
		};

		// If no concurrency limit, run all in parallel
		if (concurrency <= 0 || concurrency >= factories.length) {
			debugScope("[parallel] running all tasks in parallel");
			const results = await Promise.all(
				factories.map((f, i) => processTask(f, i)),
			);

			// Check for errors if failFast
			if (failFast) {
				const firstError = results.find((r) => r[0]);
				if (firstError?.[0]) {
					throw firstError[0];
				}
			}

			return results;
		}

		// Run with limited concurrency using a worker pool
		debugScope("[parallel] running with concurrency limit: %d", concurrency);
		const results: Result<unknown, T>[] = new Array(factories.length);
		let index = 0;
		let hasError = false;

		const worker = async (workerId: number): Promise<void> => {
			debugScope("[parallel] worker %d started", workerId);
			let tasksProcessed = 0;
			while (index < factories.length) {
				// Check if we should stop due to error in failFast mode
				if (failFast && hasError) {
					debugScope("[parallel] worker %d stopping due to error", workerId);
					break;
				}

				const currentIndex = index++;
				const factory = factories[currentIndex];
				if (!factory) continue;

				debugScope(
					"[parallel] worker %d processing task %d",
					workerId,
					currentIndex,
				);

				const result = await processTask(factory, currentIndex);
				results[currentIndex] = result;
				if (result[0]) {
					hasError = true;
					if (failFast) {
						debugScope("[parallel] worker %d aborting due to error", workerId);
						break;
					}
				}
				tasksProcessed++;
			}
			debugScope(
				"[parallel] worker %d finished, processed %d tasks",
				workerId,
				tasksProcessed,
			);
		};

		const workers: Promise<void>[] = [];
		const workerCount = Math.min(concurrency, factories.length);
		for (let i = 0; i < workerCount; i++) {
			workers.push(worker(i));
		}

		await Promise.all(workers);

		// Check for errors if failFast
		if (failFast && hasError) {
			const firstError = results.find((r) => r[0]);
			if (firstError?.[0]) {
				throw firstError[0];
			}
		}

		debugScope(
			"[parallel] all tasks completed: %d/%d, errors: %d",
			completedCount,
			totalTasks,
			errorCount,
		);
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

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Options for configuring a circuit breaker in a scope.
 * Pass these to `scope({ circuitBreaker: {...} })` to enable circuit breaking
 * for all tasks spawned within that scope.
 */
export interface CircuitBreakerOptions {
	/** Number of failures before opening the circuit. Default: 5 */
	failureThreshold?: number;
	/** Time in ms before attempting to close. Default: 30000 */
	resetTimeout?: number;
}

/**
 * Internal Circuit Breaker implementation.
 * Created automatically when `circuitBreaker` options are passed to `scope()`.
 * Not exposed directly - use `scope({ circuitBreaker: {...} })` instead.
 */
class CircuitBreaker implements AsyncDisposable {
	private state: CircuitState = "closed";
	private failures = 0;
	private lastFailureTime?: number;
	private readonly _failureThreshold: number;
	private readonly _resetTimeout: number;

	constructor(
		options: CircuitBreakerOptions = {},
		private parentSignal?: AbortSignal,
	) {
		this._failureThreshold = options.failureThreshold ?? 5;
		this._resetTimeout = options.resetTimeout ?? 30000;
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
				Date.now() - this.lastFailureTime >= this._resetTimeout
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
				Date.now() - this.lastFailureTime >= this._resetTimeout
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
	 * Get the failure threshold.
	 */
	get failureThreshold(): number {
		return this._failureThreshold;
	}

	/**
	 * Get the reset timeout in milliseconds.
	 */
	get resetTimeout(): number {
		return this._resetTimeout;
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

		if (this.failures >= this._failureThreshold) {
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
 * Controller for a polling operation.
 * Allows starting, stopping, and checking status.
 */
export interface PollController {
	/** Start or resume polling */
	start(): void;
	/** Stop polling */
	stop(): void;
	/** Get current polling status */
	status(): {
		/** Whether polling is currently running */
		running: boolean;
		/** Number of polls executed */
		pollCount: number;
		/** Time in ms until next poll (0 if running immediately) */
		timeUntilNext: number;
		/** Timestamp of last poll execution */
		lastPollTime?: number;
		/** Timestamp of next scheduled poll */
		nextPollTime?: number;
	};
}

/**
 * Poll a function at regular intervals with structured concurrency.
 * Automatically stops when the scope is disposed.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const controller = s.poll(async ({ signal }) => {
 *   const config = await fetchConfig({ signal })
 *   updateConfig(config)
 * }, { interval: 30000 })
 *
 * // Polls every 30 seconds until scope exits
 *
 * // Check status
 * console.log(controller.status())
 *
 * // Stop polling
 * controller.stop()
 *
 * // Restart polling
 * controller.start()
 * ```
 */
function createPoll<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	onValue: (value: T) => void | Promise<void>,
	options: PollOptions = {},
): PollController {
	const interval = options.interval ?? 5000;
	const immediate = options.immediate ?? true;

	debugScope(
		"[poll] creating poll controller (interval: %dms, immediate: %s)",
		interval,
		immediate,
	);

	// Check if already aborted
	if (options.signal?.aborted) {
		debugScope("[poll] already aborted, throwing");
		throw options.signal.reason;
	}

	let pollCount = 0;
	let lastPollTime: number | undefined;
	let nextPollTime: number | undefined;
	let running = false;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const s = new Scope({ signal: options.signal });

	const executePoll = async () => {
		if (!running || s.signal.aborted) return;

		pollCount++;
		lastPollTime = performance.now();
		nextPollTime = lastPollTime + interval;
		debugScope("[poll] executing poll #%d", pollCount);

		try {
			const startTime = performance.now();
			const [err, value] = await s.task(({ signal }) => fn(signal));
			const duration = performance.now() - startTime;
			if (err) {
				debugScope(
					"[poll] poll #%d failed: %s",
					pollCount,
					err instanceof Error ? err.message : String(err),
				);
				// Continue polling even on error
			} else {
				debugScope(
					"[poll] poll #%d succeeded in %dms",
					pollCount,
					Math.round(duration),
				);
				await onValue(value as T);
			}
		} catch (error) {
			debugScope(
				"[poll] poll #%d failed: %s",
				pollCount,
				error instanceof Error ? error.message : String(error),
			);
			// Continue polling even on error
		}

		// Schedule next poll if still running
		if (running && !s.signal.aborted) {
			timeoutId = setTimeout(executePoll, interval);
		}
	};

	const start = () => {
		if (running) {
			debugScope("[poll] already running, ignoring start()");
			return;
		}
		if (s.signal.aborted) {
			debugScope("[poll] cannot start, already aborted");
			return;
		}
		running = true;
		debugScope("[poll] starting poll");

		if (immediate) {
			// Execute immediately
			void executePoll();
		} else {
			// Schedule first execution
			nextPollTime = performance.now() + interval;
			timeoutId = setTimeout(executePoll, interval);
		}
	};

	const stop = () => {
		if (!running) {
			debugScope("[poll] not running, ignoring stop()");
			return;
		}
		running = false;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		nextPollTime = undefined;
		debugScope("[poll] stopped poll, total executions: %d", pollCount);
	};

	const status = () => {
		const now = performance.now();
		let timeUntilNext = 0;

		if (running && nextPollTime) {
			timeUntilNext = Math.max(0, nextPollTime - now);
		} else if (running && !immediate && pollCount === 0) {
			// Hasn't started yet and not immediate
			timeUntilNext = interval;
		}

		return {
			running,
			pollCount,
			timeUntilNext,
			lastPollTime,
			nextPollTime,
		};
	};

	// Clean up when signal is aborted
	options.signal?.addEventListener(
		"abort",
		() => {
			debugScope("[poll] abort signal received, stopping");
			stop();
			s[Symbol.asyncDispose]().catch(() => {});
		},
		{ once: true },
	);

	// Auto-start if immediate
	if (immediate) {
		start();
	}

	return {
		start,
		stop,
		status,
	};
}

/**
 * Poll a function at regular intervals with structured concurrency.
 * Automatically starts polling and returns a controller.
 *
 * @deprecated Use `createPoll()` or `scope().poll()` for better control
 */
export function poll<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	onValue: (value: T) => void | Promise<void>,
	options: PollOptions = {},
): PollController {
	const controller = createPoll(fn, onValue, options);
	// Auto-start if immediate (createPoll already handles this)
	// If not immediate, user needs to call start()
	return controller;
}
