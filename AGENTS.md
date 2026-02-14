# go-go-scope - Agent Documentation

## Project Overview

go-go-scope is a TypeScript library that provides **structured concurrency** using the Explicit Resource Management proposal (TypeScript 5.2+). It enables developers to write concurrent code with automatic cleanup and cancellation propagation using the `using` and `await using` syntax.

### Key Features
- Native Resource Management via `using`/`await using` (ES2022+ Disposable symbols)
- Structured concurrency with automatic parent-child cancellation
- Built-in timeout support with automatic cancellation
- Structured racing where losers are cancelled
- Go-style channels for concurrent communication
- Broadcast channels for pub/sub patterns
- Semaphores for rate limiting
- Circuit breaker pattern for preventing cascading failures
- Retry logic with configurable delays and conditions
- Dependency injection via `provide()`/`use()`
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
- Built-in debug logging via the `debug` module

## Technology Stack

- **Language**: TypeScript 5.9.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 18+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) v2.25.2 - Zero-config TypeScript package bundler
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v2.3.15
- **Testing**: [Vitest](https://vitest.dev/) v4.0.18
- **Runtime Dependencies**: 
  - `debug` ^4.4.3 (for debug logging)
  - `@opentelemetry/api` ^1.9.0 (for tracing)
- **Dev Dependencies**:
  - OpenTelemetry SDK and exporters for tracing examples
  - Type definitions for Node.js and debug

## Project Structure

```
├── src/                       # Source code (modular structure)
│   ├── index.ts               # Main exports (re-exports from other files)
│   ├── types.ts               # All type definitions, interfaces, and enums
│   ├── factory.ts             # scope() factory function
│   ├── race.ts                # race() function
│   ├── parallel.ts            # parallel() function
│   ├── stream.ts              # stream() function
│   ├── poll.ts                # poll() function
│   ├── task.ts                # Task class - lazy disposable Promise
│   ├── scope.ts               # Scope class - structured concurrency primitive
│   ├── channel.ts             # Channel class - Go-style concurrent communication
│   ├── semaphore.ts           # Semaphore class - rate limiting primitive
│   ├── broadcast-channel.ts   # BroadcastChannel class - pub/sub patterns
│   ├── circuit-breaker.ts     # CircuitBreaker class - fault tolerance
│   ├── resource-pool.ts       # ResourcePool class - managed resource pools
│   ├── profiler.ts            # Profiler class - task performance profiling
│   ├── logger.ts              # Logger utilities - structured logging
│   ├── deadlock-detector.ts   # DeadlockDetector class - deadlock detection
│   ├── metrics-exporter.ts    # Metrics export utilities
│   ├── rate-limiting.ts       # Standalone debounce and throttle utilities
│   └── testing/               # Test utilities
│       └── index.ts           # Mock scopes, spies, timers for testing
├── benchmarks/                # Benchmark suite
│   └── index.ts               # Performance benchmarks
├── tests/                     # Test suite organized by category
│   ├── core.test.ts           # Core functionality (Task, Scope, race, parallel, retry, OpenTelemetry)
│   ├── concurrency.test.ts    # Channels, Semaphore, CircuitBreaker, stream, poll
│   ├── rate-limiting.test.ts  # Debounce, throttle, metrics, hooks, select
│   └── performance.test.ts    # Performance benchmarks
├── dist/                      # Compiled output (generated, NOT committed)
│   ├── index.mjs              # ESM build
│   ├── index.cjs              # CommonJS build
│   ├── index.d.mts            # ESM type definitions
│   └── index.d.cts            # CommonJS type definitions
├── examples/                  # Usage examples
│   └── jaeger-tracing.ts      # OpenTelemetry tracing example with Jaeger
├── docs/                      # Documentation
│   ├── 01-quick-start.md      # Quick start guide
│   ├── 02-concepts.md         # Core concepts
│   ├── 03-api-reference.md    # Complete API reference
│   ├── 04-advanced-features.md # Advanced features guide
│   ├── 05-comparisons.md      # Comparisons with other libraries
│   └── 06-integrations.md     # Integration guides
├── package.json               # Package configuration
├── tsconfig.json              # TypeScript configuration (ES2022, NodeNext, strict)
├── vitest.config.ts           # Vitest test configuration (globals enabled)
├── docker-compose.yml         # Jaeger, Prometheus & Grafana setup
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
npx vitest run tests/prometheus.test.ts
npx vitest run tests/testing.test.ts
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
   - Methods:
     - `task()` - Spawn tasks with Result tuple return
     - `provide()` / `use()` - Dependency injection
     - `race()` - Race multiple tasks
     - `parallel()` - Run tasks in parallel with concurrency limit
     - `channel()` - Create Go-style channels
     - `stream()` - Wrap async iterables
     - `poll()` - Interval polling with controller
     - `debounce()` / `throttle()` - Rate limiting
     - `select()` - Wait on multiple channel operations
     - `metrics()` - Get collected metrics
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
   - Properties: `isClosed`, `size`, `cap`

5. **Semaphore** (`semaphore.ts`): Rate limiting primitive
   - Acquire/release pattern with auto-release on error
   - Respects scope cancellation
   - Queue-based fairness
   - Methods: `acquire()`, `execute()`, `[Symbol.asyncDispose]`
   - Properties: `available`, `availablePermits`, `waiting`, `waiterCount`, `totalPermits`

6. **CircuitBreaker** (`circuit-breaker.ts`): Fault tolerance
   - States: closed, open, half-open
   - Configurable failure threshold and reset timeout
   - Respects parent AbortSignal
   - Methods: `execute()`, `reset()`, `[Symbol.asyncDispose]`
   - Properties: `currentState`, `failureCount`, `failureThreshold`, `resetTimeout`

### Utility Functions

- **scope(options?)**: Factory for Scope instances (`index.ts`)
- **race(factories, options?)**: Race with automatic cancellation of losers (`index.ts`)
- **parallel(factories, options?)**: Parallel execution with concurrency limit (`index.ts`)
- **stream(source, signal?)**: Async iterable wrapper with cancellation (`index.ts`)
- **poll(fn, onValue, options?)**: Interval polling with cleanup (`index.ts`, deprecated in favor of `scope().poll()`)
- **debounce(scope, fn, options?)**: Debounced function wrapper (`rate-limiting.ts`)
- **throttle(scope, fn, options?)**: Throttled function wrapper (`rate-limiting.ts`)

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
stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>
poll<T>(fn, onValue, options?): PollController
race<T>(factories): Promise<Result<unknown, T>>
parallel<T>(factories, options?): Promise<Result<unknown, T>[]>
debounce<T, Args>(fn, options?): (...args: Args) => Promise<Result<unknown, T>>
throttle<T, Args>(fn, options?): (...args: Args) => Promise<Result<unknown, T>>
select<T>(cases): Promise<Result<unknown, T>>
metrics(): ScopeMetrics | undefined
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

Enable with: `DEBUG=go-go-scope:* node your-app.js`

## Package Exports

The package supports both ESM and CommonJS:

```json
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    "require": {
      "types": "./dist/index.d.cts",
      "default": "./dist/index.cjs"
    },
    "import": {
      "types": "./dist/index.d.mts",
      "default": "./dist/index.mjs"
    }
  }
}
```

## Dependencies

### Runtime Dependencies
- `debug` ^4.4.3 - Debug logging utility
- `@opentelemetry/api` ^1.9.0 - OpenTelemetry API for tracing

### Dev Dependencies
- `@biomejs/biome` ^2.3.15 - Linter/formatter
- `@opentelemetry/exporter-trace-otlp-http` ^0.212.0 - OTLP trace exporter
- `@opentelemetry/resources` ^2.5.1 - OpenTelemetry resources
- `@opentelemetry/sdk-node` ^0.212.0 - OpenTelemetry Node.js SDK
- `@opentelemetry/semantic-conventions` ^1.39.0 - Semantic conventions
- `@types/debug` ^4.1.12 - Type definitions for debug
- `@types/node` ^24 - Type definitions for Node.js
- `effect` ^3.19.16 - For comparison examples
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

## License

MIT License - See LICENSE file for details
