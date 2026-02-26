# go-go-scope vs Effect Stream API Comparison

> **Last Updated**: 2026-02-25

## Overview

This document compares go-go-scope v2.1.0's Stream API with Effect's Stream API. Effect has a massive, feature-rich API. Our goal is to cover the most commonly used operations while maintaining simplicity and native JavaScript patterns.

---

## API Coverage Matrix

### ✅ Implemented in go-go-scope

| Category | Operation | go-go-scope | Effect | Notes |
|----------|-----------|-------------|--------|-------|
| **Transformations** | `map` | ✅ | ✅ | |
| | `mapEffect` | ❌ | ✅ | Async mapping with Effect wrapper |
| | `mapAccum` | ✅ | ✅ | Stateful mapping (scan in go-go-scope) |
| | `mapAccumEffect` | ❌ | ✅ | Stateful with Effect |
| | `flatMap` | ✅ | ✅ | |
| | `flatten` | ✅ | ✅ | flatMap alias |
| | `as` | ❌ | ✅ | Map to constant |
| | `mapConcat` | ✅ | ✅ | flatMap alias |
| **Filtering** | `filter` | ✅ | ✅ | |
| | `filterEffect` | ❌ | ✅ | Filter with Effect |
| | `filterMap` | ✅ | ✅ | Filter + map combo |
| | `take` | ✅ | ✅ | |
| | `takeWhile` | ✅ | ✅ | |
| | `takeUntil` | ✅ | ✅ | |
| | `takeRight` | ❌ | ✅ | |
| | `drop` | ✅ | ✅ | |
| | `dropWhile` | ✅ | ✅ | |
| | `dropUntil` | ✅ | ✅ | |
| | `dropRight` | ❌ | ✅ | |
| **Grouping** | `grouped` | ✅ | ✅ | Chunk into groups |
| | `groupedWithin` | ✅ | ✅ | Time/size based |
| | `groupBy` | ✅ | ✅ | Key-based grouping with substreams |
| | `groupAdjacentBy` | ✅ | ✅ | Group consecutive by key |
| **Combining** | `merge` | ✅ | ✅ | Interleave streams |
| | `mergeWith` | ❌ | ✅ | Tagged merge |
| | `zip` | ✅ | ✅ | Pair-wise combine |
| | `zipAll` | ✅ | ✅ | Pad shorter stream with defaults |
| | `zipWith` | ✅ | ✅ | Custom zip function |
| | `zipLatest` | ✅ | ✅ | Latest from each |
| | `cross` | ✅ | ✅ | Cartesian product |
| | `interleave` | ✅ | ✅ | Fair round-robin interleave |
| | `concat` | ✅ | ✅ | Sequential append |
| **Error Handling** | `catchAll` | ✅ | ✅ | Recover from errors |
| | `catchTag` | ❌ | ✅ | Catch by error tag |
| | `orElse` | ✅ | ✅ | Fallback stream |
| | `orElseFail` | ❌ | ✅ | |
| | `timeout` | ✅ | ✅ | Per-element timeout |
| | `retry` | ✅ | ✅ | Retry with schedule |
| **State** | `scan` | ✅ | ✅ | Running fold |
| | `scanEffect` | ❌ | ✅ | |
| | `scanReduce` | ❌ | ✅ | |
| **Deduplication** | `distinct` | ✅ | ❌ | Remove all duplicates |
| | `distinctAdjacent` | ✅ | ❌ | Remove consecutive duplicates |
| | `changes` | ❌ | ✅ | Emit on change |
| **Side Effects** | `tap` | ✅ | ✅ | |
| | `tapEffect` | ❌ | ✅ | Effectful tap |
| | `tapError` | ✅ | ✅ | Tap on error |
| | `drain` | ✅ | ✅ | Consume without collecting |
| | `ensuring` | ✅ | ✅ | Finalizer |
| **Terminal** | `runCollect` / `toArray` | ✅ | ✅ | |
| | `runFold` / `fold` / `reduce` | ✅ | ✅ | |
| | `runForEach` / `forEach` | ✅ | ✅ | |
| | `runCount` / `count` | ✅ | ✅ | |
| | `runDrain` / `drain` | ✅ | ✅ | |
| | `runHead` / `first` | ✅ | ✅ | First element |
| | `runLast` / `last` | ✅ | ✅ | Last element |
| | `runSum` / `sum` | ✅ | ✅ | Sum all numeric values |
| | `collect` | ✅ | ✅ | Filter + map with partial function |
| | `collectWhile` | ✅ | ✅ | Collect while defined, then stop |
| | `find` | ✅ | ✅ | |
| | `findEffect` | ❌ | ✅ | |
| | `some` | ✅ | ✅ | |
| | `every` | ✅ | ✅ | |
| **Rate Limiting** | `throttle` | ✅ | ✅ | Rate limit output |
| | `debounce` | ✅ | ✅ | Debounce emissions |
| | `delay` / `spaced` | ✅ | ✅ | Delay between elements |
| | `buffer` | ✅ | ✅ | Backpressure buffer |
| | `bufferTime` | ✅ | ✅ | Time-based buffering |
| | `bufferChunks` | ❌ | ✅ | |
| **Scheduling** | `schedule` | ❌ | ✅ | Schedule emissions |
| | `repeat` | ❌ | ✅ | Repeat stream |
| | `retry` | ❌ | ✅ | Retry with schedule |
| | `tick` | ❌ | ✅ | Periodic emission |
| **Aggregation** | `aggregate` | ❌ | ✅ | Windowed aggregation |
| | `aggregateWithin` | ❌ | ✅ | Time-based |
| | `transduce` | ❌ | ✅ | Stateful transduction |
| **Partial Functions** | `collect` | ✅ | ✅ | Filter + map with partial function |
| | `collectWhile` | ✅ | ✅ | Collect while defined, then stop |
| **Composition** | `pipe` | ✅ | ✅ | Functional composition |
| **Broadcast** | `broadcast` | ✅ | ✅ | Fan-out to multiple consumers |
| | `share` | ❌ | ✅ | Hot observable |
| **Sliding Window** | `sliding` / `window` | ✅ | ✅ | Sliding window |
| | `slidingSize` | ❌ | ✅ | |
| **Partitioning** | `partition` | ✅ | ✅ | Split stream |
| | `partitionEither` | ❌ | ✅ | By error/success |
| **Resource Management** | `acquireRelease` | ❌ | ✅ | Resource-safe stream |
| | `ensuring` | ❌ | ✅ | Finalizer |
| | `scoped` | ❌ | ✅ | Scope integration |
| **Encoding** | `decodeText` | ❌ | ✅ | Text decoding |
| | `encodeText` | ❌ | ✅ | Text encoding |
| | `splitLines` | ❌ | ✅ | Line splitting |
| **Chunking** | `chunks` | ❌ | ✅ | Emit chunks |
| | `rechunk` | ❌ | ✅ | Re-buffer |
| **Context/Layer** | `provideLayer` | ❌ | ✅ | Dependency injection |
| | `provideService` | ❌ | ✅ | |
| | `context` | ❌ | ✅ | Access context |

