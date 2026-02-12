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

// Fetch data with automatic timeout and cleanup
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
  // Tasks are auto-cancelled if timeout is reached
}
```

**Key concepts:**
- `scope()` creates a container for async operations
- `s.task()` creates cancellable work units
- `{ signal }` is an `AbortSignal` for cancellation
- `[err, data]` is a Result tuple (never throws!)
- `await using` automatically cleans up

## Installation

```bash
npm install go-go-scope
```

**Requirements:**
- TypeScript 5.2+ (for `using` syntax)
- Node.js 18+ or modern browsers

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "lib": ["ES2022", "ESNext.Disposable"]
  }
}
```

## Documentation

**New to go-go-scope?** Start here:
1. [📖 Quick Start](./docs/01-quick-start.md) - Get started in 5 minutes
2. [🧠 Core Concepts](./docs/02-concepts.md) - Learn structured concurrency, Scope, and Task

**Reference:**
- [📚 API Reference](./docs/03-api-reference.md) - Complete API documentation
- [🚀 Advanced Features](./docs/04-advanced-features.md) - Channels, circuit breakers, retries, polling
- [⚖️ Comparisons](./docs/05-comparisons.md) - vs Vanilla JS, vs Effect
- [🔌 Integrations](./docs/06-integrations.md) - OpenTelemetry, go-go-try

## Features

- 🎯 **Native Resource Management** - Uses `using`/`await using` syntax
- 🔄 **Structured Concurrency** - Parent scopes auto-cancel children
- ⏱️ **Timeouts Built-in** - First-class timeout support
- 🏁 **Race Support** - Structured racing with loser cancellation
- 📊 **OpenTelemetry** - Optional tracing integration
- 🐛 **Debug Logging** - Built-in debug output
- 📦 **Minimal Dependencies** - Only `debug` utility
- 🔷 **Type-Safe** - Full TypeScript support

## Common Patterns

### Parallel Operations

```typescript
await using s = scope()

const [[userErr, user], [postsErr, posts]] = await Promise.all([
  s.task(() => fetchUser(1)),
  s.task(() => fetchPosts(1))
])
```

### Race Operations

```typescript
await using s = scope()

const [err, fastest] = await s.race([
  () => fetch('https://fast.com'),
  () => fetch('https://slow.com'),
])
```

### Retry on Failure

```typescript
await using s = scope()

const [err, result] = await s.task(
  () => fetchData(),
  { retry: { maxRetries: 3, delay: 1000 } }
)
```

### Dependency Injection

```typescript
await using s = scope()
  .provide('db', () => openDatabase(), (db) => db.close())

const [err, result] = await s.task(({ services }) => {
  return services.db.query('SELECT 1')
})
```

## Why go-go-scope?

### Before (Vanilla JS)

```typescript
// Manual cleanup, easy to forget!
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 5000)

try {
  const response = await fetch('/api/data', { signal: controller.signal })
  clearTimeout(timeoutId)  // Don't forget!
  return response.json()
} catch (err) {
  clearTimeout(timeoutId)  // And here!
  throw err
}
```

### After (go-go-scope)

```typescript
// Automatic cleanup, impossible to leak
await using s = scope({ timeout: 5000 })
const response = await fetch('/api/data', { signal: s.signal })
return response.json()
```

## Comparison

| Aspect | Vanilla JS | go-go-scope | Effect |
|--------|------------|-------------|--------|
| Learning curve | None | Low | Steep |
| Bundle size | 0 KB | ~3 KB | ~50KB+ |
| Timeout cleanup | Manual | ✅ Automatic | ✅ Automatic |
| Race cancellation | Manual | ✅ Automatic | ✅ Automatic |
| Error handling | try/catch | Result tuples | Error channel |
| Paradigm | Callbacks | async/await | Functional |

- **Choose go-go-scope** for structured concurrency with minimal learning curve
- **Choose Effect** for full functional programming ecosystem

See [full comparison](./docs/05-comparisons.md) for details.

## Performance

```
Vanilla JS (simple promise)             0.70ms (0.0007ms/op)
Effect (simple)                        10.00ms (0.0100ms/op)
go-go-scope (simple task)              12.72ms (0.0127ms/op)
go-go-scope (with retry)                8.22ms (0.0082ms/op)
go-go-scope (with timeout)             16.99ms (0.0170ms/op)
```

See [benchmark details](./benchmark/README.md).

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
