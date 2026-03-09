/**
 * Scope class for go-go-scope - Structured concurrency
 */

/// <reference types="./global.d.ts" />
import createDebug from "debug";

import { Batch, type BatchOptions } from "./batch.js";
import { BroadcastChannel } from "./broadcast-channel.js";
import { Channel } from "./channel.js";
import {
	type CheckpointState,
	cleanupTaskCheckpoints,
	createCheckpointContext,
	createProgressContext,
	loadCheckpointForTask,
} from "./checkpoint.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { AbortError, UnknownError } from "./errors.js";
import { ScopedEventEmitter } from "./event-emitter.js";
import type { GracefulShutdownOptions } from "./graceful-shutdown.js";
import { GracefulShutdownController } from "./graceful-shutdown.js";
import { Lock, type LockOptions } from "./lock.js";
import {
	createCorrelatedLogger,
	generateSpanId,
	generateTraceId,
} from "./log-correlation.js";
import { createLogger, createTaskLogger } from "./logger.js";
import type { Checkpoint } from "./persistence/types.js";
import { installPlugins } from "./plugin.js";
import { poll as pollFn } from "./poll.js";
import {
	PriorityChannel,
	type PriorityChannelOptions,
} from "./priority-channel.js";
import {
	debounce as debounceFn,
	throttle as throttleFn,
} from "./rate-limiting.js";
import { ResourcePool } from "./resource-pool.js";
import { exponentialBackoff } from "./retry-strategies.js";
import { Semaphore } from "./semaphore.js";
import { Task } from "./task.js";
import { TokenBucket, type TokenBucketOptions } from "./token-bucket.js";
import type {
	ChannelOptions,
	CircuitBreakerOptions,
	DebounceOptions,
	Failure,
	Logger,
	ProgressContext,
	Result,
	ScopeHooks,
	SelectOptions,
	Success,
	TaskOptions,
	ThrottleOptions,
} from "./types.js";
import { WorkerPool } from "./worker-pool.js";

const debugScope = createDebug("go-go-scope:scope");

let scopeIdCounter = 0;

/**
 * Async disposable resource wrapper
 */
export class AsyncDisposableResource<T> implements AsyncDisposable {
	private resource?: T;
	private acquired = false;
	private disposed = false;

	constructor(
		private readonly acquireFn: () => Promise<T>,
		private readonly disposeFn: (resource: T) => Promise<void> | void,
	) {}

