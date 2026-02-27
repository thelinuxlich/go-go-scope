/**
 * Type definitions and interfaces for go-go-scope
 */

export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];
export type Result<E, T> = Success<T> | Failure<E>;

/**
 * Error class constructor type for typed error handling.
 */
export type ErrorConstructor<E> = new (
	message: string,
	options?: { cause?: unknown },
) => E;

/**
 * Retry delay function type.
 */
export type RetryDelayFn = (attempt: number, error: unknown) => number;

/**
 * Predefined retry delay strategies.
 */
export interface RetryStrategies {
	/**
	 * Exponential backoff with optional jitter.
	 * @param options.initial - Initial delay in ms (default: 100)
	 * @param options.max - Maximum delay in ms (default: 30000)
	 * @param options.multiplier - Multiplier for each attempt (default: 2)
	 * @param options.jitter - Jitter factor 0-1 (default: 0)
	 * @returns Delay function for retry option
	 *
	 * @example
	 * ```typescript
	 * retry: {
	 *   delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
	 * }
	 * ```
	 */
	exponentialBackoff(options?: {
		initial?: number;
		max?: number;
		multiplier?: number;
		jitter?: number;
	}): RetryDelayFn;

	/**
	 * Fixed delay with jitter.
	 * @param baseDelay - Base delay in ms
	 * @param jitterFactor - Jitter factor 0-1 (default: 0.1)
	 * @returns Delay function for retry option
	 *
	 * @example
	 * ```typescript
	 * retry: {
	 *   delay: jitter(1000, 0.2)  // 1000ms ± 20%
	 * }
	 * ```
	 */
	jitter(baseDelay: number, jitterFactor?: number): RetryDelayFn;

	/**
	 * Linear increasing delay.
	 * @param baseDelay - Base delay in ms
	 * @param increment - Amount to add each attempt
	 * @returns Delay function for retry option
	 */
	linear(baseDelay: number, increment: number): RetryDelayFn;
}

/**
 * Context passed to task functions.
 */
export interface TaskContext<Services extends Record<string, unknown>> {
	/** Services available from the scope */
	services: Services;
	/** AbortSignal for cancellation */
	signal: AbortSignal;
	/** Logger with task context */
	logger: Logger;
	/** Context object inherited from scope */
	context: Record<string, unknown>;
}

/**
 * Base options for spawning a task with tracing (without error class options).
 */
