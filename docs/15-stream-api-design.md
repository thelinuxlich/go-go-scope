# go-go-scope Stream API Design

> **Status**: Implemented  
> **Target**: v2.3.0  
> **Last Updated**: 2026-02-26

## Overview

go-go-scope provides a powerful, lazy Stream API for processing async iterables via the `@go-go-scope/stream` package. Inspired by Effect's Stream and built on native JavaScript features, it offers:

- **Lazy evaluation** - Operations are only executed when needed
- **Automatic cancellation** - Respects scope disposal via AbortSignal
- **Result tuples** - Type-safe error handling with `[error, value]`
- **Composable operations** - Chain transformations like native array methods
- **No polyfills** - Pure JavaScript implementation, no prototype pollution

## Installation

```bash
npm install @go-go-scope/stream
```

## Quick Start

```typescript
import { scope } from 'go-go-scope';
import { Stream, streamPlugin } from '@go-go-scope/stream';

// Option 1: Use Stream class directly
await using s = scope();

const [err, results] = await new Stream(fetchData(), s)
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray();

// Option 2: Use the stream plugin for cleaner syntax
await using s = scope({ plugins: [streamPlugin] });

const [err, results] = await s.stream([1, 2, 3, 4])
  .map(x => x * 2)
  .filter(x => x > 4)
  .toArray();

if (err) {
  console.error('Stream failed:', err);
} else {
  console.log('Results:', results);
}
```

## Creating Streams

### From Async Iterables

```typescript
await using s = scope();

// From any async iterable
const stream1 = new Stream(fetchData(), s);

// From a generator
async function* generate() {
  for (let i = 0; i < 100; i++) {
    yield await fetchItem(i);
  }
}
const stream2 = new Stream(generate(), s);

// From an array (wrap in async generator)
const stream3 = new Stream((async function* () {
  yield* [1, 2, 3, 4, 5];
})(), s);
```

### Using the Stream Plugin

```typescript
await using s = scope({ plugins: [streamPlugin] });

// Arrays are automatically wrapped
const [err, results] = await s.stream([1, 2, 3, 4, 5])
  .map(x => x * 2)
  .toArray();

// Works with async iterables too
const [err2, results2] = await s.stream(fetchData())
  .filter(item => item.active)
  .toArray();
```

## Transformations (Lazy)

All transformations return a new Stream - nothing is executed until a terminal operation is called.

### map
```typescript
const doubled = new Stream(numbers, s)
  .map(x => x * 2);
```

### mapAsync
```typescript
// Concurrent async mapping
const fetched = new Stream(urls, s)
  .mapAsync(async url => await fetch(url), { concurrency: 4 });
```

### filter
```typescript
const evens = new Stream(numbers, s)
  .filter(x => x % 2 === 0);
```

### take / drop
```typescript
const first5 = new Stream(infinite, s)
  .take(5);

const rest = new Stream(items, s)
  .drop(10);
```

### takeWhile / dropWhile / takeUntil / dropUntil
```typescript
// Take while condition is true
const valid = new Stream(items, s)
  .takeWhile(x => x !== null);

// Drop while condition is true
const data = new Stream(lines, s)
  .dropWhile(line => line.startsWith('#'));

// Take until condition is true (inclusive)
const section = new Stream(lines, s)
  .takeUntil(line => line === 'END');

// Drop until condition is true (inclusive)  
const afterHeader = new Stream(lines, s)
  .dropUntil(line => line === '---');
```

### flatMap
```typescript
const flattened = new Stream(nestedArrays, s)
  .flatMap(arr => arr);
```

### scan (running fold)
```typescript
const runningTotals = new Stream(prices, s)
  .scan((sum, price) => sum + price, 0);
// Emits: [10, 25, 35, 60, ...]
```

### tap (side effects)
```typescript
const logged = new Stream(data, s)
  .tap((item, index) => console.log(`Processing ${index}:`, item));
```

### distinct / distinctAdjacent
```typescript
// Remove all duplicates (uses memory)
const unique = new Stream(items, s)
  .distinct();

// Remove only consecutive duplicates
const deduped = new Stream(items, s)
  .distinctAdjacent();
```

