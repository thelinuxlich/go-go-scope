# Performance Guide for go-go-scope

This document describes the performance characteristics of go-go-scope and provides guidance on optimizing your applications.

## Overview

go-go-scope is designed with performance in mind, providing structured concurrency primitives with minimal overhead. The library includes several optimizations to reduce memory allocations and improve execution speed.

## Benchmarks

Run the benchmark suite:

```bash
npm run build
node benchmarks/performance.mjs
```

### Current Benchmark Results (Node.js 20+)

| Operation | Ops/sec | Overhead vs Native |
|-----------|---------|-------------------|
| Task creation | ~50,000 | ~2-3x Promise |
| Channel send/receive | ~100,000 | N/A |
| Parallel (100 items) | ~500 | ~1.5x Promise.all |
| Race (5 items) | ~10,000 | ~1.2x Promise.race |

## Performance Optimizations

### 1. Task Optimizations

#### Lazy AbortController Creation
The `Task` class creates `AbortController` instances lazily - only when the signal is actually accessed:

```typescript
await using s = scope();
const task = s.task(() => fetch('/api/data')); // No AbortController created yet
await task; // Still no AbortController if signal not used
```

#### Object Pooling
Tasks use internal object pooling to reduce GC pressure:

```typescript
import { getTaskPoolMetrics, resetTaskPoolMetrics } from 'go-go-scope';

// Check pool efficiency
const metrics = getTaskPoolMetrics();
console.log(`Pool hits: ${metrics.hits}, misses: ${metrics.misses}`);
```

#### Optimized Promise Chains
Task uses a single `.then()` handler with success/error callbacks instead of `.finally()` to minimize promise chain overhead.

### 2. Channel Optimizations

#### Ring Buffer Implementation
Channels use a ring buffer for O(1) enqueue/dequeue operations:

```typescript
// Fast O(1) operations
await ch.send(value);  // Amortized O(1)
await ch.receive();    // O(1)
```

#### Batched Notifications
Channel notifications are batched using `queueMicrotask` to reduce event loop pressure:

```typescript
// Multiple rapid sends batch their notifications
for (let i = 0; i < 100; i++) {
  await ch.send(i); // Notifications batched
}
```

#### Fast Path for Common Cases
Channels have optimized fast paths:
- Direct receiver handoff when receiver is waiting
- Immediate buffer storage when space available
- Avoid promise creation for synchronous cases

### 3. Scope Optimizations

#### Lazy Collection Initialization
Scopes only initialize internal collections when needed:

```typescript
// These scopes have minimal overhead
await using s1 = scope();                    // No disposables array created
await using s2 = scope({ timeout: 5000 });   // No child scope tracking

// Collections created on demand
s2.task(() => fetch('/api'));                // Now disposables created
```

#### Set for Active Task Tracking
Active tasks are tracked in a `Set` for O(1) add/delete/lookup:

```typescript
// Fast task tracking
s.task(() => work());  // O(1) add
// Task completion       // O(1) delete
```

### 4. Memory Optimizations

#### WeakRef Usage
The library uses `WeakRef` where appropriate to avoid preventing garbage collection:

```typescript
// Internal caches use WeakRef to allow GC
private cache = new Map<string, WeakRef<object>>();
```

#### Explicit Cleanup
Resources are explicitly cleaned up to help the GC:

```typescript
// Buffer cleared to help GC
buffer.length = 0;
// References nulled
this.promise = undefined;
```

## Performance Tips

### 1. Use Appropriate Buffer Sizes

Choose channel buffer sizes based on your workload:

```typescript
// Small buffer for backpressure
const ch = s.channel<number>(10);

// Large buffer for batching
const batchCh = s.channel<number>(1000);

// Unbuffered for synchronization
const syncCh = s.channel<number>(0);
```

### 2. Batch Operations

Batch operations to reduce overhead:

```typescript
// Better: Batch sends
await using s = scope();
const ch = s.channel<number>(100);

s.task(async () => {
  const batch: number[] = [];
  for (const item of items) {
    batch.push(item);
    if (batch.length >= 10) {
      for (const x of batch) await ch.send(x);
      batch.length = 0;
    }
  }
});
```

### 3. Use Concurrency Limits

Limit concurrency to prevent resource exhaustion:

```typescript
// Scope-level concurrency limit
await using s = scope({ concurrency: 10 });

// Or task-level
await s.parallel(factories, { concurrency: 5 });
```

### 4. Avoid Unnecessary Signal Access

