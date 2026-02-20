# go-go-scope

> Structured concurrency for TypeScript using Explicit Resource Management

[![npm version](https://badge.fury.io/js/go-go-scope.svg)](https://www.npmjs.com/package/go-go-scope)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

`go-go-scope` helps you write async code that:
- ✅ Automatically cleans up resources
- ✅ Cancels operations when they're no longer needed
- ✅ Handles timeouts gracefully
- ✅ Prevents memory leaks

All using familiar `async/await` syntax.

## Quick Example

```typescript
import { scope } from 'go-go-scope'

async function fetchData() {
  await using s = scope({ timeout: 5000 })
  
  const [err, data] = await s.task(async ({ signal }) => {
    const response = await fetch('/api/data', { signal })
    return response.json()
  })
  
  if (err) {
    console.log('Failed:', err.message)
    return null
  }
  
  return data
  // Auto-cancelled if timeout reached
}
```

## Installation

```bash
npm install go-go-scope
```

### Requirements

- **Node.js**: 18.0.0 or higher
- **Bun**: 1.2.0 or higher (fully supported)
- **TypeScript**: 5.2 or higher
- **Module**: ESM only (`"type": "module"`)
- **Lib**: `ESNext.Disposable` for `using`/`await using` syntax

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "ESNext.Disposable"]
  }
}
```

## Documentation

| Guide | Description |
|-------|-------------|
| [📖 Quick Start](./docs/01-quick-start.md) | Get started in 5 minutes |
| [🧠 Core Concepts](./docs/02-concepts.md) | Learn structured concurrency |
| [📚 API Reference](./docs/03-api-reference.md) | Complete API docs |
| [🔄 Concurrency](./docs/04-concurrency-patterns.md) | Channels, broadcast, select |
| [🛡️ Resilience](./docs/05-resilience-patterns.md) | Circuit breakers, retry, timeouts |
| [📊 Observability](./docs/06-observability.md) | Metrics, logging, profiling, tracing |
| [⏱️ Rate Limiting](./docs/07-rate-limiting.md) | Debounce, throttle, concurrency |
| [🧪 Testing](./docs/08-testing.md) | Mock scopes, spies, and timers |
| [🔧 Advanced](./docs/09-advanced-patterns.md) | Resource pools, parent-child scopes |
| [⚖️ Comparisons](./docs/10-comparisons.md) | vs Vanilla JS, vs Effect |
| [🔌 Integrations](./docs/11-integrations.md) | OpenTelemetry, Prometheus, Grafana, Framework Adapters |
| [🚦 Cancellation](./docs/12-cancellation.md) | Cancellation utilities and helpers |
| [🍳 Recipes](./docs/13-recipes.md) | Common patterns and solutions |
| [🚀 Migration Guides](./docs/14-migration-guides.md) | From Promises, p-queue, Effect, RxJS |

## Features

- ✅ **Structured Concurrency** - Tasks are bound to scopes, auto-cancelled on exit
- ✅ **Resource Management** - Automatic cleanup via `using`/`await using`
- ✅ **Cancellation** - Propagate cancellation through parent-child scope chains
- ✅ **Cancellation Utilities** - `throwIfAborted`, `onAbort`, `raceSignals`, helpers
- ✅ **Timeout Handling** - Built-in timeout with automatic cleanup
- ✅ **Channels** - Go-style buffered channels with `map`, `filter`, `reduce`
- ✅ **Broadcast** - Pub/sub pattern for multi-consumer scenarios
- ✅ **Circuit Breaker** - Prevent cascading failures with hooks
- ✅ **Retry Logic** - Built-in strategies: exponential backoff, jitter, linear
- ✅ **Concurrency Limits** - Semaphore-based rate limiting
- ✅ **Resource Pools** - Managed connection/worker pools
- ✅ **Debouncing & Throttling** - Rate-limit function execution
- ✅ **Polling** - Auto-refresh with start/stop control
- ✅ **Stream Processing** - Async iterable wrapper with cancellation
- ✅ **Distributed Locks** - Cross-process locking with Redis/PostgreSQL/MySQL/SQLite
- ✅ **Rate Limiting** - Distributed rate limiting with sliding window
- ✅ **Circuit Breaker State** - Shared circuit breaker state across instances
- ✅ **Metrics** - Performance monitoring with Prometheus/JSON export
- ✅ **Metrics Aggregation** - Cross-scope metrics collection
- ✅ **Task Profiling** - Detailed execution time breakdown
- ✅ **Deadlock Detection** - Warn on potential deadlocks
- ✅ **Structured Logging** - Integration with logging systems
- ✅ **Debug Visualization** - `debugTree()` for scope hierarchies
- ✅ **OpenTelemetry** - Distributed tracing support
- ✅ **Test Utilities** - Mock scopes, spies, timers, time travel
- ✅ **Type-Safe DI** - Dependency injection with `provide`/`use`
- ✅ **Framework Adapters** - Fastify, Express, NestJS, Hono, Elysia
- ✅ **Bun Compatible** - Full support for Bun runtime

## Typed Error Handling

Combine with [`go-go-try`](https://github.com/thelinuxlich/go-go-try) for automatic union inference of typed errors:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')

// TypeScript infers: Result<DatabaseError | NetworkError, User>
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

See [Resilience Patterns](./docs/05-resilience-patterns.md#typed-error-handling) for more details.

## Why go-go-scope?

**Before:**
```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 5000)
try {
  const response = await fetch('/api', { signal: controller.signal })
  clearTimeout(timeoutId)  // Don't forget!
  return response.json()
} catch (err) {
  clearTimeout(timeoutId)  // And here!
  throw err
}
```

**After:**
```typescript
await using s = scope({ timeout: 5000 })
const response = await fetch('/api', { signal: s.signal })
return response.json()
```

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
