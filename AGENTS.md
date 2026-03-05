# go-go-scope - Agent Documentation

## Project Overview

go-go-scope is a TypeScript monorepo that provides **structured concurrency** using the Explicit Resource Management proposal (TypeScript 5.2+). It enables developers to write concurrent code with automatic cleanup and cancellation propagation using the `using` and `await using` syntax.

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
- Stream API with 50+ lazy operations (map, filter, flatMap, buffer, debounce, throttle, pairwise, window, etc.)
- `parallel()` for processing arrays with progress tracking and error handling
- Dependency injection via context services
- Polling utilities with start/stop control
- Debounce and throttle rate-limiting utilities
- Select statement for channel operations (Go-style) with timeout
- Lifecycle hooks for task and resource events
- Metrics collection with Prometheus/JSON export
- Resource pools for connection/worker management
- Task profiling for performance analysis
- Deadlock detection
- Structured logging integration
- Checkpoint and idempotency support for fault-tolerant operations
- Graceful shutdown handling with customizable strategies
- Token bucket rate limiting
- Priority channels for task prioritization
- Web Worker pool for CPU-intensive operations
- Distributed job scheduler with cron support, Web UI, and multiple storage backends
- Cache utilities with warming and multi-tier support
- **Property-based testing**: Mathematical properties verified with fast-check
- **Persistence adapters**: Distributed locks and circuit breaker state across Redis, PostgreSQL, MySQL, SQLite, MongoDB, DynamoDB, Deno KV, Cloudflare Durable Objects
- **Framework adapters**: Fastify, Express, NestJS, Hono, Elysia, Koa, Hapi, Next.js, Remix, SvelteKit

### Patterns (via composition)
- **Actor Model**: Message-passing concurrency with channels
- **Health Checks**: Parallel dependency checking with timeouts
- **Pipeline Processing**: Stream-based data transformation pipelines
- **Circuit Breaker**: Fault tolerance with automatic recovery
- **Distributed Scheduling**: Cron-like job scheduling with HA support

---

## Technology Stack

