# go-go-scope

> Structured concurrency for TypeScript using Explicit Resource Management

## Features

- 🎯 **Native Resource Management** - Uses `using`/`await using` syntax (TypeScript 5.2+)
- 🔄 **Structured Concurrency** - Parent scopes automatically cancel child tasks
- ⏱️ **Timeouts Built-in** - First-class timeout support with automatic cancellation
- 🏁 **Race Support** - Structured racing where losers are cancelled
- 📊 **OpenTelemetry** - Optional tracing integration for observability
- 🐛 **Debug Logging** - Built-in debug output for troubleshooting
- 📦 **Zero Dependencies** - Lightweight with no runtime dependencies
- 🔷 **Type-Safe** - Full TypeScript support with proper type inference

## Install

```bash
npm install go-go-scope
```

## Requirements

- TypeScript 5.2+ (for `using`/`await using` support)
- Node.js 18+ or modern browsers with `Symbol.dispose` support

## Basic Usage

```typescript
import { scope } from 'go-go-scope'
import { goTry } from 'go-go-try'

// Simple scoped operation with timeout
async function fetchUserData(userId: string) {
  await using s = scope({ timeout: 5000 })
  
  using userTask = s.spawn(() => fetchUser(userId))
  using postsTask = s.spawn(() => fetchPosts(userId))
  
  const [user, posts] = await Promise.all([userTask, postsTask])
  return { user, posts }
  // Tasks auto-cancelled if scope exits (timeout, error, or return)
}

// Race multiple operations - signal available for cancellation
await using s = scope()
const fastest = await s.race([
  (signal) => fetch('https://replica-a.com', { signal }),
  (signal) => fetch('https://replica-b.com', { signal }),
  (signal) => fetch('https://replica-c.com', { signal }),
])
// Slow replicas are automatically cancelled!

// Task-level timeout
await using s = scope()
const result = await s.spawn(
  async (signal) => {
    const response = await fetch(url, { signal })
    return response.json()
  },
  { timeout: 3000 }
)

// Parallel with error tolerance - returns Result tuples
await using s = scope()
const results = await s.parallelTasks([
  (signal) => fetchUser(1, { signal }),  // might fail
  (signal) => fetchUser(2, { signal }),  // might fail
  (signal) => fetchUser(3, { signal }),  // might fail
])
// Each result is [string | undefined, User | undefined]
for (const [err, user] of results) {
  if (err) console.log('Failed:', err)
  else console.log('User:', user)
}
```

## API

### `scope(options?)`

Creates a new scope for structured concurrency.

```typescript
interface ScopeOptions {
  timeout?: number           // Auto-abort after N milliseconds
  signal?: AbortSignal       // Link to parent signal
  tracer?: Tracer            // OpenTelemetry tracer for automatic tracing
  name?: string              // Name for the scope span (default: "scope")
  concurrency?: number       // Max concurrent tasks (0 = unlimited)
  circuitBreaker?: {         // Circuit breaker configuration
    failureThreshold?: number // Failures before opening (default: 5)
    resetTimeout?: number     // ms before retry (default: 30000)
  }
}

await using s = scope({ timeout: 5000 })
```

### `Scope.spawn(fn, options?)`

Spawns a task within the scope. Task is cancelled when scope exits.

Supports retry and timeout via TaskOptions. Inherits scope's concurrency and circuit breaker settings.

```typescript
using task = s.spawn(async (signal) => {
  const response = await fetch(url, { signal })
  return response.json()
})

const result = await task
```

With retry:
```typescript
using task = s.spawn(
  async (signal) => fetchUser(id, { signal }),
  { 
    retry: {
      maxRetries: 3,
      delay: 1000,
      retryCondition: (err) => err instanceof NetworkError
    }
  }
)
```

With OpenTelemetry:
```typescript
using task = s.spawn(
  async (signal) => fetchUser(id, { signal }),
  { 
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id }
    }
  }
)
```

### `Scope.task(fn, options?)`

Like `spawn`, but returns a `Result` tuple compatible with go-go-try.

Supports the same options as `spawn`.

```typescript
using task = s.task(() => riskyOperation())
const [err, value] = await task  // [string | undefined, T | undefined]
```

With retry:
```typescript
using task = s.task(
  () => riskyOperation(),
  { 
    retry: { maxRetries: 3, delay: 1000 },
    otel: { name: 'background-operation' }
  }
)
```

### TaskOptions

Both `spawn()` and `task()` accept a `TaskOptions` object with the following properties:

```typescript
interface TaskOptions {
  // OpenTelemetry tracing options
  otel?: {
    name?: string           // Task span name (default: "scope.task")
    attributes?: Record<string, unknown>  // Custom span attributes
  }
  
  // Retry configuration
  retry?: {
    maxRetries?: number     // Max retry attempts (default: 3)
    delay?: number | ((attempt: number, error: unknown) => number)  // Delay between retries
    retryCondition?: (error: unknown) => boolean  // Which errors to retry
    onRetry?: (error: unknown, attempt: number) => void  // Callback on retry
  }
  
  // Timeout for this specific task (in milliseconds)
  timeout?: number
  
  // Custom cleanup function - runs when parent scope exits
  onCleanup?: () => void | Promise<void>
}
```

