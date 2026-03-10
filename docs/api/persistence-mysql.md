# persistence-mysql API Reference

> Auto-generated documentation for persistence-mysql

## Table of Contents

- [Classes](#Classes)
  - [MySQLCacheAdapter](#mysqlcacheadapter)
  - [MySQLIdempotencyAdapter](#mysqlidempotencyadapter)
  - [MySQLAdapter](#mysqladapter)
- [Methods](#Methods)
  - [MySQLCacheAdapter.initialize](#mysqlcacheadapter-initialize)
  - [MySQLCacheAdapter.stats](#mysqlcacheadapter-stats)
  - [MySQLCacheAdapter.prune](#mysqlcacheadapter-prune)

## Classes

### MySQLCacheAdapter

```typescript
class MySQLCacheAdapter
```

MySQL cache adapter implementing CacheProvider

*Source: [cache.ts:18](packages/persistence-mysql/src/cache.ts#L18)*

---

### MySQLIdempotencyAdapter

```typescript
class MySQLIdempotencyAdapter
```

MySQL idempotency adapter implementing IdempotencyProvider

*Source: [idempotency.ts:16](packages/persistence-mysql/src/idempotency.ts#L16)*

---

### MySQLAdapter

```typescript
class MySQLAdapter
```

MySQL persistence adapter

*Source: [index.ts:46](packages/persistence-mysql/src/index.ts#L46)*

---

## Methods

### MySQLCacheAdapter.initialize

```typescript
MySQLCacheAdapter.initialize(): Promise<void>
```

Initialize the cache table

**Returns:** `Promise<void>`

*Source: [cache.ts:36](packages/persistence-mysql/src/cache.ts#L36)*

---

### MySQLCacheAdapter.stats

```typescript
MySQLCacheAdapter.stats(): Promise<CacheStats>
```

Get cache statistics

**Returns:** `Promise<CacheStats>`

*Source: [cache.ts:156](packages/persistence-mysql/src/cache.ts#L156)*

---

### MySQLCacheAdapter.prune

```typescript
MySQLCacheAdapter.prune(): Promise<number>
```

Clear expired entries

**Returns:** `Promise<number>`

*Source: [cache.ts:179](packages/persistence-mysql/src/cache.ts#L179)*

---