---

## Coverage Summary

| Category | Effect Count | go-go-scope Count | Coverage |
|----------|--------------|-------------------|----------|
| Core Operations | ~40 | 38 | 95% |
| Advanced Operations | ~60 | 22 | 37% |
| Effect-specific | ~30 | 0 | N/A |
| **Total** | ~130 | 60 | 46% |

---

## What We Have (55+ Operations)

### Transformations
```typescript
stream.map(fn)
stream.mapAsync(fn, { concurrency })
stream.mapError(fn)
stream.filter(predicate)
stream.filterMap(fn)
stream.flatMap(fn)
stream.flatten(iterable)
stream.scan(fn, initial)
stream.tap(fn)
stream.tapError(fn)
stream.throttle({ limit, interval })
stream.debounce(ms)
stream.delay(ms)
stream.spaced(ms)
stream.timeout(ms)
stream.distinct()
stream.distinctBy(fn)
stream.distinctAdjacent()
stream.distinctAdjacentBy(fn)
stream.buffer(size)
stream.bufferTime(ms)
stream.bufferTimeOrCount(ms, count)
stream.retry(options)
stream.ensuring(cleanupFn)
```

### Slicing
```typescript
stream.take(count)
stream.takeWhile(predicate)
stream.takeUntil(predicate)
stream.drop(count)
stream.dropWhile(predicate)
stream.dropUntil(predicate)
```

### Grouping
```typescript
stream.grouped(size)
stream.groupedWithin(size, timeMs)
stream.groupByKey(fn)
stream.groupAdjacentBy(fn)
stream.buffer(size)
```

### Combining
```typescript
stream.merge(...streams)
stream.zip(other)
stream.zipAll(other, defaultA, defaultB)
stream.zipLatest(other)
stream.zipWith(other, fn)
stream.concat(other)
stream.interleave(...streams)
stream.intersperse(separator)
stream.cross(other)
stream.prepend(value)
stream.append(value)
```

### Partitioning & Broadcasting
```typescript
stream.partition(predicate)  // Returns [pass, fail]
stream.splitAt(n)            // Returns [first, rest]
stream.broadcast(n)          // Returns n streams
stream.pipe(transformFn)
```

### Error Handling
```typescript
stream.catchError(recoverFn)
stream.catchAll(recoverFn)
stream.orElse(fallback)
stream.orElseIfEmpty(fallback)
stream.orElseSucceed(value)
```

