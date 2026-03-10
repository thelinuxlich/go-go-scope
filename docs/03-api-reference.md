# API Reference

The API documentation is automatically generated from JSDoc comments in the source code. This ensures the documentation is always up-to-date and comprehensive.

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total Documented Items** | 955 |
| **Packages** | 40 |
| **Functions** | 204 |
| **Classes** | 80 |
| **Stream Operators** | 92 |

## Core Packages

| Package | Description | Link |
|---------|-------------|------|
| **go-go-scope** | Core library - Scope, Task, Channel, and concurrency primitives | [View API](./api/go-go-scope.md) (388 items) |
| **stream** | Lazy stream processing with 50+ operators | [View API](./api/stream.md) (95 items) |
| **scheduler** | Distributed job scheduler with cron support | [View API](./api/scheduler.md) (117 items) |
| **testing** | Testing utilities and mock helpers | [View API](./api/testing.md) (25 items) |

## Framework Adapters

| Package | Description | Link |
|---------|-------------|------|
| **adapter-astro** | Astro integration | [View API](./api/adapter-astro.md) (4 items) |
| **adapter-aws-lambda-edge** | Aws-lambda-edge integration | [View API](./api/adapter-aws-lambda-edge.md) (9 items) |
| **adapter-cloudflare-workers** | Cloudflare-workers integration | [View API](./api/adapter-cloudflare-workers.md) (4 items) |
| **adapter-elysia** | Elysia integration | [View API](./api/adapter-elysia.md) (3 items) |
| **adapter-express** | Express integration | [View API](./api/adapter-express.md) (2 items) |
| **adapter-fresh** | Fresh integration | [View API](./api/adapter-fresh.md) (6 items) |
| **adapter-hapi** | Hapi integration | [View API](./api/adapter-hapi.md) (3 items) |
| **adapter-hono** | Hono integration | [View API](./api/adapter-hono.md) (3 items) |
| **adapter-koa** | Koa integration | [View API](./api/adapter-koa.md) (4 items) |
| **adapter-nestjs** | Nestjs integration | [View API](./api/adapter-nestjs.md) (6 items) |
| **adapter-nextjs** | Nextjs integration | [View API](./api/adapter-nextjs.md) (13 items) |
| **adapter-nuxt** | Nuxt integration | [View API](./api/adapter-nuxt.md) (3 items) |
| **adapter-react** | React integration | [View API](./api/adapter-react.md) (16 items) |
| **adapter-remix** | Remix integration | [View API](./api/adapter-remix.md) (5 items) |
| **adapter-solid-start** | Solid-start integration | [View API](./api/adapter-solid-start.md) (4 items) |
| **adapter-svelte** | Svelte integration | [View API](./api/adapter-svelte.md) (18 items) |
| **adapter-sveltekit** | Sveltekit integration | [View API](./api/adapter-sveltekit.md) (5 items) |
| **adapter-vercel-edge** | Vercel-edge integration | [View API](./api/adapter-vercel-edge.md) (6 items) |

## Persistence Adapters

| Package | Description | Link |
|---------|-------------|------|
| **persistence-cloudflare-do** | Cloudflare-do adapter | [View API](./api/persistence-cloudflare-do.md) (3 items) |
| **persistence-deno-kv** | Deno-kv adapter | [View API](./api/persistence-deno-kv.md) (2 items) |
| **persistence-dynamodb** | Dynamodb adapter | [View API](./api/persistence-dynamodb.md) (2 items) |
| **persistence-mongodb** | Mongodb adapter | [View API](./api/persistence-mongodb.md) (2 items) |
| **persistence-mysql** | Mysql adapter | [View API](./api/persistence-mysql.md) (6 items) |
| **persistence-postgres** | Postgres adapter | [View API](./api/persistence-postgres.md) (6 items) |
| **persistence-redis** | Redis adapter | [View API](./api/persistence-redis.md) (4 items) |
| **persistence-sqlite** | Sqlite adapter | [View API](./api/persistence-sqlite.md) (7 items) |
| **persistence-sqlite-bun** | Sqlite-bun adapter | [View API](./api/persistence-sqlite-bun.md) (1 items) |

