# Concurrency Patterns

Patterns for concurrent communication and coordination in `go-go-scope`.

## Table of Contents

- [Channels](#channels)
- [Backpressure Strategies](#backpressure-strategies)
- [Priority Channels](#priority-channels)
- [Channel Transformations](#channel-transformations)
- [Broadcast Channels](#broadcast-channels)
- [Select](#select)
- [Worker Threads](#worker-threads-v240)

---

## Channels

Channels provide Go-style concurrent communication between tasks with configurable backpressure strategies.

### Basic Usage

```typescript
await using s = scope()
const ch = s.channel<string>(100)  // Buffer capacity of 100

// Producer
s.task(async () => {
  for (const log of logs) {
    await ch.send(log)  // Blocks if buffer full (default strategy)
  }
  ch.close()
})

// Consumer with native async iteration
for await (const log of ch) {
  await processLog(log)
}
```

### Multiple Producers, Single Consumer

```typescript
await using s = scope()
const ch = s.channel<number>(10)

// Multiple producers
for (const server of servers) {
  s.task(async () => {
    for await (const metric of server.metrics()) {
      await ch.send(metric)
    }
  })
}

// Single consumer with batching
const batch: number[] = []
for await (const metric of ch) {
  batch.push(metric)
  if (batch.length >= 100) {
    await sendToAnalytics(batch)
    batch.length = 0
  }
}
```

### Channel Properties

```typescript
const ch = s.channel<string>(10)

console.log(ch.cap)       // 10 (capacity)
console.log(ch.size)      // 0 (current size)
console.log(ch.isClosed)  // false
console.log(ch.strategy)  // 'block' (default backpressure strategy)

ch.close()
console.log(ch.isClosed)  // true
```

---

## Backpressure Strategies

Channels support multiple backpressure strategies to handle the case when the buffer is full:

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `block` (default) | Wait until space available | Reliable delivery, bounded memory |
| `drop-oldest` | Remove oldest item to make room | Keep recent data (telemetry) |
| `drop-latest` | Drop the new item | Prioritize processing over ingestion |
| `error` | Throw `ChannelFullError` | Explicit backpressure handling |
| `sample` | Keep only last N values in time window | Time-based sampling |

### Block Strategy (Default)

The default behavior - waits until space is available in the buffer.

```typescript
await using s = scope()
const ch = s.channel<string>(10)  // or explicitly: { capacity: 10, backpressure: 'block' }

// This will block if buffer is full
await ch.send('message')
```

### Drop-Oldest Strategy

Removes the oldest item in the buffer to make room for new items. Useful for telemetry where you care about recent data.

```typescript
await using s = scope()
const metrics = s.channel<number>({
  capacity: 100,
  backpressure: 'drop-oldest',
  onDrop: (value) => console.log('Dropped old metric:', value)
})

// Rapidly send metrics - old ones are dropped if buffer fills
for (let i = 0; i < 1000; i++) {
  await metrics.send(getCpuUsage())  // Never blocks
}
```

### Drop-Latest Strategy

Drops the new item when the buffer is full. Use when processing is more important than receiving all data.

```typescript
await using s = scope()
const updates = s.channel<string>({
  capacity: 10,
  backpressure: 'drop-latest',
  onDrop: (value) => console.log('Dropped update:', value)
})

// Consumer is slow, so some updates will be dropped
s.task(async () => {
  for await (const update of updates) {
    await slowProcess(update)  // Takes time
  }
})

// Producer is fast
for (const update of allUpdates) {
  await updates.send(update)  // Drops if consumer can't keep up
}
```

### Error Strategy

Throws `ChannelFullError` when the buffer is full. Use when you need explicit backpressure handling.

```typescript
import { ChannelFullError } from 'go-go-scope'

await using s = scope()
const queue = s.channel<Task>({
  capacity: 100,
  backpressure: 'error'
})

async function enqueue(task: Task) {
  try {
    await queue.send(task)
  } catch (err) {
    if (err instanceof ChannelFullError) {
      // Handle backpressure - maybe save to disk or return 503
      await saveToRetryQueue(task)
      return 'queued-for-retry'
    }
    throw err
  }
}
```

### Sample Strategy

Time-based sampling - keeps only values within a sliding time window. Useful for high-frequency data where recency matters.

```typescript
await using s = scope()
const sensorData = s.channel<SensorReading>({
  capacity: 1000,
  backpressure: 'sample',
  sampleWindow: 1000,  // Keep only last 1 second of data
  onDrop: (reading) => console.log('Expired reading:', reading.timestamp)
})

// High-frequency sensor readings
setInterval(() => {
  sensorData.send({
    timestamp: Date.now(),
    value: readSensor()
  })
}, 10)  // 100 Hz

// Consumer gets only recent data
s.task(async () => {
  for await (const reading of sensorData) {
    // Always receives data from last 1000ms
    await updateDashboard(reading)
  }
})
```

---

## Priority Channels

Priority channels deliver items based on priority rather than FIFO order. They use a binary heap for efficient O(log n) insertions and extractions.

### Basic Usage

```typescript
await using s = scope()

// Create a priority channel with numeric priorities (lower = higher priority)
const pq = s.priorityChannel<{ value: Task; priority: number }>({
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority
})

// Send tasks with priorities
await pq.send({ value: task1, priority: 3 })
await pq.send({ value: task2, priority: 1 })  // Higher priority
await pq.send({ value: task3, priority: 2 })

// Receive in priority order: task2, task3, task1
const item1 = await pq.receive() // task2 (priority 1)
const item2 = await pq.receive() // task3 (priority 2)
const item3 = await pq.receive() // task1 (priority 3)
```

### Task Queue Example

Priority channels are perfect for task queues where some tasks are more urgent:

```typescript
await using s = scope()

// Priority queue: lower number = higher priority
const taskQueue = s.priorityChannel<Job>({
  capacity: 1000,
  comparator: (a, b) => a.priority - b.priority
})

// Producer - mix of priorities
s.task(async () => {
  // High priority jobs
  await taskQueue.send({ id: '1', data: 'critical', priority: 1 })
  await taskQueue.send({ id: '2', data: 'urgent', priority: 2 })
  
  // Low priority jobs
  await taskQueue.send({ id: '3', data: 'background', priority: 10 })
  await taskQueue.send({ id: '4', data: 'cleanup', priority: 10 })
})

// Worker processes by priority
s.task(async () => {
  for await (const job of taskQueue) {
    console.log(`Processing job ${job.id} with priority ${job.priority}`)
    await processJob(job)
  }
})
// Output order: job 1, job 2, job 3, job 4
```

### Non-Blocking Operations

Priority channels support non-blocking operations:

```typescript
await using s = scope()

const pq = s.priorityChannel<{ value: string; priority: number }>({
  capacity: 10,
  comparator: (a, b) => a.priority - b.priority
})

// Try to send without blocking
const sent = pq.trySend({ value: 'item', priority: 5 })
if (!sent) {
  console.log('Buffer full, item not sent')
}

// Send or drop (no blocking, calls onDrop if full)
pq.sendOrDrop({ value: 'item', priority: 5 })

// Try to receive without blocking
const item = pq.tryReceive()
if (item) {
  console.log('Got item:', item)
}

// Peek at highest priority item without removing
const next = pq.peek()
console.log('Next item:', next)
```

### With onDrop Callback

Handle items that can't be delivered due to capacity:

```typescript
await using s = scope()

const pq = s.priorityChannel<HighFreqData>({
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority,
  onDrop: (item) => {
    console.log('Dropped low priority item:', item.id)
    metrics.increment('priority_queue.dropped')
  }
})

// When buffer is full, sendOrDrop will call onDrop
pq.sendOrDrop({ id: '1', data: 'important', priority: 1 })
pq.sendOrDrop({ id: '2', data: 'less important', priority: 5 })
```

### Priority Channel Properties

```typescript
const pq = s.priorityChannel<Item>({
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority
})

console.log(pq.cap)       // 100 (capacity)
console.log(pq.size)      // 0 (current size)
console.log(pq.isEmpty)   // true
console.log(pq.isFull)    // false
console.log(pq.isClosed)  // false

pq.close()
console.log(pq.isClosed)  // true
```

### Comparison: Channel vs PriorityChannel

| Feature | Channel | PriorityChannel |
|---------|---------|-----------------|
| Order | FIFO | By priority (comparator) |
| Backpressure | Multiple strategies | Block or drop |
| Use case | Fair queueing | Urgent-first processing |
| Transformations | map, filter, take, reduce | Basic operations only |

---

## Channel Transformations

Channels support functional transformations that create new channels:

### Map

Transform each value using a mapping function:

```typescript
const numbers = s.channel<number>(10)
const doubled = numbers.map(x => x * 2)

await numbers.send(5)
console.log(await doubled.receive()) // 10
```

### Filter

Filter values based on a predicate:

```typescript
const numbers = s.channel<number>(10)
const evens = numbers.filter(x => x % 2 === 0)

await numbers.send(1)
await numbers.send(2)
console.log(await evens.receive()) // 2 (1 was filtered out)
```

### Take

Take only the first n values:

```typescript
const numbers = s.channel<number>(10)
const firstFive = numbers.take(5)

// Send 10 values
for (let i = 0; i < 10; i++) {
  await numbers.send(i)
}
numbers.close()

// Only first 5 are received
const values: number[] = []
for await (const v of firstFive) {
  values.push(v)
}
console.log(values) // [0, 1, 2, 3, 4]
```

### Reduce

Reduce all values to a single value:

```typescript
const numbers = s.channel<number>(10)

const sumPromise = numbers.reduce((acc, x) => acc + x, 0)

await numbers.send(1)
await numbers.send(2)
await numbers.send(3)
numbers.close()

const sum = await sumPromise // 6
```

---

## Broadcast Channels

Unlike regular channels where each message goes to one consumer, BroadcastChannels send each message to ALL active consumers (pub/sub pattern).

### Basic Usage

```typescript
await using s = scope()
const broadcast = s.broadcast<string>()

// Subscribe multiple consumers
s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 1:', msg)
  }
})

s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 2:', msg)
  }
})

// Publish messages (all consumers receive each message)
await broadcast.send('hello')
await broadcast.send('world')
broadcast.close()
```

### Use Cases

1. **Event broadcasting:**

```typescript
await using s = scope()
const events = s.broadcast<{ type: string; data: unknown }>()

// Multiple listeners
s.task(async () => {
  for await (const event of events.subscribe()) {
    if (event.type === 'user:login') {
      await updateAnalytics(event.data)
    }
  }
})

s.task(async () => {
  for await (const event of events.subscribe()) {
    await logEvent(event)
  }
})

// Emit events
await events.send({ type: 'user:login', data: { userId: 1 } })
```

2. **Cache invalidation:**

```typescript
const cacheUpdates = s.broadcast<string>()

// All cache instances listen for updates
for (const cache of caches) {
  s.task(async () => {
    for await (const key of cacheUpdates.subscribe()) {
      cache.invalidate(key)
    }
  })
}

// Broadcast invalidation
await cacheUpdates.send('user:1')
```

---

## Select

Wait on multiple channel operations, similar to Go's `select` statement.

### Basic Usage

```typescript
await using s = scope()
const ch1 = s.channel<string>()
const ch2 = s.channel<number>()

// Send to channels from other tasks
s.task(async () => {
  await new Promise(r => setTimeout(r, 100))
  await ch1.send("hello")
})

// Wait for first available value
const cases = new Map([
  [ch1, async (value: string) => ({ type: 'string' as const, value })],
  [ch2, async (value: number) => ({ type: 'number' as const, value })],
])

const [err, result] = await s.select(cases)
// result will be { type: 'string', value: 'hello' }
```

### With Timeout

```typescript
await using s = scope()
const dataCh = s.channel<Data>()

// Wait for data with timeout
const cases = new Map([
  [dataCh, async (data) => ({ type: 'data' as const, data })],
])

const [err, result] = await s.select(cases, { timeout: 5000 })
if (err?.message?.includes('timeout')) {
  console.log('Request timed out')
}
```

### Timeout Pattern

```typescript
await using s = scope()
const dataCh = s.channel<Data>()
const timeoutCh = s.channel<never>()

// Set up timeout
s.task(async () => {
  await new Promise(r => setTimeout(r, 5000))
  timeoutCh.close()
})

// Wait for data or timeout
const cases = new Map([
  [dataCh, async (data) => ({ type: 'data' as const, data })],
  [timeoutCh, async () => ({ type: 'timeout' as const })],
])

const [err, result] = await s.select(cases)
if (result?.type === 'timeout') {
  console.log('Request timed out')
}
```

---

## Worker Threads (v2.4.0+)

Execute CPU-intensive tasks in parallel using worker threads for true parallelism.

### When to Use Worker Threads

Worker threads are ideal for:
- **CPU-intensive calculations** (math, data processing, image manipulation)
- **Heavy computations** that block the event loop
- **Parallel processing** of large datasets

Worker threads are NOT for:
- I/O-bound operations (use regular async/await)
- Tasks requiring access to the main thread's scope or variables

### Using `parallel()` with Workers

The simplest way to use worker threads is through the `parallel()` function:

```typescript
import { parallel } from "go-go-scope";

// Process data using 4 worker threads
const results = await parallel(
  [
    () => processChunk(data1),  // These run in worker threads
    () => processChunk(data2),
    () => processChunk(data3),
    () => processChunk(data4),
  ],
  { workers: 4 }
);

// Results are Result tuples
for (const [err, result] of results) {
  if (err) console.error('Failed:', err);
  else console.log('Success:', result);
}
```

### Using `race()` with Workers

Race multiple CPU-intensive tasks and get the first result:

```typescript
import { race } from "go-go-scope";

// Race multiple hash computations - first to complete wins
const [err, winner] = await race([
  () => computeHash(data1),
  () => computeHash(data2),
  () => computeHash(data3),
], { 
  workers: { threads: 3 },           // Use 3 worker threads
  requireSuccess: true  // Only count successful results
});

if (err) console.error('All failed:', err);
else console.log('Winner:', winner);
```

**Use cases for racing with workers:**
- Try multiple algorithms, use the fastest result
- Query multiple data sources with same computation
- Brute-force search with different strategies
- Redundant computation for reliability

### Using WorkerPool Directly (Internal)

For workspace packages and internal use, you can use `WorkerPool` directly. This is primarily for library authors - most applications should use `parallel()`, `race()`, `scope.task()`, or `benchmark()` with worker options instead.

```typescript
import { WorkerPool } from "go-go-scope";  // @internal - workspace packages only

await using pool = new WorkerPool({
  size: 4,                    // Number of workers
  idleTimeout: 60000,         // Keep workers alive for 1 minute
});

// Single execution
const result = await pool.execute((n: number) => {
  // Heavy computation here
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.sqrt(i);
  }
  return sum;
}, 1000000);

// Batch execution
const results = await pool.executeBatch(
  [1000, 2000, 3000, 4000],
  (n: number) => {
    // This runs in a worker thread
    return n * n;  // CPU-intensive work here
  }
);
// Returns: [[undefined, 1000000], [undefined, 4000000], ...]
```

### Important Considerations

**Function Serialization:**
Functions passed to workers are serialized and executed in isolation. This means:

```typescript
// ❌ BAD: External reference won't work
const multiplier = 2;
await pool.execute((n) => n * multiplier, 5);  // Error: multiplier not defined

// ✅ GOOD: Self-contained function
await pool.execute((n) => n * 2, 5);  // Works!

// ✅ GOOD: IIFE to capture values
await pool.execute(((mult) => (n) => n * mult)(multiplier), 5);
```

**Async Functions:**
Worker threads can handle async functions, but they run to completion:

```typescript
const result = await pool.execute(async (url: string) => {
  // This works, but fetch runs in the worker thread
  const response = await fetch(url);
  return response.json();
}, "https://api.example.com/data");
```

**Error Handling:**
Errors in workers are propagated as standard Result tuples:

```typescript
const [err, result] = await pool.execute((n: number) => {
  if (n < 0) throw new Error("Negative number!");
  return Math.sqrt(n);
}, -1);

if (err) {
  console.log(err.message);  // "Negative number!"
}
```

### Performance Comparison

```typescript
import { parallel } from "go-go-scope";

// CPU-intensive task
const cpuTask = (n: number) => {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.sqrt(i);
  }
  return sum;
};

// Without workers (runs in main thread)
const start1 = Date.now();
await parallel([
  () => cpuTask(10000000),
  () => cpuTask(10000000),
]);
console.log(`Without workers: ${Date.now() - start1}ms`);

// With workers (parallel execution)
const start2 = Date.now();
await parallel([
  () => cpuTask(10000000),
  () => cpuTask(10000000),
], { workers: 2 });
console.log(`With workers: ${Date.now() - start2}ms`);
```

### Pool Statistics

Monitor worker pool health:

```typescript
const stats = pool.stats();
console.log(stats);
// {
//   total: 4,     // Total workers
//   busy: 2,      // Currently executing
//   idle: 2,      // Available for work
//   pending: 5    // Waiting to execute
// }
```

### Using `scope.task()` with Workers

For individual CPU-intensive tasks, use the `worker` option on `scope.task()`:

```typescript
await using s = scope();

// This runs in a worker thread
const [err, result] = await s.task(
  () => {
    // Heavy computation - Fibonacci
    function fib(n: number): number {
      return n < 2 ? n : fib(n - 1) + fib(n - 2);
    }
    return fib(40);  // Computationally expensive
  },
  { worker: true }
);

if (err) console.error('Failed:', err);
else console.log('Fibonacci:', result);  // 102334155
```

The scope automatically manages the worker pool - it's created on first use and cleaned up when the scope disposes.

#### Configuring the Worker Pool Size

By default, each scope's worker pool has a size of `os.cpus().length - 1`. You can configure this:

```typescript
// Create scope with custom worker pool
await using s = scope({
  workerPool: {
    size: 4,           // Max 4 concurrent workers
    idleTimeout: 30000 // Workers terminate after 30s idle
  }
});

// These tasks share the same pool
for (let i = 0; i < 100; i++) {
  s.task(() => processItem(i), { worker: true });
}
// Only 4 tasks run concurrently, others queue automatically
```

**How it works with many tasks:**
- Pool size = 4 (configurable, default: CPU count - 1)
- First 4 tasks start immediately in parallel
- Tasks 5-100 queue in memory
- As workers finish, they pick up queued tasks (FIFO)
- All 100 tasks complete with max 4 concurrent workers

This provides automatic backpressure - memory usage stays low because only 4 tasks run at a time, even with 100 queued.

### Scheduler with Workers

Run scheduled jobs in worker threads to avoid blocking the main event loop:

```typescript
import { Scheduler } from "@go-go-scope/scheduler";

const scheduler = new Scheduler({
  persistence: redisAdapter,
});

// Define a CPU-intensive job
scheduler.createSchedule("analyze-data", {
  cron: "0 */6 * * *",  // Every 6 hours
});

// Run handler in worker thread
scheduler.onSchedule("analyze-data", async (job) => {
  // Heavy data analysis that could take minutes
  const results = await performMLAnalysis(job.data);
  await storeResults(results);
}, { worker: true });  // ← Runs in worker thread

scheduler.start();
```

### Practical Example: Image Processing Pipeline

```typescript
await using s = scope();

// Process images in parallel using workers
const images = await fs.readdir('./input');

const [err, processed] = await s.parallel(
  images.map(img => () => {
    // This runs in a worker thread
    const imageData = fs.readFileSync(`./input/${img}`);
    const resized = resizeImage(imageData, { width: 800, height: 600 });
    const compressed = compressImage(resized, { quality: 0.85 });
    fs.writeFileSync(`./output/${img}`, compressed);
    return { name: img, size: compressed.length };
  }),
  { 
    workers: { threads: 4 },              // Use 4 worker threads
    idleTimeout: 30000 // Keep idle for 30s
  }
);

console.log(`Processed ${processed?.length} images`);
```

---

## Next Steps

- **[Resilience Patterns](./05-resilience-patterns.md)** - Circuit breakers, retry, and fault tolerance
- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
