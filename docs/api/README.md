# go-go-scope API Reference

> Complete API documentation for the go-go-scope monorepo

## Packages

- [adapter-astro](./adapter-astro.md) - 4 documented items
- [adapter-aws-lambda-edge](./adapter-aws-lambda-edge.md) - 9 documented items
- [adapter-cloudflare-workers](./adapter-cloudflare-workers.md) - 4 documented items
- [adapter-elysia](./adapter-elysia.md) - 3 documented items
- [adapter-express](./adapter-express.md) - 2 documented items
- [adapter-fresh](./adapter-fresh.md) - 6 documented items
- [adapter-hapi](./adapter-hapi.md) - 3 documented items
- [adapter-hono](./adapter-hono.md) - 3 documented items
- [adapter-koa](./adapter-koa.md) - 4 documented items
- [adapter-nestjs](./adapter-nestjs.md) - 6 documented items
- [adapter-nextjs](./adapter-nextjs.md) - 13 documented items
- [adapter-nuxt](./adapter-nuxt.md) - 3 documented items
- [adapter-react](./adapter-react.md) - 16 documented items
- [adapter-remix](./adapter-remix.md) - 5 documented items
- [adapter-solid-start](./adapter-solid-start.md) - 4 documented items
- [adapter-svelte](./adapter-svelte.md) - 18 documented items
- [adapter-sveltekit](./adapter-sveltekit.md) - 5 documented items
- [adapter-vercel-edge](./adapter-vercel-edge.md) - 6 documented items
- [benchmark](./benchmark.md) - 11 documented items
- [go-go-scope](./go-go-scope.md) - 388 documented items
- [logger](./logger.md) - 10 documented items
- [persistence-cloudflare-do](./persistence-cloudflare-do.md) - 3 documented items
- [persistence-deno-kv](./persistence-deno-kv.md) - 2 documented items
- [persistence-dynamodb](./persistence-dynamodb.md) - 2 documented items
- [persistence-mongodb](./persistence-mongodb.md) - 2 documented items
- [persistence-mysql](./persistence-mysql.md) - 6 documented items
- [persistence-postgres](./persistence-postgres.md) - 6 documented items
- [persistence-redis](./persistence-redis.md) - 4 documented items
- [persistence-sqlite](./persistence-sqlite.md) - 7 documented items
- [persistence-sqlite-bun](./persistence-sqlite-bun.md) - 1 documented items
- [plugin-deadlock-detector](./plugin-deadlock-detector.md) - 9 documented items
- [plugin-metrics](./plugin-metrics.md) - 43 documented items
- [plugin-opentelemetry](./plugin-opentelemetry.md) - 49 documented items
- [plugin-profiler](./plugin-profiler.md) - 14 documented items
- [plugin-visualizer](./plugin-visualizer.md) - 9 documented items
- [plugin-worker-profiler](./plugin-worker-profiler.md) - 14 documented items
- [scheduler](./scheduler.md) - 117 documented items
- [stream](./stream.md) - 95 documented items
- [testing](./testing.md) - 25 documented items
- [web-streams](./web-streams.md) - 24 documented items

## Quick Reference

### Core Functions

- **scope** - Creates a new Scope for structured concurrency. A Scope is a container for concurrent tasks that ens...
- **parallel** - Runs multiple tasks in parallel with optional concurrency limit and progress tracking. All tasks run...
- **poll** - Polls a function at regular intervals with structured concurrency. Automatically starts polling and ...
- **race** - Races multiple tasks - the first to settle wins, others are cancelled. Implements structured concurr...

### Core Classes

- **Channel** - A Channel for Go-style concurrent communication between tasks. Channels provide a typed, buffered co...
- **Scope** - A Scope for structured concurrency. The Scope class is the core primitive of go-go-scope, providing:...
- **Task** - A disposable task that runs within a Scope. Task implements `PromiseLike` for await support and `Dis...

---

*Generated automatically from JSDoc comments*