**Custom Cleanup Example:**
```typescript
await using s = scope()

using task = s.spawn(
  async (signal) => {
    const conn = await openConnection()
    return conn.query('SELECT * FROM users')
  },
  {
    onCleanup: () => {
      console.log('Task cleanup ran')
      // Close resources, log metrics, etc.
    }
  }
)

const result = await task
// Task completes here...

// ...but cleanup runs when scope exits (LIFO order with other resources)
```

**Execution Order:**
When multiple options are specified, they execute in this order:
1. Scope Circuit Breaker (if scope has `circuitBreaker` option)
2. Scope Concurrency (if scope has `concurrency` option)
3. Retry (retry on failure)
4. Timeout (enforce time limit)
5. Result Wrapping (`task()` only)

### `Scope.acquire(acquire, dispose)`

Manages a resource with automatic cleanup.

```typescript
const conn = await s.acquire(
  () => openDatabase(),    // called immediately
  (c) => c.close()         // called when scope exits
)
```

### `Scope.race(factories)`

Race multiple operations - first wins, others cancelled. Uses the scope's signal for cancellation.

```typescript
await using s = scope()
const winner = await s.race([
  (signal) => fetch('https://fast.com', { signal }),
  (signal) => fetch('https://slow.com', { signal }),
])
```

### `Scope.raceTasks(factories)`

Like `race`, but returns a `Result` tuple that never throws.

```typescript
await using s = scope()
const [err, winner] = await s.raceTasks([
  (signal) => fetch('https://api1.com', { signal }),
  (signal) => fetch('https://api2.com', { signal }),
])
if (err) {
  console.log('All racers failed:', err)
} else {
  console.log('Winner:', winner)
}
```

### `Scope.parallel(factories, options?)`

Run factories in parallel. Uses the scope's concurrency limit and signal.

```typescript
await using s = scope({ concurrency: 3 })
const results = await s.parallel(
  urls.map(url => (signal) => fetch(url, { signal }))
)
```

**Options:**
- `failFast` (default: `true`) - If `true`, stops on first error (like `Promise.all`). If `false`, continues and returns all successful results, with `undefined` for failed tasks.

```typescript
// failFast: true (default) - throws on first error
try {
  const results = await s.parallel([
    () => Promise.resolve('a'),
    () => Promise.reject(new Error('fail')),
    () => Promise.resolve('c'),  // never runs
  ])
} catch (e) {
  // e is 'fail'
}

// failFast: false - continues on error
const results = await s.parallel([
  () => Promise.resolve('a'),
  () => Promise.reject(new Error('fail')),
  () => Promise.resolve('c'),
], { failFast: false })
// results is ['a', undefined, 'c']
```

### `Scope.parallelTasks(factories, options?)`

Like `parallel`, but returns `Result` tuples. By default, never throws.

```typescript
await using s = scope()
const results = await s.parallelTasks([
  (signal) => fetchUser(1, { signal }),  // might fail
  (signal) => fetchUser(2, { signal }),  // might fail
])
// Each result is [string | undefined, T | undefined]
for (const [err, user] of results) {
  if (err) console.log('Failed:', err)
  else console.log('User:', user)
}
```

**Options:**
- `failFast` (default: `false`) - If `true`, throws on first error. If `false` (default), returns Results for all tasks.

```typescript
// failFast: false (default) - returns Results
const results = await s.parallelTasks([
  () => Promise.resolve('a'),
  () => Promise.reject(new Error('fail')),
])
// results is [[undefined, 'a'], ['fail', undefined]]

// failFast: true - throws on first error
try {
  await s.parallelTasks([
    () => Promise.resolve('a'),
    () => Promise.reject(new Error('fail')),
  ], { failFast: true })
} catch (e) {
  // e is 'fail'
}
```

## AbortSignal Access

All factory functions receive an `AbortSignal` that allows you to:

1. **Pass to fetch** for automatic cancellation:
   ```typescript
   await using s = scope()
   await s.race([
     (signal) => fetch('/api/a', { signal }),
     (signal) => fetch('/api/b', { signal }),
   ])
   ```

2. **Listen for abort events** to clean up resources:
   ```typescript
   await using s = scope()
   await s.parallel([
     (signal) => new Promise((resolve, reject) => {
       const ws = new WebSocket('wss://example.com')
       ws.onopen = () => resolve(ws)
       
       signal.addEventListener('abort', () => {
         ws.close()
         reject(new Error('cancelled'))
       })
     })
   ])
   ```

3. **Check if already aborted**:
   ```typescript
   await using s = scope()
   using task = s.spawn(async (signal) => {
     if (signal.aborted) throw new Error('Already cancelled')
     return fetchData({ signal })
   }, { timeout: 1000 })
   const result = await task
   ```

## Scope Independence and Parent-Child Relationships

Scopes are **independent by default**. Creating one scope after another doesn't automatically link them:

```typescript
await using parent = scope({ timeout: 5000 })
await using child = scope()  // Independent! Not linked to parent

// If parent times out, child continues running
```

To create a parent-child relationship where child cancellation propagates from parent, **explicitly pass the parent's signal**:

```typescript
await using parent = scope({ timeout: 5000 })

// Child inherits parent's cancellation
await using child = scope({ signal: parent.signal })

// Now if parent times out or is cancelled, child is also cancelled
```

This explicit linking gives you control over scope hierarchies. Common patterns:

