# Performance Optimizations

This guide covers performance optimizations available in `go-go-scope` for high-throughput applications.

## Table of Contents

- [Overview](#overview)
- [Ring Buffer](#ring-buffer)
- [Lazy Initialization](#lazy-initialization)
- [Object Pooling](#object-pooling)
- [Monitoring & Profiling](#monitoring--profiling)
- [Best Practices](#best-practices)

---

## Overview

`go-go-scope` includes several performance optimizations for production workloads:

| Feature | Benefit | Use Case | Performance Gain |
|---------|---------|----------|------------------|
| **Ring Buffer** | O(1) queue operations | High-throughput channels | **~3.5x faster** than Array.shift() |
| **Lazy Initialization** | Reduced startup time | Cold starts, serverless | **~15x faster** when not used |
| **Object Pooling** | Reduced GC pressure | Frequent task spawning | Reduces allocations |
| **Streaming** | Constant memory usage | Large dataset processing | O(1) memory |

### Benchmark Results

Latest benchmark results (v2.1.0) showing optimization gains:

```
┌─────────────────────────────────────────────────────────────────┐
│ Ring Buffer vs Array Buffer (1000 items)                        │
├─────────────────────────────────────────────────────────────────┤
│ RingBuffer push/shift                           101,846 ops/sec │
│ ArrayBuffer push/shift                           29,321 ops/sec │
│                                                                 │
│ 📈 RingBuffer is 247% faster for queue operations               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Lazy Initialization Impact                                      │
├─────────────────────────────────────────────────────────────────┤
│ Eager initialization                            151,631 ops/sec │
│ Lazy initialization (not accessed)            2,267,224 ops/sec │
│                                                                 │
│ 📈 Lazy init is 1,395% faster when resources not used           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ring Buffer

> **Internal Implementation**: RingBuffer is used internally by channels and is not exported for public use.

A high-performance, lock-free ring buffer implementation used internally by channels for O(1) queue operations.

### Performance

The ring buffer provides **O(1)** operations for both `push` and `shift`, compared to **O(n)** for `Array.shift()`:

| Operation | Array | RingBuffer | Improvement |
|-----------|-------|------------|-------------|
| `push()` | O(1) | O(1) | Same |
| `shift()` | O(n) | O(1) | **~3.5x faster** |
| Memory | Variable | Fixed | Predictable |

### Usage via Channels

Configure channels to use ring buffer for better performance:

```typescript
await using s = scope()

// Channel backed by ring buffer
const ch = s.channel<number>({
  capacity: 1000,
  bufferType: 'ring'  // Use ring buffer instead of array
})

// High-throughput producer
s.task(async () => {
  for (let i = 0; i < 1000000; i++) {
    await ch.send(i)  // O(1) operation
  }
  ch.close()
})

// Consumer
for await (const item of ch) {
  await process(item)
}
```

### When to Use Ring Buffer

```typescript
// ✅ Good for: High-throughput, fixed capacity
const metrics = s.channel<number>({
  capacity: 10000,
  bufferType: 'ring',
  backpressure: 'drop-oldest'  // Drop old metrics when full
})

// ❌ Not ideal for: Variable capacity, frequent resizing
const dynamicQueue = s.channel<string>()  // Default array buffer
```

---

## Lazy Initialization

Defer expensive resource creation until first use.

### Performance Impact

Lazy initialization provides significant performance benefits when resources are defined but not used:

| Scenario | Eager | Lazy | Improvement |
|----------|-------|------|-------------|
| Resource defined but not used | Full cost | Near zero | **~15x faster** |
| First access | Immediate | Deferred | Startup time |
| Subsequent access | Same | Same | No difference |

### Lazy Service Provider

```typescript
await using s = scope()

// Service is created only when first used
s.provide('database', async () => {
  console.log('Creating database connection...')
  const conn = await createExpensiveConnection()
  return conn
}, async (conn) => {
  await conn.close()
})

// Database connection not created yet

// First use triggers initialization
const [err, result] = await s.task(async ({ services }) => {
  return services.database.query('SELECT 1')  // Connection created here
})

// Subsequent uses reuse the same connection
const [err2, result2] = await s.task(async ({ services }) => {
  return services.database.query('SELECT 2')  // Reuses existing connection
})
```

### Lazy Persistence Adapter

```typescript
import { RedisAdapter } from '@go-go-scope/persistence-redis'

// Adapter created immediately but connects lazily
const adapter = new RedisAdapter(redis, { lazyConnect: true })

await using s = scope({
  persistence: { cache: adapter }
  // Connection not established yet
})

// First cache operation triggers connection
await s.persistence.cache.get('key')  // Connects here
```

### Lazy Task Initialization

```typescript
// Task function is prepared but not executed
const heavyTask = s.task(async () => {
  // Expensive setup only runs when awaited
  const connection = await createConnection()
  const data = await connection.fetchData()
  return data
})

// ... do other work ...

// Only now does the work begin
const [err, result] = await heavyTask
```

---

## Object Pooling

Reuse objects to reduce garbage collection pressure.

### Task Result Pooling

```typescript
import { scope } from 'go-go-scope'

// Enable result pooling for high-frequency tasks
await using s = scope({
  taskPooling: { enabled: true, maxSize: 1000 }
})

// Results are pooled and reused
for (let i = 0; i < 100000; i++) {
  const [err, result] = await s.task(() => processItem(i))
  // Result objects are pooled instead of allocated
}
```

### Task Pool Metrics

Monitor task pool performance:

```typescript
import { getTaskPoolMetrics, resetTaskPoolMetrics } from 'go-go-scope'

// Get current pool statistics
const metrics = getTaskPoolMetrics()
console.log(metrics)
// { hits: 950, misses: 50, size: 100 }

// Reset metrics for testing
resetTaskPoolMetrics()
```

---

## Monitoring & Profiling

Built-in tools for performance analysis.

### Scope Profiling

```typescript
await using s = scope({ 
  profiling: true  // Enable profiling
})

// Run your workload
await s.parallel([
  () => task1(),
  () => task2(),
  () => task3(),
])

// Get performance report
const profile = s.getProfileReport()
console.log(profile)
// {
//   scopeLifetime: 1500,
//   tasksSpawned: 3,
//   tasksCompleted: 3,
//   averageTaskDuration: 450,
//   maxConcurrentTasks: 3,
//   resourceUsage: [...]
// }
```

### Task-Level Profiling

```typescript
const [err, result] = await s.task(
  async () => {
    // Your task code
    return await fetchData()
  },
  { 
    profile: true,  // Profile this specific task
    name: 'fetch-data'
  }
)

// Access task profile
const taskProfile = s.getTaskProfile('fetch-data')
console.log(taskProfile)
// {
//   name: 'fetch-data',
//   startTime: 1708704000000,
//   endTime: 1708704000500,
//   duration: 500,
//   stages: [
//     { name: 'init', duration: 10 },
//     { name: 'fetch', duration: 400 },
//     { name: 'parse', duration: 90 }
//   ]
// }
```

### Performance Metrics

```typescript
await using s = scope({ metrics: true })

// Run workload
for (let i = 0; i < 1000; i++) {
  await s.task(() => processItem(i))
}

// Get metrics
const metrics = s.metrics()
console.log({
  tasksSpawned: metrics.tasksSpawned,
  tasksCompleted: metrics.tasksCompleted,
  tasksFailed: metrics.tasksFailed,
  averageDuration: metrics.taskDurationAvg,
  p95Duration: metrics.taskDurationP95,
  maxConcurrent: metrics.maxConcurrencyReached
})
```

### Memory Monitoring

```typescript
import { monitorMemory } from 'go-go-scope'

await using s = scope()

// Monitor memory usage during scope lifetime
const memoryMonitor = monitorMemory(s, {
  interval: 5000,  // Check every 5 seconds
  threshold: 100 * 1024 * 1024,  // 100MB threshold
  onThreshold: (usage) => {
    console.warn('High memory usage:', usage.heapUsed)
  }
})

// Run your workload
await heavyWorkload(s)

// Get memory report
const report = memoryMonitor.getReport()
console.log(report)
// {
//   peakHeapUsed: 150000000,
//   peakHeapTotal: 200000000,
//   samples: [...]
// }
```

---

## Best Practices

### 1. Use Streaming for Large Datasets

```typescript
// ❌ Bad: Loads everything into memory
const [err, allData] = await s.task(() => fetchAllData())

// ✅ Good: Streams data with constant memory
await using stream = s.stream(fetchDataSource())
await stream
  .map(processItem)
  .forEach(saveItem)
```

### 2. Batch Operations

```typescript
// ❌ Bad: Individual operations
for (const item of items) {
  await s.task(() => saveToDatabase(item))
}

// ✅ Good: Batched operations
await s.stream(items)
  .grouped(100)  // Process in batches of 100
  .mapAsync(async batch => {
    await db.insert(batch)  // Single batch insert
  }, { concurrency: 5 })
  .drain()
```

### 3. Reuse Scopes for Related Work

```typescript
// ❌ Bad: Creating scopes per operation
for (const item of items) {
  await using s = scope()  // Overhead per item
  await s.task(() => process(item))
}

// ✅ Good: Reuse scope for batch
await using s = scope()
await s.parallel(
  items.map(item => () => process(item)),
  { concurrency: 10 }
)
```

### 4. Configure Appropriate Buffer Sizes

```typescript
// ❌ Bad: Unbounded buffers
const ch = s.channel<number>()  // Default capacity may be too small

// ✅ Good: Size based on workload
const ch = s.channel<number>({
  capacity: estimatedThroughput * 2,  // 2x expected throughput
  backpressure: 'drop-oldest'  // Handle overflow gracefully
})
```

### 5. Use Lazy Loading for Optional Features

```typescript
// ❌ Bad: Always initialize expensive features
await using s = scope({
  tracer,  // Always created
  metrics: true,  // Always collected
  deadlockDetector: { threshold: 30000 }  // Always running
})

// ✅ Good: Conditional initialization
await using s = scope({
  tracer: isTracingEnabled() ? tracer : undefined,
  metrics: isProduction(),
  deadlockDetector: isDevelopment() ? { threshold: 30000 } : undefined
})
```

### 6. Clean Up Resources Promptly

```typescript
// ❌ Bad: Resources held longer than needed
await using s = scope()
const data = await fetchLargeDataset()
// Process takes a while, data held in memory
await slowProcess(data)

// ✅ Good: Process and release
await using s = scope()
await s.stream(fetchDataSource())
  .map(extractNeededFields)  // Only keep what you need
  .forEach(async item => {
    await process(item)
    // item can be garbage collected
  })
```

### 7. Profile Before Optimizing

```typescript
// Always measure first
await using s = scope({ profiling: true })

// Run representative workload
await runTypicalWorkload(s)

// Analyze bottlenecks
const profile = s.getProfileReport()
console.log('Bottlenecks:', profile.slowestTasks)

// Optimize specific areas
```

---

## Benchmarking

Run the built-in benchmarks to compare performance:

```bash
# Run all benchmarks
npm run benchmark

# Run specific benchmark
npm run benchmark -- --grep "channel"

# Compare with native Promise
npm run benchmark -- --compare-native
```

Example benchmark output:

```
Channel throughput (ring buffer):
  go-go-scope: 1,500,000 ops/sec
  Native Promise: 800,000 ops/sec
  
Task spawning overhead:
  go-go-scope: 0.02ms per task
  Native Promise: 0.015ms per task
  
Memory usage (1000 tasks):
  go-go-scope: 2.5MB
  Native Promise: 3.2MB
```
