/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

// Re-export classes
export { BroadcastChannel } from "./broadcast-channel.js";
// Re-export cache utilities
export { createCache, InMemoryCache } from "./cache.js";
// Re-export cancellation utilities
export {
	abortPromise,
	onAbort,
	whenAborted,
} from "./cancellation.js";
export { Channel } from "./channel.js";
export { CircuitBreaker } from "./circuit-breaker.js";
export { DeadlockDetector } from "./deadlock-detector.js";
export { AbortError, ChannelFullError, UnknownError } from "./errors.js";
// Re-export standalone functions
export { scope } from "./factory.js";
// Re-export idempotency utilities
export {
	createIdempotencyProvider,
	InMemoryIdempotencyProvider,
} from "./idempotency.js";
// Re-export logger
export { ConsoleLogger, createLogger, NoOpLogger } from "./logger.js";
// Re-export metrics exporter
export { exportMetrics, MetricsReporter } from "./metrics-exporter.js";
export { parallel } from "./parallel.js";
// Re-export performance utilities
export {
	type BenchmarkOptions,
	type BenchmarkResult,
	benchmark,
	MemoryTracker,
	type PerformanceMetrics,
	PerformanceMonitor,
	type PerformanceMonitorOptions,
	type PerformanceSnapshot,
	performanceMonitor,
} from "./performance.js";
// Persistence types (re-exported from persistence module)
export type {
	CacheProvider,
	CacheStats,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	IdempotencyProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "./persistence/types.js";
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
// Semaphore is used internally for concurrency limiting, not exported as public API
// Stream is available via @go-go-scope/stream package
export { getTaskPoolMetrics, resetTaskPoolMetrics, Task } from "./task.js";
// Re-export types
export type {
	BackpressureStrategy,
	ChannelOptions,
	CircuitBreakerOptions,
	CircuitState,
	Context,
	DeadlockDetectionOptions,
	DebounceOptions,
	FactoryResult,
	Failure,
	Histogram,
	HistogramSnapshot,
	Logger,
	MetricsExportOptions,
	ParallelResults,
	PersistenceProviders,
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
export { type ScopePlugin, installPlugins } from "./plugin.js";

// Testing utilities are available via 'go-go-scope/testing' import

// Scheduler module - available via 'go-go-scope/scheduler' import
// import { Scheduler, CronPresets } from 'go-go-scope/scheduler'
// import { RedisJobStorage, SQLJobStorage } from 'go-go-scope/scheduler'
// See src/scheduler/index.ts for full API
