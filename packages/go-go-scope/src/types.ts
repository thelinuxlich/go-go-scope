/**
 * Type definitions and interfaces for go-go-scope
 *
 * Provides core types for structured concurrency including Result tuples,
 * task options, scope configuration, and various utility types for
 * error handling, retry strategies, and resource management.
 */

/**
 * Represents a successful Result tuple with a value and no error.
 * The first element is undefined (no error), the second is the success value.
 *
 * @template T - The type of the success value
 *
 * @example
 * ```typescript
 * import { Success } from 'go-go-scope';
 *
 * function divide(a: number, b: number): Success<number> | Failure<Error> {
 *   if (b === 0) {
 *     return [new Error('Division by zero'), undefined];
 *   }
 *   return [undefined, a / b];
 * }
 *
 * const [err, result] = divide(10, 2);
 * if (!err) {
 *   console.log(result); // 5
 * }
 * ```
 */
export type Success<T> = readonly [undefined, T];

/**
 * Represents a failed Result tuple with an error and no value.
 * The first element is the error, the second is undefined (no value).
 *
 * @template E - The type of the error
 *
 * @example
 * ```typescript
 * import { Failure } from 'go-go-scope';
 *
 * function parseJSON(json: string): Success<object> | Failure<Error> {
 *   try {
 *     return [undefined, JSON.parse(json)];
 *   } catch (e) {
 *     return [e as Error, undefined];
 *   }
 * }
 *
 * const [err, data] = parseJSON('invalid json');
 * if (err) {
 *   console.error('Parse failed:', err.message);
 * }
 * ```
 */
export type Failure<E> = readonly [E, undefined];

/**
 * Represents a Result tuple that can be either success or failure.
 * Follows the pattern [error, value] where exactly one is defined.
 *
 * @template E - The type of the error
 * @template T - The type of the success value
 *
 * @example
 * ```typescript
 * import { Result } from 'go-go-scope';
 *
 * async function fetchUser(id: string): Promise<Result<Error, User>> {
 *   try {
 *     const user = await db.users.findById(id);
 *     return [undefined, user];
 *   } catch (error) {
 *     return [error as Error, undefined];
 *   }
 * }
 *
 * // Using with go-go-scope tasks
 * await using s = scope();
 *
 * const [err, user] = await s.task(() => fetchUser('123'));
 * if (err) {
 *   console.error('Failed to fetch user:', err);
 * } else {
 *   console.log('User:', user.name);
 * }
 * ```
 */
export type Result<E, T> = Success<T> | Failure<E>;

/**
 * Transferable type for zero-copy data transfer to workers.
 * In Node.js, this includes ArrayBuffer and MessagePort.
 *
 * Used when passing data to worker threads to enable efficient
 * memory transfer without copying.
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope';
 *
 * const buffer = new ArrayBuffer(1024 * 1024); // 1MB
 *
 * await using s = scope();
 * const [err, result] = await s.task(
 *   ({ data }) => {
 *     // Process in worker thread with zero-copy transfer
 *     const view = new Uint8Array(data.buffer);
 *     return view.reduce((a, b) => a + b, 0);
 *   },
 *   {
 *     worker: true,
 *     data: { buffer } // ArrayBuffer is transferred, not copied
 *   }
 * );
 * ```
 */
export type Transferable = ArrayBuffer;

/**
 * Error class constructor type for typed error handling.
 * Used to specify which error class should wrap task errors.
 *
 * @template E - The error type the constructor creates
 *
 * @example
 * ```typescript
 * import { ErrorConstructor } from 'go-go-scope';
 *
 * class DatabaseError extends Error {
 *   readonly _tag = 'DatabaseError' as const;
 * }
 *
 * // Use as a constructor type
 * function createError(
 *   ErrorClass: ErrorConstructor<DatabaseError>,
 *   message: string
 * ): DatabaseError {
 *   return new ErrorClass(message);
 * }
 * ```
 */
export type ErrorConstructor<E> = new (
	message: string,
	options?: { cause?: unknown },
) => E;

