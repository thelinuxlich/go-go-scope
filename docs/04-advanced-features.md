# Advanced Features

This document covers advanced features of `go-go-scope`.

## Table of Contents

- [Channels](#channels)
- [Concurrency Limits](#concurrency-limits)
- [Circuit Breaker](#circuit-breaker)
- [Retry](#retry)
- [Polling](#polling)
- [Stream Processing](#stream-processing)
- [Parent-Child Scopes](#parent-child-scopes)
- [OpenTelemetry Integration](#opentelemetry-integration)

---

## Channels

Channels provide Go-style concurrent communication between tasks with backpressure.

### Basic Usage

```typescript
await using s = scope()
const ch = s.channel<string>(100)  // Buffer capacity of 100

// Producer
s.task(async () => {
  for (const log of logs) {
    await ch.send(log)  // Blocks if buffer full
  }
  ch.close()
})

// Consumer with native async iteration
for await (const log of ch) {
  await processLog(log)
}
```

### Multiple Producers, Single Consumer

```typescript
await using s = scope()
const ch = s.channel<number>(10)

// Multiple producers
for (const server of servers) {
  s.task(async () => {
    for await (const metric of server.metrics()) {
      await ch.send(metric)
    }
  })
}

// Single consumer with batching
const batch: number[] = []
for await (const metric of ch) {
  batch.push(metric)
  if (batch.length >= 100) {
    await sendToAnalytics(batch)
    batch.length = 0
  }
}
```

### Channel Properties

```typescript
const ch = s.channel<string>(10)

console.log(ch.cap)       // 10 (capacity)
console.log(ch.size)      // 0 (current size)
console.log(ch.isClosed)  // false

ch.close()
console.log(ch.isClosed)  // true
```

---

## Concurrency Limits

Limit the number of concurrent tasks within a scope.

### Basic Usage

```typescript
// All tasks in this scope are limited to 5 concurrent
await using s = scope({ concurrency: 5 })

await s.parallel(
  urls.map(url => () => fetch(url))
)
```

### Use Cases

1. **Rate limiting API calls:**

```typescript
await using s = scope({ concurrency: 10 })

const results = await s.parallel(
  apiEndpoints.map(endpoint => () => callApi(endpoint))
)
```

2. **Controlling database connections:**

```typescript
await using s = scope({ concurrency: 3 })
  .provide('db', () => createConnectionPool(3))

// Only 3 queries at a time
const results = await s.parallel(
  queries.map(q => ({ services }) => services.db.query(q))
)
```

3. **Preventing resource exhaustion:**

```typescript
await using s = scope({ concurrency: 5 })

for (const file of files) {
  // Even though we create many tasks, only 5 run concurrently
  s.task(() => processFile(file))
}
```

---

## Circuit Breaker

Prevent cascading failures by stopping calls to failing services.

### How It Works

1. **Closed state**: Requests pass through normally
2. **Open state**: After `failureThreshold` failures, requests fail fast
3. **Half-open state**: After `resetTimeout`, one request is allowed to test recovery

### Basic Usage

```typescript
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,    // Open after 5 failures
    resetTimeout: 30000     // Try again after 30 seconds
  }
})

// All tasks automatically use the circuit breaker
const [err, result] = await s.task(() => fetchCriticalData())
```

### With Fallback

```typescript
await using s = scope({
  circuitBreaker: { failureThreshold: 3, resetTimeout: 10000 }
})

const primary = s.task(() => fetchFromPrimary())
const fallback = s.task(() => fetchFromFallback())

// Try primary first
const [err, result] = await primary
if (err) {
  // Circuit might be open, try fallback
  const [fallbackErr, fallbackResult] = await fallback
  if (fallbackErr) throw fallbackErr
  return fallbackResult
}
return result
```

---

## Retry

Add automatic retry logic to any task.

### Basic Retry

```typescript
await using s = scope()

const [err, user] = await s.task(
  () => fetchUser(id),
  { retry: { maxRetries: 3 } }
)
```

### With Delay

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: 1000  // 1 second between retries
    }
  }
)
```

### Exponential Backoff

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
      // Attempt 1: 2000ms
      // Attempt 2: 4000ms
      // Attempt 3: 8000ms
      // ... up to 30000ms
    }
  }
)
```

### Conditional Retry

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 3,
      retryCondition: (error) => {
        // Only retry network errors
        return error instanceof NetworkError
      },
      onRetry: (error, attempt) => {
        console.log(`Retry ${attempt} after error: ${error.message}`)
      }
    }
  }
)
```

### Retry with Timeout

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    timeout: 5000,  // Each attempt has 5 seconds
    retry: {
      maxRetries: 3,
      delay: 1000
    }
  }
)
```

---

## Polling

Auto-refresh data at intervals with controllable polling.

### Basic Polling

```typescript
await using s = scope()

s.poll(
  ({ signal }) => fetchConfig({ signal }),
  (config) => updateUI(config),
  { interval: 30000 }  // Every 30 seconds
)

// Keep alive somehow, polling stops when scope exits
await new Promise(() => {})
```

### With Control

```typescript
await using s = scope()

const controller = s.poll(
  ({ signal }) => fetchStatus({ signal }),
  (status) => console.log(status),
  { interval: 5000, immediate: true }
)

// Check status
const status = controller.status()
console.log(status.running)        // true
console.log(status.pollCount)      // Number of polls
console.log(status.timeUntilNext)  // ms until next poll

// Stop when needed
controller.stop()

// Restart later
controller.start()
```

### Use Cases

1. **Health checks:**

```typescript
s.poll(
  ({ signal }) => checkHealth({ signal }),
  (healthy) => {
    if (!healthy) alert('Service down!')
  },
  { interval: 10000 }
)
```

2. **Syncing data:**

```typescript
s.poll(
  ({ signal }) => fetchUpdates({ signal }),
  (updates) => mergeIntoLocalState(updates),
  { interval: 60000 }
)
```

---

## Stream Processing

Process async iterables with automatic cancellation.

### Basic Streaming

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
  // Automatically stops when scope is cancelled
}
```

### With Timeout

```typescript
await using s = scope({ timeout: 30000 })

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
}
// Stream stops after 30 seconds
```

### Early Break

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  if (foundWhatWeNeed(chunk)) {
    break  // Iterator is properly cleaned up
  }
}
```

