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

- [`scope()`](./api/go-go-scope.md#scope) - Creates a new Scope for structured concurrency. A Scope is a container for concu...
- [`parallel()`](./api/go-go-scope.md#parallel) - Runs multiple tasks in parallel with optional concurrency limit and progress tra...
- [`poll()`](./api/go-go-scope.md#poll) - Polls a function at regular intervals with structured concurrency. Automatically...
- [`race()`](./api/go-go-scope.md#race) - Races multiple tasks - the first to settle wins, others are cancelled. Implement...

### Core Classes

- [`BroadcastChannel<T>`](./api/go-go-scope.md#broadcastchannel) - BroadcastChannel class for go-go-scope - Pub/sub pattern Unlike regular Channel ...
- [`Channel<T>`](./api/go-go-scope.md#channel) - A Channel for Go-style concurrent communication between tasks. Channels provide ...
- [`CircuitBreaker<T>`](./api/go-go-scope.md#circuitbreaker) - Circuit Breaker implementation for fault tolerance. The circuit breaker pattern ...
- [`Scope<T>`](./api/go-go-scope.md#scope) - A Scope for structured concurrency.  // @ts-expect-error TypeScript may not reco...
- [`Semaphore<T>`](./api/go-go-scope.md#semaphore) - A Semaphore for limiting concurrent access to a resource. Respects scope cancell...
- [`Task<T>`](./api/go-go-scope.md#task) - A disposable task that runs within a Scope. Task implements `PromiseLike` for aw...

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
