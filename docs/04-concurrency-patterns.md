# Concurrency Patterns

Patterns for concurrent communication and coordination in `go-go-scope`.

## Table of Contents

- [Channels](#channels)
- [Broadcast Channels](#broadcast-channels)
- [Select](#select)

---

## Channels

Channels provide Go-style concurrent communication between tasks with backpressure.

### Basic Usage

```typescript
await using s = scope()
const ch = s.channel<string>(100)  // Buffer capacity of 100

// Producer
s.task(async () => {
  for (const log of logs) {
    await ch.send(log)  // Blocks if buffer full
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

ch.close()
console.log(ch.isClosed)  // true
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
