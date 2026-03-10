# stream API Reference

> Auto-generated documentation for stream

## Table of Contents

- [Classs](#Classs)
  - [Stream](#stream)
  - [SharedStream](#sharedstream)
  - [BoundedQueue](#boundedqueue)
- [Methods](#Methods)
  - [Stream.map](#stream-map)
  - [Stream.filter](#stream-filter)
  - [Stream.flatMap](#stream-flatmap)
  - [Stream.flat](#stream-flat)
  - [Stream.tap](#stream-tap)
  - [Stream.catchAll](#stream-catchall)
  - [Stream.orElse](#stream-orelse)
  - [Stream.orElseIfEmpty](#stream-orelseifempty)
  - [Stream.orElseSucceed](#stream-orelsesucceed)
  - [Stream.catchError](#stream-catcherror)
  - [Stream.tapError](#stream-taperror)
  - [Stream.mapError](#stream-maperror)
  - [Stream.ensuring](#stream-ensuring)
  - [Stream.take](#stream-take)
  - [Stream.takeWhile](#stream-takewhile)
  - [Stream.takeUntil](#stream-takeuntil)
  - [Stream.drop](#stream-drop)
  - [Stream.dropWhile](#stream-dropwhile)
  - [Stream.dropUntil](#stream-dropuntil)
  - [Stream.skip](#stream-skip)
  - [Stream.filterMap](#stream-filtermap)
  - [Stream.groupAdjacentBy](#stream-groupadjacentby)
  - [Stream.scan](#stream-scan)
  - [Stream.buffer](#stream-buffer)
  - [Stream.bufferTime](#stream-buffertime)
  - [Stream.bufferTimeOrCount](#stream-buffertimeorcount)
  - [Stream.distinct](#stream-distinct)
  - [Stream.distinctBy](#stream-distinctby)
  - [Stream.distinctAdjacent](#stream-distinctadjacent)
  - [Stream.distinctAdjacentBy](#stream-distinctadjacentby)
  - [Stream.prepend](#stream-prepend)
  - [Stream.append](#stream-append)
  - [Stream.concat](#stream-concat)
  - [Stream.intersperse](#stream-intersperse)
  - [Stream.delay](#stream-delay)
  - [Stream.throttle](#stream-throttle)
  - [Stream.debounce](#stream-debounce)
  - [Stream.spaced](#stream-spaced)
  - [Stream.timeout](#stream-timeout)
  - [Stream.sample](#stream-sample)
  - [Stream.auditTime](#stream-audittime)
  - [Stream.merge](#stream-merge)
  - [Stream.zip](#stream-zip)
  - [Stream.zipWithIndex](#stream-zipwithindex)
  - [Stream.zipWith](#stream-zipwith)
  - [Stream.zipLatest](#stream-ziplatest)
  - [Stream.zipAll](#stream-zipall)
  - [Stream.interleave](#stream-interleave)
  - [Stream.cross](#stream-cross)
  - [Stream.collect](#stream-collect)
  - [Stream.collectWhile](#stream-collectwhile)
  - [Stream.grouped](#stream-grouped)
  - [Stream.groupedWithin](#stream-groupedwithin)
  - [Stream.groupByKey](#stream-groupbykey)
  - [Stream.switchMap](#stream-switchmap)
  - [Stream.pairwise](#stream-pairwise)
  - [Stream.window](#stream-window)
  - [Stream.concatMap](#stream-concatmap)
  - [Stream.exhaustMap](#stream-exhaustmap)
  - [Stream.share](#stream-share)
  - [Stream.partition](#stream-partition)
  - [Stream.splitAt](#stream-splitat)
  - [Stream.queueToGenerator](#stream-queuetogenerator)
  - [Stream.broadcast](#stream-broadcast)
  - [Stream.toArray](#stream-toarray)
  - [Stream.runDrain](#stream-rundrain)
  - [Stream.drain](#stream-drain)
  - [Stream.forEach](#stream-foreach)
  - [Stream.fold](#stream-fold)
  - [Stream.count](#stream-count)
  - [Stream.find](#stream-find)
  - [Stream.first](#stream-first)
  - [Stream.last](#stream-last)
  - [Stream.elementAt](#stream-elementat)
  - [Stream.some](#stream-some)
  - [Stream.every](#stream-every)
  - [Stream.includes](#stream-includes)
  - [Stream.groupBy](#stream-groupby)
  - [Stream.reduce](#stream-reduce)
  - [Stream.sum](#stream-sum)
  - [Stream.avg](#stream-avg)
  - [Stream.max](#stream-max)
  - [Stream.min](#stream-min)
  - [Stream.runHead](#stream-runhead)
  - [Stream.runLast](#stream-runlast)
  - [Stream.runSum](#stream-runsum)
  - [Stream.pipe](#stream-pipe)
  - [Stream.retry](#stream-retry)
  - [BoundedQueue.offer](#boundedqueue-offer)
  - [BoundedQueue.take](#boundedqueue-take)
  - [BoundedQueue.complete](#boundedqueue-complete)
  - [BoundedQueue.fail](#boundedqueue-fail)

## Classs

### Stream

```typescript
class Stream<T>
```

A lazy stream that processes async iterables with composable operations. The Stream class provides a powerful, functional API for processing asynchronous data streams. All operations are lazy - they don't execute until a terminal operation like `toArray()`, `forEach()`, or `runDrain()` is called. Streams integrate seamlessly with go-go-scope's structured concurrency system, automatically respecting scope cancellation and cleaning up resources. @template T - The type of values in the stream @example ```typescript import { scope } from 'go-go-scope' import { streamPlugin } from '@go-go-scope/stream' await using s = scope({ plugins: [streamPlugin] }) // Transform data with a pipeline of operations const [err, results] = await s.stream(fetchData())   .map(x => x * 2)   .filter(x => x > 10)   .take(5)   .toArray() ``` @example ```typescript // Real-world: Processing paginated API results const [err, users] = await s.stream(fetchUsers())   .flatMap(page => page.items)   .filter(user => user.isActive)   .map(user => ({     id: user.id,     name: user.name,     email: user.email.toLowerCase()   }))   .take(100)   .toArray() ``` @see streamPlugin for adding stream support to Scope @see {@link map} for transforming values @see {@link filter} for filtering values @see {@link toArray} for collecting results  #__PURE__

**Examples:**

```typescript
import { scope } from 'go-go-scope'
import { streamPlugin } from '@go-go-scope/stream'

await using s = scope({ plugins: [streamPlugin] })

// Transform data with a pipeline of operations
const [err, results] = await s.stream(fetchData())
  .map(x => x * 2)
  .filter(x => x > 10)
  .take(5)
  .toArray()
```

```typescript
// Real-world: Processing paginated API results
const [err, users] = await s.stream(fetchUsers())
  .flatMap(page => page.items)
  .filter(user => user.isActive)
  .map(user => ({
    id: user.id,
    name: user.name,
    email: user.email.toLowerCase()
  }))
  .take(100)
  .toArray()
```

**@template:** - The type of values in the stream

**@see:** {@link toArray} for collecting results

*Source: [index.ts:58](packages/stream/src/index.ts#L58)*

---

### SharedStream

```typescript
class SharedStream<T>
```

Shared stream for multicasting to multiple subscribers. All subscribers receive the same values from the source.

*Source: [index.ts:3129](packages/stream/src/index.ts#L3129)*

---

### BoundedQueue

```typescript
class BoundedQueue<T>
```

Bounded queue for stream distribution. Provides backpressure via blocking offer when full.

*Source: [index.ts:3276](packages/stream/src/index.ts#L3276)*

---

## Methods

### Stream.map

```typescript
Stream.map<R>(fn: (value: T, index: number) => R): Stream<R>
```

// ============================================================================ // Transformations // ============================================================================  Transform each value in the stream using the provided function. This operation is lazy - the transformation is only applied when values are consumed from the stream. The original stream is not modified. @template R - The return type of the transformation function @param fn - Transformation function that receives each value and its index @returns A new Stream with transformed values @example ```typescript await using s = scope() const numbers = s.stream([1, 2, 3, 4, 5]) const doubled = numbers.map(x => x * 2) const [err, result] = await doubled.toArray() // result: [2, 4, 6, 8, 10] ``` @example ```typescript // Chaining multiple operations const [err, result] = await s.stream(users)   .map(u => u.name)   .filter(name => name.length > 3)   .take(10)   .toArray() ``` @see {@link flatMap} for mapping to multiple values @see {@link filter} for filtering values @see {@link filterMap} for mapping and filtering in one operation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T, index: number) => R` | - Transformation function that receives each value and its index |

**Returns:** `Stream<R>`

A new Stream with transformed values

**Examples:**

```typescript
await using s = scope()

const numbers = s.stream([1, 2, 3, 4, 5])

const doubled = numbers.map(x => x * 2)

const [err, result] = await doubled.toArray()
// result: [2, 4, 6, 8, 10]
```

```typescript
// Chaining multiple operations
const [err, result] = await s.stream(users)
  .map(u => u.name)
  .filter(name => name.length > 3)
  .take(10)
  .toArray()
```

**@template:** - The return type of the transformation function

**@param:** - Transformation function that receives each value and its index

**@returns:** A new Stream with transformed values

**@see:** {@link filterMap} for mapping and filtering in one operation

*Source: [index.ts:156](packages/stream/src/index.ts#L156)*

---

### Stream.filter

```typescript
Stream.filter(predicate: (value: T, index: number) => boolean): Stream<T>
```

Filter values based on a predicate function. This operation is lazy - values are tested as they flow through, and only those matching the predicate are yielded. The original stream is not modified. @param predicate - Function that returns true for values to keep @returns A new Stream containing only values that match the predicate @example ```typescript await using s = scope() const [err, evens] = await s.stream([1, 2, 3, 4, 5, 6])   .filter(x => x % 2 === 0)   .toArray() // evens: [2, 4, 6] ``` @example ```typescript // Filtering with index const [err, result] = await s.stream(['a', 'b', 'c', 'd'])   .filter((_, index) => index % 2 === 0)   .toArray() // result: ['a', 'c'] ``` @see {@link filterMap} for filtering and mapping in one operation @see {@link map} for transforming values

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T, index: number) => boolean` | - Function that returns true for values to keep |

**Returns:** `Stream<T>`

A new Stream containing only values that match the predicate

**Examples:**

```typescript
await using s = scope()

const [err, evens] = await s.stream([1, 2, 3, 4, 5, 6])
  .filter(x => x % 2 === 0)
  .toArray()
// evens: [2, 4, 6]
```

```typescript
// Filtering with index
const [err, result] = await s.stream(['a', 'b', 'c', 'd'])
  .filter((_, index) => index % 2 === 0)
  .toArray()
// result: ['a', 'c']
```

**@param:** - Function that returns true for values to keep

**@returns:** A new Stream containing only values that match the predicate

**@see:** {@link map} for transforming values

*Source: [index.ts:204](packages/stream/src/index.ts#L204)*

---

### Stream.flatMap

```typescript
Stream.flatMap<R>(fn: (value: T, index: number) => Iterable<R> | AsyncIterable<R>): Stream<R>
```

Map and flatten in one operation. Applies a function to each value that returns an iterable, then flattens the results into a single stream. Useful for operations like fetching related data or expanding nested structures. This operation is lazy - flattening happens as values flow through. @template R - The type of values in the inner iterables @param fn - Function that returns an iterable for each value @returns A new Stream with all flattened values @example ```typescript await using s = scope() // Flatten arrays const [err, result] = await s.stream([[1, 2], [3, 4], [5, 6]])   .flatMap(arr => arr)   .toArray() // result: [1, 2, 3, 4, 5, 6] ``` @example ```typescript // Fetch related data for each item const [err, comments] = await s.stream(postIds)   .flatMap(async function* (id) {     const post = await fetchPost(id)     for (const comment of post.comments) {       yield comment     }   })   .take(50)   .toArray() ``` @see {@link map} for simple transformation @see {@link concatMap} for sequential flatMap @see {@link exhaustMap} for ignoring emissions during processing

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T, index: number) => Iterable<R> | AsyncIterable<R>` | - Function that returns an iterable for each value |

**Returns:** `Stream<R>`

A new Stream with all flattened values

**Examples:**

```typescript
await using s = scope()

// Flatten arrays
const [err, result] = await s.stream([[1, 2], [3, 4], [5, 6]])
  .flatMap(arr => arr)
  .toArray()
// result: [1, 2, 3, 4, 5, 6]
```

```typescript
// Fetch related data for each item
const [err, comments] = await s.stream(postIds)
  .flatMap(async function* (id) {
    const post = await fetchPost(id)
    for (const comment of post.comments) {
      yield comment
    }
  })
  .take(50)
  .toArray()
```

**@template:** - The type of values in the inner iterables

**@param:** - Function that returns an iterable for each value

**@returns:** A new Stream with all flattened values

**@see:** {@link exhaustMap} for ignoring emissions during processing

*Source: [index.ts:264](packages/stream/src/index.ts#L264)*

---

### Stream.flat

```typescript
Stream.flat<R>(this: Stream<Iterable<R> | AsyncIterable<R>>): Stream<R>
```

Flatten a stream of iterables. Lazy - flattens one level.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `this` | `Stream<Iterable<R> | AsyncIterable<R>>` |  |

**Returns:** `Stream<R>`

*Source: [index.ts:290](packages/stream/src/index.ts#L290)*

---

### Stream.tap

```typescript
Stream.tap(fn: (value: T) => void | Promise<void>): Stream<T>
```

Tap into the stream to perform side effects without modifying values. This operation is lazy - the side effect is executed as values flow through the stream. The original values are passed through unchanged. Useful for logging, debugging, or triggering external actions. @param fn - Side effect function that receives each value @returns A new Stream with the same values (unchanged) @example ```typescript await using s = scope() const [err, result] = await s.stream([1, 2, 3])   .tap(x => console.log('Processing:', x))   .map(x => x * 2)   .tap(x => console.log('Doubled:', x))   .toArray() // Logs: Processing: 1, Doubled: 2, Processing: 2, Doubled: 4, ... // result: [2, 4, 6] ``` @see {@link map} for transforming values @see {@link forEach} for terminal side effects

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => void | Promise<void>` | - Side effect function that receives each value |

**Returns:** `Stream<T>`

A new Stream with the same values (unchanged)

**Examples:**

```typescript
await using s = scope()

const [err, result] = await s.stream([1, 2, 3])
  .tap(x => console.log('Processing:', x))
  .map(x => x * 2)
  .tap(x => console.log('Doubled:', x))
  .toArray()
// Logs: Processing: 1, Doubled: 2, Processing: 2, Doubled: 4, ...
// result: [2, 4, 6]
```

**@param:** - Side effect function that receives each value

**@returns:** A new Stream with the same values (unchanged)

**@see:** {@link forEach} for terminal side effects

*Source: [index.ts:332](packages/stream/src/index.ts#L332)*

---

### Stream.catchAll

```typescript
Stream.catchAll<R>(handler: (error: unknown) => AsyncIterable<R>): Stream<T | R>
```

// ============================================================================ // Error Handling // ============================================================================  Catch errors and recover with a fallback stream. Lazy - catches errors as they occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(error: unknown) => AsyncIterable<R>` |  |

**Returns:** `Stream<T | R>`

*Source: [index.ts:357](packages/stream/src/index.ts#L357)*

---

### Stream.orElse

```typescript
Stream.orElse<R>(fallback: Stream<R>): Stream<T | R>
```

Transform failures into successes, or provide fallback for empty streams. On error, discards all values and yields from fallback instead. Lazy - catches errors as they occur, or uses fallback if stream is empty.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fallback` | `Stream<R>` |  |

**Returns:** `Stream<T | R>`

*Source: [index.ts:385](packages/stream/src/index.ts#L385)*

---

### Stream.orElseIfEmpty

```typescript
Stream.orElseIfEmpty<R>(fallback: Stream<R>): Stream<T | R>
```

Provide fallback if stream is empty (no values yielded). Lazy - uses fallback only if source completes without values.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fallback` | `Stream<R>` |  |

**Returns:** `Stream<T | R>`

*Source: [index.ts:421](packages/stream/src/index.ts#L421)*

---

### Stream.orElseSucceed

```typescript
Stream.orElseSucceed(fallback: T): Stream<T>
```

Provide a fallback value if the stream fails. Lazy - catches errors as they occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fallback` | `T` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:446](packages/stream/src/index.ts#L446)*

---

### Stream.catchError

```typescript
Stream.catchError<R>(handler: (error: unknown) => AsyncIterable<R>): Stream<T | R>
```

Alias for catchAll - catch errors and recover with a fallback stream. Lazy - catches errors as they occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(error: unknown) => AsyncIterable<R>` |  |

**Returns:** `Stream<T | R>`

*Source: [index.ts:458](packages/stream/src/index.ts#L458)*

---

### Stream.tapError

```typescript
Stream.tapError(fn: (error: unknown) => void | Promise<void>): Stream<T>
```

Tap into errors to perform side effects without modifying the error. Lazy - executes effect when errors occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(error: unknown) => void | Promise<void>` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:466](packages/stream/src/index.ts#L466)*

---

### Stream.mapError

```typescript
Stream.mapError(fn: (error: unknown) => unknown): Stream<T>
```

Transform errors using a mapping function. Lazy - transforms errors as they occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(error: unknown) => unknown` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:489](packages/stream/src/index.ts#L489)*

---

### Stream.ensuring

```typescript
Stream.ensuring(cleanup: () => void | Promise<void>): Stream<T>
```

Run a cleanup effect when the stream completes (success or error). Lazy - runs cleanup on completion.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `cleanup` | `() => void | Promise<void>` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:511](packages/stream/src/index.ts#L511)*

---

### Stream.take

```typescript
Stream.take(n: number): Stream<T>
```

// ============================================================================ // Slicing // ============================================================================  Take the first n elements from the stream. Limits the stream to at most n elements. After n elements have been yielded, the stream completes. If the source has fewer than n elements, all are yielded. This operation is lazy - it stops consuming after n elements. @param n - Number of elements to take (must be non-negative) @returns A new Stream with at most n elements @example ```typescript await using s = scope() const [err, result] = await s.stream([1, 2, 3, 4, 5])   .take(3)   .toArray() // result: [1, 2, 3] ``` @see {@link takeWhile} for conditional taking @see {@link takeUntil} for predicate-based taking @see {@link drop} for skipping elements

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` | - Number of elements to take (must be non-negative) |

**Returns:** `Stream<T>`

A new Stream with at most n elements

**Examples:**

```typescript
await using s = scope()

const [err, result] = await s.stream([1, 2, 3, 4, 5])
  .take(3)
  .toArray()
// result: [1, 2, 3]
```

**@param:** - Number of elements to take (must be non-negative)

**@returns:** A new Stream with at most n elements

**@see:** {@link drop} for skipping elements

*Source: [index.ts:559](packages/stream/src/index.ts#L559)*

---

### Stream.takeWhile

```typescript
Stream.takeWhile(predicate: (value: T) => boolean): Stream<T>
```

Take elements while predicate holds. Lazy - stops when predicate fails.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:581](packages/stream/src/index.ts#L581)*

---

### Stream.takeUntil

```typescript
Stream.takeUntil(predicate: (value: T) => boolean): Stream<T>
```

Take elements until predicate holds (inclusive). Lazy - stops when predicate succeeds, including that element.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:601](packages/stream/src/index.ts#L601)*

---

### Stream.drop

```typescript
Stream.drop(n: number): Stream<T>
```

Drop first n elements. Lazy - skips first n elements.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:621](packages/stream/src/index.ts#L621)*

---

### Stream.dropWhile

```typescript
Stream.dropWhile(predicate: (value: T) => boolean): Stream<T>
```

Drop elements while predicate holds. Lazy - skips while predicate holds.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:645](packages/stream/src/index.ts#L645)*

---

### Stream.dropUntil

```typescript
Stream.dropUntil(predicate: (value: T) => boolean): Stream<T>
```

Drop elements until predicate holds (inclusive). Lazy - skips until predicate succeeds, then yields that element and rest.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:669](packages/stream/src/index.ts#L669)*

---

### Stream.skip

```typescript
Stream.skip(n: number): Stream<T>
```

Alias for drop - skip first n elements.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:695](packages/stream/src/index.ts#L695)*

---

### Stream.filterMap

```typescript
Stream.filterMap<R>(fn: (value: T) => R | undefined | null): Stream<R>
```

Map and filter in one operation - returns Option-like behavior. Lazy - transforms and filters as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => R | undefined | null` |  |

**Returns:** `Stream<R>`

*Source: [index.ts:703](packages/stream/src/index.ts#L703)*

---

### Stream.groupAdjacentBy

```typescript
Stream.groupAdjacentBy<K>(keyFn: (value: T) => K): Stream<T[]>
```

Group consecutive elements by key function. Emits arrays of consecutive elements with the same key. Lazy - groups as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `keyFn` | `(value: T) => K` |  |

**Returns:** `Stream<T[]>`

*Source: [index.ts:726](packages/stream/src/index.ts#L726)*

---

### Stream.scan

```typescript
Stream.scan<R>(fn: (acc: R, value: T) => R, initial: R): Stream<R>
```

// ============================================================================ // Accumulating // ============================================================================  Scan (running fold) - emit intermediate results. Lazy - emits as values accumulate.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(acc: R, value: T) => R` |  |
| `initial` | `R` |  |

**Returns:** `Stream<R>`

*Source: [index.ts:773](packages/stream/src/index.ts#L773)*

---

### Stream.buffer

```typescript
Stream.buffer(size: number): Stream<T[]>
```

Buffer values into chunks. Lazy - buffers as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `size` | `number` |  |

**Returns:** `Stream<T[]>`

*Source: [index.ts:794](packages/stream/src/index.ts#L794)*

---

### Stream.bufferTime

```typescript
Stream.bufferTime(windowMs: number): Stream<T[]>
```

Buffer values into chunks within time windows. Emits chunks when size is reached OR when window expires. Lazy - buffers as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `windowMs` | `number` |  |

**Returns:** `Stream<T[]>`

*Source: [index.ts:821](packages/stream/src/index.ts#L821)*

---

### Stream.bufferTimeOrCount

```typescript
Stream.bufferTimeOrCount(windowMs: number, count: number): Stream<T[]>
```

Buffer values into chunks within time windows or when size limit is reached. Emits chunks when size is reached OR when window expires. Lazy - buffers as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `windowMs` | `number` |  |
| `count` | `number` |  |

**Returns:** `Stream<T[]>`

*Source: [index.ts:855](packages/stream/src/index.ts#L855)*

---

### Stream.distinct

```typescript
Stream.distinct(): Stream<T>
```

Emit only changed values (compared with ===). Lazy - filters duplicates as they occur.

**Returns:** `Stream<T>`

*Source: [index.ts:891](packages/stream/src/index.ts#L891)*

---

### Stream.distinctBy

```typescript
Stream.distinctBy<K>(keyFn: (value: T) => K): Stream<T>
```

Emit only changed values based on key function. Lazy - filters duplicates as they occur.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `keyFn` | `(value: T) => K` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:914](packages/stream/src/index.ts#L914)*

---

### Stream.distinctAdjacent

```typescript
Stream.distinctAdjacent(): Stream<T>
```

Emit only values different from the previous one. Lazy - filters consecutive duplicates.

**Returns:** `Stream<T>`

*Source: [index.ts:938](packages/stream/src/index.ts#L938)*

---

### Stream.distinctAdjacentBy

```typescript
Stream.distinctAdjacentBy<K>(keyFn: (value: T) => K): Stream<T>
```

Emit only values different from the previous one based on key function. Lazy - filters consecutive duplicates.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `keyFn` | `(value: T) => K` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:963](packages/stream/src/index.ts#L963)*

---

### Stream.prepend

```typescript
Stream.prepend(...values: T[]): Stream<T>
```

Prepend values to the stream. Lazy - prepends then continues with source.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `values` | `T[]` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:989](packages/stream/src/index.ts#L989)*

---

### Stream.append

```typescript
Stream.append(...values: T[]): Stream<T>
```

Append values to the stream. Lazy - appends after source completes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `values` | `T[]` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1012](packages/stream/src/index.ts#L1012)*

---

### Stream.concat

```typescript
Stream.concat(other: Stream<T>): Stream<T>
```

Concatenate another stream after this one. Lazy - continues with other after this completes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<T>` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1035](packages/stream/src/index.ts#L1035)*

---

### Stream.intersperse

```typescript
Stream.intersperse(separator: T): Stream<T>
```

Intersperse a separator between values. Lazy - intersperses as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `separator` | `T` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1058](packages/stream/src/index.ts#L1058)*

---

### Stream.delay

```typescript
Stream.delay(ms: number): Stream<T>
```

// ============================================================================ // Timing // ============================================================================  Add delay between elements. Lazy - delays as values flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1084](packages/stream/src/index.ts#L1084)*

---

### Stream.throttle

```typescript
Stream.throttle(options: { limit: number; interval: number }): Stream<T>
```

Throttle the stream (limit rate). Allows up to `limit` elements per `interval` milliseconds. This is useful for rate limiting streams to prevent overwhelming downstream consumers or APIs. This operation is lazy - throttles as values flow through. @param options - Throttle configuration options @param options.limit - Maximum number of elements to emit per interval (default: 1) @param options.interval - Time window in milliseconds (default: 1000) @returns A new Stream that emits throttled values @example ```typescript await using s = scope() // Allow up to 5 values per second const [_, results] = await s.stream(fastSource)   .throttle({ limit: 5, interval: 1000 })   .toArray() ``` @see {@link debounce} for waiting for quiet periods @see {@link auditTime} for emitting latest on interval

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `{ limit: number; interval: number }` | - Throttle configuration options |

**Returns:** `Stream<T>`

A new Stream that emits throttled values

**Examples:**

```typescript
await using s = scope()

// Allow up to 5 values per second
const [_, results] = await s.stream(fastSource)
  .throttle({ limit: 5, interval: 1000 })
  .toArray()
```

**@param:** - Time window in milliseconds (default: 1000)

**@returns:** A new Stream that emits throttled values

**@see:** {@link auditTime} for emitting latest on interval

*Source: [index.ts:1137](packages/stream/src/index.ts#L1137)*

---

### Stream.debounce

```typescript
Stream.debounce(ms: number): Stream<T>
```

Debounce the stream (wait for quiet period). Waits for `ms` milliseconds of silence (no new values) before emitting the most recent value. Useful for handling rapid-fire events like search input or resize events. This operation is lazy - emits only after the quiet period. @param ms - Quiet period duration in milliseconds @returns A new Stream that emits debounced values @example ```typescript await using s = scope() // Search as user types, but wait for pause await s.stream(searchInputEvents)   .debounce(300)   .forEach(({ query }) => {     return performSearch(query)   }) ``` @see {@link throttle} for rate limiting @see {@link auditTime} for emitting latest on interval

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` | - Quiet period duration in milliseconds |

**Returns:** `Stream<T>`

A new Stream that emits debounced values

**Examples:**

```typescript
await using s = scope()

// Search as user types, but wait for pause
await s.stream(searchInputEvents)
  .debounce(300)
  .forEach(({ query }) => {
    return performSearch(query)
  })
```

**@param:** - Quiet period duration in milliseconds

**@returns:** A new Stream that emits debounced values

**@see:** {@link auditTime} for emitting latest on interval

*Source: [index.ts:1213](packages/stream/src/index.ts#L1213)*

---

### Stream.spaced

```typescript
Stream.spaced(delayMs: number): Stream<T>
```

Add delay between elements (space them out). Waits the specified delay after yielding each element. Lazy - spaces elements as they flow through.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `delayMs` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1315](packages/stream/src/index.ts#L1315)*

---

### Stream.timeout

```typescript
Stream.timeout(durationMs: number): Stream<T>
```

Timeout the entire stream. Fails if stream doesn't complete within duration. Lazy - applies timeout to the entire stream.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `durationMs` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1324](packages/stream/src/index.ts#L1324)*

---

### Stream.sample

```typescript
Stream.sample(intervalMs: number): Stream<T>
```

Sample the stream at regular intervals. Emits the most recent value at each interval. Lazy - only samples when interval fires.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `intervalMs` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1375](packages/stream/src/index.ts#L1375)*

---

### Stream.auditTime

```typescript
Stream.auditTime(durationMs: number): Stream<T>
```

Audit time - emit the last value, then silence for duration. Unlike throttle which emits first then silences, audit waits for the duration then emits the most recent value. Lazy - applies timing per emission.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `durationMs` | `number` |  |

**Returns:** `Stream<T>`

*Source: [index.ts:1416](packages/stream/src/index.ts#L1416)*

---

### Stream.merge

```typescript
Stream.merge(other: Stream<T>): Stream<T>
```

// ============================================================================ // Combining // ============================================================================  Merge with another stream (interleave values). Consumes both streams concurrently and yields values from whichever stream produces them first. Values from both streams are interleaved in the order they arrive. This operation is lazy - merges as values arrive from either stream. @param other - Stream to merge with @returns A new Stream with interleaved values from both streams @example ```typescript await using s = scope() const stream1 = s.stream(interval(100)).map(() => 'A') const stream2 = s.stream(interval(150)).map(() => 'B') const [err, result] = await stream1.merge(stream2).take(5).toArray() // result might be: ['A', 'B', 'A', 'A', 'B'] (order depends on timing) ``` @see {@link concat} for sequential combination @see {@link zip} for pairing values @see {@link interleave} for round-robin combination

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<T>` | - Stream to merge with |

**Returns:** `Stream<T>`

A new Stream with interleaved values from both streams

**Examples:**

```typescript
await using s = scope()

const stream1 = s.stream(interval(100)).map(() => 'A')
const stream2 = s.stream(interval(150)).map(() => 'B')

const [err, result] = await stream1.merge(stream2).take(5).toArray()
// result might be: ['A', 'B', 'A', 'A', 'B'] (order depends on timing)
```

**@param:** - Stream to merge with

**@returns:** A new Stream with interleaved values from both streams

**@see:** {@link interleave} for round-robin combination

*Source: [index.ts:1485](packages/stream/src/index.ts#L1485)*

---

### Stream.zip

```typescript
Stream.zip<R>(other: Stream<R>): Stream<[T, R]>
```

Zip with another stream - pair elements. Pairs elements from both streams into tuples [T, R]. Stops when either stream ends. Both streams are consumed in lockstep. This operation is lazy - zips as values arrive from both streams. @template R - The type of values in the other stream @param other - Stream to zip with @returns A new Stream of tuples [T, R] @example ```typescript await using s = scope() const names = s.stream(['Alice', 'Bob', 'Carol']) const ages = s.stream([25, 30, 35]) const [err, result] = await names.zip(ages).toArray() // result: [['Alice', 25], ['Bob', 30], ['Carol', 35]] ``` @see {@link zipWith} for zipping with a combining function @see {@link zipWithIndex} for adding indices @see {@link zipLatest} for using latest values @see {@link zipAll} for continuing until both end

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<R>` | - Stream to zip with |

**Returns:** `Stream<[T, R]>`

A new Stream of tuples [T, R]

**Examples:**

```typescript
await using s = scope()

const names = s.stream(['Alice', 'Bob', 'Carol'])
const ages = s.stream([25, 30, 35])

const [err, result] = await names.zip(ages).toArray()
// result: [['Alice', 25], ['Bob', 30], ['Carol', 35]]
```

**@template:** - The type of values in the other stream

**@param:** - Stream to zip with

**@returns:** A new Stream of tuples [T, R]

**@see:** {@link zipAll} for continuing until both end

*Source: [index.ts:1592](packages/stream/src/index.ts#L1592)*

---

### Stream.zipWithIndex

```typescript
Stream.zipWithIndex(): Stream<[T, number]>
```

Zip with index. Lazy - adds index as values flow through.

**Returns:** `Stream<[T, number]>`

*Source: [index.ts:1627](packages/stream/src/index.ts#L1627)*

---

### Stream.zipWith

```typescript
Stream.zipWith<R, Z>(other: Stream<R>, fn: (a: T, b: R) => Z): Stream<Z>
```

Zip with another stream using a combining function. Stops when either stream ends. Lazy - zips as values arrive.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<R>` |  |
| `fn` | `(a: T, b: R) => Z` |  |

**Returns:** `Stream<Z>`

*Source: [index.ts:1636](packages/stream/src/index.ts#L1636)*

---

### Stream.zipLatest

```typescript
Stream.zipLatest<R>(other: Stream<R>): Stream<[T | undefined, R | undefined]>
```

Zip with another stream, using the latest value from each. Emits whenever either stream emits, using the most recent value from the other. Stops when either stream ends. Lazy - emits as values arrive. @example ```typescript const s1 = s.stream(interval(100)).map(() => 'a') const s2 = s.stream(interval(150)).map(() => 'b') const combined = s1.zipLatest(s2) // ['a', undefined], ['a', 'b'], ['a', 'b'], ... ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<R>` |  |

**Returns:** `Stream<[T | undefined, R | undefined]>`

**Examples:**

```typescript
const s1 = s.stream(interval(100)).map(() => 'a')
const s2 = s.stream(interval(150)).map(() => 'b')
const combined = s1.zipLatest(s2) // ['a', undefined], ['a', 'b'], ['a', 'b'], ...
```

*Source: [index.ts:1653](packages/stream/src/index.ts#L1653)*

---

### Stream.zipAll

```typescript
Stream.zipAll<R, D>(other: Stream<R>, defaultSelf: T, defaultOther: D): Stream<[T, R | D]>
```

Zip with another stream, padding the shorter stream with a default value. Continues until both streams end. Lazy - zips as values arrive. @example ```typescript const s1 = s.stream(fromArray([1, 2, 3])) const s2 = s.stream(fromArray(['a', 'b'])) const zipped = s1.zipAll(s2, 'default') // [1, 'a'], [2, 'b'], [3, 'default'] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<R>` |  |
| `defaultSelf` | `T` |  |
| `defaultOther` | `D` |  |

**Returns:** `Stream<[T, R | D]>`

**Examples:**

```typescript
const s1 = s.stream(fromArray([1, 2, 3]))
const s2 = s.stream(fromArray(['a', 'b']))
const zipped = s1.zipAll(s2, 'default') // [1, 'a'], [2, 'b'], [3, 'default']
```

*Source: [index.ts:1721](packages/stream/src/index.ts#L1721)*

---

### Stream.interleave

```typescript
Stream.interleave(...others: Stream<T>[]): Stream<T>
```

Interleave values from multiple streams fairly. Takes one value from each stream in round-robin fashion. Stops when all streams end. Lazy - interleaves as values arrive. @example ```typescript const s1 = s.stream(fromArray([1, 2, 3])) const s2 = s.stream(fromArray(['a', 'b', 'c'])) const interleaved = s1.interleave(s2) // 1, 'a', 2, 'b', 3, 'c' ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `others` | `Stream<T>[]` |  |

**Returns:** `Stream<T>`

**Examples:**

```typescript
const s1 = s.stream(fromArray([1, 2, 3]))
const s2 = s.stream(fromArray(['a', 'b', 'c']))
const interleaved = s1.interleave(s2) // 1, 'a', 2, 'b', 3, 'c'
```

*Source: [index.ts:1797](packages/stream/src/index.ts#L1797)*

---

### Stream.cross

```typescript
Stream.cross<R>(other: Stream<R>): Stream<[T, R]>
```

Cartesian product of two streams. Emits all combinations of values from both streams. Collects the entire 'other' stream into memory. Lazy for the primary stream, buffers the secondary. @example ```typescript const s1 = s.stream(fromArray([1, 2])) const s2 = s.stream(fromArray(['a', 'b'])) const product = s1.cross(s2) // [1, 'a'], [1, 'b'], [2, 'a'], [2, 'b'] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `other` | `Stream<R>` |  |

**Returns:** `Stream<[T, R]>`

**Examples:**

```typescript
const s1 = s.stream(fromArray([1, 2]))
const s2 = s.stream(fromArray(['a', 'b']))
const product = s1.cross(s2) // [1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']
```

*Source: [index.ts:1848](packages/stream/src/index.ts#L1848)*

---

### Stream.collect

```typescript
Stream.collect<R>(pf: (value: T) => R | undefined): Stream<R>
```

Collect values using a partial function. Only emits values where the partial function returns a non-undefined result. Lazy - filters and maps as values flow through. @example ```typescript // Parse numbers from mixed array const [_, nums] = await s.stream(['1', 'a', '2', 'b', '3'])   .collect((x) => {     const n = parseInt(x, 10);     return isNaN(n) ? undefined : n;   })   .toArray() // nums = [1, 2, 3] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pf` | `(value: T) => R | undefined` |  |

**Returns:** `Stream<R>`

**Examples:**

```typescript
// Parse numbers from mixed array
const [_, nums] = await s.stream(['1', 'a', '2', 'b', '3'])
  .collect((x) => {
    const n = parseInt(x, 10);
    return isNaN(n) ? undefined : n;
  })
  .toArray()
// nums = [1, 2, 3]
```

*Source: [index.ts:1898](packages/stream/src/index.ts#L1898)*

---

### Stream.collectWhile

```typescript
Stream.collectWhile<R>(pf: (value: T) => R | undefined): Stream<R>
```

Collect values using a partial function while it returns defined values. Stops when the partial function returns undefined for the first time. Lazy - collects while defined, then stops. @example ```typescript // Parse numbers until non-numeric string const [_, nums] = await s.stream(['1', '2', '3', 'stop', '4'])   .collectWhile((x) => {     const n = parseInt(x, 10);     return isNaN(n) ? undefined : n;   })   .toArray() // nums = [1, 2, 3] (stops at 'stop') ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pf` | `(value: T) => R | undefined` |  |

**Returns:** `Stream<R>`

**Examples:**

```typescript
// Parse numbers until non-numeric string
const [_, nums] = await s.stream(['1', '2', '3', 'stop', '4'])
  .collectWhile((x) => {
    const n = parseInt(x, 10);
    return isNaN(n) ? undefined : n;
  })
  .toArray()
// nums = [1, 2, 3] (stops at 'stop')
```

*Source: [index.ts:1933](packages/stream/src/index.ts#L1933)*

---

### Stream.grouped

```typescript
Stream.grouped(size: number): Stream<T[]>
```

Group elements into fixed-size chunks. Alias for `buffer(size)` with better semantics for grouping. Lazy - groups as values flow through. @example ```typescript const [_, groups] = await s.stream([1, 2, 3, 4, 5, 6, 7])   .grouped(3)   .toArray() // groups = [[1, 2, 3], [4, 5, 6], [7]] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `size` | `number` |  |

**Returns:** `Stream<T[]>`

**Examples:**

```typescript
const [_, groups] = await s.stream([1, 2, 3, 4, 5, 6, 7])
  .grouped(3)
  .toArray()
// groups = [[1, 2, 3], [4, 5, 6], [7]]
```

*Source: [index.ts:1965](packages/stream/src/index.ts#L1965)*

---

### Stream.groupedWithin

```typescript
Stream.groupedWithin(size: number, windowMs: number): Stream<T[]>
```

Group elements into chunks by size and/or time window. Emits a chunk when either the size limit is reached OR the time window expires. Lazy - groups as values flow through. @example ```typescript // Group by size (10 items) or time (100ms), whichever comes first const grouped = s.stream(source).groupedWithin(10, 100) // Yields: [[1,2,...,10], [11,12,...,20], ...] or partial groups after 100ms ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `size` | `number` |  |
| `windowMs` | `number` |  |

**Returns:** `Stream<T[]>`

**Examples:**

```typescript
// Group by size (10 items) or time (100ms), whichever comes first
const grouped = s.stream(source).groupedWithin(10, 100)
// Yields: [[1,2,...,10], [11,12,...,20], ...] or partial groups after 100ms
```

*Source: [index.ts:1981](packages/stream/src/index.ts#L1981)*

---

### Stream.groupByKey

```typescript
Stream.groupByKey<K>(keyFn: (value: T) => K): {
		groups: Map<K, Stream<T>>;
		done: Promise<void>;
	}
```

Group elements by a key function into substreams. Returns a Map where keys are the group keys and values are Streams of that group's elements. Each group stream buffers elements until consumed. Lazy - groups as values flow through. @example ```typescript const grouped = await s.stream(fromArray([1, 2, 3, 4, 5, 6])).groupByKey(x => x % 2 === 0 ? 'even' : 'odd') // await grouped.get('even').toArray() -> [2, 4, 6] // await grouped.get('odd').toArray() -> [1, 3, 5] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `keyFn` | `(value: T) => K` |  |

**Returns:** `{
		groups: Map<K, Stream<T>>;
		done: Promise<void>;
	}`

**Examples:**

```typescript
const grouped = await s.stream(fromArray([1, 2, 3, 4, 5, 6])).groupByKey(x => x % 2 === 0 ? 'even' : 'odd')
// await grouped.get('even').toArray() -> [2, 4, 6]
// await grouped.get('odd').toArray() -> [1, 3, 5]
```

*Source: [index.ts:2068](packages/stream/src/index.ts#L2068)*

---

### Stream.switchMap

```typescript
Stream.switchMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R>
```

// ============================================================================ // Advanced // ============================================================================  Switch map - cancel previous inner stream when new outer value arrives. Lazy - switches as outer values arrive. With synchronous outer streams, inner streams are cancelled after yielding their first value (reactive cancellation).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => AsyncIterable<R>` |  |

**Returns:** `Stream<R>`

*Source: [index.ts:2150](packages/stream/src/index.ts#L2150)*

---

### Stream.pairwise

```typescript
Stream.pairwise(): Stream<[T | undefined, T]>
```

Pairwise - emit [previous, current] tuples. Useful for computing diffs or detecting changes. @example ```typescript const [_, pairs] = await s.stream([1, 2, 3, 4])   .pairwise()   .toArray() // pairs = [[1, 2], [2, 3], [3, 4]] ```

**Returns:** `Stream<[T | undefined, T]>`

**Examples:**

```typescript
const [_, pairs] = await s.stream([1, 2, 3, 4])
  .pairwise()
  .toArray()
// pairs = [[1, 2], [2, 3], [3, 4]]
```

*Source: [index.ts:2269](packages/stream/src/index.ts#L2269)*

---

### Stream.window

```typescript
Stream.window(size: number): Stream<T[]>
```

Sliding window - emit arrays of up to `size` elements. Each new element shifts the window forward by one. @example ```typescript const [_, windows] = await s.stream([1, 2, 3, 4, 5])   .window(3)   .toArray() // windows = [[1, 2, 3], [2, 3, 4], [3, 4, 5]] ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `size` | `number` |  |

**Returns:** `Stream<T[]>`

**Examples:**

```typescript
const [_, windows] = await s.stream([1, 2, 3, 4, 5])
  .window(3)
  .toArray()
// windows = [[1, 2, 3], [2, 3, 4], [3, 4, 5]]
```

*Source: [index.ts:2305](packages/stream/src/index.ts#L2305)*

---

### Stream.concatMap

```typescript
Stream.concatMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R>
```

ConcatMap - sequential flatMap. Maps each value to an async iterable, then concatenates them in order. Unlike flatMap which interleaves results, concatMap waits for each inner iterable to complete before starting the next. @example ```typescript const [_, urls] = await s.stream([url1, url2])   .concatMap(url => fetchPages(url)) // fetchPages returns AsyncIterable   .toArray() ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => AsyncIterable<R>` |  |

**Returns:** `Stream<R>`

**Examples:**

```typescript
const [_, urls] = await s.stream([url1, url2])
  .concatMap(url => fetchPages(url)) // fetchPages returns AsyncIterable
  .toArray()
```

*Source: [index.ts:2342](packages/stream/src/index.ts#L2342)*

---

### Stream.exhaustMap

```typescript
Stream.exhaustMap<R>(fn: (value: T) => AsyncIterable<R>): Stream<R>
```

ExhaustMap - ignore new emissions while processing. Maps each value to an async iterable, but ignores new source values while the previous inner iterable is still running. @example ```typescript // Search input with exhaustMap - ignore new queries while fetching const results = s.stream(searchInput)   .exhaustMap(query => fetchResults(query)) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => AsyncIterable<R>` |  |

**Returns:** `Stream<R>`

**Examples:**

```typescript
// Search input with exhaustMap - ignore new queries while fetching
const results = s.stream(searchInput)
  .exhaustMap(query => fetchResults(query))
```

*Source: [index.ts:2373](packages/stream/src/index.ts#L2373)*

---

### Stream.share

```typescript
Stream.share(options?: { bufferSize?: number }): Stream<T>
```

Share - multicast to multiple subscribers. Returns a new Stream that can be subscribed to multiple times, with all subscribers receiving the same values. This is useful for broadcasting a single source to multiple consumers without re-executing the source for each subscriber. @param options - Share configuration options @param options.bufferSize - Number of values to buffer for late subscribers (default: 1) @returns A new shared Stream that multicasts to multiple subscribers @example ```typescript await using s = scope() const shared = s.stream(source).share({ bufferSize: 5 }); // Both subscribers receive the same values shared.forEach(v => console.log('A:', v)); shared.forEach(v => console.log('B:', v)); ``` @see {@link broadcast} for splitting into multiple independent streams

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `{ bufferSize?: number }` | - Share configuration options |

**Returns:** `Stream<T>`

A new shared Stream that multicasts to multiple subscribers

**Examples:**

```typescript
await using s = scope()

const shared = s.stream(source).share({ bufferSize: 5 });

// Both subscribers receive the same values
shared.forEach(v => console.log('A:', v));
shared.forEach(v => console.log('B:', v));
```

**@param:** - Number of values to buffer for late subscribers (default: 1)

**@returns:** A new shared Stream that multicasts to multiple subscribers

**@see:** {@link broadcast} for splitting into multiple independent streams

*Source: [index.ts:2457](packages/stream/src/index.ts#L2457)*

---

### Stream.partition

```typescript
Stream.partition(predicate: (value: T) => boolean, options?: { bufferSize?: number }): [Stream<T>, Stream<T>]
```

// ============================================================================ // Splitting // ============================================================================  Partition stream into two based on predicate. Returns [pass, fail] tuple where elements matching the predicate go to the first stream and non-matching elements go to the second. Uses queue-based distribution - each stream has an independent buffer. @param predicate - Function that returns true for values that should go to the first stream @param options - Partition configuration options @param options.bufferSize - Size of the buffer for each partition (default: 16) @returns A tuple of [passingStream, failingStream] @example ```typescript await using s = scope() const [evens, odds] = s.stream([1, 2, 3, 4, 5, 6]).partition(n => n % 2 === 0) const [_, evenArr] = await evens.toArray() // [2, 4, 6] const [__, oddArr] = await odds.toArray()   // [1, 3, 5] ``` @see {@link splitAt} for splitting at a specific position @see {@link broadcast} for broadcasting to multiple consumers

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` | - Function that returns true for values that should go to the first stream |
| `options` (optional) | `{ bufferSize?: number }` | - Partition configuration options |

**Returns:** `[Stream<T>, Stream<T>]`

A tuple of [passingStream, failingStream]

**Examples:**

```typescript
await using s = scope()

const [evens, odds] = s.stream([1, 2, 3, 4, 5, 6]).partition(n => n % 2 === 0)
const [_, evenArr] = await evens.toArray() // [2, 4, 6]
const [__, oddArr] = await odds.toArray()   // [1, 3, 5]
```

**@param:** - Size of the buffer for each partition (default: 16)

**@returns:** A tuple of [passingStream, failingStream]

**@see:** {@link broadcast} for broadcasting to multiple consumers

*Source: [index.ts:2492](packages/stream/src/index.ts#L2492)*

---

### Stream.splitAt

```typescript
Stream.splitAt(n: number, options?: { bufferSize?: number }): [Stream<T>, Stream<T>]
```

Split stream at position n into two streams. Returns [firstN, rest] tuple where the first stream contains the first n elements and the second stream contains the remaining elements. Uses queue-based distribution with independent consumption. @param n - Number of elements for the first stream @param options - Split configuration options @param options.bufferSize - Size of the buffer for each stream (default: 16) @returns A tuple of [firstNStream, restStream] @example ```typescript await using s = scope() const [head, tail] = s.stream([1, 2, 3, 4, 5, 6]).splitAt(3) const [_, firstThree] = await head.toArray() // [1, 2, 3] const [__, rest] = await tail.toArray()       // [4, 5, 6] ``` @see {@link partition} for splitting based on predicate @see {@link take} for taking only the first n elements @see {@link drop} for dropping the first n elements

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` | - Number of elements for the first stream |
| `options` (optional) | `{ bufferSize?: number }` | - Split configuration options |

**Returns:** `[Stream<T>, Stream<T>]`

A tuple of [firstNStream, restStream]

**Examples:**

```typescript
await using s = scope()

const [head, tail] = s.stream([1, 2, 3, 4, 5, 6]).splitAt(3)
const [_, firstThree] = await head.toArray() // [1, 2, 3]
const [__, rest] = await tail.toArray()       // [4, 5, 6]
```

**@param:** - Size of the buffer for each stream (default: 16)

**@returns:** A tuple of [firstNStream, restStream]

**@see:** {@link drop} for dropping the first n elements

*Source: [index.ts:2562](packages/stream/src/index.ts#L2562)*

---

### Stream.queueToGenerator

```typescript
Stream.queueToGenerator<R>(queue: BoundedQueue<R>): AsyncIterable<R>
```

Helper to convert a bounded queue to an async generator.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `queue` | `BoundedQueue<R>` |  |

**Returns:** `AsyncIterable<R>`

*Source: [index.ts:2612](packages/stream/src/index.ts#L2612)*

---

### Stream.broadcast

```typescript
Stream.broadcast(n: number, options?: { bufferSize?: number }): Stream<T>[]
```

Broadcast stream to multiple consumers. Returns an array of streams that all receive the same values from the source. Uses queue-based distribution with independent consumption, allowing each consumer to process at its own pace. Auto-registers with scope for cleanup. @param n - Number of streams to create @param options - Broadcast configuration options @param options.bufferSize - Size of the buffer for each consumer (default: 0, unbounded) @returns An array of streams, each receiving all values from the source @example ```typescript await using s = scope() const [stream1, stream2, stream3] = s.stream(source).broadcast(3, { bufferSize: 10 }) // Each consumer gets all values const [_, results1] = await stream1.toArray() const [__, results2] = await stream2.toArray() const [___, results3] = await stream3.toArray() ``` @see {@link share} for multicasting with shared subscription @see {@link partition} for splitting based on predicate

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` | - Number of streams to create |
| `options` (optional) | `{ bufferSize?: number }` | - Broadcast configuration options |

**Returns:** `Stream<T>[]`

An array of streams, each receiving all values from the source

**Examples:**

```typescript
await using s = scope()

const [stream1, stream2, stream3] = s.stream(source).broadcast(3, { bufferSize: 10 })

// Each consumer gets all values
const [_, results1] = await stream1.toArray()
const [__, results2] = await stream2.toArray()
const [___, results3] = await stream3.toArray()
```

**@param:** - Size of the buffer for each consumer (default: 0, unbounded)

**@returns:** An array of streams, each receiving all values from the source

**@see:** {@link partition} for splitting based on predicate

*Source: [index.ts:2652](packages/stream/src/index.ts#L2652)*

---

### Stream.toArray

```typescript
Stream.toArray(): Promise<Result<unknown, T[]>>
```

// ============================================================================ // Terminal Operations // ============================================================================  Collect all values from the stream into an array. This is a terminal operation that consumes the entire stream and collects all values into an array. Returns a Result tuple for type-safe error handling. @returns A Promise resolving to a Result tuple [error, values] @example ```typescript await using s = scope() const [err, values] = await s.stream([1, 2, 3, 4, 5])   .filter(x => x % 2 === 0)   .toArray() // values: [2, 4] ``` @see {@link forEach} for iterating without collecting @see {@link runDrain} for consuming without collecting

**Returns:** `Promise<Result<unknown, T[]>>`

A Promise resolving to a Result tuple [error, values]

**Examples:**

```typescript
await using s = scope()

const [err, values] = await s.stream([1, 2, 3, 4, 5])
  .filter(x => x % 2 === 0)
  .toArray()
// values: [2, 4]
```

**@returns:** A Promise resolving to a Result tuple [error, values]

**@see:** {@link runDrain} for consuming without collecting

*Source: [index.ts:2720](packages/stream/src/index.ts#L2720)*

---

### Stream.runDrain

```typescript
Stream.runDrain(): Promise<Result<unknown, void>>
```

Run the stream and discard values. Useful for side effects.

**Returns:** `Promise<Result<unknown, void>>`

*Source: [index.ts:2736](packages/stream/src/index.ts#L2736)*

---

### Stream.drain

```typescript
Stream.drain(): Promise<Result<unknown, void>>
```

Alias for runDrain - consumes the stream without collecting values.

**Returns:** `Promise<Result<unknown, void>>`

*Source: [index.ts:2750](packages/stream/src/index.ts#L2750)*

---

### Stream.forEach

```typescript
Stream.forEach(fn: (value: T) => void | Promise<void>): Promise<Result<unknown, void>>
```

Execute effect for each value. Similar to forEach but returns Result tuple.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => void | Promise<void>` |  |

**Returns:** `Promise<Result<unknown, void>>`

*Source: [index.ts:2758](packages/stream/src/index.ts#L2758)*

---

### Stream.fold

```typescript
Stream.fold<R>(initial: R, fn: (acc: R, value: T) => R): Promise<Result<unknown, R>>
```

Fold the stream into a single value. Returns Result tuple for type-safe error handling.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `initial` | `R` |  |
| `fn` | `(acc: R, value: T) => R` |  |

**Returns:** `Promise<Result<unknown, R>>`

*Source: [index.ts:2775](packages/stream/src/index.ts#L2775)*

---

### Stream.count

```typescript
Stream.count(): Promise<Result<unknown, number>>
```

Count elements in the stream.

**Returns:** `Promise<Result<unknown, number>>`

*Source: [index.ts:2793](packages/stream/src/index.ts#L2793)*

---

### Stream.find

```typescript
Stream.find(predicate: (value: T) => boolean): Promise<Result<unknown, T | undefined>>
```

Find first element matching predicate. Returns undefined if not found.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2801](packages/stream/src/index.ts#L2801)*

---

### Stream.first

```typescript
Stream.first(): Promise<Result<unknown, T | undefined>>
```

Get first element. Returns undefined if empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2820](packages/stream/src/index.ts#L2820)*

---

### Stream.last

```typescript
Stream.last(): Promise<Result<unknown, T | undefined>>
```

Get last element. Returns undefined if empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2828](packages/stream/src/index.ts#L2828)*

---

### Stream.elementAt

```typescript
Stream.elementAt(index: number): Promise<Result<unknown, T | undefined>>
```

Get element at specific index. Returns undefined if index is out of bounds.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `index` | `number` |  |

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2844](packages/stream/src/index.ts#L2844)*

---

### Stream.some

```typescript
Stream.some(predicate: (value: T) => boolean): Promise<Result<unknown, boolean>>
```

Check if any element satisfies predicate.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Promise<Result<unknown, boolean>>`

*Source: [index.ts:2865](packages/stream/src/index.ts#L2865)*

---

### Stream.every

```typescript
Stream.every(predicate: (value: T) => boolean): Promise<Result<unknown, boolean>>
```

Check if all elements satisfy predicate.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` |  |

**Returns:** `Promise<Result<unknown, boolean>>`

*Source: [index.ts:2876](packages/stream/src/index.ts#L2876)*

---

### Stream.includes

```typescript
Stream.includes(value: T): Promise<Result<unknown, boolean>>
```

Check if stream includes a value (using ===).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` |  |

**Returns:** `Promise<Result<unknown, boolean>>`

*Source: [index.ts:2894](packages/stream/src/index.ts#L2894)*

---

### Stream.groupBy

```typescript
Stream.groupBy<K>(keyFn: (value: T) => K): Promise<Result<unknown, Map<K, T[]>>>
```

Group elements by key function. Materializes all values into a Map.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `keyFn` | `(value: T) => K` |  |

**Returns:** `Promise<Result<unknown, Map<K, T[]>>>`

*Source: [index.ts:2902](packages/stream/src/index.ts#L2902)*

---

### Stream.reduce

```typescript
Stream.reduce(fn: (acc: T, value: T) => T): Promise<Result<unknown, T | undefined>>
```

Reduce to a single value. Returns Result tuple for type-safe error handling.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(acc: T, value: T) => T` |  |

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2926](packages/stream/src/index.ts#L2926)*

---

### Stream.sum

```typescript
Stream.sum(): Promise<Result<unknown, number>>
```

Sum all numeric values.

**Returns:** `Promise<Result<unknown, number>>`

*Source: [index.ts:2949](packages/stream/src/index.ts#L2949)*

---

### Stream.avg

```typescript
Stream.avg(): Promise<Result<unknown, number | undefined>>
```

Calculate the average of numeric values. Returns undefined if stream is empty.

**Returns:** `Promise<Result<unknown, number | undefined>>`

*Source: [index.ts:2957](packages/stream/src/index.ts#L2957)*

---

### Stream.max

```typescript
Stream.max(): Promise<Result<unknown, T | undefined>>
```

Get the maximum value. Returns undefined if stream is empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2971](packages/stream/src/index.ts#L2971)*

---

### Stream.min

```typescript
Stream.min(): Promise<Result<unknown, T | undefined>>
```

Get the minimum value. Returns undefined if stream is empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:2987](packages/stream/src/index.ts#L2987)*

---

### Stream.runHead

```typescript
Stream.runHead(): Promise<Result<unknown, T | undefined>>
```

Get the first element. Alias for `first()` - follows Effect naming convention. Returns undefined if stream is empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:3004](packages/stream/src/index.ts#L3004)*

---

### Stream.runLast

```typescript
Stream.runLast(): Promise<Result<unknown, T | undefined>>
```

Get the last element. Alias for `last()` - follows Effect naming convention. Returns undefined if stream is empty.

**Returns:** `Promise<Result<unknown, T | undefined>>`

*Source: [index.ts:3013](packages/stream/src/index.ts#L3013)*

---

### Stream.runSum

```typescript
Stream.runSum(): Promise<Result<unknown, number>>
```

Sum all numeric values. Alias for `sum()` - follows Effect naming convention.

**Returns:** `Promise<Result<unknown, number>>`

*Source: [index.ts:3021](packages/stream/src/index.ts#L3021)*

---

### Stream.pipe

```typescript
Stream.pipe<U>(...fns: Array<(stream: Stream<T>) => Stream<U>>): Stream<U>
```

Pipe the stream through a series of transformation functions. Enables functional composition of stream operations by applying a chain of transformation functions in order. @template U - The type of values in the resulting stream @param fns - Array of transformation functions to apply @returns A new Stream transformed by all functions in the pipe @example ```typescript await using s = scope() const [_, result] = await s.stream([1, 2, 3, 4, 5])   .pipe(     s => s.filter(x => x % 2 === 0),     s => s.map(x => x * 10),     s => s.take(2)   )   .toArray() // result: [20, 40] ``` @see {@link map} for single transformation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fns` | `Array<(stream: Stream<T>) => Stream<U>>` | - Array of transformation functions to apply |

**Returns:** `Stream<U>`

A new Stream transformed by all functions in the pipe

**Examples:**

```typescript
await using s = scope()

const [_, result] = await s.stream([1, 2, 3, 4, 5])
  .pipe(
    s => s.filter(x => x % 2 === 0),
    s => s.map(x => x * 10),
    s => s.take(2)
  )
  .toArray()
// result: [20, 40]
```

**@template:** - The type of values in the resulting stream

**@param:** - Array of transformation functions to apply

**@returns:** A new Stream transformed by all functions in the pipe

**@see:** {@link map} for single transformation

*Source: [index.ts:3051](packages/stream/src/index.ts#L3051)*

---

### Stream.retry

```typescript
Stream.retry(options?: { max?: number; delay?: number }): Stream<T>
```

Retry the stream on failure with configurable delay. When the stream encounters an error, it will automatically retry up to `max` times with a `delay` milliseconds between attempts. If all retries are exhausted, the error is re-thrown. This operation is eager - retries immediately on failure. @param options - Retry configuration options @param options.max - Maximum number of retry attempts (default: 3) @param options.delay - Delay in milliseconds between retry attempts (default: 0) @returns A new Stream with retry logic applied @example ```typescript await using s = scope() // Retry up to 5 times with 1 second delay between attempts const [_, results] = await s.stream(unreliableSource)   .retry({ max: 5, delay: 1000 })   .toArray() ``` @see {@link catchAll} for catching errors without retrying @see {@link orElse} for providing a fallback stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `{ max?: number; delay?: number }` | - Retry configuration options |

**Returns:** `Stream<T>`

A new Stream with retry logic applied

**Examples:**

```typescript
await using s = scope()

// Retry up to 5 times with 1 second delay between attempts
const [_, results] = await s.stream(unreliableSource)
  .retry({ max: 5, delay: 1000 })
  .toArray()
```

**@param:** - Delay in milliseconds between retry attempts (default: 0)

**@returns:** A new Stream with retry logic applied

**@see:** {@link orElse} for providing a fallback stream

*Source: [index.ts:3083](packages/stream/src/index.ts#L3083)*

---

### BoundedQueue.offer

```typescript
BoundedQueue.offer(value: T, signal: AbortSignal): Promise<void>
```

Offer a value to the queue. Blocks if queue is full until space is available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` |  |
| `signal` | `AbortSignal` |  |

**Returns:** `Promise<void>`

*Source: [index.ts:3295](packages/stream/src/index.ts#L3295)*

---

### BoundedQueue.take

```typescript
BoundedQueue.take(signal: AbortSignal): Promise<QueueResult<T>>
```

Take a value from the queue. Blocks until value is available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `AbortSignal` |  |

**Returns:** `Promise<QueueResult<T>>`

*Source: [index.ts:3360](packages/stream/src/index.ts#L3360)*

---

### BoundedQueue.complete

```typescript
BoundedQueue.complete(): void
```

Mark queue as complete.

**Returns:** `void`

*Source: [index.ts:3413](packages/stream/src/index.ts#L3413)*

---

### BoundedQueue.fail

```typescript
BoundedQueue.fail(err: unknown): void
```

Mark queue as failed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `err` | `unknown` |  |

**Returns:** `void`

*Source: [index.ts:3432](packages/stream/src/index.ts#L3432)*

---

