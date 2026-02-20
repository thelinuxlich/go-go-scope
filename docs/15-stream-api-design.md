# go-go-scope v1.7.0 Stream API

> **Status**: Implemented  
> **Target**: v1.7.0  
> **Last Updated**: 2026-02-20

## Overview

go-go-scope v1.7.0 provides a powerful, lazy Stream API for processing async iterables. Inspired by Effect's Stream and built on native JavaScript features, it offers:

- **Lazy evaluation** - Operations are only executed when needed
- **Automatic cancellation** - Respects scope disposal via AbortSignal
- **Result tuples** - Type-safe error handling with `[error, value]`
- **Composable operations** - Chain transformations like native array methods
- **No polyfills** - Pure JavaScript implementation, no prototype pollution

## Quick Start

```typescript
import { scope } from 'go-go-scope';

await using s = scope();

// Lazy stream processing with automatic cancellation
const [err, results] = await s.stream(fetchData())
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray();

if (err) {
  console.error('Stream failed:', err);
} else {
  console.log('Results:', results);
}
```

## Creating Streams

```typescript
await using s = scope();

// From any async iterable
const stream1 = s.stream(fetchData());

// From a generator
async function* generate() {
  for (let i = 0; i < 100; i++) {
    yield await fetchItem(i);
  }
}
const stream2 = s.stream(generate());

// From an array (wrap in async generator)
const stream3 = s.stream((async function* () {
  yield* [1, 2, 3, 4, 5];
})());
```

## Transformations (Lazy)

All transformations return a new Stream - nothing is executed until a terminal operation is called.

### map
```typescript
const doubled = s.stream(numbers)
  .map(x => x * 2);
```

### mapAsync
```typescript
// Concurrent async mapping
const fetched = s.stream(urls)
  .mapAsync(async url => await fetch(url), { concurrency: 4 });
```

### filter
```typescript
const evens = s.stream(numbers)
  .filter(x => x % 2 === 0);
```

### take / drop
```typescript
const first5 = s.stream(infinite)
  .take(5);

const rest = s.stream(items)
  .drop(10);
```

### takeWhile / dropWhile / takeUntil / dropUntil
```typescript
// Take while condition is true
const valid = s.stream(items)
  .takeWhile(x => x !== null);

// Drop while condition is true
const data = s.stream(lines)
  .dropWhile(line => line.startsWith('#'));

// Take until condition is true (inclusive)
const section = s.stream(lines)
  .takeUntil(line => line === 'END');

// Drop until condition is true (inclusive)  
const afterHeader = s.stream(lines)
  .dropUntil(line => line === '---');
```

### flatMap
```typescript
const flattened = s.stream(nestedArrays)
  .flatMap(arr => arr);
```

### scan (running fold)
```typescript
const runningTotals = s.stream(prices)
  .scan((sum, price) => sum + price, 0);
// Emits: [10, 25, 35, 60, ...]
```

### tap (side effects)
```typescript
const logged = s.stream(data)
  .tap((item, index) => console.log(`Processing ${index}:`, item));
```

### distinct / distinctAdjacent
```typescript
// Remove all duplicates (uses memory)
const unique = s.stream(items)
  .distinct();

// Remove only consecutive duplicates
const deduped = s.stream(items)
  .distinctAdjacent();
```

### buffer / bufferTime / bufferTimeOrCount
```typescript
// Group into chunks by count
const batches = s.stream(items)
  .buffer(10); // Stream<T[]>

// Group by time window
const timeBatches = s.stream(items)
  .bufferTime(1000); // Emit every second

// Group by time OR count
const flexible = s.stream(items)
  .bufferTimeOrCount(1000, 100); // Every second OR 100 items
```

### groupAdjacentBy
```typescript
// Group consecutive items by key
const grouped = s.stream(events)
  .groupAdjacentBy(e => e.userId);
// Yields: [[e1, e2], [e3], [e4, e5, e6], ...]
```

