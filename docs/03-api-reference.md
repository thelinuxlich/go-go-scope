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
  - [`scope.has(key)`](#scopehaskey)
  - [`scope.override(key, factory, cleanup?)`](#scopeoverridekey-factory-cleanup)
  - [`scope.race(factories)`](#scoperacefactories)
  - [`scope.parallel(factories, options?)`](#scopeparallelfactories-options)
  - [`scope.channel(capacity?)`](#scopechannelcapacity)
  - [`scope.stream(source)`](#scopestreamsource)
  - [`scope.poll(fn, onValue, options?)`](#scopepollfn-onvalue-options)
  - [`scope.debounce(fn, options?)](#scopedebouncefn-options)
  - [`scope.throttle(fn, options?)](#scopethrottlefn-options)
  - [`scope.select(cases)`](#scopeselectcases)
  - [`scope.metrics()`](#scopemetrics)
  - [`scope.broadcast()`](#scopebroadcast)
  - [`scope.pool(options)`](#scopepooloptions)
  - [`scope.getProfileReport()`](#scopegetprofilereport)
  - [`scope.onDispose(callback)`](#scopeondisposecallback)
- [Types](#types)
  - [Result](#result)
  - [ScopeHooks](#scopehooks)
  - [ScopeMetrics](#scopemetrics-type)
- [Task Properties](#task-properties)
- [Channel Methods](#channel-methods)
- [Broadcast Channel Methods](#broadcast-channel-methods)
- [Resource Pool Methods](#resource-pool-methods)
- [Utility Functions](#utility-functions)
- [MetricsReporter Class](#metricsreporter-class)
- [Logger Interface](#logger-interface)
- [Additional Types](#additional-types)
- [Standalone Functions](#standalone-functions)
- [Cancellation Utilities](#cancellation-utilities)
- [Retry Strategies](#retry-strategies)

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
import { assert } from 'go-go-try'

await using s = scope()
  .provide('db', () => openDatabase(), (db) => db.close())
  .provide('cache', () => createCache())

// Access in tasks
const [err, result] = await s.task(({ services }) => {
  return services.db.query('SELECT 1')
})

return assert(result, err)
```

**Note:** Resources are disposed in LIFO order (reverse of creation).

**Type Safety:**

The `provide()` method returns a `Scope` with updated type information. TypeScript tracks which services are available:

```typescript
const s = scope()
  .provide('db', () => ({ query: () => 'result' }))
  .provide('cache', () => ({ get: () => 'cached' }))

// TypeScript knows these are valid:
s.use('db')     // ✓ No error
s.use('cache')  // ✓ No error

// TypeScript catches this at compile time:
s.use('invalid')  // ✗ Type error: '"invalid"' is not assignable
```

**⚠️ Important:** For type safety, always chain `provide()` calls with scope creation. Do not call `provide()` on separate statements:

```typescript
// ✓ CORRECT - chaining preserves type safety
const s = scope()
  .provide('db', () => ({ query: () => 'result' }))
  .provide('cache', () => ({ get: () => 'cached' }))

s.use('db')     // ✓ TypeScript knows 'db' exists
s.use('cache')  // ✓ TypeScript knows 'cache' exists

// ✗ WRONG - separate statements lose type tracking
const s = scope()  // Scope<Record<string, never>>
s.provide('db', () => ({ query: () => 'result' }))  // Return value ignored!
s.use('db')  // ✗ Type error - TypeScript doesn't know about 'db'
```

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

### `scope.has(key)`

Check if a service is registered.

```typescript
has<K extends keyof Services>(key: K): boolean
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Service identifier |

**Returns:** `true` if the service exists, `false` otherwise (or if scope is disposed)

**Example:**

```typescript
if (s.has('db')) {
  const db = s.use('db')
  await db.query('SELECT 1')
} else {
  console.log('Database service not available')
}
```

---

### `scope.override(key, factory, cleanup?)`

Replaces an existing service with a new implementation. Useful for testing - allows replacing real services with mocks or fakes.

The old service's cleanup function (if any) will NOT be called immediately; it will be cleaned up when the scope is disposed along with the new service's cleanup.

```typescript
override<K extends keyof Services, T extends Services[K]>(
  key: K,
  factory: () => T,
  cleanup?: (service: T) => void | Promise<void>
): Scope<Services>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Service identifier (must already exist) |
| `factory` | `() => T` | Factory function that creates the replacement service |
| `cleanup` | `(service: T) => void \| Promise<void>` | Optional cleanup function |

**Returns:** The scope (for chaining)

**Throws:**
- Error if the service doesn't exist
- Error if called on a disposed scope

**Example:**

```typescript
// In production code
await using s = scope()
  .provide('db', () => createRealDatabase())

// In test code - replace with mock
await using s = scope()
  .provide('db', () => createRealDatabase())
  .override('db', () => createMockDatabase())

// Can also use cleanup
await using s = scope()
  .provide('db', () => createRealDatabase(), (db) => db.close())
  .override('db', 
    () => createMockDatabase(), 
    (mock) => mock.cleanup()
  )

// Chain with other methods
await using s = scope()
  .provide('db', () => realDb)
  .provide('cache', () => realCache)
  .override('db', () => mockDb)  // Just override db, keep real cache
```

**Testing Pattern:**

```typescript
// Test a service with mocked dependencies
test('should fetch user', async () => {
  const mockDb = {
    query: vi.fn().mockResolvedValue({ id: 1, name: 'John' })
  }

  await using s = scope()
    .provide('db', () => ({} as any))  // Placeholder
    .override('db', () => mockDb)

  const [err, user] = await s.task(({ services }) => {
    return services.db.query('SELECT * FROM users WHERE id = 1')
  })

  expect(err).toBeUndefined()
  expect(user).toEqual({ id: 1, name: 'John' })
  expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = 1')
})
```

---

### `scope.race(factories, options?)`

Race multiple operations - first to complete wins, others are cancelled. Uses the scope's signal for cancellation.

```typescript
race<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[],
  options?: {
    requireSuccess?: boolean
    timeout?: number
    concurrency?: number
  }
): Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.requireSuccess` | `boolean` | Only successful results count as winners (default: false) |
| `options.timeout` | `number` | Timeout in milliseconds |
| `options.concurrency` | `number` | Max concurrent tasks (default: unlimited) |

**Returns:** `Promise<Result<unknown, T>>` - Result tuple of the winner

**Examples:**

```typescript
await using s = scope()

// Basic race - first to settle wins (success or error)
const [err, winner] = await s.race([
  ({ signal }) => fetch('https://fast.com', { signal }),
  ({ signal }) => fetch('https://slow.com', { signal }),
])

// Race with timeout
const [err, winner] = await s.race([
  ({ signal }) => fetch('https://slow.com', { signal }),
  ({ signal }) => fetch('https://fast.com', { signal }),
], { timeout: 5000 })

// Race for first success only (errors continue racing)
const [err, winner] = await s.race([
  () => fetchWithRetry('https://a.com'),  // might fail then retry
  () => fetchWithRetry('https://b.com'),  // might fail then retry
], { requireSuccess: true })

// Race with limited concurrency (process 2 at a time)
const [err, winner] = await s.race([
  () => fetch(url1),  // starts immediately
  () => fetch(url2),  // starts immediately
  () => fetch(url3),  // starts when 1 or 2 fails (if requireSuccess)
  () => fetch(url4),  // starts when next slot opens
  () => fetch(url5),
], { concurrency: 2, requireSuccess: true })

if (err) {
  console.log('All racers failed:', err)
} else {
  console.log('Winner:', winner)
}
```

---

### `scope.parallel(factories, options?)`

Run multiple tasks in parallel with optional progress tracking, concurrency control, and error handling.

```typescript
parallel<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[]),
  options?: {
    concurrency?: number
    onProgress?: (completed: number, total: number, result: Result<unknown, T>) => void
    continueOnError?: boolean
  }
): Promise<ParallelAggregateResult<T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.concurrency` | `number` | Max concurrent operations (default: scope's limit or unlimited) |
| `options.onProgress` | Function | Called after each task completes with `(completed, total, result)` |
| `options.continueOnError` | `boolean` | Continue processing on error (default: false) |

**Returns:** `Promise<ParallelAggregateResult<T>>` - Object with:
- `completed`: Array of `{ index, value }` for successful tasks
- `errors`: Array of `{ index, error }` for failed tasks
- `allCompleted`: Boolean indicating if all tasks succeeded

**Examples:**

```typescript
await using s = scope({ concurrency: 3 })

// Basic usage - stops on first error, returns collected results
const result = await s.parallel([
  () => fetchUser(1),  // might fail
  () => fetchUser(2),  // might fail
  () => fetchUser(3),  // might fail
])

console.log(`Completed: ${result.completed.length}`)
console.log(`Failed: ${result.errors.length}`)

// continueOnError: process all tasks regardless of errors
const result = await s.parallel(
  urls.map(url => () => fetch(url)),
  { continueOnError: true }
)

// With progress tracking and per-call concurrency
const result = await s.parallel(
  urls.map(url => () => fetch(url)),
  {
    concurrency: 5,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    continueOnError: true
  }
)

// Access successful results
for (const { index, value } of result.completed) {
  console.log(`Task ${index} succeeded:`, value)
}

// Access errors
for (const { index, error } of result.errors) {
  console.log(`Task ${index} failed:`, error)
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

---

## Broadcast Channel Methods

Broadcast channels implement `AsyncDisposable`:

```typescript
interface BroadcastChannel<T> extends AsyncDisposable {
  /** Send a value to all subscribers */
  send(value: T): Promise<void>
  
  /** Subscribe to receive values */
  subscribe(): AsyncIterable<T>
  
  /** Close the broadcast channel */
  close(): void
  
  /** Check if closed */
  readonly isClosed: boolean
  
  /** Number of active subscribers */
  readonly subscriberCount: number
  
  /** Dispose */
  [Symbol.asyncDispose](): Promise<void>
}
```

**Example:**

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

---

## Additional Scope Methods

### `scope.broadcast()`

Creates a broadcast channel for pub/sub messaging.

```typescript
broadcast<T>(): BroadcastChannel<T>
```

**Returns:** `BroadcastChannel<T>` - A broadcast channel where all subscribers receive every message

---

### `scope.pool(options)`

Creates a managed resource pool.

```typescript
pool<T>(options: ResourcePoolOptions<T>): ResourcePool<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.create` | `() => T \| Promise<T>` | Factory function to create resources |
| `options.destroy` | `(resource: T) => void \| Promise<void>` | Cleanup function for resources |
| `options.min` | `number` | Minimum pool size (default: 0) |
| `options.max` | `number` | Maximum pool size (default: 10) |
| `options.acquireTimeout` | `number` | Max time to wait for a resource (ms, default: 30000) |

**Returns:** `ResourcePool<T>`

**Example:**

```typescript
await using s = scope()

const dbPool = s.pool({
  create: () => createDatabaseConnection(),
  destroy: (conn) => conn.close(),
  min: 2,
  max: 10,
  acquireTimeout: 5000
})

// Use with automatic release
const users = await dbPool.execute(async (conn) => {
  const result = await conn.query('SELECT * FROM users')
  return result.rows
})
```

---

### `scope.getProfileReport()`

Get detailed profiling information about task execution.

```typescript
getProfileReport(): ScopeProfileReport
```

**Returns:** `ScopeProfileReport` - Profiling data including per-task timing

**Example:**

```typescript
await using s = scope({ profiler: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchPosts(1))

const report = s.getProfileReport()
console.log(report.statistics)
// {
//   totalTasks: 2,
//   successfulTasks: 2,
//   avgTotalDuration: 45.2,
//   avgExecutionDuration: 40.1
// }

for (const task of report.tasks) {
  console.log(`${task.name}: ${task.totalDuration.toFixed(2)}ms`)
  console.log(`  Execution: ${task.stages.execution.toFixed(2)}ms`)
  console.log(`  Retry: ${task.stages.retry?.toFixed(2) ?? 'N/A'}ms`)
}
```

---

### `scope.onDispose(callback)`

Registers a callback to run when the scope is disposed. Useful for registering cleanup handlers without creating a Task.

```typescript
onDispose(callback: () => void | Promise<void>): void
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `callback` | `() => void \| Promise<void>` | Function to call when scope is disposed |

**Example:**

```typescript
await using s = scope()

const ws = new WebSocket('ws://localhost:8080')

// Clean up WebSocket when scope ends
s.onDispose(() => {
  ws.close()
})

// Async cleanup is also supported
s.onDispose(async () => {
  await saveState()
})
```

---

## Resource Pool Methods

```typescript
interface ResourcePool<T> extends AsyncDisposable {
  /** Acquire a resource from the pool */
  acquire(): Promise<T>
  
  /** Release a resource back to the pool */
  release(resource: T): Promise<void>
  
  /** Execute a function with an acquired resource (auto-released) */
  execute<R>(fn: (resource: T) => Promise<R>): Promise<R>
  
  /** Pool statistics */
  readonly stats: {
    total: number
    available: number
    inUse: number
    waiting: number
  }
  
  /** Dispose */
  [Symbol.asyncDispose](): Promise<void>
}
```

---

## Utility Functions

### `exportMetrics(metrics, options)`

Export scope metrics in various formats.

```typescript
function exportMetrics(
  metrics: ScopeMetrics,
  options?: MetricsExportOptions
): string
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `metrics` | `ScopeMetrics` | Metrics object from `scope.metrics()` |
| `options.format` | `'json' \| 'prometheus' \| 'otel'` | Export format (default: 'json') |
| `options.prefix` | `string` | Prefix for metric names (Prometheus only) |

**Returns:** `string` - Formatted metrics string

**Example:**

```typescript
import { exportMetrics, scope } from 'go-go-scope'

await using s = scope({ metrics: true })
await s.task(() => fetchData())

const metrics = s.metrics()
if (metrics) {
  // JSON format
  const json = exportMetrics(metrics, { format: 'json' })
  
  // Prometheus format
  const prometheus = exportMetrics(metrics, { 
    format: 'prometheus',
    prefix: 'myapp'
  })
}
```

---

## MetricsReporter Class

Automatically report metrics at intervals.

```typescript
class MetricsReporter {
  constructor(
    scope: Scope,
    options: MetricsReporterOptions
  )
  
  /** Start reporting */
  start(): void
  
  /** Stop reporting */
  stop(): void
  
  /** Force immediate report */
  report(): Promise<void>
}
```

**Options:**

| Name | Type | Description |
|------|------|-------------|
| `format` | `'json' \| 'prometheus' \| 'otel'` | Export format |
| `interval` | `number` | Reporting interval in milliseconds |
| `onExport` | `(data: string) => Promise<void>` | Callback to handle exported data |
| `prefix` | `string` | Metric name prefix (Prometheus only) |

**Example:**

```typescript
import { MetricsReporter, scope } from 'go-go-scope'

await using s = scope({ metrics: true })

const reporter = new MetricsReporter(s, {
  format: 'prometheus',
  interval: 60000,  // Report every minute
  onExport: async (data) => {
    await fetch('http://metrics-endpoint', {
      method: 'POST',
      body: data
    })
  }
})

// Auto-starts
// Stop when needed
reporter.stop()
```

---

## Logger Interface

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
```

### ConsoleLogger

Built-in logger implementation.

```typescript
class ConsoleLogger implements Logger {
  constructor(
    name: string,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info'
  )
}
```

**Example:**

```typescript
import { scope, ConsoleLogger } from 'go-go-scope'

await using s = scope({
  logger: new ConsoleLogger('my-app', 'debug')
})

// Logs scope events automatically
await s.task(() => fetchData())
```

---

## Additional Types

### ScopeOptions (Extended)

```typescript
interface ScopeOptions {
  // ... previous options ...
  
  /**
   * Enable task profiling.
   * @default false
   */
  profiler?: boolean
  
  /**
   * Deadlock detection configuration.
   */
  deadlockDetection?: {
    timeout: number
    onDeadlock?: (waitingTasks: WaitingTaskInfo[]) => void
  }
  
  /**
   * Custom logger instance.
   */
  logger?: Logger
  
  /**
   * Log level for built-in console logger.
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}
```

### ParallelAggregateResult

```typescript
interface ParallelAggregateResult<T> {
  /** Successfully completed tasks */
  completed: Array<{ index: number; value: T }>
  
  /** Failed tasks */
  errors: Array<{ index: number; error: unknown }>
  
  /** Whether all tasks completed successfully */
  allCompleted: boolean
}
```

### ScopeProfileReport

```typescript
interface ScopeProfileReport {
  /** Per-task profiles */
  tasks: TaskProfile[]
  
  /** Aggregated statistics */
  statistics: {
    totalTasks: number
    successfulTasks: number
    failedTasks: number
    avgTotalDuration: number
    avgExecutionDuration: number
    totalRetryAttempts: number
  }
}
```

### TaskProfile

```typescript
interface TaskProfile {
  name: string
  totalDuration: number
  stages: {
    execution?: number
    circuitBreaker?: number
    concurrency?: number
    retry?: number
    timeout?: number
  }
  retryAttempts: number
}
```

---

## Standalone Functions

The following functions are also exported for standalone use (without a scope):

### `race(factories, options?)`

Race multiple operations without a scope.

```typescript
import { race } from 'go-go-scope'

// Basic race
const [err, winner] = await race([
  ({ signal }) => fetch('https://fast.com', { signal }),
  ({ signal }) => fetch('https://slow.com', { signal }),
])

// With timeout
const [err, winner] = await race([
  ({ signal }) => fetch('https://slow.com', { signal }),
  ({ signal }) => fetch('https://fast.com', { signal }),
], { timeout: 5000 })

// Race for first success only
const [err, winner] = await race([
  () => fetchWithRetry('https://a.com'),
  () => fetchWithRetry('https://b.com'),
], { requireSuccess: true })

// With limited concurrency
const [err, winner] = await race([
  () => fetch(url1),
  () => fetch(url2),
  () => fetch(url3),
], { concurrency: 2 })
```

### `parallel(factories, options?)`

Run operations in parallel without a scope. Returns a structured result with both successes and failures.

```typescript
import { parallel } from 'go-go-scope'

const result = await parallel([
  () => fetchUser(1),
  () => fetchUser(2),
], { concurrency: 3 })

console.log(result.completed.length) // Successfully fetched
console.log(result.errors.length)    // Failed
```

### `poll(fn, onValue, options?)`

Poll a function without a scope.

```typescript
import { poll } from 'go-go-scope'

const controller = poll(
  ({ signal }) => fetchStatus({ signal }),
  (status) => console.log(status),
  { interval: 5000 }
)

// Stop when done
controller.stop()
```

### `debounce(scope, fn, options?)`

Create a debounced function.

```typescript
import { debounce, scope } from 'go-go-scope'

await using s = scope()

const search = debounce(s, async (query: string) => {
  return fetchSearchResults(query)
}, { wait: 300 })
```

### `throttle(scope, fn, options?)`

Create a throttled function.

```typescript
import { throttle, scope } from 'go-go-scope'

await using s = scope()

const save = throttle(s, async (data: string) => {
  return saveToServer(data)
}, { interval: 1000 })
```

### `stream(source, signal?)`

Wrap an async iterable with cancellation.

```typescript
import { stream } from 'go-go-scope'

const controller = new AbortController()

for await (const chunk of stream(readableStream, controller.signal)) {
  await processChunk(chunk)
}
```


---

## Cancellation Utilities

Helper functions for working with `AbortSignal`.

### `throwIfAborted(signal)`

Throws the abort reason if the signal is already aborted.

```typescript
import { throwIfAborted } from "go-go-scope";

await s.task(({ signal }) => {
  throwIfAborted(signal); // Exit early if cancelled
  const data = await fetchPart1();
  throwIfAborted(signal); // Check again before part 2
  const moreData = await fetchPart2();
  return process(data, moreData);
});
```

### `onAbort(signal, callback)`

Registers a callback to be invoked when the signal is aborted. Returns a `Disposable`.

```typescript
import { onAbort } from "go-go-scope";

await s.task(({ signal }) => {
  // Register cleanup
  using _cleanup = onAbort(signal, (reason) => {
    console.log("Task cancelled:", reason);
  });

  return await longRunningOperation();
});
```

### `raceSignals(signals)`

Creates a new signal that aborts when any of the input signals abort.

```typescript
import { raceSignals } from "go-go-scope";

const combined = raceSignals([scope.signal, timeoutSignal]);
await fetch(url, { signal: combined });
// Aborts if either scope is disposed OR timeout fires
```

### `abortPromise(signal)`

Creates a promise that rejects when the signal is aborted.

```typescript
import { abortPromise } from "go-go-scope";

await s.task(async ({ signal }) => {
  const result = await Promise.race([fetchData(), abortPromise(signal)]);
  return result;
});
```

### `whenAborted(signal)`

Returns a promise that resolves when the signal is aborted.

```typescript
import { whenAborted } from "go-go-scope";

await s.task(async ({ signal }) => {
  await Promise.race([operation(), whenAborted(signal)]);
  if (signal.aborted) {
    console.log("Cancelled before completion");
  }
});
```

---

## Retry Strategies

Built-in retry delay strategies for use with `retry.delay`.

### `exponentialBackoff(options?)`

Exponential backoff with optional jitter.

```typescript
import { exponentialBackoff } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    maxRetries: 5,
    delay: exponentialBackoff({
      initial: 100, // Start with 100ms
      max: 30000, // Cap at 30 seconds
      multiplier: 2, // Double each time
      jitter: 0.3, // ±30% randomization
    }),
  },
});
```

### `jitter(baseDelay, jitterFactor?)`

Fixed delay with jitter.

```typescript
import { jitter } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    delay: jitter(1000, 0.2), // 1000ms ± 20%
  },
});
```

### `linear(baseDelay, increment)`

Linear increasing delay.

```typescript
import { linear } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    delay: linear(100, 50), // 100, 150, 200, 250ms...
  },
});
```

### `fullJitterBackoff(options?)`

AWS-style full jitter (random value between 0 and calculated delay).

```typescript
import { fullJitterBackoff } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    delay: fullJitterBackoff({ initial: 100, max: 30000 }),
  },
});
```

### `decorrelatedJitter(options?)`

Azure-style decorrelated jitter.

```typescript
import { decorrelatedJitter } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    delay: decorrelatedJitter({ initial: 100, max: 30000 }),
  },
});
```