```typescript
// Pattern 1: Nested operations with shared cancellation
await using outer = scope({ timeout: 10000 })

const user = await outer.spawn(() => fetchUser(id))

// Inner scope inherits cancellation but can have its own settings
await using inner = scope({ 
  signal: outer.signal,
  concurrency: 3  // Inner scope has its own concurrency limit
})

// These parallel tasks are limited to 3 concurrent
await inner.parallel(urls.map(url => () => fetch(url)))

// Pattern 2: Fire-and-forget with cleanup
await using main = scope()

// Create a detached child that won't cancel if main scope exits
await using background = scope({ 
  timeout: 60000  // But it has its own timeout
})

// Start background work
background.spawn(() => processLargeDataset())
```

## Advanced Features

### Channels (Go-style concurrent communication)

Channels provide typed, buffered communication between tasks with backpressure:

```typescript
await using s = scope()
const ch = s.channel<string>(100)

// Multiple producers
for (const server of servers) {
  s.spawn(async () => {
    for await (const log of server.logs()) {
      await ch.send(log)  // Blocks if buffer full (backpressure!)
    }
  })
}

// Single consumer with batching
const batch: string[] = []
for await (const log of ch) {  // Async iterator
  batch.push(log)
  if (batch.length >= 100) {
    await sendToAnalytics(batch)
    batch.length = 0
  }
}
```

### Scope-level Concurrency

Limit concurrent execution for all tasks in a scope:

```typescript
// All tasks spawned in this scope are limited to 5 concurrent
await using s = scope({ concurrency: 5 })

await s.parallel(
  urls.map(url => () => 
    fetch(url)  // Only 5 concurrent fetches
  )
)
```

The `concurrency` option automatically applies to all tasks spawned within the scope, making it easy to control resource usage across an entire operation.

### Circuit Breaker

Prevent cascading failures by applying a circuit breaker to all tasks in a scope:

```typescript
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000
  }
})

const result = await s.spawn(() => 
  fetchCriticalData()
)
// Automatically stops calling after 5 failures
// Retries after 30 seconds
```

### Stream Processing

Process async iterables with automatic cancellation:

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
  // Automatically stops when scope is cancelled
}
```

### Polling

Auto-refresh data at intervals with a controllable poll:

```typescript
await using s = scope()

const controller = s.poll(
  (signal) => fetchConfig({ signal }),
  (config) => updateUI(config),
  { interval: 30000 }  // Every 30 seconds
)

// Check status
const status = controller.status()
console.log(status.running)        // true
console.log(status.pollCount)      // 5
console.log(status.timeUntilNext)  // 15000 (ms)

// Stop polling
controller.stop()

// Restart polling
controller.start()

// Automatically stops when scope exits
```

**PollController methods:**
- `start()` - Start or resume polling
- `stop()` - Stop polling
- `status()` - Get current status:
  - `running: boolean` - Whether polling is active
  - `pollCount: number` - Number of polls executed
  - `timeUntilNext: number` - Milliseconds until next poll (0 if stopped)
  - `lastPollTime?: number` - Timestamp of last poll
  - `nextPollTime?: number` - Timestamp of next scheduled poll

### Retry

Add automatic retry logic to any task via `TaskOptions`:

```typescript
await using s = scope()

// With spawn() - throws on final failure
using task = s.spawn(() => fetchData(), { retry: { maxRetries: 3 } })
const result = await task

// With task() - returns Result tuple
using task = s.task(() => fetchData(), { retry: { maxRetries: 3 } })
const [err, result] = await task

// Custom retry with exponential backoff
using task = s.spawn(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      retryCondition: (error) => error instanceof NetworkError,
      onRetry: (error, attempt) => console.log(`Retry ${attempt}: ${error}`)
    }
  }
)
```

**Retry Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `delay` | `number \| (attempt, error) => number` | `0` | Delay between retries (ms) |
| `retryCondition` | `(error) => boolean` | `() => true` | Which errors to retry |
| `onRetry` | `(error, attempt) => void` | - | Callback on each retry |

**Features:**
- Respects AbortSignal during delays (cancellable)
- Works with OpenTelemetry tracing
- Compatible with scope timeouts

## Resource Management

The library leverages the Explicit Resource Management proposal:

```typescript
// Synchronous disposal
using task = s.spawn(() => work())
// task[Symbol.dispose]() called at end of block

// Asynchronous disposal
await using s = scope()
// s[Symbol.asyncDispose]() called at end of block
```

Resources are disposed in **LIFO order** (reverse of creation):

```typescript
await using s = scope()

const r1 = await s.acquire(() => openA(), (a) => a.close())  // opened first
const r2 = await s.acquire(() => openB(), (b) => b.close())  // opened second

