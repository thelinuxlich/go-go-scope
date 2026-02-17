/**
 * Type definitions and interfaces for go-go-scope
 */

import type { Context, Span, SpanOptions, Tracer } from "@opentelemetry/api";

// Re-export OpenTelemetry types for users
export type { Context, Span, SpanOptions, Tracer };

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
 * Options for spawning a task with tracing.
 */
export interface TaskOptions<E extends Error = Error> {
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
	errorClass?: ErrorConstructor<E>;
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
}

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
	beforeTask?: (taskName: string, taskIndex: number) => void;
	/**
	 * Called after a task completes (success or failure)
	 */
	afterTask?: (taskName: string, durationMs: number, error?: unknown) => void;
	/**
	 * Called when the scope is cancelled
	 */
	onCancel?: (reason: unknown) => void;
	/**
	 * Called when a resource is disposed
	 */
	onDispose?: (resourceIndex: number, error?: unknown) => void;
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
 * Metrics collected by a scope
 */
export interface ScopeMetrics {
	/** Number of tasks spawned */
	tasksSpawned: number;
	/** Number of tasks completed successfully */
	tasksCompleted: number;
	/** Number of tasks that failed */
	tasksFailed: number;
	/** Total task execution time in milliseconds */
	totalTaskDuration: number;
	/** Average task duration in milliseconds */
	avgTaskDuration: number;
	/** 95th percentile task duration (approximation) */
	p95TaskDuration: number;
	/** Number of resources registered for cleanup */
	resourcesRegistered: number;
	/** Number of resources successfully disposed */
	resourcesDisposed: number;
	/** Scope duration in milliseconds (only available after disposal) */
	scopeDuration?: number;
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
	 * Optional tracer for OpenTelemetry integration.
	 */
	tracer?: Tracer;
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
 * Deadlock detection configuration
 */
export interface DeadlockDetectionOptions {
	/** Timeout in milliseconds before warning about potential deadlock */
	timeout: number;
	/** Callback when potential deadlock is detected */
	onDeadlock?: (waitingTasks: string[]) => void;
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
}

/**
 * Metrics export format options
 */
export interface MetricsExportOptions {
	/** Export format */
	format: "json" | "prometheus" | "otel";
	/** Scope name prefix for metrics */
	prefix?: string;
	/** Include timestamps (default: true). Set to false for Prometheus Pushgateway. */
	includeTimestamps?: boolean;
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
 * This preserves the individual types of each factory's return value
 */
export type ParallelResults<
	T extends readonly ((signal: AbortSignal) => Promise<unknown>)[],
> = {
	[K in keyof T]: Result<unknown, FactoryResult<T[K]>>;
};

/**
 * Task profiling information
 */
export interface TaskProfile {
	/** Task name */
	name: string;
	/** Task index */
	index: number;
	/** Time spent in each pipeline stage (ms) */
	stages: {
		circuitBreaker?: number;
		concurrency?: number;
		retry?: number;
		timeout?: number;
		execution: number;
	};
	/** Total duration (ms) */
	totalDuration: number;
	/** Number of retry attempts */
	retryAttempts: number;
	/** Whether task succeeded */
	succeeded: boolean;
}

/**
 * Profile report for a scope
 */
export interface ScopeProfileReport {
	/** Per-task profiles */
	tasks: TaskProfile[];
	/** Aggregated statistics */
	statistics: {
		totalTasks: number;
		successfulTasks: number;
		failedTasks: number;
		avgTotalDuration: number;
		avgExecutionDuration: number;
		totalRetryAttempts: number;
	};
}

// Re-export persistence types
export type {
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceProviders,
} from "./persistence/types.js";
