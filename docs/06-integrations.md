# Integrations

How to integrate `go-go-scope` with other libraries.

## Table of Contents

- [go-go-try](#go-go-try)
- [OpenTelemetry](#opentelemetry)

---

## go-go-try

[go-go-try](https://github.com/thelinuxlich/go-go-try) provides Golang-style error handling that works seamlessly with `go-go-scope`.

### Installation

```bash
npm install go-go-try
```

### Basic Usage

Both `go-go-scope` and `go-go-try` use the same Result tuple format `[error, value]`, so they work together naturally:

```typescript
import { scope } from 'go-go-scope'
import { goTry, goTryRaw } from 'go-go-try'

async function example() {
  await using s = scope()
  
  // go-go-scope task returns [error, value]
  const [taskErr, user] = await s.task(() => fetchUser(1))
  
  // go-go-try wraps functions to return [error, value]
  const [parseErr, data] = goTry(() => JSON.parse(jsonString))
  
  // Both use the same pattern!
  if (taskErr) console.log('Task failed:', taskErr)
  if (parseErr) console.log('Parse failed:', parseErr)
}
```

### goTry vs goTryRaw

- **`goTry`** - Returns error as `string` (error message)
- **`goTryRaw`** - Returns error as `Error` object

```typescript
import { goTry, goTryRaw } from 'go-go-try'

// goTry - error is string | undefined
const [err, value] = goTry(() => JSON.parse('{invalid}'))
console.log(err) // "Unexpected token i in JSON at position 1"

// goTryRaw - error is Error | undefined
const [err, value] = goTryRaw(() => JSON.parse('{invalid}'))
console.log(err?.message) // "Unexpected token i in JSON at position 1"
console.log(err?.stack)   // Full stack trace
```

### With Async Functions

```typescript
import { goTry } from 'go-go-try'

async function fetchData() {
  // Works with async functions too
  const [err, response] = await goTry(fetch('/api/data'))
  
  if (err) {
    console.log('Fetch failed:', err)
    return null
  }
  
  const [parseErr, data] = await goTry(response.json())
  if (parseErr) {
    console.log('Parse failed:', parseErr)
    return null
  }
  
  return data
}
```

### Combining with go-go-scope

Use `goTry` for non-scope operations, `s.task()` for scope-managed operations:

```typescript
import { scope } from 'go-go-scope'
import { goTry } from 'go-go-try'

async function processUserData(userId: string) {
  await using s = scope({ timeout: 10000 })
  
  // Parse local data with goTry
  const [cacheErr, cached] = goTry(() => 
    JSON.parse(localStorage.getItem(`user:${userId}`) || '')
  )
  
  if (!cacheErr && cached) {
    return cached
  }
  
  // Fetch from API with scope (has cancellation, tracing, etc.)
  const [fetchErr, user] = await s.task(async ({ signal }) => {
    const response = await fetch(`/api/users/${userId}`, { signal })
    return response.json()
  })
  
  if (fetchErr) {
    console.log('Failed to fetch user:', fetchErr)
    return null
  }
  
  // Store in cache with goTry
  goTry(() => {
    localStorage.setItem(`user:${userId}`, JSON.stringify(user))
  })
  
  return user
}
```

### Fallback Patterns

```typescript
import { goTry } from 'go-go-try'

// Default value on error
const [_, todos = []] = goTry(() => JSON.parse(localStorage.getItem('todos')))

// With scope task
const [err, user] = await s.task(() => fetchUser(1))
const safeUser = user ?? { id: 0, name: 'Anonymous' }
```

---

## OpenTelemetry

`go-go-scope` provides optional OpenTelemetry tracing integration.

### Installation

```bash
npm install @opentelemetry/api
```

### Basic Setup

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

const tracer = trace.getTracer('my-app')

async function fetchWithTracing(userId: string) {
  await using s = scope({ tracer, name: 'fetch-user-data' })
  
  const userTask = s.task(() => fetchUser(userId))
  const postsTask = s.task(() => fetchPosts(userId))
  
  const [userResult, postsResult] = await Promise.all([userTask, postsTask])
  const [userErr, user] = userResult
  const [postsErr, posts] = postsResult
  
  if (userErr) throw userErr
  if (postsErr) throw postsErr
  
  return { user, posts }
}
```

### Custom Span Names

```typescript
const [err, user] = await s.task(
  () => fetchUser(id),
  {
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id, 'source': 'database' }
    }
  }
)
```

### Complete Example

See [examples/jaeger-tracing.ts](../examples/jaeger-tracing.ts) for a complete working example with Jaeger tracing.

### Spans Created

| Span Name | Type | Attributes |
|-----------|------|------------|
| `scope` (or custom) | Scope lifecycle | `scope.timeout`, `scope.has_parent_signal`, `scope.has_parent_scope`, `scope.concurrency`, `scope.duration_ms` |
| `scope.task` (or custom) | Task execution | `task.index`, `task.has_retry`, `task.has_timeout`, `task.has_circuit_breaker`, `task.scope_concurrency`, `task.duration_ms`, `task.error_reason`, `task.retry_attempts` |

### Viewing Traces

In Jaeger UI, you'll see:

```
[process-order] scope
├── [validate-order] task - 45ms ✓
├── [process-payment] task - 120ms ✓
│   └── Attributes: task.retry_attempts: 1
└── [send-notification] task - 30ms ✓
```

### Docker Compose for Jaeger

```yaml
version: '3'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

Run with: `docker compose up -d`

View traces at: http://localhost:16686

### Parent-Child Trace Context

Scopes automatically propagate trace context to child scopes:

```typescript
await using parent = scope({ 
  tracer, 
  name: 'parent-operation' 
})

// Child span will be a child of parent span
await using child = scope({ 
  parent,
  name: 'child-operation' 
})

// This creates a proper parent-child relationship in traces
```

### Adding Custom Attributes

```typescript
await using s = scope({ 
  tracer,
  name: 'api-request' 
})

const [err, user] = await s.task(
  async ({ signal }) => {
    const response = await fetch('/api/user', { signal })
    return response.json()
  },
  {
    otel: {
      name: 'fetch-user-api',
      attributes: {
        'http.method': 'GET',
        'http.route': '/api/user',
        'user.agent': 'my-app/1.0'
      }
    }
  }
)
```