/**
 * Retry delay function type.
 * Called for each retry attempt to determine how long to wait.
 *
 * @param attempt - The current attempt number (1-based, after first failure)
 * @param error - The error that caused the retry
 * @returns The delay in milliseconds before the next attempt
 *
 * @example
 * ```typescript
 * import { RetryDelayFn } from 'go-go-scope';
 *
 * const customDelay: RetryDelayFn = (attempt, error) => {
 *   // Exponential backoff with base 100ms
 *   return Math.min(100 * Math.pow(2, attempt - 1), 5000);
 * };
 *
 * await using s = scope();
 * const [err, result] = await s.task(
 *   () => fetchData(),
 *   { retry: { max: 3, delay: customDelay } }
 * );
 * ```
 */
export type RetryDelayFn = (attempt: number, error: unknown) => number;

/**
 * Predefined retry delay strategies.
 * Provides built-in implementations for common retry patterns.
 *
 * @example
 * ```typescript
 * import { scope, RetryStrategies } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * // Using exponential backoff
 * const [err1, result1] = await s.task(
 *   () => fetchData(),
 *   { retry: 'exponential' }  // Shorthand for exponential backoff
 * );
 *
 * // Using custom exponential backoff with jitter
 * const [err2, result2] = await s.task(
 *   () => fetchData(),
 *   {
 *     retry: {
 *       max: 5,
 *       delay: s.retryStrategies.exponentialBackoff({
 *         initial: 100,
 *         max: 10000,
 *         jitter: 0.3  // 30% randomization
 *       })
 *     }
 *   }
 * );
 * ```
 */
export interface RetryStrategies {
	/**
	 * Exponential backoff with optional jitter.
	 *
	 * @param options - Configuration options
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
	 *
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
	 *
	 * @param baseDelay - Base delay in ms
	 * @param increment - Amount to add each attempt
	 * @returns Delay function for retry option
	 *
	 * @example
	 * ```typescript
	 * retry: {
	 *   delay: linear(100, 50)  // 100ms, 150ms, 200ms, 250ms...
	 * }
	 * ```
	 */
	linear(baseDelay: number, increment: number): RetryDelayFn;
}

/**
 * Checkpoint context passed to task functions when checkpoint is configured.
 * Enables long-running tasks to save progress and resume after interruption.
 *
 * @template T - The type of checkpoint data being saved
 *
 * @example
 * ```typescript
 * import { scope, CheckpointContext } from 'go-go-scope';
 *
 * await using s = scope({
 *   persistence: { checkpoint: new FileCheckpointProvider('./checkpoints') }
 * });
 *
 * const [err, result] = await s.task(
 *   async ({ checkpoint }: { checkpoint?: CheckpointContext<{ processed: number }> }) => {
 *     const data = await loadLargeDataset();
 *     let processed = checkpoint?.data?.processed ?? 0;
 *
 *     for (let i = processed; i < data.length; i++) {
 *       await processItem(data[i]);
 *
 *       // Save progress every 100 items
 *       if (i % 100 === 0) {
 *         await checkpoint?.save({ processed: i });
 *       }
 *     }
 *
 *     return { totalProcessed: data.length };
 *   },
 *   { checkpoint: { interval: 60000 } }
 * );
 * ```
 */
export interface CheckpointContext<T = unknown> {
	/** Save a checkpoint with the given data */
	save: (data: T) => Promise<void>;
	/** Load the current checkpoint data if resuming */
	data?: T;
}

/**
 * Progress tracking context passed to task functions.
 * Allows tasks to report their progress percentage and estimated time remaining.
 *
 * @example
 * ```typescript
 * import { scope, ProgressContext } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const [err, result] = await s.task(
 *   async ({ progress }: { progress?: ProgressContext }) => {
 *     const items = await fetchItems();
 *
 *     for (let i = 0; i < items.length; i++) {
 *       await processItem(items[i]);
 *
 *       // Update progress percentage
 *       progress?.update(Math.round((i / items.length) * 100));
 *     }
 *
 *     return items.length;
 *   },
 *   { checkpoint: {} }  // Enable progress tracking
 * );
 *
 * // Subscribe to progress updates externally
 * // (requires access to the progress context)
 * ```
 */
