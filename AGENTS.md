# go-go-scope - Agent Documentation

## Project Overview

go-go-scope is a TypeScript library that provides **structured concurrency** using the Explicit Resource Management proposal (TypeScript 5.2+). It enables developers to write concurrent code with automatic cleanup and cancellation propagation using the `using` and `await using` syntax.

### Key Features
- Native Resource Management via `using`/`await using` (ES2022+ Disposable symbols)
- Structured concurrency with automatic parent-child cancellation
- Built-in timeout support with automatic cancellation
- Structured racing where losers are cancelled
- Go-style channels for concurrent communication with `map`, `filter`, `reduce`, `take` operations
- Broadcast channels for pub/sub patterns
- Semaphores for rate limiting
- Circuit breaker pattern for preventing cascading failures
- Retry logic with configurable delays and conditions (exponential backoff, jitter, linear)
- `parallel()` for processing arrays with progress tracking and error handling
- Dependency injection via `provide()`/`use()`/`override()`
- Stream processing with automatic cancellation
- Polling utilities with start/stop control
- Debounce and throttle rate-limiting utilities
- Select statement for channel operations (Go-style) with timeout
- Lifecycle hooks for task and resource events
- Metrics collection with Prometheus/JSON/OpenTelemetry export
- Resource pools for connection/worker management
- Task profiling for performance analysis
- Deadlock detection
- Structured logging integration
- OpenTelemetry tracing integration
- Cancellation utilities: `throwIfAborted`, `onAbort`, `abortPromise`, `raceSignals`, `whenAborted`
- Debug visualization via `debugTree()` for scope hierarchies
- Built-in debug logging via the `debug` module
- **Persistence adapters**: Distributed locks and circuit breaker state across Redis, PostgreSQL, MySQL, SQLite
- **Framework adapters**: Fastify, Express, NestJS, Hono, Elysia

## Technology Stack

