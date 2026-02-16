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

## Technology Stack

- **Language**: TypeScript 5.9.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 18+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) v2.25.2 - Zero-config TypeScript package bundler
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v2.4.0
- **Testing**: [Vitest](https://vitest.dev/) v4.0.18 with globals enabled
- **Runtime Dependencies**: 
  - `debug` ^4.4.3 (for debug logging)
  - `@opentelemetry/api` ^1.9.0 (for tracing)
- **Dev Dependencies**:
  - OpenTelemetry SDK and exporters for tracing examples
  - Type definitions for Node.js and debug
  - `effect` ^3.19.17 for comparison examples
  - `go-go-try` ^7.3.0 for typed error handling examples

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
│   └── performance.test.ts    # Performance benchmarks
├── dist/                      # Compiled output (generated, NOT committed)
│   ├── index.mjs              # ESM build
│   ├── index.cjs              # CommonJS build
│   ├── index.d.mts            # ESM type definitions
│   ├── index.d.cts            # CommonJS type definitions
│   └── testing/               # Testing utilities build outputs
├── examples/                  # Usage examples
│   ├── jaeger-tracing.ts      # OpenTelemetry tracing example with Jaeger
│   ├── prometheus-metrics.ts  # Prometheus metrics endpoint example
│   ├── prometheus-push.ts     # Prometheus Pushgateway example
│   ├── prometheus-simple.ts   # Simple Prometheus metrics example
│   ├── go-go-try-integration.ts # Typed error handling with go-go-try
│   └── testing-utilities.ts   # Testing utilities usage example
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
│   ├── 11-integrations.md            # OpenTelemetry, Prometheus, Grafana
│   ├── 12-cancellation.md            # Cancellation utilities and helpers
│   └── 13-recipes.md                 # Common patterns and solutions
├── grafana/                   # Grafana provisioning
│   └── provisioning/          # Dashboards and datasources
├── package.json               # Package configuration
├── tsconfig.json              # TypeScript configuration (ES2022, NodeNext, strict)
├── vitest.config.ts           # Vitest test configuration (globals enabled)
├── docker-compose.yml         # Jaeger, Prometheus, Pushgateway & Grafana setup
├── prometheus.yml             # Prometheus configuration
├── .gitignore                 # Git ignore rules
├── .npmignore                 # NPM publish ignore rules
├── LICENSE                    # MIT License
└── README.md                  # Project overview
```

## Build Commands

```bash
# Build the project (outputs to dist/)
npm run build

# Run all tests (builds first, then lints, then tests)
npm test

# Run tests in watch mode (for development)
npm run test:watch

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

# Publishing (via npm version)
npm run publish:patch   # Patch version bump
npm run publish:minor   # Minor version bump
npm run publish:major   # Major version bump
```

## Code Style Guidelines

### Linting
- Uses **Biome** for linting and formatting
- Configuration is inline in `package.json` (no separate biome.json)
- Run `npm run lint` to auto-fix issues

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

- **tests/performance.test.ts**: Performance benchmarks

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
     - `metrics()` - Get collected metrics
     - `profile()` - Get profiling report
     - `debugTree()` - Visualize scope hierarchy
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

11. **Cancellation Utilities** (`cancellation.ts`): AbortSignal helpers
    - `throwIfAborted(signal)` - Throws if signal is aborted
    - `onAbort(signal, callback)` - Register abort callback
    - `abortPromise(signal)` - Promise that rejects on abort
    - `raceSignals(signals)` - Race multiple signals
    - `whenAborted(signal)` - Wait for abort signal

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
metrics(): ScopeMetrics | undefined
profile(): ScopeProfileReport | undefined
debugTree(): string
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

The package supports both ESM and CommonJS with subpath exports:

```json
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      },
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      }
    },
    "./testing": {
      "require": {
        "types": "./dist/testing/index.d.cts",
        "default": "./dist/testing/index.cjs"
      },
      "import": {
        "types": "./dist/testing/index.d.mts",
        "default": "./dist/testing/index.mjs"
      }
    }
  }
}
```

Usage:
```typescript
// Main imports
import { scope, Task, Scope } from 'go-go-scope';

// Testing utilities (separate import)
import { createMockScope, createSpy, createControlledTimer, flushPromises, assertScopeDisposed } from 'go-go-scope/testing';
```

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

## Dependencies

### Runtime Dependencies
- `debug` ^4.4.3 - Debug logging utility
- `@opentelemetry/api` ^1.9.0 - OpenTelemetry API for tracing

### Dev Dependencies
- `@biomejs/biome` ^2.4.0 - Linter/formatter
- `@opentelemetry/exporter-trace-otlp-http` ^0.212.0 - OTLP trace exporter
- `@opentelemetry/resources` ^2.5.1 - OpenTelemetry resources
- `@opentelemetry/sdk-node` ^0.212.0 - OpenTelemetry Node.js SDK
- `@opentelemetry/semantic-conventions` ^1.39.0 - Semantic conventions
- `@types/debug` ^4.1.12 - Type definitions for debug
- `@types/node` ^24 - Type definitions for Node.js
- `effect` ^3.19.17 - For comparison examples
- `go-go-try` ^7.3.0 - For typed error handling examples
- `pkgroll` ^2.25.2 - Build tool
- `typescript` ^5.9.3 - TypeScript compiler
- `vitest` ^4.0.18 - Test framework

## Development Workflow

1. **Make changes** to `src/*.ts` or test files
2. **Run tests**: `npm test` (this builds, lints, and tests)
3. **Check types**: TypeScript compilation happens during build
4. **Commit**: The dist/ folder should NOT be committed (it's in .gitignore)

## Security Considerations

- All async operations respect AbortSignal for cancellation
- Resources are always cleaned up in LIFO order
- The library does not execute untrusted code
- No external runtime dependencies besides `debug` (well-maintained, widely used)
- Task functions receive AbortSignal to handle cancellation safely
- Circuit breaker prevents cascading failures
- Resource pools have acquisition timeouts to prevent indefinite blocking

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

## License

MIT License - See LICENSE file for details
