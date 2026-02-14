/**
 * Scope class for go-go-scope - Structured concurrency
 */

import { context as otelContext, trace } from "@opentelemetry/api";
import createDebug from "debug";
import { Channel } from "./channel.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { Semaphore } from "./semaphore.js";
import { Task } from "./task.js";
import type {
	CircuitBreakerOptions,
	Failure,
	PollController,
	PollOptions,
	Result,
	ScopeHooks,
	ScopeMetrics,
	Success,
	TaskOptions,
	Tracer,
} from "./types.js";
import { SpanStatusCode as SpanStatusCodeEnum } from "./types.js";

const debugScope = createDebug("go-go-scope:scope");
const debugTask = createDebug("go-go-scope:task");

let scopeIdCounter = 0;

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
	/**
	 * Optional lifecycle hooks for scope events.
	 */
	hooks?: ScopeHooks;
	/**
	 * Enable metrics collection (default: false)
	 */
	metrics?: boolean;
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
export class Scope<
	Services extends Record<string, unknown> = Record<string, never>,
> implements AsyncDisposable
{
	private readonly abortController: AbortController;
	private readonly disposables: (Disposable | AsyncDisposable)[] = [];
	private readonly timeoutId: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private readonly _tracer?: Tracer;
	private readonly span?: import("@opentelemetry/api").Span;
	private readonly context?: import("@opentelemetry/api").Context;
	private taskCount = 0;
	private spanHasError = false;
	private readonly activeTasks = new Set<Task<unknown>>();
	private readonly startTime: number;
	private readonly id: number;
	private readonly name: string;
	private readonly concurrencySemaphore?: Semaphore;
	private readonly scopeCircuitBreaker?: CircuitBreaker;
	private services: Services = {} as Services;
	private readonly hooks?: ScopeHooks;
	private readonly enableMetrics: boolean;
	private metricsData: {
		tasksSpawned: number;
		tasksCompleted: number;
		tasksFailed: number;
		totalTaskDuration: number;
		durations: number[];
		resourcesRegistered: number;
		resourcesDisposed: number;
		scopeEndTime?: number;
	};

	constructor(options?: ScopeOptions<Record<string, unknown>>) {
		this.id = ++scopeIdCounter;
		this.name = options?.name ?? `scope-${this.id}`;
		this.hooks = options?.hooks;
		this.enableMetrics = options?.metrics ?? false;
		this.metricsData = {
			tasksSpawned: 0,
			tasksCompleted: 0,
			tasksFailed: 0,
			totalTaskDuration: 0,
			durations: [],
			resourcesRegistered: 0,
			resourcesDisposed: 0,
		};

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

		if (debugScope.enabled) {
			debugScope(
				"[%s] creating scope (timeout: %d, parent signal: %s, concurrency: %s, circuitBreaker: %s, parent: %s)",
				this.name,
				options?.timeout ?? 0,
				parentSignal ? "yes" : "no",
				concurrency ?? "unlimited",
				circuitBreaker ? "yes" : "no",
				parent ? "yes" : "no",
			);
		}
		this.abortController = new AbortController();
		this._tracer = tracer;
		this.startTime = performance.now();

		// Create concurrency semaphore if specified
		if (concurrency !== undefined && concurrency > 0) {
			this.concurrencySemaphore = new Semaphore(
				concurrency,
				this.abortController.signal,
			);
			if (debugScope.enabled) {
				debugScope(
					"[%s] created concurrency semaphore with %d permits",
					this.name,
					concurrency,
				);
			}
		}

		// Create circuit breaker if specified
		if (circuitBreaker) {
			this.scopeCircuitBreaker = new CircuitBreaker(
				circuitBreaker,
				this.abortController.signal,
			);
			if (debugScope.enabled) {
				debugScope(
					"[%s] created circuit breaker (failureThreshold: %d)",
					this.name,
					circuitBreaker.failureThreshold ?? 5,
				);
			}
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
				if (debugScope.enabled) {
					debugScope(
						"[%s] aborting due to parent signal: %s",
						this.name,
						reason,
					);
				}
				this.span?.recordException(
					reason instanceof Error ? reason : new Error(String(reason)),
				);
				this.span?.setStatus({
					code: SpanStatusCodeEnum.ERROR,
					message: "aborted by parent",
				});
				this.spanHasError = true;
				this.abortController.abort(reason);
			};
			if (parentSignal.aborted) {
				if (debugScope.enabled) {
					debugScope("[%s] parent already aborted", this.name);
				}
				this.abortController.abort(parentSignal.reason);
			} else {
				parentSignal.addEventListener("abort", parentHandler, { once: true });
			}
		}

		// Set up timeout if provided
		if (options?.timeout !== undefined && options.timeout > 0) {
			this.timeoutId = setTimeout(() => {
				const error = new Error(`timeout after ${options.timeout}ms`);
				if (debugScope.enabled) {
					debugScope("[%s] timeout after %dms", this.name, options.timeout);
				}
				this.span?.recordException(error);
				this.span?.setStatus({
					code: SpanStatusCodeEnum.ERROR,
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
	get otelSpan(): import("@opentelemetry/api").Span | undefined {
		return this.span;
	}

	/**
	 * Get the OpenTelemetry context for this scope.
	 * @internal Used for creating child spans with proper parent-child relationships
	 */
	get otelContext(): import("@opentelemetry/api").Context | undefined {
		return this.context;
	}

	/**
	 * Get current metrics for this scope.
	 * Only available if metrics were enabled in scope options.
	 * @returns Current metrics or undefined if metrics not enabled
	 */
	metrics(): ScopeMetrics | undefined {
		if (!this.enableMetrics) return undefined;

		const durations = this.metricsData.durations;
		const avgDuration =
			this.metricsData.tasksCompleted > 0
				? this.metricsData.totalTaskDuration / this.metricsData.tasksCompleted
				: 0;

		// Calculate p95 (approximation using sorted array)
		let p95 = 0;
		if (durations.length > 0) {
			const sorted = [...durations].sort((a, b) => a - b);
			const p95Index = Math.floor(sorted.length * 0.95);
			p95 = sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;
		}

		return {
			tasksSpawned: this.metricsData.tasksSpawned,
			tasksCompleted: this.metricsData.tasksCompleted,
			tasksFailed: this.metricsData.tasksFailed,
			totalTaskDuration: this.metricsData.totalTaskDuration,
			avgTaskDuration: avgDuration,
			p95TaskDuration: p95,
			resourcesRegistered: this.metricsData.resourcesRegistered,
			resourcesDisposed: this.metricsData.resourcesDisposed,
			scopeDuration: this.metricsData.scopeEndTime
				? this.metricsData.scopeEndTime - this.startTime
				: undefined,
		};
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

		// Update metrics
		if (this.enableMetrics) {
			this.metricsData.tasksSpawned++;
		}

		// Call beforeTask hook
		this.hooks?.beforeTask?.(taskName, taskIndex);

		// Pre-compute commonly used values to avoid repeated lookups
		const parentSignal = this.abortController.signal;

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
							error.message === "Circuit breaker is open"
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
			if (hasRetry && options?.retry) {
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
			if (hasTaskDebug) {
				debugTask("[%s] starting execution", taskName);
			}
			const startTime = performance.now();
			try {
				const result = await executeFn(signal);
				const duration = performance.now() - startTime;
				if (hasTaskDebug) {
					debugTask("[%s] completed successfully in %dms", taskName, duration);
				}
				taskSpan?.setAttributes?.({
					"task.duration_ms": Math.round(duration),
					"task.retry_attempts": retryAttempt,
				});
				return result;
			} catch (error) {
				const duration = performance.now() - startTime;
				if (hasTaskDebug) {
					debugTask("[%s] failed after %dms: %s", taskName, duration, error);
				}

				// Determine error reason
				let errorReason = "exception";
				if (error instanceof Error) {
					if (error.message.startsWith("timeout after")) {
						errorReason = "timeout";
					} else if (error.message === "Circuit breaker is open") {
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
		}, parentSignal);

		// Track active task
		this.activeTasks.add(task as Task<unknown>);

		// Record span status on completion and remove from active tasks
		task.then(
			([err]) => {
				this.activeTasks.delete(task as Task<unknown>);
				taskSpan?.setStatus?.({ code: SpanStatusCodeEnum.OK });
				taskSpan?.end?.();

				// Update metrics and call hook
				const duration = performance.now() - this.startTime;
				if (this.enableMetrics) {
					if (err) {
						this.metricsData.tasksFailed++;
					} else {
						this.metricsData.tasksCompleted++;
						this.metricsData.totalTaskDuration += duration;
						this.metricsData.durations.push(duration);
					}
				}
				this.hooks?.afterTask?.(taskName, duration, err);
			},
			() => {
				this.activeTasks.delete(task as Task<unknown>);
				taskSpan?.setStatus?.({
					code: SpanStatusCodeEnum.ERROR,
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

		if (debugScope.enabled) {
			debugScope(
				"[%s] task #%d added to disposables (total: %d)",
				this.name,
				taskIndex,
				this.disposables.length,
			);
		}
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
			if (this.enableMetrics) {
				this.metricsData.resourcesRegistered++;
			}
		}

		if (debugScope.enabled) {
			debugScope(
				"[%s] provided service '%s' (total disposables: %d)",
				this.name,
				key,
				this.disposables.length,
			);
		}

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
	 * Register a disposable for cleanup when the scope is disposed.
	 * @internal Used by rate-limiting and other utilities
	 */
	registerDisposable(disposable: Disposable | AsyncDisposable): void {
		this.disposables.push(disposable);
	}

	/**
	 * Dispose the scope and all tracked resources.
	 * Resources are disposed in LIFO order (reverse of creation).
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) {
			if (debugScope.enabled) {
				debugScope("[%s] already disposed, skipping", this.name);
			}
			return;
		}

		if (debugScope.enabled) {
			debugScope(
				"[%s] disposing scope (tasks: %d, disposables: %d)",
				this.name,
				this.taskCount,
				this.disposables.length,
			);
		}
		this.disposed = true;

		// Clear timeout if set
		if (this.timeoutId !== undefined) {
			clearTimeout(this.timeoutId);
		}

		// Abort all tasks
		if (debugScope.enabled) {
			debugScope("[%s] aborting all tasks", this.name);
		}
		const abortReason = new Error("scope disposed");
		this.abortController.abort(abortReason);

		// Call onCancel hook
		this.hooks?.onCancel?.(abortReason);

		// Dispose all resources in reverse order (LIFO) - avoid array copy
		const errors: unknown[] = [];
		const disposables = this.disposables;
		const len = disposables.length;
		for (let i = len - 1; i >= 0; i--) {
			const disposable = disposables[i];
			if (!disposable) continue;
			const resourceIndex = len - i;
			try {
				if (debugScope.enabled) {
					debugScope(
						"[%s] disposing resource %d/%d",
						this.name,
						resourceIndex,
						len,
					);
				}
				if (Symbol.asyncDispose in disposable) {
					await disposable[Symbol.asyncDispose]();
				} else if (Symbol.dispose in disposable) {
					disposable[Symbol.dispose]();
				}
				if (this.enableMetrics) {
					this.metricsData.resourcesDisposed++;
				}
				this.hooks?.onDispose?.(resourceIndex);
			} catch (error) {
				if (debugScope.enabled) {
					debugScope(
						"[%s] error disposing resource %d: %s",
						this.name,
						resourceIndex,
						error,
					);
				}
				errors.push(error);
				this.hooks?.onDispose?.(resourceIndex, error);
			}
		}

		// Clear the disposables list
		const disposedCount = this.disposables.length;
		this.disposables.length = 0;
		if (debugScope.enabled) {
			debugScope("[%s] cleared %d disposables", this.name, disposedCount);
		}

		// Wait for all active tasks to settle before ending the span
		// This ensures the scope duration includes all task execution time
		const activeTaskCount = this.activeTasks.size;
		if (activeTaskCount > 0) {
			if (debugScope.enabled) {
				debugScope(
					"[%s] waiting for %d active tasks to settle",
					this.name,
					activeTaskCount,
				);
			}
			await Promise.allSettled(
				Array.from(this.activeTasks).map((t) =>
					Promise.resolve(t).catch(() => {}),
				),
			);
			this.activeTasks.clear();
			if (debugScope.enabled) {
				debugScope("[%s] all tasks settled", this.name);
			}
		}

		// End the scope span
		if (errors.length > 0) {
			const errorMessages = errors.map((e) =>
				e instanceof Error ? e.message : String(e),
			);
			this.span?.setStatus({
				code: SpanStatusCodeEnum.ERROR,
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
			this.span?.setStatus({ code: SpanStatusCodeEnum.OK });
		}

		// Calculate and record scope duration in milliseconds
		const duration = performance.now() - this.startTime;
		this.span?.setAttributes?.({ "scope.duration_ms": duration });

		// Record end time for metrics
		if (this.enableMetrics) {
			this.metricsData.scopeEndTime = performance.now();
		}

		this.span?.end();
		if (debugScope.enabled) {
			debugScope(
				"[%s] scope disposed (duration: %dms, errors: %d)",
				this.name,
				Math.round(duration),
				errors.length,
			);
		}

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
	async *stream<T>(source: AsyncIterable<T>): AsyncGenerator<T> {
		const iterator = source[Symbol.asyncIterator]();

		try {
			while (true) {
				// Check for abort before each iteration
				if (this.signal.aborted) {
					throw this.signal.reason;
				}

				const result = await iterator.next();

				if (this.signal.aborted) {
					throw this.signal.reason;
				}

				if (result.done) break;
				yield result.value;
			}
		} finally {
			// Ensure cleanup
			await iterator.return?.();
		}
	}

	/** Poll a function at regular intervals.
	 * Returns a controller to start, stop, and check status.
	 */
	poll<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		onValue: (value: T) => void | Promise<void>,
		options?: Omit<PollOptions, "signal">,
	): PollController {
		return this.createPoll(fn, onValue, { ...options, signal: this.signal });
	}

	/**
	 * Internal implementation of poll to avoid circular dependencies.
	 * @internal
	 */
	private createPoll<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		onValue: (value: T) => void | Promise<void>,
		options: PollOptions = {},
	): PollController {
		const interval = options.interval ?? 5000;
		const immediate = options.immediate ?? true;
		const debugEnabled = debugScope.enabled;

		if (debugEnabled) {
			debugScope(
				"[poll] creating poll controller (interval: %dms, immediate: %s)",
				interval,
				immediate,
			);
		}

		// Check if already aborted
		if (options.signal?.aborted) {
			if (debugEnabled) {
				debugScope("[poll] already aborted, throwing");
			}
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
			if (debugEnabled) {
				debugScope("[poll] executing poll #%d", pollCount);
			}

			try {
				const startTime = performance.now();
				const [err, value] = await s.task(({ signal }) => fn(signal));
				const duration = performance.now() - startTime;
				if (err) {
					if (debugEnabled) {
						debugScope(
							"[poll] poll #%d failed: %s",
							pollCount,
							err instanceof Error ? err.message : String(err),
						);
					}
					// Continue polling even on error
				} else {
					if (debugEnabled) {
						debugScope(
							"[poll] poll #%d succeeded in %dms",
							pollCount,
							Math.round(duration),
						);
					}
					await onValue(value as T);
				}
			} catch (error) {
				if (debugEnabled) {
					debugScope(
						"[poll] poll #%d failed: %s",
						pollCount,
						error instanceof Error ? error.message : String(error),
					);
				}
				// Continue polling even on error
			}

			// Schedule next poll if still running
			if (running && !s.signal.aborted) {
				timeoutId = setTimeout(executePoll, interval);
			}
		};

		const start = () => {
			if (running) {
				if (debugEnabled) {
					debugScope("[poll] already running, ignoring start()");
				}
				return;
			}
			if (s.signal.aborted) {
				if (debugEnabled) {
					debugScope("[poll] cannot start, already aborted");
				}
				return;
			}
			running = true;
			if (debugEnabled) {
				debugScope("[poll] starting poll");
			}

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
				if (debugEnabled) {
					debugScope("[poll] not running, ignoring stop()");
				}
				return;
			}
			running = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			nextPollTime = undefined;
			if (debugEnabled) {
				debugScope("[poll] stopped poll, total executions: %d", pollCount);
			}
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
				if (debugEnabled) {
					debugScope("[poll] abort signal received, stopping");
				}
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
		const totalTasks = factories.length;

		if (totalTasks === 0) {
			return [new Error("Cannot race empty array of factories"), undefined];
		}

		if (debugScope.enabled) {
			debugScope("[race] starting race with %d competitors", totalTasks);
		}

		// Check if signal is already aborted
		if (this.signal.aborted) {
			if (debugScope.enabled) {
				debugScope("[race] already aborted");
			}
			return [this.signal.reason, undefined];
		}

		const s = new Scope({ signal: this.signal, tracer: this.tracer });
		let settledCount = 0;
		let winnerIndex = -1;

		try {
			// Create abort promise that returns error as Result
			const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
				s.signal.addEventListener(
					"abort",
					() => {
						if (debugScope.enabled) {
							debugScope(
								"[race] aborted, %d/%d tasks settled",
								settledCount,
								totalTasks,
							);
						}
						resolve([s.signal.reason, undefined]);
					},
					{ once: true },
				);
			});

			const debugEnabled = debugScope.enabled;
			// Spawn all tasks with tracking
			const tasks = factories.map((factory, idx) =>
				s
					.task(async ({ signal }) => {
						const result = await factory(signal);
						settledCount++;
						if (winnerIndex === -1) {
							winnerIndex = idx;
							if (debugEnabled) {
								debugScope(
									"[race] winner! task %d/%d won the race",
									idx + 1,
									totalTasks,
								);
							}
						} else if (debugEnabled) {
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
			if (debugEnabled) {
				debugScope(
					"[race] race complete, winner was task %d/%d",
					winnerIndex + 1,
					totalTasks,
				);
			}
			return result;
		} finally {
			// Clean up scope - cancels all tasks
			await s[Symbol.asyncDispose]();
		}
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
		if (factories.length === 0) {
			if (debugScope.enabled) {
				debugScope("[parallel] no factories, returning empty array");
			}
			return [];
		}

		const concurrency = this.concurrencySemaphore?.totalPermits ?? 0;
		const failFast = options?.failFast ?? false;
		const totalTasks = factories.length;
		const debugEnabled = debugScope.enabled;

		if (debugEnabled) {
			debugScope(
				"[parallel] starting parallel execution (tasks: %d, concurrency: %d, failFast: %s)",
				totalTasks,
				concurrency > 0 ? concurrency : "unlimited",
				failFast,
			);
		}

		// Check if signal is already aborted
		if (this.signal.aborted) {
			if (debugEnabled) {
				debugScope("[parallel] already aborted");
			}
			return factories.map(() => [this.signal.reason, undefined]);
		}

		const s = new Scope({ signal: this.signal, tracer: this.tracer });
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
					if (debugEnabled) {
						debugScope(
							"[parallel] task %d/%d failed (failFast: %s)",
							errorCount,
							totalTasks,
							failFast,
						);
					}
				} else {
					completedCount++;
					if (debugEnabled) {
						debugScope(
							"[parallel] task %d/%d completed",
							completedCount,
							totalTasks,
						);
					}
				}
				return result;
			};

			// If no concurrency limit, run all in parallel
			if (concurrency <= 0 || concurrency >= factories.length) {
				if (debugEnabled) {
					debugScope("[parallel] running all tasks in parallel");
				}
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
			if (debugEnabled) {
				debugScope(
					"[parallel] running with concurrency limit: %d",
					concurrency,
				);
			}
			const results: Result<unknown, T>[] = new Array(factories.length);
			let index = 0;
			let hasError = false;

			const worker = async (workerId: number): Promise<void> => {
				if (debugEnabled) {
					debugScope("[parallel] worker %d started", workerId);
				}
				let tasksProcessed = 0;
				while (index < factories.length) {
					// Check if we should stop due to error in failFast mode
					if (failFast && hasError) {
						if (debugEnabled) {
							debugScope(
								"[parallel] worker %d stopping due to error",
								workerId,
							);
						}
						break;
					}

					const currentIndex = index++;
					const factory = factories[currentIndex];
					if (!factory) continue;

					if (debugEnabled) {
						debugScope(
							"[parallel] worker %d processing task %d",
							workerId,
							currentIndex,
						);
					}

					const result = await processTask(factory, currentIndex);
					results[currentIndex] = result;
					if (result[0]) {
						hasError = true;
						if (failFast) {
							if (debugEnabled) {
								debugScope(
									"[parallel] worker %d aborting due to error",
									workerId,
								);
							}
							break;
						}
					}
					tasksProcessed++;
				}
				if (debugEnabled) {
					debugScope(
						"[parallel] worker %d finished, processed %d tasks",
						workerId,
						tasksProcessed,
					);
				}
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
	 * Create a debounced function that delays invoking the provided function
	 * until after `wait` milliseconds have elapsed since the last time it was invoked.
	 * Automatically cancelled when the scope is disposed.
	 *
	 * @param fn - The function to debounce
	 * @param options - Debounce options
	 * @returns A debounced function that returns a Promise
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const search = s.debounce(async (query: string) => {
	 *   return await fetchSearchResults(query)
	 * }, { wait: 300 })
	 *
	 * // Will only execute after 300ms of no calls
	 * const [err, results] = await search("hello")
	 * ```
	 */
	debounce<T, Args extends unknown[]>(
		fn: (...args: Args) => Promise<T>,
		options: import("./types.js").DebounceOptions = {},
	): (...args: Args) => Promise<Result<unknown, T>> {
		const wait = options.wait ?? 300;
		const leading = options.leading ?? false;
		const trailing = options.trailing ?? true;

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let lastArgs: Args | undefined;
		let lastCallTime: number | undefined;
		let resultPromise: Promise<Result<unknown, T>> | undefined;
		let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

		const invoke = async (args: Args): Promise<void> => {
			lastCallTime = performance.now();
			try {
				const result = await fn(...args);
				resolveFn?.([undefined, result]);
			} catch (error) {
				resolveFn?.([error, undefined]);
			}
		};

		const startTimer = (_args: Args): void => {
			timeoutId = setTimeout(() => {
				if (trailing && lastArgs) {
					void invoke(lastArgs);
				}
				timeoutId = undefined;
				lastArgs = undefined;
			}, wait);
		};

		// Clean up on scope disposal
		const cleanupDisposable: AsyncDisposable = {
			async [Symbol.asyncDispose]() {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (resolveFn) {
					resolveFn([new Error("Scope disposed"), undefined]);
				}
			},
		};
		this.disposables.push(cleanupDisposable);

		return (...args: Args): Promise<Result<unknown, T>> => {
			// Check if scope is disposed
			if (this.disposed || this.signal.aborted) {
				return Promise.resolve([new Error("Scope disposed"), undefined]);
			}

			lastArgs = args;
			const now = performance.now();

			// Create a new promise for this call
			resultPromise = new Promise<Result<unknown, T>>((resolve) => {
				resolveFn = resolve;
			});

			// Clear existing timeout
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			// Check for leading edge execution
			if (leading) {
				const isFirstCall = lastCallTime === undefined;
				const timeSinceLastCall = lastCallTime ? now - lastCallTime : wait + 1;

				if (isFirstCall || timeSinceLastCall >= wait) {
					if (timeoutId) clearTimeout(timeoutId);
					void invoke(args);
					startTimer(args);
					return resultPromise;
				}
			}

			// Schedule trailing execution
			startTimer(args);
			return resultPromise;
		};
	}

	/**
	 * Create a throttled function that only invokes the provided function
	 * at most once per every `interval` milliseconds.
	 * Automatically cancelled when the scope is disposed.
	 *
	 * @param fn - The function to throttle
	 * @param options - Throttle options
	 * @returns A throttled function that returns a Promise
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const save = s.throttle(async (data: string) => {
	 *   await saveToServer(data)
	 * }, { interval: 1000 })
	 *
	 * // Will execute at most once per second
	 * await save("data1")
	 * await save("data2") // Throttled, returns same promise
	 * ```
	 */
	throttle<T, Args extends unknown[]>(
		fn: (...args: Args) => Promise<T>,
		options: import("./types.js").ThrottleOptions = {},
	): (...args: Args) => Promise<Result<unknown, T>> {
		const interval = options.interval ?? 300;
		const leading = options.leading ?? true;
		const trailing = options.trailing ?? false;

		let lastInvokeTime = 0;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let lastArgs: Args | undefined;
		let pendingPromise: Promise<Result<unknown, T>> | undefined;
		let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

		const invoke = async (args: Args): Promise<void> => {
			lastInvokeTime = performance.now();
			pendingPromise = undefined;
			try {
				const result = await fn(...args);
				resolveFn?.([undefined, result]);
			} catch (error) {
				resolveFn?.([error, undefined]);
			}
		};

		// Clean up on scope disposal
		const cleanupDisposable: AsyncDisposable = {
			async [Symbol.asyncDispose]() {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (resolveFn) {
					resolveFn([new Error("Scope disposed"), undefined]);
				}
			},
		};
		this.disposables.push(cleanupDisposable);

		return (...args: Args): Promise<Result<unknown, T>> => {
			// Check if scope is disposed
			if (this.disposed || this.signal.aborted) {
				return Promise.resolve([new Error("Scope disposed"), undefined]);
			}

			const now = performance.now();
			const timeSinceLastInvoke = now - lastInvokeTime;

			lastArgs = args;

			// Return existing promise if we're still throttled
			if (timeSinceLastInvoke < interval) {
				// Schedule trailing execution if needed
				if (trailing && !timeoutId) {
					pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
						resolveFn = resolve;
					});
					timeoutId = setTimeout(() => {
						if (lastArgs) void invoke(lastArgs);
						timeoutId = undefined;
					}, interval - timeSinceLastInvoke);
				}
				return pendingPromise ?? Promise.resolve([undefined, undefined as T]);
			}

			// Clear any pending timeout
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}

			// Execute immediately if leading edge is enabled
			if (leading) {
				pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
					resolveFn = resolve;
				});
				void invoke(args);
				return pendingPromise;
			}

			// Schedule for trailing execution
			if (trailing) {
				pendingPromise = new Promise<Result<unknown, T>>((resolve) => {
					resolveFn = resolve;
				});
				timeoutId = setTimeout(() => {
					if (lastArgs) void invoke(lastArgs);
					timeoutId = undefined;
				}, interval);
				return pendingPromise;
			}

			return Promise.resolve([undefined, undefined as T]);
		};
	}

	/**
	 * Select waits on multiple channel operations.
	 * Similar to Go's select statement, it blocks until one of the cases can run,
	 * then executes that case. It chooses one at random if multiple are ready.
	 *
	 * @param cases - Map of channels to handler functions. Use a Map for proper channel keys.
	 * @returns A promise that resolves to the result of the selected case
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 * const ch1 = s.channel<string>()
	 * const ch2 = s.channel<number>()
	 *
	 * const cases = new Map([
	 *   [ch1, async (value: string) => ({ type: 'string' as const, value })],
	 *   [ch2, async (value: number) => ({ type: 'number' as const, value })],
	 * ])
	 * const [err, result] = await s.select(cases)
	 * ```
	 */
	async select<T>(
		cases: Map<Channel<unknown>, (value: unknown) => Promise<T> | T>,
	): Promise<Result<unknown, T>> {
		if (cases.size === 0) {
			return [new Error("select called with no cases"), undefined];
		}

		// Convert cases to array for easier processing
		const channelEntries = Array.from(cases.entries());
		let closedCount = 0;

		// Create a race between all channel receives with index tracking
		const createRacePromise = (
			channel: Channel<unknown>,
			idx: number,
		): Promise<{ idx: number; value: unknown } | { closed: true }> =>
			new Promise((resolve, reject) => {
				channel
					.receive()
					.then((value) => {
						if (value !== undefined) {
							resolve({ idx, value });
						} else {
							// Channel closed
							resolve({ closed: true });
						}
					})
					.catch(reject);
			});

		try {
			// Keep racing until we get a value or all channels are closed
			while (true) {
				const result = await Promise.race(
					channelEntries.map(([channel], idx) =>
						createRacePromise(channel, idx),
					),
				);

				if ("closed" in result) {
					closedCount++;
					if (closedCount >= channelEntries.length) {
						return [new Error("All channels closed"), undefined];
					}
					// Some channels still open, continue racing
					continue;
				}

				// We have a winner with a value
				const winner = result;

				// Execute the handler for the winning case
				const entry = channelEntries[winner.idx];
				if (!entry) {
					return [new Error("Invalid channel selection"), undefined];
				}
				const [, handler] = entry;
				if (!handler) {
					return [new Error("Invalid channel handler"), undefined];
				}

				try {
					const handlerResult = await handler(winner.value);
					return [undefined, handlerResult];
				} catch (error) {
					return [error, undefined];
				}
			}
		} catch (error) {
			return [error, undefined];
		}
	}
}