// On exit: B closes first, then A
```

## Cancellation

All tasks receive an `AbortSignal` that is aborted when:
- The parent scope is disposed
- The scope's timeout is reached
- A parent signal is aborted

```typescript
using task = s.spawn(async (signal) => {
  // Check if already aborted
  if (signal.aborted) throw new Error('Already cancelled')
  
  // Or pass to fetch/any AbortSignal-aware API
  const response = await fetch(url, { signal })
  
  // Or listen for abort events
  signal.addEventListener('abort', () => {
    // cleanup
  })
})
```

## Without vs With go-go-scope

### Example 1: Fetching Data with Timeout

**Without go-go-scope** - Manual cleanup, easy to leak:
```typescript
async function fetchWithTimeout() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  try {
    const response = await fetch('/api/data', { 
      signal: controller.signal 
    })
    clearTimeout(timeoutId) // Don't forget this!
    return await response.json()
  } catch (err) {
    clearTimeout(timeoutId) // And here!
    throw err
  }
}
```

**With go-go-scope** - Automatic cleanup, impossible to leak:
```typescript
async function fetchWithTimeout() {
  await using s = scope({ timeout: 5000 })
  const response = await fetch('/api/data', { signal: s.signal })
  return response.json()
}
```

### Example 2: Racing Multiple Requests

**Without go-go-scope** - Losing requests continue running, wasting resources:
```typescript
async function fetchFastestMirror() {
  const controllers = [
    new AbortController(),
    new AbortController(),
    new AbortController()
  ]
  
  try {
    const winner = await Promise.race([
      fetch('https://a.com', { signal: controllers[0].signal }),
      fetch('https://b.com', { signal: controllers[1].signal }),
      fetch('https://c.com', { signal: controllers[2].signal })
    ])
    
    // Must manually cancel the losers
    controllers.forEach(c => c.abort())
    return winner
  } catch (err) {
    controllers.forEach(c => c.abort()) // Don't forget!
    throw err
  }
}
```

**With go-go-scope** - Automatic cancellation of losers:
```typescript
async function fetchFastestMirror() {
  await using s = scope()
  return s.race([
    (signal) => fetch('https://a.com', { signal }),
    (signal) => fetch('https://b.com', { signal }),
    (signal) => fetch('https://c.com', { signal })
  ])
  // Slow requests are automatically cancelled!
}
```

### Example 3: Parallel with Resource Cleanup

**Without go-go-scope** - Complex error handling, resource leaks possible:
```typescript
async function processBatch(items: string[]) {
  const db = await openDatabase()
  const results: string[] = []
  let hasError = false
  
  try {
    // Fire all at once - no concurrency control
    const promises = items.map(async (item) => {
      if (hasError) return // Too late, already started
      try {
        const result = await db.query(item)
        results.push(result)
      } catch (err) {
        hasError = true
        throw err
      }
    })
    
    await Promise.all(promises)
    return results
  } finally {
    // Always must remember to close!
    await db.close().catch(console.error)
  }
}
```

**With go-go-scope** - Structured concurrency, automatic cleanup:
```typescript
async function processBatch(items: string[]) {
  await using s = scope({ concurrency: 5 })
  
  const db = await s.acquire(
    () => openDatabase(),
    (db) => db.close()
  )
  
  return s.parallel(
    items.map(item => () => db.query(item))
    // Uses scope's concurrency limit
  )
}
// Database closes automatically, even on error!
```

### Example 4: Nested Operations with Cancellation

**Without go-go-scope** - Cancellation doesn't propagate, messy cleanup:
```typescript
async function fetchUserData(userId: string) {
  const controller = new AbortController()
  let postsController: AbortController | null = null
  let commentsController: AbortController | null = null
  
  try {
    const user = await fetchUser(userId, { signal: controller.signal })
    
    // Nested operations - need separate controllers
    postsController = new AbortController()
    commentsController = new AbortController()
    
    const [posts, comments] = await Promise.all([
      fetchPosts(userId, { signal: postsController.signal }),
      fetchComments(userId, { signal: commentsController.signal })
    ])
    
    return { user, posts, comments }
  } finally {
    // Must clean up all controllers manually
    controller.abort()
    postsController?.abort()
    commentsController?.abort()
  }
}
```

**With go-go-scope** - Cancellation propagates automatically:
```typescript
async function fetchUserData(userId: string) {
  await using s = scope({ timeout: 5000 })
  
  const user = await s.spawn(() => fetchUser(userId))
  
  // Child tasks inherit parent's signal
  using postsTask = s.spawn(() => fetchPosts(userId))
  using commentsTask = s.spawn(() => fetchComments(userId))
  
  const [posts, comments] = await Promise.all([postsTask, commentsTask])
  
  return { user, posts, comments }
}
// All tasks cancelled together on timeout or error!
```

### Example 5: Error Handling with Cleanup

**Without go-go-scope** - Cleanup code scattered everywhere:
```typescript
async function processFile(filepath: string) {
  const file = await openFile(filepath)
  const tempFiles: string[] = []
  
  try {
    const data = await file.read()
    
    for (const item of data.items) {
      const temp = `/tmp/${item.id}.tmp`
      tempFiles.push(temp)
      
      try {
        await processItem(item, temp)
      } catch (err) {
        // Must clean up temp files on each error
        for (const t of tempFiles) {
          await unlink(t).catch(() => {})
        }
        throw err
      }
    }
    
    return tempFiles
  } finally {
    await file.close()
    // What if we forgot temp file cleanup here?
  }
}
```

**With go-go-scope** - Cleanup declared upfront, always runs:
```typescript
async function processFile(filepath: string) {
  await using s = scope({ concurrency: 3 })
  
  const file = await s.acquire(
    () => openFile(filepath),
    (f) => f.close()
  )
  
  const tempFiles: string[] = []
  
  // Register cleanup for temp files
  s.acquire(
    () => Promise.resolve(),
    () => Promise.all(tempFiles.map(t => unlink(t).catch(() => {})))
  )
  
  const data = await file.read()
  
  return s.parallel(
    data.items.map(item => async () => {
      const temp = `/tmp/${item.id}.tmp`
      tempFiles.push(temp)
      return processItem(item, temp)
    })
    // Uses scope's concurrency limit
  )
}
// All cleanup runs automatically in LIFO order!
```

## Key Differences

| Aspect | Without go-go-scope | With go-go-scope |
|--------|---------------------|------------------|
| **Cleanup** | Manual, error-prone | Automatic, guaranteed |
| **Cancellation** | Must wire up manually | Propagates automatically |
| **Concurrency** | Manual Promise.all | Built-in with limits |
| **Race cleanup** | Must cancel losers | Automatic |
| **Timeouts** | Manual setTimeout | Built-in, clean |
| **Resource leaks** | Easy to forget | Impossible with `using` |
| **Code size** | Verbose | Concise |

## go-go-scope vs Effect

[Effect](https://effect.website/) is a powerful functional programming library for TypeScript that includes structured concurrency. Here's how they compare:

### Example: Parallel HTTP Requests

**With Effect** - Full power but more complex:
```typescript
import { Effect, Schedule, pipe } from 'effect'

