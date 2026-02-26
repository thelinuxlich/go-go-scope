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
export { AbortError, ChannelFullError, UnknownError } from "./errors.js";
// Re-export standalone functions
export { scope } from "./factory.js";
export type { GracefulShutdownOptions } from "./graceful-shutdown.js";
export {
	GracefulShutdownController,
	isShutdownRequested,
	setupGracefulShutdown,
	waitForShutdown,
} from "./graceful-shutdown.js";
// Re-export idempotency utilities
export {
	createIdempotencyProvider,
	InMemoryIdempotencyProvider,
} from "./idempotency.js";
// Re-export logger
export { ConsoleLogger, createLogger, NoOpLogger } from "./logger.js";
// parallel is available as scope.parallel()
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
export { installPlugins, type ScopePlugin } from "./plugin.js";
// poll is available as scope.poll()
export type {
	PrioritizedItem,
	PriorityChannelOptions,
	PriorityComparator,
} from "./priority-channel.js";
export { PriorityChannel } from "./priority-channel.js";
// race is available as scope.race()
// debounce and throttle are available as scope.debounce() and scope.throttle()
export type { HealthCheckResult } from "./resource-pool.js";
export { ResourcePool } from "./resource-pool.js";
// Re-export retry strategies
export {
	decorrelatedJitter,
	exponentialBackoff,
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
// Stream is available via @go-go-scope/stream package
export { Task } from "./task.js";
export type { TokenBucketOptions } from "./token-bucket.js";
export { TokenBucket } from "./token-bucket.js";
// Re-export types
export type {
	BackpressureStrategy,
	ChannelOptions,
	CircuitBreakerOptions,
	CircuitState,
	DebounceOptions,
	DisposableScope,
	FactoryResult,
	Failure,
	Logger,
	ParallelResults,
	PersistenceProviders,
	PollController,
	PollOptions,
	RaceOptions,
	ResourcePoolOptions,
	Result,
	ScopeHooks,
	ScopeLoggingOptions,
	SelectOptions,
	Success,
	TaskContext,
	TaskOptions,
	ThrottleOptions,
} from "./types.js";

// Testing utilities are available via 'go-go-scope/testing' import

// Scheduler module - available via 'go-go-scope/scheduler' import
// import { Scheduler, CronPresets } from 'go-go-scope/scheduler'
// import { RedisJobStorage, SQLJobStorage } from 'go-go-scope/scheduler'
// See src/scheduler/index.ts for full API