- **Language**: TypeScript 5.9.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 24+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) v2.26.3 - Zero-config TypeScript package bundler
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v2.4.3
- **Testing**: [Vitest](https://vitest.dev/) v4.0.18 with globals enabled
- **Runtime Dependencies**: 
  - `debug` ^4.4.3 (for debug logging)
  - `@opentelemetry/api` ^1.9.0 (for tracing)
- **Dev Dependencies**:
  - OpenTelemetry SDK and exporters for tracing examples
  - Type definitions for Node.js and debug
  - `effect` ^3.19.18 for comparison examples
  - `go-go-try` ^7.4.1 for typed error handling examples
- **Persistence Adapters** (optional peer dependencies):
  - `ioredis` ^5.9.3 for Redis adapter
  - `pg` ^8.18.0 for PostgreSQL adapter  
  - `mysql2` ^3.17.3 for MySQL adapter
  - `sqlite3` ^5.1.7 for SQLite adapter (Node.js and Bun)
- **Framework Adapters** (optional peer dependencies):
  - `fastify` ^5.7.4 with `fastify-plugin` ^5.1.0
  - `express` ^5.2.1
  - `@nestjs/common` ^11.1.14
  - `hono` ^4.12.0
  - `elysia` ^1.4.25

## Project Structure

```
├── src/                       # Source code (modular structure)
│   ├── index.ts               # Main exports (re-exports from other files)
│   ├── types.ts               # All type definitions, interfaces, and enums
│   ├── factory.ts             # scope() factory function
│   ├── task.ts                # Task class - lazy disposable Promise
│   ├── scope.ts               # Scope class - structured concurrency primitive
│   ├── channel.ts             # Channel class - Go-style concurrent communication
│   ├── broadcast-channel.ts   # BroadcastChannel class - pub/sub patterns
│   ├── semaphore.ts           # Semaphore class - rate limiting primitive
│   ├── circuit-breaker.ts     # CircuitBreaker class - fault tolerance
│   ├── resource-pool.ts       # ResourcePool class - managed resource pools
│   ├── profiler.ts            # Profiler class - task performance profiling
│   ├── deadlock-detector.ts   # DeadlockDetector class - deadlock detection
│   ├── cancellation.ts        # Cancellation utilities (throwIfAborted, onAbort, etc.)
│   ├── logger.ts              # Logger utilities - structured logging
│   ├── metrics-exporter.ts    # Metrics export utilities
│   ├── retry-strategies.ts    # Retry delay strategies (exponential, jitter, linear)
│   ├── race.ts                # Standalone race() function
│   ├── parallel.ts            # Standalone parallel() function
│   ├── stream.ts              # Standalone stream() function
│   ├── poll.ts                # Standalone poll() function
│   ├── rate-limiting.ts       # Standalone debounce and throttle utilities
│   ├── errors.ts              # Error classes (AbortError, UnknownError)
│   ├── adapters/              # Framework adapters
│   │   ├── fastify.ts         # Fastify plugin
│   │   ├── express.ts         # Express middleware
│   │   ├── nestjs.ts          # NestJS integration with @Task decorator
│   │   ├── hono.ts            # Hono middleware
│   │   └── elysia.ts          # Elysia plugin (Bun-first)
│   ├── persistence/           # Persistence adapters
│   │   ├── index.ts           # Persistence module exports
│   │   ├── types.ts           # Persistence interface definitions
│   │   ├── redis.ts           # Redis adapter
│   │   ├── postgres.ts        # PostgreSQL adapter
│   │   ├── mysql.ts           # MySQL adapter
│   │   └── sqlite.ts          # SQLite adapter
│   └── testing/               # Test utilities
│       ├── index.ts           # Mock scopes, spies, timers for testing
│       └── time-controller.ts # Time control for deterministic tests
├── benchmarks/                # Benchmark suite
│   └── index.ts               # Performance benchmarks comparing with native Promise
├── tests/                     # Test suite organized by category
│   ├── core.test.ts           # Core functionality (Task, Scope, retry, OpenTelemetry)
│   ├── concurrency.test.ts    # Channels, Semaphore, CircuitBreaker, stream, poll
│   ├── rate-limiting.test.ts  # Debounce, throttle, metrics, hooks, select
│   ├── cancellation.test.ts   # Cancellation utility functions
│   ├── prometheus.test.ts     # Prometheus metrics export formats
│   ├── testing.test.ts        # Test utilities validation
│   ├── type-check.test.ts     # TypeScript type-level tests
│   ├── performance.test.ts    # Performance benchmarks
│   ├── bun-compatibility.test.ts # Bun runtime compatibility tests
│   ├── fuzz.test.ts           # Fuzz tests for race conditions
│   ├── memory-leak.test.ts    # Memory leak verification tests
│   ├── lock-ttl-analysis.test.ts # Lock TTL analysis tests
│   └── persistence-integration.test.ts  # Persistence adapter tests (Redis, PG, MySQL, SQLite)
├── dist/                      # Compiled output (generated, NOT committed)
│   ├── index.mjs              # ESM build
│   ├── index.d.mts            # ESM type definitions
│   ├── adapters/              # Framework adapter builds
│   ├── persistence/           # Persistence adapter builds
│   └── testing/               # Testing utilities build outputs
├── examples/                  # Usage examples
│   ├── jaeger-tracing.ts      # OpenTelemetry tracing example with Jaeger
│   ├── prometheus-metrics.ts  # Prometheus metrics endpoint example
│   ├── prometheus-push.ts     # Prometheus Pushgateway example
│   ├── prometheus-simple.ts   # Simple Prometheus metrics example
│   ├── go-go-try-integration.ts # Typed error handling with go-go-try
│   ├── testing-utilities.ts   # Testing utilities usage example
│   ├── http-client.ts         # HTTP client patterns
│   ├── database-transactions.ts # Database transaction patterns
│   ├── file-processor.ts      # File processing patterns
│   └── websocket-chat.ts      # WebSocket chat example
├── playground/                # Interactive playground examples
│   ├── basic.ts               # Basic scope usage
│   ├── http-client.ts         # HTTP client patterns
│   ├── websocket.ts           # WebSocket patterns
│   └── concurrency.ts         # Concurrency patterns
├── docs/                      # Documentation
│   ├── 01-quick-start.md      # Quick start guide
│   ├── 02-concepts.md         # Core concepts
│   ├── 03-api-reference.md    # Complete API reference
│   ├── 04-concurrency-patterns.md    # Channels, broadcast, select
│   ├── 05-resilience-patterns.md     # Circuit breakers, retry, timeouts
│   ├── 06-observability.md           # Metrics, logging, profiling, tracing
│   ├── 07-rate-limiting.md           # Debounce, throttle, concurrency
│   ├── 08-testing.md                 # Mock scopes, spies, and timers
│   ├── 09-advanced-patterns.md       # Resource pools, parent-child scopes
│   ├── 10-comparisons.md             # vs Vanilla JS, vs Effect
│   ├── 11-integrations.md            # OpenTelemetry, Prometheus, Grafana, Framework Adapters
│   ├── 12-cancellation.md            # Cancellation utilities and helpers
│   ├── 13-recipes.md                 # Common patterns and solutions
│   ├── 14-migration-guides.md        # Migration from Promises, p-queue, Effect, RxJS
│   └── README.md              # Documentation index
├── grafana/                   # Grafana provisioning
│   └── provisioning/          # Dashboards and datasources
├── package.json               # Package configuration
├── tsconfig.json              # TypeScript configuration (ES2022, NodeNext, strict)
├── tsconfig.adapters.json     # TypeScript configuration for adapters
├── vitest.config.ts           # Vitest test configuration (globals enabled)
├── biome.json                 # Biome linter/formatter configuration
├── docker-compose.yml         # Jaeger, Prometheus, Pushgateway, Grafana & persistence services
├── prometheus.yml             # Prometheus configuration
├── .gitignore                 # Git ignore rules
├── .npmignore                 # NPM publish ignore rules
├── CHANGELOG.md               # Version changelog
├── LICENSE                    # MIT License
└── README.md                  # Project overview
```

## Build Commands

```bash
# Build the project (outputs to dist/)
npm run build

# Build core only
npm run build:core

# Build adapters only
npm run build:adapters

# Run all tests (builds first, then lints, then tests)
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run persistence integration tests (requires services)
npm run test:integration

# Run Bun compatibility tests
npm run test:bun

# Run all tests under Bun
npm run test:bun:all

# Start/stop persistence services for integration tests
npm run services:up      # Start Redis, PostgreSQL, MySQL
npm run services:down    # Stop persistence services
npm run services:logs    # View service logs

# Run benchmarks
npm run benchmark

# Lint and auto-fix code
npm run lint

# Start Jaeger for tracing examples
npm run jaeger:up
npm run jaeger:down
npm run example:jaeger

# Start Prometheus & Grafana for metrics examples
npm run prometheus:up
npm run prometheus:down
npm run example:prometheus
npm run example:prometheus:push

# Start all monitoring (Jaeger + Prometheus + Grafana)
npm run monitoring:up
npm run monitoring:down

# Playground examples
npm run playground:basic
npm run playground:http-client
npm run playground:websocket
npm run playground:concurrency

# Publishing (via npm version)
npm run publish:patch   # Patch version bump
npm run publish:minor   # Minor version bump
npm run publish:major   # Major version bump
```

## Code Style Guidelines

### Linting
- Uses **Biome** for linting and formatting
- Configuration in `biome.json`
- Indent style: tab
- Run `npm run lint` to auto-fix issues
- Adapters have relaxed rules for `noRedeclare`, `noExplicitAny`, `noStaticOnlyClass`, `noNonNullAssertion`

### TypeScript Configuration
- **Target**: ES2022
- **Module**: NodeNext
- **Module Resolution**: NodeNext
- **Strict mode**: Enabled
- **Unused locals/parameters**: Must be clean (`noUnusedLocals`, `noUnusedParameters`)
- **Unreachable code**: Not allowed (`allowUnreachableCode: false`)
- **Unchecked indexed access**: Enabled (`noUncheckedIndexedAccess: true`)
- **Switch fallthrough**: Not allowed (`noFallthroughCasesInSwitch: true`)
- **Libs**: ES2022, ES2022.Error, ESNext.Disposable
- **Experimental decorators**: Enabled (for NestJS adapter)

### Naming Conventions
- Classes use PascalCase (`Task`, `Scope`, `Channel`, `Semaphore`, `CircuitBreaker`)
- Functions use camelCase (`scope()`, `race()`, `parallel()`)
- Interfaces use PascalCase with descriptive names (`TaskOptions`, `ScopeOptions`)
- Private class members use no underscore prefix (follows modern TS)
- Type aliases use PascalCase (`Result`, `Success`, `Failure`)
- Constants use SCREAMING_SNAKE_CASE for status codes (`SpanStatusCode`)

### Code Patterns

#### Explicit Resource Management
All disposable resources implement `Disposable` or `AsyncDisposable`:

```typescript
// Synchronous disposal
export class Task<T> implements PromiseLike<T>, Disposable {
    [Symbol.dispose](): void {
        // cleanup
    }
}

// Asynchronous disposal  
export class Scope implements AsyncDisposable {
    async [Symbol.asyncDispose](): Promise<void> {
        // async cleanup
    }
}
```

#### AbortSignal Propagation
All task functions receive an `AbortSignal` for cancellation:

```typescript
export type TaskFactory<T> = (signal: AbortSignal) => Promise<T>;
```

#### Result Tuples
Functions return Result tuples `[error, value]`:

```typescript
export type Result<E, T> = readonly [E | undefined, T | undefined];
export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];
```

#### Context Pattern for Tasks
Tasks receive a context object with services and signal:

```typescript
task<T>(fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>): Task<Result<unknown, T>>
```

## Testing Strategy

### Test Organization
- **tests/core.test.ts**: Core functionality
  - Task (lazy execution, cancellation, settlement tracking)
  - Scope (task spawning, cancellation, timeout, parent signal linking)
  - Parent scope inheritance (signal, services, options)
  - AsyncDisposableResource (acquire/dispose lifecycle)
  - Result type exports
  - Retry functionality (maxRetries, delay, retryCondition, onRetry)
  - OpenTelemetry integration (mock tracer, span creation, attributes)
  
- **tests/concurrency.test.ts**: Concurrency primitives
  - Channel (send/receive, async iterator, backpressure, multiple producers/consumers)
  - Semaphore (acquire/release, concurrent access limits, cancellation)
  - CircuitBreaker (scope-level, state transitions, reset timeout)
  - stream (async iterable wrapper, abort signal handling, cleanup)
  - poll (interval polling, immediate option, error handling, controller)
  - Integration scenarios (log aggregation, scope concurrency)
  
- **tests/rate-limiting.test.ts**: Rate limiting & observability
  - Debounce (wait, leading/trailing edges, scope disposal)
  - Throttle (interval, leading/trailing edges, scope disposal)
  - Metrics (tasks spawned/completed/failed, duration statistics, resources)
  - Lifecycle Hooks (beforeTask, afterTask, onCancel, onDispose)
  - Select (multiple channel operations, empty cases, closed channels)
  - Histogram (percentile calculations, p50/p90/p95/p99)

- **tests/cancellation.test.ts**: Cancellation utilities
  - throwIfAborted
  - onAbort
  - abortPromise
  - raceSignals
  - whenAborted
  
- **tests/prometheus.test.ts**: Prometheus metrics export
  - JSON format export
  - Prometheus format export
  - OpenTelemetry format export
  - MetricsReporter functionality
  - Custom prefix support
  
- **tests/testing.test.ts**: Test utilities
  - createMockScope
  - createControlledTimer
  - createSpy
  - flushPromises
  - assertScopeDisposed
  - createTestScope
  - createTimeController

- **tests/type-check.test.ts**: TypeScript type-level tests
  - Type inference validations
  - errorClass/systemErrorClass mutual exclusivity

- **tests/performance.test.ts**: Performance benchmarks

- **tests/bun-compatibility.test.ts**: Bun runtime compatibility
  - Core functionality under Bun
  - SQLite adapter with Bun

- **tests/fuzz.test.ts**: Fuzz tests
  - Randomized tests for race conditions in channels and scopes

- **tests/memory-leak.test.ts**: Memory leak tests
  - Verify no leaks after 10,000 scope operations

- **tests/persistence-integration.test.ts**: Persistence adapter integration tests
  - Tests all persistence providers (Redis, PostgreSQL, MySQL, SQLite)
  - Distributed lock tests (acquire, release, extend, expiration, force release)
  - Circuit breaker state tests (persistence, failure counting, subscriptions)
  - Scope integration tests (acquireLock with different providers)
  - Gracefully skips tests for unavailable databases

### Test Patterns
- Uses Vitest with globals enabled (no need to import `describe`, `test`, `expect`)
- Tests use `await using` and `using` syntax extensively
- Async cleanup is verified using event tracking
- Timeouts use actual timers (no fake timers)
- Tests verify both success and failure paths
- Mock OpenTelemetry tracer implemented for testing

### Running Tests
```bash
# Full test suite (builds, lints, then tests)
npm test

# Watch mode for development
npm run test:watch

# Run specific test file
npx vitest run tests/core.test.ts
npx vitest run tests/concurrency.test.ts
npx vitest run tests/rate-limiting.test.ts
npx vitest run tests/cancellation.test.ts
npx vitest run tests/prometheus.test.ts
npx vitest run tests/testing.test.ts
npx vitest run tests/type-check.test.ts
npx vitest run tests/performance.test.ts

# Run persistence integration tests (requires services)
npm run services:up && npm run test:integration

# Run Bun compatibility tests
npm run test:bun

# Run all tests under Bun
npm run test:bun:all
```

### Writing New Tests
- Use `describe` and `test` from vitest (globals enabled)
- Test both success and failure paths
- Verify cleanup happens correctly
- Test AbortSignal propagation
- Use small timeouts (10-100ms) to keep tests fast

Example test pattern:
```typescript
test("cancels when scope disposed", async () => {
    const s = scope();
    let aborted = false;
    
    using t = s.task(async ({ signal }) => {
        return new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
            });
        });
    });
    
    await s[Symbol.asyncDispose]().catch(() => {});
    await new Promise((r) => setTimeout(r, 10)); // Allow propagation
    
    expect(aborted).toBe(true);
});
```

## Architecture Details

### Core Classes

1. **Task<T>** (`task.ts`): Promise-like disposable task
   - Implements `PromiseLike<T>` for await support
   - Implements `Disposable` for `using` keyword support
   - Links to parent AbortSignal for cancellation propagation
   - Lazy execution - starts only when awaited or `.then()` called
   - Each task has a unique ID for debugging
   - Properties: `id`, `signal`, `isStarted`, `isSettled`

2. **Scope<Services>** (`scope.ts`): Main structured concurrency primitive
   - Manages `AbortController` for cancellation
   - Tracks disposables for cleanup (LIFO order)
   - Supports timeout and parent signal linking
   - Supports parent scope inheritance (services, tracer, concurrency, circuit breaker)
   - Creates OpenTelemetry spans when tracer is provided
   - Supports lifecycle hooks and metrics collection
   - Supports deadlock detection and task profiling
   - Supports histogram metrics with percentile calculations
   - Supports persistence providers (distributed locks, circuit breaker state)
   - Methods:
     - `task()` - Spawn tasks with Result tuple return
     - `provide()` / `use()` / `has()` / `override()` - Dependency injection
     - `race()` - Race multiple tasks
     - `parallel()` - Run tasks in parallel with concurrency limit
     - `channel()` - Create Go-style channels
     - `broadcast()` - Create broadcast channels
     - `stream()` - Wrap async iterables
     - `poll()` - Interval polling with controller
     - `debounce()` / `throttle()` - Rate limiting
     - `select()` - Wait on multiple channel operations
     - `resourcePool()` / `pool()` - Create managed resource pools
     - `acquireLock()` - Acquire distributed locks
     - `histogram()` - Create histogram metrics
     - `metrics()` - Get collected metrics
     - `profile()` - Get profiling report
     - `debugTree()` - Visualize scope hierarchy (supports `{ format: 'mermaid' }`)
     - `onDispose()` - Register cleanup callbacks
   - Properties: `signal`, `isDisposed`, `tracer`, `concurrency`, `circuitBreaker`

3. **AsyncDisposableResource<T>** (`scope.ts`): Resource wrapper
   - Manages acquire/dispose lifecycle
   - Implements `AsyncDisposable`
   - Methods: `acquire()`, `value` getter

4. **Channel<T>** (`channel.ts`): Go-style buffered channel
   - Supports multiple producers/consumers
   - Implements backpressure via buffer limits
   - Implements `AsyncIterable` for `for await...of` support
   - Auto-closes on parent scope disposal
   - Methods: `send()`, `receive()`, `close()`, `[Symbol.asyncIterator]`
   - Helper methods: `map()`, `filter()`, `reduce()`, `take()`
   - Properties: `isClosed`, `size`, `cap`

5. **BroadcastChannel<T>** (`broadcast-channel.ts`): Pub/sub broadcast channel
   - All subscribers receive every message
   - Supports filtering via subscriber functions
   - Auto-closes on parent scope disposal
   - Methods: `send()`, `subscribe()`, `close()`

6. **Semaphore** (`semaphore.ts`): Rate limiting primitive
   - Acquire/release pattern with auto-release on error
   - Respects scope cancellation
   - Queue-based fairness
   - Methods: `acquire()`, `execute()`, `[Symbol.asyncDispose]`
   - Properties: `available`, `availablePermits`, `waiting`, `waiterCount`, `totalPermits`

7. **CircuitBreaker** (`circuit-breaker.ts`): Fault tolerance
   - States: closed, open, half-open
   - Configurable failure threshold and reset timeout
   - Respects parent AbortSignal
   - Supports persistence via CircuitBreakerStateProvider
   - Methods: `execute()`, `reset()`, `[Symbol.asyncDispose]`
   - Properties: `currentState`, `failureCount`, `failureThreshold`, `resetTimeout`

8. **ResourcePool<T>** (`resource-pool.ts`): Managed resource pools
   - Min/max pool size management
   - Acquire timeout support
   - Auto-cleanup on scope disposal
   - Methods: `acquire()`, `release()`, `execute()`, `drain()`, `[Symbol.asyncDispose]`

9. **Profiler** (`profiler.ts`): Task performance profiling
   - Tracks execution time per pipeline stage
   - Records retry attempts
   - Methods: `startTask()`, `endTask()`, `report()`

10. **DeadlockDetector** (`deadlock-detector.ts`): Deadlock detection
    - Monitors task execution times
    - Configurable timeout with callback
    - Methods: `check()`, `dispose()`

11. **HistogramImpl** (`scope.ts`): Internal histogram implementation
    - Records value distributions
    - Calculates percentiles (p50, p90, p95, p99)
    - Methods: `record()`, `snapshot()`

12. **Cancellation Utilities** (`cancellation.ts`): AbortSignal helpers
    - `throwIfAborted(signal)` - Throws if signal is aborted
    - `onAbort(signal, callback)` - Register abort callback
    - `abortPromise(signal)` - Promise that rejects on abort
    - `raceSignals(signals)` - Race multiple signals
    - `whenAborted(signal)` - Wait for abort signal

### Persistence Adapters

Located in `src/persistence/`:

1. **RedisAdapter** (`redis.ts`): Redis-based persistence
2. **PostgresAdapter** (`postgres.ts`): PostgreSQL-based persistence
3. **MySQLAdapter** (`mysql.ts`): MySQL-based persistence  
4. **SQLiteAdapter** (`sqlite.ts`): SQLite-based persistence

All adapters implement:
- `LockProvider` - Distributed locking with TTL
- `CircuitBreakerStateProvider` - Circuit breaker state persistence

### Framework Adapters

Located in `src/adapters/`:

1. **Fastify** (`fastify.ts`): `fastifyGoGoScope` plugin
   - Creates root application scope
   - Creates request-scoped child for each request
   - Auto-cleanup on response/close

2. **Express** (`express.ts`): `expressGoGoScope` middleware
   - Attaches scope to `req.scope`
   - Auto-cleanup after response

3. **NestJS** (`nestjs.ts`): `GoGoScopeModule` and `@Task` decorator
   - Dependency injection integration
   - Method decorator for automatic scope management

4. **Hono** (`hono.ts`): `honoGoGoScope` middleware
   - Edge runtime compatible
   - Lightweight implementation

5. **Elysia** (`elysia.ts`): `elysiaGoGoScope` plugin
   - Bun-first adapter
   - WebSocket support

### Utility Functions

- **scope(options?)**: Factory for Scope instances (`factory.ts`)
- **race(factories, options?)**: Race with automatic cancellation of losers (`race.ts`)
- **parallel(factories, options?)**: Parallel execution with concurrency limit (`parallel.ts`)
- **stream(source, signal?)**: Async iterable wrapper with cancellation (`stream.ts`)
- **poll(fn, onValue, options?)**: Interval polling with cleanup (`poll.ts`)
- **debounce(scope, fn, options?)**: Debounced function wrapper (`rate-limiting.ts`)
- **throttle(scope, fn, options?)**: Throttled function wrapper (`rate-limiting.ts`)

### Retry Strategies

- **exponentialBackoff(options?)**: Exponential backoff with optional jitter
- **jitter(baseDelay, jitterFactor?)**: Fixed delay with jitter
- **linear(baseDelay, increment)**: Linear increasing delay
- **fullJitterBackoff**: Full jitter strategy
- **decorrelatedJitter**: Decorrelated jitter strategy

Shorthand options:
- `{ retry: 'exponential' }` - Uses default exponential backoff
- `{ retry: 'linear' }` - Uses linear backoff
- `{ retry: 'fixed' }` - Uses fixed delay

### Task Execution Pipeline

When a task is spawned, it goes through a pipeline of wrappers (from innermost to outermost):

1. **Circuit Breaker** (if scope has `circuitBreaker` option)
2. **Concurrency** (if scope has `concurrency` option)
3. **Retry** (if `retry` option specified in TaskOptions)
4. **Timeout** (if `timeout` option specified in TaskOptions)
5. **Result Wrapping** (always - converts to Result tuple)

### Scope Extension Pattern

Advanced features are added to Scope as methods:

```typescript
// Scope methods that create resources:
channel<T>(capacity?: number): Channel<T>
broadcast<T>(): BroadcastChannel<T>
stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>
poll<T>(fn, onValue, options?): PollController
race<T>(factories): Promise<Result<unknown, T>>
parallel<T>(factories, options?): ParallelAggregateResult<T>
debounce<T, Args>(fn, options?): (...args: Args) => Promise<Result<unknown, T>>
throttle<T, Args>(fn, options?): (...args: Args) => Promise<Result<unknown, T>>
select<T>(cases): Promise<Result<unknown, T>>
resourcePool<T>(options): ResourcePool<T>
pool<T>(options): ResourcePool<T>  // alias
acquireLock(key, ttl): Promise<LockHandle | null>
histogram(name): Histogram
metrics(): ScopeMetrics | undefined
profile(): ScopeProfileReport | undefined
debugTree(options?): string  // supports { format: 'mermaid' }
```

### Debug Logging

The library uses the `debug` module for logging:

```typescript
import createDebug from "debug";
const debugScope = createDebug("go-go-scope:scope");
const debugTask = createDebug("go-go-scope:task");
```

Namespaces:
- `go-go-scope:scope` - Scope lifecycle events
- `go-go-scope:task` - Task lifecycle events, retry, concurrency, circuit breaker
- `go-go-scope:parallel` - Parallel execution events
- `go-go-scope:race` - Race execution events
- `go-go-scope:poll` - Polling events
- `go-go-scope:cancellation` - Cancellation utility events

Enable with: `DEBUG=go-go-scope:* node your-app.js`

## Package Exports

The package is **ESM-only** (Node.js 24+):

```json
{
  "type": "module",
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "default": "./dist/index.mjs"
    },
    "./testing": {
      "types": "./dist/testing/index.d.mts",
      "default": "./dist/testing/index.mjs"
    },
    "./persistence": {
      "types": "./dist/persistence/index.d.mts",
      "default": "./dist/persistence/index.mjs"
    },
    "./persistence/redis": {
      "types": "./dist/persistence/redis.d.mts",
      "default": "./dist/persistence/redis.mjs"
    },
    "./persistence/sqlite": {
      "types": "./dist/persistence/sqlite.d.mts",
      "default": "./dist/persistence/sqlite.mjs"
    },
    "./persistence/postgres": {
      "types": "./dist/persistence/postgres.d.mts",
      "default": "./dist/persistence/postgres.mjs"
    },
    "./persistence/mysql": {
      "types": "./dist/persistence/mysql.d.mts",
      "default": "./dist/persistence/mysql.mjs"
    },
    "./adapters/fastify": {
      "types": "./dist/adapters/fastify.d.mts",
      "default": "./dist/adapters/fastify.mjs"
    },
    "./adapters/express": {
      "types": "./dist/adapters/express.d.mts",
      "default": "./dist/adapters/express.mjs"
    },
    "./adapters/nestjs": {
      "types": "./dist/adapters/nestjs.d.mts",
      "default": "./dist/adapters/nestjs.mjs"
    },
    "./adapters/hono": {
      "types": "./dist/adapters/hono.d.mts",
      "default": "./dist/adapters/hono.mjs"
    },
    "./adapters/elysia": {
      "types": "./dist/adapters/elysia.d.mts",
      "default": "./dist/adapters/elysia.mjs"
    }
  }
}
```

### Requirements

- **Node.js**: 24.0.0 or higher (for native `fetch`, `AbortSignal` improvements)
- **Bun**: 1.2.0 or higher (fully supported)
- **TypeScript**: 5.2 or higher
- **Module**: ESM only (`"type": "module"` required)

### Usage

```typescript
// Main imports
import { scope, Task, Scope } from 'go-go-scope';

// Testing utilities (separate import)
import { createMockScope, createSpy, createControlledTimer, flushPromises, assertScopeDisposed } from 'go-go-scope/testing';

// Persistence adapters (separate imports)
import { RedisAdapter } from 'go-go-scope/persistence/redis';
import { PostgresAdapter } from 'go-go-scope/persistence/postgres';
import { MySQLAdapter } from 'go-go-scope/persistence/mysql';
import { SQLiteAdapter } from 'go-go-scope/persistence/sqlite';

// Framework adapters (separate imports)
import { fastifyGoGoScope } from 'go-go-scope/adapters/fastify';
import { expressGoGoScope } from 'go-go-scope/adapters/express';
import { GoGoScopeModule, Task } from 'go-go-scope/adapters/nestjs';
import { honoGoGoScope } from 'go-go-scope/adapters/hono';
import { elysiaGoGoScope } from 'go-go-scope/adapters/elysia';
```

### Why ESM-only?

- **Smaller bundle size** - No dual CJS/ESM builds
- **Better tree-shaking** - ESM enables more aggressive optimizations
- **Native features** - Top-level await, `using`/`await using` syntax
- **Future-proof** - The ecosystem is moving toward ESM
- **Simpler maintenance** - Single output format

### Migrating from CommonJS

If your project uses CommonJS, migrate to ESM:

1. Add `"type": "module"` to your `package.json`
2. Rename `.js` files to `.mjs` or use `.ts` with `"module": "NodeNext"`
3. Use `import`/`export` syntax instead of `require`/`module.exports`
4. Update any dynamic `require()` to `await import()`

See [Node.js ESM documentation](https://nodejs.org/api/esm.html) for more details.

## Typed Error Handling with go-go-try

Combine with [`go-go-try`](https://github.com/thelinuxlich/go-go-try) for automatic union inference of typed errors:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')

// Automatic union inference: Result<DatabaseError | NetworkError, User>
async function fetchUser(id: string) {
  await using s = scope()
  
  const [dbErr, user] = await s.task(
    () => queryDb(id),
    { errorClass: DatabaseError }
  )
  if (dbErr) return failure(dbErr)
  
  const [netErr, enriched] = await s.task(
    () => enrich(user!),
    { errorClass: NetworkError }
  )
  if (netErr) return failure(netErr)
  
  return success(enriched)
}
```

See [Resilience Patterns](./docs/05-resilience-patterns.md#typed-error-handling) for detailed documentation.

## Error Class Options

Task options support two mutually exclusive error class options:

- `errorClass`: Wraps ALL errors in the provided class
- `systemErrorClass`: Only wraps untagged errors (errors without `_tag` property)

They are mutually exclusive at the type level - you can only specify one, not both.

```typescript
// Wrap all errors
await s.task(fn, { errorClass: DatabaseError })

// Only wrap system/infrastructure errors (preserve tagged business errors)
await s.task(fn, { systemErrorClass: InfrastructureError })
```

## Dependencies

### Runtime Dependencies
- `debug` ^4.4.3 - Debug logging utility
- `@opentelemetry/api` ^1.9.0 - OpenTelemetry API for tracing

### Dev Dependencies
- `@biomejs/biome` ^2.4.3 - Linter/formatter
- `@nestjs/common` ^11.1.14 - NestJS framework adapter
- `@opentelemetry/exporter-trace-otlp-http` ^0.212.0 - OTLP trace exporter
- `@opentelemetry/resources` ^2.5.1 - OpenTelemetry resources
- `@opentelemetry/sdk-node` ^0.212.0 - OpenTelemetry Node.js SDK
- `@opentelemetry/semantic-conventions` ^1.39.0 - Semantic conventions
- `@types/debug` ^4.1.12 - Type definitions for debug
- `@types/express` ^5.0.6 - Express type definitions
- `@types/node` ^24 - Type definitions for Node.js
- `@types/supertest` ^6.0.3 - Supertest type definitions
- `effect` ^3.19.18 - For comparison examples
- `elysia` ^1.4.25 - Elysia framework adapter
- `express` ^5.2.1 - Express framework adapter
- `fastify` ^5.7.4 - Fastify framework adapter
- `fastify-plugin` ^5.1.0 - Fastify plugin helper
- `go-go-try` ^7.4.1 - For typed error handling examples
- `hono` ^4.12.0 - Hono framework adapter
- `ioredis` ^5.9.3 - Redis persistence adapter
- `mysql2` ^3.17.3 - MySQL persistence adapter
- `pg` ^8.18.0 - PostgreSQL persistence adapter
- `pkgroll` ^2.26.3 - Build tool
- `sqlite3` ^5.1.7 - SQLite persistence adapter
- `supertest` ^7.2.2 - HTTP testing
- `tsx` ^4.21.0 - TypeScript execution for playground
- `typescript` ^5.9.3 - TypeScript compiler
- `vitest` ^4.0.18 - Test framework

## Development Workflow

1. **Make changes** to `src/*.ts` or test files
2. **Run tests**: `npm test` (this builds, lints, and tests)
3. **Check types**: TypeScript compilation happens during build
4. **Commit**: The dist/ folder should NOT be committed (it's in .gitignore)

## Bun Compatibility

The library is fully tested and works with Bun runtime (v1.2.0+). All 220+ tests pass under Bun.

### Features that work with Bun:
- ✅ Core scope/task functionality
- ✅ Parallel execution
- ✅ Channels and broadcast channels
- ✅ Semaphores
- ✅ Circuit breakers
- ✅ Rate limiting (debounce/throttle)
- ✅ Polling
- ✅ Stream processing
- ✅ SQLite persistence (via `sqlite3` package)
- ✅ Timer APIs (`setTimeout`, `setInterval`)
- ✅ Native `fetch`
- ✅ Framework adapters (especially Elysia)

### Bun-specific notes:
- **SQLite**: Bun's native `bun:sqlite` has a different API than `sqlite3`. The library uses `sqlite3` which works under both Node.js and Bun.
- **Timer precision**: Timer APIs work correctly but may have slightly different precision characteristics.
- **Fetch**: Native `fetch` is available and preferred over Node's `undici`.

### Running tests under Bun:
```bash
# Run Bun compatibility tests only
bun test tests/bun-compatibility.test.ts

# Run all tests under Bun
bun test

# Or via npm script
npm run test:bun      # Bun compatibility tests
npm run test:bun:all  # All tests under Bun
```

## Security Considerations

- All async operations respect AbortSignal for cancellation
- Resources are always cleaned up in LIFO order
- The library does not execute untrusted code
- No external runtime dependencies besides `debug` (well-maintained, widely used)
- Task functions receive AbortSignal to handle cancellation safely
- Circuit breaker prevents cascading failures
- Resource pools have acquisition timeouts to prevent indefinite blocking
- Distributed locks have TTL to prevent indefinite locks
- Lock handles can be extended but expire automatically after TTL

## Common Tasks

### Adding a New Feature
1. Add the implementation to appropriate `src/*.ts` file
2. Export it from `src/index.ts` if needed
3. Add comprehensive tests to appropriate test file
4. Run `npm test` to verify
5. Update documentation in `docs/` if needed

### Adding Scope Methods
1. Define the method in the `Scope` class in `src/scope.ts`
2. Ensure the resource is registered via `this.disposables.push()` for cleanup
3. Add tests in appropriate test file under `tests/`

### Modifying Core Behavior
- Changes to `Task` or `Scope` affect the entire library
- Ensure AbortSignal propagation is maintained
- Verify LIFO disposal order is preserved
- Run full test suite before committing

### Adding Testing Utilities
1. Add utility to `src/testing/index.ts`
2. Update type exports in `src/index.ts` if needed
3. Add tests in `tests/testing.test.ts`
4. Create example in `examples/testing-utilities.ts` if appropriate

### Adding Persistence Adapters
1. Create adapter in `src/persistence/<name>.ts`
2. Implement `LockProvider` and/or `CircuitBreakerStateProvider` interfaces
3. Export from `src/persistence/index.ts` if it's a core adapter
4. Add integration tests in `tests/persistence-integration.test.ts`
5. Update exports in `package.json` if needed

### Adding Framework Adapters
1. Create adapter in `src/adapters/<name>.ts`
2. Follow existing adapter patterns (root scope, request scope, cleanup)
3. Update `tsconfig.adapters.json` if needed
4. Add to `biome.json` overrides for adapter-specific rules
5. Update exports in `package.json`

## License

MIT License - See LICENSE file for details