---

## Parent-Child Scopes

Scopes can inherit from parents for cancellation propagation and service sharing.

### Basic Parent-Child

```typescript
await using parent = scope()

// Child inherits parent's signal
await using child = scope({ parent })

// If parent is cancelled, child is too
```

### Service Inheritance

```typescript
await using parent = scope()
  .provide('db', () => openDatabase(), (db) => db.close())

// Child can use parent's services
await using child = scope({ parent })

const [err, result] = await child.task(({ services }) => {
  return services.db.query('SELECT 1')
})
```

### Adding Services in Child

```typescript
await using parent = scope()
  .provide('db', () => openDatabase())

// Child inherits 'db' and adds 'cache'
await using child = scope({ parent })
  .provide('cache', () => createCache())

// Child can access both
child.use('db')     // ✓ From parent
child.use('cache')  // ✓ From child

// Parent can only access 'db'
parent.use('db')    // ✓ Works
parent.use('cache') // ✗ undefined
```

### Selective Inheritance

Use `signal` option if you only want cancellation, not services:

```typescript
await using parent = scope()
  .provide('db', () => openDatabase())

// Child only inherits signal, not services
await using child = scope({ signal: parent.signal })

// Must provide own db
child.provide('db', () => openAnotherDatabase())
```

### Common Patterns

1. **Nested operations with limits:**

```typescript
await using outer = scope()
  .provide('db', () => openDatabase())

// Fetch users
const [err, user] = await outer.task(() => fetchUser(id))

// Process with limited concurrency
await using inner = scope({ parent: outer, concurrency: 3 })

await inner.parallel(
  urls.map(url => ({ services }) => 
    services.db.query(url)
  )
)
```

2. **Fire-and-forget background tasks:**

```typescript
await using main = scope()

// Detached child with own timeout
await using background = scope({ timeout: 60000 })

// Start background work
background.task(() => processLargeDataset())
// Don't await - it runs independently
```

---

## OpenTelemetry Integration

Optional tracing for observability.

### Basic Tracing

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

const tracer = trace.getTracer('my-app')

await using s = scope({ tracer, name: 'fetch-user-data' })

// Creates spans automatically
const userTask = s.task(() => fetchUser(1))
const postsTask = s.task(() => fetchPosts(1))
```

### Custom Span Names

```typescript
const [err, user] = await s.task(
  () => fetchUser(id),
  {
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id }
    }
  }
)
```

### Spans Created

| Span Name | Description | Attributes |
|-----------|-------------|------------|
| `scope` (or custom) | Scope lifecycle | `scope.timeout`, `scope.duration_ms`, `scope.errors` |
| `scope.task` (or custom) | Each task | `task.duration_ms`, `task.error_reason`, `task.retry_attempts` |

### Viewing Traces

Traces appear in your OpenTelemetry backend (Jaeger, Zipkin, etc.):

```
[fetch-user-data] scope
├── [fetch-user] task - 150ms
└── [fetch-posts] task - 80ms ✓
```

See the [integrations guide](./06-integrations.md) for complete OpenTelemetry setup.
