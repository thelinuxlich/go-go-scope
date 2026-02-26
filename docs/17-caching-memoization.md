# Caching and Memoization

Distributed caching and automatic memoization for expensive operations with TTL support.

## Table of Contents

- [Overview](#overview)
- [Cache Providers](#cache-providers)
- [In-Memory Cache](#in-memory-cache)
- [Persistent Cache](#persistent-cache)
- [Memoization with Tasks](#memoization-with-tasks)
  - [Task Deduplication (`dedupe`)](#task-deduplication-dedupe)
  - [In-Memory Memoization (`memo`)](#in-memory-memoization-memo)
  - [Persistent Memoization (`idempotency`)](#persistent-memoization-idempotency)
- [Cache Operations](#cache-operations)
- [Advanced Patterns](#advanced-patterns)

---

## Overview

The caching system provides a unified interface for caching data across multiple storage backends. It supports:

- **In-memory caching** for development and single-node deployments
- **Distributed caching** with Redis, MongoDB, DynamoDB, PostgreSQL, MySQL, and SQLite
- **Automatic memoization** via task options
- **TTL (time-to-live)** support for automatic expiration
- **Cache key namespaces** for organization

---

## Cache Providers

| Provider | Package | Best For |
|----------|---------|----------|
| **In-Memory** | `go-go-scope` | Development, single-node |
| **Redis** | `@go-go-scope/persistence-redis` | High-performance distributed caching |
| **MongoDB** | `@go-go-scope/persistence-mongodb` | Applications using MongoDB |
| **DynamoDB** | `@go-go-scope/persistence-dynamodb` | AWS serverless applications |
| **PostgreSQL** | `@go-go-scope/persistence-postgres` | SQL-based applications |
| **MySQL** | `@go-go-scope/persistence-mysql` | SQL-based applications |
| **SQLite** | `@go-go-scope/persistence-sqlite` | Edge deployments, file-based |

---

## In-Memory Cache

The `InMemoryCache` is included in the core package and requires no additional dependencies.

### Basic Usage

```typescript
import { InMemoryCache, scope } from 'go-go-scope'

// Create cache with size limit
const cache = new InMemoryCache({ 
  maxSize: 1000  // Maximum entries before eviction
})

await using s = scope({
  persistence: { cache }
})

// Store with TTL (milliseconds)
await s.persistence.cache.set('user:123', userData, 60000)

// Retrieve
const user = await s.persistence.cache.get('user:123')
if (user) {
  console.log('Cache hit:', user)
}

// Delete
await s.persistence.cache.delete('user:123')

// Check existence
const exists = await s.persistence.cache.has('user:123')
```

### LRU Eviction

The in-memory cache uses LRU (Least Recently Used) eviction when the size limit is reached:

```typescript
const cache = new InMemoryCache({ maxSize: 100 })

// Add 100 items
for (let i = 0; i < 100; i++) {
  await cache.set(`key:${i}`, { data: i })
}

// Access key:50 to make it recently used
await cache.get('key:50')

// Add 101st item - key:0 or key:1 will be evicted (not key:50)
await cache.set('key:100', { data: 100 })
```

---

## Persistent Cache

Use persistence adapters for distributed caching across multiple processes or servers.

### Redis Cache

```typescript
import { RedisAdapter, RedisIdempotencyAdapter } from '@go-go-scope/persistence-redis'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)
const cache = new RedisAdapter(redis)
const idempotency = new RedisIdempotencyAdapter(redis)

await using s = scope({
  persistence: { cache, idempotency }
})

// TTL is handled natively by Redis
await s.persistence.cache.set('session:abc', sessionData, 3600000)
```

### MongoDB Cache

```typescript
import { MongoClient } from 'mongodb'
import { MongoDBAdapter } from '@go-go-scope/persistence-mongodb'

const client = new MongoClient(process.env.MONGODB_URL)
const db = client.db('myapp')
const cache = new MongoDBAdapter(db)
await cache.connect()

await using s = scope({
  persistence: { cache }
})

await s.persistence.cache.set('config:app', config, 300000)
```

### DynamoDB Cache

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoDBAdapter } from '@go-go-scope/persistence-dynamodb'

const client = new DynamoDBClient({ region: 'us-east-1' })
const docClient = DynamoDBDocumentClient.from(client)
const cache = new DynamoDBAdapter(docClient, 'my-cache-table')
await cache.connect()

await using s = scope({
  persistence: { cache }
})

await s.persistence.cache.set('feature:flags', flags, 60000)
```

---

## Memoization with Tasks

The most powerful caching feature is automatic memoization through task options. This caches task results and returns them for identical inputs.

### Task Deduplication (`dedupe`)

Prevent duplicate in-flight tasks. When multiple tasks are spawned with the same dedupe key while one is still running, they share the same result.

```typescript
await using s = scope()

// These two tasks will share the same result
const t1 = s.task(() => fetchUser(1), { dedupe: 'user:1' })
const t2 = s.task(() => fetchUser(1), { dedupe: 'user:1' })

const [r1, r2] = await Promise.all([t1, t2])
// Only one API call was made, both got the same result
```

**Use cases:**
- Preventing duplicate API calls
- Avoiding duplicate database queries
- Thundering herd protection

```typescript
// Multiple requests for the same user
async function getUser(s: Scope, id: number) {
  return s.task(() => fetchUser(id), { 
    dedupe: `user:${id}`  // Same key = shared result
  })
}

// Even if called 10 times simultaneously, only one fetch happens
const users = await Promise.all([
  getUser(s, 1),
  getUser(s, 1),
  getUser(s, 1),
  // ... more concurrent calls
])
```

**Note:** Deduplication only affects concurrent in-flight tasks. Once a task completes, a new task with the same key will execute again.

### In-Memory Memoization (`memo`)

Cache successful task results in memory with TTL. Unlike `dedupe`, memo persists results across multiple calls.

```typescript
await using s = scope()

// First call executes and caches
const [err1, result1] = await s.task(
  () => fetchUser(1),
  { memo: { key: 'user:1', ttl: 60000 } }  // Cache for 60 seconds
)

// Within 60 seconds, returns cached result
const [err2, result2] = await s.task(
  () => fetchUser(1),
  { memo: { key: 'user:1', ttl: 60000 } }
)
// result2 === result1 (from cache, no API call)

// After 60 seconds, executes again
```

**Key differences from `dedupe`:**

| Feature | `dedupe` | `memo` |
|---------|----------|--------|
| Duration | Only while task in-flight | TTL-based persistence |
| Caches errors | Yes | No (only success) |
| Storage | In-memory registry | In-memory registry |
| Use case | Prevent duplicate calls | Cache expensive results |

### Comparison: `dedupe` vs `memo` vs `idempotency`

| Feature | `dedupe` | `memo` | `idempotency` |
|---------|----------|--------|---------------|
| Storage | In-memory | In-memory | Persistence provider |
| Duration | Task lifetime | TTL | TTL |
| Survives restart | No | No | Yes |
| Caches errors | Yes | No | No |
| Distributed | No | No | Yes |
| Use case | Duplicate prevention | Result caching | Cross-process caching |

### In-Memory Cache with `memo`

### Basic Memoization

```typescript
await using s = scope({
  persistence: { cache: new RedisAdapter(redis) }
})

// First call executes and caches
const [err1, result1] = await s.task(
  () => fetchExpensiveData(userId),
  { 
    idempotency: { key: `user-data:${userId}`, ttl: 60000 }
  }
)

// Second call with same key returns cached result instantly
const [err2, result2] = await s.task(
  () => fetchExpensiveData(userId),
  { 
    idempotency: { key: `user-data:${userId}`, ttl: 60000 }
  }
)
// result2 === result1 (cached)
```

### Persistent Memoization (`idempotency`)

Use structured keys for organized caching:

```typescript
// User data
await s.task(() => fetchUser(id), {
  idempotency: { key: `user:${id}`, ttl: 300000 }
})

// API responses
await s.task(() => fetchApiData(endpoint), {
  idempotency: { key: `api:${endpoint}:v1`, ttl: 60000 }
})

// Computed aggregations
await s.task(() => calculateMetrics(dateRange), {
  idempotency: { key: `metrics:${dateRange.start}:${dateRange.end}`, ttl: 3600000 }
})

// Configuration
await s.task(() => loadConfig(environment), {
  idempotency: { key: `config:${environment}`, ttl: 300000 }
})
```

### Scope-Level Default TTL

Set a default TTL for all idempotent tasks in a scope:

```typescript
await using s = scope({
  persistence: { cache: redisAdapter },
  idempotency: { defaultTTL: 300000 }  // 5 minutes default
})

// Uses default TTL
await s.task(() => fetchData1(), { idempotency: { key: 'data:1' } })

// Override default
await s.task(() => fetchData2(), { 
  idempotency: { key: 'data:2', ttl: 60000 }
})
```

---

## Cache Operations

### Direct Cache Access

For scenarios where you need direct cache access outside of tasks:

```typescript
await using s = scope({
  persistence: { cache: redisAdapter }
})

// Manual cache operations
await s.persistence.cache.set('key', value, ttl)
const value = await s.persistence.cache.get('key')
const exists = await s.persistence.cache.has('key')
await s.persistence.cache.delete('key')
```

### Batch Operations

Some adapters support batch operations for efficiency:

```typescript
// Get multiple keys at once (Redis example)
const values = await Promise.all([
  s.persistence.cache.get('user:1'),
  s.persistence.cache.get('user:2'),
  s.persistence.cache.get('user:3')
])

// Set multiple with pipeline
await Promise.all([
  s.persistence.cache.set('user:1', user1, 60000),
  s.persistence.cache.set('user:2', user2, 60000),
  s.persistence.cache.set('user:3', user3, 60000)
])
```

### Cache Key Namespacing

Organize cache keys with namespaces:

```typescript
// Helper for consistent namespacing
function cacheKey(type: string, id: string): string {
  return `${type}:${id}`
}

await s.persistence.cache.set(cacheKey('user', userId), user, 300000)
await s.persistence.cache.set(cacheKey('session', sessionId), session, 3600000)
await s.persistence.cache.set(cacheKey('config', 'app'), config, 60000)
```

---

## Advanced Patterns

### Cache-Aside Pattern

Manual cache management with fallback to source:

```typescript
async function getUserWithCache(s: Scope, userId: string): Promise<User> {
  const cacheKey = `user:${userId}`
  
  // Try cache first
  const cached = await s.persistence.cache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  // Fetch from source
  const [err, user] = await s.task(() => fetchUserFromDb(userId))
  if (err) throw err
  
  // Store in cache
  await s.persistence.cache.set(cacheKey, user, 300000)
  
  return user
}
```

### Cache Warming

Pre-populate cache before high-traffic periods:

```typescript
await using s = scope({
  persistence: { cache: redisAdapter }
})

// Warm cache with popular data
async function warmCache() {
  const popularUsers = await fetchPopularUsers(100)
  
  await s.parallel(
    popularUsers.map(user => async () => {
      await s.persistence.cache.set(
        `user:${user.id}`,
        user,
        600000  // 10 minutes
      )
    }),
    { concurrency: 10 }
  )
}

await warmCache()
```

### Cache Invalidation

Strategies for invalidating cached data:

```typescript
// Time-based invalidation (TTL)
await s.persistence.cache.set('data', value, 300000)

// Manual invalidation on data change
async function updateUser(userId: string, data: Partial<User>) {
  const [err, updated] = await s.task(() => db.users.update(userId, data))
  if (err) throw err
  
  // Invalidate cache
  await s.persistence.cache.delete(`user:${userId}`)
  
  return updated
}

// Pattern-based invalidation (Redis only)
async function invalidateUserCache(pattern: string) {
  const keys = await redis.keys(`user:${pattern}:*`)
  for (const key of keys) {
    await redis.del(key)
  }
}
```

### Multi-Layer Caching

Combine in-memory and distributed caching:

```typescript
import { InMemoryCache } from 'go-go-scope'
import { RedisAdapter } from '@go-go-scope/persistence-redis'

const localCache = new InMemoryCache({ maxSize: 100 })
const redisCache = new RedisAdapter(redis)

await using s = scope({
  persistence: { cache: redisCache }
})

async function getWithL1L2(key: string) {
  // L1: Local in-memory cache (fastest)
  const local = await localCache.get(key)
  if (local) return local
  
  // L2: Redis distributed cache
  const remote = await s.persistence.cache.get(key)
  if (remote) {
    // Populate L1
    await localCache.set(key, remote, 5000)
    return remote
  }
  
  // Source of truth
  const value = await fetchFromSource(key)
  
  // Populate both caches
  await localCache.set(key, value, 5000)
  await s.persistence.cache.set(key, value, 300000)
  
  return value
}
```

---

## Cache Provider Interface

Implement your own cache provider:

```typescript
interface CacheProvider {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
}

// Example: Custom cache provider
class CustomCache implements CacheProvider {
  async get<T>(key: string): Promise<T | undefined> {
    // Implementation
  }
  
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    // Implementation
  }
  
  async delete(key: string): Promise<void> {
    // Implementation
  }
  
  async has(key: string): Promise<boolean> {
    // Implementation
  }
}
```