## Plugins

| Package | Description | Link |
|---------|-------------|------|
| **plugin-deadlock-detector** | Deadlock detector | [View API](./api/plugin-deadlock-detector.md) (9 items) |
| **plugin-metrics** | Metrics | [View API](./api/plugin-metrics.md) (43 items) |
| **plugin-opentelemetry** | Opentelemetry | [View API](./api/plugin-opentelemetry.md) (49 items) |
| **plugin-profiler** | Profiler | [View API](./api/plugin-profiler.md) (14 items) |
| **plugin-visualizer** | Visualizer | [View API](./api/plugin-visualizer.md) (9 items) |
| **plugin-worker-profiler** | Worker profiler | [View API](./api/plugin-worker-profiler.md) (14 items) |

## Other Packages

| Package | Description | Link |
|---------|-------------|------|
| **benchmark** | - | [View API](./api/benchmark.md) (11 items) |
| **logger** | - | [View API](./api/logger.md) (10 items) |
| **web-streams** | - | [View API](./api/web-streams.md) (24 items) |

## Complete API Index

For a complete searchable index of all APIs across all packages, see the [API README](./api/README.md) or the [search index](./api/search-index.json).

## Core API Quick Reference

### Main Functions

- [`scope()`](./api/go-go-scope.md#scope) - Creates a new Scope for structured concurrency. A Scope is a container for concurrent tasks that ensures proper cleanup and cancellation propagation. When a scope is disposed, all tasks within it are automatically cancelled. This enables safe, predictable concurrent programming using the `using`/`await using` syntax. Scopes support: - Automatic cancellation propagation to child tasks - Timeout handling with automatic cleanup - Parent-child scope relationships - Concurrency limiting - Circuit breaker patterns - OpenTelemetry tracing integration - Lifecycle hooks for monitoring - Service dependency injection parent signal, concurrency limits, circuit breaker, tracing, and more #__PURE__
- [`parallel()`](./api/go-go-scope.md#parallel) - Runs multiple tasks in parallel with optional concurrency limit and progress tracking. All tasks run within a scope and are cancelled together on parent cancellation. Returns a tuple of Results where each position corresponds to the factory at the same index. This preserves individual return types for type-safe destructuring. Features: - Type-safe parallel execution with individual result types - Optional concurrency limiting - Progress tracking via callback - Configurable error handling (fail fast or continue on error) - Worker thread support for CPU-intensive tasks - Automatic cancellation propagation - Structured concurrency - all tasks cancelled together on failure
- [`poll()`](./api/go-go-scope.md#poll) - Polls a function at regular intervals with structured concurrency. Automatically starts polling and returns a controller for managing the polling lifecycle. Polling automatically stops when: - The parent scope is disposed - The abort signal is triggered - The `stop()` method is called - The controller is disposed via `Symbol.dispose` Features: - Configurable polling interval - Immediate or delayed first execution - Automatic error handling (continues polling on errors) - Status tracking (poll count, timing) - Start/stop control - Automatic cleanup on scope disposal Can be async. Errors in this callback don't stop polling.
- [`race()`](./api/go-go-scope.md#race) - Races multiple tasks - the first to settle wins, others are cancelled. Implements structured concurrency: all tasks run within a scope and are automatically cancelled when a winner is determined. This prevents resource leaks from abandoned tasks. Features: - First settled task wins (success or error by default) - Optional `requireSuccess` to wait for first successful result - Timeout support with automatic cancellation - Concurrency limiting for controlled execution - Staggered start (hedging pattern) for latency-sensitive operations - Worker thread support for CPU-intensive tasks - Structured concurrency - losers are cancelled

### Core Classes

- [`BroadcastChannel<T>`](./api/go-go-scope.md#broadcastchannel) - BroadcastChannel class for go-go-scope - Pub/sub pattern Unlike regular Channel where each message goes to one consumer, BroadcastChannel sends each message to ALL active consumers. A BroadcastChannel for pub/sub patterns. All consumers receive every message (unlike regular {@link Channel} where messages are distributed to one consumer each). This is useful for event broadcasting, notifications, and fan-out scenarios. Features: - Multiple subscribers receive all messages - Per-subscriber message queuing - Automatic cleanup on scope disposal - AsyncIterable support for subscribers #__PURE__
- [`Channel<T>`](./api/go-go-scope.md#channel) - A Channel for Go-style concurrent communication between tasks. Channels provide a typed, buffered communication mechanism that supports multiple producers and consumers. They implement backpressure strategies for when the buffer is full and automatically close when the parent scope is disposed. Features: - Ring buffer for O(1) enqueue/dequeue operations - Multiple backpressure strategies: 'block', 'drop-oldest', 'drop-latest', 'error', 'sample' - AsyncIterable support for for-await-of loops - Automatic cleanup on scope disposal - Functional operations: map, filter, reduce, take #__PURE__
- [`CircuitBreaker<T>`](./api/go-go-scope.md#circuitbreaker) - Circuit Breaker implementation for fault tolerance. The circuit breaker pattern prevents cascading failures by stopping requests to a failing service. It operates in three states: - **Closed**: Normal operation, requests pass through - **Open**: Service is failing, requests fail fast without calling the service - **Half-Open**: Testing if the service has recovered, limited requests allowed Features: - Automatic state transitions based on failure thresholds - Configurable reset timeout - Sliding window for failure tracking - Adaptive thresholds based on error rates - Event subscriptions for monitoring - Success threshold for recovery confirmation Created automatically when `circuitBreaker` options are passed to {@link scope}. Can also be used standalone for custom circuit breaking logic. #__PURE__
- [`Scope<T>`](./api/go-go-scope.md#scope) - A Scope for structured concurrency. The Scope class is the core primitive of go-go-scope, providing: - Automatic cancellation propagation - Resource cleanup (LIFO order) - Task spawning with Result tuples - Timeout and retry support - Parallel and race execution - Channels, semaphores, and more // @ts-expect-error TypeScript may not recognize Symbol.asyncDispose in all configurations
- [`Semaphore<T>`](./api/go-go-scope.md#semaphore) - A Semaphore for limiting concurrent access to a resource. Respects scope cancellation and supports priority-based acquisition. #__PURE__
- [`Task<T>`](./api/go-go-scope.md#task) - A disposable task that runs within a Scope. Task implements `PromiseLike` for await support and `Disposable` for cleanup via the `using` syntax. Execution is lazy - the task only starts when awaited or `.then()` is called. This enables efficient task composition without creating unnecessary promises. Key features: - Lazy execution - only starts when consumed - Automatic cancellation propagation from parent scope - Disposable cleanup via `Symbol.dispose` - Promise-like interface with `then`, `catch`, `finally` - Unique task ID for debugging and tracing Optimizations: - Lazy AbortController creation (only when needed) - Reduced memory allocations in hot paths - Efficient parent signal linking #__PURE__

### Type Aliases

- [`Result<E, T>`](./api/go-go-scope.md#result) - Error-first result tuple
- [`Success<T>`](./api/go-go-scope.md#success) - Success variant
- [`Failure<E>`](./api/go-go-scope.md#failure) - Failure variant

## Updating the API Documentation

The API documentation is automatically generated from JSDoc comments. To regenerate:

```bash
pnpm docs:generate
```

This will:
1. Parse all TypeScript source files in the `packages/` directory
2. Extract JSDoc comments from exported functions, classes, and types
3. Generate Markdown documentation in `docs/api/`
4. Create a searchable JSON index
5. Update this overview file (`docs/03-api-reference.md`)
6. Update the API section in `docs/index.html`

## Contributing to Documentation

When adding new functions or modifying existing ones:

1. Add comprehensive JSDoc comments with `@example` blocks
2. Document all object parameters using `@param options.property` notation
3. Include default values in parentheses: `(default: 100)`
4. Run `pnpm docs:generate` to update the API docs
5. Verify the generated documentation looks correct

---

*The API documentation is automatically generated from JSDoc comments. Last updated: 2026-03-10*