const fetchUser = (id: number) => Effect.tryPromise({
  try: () => fetch(`/api/users/${id}`).then(r => r.json()),
  catch: (e) => new Error(String(e))
})

// Parallel with concurrency limit
const program = Effect.forEach(
  [1, 2, 3, 4],
  (id) => fetchUser(id),
  { concurrency: 2 }
)

// Add timeout
const withTimeout = Effect.timeout(program, '5 seconds')

// Add retry
const withRetry = Effect.retry(
  withTimeout,
  Schedule.exponential('100 millis').pipe(Schedule.union(Schedule.recurs(3)))
)

// Run it
const result = await Effect.runPromise(withRetry)
```

**With go-go-scope** - Simple and direct:
```typescript
import { scope } from 'go-go-scope'

async function fetchUsers() {
  await using s = scope({ timeout: 5000, concurrency: 2 })
  
  return s.parallel(
    [1, 2, 3, 4].map(id => () => 
      fetch(`/api/users/${id}`).then(r => r.json())
    )
  )
}
```

### Example: Resource Management

**With Effect** - Tag-based dependency injection:
```typescript
import { Context, Effect, Layer } from 'effect'
import { Database } from './Database' // Custom service definition

// Define a tag for the service
const DatabaseTag = Context.Tag<Database>('Database')

// Create a scoped effect
const program = Effect.gen(function* (_) {
  const db = yield* _(DatabaseTag)
  
  const user = yield* _(db.query('SELECT * FROM users WHERE id = ?', [1]))
  const posts = yield* _(db.query('SELECT * FROM posts WHERE user_id = ?', [1]))
  
  return { user, posts }
}).pipe(
  Effect.scoped,  // Automatically manages resource lifetime
  Effect.provide(Layer.succeed(DatabaseTag, databaseInstance))
)

await Effect.runPromise(program)
```

**With go-go-scope** - Direct and native:
```typescript
import { scope } from 'go-go-scope'

async function getUserData() {
  await using s = scope()
  
  const db = await s.acquire(
    () => openDatabase(),
    (db) => db.close()
  )
  
  using userTask = s.spawn(() => db.query('SELECT * FROM users WHERE id = ?', [1]))
  using postsTask = s.spawn(() => db.query('SELECT * FROM posts WHERE user_id = ?', [1]))
  
  const [user, posts] = await Promise.all([userTask, postsTask])
  return { user, posts }
}
```

### Example: Racing with Fallback

**With Effect** - Composable but verbose:
```typescript
import { Effect, pipe } from 'effect'

const getConfig = pipe(
  Effect.raceAll([
    fetchConfigFromPrimary(),
    fetchConfigFromSecondary(),
    fetchConfigFromCache()
  ]),
  Effect.timeout('3 seconds'),
  Effect.catchAll(() => Effect.succeed({ default: true }))
)

await Effect.runPromise(getConfig)
```

**With go-go-scope** - Familiar async/await:
```typescript
import { scope } from 'go-go-scope'
import { goTryOr } from 'go-go-try'

async function getConfig() {
  await using s = scope({ timeout: 3000 })
  
  const [err, config] = await goTryOr(
    s.race([
      () => fetchConfigFromPrimary(s.signal),
      () => fetchConfigFromSecondary(s.signal),
      () => fetchConfigFromCache(s.signal)
    ]),
    { default: true }
  )
  
  return config
}
```

### Example: Channels (Producer/Consumer Pattern)

**With Effect** - Using Queue and fibers:
```typescript
import { Effect, Queue, Fiber } from 'effect'

const program = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<string>())
  
  // Producer fiber
  const producer = yield* _(Effect.fork(
    Effect.gen(function* (_) {
      for (const item of items) {
        yield* _(queue.offer(item))
      }
      yield* _(queue.shutdown)
    })
  ))
  
  // Consumer
  const results: string[] = []
  yield* _(Effect.gen(function* (_) {
    while (true) {
      const item = yield* _(queue.take)
      results.push(item)
    }
  }).pipe(
    Effect.catchAll(() => Effect.succeed(undefined))
  ))
  
  yield* _(Fiber.join(producer))
  return results
})

