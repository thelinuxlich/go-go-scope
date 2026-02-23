# Stream API

The `Stream` class provides lazy, composable, and cancellable async iterable processing. It's designed for handling data flows, event streams, and reactive programming with automatic resource management.

> **Note**: The Stream API has been extracted to a separate package `@go-go-scope/stream`.

## Overview

```typescript
import { scope } from 'go-go-scope'
import { Stream } from '@go-go-scope/stream'

await using s = scope()

// Create a stream from any async iterable
const [err, results] = await new Stream(fetchData(), s)
  .filter(item => item.active)
  .map(item => item.name)
  .take(10)
  .toArray()
```

### Alternative: Using the Stream Plugin

If you prefer the `new Stream(, s)` method, you can use the stream plugin:

```typescript
import { scope } from 'go-go-scope'
import { streamPlugin } from '@go-go-scope/stream'

await using s = scope({
  plugins: [{ plugin: streamPlugin }]
})

// Now you can use s.stream()
const [err, results] = await s.stream(fetchData())
  .filter(item => item.active)
  .map(item => item.name)
  .take(10)
  .toArray()
```

## Why Streams?

- **Lazy evaluation**: Operations don't execute until you consume the stream
- **Memory efficient**: Process large datasets without loading everything into memory
- **Cancellable**: Automatically respects scope cancellation
- **Composable**: Chain operations like building blocks
- **Type-safe**: Full TypeScript support with Result tuples

## Creating Streams

### From Async Iterables

```typescript
async function* fetchUsers() {
  for (let page = 1; page <= 10; page++) {
    yield await fetch(`/api/users?page=${page}`)
  }
}

await using s = scope()
import { Stream } from '@go-go-scope/stream'
const users = new Stream(fetchUsers(), s)
```

### From Arrays

```typescript
import { Stream } from '@go-go-scope/stream'

const numbers = new Stream(async function* () {
  for (const n of [1, 2, 3, 4, 5]) yield n
}(), s)
```

### With Scope-based Cancellation

```typescript
import { Stream } from '@go-go-scope/stream'

await using s = scope()
const data = new Stream(fetchSource(), s)

// Automatically cancelled when scope disposes
```

## Core Operations

### Transformations

#### map
Transform each value:

```typescript
// Double each number
const [err, doubled] = await new Stream(numbers, s)
  .map(n => n * 2)
  .toArray() // [2, 4, 6, 8, 10]

// Extract properties
const [err, names] = await new Stream(users, s)
  .map(user => user.name)
  .toArray()
```

#### filterMap
Combine filter and map (more efficient than separate operations):

```typescript
// Get active user emails, skip inactive
const [err, emails] = await new Stream(users, s)
  .filterMap(user => 
    user.active ? user.email : null
  )
  .toArray()
```

#### flatMap
Flatten nested iterables:

```typescript
// Flatten paginated results
const [err, allItems] = await new Stream(pages, s)
  .flatMap(page => page.items)
  .toArray()
```

#### scan
Running fold - emits intermediate values:

```typescript
// Running totals
const [err, totals] = await new Stream(sales, s)
  .scan((sum, sale) => sum + sale.amount, 0)
  .toArray() // [100, 250, 400, ...]
```

### Slicing

Control how much data to process:

```typescript
// Pagination: skip 20, take 10
const page2 = new Stream(allItems, s)
  .drop(20)
  .take(10)

// Take while condition holds
const intro = new Stream(lines, s)
  .takeWhile(line => !line.startsWith('---'))

// Take until (inclusive) - good for delimited data
const section = new Stream(lines, s)
  .takeUntil(line => line === 'END')

// Drop header comments
const data = new Stream(lines, s)
  .dropWhile(line => line.startsWith('#'))
```

### Deduplication

```typescript
// Remove all duplicates
const unique = new Stream(ids, s).distinct()

// Remove only consecutive duplicates
const changes = new Stream(sensorReadings, s)
  .distinctAdjacent() // Remove consecutive duplicates

// With custom comparison (objects)
const uniqueById = new Stream(updates, s)
  .groupAdjacentBy(u => u.id)
  .map(group => group.at(-1)!) // keep latest
```

### Combining Streams

Merge and combine multiple streams:

```typescript
// Merge two streams (interleave values as they arrive)
const combined = new Stream(source1, s)
  .merge(new Stream(source2, s))

// Concatenate streams (one after another)
const sequence = new Stream(part1, s)
  .concat(new Stream(part2, s))

// Prepend/append values
const withHeader = new Stream(data, s)
  .prepend('START')
  .append('END')

// Zip two streams together (pair values)
const paired = new Stream(users, s)
  .zip(new Stream(orders, s))  // [user, order] pairs

// Zip with latest value from either stream
const latest = new Stream(temperature, s)
  .zipLatest(new Stream(humidity, s))  // emits when either updates

// Zip with defaults for unequal lengths
const padded = new Stream(short, s)
  .zipAll(new Stream(long, s), 'default-for-short', 'default-for-long')

// Fair interleave (round-robin)
const interleaved = new Stream(a, s)
  .interleave(new Stream(b, s), new Stream(c, s))  // a1, b1, c1, a2, b2, c2...

// Cartesian product
const combinations = new Stream(colors, s)
  .cross(new Stream(sizes, s))  // [red, S], [red, M], [blue, S], [blue, M]...

// Intersperse separator
const csv = new Stream(values, s)
  .intersperse(',')
  .toArray()  // "a,b,c"
```

### Splitting Streams

Fan out to multiple consumers:

```typescript
// Partition into two streams based on predicate
const [evens, odds] = new Stream(numbers, s)
  .partition(n => n % 2 === 0)

// Split at position n
const [head, tail] = new Stream(items, s)
  .splitAt(5)  // first 5, rest

// Broadcast to multiple consumers
const [s1, s2, s3] = new Stream(events, s)
  .broadcast(3)  // all get same values
```

### Timing Operations

Control timing of emissions:

```typescript
// Add delay between elements
const delayed = new Stream(items, s)
  .delay(100)  // 100ms between each

// Spaced (alias for delay)
const spaced = new Stream(items, s)
  .spaced(50)

// Timeout entire stream
const withTimeout = new Stream(slowSource, s)
  .timeout(5000)  // fails if > 5s
```

### Buffering Variants

Buffer with time windows:

```typescript
// Buffer with time window
const batched = new Stream(events, s)
  .bufferTime(1000)  // emit batch every second

// Buffer with time OR count
const flexible = new Stream(events, s)
  .bufferTimeOrCount(1000, 100)  // every second OR 100 items
```

### Grouping

Group elements by size, time, or key:

```typescript
// Group by size or time window
const batched = new Stream(events, s)
  .groupedWithin(100, 1000)  // 100 items OR 1 second

// Group by key into substreams
const { groups, done } = new Stream(users, s)
  .groupByKey(user => user.department)

// Consume each group's stream
const [err, engineering] = await groups.get('Engineering').toArray()
const [err2, sales] = await groups.get('Sales').toArray()

// Wait for distribution to complete
await done
```

### Advanced Error Handling

Fine-grained error control:

```typescript
// Tap into errors without modifying
const [err] = await new Stream(source, s)
  .tapError(e => console.log('Error:', e))
  .toArray()

// Transform errors
const [err] = await new Stream(source, s)
  .mapError(e => new CustomError(e))
  .toArray()

// Ensure cleanup runs
const [err] = await new Stream(source, s)
  .ensuring(() => console.log('Done'))
  .toArray()

// Fallback if empty
const [err, items] = await new Stream(maybeEmpty, s)
  .orElse(new Stream(fallback, s))
  .toArray()
```

### Accumulating Operations

Reduce to single values:

```typescript
// Sum all values
const [err, total] = await new Stream(prices, s)
  .sum()

// Reduce
const [err, product] = await new Stream(numbers, s)
  .reduce((a, b) => a * b)

// Fold with initial
const [err, total] = await new Stream(items, s)
  .fold(0, (acc, item) => acc + item.price)
```

### Retry

Automatically retry on failure:

```typescript
const [err, results] = await new Stream(unreliableSource, s)
  .retry({ maxRetries: 3, delay: 100 })
  .toArray()
```

## Real-World Examples

### 1. Log Processing Pipeline

Process application logs with filtering, grouping, and rate limiting:

```typescript
await using s = scope()

const [err, errorSummary] = await new Stream(tailLogs(), s)
  .filter(log => log.level === 'ERROR')
  .groupAdjacentBy(log => log.service)
  .map(([service, logs]) => ({
    service,
    count: logs.length,
    latest: logs.at(-1)!
  }))
  .take(10) // Top 10 services
  .toArray()
```

