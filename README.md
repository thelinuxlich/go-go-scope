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
import { scope, race, timeout, parallelResults } from 'go-go-scope'
import { goTry } from 'go-go-try'

// Simple scoped operation
async function fetchUserData(userId: string) {
  await using s = scope({ timeout: 5000 })
  
  using userTask = s.spawn(() => fetchUser(userId))
  using postsTask = s.spawn(() => fetchPosts(userId))
  
  const [user, posts] = await Promise.all([userTask, postsTask])
  return { user, posts }
  // Tasks auto-cancelled if scope exits (timeout, error, or return)
}

// Race multiple operations - signal available for cancellation
const fastest = await race([
  (signal) => fetch('https://replica-a.com', { signal }),
  (signal) => fetch('https://replica-b.com', { signal }),
  (signal) => fetch('https://replica-c.com', { signal }),
])
// Slow replicas are automatically cancelled!

// Timeout wrapper - signal available for fetch cancellation
const result = await timeout(3000, async (signal) => {
  const response = await fetch(url, { signal })
  return response.json()
})

// Parallel with error tolerance - signal available
const [errors, results] = await parallelResults([
  (signal) => fetchUser(1, { signal }),  // might fail
  (signal) => fetchUser(2, { signal }),  // might fail
  (signal) => fetchUser(3, { signal }),  // might fail
])
// errors = [string | undefined, string | undefined, string | undefined]
// results = [User | undefined, User | undefined, User | undefined]
```

## API

### `scope(options?)`

Creates a new scope for structured concurrency.

```typescript
interface ScopeOptions {
  timeout?: number      // Auto-abort after N milliseconds
  signal?: AbortSignal  // Link to parent signal
  tracer?: Tracer       // OpenTelemetry tracer for automatic tracing
  name?: string         // Name for the scope span (default: "scope")
}

await using s = scope({ timeout: 5000 })
```

### `Scope.spawn(fn, options?)`

Spawns a task within the scope. Task is cancelled when scope exits.

```typescript
using task = s.spawn(async (signal) => {
  const response = await fetch(url, { signal })
  return response.json()
})

