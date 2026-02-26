/**
 * Scope class for go-go-scope - Structured concurrency
 */

import createDebug from "debug";

import { BroadcastChannel } from "./broadcast-channel.js";
import { Channel } from "./channel.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { AbortError, UnknownError } from "./errors.js";
import { createLogger, createTaskLogger } from "./logger.js";
import { installPlugins } from "./plugin.js";
import { poll as pollFn } from "./poll.js";
import {
	PriorityChannel,
	type PriorityChannelOptions,
} from "./priority-channel.js";
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
	Result,
	ScopeHooks,
	SelectOptions,
	Success,
	TaskOptions,
	ThrottleOptions,
} from "./types.js";

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
	 * Optional context object accessible in all tasks.
	 */
	context?: Record<string, unknown>;
}

/**
 * A Scope for structured concurrency.
 */
/* #__PURE__ */
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

	constructor(options?: ScopeOptions<Record<string, unknown>>) {
		this.id = ++scopeIdCounter;
		this.name = options?.name ?? `scope-${this.id}`;
		this.hooks = options?.hooks;
		this.logger = createLogger(this.name, options?.logger, options?.logLevel);

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
		const taskName = options?.otel?.name ?? `task-${taskIndex}`;

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

			const callFn = (sig: AbortSignal): Promise<T> => {
				return fn({
					services: this.services as Services,
					signal: sig,
					logger: taskLogger,
					context: this.requestContext,
				});
			};

			// Apply circuit breaker if configured
			let result: T;
			if (this.scopeCircuitBreaker) {
				result = await this.scopeCircuitBreaker.execute(() =>
					this.executeWithRetry(callFn, signal, options?.retry),
				);
			} else {
				result = await this.executeWithRetry(callFn, signal, options?.retry);
			}

			return result;
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
					});
					result = timeoutPromise
						? await Promise.race([fnPromise, timeoutPromise])
						: await fnPromise;
				} else {
					const fnPromise = wrappedFn(parentSignal);
					result = timeoutPromise
						? await Promise.race([fnPromise, timeoutPromise])
						: await fnPromise;
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
			maxRetries?: number;
			delay?: number | import("./types.js").RetryDelayFn;
			retryCondition?: (error: unknown) => boolean;
			onRetry?: (error: unknown, attempt: number) => void;
		};
		if (typeof retry === "string") {
			retryConfig = {
				maxRetries: 3,
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

		const maxRetries = retryConfig.maxRetries ?? 3;
		const delayFn = retryConfig.delay ?? exponentialBackoff();
		const retryCondition = retryConfig.retryCondition;
		const retryCallback = retryConfig.onRetry;

		let lastError: unknown;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (signal.aborted) {
				throw new AbortError(signal.reason);
			}

			try {
				return await fn(signal);
			} catch (error) {
				lastError = error;

				if (attempt === maxRetries) {
					throw error;
				}

				if (retryCondition && !retryCondition(error)) {
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
		dispose?: (value: T) => void | Promise<void>,
	): Scope<Services & Record<K, T>> {
		// If value is a function, call it to get the actual value
		const resolvedValue =
			typeof value === "function" ? (value as () => T)() : value;
		(this.services as Record<string, unknown>)[key] = resolvedValue;

		// Track dispose function if provided
		if (dispose) {
			if (!this._resourceDisposers) {
				this._resourceDisposers = [];
			}
			const index = ++this._resourceIndex;
			this._resourceDisposers.push({
				key,
				dispose: async () => {
					try {
						await dispose(resolvedValue);
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
		dispose?: (value: Services[K]) => void | Promise<void>,
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
		if (dispose) {
			if (!this._resourceDisposers) {
				this._resourceDisposers = [];
			}
			const index = ++this._resourceIndex;
			this._resourceDisposers.push({
				key: String(key),
				dispose: async () => {
					try {
						await dispose(resolvedValue);
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
		const wait = options?.wait ?? 300;
		const leading = options?.leading ?? false;
		const trailing = options?.trailing ?? true;

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let lastArgs: Args | undefined;
		let resultPromise: Promise<Result<unknown, T>> | undefined;
		let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

		const invoke = async (args: Args): Promise<void> => {
			try {
				const result = await fn(...args);
				resolveFn?.([undefined, result]);
			} catch (error) {
				resolveFn?.([error, undefined]);
			}
		};

		const startTimer = (): void => {
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
			async [Symbol.asyncDispose](): Promise<void> {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (resolveFn) {
					resolveFn([new Error("Scope disposed"), undefined]);
				}
			},
		};
		this.registerDisposable(cleanupDisposable);

		return (...args: Args): Promise<Result<unknown, T>> => {
			// If scope is disposed, return error immediately
			if (this.disposed || this.signal.aborted) {
				return Promise.resolve([new Error("Scope disposed"), undefined]);
			}

			lastArgs = args;

			// Create new promise for this call
			resultPromise = new Promise((resolve) => {
				resolveFn = resolve;
			});

			const shouldCallNow = leading && !timeoutId;

			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			if (shouldCallNow) {
				void invoke(args);
			} else {
				startTimer();
			}

			return resultPromise;
		};
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
		const wait = options?.interval ?? 300;
		const leading = options?.leading ?? true;
		const trailing = options?.trailing ?? true;

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let lastArgs: Args | undefined;
		let lastCallTime = 0;
		let resultPromise: Promise<Result<unknown, T>> | undefined;
		let resolveFn: ((result: Result<unknown, T>) => void) | undefined;

		const invoke = async (args: Args): Promise<void> => {
			lastCallTime = Date.now();
			try {
				const result = await fn(...args);
				resolveFn?.([undefined, result]);
			} catch (error) {
				resolveFn?.([error, undefined]);
			}
		};

		const startTimer = (): void => {
			const elapsed = Date.now() - lastCallTime;
			const remaining = Math.max(wait - elapsed, 0);

			timeoutId = setTimeout(() => {
				if (trailing && lastArgs) {
					void invoke(lastArgs);
				}
				timeoutId = undefined;
				lastArgs = undefined;
			}, remaining);
		};

		// Clean up on scope disposal
		const cleanupDisposable: AsyncDisposable = {
			async [Symbol.asyncDispose](): Promise<void> {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (resolveFn) {
					resolveFn([new Error("Scope disposed"), undefined]);
				}
			},
		};
		this.registerDisposable(cleanupDisposable);

		return (...args: Args): Promise<Result<unknown, T>> => {
			// If scope is disposed, return error immediately
			if (this.disposed || this.signal.aborted) {
				return Promise.resolve([new Error("Scope disposed"), undefined]);
			}

			lastArgs = args;

			// Create new promise for this call
			resultPromise = new Promise((resolve) => {
				resolveFn = resolve;
			});

			const now = Date.now();
			const remaining = lastCallTime + wait - now;

			if (remaining <= 0 || !lastCallTime) {
				// Execute immediately
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
				if (leading) {
					void invoke(args);
				}
			} else if (!timeoutId && trailing) {
				// Schedule trailing execution
				startTimer();
			}

			return resultPromise;
		};
	}

	/**
	 * Get metrics for the scope.
	 * NOTE: Metrics have been moved to @go-go-scope/plugin-metrics.
	 * This method returns undefined. Install the metrics plugin to get metrics.
	 */
	metrics(): undefined {
		return undefined;
	}

	async acquireLock(
		key: string,
		ttlMs: number,
	): Promise<{ release: () => Promise<void> } | null> {
		const provider = this._persistence?.lock;
		if (!provider) {
			throw new Error("No lock provider configured");
		}
		return provider.acquire(key, ttlMs);
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
				await child[Symbol.asyncDispose]();
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