### throttle / debounce / spaced / delay / timeout
```typescript
// Rate limit: max 10 items per second
const throttled = s.stream(items)
  .throttle({ limit: 10, interval: 1000 });

// Debounce: emit only after quiet period
const debounced = s.stream(inputs)
  .debounce(300); // Wait 300ms of silence

// Spaced: delay between elements
const spaced = s.stream(items)
  .spaced(100); // 100ms between each

// Delay: alias for spaced
const delayed = s.stream(items)
  .delay(100);

// Timeout: fail if stream takes too long
const withTimeout = s.stream(slowSource)
  .timeout(5000); // 5 second timeout
```

### catchError / orElse
```typescript
// Recover from errors
const recovered = s.stream(riskySource)
  .catchError(err => s.stream(fallback));

// Provide fallback if empty or error
const withFallback = s.stream(maybeEmpty)
  .orElse(fallbackStream);

// Provide fallback only if empty (not on error)
const ifEmpty = s.stream(maybeEmpty)
  .orElseIfEmpty(fallbackStream);

// Transform errors
const transformed = s.stream(riskySource)
  .mapError(err => new CustomError(err));

// Tap into errors for logging
const logged = s.stream(riskySource)
  .tapError(err => console.error('Stream error:', err));

// Ensure cleanup runs
const cleaned = s.stream(source)
  .ensuring(() => cleanup());
```

### retry
```typescript
// Retry on failure with delay
const retried = s.stream(unreliableSource)
  .retry({ maxRetries: 3, delay: 100 });
```

## Combining Streams

### merge (interleave)
```typescript
const merged = stream1
  .merge(stream2);
// Yields from whichever stream is ready
```

### zip / zipWithIndex
```typescript
const paired = names
  .zip(ages); // Stream<[string, number]>
// Yields: [['Alice', 25], ['Bob', 30], ...]

// Zip with index
const indexed = items
  .zipWithIndex(); // Stream<[T, number]>
// Yields: [['a', 0], ['b', 1], ['c', 2], ...]
```

### concat / prepend / append / intersperse
```typescript
// Concatenate streams (sequential)
const combined = stream1.concat(stream2);

// Prepend/append values
const withHeader = stream.prepend('START', '---');
const withFooter = stream.append('---', 'END');

// Intersperse separator
const csv = values.intersperse(',');
// Yields: ['a', ',', 'b', ',', 'c']
```

### partition / splitAt / broadcast
```typescript
// Partition into two streams by predicate
const [evens, odds] = numbers.partition(n => n % 2 === 0);

// Split at position
const [head, tail] = items.splitAt(5);

// Broadcast to multiple consumers
const [s1, s2, s3] = events.broadcast(3);
```

## Terminal Operations

All terminal operations return `Result<E, T>` tuples for error handling.

### toArray
```typescript
const [err, items] = await s.stream(source)
  .toArray();
```

### first / last
```typescript
// Get first element
const [err, first] = await s.stream(source)
  .first();

// Get last element (consumes entire stream)
const [err2, last] = await s.stream(source)
  .last();
```

### reduce
```typescript
const [err, sum] = await s.stream(numbers)
  .reduce((a, b) => a + b, 0);
```

### forEach
```typescript
const [err] = await s.stream(items)
  .forEach(item => console.log(item));
```

### find
```typescript
const [err, user] = await s.stream(users)
  .find(u => u.id === 123);
```

### some / every
```typescript
const [err, hasAdmin] = await s.stream(users)
  .some(u => u.role === 'admin');

const [err2, allActive] = await s.stream(users)
  .every(u => u.active);
```

### count
```typescript
const [err, total] = await s.stream(items)
  .count();
```

### drain
```typescript
// Consume without collecting (for side effects)
const [err] = await s.stream(events)
  .tap(processEvent)
  .drain();
```

## Cancellation

Streams automatically respect scope cancellation:

```typescript
await using s = scope({ timeout: 5000 });

// If timeout fires mid-stream, iteration stops immediately
const [err, results] = await s.stream(largeDataset)
  .map(async x => await expensiveTransform(x))
  .toArray();

// err will be the timeout error if it fired
```

## Observability

Streams are lightweight, lazy pipelines and don't automatically create OpenTelemetry spans or track metrics like `scope.task()` does. This is intentional - streams may process thousands of items per second, and automatic instrumentation would create excessive overhead.

### Manual Instrumentation