### Terminal
```typescript
stream.toArray()
stream.runDrain() / stream.drain()
stream.forEach(fn)
stream.fold(initial, fn) / stream.reduce(fn, initial)
stream.count()
stream.find(predicate)
stream.first() / stream.runHead()
stream.last() / stream.runLast()
stream.some(predicate)
stream.every(predicate)
stream.includes(value)
stream.sum() / stream.runSum()
stream.collect() / stream.collectWhile(predicate)
```

---

## Unique go-go-scope Features

Operations Effect doesn't have:

| Feature | go-go-scope | Effect |
|---------|-------------|--------|
| `distinct()` | ✅ | ❌ |
| `distinctAdjacent()` | ✅ | ❌ |
| Native cancellation | `AbortSignal` | Fiber-based |
| Result tuples | `[error, value]` | `Effect<Success, Error>` |
| Scope integration | Built-in | Manual `Effect.scoped()` |
| `using`/`await using` | Native | Manual cleanup |

---

## Recommendations for v1.7.x / v1.8.0

### ✅ Implemented in v1.7.0

1. **Async transformations** ✅
   ```typescript
   stream.mapAsync(fn, { concurrency: 4 })
   ```

2. **Conditional slicing** ✅ (partial)
   ```typescript
   stream.takeWhile(x => x < 100)
   // dropWhile - not yet implemented
   ```

3. **Rate limiting** ✅ (partial)
   ```typescript
   stream.throttle({ limit: 10, interval: 1000 })
   // debounce - not yet implemented
   ```

4. **Basic error handling** ✅
   ```typescript
   stream.catchError(recoverFn)
   stream.orElse(fallbackStream)
   ```

5. **Additional terminals** ✅
   ```typescript
   stream.first()
   stream.last()
   ```

### Recently Implemented (v2.1.0)

- ✅ `grouped(size)` - Fixed-size chunking
- ✅ `runHead()` / `first()` - First element with early termination
- ✅ `runLast()` / `last()` - Last element
- ✅ `runSum()` / `sum()` - Numeric sum
- ✅ `collect()` / `collectWhile()` - Conditional collection
- ✅ `pipe(transformFn)` - Functional composition

### Now Implemented (All Previously Missing Core Features)

The following features have been implemented and are available:

- ✅ **Conditional Slicing**: `takeWhile`, `takeUntil`, `dropWhile`, `dropUntil`
- ✅ **Windowing**: `sliding` / `window`, `grouped`, `groupedWithin`
- ✅ **Error Handling**: `catchAll`, `catchError`, `orElse`, `tapError`, `retry`, `timeout`
- ✅ **Rate Limiting**: `throttle`, `debounce`, `delay`, `spaced`
- ✅ **Broadcasting**: `broadcast(n)` for fan-out
- ✅ **Advanced Combining**: `interleave`, `concat`, `zipLatest`, `zipAll`, `cross`, `intersperse`
- ✅ **Finalizers**: `ensuring` for cleanup
- ✅ **Additional Terminals**: `runHead`, `runLast`, `runSum`, `collect`, `collectWhile`

---

## Usage Comparison

### Simple Pipeline

```typescript
// Effect
import { Stream, Effect } from "effect"

const program = Stream.range(1, 100).pipe(
  Stream.map(x => x * 2),
  Stream.filter(x => x > 10),
  Stream.take(5),
  Stream.runCollect
)

const result = await Effect.runPromise(program)
// { _id: 'Chunk', values: [12, 14, 16, 18, 20] }

// go-go-scope
import { scope } from "go-go-scope"

await using s = scope()

const [err, result] = await new Stream(range(1, 100, s))
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray()

// [12, 14, 16, 18, 20]
```

### Async Transformation

```typescript
// Effect
const result = await Effect.runPromise(
  Stream.make(url1, url2, url3).pipe(
    Stream.mapEffect(fetchUrl, { concurrency: 2 }),
    Stream.runCollect
  )
)

// go-go-scope (proposed)
const [err, result] = await new Stream([url1, url2, url3], s)
  .mapAsync(fetchUrl, { concurrency: 2 })
  .toArray()
```

### Error Handling

```typescript
// Effect
const result = await Effect.runPromise(
  stream.pipe(
    Stream.catchAll(error => 
      Stream.succeed(defaultValue)
    ),
    Stream.runCollect
  )
)

// go-go-scope (proposed)
const [err, result] = await new Stream(source, s)
  .map(riskyOperation)
  .catchError(error => fallbackStream)
  .toArray()
```

---

## Performance Benchmarks

Stream operations are measured in operations per second (ops/sec) on a 1000-element stream.

### Benchmark Results (v1.7.0)