export interface ProgressContext {
	/** Update the progress percentage (0-100) */
	update: (percentage: number) => void;
	/** Get current progress */
	get: () => { percentage: number; eta?: number };
	/** Subscribe to progress updates */
	onUpdate: (
		callback: (progress: { percentage: number; eta?: number }) => void,
	) => () => void;
}

/**
 * Context passed to task functions.
 * Contains all utilities and information available within a task execution.
 *
 * @template Services - The type of services available from the scope
 *
 * @example
 * ```typescript
 * import { scope, TaskContext } from 'go-go-scope';
 *
 * type MyServices = { db: Database; cache: Cache };
 *
 * await using s = scope<MyServices>({
 *   services: { db: new Database(), cache: new Cache() }
 * });
 *
 * const [err, result] = await s.task(
 *   async (ctx: TaskContext<MyServices>) => {
 *     // Access services
 *     const user = await ctx.services.db.findUser(1);
 *
 *     // Check for cancellation
 *     if (ctx.signal.aborted) {
 *       throw new Error('Cancelled');
 *     }
 *
 *     // Log with task context
 *     ctx.logger.info('Found user', { userId: user.id });
 *
 *     // Access context data
 *     const requestId = ctx.context.requestId;
 *
 *     return user;
 *   }
 * );
 * ```
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
	/** Checkpoint utilities (available when checkpoint provider is configured) */
	checkpoint?: CheckpointContext<unknown>;
	/** Progress tracking utilities (available when checkpoint provider is configured) */
	progress?: ProgressContext;
}

/**
 * Base options for spawning a task with tracing (without error class options).
 */
