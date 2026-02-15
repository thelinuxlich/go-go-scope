/**
 * Scope class for go-go-scope - Structured concurrency
 */

import { context as otelContext, trace } from "@opentelemetry/api";
import createDebug from "debug";

import { BroadcastChannel } from "./broadcast-channel.js";
import { Channel } from "./channel.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { DeadlockDetector } from "./deadlock-detector.js";
import { createLogger } from "./logger.js";
import { Profiler } from "./profiler.js";
import { ResourcePool } from "./resource-pool.js";
import { Semaphore } from "./semaphore.js";
import { Task } from "./task.js";
import type {
	CircuitBreakerOptions,
	Failure,
	Logger,
	ParallelAggregateResult,
	PollController,
	PollOptions,
	ResourcePoolOptions,
	Result,
	ScopeHooks,
	ScopeMetrics,
	SelectOptions,
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
	/**
	 * Optional logger for structured logging.
	 */
	logger?: import("./types.js").Logger;
	/**
	 * Minimum log level for console logging (if no custom logger provided).
	 */
	logLevel?: "debug" | "info" | "warn" | "error";
	/**
	 * Enable deadlock detection with specified timeout.
	 */
	deadlockDetection?: import("./types.js").DeadlockDetectionOptions;
	/**
	 * Enable task profiling.
	 */
	profiler?: boolean;
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
	private readonly logger: Logger;
	private readonly deadlockDetector?: DeadlockDetector;
	private readonly profiler: Profiler;
	private childScopes: Scope<Record<string, unknown>>[] = [];
	private readonly parent?: Scope<Record<string, unknown>>;

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

		// Initialize logger
		this.logger = createLogger(this.name, options?.logger, options?.logLevel);

		// Initialize deadlock detector if enabled
		if (options?.deadlockDetection) {
			this.deadlockDetector = new DeadlockDetector(
				options.deadlockDetection,
				this.name,
				this,
			);
		}

		// Initialize profiler
		this.profiler = new Profiler(options?.profiler ?? false, this);

		// Inherit from parent scope if provided
		const parent = options?.parent;
		this.parent = parent;
		const parentSignal = parent?.signal ?? options?.signal;
		const parentServices = parent?.services;
		if (parentServices) {
			this.services = { ...parentServices } as Services;
		}

		// Register as child scope if parent exists
		if (parent) {
			parent.registerChild(this);
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
				const error = new Error(
					`Scope '${this.name}' timeout after ${options.timeout}ms`,
				);
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
	 * When `errorClass` is provided in options, errors will be wrapped in that class,
	 * enabling automatic union inference when combined with go-go-try's success/failure helpers.
	 *
	 * @param fn - Function that receives { services, signal } and returns a Promise
	 * @param options - Optional task configuration for tracing and execution
	 * @returns A disposable Task that resolves to a Result
	 */
	task<T, E extends Error = Error>(
		fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>,
		options?: TaskOptions<E>,
	): Task<Result<E, T>> {
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
			// Start profiling
			this.profiler.startTask(taskIndex, taskName);

			// Log task start
			this.logger.debug('Spawning task #%d "%s"', taskIndex, taskName);
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
							reject(
								new Error(
									`Task '${taskName}' in scope '${this.name}' timeout after ${timeoutMs}ms`,
								),
							);
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

		// Get error class from options for typed error handling
		const errorClass = options?.errorClass;

		// Create the task with the full pipeline
		const task = new Task<Result<E, T>>(async (signal) => {
			try {
				const result = await wrappedFn(signal);
				return [undefined, result] as Success<T>;
			} catch (error) {
				// Wrap error in typed error class if provided
				if (errorClass) {
					const wrappedError = new errorClass(
						error instanceof Error ? error.message : String(error),
						{ cause: error },
					);
					return [wrappedError as E, undefined] as Failure<E>;
				}
				return [error as E, undefined] as Failure<E>;
			}
		}, parentSignal);

		// Track active task
		this.activeTasks.add(task as Task<unknown>);

		// Record span status on completion and remove from active tasks
		task.then(
			([err]) => {
				// End profiling
				this.profiler.endTask(taskIndex, !err);
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
	 * @param key - Unique key for the service (string or symbol)
	 * @param factory - Function to create the service, receives current services
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
	 *
	 * @example
	 * ```typescript
	 * // Using symbols for better encapsulation
	 * const DatabaseKey = Symbol('Database')
	 *
	 * await using s = scope()
	 *   .provide(DatabaseKey, () => openDatabase())
	 *
	 * const db = s.use(DatabaseKey)
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Factory can access previously defined services
	 * await using s = scope()
	 *   .provide('config', () => ({ dbUrl: 'postgres://localhost' }))
	 *   .provide('db', ({ services }) => {
	 *     // Access previously defined services
	 *     return createDatabase(services.config.dbUrl)
	 *   })
	 * ```
	 */
	provide<K extends string | symbol, T>(
		key: K,
		factory: (ctx: { services: Services }) => T,
		cleanup?: (service: T) => void | Promise<void>,
	): Scope<Services & Record<K, T>> {
		if (this.disposed) {
			throw new Error("Cannot provide service on disposed scope");
		}

		const service = factory({ services: this.services });

		// Store service
		(this.services as Record<string | symbol, unknown>)[key] = service;

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
	 * Override an existing service with a new implementation.
	 * Useful for testing - allows replacing real services with mocks/fakes.
	 *
	 * The old service's cleanup function (if any) will NOT be called immediately;
	 * it will be cleaned up when the scope is disposed along with the new service's cleanup.
	 *
	 * @param key - Key of an existing service to override (string or symbol)
	 * @param factory - Function to create the replacement service
	 * @param cleanup - Optional cleanup function for the new service
	 * @returns The scope (for chaining)
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *   .provide('db', () => realDatabase())
	 *   .override('db', () => mockDatabase())  // Replace with mock for testing
	 *
	 * // s.use('db') now returns the mock
	 * ```
	 */
	override<K extends keyof Services, T extends Services[K]>(
		key: K,
		factory: (ctx: { services: Services }) => T,
		cleanup?: (service: T) => void | Promise<void>,
	): Scope<Services> {
		if (this.disposed) {
			throw new Error("Cannot override service on disposed scope");
		}

		// Check if service exists
		if (!(key in this.services)) {
			throw new Error(
				`Cannot override service '${String(key)}': it was not provided`,
			);
		}

		const service = factory({ services: this.services });

		// Store service (replaces existing)
		(this.services as Record<string | symbol, unknown>)[
			key as string | symbol
		] = service;

		// Register cleanup if provided
		if (cleanup) {
			const cleanupDisposable: AsyncDisposable = {
				async [Symbol.asyncDispose]() {
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
				"[%s] overridden service '%s' (total disposables: %d)",
				this.name,
				String(key),
				this.disposables.length,
			);
		}

		return this;
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
	 * Check if a service is registered.
	 *
	 * @param key - The service key
	 * @returns True if the service exists
	 */
	has<K extends keyof Services>(key: K): boolean {
		if (this.disposed) {
			return false;
		}
		return key in this.services;
	}

	/**
	 * Register a disposable for cleanup when the scope is disposed.
	 * @internal Used by rate-limiting and other utilities
	 */
	registerDisposable(disposable: Disposable | AsyncDisposable): void {
		this.disposables.push(disposable);
	}

	/**
	 * Register a callback to run when the scope is disposed.
	 * Useful for registering cleanup handlers without creating a Task.
	 * @param callback - Function to call on scope disposal (can be async)
	 * @example
	 * ```typescript
	 * await using s = scope();
	 *
	 * const ws = new WebSocket('ws://localhost:8080');
	 * s.onDispose(() => ws.close());
	 * ```
	 */
	onDispose(callback: () => void | Promise<void>): void {
		this.registerDisposable({
			[Symbol.dispose]: () => {
				void callback();
			},
			[Symbol.asyncDispose]: async () => {
				await callback();
			},
		});
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

		// Dispose deadlock detector
		this.deadlockDetector?.dispose();

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
			[Symbol.dispose]: stop,
		};
	}

	/**
	 * Race multiple tasks - the first to settle wins, others are cancelled.
	 * Tasks run within this scope and inherit its configuration.
	 * Returns a Result tuple [error, value] - never throws.
	 *
	 * @param factories - Array of factory functions that create promises
	 * @param options - Optional race configuration
	 * @returns A Promise that resolves to a Result tuple of the first settled task
	 *
	 * @example
	 * ```typescript
	 * // Basic race - first to settle wins
	 * const [err, winner] = await s.race([
	 *   () => fetch('https://a.com'),
	 *   () => fetch('https://b.com'),
	 * ])
	 *
	 * // Race with timeout
	 * const [err, winner] = await s.race([
	 *   () => fetch('https://slow.com'),
	 *   () => fetch('https://fast.com'),
	 * ], { timeout: 5000 })
	 *
	 * // Race for first success only
	 * const [err, winner] = await s.race([
	 *   () => fetchWithRetry('https://a.com'),
	 *   () => fetchWithRetry('https://b.com'),
	 * ], { requireSuccess: true })
	 * ```
	 */
	async race<T>(
		factories: readonly ((signal: AbortSignal) => Promise<T>)[],
		options?: {
			/** Only count successful results as winners */
			requireSuccess?: boolean;
			/** Timeout in milliseconds */
			timeout?: number;
			/** Maximum concurrent tasks (default: unlimited) */
			concurrency?: number;
		},
	): Promise<Result<unknown, T>> {
		const totalTasks = factories.length;
		const requireSuccess = options?.requireSuccess ?? false;
		const timeout = options?.timeout;
		const concurrency = options?.concurrency ?? 0;

		if (totalTasks === 0) {
			return [new Error("Cannot race empty array of factories"), undefined];
		}

		if (debugScope.enabled) {
			debugScope(
				"[race] starting race with %d competitors (requireSuccess: %s, timeout: %s, concurrency: %s)",
				totalTasks,
				requireSuccess,
				timeout ?? "none",
				concurrency > 0 ? concurrency : "unlimited",
			);
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
		let successCount = 0;
		let winnerIndex = -1;
		const errors: { index: number; error: unknown }[] = [];

		// Helper to create aggregate error
		const createAggregateError = (errs: unknown[]): Error => {
			if (typeof AggregateError !== "undefined") {
				return new AggregateError(errs, "All race competitors failed");
			}
			return new Error(`All race competitors failed (${errs.length} errors)`);
		};

		// Type guard for Result tuple
		const isResultTuple = (value: unknown): value is Result<unknown, T> => {
			return Array.isArray(value) && value.length === 2;
		};

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

			// Create timeout promise if timeout is specified
			const timeoutPromise = timeout
				? new Promise<never>((_, reject) => {
						setTimeout(() => {
							if (debugScope.enabled) {
								debugScope("[race] timeout after %dms", timeout);
							}
							reject(new Error(`Race timeout after ${timeout}ms`));
						}, timeout);
					})
				: null;

			const debugEnabled = debugScope.enabled;

			// Helper to process a single task
			const processTask = async (
				factory: (signal: AbortSignal) => Promise<T>,
				idx: number,
			): Promise<{ idx: number; result: Result<unknown, T> }> => {
				const result = await s.task(async ({ signal }) => {
					const r = await factory(signal);
					settledCount++;
					return r;
				});
				const [err, value] = result;

				if (err) {
					errors.push({ index: idx, error: err });
					if (debugEnabled) {
						debugScope("[race] task %d/%d failed", idx + 1, totalTasks);
					}
					return { idx, result: [err, undefined] };
				}

				// Success case
				successCount++;
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
					debugScope("[race] task %d/%d settled (loser)", idx + 1, totalTasks);
				}

				return { idx, result: [undefined, value as T] };
			};

			// If no concurrency limit, run all tasks at once
			if (concurrency <= 0 || concurrency >= totalTasks) {
				// Spawn all tasks with tracking
				const tasks = factories.map((factory, idx) =>
					processTask(factory, idx),
				);

				// Race all tasks with optional timeout
				const racePromise = timeoutPromise
					? Promise.race([Promise.race(tasks), timeoutPromise])
					: Promise.race([...tasks, abortPromise]);

				const winner = await racePromise;

				if (debugEnabled) {
					if (isResultTuple(winner)) {
						debugScope("[race] ended with error: %s", winner[0]);
					} else {
						debugScope(
							"[race] race complete, winner was task %d/%d",
							winner.idx + 1,
							totalTasks,
						);
					}
				}

				// If it's a direct Result (from abort/timeout), return it
				if (isResultTuple(winner)) {
					return winner;
				}

				// If requireSuccess and the winner is an error, we need to keep racing
				if (requireSuccess && winner.result[0]) {
					if (debugEnabled) {
						debugScope("[race] first finisher failed, waiting for success...");
					}

					// Wait for remaining tasks
					const remainingResults = await Promise.all(tasks);

					// Find first success
					const firstSuccess = remainingResults.find((r) => !r.result[0]);
					if (firstSuccess) {
						return firstSuccess.result;
					}

					// All failed
					if (errors.length === totalTasks) {
						return [
							createAggregateError(errors.map((e) => e.error)),
							undefined,
						];
					}

					return winner.result;
				}

				return winner.result;
			}

			// With concurrency limit - run tasks in batches
			if (debugEnabled) {
				debugScope("[race] running with concurrency limit: %d", concurrency);
			}

			let currentIndex = 0;
			const runningTasks: Promise<{
				idx: number;
				result: Result<unknown, T>;
			}>[] = [];
			const taskIdxMap = new Map<
				Promise<{ idx: number; result: Result<unknown, T> }>,
				number
			>();

			// Start initial batch
			const initialBatch = Math.min(concurrency, totalTasks);
			for (let i = 0; i < initialBatch; i++) {
				const task = processTask(factories[currentIndex]!, currentIndex);
				runningTasks.push(task);
				taskIdxMap.set(task, currentIndex);
				currentIndex++;
			}

			// Keep racing until we have a winner
			while (runningTasks.length > 0) {
				// Build race competitors for this iteration
				const competitors: Promise<
					{ idx: number; result: Result<unknown, T> } | Result<unknown, T>
				>[] = [...runningTasks, abortPromise];
				if (timeoutPromise) {
					competitors.push(timeoutPromise as Promise<never>);
				}

				// Race current batch
				const winner = await Promise.race(competitors);

				// If it's a direct Result (from abort/timeout), return it
				if (isResultTuple(winner)) {
					return winner;
				}

				// Find and remove the finished task
				const finishedTaskIdx = runningTasks.findIndex(
					(t) => taskIdxMap.get(t) === winner.idx,
				);
				if (finishedTaskIdx >= 0) {
					const finishedTask = runningTasks[finishedTaskIdx]!;
					runningTasks.splice(finishedTaskIdx, 1);
					taskIdxMap.delete(finishedTask);
				}

				// Check if this is a valid winner
				if (!requireSuccess || !winner.result[0]) {
					if (debugEnabled) {
						debugScope(
							"[race] winner! task %d/%d won the race",
							winner.idx + 1,
							totalTasks,
						);
					}
					return winner.result;
				}

				// Winner was an error and requireSuccess is true - need to continue
				if (debugEnabled) {
					debugScope(
						"[race] task %d/%d failed (requireSuccess), starting next...",
						winner.idx + 1,
						totalTasks,
					);
				}

				// Start next task if available
				if (currentIndex < totalTasks) {
					const nextTask = processTask(factories[currentIndex]!, currentIndex);
					runningTasks.push(nextTask);
					taskIdxMap.set(nextTask, currentIndex);
					currentIndex++;
				} else if (runningTasks.length === 0) {
					// No more tasks to start and none running - all failed
					if (debugEnabled) {
						debugScope("[race] all tasks failed");
					}
					return [createAggregateError(errors.map((e) => e.error)), undefined];
				}
			}

			// Should not reach here, but just in case
			return [createAggregateError(errors.map((e) => e.error)), undefined];
		} finally {
			// Clean up scope - cancels all tasks
			await s[Symbol.asyncDispose]();
		}
	}

	/**
	 * Run multiple tasks in parallel with optional progress tracking,
	 * concurrency control, and error handling.
	 *
	 * Returns a structured result with both successes and failures separated,
	 * making it easy to handle partial failures.
	 *
	 * @param factories - Array of factory functions that create promises
	 * @param options - Optional configuration for concurrency, progress, and error handling
	 * @returns A Promise that resolves to a structured result with completed and failed tasks
	 *
	 * @example
	 * ```typescript
	 * // Basic usage
	 * const result = await s.parallel([
	 *   () => fetchUser(1),
	 *   () => fetchUser(2),
	 *   () => fetchUser(999), // This might fail
	 * ])
	 *
	 * console.log(result.completed) // Successfully fetched users
	 * console.log(result.errors)    // Failed fetches
	 * console.log(result.allCompleted) // false if any failed
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // With progress tracking and concurrency limit
	 * const result = await s.parallel(
	 *   urls.map(url => () => fetch(url)),
	 *   {
	 *     concurrency: 5,
	 *     onProgress: (completed, total) => {
	 *       console.log(`${completed}/${total} done`)
	 *     },
	 *     continueOnError: true
	 *   }
	 * )
	 * ```
	 */
	async parallel<T>(
		factories: readonly ((signal: AbortSignal) => Promise<T>)[],
		options?: {
			/** Maximum concurrent operations (default: unlimited, or scope's concurrency limit) */
			concurrency?: number;
			/** Called after each task completes */
			onProgress?: (
				completed: number,
				total: number,
				result: Result<unknown, T>,
			) => void;
			/** Continue processing on error (default: false) */
			continueOnError?: boolean;
		},
	): Promise<ParallelAggregateResult<T>> {
		const {
			concurrency: optionConcurrency,
			onProgress,
			continueOnError,
		} = options ?? {};

		// Use provided concurrency, or scope's semaphore, or unlimited
		const scopeConcurrency = this.concurrencySemaphore?.totalPermits ?? 0;
		const concurrency =
			optionConcurrency !== undefined
				? optionConcurrency
				: scopeConcurrency > 0
					? scopeConcurrency
					: 0;

		const total = factories.length;

		if (debugScope.enabled) {
			debugScope(
				"[parallel] starting (tasks: %d, concurrency: %d, continueOnError: %s)",
				total,
				concurrency > 0 ? concurrency : "unlimited",
				continueOnError ?? false,
			);
		}

		// Check cancellation before starting
		if (this.abortController.signal.aborted) {
			throw this.abortController.signal.reason;
		}

		const completed: { index: number; value: T }[] = [];
		const errors: { index: number; error: unknown }[] = [];

		if (concurrency <= 0 || concurrency >= factories.length) {
			// No concurrency limit - run all in parallel
			const childScope = new Scope({
				signal: this.signal,
				tracer: this.tracer,
			});

			try {
				const promises = factories.map((factory, idx) =>
					childScope
						.task(({ signal }) => factory(signal))
						.then((result): [number, Result<unknown, T>] => [idx, result]),
				);

				// If not continuing on error, use Promise.all to fail fast
				const results = continueOnError
					? await Promise.all(promises)
					: await Promise.all(promises).catch((error) => {
							// First error - stop processing
							return [[-1, [error, undefined]] as [number, Result<unknown, T>]];
						});

				for (const [idx, result] of results) {
					if (idx === -1) continue; // Skip error marker

					const [err, value] = result;
					if (err) {
						errors.push({ index: idx, error: err });
						if (onProgress) {
							onProgress(completed.length + errors.length, total, result);
						}
						if (!continueOnError) break;
					} else {
						completed.push({ index: idx, value: value as T });
						if (onProgress) {
							onProgress(completed.length + errors.length, total, result);
						}
					}
				}
			} finally {
				await childScope[Symbol.asyncDispose]();
			}
		} else {
			// With concurrency limit
			const executing: Promise<void>[] = [];
			let index = 0;

			for (const factory of factories) {
				// Check cancellation
				if (this.abortController.signal.aborted) {
					throw this.abortController.signal.reason;
				}

				const currentIndex = index++;

				const promise = (async () => {
					try {
						const result = await this.task((ctx) => factory(ctx.signal));
						const [err, value] = result;

						if (err) {
							errors.push({ index: currentIndex, error: err });
							if (onProgress) {
								onProgress(completed.length + errors.length, total, result);
							}
							if (!continueOnError) {
								throw new Error("parallel stopped on first error");
							}
						} else {
							completed.push({
								index: currentIndex,
								value: value as T,
							});
							if (onProgress) {
								onProgress(completed.length + errors.length, total, result);
							}
						}
					} catch (error) {
						// Handle unexpected errors
						errors.push({ index: currentIndex, error });
						if (onProgress) {
							onProgress(completed.length + errors.length, total, [
								error,
								undefined,
							]);
						}
						if (!continueOnError) {
							throw error;
						}
					}
				})();

				executing.push(promise);

				if (executing.length >= concurrency) {
					try {
						await Promise.race(executing);
					} catch {
						if (!continueOnError) break;
					}
				}
			}

			// Wait for remaining
			if (continueOnError || errors.length === 0) {
				await Promise.all(executing).catch(() => {});
			}
		}

		return {
			completed,
			errors,
			allCompleted: errors.length === 0,
		};
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
	 * @param options - Optional select configuration including timeout
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
		options?: SelectOptions,
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

		// Create timeout promise if specified
		const timeoutPromise = options?.timeout
			? new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`select timeout after ${options.timeout}ms`));
					}, options.timeout);
				})
			: null;

		try {
			// Keep racing until we get a value or all channels are closed
			while (true) {
				const racePromises = channelEntries.map(([channel], idx) =>
					createRacePromise(channel, idx),
				);

				// Add timeout to race if specified
				if (timeoutPromise) {
					racePromises.push(
						timeoutPromise as Promise<
							{ idx: number; value: unknown } | { closed: true }
						>,
					);
				}

				const result = await Promise.race(racePromises);

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

	/**
	 * Create a broadcast channel for pub/sub patterns.
	 * All subscribers receive every message (unlike regular channel where messages are distributed).
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 * const broadcast = s.broadcast<string>()
	 *
	 * // Subscribe multiple consumers
	 * s.task(async () => {
	 *   for await (const msg of broadcast.subscribe()) {
	 *     console.log('Consumer 1:', msg)
	 *   }
	 * })
	 *
	 * // Publish messages
	 * await broadcast.send('hello')
	 * broadcast.close()
	 * ```
	 */
	broadcast<T>(): BroadcastChannel<T> {
		const broadcast = new BroadcastChannel<T>(this.signal);
		this.disposables.push({
			async [Symbol.asyncDispose]() {
				await broadcast[Symbol.asyncDispose]();
			},
		});
		return broadcast;
	}

	/**
	 * Create a resource pool for managing reusable resources.
	 * Useful for connection pooling, worker pools, etc.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 * const pool = s.pool({
	 *   create: () => createDatabaseConnection(),
	 *   destroy: (conn) => conn.close(),
	 *   min: 2,
	 *   max: 10
	 * })
	 *
	 * // Acquire and use a resource
	 * const conn = await pool.acquire()
	 * try {
	 *   await conn.query('SELECT 1')
	 * } finally {
	 *   await pool.release(conn)
	 * }
	 *
	 * // Or use execute for automatic release
	 * await pool.execute(async (conn) => {
	 *   await conn.query('SELECT 1')
	 * })
	 * ```
	 */
	pool<T>(options: ResourcePoolOptions<T>): ResourcePool<T> {
		const pool = new ResourcePool<T>(options, this.signal);
		this.disposables.push({
			async [Symbol.asyncDispose]() {
				await pool[Symbol.asyncDispose]();
			},
		});
		return pool;
	}

	/**
	 * Get the profile report for this scope.
	 * Only available if profiler was enabled in scope options.
	 */
	getProfileReport() {
		return this.profiler.getReport();
	}

	/**
	 * Register a child scope for metrics aggregation.
	 * @internal
	 */
	registerChild(child: Scope<Record<string, unknown>>): void {
		this.childScopes.push(child);
	}

	/**
	 * Get a debug visualization of the scope tree.
	 * Useful for debugging scope hierarchies and active tasks.
	 *
	 * @returns String representation of the scope tree
	 *
	 * @example
	 * ```typescript
	 * console.log(s.debugTree())
	 * // Scope(api-request) [running]
	 * //   ├─ Task(fetchUser) - running 1200ms
	 * //   ├─ Task(fetchOrders) - completed 350ms
	 * //   └─ ChildScope(cache-refresh)
	 * //      └─ Task(updateCache) - pending
	 * ```
	 */
	debugTree(): string {
		return this.buildDebugTree(0);
	}

	private buildDebugTree(indent: number): string {
		const prefix = "  ".repeat(indent);
		const status = this.disposed ? "disposed" : "running";
		const lines: string[] = [`${prefix}Scope(${this.name}) [${status}]`];

		// Add active tasks
		for (const task of this.activeTasks) {
			const taskStatus = task.isSettled
				? "completed"
				: task.isStarted
					? "running"
					: "pending";
			lines.push(`${prefix}  └─ Task(${task.id}) - ${taskStatus}`);
		}

		// Add child scopes
		for (const child of this.childScopes) {
			lines.push(child.buildDebugTree(indent + 1));
		}

		return lines.join("\n");
	}

	/**
	 * Aggregate metrics from this scope and all child scopes.
	 * Returns combined metrics across the entire scope tree.
	 *
	 * @returns Aggregated metrics or undefined if metrics not enabled
	 */
	aggregateMetrics(): ScopeMetrics | undefined {
		if (!this.enableMetrics) return undefined;

		const ownMetrics = this.metrics();
		if (!ownMetrics) return undefined;

		// Collect metrics from all children recursively
		const allMetrics: ScopeMetrics[] = [ownMetrics];
		for (const child of this.childScopes) {
			const childMetrics = child.aggregateMetrics();
			if (childMetrics) {
				allMetrics.push(childMetrics);
			}
		}

		// Aggregate
		const aggregated: ScopeMetrics = {
			tasksSpawned: allMetrics.reduce((sum, m) => sum + m.tasksSpawned, 0),
			tasksCompleted: allMetrics.reduce((sum, m) => sum + m.tasksCompleted, 0),
			tasksFailed: allMetrics.reduce((sum, m) => sum + m.tasksFailed, 0),
			totalTaskDuration: allMetrics.reduce(
				(sum, m) => sum + m.totalTaskDuration,
				0,
			),
			avgTaskDuration:
				allMetrics.reduce((sum, m) => sum + m.avgTaskDuration, 0) /
				allMetrics.length,
			p95TaskDuration: Math.max(...allMetrics.map((m) => m.p95TaskDuration)),
			resourcesRegistered: allMetrics.reduce(
				(sum, m) => sum + m.resourcesRegistered,
				0,
			),
			resourcesDisposed: allMetrics.reduce(
				(sum, m) => sum + m.resourcesDisposed,
				0,
			),
			scopeDuration: ownMetrics.scopeDuration,
		};

		return aggregated;
	}
}
