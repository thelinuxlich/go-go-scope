# Migration Guides

Step-by-step guides for migrating to `go-go-scope` from other patterns and libraries.

## Table of Contents

- [From Raw Promises](#from-raw-promises)
- [From p-queue](#from-p-queue)
- [From Effect](#from-effect)
- [From RxJS](#from-rxjs)
- [From Async.js](#from-asyncjs)

---

## From Raw Promises

### Before: Manual Cleanup

```typescript
async function fetchWithTimeout() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  try {
    const response = await fetch('/api/data', { 
      signal: controller.signal 
    })
    clearTimeout(timeoutId)
    return await response.json()
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

async function fetchMultiple() {
  const controllers: AbortController[] = []
  
  try {
    const promises = urls.map(url => {
      const controller = new AbortController()
      controllers.push(controller)
      return fetch(url, { signal: controller.signal })
    })
    
    return await Promise.all(promises)
  } finally {
    // Cleanup all controllers
    controllers.forEach(c => c.abort())
  }
}
```

### After: Structured Concurrency

```typescript
import { scope } from 'go-go-scope'

async function fetchWithTimeout() {
  await using s = scope({ timeout: 5000 })
  
  const [err, data] = await s.task(async ({ signal }) => {
    const response = await fetch('/api/data', { signal })
    return response.json()
  })
  
  if (err) throw err
  return data
  // Auto-cancelled if timeout reached
}

async function fetchMultiple(urls: string[]) {
  await using s = scope()
  
  const results = await s.parallel(
    urls.map(url => ({ signal }) => fetch(url, { signal }))
  )
  
  // All requests automatically cancelled if scope exits
  return results
    .filter(([err]) => !err)
    .map(([, value]) => value)
}
```

### Key Changes

| Pattern | Raw Promises | go-go-scope |
|---------|--------------|-------------|
| Timeout | `setTimeout` + manual cleanup | `scope({ timeout })` |
| Cancellation | `AbortController` per operation | Automatic signal propagation |
| Error handling | `try/catch` with cleanup | Result tuples + auto-cleanup |
| Parallel execution | `Promise.all` + manual tracking | `scope.parallel()` with typed results |

---

## From p-queue

### Before: p-queue

```typescript
import PQueue from 'p-queue'

const queue = new PQueue({ concurrency: 2 })

async function processJobs(jobs: Job[]) {
  const results = await Promise.allSettled(
    jobs.map(job => queue.add(() => processJob(job)))
  )
  
  // Filter results manually
  const successful = results
    .filter((r): r is PromiseFulfilledResult<JobResult> => r.status === 'fulfilled')
    .map(r => r.value)
  
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason)
    
  return { successful, failed }
}
```

### After: go-go-scope

```typescript
import { scope } from 'go-go-scope'

async function processJobs(jobs: Job[]) {
  await using s = scope({ concurrency: 2 })
  
  const results = await s.parallel(
    jobs.map(job => () => processJob(job)),
    { continueOnError: true }
  )
  
  // Typed results with error/success separation
  const successful = results
    .filter(([err]) => !err)
    .map(([, value]) => value)
  
  const failed = results
    .filter(([err]) => err)
    .map(([err]) => err)
    
  return { successful, failed }
}
```

### Key Differences

| Feature | p-queue | go-go-scope |
|---------|---------|-------------|
| Concurrency | Global queue instance | Per-scope limit |
| Progress tracking | Manual | Built-in `onProgress` callback |
| Error handling | `Promise.allSettled` | Result tuples |
| Cancellation | Manual queue clearing | Automatic on scope disposal |
| Types | Manual filtering | Preserved in tuple results |

---

## From Effect

### Before: Effect

```typescript
import { Effect, pipe } from 'effect'

const fetchUser = (id: number) => Effect.tryPromise({
  try: () => fetch(`/api/users/${id}`).then(r => r.json()),
  catch: (e) => new Error(String(e))
})

const program = Effect.gen(function* (_) {
  const users = yield* _(Effect.forEach(
    [1, 2, 3],
    (id) => fetchUser(id),
    { concurrency: 2 }
  ))
  
  return users
}).pipe(
  Effect.timeout('5 seconds'),
  Effect.retry({
    schedule: Schedule.exponential('100 millis').pipe(
      Schedule.union(Schedule.recurs(3))
    )
  })
)

const result = await Effect.runPromise(program)
```

### After: go-go-scope

```typescript
import { scope, exponentialBackoff } from 'go-go-scope'

async function fetchUsers() {
  await using s = scope({ 
    timeout: 5000, 
    concurrency: 2 
  })
  
  const results = await s.parallel(
    [1, 2, 3].map(id => () => 
      fetch(`/api/users/${id}`).then(r => r.json())
    ),
    {
      continueOnError: true
    }
  )
  
  // With retry on individual tasks
  const userTasks = [1, 2, 3].map(id => 
    s.task(
      () => fetch(`/api/users/${id}`).then(r => r.json()),
      {
        retry: {
          maxRetries: 3,
          delay: exponentialBackoff({ initial: 100 })
        }
      }
    )
  )
  
  return await Promise.all(userTasks)
}
```

### When to Migrate

**Keep Effect if:**
- You need sophisticated error channels and error accumulation
- You're building a large application with complex effect composition
- You want built-in schema validation and OpenAPI integration
- Your team prefers functional programming patterns

**Consider go-go-scope if:**
- You want simpler, more familiar async/await syntax
- Bundle size is a concern (~3KB vs ~50KB+)
- You're migrating incrementally from existing Promise-based code
- You prefer imperative patterns with explicit resource management

### Key Differences

| Aspect | Effect | go-go-scope |
|--------|--------|-------------|
| Paradigm | Functional, monadic | Imperative, async/await |
| Learning curve | Steep | Minimal |
| Bundle size | ~50KB+ | ~3KB |
| Error handling | Error channel + catch tags | Result tuples |
| Composition | Pipe/flow | Standard JS composition |
| Runtime | Fiber-based | Native Promises |

---

## From RxJS

### Before: RxJS

```typescript
import { from, mergeMap, catchError, timeout, retry } from 'rxjs'

const fetchData$ = (id: string) => from(fetchUser(id)).pipe(
  timeout(5000),
  retry(3),
  catchError(err => {
    console.error('Failed:', err)
    return of(null)
  })
)

const processUsers$ = (ids: string[]) => from(ids).pipe(
  mergeMap(id => fetchData$(id), 2), // concurrency: 2
  toArray()
)

// Subscribe and manage subscription
const subscription = processUsers$(['1', '2', '3'])
  .subscribe({
    next: results => console.log(results),
    error: err => console.error(err),
    complete: () => console.log('Done')
  })

// Must unsubscribe to prevent memory leaks
subscription.unsubscribe()
```

### After: go-go-scope

```typescript
import { scope } from 'go-go-scope'

async function processUsers(ids: string[]) {
  await using s = scope({ concurrency: 2 })
  
  const results = await s.parallel(
    ids.map(id => () => fetchUser(id)),
    { 
      continueOnError: true,
      onProgress: (done, total) => console.log(`${done}/${total}`)
    }
  )
  
  // With timeout and retry per task
  const tasks = ids.map(id => 
    s.task(
      () => fetchUser(id),
      { timeout: 5000, retry: { maxRetries: 3 } }
    )
  )
  
  return await Promise.all(tasks)
  // Auto-cleanup, no unsubscribe needed
}
```

### Key Differences

| Aspect | RxJS | go-go-scope |
|--------|------|-------------|
| Model | Stream-based (push) | Promise-based (pull) |
| Learning curve | Steep (many operators) | Low |
| Memory management | Manual subscription | Automatic with `using` |
| Concurrency | `mergeMap` with concurrency | Built-in `concurrency` option |
| Cancellation | `unsubscribe()` | AbortSignal propagation |
| Use case | Event streams, complex transformations | Structured concurrent operations |

---

## From Async.js

### Before: Async.js

```typescript
import async from 'async'

async.parallelLimit([
  callback => fetchUser(1, callback),
  callback => fetchUser(2, callback),
  callback => fetchUser(3, callback)
], 2, (err, results) => {
  if (err) {
    console.error(err)
    return
  }
  console.log(results)
})

// With timeout and retry - requires external libraries
const async = require('async')
const retry = require('async-retry')
```

### After: go-go-scope

```typescript
import { scope } from 'go-go-scope'

async function fetchUsers() {
  await using s = scope({ concurrency: 2 })
  
  const results = await s.parallel([
    () => fetchUser(1),
    () => fetchUser(2),
    () => fetchUser(3)
  ])
  
  // Results are typed Result tuples
  for (const [err, user] of results) {
    if (err) console.error(err)
    else console.log(user)
  }
}

// With timeout and retry - built-in
async function fetchUsersWithRetry() {
  await using s = scope({ concurrency: 2 })
  
  const tasks = [1, 2, 3].map(id => 
    s.task(() => fetchUser(id), {
      timeout: 5000,
      retry: { maxRetries: 3, delay: 100 }
    })
  )
  
  return await Promise.all(tasks)
}
```

### Key Differences

| Aspect | Async.js | go-go-scope |
|--------|----------|-------------|
| Style | Callback-based | Promise/async-await |
| Error handling | First callback arg | Result tuples |
| Modern features | Limited | Full TypeScript, ESM |
| Bundle size | ~20KB | ~3KB |
| Maintenance | Limited | Active |

---

## General Migration Tips

### 1. Start with Timeouts

Replace `setTimeout` patterns first:

```typescript
// Before
const timeoutId = setTimeout(() => controller.abort(), 5000)

// After
await using s = scope({ timeout: 5000 })
```

### 2. Replace Manual Cancellation

Use scope disposal instead of manual cleanup:

```typescript
// Before
const cleanup = () => {
  controller.abort()
  clearInterval(intervalId)
  socket.close()
}

// After
await using s = scope()
s.onDispose(() => socket.close())
```

### 3. Convert Parallel Operations

Use `parallel()` for concurrent operations:

```typescript
// Before
const results = await Promise.allSettled(promises)

// After
const results = await s.parallel(factories, { continueOnError: true })
```

### 4. Incremental Adoption

You can use go-go-scope alongside existing code:

```typescript
// Existing Promise-based code
async function legacyFetch() {
  return fetch('/api/data')
}

// Wrapped in structured concurrency
async function modernFetch() {
  await using s = scope({ timeout: 5000 })
  return s.task(() => legacyFetch())
}
```

---

## Next Steps

- **[Quick Start](./01-quick-start.md)** - Get started with go-go-scope
- **[Core Concepts](./02-concepts.md)** - Learn structured concurrency patterns
- **[API Reference](./03-api-reference.md)** - Complete API documentation
