/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

// Re-export batch utility
export { batch } from "./batch.js";
// Re-export classes
export { BroadcastChannel } from "./broadcast-channel.js";
// Re-export cancellation utilities
export {
	abortPromise,
	onAbort,
	raceSignals,
	throwIfAborted,
	whenAborted,
} from "./cancellation.js";
export { Channel } from "./channel.js";
export { CircuitBreaker } from "./circuit-breaker.js";
export { DeadlockDetector } from "./deadlock-detector.js";
// Re-export standalone functions
export { scope } from "./factory.js";
// Re-export logger
export { ConsoleLogger, createLogger, NoOpLogger } from "./logger.js";
// Re-export metrics exporter
export { exportMetrics, MetricsReporter } from "./metrics-exporter.js";
export { parallel } from "./parallel.js";
export { poll } from "./poll.js";
export { Profiler } from "./profiler.js";
export { race } from "./race.js";
// Re-export rate limiting utilities
export { debounce, throttle } from "./rate-limiting.js";
export { ResourcePool } from "./resource-pool.js";
// Re-export retry strategies
export {
	decorrelatedJitter,
	exponentialBackoff,
	fullJitterBackoff,
	jitter,
	linear,
} from "./retry-strategies.js";
export type {
	ScopeOptions,
	ScopeOptions as ScopeOptionsType,
} from "./scope.js";
// Re-export scope-related
export { AsyncDisposableResource, Scope } from "./scope.js";
export { Semaphore } from "./semaphore.js";
export { stream } from "./stream.js";
export { Task } from "./task.js";
// Re-export types
export type {
	CircuitBreakerOptions,
	CircuitState,
	Context,
	DeadlockDetectionOptions,
	DebounceOptions,
	Failure,
	Logger,
	MetricsExportOptions,
	ParallelAggregateResult,
	PollController,
	PollOptions,
	RaceOptions,
	ResourcePoolOptions,
	Result,
	ScopeHooks,
	ScopeLoggingOptions,
	ScopeMetrics,
	ScopeProfileReport,
	SelectOptions,
	Span,
	SpanOptions,
	Success,
	TaskOptions,
	TaskProfile,
	ThrottleOptions,
	Tracer,
} from "./types.js";
export { SpanStatusCode } from "./types.js";

// Testing utilities are available via 'go-go-scope/testing' import
