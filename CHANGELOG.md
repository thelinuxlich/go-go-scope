# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.0] - 2025-02-20

### Added

- **Stream API**: Complete lazy stream processing with 50+ operations:
  - **Core operations**: `map`, `filter`, `flatMap`, `flatten`, `filterMap`, `tap`
  - **Slicing**: `take`, `takeWhile`, `takeUntil`, `drop`, `dropWhile`, `dropUntil`, `skip`, `splitAt`
  - **Buffering**: `buffer`, `bufferTime`, `bufferTimeOrCount`, `groupAdjacentBy`
  - **Deduplication**: `distinct`, `distinctBy`, `distinctAdjacent`, `distinctAdjacentBy`
  - **Combining**: `merge`, `zip`, `zipWithIndex`, `concat`, `prepend`, `append`, `intersperse`
  - **Splitting**: `partition`, `splitAt`, `broadcast` (queue-based distribution)
  - **Timing**: `delay`, `spaced`, `throttle`, `debounce`, `timeout`
  - **Error handling**: `catchAll`, `catchError`, `orElse`, `orElseSucceed`, `orElseIfEmpty`, `mapError`, `tapError`, `ensuring`, `retry`
  - **Terminal**: `toArray`, `forEach`, `drain`, `first`, `last`, `find`, `reduce`, `fold`, `scan`, `count`, `sum`, `some`, `every`, `includes`, `groupBy`
  - **Advanced**: `switchMap` (with reactive cancellation), `scan` (running fold)
  - **Result tuples**: All terminal operations return `[error, value]` for type-safe error handling
  - **Automatic cancellation**: Streams respect scope disposal via AbortSignal
  - **Lazy evaluation**: Operations compose without executing until terminal operation called
- **Framework Adapters**: Official adapters for popular web frameworks:
  - **Fastify**: `go-go-scope/adapters/fastify` - Request-scoped concurrency with automatic cleanup
  - **Express**: `go-go-scope/adapters/express` - Middleware-based scope management
  - **NestJS**: `go-go-scope/adapters/nestjs` - Dependency injection integration with `@Task` decorator
  - **Hono**: `go-go-scope/adapters/hono` - Lightweight middleware for edge runtimes
  - **Elysia**: `go-go-scope/adapters/elysia` - Native Bun-first adapter with WebSocket support
- **Type-level mutual exclusivity**: `errorClass` and `systemErrorClass` options are now mutually exclusive at the type level. You can only specify one, not both. This prevents accidental misconfiguration.
- **Metrics histograms**: Added `histogram()` method to scopes for tracking value distributions with percentile calculations (p50, p90, p95, p99).
- **Shorthand retry strategies**: Added string-based retry strategies for convenience:
  - `{ retry: 'exponential' }` - Uses default exponential backoff
  - `{ retry: 'linear' }` - Uses linear backoff
  - `{ retry: 'fixed' }` - Uses fixed delay
- **Mermaid diagram export**: `debugTree()` now supports `{ format: 'mermaid' }` option to generate Mermaid flowchart syntax for visualizing scope hierarchies.
- **Interactive Playground**: Added `playground/` directory with runnable examples via `tsx`:
  - `npm run playground:basic` - Basic scope usage
  - `npm run playground:http-client` - HTTP client patterns
  - `npm run playground:websocket` - WebSocket patterns
  - `npm run playground:concurrency` - Concurrency patterns
- **Fuzz tests**: Added randomized tests for race condition detection in channels and scopes.
- **Memory leak tests**: Added test to verify no memory leaks after 10,000 scope operations.
- **Expanded benchmarks**: Added comprehensive benchmarks comparing with `p-queue`, `async/await` vanilla, `rxjs`, and `effect`.

### Changed

- **Improved `parallel()` type inference**: Error types are now better preserved when using `errorClass` option with `parallel()`.

## [1.5.0] - 2024-02-17

### Added

- **Persistence adapters**: Added support for distributed locking and circuit breaker state persistence across Redis, PostgreSQL, MySQL, and SQLite.
- **Distributed locks**: Cross-process locking with `acquireLock()` method on scopes.
- **Bun compatibility**: Full support for Bun runtime (v1.2.0+).
- **Rate limiting**: Distributed rate limiting with sliding window algorithm.
- **Circuit breaker persistence**: Share circuit breaker state across service instances.

### Changed

- **Improved API**: Removed `rateLimiting` option from scope (wasn't as useful as intended).
- **Lock API**: Updated to not use `using` syntax for better control.

## [1.4.0] - 2024-02-14

### Added

- **Testing utilities**: `createMockScope`, `createSpy`, `createControlledTimer`, `flushPromises`, `assertScopeDisposed`.
- **Deadlock detection**: `DeadlockDetector` class for warning on potential deadlocks.
- **Resource pools**: `ResourcePool` class for managed connection/worker pools.
- **Broadcast channels**: `BroadcastChannel` class for pub/sub patterns.
- **Metrics collection**: Scope-level metrics with Prometheus/JSON/OpenTelemetry export.
- **Grafana integration**: Pre-configured dashboards and datasources.

## [1.3.0] - 2024-02-12

### Added

- **Circuit breaker hooks**: `onStateChange`, `onOpen`, `onClose`, `onHalfOpen` callbacks.
- **Provider helpers**: Better dependency injection with `provide`, `use`, `override`.
- **Channel methods**: `map`, `filter`, `reduce`, `take` operations on channels.
- **Metrics aggregation**: Cross-scope metrics collection.
- **Task profiling**: Detailed execution time breakdown per pipeline stage.

## [1.2.0] - 2024-02-10

### Added

- **Debounce & Throttle**: Rate-limiting utilities for function execution.
- **Select statement**: Go-style select for channel operations with timeout support.
- **Lifecycle hooks**: `beforeTask`, `afterTask`, `onCancel`, `onDispose`.
- **Debug visualization**: `debugTree()` method for scope hierarchy visualization.
- **Debug logging**: Built-in debug logging via the `debug` module.

## [1.1.0] - 2024-02-08

### Added

- **Retry strategies**: Built-in `exponentialBackoff`, `jitter`, `linear` delay strategies.
- **Poll utility**: Interval polling with start/stop control.
- **Stream processing**: Async iterable wrapper with cancellation.
- **Parallel execution**: `parallel()` method with progress tracking and error handling.
- **Race utility**: `race()` function with automatic cancellation of losers.

## [1.0.0] - 2024-02-05

### Added

- Initial release with core structured concurrency primitives:
  - `Scope` class for structured concurrency
  - `Task` class for lazy disposable promises
  - `Channel` class for Go-style buffered channels
  - `Semaphore` class for rate limiting
  - `CircuitBreaker` class for fault tolerance
  - OpenTelemetry integration
  - Result tuples for error handling
  - Explicit Resource Management support (`using`/`await using`)

[Unreleased]: https://github.com/thelinuxlich/go-go-scope/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/thelinuxlich/go-go-scope/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/thelinuxlich/go-go-scope/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/thelinuxlich/go-go-scope/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/thelinuxlich/go-go-scope/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/thelinuxlich/go-go-scope/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/thelinuxlich/go-go-scope/releases/tag/v1.0.0
