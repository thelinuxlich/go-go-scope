# persistence-sqlite API Reference

> Auto-generated documentation for persistence-sqlite

## Table of Contents

- [Classs](#Classs)
  - [SQLiteCacheAdapter](#sqlitecacheadapter)
  - [SQLiteIdempotencyAdapter](#sqliteidempotencyadapter)
  - [SQLiteAdapter](#sqliteadapter)
- [Interfaces](#Interfaces)
  - [Database](#database)
- [Methods](#Methods)
  - [SQLiteCacheAdapter.initialize](#sqlitecacheadapter-initialize)
  - [SQLiteCacheAdapter.stats](#sqlitecacheadapter-stats)
  - [SQLiteCacheAdapter.prune](#sqlitecacheadapter-prune)

## Classs

### SQLiteCacheAdapter

```typescript
class SQLiteCacheAdapter
```

SQLite cache adapter implementing CacheProvider

*Source: [cache.ts:18](packages/persistence-sqlite/src/cache.ts#L18)*

---

### SQLiteIdempotencyAdapter

```typescript
class SQLiteIdempotencyAdapter
```

SQLite idempotency adapter implementing IdempotencyProvider

*Source: [idempotency.ts:16](packages/persistence-sqlite/src/idempotency.ts#L16)*

---

### SQLiteAdapter

```typescript
class SQLiteAdapter
```

SQLite persistence adapter

*Source: [index.ts:65](packages/persistence-sqlite/src/index.ts#L65)*

---

## Interfaces

### Database

```typescript
interface Database
```

sqlite3 Database interface

*Source: [index.ts:43](packages/persistence-sqlite/src/index.ts#L43)*

---

## Methods

### SQLiteCacheAdapter.initialize

```typescript
SQLiteCacheAdapter.initialize(): Promise<void>
```

Initialize the cache table

**Returns:** `Promise<void>`

*Source: [cache.ts:36](packages/persistence-sqlite/src/cache.ts#L36)*

---

### SQLiteCacheAdapter.stats

```typescript
SQLiteCacheAdapter.stats(): Promise<CacheStats>
```

Get cache statistics

**Returns:** `Promise<CacheStats>`

*Source: [cache.ts:217](packages/persistence-sqlite/src/cache.ts#L217)*

---

### SQLiteCacheAdapter.prune

```typescript
SQLiteCacheAdapter.prune(): Promise<number>
```

Clear expired entries

**Returns:** `Promise<number>`

*Source: [cache.ts:246](packages/persistence-sqlite/src/cache.ts#L246)*

---