interface TaskOptionsBase {
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
	 * Can be a configuration object or a shorthand string:
	 * - `'exponential'` - Uses exponential backoff with jitter
	 * - `'linear'` - Uses linear increasing delay
	 * - `'fixed'` - Uses fixed delay between retries
	 */
	retry?:
		| {
				/**
				 * Maximum number of retry attempts. Default: 3
				 */
				maxRetries?: number;
				/**
				 * Delay between retries in milliseconds.
				 * Can be a fixed number, a function, or use built-in strategies:
				 * - `exponentialBackoff({ initial, max, jitter })`
				 * - `jitter(baseDelay, jitterFactor)`
				 * - `linear(baseDelay, increment)`
				 * Default: 0 (no delay)
				 */
				delay?: number | RetryDelayFn;
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
		  }
		| "exponential"
		| "linear"
		| "fixed";
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
	/**
	 * Optional deduplication key. When multiple tasks are spawned with the same
	 * dedupe key while one is still in-flight, they will share the same result.
	 * The first task to start executes, subsequent tasks with the same key
	 * receive the same result (success or error).
	 *
	 * Useful for preventing duplicate API calls or database queries.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // These two tasks will share the same result
	 * const t1 = s.task(() => fetchUser(1), { dedupe: 'user:1' })
	 * const t2 = s.task(() => fetchUser(1), { dedupe: 'user:1' })
	 *
	 * const [r1, r2] = await Promise.all([t1, t2])
	 * // Only one API call was made, both got the same result
	 * ```
	 */
	dedupe?: string | symbol;
	/**
	 * Optional memoization configuration. Caches successful task results for the
	 * specified TTL (time-to-live). Subsequent tasks with the same memo key
	 * return the cached result without re-executing.
	 *
	 * Unlike deduplication, memoization persists results across multiple calls
	 * and only caches successful results (errors are not cached).
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // First call executes and caches
	 * const r1 = await s.task(() => fetchUser(1), { memo: { key: 'user:1', ttl: 60000 } })
	 *
	 * // Within 60 seconds, this returns cached result
	 * const r2 = await s.task(() => fetchUser(1), { memo: { key: 'user:1', ttl: 60000 } })
	 * // No API call made, returns cached value
	 * ```
	 */
	memo?: {
		/** Cache key for the memoized result */
		key: string | symbol;
		/** Time-to-live in milliseconds */
		ttl: number;
	};
	/**
	 * Error context for debugging and observability.
	 * When an error occurs, this context is attached to help with diagnosis.
	 *
	 * @example
	 * ```typescript
	 * await s.task(() => fetchUser(id), {
	 *   errorContext: { operation: 'fetchUser', userId: id }
	 * })
	 * // If error occurs, error.context = { operation: 'fetchUser', userId: id }
	 * ```
	 */
	errorContext?: Record<string, unknown>;
	/**
	 * Idempotency configuration for caching task results across multiple executions.
	 * When provided, the task result will be cached and subsequent tasks with
	 * the same key will return the cached result without re-executing.
	 *
	 * Unlike `dedupe` which only deduplicates concurrent in-flight tasks,
	 * idempotency persists results across multiple calls (requires a
	 * persistence provider configured in scope).
	 *
	 * Unlike `memo` which uses in-memory caching, idempotency can work
	 * across process restarts when using a persistent store.
	 *
	 * Errors are NOT cached - failed tasks will be retried.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope({
	 *   persistence: { idempotency: new RedisIdempotencyProvider(redis) }
	 * })
	 *
	 * // Using a string key
	 * const [err, result] = await s.task(
	 *   () => processPayment(orderId),
	 *   { idempotency: { key: `payment:${orderId}` } }
	 * )
	 *
	 * // Using a function to generate the key with TTL
	 * const [err, result] = await s.task(
	 *   () => processPayment(orderId),
	 *   { idempotency: { key: () => `payment:${orderId}`, ttl: 60000 } }
	 * )
	 * ```
	 */
	idempotency?: {
		/**
		 * Idempotency key for caching task results.
		 * Can be a string or a function that generates the key.
		 * The function is called at task creation time.
		 */
		key: string | ((...args: unknown[]) => string);
		/**
		 * Time-to-live for the idempotency cache entry in milliseconds.
		 * If not specified, uses the scope's default TTL or no expiration.
		 */
		ttl?: number;
	};
	/**
	 * Execute the task in a worker thread (v2.4.0+).
	 * Useful for CPU-intensive operations that would block the event loop.
	 *
	 * When enabled, the task function is serialized and executed in a worker thread.
	 * The function must be self-contained (no external references).
	 *
	 * @example
	 * ```typescript
	 * await using s = scope()
	 *
	 * // CPU-intensive task in worker thread
	 * const [err, result] = await s.task(
	 *   () => {
	 *     // This runs in a worker thread
	 *     let sum = 0
	 *     for (let i = 0; i < 1000000; i++) {
	 *       sum += Math.sqrt(i)
	 *     }
	 *     return sum
	 *   },
	 *   { worker: true }
	 * )
	 * ```
	 */
	worker?: boolean;
}

/**
 * Options with errorClass specified - wraps ALL errors in the provided class.
 */
interface TaskOptionsWithErrorClass<E extends Error = Error>
	extends TaskOptionsBase {
	/**
	 * Optional error class to wrap errors in for typed error handling.
	 * When provided, errors will be wrapped in this class, enabling automatic
	 * union inference when combined with go-go-try's success/failure helpers.
	 *
	 * @example
	 * ```typescript
	 * import { taggedError, success, failure } from 'go-go-try'
	 *
	 * const DatabaseError = taggedError('DatabaseError')
	 *
	 * async function fetchUser(id: string) {
	 *   await using s = scope()
	 *
	 *   const [err, user] = await s.task(
	 *     () => queryDatabase(id),
	 *     { errorClass: DatabaseError }
	 *   )
	 *   if (err) return failure(err)
	 *
	 *   return success(user!)
	 * }
	 * // TypeScript infers: Result<DatabaseError, User>
	 * ```
	 */
	errorClass: ErrorConstructor<E>;
	/**
	 * systemErrorClass cannot be used together with errorClass.
	 * Use errorClass to wrap all errors, or use systemErrorClass alone
	 * to preserve tagged errors while wrapping only system errors.
	 */
	systemErrorClass?: never;
}

/**
 * Options with systemErrorClass specified - only wraps untagged errors.
 */
