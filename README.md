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

Requires TypeScript 5.2+ and `ESNext.Disposable` lib.

## Documentation

| Guide | Description |
|-------|-------------|
| [📖 Quick Start](./docs/01-quick-start.md) | Get started in 5 minutes |
| [🧠 Core Concepts](./docs/02-concepts.md) | Learn structured concurrency |
| [📚 API Reference](./docs/03-api-reference.md) | Complete API docs |
| [🚀 Advanced Features](./docs/04-advanced-features.md) | Channels, circuit breakers, pools, profiling |
| [⚖️ Comparisons](./docs/05-comparisons.md) | vs Vanilla JS, vs Effect |
| [🔌 Integrations](./docs/06-integrations.md) | OpenTelemetry, logging, metrics |

## Features

- ✅ **Structured Concurrency** - Tasks are bound to scopes, auto-cancelled on exit
- ✅ **Resource Management** - Automatic cleanup via `using`/`await using`
- ✅ **Cancellation** - Propagate cancellation through parent-child scope chains
- ✅ **Timeout Handling** - Built-in timeout with automatic cleanup
- ✅ **Channels** - Go-style buffered channels for task communication
- ✅ **Broadcast** - Pub/sub pattern for multi-consumer scenarios
- ✅ **Circuit Breaker** - Prevent cascading failures
- ✅ **Retry Logic** - Configurable retries with exponential backoff
- ✅ **Concurrency Limits** - Semaphore-based rate limiting
- ✅ **Resource Pools** - Managed connection/worker pools
- ✅ **Debouncing & Throttling** - Rate-limit function execution
- ✅ **Polling** - Auto-refresh with start/stop control
- ✅ **Stream Processing** - Async iterable wrapper with cancellation
- ✅ **Metrics** - Performance monitoring with Prometheus/JSON export
- ✅ **Task Profiling** - Detailed execution time breakdown
- ✅ **Deadlock Detection** - Warn on potential deadlocks
- ✅ **Structured Logging** - Integration with logging systems
- ✅ **OpenTelemetry** - Distributed tracing support
- ✅ **Test Utilities** - Mock scopes, spies, and timers

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
