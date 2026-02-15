# Comparisons

How `go-go-scope` compares to other approaches.

## Table of Contents

- [vs Vanilla JavaScript](#vs-vanilla-javascript)
- [vs Effect](#vs-effect)
- [Testing with Dependency Injection](#testing-with-dependency-injection)
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
import { assert } from 'go-go-try'

async function fetchFastest() {
  await using s = scope()
  
  const [err, winner] = await s.race([
    ({ signal }) => fetch('https://a.com', { signal }),
    ({ signal }) => fetch('https://b.com', { signal }),
    ({ signal }) => fetch('https://c.com', { signal })
  ])
  
  return assert(winner, err) // Throws if err exists, returns winner otherwise
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
  return assert(result, err) // Throws if err, returns result otherwise
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

## Testing with Dependency Injection

A detailed comparison of testing approaches with different DI libraries.

### The Scenario

Testing a `UserService` that depends on `Database` and `EmailService`:

```typescript
// UserService.ts - Production code
export async function createUser(
  data: { name: string; email: string },
  scope: Scope
) {
  const db = scope.use('db')
  const email = scope.use('email')
  
  const user = await db.insert('users', data)
  await email.sendWelcome(data.email, user.id)
  
  return user
}
```

### go-go-scope (Current)

**Test with `override()`:**

```typescript
import { scope } from 'go-go-scope'
import { describe, test, expect, vi } from 'vitest'

describe('createUser', () => {
  test('creates user and sends email', async () => {
    const mockDb = {
      insert: vi.fn().mockResolvedValue({ id: 1, name: 'John', email: 'john@example.com' })
    }
    const mockEmail = {
      sendWelcome: vi.fn().mockResolvedValue(undefined)
    }

    await using s = scope()
      .provide('db', () => ({} as any))      // Placeholder
      .provide('email', () => ({} as any))   // Placeholder
      .override('db', () => mockDb)
      .override('email', () => mockEmail)

    const user = await createUser(
      { name: 'John', email: 'john@example.com' },
      s
    )

    expect(mockDb.insert).toHaveBeenCalledWith('users', { name: 'John', email: 'john@example.com' })
    expect(mockEmail.sendWelcome).toHaveBeenCalledWith('john@example.com', 1)
    expect(user.id).toBe(1)
  })
})
```

**Test with `createMockScope`:**

```typescript
import { createMockScope } from 'go-go-scope/testing'

describe('createUser', () => {
  test('creates user with mocks', async () => {
    const mockDb = { insert: vi.fn().mockResolvedValue({ id: 1 }) }
    const mockEmail = { sendWelcome: vi.fn().mockResolvedValue(undefined) }

    const s = createMockScope({
      services: {
        db: mockDb,
        email: mockEmail
      }
    })

    const user = await createUser({ name: 'John', email: 'john@example.com' }, s)

    expect(user.id).toBe(1)
  })
})
```

**Pros:**
- ✅ Type-safe service replacement
- ✅ No decorators or metadata needed
- ✅ Works with native `await using`
- ✅ Easy to override individual services
- ✅ Cleanup automatically handled

**Cons:**
- ❌ Need to provide placeholder before override
- ❌ Service keys are strings (not symbols)

---

### InversifyJS

```typescript
// UserService.ts with InversifyJS
import { injectable, inject } from 'inversify'
import 'reflect-metadata'

@injectable()
export class UserService {
  constructor(
    @inject('Database') private db: Database,
    @inject('EmailService') private email: EmailService
  ) {}

  async createUser(data: { name: string; email: string }) {
    const user = await this.db.insert('users', data)
    await this.email.sendWelcome(data.email, user.id)
    return user
  }
}
```

**Testing with InversifyJS:**

```typescript
import { Container } from 'inversify'
import { UserService } from './UserService'

describe('UserService', () => {
  test('creates user with mocks', async () => {
    // Create container with mocks
    const container = new Container()
    
    container.bind('Database').toConstantValue({
      insert: vi.fn().mockResolvedValue({ id: 1 })
    })
    
    container.bind('EmailService').toConstantValue({
      sendWelcome: vi.fn().mockResolvedValue(undefined)
    })
    
    container.bind(UserService).toSelf()

    const service = container.get(UserService)
    const user = await service.createUser({ name: 'John', email: 'john@example.com' })

    expect(user.id).toBe(1)
  })
})
```

**Pros:**
- ✅ Symbol-based injection (type-safe)
- ✅ Supports multiple binding types (singleton, transient, etc.)
- ✅ Large ecosystem

**Cons:**
- ❌ Requires `reflect-metadata` polyfill
- ❌ Decorators needed (`@injectable`, `@inject`)
- ❌ More verbose setup for tests
- ❌ Container lifecycle management
- ❌ ~15KB bundle size

---

### TSyringe

```typescript
// UserService.ts with TSyringe
import { injectable, inject } from 'tsyringe'

@injectable()
export class UserService {
  constructor(
    @inject('Database') private db: Database,
    @inject('EmailService') private email: EmailService
  ) {}

  async createUser(data: { name: string; email: string }) {
    const user = await this.db.insert('users', data)
    await this.email.sendWelcome(data.email, user.id)
    return user
  }
}
```

**Testing with TSyringe:**

```typescript
import { container } from 'tsyringe'
import { UserService } from './UserService'

describe('UserService', () => {
  test('creates user with mocks', async () => {
    // Clear and reset container
    container.clearInstances()
    
    container.register('Database', {
      useValue: { insert: vi.fn().mockResolvedValue({ id: 1 }) }
    })
    
    container.register('EmailService', {
      useValue: { sendWelcome: vi.fn().mockResolvedValue(undefined) }
    })

    const service = container.resolve(UserService)
    const user = await service.createUser({ name: 'John', email: 'john@example.com' })

    expect(user.id).toBe(1)
  })
})
```

**Pros:**
- ✅ Auto-registration support
- ✅ Class-based resolution

**Cons:**
- ❌ Requires decorators
- ❌ Global container can leak between tests
- ❌ Need to manually clear/reset container
- ❌ ~8KB bundle size

---

### Effect (Layers)

```typescript
// UserService.ts with Effect
import { Effect, Context } from 'effect'

export interface Database {
  insert: (table: string, data: unknown) => Effect.Effect<unknown, Error>
}

export interface EmailService {
  sendWelcome: (email: string, userId: number) => Effect.Effect<void, Error>
}

export const DatabaseTag = Context.Tag<Database>('Database')
export const EmailServiceTag = Context.Tag<EmailService>('EmailService')

export const createUser = (data: { name: string; email: string }) => 
  Effect.gen(function* (_) {
    const db = yield* _(DatabaseTag)
    const email = yield* _(EmailServiceTag)
    
    const user = yield* _(db.insert('users', data))
    yield* _(email.sendWelcome(data.email, user.id))
    
    return user
  })
```

**Testing with Effect:**

```typescript
import { Effect, Layer } from 'effect'

describe('createUser', () => {
  test('creates user with mocks', async () => {
    const mockDb: Database = {
      insert: vi.fn().mockReturnValue(Effect.succeed({ id: 1 }))
    }
    const mockEmail: EmailService = {
      sendWelcome: vi.fn().mockReturnValue(Effect.succeed(undefined))
    }

    const TestLayer = Layer.succeed(DatabaseTag, mockDb)
      .pipe(Layer.merge(Layer.succeed(EmailServiceTag, mockEmail)))

    const program = createUser({ name: 'John', email: 'john@example.com' }).pipe(
      Effect.provide(TestLayer)
    )

    const user = await Effect.runPromise(program)
    expect(user.id).toBe(1)
  })
})
```

**Pros:**
- ✅ Powerful composition with Layers
- ✅ Type-safe at every level
- ✅ No decorators needed

**Cons:**
- ❌ Must wrap everything in Effect
- ❌ Steep learning curve
- ❌ Different mental model (functional)
- ❌ Need to create Effect wrappers for mocks

---

### Manual Constructor Injection (No DI Library)

```typescript
// UserService.ts - Plain TypeScript
export class UserService {
  constructor(
    private db: Database,
    private email: EmailService
  ) {}

  async createUser(data: { name: string; email: string }) {
    const user = await this.db.insert('users', data)
    await this.email.sendWelcome(data.email, user.id)
    return user
  }
}
```

**Testing:**

```typescript
describe('UserService', () => {
  test('creates user with mocks', async () => {
    const mockDb = { insert: vi.fn().mockResolvedValue({ id: 1 }) }
    const mockEmail = { sendWelcome: vi.fn().mockResolvedValue(undefined) }

    const service = new UserService(mockDb, mockEmail)
    const user = await service.createUser({ name: 'John', email: 'john@example.com' })

    expect(user.id).toBe(1)
  })
})
```

**Pros:**
- ✅ Zero dependencies
- ✅ Simplest possible approach
- ✅ Full type safety

**Cons:**
- ❌ No lifecycle management
- ❌ No automatic cleanup
- ❌ Manual wiring for every test
- ❌ Can't easily swap implementations at runtime

---

### Testing Comparison Matrix

| Aspect | go-go-scope | InversifyJS | TSyringe | Effect | Manual |
|--------|-------------|-------------|----------|--------|--------|
| **Boilerplate** | Low | High | Medium | High | None |
| **Type Safety** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Decorators needed** | ❌ No | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Test setup time** | Fast | Medium | Medium | Slow | Fast |
| **Runtime overhead** | None | Metadata | Metadata | Fiber runtime | None |
| **Mock replacement** | `override()` | Container rebind | Register | Layer.provide | Constructor args |
| **Cleanup handling** | Automatic | Manual | Manual | Automatic | Manual |
| **Bundle impact** | ~3KB | ~15KB | ~8KB | ~50KB | 0KB |
| **Test isolation** | ✅ Excellent | ⚠️ Care needed | ⚠️ Clear container | ✅ Excellent | ✅ Excellent |
| **Learning curve** | Low | Medium | Low | High | None |

---

### Recommendation

**Choose go-go-scope when:**
- You want simple, type-safe DI without decorators
- You're already using structured concurrency
- You need automatic cleanup in tests
- You want minimal bundle size

**Choose InversifyJS when:**
- You need advanced DI features (custom providers, child containers)
- You're building a large enterprise app
- You don't mind decorators and metadata

**Choose TSyringe when:**
- You want auto-registration and simple decorators
- You're in the Microsoft ecosystem

**Choose Effect when:**
- You're fully committed to functional programming
- You want composable, testable effects as first-class

**Choose Manual injection when:**
- Your app is small
- You don't need runtime DI
- You prefer explicit over implicit

## Feature Matrix

| Feature | Vanilla JS | go-go-scope | Effect |
|---------|------------|-------------|--------|
| Cancellation | Manual | Automatic | Automatic |
| Cancellation helpers | None | ✅ Utilities | Built-in |
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