### 2. Real-time Sensor Dashboard

Sample and throttle sensor readings:

```typescript
await using s = scope()

// Sample every 5 seconds, emit only on significant changes
const readings = new Stream(sensor.poll(), s)
  .fixed(5000) // Sample every 5s
  .filter(r => r.temperature > 0) // Valid readings only
  .distinctAdjacent() // Only when value changes

// Process in batches of 10
const [err, batches] = await readings
  .buffer(10)
  .tap(batch => console.log(`Processing ${batch.length} readings`))
  .mapAsync(processBatch, { concurrency: 2 })
  .toArray()
```

### 3. API Rate-Limited Fetching

Fetch with concurrency control and retry:

```typescript
await using s = scope()

const urls = ['https://api.example.com/user/1', ...]

const [err, users] = await new Stream(urls, s)
  .mapAsync(
    url => fetch(url).then(r => r.json()),
    { concurrency: 5 } // Max 5 concurrent
  )
  .spaced(100) // 100ms between requests
  .retry(3) // Retry failed requests
  .catchError(() => [{ id: 0, name: 'fallback' }])
  .toArray()
```

### 4. Data Export with Progress

Export large dataset with progress tracking:

```typescript
await using s = scope()

let processed = 0
const total = await db.count()

const [err] = await new Stream(db.query(), s)
  .buffer(1000) // Process in chunks
  .tap(() => {
    processed += 1000
    console.log(`${Math.round(processed/total * 100)}%`)
  })
  .map(chunk => chunk.map(transform))
  .flatMap(chunk => chunk) // Flatten for CSV
  .intersperse('\n') // Add newlines
  .ensuring(() => console.log('Export complete'))
  .forEach(line => fs.appendFileSync('export.csv', line))
```

### 5. Event Sourcing / CQRS

Process event stream with partitioning:

```typescript
await using s = scope()

// Partition by aggregate type
const [userEvents, orderEvents] = new Stream(eventStore.subscribe(), s)
  .partition(e => e.aggregateType === 'User')

// Process in parallel with different handlers
await Promise.all([
  userEvents
    .mapAsync(handleUserEvent, { concurrency: 3 })
    .drain(),
  
  orderEvents
    .filter(e => !e.processed)
    .mapAsync(handleOrderEvent, { concurrency: 5 })
    .tapError(err => metrics.orderError(err))
    .drain()
])
```

### 6. Chat/Message Processing

Group messages by user session:

```typescript
await using s = scope()

const [err, sessions] = await new Stream(websocket.messages(), s)
  .takeWhile(() => !shutdownSignal.aborted)
  .groupAdjacentBy(msg => msg.userId)
  .filter(session => session.length > 5) // Active users only
  .map(session => ({
    userId: session[0]!.userId,
    messageCount: session.length,
    duration: session.at(-1)!.timestamp - session[0]!.timestamp
  }))
  .toArray()
```

### 7. File Processing Pipeline

Process large CSV file line by line:

```typescript
await using s = scope()

const [err, summary] = await new Stream(readFileLines('huge.csv', s))
  .drop(1) // Skip header
  .map(parseCSVLine)
  .filter(row => row.isValid)
  .scan((stats, row) => ({
    count: stats.count + 1,
    totalAmount: stats.totalAmount + row.amount
  }), { count: 0, totalAmount: 0 })
  .last() // Only need final summary
```

### 8. Webhook Retry with Backoff

Retry failed webhooks with exponential backoff:

```typescript
await using s = scope()

await new Stream(failedWebhooks, s)
  .mapAsync(async webhook => {
    const response = await fetch(webhook.url, {
      method: 'POST',
      body: JSON.stringify(webhook.payload)
    })
    if (!response.ok) throw new Error('Failed')
    return { id: webhook.id, status: 'sent' }
  })
  .retry(5) // Retry up to 5 times
  .spaced(1000) // 1 second between retries
  .tapError(err => logger.error('Webhook failed', err))
  .forEach(result => markAsSent(result.id))
```

### 9. Search with Debouncing

Implement search-as-you-type with debouncing:

```typescript
await using s = scope()

const searchResults = new Stream(searchInput.events(), s)
  .map(e => e.target.value)
  .filter(q => q.length > 2)
  .debounce(300) // Wait 300ms after typing stops
  .switchMap(q => fetchSearchResults(q)) // Cancel previous
  .orElse([{ message: 'No results' }])

for await (const results of searchResults) {
  renderResults(results)
}
```

### 10. Multi-tenant Data Broadcast

Fan out to multiple tenants:

```typescript
await using s = scope()

// Create 3 streams from one source
const [tenantA, tenantB, tenantC] = new Stream(globalEvents, s)
  .broadcast(3)

// Each tenant filters their data
tenantA
  .filter(e => e.tenantId === 'A')
  .forEach(e => sendToTenantA(e))

tenantB
  .filter(e => e.tenantId === 'B')
  .throttle({ limit: 10, interval: 1000 })
  .forEach(e => sendToTenantB(e))

tenantC
  .filter(e => e.tenantId === 'C')
  .buffer(100)
  .forEach(batch => sendBatchToTenantC(batch))
```

## Error Handling

Streams use Result tuples for error handling:

```typescript
const [err, results] = await new Stream(source, s)
  .mapAsync(riskyOperation)
  .catchError(err => {
    // Recover with fallback
    return [defaultValue]
  })
  .toArray()

if (err) {
  console.error('Stream failed:', err)
} else {
  console.log('Results:', results)
}
```

### Error Recovery Patterns

```typescript
// Retry with backoff
stream.retry(3, { delay: 1000 })

// Fallback on error
stream.catchError(() => fallbackSource)

// Transform error
stream.mapError(e => new AppError('Processing failed', { cause: e }))

// Log but don't catch
stream.tapError(e => logger.error(e))

// Cleanup always runs
stream.ensuring(() => releaseResources())
```

## Observability Integration

Unlike `scope.task()`, streams don't automatically create spans or track metrics because they're lazy pipelines that only execute when consumed. However, you can manually wire up observability using stream operators:

### Metrics

Track stream processing with custom counters:

```typescript
await using s = scope()

let processed = 0
let failed = 0

const [err, results] = await new Stream(dataSource, s)
  .tap(() => processed++)
  .map(transform)
  .tapError(() => failed++)
  .ensuring(() => {
    // Report metrics when done
    s.metrics()?.tasksCompleted++
    console.log(`Processed: ${processed}, Failed: ${failed}`)
  })
  .toArray()
```

### Logging

Add logging at key points in the pipeline:

```typescript
await using s = scope()

const [err, results] = await new Stream(fetchData(), s)
  .tap(() => console.log('Starting data fetch'))
  .map(processItem)
  .tap((item, index) => console.log(`Processed item ${index}: ${item.id}`))
  .filter(item => item.valid)
  .tap(items => console.log(`Valid items: ${items.length}`))
  .tapError(err => console.error('Pipeline failed:', err))
  .ensuring(() => console.log('Pipeline complete'))
  .toArray()
```

### OpenTelemetry Tracing

Create spans manually for complex pipelines:

```typescript
import { trace } from '@opentelemetry/api'

await using s = scope()
const tracer = trace.getTracer('my-app')

const span = tracer.startSpan('process-data-stream')

const [err, results] = await new Stream(dataSource, s)
  .tap(() => span.addEvent('stream-started'))
  .buffer(100)
  .tap(batch => span.addEvent('batch-buffered', { count: batch.length }))
  .mapAsync(processBatch, { concurrency: 4 })
  .tap(results => span.setAttribute('items-processed', results.length))
  .tapError(err => {
    span.recordException(err)
    span.setStatus({ code: SpanStatusCode.ERROR })
  })
  .ensuring(() => span.end())
  .toArray()
```

### Lifecycle Hooks

Integrate with scope lifecycle hooks:

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name) => console.log(`Starting: ${name}`),
    afterTask: (name) => console.log(`Completed: ${name}`)
  }
})

// Trigger hooks manually for streams
s.hooks?.beforeTask?.('data-pipeline', 0)

const [err, results] = await new Stream(dataSource, s)
  .map(process)
  .ensuring(() => s.hooks?.afterTask?.('data-pipeline', 0))
  .toArray()
```

### Combined Example

Complete observability setup:

```typescript
await using s = scope()

const startTime = Date.now()
let itemCount = 0

