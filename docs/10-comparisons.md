# Comparisons

How `go-go-scope` compares to other approaches.

## Table of Contents

- [vs Vanilla JavaScript](#vs-vanilla-javascript)
- [vs Effect](#vs-effect)
- [Feature Matrix](#feature-matrix)

---

## vs Vanilla JavaScript

### Without go-go-scope

**Manual cleanup, easy to leak:**

```typescript
async function fetchWithTimeout() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  try {
    const response = await fetch('/api/data', { 
      signal: controller.signal 
    })
    clearTimeout(timeoutId)  // Don't forget this!
    return await response.json()
  } catch (err) {
    clearTimeout(timeoutId)  // And here!
    throw err
  }
}
```

**Race without cancellation:**

```typescript
async function fetchFastest() {
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
    
    // Must manually cancel losers
    controllers.forEach(c => c.abort())
    return winner
  } catch (err) {
    controllers.forEach(c => c.abort())
    throw err
  }
}
```

### With go-go-scope

**Automatic cleanup:**

```typescript
async function fetchWithTimeout() {
  await using s = scope({ timeout: 5000 })
  const response = await fetch('/api/data', { signal: s.signal })
  return response.json()
}
```

**Automatic cancellation:**

```typescript
async function fetchFastest() {
  await using s = scope()
  
  const [err, winner] = await s.race([
    ({ signal }) => fetch('https://a.com', { signal }),
    ({ signal }) => fetch('https://b.com', { signal }),
    ({ signal }) => fetch('https://c.com', { signal })
  ])
  
  if (err) throw err
  return winner
  // Slow requests automatically cancelled!
}
```

### Comparison Table

| Aspect | Vanilla JS | go-go-scope |
|--------|------------|-------------|
| Timeout cleanup | Manual | Automatic |
| Race cancellation | Manual | Automatic |
| Resource cleanup | `try/finally` | `await using` |
| Error handling | `try/catch` | Result tuples |
| Concurrency limit | Manual | Built-in |
| Bundle size | 0 KB | ~3 KB |
| Learning curve | None | Low |

---

## vs Effect

[Effect](https://effect.website/) is a powerful functional programming library with structured concurrency.

### Parallel HTTP Requests

**Effect:**

```typescript
import { Effect, Schedule, pipe } from 'effect'

const fetchUser = (id: number) => Effect.tryPromise({
  try: () => fetch(`/api/users/${id}`).then(r => r.json()),
  catch: (e) => new Error(String(e))
})

const program = Effect.forEach(
  [1, 2, 3, 4],
  (id) => fetchUser(id),
  { concurrency: 2 }
)

const withTimeout = Effect.timeout(program, '5 seconds')

const withRetry = Effect.retry(
  withTimeout,
  Schedule.exponential('100 millis').pipe(Schedule.union(Schedule.recurs(3)))
)

const result = await Effect.runPromise(withRetry)
```

**go-go-scope:**

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

### Resource Management

**Effect:**

```typescript
import { Context, Effect, Layer } from 'effect'

const DatabaseTag = Context.Tag<Database>('Database')

const program = Effect.gen(function* (_) {
  const db = yield* _(DatabaseTag)
  
  const user = yield* _(db.query('SELECT * FROM users WHERE id = ?', [1]))
  const posts = yield* _(db.query('SELECT * FROM posts WHERE user_id = ?', [1]))
  
  return { user, posts }
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.succeed(DatabaseTag, databaseInstance))
)

await Effect.runPromise(program)
```

**go-go-scope:**

```typescript
import { scope } from 'go-go-scope'

async function getUserData() {
  await using s = scope()
    .provide('db', () => openDatabase(), (db) => db.close())
  
  const userTask = s.task(({ services }) => services.db.query('SELECT * FROM users WHERE id = ?', [1]))
  const postsTask = s.task(({ services }) => services.db.query('SELECT * FROM posts WHERE user_id = ?', [1]))
  
  const [userResult, postsResult] = await Promise.all([userTask, postsTask])
  const [userErr, user] = userResult
  const [postsErr, posts] = postsResult
  if (userErr) throw userErr
  if (postsErr) throw postsErr
  return { user, posts }
}
```

### Racing with Fallback

**Effect:**

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

**go-go-scope:**

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

### Channels

**Effect:**

```typescript
import { Effect, Queue, Fiber } from 'effect'

const program = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<string>())
  
  const producer = yield* _(Effect.fork(
    Effect.gen(function* (_) {
      for (const item of items) {
        yield* _(queue.offer(item))
      }
      yield* _(queue.shutdown)
    })
  ))
  
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

**go-go-scope:**

```typescript
import { scope } from 'go-go-scope'

async function processItems(items: string[]) {
  await using s = scope()
  const ch = s.channel<string>(100)
  
  s.task(async () => {
    for (const item of items) {
      await ch.send(item)
    }
    ch.close()
  })
  
  const results: string[] = []
  for await (const item of ch) {
    results.push(item)
  }
  
  return results
}
```

### Rate Limiting

**Effect:**

```typescript
import { Effect } from 'effect'

const fetchAll = Effect.forEach(
  urls,
  (url) => Effect.tryPromise(() => fetch(url)),
  { concurrency: 5 }
)

await Effect.runPromise(fetchAll)
```

**go-go-scope:**

```typescript
import { scope } from 'go-go-scope'

async function fetchAll(urls: string[]) {
  await using s = scope({ concurrency: 5 })
  
  return s.parallel(
    urls.map(url => () => fetch(url))
  )
}
```

### Circuit Breaker

**Effect:** (requires @effect/cluster)

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

**go-go-scope:**

```typescript
import { scope } from 'go-go-scope'

async function fetchWithCircuitBreaker() {
  await using s = scope({
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000
    }
  })
  
  const [err, result] = await s.task(() => fetchData())
  if (err) throw err
  return result
}
```

### Polling

**Effect:**

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
  
  return fiber
})

const fiber = await Effect.runPromise(poll)
// Later: await Fiber.interrupt(fiber)
```

**go-go-scope:**

```typescript
import { scope } from 'go-go-scope'

async function startPolling() {
  await using s = scope()
  
  s.poll(
    ({ signal }) => fetchConfig({ signal }),
    (config) => updateUI(config),
    { interval: 30000 }
  )
  
  await new Promise(() => {})
}
```

### When to Choose

| Aspect | Effect | go-go-scope |
|--------|--------|-------------|
| **Paradigm** | Functional, monadic | Imperative, async/await |
| **Learning curve** | Steep | Minimal |
| **Bundle size** | ~50KB+ | ~3 KB |
| **Error handling** | Built-in error channel | Result tuples |
| **Observability** | Built-in tracing | Bring your own |
| **Retry/Schedule** | Excellent built-in | Manual |
| **Dependency injection** | Sophisticated (Layers) | Simple (provide/use) |
| **Channels** | Via Queue/Hub | Native async iteration |
| **Polling** | Via Schedule | Built-in |
| **Circuit breaker** | Via @effect/cluster | Built-in |
| **Type inference** | Can be complex | Straightforward |
| **Ecosystem** | Rich (streams, schema, cli) | Focused |

**Choose Effect** when you need its full ecosystem, want functional patterns, or are building large applications.

**Choose go-go-scope** when you want structured concurrency with minimal learning curve, prefer native async/await, or need a small bundle size.

Both enforce: **parent-bounded lifetimes** and **guaranteed cleanup**.

---

## Feature Matrix

| Feature | Vanilla JS | go-go-scope | Effect |
|---------|------------|-------------|--------|
| Cancellation | Manual | Automatic | Automatic |
| Timeouts | Manual setTimeout | Built-in | Built-in |
| Retry | Manual | Built-in | Excellent |
| Race cancellation | Manual | Automatic | Automatic |
| Concurrency limit | Manual | Built-in | Built-in |
| Circuit breaker | External lib | Built-in | @effect/cluster |
| Channels | External lib | Built-in | Via Queue/Hub |
| Polling | Manual | Built-in | Via Schedule |
| Dependency injection | None | Simple | Sophisticated |
| Tracing | Manual | OpenTelemetry | Built-in |
| Resource cleanup | try/finally | `await using` | Effect.scoped |
| Bundle size | 0 KB | ~3 KB | ~50KB+ |
| Learning curve | None | Low | Steep |

---

## Next Steps

- **[Integrations](./11-integrations.md)** - Third-party integrations (OpenTelemetry, Prometheus, etc.)