### buffer / bufferTime / bufferTimeOrCount
```typescript
// Group into chunks by count
const batches = new Stream(items, s)
  .buffer(10); // Stream<T[]>

// Group by time window
const timeBatches = new Stream(items, s)
  .bufferTime(1000); // Emit every second

// Group by time OR count
const flexible = new Stream(items, s)
  .bufferTimeOrCount(1000, 100); // Every second OR 100 items
```

### groupAdjacentBy
```typescript
// Group consecutive items by key
const grouped = new Stream(events, s)
  .groupAdjacentBy(e => e.userId);
// Yields: [[e1, e2], [e3], [e4, e5, e6], ...]
```

### throttle / debounce / spaced / delay / timeout
```typescript
// Rate limit: max 10 items per second
const throttled = new Stream(items, s)
  .throttle({ limit: 10, interval: 1000 });

// Debounce: emit only after quiet period
const debounced = new Stream(inputs, s)
  .debounce(300); // Wait 300ms of silence

// Spaced: delay between elements
const spaced = new Stream(items, s)
  .spaced(100); // 100ms between each

// Delay: alias for spaced
const delayed = new Stream(items, s)
  .delay(100);

// Timeout: fail if stream takes too long
const withTimeout = new Stream(slowSource, s)
  .timeout(5000); // 5 second timeout
```

### catchError / orElse
```typescript
// Recover from errors
const recovered = new Stream(riskySource, s)
  .catchError(err => new Stream(fallback, s));

// Provide fallback if empty or error
const withFallback = new Stream(maybeEmpty, s)
  .orElse(fallbackStream);

// Provide fallback only if empty (not on error)
const ifEmpty = new Stream(maybeEmpty, s)
  .orElseIfEmpty(fallbackStream);

// Transform errors
const transformed = new Stream(riskySource, s)
  .mapError(err => new CustomError(err));

// Tap into errors for logging
const logged = new Stream(riskySource, s)
  .tapError(err => console.error('Stream error:', err));

// Ensure cleanup runs
const cleaned = new Stream(source, s)
  .ensuring(() => cleanup());
```

### retry
```typescript
// Retry on failure with delay
const retried = new Stream(unreliableSource, s)
  .retry({ max: 3, delay: 100 });
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
const [err, items] = await new Stream(source, s)
  .toArray();
```

### first / last
```typescript
// Get first element
const [err, first] = await new Stream(source, s)
  .first();

// Get last element (consumes entire stream)
const [err2, last] = await new Stream(source, s)
  .last();
```

### reduce
```typescript
const [err, sum] = await new Stream(numbers, s)
  .reduce((a, b) => a + b, 0);
```

### forEach
```typescript
const [err] = await new Stream(items, s)
  .forEach(item => console.log(item));
```

### find
```typescript
const [err, user] = await new Stream(users, s)
  .find(u => u.id === 123);
```

### some / every
```typescript
const [err, hasAdmin] = await new Stream(users, s)
  .some(u => u.role === 'admin');

const [err2, allActive] = await new Stream(users, s)
  .every(u => u.active);
```

### count
```typescript
const [err, total] = await new Stream(items, s)
  .count();
```

### drain
```typescript
// Consume without collecting (for side effects)
const [err] = await new Stream(events, s)
  .tap(processEvent)
  .drain();
```

## Cancellation

Streams automatically respect scope cancellation:

```typescript
await using s = scope({ timeout: 5000 });

// If timeout fires mid-stream, iteration stops immediately
const [err, results] = await new Stream(largeDataset, s)
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
const [err, results] = await new Stream(source, s)
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
const [err, results] = await new Stream(items, s)
  .map(x => x * 2)
  .take(5)
  .toArray();
```

## When to Use What

| Approach | Use When |
|----------|----------|
| `Array.fromAsync()` | Small datasets, need all data in memory |
| `for await...of` | Simple iteration, no transformation chain |
| `Stream` | Large/infinite datasets, transformation chains, need cancellation |

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
const [err, results] = await new Stream(source, s)
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
