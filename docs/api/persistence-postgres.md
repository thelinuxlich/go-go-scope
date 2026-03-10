# persistence-postgres API Reference

> Auto-generated documentation for persistence-postgres

## Table of Contents

- [Classs](#Classs)
  - [PostgresCacheAdapter](#postgrescacheadapter)
  - [PostgresIdempotencyAdapter](#postgresidempotencyadapter)
  - [PostgresAdapter](#postgresadapter)
- [Methods](#Methods)
  - [PostgresCacheAdapter.initialize](#postgrescacheadapter-initialize)
  - [PostgresCacheAdapter.stats](#postgrescacheadapter-stats)
  - [PostgresCacheAdapter.prune](#postgrescacheadapter-prune)

## Classs

### PostgresCacheAdapter

```typescript
class PostgresCacheAdapter
```

PostgreSQL cache adapter implementing CacheProvider

*Source: [cache.ts:18](packages/persistence-postgres/src/cache.ts#L18)*

---

### PostgresIdempotencyAdapter

```typescript
class PostgresIdempotencyAdapter
```

PostgreSQL idempotency adapter implementing IdempotencyProvider

*Source: [idempotency.ts:16](packages/persistence-postgres/src/idempotency.ts#L16)*

---

### PostgresAdapter

```typescript
class PostgresAdapter
```

PostgreSQL persistence adapter

*Source: [index.ts:46](packages/persistence-postgres/src/index.ts#L46)*

---

## Methods

### PostgresCacheAdapter.initialize

```typescript
PostgresCacheAdapter.initialize(): Promise<void>
```

Initialize the cache table

**Returns:** `Promise<void>`

*Source: [cache.ts:36](packages/persistence-postgres/src/cache.ts#L36)*

---

### PostgresCacheAdapter.stats

```typescript
PostgresCacheAdapter.stats(): Promise<CacheStats>
```

Get cache statistics

**Returns:** `Promise<CacheStats>`

*Source: [cache.ts:161](packages/persistence-postgres/src/cache.ts#L161)*

---

### PostgresCacheAdapter.prune

```typescript
PostgresCacheAdapter.prune(): Promise<number>
```

Clear expired entries

**Returns:** `Promise<number>`

*Source: [cache.ts:182](packages/persistence-postgres/src/cache.ts#L182)*

---

