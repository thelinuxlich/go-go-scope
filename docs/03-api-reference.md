# API Reference

Complete reference for all functions, methods, and types in `go-go-scope`.

## Table of Contents

- [Functions](#functions)
  - [`scope(options?)`](#scopeoptions)
  - [ScopeOptions](#scopeoptions-type)
- [Scope Methods](#scope-methods)
  - [`scope.task(fn, options?)`](#scopetaskfn-options)
  - [TaskOptions](#taskoptions-type)
  - [`scope.provide(key, factory, cleanup?)`](#scopeprovidekey-factory-cleanup)
  - [`scope.use(key)`](#scopeusekey)
  - [`scope.race(factories)`](#scoperacefactories)
  - [`scope.parallel(factories, options?)`](#scopeparallelfactories-options)
  - [`scope.channel(capacity?)`](#scopechannelcapacity)
  - [`scope.stream(source)`](#scopestreamsource)
  - [`scope.poll(fn, onValue, options?)`](#scopepollfn-onvalue-options)
  - [`scope.debounce(fn, options?)](#scopedebouncefn-options)
  - [`scope.throttle(fn, options?)](#scopethrottlefn-options)
  - [`scope.select(cases)`](#scopeselectcases)
  - [`scope.metrics()`](#scopemetrics)
- [Types](#types)
  - [Result](#result)
  - [ScopeHooks](#scopehooks)
  - [ScopeMetrics](#scopemetrics-type)
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
| `options` | `ScopeOptions` | Optional configuration |

**Returns:** A `Scope` instance

**Example:**

```typescript
// Simple scope
await using s = scope()

// With timeout
await using s = scope({ timeout: 5000 })

// With OpenTelemetry tracing
await using s = scope({
  name: 'fetch-operation',
  tracer: trace.getTracer('my-app')
})

// With concurrency limit
await using s = scope({ concurrency: 3 })

// Combined
await using s = scope({
  name: 'complex-operation',
  timeout: 30000,
  concurrency: 5,
  tracer: trace.getTracer('my-app'),
  circuitBreaker: { failureThreshold: 3 }
})
```

---

### ScopeOptions (Type)

```typescript
interface ScopeOptions<ParentServices extends Record<string, unknown> = Record<string, never>> {
  /** 
   * Auto-abort after N milliseconds.
   * NOT inherited from parent.
   */
  timeout?: number
  
  /** 
   * Link to parent signal for cancellation propagation.
   */
  signal?: AbortSignal
  
  /** 
   * OpenTelemetry tracer (inherited from parent).
   */
  tracer?: Tracer
  
  /** 
   * Name for the scope span (default: "scope").
   */
  name?: string
  
  /** 
   * Max concurrent tasks (inherited from parent).
   */
  concurrency?: number
  
  /** 
   * Circuit breaker configuration (inherited from parent).
   */
  circuitBreaker?: {
    /** Failures before opening (default: 5) */
    failureThreshold?: number
    /** Milliseconds before retry (default: 30000) */
    resetTimeout?: number
  }
  
  /** 
   * Parent scope to inherit signal, services, and options.
   */
  parent?: Scope<ParentServices>

  /**
   * Lifecycle hooks for scope events.
   */
  hooks?: ScopeHooks

  /**
   * Enable metrics collection.
   * @default false
   */
  metrics?: boolean
}
```

**Examples:**

```typescript
// Timeout only
await using s = scope({ timeout: 5000 })

// With circuit breaker
await using s = scope({
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 10000
  }
})

// With parent (inherits services, tracer, etc.)
await using child = scope({ parent })

// With hooks for lifecycle events
await using s = scope({
  hooks: {
    beforeTask: (name, index) => console.log(`Starting ${name}`),
    afterTask: (name, duration, error) => {
      if (error) console.log(`${name} failed after ${duration}ms`)
      else console.log(`${name} succeeded after ${duration}ms`)
    },
    onCancel: (reason) => console.log('Scope cancelled:', reason),
    onDispose: (index, error) => {
      if (error) console.log(`Resource ${index} disposal failed`)
      else console.log(`Resource ${index} disposed`)
    }
  }
})

// With metrics collection
await using s = scope({ metrics: true })
const result = await s.task(() => fetchData())
console.log(s.metrics()) // { tasksSpawned: 1, tasksCompleted: 1, ... }
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

**Examples:**

```typescript
// Simple task
const [err, user] = await s.task(() => fetchUser(1))

// With signal for cancellation
const [err, data] = await s.task(async ({ signal }) => {
  const response = await fetch('/api/data', { signal })
  return response.json()
})

// With services from provide()
const [err, result] = await s.task(async ({ services }) => {
  return services.db.query('SELECT 1')
})

// With retry
const [err, user] = await s.task(
  () => fetchUser(id),
  { retry: { maxRetries: 3, delay: 1000 } }
)

// With OpenTelemetry tracing
const [err, user] = await s.task(
  () => fetchUser(id),
  {
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id }
    }
  }
)
```

---

### TaskOptions (Type)

```typescript
interface TaskOptions {
  /** 
   * OpenTelemetry tracing options.
   */
  otel?: {
    /** Span name (default: "scope.task") */
    name?: string
    /** Custom span attributes */
    attributes?: Record<string, unknown>
  }
  
  /** 
   * Retry configuration.
   */
  retry?: {
    /** Max retry attempts (default: 3) */
    maxRetries?: number
    /** 
     * Delay between retries in ms.
     * Can be a number or function: (attempt, error) => number
     */
    delay?: number | ((attempt: number, error: unknown) => number)
    /** Which errors to retry (default: all) */
    retryCondition?: (error: unknown) => boolean
    /** Callback on each retry */
    onRetry?: (error: unknown, attempt: number) => void
  }
  
  /** 
   * Timeout for this specific task (milliseconds).
   */
  timeout?: number
  
  /** 
   * Custom cleanup function - runs when parent scope exits.
   */
  onCleanup?: () => void | Promise<void>
}
```

**Examples:**

```typescript
// Retry with exponential backoff
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
    }
  }
)

// Conditional retry
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 3,
      retryCondition: (err) => err instanceof NetworkError
    }
  }
)

// With cleanup
const [err, result] = await s.task(
  async ({ signal }) => {
    const conn = await openConnection()
    return conn.query('SELECT * FROM users')
  },
  {
    onCleanup: () => {
      console.log('Task cleanup ran')
    }
  }
)
```

**Execution Order:**

When multiple options are specified, they execute in this order:
1. Scope Circuit Breaker (if scope has `circuitBreaker` option)
2. Scope Concurrency (if scope has `concurrency` option)
3. Retry (retry on failure)
4. Timeout (enforce time limit)
5. Result Wrapping (`task()` only)

---

### `scope.provide(key, factory, cleanup?)`

Registers a service/dependency that can be used by tasks in this scope. Services are automatically cleaned up when the scope exits.

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

// Access in tasks
const [err, result] = await s.task(({ services }) => {
  return services.db.query('SELECT 1')
})

if (err) throw err
return result
```

**Note:** Resources are disposed in LIFO order (reverse of creation).

---

### `scope.use(key)`

Retrieves a previously registered service by key.

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

Race multiple operations - first to complete wins, others are cancelled. Uses the scope's signal for cancellation.

```typescript
race<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[]
): Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |

**Returns:** `Promise<Result<unknown, T>>` - Result tuple of the winner

**Example:**

```typescript
await using s = scope()

const [err, winner] = await s.race([
  ({ signal }) => fetch('https://fast.com', { signal }),
  ({ signal }) => fetch('https://slow.com', { signal }),
])

if (err) {
  console.log('All racers failed:', err)
} else {
  console.log('Winner:', winner)
}
```

---

### `scope.parallel(factories, options?)`

Run factories in parallel. Uses the scope's concurrency limit and signal.

```typescript
parallel<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[]),
  options?: { failFast?: boolean }
): Promise<Result<unknown, T>[]>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.failFast` | `boolean` | If `true`, stops on first error and throws |

**Returns:** `Promise<Result<unknown, T>[]>` - Array of result tuples

**Examples:**

```typescript
await using s = scope({ concurrency: 3 })

// Default: failFast = false, returns Results for all tasks
const results = await s.parallel([
  () => fetchUser(1),  // might fail
  () => fetchUser(2),  // might fail
  () => fetchUser(3),  // might fail
])

for (const [err, user] of results) {
  if (err) console.log('Failed:', err)
  else console.log('User:', user)
}

// With failFast: throws on first error
try {
  await s.parallel([
    () => Promise.resolve('a'),
    () => Promise.reject(new Error('fail')),
  ], { failFast: true })
} catch (e) {
  // e is the Error
}
```

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
    await ch.send(item)  // Blocks if buffer full
  }
  ch.close()
})

// Consumer
for await (const item of ch) {
  await process(item)
}
```

---

### `scope.stream(source)`

Wrap an AsyncIterable with scope cancellation.

```typescript
stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `source` | `AsyncIterable<T>` | Source iterable |

**Returns:** `AsyncGenerator<T>` - Cancellable async generator

**Example:**

```typescript
await using s = scope()

for await (const chunk of s.stream(readableStream)) {
  await processChunk(chunk)
  // Automatically stops when scope is cancelled
}
```

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
  ({ signal }) => fetchConfig({ signal }),
  (config) => updateUI(config),
  { interval: 30000 }
)

// Check status
console.log(controller.status())

// Stop polling
controller.stop()

// Restart polling
controller.start()
```

---

### `scope.debounce(fn, options?)`

Creates a debounced function that delays invoking `fn` until after `wait` milliseconds have elapsed since the last time the debounced function was invoked. Automatically cancelled when the scope is disposed.

```typescript
debounce<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options?: {
    wait?: number      // Milliseconds to delay (default: 300)
    leading?: boolean  // Execute on leading edge (default: false)
    trailing?: boolean // Execute on trailing edge (default: true)
  }
): (...args: Args) => Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | Function | The function to debounce |
| `options.wait` | `number` | Milliseconds to delay (default: 300) |
| `options.leading` | `boolean` | Execute on leading edge (default: false) |
| `options.trailing` | `boolean` | Execute on trailing edge (default: true) |

**Returns:** A debounced function that returns a `Promise<Result<unknown, T>>`

**Example:**

```typescript
await using s = scope()

const search = s.debounce(async (query: string) => {
  const response = await fetch(`/api/search?q=${query}`)
  return response.json()
}, { wait: 300 })

// Will only execute 300ms after the last call
const [err, results] = await search("hello world")
```

---

### `scope.throttle(fn, options?)`

Creates a throttled function that only invokes `fn` at most once per every `interval` milliseconds. Automatically cancelled when the scope is disposed.

```typescript
throttle<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options?: {
    interval?: number  // Milliseconds between executions (default: 300)
    leading?: boolean  // Execute on leading edge (default: true)
    trailing?: boolean // Execute on trailing edge (default: false)
  }
): (...args: Args) => Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | Function | The function to throttle |
| `options.interval` | `number` | Milliseconds between executions (default: 300) |
| `options.leading` | `boolean` | Execute on leading edge (default: true) |
| `options.trailing` | `boolean` | Execute on trailing edge (default: false) |

**Returns:** A throttled function that returns a `Promise<Result<unknown, T>>`

**Example:**

```typescript
await using s = scope()

const save = s.throttle(async (data: string) => {
  await saveToServer(data)
}, { interval: 1000 })

// Executes at most once per second
await save("data1")
await save("data2") // Throttled, returns cached result
```

---

### `scope.select(cases)`

Waits on multiple channel operations, similar to Go's `select` statement. Blocks until one of the cases can run, then executes that case. Useful for coordinating between multiple channels.

```typescript
select<T>(
  cases: Map<Channel<unknown>, (value: unknown) => Promise<T> | T>
): Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `cases` | `Map<Channel, Function>` | Map of channels to handler functions |

**Returns:** `Promise<Result<unknown, T>>` - Result of the selected case

**Example:**

```typescript
await using s = scope()
const ch1 = s.channel<string>()
const ch2 = s.channel<number>()

// Send to channels from other tasks...
s.task(async () => {
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

---

### `scope.metrics()`

Returns current metrics for the scope if metrics were enabled in scope options.

```typescript
metrics(): ScopeMetrics | undefined
```

**Returns:** `ScopeMetrics` object or `undefined` if metrics not enabled

**Example:**

```typescript
await using s = scope({ metrics: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchUser(2))

const metrics = s.metrics()
console.log(metrics)
// {
//   tasksSpawned: 2,
//   tasksCompleted: 2,
//   tasksFailed: 0,
//   totalTaskDuration: 45.2,
//   avgTaskDuration: 22.6,
//   p95TaskDuration: 25.1,
//   resourcesRegistered: 0,
//   resourcesDisposed: 0
// }
```

---

## Types

### Result

```typescript
type Result<E, T> = readonly [E | undefined, T | undefined]
type Success<T> = readonly [undefined, T]
type Failure<E> = readonly [E, undefined]
```

A Result tuple is always `[error, value]`:
- On success: `[undefined, value]`
- On failure: `[error, undefined]`

**Example:**

```typescript
const [err, user] = await s.task(() => fetchUser(1))

if (err) {
  // Handle error
  console.log('Failed:', err)
} else {
  // Use user
  console.log('User:', user)
}
```

---

### ScopeHooks

Lifecycle hooks for scope events.

```typescript
interface ScopeHooks {
  /** Called before a task starts execution */
  beforeTask?: (taskName: string, taskIndex: number) => void
  
  /** Called after a task completes (success or failure) */
  afterTask?: (taskName: string, durationMs: number, error?: unknown) => void
  
  /** Called when the scope is cancelled */
  onCancel?: (reason: unknown) => void
  
  /** Called when a resource is disposed */
  onDispose?: (resourceIndex: number, error?: unknown) => void
}
```

**Example:**

```typescript
await using s = scope({
  hooks: {
    beforeTask: (name, index) => console.log(`Starting ${name}`),
    afterTask: (name, duration, error) => {
      if (error) console.log(`${name} failed: ${error}`)
      else console.log(`${name} completed in ${duration}ms`)
    },
    onCancel: (reason) => console.log('Scope cancelled:', reason),
    onDispose: (index, error) => console.log(`Resource ${index} disposed`)
  }
})
```

---

### ScopeMetrics (Type)

Metrics collected by a scope when `metrics: true` is passed to `scope()`.

```typescript
interface ScopeMetrics {
  /** Number of tasks spawned */
  tasksSpawned: number
  
  /** Number of tasks completed successfully */
  tasksCompleted: number
  
  /** Number of tasks that failed */
  tasksFailed: number
  
  /** Total task execution time in milliseconds */
  totalTaskDuration: number
  
  /** Average task duration in milliseconds */
  avgTaskDuration: number
  
  /** 95th percentile task duration (approximation) */
  p95TaskDuration: number
  
  /** Number of resources registered for cleanup */
  resourcesRegistered: number
  
  /** Number of resources successfully disposed */
  resourcesDisposed: number
  
  /** Scope duration in milliseconds (only available after disposal) */
  scopeDuration?: number
}
```

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

// Manually close the channel (when the scope ends, it closes its channels automatically too)
ch.close()
```