interface TaskOptionsWithSystemErrorClass<E extends Error = Error>
	extends TaskOptionsBase {
	/**
	 * errorClass cannot be used together with systemErrorClass.
	 * Use errorClass to wrap all errors, or use systemErrorClass alone
	 * to preserve tagged errors while wrapping only system errors.
	 */
	errorClass?: never;
	/**
	 * Optional error class to wrap system/infrastructure errors only.
	 * Unlike `errorClass`, this only wraps errors that don't already have
	 * a `_tag` property (which indicates a business error from `taggedError`).
	 *
	 * Use this when your task may throw both business errors (with `_tag`)
	 * and system errors (connection failures, timeouts), and you want to
	 * distinguish between them.
	 *
	 * @example
	 * ```typescript
	 * import { taggedError, success, failure } from 'go-go-try'
	 *
	 * const DatabaseError = taggedError('DatabaseError')
	 * const NotFoundError = taggedError('NotFoundError')  // Has _tag property
	 *
	 * async function getUser(id: string) {
	 *   await using s = scope()
	 *
	 *   const [err, user] = await s.task(async () => {
	 *     const record = await db.query('SELECT * FROM users WHERE id = ?', [id])
	 *     if (!record) throw new NotFoundError('User not found')  // Preserved!
	 *     return record
	 *   }, {
	 *     systemErrorClass: DatabaseError  // Only wraps connection errors, etc.
	 *   })
	 *
	 *   if (err instanceof NotFoundError) return { status: 404 }  // Business error
	 *   if (err) return { status: 500 }  // System error wrapped in DatabaseError
	 *   return success(user!)
	 * }
	 * ```
	 */
	systemErrorClass: ErrorConstructor<E>;
}

/**
 * Options for spawning a task with tracing.
 * errorClass and systemErrorClass are mutually exclusive - you can only specify one,
 * not both at the same time. When neither is specified, UnknownError is used as
 * the default systemErrorClass (preserving tagged errors, wrapping untagged).
 */
export type TaskOptions<E extends Error = Error> =
	| TaskOptionsWithErrorClass<E>
	| TaskOptionsWithSystemErrorClass<E>
	| TaskOptionsBase;

/**
 * Span status codes (from OpenTelemetry)
 */
export enum SpanStatusCode {
	UNSET = 0,
	OK = 1,
	ERROR = 2,
}

/**
 * Lifecycle hooks for scope events
 */
export interface ScopeHooks {
	/**
	 * Called before a task starts execution
	 */
	beforeTask?: (
		taskName: string,
		taskIndex: number,
		options?: TaskOptions,
	) => void;
	/**
	 * Called after a task completes (success or failure)
	 */
	afterTask?: (
		taskName: string,
		durationMs: number,
		error?: unknown,
		taskIndex?: number,
	) => void;
	/**
	 * Called when the scope is cancelled
	 */
	onCancel?: (reason: unknown) => void;
	/**
	 * Called when a resource is disposed
	 */
	onDispose?: (resourceIndex: number, error?: unknown) => void;
	/**
	 * Called when the scope is being disposed
	 */
	beforeDispose?: () => void;
	/**
	 * Called after the scope has been disposed
	 */
	afterDispose?: () => void;
}

/**
 * Options for debounce
 */
export interface DebounceOptions {
	/** Wait time in milliseconds (default: 300) */
	wait?: number;
	/** Trigger on the leading edge (default: false) */
	leading?: boolean;
	/** Trigger on the trailing edge (default: true) */
	trailing?: boolean;
}

/**
 * Options for throttle
 */
export interface ThrottleOptions {
	/** Interval in milliseconds (default: 300) */
	interval?: number;
	/** Trigger on the leading edge (default: true) */
	leading?: boolean;
	/** Trigger on the trailing edge (default: false) */
	trailing?: boolean;
}

/**
 * Circuit breaker state type.
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

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
	/**
	 * Success threshold - number of consecutive successes in half-open state
	 * before transitioning to closed. Default: 1
	 */
	successThreshold?: number;
	/** Called when circuit breaker state changes */
	onStateChange?: (
		from: CircuitBreakerState,
		to: CircuitBreakerState,
		failureCount: number,
	) => void;
	/** Called when circuit opens */
	onOpen?: (failureCount: number) => void;
	/** Called when circuit closes */
	onClose?: () => void;
	/** Called when circuit enters half-open state */
	onHalfOpen?: () => void;
	/**
	 * Advanced configuration options.
	 * These features are opt-in and not enabled by default.
	 */
	advanced?: {
		/**
		 * Enable adaptive threshold based on error rate.
		 * Threshold decreases as error rate increases for faster reaction.
		 */
		adaptiveThreshold?: boolean;
		/** Minimum failure threshold when adaptive mode is enabled. Default: 2 */
		minThreshold?: number;
		/** Maximum failure threshold when adaptive mode is enabled. Default: 10 */
		maxThreshold?: number;
		/** Window size in ms for calculating error rate. Default: 60000 (1 minute) */
		errorRateWindowMs?: number;
		/** Called when threshold adapts based on error rate */
		onThresholdAdapt?: (newThreshold: number, errorRate: number) => void;
		/**
		 * Use sliding window for failure counting instead of fixed count.
		 * When enabled, failures are counted within a time window.
		 */
		slidingWindow?: boolean;
		/** Size of the sliding window in milliseconds. Default: 60000 (1 minute) */
		slidingWindowSizeMs?: number;
	};
}

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Options for the race function
 */