await Effect.runPromise(program)
```

**With go-go-scope** - Native async iteration:
```typescript
import { scope } from 'go-go-scope'

async function processItems(items: string[]) {
  await using s = scope()
  const ch = s.channel<string>(100)
  
  // Producer
  s.spawn(async () => {
    for (const item of items) {
      await ch.send(item)
    }
    ch.close()
  })
  
  // Consumer with native async iteration
  const results: string[] = []
  for await (const item of ch) {
    results.push(item)
  }
  
  return results
}
```

### Example: Rate Limiting

**With Effect** - Using concurrency options:
```typescript
import { Effect } from 'effect'

const fetchAll = Effect.forEach(
  urls,
  (url) => Effect.tryPromise(() => fetch(url)),
  { concurrency: 5 }  // Built into forEach
)

await Effect.runPromise(fetchAll)
```

**With go-go-scope** - Scope-level concurrency:
```typescript
import { scope } from 'go-go-scope'

async function fetchAll(urls: string[]) {
  // All tasks in this scope are limited to 5 concurrent
  await using s = scope({ concurrency: 5 })
  
  return s.parallel(
    urls.map(url => () => fetch(url))
  )
}
// Concurrency applies automatically to all tasks!
```

### Example: Circuit Breaker Pattern

**With Effect** - Requires separate package @effect/cluster:
```typescript
import { CircuitBreaker } from '@effect/cluster'
import { Effect } from 'effect'

const cb = CircuitBreaker.make({
  maxFailures: 5,
  resetRequestTimeout: 30000
})

const program = Effect.gen(function* (_) {
  const breaker = yield* _(cb)
  
  return yield* _(breaker(
    Effect.tryPromise(() => fetchData())
  ))
})

await Effect.runPromise(program)
```

**With go-go-scope** - Scope-level circuit breaker:
```typescript
import { scope } from 'go-go-scope'

async function fetchWithCircuitBreaker() {
  await using s = scope({
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000
    }
  })
  
  // All tasks in this scope automatically use the circuit breaker
  return s.spawn(() => fetchData())
}
```

### Example: Polling with Cleanup

**With Effect** - Using Schedule and fibers:
```typescript
import { Effect, Schedule, Fiber } from 'effect'

const poll = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(
    Effect.repeat(
      Effect.gen(function* (_) {
        const config = yield* _(fetchConfig())
        yield* _(updateUI(config))
      }),
      Schedule.fixed('30 seconds')
    )
  ))
  
  // Must manually interrupt fiber to stop
  return fiber
})

const fiber = await Effect.runPromise(poll)
// Later: await Fiber.interrupt(fiber)
```

**With go-go-scope** - Automatic cleanup via scope:
```typescript
import { scope } from 'go-go-scope'

async function startPolling() {
  await using s = scope()
  
  // Poll every 30 seconds
  s.poll(
    (signal) => fetchConfig({ signal }),
    (config) => updateUI(config),
    { interval: 30000 }
  )
  
  // Polling automatically stops when scope exits
  await new Promise(() => {}) // Keep alive
}
```

### Example: Stream Processing

**With Effect** - Full Stream API:
```typescript
import { Stream, Effect, Sink } from 'effect'

const program = Stream.fromReadableStream(() => readableStream)
  .pipe(
    Stream.map(chunk => processChunk(chunk)),
    Stream.tap(chunk => saveChunk(chunk)),
    Stream.run(Sink.collectAll())
  )

await Effect.runPromise(program)
```

**With go-go-scope** - Simple async iteration:
```typescript
import { scope, stream } from 'go-go-scope'

async function processStream(readableStream: ReadableStream) {
  await using s = scope()
  
  for await (const chunk of s.stream(readableStream)) {
    await processChunk(chunk)
    await saveChunk(chunk)
  }
  // Automatically cancelled if scope disposed
}
```

### Unique go-go-scope Features

Some features are simpler or unique to go-go-scope:

**Channels with Native Async Iteration** - Go-style channels that work seamlessly with JavaScript's `for await...of`:
```typescript
// go-go-scope - Native async iteration
await using s = scope()
const ch = s.channel<string>(100)

for await (const msg of ch) {
  console.log(msg)  // Works with native loops!
}

// Effect - Requires Stream.toPull or more complex setup
```

**Polling with Immediate Cancellation** - Simple polling that stops instantly:
```typescript
// go-go-scope - Simple polling with immediate stop
await using s = scope()
s.poll(
  (signal) => fetchStatus({ signal }),
  (status) => updateUI(status),
  { interval: 5000 }
)
// Stops immediately when s is disposed

