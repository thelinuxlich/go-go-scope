# Advanced Patterns

Advanced patterns for building complex concurrent applications.

## Table of Contents

- [Resource Pool](#resource-pool)
- [Parent-Child Scopes](#parent-child-scopes)
- [Error Aggregation](#error-aggregation)
- [Polling](#polling)
- [Stream Processing](#stream-processing)
- [Lifecycle Hooks](#lifecycle-hooks)

---

## Resource Pool

Manage a pool of reusable resources with automatic lifecycle management.

### Basic Usage

```typescript
await using s = scope()

const pool = s.pool({
  create: async () => {
    // Create a database connection
    return await createDatabaseConnection()
  },
  destroy: async (conn) => {
    // Clean up the connection
    await conn.close()
  },
  min: 2,           // Minimum pool size
  max: 10,          // Maximum pool size
  acquireTimeout: 5000  // Max time to wait for a resource
})

// Acquire a resource
const conn = await pool.acquire()
try {
  await conn.query('SELECT 1')
} finally {
  await pool.release(conn)
}
```

### Using execute() for Automatic Release

```typescript
// execute() automatically releases the resource
await pool.execute(async (conn) => {
  const result = await conn.query('SELECT 1')
  return result.rows
})
```

### Pool Statistics

```typescript
const stats = pool.stats
console.log(stats.total)      // Total resources
console.log(stats.available)  // Available resources
console.log(stats.inUse)      // Resources currently in use
console.log(stats.waiting)    // Tasks waiting for a resource
```

### Use Cases

1. **Database connection pooling:**

```typescript
await using s = scope()

const dbPool = s.pool({
  create: () => createConnection(),
  destroy: (conn) => conn.end(),
  min: 5,
  max: 20,
  acquireTimeout: 10000
})

// Use connections
const users = await dbPool.execute(async (conn) => {
  const result = await conn.query('SELECT * FROM users')
  return result.rows
})
```

2. **Worker pool:**

```typescript
const workerPool = s.pool({
  create: () => new Worker('./worker.js'),
  destroy: (worker) => worker.terminate(),
  max: 4
})

await workerPool.execute(async (worker) => {
  worker.postMessage({ task: 'heavy-computation' })
  return await waitForMessage(worker)
})
```

---

## Parent-Child Scopes

Scopes can inherit from parents for cancellation propagation and service sharing.

### Basic Parent-Child

```typescript
await using parent = scope()

// Child inherits parent's signal
await using child = scope({ parent })

// If parent is cancelled, child is too
```

### Service Inheritance

```typescript
await using parent = scope()
  .provide('db', () => openDatabase(), (db) => db.close())

// Child can use parent's services
await using child = scope({ parent })

const [err, result] = await child.task(({ services }) => {
  return services.db.query('SELECT 1')
})
```

### Adding Services in Child

```typescript
await using parent = scope()
  .provide('db', () => openDatabase())

// Child inherits 'db' and adds 'cache'
await using child = scope({ parent })
  .provide('cache', () => createCache())

// Child can access both
child.use('db')     // ✓ From parent
child.use('cache')  // ✓ From child

// Parent can only access 'db'
parent.use('db')    // ✓ Works
parent.use('cache') // ✗ undefined
```

### Selective Inheritance

Use `signal` option if you only want cancellation, not services:

```typescript
await using parent = scope()
  .provide('db', () => openDatabase())

// Child only inherits signal, not services
await using child = scope({ signal: parent.signal })

// Must provide own db
child.provide('db', () => openAnotherDatabase())
```

### Common Patterns

1. **Nested operations with limits:**

```typescript
await using outer = scope()
  .provide('db', () => openDatabase())

// Fetch users
const [err, user] = await outer.task(() => fetchUser(id))

// Process with limited concurrency
await using inner = scope({ parent: outer, concurrency: 3 })

await inner.parallel(
  urls.map(url => ({ services }) => 
    services.db.query(url)
  )
)
```

2. **Fire-and-forget background tasks:**

```typescript
await using main = scope()

// Detached child with own timeout
await using background = scope({ timeout: 60000 })

// Start background work
background.task(() => processLargeDataset())
// Don't await - it runs independently
```

---

## Error Aggregation

Collect all errors from parallel execution, not just individual failures.

### Basic Usage

```typescript
await using s = scope()

const result = await s.parallelAggregate([
  () => fetchUser(1),    // succeeds
  () => fetchUser(2),    // succeeds
  () => fetchUser(999),  // fails (not found)
  () => fetchUser(-1),   // fails (invalid id)
])

console.log(result.completed)
// [{ index: 0, value: user1 }, { index: 1, value: user2 }]

console.log(result.errors)
// [{ index: 2, error: NotFoundError }, { index: 3, error: ValidationError }]

console.log(result.allCompleted)  // false
```

### Processing Results

```typescript
const { completed, errors } = await s.parallelAggregate(
  urls.map(url => () => fetch(url))
)

// Process successful results
for (const { index, value } of completed) {
  console.log(`URL ${urls[index]} succeeded:`, value)
}

// Handle errors
for (const { index, error } of errors) {
  console.error(`URL ${urls[index]} failed:`, error)
}

// Check if all succeeded
if (errors.length === 0) {
  console.log('All URLs fetched successfully')
}
```

### Compared to parallel()

| Feature | `parallel()` | `parallelAggregate()` |
|---------|-------------|----------------------|
| Returns | `Result[]` | `{ completed, errors, allCompleted }` |
| Error handling | Per-task | All errors collected |
| Success access | `result[i][1]` | `result.completed.find(c => c.index === i)` |
| Use case | Simple parallelism | When you need all results/errors |

---

## Polling

Auto-refresh data at intervals with controllable polling.

### Basic Polling

```typescript
await using s = scope()

s.poll(
  ({ signal }) => fetchConfig({ signal }),
  (config) => updateUI(config),
  { interval: 30000 }  // Every 30 seconds
)

// Keep alive somehow, polling stops when scope exits
await new Promise(() => {})
```

### With Control

```typescript
await using s = scope()

const controller = s.poll(
  ({ signal }) => fetchStatus({ signal }),
  (status) => console.log(status),
  { interval: 5000, immediate: true }
)

// Check status
const status = controller.status()
console.log(status.running)        // true
console.log(status.pollCount)      // Number of polls
console.log(status.timeUntilNext)  // ms until next poll

// Stop when needed
controller.stop()

// Restart later
controller.start()
```

### Use Cases

1. **Health checks:**

```typescript
s.poll(
  ({ signal }) => checkHealth({ signal }),
  (healthy) => {
    if (!healthy) alert('Service down!')
  },
  { interval: 10000 }
)
```

2. **Syncing data:**

```typescript
s.poll(
  ({ signal }) => fetchUpdates({ signal }),
  (updates) => mergeIntoLocalState(updates),
  { interval: 60000 }
)
```

---

## Stream Processing

Process async iterables with automatic cancellation.

### Basic Streaming

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
  // Automatically stops when scope is cancelled
}
```

### With Timeout

```typescript
await using s = scope({ timeout: 30000 })

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
}
// Stream stops after 30 seconds
```

### Early Break

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  if (foundWhatWeNeed(chunk)) {
    break  // Iterator is properly cleaned up
  }
}
```

---

## Lifecycle Hooks

Execute code at key points in the scope lifecycle.

### Basic Usage

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name, index) => {
      console.log(`Starting task ${index}: ${name}`)
    },
    afterTask: (name, duration, error) => {
      if (error) {
        console.log(`Task ${name} failed after ${duration}ms: ${error}`)
      } else {
        console.log(`Task ${name} completed in ${duration}ms`)
      }
    },
    onCancel: (reason) => {
      console.log('Scope cancelled:', reason)
    },
    onDispose: (index, error) => {
      if (error) {
        console.log(`Resource ${index} disposal failed:`, error)
      } else {
        console.log(`Resource ${index} disposed`)
      }
    }
  }
})
```

### Use Cases

1. **Logging:**

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name) => logger.info(`Starting ${name}`),
    afterTask: (name, duration, error) => {
      if (error) {
        logger.error(`${name} failed:`, error)
      } else {
        logger.info(`${name} completed in ${duration}ms`)
      }
    }
  }
})
```

2. **Metrics collection:**

```typescript
const taskDurations: number[] = []

await using s = scope({
  hooks: {
    afterTask: (_name, duration, error) => {
      if (!error) taskDurations.push(duration)
    }
  }
})

// After scope exits...
const avg = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length
console.log(`Average task time: ${avg}ms`)
```

---

## Next Steps

- **[Comparisons](./10-comparisons.md)** - Compare with other approaches
- **[Integrations](./11-integrations.md)** - Third-party integrations
