# Advanced Features

This document covers advanced features of `go-go-scope`.

## Table of Contents

- [Channels](#channels)
- [Broadcast Channels](#broadcast-channels)
- [Concurrency Limits](#concurrency-limits)
- [Circuit Breaker](#circuit-breaker)
- [Retry](#retry)
- [Polling](#polling)
- [Stream Processing](#stream-processing)
- [Debounce & Throttle](#debounce--throttle)
- [Resource Pool](#resource-pool)
- [Metrics](#metrics)
- [Metrics Export](#metrics-export)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Select](#select)
- [Parent-Child Scopes](#parent-child-scopes)
- [Structured Logging](#structured-logging)
- [Deadlock Detection](#deadlock-detection)
- [Task Profiling](#task-profiling)
- [Error Aggregation](#error-aggregation)
- [OpenTelemetry Integration](#opentelemetry-integration)
- [Testing Utilities](#testing-utilities)

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

## Broadcast Channels

Unlike regular channels where each message goes to one consumer, BroadcastChannels send each message to ALL active consumers (pub/sub pattern).

### Basic Usage

```typescript
await using s = scope()
const broadcast = s.broadcast<string>()

// Subscribe multiple consumers
s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 1:', msg)
  }
})

s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 2:', msg)
  }
})

// Publish messages (all consumers receive each message)
await broadcast.send('hello')
await broadcast.send('world')
broadcast.close()
```

### Use Cases

1. **Event broadcasting:**

```typescript
await using s = scope()
const events = s.broadcast<{ type: string; data: unknown }>()

// Multiple listeners
s.task(async () => {
  for await (const event of events.subscribe()) {
    if (event.type === 'user:login') {
      await updateAnalytics(event.data)
    }
  }
})

s.task(async () => {
  for await (const event of events.subscribe()) {
    await logEvent(event)
  }
})

// Emit events
await events.send({ type: 'user:login', data: { userId: 1 } })
```

2. **Cache invalidation:**

```typescript
const cacheUpdates = s.broadcast<string>()

// All cache instances listen for updates
for (const cache of caches) {
  s.task(async () => {
    for await (const key of cacheUpdates.subscribe()) {
      cache.invalidate(key)
    }
  })
}

// Broadcast invalidation
await cacheUpdates.send('user:1')
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

## Debounce & Throttle

Rate-limit function execution with automatic cleanup.

### Debounce

Delays function execution until after `wait` milliseconds have elapsed since the last call.

```typescript
await using s = scope()

const search = s.debounce(async (query: string) => {
  const response = await fetch(`/api/search?q=${query}`)
  return response.json()
}, { wait: 300 })

// Only executes 300ms after typing stops
const [err, results] = await search("hello world")
```

**Options:**
- `wait`: Milliseconds to delay (default: 300)
- `leading`: Execute on the leading edge (default: false)
- `trailing`: Execute on the trailing edge (default: true)

### Throttle

Limits function execution to once per `interval` milliseconds.

```typescript
await using s = scope()

const save = s.throttle(async (data: string) => {
  await saveToServer(data)
}, { interval: 1000 })

// Executes at most once per second
await save("data1")
await save("data2") // Throttled
await save("data3") // Throttled
```

**Options:**
- `interval`: Milliseconds between executions (default: 300)
- `leading`: Execute on the leading edge (default: true)
- `trailing`: Execute on the trailing edge (default: false)

### Use Cases

1. **Search input debouncing:**

```typescript
const search = s.debounce(async (query: string) => {
  const results = await fetchSearchResults(query)
  updateSearchResults(results)
}, { wait: 300 })

// In your input handler
input.oninput = (e) => search(e.target.value)
```

2. **Auto-save throttling:**

```typescript
const autoSave = s.throttle(async (content: string) => {
  await saveDocument(content)
  showSaveIndicator()
}, { interval: 5000, trailing: true })

// On every keystroke
editor.onchange = (e) => autoSave(e.target.value)
```

---

## Resource Pool

Manage a pool of reusable resources with automatic lifecycle management.

### Basic Usage

```typescript
await using s = scope()

const pool = s.pool({
  create: async () => {
    // Create a database connection
    return await createDatabaseConnection()
  },
  destroy: async (conn) => {
    // Clean up the connection
    await conn.close()
  },
  min: 2,           // Minimum pool size
  max: 10,          // Maximum pool size
  acquireTimeout: 5000  // Max time to wait for a resource
})

// Acquire a resource
const conn = await pool.acquire()
try {
  await conn.query('SELECT 1')
} finally {
  await pool.release(conn)
}
```

### Using execute() for Automatic Release

```typescript
// execute() automatically releases the resource
await pool.execute(async (conn) => {
  const result = await conn.query('SELECT 1')
  return result.rows
})
```

### Pool Statistics

```typescript
const stats = pool.stats
console.log(stats.total)      // Total resources
console.log(stats.available)  // Available resources
console.log(stats.inUse)      // Resources currently in use
console.log(stats.waiting)    // Tasks waiting for a resource
```

### Use Cases

1. **Database connection pooling:**

```typescript
await using s = scope()

const dbPool = s.pool({
  create: () => createConnection(),
  destroy: (conn) => conn.end(),
  min: 5,
  max: 20,
  acquireTimeout: 10000
})

// Use connections
const users = await dbPool.execute(async (conn) => {
  const result = await conn.query('SELECT * FROM users')
  return result.rows
})
```

2. **Worker pool:**

```typescript
const workerPool = s.pool({
  create: () => new Worker('./worker.js'),
  destroy: (worker) => worker.terminate(),
  max: 4
})

await workerPool.execute(async (worker) => {
  worker.postMessage({ task: 'heavy-computation' })
  return await waitForMessage(worker)
})
```

---

## Metrics

Collect runtime metrics for performance monitoring.

### Basic Usage

```typescript
await using s = scope({ metrics: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchUser(2))

const metrics = s.metrics()
console.log(metrics)
// {
//   tasksSpawned: 2,
//   tasksCompleted: 2,
//   tasksFailed: 0,
//   totalTaskDuration: 45.2,
//   avgTaskDuration: 22.6,
//   p95TaskDuration: 25.1,
//   resourcesRegistered: 0,
//   resourcesDisposed: 0
// }
```

### Metrics Available

| Metric | Description |
|--------|-------------|
| `tasksSpawned` | Total tasks created |
| `tasksCompleted` | Tasks that succeeded |
| `tasksFailed` | Tasks that threw errors |
| `totalTaskDuration` | Sum of all task execution times (ms) |
| `avgTaskDuration` | Average task execution time (ms) |
| `p95TaskDuration` | 95th percentile task duration (ms) |
| `resourcesRegistered` | Services registered with cleanup |
| `resourcesDisposed` | Resources successfully cleaned up |
| `scopeDuration` | Total scope lifetime (ms, after disposal) |

### Performance Monitoring

```typescript
await using s = scope({ metrics: true, name: 'api-request' })

// Make some API calls
await s.parallel(urls.map(url => () => fetch(url)))

// Log performance data
const metrics = s.metrics()
console.log(`Completed ${metrics.tasksCompleted} tasks`)
console.log(`Average time: ${metrics.avgTaskDuration.toFixed(2)}ms`)
console.log(`P95 time: ${metrics.p95TaskDuration.toFixed(2)}ms`)
```

---

## Metrics Export

Export metrics in various formats for external monitoring systems.

### JSON Format

```typescript
import { exportMetrics } from 'go-go-scope'

await using s = scope({ metrics: true })
// ... run tasks

const metrics = s.metrics()
if (metrics) {
  const json = exportMetrics(metrics, { format: 'json' })
  console.log(json)
}
```

### Prometheus Format

```typescript
const prometheus = exportMetrics(metrics, { 
  format: 'prometheus',
  prefix: 'myapp'
})
// Outputs:
// # HELP myapp_tasks_spawned_total Total number of tasks spawned
// # TYPE myapp_tasks_spawned_total counter
// myapp_tasks_spawned_total 10 1234567890
// ...
```

### OpenTelemetry Format

```typescript
const otel = exportMetrics(metrics, { format: 'otel' })
// Outputs OTLP-compatible JSON
```

### Metrics Reporter

Automatically report metrics at intervals:

```typescript
import { MetricsReporter } from 'go-go-scope'

await using s = scope({ metrics: true })

const reporter = new MetricsReporter(s, {
  format: 'prometheus',
  interval: 60000,  // Report every minute
  onExport: async (data) => {
    await sendToPrometheusPushgateway(data)
  }
})

// Reporter automatically starts
// Stop when needed
reporter.stop()

// Force immediate report
await reporter.report()
```

---

## Lifecycle Hooks

Execute code at key points in the scope lifecycle.

### Basic Usage

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name, index) => {
      console.log(`Starting task ${index}: ${name}`)
    },
    afterTask: (name, duration, error) => {
      if (error) {
        console.log(`Task ${name} failed after ${duration}ms: ${error}`)
      } else {
        console.log(`Task ${name} completed in ${duration}ms`)
      }
    },
    onCancel: (reason) => {
      console.log('Scope cancelled:', reason)
    },
    onDispose: (index, error) => {
      if (error) {
        console.log(`Resource ${index} disposal failed:`, error)
      } else {
        console.log(`Resource ${index} disposed`)
      }
    }
  }
})
```

### Use Cases

1. **Logging:**

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name) => logger.info(`Starting ${name}`),
    afterTask: (name, duration, error) => {
      if (error) {
        logger.error(`${name} failed:`, error)
      } else {
        logger.info(`${name} completed in ${duration}ms`)
      }
    }
  }
})
```

2. **Metrics collection:**

```typescript
const taskDurations: number[] = []

await using s = scope({
  hooks: {
    afterTask: (_name, duration, error) => {
      if (!error) taskDurations.push(duration)
    }
  }
})

// After scope exits...
const avg = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length
console.log(`Average task time: ${avg}ms`)
```

---

## Select

Wait on multiple channel operations, similar to Go's `select` statement.

### Basic Usage

```typescript
await using s = scope()
const ch1 = s.channel<string>()
const ch2 = s.channel<number>()

// Send to channels from other tasks
s.task(async () => {
  await new Promise(r => setTimeout(r, 100))
  await ch1.send("hello")
})

// Wait for first available value
const cases = new Map([
  [ch1, async (value: string) => ({ type: 'string' as const, value })],
  [ch2, async (value: number) => ({ type: 'number' as const, value })],
])

const [err, result] = await s.select(cases)
// result will be { type: 'string', value: 'hello' }
```

### With Timeout

```typescript
await using s = scope()
const dataCh = s.channel<Data>()

// Wait for data with timeout
const cases = new Map([
  [dataCh, async (data) => ({ type: 'data' as const, data })],
])

const [err, result] = await s.select(cases, { timeout: 5000 })
if (err?.message?.includes('timeout')) {
  console.log('Request timed out')
}
```

### Timeout Pattern

```typescript
await using s = scope()
const dataCh = s.channel<Data>()
const timeoutCh = s.channel<never>()

// Set up timeout
s.task(async () => {
  await new Promise(r => setTimeout(r, 5000))
  timeoutCh.close()
})

// Wait for data or timeout
const cases = new Map([
  [dataCh, async (data) => ({ type: 'data' as const, data })],
  [timeoutCh, async () => ({ type: 'timeout' as const })],
])

const [err, result] = await s.select(cases)
if (result?.type === 'timeout') {
  console.log('Request timed out')
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

## Structured Logging

Integrate with structured logging systems.

### Basic Usage

```typescript
import { scope, ConsoleLogger } from 'go-go-scope'

await using s = scope({ 
  logger: new ConsoleLogger('my-scope', 'debug'),
  logLevel: 'debug'
})

// Logs are automatically generated for scope events
await s.task(() => fetchData())
// Output: [my-scope] Spawning task #1 "task-1"
```

### Custom Logger

```typescript
import type { Logger } from 'go-go-scope'

class PinoLogger implements Logger {
  constructor(private pino: typeof import('pino')) {}
  
  debug(msg: string, ...args: unknown[]) {
    this.pino.debug(msg, ...args)
  }
  info(msg: string, ...args: unknown[]) {
    this.pino.info(msg, ...args)
  }
  warn(msg: string, ...args: unknown[]) {
    this.pino.warn(msg, ...args)
  }
  error(msg: string, ...args: unknown[]) {
    this.pino.error(msg, ...args)
  }
}

await using s = scope({
  logger: new PinoLogger(pino)
})
```

### Using Console Logger

```typescript
await using s = scope({ 
  logLevel: 'info'  // Only info and above
})

// Or with specific scope name
await using s = scope({ 
  name: 'api-handler',
  logLevel: 'debug'
})
```

---

## Deadlock Detection

Detect potential deadlocks in your concurrent code.

### Basic Usage

```typescript
await using s = scope({
  deadlockDetection: {
    timeout: 30000,  // Warn if tasks wait >30s
    onDeadlock: (waitingTasks) => {
      console.error('Potential deadlock detected:', waitingTasks)
    }
  }
})

// If any task waits too long, you'll get a warning
await s.task(async () => {
  // Long-running operation
})
```

### How It Works

The deadlock detector monitors tasks waiting on resources (channels, semaphores, pools) and warns if they've been waiting longer than the configured timeout.

**Note:** This detects *potential* deadlocks (tasks stuck waiting), not actual circular waits.

---

## Task Profiling

Profile task execution to understand performance characteristics.

### Basic Usage

```typescript
await using s = scope({ profiler: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchPosts(1))

// Get profile report
const report = s.getProfileReport()
console.log(report.statistics)
// {
//   totalTasks: 2,
//   successfulTasks: 2,
//   failedTasks: 0,
//   avgTotalDuration: 45.2,
//   avgExecutionDuration: 40.1,
//   totalRetryAttempts: 0
// }
```

### Per-Task Profiles

```typescript
const report = s.getProfileReport()

for (const task of report.tasks) {
  console.log(`${task.name}:`)
  console.log(`  Total: ${task.totalDuration.toFixed(2)}ms`)
  console.log(`  Execution: ${task.stages.execution.toFixed(2)}ms`)
  console.log(`  Circuit Breaker: ${task.stages.circuitBreaker?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Concurrency: ${task.stages.concurrency?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Retry: ${task.stages.retry?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Timeout: ${task.stages.timeout?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Retry Attempts: ${task.retryAttempts}`)
}
```

### Identifying Bottlenecks

```typescript
const report = s.getProfileReport()

// Find tasks with high retry counts
const retriedTasks = report.tasks.filter(t => t.retryAttempts > 0)

// Find slowest tasks
const slowestTasks = [...report.tasks]
  .sort((a, b) => b.totalDuration - a.totalDuration)
  .slice(0, 5)
```

---

## Error Aggregation

Collect all errors from parallel execution, not just individual failures.

### Basic Usage

```typescript
await using s = scope()

const result = await s.parallelAggregate([
  () => fetchUser(1),    // succeeds
  () => fetchUser(2),    // succeeds
  () => fetchUser(999),  // fails (not found)
  () => fetchUser(-1),   // fails (invalid id)
])

console.log(result.completed)
// [{ index: 0, value: user1 }, { index: 1, value: user2 }]

console.log(result.errors)
// [{ index: 2, error: NotFoundError }, { index: 3, error: ValidationError }]

console.log(result.allCompleted)  // false
```

### Processing Results

```typescript
const { completed, errors } = await s.parallelAggregate(
  urls.map(url => () => fetch(url))
)

// Process successful results
for (const { index, value } of completed) {
  console.log(`URL ${urls[index]} succeeded:`, value)
}

// Handle errors
for (const { index, error } of errors) {
  console.error(`URL ${urls[index]} failed:`, error)
}

// Check if all succeeded
if (errors.length === 0) {
  console.log('All URLs fetched successfully')
}
```

### Compared to parallel()

| Feature | `parallel()` | `parallelAggregate()` |
|---------|-------------|----------------------|
| Returns | `Result[]` | `{ completed, errors, allCompleted }` |
| Error handling | Per-task | All errors collected |
| Success access | `result[i][1]` | `result.completed.find(c => c.index === i)` |
| Use case | Simple parallelism | When you need all results/errors |

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
See the [integrations guide](./06-integrations.md) for complete OpenTelemetry setup.

---

## Testing Utilities

Helper functions for testing code that uses go-go-scope.

### Installation

```typescript
import { createMockScope } from 'go-go-scope/testing'
```

### createMockScope

Creates a mock scope for testing with tracking capabilities.

```typescript
import { createMockScope } from 'go-go-scope/testing'

test('should track task calls', async () => {
  const s = createMockScope({
    autoAdvanceTimers: true,
    deterministic: true
  })
  
  await s.task(() => Promise.resolve(1))
  await s.task(() => Promise.resolve(2))
  
  expect(s.getTaskCalls().length).toBe(2)
})
```

**Mock Scope Options:**
- `autoAdvanceTimers` - Automatically advance timers
- `deterministic` - Use deterministic random seeds
- `services` - Pre-configured services to inject
- `aborted` - Start in aborted state
- `abortReason` - Initial abort reason

**Mock Scope Methods:**
- `getTaskCalls()` - Get all recorded task calls
- `clearTaskCalls()` - Clear recorded calls
- `abort(reason?)` - Abort the scope

### createControlledTimer

Controlled timer environment for testing async operations.

```typescript
import { createControlledTimer } from 'go-go-scope/testing'

test('should handle timeouts', () => {
  const timer = createControlledTimer()
  const callback = vi.fn()
  
  // Schedule a timeout
  timer.setTimeout(callback, 1000)
  
  // Fast-forward time
  timer.advance(500)
  expect(callback).not.toHaveBeenCalled()
  
  timer.advance(500)
  expect(callback).toHaveBeenCalled()
})
```

**Timer Methods:**
- `setTimeout(callback, delay)` - Schedule callback
- `clearTimeout(id)` - Cancel scheduled callback
- `advance(ms)` - Advance time by milliseconds
- `flush()` - Run all pending timers immediately
- `reset()` - Reset all timers

### createSpy

Creates a spy function for testing.

```typescript
import { createSpy } from 'go-go-scope/testing'

test('should track calls', () => {
  const spy = createSpy<[number, number], number>()
    .mockImplementation((a, b) => a + b)
  
  const result = spy(2, 3)
  
  expect(result).toBe(5)
  expect(spy.wasCalled()).toBe(true)
  expect(spy.wasCalledWith(2, 3)).toBe(true)
  expect(spy.getCalls()).toHaveLength(1)
})
```

**Spy Methods:**
- `mockImplementation(fn)` - Set implementation
- `mockReturnValue(value)` - Set return value
- `mockReset()` - Clear all calls
- `wasCalled()` - Check if called
- `wasCalledWith(...args)` - Check if called with args
- `getCalls()` - Get all call records

### flushPromises

Waits for all promises to settle.

```typescript
import { flushPromises } from 'go-go-scope/testing'

test('async operation', async () => {
  let resolved = false
  Promise.resolve().then(() => { resolved = true })
  
  await flushPromises()
  
  expect(resolved).toBe(true)
})
```

### assertScopeDisposed

Asserts that a scope has been properly disposed.

```typescript
import { assertScopeDisposed } from 'go-go-scope/testing'

test('should dispose properly', async () => {
  const s = scope()
  
  await s.task(() => doSomething())
  
  await assertScopeDisposed(s)
  
  expect(s.isDisposed).toBe(true)
  expect(s.signal.aborted).toBe(true)
})
```

### Complete Example

```typescript
import { describe, test, expect } from 'vitest'
import { createMockScope, flushPromises } from 'go-go-scope/testing'

describe('UserService', () => {
  test('should fetch user with retries', async () => {
    const s = createMockScope()
    
    // Mock API call
    const mockApi = {
      fetchUser: vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ id: 1, name: 'John' })
    }
    
    const [err, user] = await s.task(
      () => mockApi.fetchUser(1),
      { retry: { maxRetries: 3 } }
    )
    
    expect(err).toBeUndefined()
    expect(user).toEqual({ id: 1, name: 'John' })
    expect(mockApi.fetchUser).toHaveBeenCalledTimes(2)
    expect(s.getTaskCalls()[0].options?.retry?.maxRetries).toBe(3)
  })
  
  test('should abort on cancellation', async () => {
    const s = createMockScope()
    
    const task = s.task(async ({ signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('Cancelled'))
        })
      })
    })
    
    // Abort after 100ms
    setTimeout(() => s.abort('user cancelled'), 100)
    
    const [err] = await task
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Cancelled')
  })
})
```

See `examples/testing-utilities.ts` for more examples.