// Effect - Requires managing fiber interruption
```

**Semantic Simplicity** - Using native language features:
- `using` and `await using` instead of `Effect.scoped`
- `for await...of` instead of `Stream.run`
- `async/await` instead of `Effect.gen(function* )`

### When to Choose What

| Aspect | Effect | go-go-scope |
|--------|--------|-------------|
| **Paradigm** | Functional, monadic | Imperative, async/await |
| **Learning curve** | Steep (generators, tags, layers) | Minimal (familiar patterns) |
| **Bundle size** | ~50KB+ | ~3KB (with all features) |
| **Error handling** | Built-in error channel | go-go-try Result tuples |
| **Observability** | Built-in tracing, metrics | Bring your own |
| **Retry/Schedule** | Excellent built-in support | Manual implementation |
| **Dependency injection** | Sophisticated (Layers) | Simple (acquire) |
| **Channels** | Via Queue/Hub | Native with async iteration |
| **Polling** | Via Schedule | Built-in |
| **Circuit breaker** | Via @effect/cluster | Built-in |
| **Type inference** | Can be complex | Straightforward |
| **Ecosystem** | Rich (streams, schema, cli, etc.) | Focused on concurrency |
| **Use case** | Large, complex applications | Any app needing structured concurrency |

### Summary

- **Choose Effect** when you need its full ecosystem (streams, schema validation, testing, metrics), want functional programming patterns, or are building a large application that benefits from dependency injection and tracing.

- **Choose go-go-scope** when you want structured concurrency with minimal learning curve, prefer native async/await over generators, need a small bundle size, or are adding structured concurrency to an existing codebase without major refactoring.

Both libraries enforce the same core principles: **parent-bounded lifetimes** and **guaranteed cleanup**.

## Integration with go-go-try

Works seamlessly with go-go-try's Result types:

```typescript
import { goTry, isSuccess } from 'go-go-try'
import { scope } from 'go-go-scope'

async function resilientOperation() {
  await using s = scope()
  
  using task1 = s.task(() => fetchUser(1))
  using task2 = s.task(() => fetchUser(2))
  
  const [r1, r2] = await Promise.all([task1, task2])
  
  // r1 and r2 are Result<string, User>
  if (isSuccess(r1)) {
    console.log('User 1:', r1[1])
  }
}
```

## OpenTelemetry Integration

go-go-scope provides **optional** OpenTelemetry tracing integration. When you provide a tracer, the library automatically creates spans for scope lifecycle events and task execution.

### Basic Tracing

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

async function fetchWithTracing(userId: string) {
  const tracer = trace.getTracer('my-app')
  
  // Creates a "fetch-user-data" span
  await using s = scope({ tracer, name: 'fetch-user-data' })
  
  // Each spawn creates a "scope.task" child span
  using userTask = s.spawn(() => fetchUser(userId))
  using postsTask = s.spawn(() => fetchPosts(userId))
  
  const [user, posts] = await Promise.all([userTask, userTask])
  
  // Span automatically ends when scope exits
  return { user, posts }
}
```

### Traced Spans

| Span Name | Description | Attributes |
|-----------|-------------|------------|
| `scope` (or custom name) | The scope lifecycle span | `scope.timeout`, `scope.has_parent_signal`, `scope.duration_ms`, `scope.errors` |
| `scope.task` (or custom name) | Each spawned task | `task.index`, `task.duration_ms`, `task.error_reason`, `task.retry_attempts`, `task.has_retry`, `task.has_timeout`, `task.has_circuit_breaker`, `task.scope_concurrency` |

### Task Error Reasons

When a task fails, the `task.error_reason` attribute indicates the cause:

| Error Reason | Description |
|--------------|-------------|
| `timeout` | Task exceeded its time limit |
| `aborted` | Parent scope was disposed or signal was aborted |
| `circuit_breaker_open` | Circuit breaker was open, request rejected |
| `exception` | Task threw an exception |

### Task Configuration Attributes

**Retry Configuration:**
- `task.has_retry` - Whether retry is enabled
- `task.retry.max_retries` - Configured max retry attempts
- `task.retry.has_delay` - Whether retry has delay configured
- `task.retry.has_condition` - Whether retry has custom condition
- `task.retry.succeeded_after` - Attempt number on success (only set if retries occurred)
- `task.retry.max_retries_exceeded` - Set when all retries are exhausted
- `task.retry.condition_rejected` - Set when error didn't pass retry condition
- `task.retry.attempts_made` - Number of attempts made

**Circuit Breaker:**
- `task.has_circuit_breaker` - Whether circuit breaker is enabled
- `task.circuit_breaker.state` - Current state (closed, open, half-open)
- `task.circuit_breaker.failure_count` - Current failure count
- `task.circuit_breaker.rejected` - Set when request was rejected due to open circuit

**Scope Concurrency:**
- `task.scope_concurrency` - The concurrency limit of the parent scope (0 = unlimited)
- `task.concurrency.available_before` - Available permits before acquiring (when concurrency is enabled)
- `task.concurrency.waiting_before` - Number of waiters before acquiring (when concurrency is enabled)

**Timeout:**
- `task.has_timeout` - Whether task timeout is enabled
- `task.timeout_ms` - Timeout duration in milliseconds

### Duration Tracking

The library automatically calculates and records the duration of scopes and tasks in milliseconds:

```typescript
await using s = scope({ tracer, name: 'api-request' })

using t = s.spawn(async () => {
  const result = await fetchData()
  return result
}, { name: 'fetch-data' })

await t
// Task span includes: task.duration_ms = ~50 (ms)

// Scope span includes: scope.duration_ms = ~52 (ms)
```

This is useful for:
- **Performance monitoring** - Identify slow operations
- **SLA tracking** - Alert when requests exceed thresholds
- **Debugging** - Understand where time is spent in concurrent operations

### Custom Task Span Names and Attributes

You can customize individual task spans with the optional second parameter:

```typescript
await using s = scope({ tracer })

// Custom task name
using t1 = s.spawn(() => fetchUser(userId), { 
  name: 'fetch-user' 
})

// Custom attributes for better observability
using t2 = s.spawn(() => fetchPosts(userId), {
  name: 'fetch-posts',
  attributes: {
    'http.method': 'GET',
    'http.url': `/api/users/${userId}/posts`,
    'user.id': userId,
  }
})

// Works with task() too
using t3 = s.task(() => riskyOperation(), {
  name: 'background-job',
  attributes: { 'job.type': 'cleanup' }
})
```

### Status Recording

- **OK**: Set when scope/task completes successfully
- **ERROR**: Set when:
  - Timeout is reached
  - Parent signal is aborted
  - Task throws an exception
  - Resource disposal fails

### Integration Example with Error Tracking

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

async function batchOperation(items: string[]) {
  const tracer = trace.getTracer('batch-processor')
  
  await using s = scope({ 
    tracer, 
    name: 'batch-operation',
    timeout: 30000,
    concurrency: 5
  })
  
  // Each item gets its own traced task span
  const results = await s.parallelTasks(
    items.map(item => () => processItem(item))
  )
  
  // Failed tasks will have ERROR status with exception recorded
  const failures = results.filter(r => r[0] !== undefined)
  if (failures.length > 0) {
    console.warn(`${failures.length} items failed`)
  }
  
  return results
}
```

### Requirements

- Install `@opentelemetry/api` in your project (optional peer dependency)
- The library uses a minimal interface that is compatible with the official OTel API

```bash
npm install @opentelemetry/api
```

## Debug Logging

go-go-scope includes built-in debug logging using the [`debug`](https://github.com/debug-js/debug) module. This is useful for troubleshooting scope lifecycle events, task execution, and cancellation propagation during development.

### Enabling Debug Output

Set the `DEBUG` environment variable to enable logging:

```bash
# Enable all go-go-scope debug logs
DEBUG=go-go-scope:* node your-app.js

# Enable only scope logs
DEBUG=go-go-scope:scope node your-app.js

# Enable only task logs
DEBUG=go-go-scope:task node your-app.js

# Enable both
DEBUG=go-go-scope:scope,go-go-scope:task node your-app.js
```

### Debug Namespaces

| Namespace | Description |
|-----------|-------------|
| `go-go-scope:scope` | Scope lifecycle events (creation, spawning tasks, disposal) |
| `go-go-scope:task` | Task lifecycle events (creation, completion, abortion, disposal) |
| `go-go-scope:parallel` | Parallel execution events |
| `go-go-scope:race` | Race execution events |
| `go-go-scope:poll` | Polling events |

### Example Output

```
go-go-scope:scope [scope-1] creating scope (timeout: 0, parent signal: no) +0ms
go-go-scope:scope [scope-1] spawning task #1 "task-1" +1ms
go-go-scope:task [task-1] starting retry loop (maxRetries: 3) +0ms
go-go-scope:task [task-1] attempt 1/4 +0ms
go-go-scope:task [task-1] attempt 1 failed: Network error, waiting 1000ms +5ms
go-go-scope:task [task-1] attempt 2/4 +1005ms
go-go-scope:task [task-1] succeeded on attempt 2 +50ms
go-go-scope:scope [scope-1] disposing scope (tasks: 1, disposables: 1) +1100ms
go-go-scope:scope [scope-1] scope disposed (duration: 1105ms, errors: 0) +0ms
```

### Debug Events by Namespace

**Scope Namespace (`go-go-scope:scope`):**
- Scope creation (with timeout/parent signal info)
- Task spawning (with task index and name)
- Resource acquisition
- Scope disposal start/end (with duration and error count)
- Individual resource disposal progress
- Parent signal abortion
- Timeout triggers

**Task Namespace (`go-go-scope:task`):**
- Task creation and disposal
- Task completion (success/failure)
- Task abortion (parent signal or disposal)
- **Retry events:**
  - Starting retry loop with configuration
  - Attempt start/success/failure
  - Retry delay waiting
  - Max retries exceeded
  - Condition rejection
- **Timeout events:**
  - Timeout reached
- **Concurrency events:**
  - Acquiring concurrency permit (available/waiting counts)
  - Acquisition success/failure
- **Circuit Breaker events:**
  - Current state check
  - Execution through circuit breaker
  - Circuit open rejection
- **Error details:**
  - Error reason (timeout, aborted, circuit_breaker_open, exception)
  - Error type and message

**Parallel Namespace (`go-go-scope:parallel`):**
- Parallel execution start (with task count and concurrency)
- Task completion progress (completed/total)
- Worker start/finish with tasks processed
- Concurrency limit mode vs unlimited

**Race Namespace (`go-go-scope:race`):**
- Race start with competitor count
- Winner announcement
- Loser settlements
- Abort during race

**Poll Namespace (`go-go-scope:poll`):**
- Polling start (with interval and immediate flag)
- Poll execution count and duration
- Poll success/failure
- Polling stop with total executions

### Usage Tips

- Use `DEBUG=go-go-scope:*` when debugging cancellation issues
- Check task IDs to trace individual task lifecycles
- Scope names (set via `name` option) appear in logs for easier identification
- Duration values in logs are in milliseconds

## License

MIT
