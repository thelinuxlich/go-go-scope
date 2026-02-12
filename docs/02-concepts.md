# Core Concepts

This document explains the fundamental concepts behind `go-go-scope`.

## Table of Contents

1. [What is Structured Concurrency?](#what-is-structured-concurrency)
2. [A Real-World Example](#a-real-world-example)
3. [The Scope](#the-scope)
4. [The Task](#the-task)
5. [Result Tuples](#result-tuples)
6. [Cancellation](#cancellation)

---

## What is Structured Concurrency?

Structured concurrency is a programming paradigm that ensures:

1. **No task is left behind** - When a scope ends, all tasks inside it are cancelled
2. **No fire-and-forget** - Every async operation has a parent that waits for it
3. **Cleanup is guaranteed** - Resources are always cleaned up, even on error

Think of it like function calls:

```typescript
// Regular function - structured!
function parent() {
  const result = child()  // Parent waits for child
  console.log(result)     // This always runs after child
}

// Unstructured async (the problem)
async function parent() {
  child()  // Fire and forget! Parent doesn't wait
  console.log('Done')  // This might run before child finishes
}

// Structured async with go-go-scope
async function parent() {
  await using s = scope()
  const [err, result] = await s.task(() => child())  // Parent waits
  console.log(result)  // This always runs after child
}
```

---

## A Real-World Example

Let's see structured concurrency in action with a complete example that shows off all the features:

```typescript
import { scope } from 'go-go-scope'
import { trace } from '@opentelemetry/api'
import createDebug from 'debug'

const debug = createDebug('my-app:fetch-data')

async function fetchDashboardData(userId: string) {
  // Create a scope with tracing, timeout, and concurrency limit
  await using s = scope({
    name: 'fetch-dashboard',
    timeout: 10000,
    concurrency: 3,
    tracer: trace.getTracer('my-app')
  })
    // Provide services with automatic cleanup
    .provide('db', () => openDatabase(), (db) => db.close())
    .provide('cache', () => createCache(), (cache) => cache.disconnect())
  
  debug('Starting to fetch dashboard data for user %s', userId)
  
  // Fetch profile (sequential)
  const [profileErr, profile] = await s.task(
    async ({ services, signal }) => {
      debug('Fetching profile...')
      // Try cache first
      const cached = await services.cache.get(`user:${userId}`)
      if (cached) return cached
      
      // Fetch from DB
      const user = await services.db.query('SELECT * FROM users WHERE id = ?', [userId], { signal })
      await services.cache.set(`user:${userId}`, user)
      return user
    },
    { otel: { name: 'fetch-profile', attributes: { userId } } }
  )
  
  if (profileErr) {
    debug('Failed to fetch profile: %s', profileErr.message)
    throw profileErr
  }
  
  // Fetch posts, comments, and stats in parallel with concurrency limit
  debug('Fetching posts, comments, and stats...')
  const [postsResults, commentsResults, statsResults] = await s.parallel([
    ({ services, signal }) => services.db.query('SELECT * FROM posts WHERE user_id = ?', [userId], { signal }),
    ({ services, signal }) => services.db.query('SELECT * FROM comments WHERE user_id = ?', [userId], { signal }),
    ({ services, signal }) => fetchUserStats(userId, { signal })
  ])
  
  const [postsErr, posts] = postsResults
  const [commentsErr, comments] = commentsResults
  const [statsErr, stats] = statsResults
  
  if (postsErr) debug('Failed to fetch posts: %s', postsErr.message)
  if (commentsErr) debug('Failed to fetch comments: %s', commentsErr.message)
  if (statsErr) debug('Failed to fetch stats: %s', statsErr.message)
  
  debug('Dashboard data fetched successfully')
  
  return {
    profile,
    posts: postsErr ? [] : posts,
    comments: commentsErr ? [] : comments,
    stats: statsErr ? null : stats
  }
  
  // When we reach here, the scope automatically:
  // 1. Cancels any running tasks
  // 2. Closes the database connection
  // 3. Disconnects from cache
  // 4. Ends the OpenTelemetry span
}
```

**What just happened?**

1. **Tracing** - Every task creates an OpenTelemetry span with timing and attributes
2. **Debug logging** - We used the `debug` module to trace execution flow
3. **Resource management** - Database and cache are automatically cleaned up
4. **Concurrency control** - Only 3 parallel operations at a time
5. **Timeout** - Everything must complete within 10 seconds
6. **Error tolerance** - Partial failures don't crash the whole request

---

## The Scope

A **Scope** is a container for async operations. Think of it as a "workspace" for your tasks.

### Creating a Scope

```typescript
import { scope } from 'go-go-scope'

// Simple scope
await using s = scope()

// With timeout
await using s = scope({ timeout: 5000 })

// With OpenTelemetry tracing
await using s = scope({
  name: 'my-operation',
  tracer: trace.getTracer('my-app')
})

// With concurrency limit
await using s = scope({ concurrency: 3 })

// With circuit breaker
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000
  }
})

// Combined
await using s = scope({
  name: 'complex-operation',
  timeout: 30000,
  concurrency: 5,
  tracer: trace.getTracer('my-app'),
  circuitBreaker: { failureThreshold: 3 }
})
```

### What Does a Scope Do?

1. **Contains tasks** - All tasks are created within a scope
2. **Propagates cancellation** - When the scope ends, tasks are cancelled
3. **Manages resources** - Services you provide are cleaned up automatically
4. **Tracks execution** - Knows what tasks are running
5. **Collects telemetry** - Creates spans for tracing (if tracer provided)

### Resource Cleanup Example

```typescript
async function processFile(filePath: string) {
  await using s = scope()
    // Resources are cleaned up in LIFO order (reverse of creation)
    .provide('tempDir', () => createTempDir(), (dir) => dir.cleanup())
    .provide('fileHandle', () => openFile(filePath), (fh) => fh.close())
    .provide('db', () => openDatabase(), (db) => db.close())
  
  // Use the resources
  const data = await s.use('fileHandle').read()
  const processed = await processData(data)
  
  await s.task(({ services }) => 
    services.db.query('INSERT INTO processed VALUES (?)', [processed])
  )
  
  await s.use('tempDir').write('done.txt', 'Processing complete')
  
  // Cleanup order:
  // 1. Database connection closes
  // 2. File handle closes
  // 3. Temp directory is cleaned up
  // All happen automatically, even if an error occurs!
}
```

### Parent-Child Scopes

Scopes can inherit from parents:

```typescript
await using parent = scope({
  name: 'parent-operation',
  tracer: trace.getTracer('my-app')
})
  .provide('db', () => openDatabase())

// Child inherits parent's services, tracer, and cancellation
await using child = scope({ 
  parent,
  name: 'child-operation'  // Creates a child span
})

// Can use parent's services!
const [err, result] = await child.task(({ services }) => {
  return services.db.query('SELECT 1')
})

// Parent span waits for child span to complete
```

---

## The Task

A **Task** is a unit of work within a scope. It's like a Promise, but:
- **Lazy** - Doesn't start until you await it
- **Cancellable** - Respects the AbortSignal
- **Returns a Result** - Never throws, always returns `[error, value]`

### Creating Tasks

```typescript
await using s = scope()

// Create a task (doesn't start yet!)
const userTask = s.task(() => fetchUser(1))

console.log(userTask.isStarted)  // false

// Start it by awaiting
const [err, user] = await userTask
console.log(userTask.isStarted)  // true
```

### Lazy Execution

Tasks don't run until you await them. This gives you control:

```typescript
await using s = scope()

const primary = s.task(() => fetchFromPrimary())
const fallback = s.task(() => fetchFromFallback())

// Try primary first
const [err, result] = await primary
if (err) {
  // Only now does fallback start!
  const [fallbackErr, fallbackResult] = await fallback
  return fallbackResult
}
return result
```

### Parallel Execution with s.parallel

Use `s.parallel()` for parallel execution with concurrency control and Result tuples:

```typescript
await using s = scope({ concurrency: 3 })

// Run up to 3 tasks concurrently
const results = await s.parallel([
  ({ signal }) => fetchUser(1, { signal }),
  ({ signal }) => fetchUser(2, { signal }),
  ({ signal }) => fetchUser(3, { signal }),
  ({ signal }) => fetchUser(4, { signal }),
  ({ signal }) => fetchUser(5, { signal })
])

// Each result is [error, value]
for (const [err, user] of results) {
  if (err) console.log('Failed:', err)
  else console.log('User:', user)
}
```

### Task with Tracing and Retry

```typescript
const [err, user] = await s.task(
  async ({ services, signal }) => {
    return fetchUser(id, { signal })
  },
  {
    // OpenTelemetry span
    otel: {
      name: 'fetch-user',
      attributes: { userId: id, source: 'database' }
    },
    // Retry configuration
    retry: {
      maxRetries: 3,
      delay: 1000,
      retryCondition: (err) => err instanceof NetworkError
    },
    // Task-specific timeout
    timeout: 5000
  }
)
```

---

## Result Tuples

Every task returns a **Result tuple**: `[error, value]`

```typescript
const [err, user] = await s.task(() => fetchUser(1))
//     ^^^  ^^^^
//     |      |
//     |      The value (if success)
//     The error (if failure)
```

### Why Result Tuples?

Promises throw errors:

```typescript
try {
  const user = await fetchUser(1)  // Might throw!
} catch (err) {
  // Handle error
}
```

Tasks return errors:

```typescript
const [err, user] = await s.task(() => fetchUser(1))
if (err) {
  // Handle error
} else {
  // Use user
}
```

### Benefits

1. **Explicit** - You must check for errors
2. **Type-safe** - TypeScript knows both types
3. **Composable** - Easy to aggregate results
4. **No try/catch** - Cleaner control flow

### Working with Results

```typescript
await using s = scope()

// Single task
const [err, user] = await s.task(() => fetchUser(1))
if (err) return handleError(err)

// Multiple tasks with parallel
const results = await s.parallel([
  () => fetchUser(1),
  () => fetchUser(2),
  () => fetchUser(3)
])

// Process each result
for (const [err, user] of results) {
  if (err) {
    console.log('Failed:', err)
  } else {
    console.log('Got user:', user)
  }
}
```

---

## Cancellation

Every task receives an `AbortSignal` that you can use for cancellation:

```typescript
await s.task(async ({ signal }) => {
  // Pass to fetch for automatic cancellation
  const response = await fetch(url, { signal })
  
  // Or check manually
  if (signal.aborted) {
    throw new Error('Cancelled!')
  }
  
  // Or listen for abort events
  signal.addEventListener('abort', () => {
    console.log('Task was cancelled')
  })
})
```

### When is Cancellation Triggered?

1. **Timeout** - Scope timeout is reached
2. **Scope disposal** - `await using` block ends
3. **Parent cancellation** - Parent scope is cancelled
4. **Manual abort** - You call `scope.signal.abort()`

### Example: Timeout with Cleanup

```typescript
await using s = scope({ timeout: 5000 })

const [err, data] = await s.task(async ({ signal }) => {
  const response = await fetch('/slow-endpoint', { signal })
  
  // Even if we get here, signal might be aborted
  if (signal.aborted) {
    throw new Error('Cancelled during processing')
  }
  
  return response.json()
})

if (err) {
  console.log('Request timed out or failed:', err.message)
}
```

---

## Summary

| Concept | What it is | Key characteristic |
|---------|------------|-------------------|
| **Structured Concurrency** | Pattern for async code | Tasks are bounded by scopes |
| **Scope** | Container for tasks | Manages lifetime, cleanup, and cancellation |
| **Task** | Unit of work | Lazy, cancellable, returns Result |
| **Result Tuple** | `[error, value]` | Explicit error handling |
| **Cancellation** | `AbortSignal` | Automatic cleanup on timeout/error |
| **Tracing** | OpenTelemetry spans | Observability built-in |
| **Debug** | `debug` module | Execution flow tracking |
