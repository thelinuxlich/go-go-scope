/**
 * Type definitions and interfaces for go-go-scope
 */

import type { Context, Span, SpanOptions, Tracer } from "@opentelemetry/api";

// Re-export OpenTelemetry types for users
export type { Context, Span, SpanOptions, Tracer };

export type Result<E, T> = readonly [E | undefined, T | undefined];
export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];

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
