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
| [🔄 Concurrency](./04-concurrency-patterns.md) | Channels, broadcast, select statements |
| [🛡️ Resilience](./05-resilience-patterns.md) | Circuit breakers, retry, timeouts |
| [🔧 Advanced](./09-advanced-patterns.md) | Resource pools, parent-child scopes, DI |
| [⏱️ Rate Limiting](./07-rate-limiting.md) | Debounce, throttle, concurrency control |

### Observability & Testing
| Doc | What You'll Learn |
|-----|-------------------|
| [📊 Observability](./06-observability.md) | Metrics, logging, profiling, tracing |
| [🧪 Testing](./08-testing.md) | Mock scopes, spies, time travel testing |
| [🔌 Integrations](./11-integrations.md) | OpenTelemetry, Prometheus, Grafana |

### Comparisons
| Doc | What You'll Learn |
|-----|-------------------|
| [⚖️ Comparisons](./10-comparisons.md) | vs Vanilla JS, vs Effect, feature matrix |

## Feature Highlights

### Core Features
- ✅ **Structured Concurrency** - Tasks bound to scopes, auto-cancelled on exit
- ✅ **Resource Management** - Automatic cleanup via `using`/`await using`
- ✅ **Type-Safe DI** - Dependency injection with `provide`/`use`

### Reliability
- ✅ **Circuit Breaker** - Prevent cascading failures
- ✅ **Retry Logic** - Built-in exponential backoff, jitter strategies
- ✅ **Timeout Handling** - Built-in timeout with automatic cleanup

### Concurrency
- ✅ **Channels** - Go-style buffered channels with `map`, `filter`, `reduce`
- ✅ **Batch Processing** - Process arrays with progress tracking
- ✅ **Concurrency Limits** - Semaphore-based rate limiting

### Observability
- ✅ **Metrics** - Prometheus/JSON export, cross-scope aggregation
- ✅ **Debug Tools** - `debugTree()` for visualizing scope hierarchies
- ✅ **OpenTelemetry** - Distributed tracing support

### Testing
- ✅ **Mock Scopes** - `createMockScope` for isolated testing
- ✅ **Time Travel** - `createTimeController` for testing timeouts
- ✅ **Spies** - Built-in spy functions

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
    maxRetries: 5,
    delay: exponentialBackoff({ initial: 100, max: 5000 })
  }
})
```

### Test with Mocks
```typescript
import { createMockScope } from 'go-go-scope/testing'

const s = createMockScope({
  services: { db: mockDb },
  overrides: { api: mockApi }
})
```

## Need Help?

- Check the [Recipes](./13-recipes.md) for common patterns
- See [Comparisons](./10-comparisons.md) if migrating from other libraries
- Review [Testing Guide](./08-testing.md) for test patterns