export interface RaceOptions {
	/**
	 * Optional signal to cancel the race.
	 */
	signal?: AbortSignal;
	/**
	 * If true, only successful results count as winners. Errors continue racing.
	 * If false (default), first settled task wins regardless of success/error.
	 */
	requireSuccess?: boolean;
	/**
	 * Optional timeout in milliseconds. If no task wins within this time,
	 * the race fails with a timeout error.
	 */
	timeout?: number;
	/**
	 * Optional concurrency limit. If specified, only this many tasks will run
	 * at a time. When a task fails (and requireSuccess is true), the next
	 * task in the queue will be started.
	 */
	concurrency?: number;
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
 * Automatically stops polling when disposed.
 */
export interface PollController extends Disposable {
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
 * Options for select() with timeout support
 */
export interface SelectOptions {
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Logger interface for structured logging integration
 */
export interface Logger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * Options for scope with logging
 */
export interface ScopeLoggingOptions {
	/** Logger instance */
	logger?: Logger;
	/** Minimum log level */
	logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * Minimal scope interface for rate limiting functions.
 * Used to avoid circular dependencies.
 */
export interface DisposableScope {
	/** Whether the scope has been disposed */
	readonly isDisposed: boolean;
	/** AbortSignal for the scope */
	readonly signal: AbortSignal;
	/** Register a disposable for cleanup */
	registerDisposable(disposable: Disposable | AsyncDisposable): void;
}

/**
 * Resource pool configuration
 */
export interface ResourcePoolOptions<T> {
	/** Factory function to create a resource */
	create: () => Promise<T>;
	/** Cleanup function to destroy a resource */
	destroy: (resource: T) => Promise<void> | void;
	/** Minimum number of resources to maintain */
	min?: number;
	/** Maximum number of resources */
	max: number;
	/** Maximum time to wait for a resource (ms) */
	acquireTimeout?: number;
	/**
	 * Optional health check function to validate resources.
	 * Called periodically if healthCheckInterval is set.
	 */
	healthCheck?: (
		resource: T,
	) => Promise<{ healthy: boolean; message?: string }>;
	/**
	 * Interval in milliseconds between periodic health checks.
	 * Only used if healthCheck is provided.
	 * @default 30000
	 */
	healthCheckInterval?: number;
}

/**
 * Helper type to extract the promise resolve type from a factory function
 */
export type FactoryResult<T> = T extends (
	signal: AbortSignal,
) => Promise<infer R>
	? R
	: never;

/**
 * Converts a tuple of factory functions to a tuple of Result types
 * This preserves the individual types of each factory's return value.
 *
 * @param T - Tuple of factory function types
 * @param E - Error type (defaults to unknown, can be specified for typed errors)
 *
 * @example
 * ```typescript
 * // With typed errors
 * const results = await s.parallel([
 *   () => fetchUser(),
 *   () => fetchOrders()
 * ], { errorClass: DatabaseError })
 * // results is [Result<DatabaseError, User>, Result<DatabaseError, Order[]>]
 * ```
 */
export type ParallelResults<
	T extends readonly ((signal: AbortSignal) => Promise<unknown>)[],
	E = unknown,
> = {
	[K in keyof T]: Result<E, FactoryResult<T[K]>>;
};

// Re-export persistence types
export type {
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	IdempotencyProvider,
	LockHandle,
	LockProvider,
	PersistenceProviders,
} from "./persistence/types.js";

/**
 * Backpressure strategy for channels.
 * - 'block': Wait until space is available (default)
 * - 'drop-oldest': Remove oldest item to make room for new item
 * - 'drop-latest': Drop the new item when buffer is full
 * - 'error': Throw error when buffer is full
 * - 'sample': Keep only values within a time window (most recent)
 */
export type BackpressureStrategy =
	| "block"
	| "drop-oldest"
	| "drop-latest"
	| "error"
	| "sample";

/**
 * Options for creating a Channel.
 */
export interface ChannelOptions<T> {
	/** Buffer capacity (default: 0 for unbuffered) */
	capacity?: number;
	/** Backpressure strategy (default: 'block') */
	backpressure?: BackpressureStrategy;
	/** Callback invoked when a value is dropped due to backpressure */
	onDrop?: (value: T) => void;
	/** Time window in milliseconds for 'sample' strategy (default: 1000) */
	sampleWindow?: number;
}
