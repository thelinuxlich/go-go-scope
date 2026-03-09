# go-go-scope Documentation

Complete guide to structured concurrency in TypeScript.

## Quick Navigation

### Getting Started
| Doc | What You'll Learn |
|-----|-------------------|
| [📖 Quick Start](./01-quick-start.md) | Get up and running in 5 minutes |
| [🧠 Core Concepts](./02-concepts.md) | Why structured concurrency matters |

### API Reference
| Doc | What You'll Learn |
|-----|-------------------|
| [📚 API Reference](./03-api-reference.md) | Complete API documentation for all methods |
| [🚦 Cancellation](./12-cancellation.md) | Cancellation utilities and helpers |

### Patterns & Recipes
| Doc | What You'll Learn |
|-----|-------------------|
| [🍳 Recipes](./13-recipes.md) | Common patterns: HTTP clients, DB pools, WebSockets |
| [🌊 Streams](./04-streams.md) | Lazy async streams: processing pipelines, real-world examples |
| [🔄 Concurrency](./04-concurrency-patterns.md) | Channels, priority channels, broadcast, select statements |
| [🛡️ Resilience](./05-resilience-patterns.md) | Circuit breakers, retry, timeouts |
| [🔧 Advanced](./09-advanced-patterns.md) | Resource pools, parent-child scopes, DI |
| [⏱️ Rate Limiting](./07-rate-limiting.md) | Debounce, throttle, concurrency control |

### Observability & Testing
| Doc | What You'll Learn |
|-----|-------------------|
| [📊 Observability](./06-observability.md) | Metrics, logging, profiling, tracing, real-time visualizer |
| [🧪 Testing](./08-testing.md) | Mock scopes, spies, time travel testing |
| [🔌 Integrations](./11-integrations.md) | OpenTelemetry, Prometheus, Grafana, Persistence, Framework Adapters |
| [⚡ Performance](./18-performance-optimizations.md) | Ring buffer, lazy initialization, profiling |

### Advanced Features
| Doc | What You'll Learn |
|-----|-------------------|
| [💾 Caching](./17-caching-memoization.md) | Distributed caching, memoization with tasks |
| [📅 Scheduler](./15-scheduler.md) | Job scheduling with persistence and DLQ |
| [🛑 Graceful Shutdown](./19-graceful-shutdown.md) | Signal handling for clean process termination |
| [🔌 Plugins](./20-plugins.md) | Extending scope with custom functionality |
| [🌊 Stream API Design](./15-stream-api-design.md) | Stream architecture and operator design |
| [⚖️ Effect Comparison](./16-effect-stream-comparison.md) | Detailed comparison with Effect library |

### Comparisons & Migration
| Doc | What You'll Learn |
|-----|-------------------|
| [⚖️ Comparisons](./10-comparisons.md) | vs Vanilla JS, vs Effect, feature matrix |
| [🚀 Migration Guides](./14-migration-guides.md) | From Promises, p-queue, Effect, RxJS, Async.js |

## Feature Highlights

### Core Features
- ✅ **Structured Concurrency** - Tasks bound to scopes, auto-cancelled on exit
- ✅ **Resource Management** - Automatic cleanup via `using`/`await using`
- ✅ **Type-Safe DI** - Dependency injection with `provide`/`use`
- ✅ **Bun Compatible** - Full support for Bun runtime

### Reliability
- ✅ **Circuit Breaker** - Prevent cascading failures with shared state
- ✅ **Retry Logic** - Built-in exponential backoff, jitter strategies
- ✅ **Timeout Handling** - Built-in timeout with automatic cleanup
- ✅ **Distributed Locks** - Cross-process locking with automatic TTL expiration
- ✅ **Idempotency** - Automatic task deduplication with caching
- ✅ **Backpressure** - Multiple strategies for channel overflow handling

### Framework Adapters
- ✅ **Fastify** - Request-scoped concurrency with plugin
- ✅ **Express** - Middleware-based scope attachment
- ✅ **NestJS** - Dependency injection integration
- ✅ **Hono** - Lightweight edge runtime support
- ✅ **Elysia** - Bun-first performance optimized
- ✅ **Koa** - Modern async middleware support
- ✅ **Hapi** - Enterprise-grade plugin system
- ✅ **React** - Hooks for scoped tasks and state (`useScope`, `useTask`, `useChannel`)
- ✅ **Vue** - Composables for reactive integration (`useScope`, `useTask`, `useChannel`)
- ✅ **Svelte** - Store-based integration (`createScope`, `createTask`, `createChannel`)

### Concurrency & Streams
- ✅ **Streams** - Lazy async pipelines with 50+ operations
- ✅ **Channels** - Go-style buffered channels with `map`, `filter`, `reduce`
- ✅ **Priority Channels** - Priority-based message delivery
- ✅ **Batch Processing** - Process arrays with progress tracking
- ✅ **Concurrency Limits** - Semaphore-based rate limiting
- ✅ **Token Bucket** - Rate limiting with burst support
- ✅ **Persistence Adapters** - Redis, PostgreSQL, MySQL, SQLite support

### Observability & Persistence
- ✅ **Metrics** - Prometheus/JSON export, counters, gauges, histograms
- ✅ **Debug Tools** - `debugTree()` for visualizing scope hierarchies
- ✅ **OpenTelemetry** - Distributed tracing support
- ✅ **Structured Logging** - Pino/Winston adapters with redaction
- ✅ **Graceful Shutdown** - Signal handling with cleanup coordination
- ✅ **Request Context** - Automatic context propagation
- ✅ **Distributed Locks** - Redis, PostgreSQL, MySQL, SQLite, MongoDB, DynamoDB, Cloudflare Durable Objects adapters
- ✅ **Circuit Breaker State** - Shared state across multiple instances
- ✅ **Framework Adapters** - Fastify, Express, NestJS, Hono, Elysia, Koa, Hapi
- ✅ **Caching** - In-memory and distributed caching with memoization
- ✅ **Dead Letter Queue** - Failed job handling and replay for scheduler

### Testing
- ✅ **Mock Scopes** - `createMockScope` for isolated testing
- ✅ **Fluent Assertions** - `expectTask`, `assertResolves`, `assertRejects`
- ✅ **Time Travel** - `createTimeController` for testing timeouts
- ✅ **Spies** - Built-in spy functions
- ✅ **Bun Compatible** - Full test suite passes under Bun runtime

## Common Tasks

### Run Multiple Operations
```typescript
// Different operations → use parallel()
const result = await s.parallel([
  () => fetchUser(id),
  () => fetchOrders(userId),
])

// With progress tracking and concurrency control
const result = await s.parallel(
  urls.map(url => () => fetch(url)),
  {
    concurrency: 5,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    continueOnError: true
  }
)
```

### Add Retry Logic
```typescript
import { exponentialBackoff } from 'go-go-scope'

await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: exponentialBackoff({ initial: 100, max: 5000 })
  }
})
```

### Test with Mocks
```typescript
import { createMockScope } from '@go-go-scope/testing'

const s = createMockScope({
  services: { db: mockDb },
  overrides: { api: mockApi }
})
```

## Need Help?

- Check the [Recipes](./13-recipes.md) for common patterns
- See [Comparisons](./10-comparisons.md) if migrating from other libraries
- Review [Testing Guide](./08-testing.md) for test patterns
