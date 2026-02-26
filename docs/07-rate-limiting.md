# Rate Limiting

Control the rate of execution with debounce, throttle, and concurrency limits.

## Table of Contents

- [Debounce](#debounce)
- [Throttle](#throttle)
- [Concurrency Limits](#concurrency-limits)
- [Token Bucket](#token-bucket)
- [Semaphore](#semaphore)

---

## Debounce

Delays function execution until after `wait` milliseconds have elapsed since the last call.

### Basic Usage

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

### Use Case: Search Input

```typescript
const search = s.debounce(async (query: string) => {
  const results = await fetchSearchResults(query)
  updateSearchResults(results)
}, { wait: 300 })

// In your input handler
input.oninput = (e) => search(e.target.value)
```

---

## Throttle

Limits function execution to once per `interval` milliseconds.

### Basic Usage

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

### Use Case: Auto-save

```typescript
const autoSave = s.throttle(async (content: string) => {
  await saveDocument(content)
  showSaveIndicator()
}, { interval: 5000, trailing: true })

// On every keystroke
editor.onchange = (e) => autoSave(e.target.value)
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

## Comparison: Debounce vs Throttle

| Feature | Debounce | Throttle |
|---------|----------|----------|
| When it runs | After pause in calls | At most once per interval |
| Use case | Search input | Auto-save, scroll handlers |
| Leading option | Rarely used | Often enabled |
| Trailing option | Usually enabled | Optional |

---

## Token Bucket

Token bucket rate limiting for controlling API request rates with burst capacity.

### Basic Usage

```typescript
await using s = scope()

// Create token bucket: 100 requests per second, burst up to 100
const bucket = s.tokenBucket({
  capacity: 100,      // Maximum burst size
  refillRate: 100     // Tokens per second
})

// Acquire token and execute
await bucket.acquire(1, async () => {
  await makeApiCall()
})

// Or check without blocking
if (await bucket.tryConsume(1)) {
  await makeApiCall()
} else {
  console.log('Rate limited')
}
```

### Distributed Rate Limiting

Use with a cache provider for distributed rate limiting across multiple instances:

```typescript
import { RedisAdapter } from '@go-go-scope/persistence-redis'

await using s = scope()

const redis = new RedisAdapter(redisClient)

// Distributed token bucket
const bucket = s.tokenBucket({
  capacity: 1000,
  refillRate: 100,
  cache: redis,
  key: 'api-rate-limit:users'
})

// All instances share the same rate limit
await bucket.acquire(1, async () => {
  await fetchUserData()
})
```

### Rate Limit Patterns

**API Client with Rate Limiting:**

```typescript
class RateLimitedApiClient {
  private bucket: TokenBucket
  
  constructor(s: Scope) {
    // 100 requests per second
    this.bucket = s.tokenBucket({
      capacity: 100,
      refillRate: 100
    })
  }
  
  async request<T>(fn: () => Promise<T>): Promise<T> {
    return this.bucket.acquire(1, fn)
  }
}
```

**Tiered Rate Limiting:**

```typescript
await using s = scope()

// Free tier: 10 requests per minute
const freeTier = s.tokenBucket({
  capacity: 10,
  refillRate: 10 / 60  // 10 per 60 seconds
})

// Paid tier: 1000 requests per minute
const paidTier = s.tokenBucket({
  capacity: 1000,
  refillRate: 1000 / 60
})

async function makeRequest(userTier: 'free' | 'paid') {
  const bucket = userTier === 'free' ? freeTier : paidTier
  return bucket.acquire(1, () => fetchData())
}
```

### TokenBucket API

| Method | Description |
|--------|-------------|
| `tryConsume(tokens)` | Try to consume tokens without blocking (returns boolean) |
| `acquire(tokens, fn)` | Acquire tokens and execute function (blocks if needed) |
| `acquireWithTimeout(tokens, timeoutMs, fn)` | Acquire with timeout |
| `reset()` | Reset bucket to full capacity |
| `getTokens()` | Get current token count |
| `getState()` | Get bucket state (tokens, capacity, refillRate) |

---

## Semaphore

Semaphores control concurrent access to resources. For most cases, use `scope({ concurrency: n })` instead.

### When to Use Semaphores

- External resource limits (database connections, file handles)
- Cross-scope coordination
- Dynamic concurrency adjustment

### Basic Usage

```typescript
await using s = scope()

// Allow 5 concurrent operations
const sem = s.semaphore(5)

// Acquire and auto-release
await sem.acquire(async () => {
  await processItem()
})

// Or manual acquire/release
await sem.acquire()
try {
  await processItem()
} finally {
  sem.release()
}
```

### Non-Blocking Operations

```typescript
await using s = scope()

const sem = s.semaphore(3)

// Try to acquire without blocking
if (sem.tryAcquire()) {
  try {
    await processItem()
  } finally {
    sem.release()
  }
} else {
  console.log('Too busy, skipping')
}

// Try with timeout
const acquired = await sem.acquireWithTimeout(1000)
if (acquired) {
  try {
    await processItem()
  } finally {
    sem.release()
  }
}
```

### Resource Pool Pattern

```typescript
await using s = scope()

// Limit database connections
const dbSemaphore = s.semaphore(10)

async function queryDatabase(sql: string) {
  return dbSemaphore.acquire(async () => {
    const conn = await getConnection()
    try {
      return await conn.query(sql)
    } finally {
      conn.release()
    }
  })
}
```

### Semaphore Properties

| Property | Description |
|----------|-------------|
| `available` | Number of available permits |
| `waiting` | Number of waiters in queue |
| `totalPermits` | Total permits (initial capacity) |

---

## Next Steps

- **[Testing](./08-testing.md)** - Testing utilities and patterns
- **[Advanced Patterns](./09-advanced-patterns.md)** - Resource pools, parent-child scopes