interface TaskOptionsBase {
	/**
	 * Unique task identifier.
	 * Used for checkpointing, idempotency, and observability.
	 * If not provided, a generated ID will be used.
	 */
	id?: string;
	/**
	 * OpenTelemetry tracing options.
	 */
	otel?: {
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
				max?: number;
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
				if?: (error: unknown) => boolean;
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
	 * Circuit breaker configuration for this specific task.
	 * When set, the task will execute through a circuit breaker with these options.
	 * Takes precedence over any scope-level circuit breaker.
	 */
	circuitBreaker?: CircuitBreakerOptions;
	/**
	 * Task priority when scope has concurrency limits.
	 * Higher priority tasks are executed before lower priority ones.
	 * Default: 0
	 */
	priority?: number;
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
	/**
	 * Data to pass to worker thread when using `worker: true`.
	 * Any ArrayBuffers in the data object will be automatically transferred
	 * (not copied) for zero-copy performance.
	 *
	 * @example
	 * ```typescript
	 * const buffer = new ArrayBuffer(1024 * 1024); // 1MB buffer
	 *
	 * const [err, result] = await s.task(
	 *   ({ data }) => {
	 *     // Process buffer in worker (zero-copy transfer)
	 *     const view = new Uint8Array(data.buffer);
	 *     return view.reduce((a, b) => a + b, 0);
	 *   },
	 *   {
	 *     worker: true,
	 *     data: { buffer } // ArrayBuffers automatically transferred
	 *   }
	 * )
	 *
	 * // Buffer is now detached (transferred to worker)
	 * console.log(buffer.byteLength); // 0
	 * ```
	 */
	data?: unknown;
	/**
	 * Checkpoint configuration for long-running tasks.
	 * Requires a checkpoint provider configured in scope persistence.
	 *
	 * When checkpoint is configured, the task receives `checkpoint` and `progress`
	 * utilities in its context for saving and tracking progress.
	 *
	 * @example
	 * ```typescript
	 * await using s = scope({
	 *   persistence: { checkpoint: new FileCheckpointProvider('./checkpoints') }
	 * })
	 *
	 * const [err, result] = await s.task(
	 *   async ({ checkpoint, progress }) => {
	 *     const data = await loadData()
	 *     let processed = checkpoint?.data?.processed ?? 0
	 *
	 *     for (let i = processed; i < data.length; i++) {
	 *       await processItem(data[i])
	 *       progress.update((i / data.length) * 100)
	 *
	 *       if (i % 100 === 0) {
	 *         await checkpoint.save({ processed: i })
	 *       }
	 *     }
	 *
	 *     return { total: data.length }
	 *   },
	 *   {
	 *     id: 'data-processing-job',
	 *     checkpoint: {
	 *       interval: 60000,  // Auto-checkpoint every minute
	 *       onCheckpoint: (cp) => console.log(`Checkpoint ${cp.sequence} saved`),
	 *       onResume: (cp) => console.log(`Resumed from checkpoint ${cp.sequence}`)
	 *     }
	 *   }
	 * )
	 * ```
	 */
	checkpoint?: {
		/** Auto-checkpoint interval in milliseconds */
		interval?: number;
		/** Callback when a checkpoint is saved */
		onCheckpoint?: (
			checkpoint: import("./persistence/types.js").Checkpoint<unknown>,
		) => void;
		/** Callback when resuming from a checkpoint */
		onResume?: (
			checkpoint: import("./persistence/types.js").Checkpoint<unknown>,
		) => void;
		/** Max checkpoints to keep (default: 10) */
		maxCheckpoints?: number;
	};
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
 *
 * @template E - The error type for typed error handling
 *
 * @example
 * ```typescript
 * import { scope, TaskOptions } from 'go-go-scope';
 *
 * // Basic options
 * const options1: TaskOptions = {
 *   timeout: 5000,
 *   retry: { max: 3, delay: 1000 }
 * };

 * // With error class
 * class MyError extends Error { readonly _tag = 'MyError' as const; }
 *
 * const options2: TaskOptions<MyError> = {
 *   errorClass: MyError,
 *   timeout: 10000
 * };
 *
 * await using s = scope();
 * const [err, result] = await s.task(() => fetchData(), options2);
 * // err is typed as MyError | undefined
 * ```
 */
export type TaskOptions<E extends Error = Error> =
	| TaskOptionsWithErrorClass<E>
	| TaskOptionsWithSystemErrorClass<E>
	| TaskOptionsBase;

/**
 * Worker module specification for loading tasks from files.
 * Use this instead of a function to load code from a worker file.
 *
 * @template TData - The type of data passed to the worker
 * @template TResult - The type of result returned from the worker
 *
 * @example
 * ```typescript
 * // Load from worker file
 * const [err, result] = await s.task(
 *   { module: './workers/compute.js', export: 'fibonacci' },
 *   { data: { n: 40 } }
 * )
 *
 * // Worker file (workers/compute.js)
 * export function fibonacci({ data }) {
 *   // Full access to imports, closures, etc.
 *   function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }
 *   return fib(data.n)
 * }
 * ```
 */
export interface WorkerModuleSpec<TData = unknown, TResult = unknown> {
	/** Path to the worker module file */
	module: string;
	/** Named export to use (default: 'default') */
	export?: string;
	/** Validate module exists and export is callable before spawning (default: true) */
	validate?: boolean;
	/** Cache the imported module for reuse (default: true) */
	cache?: boolean;
	/** Enable source map support for proper stack traces from TypeScript (default: true) */
	sourceMap?: boolean;
	/** @internal Type marker for data type inference */
	_data?: TData;
	/** @internal Type marker for result type inference */
	_result?: TResult;
}

/**
 * Span status codes (from OpenTelemetry)
 * Used to indicate the status of a traced operation.
 *
 * @example
 * ```typescript
 * import { SpanStatusCode } from 'go-go-scope';
 *
 * // In an OpenTelemetry span callback
 * span.setStatus({
 *   code: SpanStatusCode.ERROR,
 *   message: 'Database connection failed'
 * });
 *
 * span.setStatus({ code: SpanStatusCode.OK });
 * ```
 */
export enum SpanStatusCode {
	/** Status has not been set (default) */
	UNSET = 0,
	/** Operation completed successfully */
	OK = 1,
	/** Operation failed with an error */
	ERROR = 2,
}

/**
 * Lifecycle hooks for scope events.
 * Register callbacks to be notified of scope and task lifecycle events.
 *
 * @example
 * ```typescript
 * import { scope, ScopeHooks } from 'go-go-scope';
 *
 * const hooks: ScopeHooks = {
 *   beforeTask: (name, index) => {
 *     console.log(`Starting task ${name} (#${index})`);
 *   },
 *   afterTask: (name, duration, error, index) => {
 *     if (error) {
 *       console.error(`Task ${name} failed after ${duration}ms`);
 *     } else {
 *       console.log(`Task ${name} completed in ${duration}ms`);
 *     }
 *   },
 *   onCancel: (reason) => {
 *     console.log('Scope cancelled:', reason);
 *   }
 * };
 *
 * await using s = scope({ hooks });
 * ```
 */
export interface ScopeHooks {
	/**
	 * Called before a task starts execution
	 *
	 * @param taskName - The name of the task being started
	 * @param taskIndex - The unique index of the task
	 * @param options - The task options that were provided
	 */
	beforeTask?: (
		taskName: string,
		taskIndex: number,
		options?: TaskOptions,
	) => void;
	/**
	 * Called after a task completes (success or failure)
	 *
	 * @param taskName - The name of the completed task
	 * @param durationMs - How long the task took in milliseconds
	 * @param error - The error if the task failed, undefined on success
	 * @param taskIndex - The unique index of the task
	 */
	afterTask?: (
		taskName: string,
		durationMs: number,
		error?: unknown,
		taskIndex?: number,
	) => void;
	/**
	 * Called when the scope is cancelled
	 *
	 * @param reason - The cancellation reason
	 */
	onCancel?: (reason: unknown) => void;
	/**
	 * Called when a resource is disposed
	 *
	 * @param resourceIndex - The index of the resource being disposed
	 * @param error - Any error that occurred during disposal
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
 * Options for debounce function.
 * Controls the timing and behavior of debounced operations.
 *
 * @example
 * ```typescript
 * import { scope, DebounceOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const options: DebounceOptions = {
 *   wait: 500,      // Wait 500ms after last call
 *   leading: true,  // Execute on first call
 *   trailing: true  // Execute after wait period
 * };
 *
 * const debounced = s.debounce(async (query: string) => {
 *   return searchAPI(query);
 * }, options);
 *
 * // Called on leading edge (immediately)
 * debounced('a');
 *
 * // Subsequent calls reset the timer
 * debounced('ab');
 * debounced('abc'); // Only this result is used (trailing edge)
 * ```
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
 * Options for throttle function.
 * Controls the timing and behavior of throttled operations.
 *
 * @example
 * ```typescript
 * import { scope, ThrottleOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const options: ThrottleOptions = {
 *   interval: 1000, // Execute at most once per second
 *   leading: true,  // Execute on first call
 *   trailing: false // Don't execute after interval
 * };
 *
 * const throttled = s.throttle(async () => {
 *   return fetchUpdates();
 * }, options);
 *
 * // Called immediately (leading edge)
 * throttled();
 *
 * // Ignored (within interval)
 * throttled();
 * throttled();
 *
 * // Called after interval passes
 * setTimeout(() => throttled(), 1000);
 * ```
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
 * Represents the current state of a circuit breaker.
 *
 * - `'closed'` - Normal operation, requests pass through
 * - `'open'` - Failure threshold exceeded, requests fail fast
 * - `'half-open'` - Testing if service has recovered
 *
 * @example
 * ```typescript
 * import { scope, CircuitBreakerState } from 'go-go-scope';
 *
 * await using s = scope({
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     resetTimeout: 30000,
 *     onStateChange: (from: CircuitBreakerState, to: CircuitBreakerState) => {
 *       console.log(`Circuit breaker: ${from} -> ${to}`);
 *     }
 *   }
 * });
 * ```
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Options for configuring a circuit breaker in a scope.
 * Pass these to `scope({ circuitBreaker: {...} })` to enable circuit breaking
 * for all tasks spawned within that scope.
 *
 * @example
 * ```typescript
 * import { scope, CircuitBreakerOptions } from 'go-go-scope';
 *
 * const options: CircuitBreakerOptions = {
 *   failureThreshold: 5,     // Open after 5 failures
 *   resetTimeout: 30000,     // Try again after 30 seconds
 *   successThreshold: 2,     // Require 2 successes to close
 *   onStateChange: (from, to, count) => {
 *     console.log(`Breaker: ${from} -> ${to} (failures: ${count})`);
 *   }
 * };
 *
 * await using s = scope({ circuitBreaker: options });
 *
 * // All tasks in this scope use the circuit breaker
 * const [err, result] = await s.task(() => callExternalAPI());
 * ```
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
 * @deprecated Use {@link CircuitBreakerState} instead
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Options for the race function.
 * Configures the behavior of racing multiple tasks.
 *
 * @example
 * ```typescript
 * import { scope, RaceOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const options: RaceOptions = {
 *   requireSuccess: true,  // Only successful results count
 *   timeout: 5000,         // Fail if no winner in 5 seconds
 *   concurrency: 2,        // Run at most 2 tasks concurrently
 *   staggerDelay: 100      // Start tasks 100ms apart
 * };
 *
 * const [err, winner] = await s.race([
 *   () => fetchFromPrimary(),
 *   () => fetchFromBackup(),
 *   () => fetchFromCache()
 * ], options);
 * ```
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
	/**
	 * Use worker threads for CPU-intensive tasks.
	 * When specified, tasks run in worker threads for true parallelism.
	 * @default undefined (runs in main thread)
	 *
	 * @example
	 * ```typescript
	 * await race([
	 *   () => computeHash(data1),
	 *   () => computeHash(data2),
	 * ], {
	 *   workers: { threads: 2, idleTimeout: 30000 }
	 * })
	 * ```
	 */
	workers?: {
		/** Number of worker threads (default: CPU count - 1) */
		threads: number;
		/** Idle timeout in milliseconds (default: 60000) */
		idleTimeout?: number;
	};
	/**
	 * Staggered start - delay between starting each task.
	 * Useful for "hedging" pattern: start 1 task, wait, start next if still running.
	 * @default undefined (all tasks start immediately)
	 *
	 * @example
	 * ```typescript
	 * // Start first task immediately, wait 50ms, start second, wait 50ms, start third
	 * await race([
	 *   () => fetchFromPrimary(),
	 *   () => fetchFromBackup(),
	 *   () => fetchFromFallback(),
	 * ], { staggerDelay: 50 })
	 * ```
	 */
	staggerDelay?: number;
	/**
	 * Maximum number of concurrent tasks when using staggered start.
	 * If not specified, all tasks will eventually start if race continues.
	 * @default undefined (no limit)
	 *
	 * @example
	 * ```typescript
	 * // Start first task, then add up to 2 more (3 total running)
	 * await race([...], { staggerDelay: 50, maxConcurrent: 3 })
	 * ```
	 */
	staggerMaxConcurrent?: number;
}

/**
 * Options for the poll function.
 * Configures polling behavior including interval and immediate execution.
 *
 * @example
 * ```typescript
 * import { scope, PollOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const options: PollOptions = {
 *   interval: 5000,   // Poll every 5 seconds
 *   immediate: true,  // Run immediately on start
 *   signal: abortSignal  // Optional external cancellation
 * };
 *
 * const poller = s.poll(async () => {
 *   const status = await checkJobStatus();
 *   if (status === 'complete') {
 *     return { done: true, value: status };
 *   }
 *   return { done: false };  // Continue polling
 * }, options);
 *
 * // Start polling
 * poller.start();
 *
 * // Check status
 * console.log(poller.status());
 *
 * // Stop polling
 * using _ = poller;  // Auto-stop on scope disposal
 * ```
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
 *
 * @example
 * ```typescript
 * import { scope, PollController } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const poller: PollController = s.poll(async () => {
 *   const health = await checkHealth();
 *   return { done: !health.healthy, value: health };
 * }, { interval: 10000 });
 *
 * // Manually control polling
 * poller.start();
 *
 * const status = poller.status();
 * console.log(`Running: ${status.running}, Count: ${status.pollCount}`);
 *
 * if (status.timeUntilNext > 0) {
 *   console.log(`Next poll in ${status.timeUntilNext}ms`);
 * }
 *
 * poller.stop();
 * ```
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
 * Options for select() with timeout support.
 * Controls the behavior of the select statement for channel operations.
 *
 * @example
 * ```typescript
 * import { scope, SelectOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * const ch1 = s.channel<string>();
 * const ch2 = s.channel<number>();
 *
 * const options: SelectOptions = {
 *   timeout: 5000  // Fail if no case is ready within 5 seconds
 * };
 *
 * const result = await s.select([
 *   { case: ch1.receive(), fn: (msg) => ({ type: 'string', value: msg }) },
 *   { case: ch2.receive(), fn: (num) => ({ type: 'number', value: num }) }
 * ], options);
 *
 * if (result) {
 *   console.log('Received:', result);
 * } else {
 *   console.log('Timeout - no channel ready');
 * }
 * ```
 */
export interface SelectOptions {
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Logger interface for structured logging integration.
 * Implement this interface to provide custom logging backends.
 *
 * @example
 * ```typescript
 * import { Logger } from 'go-go-scope';
 *
 * // Custom logger implementation for Winston
 * class WinstonLogger implements Logger {
 *   constructor(private winston: WinstonLogger) {}
 *
 *   debug(message: string, ...args: unknown[]): void {
 *     this.winston.debug(message, ...args);
 *   }
 *
 *   info(message: string, ...args: unknown[]): void {
 *     this.winston.info(message, ...args);
 *   }
 *
 *   warn(message: string, ...args: unknown[]): void {
 *     this.winston.warn(message, ...args);
 *   }
 *
 *   error(message: string, ...args: unknown[]): void {
 *     this.winston.error(message, ...args);
 *   }
 * }
 *
 * // Use with scope
 * await using s = scope({
 *   name: 'my-service',
 *   logger: new WinstonLogger(winston)
 * });
 * ```
 */
export interface Logger {
	/**
	 * Log a debug message.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: string, ...args: unknown[]): void;
	/**
	 * Log an info message.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	info(message: string, ...args: unknown[]): void;
	/**
	 * Log a warning message.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	warn(message: string, ...args: unknown[]): void;
	/**
	 * Log an error message.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	error(message: string, ...args: unknown[]): void;
}

/**
 * Options for scope with logging.
 * Configures logging behavior when creating a scope.
 *
 * @example
 * ```typescript
 * import { scope, ScopeLoggingOptions, ConsoleLogger } from 'go-go-scope';
 *
 * const options: ScopeLoggingOptions = {
 *   logger: new ConsoleLogger('my-app', 'debug'),
 *   logLevel: 'debug'
 * };
 *
 * await using s = scope({
 *   name: 'worker',
 *   ...options
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * import { DisposableScope } from 'go-go-scope';
 *
 * function createRateLimiter(scope: DisposableScope) {
 *   return {
 *     async acquire() {
 *       if (scope.isDisposed) {
 *         throw new Error('Scope is disposed');
 *       }
 *       if (scope.signal.aborted) {
 *         throw new Error('Scope is aborted');
 *       }
 *       // Acquire rate limit token
 *     }
 *   };
 * }
 * ```
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
 * Resource pool configuration.
 * Options for creating and managing a pool of reusable resources.
 *
 * @template T - The type of resource being pooled
 *
 * @example
 * ```typescript
 * import { scope, ResourcePoolOptions } from 'go-go-scope';
 *
 * type DatabaseConnection = { query: (sql: string) => Promise<unknown[]> };
 *
 * const options: ResourcePoolOptions<DatabaseConnection> = {
 *   create: async () => {
 *     return createConnection({ host: 'localhost', port: 5432 });
 *   },
 *   destroy: async (conn) => {
 *     await conn.close();
 *   },
 *   min: 2,              // Keep at least 2 connections ready
 *   max: 10,             // Maximum 10 connections
 *   acquireTimeout: 5000, // Wait up to 5 seconds for a connection
 *   healthCheck: async (conn) => {
 *     try {
 *       await conn.query('SELECT 1');
 *       return { healthy: true };
 *     } catch (e) {
 *       return { healthy: false, message: String(e) };
 *     }
 *   },
 *   healthCheckInterval: 30000  // Check health every 30 seconds
 * };
 *
 * await using s = scope();
 * const pool = s.resourcePool(options);
 *
 * await using conn = await pool.acquire();
 * const results = await conn.query('SELECT * FROM users');
 * ```
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
	 *
	 * @param resource - The resource to check
	 * @returns Health check result with healthy flag and optional message
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
 * Helper type to extract the promise resolve type from a factory function.
 * Extracts the return type from a task factory function.
 *
 * @template T - The factory function type
 *
 * @example
 * ```typescript
 * import { FactoryResult } from 'go-go-scope';
 *
 * type MyFactory = (signal: AbortSignal) => Promise<{ id: number; name: string }>;
 *
 * type Result = FactoryResult<MyFactory>;
 * // Result is { id: number; name: string }
 * ```
 */
export type FactoryResult<T> = T extends (
	signal: AbortSignal,
) => Promise<infer R>
	? R
	: never;

/**
 * Converts a tuple of factory functions to a tuple of Result types.
 * This preserves the individual types of each factory's return value.
 *
 * @template T - Tuple of factory function types
 * @template E - Error type (defaults to unknown, can be specified for typed errors)
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
 * Controls behavior when the channel buffer is full.
 *
 * - `'block'` - Wait until space is available (default)
 * - `'drop-oldest'` - Remove oldest item to make room for new item
 * - `'drop-latest'` - Drop the new item when buffer is full
 * - `'error'` - Throw error when buffer is full
 * - `'sample'` - Keep only values within a time window (most recent)
 *
 * @example
 * ```typescript
 * import { scope, BackpressureStrategy } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * // Block when full (default behavior)
 * const blockingCh = s.channel<number>(10, {
 *   backpressure: 'block' as BackpressureStrategy
 * });
 *
 * // Drop oldest items when full
 * const droppingCh = s.channel<number>(10, {
 *   backpressure: 'drop-oldest' as BackpressureStrategy,
 *   onDrop: (value) => console.log(`Dropped: ${value}`)
 * });
 *
 * // Throw error when full (for load shedding)
 * const errorCh = s.channel<number>(100, {
 *   backpressure: 'error' as BackpressureStrategy
 * });
 * ```
 */
export type BackpressureStrategy =
	| "block"
	| "drop-oldest"
	| "drop-latest"
	| "error"
	| "sample";

/**
 * Options for creating a Channel.
 * Configures buffer capacity, backpressure behavior, and callbacks.
 *
 * @template T - The type of values passing through the channel
 *
 * @example
 * ```typescript
 * import { scope, ChannelOptions } from 'go-go-scope';
 *
 * await using s = scope();
 *
 * // Buffered channel with drop-oldest strategy
 * const options: ChannelOptions<number> = {
 *   capacity: 100,
 *   backpressure: 'drop-oldest',
 *   onDrop: (value) => {
 *     metrics.increment('channel.dropped');
 *     console.warn(`Dropped value: ${value}`);
 *   }
 * };
 *
 * const ch = s.channel<number>(options);
 *
 * // Sample strategy for high-frequency data
 * const sampledCh = s.channel<SensorReading>({
 *   capacity: 10,
 *   backpressure: 'sample',
 *   sampleWindow: 1000  // Keep only one value per second
 * });
 * ```
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