Don't access the signal unless you need it:

```typescript
// Good: Signal only accessed when needed
s.task(() => fetch('/api'));

// Less optimal: Forces AbortController creation
s.task(({ signal }) => {
  return fetch('/api', { signal });
});
```

### 5. Use Lazy Services

Services are created on first access:

```typescript
await using s = scope()
  .provide('db', () => createExpensiveConnection()) // Created lazily
  .provide('cache', () => createCache());

// Only use what you need
const db = s.use('db'); // Connection created now
// cache never created if not used
```

### 6. Profile Your Code

Use the built-in profiler:

```typescript
await using s = scope({ profiler: true });

// Run your tasks
await s.task(() => work());

// Get report
const report = s.getProfileReport();
console.log(report);
```

## Memory Management

### Memory Leak Prevention

1. **Always dispose scopes**:
```typescript
// Good: Automatic disposal
await using s = scope();

// Good: Manual disposal
const s = scope();
try {
  await work(s);
} finally {
  await s[Symbol.asyncDispose]();
}
```

2. **Clean up resources in tasks**:
```typescript
s.task(async ({ signal }) => {
  const conn = await connect();
  try {
    return await conn.query('SELECT 1');
  } finally {
    await conn.close();
  }
});
```

3. **Use the memory tracker**:
```typescript
import { MemoryTracker } from 'go-go-scope';

const tracker = new MemoryTracker();

// Take snapshots
for (let i = 0; i < 100; i++) {
  await work();
  tracker.snapshot();
}

// Check for leaks
if (tracker.checkForLeaks(10)) {
  console.warn('Potential memory leak detected!');
}
```

### Garbage Collection Hints

The library provides GC hints in debug mode:

```bash
DEBUG=go-go-scope:* node app.js
```

## Performance Monitoring

### Real-time Monitoring

```typescript
import { performanceMonitor } from 'go-go-scope';

await using s = scope({ metrics: true });
const monitor = performanceMonitor(s, {
  sampleInterval: 1000,  // Sample every second
  maxSnapshots: 60,      // Keep last 60 snapshots
  trackMemory: true,     // Track memory usage
});

// Get current metrics
const metrics = monitor.getMetrics();
console.log(`Tasks/sec: ${metrics.tasksPerSecond}`);
console.log(`Avg duration: ${metrics.averageTaskDuration}ms`);

// Get trends
const trends = monitor.getTrends();
console.log(`Task rate: ${trends.taskRateTrend}`);
console.log(`Duration: ${trends.durationTrend}`);
```

### Benchmarking Utilities

```typescript
import { benchmark } from 'go-go-scope';

const result = await benchmark(
  'My operation',
  async () => {
    await myOperation();
  },
  {
    warmup: 100,
    iterations: 1000,
  }
);

console.log(`${result.name}: ${result.opsPerSecond.toFixed(0)} ops/sec`);
```

## Comparison with Native

### When to Use go-go-scope vs Native

| Use Case | Recommendation |
|----------|---------------|
| Simple one-off promises | Native Promise |
| Concurrent operations with cancellation | go-go-scope |
| Producer/consumer patterns | go-go-scope Channel |
| Resource management | go-go-scope |
| Complex error handling | go-go-scope |
| High-frequency operations | Native (or optimize with go-go-scope) |

### Overhead Analysis

The overhead of go-go-scope comes from:

1. **Task creation**: ~2-3x native Promise (due to lazy AbortController and disposal tracking)
2. **Scope management**: Minimal for simple scopes, increases with features used
3. **Channels**: Comparable to native async generators
4. **Parallel execution**: ~1.5x Promise.all with proper concurrency limits

## Optimization Checklist

- [ ] Use appropriate channel buffer sizes
- [ ] Enable metrics only when needed
- [ ] Use lazy service initialization
- [ ] Batch operations where possible
- [ ] Set appropriate concurrency limits
- [ ] Avoid unnecessary signal access
- [ ] Profile hot paths
- [ ] Monitor memory usage in production
- [ ] Use the benchmark suite to measure changes

## Further Reading

- [Core Concepts](./docs/02-concepts.md)
- [API Reference](./docs/03-api-reference.md)
- [Testing Guide](./docs/08-testing.md)

## Reporting Performance Issues

If you encounter performance issues:

1. Run the benchmark suite to establish baseline
2. Profile your specific use case
3. Check for memory leaks using the MemoryTracker
4. File an issue with:
   - Benchmark results
   - Node.js version
   - Sample code reproducing the issue