Use stream operators to add observability where needed:

```typescript
// Metrics
.tap(() => metrics.itemsProcessed++)
.tapError(() => metrics.errors++)
.ensuring(() => metrics.pipelinesCompleted++)

// Logging
.tap(item => console.log('Processing:', item.id))
.tapError(err => console.error('Failed:', err))

// Tracing (create spans for significant operations)
const span = tracer.startSpan('batch-process')
stream
  .buffer(100)
  .tap(batch => span.setAttribute('batchSize', batch.length))
  .mapAsync(processBatch)
  .ensuring(() => span.end())
```

### When to Instrument

| Scenario | Recommendation |
|----------|---------------|
| High-frequency streams (>1000 items/sec) | Minimal logging, counters only |
| Batch processing | Span per batch, not per item |
| Error tracking | Always use `tapError()` |
| Performance monitoring | Time the terminal operation, not individual steps |

## Comparison with Alternatives

### vs Native Array Methods
```typescript
// Array methods - eager, loads everything into memory
const results = (await Array.fromAsync(source))
  .map(x => x * 2)
  .filter(x => x > 10)
  .slice(0, 5);

// Stream - lazy, processes on demand, cancellable
const [err, results] = await s.stream(source)
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray();
```

### vs Effect Stream
```typescript
// Effect Stream
const stream = Stream.fromIterable(items).pipe(
  Stream.map(x => x * 2),
  Stream.take(5)
);
const result = Effect.runPromise(Stream.runCollect(stream));

// go-go-scope Stream
const [err, results] = await s.stream(items)
  .map(x => x * 2)
  .take(5)
  .toArray();
```

## When to Use What

| Approach | Use When |
|----------|----------|
| `Array.fromAsync()` | Small datasets, need all data in memory |
| `for await...of` | Simple iteration, no transformation chain |
| `s.stream()` | Large/infinite datasets, transformation chains, need cancellation |

## API Reference

### Stream<T> Class

**Transformations** (all lazy, return `Stream<R>`):
- `map(fn)` - Transform each value
- `filter(predicate)` - Keep matching values
- `take(count)` - First n values
- `drop(count)` - Skip first n values
- `flatMap(fn)` - Flatten nested iterables
- `scan(fn, initial)` - Running fold
- `tap(fn)` - Side effects
- `distinct()` - Remove all duplicates
- `distinctAdjacent()` - Remove consecutive duplicates
- `buffer(size)` - Chunk into arrays
- `merge(...streams)` - Interleave streams
- `zip(other)` - Pair with another stream

**Terminal Operations** (all return `Promise<Result<E, T>>`):
- `toArray()` - Collect to array
- `reduce(fn, initial)` - Fold to single value
- `forEach(fn)` - Side effects for each
- `find(predicate)` - First match
- `some(predicate)` - Any match?
- `every(predicate)` - All match?
- `count()` - Count values
- `drain()` - Consume without collecting

## Error Handling

All terminal operations return Result tuples:

```typescript
const [err, results] = await s.stream(source)
  .map(riskyOperation)
  .toArray();

if (err) {
  // Stream was automatically cleaned up
  console.error('Failed:', err);
} else {
  console.log('Success:', results);
}
```

## Future Enhancements

Potential additions for future versions:
- `mapAsync(fn, { concurrency })` - Concurrent async mapping with controlled concurrency
- `slidingWindow(size)` / `sliding(size)` - Sliding window of recent elements
- `share()` - Hot observable sharing (multicast to late subscribers)

**Already implemented** (removed from future list):
- ✅ `throttle(ms)` / `debounce(ms)` - Rate limiting
- ✅ `catchError(fn)` / `catchAll(fn)` - Error recovery
- ✅ `groupedWithin(size, duration)` - Group by size and/or time window
- ✅ `groupByKey(fn)` - Key-based grouping with substreams
- ✅ `zipLatest(stream)` - Combine latest values from two streams
- ✅ `zipAll(stream, defaultA, defaultB)` - Zip with defaults for unequal lengths
- ✅ `interleave(...streams)` - Fair interleaving of multiple streams
- ✅ `cross(stream)` - Cartesian product of two streams