	async acquire(): Promise<T> {
		if (this.disposed) {
			throw new Error("Resource already disposed");
		}
		if (this.acquired) {
			throw new Error("Resource already acquired");
		}
		this.acquired = true;
		this.resource = await this.acquireFn();
		return this.resource;
	}

	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		if (this.resource) {
			await this.disposeFn(this.resource);
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
	 * Optional name for the scope. Defaults to "scope-{id}".
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
	 * Optional logger for structured logging.
	 */
	logger?: import("./types.js").Logger;
	/**
	 * Minimum log level for console logging (if no custom logger provided).
	 */
	logLevel?: "debug" | "info" | "warn" | "error";
	/**
	 * Optional persistence providers for distributed features.
	 */
	persistence?: import("./persistence/types.js").PersistenceProviders;
	/**
	 * Idempotency configuration for the scope.
	 */
	idempotency?: {
		defaultTTL?: number;
	};
	/**
	 * Task pooling configuration for reducing GC pressure.
	 */
	taskPooling?: {
		maxSize?: number;
		enabled?: boolean;
	};
	/**
	 * Worker pool configuration for CPU-intensive tasks.
	 * Only used when tasks are spawned with `worker: true`.
	 */
	workerPool?: {
		/** Number of worker threads (default: CPU count - 1) */
		size?: number;
		/** Idle timeout in ms before workers terminate (default: 60000) */
		idleTimeout?: number;
	};
	/**
	 * Optional context object accessible in all tasks.
	 */
	context?: Record<string, unknown>;
	/**
	 * Enable log correlation with traceId and spanId.
	 * When enabled, all logs from this scope and its tasks include correlation IDs.
	 * Default: false
	 */
	logCorrelation?: boolean;
	/**
	 * External trace ID for log correlation (for continuing traces from external sources).
	 * If not provided, a new trace ID is generated when logCorrelation is enabled.
	 */
	traceId?: string;
	/**
	 * Graceful shutdown configuration.
	 * When set, the scope will automatically handle shutdown signals (SIGTERM, SIGINT)
	 * and coordinate cleanup before exiting.
	 */
	gracefulShutdown?: GracefulShutdownOptions;
	/**
	 * Enhanced tracing configuration for distributed tracing.
	 * When set, enables advanced tracing features like channel message flow tracking,
	 * deadlock detection, and visual trace export.
	 * @see EnhancedTracingOptions in @riseworks/plugin-opentelemetry
	 */
	tracing?: Record<string, unknown>;
}

/**
 * A Scope for structured concurrency.
 */
// @ts-expect-error TypeScript may not recognize Symbol.asyncDispose in all configurations
export class Scope<
	Services extends Record<string, unknown> = Record<string, never>,
> implements AsyncDisposable
{
	private readonly abortController: AbortController;
	private _disposables: (Disposable | AsyncDisposable)[] | undefined;
	private readonly timeoutId: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private taskCount = 0;
	private readonly activeTasks: Set<Task<unknown>> = new Set();
	private readonly id: number;
	private readonly name: string;
	private readonly concurrencySemaphore?: Semaphore;
	private readonly scopeCircuitBreaker?: CircuitBreaker;
	private services: Services = {} as Services;
	private readonly hooks?: ScopeHooks;
	private readonly beforeTaskHooks: Array<
		(name: string, index: number, options?: TaskOptions) => void
	> = [];
	private readonly afterTaskHooks: Array<
		(name: string, duration: number, error?: unknown, index?: number) => void
	> = [];
	private readonly logger: Logger;
	readonly requestContext: Record<string, unknown>;
	private _childScopes: Scope<Record<string, unknown>>[] | undefined;
	private _dedupeRegistry: Map<string | symbol, Promise<unknown>> | undefined;
	private _memoRegistry:
		| Map<string | symbol, { result: unknown; expiry: number }>
		| undefined;
	private _resourceDisposers:
		| Array<{
				key: string;
				dispose: () => void | Promise<void>;
				index: number;
		  }>
		| undefined;
	private _resourceIndex = 0;
	private readonly _persistence?: import("./persistence/types.js").PersistenceProviders;
	readonly idempotency?: { defaultTTL?: number };
	private _workerPool?: WorkerPool;
	private readonly _workerPoolOptions?: { size?: number; idleTimeout?: number };
	/** Trace ID for log correlation */
	readonly traceId?: string;
	/** Span ID for log correlation */
	readonly spanId?: string;
	/** Graceful shutdown controller */
	private _shutdownController?: GracefulShutdownController;

	/**
	 * Check if graceful shutdown has been requested.
	 * Only available when gracefulShutdown option is set.
	 */
	get isShutdownRequested(): boolean {
		return this._shutdownController?.isShutdownRequested ?? false;
	}

	constructor(options?: ScopeOptions<Record<string, unknown>>) {
		this.id = ++scopeIdCounter;
		this.name = options?.name ?? `scope-${this.id}`;
		this.hooks = options?.hooks;

		// Initialize log correlation
		if (options?.logCorrelation) {
			// Inherit traceId from parent or use provided/external one
			const parentTraceId = (options?.parent as unknown as { traceId?: string })
				?.traceId;
			this.traceId = options?.traceId ?? parentTraceId ?? generateTraceId();
			this.spanId = generateSpanId();

			// Wrap logger with correlation
			const baseLogger = createLogger(
				this.name,
				options?.logger,
				options?.logLevel,
			);
			this.logger = createCorrelatedLogger(baseLogger, {
				traceId: this.traceId,
				spanId: this.spanId,
				scopeName: this.name,
				parentSpanId: (options?.parent as unknown as { spanId?: string })
					?.spanId,
			});
		} else {
			this.logger = createLogger(this.name, options?.logger, options?.logLevel);
		}

		// Initialize request context
		const parentRequestContext =
			(
				options?.parent as unknown as {
					requestContext?: Record<string, unknown>;
				}
			)?.requestContext ?? {};
		this.requestContext = {
			...parentRequestContext,
			...(options?.context ?? {}),
		};

		// Set persistence providers
		const parentPersistence = (
			options?.parent as unknown as {
				_persistence?: import("./persistence/types.js").PersistenceProviders;
			}
		)?._persistence;
		const optionsPersistence = options?.persistence;
		(
			this as unknown as {
				_persistence?: import("./persistence/types.js").PersistenceProviders;
			}
		)._persistence = optionsPersistence ?? parentPersistence;

		// Set idempotency configuration
		this.idempotency = options?.idempotency ?? options?.parent?.idempotency;

		// Set worker pool options
		this._workerPoolOptions =
			options?.workerPool ?? options?.parent?._workerPoolOptions;

		if (options?.parent) {
			(this as unknown as { parent?: typeof options.parent }).parent =
				options.parent;
		}

		const parentSignal = options?.parent?.signal ?? options?.signal;
		const parentServices = options?.parent?.services;
		if (parentServices) {
			this.services = { ...parentServices } as Services;
		}

		if (options?.parent) {
			options.parent.registerChild(this);
		}

		if (debugScope.enabled) {
			debugScope(
				"[%s] creating scope (timeout: %d, parent signal: %s, concurrency: %s, circuitBreaker: %s, parent: %s)",
				this.name,
				options?.timeout ?? 0,
				parentSignal ? "yes" : "no",
				options?.concurrency ?? "unlimited",
				options?.circuitBreaker ? "yes" : "no",
				options?.parent ? "yes" : "no",
			);
		}

		this.abortController = new AbortController();

		// Create concurrency semaphore if specified
		const concurrency = options?.concurrency ?? options?.parent?.concurrency;
		if (concurrency !== undefined && concurrency > 0) {
			this.concurrencySemaphore = new Semaphore(
				concurrency,
				this.abortController.signal,
			);
		}

		// Create circuit breaker if specified
		const circuitBreaker =
			options?.circuitBreaker ?? options?.parent?.circuitBreaker;
		if (circuitBreaker) {
			this.scopeCircuitBreaker = new CircuitBreaker(
				circuitBreaker,
				this.abortController.signal,
			);
		}

		// Set up timeout if specified
		if (options?.timeout) {
			this.timeoutId = setTimeout(() => {
				this.abortController.abort(
					new Error(`Scope timeout after ${options.timeout}ms`),
				);
			}, options.timeout);
		}

		// Link to parent signal if provided
		if (parentSignal) {
			const abortHandler = () => {
				this.abortController.abort(parentSignal.reason);
			};
			if (parentSignal.aborted) {
				abortHandler();
			} else {
				parentSignal.addEventListener("abort", abortHandler, { once: true });
			}
		}

		// Install plugins
		installPlugins(
			this as unknown as Scope<Record<string, never>>,
			options as ScopeOptions<Record<string, never>>,
		);

		// Set up graceful shutdown if specified
		if (options?.gracefulShutdown) {
			this._shutdownController = new GracefulShutdownController(
				this as unknown as Scope<Record<string, unknown>>,
				options.gracefulShutdown,
			);
		}
	}

	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	get scopeName(): string {
		return this.name;
	}

	get servicesMap(): Services {
		return this.services;
	}

	/**
	 * Get the concurrency limit for this scope.
	 */
	get concurrency(): number | undefined {
		return this.concurrencySemaphore?.totalPermits;
	}

	/**
	 * Get the circuit breaker configuration for this scope.
	 */
	get circuitBreaker(): CircuitBreakerOptions | undefined {
		return this.scopeCircuitBreaker
			? {
					failureThreshold: this.scopeCircuitBreaker.failureThreshold,
					resetTimeout: this.scopeCircuitBreaker.resetTimeout,
				}
			: undefined;
	}

	private get disposables(): (Disposable | AsyncDisposable)[] {
		if (!this._disposables) {
			this._disposables = [];
		}
		return this._disposables;
	}

	private get childScopes(): Scope<Record<string, unknown>>[] {
		if (!this._childScopes) {
			this._childScopes = [];
		}
		return this._childScopes;
	}

	private get dedupeRegistry(): Map<string | symbol, Promise<unknown>> {
		if (!this._dedupeRegistry) {
			this._dedupeRegistry = new Map();
		}
		return this._dedupeRegistry;
	}

	private get memoRegistry(): Map<
		string | symbol,
		{ result: unknown; expiry: number }
	> {
		if (!this._memoRegistry) {
			this._memoRegistry = new Map();
		}
		return this._memoRegistry;
	}

	get persistence():
		| import("./persistence/types.js").PersistenceProviders
		| undefined {
		return (
			this as unknown as {
				_persistence?: import("./persistence/types.js").PersistenceProviders;
			}
		)._persistence;
	}

	task<T, E extends Error = Error>(
		fn: (ctx: {
			services: Services;
			signal: AbortSignal;
			logger: Logger;
			context: Record<string, unknown>;
			checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown };
			progress?: ProgressContext;
		}) => Promise<T>,
		options?: TaskOptions<E>,
	): Task<Result<E, T>> {
		if (this.disposed) {
			throw new Error("Cannot spawn task on disposed scope");
		}
		if (this.abortController.signal.aborted) {
			throw new Error("Cannot spawn task on aborted scope");
		}

		// Check for memoized result
		const memoConfig = options?.memo;
		if (memoConfig !== undefined) {
			const cached = this.memoRegistry.get(memoConfig.key);
			if (cached && cached.expiry > Date.now()) {
				const memoFactory = (): Promise<Result<E, T>> => {
					return Promise.resolve(cached.result as Result<E, T>);
				};
				const memoTask = new Task<Result<E, T>>(
					memoFactory,
					this.abortController.signal,
				);
				this.activeTasks.add(memoTask as Task<unknown>);
				Promise.resolve().then(() => {
					this.activeTasks.delete(memoTask as Task<unknown>);
				});
				return memoTask;
			}
		}

		// Check for deduplication
		const dedupeKey = options?.dedupe;
		if (dedupeKey !== undefined) {
			const existing = this.dedupeRegistry.get(dedupeKey);
			if (existing) {
				const dedupeFactory = (): Promise<Result<E, T>> => {
					return existing as Promise<Result<E, T>>;
				};
				const dedupeTask = new Task<Result<E, T>>(
					dedupeFactory,
					this.abortController.signal,
				);
				this.activeTasks.add(dedupeTask as Task<unknown>);
				Promise.resolve().then(() => {
					dedupeTask.then(
						() => this.activeTasks.delete(dedupeTask as Task<unknown>),
						() => this.activeTasks.delete(dedupeTask as Task<unknown>),
					);
				});
				return dedupeTask;
			}
		}

		// Process idempotency configuration
		const idempotencyKeyOption = options?.idempotency?.key;
		const idempotencyKey =
			typeof idempotencyKeyOption === "function"
				? idempotencyKeyOption()
				: idempotencyKeyOption;

		this.taskCount++;
		const taskIndex = this.taskCount;
		const hasDebug = debugScope.enabled;
		const taskName = options?.id ?? `task-${taskIndex}`;

		if (hasDebug) {
			this.logger.debug('Spawning task #%d "%s"', taskIndex, taskName);
			debugScope('[%s] spawning task #%d "%s"', this.name, taskIndex, taskName);
		}

		// Call beforeTask hook
		this.hooks?.beforeTask?.(taskName, taskIndex, options);
		// Call dynamic beforeTask hooks
		for (const hook of this.beforeTaskHooks) {
			hook(taskName, taskIndex, options);
		}

		const startTime = Date.now();
		const parentSignal = this.abortController.signal;

		// Determine task ID (reused for checkpoint and otel)
		const taskId = options?.id ?? `${this.name}-task-${taskIndex}`;

		// Check if checkpoint is configured
		const checkpointConfig = options?.checkpoint;
		const checkpointProvider = this._persistence?.checkpoint;
		const hasCheckpoint =
			checkpointConfig !== undefined && checkpointProvider !== undefined;

		// Build the execution pipeline
		const wrappedFn = async (signal: AbortSignal): Promise<T> => {
			if (signal.aborted) {
				throw new AbortError(signal.reason);
			}

			// Check idempotency provider for cached result
			if (idempotencyKey !== undefined) {
				const idempotencyProvider = this._persistence?.idempotency;
				if (idempotencyProvider) {
					try {
						const cached =
							await idempotencyProvider.get<Result<E, T>>(idempotencyKey);
						if (cached) {
							const cachedResult = cached.value;
							if (cachedResult[1] !== undefined) {
								return cachedResult[1] as T;
							}
						}
					} catch {
						// Continue on cache error
					}
				}
			}

			const taskLogger = createTaskLogger(
				this.logger,
				this.name,
				taskName,
				taskIndex,
			);

			// Load existing checkpoint if resuming
			let existingCheckpoint: Checkpoint<unknown> | undefined;
			if (hasCheckpoint && checkpointProvider) {
				existingCheckpoint = await loadCheckpointForTask(
					checkpointProvider,
					taskId,
					checkpointConfig.onResume as (
						checkpoint: Checkpoint<unknown>,
					) => void,
				);
			}

			// Setup checkpoint and progress contexts if configured
			let checkpointState: CheckpointState<unknown> | undefined;
			let checkpointCtx: ReturnType<typeof createCheckpointContext> | undefined;
			let progressCtx: ProgressContext | undefined;
			let checkpointInterval: ReturnType<typeof setInterval> | undefined;

			if (hasCheckpoint && checkpointProvider) {
				checkpointState = {
					provider: checkpointProvider,
					taskId,
					current: existingCheckpoint,
					sequence: existingCheckpoint?.sequence ?? 0,
					maxCheckpoints: checkpointConfig.maxCheckpoints ?? 10,
					onCheckpoint: checkpointConfig.onCheckpoint as (
						checkpoint: Checkpoint<unknown>,
					) => void,
				};

				checkpointCtx = createCheckpointContext(checkpointState);
				progressCtx = createProgressContext();

				// Setup auto-checkpoint interval if configured
				if (checkpointConfig.interval && checkpointConfig.interval > 0) {
					checkpointInterval = setInterval(() => {
						if (checkpointState?.current) {
							checkpointProvider.save(checkpointState.current).catch(() => {});
						}
					}, checkpointConfig.interval);
				}
			}

			try {
				const callFn = (sig: AbortSignal): Promise<T> => {
					return fn({
						services: this.services as Services,
						signal: sig,
						logger: taskLogger,
						context: this.requestContext,
						checkpoint: checkpointCtx,
						progress: progressCtx,
					});
				};

				// Create abort promise to race against task execution
				let abortHandler: (() => void) | undefined;
				const abortPromise = new Promise<never>((_, reject) => {
					if (signal.aborted) {
						reject(new AbortError(signal.reason));
						return;
					}
					abortHandler = () => {
						reject(new AbortError(signal.reason));
					};
					signal.addEventListener("abort", abortHandler, { once: true });
				});

				// Apply circuit breaker if configured (task-level takes precedence)
				let result: T;
				let taskCircuitBreaker: CircuitBreaker | undefined;
				try {
					// Create task-level circuit breaker if configured
					if (options?.circuitBreaker) {
						taskCircuitBreaker = new CircuitBreaker(
							options.circuitBreaker,
							signal,
						);
					}

					const cb = taskCircuitBreaker || this.scopeCircuitBreaker;

					if (cb) {
						result = await cb.execute(() =>
							Promise.race([
								this.executeWithRetry(callFn, signal, options?.retry),
								abortPromise,
							]),
						);
					} else {
						result = await Promise.race([
							this.executeWithRetry(callFn, signal, options?.retry),
							abortPromise,
						]);
					}
				} finally {
					// Clean up abort listener to prevent unhandled rejections
					if (abortHandler) {
						signal.removeEventListener("abort", abortHandler);
					}
					// Cleanup task-level circuit breaker
					if (taskCircuitBreaker) {
						await taskCircuitBreaker[Symbol.asyncDispose]();
					}
				}

				// Cleanup checkpoints on success
				if (hasCheckpoint && checkpointProvider) {
					await cleanupTaskCheckpoints(checkpointProvider, taskId);
				}

				return result;
			} finally {
				// Clear checkpoint interval
				if (checkpointInterval) {
					clearInterval(checkpointInterval);
				}
			}
		};

		// Create task factory
		const factory = async (): Promise<Result<E, T>> => {
			if (dedupeKey !== undefined) {
				const promise = factoryInternal();
				this.dedupeRegistry.set(dedupeKey, promise);
				return promise;
			}
			return factoryInternal();
		};

		const factoryInternal = async (): Promise<Result<E, T>> => {
			try {
				let result: T;

				// Execute in worker thread if requested
				if (options?.worker) {
					// Lazy-create worker pool with configured options
					if (!this._workerPool) {
						this._workerPool = new WorkerPool({
							size: this._workerPoolOptions?.size,
							idleTimeout: this._workerPoolOptions?.idleTimeout,
						});
						// Register for cleanup
						this.registerDisposable({
							[Symbol.dispose]: () => {
								void this._workerPool?.[Symbol.asyncDispose]();
							},
						});
					}

					// Serialize and execute function in worker
					const fnString = fn.toString();
					result = await this._workerPool.execute<string, T>(
						(workerFnString) => {
							// biome-ignore lint/security/noGlobalEval: Required for worker thread execution
							const workerFn = eval(`(${workerFnString})`);
							// Call with minimal context (no services/logger in worker)
							return workerFn({
								services: {},
								signal: { aborted: false },
								logger: {
									debug: () => {},
									info: () => {},
									warn: () => {},
									error: () => {},
								},
								context: {},
							});
						},
						fnString,
					);
				} else {
					// Create timeout promise if timeout option is set
					let timeoutPromise: Promise<never> | undefined;
					if (options?.timeout) {
						timeoutPromise = new Promise((_, reject) => {
							const timeoutId = setTimeout(() => {
								reject(new Error(`Task timeout after ${options.timeout}ms`));
							}, options.timeout);
							// Clean up timeout if parent signal aborts
							parentSignal.addEventListener(
								"abort",
								() => clearTimeout(timeoutId),
								{ once: true },
							);
						});
					}

					// Apply concurrency limit if configured
					if (this.concurrencySemaphore) {
						const fnPromise = this.concurrencySemaphore.acquire(async () => {
							return wrappedFn(parentSignal);
						}, options?.priority ?? 0);
						result = timeoutPromise
							? await Promise.race([fnPromise, timeoutPromise])
							: await fnPromise;
					} else {
						const fnPromise = wrappedFn(parentSignal);
						result = timeoutPromise
							? await Promise.race([fnPromise, timeoutPromise])
							: await fnPromise;
					}
				}

				return [undefined, result] as Success<T>;
			} catch (error) {
				// Wrap error according to errorClass or systemErrorClass options
				const wrappedError = this.wrapError(error, options);
				return [wrappedError, undefined] as Failure<E>;
			}
		};

		const task = new Task<Result<E, T>>(factory, this.abortController.signal);
		this.activeTasks.add(task as Task<unknown>);

		task.then(
			async (result) => {
				this.activeTasks.delete(task as Task<unknown>);
				const duration = Date.now() - startTime;
				// Call afterTask hook
				this.hooks?.afterTask?.(taskName, duration, result[0], taskIndex);
				// Call dynamic afterTask hooks
				for (const hook of this.afterTaskHooks) {
					hook(taskName, duration, result[0], taskIndex);
				}
				// Store successful result in memo cache
				if (memoConfig !== undefined && result[0] === undefined) {
					this.memoRegistry.set(memoConfig.key, {
						result,
						expiry: Date.now() + memoConfig.ttl,
					});
				}
				// Store result in idempotency provider
				if (idempotencyKey !== undefined) {
					const idempotencyProvider = this._persistence?.idempotency;
					if (idempotencyProvider) {
						try {
							// Use task-specific TTL, or scope default TTL, or no TTL
							const ttl =
								options?.idempotency?.ttl ?? this.idempotency?.defaultTTL;
							await idempotencyProvider.set(idempotencyKey, result, ttl);
						} catch {
							// Ignore idempotency storage errors
						}
					}
				}
				// Release dedupe key after completion
				if (dedupeKey !== undefined) {
					this.dedupeRegistry.delete(dedupeKey);
				}
			},
			(error) => {
				this.activeTasks.delete(task as Task<unknown>);
				const duration = Date.now() - startTime;
				// Call afterTask hook with error
				this.hooks?.afterTask?.(taskName, duration, error, taskIndex);
				// Call dynamic afterTask hooks
				for (const hook of this.afterTaskHooks) {
					hook(taskName, duration, error, taskIndex);
				}
				// Release dedupe key after failure
				if (dedupeKey !== undefined) {
					this.dedupeRegistry.delete(dedupeKey);
				}
			},
		);

		return task;
	}

