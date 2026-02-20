# Stream API

The `Stream` class provides lazy, composable, and cancellable async iterable processing. It's designed for handling data flows, event streams, and reactive programming with automatic resource management.

## Overview

```typescript
import { scope, stream } from 'go-go-scope'

await using s = scope()

// Create a stream from any async iterable
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
const users = s.stream(fetchUsers())
```

### From Arrays

```typescript
const numbers = s.stream(async function* () {
  for (const n of [1, 2, 3, 4, 5]) yield n
}())
```

### With Scope-based Cancellation

```typescript
await using s = scope()
const data = s.stream(fetchSource())

// Automatically cancelled when scope disposes
```

## Core Operations

### Transformations

#### map
Transform each value:

```typescript
// Double each number
const [err, doubled] = await s.stream(numbers)
  .map(n => n * 2)
  .toArray() // [2, 4, 6, 8, 10]

// Extract properties
const [err, names] = await s.stream(users)
  .map(user => user.name)
  .toArray()
```

#### filterMap
Combine filter and map (more efficient than separate operations):

```typescript
// Get active user emails, skip inactive
const [err, emails] = await s.stream(users)
  .filterMap(user => 
    user.active ? user.email : null
  )
  .toArray()
```

#### flatMap
Flatten nested iterables:

```typescript
// Flatten paginated results
const [err, allItems] = await s.stream(pages)
  .flatMap(page => page.items)
  .toArray()
```

#### scan
Running fold - emits intermediate values:

```typescript
// Running totals
const [err, totals] = await s.stream(sales)
  .scan((sum, sale) => sum + sale.amount, 0)
  .toArray() // [100, 250, 400, ...]
```

### Slicing

Control how much data to process:

```typescript
// Pagination: skip 20, take 10
const page2 = s.stream(allItems)
  .drop(20)
  .take(10)

// Take while condition holds
const intro = s.stream(lines)
  .takeWhile(line => !line.startsWith('---'))

// Take until (inclusive) - good for delimited data
const section = s.stream(lines)
  .takeUntil(line => line === 'END')

// Drop header comments
const data = s.stream(lines)
  .dropWhile(line => line.startsWith('#'))
```

### Deduplication

```typescript
// Remove all duplicates
const unique = s.stream(ids).distinct()

// Remove only consecutive duplicates
const changes = s.stream(sensorReadings)
  .distinctAdjacent() // Remove consecutive duplicates

// With custom comparison (objects)
const uniqueById = s.stream(updates)
  .groupAdjacentBy(u => u.id)
  .map(group => group.at(-1)!) // keep latest
```

### Combining Streams

Merge and combine multiple streams:

```typescript
// Merge two streams (interleave values)
const combined = s.stream(source1)
  .merge(s.stream(source2))

// Concatenate streams (one after another)
const sequence = s.stream(part1)
  .concat(s.stream(part2))

// Prepend/append values
const withHeader = s.stream(data)
  .prepend('START')
  .append('END')

// Zip two streams together (pair values)
const paired = s.stream(users)
  .zip(s.stream(orders))  // [user, order] pairs

// Intersperse separator
const csv = s.stream(values)
  .intersperse(',')
  .toArray()  // "a,b,c"
```

### Splitting Streams

Fan out to multiple consumers:

```typescript
// Partition into two streams based on predicate
const [evens, odds] = s.stream(numbers)
  .partition(n => n % 2 === 0)

// Split at position n
const [head, tail] = s.stream(items)
  .splitAt(5)  // first 5, rest

// Broadcast to multiple consumers
const [s1, s2, s3] = s.stream(events)
  .broadcast(3)  // all get same values
```

### Timing Operations

Control timing of emissions:

```typescript
// Add delay between elements
const delayed = s.stream(items)
  .delay(100)  // 100ms between each

// Spaced (alias for delay)
const spaced = s.stream(items)
  .spaced(50)

// Timeout entire stream
const withTimeout = s.stream(slowSource)
  .timeout(5000)  // fails if > 5s
```

### Buffering Variants

Buffer with time windows:

```typescript
// Buffer with time window
const batched = s.stream(events)
  .bufferTime(1000)  // emit batch every second

// Buffer with time OR count
const flexible = s.stream(events)
  .bufferTimeOrCount(1000, 100)  // every second OR 100 items
```

### Advanced Error Handling

Fine-grained error control:

```typescript
// Tap into errors without modifying
const [err] = await s.stream(source)
  .tapError(e => console.log('Error:', e))
  .toArray()

// Transform errors
const [err] = await s.stream(source)
  .mapError(e => new CustomError(e))
  .toArray()

// Ensure cleanup runs
const [err] = await s.stream(source)
  .ensuring(() => console.log('Done'))
  .toArray()

// Fallback if empty
const [err, items] = await s.stream(maybeEmpty)
  .orElse(s.stream(fallback))
  .toArray()
```

### Accumulating Operations

Reduce to single values:

```typescript
// Sum all values
const [err, total] = await s.stream(prices)
  .sum()

// Reduce
const [err, product] = await s.stream(numbers)
  .reduce((a, b) => a * b)

// Fold with initial
const [err, total] = await s.stream(items)
  .fold(0, (acc, item) => acc + item.price)
```

### Retry

Automatically retry on failure:

```typescript
const [err, results] = await s.stream(unreliableSource)
  .retry({ maxRetries: 3, delay: 100 })
  .toArray()
```

## Real-World Examples

### 1. Log Processing Pipeline

Process application logs with filtering, grouping, and rate limiting:

```typescript
await using s = scope()

const [err, errorSummary] = await s.stream(tailLogs())
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
const readings = s.stream(sensor.poll())
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

const [err, users] = await s.stream(urls)
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

const [err] = await s.stream(db.query())
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
const [userEvents, orderEvents] = s.stream(eventStore.subscribe())
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

const [err, sessions] = await s.stream(websocket.messages())
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

const [err, summary] = await s.stream(readFileLines('huge.csv'))
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

await s.stream(failedWebhooks)
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

const searchResults = s.stream(searchInput.events())
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
const [tenantA, tenantB, tenantC] = s.stream(globalEvents)
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
const [err, results] = await s.stream(source)
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

const [err, results] = await s.stream(dataSource)
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

const [err, results] = await s.stream(fetchData())
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

const [err, results] = await s.stream(dataSource)
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

const [err, results] = await s.stream(dataSource)
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

const [err, results] = await s.stream(eventSource)
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
