# API Reference

Complete reference for all functions, methods, and types in `go-go-scope`.

## Table of Contents

- [Functions](#functions)
  - [`scope(options?)`](#scopeoptions)
  - [`race(factories, options?)`](#racefactories-options)
  - [`parallel(factories, options?)`](#parallelfactories-options)
  - [`stream(source, signal?)`](#streamsource-signal)
- [Scope Methods](#scope-methods)
  - [`scope.task(fn, options?)`](#scopetaskfn-options)
  - [`scope.provide(key, factory, cleanup?)`](#scopeprovidekey-factory-cleanup)
  - [`scope.use(key)`](#scopeusekey)
  - [`scope.race(factories)`](#scoperacefactories)
  - [`scope.parallel(factories, options?)`](#scopeparallelfactories-options)
  - [`scope.channel(capacity?)`](#scopechannelcapacity)
  - [`scope.stream(source)`](#scopestreamsource)
  - [`scope.poll(fn, onValue, options?)`](#scopepollfn-onvalue-options)
- [Types](#types)
  - [ScopeOptions](#scopeoptions)
  - [TaskOptions](#taskoptions)
  - [Result](#result)
- [Task Properties](#task-properties)
- [Channel Methods](#channel-methods)

---

## Functions

### `scope(options?)`

Creates a new scope for structured concurrency.

```typescript
function scope<TServices extends Record<string, unknown> = Record<string, unknown>>(
  options?: ScopeOptions<TServices>
): Scope<TServices>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `ScopeOptions` | Optional configuration (see below) |

**Returns:** A `Scope` instance

**Example:**

```typescript
// Simple scope
await using s = scope()

// With timeout
await using s = scope({ timeout: 5000 })

// With parent
await using child = scope({ parent })
```

---

### `race(factories, options?)`

Race multiple operations - first to complete wins, others are cancelled.

```typescript
function race<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[],
  options?: RaceOptions
): Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.signal` | `AbortSignal` | Optional signal for cancellation |
| `options.tracer` | `Tracer` | Optional OpenTelemetry tracer |

**Returns:** `Promise<Result<unknown, T>>` - Result tuple of the winner

**Example:**

```typescript
const [err, winner] = await race([
  (signal) => fetch('https://fast.com', { signal }),
  (signal) => fetch('https://slow.com', { signal }),
])
```

---

### `parallel(factories, options?)`

Run factories in parallel with optional concurrency limit.

```typescript
function parallel<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[],
  options?: {
    concurrency?: number
    signal?: AbortSignal
    failFast?: boolean
    tracer?: Tracer
  }
): Promise<Result<unknown, T>[]>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.concurrency` | `number` | Max concurrent operations (0 = unlimited) |
| `options.signal` | `AbortSignal` | Optional signal for cancellation |
| `options.failFast` | `boolean` | If true, stops on first error and throws |
| `options.tracer` | `Tracer` | Optional OpenTelemetry tracer |

**Returns:** `Promise<Result<unknown, T>[]>` - Array of result tuples

**Example:**

```typescript
const results = await parallel(
  urls.map(url => (signal) => fetch(url, { signal })),
  { concurrency: 3 }
)

for (const [err, response] of results) {
  if (err) console.log('Failed:', err)
  else console.log('Success:', response)
}
```

---

### `stream(source, signal?)`

Wrap an AsyncIterable with cancellation support.

```typescript
function stream<T>(
  source: AsyncIterable<T>,
  signal?: AbortSignal
): AsyncGenerator<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `source` | `AsyncIterable<T>` | The source iterable |
| `signal` | `AbortSignal` | Optional signal for cancellation |

**Returns:** `AsyncGenerator<T>` - Cancellable async generator

**Example:**

```typescript
for await (const chunk of stream(readableStream, signal)) {
  await processChunk(chunk)
}
```

---

## Scope Methods

### `scope.task(fn, options?)`

Spawns a task within the scope.

```typescript
task<T>(
  fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>,
  options?: TaskOptions
): Task<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | Function | Task function receiving `{ services, signal }` |
| `options` | `TaskOptions` | Optional task configuration |

**Returns:** `Task<Result<unknown, T>>` - A lazy task (starts when awaited)

**Example:**

```typescript
const [err, user] = await s.task(
  async ({ services, signal }) => {
    return fetchUser(1, { signal })
  },
  { retry: { maxRetries: 3 } }
)
```

---

### `scope.provide(key, factory, cleanup?)`

Registers a service for dependency injection.

```typescript
provide<K extends string, T>(
  key: K,
  factory: () => T,
  cleanup?: (service: T) => void | Promise<void>
): Scope<Services & Record<K, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Service identifier |
| `factory` | `() => T` | Function to create the service |
| `cleanup` | `(T) => void \| Promise<void>` | Optional cleanup function |

**Returns:** `Scope` with updated types

**Example:**

```typescript
await using s = scope()
  .provide('db', () => openDatabase(), (db) => db.close())
  .provide('cache', () => createCache())

// Access in task
const [err, result] = await s.task(({ services }) => {
  return services.db.query('SELECT 1')
})
```

---

### `scope.use(key)`

Retrieves a previously registered service.

```typescript
use<K extends keyof Services>(key: K): Services[K]
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Service identifier |

**Returns:** The service instance

**Example:**

```typescript
const db = s.use('db')
await db.query('SELECT 1')
```

---

### `scope.race(factories)`

Race multiple operations within this scope.

```typescript
race<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[]
): Promise<Result<unknown, T>>
```

Same as standalone `race()` but uses the scope's signal and tracer.

---

### `scope.parallel(factories, options?)`

Run factories in parallel within this scope.

```typescript
parallel<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[]),
  options?: { failFast?: boolean }
): Promise<Result<unknown, T>[]>
```

Same as standalone `parallel()` but uses the scope's signal, tracer, and concurrency limit.

---

### `scope.channel(capacity?)`

Create a Go-style channel within this scope.

```typescript
channel<T>(capacity?: number): Channel<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `capacity` | `number` | Buffer size (default: 0) |

**Returns:** `Channel<T>`

**Example:**

```typescript
await using s = scope()
const ch = s.channel<string>(100)

// Producer
s.task(async () => {
  for (const item of items) {
    await ch.send(item)
  }
  ch.close()
})

// Consumer
for await (const item of ch) {
  console.log(item)
}
```

---

### `scope.stream(source)`

Wrap an AsyncIterable with scope cancellation.

```typescript
stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>
```

Same as standalone `stream()` but uses the scope's signal.

---

### `scope.poll(fn, onValue, options?)`

Poll a function at regular intervals.

```typescript
poll<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  onValue: (value: T) => void | Promise<void>,
  options?: {
    interval?: number
    immediate?: boolean
  }
): PollController
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | Function | Function to poll |
| `onValue` | Function | Callback with the value |
| `options.interval` | `number` | Milliseconds between polls (default: 5000) |
| `options.immediate` | `boolean` | Run immediately (default: true) |

**Returns:** `PollController` with `start()`, `stop()`, and `status()` methods

**Example:**

```typescript
await using s = scope()

const controller = s.poll(
  ({ signal }) => fetchStatus({ signal }),
  (status) => updateUI(status),
  { interval: 30000 }
)

// Check status
console.log(controller.status())

// Stop polling
controller.stop()
```

---

## Types

### ScopeOptions

```typescript
interface ScopeOptions<ParentServices extends Record<string, unknown> = Record<string, never>> {
  /** Auto-abort after N milliseconds (NOT inherited from parent) */
  timeout?: number
  
  /** Link to parent signal for cancellation propagation */
  signal?: AbortSignal
  
  /** OpenTelemetry tracer (inherited from parent) */
  tracer?: Tracer
  
  /** Name for the scope span (default: "scope") */
  name?: string
  
  /** Max concurrent tasks (inherited from parent) */
  concurrency?: number
  
  /** Circuit breaker configuration (inherited from parent) */
  circuitBreaker?: {
    failureThreshold?: number  // Default: 5
    resetTimeout?: number      // Default: 30000
  }
  
  /** Parent scope to inherit signal, services, and options */
  parent?: Scope<ParentServices>
}
```

---

### TaskOptions

```typescript
interface TaskOptions {
  /** OpenTelemetry tracing options */
  otel?: {
    name?: string
    attributes?: Record<string, unknown>
  }
  
  /** Retry configuration */
  retry?: {
    maxRetries?: number
    delay?: number | ((attempt: number, error: unknown) => number)
    retryCondition?: (error: unknown) => boolean
    onRetry?: (error: unknown, attempt: number) => void
  }
  
  /** Timeout for this specific task (milliseconds) */
  timeout?: number
  
  /** Custom cleanup function */
  onCleanup?: () => void | Promise<void>
}
```

---

### Result

```typescript
type Result<E, T> = readonly [E | undefined, T | undefined]
type Success<T> = readonly [undefined, T]
type Failure<E> = readonly [E, undefined]
```

A Result tuple is always `[error, value]`:
- On success: `[undefined, value]`
- On failure: `[error, undefined]`

---

## Task Properties

Tasks implement `PromiseLike` and `Disposable`:

```typescript
interface Task<T> extends PromiseLike<T>, Disposable {
  /** Unique task ID */
  readonly id: number
  
  /** Get the AbortSignal for this task */
  readonly signal: AbortSignal
  
  /** Check if task has started */
  readonly isStarted: boolean
  
  /** Check if task has settled */
  readonly isSettled: boolean
  
  /** Dispose without executing */
  [Symbol.dispose](): void
}
```

---

## Channel Methods

Channels implement `AsyncIterable` and `AsyncDisposable`:

```typescript
interface Channel<T> extends AsyncIterable<T>, AsyncDisposable {
  /** Send a value (blocks if buffer full) */
  send(value: T): Promise<boolean>
  
  /** Receive a value (returns undefined if closed) */
  receive(): Promise<T | undefined>
  
  /** Close the channel */
  close(): void
  
  /** Check if closed */
  readonly isClosed: boolean
  
  /** Current buffer size */
  readonly size: number
  
  /** Buffer capacity */
  readonly cap: number
  
  /** Async iterator */
  [Symbol.asyncIterator](): AsyncIterator<T>
  
  /** Dispose */
  [Symbol.asyncDispose](): Promise<void>
}
```

**Example:**

```typescript
await using s = scope()
const ch = s.channel<number>(10)

// Send values
await ch.send(1)
await ch.send(2)

// Receive values
const val1 = await ch.receive()  // 1
const val2 = await ch.receive()  // 2

// Close
ch.close()
```