	/**
	 * Resume a task from its last checkpoint.
	 *
	 * If a checkpoint exists for the task ID, the task will be executed
	 * with the checkpoint data available in the context.
	 *
	 * @param taskId - The unique task ID to resume
	 * @param fn - The task function to execute
	 * @param options - Optional task options
	 * @returns Promise that resolves to the task result
	 *
	 * @example
	 * ```typescript
	 * const [err, result] = await s.resumeTask('migration-job', async ({ checkpoint, progress }) => {
	 *   // checkpoint.data contains the saved state
	 *   const processed = checkpoint?.data?.processed ?? 0
	 *   // Continue processing from checkpoint...
	 * })
	 * ```
	 */
	async resumeTask<T, E extends Error = Error>(
		taskId: string,
		fn: (ctx: {
			services: Services;
			signal: AbortSignal;
			logger: Logger;
			context: Record<string, unknown>;
			checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown };
			progress?: ProgressContext;
		}) => Promise<T>,
		options?: Omit<TaskOptions<E>, "id"> & {
			/** If true, throw an error if no checkpoint exists for this task ID */
			requireExisting?: boolean;
		},
	): Promise<Result<E, T>> {
		const checkpointProvider = this._persistence?.checkpoint;
		if (!checkpointProvider) {
			throw new Error("No checkpoint provider configured");
		}

		// Load existing checkpoint
		const existingCheckpoint = await loadCheckpointForTask<unknown>(
			checkpointProvider,
			taskId,
			undefined, // onResume will be called via task options
		);

		// Optionally require an existing checkpoint
		if (options?.requireExisting && !existingCheckpoint) {
			throw new Error(`No checkpoint found for task ID: ${taskId}`);
		}

		// Merge checkpoint options with any provided options
		const mergedOptions: TaskOptions<E> = {
			...options,
			id: taskId,
			checkpoint: {
				interval: options?.checkpoint?.interval ?? 60000,
				onCheckpoint: options?.checkpoint?.onCheckpoint,
				onResume: existingCheckpoint
					? () => {
							options?.checkpoint?.onResume?.(existingCheckpoint);
						}
					: undefined,
				maxCheckpoints: options?.checkpoint?.maxCheckpoints ?? 10,
			},
		};

		// Create and await the task
		const task = this.task(
			fn as unknown as Parameters<Scope<Services>["task"]>[0],
			mergedOptions,
		);
		return task as unknown as Promise<Result<E, T>>;
	}

	/**
	 * Run multiple tasks in parallel with optional concurrency limit.
	 * All tasks run within this scope and are cancelled together on failure.
	 *
	 * @param factories - Array of factory functions that receive AbortSignal and create promises
	 * @param options - Optional configuration including concurrency limit, progress callback, and error handling
	 * @returns A Promise that resolves to a tuple of Results (one per factory)
	 */
	async parallel<T extends readonly (() => Promise<unknown>)[]>(
		factories: T,
		options?: {
			concurrency?: number;
			onProgress?: (
				completed: number,
				total: number,
				result: Result<unknown, unknown>,
			) => void;
			continueOnError?: boolean;
		},
	): Promise<{
		[K in keyof T]: T[K] extends () => Promise<infer R>
			? Result<unknown, R>
			: never;
	}> {
		const {
			concurrency = 0,
			onProgress,
			continueOnError = false,
		} = options ?? {};

		if (factories.length === 0) {
			return [] as unknown as {
				[K in keyof T]: T[K] extends () => Promise<infer R>
					? Result<unknown, R>
					: never;
			};
		}

		const total = factories.length;
		const results: Result<unknown, unknown>[] = new Array(factories.length);

		if (concurrency <= 0 || concurrency >= factories.length) {
			// No concurrency limit - run all in parallel
			const promises = factories.map((factory, idx) =>
				this.task(async () => factory()).then(
					(result): [number, Result<unknown, unknown>] => [idx, result],
				),
			);

			const settledResults = continueOnError
				? await Promise.all(promises)
				: await Promise.all(promises).catch((error) => {
						return [
							[-1, [error, undefined]] as [number, Result<unknown, unknown>],
						];
					});

			for (const [idx, result] of settledResults) {
				if (idx === -1) continue;
				results[idx] = result;
				if (onProgress) {
					onProgress(
						results.filter((r) => r !== undefined).length,
						total,
						result,
					);
				}
				if (!continueOnError && result[0]) {
					break;
				}
			}
		} else {
			// With concurrency limit
			const executing: Promise<void>[] = [];
			let index = 0;

			for (const factory of factories) {
				if (this.abortController.signal.aborted) {
					throw this.abortController.signal.reason;
				}

				const currentIndex = index++;

				const promise = (async () => {
					try {
						const result = await this.task(async () => factory());
						results[currentIndex] = result;
						if (onProgress) {
							onProgress(
								results.filter((r) => r !== undefined).length,
								total,
								result,
							);
						}
						if (!continueOnError && result[0]) {
							throw result[0];
						}
					} catch (error) {
						results[currentIndex] = [error, undefined];
						if (onProgress) {
							onProgress(results.filter((r) => r !== undefined).length, total, [
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

			if (continueOnError || results.every((r) => r !== undefined)) {
				await Promise.all(executing).catch(() => {});
			}
		}

		for (let i = 0; i < results.length; i++) {
			if (results[i] === undefined) {
				results[i] = [new Error("Task did not complete"), undefined];
			}
		}

		return results as {
			[K in keyof T]: T[K] extends () => Promise<infer R>
				? Result<unknown, R>
				: never;
		};
	}

	/**
	 * Race multiple tasks against each other - first to settle wins.
	 *
	 * @param factories - Array of factory functions that receive AbortSignal and create promises
	 * @param options - Optional race configuration including timeout, requireSuccess, and concurrency
	 * @returns A Promise that resolves to the Result of the winning task
	 */
	async race<T>(
		factories: readonly (() => Promise<T>)[],
		options?: {
			timeout?: number;
			requireSuccess?: boolean;
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

		let settledCount = 0;
		let winnerIndex = -1;
		const errors: { index: number; error: unknown }[] = [];

		// Create combined signal with optional timeout
		const signals: AbortSignal[] = [this.signal];
		if (timeout) {
			signals.push(AbortSignal.timeout(timeout));
		}
		const combinedSignal = AbortSignal.any(signals);

		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			if (combinedSignal.aborted) {
				resolve([combinedSignal.reason, undefined]);
				return;
			}
			combinedSignal.addEventListener("abort", () => {
				resolve([combinedSignal.reason, undefined]);
			});
		});

		const executeTask = async (
			factory: () => Promise<T>,
			taskIndex: number,
		): Promise<Result<unknown, T>> => {
			try {
				const result = await factory();
				settledCount++;
				if (winnerIndex === -1) {
					winnerIndex = taskIndex;
				}
				return [undefined, result] as Success<T>;
			} catch (error) {
				settledCount++;
				return [error as Error, undefined] as Failure<Error>;
			}
		};

		// With concurrency limit, create a semaphore
		const runWithConcurrency = async (): Promise<Result<unknown, T>> => {
			const semaphore = new Semaphore(concurrency);
			const tasks: Promise<Result<unknown, T>>[] = [];

			for (let i = 0; i < factories.length; i++) {
				tasks.push(
					semaphore.acquire(async () => {
						if (winnerIndex !== -1) {
							return [undefined, undefined] as unknown as Result<unknown, T>;
						}
						const factory = factories[i];
						if (!factory) {
							return [
								new Error(`Factory at index ${i} is undefined`),
								undefined,
							];
						}
						return executeTask(factory, i);
					}),
				);
			}

			return Promise.race([abortPromise, Promise.race(tasks)]);
		};

		// Without concurrency limit, run all at once
		const runUnlimited = async (): Promise<Result<unknown, T>> => {
			const tasks = factories.map((factory, index) =>
				executeTask(factory, index),
			);
			return Promise.race([abortPromise, Promise.race(tasks)]);
		};

		// Main race logic
		const racePromise =
			concurrency > 0 && concurrency < factories.length
				? runWithConcurrency()
				: runUnlimited();

		// Wait for first result
		const firstResult = await racePromise;

		// If aborted, return abort reason
		if (firstResult[0] === combinedSignal.reason) {
			return firstResult;
		}

		// If we got a success and don't require success, return it
		if (!firstResult[0] && !requireSuccess) {
			return firstResult;
		}

		// Otherwise need to collect all results to find first success or return all errors
		const allResults = await Promise.all(
			factories.map((factory, index) =>
				executeTask(factory, index).then((result) => ({ index, result })),
			),
		);

		for (const { index, result } of allResults) {
			if (!result[0]) {
				return result;
			}
			errors.push({ index, error: result[0] });
		}

		return [
			new AggregateError(
				errors.map((e) => e.error),
				`All race competitors failed (${errors.length} errors)`,
			),
			undefined,
		];
	}

	/**
	 * Wrap error according to errorClass or systemErrorClass options.
	 * If no options provided, uses UnknownError for plain errors and non-Error values.
	 * AbortError is not wrapped - the raw reason is returned.
	 */
	private wrapError(error: unknown, options?: TaskOptions<Error>): unknown {
		// Access error class options with type assertion since TaskOptions is a union
		interface ErrorClassOptions {
			errorClass?: new (
				message: string,
				options?: { cause?: unknown },
			) => Error;
			systemErrorClass?: new (
				message: string,
				options?: { cause?: unknown },
			) => Error;
		}
		const opts = options as ErrorClassOptions | undefined;
		const errorClass = opts?.errorClass;
		const systemErrorClass = opts?.systemErrorClass;

		// Helper to check if error is a custom Error subclass
		const isCustomError = error instanceof Error && error.constructor !== Error;

		// If errorClass is specified, wrap ALL errors (including AbortError)
		if (errorClass) {
			// Don't re-wrap if already the correct type
			if (error instanceof errorClass) {
				return error;
			}
			// Wrap the error
			const message = error instanceof Error ? error.message : String(error);
			return new errorClass(message, { cause: error });
		}

		// If systemErrorClass is specified, only wrap plain errors and non-Errors
		if (systemErrorClass) {
			// Check if error is already the correct type
			if (error instanceof systemErrorClass) {
				return error;
			}
			// Check if error has a _tag (tagged errors are preserved)
			const hasTag =
				error instanceof Error && "_tag" in error && error._tag !== undefined;
			if (hasTag) {
				return error as Error;
			}
			// Preserve custom error subclasses
			if (isCustomError) {
				return error as Error;
			}
			// Wrap plain errors and non-Errors
			const message = error instanceof Error ? error.message : String(error);
			return new systemErrorClass(message, { cause: error });
		}

		// Default behavior: preserve custom errors, wrap plain errors and non-Errors
		// Don't wrap AbortError - return the raw reason
		if (error instanceof AbortError) {
			return error.reason;
		}

		const hasTag =
			error instanceof Error && "_tag" in error && error._tag !== undefined;
		if (hasTag) {
			return error as Error;
		}
		// Don't re-wrap if already UnknownError
		if (error instanceof UnknownError) {
			return error;
		}
		// Preserve custom error subclasses
		if (isCustomError) {
			return error as Error;
		}
		// Wrap plain errors and non-Errors in UnknownError
		const message = error instanceof Error ? error.message : String(error);
		return new UnknownError(message, { cause: error });
	}

	private async executeWithRetry<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		signal: AbortSignal,
		retry?: TaskOptions["retry"],
	): Promise<T> {
		if (!retry) {
			return fn(signal);
		}

		// Handle string retry options by converting to object
		let retryConfig: {
			max?: number;
			delay?: number | import("./types.js").RetryDelayFn;
			if?: (error: unknown) => boolean;
			onRetry?: (error: unknown, attempt: number) => void;
		};
		if (typeof retry === "string") {
			retryConfig = {
				max: 3,
				delay:
					retry === "exponential"
						? exponentialBackoff()
						: retry === "linear"
							? 1000
							: 1000,
			};
		} else {
			retryConfig = retry;
		}

		const max = retryConfig.max ?? 3;
		const delayFn = retryConfig.delay ?? exponentialBackoff();
		const retryIf = retryConfig.if;
		const retryCallback = retryConfig.onRetry;

		let lastError: unknown;

		for (let attempt = 0; attempt <= max; attempt++) {
			if (signal.aborted) {
				throw new AbortError(signal.reason);
			}

			try {
				return await fn(signal);
			} catch (error) {
				lastError = error;

				if (attempt === max) {
					throw error;
				}

				if (retryIf && !retryIf(error)) {
					throw error;
				}

				// Call onRetry callback before waiting
				if (retryCallback) {
					retryCallback(error, attempt + 1);
				}

				const delayMs =
					typeof delayFn === "number" ? delayFn : delayFn(attempt + 1, error);

				// Wait for delay, but respect abort signal
				await new Promise<void>((resolve, reject) => {
					const timeoutId = setTimeout(resolve, delayMs);
					const abortHandler = () => {
						clearTimeout(timeoutId);
						reject(new AbortError(signal.reason));
					};
					if (signal.aborted) {
						abortHandler();
					} else {
						signal.addEventListener("abort", abortHandler, { once: true });
					}
				});
			}
		}

		throw lastError;
	}

	provide<K extends string, T>(
		key: K,
		value: T | (() => T),
		options?: {
			/** Dispose function called when scope is disposed */
			dispose?: (value: T) => void | Promise<void>;
			/** If true, only create the value once and reuse it for subsequent calls */
			singleton?: boolean;
		},
	): Scope<Services & Record<K, T>> {
		// Check if singleton already exists
		if (options?.singleton && key in this.services) {
			return this as Scope<Services & Record<K, T>>;
		}

		// If value is a function, call it to get the actual value
		const resolvedValue =
			typeof value === "function" ? (value as () => T)() : value;
		(this.services as Record<string, unknown>)[key] = resolvedValue;

		// Track dispose function if provided
		if (options?.dispose) {
			if (!this._resourceDisposers) {
				this._resourceDisposers = [];
			}
			const index = ++this._resourceIndex;
			this._resourceDisposers.push({
				key,
				dispose: async () => {
					try {
						await options.dispose!(resolvedValue);
						this.hooks?.onDispose?.(index, undefined);
					} catch (error) {
						this.hooks?.onDispose?.(index, error);
					}
				},
				index,
			});
		}

		return this as Scope<Services & Record<K, T>>;
	}

	use<K extends keyof Services>(key: K): Services[K] {
		return this.services[key];
	}

	has<K extends keyof Services>(key: K): boolean {
		if (this.disposed) return false;
		return key in this.services;
	}

	override<K extends keyof Services>(
		key: K,
		value: Services[K] | (() => Services[K]),
		options?: {
			/** Dispose function called when scope is disposed */
			dispose?: (value: Services[K]) => void | Promise<void>;
		},
	): this {
		if (this.disposed) {
			throw new Error("Cannot override service on disposed scope");
		}
		if (!(key in this.services)) {
			throw new Error(
				`Cannot override service '${String(key)}': it was not provided`,
			);
		}
		// If value is a function, call it to get the actual value
		const resolvedValue =
			typeof value === "function" ? (value as () => Services[K])() : value;
		this.services[key] = resolvedValue;

		// Track dispose function if provided
		if (options?.dispose) {
			if (!this._resourceDisposers) {
				this._resourceDisposers = [];
			}
			const index = ++this._resourceIndex;
			this._resourceDisposers.push({
				key: String(key),
				dispose: async () => {
					try {
						await options.dispose!(resolvedValue);
						this.hooks?.onDispose?.(index, undefined);
					} catch (error) {
						this.hooks?.onDispose?.(index, error);
					}
				},
				index,
			});
		}

		return this;
	}

	channel<T>(capacity?: number, options?: ChannelOptions<T>): Channel<T> {
		const ch = new Channel<T>(
			capacity ?? options ?? 0,
			this.abortController.signal,
		);
		this.registerDisposable(ch);
		return ch;
	}

	broadcast<T>(): BroadcastChannel<T> {
		const bc = new BroadcastChannel<T>(this.abortController.signal);
		this.registerDisposable(bc);
		return bc;
	}

	/**
	 * Create a scoped EventEmitter with automatic cleanup.
	 * All listeners are automatically removed when the scope is disposed.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope();
	 * const emitter = s.eventEmitter<{
	 *   data: (chunk: string) => void;
	 *   end: () => void;
	 * }>();
	 *
	 * emitter.on("data", (chunk) => console.log(chunk));
	 * emitter.emit("data", "Hello!");
	 * ```
	 */
	eventEmitter<
		Events extends Record<string, (...args: unknown[]) => void>,
	>(): ScopedEventEmitter<Events> {
		const emitter = new ScopedEventEmitter<Events>(this);
		return emitter;
	}

	priorityChannel<T>(options: PriorityChannelOptions<T>): PriorityChannel<T> {
		const pc = new PriorityChannel<T>(options, this.abortController.signal);
		this.registerDisposable(pc);
		return pc;
	}

	semaphore(initialPermits: number): Semaphore {
		const sem = new Semaphore(initialPermits, this.abortController.signal);
		this.registerDisposable(sem);
		return sem;
	}

	/**
	 * Acquire a lock for exclusive or shared access.
	 * Automatically integrates with scope for cancellation and cleanup.
	 *
	 * @example
	 * ```typescript
	 * // Exclusive lock (mutex)
	 * await using s = scope()
	 * const lock = s.acquireLock()
	 * await using guard = await lock.acquire()
	 * // Critical section
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Read-Write lock
	 * await using s = scope()
	 * const lock = s.acquireLock({ allowMultipleReaders: true })
	 * // Multiple concurrent reads
	 * await using readGuard = await lock.read()
	 * // Or exclusive write
	 * await using writeGuard = await lock.write()
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Distributed lock with Redis
	 * await using s = scope({
	 *   persistence: { lock: redisAdapter }
	 * })
	 * const lock = s.acquireLock({
	 *   key: 'resource-lock',
	 *   ttl: 30000
	 * })
	 * ```
	 */
	acquireLock(options?: LockOptions): Lock {
		const lock = new Lock(this.abortController.signal, options);
		this.registerDisposable(lock);
		return lock;
	}

	pool<T>(
		options: import("./types.js").ResourcePoolOptions<T>,
	): ResourcePool<T> {
		const pool = new ResourcePool<T>(options, this.abortController.signal);
		this.registerDisposable(pool);
		return pool;
	}

	tokenBucket(options: TokenBucketOptions): TokenBucket {
		return new TokenBucket(options);
	}

	poll<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		onValue: (value: T) => void | Promise<void>,
		options?: import("./types.js").PollOptions,
	): import("./types.js").PollController {
		return pollFn(fn, onValue, {
			...options,
			signal: this.abortController.signal,
		});
	}

	async select<T, R>(
		cases: Map<Channel<T>, (value: T) => Promise<R>>,
		options?: SelectOptions,
	): Promise<Result<Error, R>> {
		// Check for empty cases
		if (cases.size === 0) {
			return [new Error("select called with no cases"), undefined];
		}

		const channels = Array.from(cases.keys());

		// Check if all channels are closed
		const allClosed = channels.every((ch) => ch.isClosed);
		if (allClosed) {
			return [new Error("All channels are closed"), undefined];
		}

		// Create abort signal with optional timeout
		const signals: AbortSignal[] = [this.signal];
		if (options?.timeout) {
			signals.push(AbortSignal.timeout(options.timeout));
		}
		const combinedSignal = AbortSignal.any(signals);

		// Race all channel receives
		const receivePromises = channels.map(async (ch) => {
			try {
				const result = await ch.receive();
				return { channel: ch, result };
			} catch (error) {
				return { channel: ch, error };
			}
		});

		// Also create an abort promise
		const abortPromise = new Promise<{ aborted: true; reason: unknown }>(
			(resolve) => {
				if (combinedSignal.aborted) {
					resolve({ aborted: true, reason: combinedSignal.reason });
					return;
				}
				combinedSignal.addEventListener("abort", () => {
					resolve({ aborted: true, reason: combinedSignal.reason });
				});
			},
		);

		// Race between receives and abort
		const winner = await Promise.race([
			...receivePromises,
			abortPromise.then((r) => ({ ...r })),
		]);

		// Check if aborted
		if ("aborted" in winner && winner.aborted) {
			return [winner.reason as Error, undefined];
		}

		// Handle channel error (e.g., closed channel)
		if ("error" in winner) {
			return [winner.error as Error, undefined];
		}

		// At this point, winner must be a channel result
		const channelResult = winner as {
			channel: Channel<T>;
			result: Awaited<T> | undefined;
		};

		// Get the handler and call it with the received value
		const handler = cases.get(channelResult.channel);
		if (!handler) {
			return [new Error("No handler for channel"), undefined];
		}

		try {
			const result = await handler(channelResult.result as T);
			return [undefined, result] as Success<R>;
		} catch (error) {
			return [error as Error, undefined] as Failure<Error>;
		}
	}

	/**
	 * Create a debounced function that delays invoking the provided function
	 * until after `wait` milliseconds have elapsed since the last time it was invoked.
	 * Automatically cancelled when the scope is disposed.
	 */
	debounce<T, Args extends unknown[]>(
		fn: (...args: Args) => Promise<T>,
		options?: DebounceOptions,
	): (...args: Args) => Promise<Result<unknown, T>> {
		return debounceFn(this, fn, options);
	}

	/**
	 * Create a throttled function that only invokes the provided function
	 * at most once per every `wait` milliseconds.
	 * Automatically cancelled when the scope is disposed.
	 */
	throttle<T, Args extends unknown[]>(
		fn: (...args: Args) => Promise<T>,
		options?: ThrottleOptions,
	): (...args: Args) => Promise<Result<unknown, T>> {
		return throttleFn(this, fn, options);
	}

	/**
	 * Delay execution for a specified number of milliseconds.
	 * Automatically cancelled when the scope is disposed.
	 *
	 * @param ms - Number of milliseconds to delay
	 * @returns Promise that resolves after the delay
	 * @throws AbortError if the scope is cancelled during the delay
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * console.log('Start')
	 * await s.delay(1000)
	 * console.log('After 1 second')
	 * ```
	 */
	delay(ms: number): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.abortController.signal.aborted) {
				reject(new AbortError(this.abortController.signal.reason));
				return;
			}

			const timeoutId = setTimeout(resolve, ms);

			const abortHandler = () => {
				clearTimeout(timeoutId);
				reject(new AbortError(this.abortController.signal.reason));
			};

			this.abortController.signal.addEventListener("abort", abortHandler, {
				once: true,
			});
		});
	}

	/**
	 * Create a batch processor that accumulates items and processes them in batches.
	 * Automatically flushes when batch is full or timeout is reached.
	 * Auto-flushes on scope disposal.
	 *
	 * @param options - Batch configuration
	 * @returns Batch instance for adding items
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * const batcher = s.batch({
	 *   size: 100,
	 *   timeout: 5000,
	 *   process: async (users) => {
	 *     await db.users.insertMany(users)
	 *     return users.length
	 *   }
	 * })
	 *
	 * // Add items - they accumulate
	 * await batcher.add({ name: 'Alice' })
	 * await batcher.add({ name: 'Bob' })
	 *
	 * // Manually flush when needed
	 * const [err, count] = await batcher.flush()
	 * ```
	 */
	batch<T, R>(options: BatchOptions<T, R>): Batch<T, R> {
		return new Batch(this, options);
	}

	/**
	 * Execute a function repeatedly at a fixed interval.
	 * Automatically cancelled when the scope is disposed.
	 *
	 * @param intervalMs - Interval in milliseconds between executions
	 * @param fn - Function to execute. Receives AbortSignal for cancellation.
	 * @returns A function to stop the interval early
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Check for updates every 5 seconds
	 * const stop = s.every(5000, async ({ signal }) => {
	 *   const updates = await checkForUpdates({ signal })
	 *   if (updates.length > 0) console.log('New updates:', updates)
	 * })
	 *
	 * // Stop manually if needed
	 * stop()
	 * ```
	 */
	every(
		intervalMs: number,
		fn: (ctx: { signal: AbortSignal }) => Promise<void>,
	): () => void {
		let stopped = false;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const run = async (): Promise<void> => {
			if (stopped || this.abortController.signal.aborted) return;

			try {
				await fn({ signal: this.abortController.signal });
			} catch (error) {
				// Errors don't stop the interval, but don't throw
				if (debugScope.enabled) {
					debugScope("[%s] every() task error: %s", this.name, error);
				}
			}

			if (!stopped && !this.abortController.signal.aborted) {
				timeoutId = setTimeout(run, intervalMs);
			}
		};

		// Start first execution immediately
		run();

		// Register cleanup
		this.onDispose(() => {
			stopped = true;
			if (timeoutId) clearTimeout(timeoutId);
		});

		// Return stop function
		return () => {
			stopped = true;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}

	/**
	 * Wait for the first successful result from multiple tasks.
	 * Similar to Promise.any but returns a Result tuple and cancels remaining tasks.
	 *
	 * @param factories - Array of factory functions that create promises
	 * @param options - Optional timeout
	 * @returns Result tuple with first success, or aggregate error if all fail
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // Try multiple sources, get first successful response
	 * const [err, response] = await s.any([
	 *   () => fetchFromPrimary(),
	 *   () => fetchFromBackup1(),
	 *   () => fetchFromBackup2(),
	 * ])
	 * ```
	 */
	async any<T>(
		factories: readonly (() => Promise<T>)[],
		options?: { timeout?: number },
	): Promise<Result<unknown, T>> {
		if (factories.length === 0) {
			return [new Error("Cannot race empty array"), undefined];
		}

		const errors: unknown[] = [];
		const childScope = this.createChild({ timeout: options?.timeout });

		try {
			return await new Promise<Result<unknown, T>>((resolve) => {
				let completed = 0;
				const total = factories.length;

				for (const factory of factories) {
					childScope
						.task(async () => factory())
						.then((result) => {
							const [err, value] = result;
							completed++;

							if (!err) {
								// First success - resolve and cleanup
								resolve([undefined, value as T]);
							} else if (completed === total) {
								// All failed - return aggregate error
								resolve([
									typeof AggregateError !== "undefined"
										? new AggregateError(errors, "All tasks failed")
										: new Error(`All ${errors.length} tasks failed`),
									undefined,
								]);
							}
						})
						.catch((error) => {
							errors.push(error);
							completed++;

							if (completed === total) {
								resolve([
									typeof AggregateError !== "undefined"
										? new AggregateError(errors, "All tasks failed")
										: new Error(`All ${errors.length} tasks failed`),
									undefined,
								]);
							}
						});
				}
			});
		} finally {
			// Cleanup child scope - cancels remaining tasks
			void (childScope as unknown as AsyncDisposable)[Symbol.asyncDispose]();
		}
	}

	/**
	 * Get metrics for the scope.
	 * NOTE: Metrics have been moved to @go-go-scope/plugin-metrics.
	 * This method returns undefined. Install the metrics plugin to get metrics.
	 */
	metrics(): undefined {
		return undefined;
	}

	onDispose(fn: () => void | Promise<void>): void {
		this.disposables.push({
			[Symbol.dispose]: () => {},
			[Symbol.asyncDispose]: async () => fn(),
		});
	}

	/**
	 * Register a callback to be called before each task starts.
	 * Useful for plugins to track task execution.
	 */
	onBeforeTask(
		fn: (name: string, index: number, options?: TaskOptions) => void,
	): void {
		this.beforeTaskHooks.push(fn);
	}

	/**
	 * Register a callback to be called after each task completes.
	 * Useful for plugins to track task execution.
	 */
	onAfterTask(
		fn: (
			name: string,
			duration: number,
			error?: unknown,
			index?: number,
		) => void,
	): void {
		this.afterTaskHooks.push(fn);
	}

	registerDisposable(disposable: Disposable | AsyncDisposable): void {
		this.disposables.push(disposable);
	}

	registerChild(child: Scope<Record<string, unknown>>): void {
		this.childScopes.push(child);
	}

	/**
	 * Create a child scope that inherits from this scope.
	 * The child scope inherits signal, services, and traceId from the parent.
	 *
	 * @example
	 * ```typescript
	 * await using parent = scope({ name: 'parent' });
	 * const child = parent.createChild({ name: 'child' });
	 * const grandchild = child.createChild({ name: 'grandchild' });
	 * ```
	 */
	createChild<
		ChildServices extends Record<string, unknown> = Record<string, never>,
	>(
		options?: Omit<ScopeOptions<Services>, "parent"> & {
			provide?: {
				[K in keyof ChildServices]: (ctx: {
					services: Services;
				}) => ChildServices[K] | Promise<ChildServices[K]>;
			};
		},
	): Scope<Services & ChildServices> {
		const childScope = new Scope<Services & ChildServices>({
			...options,
			parent: this as unknown as Scope<Services>,
		} as ScopeOptions<Services>);

		this.registerChild(childScope as unknown as Scope<Record<string, unknown>>);

		return childScope;
	}

	/**
	 * Generate a visual tree representation of the scope hierarchy.
	 * Supports ASCII and Mermaid diagram formats.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope({ name: 'root' });
	 * const child = s.createChild({ name: 'child' });
	 * const grandchild = child.createChild({ name: 'grandchild' });
	 *
	 * console.log(s.debugTree());
	 * // Output:
	 * // 📦 root (id: 1)
	 * //    ├─ 📦 child (id: 2)
	 * //    │  └─ 📦 grandchild (id: 3)
	 * //
	 * console.log(s.debugTree({ format: 'mermaid' }));
	 * // Output:
	 * // graph TD
	 * //     scope_1[📦 root]
	 * //     scope_1 --> scope_2[📦 child]
	 * //     scope_2 --> scope_3[📦 grandchild]
	 * ```
	 */
	debugTree(
		options: { format?: "ascii" | "mermaid"; includeStats?: boolean } = {},
	): string {
		const { format = "ascii", includeStats = true } = options;

		if (format === "mermaid") {
			return this.generateMermaidTree();
		}

		return this.generateAsciiTree(includeStats);
	}

	private generateAsciiTree(includeStats: boolean): string {
		const lines: string[] = [];

		const buildTree = (
			scope: Scope<Record<string, unknown>>,
			prefix: string = "",
			isLast: boolean = true,
		): void => {
			const children = scope.childScopes;

			// Build status indicator
			let statusIcon = "📦";
			if (scope.isDisposed) {
				statusIcon = "💀";
			} else if (scope.signal.aborted) {
				statusIcon = "⚠️";
			}

			// Build scope info
			const scopeInfo = `${statusIcon} ${scope.name} (id: ${scope.id})`;
			const stats = includeStats ? this.getScopeStats(scope) : "";

			// Add the line
			const connector = prefix === "" ? "" : isLast ? "└─ " : "├─ ";
			lines.push(`${prefix}${connector}${scopeInfo}${stats}`);

			// Process children
			const newPrefix = prefix + (isLast ? "   " : "│  ");
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (child) {
					buildTree(child, newPrefix, i === children.length - 1);
				}
			}
		};

		buildTree(this);
		return lines.join("\n");
	}

	private getScopeStats(scope: Scope<Record<string, unknown>>): string {
		const stats: string[] = [];

		if (scope.concurrency !== undefined) {
			stats.push(`concurrency:${scope.concurrency}`);
		}

		if (scope.circuitBreaker !== undefined) {
			stats.push("circuitBreaker");
		}

		const activeCount = scope.activeTasks?.size ?? 0;
		if (activeCount > 0) {
			stats.push(`tasks:${activeCount}`);
		}

		if (scope.childScopes.length > 0) {
			stats.push(`children:${scope.childScopes.length}`);
		}

		return stats.length > 0 ? ` [${stats.join(", ")}]` : "";
	}

	private generateMermaidTree(): string {
		const lines: string[] = ["graph TD"];
		const nodes = new Set<string>();

		const buildMermaid = (scope: Scope<Record<string, unknown>>): void => {
			const nodeId = `scope_${scope.id}`;
			if (nodes.has(nodeId)) return;
			nodes.add(nodeId);

			// Add node definition with styling
			const statusIcon = scope.isDisposed
				? "💀"
				: scope.signal.aborted
					? "⚠️"
					: "📦";
			lines.push(`    ${nodeId}["${statusIcon} ${scope.name}"]`);

			// Style classes
			if (scope.isDisposed) {
				lines.push(`    style ${nodeId} fill:#ffcccc,stroke:#cc0000`);
			} else if (scope.signal.aborted) {
				lines.push(`    style ${nodeId} fill:#ffeecc,stroke:#cc9900`);
			}

			// Add edges to children
			for (const child of scope.childScopes) {
				const childId = `scope_${child.id}`;
				lines.push(`    ${nodeId} --> ${childId}`);
				buildMermaid(child);
			}
		};

		buildMermaid(this);
		return lines.join("\n");
	}

	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		if (debugScope.enabled) {
			debugScope("[%s] disposing scope", this.name);
		}

		// Clear timeout if set
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		// Abort all tasks
		if (!this.abortController.signal.aborted) {
			const reason = new Error("Scope disposed");
			this.abortController.abort(reason);
			// Call onCancel hook
			this.hooks?.onCancel?.(reason);
		}

		// Call beforeDispose hook
		this.hooks?.beforeDispose?.();

		// Dispose all child scopes first
		for (const child of this.childScopes) {
			try {
				await (child as unknown as AsyncDisposable)[Symbol.asyncDispose]();
			} catch {
				// Ignore child disposal errors
			}
		}

		// Wait for all active tasks to complete
		const activeTasksArray = Array.from(this.activeTasks);
		if (activeTasksArray.length > 0) {
			await Promise.allSettled(
				activeTasksArray.map((task) => task.catch(() => {})),
			);
		}

		// Dispose all disposables in reverse order (LIFO)
		const disposablesToClean = [...this.disposables].reverse();
		for (const disposable of disposablesToClean) {
			if (!disposable) continue;
			try {
				if (Symbol.asyncDispose in disposable) {
					await disposable[Symbol.asyncDispose]();
				} else if (Symbol.dispose in disposable) {
					disposable[Symbol.dispose]();
				}
			} catch {
				// Ignore disposal errors
			}
		}

		// Dispose resources with custom dispose functions in LIFO order
		if (this._resourceDisposers) {
			for (let i = this._resourceDisposers.length - 1; i >= 0; i--) {
				const disposer = this._resourceDisposers[i];
				if (!disposer) continue;
				try {
					await disposer.dispose();
				} catch {
					// Ignore disposal errors - hook already called
				}
			}
		}

		// Call afterDispose hook
		this.hooks?.afterDispose?.();

		if (debugScope.enabled) {
			debugScope("[%s] scope disposed", this.name);
		}
	}
}
