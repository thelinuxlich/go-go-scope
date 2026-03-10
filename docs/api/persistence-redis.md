# persistence-redis API Reference

> Auto-generated documentation for persistence-redis

## Table of Contents

- [Classes](#Classes)
  - [RedisCacheAdapter](#rediscacheadapter)
  - [RedisIdempotencyAdapter](#redisidempotencyadapter)
  - [RedisAdapter](#redisadapter)
- [Methods](#Methods)
  - [RedisCacheAdapter.stats](#rediscacheadapter-stats)

## Classes

### RedisCacheAdapter

```typescript
class RedisCacheAdapter
```

Redis cache adapter implementing CacheProvider

*Source: [cache.ts:16](packages/persistence-redis/src/cache.ts#L16)*

---

### RedisIdempotencyAdapter

```typescript
class RedisIdempotencyAdapter
```

Redis idempotency adapter implementing IdempotencyProvider

*Source: [idempotency.ts:16](packages/persistence-redis/src/idempotency.ts#L16)*

---

### RedisAdapter

```typescript
class RedisAdapter
```

Redis persistence adapter

*Source: [index.ts:47](packages/persistence-redis/src/index.ts#L47)*

---

## Methods

### RedisCacheAdapter.stats

```typescript
RedisCacheAdapter.stats(): Promise<CacheStats>
```

Get cache statistics (requires Redis INFO command)

**Returns:** `Promise<CacheStats>`

*Source: [cache.ts:86](packages/persistence-redis/src/cache.ts#L86)*

---

