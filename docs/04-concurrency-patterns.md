# Concurrency Patterns

Patterns for concurrent communication and coordination in `go-go-scope`.

## Table of Contents

- [Channels](#channels)
- [Broadcast Channels](#broadcast-channels)
- [Select](#select)

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

## Next Steps

- **[Resilience Patterns](./05-resilience-patterns.md)** - Circuit breakers, retry, and fault tolerance
- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