- **Language**: TypeScript 5.9.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 24+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) v2.26.3 - Zero-config TypeScript package bundler
- **Package Manager**: pnpm >= 8.0.0 (workspaces enabled)
- **Versioning**: [changesets](https://github.com/changesets/changesets) for monorepo versioning

### Runtime Requirements
- **Node.js**: >= 24.0.0 (for native `fetch`, `AbortSignal` improvements, and `using` syntax)
- **Bun**: >= 1.2.0 (fully supported)

### Development Tools
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v2.4.4
- **Testing**: [Vitest](https://vitest.dev/) v4.0.18 with globals enabled
- **TypeScript Execution**: [tsx](https://github.com/privatenumber/tsx) v4.21.0

### Runtime Dependencies (Core)
- `debug` ^4.4.3 (for debug logging)

### Peer Dependencies (Optional)
- `@opentelemetry/api` ^1.9.0 (for tracing, in plugin-opentelemetry)
- `ioredis` ^5.9.3 (for Redis persistence)
- `pg` ^8.18.0 (for PostgreSQL persistence)
- `mysql2` ^3.18.0 (for MySQL persistence)
- `sqlite3` ^5.1.7 (for SQLite persistence)
- `fastify` ^5.7.4 + `fastify-plugin` ^5.1.0 (for Fastify adapter)
- Various framework-specific packages for other adapters

---

## Monorepo Structure

```
packages/
├── go-go-scope/                # Core library (main package)
│   ├── src/
│   │   ├── index.ts            # Main exports
│   │   ├── types.ts            # Type definitions
│   │   ├── scope.ts            # Scope class - structured concurrency primitive
│   │   ├── task.ts             # Task class - lazy disposable Promise
│   │   ├── factory.ts          # scope() factory function
│   │   ├── channel.ts          # Go-style channels
│   │   ├── broadcast-channel.ts # Pub/sub broadcast channels
│   │   ├── semaphore.ts        # Rate limiting primitive
│   │   ├── circuit-breaker.ts  # Fault tolerance
│   │   ├── resource-pool.ts    # Managed resource pools
│   │   ├── worker-pool.ts      # Web Worker pool for CPU tasks
│   │   ├── token-bucket.ts     # Token bucket rate limiting
│   │   ├── priority-channel.ts # Priority queue channels
│   │   ├── cache.ts            # Cache utilities
│   │   ├── checkpoint.ts       # Checkpoint/restart support
│   │   ├── idempotency.ts      # Idempotency provider
│   │   ├── graceful-shutdown.ts # Graceful shutdown handling
│   │   ├── graceful-shutdown-enhanced.ts # Advanced shutdown strategies
│   │   ├── parallel.ts         # Parallel execution
│   │   ├── race.ts             # Race with cancellation
│   │   ├── poll.ts             # Polling utilities
│   │   ├── rate-limiting.ts    # Debounce/throttle utilities
│   │   ├── retry-strategies.ts # Retry delay strategies
│   │   ├── cancellation.ts     # AbortSignal utilities
│   │   ├── async-iterable.ts   # Async iterable helpers
│   │   ├── event-emitter.ts    # Event emitter with scope integration
│   │   ├── lock.ts             # Distributed locking
│   │   ├── logger.ts           # Structured logging
│   │   ├── log-correlation.ts  # Log correlation utilities
│   │   ├── performance.ts      # Performance monitoring
│   │   ├── plugin.ts           # Plugin system
│   │   ├── errors.ts           # Error classes
│   │   └── persistence/        # Persistence types
│   │       ├── index.ts
│   │       └── types.ts
│   └── tests/                  # Test files (organized by category)
│
├── stream/                     # Lazy async iterable streams
│   └── src/
│       └── index.ts            # Stream class with 50+ operations
│
├── scheduler/                  # Distributed job scheduler
│   └── src/
│       ├── index.ts            # Main exports
│       ├── scheduler.ts        # Scheduler class
│       ├── cron.ts             # Cron expression parsing
│       ├── persistence-storage.ts # Redis/SQL storage
│       ├── types.ts            # Scheduler types
│       └── web-ui.ts           # Web UI for schedule management
│
├── scheduler-tui/              # Interactive TUI and CLI for scheduler
│   └── src/
│       ├── cli.ts              # CLI entry point
│       ├── tui.ts              # TUI entry point
│       └── index.ts            # Library exports
│
├── testing/                    # Test utilities
│   └── src/
│       └── index.ts            # Mock scopes, spies
│
├── logger/                     # Logger package (advanced logging)
│
├── web-streams/                # Web Streams API integration
│
├── persistence-redis/          # Redis persistence adapter
├── persistence-postgres/       # PostgreSQL persistence adapter
├── persistence-mysql/          # MySQL persistence adapter
├── persistence-sqlite/         # SQLite persistence adapter (Node)
├── persistence-sqlite-bun/     # SQLite persistence adapter (Bun)
├── persistence-mongodb/        # MongoDB persistence adapter
├── persistence-dynamodb/       # DynamoDB persistence adapter
└── persistence-deno-kv/        # Deno KV persistence adapter

├── adapter-fastify/            # Fastify plugin
├── adapter-express/            # Express middleware
├── adapter-nestjs/             # NestJS module
├── adapter-hono/               # Hono middleware
├── adapter-elysia/             # Elysia plugin
├── adapter-koa/                # Koa middleware
├── adapter-hapi/               # Hapi plugin
├── adapter-nextjs/             # Next.js integration
├── adapter-remix/              # Remix integration
└── adapter-sveltekit/          # SvelteKit integration

├── plugin-opentelemetry/       # OpenTelemetry tracing plugin
├── plugin-metrics/             # Metrics collection plugin
├── plugin-profiler/            # Performance profiling plugin
└── plugin-deadlock-detector/   # Deadlock detection plugin

docs/                           # Documentation (markdown)
dist/                           # Compiled output (generated, NOT committed)
examples/                       # Usage examples
```

---

## Build and Test Commands

### Root Level (Monorepo-wide)

```bash
# Building
pnpm build                    # Build all packages
pnpm build:core              # Build go-go-scope only
pnpm build:scheduler         # Build @go-go-scope/scheduler only
pnpm build:tui               # Build @go-go-scope/scheduler-tui only
pnpm build:adapters          # Build all framework adapters
pnpm build:persistence       # Build all persistence adapters

# Testing & Quality
pnpm test                    # Run all tests
pnpm test:core               # Run core package tests
pnpm test:scheduler          # Run scheduler tests
pnpm test:bun:core           # Run core tests under Bun runtime
pnpm test:bun:all            # Run all tests under Bun runtime
pnpm typecheck               # Type check all packages
pnpm lint                    # Lint all packages

# Publishing (via changesets)
pnpm changeset               # Create a changeset
pnpm version-packages        # Version packages based on changesets
pnpm release                 # Build and publish (uses changesets)
pnpm publish:all             # Build and publish all packages
pnpm publish:core            # Publish core only
pnpm publish:scheduler       # Publish scheduler only
pnpm publish:tui             # Publish TUI only

# Scheduler TUI/CLI
pnpm tui                     # Run the scheduler TUI
pnpm tui:redis               # Run TUI with Redis storage
pnpm cli                     # Run the scheduler CLI
```

### Package Level

```bash
cd packages/go-go-scope
pnpm build       # Build the package
pnpm test        # Run package tests (builds, lints, then tests)
pnpm typecheck   # Type check the package
pnpm lint        # Lint the package
pnpm clean       # Remove dist directory
```

### MANDATORY Post-Implementation Steps

**ALWAYS run these commands after making code changes:**

1. **Typecheck the entire project:**
   ```bash
   pnpm typecheck
   # or for specific package:
   pnpm --filter go-go-scope typecheck
   ```

2. **Run the full test suite:**
   ```bash
   pnpm test
   # or for specific package:
   pnpm --filter go-go-scope test
   ```

3. **Fix any type errors or test failures before considering the task complete**

---

## Code Style Guidelines

### Linting
- Uses **Biome** for linting and formatting
- Configuration in each package's `biome.json` or inherited from root
- Indent style: tab
- Run `pnpm lint` to auto-fix issues
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
- Package names use `@go-go-scope/` prefix for scoped packages

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
task<T>(fn: (ctx: { services: Services; signal: AbortSignal; logger: Logger; context: Record<string, unknown> }) => Promise<T>): Task<Result<unknown, T>>
```

---

## Architecture Details

### Core Classes (go-go-scope package)

1. **Task<T>** (`task.ts`): Promise-like disposable task
   - Implements `PromiseLike<T>` for await support
   - Implements `Disposable` for `using` keyword support
   - Links to parent AbortSignal for cancellation propagation
   - Lazy execution - starts only when awaited or `.then()` called
   - Each task has a unique ID for debugging

2. **Scope<Services>** (`scope.ts`): Main structured concurrency primitive
   - Manages `AbortController` for cancellation
   - Tracks disposables for cleanup (LIFO order)
   - Supports timeout and parent signal linking
   - Supports parent scope inheritance (services, tracer, concurrency, circuit breaker)
   - Supports lifecycle hooks and metrics collection
   - Supports checkpoint/idempotency for fault tolerance
   - Methods include: `task()`, `race()`, `parallel()`, `channel()`, `broadcast()`, `stream()`, `poll()`, `debounce()`, `throttle()`, `select()`, `resourcePool()`, `acquireLock()`, etc.

3. **Channel<T>** (`channel.ts`): Go-style buffered channel
   - Supports multiple producers/consumers
   - Implements backpressure via buffer limits
   - Implements `AsyncIterable` for `for await...of` support

4. **BroadcastChannel<T>** (`broadcast-channel.ts`): Pub/sub broadcast channel
   - All subscribers receive every message
   - Supports filtering via subscriber functions

5. **Semaphore** (`semaphore.ts`): Rate limiting primitive
   - Acquire/release pattern with auto-release on error
   - Queue-based fairness

6. **CircuitBreaker** (`circuit-breaker.ts`): Fault tolerance
   - States: closed, open, half-open
   - Configurable failure threshold and reset timeout

7. **ResourcePool<T>** (`resource-pool.ts`): Managed resource pools
   - Min/max pool size management
   - Acquire timeout support

8. **WorkerPool** (`worker-pool.ts`): Web Worker pool for CPU tasks
   - Manages worker lifecycle
   - Supports task distribution

9. **Stream<T>** (`@go-go-scope/stream` package): Lazy async iterable processing
   - 50+ operations: map, filter, flatMap, take, drop, buffer, debounce, throttle, etc.
   - Lazy evaluation - operations compose until terminal operation

10. **Scheduler** (`@go-go-scope/scheduler` package): Distributed job scheduler
    - Admin + Workers architecture
    - Cron expression support with presets
    - Web UI for schedule management
    - Multiple storage backends (Redis, SQL, InMemory)
    - Distributed locking for HA

### Package Dependencies

```
go-go-scope (core - no internal deps)
    │
    ├── @go-go-scope/stream (depends on go-go-scope)
    ├── @go-go-scope/testing (depends on go-go-scope)
    ├── @go-go-scope/logger (depends on go-go-scope)
    ├── @go-go-scope/web-streams (depends on go-go-scope)
    │
    ├── @go-go-scope/scheduler (depends on go-go-scope)
    │   └── @go-go-scope/scheduler-tui (depends on scheduler + go-go-scope)
    │
    ├── @go-go-scope/persistence-* (depends on go-go-scope)
    │
    ├── @go-go-scope/adapter-* (depends on go-go-scope)
    │
    └── @go-go-scope/plugin-* (depends on go-go-scope)
```

### Retry Strategies

- **exponentialBackoff(options?)**: Exponential backoff with optional jitter
- **jitter(baseDelay, jitterFactor?)**: Fixed delay with jitter
- **linear(baseDelay, increment)**: Linear increasing delay
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

---

## Testing Strategy

### Test Organization (Core Package)

- **tests/core.test.ts**: Core functionality (Task, Scope, retry, OpenTelemetry)
- **tests/concurrency.test.ts**: Channels, Semaphore, CircuitBreaker, poll
- **tests/rate-limiting.test.ts**: Debounce, throttle, metrics, hooks, select
- **tests/cancellation.test.ts**: Cancellation utility functions
- **tests/stream.test.ts**: Stream API (in @go-go-scope/stream package)
- **tests/testing.test.ts**: Test utilities validation
- **tests/type-check.test.ts**: TypeScript type-level tests
- **tests/performance.test.ts**: Performance benchmarks
- **tests/fuzz.test.ts**: Fuzz tests for race conditions
- **tests/memory-leak.test.ts**: Memory leak verification
- **tests/checkpoint.test.ts**: Checkpoint and restart functionality
- **tests/idempotency.test.ts**: Idempotency provider tests
- **tests/lock.test.ts**: Distributed locking tests
- **tests/persistence-integration.test.ts**: Persistence adapter integration tests

### Test Patterns
- Uses Vitest with globals enabled (no need to import `describe`, `test`, `expect`)
- Tests use `await using` and `using` syntax extensively
- Async cleanup is verified using event tracking
- Timeouts use actual timers (no fake timers)
- Tests verify both success and failure paths

### Running Tests

```bash
# Full test suite
pnpm test

# Watch mode for development
pnpm test:watch

# Run specific package tests
pnpm --filter go-go-scope test
pnpm --filter @go-go-scope/scheduler test

# Bun compatibility
pnpm test:bun:core
pnpm test:bun:all
```

### Property-Based Testing

Uses [fast-check](https://github.com/dubzzz/fast-check) to verify mathematical properties:

**Stream Properties:**
- Map composition: `map(f).map(g) == map(g ∘ f)`
- Filter idempotence: `filter(p).filter(p) == filter(p)`

**Channel Properties:**
- FIFO order for send/receive
- Size never exceeds capacity

### Writing New Tests

```typescript
import { scope } from "go-go-scope";

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
    await new Promise((r) => setTimeout(r, 10));
    
    expect(aborted).toBe(true);
});
```

---

## Development Environment

### Docker Compose Services

The project includes a `docker-compose.yml` with services for integration testing:

**Persistence Services:**
- `redis` (port 6380): For Redis persistence adapter tests
- `postgres` (port 5433): For PostgreSQL persistence adapter tests
- `mysql` (port 3307): For MySQL persistence adapter tests
- `mongodb` (port 27018): For MongoDB persistence adapter tests
- `dynamodb-local` (port 8001): For DynamoDB persistence adapter tests

**Observability Services:**
- `jaeger` (port 16687): Distributed tracing UI
- `prometheus` (port 9091): Metrics collection
- `pushgateway` (port 9092): Prometheus push gateway
- `grafana` (port 3001): Metrics visualization

Start services: `docker-compose up -d`

### Dev Container

The project includes a `.devcontainer/devcontainer.json` for VS Code:
- TypeScript/Node.js 20 base image
- Pre-configured with Biome, Vitest, and other extensions
- Docker-in-Docker support
- Port forwarding for observability services

---

## Bun Compatibility

The library is fully tested and works with Bun runtime (v1.2.0+).

### Features that work with Bun:
- ✅ Core scope/task functionality
- ✅ Parallel execution
- ✅ Channels and broadcast channels
- ✅ Semaphores
- ✅ Circuit breakers
- ✅ Rate limiting (debounce/throttle)
- ✅ Polling
- ✅ Stream processing
- ✅ SQLite persistence (via `bun:sqlite` or `sqlite3`)
- ✅ Native `fetch`

### Running tests under Bun:
```bash
# Run Bun compatibility tests
bun test packages/go-go-scope/tests/core.test.ts

# Run all tests under Bun
bun test

# Or via pnpm script
pnpm test:bun:core
pnpm test:bun:all
```

---

## Package Exports

All packages are **ESM-only** (Node.js 24+):

### Core Package

```typescript
// Main imports
import { scope, Task, Scope, Channel, Semaphore, CircuitBreaker } from 'go-go-scope';

// Result tuple type
import type { Result, Success, Failure } from 'go-go-scope';
```

### Scoped Packages

```typescript
// Stream operations
import { Stream } from '@go-go-scope/stream';

// Testing utilities
import { createMockScope, createSpy } from '@go-go-scope/testing';

// Persistence adapters
import { RedisAdapter } from '@go-go-scope/persistence-redis';
import { PostgresAdapter } from '@go-go-scope/persistence-postgres';

// Framework adapters
import { fastifyGoGoScope } from '@go-go-scope/adapter-fastify';
import { expressGoGoScope } from '@go-go-scope/adapter-express';

// Scheduler
import { Scheduler, CronPresets } from '@go-go-scope/scheduler';

// Plugins
import { openTelemetryPlugin } from '@go-go-scope/plugin-opentelemetry';
```

---

## Debug Logging

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

---

## Security Considerations

- All async operations respect AbortSignal for cancellation
- Resources are always cleaned up in LIFO order
- The library does not execute untrusted code
- No external runtime dependencies besides `debug` (core)
- Task functions receive AbortSignal to handle cancellation safely
- Circuit breaker prevents cascading failures
- Resource pools have acquisition timeouts to prevent indefinite blocking
- Distributed locks have TTL to prevent indefinite locks

---

## Common Tasks

### Adding a New Package

1. Create a new directory in `packages/`
2. Add a `package.json` with the name `@go-go-scope/your-package`
3. Add a `tsconfig.json` extending `../../tsconfig.base.json`
4. Create a `src/index.ts` as the entry point
5. Add the package to the root README.md

Example `package.json`:
```json
{
  "name": "@go-go-scope/your-package",
  "version": "2.6.2",
  "type": "module",
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "scripts": {
    "build": "pkgroll --clean-dist",
    "test": "vitest run --passWithNoTests",
    "lint": "biome check --write src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "go-go-scope": "workspace:*"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.4",
    "pkgroll": "^2.26.3",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

### Modifying Core Behavior

- Changes to `Task` or `Scope` affect the entire library
- Ensure AbortSignal propagation is maintained
- Verify LIFO disposal order is preserved
- Run full test suite before committing

### Working with the Scheduler

```bash
# Build all packages
pnpm build

# Run the TUI for testing
pnpm tui

# Or with Redis
pnpm tui:redis
```

---

## License

MIT License - See LICENSE file for details