const [err, results] = await new Stream(eventSource, s)
  // Metrics
  .tap(() => s.metrics()?.tasksSpawned++)
  
  // Logging
  .tap(() => console.log('Processing started'))
  
  // Business logic
  .filter(e => e.type === 'order')
  .map(enrichOrder)
  .tap(() => itemCount++)
  
  // Batch for efficiency
  .buffer(100)
  .mapAsync(saveToDatabase, { concurrency: 4 })
  
  // Error handling
  .tapError(err => {
    console.error('Processing failed:', err)
    s.metrics()?.tasksFailed++
  })
  
  // Cleanup
  .ensuring(() => {
    const duration = Date.now() - startTime
    console.log(`Processed ${itemCount} items in ${duration}ms`)
    s.metrics()?.tasksCompleted++
  })
  .toArray()
```

## Performance Tips

### 1. Use filterMap instead of filter + map
```typescript
// ❌ Two iterations
stream.filter(x => x.valid).map(x => x.name)

// ✅ One iteration
stream.filterMap(x => x.valid ? x.name : null)
```

### 2. Buffer before async operations
```typescript
// ❌ One-by-one processing
stream.mapAsync(process)

// ✅ Batch processing
stream.buffer(100).mapAsync(processBatch)
```

### 3. Use take early
```typescript
// ❌ Process everything then limit
stream.map(expensive).take(10)

// ✅ Limit first
stream.take(10).map(expensive)
```

### 4. Prefer distinctAdjacent over distinct
```typescript
// ❌ Memory grows with unique values
stream.distinct() // Uses Set

// ✅ Constant memory
stream.distinctAdjacent() // Only remembers last
```

## Comparison with Effect

go-go-scope streams implement ~90% of Effect's core Stream API:

| Effect | go-go-scope | Notes |
|--------|-------------|-------|
| `Stream.map` | ✅ `map` | Same |
| `Stream.filter` | ✅ `filter` | Same |
| `Stream.flatMap` | ✅ `flatMap` | Same |
| `Stream.scan` | ✅ `scan` | Same |
| `Stream.take` | ✅ `take` | Same |
| `Stream.takeWhile` | ✅ `takeWhile` | Same |
| `Stream.groupAdjacentBy` | ✅ `groupAdjacentBy` | Same |
| `Stream.debounce` | ✅ `debounce` | Same |
| `Stream.zip` | ✅ `zip`, `zipWithIndex` | Zip with index supported |
| `Stream.switch` | ✅ `switchMap` | Renamed for clarity |
| `Stream.schedule` | ❌ Not implemented | Use poll() or delay() |
| `Stream.cross` | ❌ Not implemented | Rarely needed |

Key differences:
- **Error handling**: go-go-scope uses Result tuples, Effect uses typed errors
- **Schedules**: Effect has sophisticated scheduling; go-go-scope has simpler timing
- **Resource safety**: Both use scope-based cleanup

## API Reference

See [API Reference](./03-api-reference.md) for complete method documentation.

### Quick Reference

**Transformations**: `map`, `filter`, `filterMap`, `flatMap`, `flatten`, `scan`, `tap`, `tapError`, `prepend`, `append`, `concat`, `intersperse`

**Slicing**: `take`, `takeWhile`, `takeUntil`, `drop`, `dropWhile`, `dropUntil`, `skip`, `splitAt`

**Buffering**: `buffer`, `bufferTime`, `bufferTimeOrCount`, `groupAdjacentBy`

**Deduplication**: `distinct`, `distinctAdjacent`, `distinctBy`, `distinctAdjacentBy`

**Rate Limiting**: `throttle`, `debounce`, `spaced`, `delay`

**Timing**: `delay`, `timeout`

**Combining**: `concat`, `prepend`, `append`, `zip`, `zipWithIndex`, `merge`

**Splitting**: `partition`, `splitAt`, `broadcast`

**Error**: `catchError`, `catchAll`, `mapError`, `tapError`, `orElse`, `orElseSucceed`, `orElseIfEmpty`, `retry`, `ensuring`

**Terminal**: `toArray`, `runDrain`, `drain`, `forEach`, `find`, `first`, `last`, `reduce`, `fold`, `scan`, `count`, `sum`, `some`, `every`, `includes`, `groupBy`

**Creation**: Always use `scope.stream(source)` - automatically cleaned up on scope disposal