| Operation | Throughput | Avg Time | Notes |
|-----------|------------|----------|-------|
| **Stream.take (100/1000)** | ~10,000 ops/sec | 0.10ms | Early termination is fast |
| **Stream.filter** | ~1,800 ops/sec | 0.55ms | Simple predicate evaluation |
| **Stream.scan** | ~1,600 ops/sec | 0.63ms | Stateful accumulation |
| **Stream.map** | ~1,300 ops/sec | 0.75ms | Transform each element |
| **Stream.map + filter** | ~1,000 ops/sec | 0.95ms | Chained operations |
| **Stream.partition** | ~350 ops/sec | 2.88ms | Two-stream split with backpressure |

### Comparison with Native

```
Native async iterator (map):    ~3,600 ops/sec
Stream.map (1000 items):        ~1,300 ops/sec

Overhead: ~2.7x vs native loops
```

The overhead is expected due to:
- **Cancellation support**: AbortSignal checking at each step
- **Lazy evaluation**: Operation chain building
- **Result tuples**: Error/Value wrapping at terminals
- **Scope integration**: Automatic resource cleanup

### Trade-offs

| Aspect | go-go-scope Stream | Native Async Iterator |
|--------|-------------------|----------------------|
| **Composability** | High (method chaining) | Low (manual loops) |
| **Cancellation** | Built-in (AbortSignal) | Manual |
| **Error handling** | Result tuples | try/catch |
| **Memory** | Lazy (pull-based) | Depends on implementation |
| **Performance** | ~2-3x overhead | Baseline |
| **Type safety** | High | Medium |

For high-throughput scenarios (>5,000 ops/sec), native loops may be preferable. For most applications, the composability and safety features justify the overhead.

---

## Conclusion

go-go-scope's Stream API provides **60+ operations** covering the essential streaming patterns from Effect's Stream API. With 95% coverage of core operations, this covers the vast majority of real-world use cases while maintaining simplicity and native JavaScript patterns.

### Current Coverage (v2.1.0)

✅ **Core transformations**: map, mapAsync, mapError, filter, filterMap, flatMap, flatten, scan, tap, tapError  
✅ **Slicing**: take, takeWhile, takeUntil, drop, dropWhile, dropUntil, takeRight  
✅ **Combining**: merge, concat, zip, zipAll, zipLatest, zipWith, zipWithIndex, interleave, intersperse, cross, prepend, append  
✅ **Deduplication**: distinct, distinctBy, distinctAdjacent, distinctAdjacentBy, distinctUntilChanged  
✅ **Grouping**: buffer, bufferTime, bufferTimeOrCount, grouped, groupedWithin, groupByKey, groupAdjacentBy  
✅ **Rate limiting**: throttle, debounce, delay, spaced, timeout  
✅ **Error handling**: catchAll, catchError, tapError, mapError, orElse, orElseIfEmpty, orElseSucceed, ensuring, retry  
✅ **Broadcasting/Partitioning**: broadcast, partition, splitAt  
✅ **Advanced**: switchMap, pipe, collect, collectWhile  
✅ **Terminals**: toArray, runDrain, drain, forEach, fold, reduce, count, find, first, last, runHead, runLast, some, every, includes, sum, runSum  

### Recently Added (v2.1.0)

- ✅ `collect()` / `collectWhile()` - Conditional collection into arrays
- ✅ `grouped(size)` - Fixed-size chunking
- ✅ `runHead()` / `first()` - Efficient first element retrieval
- ✅ `runLast()` / `last()` - Efficient last element retrieval
- ✅ `runSum()` - Efficient numeric sum
- ✅ `pipe(transformFn)` - Functional pipeline composition
- ✅ `broadcast(n)` - Fan-out to multiple consumers

### Previously Added (v1.7.0 - v2.0.0)

- ✅ `groupByKey(fn)` - Key-based grouping with substreams
- ✅ `groupedWithin(size, time)` - Time/size based grouping
- ✅ `zipLatest(stream)` - Latest value combining from two streams
- ✅ `zipAll(stream, defaultA, defaultB)` - Zip with defaults for unequal lengths
- ✅ `interleave(...streams)` - Fair round-robin interleaving
- ✅ `cross(stream)` - Cartesian product
- ✅ `takeWhile`, `takeUntil`, `dropWhile`, `dropUntil` - Conditional slicing
- ✅ `throttle`, `debounce` - Rate limiting
- ✅ `retry`, `timeout` - Error handling

**60+ operations total** - comprehensive coverage of Effect's core Stream API with ~95% of real-world use cases.

The trade-off is intentional: **less API surface, more familiarity** (native JavaScript patterns, Result tuples, AbortSignal cancellation) vs Effect's comprehensive but Effect-ecosystem-specific API.
