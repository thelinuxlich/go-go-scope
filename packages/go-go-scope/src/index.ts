/**
 * go-go-scope - Structured concurrency using Explicit Resource Management
 *
 * Provides Scope and Task primitives for structured concurrent operations
 * with automatic cleanup via the `using` and `await using` syntax.
 */

// Re-export async iterable helpers
export {
	type AsyncIteratorFromOptions,
	asyncIteratorFrom,
	asyncIteratorFromWebSocket,
	buffer,
	catchError,
	concat,
	debounce,
	delay,
	empty,
	type FromArrayOptions,
	filter,
	first,
	fromArray,
	fromPromise,
	interval,
	isAsyncIterable,
	map,
	merge,
	of,
	skip,
	take,
	tap,
	throttle,
	toArray,
	zip,
} from "./async-iterable.js";
// Re-export classes
export { BroadcastChannel } from "./broadcast-channel.js";
// Re-export cache utilities
export { createCache, InMemoryCache } from "./cache.js";
// Re-export cache warming
export type {
	CacheWarmerConfig,
	CacheWarmingOptions,
} from "./cache-warming.js";
export {
	CacheWarmer,
	createWarmedCache,
	MultiTierCache,
} from "./cache-warming.js";
// Re-export cancellation utilities
export {
	abortPromise,
	onAbort,
	whenAborted,
} from "./cancellation.js";
export { Channel } from "./channel.js";
// Re-export checkpoint utilities
export {
	createCheckpointContext,
	createProgressContext,
	InMemoryCheckpointProvider,
} from "./checkpoint.js";
export type {
	CircuitBreakerEvent,
	EventHandler,
} from "./circuit-breaker.js";
// Stream is available via @go-go-scope/stream package
export { AbortError, ChannelFullError, UnknownError } from "./errors.js";
// race is available as scope.race()
// debounce and throttle are available as scope.debounce() and scope.throttle()
// Re-export EventEmitter
export {
	createEventEmitter,
	ScopedEventEmitter,
} from "./event-emitter.js";
// Re-export standalone functions
export { scope } from "./factory.js";
export type { GracefulShutdownOptions } from "./graceful-shutdown.js";
export { GracefulShutdownController } from "./graceful-shutdown.js";
// Re-export enhanced graceful shutdown
export type {
	EnhancedGracefulShutdownOptions,
	ShutdownState,
	ShutdownStrategy,
} from "./graceful-shutdown-enhanced.js";
export {
	createShutdownCoordinator,
	EnhancedGracefulShutdownController,
	ProcessLifecycle,
	processLifecycle,
	ShutdownCoordinator,
	setupEnhancedGracefulShutdown,
} from "./graceful-shutdown-enhanced.js";
// Re-export idempotency utilities
export {
	createIdempotencyProvider,
	InMemoryIdempotencyProvider,
} from "./idempotency.js";
// Lock API is now accessed via scope.acquireLock()
export type {
	LockAcquireOptions,
	LockOptions,
} from "./lock.js";
export { LockGuard } from "./lock.js";
// Re-export log correlation utilities
export type { CorrelationContext } from "./log-correlation.js";
export {
	CorrelatedLogger,
	createCorrelatedLogger,
	generateSpanId,
	generateTraceId,
	getCorrelationContext,
	isCorrelatedLogger,
} from "./log-correlation.js";
// Re-export logger
export { ConsoleLogger, createLogger, NoOpLogger } from "./logger.js";
export { parallel } from "./parallel.js";
// race is available as scope.race()
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
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	IdempotencyProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "./persistence/types.js";
export { installPlugins, type ScopePlugin } from "./plugin.js";
export { poll } from "./poll.js";
// poll is available as scope.poll()
export type {
	PrioritizedItem,
	PriorityChannelOptions,
	PriorityComparator,
} from "./priority-channel.js";
export { PriorityChannel } from "./priority-channel.js";
// parallel is available as scope.parallel()
export { race } from "./race.js";
// Note: LockHandle is already exported from persistence/types.js
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
export { Task } from "./task.js";
export type { TokenBucketOptions } from "./token-bucket.js";
export { TokenBucket } from "./token-bucket.js";
// Re-export types
export type {
	BackpressureStrategy,
	ChannelOptions,
	CheckpointContext,
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
	ProgressContext,
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

/**
 * @internal WorkerPool is exported for workspace packages and advanced use cases.
 * Most users should use `scope.task({ worker: true })`, `parallel()`, `race()`, or `benchmark()` instead.
 */
export { WorkerPool } from "./worker-pool.js";

// Scheduler module - available via 'go-go-scope/scheduler' import
// import { Scheduler, CronPresets } from 'go-go-scope/scheduler'
// import { RedisJobStorage, SQLJobStorage } from 'go-go-scope/scheduler'
// See src/scheduler/index.ts for full API
