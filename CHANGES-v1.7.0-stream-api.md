# v1.7.0 Stream API Implementation

## Overview

Implemented a complete lazy Stream API for processing async iterables, providing composable operations with automatic cancellation and Result tuple error handling.

## New Features

### Stream Class (`src/stream.ts`)

A lazy, composable stream implementation with structured concurrency integration:

```typescript
await using s = scope();

const [err, results] = await s.stream(fetchData())
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray();
```

**Transformations** (lazy):
- `map(fn)` - Transform each value
- `mapAsync(fn, { concurrency })` - Concurrent async mapping
- `filter(predicate)` - Keep matching values
- `take(count)` - First n values
- `takeWhile(predicate)` - Take while condition true
- `drop(count)` - Skip first n values
- `flatMap(fn)` - Flatten nested iterables
- `scan(fn, initial)` - Running fold
- `tap(fn)` - Side effects
- `throttle({ limit, interval })` - Rate limiting
- `distinct()` / `distinctAdjacent()` - Remove duplicates
- `buffer(size)` - Chunk into arrays
- `catchError(recoverFn)` - Error recovery
- `orElse(fallback)` - Fallback if empty
- `merge(...streams)` - Interleave streams
- `zip(other)` - Pair with another stream

**Terminal Operations** (Result tuples):
- `toArray()` - Collect to array
- `first()` - Get first element
- `last()` - Get last element
- `reduce(fn, initial)` - Fold to single value
- `forEach(fn)` - Side effects
- `find(predicate)` - First match
- `some(predicate)` / `every(predicate)` - Tests
- `count()` - Count values
- `drain()` - Consume without collecting

### Scope Integration

The `stream()` method now returns a `Stream` instance:

```typescript
// Before (v1.6.x)
async *stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>

// After (v1.7.0)
stream<T>(source: AsyncIterable<T>): Stream<T>
```

Streams are automatically disposed when the scope exits.

## Implementation Details

### Lazy Evaluation

All transformations return new Stream instances without executing:

```typescript
// No execution yet - just builds the pipeline
const pipeline = s.stream(source)
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5);

// Terminal operation triggers execution
const [err, results] = await pipeline.toArray();
```

### Cancellation

Each generator checks `scope.signal.aborted` before yielding:

```typescript
async *source() {
  for await (const value of input) {
    if (scope.signal.aborted) throw scope.signal.reason;
    yield value;
  }
}
```

### Error Handling

All terminal operations return `Result<E, T>` tuples:

```typescript
type Result<E, T> = [E, undefined] | [undefined, T];

async toArray(): Promise<Result<unknown, T[]>>
async reduce<R>(fn, initial): Promise<Result<unknown, R>>
```

## Modern JavaScript APIs Used

- `.at(-1)` - ES2022 array access
- `Promise.withResolvers()` - ES2024 promise creation
- `signal.throwIfAborted()` - Native AbortSignal method
- `AbortSignal.timeout()` - Native timeout signals
- `AbortSignal.any()` - Native signal composition

## Removed/Changed

### Removed Wrappers

Since we target Node.js 24+, these thin wrappers were removed:

| Removed | Native Replacement |
|---------|-------------------|
| `throwIfAborted(signal)` | `signal.throwIfAborted()` |
| `raceSignals(signals)` | `AbortSignal.any(signals)` |
| `timeoutSignal(ms)` | `AbortSignal.timeout(ms)` |

### API Changes

**`scope.stream()` return type changed:**
- Before: `AsyncGenerator<T>`
- After: `Stream<T>`

This is a breaking change for code that used `for await...of` directly:

```typescript
// Before (v1.6.x) - BREAKING
for await (const item of s.stream(source)) {
  // ...
}

// After (v1.7.0) - Use terminal operation
const [err, items] = await s.stream(source).toArray();
// Or iterate directly (Stream is AsyncIterable)
for await (const item of s.stream(source)) {
  // ...
}
```

## Migration Guide

### For Basic Collection

```typescript
// Before
const items = [];
for await (const item of s.stream(source)) {
  items.push(item);
}

// After
const [err, items] = await s.stream(source).toArray();
```

### For Transformations

```typescript
// Before - manual iteration
const results = [];
for await (const item of s.stream(source)) {
  const transformed = await process(item);
  if (transformed.active) {
    results.push(transformed);
    if (results.length >= 10) break;
  }
}

// After - composable stream
const [err, results] = await s.stream(source)
  .map(process)
  .filter(x => x.active)
  .take(10)
  .toArray();
```

## File Changes

| File | Changes |
|------|---------|
| `src/stream.ts` | New Stream class implementation |
| `src/scope.ts` | Updated `stream()` method to return Stream |
| `src/index.ts` | Export Stream class |
| `src/cancellation.ts` | Removed redundant wrappers |
| `docs/15-stream-api-design.md` | Complete API documentation |

## Stats

| Metric | Value |
|--------|-------|
| New Stream class | ~550 lines |
| Transformations | 16 lazy operations |
| Terminal operations | 10 operations |
| Test coverage | Needed |
| Breaking changes | 1 (stream() return type) |

## Next Steps

1. Add comprehensive test suite
2. Add performance benchmarks vs Effect Stream
3. Consider additional operators (throttle, debounce, mapAsync)
4. Documentation examples and recipes