const result = await task
```

With OpenTelemetry options:
```typescript
using task = s.spawn(
  async (signal) => fetchUser(id, { signal }),
  { 
    name: 'fetch-user',
    attributes: { 'user.id': id }
  }
)
```

### `Scope.task(fn, options?)`

Like `spawn`, but returns a `Result` tuple compatible with go-go-try.

```typescript
using task = s.task(() => riskyOperation())
const [err, value] = await task  // [string | undefined, T | undefined]
```

With OpenTelemetry options:
```typescript
using task = s.task(
  () => riskyOperation(),
  { name: 'background-operation', attributes: { priority: 'high' } }
)
```

### `Scope.acquire(acquire, dispose)`

Manages a resource with automatic cleanup.

```typescript
const conn = await s.acquire(
  () => openDatabase(),    // called immediately
  (c) => c.close()         // called when scope exits
)
```

### `race(factories, options?)`

Race multiple operations - first wins, others cancelled. Each factory receives an `AbortSignal`.

```typescript
const winner = await race([
  (signal) => fetch('https://fast.com', { signal }),
  (signal) => fetch('https://slow.com', { signal }),
])
```

### `timeout(ms, fn, options?)`

Run a function with a timeout. The function receives an `AbortSignal`.

```typescript
const result = await timeout(5000, async (signal) => {
  return fetchData({ signal })
})
```

### `parallel(factories, options?)`

Run factories in parallel with optional concurrency limit. Each factory receives an `AbortSignal`.

```typescript
const results = await parallel(
  urls.map(url => (signal) => fetch(url, { signal })),
  { concurrency: 3 }  // max 3 concurrent
)
```

### `parallelResults(factories, options?)`

Like `parallel`, but returns `Result` tuples that never throw. Each factory receives an `AbortSignal`.

```typescript
const results = await parallelResults([
  (signal) => fetchUser(1, { signal }),  // might fail
  (signal) => fetchUser(2, { signal }),  // might fail
])
// Each result is [string | undefined, T | undefined]
```

## AbortSignal Access

All factory functions receive an `AbortSignal` that allows you to:

1. **Pass to fetch** for automatic cancellation:
   ```typescript
   await race([
     (signal) => fetch('/api/a', { signal }),
     (signal) => fetch('/api/b', { signal }),
   ])
   ```

2. **Listen for abort events** to clean up resources:
   ```typescript
   await parallel([
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
   await timeout(1000, async (signal) => {
     if (signal.aborted) throw new Error('Already cancelled')
     return fetchData({ signal })
   })
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

### Semaphore (Rate limiting)

Limit concurrent access to resources:

```typescript
await using s = scope()
const sem = s.semaphore(5)  // Max 5 concurrent

await parallel(
  urls.map(url => () => 
    sem.acquire(async () => {
      return fetch(url)  // Only 5 concurrent fetches
    })
  )
)
```

### Circuit Breaker

Prevent cascading failures:

```typescript
await using s = scope()
const cb = s.circuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000
})

const result = await cb.execute((signal) => 
  fetchCriticalData({ signal })
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

Auto-refresh data at intervals:

```typescript
await using s = scope()

s.poll(
  (signal) => fetchConfig({ signal }),
  (config) => updateUI(config),
  { interval: 30000 }  // Every 30 seconds
)
// Automatically stops when scope exits
```

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
  return timeout(5000, async (signal) => {
    const response = await fetch('/api/data', { signal })
    return response.json()
  })
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
  return race([
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
  await using s = scope()
  
  const db = await s.acquire(
    () => openDatabase(),
    (db) => db.close()
  )
  
  return parallel(
    items.map(item => () => db.query(item)),
    { concurrency: 5 }  // Built-in concurrency control
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
  await using s = scope()
  
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
  
  return parallel(
    data.items.map(item => async () => {
      const temp = `/tmp/${item.id}.tmp`
      tempFiles.push(temp)
      return processItem(item, temp)
    }),
    { concurrency: 3 }
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
import { scope, parallel } from 'go-go-scope'

async function fetchUsers() {
  await using s = scope({ timeout: 5000 })
  
  return parallel(
    [1, 2, 3, 4].map(id => () => 
      fetch(`/api/users/${id}`).then(r => r.json())
    ),
    { concurrency: 2 }
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
import { race, timeout } from 'go-go-scope'
import { goTryOr } from 'go-go-try'

async function getConfig() {
  const [err, config] = await goTryOr(
    timeout(3000, (signal) => race([
      (s) => fetchConfigFromPrimary(s),
      (s) => fetchConfigFromSecondary(s),
      (s) => fetchConfigFromCache(s)
    ], { signal })),
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

### Example: Rate Limiting with Semaphore

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

**With go-go-scope** - Explicit semaphore control:
```typescript
import { scope, parallel, Semaphore } from 'go-go-scope'

async function fetchAll(urls: string[]) {
  await using s = scope()
  const sem = s.semaphore(5)
  
  return parallel(
    urls.map(url => () => 
      sem.acquire(() => fetch(url))
    )
  )
}
// Semaphore can be shared across different operations!
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

**With go-go-scope** - Built-in:
```typescript
import { scope } from 'go-go-scope'

async function fetchWithCircuitBreaker() {
  await using s = scope()
  const cb = s.circuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000
  })
  
  return cb.execute((signal) => fetchData({ signal }))
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
| `scope` (or custom name) | The scope lifecycle span | `scope.timeout`, `scope.has_parent_signal`, `scope.duration_ms` |
| `scope.task` (or custom name) | Each spawned task | `task.index` (1-based counter), `task.duration_ms` |

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
import { scope, parallelResults } from 'go-go-scope'

async function batchOperation(items: string[]) {
  const tracer = trace.getTracer('batch-processor')
  
  await using s = scope({ 
    tracer, 
    name: 'batch-operation',
    timeout: 30000 
  })
  
  // Each item gets its own traced task span
  const results = await parallelResults(
    items.map(item => () => processItem(item)),
    { concurrency: 5 }
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

### Example Output

```
go-go-scope:scope [scope-1] creating scope (timeout: 0, parent signal: no) +0ms
go-go-scope:scope [scope-1] spawning task #1 "task-1" +1ms
go-go-scope:task [1] creating task +0ms
go-go-scope:scope [scope-1] task #1 added to disposables (total: 1) +0ms
go-go-scope:task [1] completed successfully +5ms
go-go-scope:scope [scope-1] disposing scope (tasks: 1, disposables: 1) +10ms
go-go-scope:scope [scope-1] aborting all tasks +0ms
go-go-scope:scope [scope-1] cleared 1 disposables +1ms
go-go-scope:scope [scope-1] scope disposed (duration: 15ms, errors: 0) +0ms
```

### Debug Events

**Scope events logged:**
- Scope creation (with timeout/parent signal info)
- Task spawning (with task index and name)
- Resource acquisition
- Scope disposal start/end (with duration and error count)
- Individual resource disposal progress
- Parent signal abortion
- Timeout triggers

**Task events logged:**
- Task creation (with auto-incrementing ID)
- Task completion (success/failure)
- Task abortion (parent signal or disposal)
- Task disposal

### Usage Tips

- Use `DEBUG=go-go-scope:*` when debugging cancellation issues
- Check task IDs to trace individual task lifecycles
- Scope names (set via `name` option) appear in logs for easier identification
- Duration values in logs are in milliseconds

## License

MIT
