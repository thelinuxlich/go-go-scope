# API Reference

Complete reference for all functions, methods, and types in `go-go-scope`.

## Table of Contents

- [Functions](#functions)
  - [`scope(options?)`](#scopeoptions)
  - [ScopeOptions](#scopeoptions-type)
- [Scope Methods](#scope-methods)
  - [`scope.task(fn, options?)`](#scopetaskfn-options)
  - [TaskOptions](#taskoptions-type)
  - [`scope.provide(key, factory, options?)`](#scopeprovidekey-factory-options)
  - [`scope.use(key)`](#scopeusekey)
  - [`scope.has(key)`](#scopehaskey)
  - [`scope.override(key, factory, cleanup?)`](#scopeoverridekey-factory-cleanup)
  - [`scope.createChild(options?)`](#scopecreatechildoptions)
  - [`scope.race(factories)`](#scoperacefactories)
  - [`scope.parallel(factories, options?)`](#scopeparallelfactories-options)
  - [`scope.channel(capacity?)`](#scopechannelcapacity)
  - [`Stream` (from `@go-go-scope/stream`)](#stream-from-go-go-scopstream)
  - [`scope.poll(fn, onValue, options?)`](#scopepollfn-onvalue-options)
  - [`scope.debounce(fn, options?)](#scopedebouncefn-options)
  - [`scope.throttle(fn, options?)](#scopethrottlefn-options)
  - [`scope.delay(ms)`](#scopedelayms)
  - [`scope.every(intervalMs, fn)`](#scopeeveryintervalms-fn)
  - [`scope.any(factories, options?)`](#scopeanyfactories-options)
  - [`scope.batch(options)`](#scopebatchoptions)
  - [`scope.select(cases)`](#scopeselectcases)
  - [`scope.metrics()`](#scopemetrics)
  - [`scope.broadcast()`](#scopebroadcast)
  - [`scope.eventEmitter<Events>()`](#scopeeventemitterevents)
  - [`scope.debugTree(options?)`](#scopedebugtreeoptions)
  - [`scope.priorityChannel(options)`](#scopeprioritychanneloptions)
  - [`scope.pool(options)`](#scopepooloptions)
  - [`scope.getProfileReport()`](#scopegetprofilereport)
  - [`scope.onDispose(callback)`](#scopeondisposecallback)
  - [`scope.tokenBucket(options)`](#scopetokenbucketoptions)
- [Additional Classes](#additional-classes)
  - [`Lock`](#lock)
  - [`scope.acquireLock()`](#scopeacquirelockoptions)
  - [`scope({ circuitBreaker })`](#scope-circuitbreaker-options)
  - [`WorkerPool`](#workerpool) (@internal - workspace use)
  - [`AsyncDisposableResource`](#asyncdisposableresource)
  - [`ScopedEventEmitter`](#scopedeventemitter)
  - [`TokenBucket`](#tokenbucket)
  - [`GracefulShutdownController`](#gracefulshutdowncontroller)
  - [`PerformanceMonitor`](#performancemonitor)
  - [`MemoryTracker`](#memorytracker)
- [Utility Functions](#utility-functions)
  - [`exportMetrics()`](#exportmetricsmetrics-options)
  - [`createCache()`](#createcache)
  - [`createIdempotencyProvider()`](#createidempotencyprovider)
  - [`gracefulShutdown` option (v2.6.0+)](#gracefulshutdownoptions)
  - [`installPlugins()`](#installplugins)
  - [`benchmark()`](#benchmark)
  - [`performanceMonitor()`](#performancemonitor)
- [Types](#types)
  - [Result](#result)
  - [ScopeHooks](#scopehooks)
  - [ScopeMetrics](#scopemetrics-type)
  - [DisposableScope](#disposablescope)
  - [ScopePlugin](#scopeplugin)
  - [GracefulShutdownOptions](#gracefulshutdownoptions)
  - [TokenBucketOptions](#tokenbucketoptions)
  - [PrioritizedItem](#prioritizeditem)
  - [PriorityComparator](#prioritycomparator)
  - [HealthCheckResult](#healthcheckresult)
- [Task Properties](#task-properties)
- [Channel Methods](#channel-methods)
- [Broadcast Channel Methods](#broadcast-channel-methods)
- [Resource Pool Methods](#resource-pool-methods)
- [MetricsReporter Class](#metricsreporter-class)
- [Logger Interface](#logger-interface)
- [Log Correlation](#log-correlation)
- [Additional Types](#additional-types)
- [Standalone Functions](#standalone-functions)
- [Cancellation Utilities](#cancellation-utilities)
- [Retry Strategies](#retry-strategies)
- [Stream (from @go-go-scope/stream)](#stream-from-go-go-scopstream)
- [Error Classes](#error-classes)
- [Additional Types (Extended)](#additional-types-extended)

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
  
  /**
   * Persistence providers for distributed features.
   * Enables distributed locks, circuit breaker state sharing,
   * and idempotency caching across processes.
   */
  persistence?: {
    /** Distributed lock provider */
    lock?: LockProvider
    /** Circuit breaker state provider */
    circuitBreaker?: CircuitBreakerStateProvider
    /** Idempotency provider for caching task results */
    idempotency?: IdempotencyProvider
    /** Cache provider for general caching */
    cache?: CacheProvider
  }
  
  /**
   * Idempotency configuration for the scope.
   */
  idempotency?: {
    /**
     * Default TTL for idempotency keys in milliseconds.
     * Used when idempotency.key is provided on a task without idempotency.ttl.
     * Inherited from parent if not specified.
     */
    defaultTTL?: number;
  }
  
  /**
   * Request context object accessible in all tasks via `ctx.context`.
   * Merged with parent's context when using `parent` option.
   * Useful for storing request-scoped data like trace IDs, user IDs, etc.
   */
  context?: Record<string, unknown>
  
  /**
   * Worker pool configuration for CPU-intensive tasks.
   * Used when tasks are spawned with `worker: true`.
   * Inherited from parent scope if not specified.
   * 
   * @example
   * ```typescript
   * await using s = scope({
   *   workerPool: {
   *     size: 4,           // Max 4 concurrent workers (default: CPU count - 1)
   *     idleTimeout: 30000 // Workers terminate after 30s idle (default: 60000)
   *   }
   * })
   * 
   * // These 100 tasks will queue and execute with max 4 concurrent workers
   * for (let i = 0; i < 100; i++) {
   *   s.task(() => heavyComputation(i), { worker: true })
   * }
   * ```
   */
  workerPool?: {
    /** Number of worker threads (default: CPU count - 1) */
    size?: number
    /** Idle timeout in milliseconds (default: 60000) */
    idleTimeout?: number
  }
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

// With idempotency provider
import { RedisIdempotencyAdapter } from '@go-go-scope/persistence-redis'

await using s = scope({
  persistence: {
    idempotency: new RedisIdempotencyAdapter(redis)
  },
  idempotency: { defaultTTL: 60000 }  // Default 1 minute TTL
})

// Tasks with idempotency key will be cached
const [err, result] = await s.task(
  () => processPayment(orderId),
  { idempotency: { key: `payment:${orderId}` } }  // Uses default TTL
)

// With request context for propagation
await using s = scope({
  name: 'api-request',
  context: {
    requestId: 'req-123',
    traceId: 'trace-abc',
    userId: 'user-456'
  }
})

// Access context in any task
const [err, data] = await s.task(async ({ context, logger }) => {
  logger.info('Processing request', { requestId: context.requestId })
  // All tasks have access to requestId, traceId, userId
  return processRequest(context)
})
```

---

## Scope Methods

### `scope.task(fn, options?)`

Spawns a task within the scope.

```typescript
task<T>(
  fn: (ctx: { services: Services; signal: AbortSignal; logger: Logger; context: Record<string, unknown> }) => Promise<T>,
  options?: TaskOptions
): Task<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | Function | Task function receiving `{ services, signal, logger, context }` |
| `options` | `TaskOptions` | Optional task configuration |

**Task Context:**

| Property | Type | Description |
|----------|------|-------------|
| `services` | `Services` | Injected services from `provide()` |
| `signal` | `AbortSignal` | Cancellation signal from scope |
| `logger` | `Logger` | Structured logger with task context |
| `context` | `Record<string, unknown>` | Request context from scope (inherited from parent scopes) |

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

// With logger for structured logging
const [err, result] = await s.task(async ({ services, logger }) => {
  logger.info('Starting database query')
  const data = await services.db.query('SELECT 1')
  logger.info('Query completed', { rowCount: data.length })
  return data
})

// With request context
await using s = scope({
  context: { requestId: 'req-123', traceId: 'trace-abc' }
})

const [err, data] = await s.task(async ({ context, logger }) => {
  // Access request-scoped context
  logger.info('Processing', { requestId: context.requestId })
  return fetchData({ traceId: context.traceId })
})

// With retry
const [err, user] = await s.task(
  () => fetchUser(id),
  { retry: { max: 3, delay: 1000 } }
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

// With worker thread for CPU-intensive tasks (v2.4.0+)
const [err, result] = await s.task(
  () => {
    // Heavy computation runs in worker thread
    function fibonacci(n: number): number {
      return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2)
    }
    return fibonacci(40)
  },
  { worker: true, timeout: 30000 }
)
```

---

### WorkerModuleSpec (Type)

```typescript
interface WorkerModuleSpec<TData = unknown, TResult = unknown> {
  /** Path to the module file (relative or absolute) */
  module: string
  /** Export name to use (default: 'default') */
  export?: string
  /** Validate module exists and export is callable before spawning (default: true) */
  validate?: boolean
  /** Cache the imported module for reuse (default: true) */
  cache?: boolean
  /** Enable source map support for proper stack traces from TypeScript (default: true) */
  sourceMap?: boolean
}
```

Specifies a function to load from a module file for worker execution. 

**Benefits over inline functions:**
- No closure capture limitations - can use module-level imports and variables
- No `eval()` serialization issues - functions are loaded natively
- Better error stack traces pointing to actual source files
- Supports full TypeScript with proper type checking

**Requirements:**
- Must use with `{ worker: true }` option
- Module must export the function as named or default export
- Function receives `data` object as single argument

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `validate` | `true` | Validate module exists and export is callable before spawning. Disable for lazy validation. |
| `cache` | `true` | Cache the imported module in the worker for reuse. Disable to force re-import on each execution. |
| `sourceMap` | `true` | Enable source-map-support for proper stack traces from TypeScript files. Shows original `.ts` line numbers in errors. |

**Example:**

```typescript
// Basic usage
await s.task(
  { module: './workers.js', export: 'process' },
  { worker: true, data: { items: [1, 2, 3] } }
);

// With validation disabled (lazy loading)
await s.task(
  { module: './workers.js', export: 'process', validate: false },
  { worker: true, data: { items: [1, 2, 3] } }
);

// Without caching (force re-import each time)
await s.task(
  { module: './workers.js', export: 'process', cache: false },
  { worker: true, data: { items: [1, 2, 3] } }
);

// Disable source maps (show compiled JS line numbers)
await s.task(
  { module: './workers.ts', export: 'process', sourceMap: false },
  { worker: true, data: { items: [1, 2, 3] } }
);
```

---

### SharedWorkerModule (Class)

```typescript
class SharedWorkerModule {
  export(exportName?: string): WorkerModuleSpec
  getAvailableExports(): string[]
  hasExport(exportName: string): boolean
}

// Factory function
function createSharedWorker(
  modulePath: string,
  options?: { validate?: boolean }
): Promise<SharedWorkerModule>
```

A shared worker module that can be used across multiple scopes. The module is imported once and cached, reducing overhead when used frequently.

**Benefits:**
- Single module import shared across scopes
- Pre-validated exports for immediate use
- Reduced memory and CPU overhead

**Example:**

```typescript
import { createSharedWorker } from 'go-go-scope';

// Create once at application startup
const imageWorker = await createSharedWorker('./image-processor.js');

// Use across multiple scopes
await using s1 = scope();
const [err1, thumb] = await s1.task(
  imageWorker.export('createThumbnail'),
  { worker: true, data: { image: buffer, size: 256 } }
);

await using s2 = scope();
const [err2, compressed] = await s2.task(
  imageWorker.export('compress'),
  { worker: true, data: { image: buffer, quality: 0.8 } }
);

// Discover available exports
const exports = imageWorker.getAvailableExports();
// ['createThumbnail', 'compress', 'rotate', 'default']

// Check if export exists
if (imageWorker.hasExport('resize')) {
  // Use resize function
}
```

---

### TaskOptions (Type)

```typescript
interface TaskOptions<E extends Error = Error> {
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
    max?: number
    /** 
     * Delay between retries in ms.
     * Can be a number or function: (attempt, error) => number
     */
    delay?: number | ((attempt: number, error: unknown) => number)
    /** Which errors to retry (default: all) */
    if?: (error: unknown) => boolean
    /** Callback on each retry */
    onRetry?: (error: unknown, attempt: number) => void
  }
  
  /** 
   * Timeout for this specific task (milliseconds).
   */
  timeout?: number

  /**
   * Circuit breaker configuration for this specific task.
   * Takes precedence over scope-level circuit breaker.
   */
  circuitBreaker?: CircuitBreakerOptions

  /**
   * Task priority when scope has concurrency limits.
   * Higher priority tasks are executed before lower priority ones.
   * Default: 0
   */
  priority?: number
  
  /** 
   * Custom cleanup function - runs when parent scope exits.
   */
  onCleanup?: () => void | Promise<void>
  
  /**
   * Error class to wrap ALL errors in.
   * When provided, all errors are wrapped in this class.
   * For preserving business errors (with _tag), use systemErrorClass instead.
   */
  errorClass?: ErrorConstructor<E>
  
  /**
   * Error class to wrap SYSTEM errors only.
   * Only wraps errors without a `_tag` property.
   * Business errors (with _tag from taggedError) are preserved as-is.
   * 
   * Defaults to `UnknownError` - untagged errors are automatically
   * wrapped in `UnknownError` if not specified.
   */
  systemErrorClass?: ErrorConstructor<E>
  
  /**
   * Idempotency key for caching task results across multiple executions.
   * When provided with a persistence provider, the task result will be
   * cached and subsequent tasks with the same key will return the cached
   * result without re-executing.
   * 
   * Can be a string or a function that generates the key.
   * Errors are NOT cached - failed tasks will be retried.
   */
  idempotencyKey?: string | ((...args: unknown[]) => string)
  
  /**
   * Time-to-live for the idempotency cache entry in milliseconds.
   * If not specified, uses the scope's `idempotency.defaultTTL`.
   */
  idempotencyTTL?: number
  
  /**
   * Execute the task in a worker thread (v2.4.0+).
   * 
   * Useful for CPU-intensive operations that would block the event loop.
   * The task function is serialized and executed in a separate thread,
   * allowing true parallelism on multi-core systems.
   * 
   * **Important:** The function must be self-contained - it cannot reference
   * external variables, closures, or imports. Only the function body is
   * sent to the worker.
   * 
   * @example
   * ```typescript
   * // ✅ Good: Self-contained function
   * const [err, result] = await s.task(
   *   () => {
   *     let sum = 0
   *     for (let i = 0; i < 1000000; i++) {
   *       sum += Math.sqrt(i)
   *     }
   *     return sum
   *   },
   *   { worker: true }
   * )
   * 
   * // ❌ Bad: References external variable
   * const n = 1000000
   * const [err, result] = await s.task(
   *   () => {
   *     let sum = 0
   *     for (let i = 0; i < n; i++) {  // Error: n is not defined
   *       sum += Math.sqrt(i)
   *     }
   *     return sum
   *   },
   *   { worker: true }
   * )
   * ```
   */
  worker?: boolean
  
  /**
   * Data to pass to worker thread when using `worker: true` (v2.9.0+).
   * 
   * Any ArrayBuffers in the data object are automatically transferred
   * (not copied) to the worker for zero-copy performance. Other data
   * types are serialized via the structured clone algorithm.
   * 
   * ⚠️ **WARNING: ArrayBuffers are detached after transfer!**
   * After the task executes, any ArrayBuffers in `data` will become
   * detached (unusable) in the main thread. Accessing them will return
   * empty buffers.
   * 
   * @example
   * ```typescript
   * const buffer = new ArrayBuffer(1024 * 1024) // 1MB
   * new Uint8Array(buffer).fill(42)
   * 
   * const [err, result] = await s.task(
   *   ({ data }) => {
   *     // Process in worker - buffer was transferred (zero-copy)
   *     const view = new Uint8Array(data.buffer)
   *     return view.reduce((a, b) => a + b, 0)
   *   },
   *   {
   *     worker: true,
   *     data: { buffer } // ArrayBuffers auto-transferred
   *   }
   * )
   * 
   * // ⚠️ Buffer is now detached in main thread!
   * console.log(buffer.byteLength) // 0
   * ```
   */
  data?: unknown
  
  /**
   * Load function from module file for worker execution (v2.9.0+).
   * 
   * Instead of serializing an inline function with `toString()` + eval(),
   * load the function from an actual file. This avoids:
   * - Closure capture limitations (no external variable access)
   * - eval() security concerns
   * - Function serialization edge cases
   * 
   * The module file must export the function as a named or default export.
   * The function receives the `data` object as its argument.
   * 
   * @example
   * ```typescript
   * // math-worker.ts
   * export function heavyComputation(data: { n: number }) {
   *   let sum = 0
   *   for (let i = 1; i <= data.n; i++) {
   *     sum += i
   *   }
   *   return sum
   * }
   * 
   * // main.ts
   * const [err, result] = await s.task(
   *   { module: './math-worker.ts', export: 'heavyComputation' },
   *   { worker: true, data: { n: 1000000 } }
   * )
   * ```
   */
  module?: WorkerModuleSpec
  
  /**
   * Checkpoint configuration for long-running tasks (v2.5.0+).
   * 
   * Automatically saves task state at intervals for fault tolerance.
   * Combined with `scope.resumeTask()`, allows tasks to resume from
   * the last checkpoint after failures or restarts.
   * 
   * Requires a persistence provider with checkpoint support.
   * 
   * @example
   * ```typescript
   * await using s = scope({
   *   persistence: { checkpoint: redisAdapter }
   * })
   * 
   * const [err, result] = await s.task(
   *   async ({ checkpoint, progress }) => {
   *     const processed = checkpoint?.data?.processed ?? 0
   *     
   *     for (let i = processed; i < total; i++) {
   *       await processItem(i)
   *       progress.update((i / total) * 100)
   *       
   *       // Auto-saved every 60 seconds
   *       if (i % 100 === 0) {
   *         await checkpoint.save({ processed: i })
   *       }
   *     }
   *   },
   *   {
   *     checkpoint: {
   *       interval: 60000,  // Auto-save every minute
   *       maxCheckpoints: 10
   *     }
   *   }
   * )
   * ```
   */
  checkpoint?: {
    /** Auto-save interval in milliseconds */
    interval?: number
    /** Maximum number of checkpoints to keep */
    maxCheckpoints?: number
    /** Callback when checkpoint is saved */
    onCheckpoint?: (checkpoint: Checkpoint<unknown>) => void
    /** Callback when resuming from checkpoint */
    onResume?: (checkpoint: Checkpoint<unknown>) => void
  }
}
```

**Examples:**

```typescript
// Retry with exponential backoff
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      max: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
    }
  }
)

// Conditional retry
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      max: 3,
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

// Wrap system errors while preserving business errors
const DatabaseError = taggedError('DatabaseError')
const NotFoundError = taggedError('NotFoundError')

const [err, user] = await s.task(
  async () => {
    const record = await db.query('SELECT * FROM users WHERE id = ?', [id])
    if (!record) throw new NotFoundError('User not found')  // Preserved!
    return record
  },
  { 
    systemErrorClass: DatabaseError  // Only wraps errors without _tag
  }
)

// Idempotency - ensure a task runs only once for a given key
await using s = scope({
  persistence: {
    idempotency: new InMemoryIdempotencyProvider()
  }
})

// First call executes and caches
const [err1, result1] = await s.task(
  () => processPayment(orderId),
  { idempotencyKey: `payment:${orderId}`, idempotencyTTL: 60000 }
)

// Second call with same key returns cached result (within TTL)
const [err2, result2] = await s.task(
  () => processPayment(orderId),  // This won't execute!
  { idempotencyKey: `payment:${orderId}`, idempotencyTTL: 60000 }
)
// result2 === result1

// Idempotency with function key
const [err, user] = await s.task(
  () => createUser(email),
  { 
    idempotency: { 
      key: () => `create-user:${email}`,
      ttl: 300000  // 5 minutes
    }
  }
)

// Worker thread - offload CPU-intensive work
const [err, result] = await s.task(
  () => {
    // This runs in a worker thread - true parallelism!
    let sum = 0
    for (let i = 0; i < 10000000; i++) {
      sum += Math.sqrt(i)
    }
    return sum
  },
  { worker: true }
)

// Worker with retry - CPU-intensive task that might fail
const [err, primes] = await s.task(
  () => calculatePrimes(1000000),
  { 
    worker: true,
    retry: {
      max: 3,
      delay: 1000
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

### `scope.resumeTask(taskId, fn, options?)`

Resumes a task from its last checkpoint (v2.5.0+).

This method is designed for long-running tasks that need to survive failures and restarts. It loads the latest checkpoint for the given task ID and passes it to the task function.

```typescript
resumeTask<T, E extends Error = Error>(
  taskId: string,
  fn: (ctx: {
    services: Services
    signal: AbortSignal
    logger: Logger
    context: Record<string, unknown>
    checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown }
    progress?: ProgressContext
  }) => Promise<T>,
  options?: Omit<TaskOptions<E>, "id"> & {
    requireExisting?: boolean
  }
): Promise<Result<E, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | Unique identifier for the task (used to load checkpoints) |
| `fn` | `Function` | Task function receiving checkpoint data if available |
| `options` | `object` | Task options plus `requireExisting` flag |

**Options:**

| Name | Type | Description |
|------|------|-------------|
| `requireExisting` | `boolean` | If true, throws error if no checkpoint exists |

**Returns:** `Promise<Result<E, T>>` - Task result tuple

**Example:**

```typescript
await using s = scope({
  persistence: { checkpoint: redisAdapter }
})

// Resume a data migration from last checkpoint
const [err, result] = await s.resumeTask(
  'user-migration-v2',
  async ({ checkpoint, progress }) => {
    // checkpoint.data contains saved state from previous run
    const lastProcessedId = checkpoint?.data?.lastId ?? 0
    
    const users = await db.query(
      'SELECT * FROM users WHERE id > ? LIMIT 1000',
      [lastProcessedId]
    )
    
    for (const user of users) {
      await migrateUser(user)
      
      // Save progress every 100 users
      if (user.id % 100 === 0) {
        await checkpoint.save({ lastId: user.id })
      }
      
      progress.update((user.id / totalUsers) * 100)
    }
  },
  {
    checkpoint: { interval: 30000 },
    timeout: 3600000  // 1 hour
  }
)
```

**Use Cases:**
- Data migrations that take hours/days
- ETL pipelines that process large datasets
- Batch jobs that need to resume after crashes
- Long-running computations with periodic state saves

---

### `scope.provide(key, factory, options?)`

Registers a service/dependency that can be used by tasks in this scope. Services are automatically cleaned up when the scope exits.

```typescript
provide<K extends string, T>(
  key: K,
  factory: () => T,
  options?: {
    dispose?: (service: T) => void | Promise<void>
    singleton?: boolean
  }
): Scope<Services & Record<K, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Service identifier |
| `factory` | `() => T` | Function to create the service |
| `options.dispose` | `(T) => void \| Promise<void>` | Optional cleanup function |
| `options.singleton` | `boolean` | If true, only create once and reuse |

**Returns:** `Scope` with updated types

**Example:**

```typescript
import { assert } from 'go-go-try'

await using s = scope()
  .provide('db', () => openDatabase(), { dispose: (db) => db.close() })
  .provide('cache', () => createCache())

// Access in tasks
const [err, result] = await s.task(({ services }) => {
  return services.db.query('SELECT 1')
})

return assert(result, err)
```

**Singleton Example:**

```typescript
await using s = scope()

// First call creates the value
s.provide('config', () => loadConfig(), { singleton: true })
const config1 = s.use('config')

// Second call returns the same instance
s.provide('config', () => loadConfig(), { singleton: true })
const config2 = s.use('config')

// config1 === config2
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

### `scope.createChild(options?)`

Create a child scope that inherits from the current scope. The child scope inherits the parent's signal, services, and traceId.

```typescript
createChild<ChildServices extends Record<string, unknown> = Record<string, never>>(
  options?: Omit<ScopeOptions<Services>, 'parent'> & {
    provide?: { [K in keyof ChildServices]: (ctx: { services: Services }) => ChildServices[K] | Promise<ChildServices[K]> }
  }
): Scope<Services & ChildServices>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `ScopeOptions` | Same options as `scope()`, except `parent` |
| `options.provide` | `object` | Additional services for the child scope |

**Returns:** `Scope<Services & ChildServices>` - A new child scope

**Features:**

- Inherits parent's AbortSignal (child is cancelled when parent is)
- Inherits parent's services (can be extended with `provide`)
- Inherits parent's `traceId` (for log correlation)
- Gets a new unique `spanId`

**Example:**

```typescript
await using parent = scope({ 
  name: 'parent',
  logCorrelation: true 
})

// Create child scope
const child = parent.createChild({ name: 'child' })

// Child inherits parent's traceId
console.log(child.traceId === parent.traceId) // true
console.log(child.spanId) // Different spanId

// Create nested hierarchy
const grandchild = child.createChild({ name: 'grandchild' })

// Visualize with debugTree
console.log(parent.debugTree())
// 📦 parent (id: 1)
//    └─ 📦 child (id: 2)
//       └─ 📦 grandchild (id: 3)
```

**Child with Additional Services:**

```typescript
await using parent = scope()
  .provide('db', () => createDatabase())

// Child inherits 'db' and adds 'cache'
const child = parent.createChild({
  name: 'child-operation',
  provide: {
    cache: () => createCache()
  }
})

// Child has access to both 'db' and 'cache'
await child.task(async ({ services }) => {
  const data = await services.db.query('SELECT * FROM users')
  await services.cache.set('users', data)
  return data
})
```

---

### `scope.race(factories, options?)

Race multiple operations - first to complete wins, others are cancelled. Uses the scope's signal for cancellation.

```typescript
race<T>(
  factories: readonly ((signal: AbortSignal) => Promise<T>)[],
  options?: {
    requireSuccess?: boolean
    timeout?: number
    concurrency?: number
    workers?: { threads: number; idleTimeout?: number }  // Use worker threads (v2.4.0+)
    staggerDelay?: number           // Delay between starting tasks (hedging pattern)
    staggerMaxConcurrent?: number   // Max concurrent during stagger
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
| `options.workers` | `{ threads: number; idleTimeout?: number }` | Worker thread configuration (v2.4.0+) |
| `options.workers.threads` | `number` | Number of worker threads |
| `options.workers.idleTimeout` | `number` | Idle timeout for worker pool in ms (default: 60000) |
| `options.staggerDelay` | `number` | Delay in milliseconds between starting tasks (hedging pattern) |
| `options.staggerMaxConcurrent` | `number` | Maximum concurrent tasks during stagger (default: unlimited) |

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

// Race with worker threads for CPU-intensive tasks (v2.4.0+)
const [err, hash] = await race([
  () => computeHash(data, 'sha256'),
  () => computeHash(data, 'sha512'),
  () => computeHash(data, 'blake2b'),
], { 
  workers: { threads: 3 },  // Use 3 worker threads
  requireSuccess: true       // First successful hash wins
})

// Race with staggered start (request hedging pattern)
// Start with 2 tasks, add more if slow (cost-optimized hedging)
const [err, result] = await race([
  () => callExpensiveAPI('primary'),   // Start immediately
  () => callExpensiveAPI('secondary'), // Start immediately
  () => callExpensiveAPI('tertiary'),  // Start after staggerDelay
  () => callExpensiveAPI('quaternary'),// Start after staggerDelay
], {
  staggerDelay: 100,        // Wait 100ms before starting next task
  staggerMaxConcurrent: 2,  // Keep max 2 running concurrently
  requireSuccess: true
})

if (err) {
  console.log('All racers failed:', err)
} else {
  console.log('Winner:', winner)
}
```

---

### `scope.parallel(factories, options?)`

Run multiple tasks in parallel with optional progress tracking, concurrency control, and error handling.

Returns a **tuple of Results** where each position corresponds to the factory at the same index. This preserves individual return types for type-safe destructuring.

```typescript
parallel<T extends readonly ((signal: AbortSignal) => Promise<unknown>)[]>(
  factories: T,
  options?: {
    concurrency?: number
    onProgress?: (completed: number, total: number, result: Result<unknown, unknown>) => void
    continueOnError?: boolean
  }
): Promise<ParallelResults<T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | Array of functions | Each receives an `AbortSignal` and returns a `Promise` |
| `options.concurrency` | `number` | Max concurrent operations (default: scope's limit or unlimited) |
| `options.onProgress` | Function | Called after each task completes with `(completed, total, result)` |
| `options.continueOnError` | `boolean` | Continue processing on error (default: false) |
| `options.workers` | `{ threads: number; idleTimeout?: number }` | Worker thread configuration (v2.4.0+) |
| `options.workers.threads` | `number` | Number of worker threads |
| `options.workers.idleTimeout` | `number` | Idle timeout for worker pool in ms (default: 60000) |

**Returns:** `Promise<[Result<E, T1>, Result<E, T2>, ...]>` - Tuple where each element is a `Result` corresponding to the factory at the same index. TypeScript preserves the individual return types of each factory.

**Examples:**

```typescript
await using s = scope({ concurrency: 3 })

// Basic usage with type inference - each result is typed individually
const [userResult, ordersResult, settingsResult] = await s.parallel([
  (signal) => fetchUser(1, { signal }),      // Result<Error, User>
  (signal) => fetchOrders({ signal }),       // Result<Error, Order[]>
  (signal) => fetchSettings({ signal }),     // Result<Error, Settings>
])

// Destructure individual results
const [userErr, user] = userResult
const [ordersErr, orders] = ordersResult
const [settingsErr, settings] = settingsResult

if (!userErr) {
  // user is fully typed as User
  console.log(user.name)
}

// continueOnError: process all tasks regardless of errors
const results = await s.parallel(
  urls.map(url => ({ signal }) => fetch(url, { signal })),
  { continueOnError: true }
)

// Check each result individually
for (const [err, value] of results) {
  if (err) {
    console.log('Failed:', err)
  } else {
    console.log('Success:', value)
  }
}

// With progress tracking and per-call concurrency
const [r1, r2, r3] = await s.parallel(
  [
    () => fetchA(),
    () => fetchB(),
    () => fetchC(),
  ],
  {
    concurrency: 2,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    continueOnError: true
  }
)

// With worker threads for CPU-intensive tasks (v2.4.0+)
// Offload heavy computations to worker threads
const [result1, result2, result3] = await parallel(
  [
    () => heavyComputation(1000000),
    () => heavyComputation(2000000),
    () => heavyComputation(3000000),
  ],
  { workers: { threads: 4 } }  // Use 4 worker threads
)
```

**Note:** The old aggregate result format (`{ completed, errors, allCompleted }`) is still available for backward compatibility but deprecated. The new tuple-based API provides better type inference and is recommended for new code.

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

### Stream (from `@go-go-scope/stream`)

The Stream API is available as a separate package. Install it with:

```bash
npm install @go-go-scope/stream
```

Wrap an AsyncIterable with lazy processing and scope cancellation.

```typescript
import { Stream } from '@go-go-scope/stream'

new Stream<T>(source: AsyncIterable<T>, scope: Scope): Stream<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `source` | `AsyncIterable<T>` | Source iterable |
| `scope` | `Scope` | Scope for cancellation |

**Returns:** `Stream<T>` - Chainable stream instance

**Example:**

```typescript
import { scope } from 'go-go-scope'
import { Stream } from '@go-go-scope/stream'

await using s = scope()

for await (const chunk of new Stream(readableStream, s)) {
  await processChunk(chunk)
  // Automatically stops when scope is cancelled
}
```

**Note:** To use `scope.stream()` method instead, add the stream plugin:

```typescript
import { streamPlugin } from '@go-go-scope/stream'

await using s = scope({
  plugins: [streamPlugin]
})

// Now you can use s.stream()
const results = await s.stream(source).toArray()
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

### `scope.delay(ms)`

Returns a Promise that resolves after the specified milliseconds. The delay is automatically cancelled if the scope is disposed.

```typescript
delay(ms: number): Promise<void>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` | Milliseconds to delay |

**Returns:** `Promise<void>` - Resolves after the delay, or rejects if cancelled

**Example:**

```typescript
await using s = scope()

// Simple delay
await s.delay(1000) // Wait 1 second

// Retry with exponential backoff using delay
async function fetchWithRetry(url: string, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const [err, response] = await s.task(async () => {
      return fetch(url)
    })
    if (!err) return response
    if (attempt < maxAttempts - 1) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
      await s.delay(backoffMs) // Wait before retry
    }
  }
  throw new Error('Max retries exceeded')
}
```

---

### `scope.every(intervalMs, fn)`

Execute a function repeatedly at a fixed interval. Automatically cancelled when the scope is disposed. Errors in the function do not stop the interval.

```typescript
every(
  intervalMs: number,
  fn: (ctx: { signal: AbortSignal }) => Promise<void>
): () => void
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `intervalMs` | `number` | Interval in milliseconds between executions |
| `fn` | `Function` | Function to execute. Receives `{ signal }` for cancellation |

**Returns:** `() => void` - A stop function to cancel the interval early

**Example:**

```typescript
await using s = scope()

// Check for updates every 5 seconds
const stop = s.every(5000, async ({ signal }) => {
  const updates = await checkForUpdates({ signal })
  if (updates.length > 0) console.log('New updates:', updates)
})

// Stop manually if needed
stop()
```

---

### `scope.any(factories, options?)`

Wait for the first successful result from multiple tasks. Similar to `Promise.any` but returns a Result tuple and cancels remaining tasks. Returns an aggregate error if all tasks fail.

```typescript
any<T>(
  factories: readonly (() => Promise<T>)[],
  options?: { timeout?: number }
): Promise<Result<unknown, T>>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `Array` | Array of factory functions that create promises |
| `options.timeout` | `number` | Optional timeout in milliseconds |

**Returns:** `Promise<Result<unknown, T>>` - First success, or aggregate error

**Example:**

```typescript
await using s = scope()

// Try multiple sources, get first successful response
const [err, response] = await s.any([
  () => fetchFromPrimary(),
  () => fetchFromBackup1(),
  () => fetchFromBackup2(),
])

// With timeout
const [err, data] = await s.any([
  () => fetchFast(),
  () => fetchSlow(),
], { timeout: 5000 })
```

---

### `scope.batch(options)`

Create a batch processor that accumulates items and processes them in batches. Auto-flushes when batch is full or timeout is reached. Call `stop()` before scope disposal to ensure items are processed.

```typescript
batch<T, R>(options: {
  size?: number       // Max items per batch (default: 100)
  timeout?: number    // Max ms to wait before flush (default: 1000)
  process: (items: T[]) => Promise<R>
}): Batch<T, R>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.size` | `number` | Maximum items per batch (default: 100) |
| `options.timeout` | `number` | Milliseconds to wait before flush (default: 1000) |
| `options.process` | `Function` | Function to process a batch of items |

**Returns:** `Batch<T, R>` - Batch instance with methods below

**Batch Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `add(item)` | `add(item: T): Promise<Result<unknown, R> \| undefined>` | Add single item. Returns Result if batch flushes |
| `addMany(items)` | `addMany(items: T[]): Promise<Result<unknown, R>[]>` | Add multiple items |
| `flush()` | `flush(): Promise<Result<unknown, R>>` | Manually flush current batch |
| `stop()` | `stop(): Promise<Result<unknown, R> \| undefined>` | Stop and flush remaining items |
| `size` (getter) | `number` | Current number of items in batch |
| `isStopped` (getter) | `boolean` | Whether batch is stopped |

**Example:**

```typescript
await using s = scope()

const batcher = s.batch({
  size: 100,
  timeout: 5000,
  process: async (users) => {
    await db.users.insertMany(users)
    return users.length
  }
})

// Add items - they accumulate
await batcher.add({ name: 'Alice' })
await batcher.add({ name: 'Bob' })

// Manually flush when needed
const [err, count] = await batcher.flush()

// Or call stop() before scope disposal
await batcher.stop()
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

### `createEventEmitter(scope)`

Creates a typed EventEmitter with automatic listener cleanup when the scope disposes.

```typescript
function createEventEmitter<Events extends Record<string, (...args: unknown[]) => void>>(
  scope: Scope
): ScopedEventEmitter<Events>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` | Parent scope for automatic cleanup |

**Returns:** `ScopedEventEmitter<Events>`

**Example:**

```typescript
import { scope, createEventEmitter } from 'go-go-scope'

await using s = scope()

// Create standalone emitter
const emitter = createEventEmitter<{
  message: (text: string) => void
  error: (err: Error) => void
}>(s)

emitter.on('message', (text) => console.log(text))
emitter.emit('message', 'Hello!')
```

**Note:** Prefer `scope.eventEmitter()` when creating emitters within a scope context. Use `createEventEmitter()` when you need to pass the scope reference explicitly.

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

### `scope.eventEmitter<Events>()`

Creates a typed EventEmitter with automatic listener cleanup when the scope disposes.

```typescript
eventEmitter<Events extends Record<string, (...args: unknown[]) => void>>(): ScopedEventEmitter<Events>
```

**Type Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `Events` | `Record<string, (...args: unknown[]) => void>` | Event name to handler type mapping |

**Returns:** `ScopedEventEmitter<Events>` - A typed event emitter

**Example:**

```typescript
await using s = scope()

// Create typed event emitter
const emitter = s.eventEmitter<{
  data: (chunk: string) => void
  end: () => void
  error: (err: Error) => void
}>()

// Subscribe to events
emitter.on('data', (chunk) => console.log(chunk))
emitter.on('end', () => console.log('Done'))

// Emit events
emitter.emit('data', 'Hello')
emitter.emit('end')

// All listeners auto-removed when scope disposes
```

**Methods:**

| Method | Description |
|--------|-------------|
| `on(event, handler)` | Subscribe to an event (returns unsubscribe function) |
| `once(event, handler)` | Subscribe once (auto-removes after first call) |
| `off(event, handler)` | Unsubscribe a specific handler |
| `emit(event, ...args)` | Emit an event synchronously |
| `emitAsync(event, ...args)` | Emit an event asynchronously (awaits all handlers) |
| `listenerCount(event)` | Get number of listeners for an event |
| `hasListeners(event)` | Check if event has any listeners |
| `eventNames()` | Get all event names with listeners |
| `removeAllListeners(event?)` | Remove all listeners (for specific event or all) |

**Key Features:**

- **Type-safe**: Full TypeScript support for event names and payloads
- **Auto-cleanup**: All listeners removed when scope disposes (prevents memory leaks)
- **Error isolation**: Errors in handlers don't affect other handlers
- **Multiple handlers**: Multiple handlers can subscribe to the same event

---

### `scope.debugTree(options?)`

Generate a visual representation of the scope hierarchy for debugging purposes.

```typescript
debugTree(options?: { format?: 'ascii' | 'mermaid'; includeStats?: boolean }): string
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.format` | `'ascii' \| 'mermaid'` | Output format (default: 'ascii') |
| `options.includeStats` | `boolean` | Include statistics in output (default: true) |

**Returns:** `string` - Visual tree representation

**Example:**

```typescript
await using s = scope({ name: 'root' })
const child = s.createChild({ name: 'child' })
const grandchild = child.createChild({ name: 'grandchild' })

// ASCII format (default)
console.log(s.debugTree())
// 📦 root (id: 1)
//    ├─ 📦 child (id: 2)
//    │  └─ 📦 grandchild (id: 3)

// Mermaid format for documentation
console.log(s.debugTree({ format: 'mermaid' }))
// graph TD
//     scope_1[📦 root]
//     scope_1 --> scope_2[📦 child]
//     scope_2 --> scope_3[📦 grandchild]
```

**Use Cases:**

- Debugging complex scope hierarchies
- Documentation (Mermaid diagrams)
- Logging scope structure during development
- Visualizing parent-child relationships

---

### `scope.priorityChannel(options)`

Creates a priority channel where items are delivered based on priority rather than FIFO order.

```typescript
priorityChannel<T>(options: PriorityChannelOptions<T>): PriorityChannel<T>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.capacity` | `number` | Maximum buffer size (default: 0) |
| `options.comparator` | `(a: T, b: T) => number` | Comparator function for ordering (required) |
| `options.onDrop` | `(value: T) => void` | Callback when item is dropped due to capacity |

**Returns:** `PriorityChannel<T>`

**Example:**

```typescript
await using s = scope()

// Create priority queue (lower number = higher priority)
const pq = s.priorityChannel<{ task: Task; priority: number }>({
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority
})

// Send tasks with priorities
await pq.send({ task: lowPriorityTask, priority: 10 })
await pq.send({ task: highPriorityTask, priority: 1 })

// Receive in priority order
const first = await pq.receive()  // highPriorityTask
const second = await pq.receive() // lowPriorityTask
```

**Methods:**

| Method | Description |
|--------|-------------|
| `send(value)` | Send a value (waits if buffer full) |
| `trySend(value)` | Try to send without blocking (returns boolean) |
| `sendOrDrop(value)` | Send or drop if buffer full |
| `receive()` | Receive highest priority value |
| `tryReceive()` | Try to receive without blocking |
| `peek()` | Peek at highest priority value without removing |
| `close()` | Close the channel |
| `[Symbol.asyncDispose]()` | Async dispose support |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `cap` | `number` | Buffer capacity |
| `size` | `number` | Current buffer size |
| `isEmpty` | `boolean` | True if buffer is empty |
| `isFull` | `boolean` | True if buffer is full |
| `isClosed` | `boolean` | True if channel is closed |

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

### Log Correlation

Generate and manage trace IDs and span IDs for distributed logging.

```typescript
import { 
  generateTraceId, 
  generateSpanId,
  createCorrelatedLogger,
  isCorrelatedLogger,
  getCorrelationContext
} from 'go-go-scope'
```

#### `generateTraceId()`

Generate a random trace ID (16 bytes hex string).

```typescript
const traceId = generateTraceId() // e.g., "a1b2c3d4e5f6..."
```

#### `generateSpanId()`

Generate a random span ID (8 bytes hex string).

```typescript
const spanId = generateSpanId() // e.g., "a1b2c3d4..."
```

#### `createCorrelatedLogger(delegate, correlation)`

Create a logger that automatically includes correlation IDs in all log messages.

```typescript
const logger = createCorrelatedLogger(
  new ConsoleLogger('my-app'),
  {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    scopeName: 'api-request'
  }
)

logger.info('Processing request')
// Output: [traceId=abc123] [spanId=xyz789] Processing request
```

#### `isCorrelatedLogger(logger)`

Check if a logger is a CorrelatedLogger.

```typescript
if (isCorrelatedLogger(logger)) {
  const context = logger.getCorrelationContext()
  console.log(context.traceId)
}
```

#### `getCorrelationContext(logger)`

Extract correlation context from a logger if available.

```typescript
const context = getCorrelationContext(logger)
if (context) {
  console.log('Trace:', context.traceId)
  console.log('Span:', context.spanId)
}
```

#### Log Correlation in Scopes

Enable automatic log correlation in scopes:

```typescript
await using s = scope({
  name: 'api-request',
  logCorrelation: true // Auto-generates traceId and spanId
})

// Access correlation IDs in tasks
await s.task(async ({ logger }) => {
  // Logs automatically include traceId and spanId
  logger.info('Processing') 
  // Output: [traceId=...] [spanId=...] Processing
})

// Access scope traceId directly
console.log(s.traceId)
console.log(s.spanId)

// Child scopes inherit parent's traceId
await using child = s.createChild({ name: 'child-operation' })
console.log(child.traceId === s.traceId) // true
console.log(child.spanId) // Different spanId
```

**External Trace ID:**

Continue traces from external sources:

```typescript
// Incoming request has trace ID in header
const externalTraceId = req.headers['x-trace-id']

await using s = scope({
  name: 'api-handler',
  logCorrelation: true,
  traceId: externalTraceId // Continue existing trace
})
```

---

## Additional Types (Extended)

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
  
  /**
   * Enable log correlation with traceId and spanId.
   * When enabled, all logs from this scope and its tasks include correlation IDs.
   * @default false
   */
  logCorrelation?: boolean
  
  /**
   * External trace ID for log correlation.
   * Use this to continue traces from external sources (e.g., incoming requests).
   * If not provided, a new trace ID is generated when logCorrelation is enabled.
   */
  traceId?: string
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

### `stream(source, signal?)

Wrap an async iterable with cancellation (requires `@go-go-scope/stream` package).

```typescript
import { stream } from '@go-go-scope/stream'

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
    max: 5,
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

### `decorrelatedJitter(options?)

Azure-style decorrelated jitter.

```typescript
import { decorrelatedJitter } from "go-go-scope";

await s.task(() => fetchData(), {
  retry: {
    delay: decorrelatedJitter({ initial: 100, max: 30000 }),
  },
});
```

---

## Additional Classes

### `scope.acquireLock(options?)`

A unified lock implementation supporting exclusive (mutex), read-write, and distributed locking modes. The lock is automatically cleaned up when the scope is disposed.

```typescript
// Exclusive lock (mutex)
const lock = s.acquireLock()
await using guard = await lock.acquire()

// Read-write lock
const rwlock = s.acquireLock({ allowMultipleReaders: true })
await using readGuard = await rwlock.read()

// Distributed lock (with persistence provider)
await using s = scope({
  persistence: { lock: redisAdapter }
})
const distLock = s.acquireLock({
  key: 'resource:123',
  ttl: 30000
})
await using guard = await distLock.acquire()
```

**Options:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | Unique key for distributed locks (required with provider) |
| `ttl` | `number` | Lock TTL in milliseconds (default: 30000) |
| `owner` | `string` | Owner identifier for distributed locks |
| `allowMultipleReaders` | `boolean` | Enable read-write mode (default: false) |
| `name` | `string` | Name for debugging |

**Lock Methods:**

| Method | Description |
|--------|-------------|
| `acquire(options?)` | Acquire exclusive lock (mutex mode only) |
| `read(options?)` | Acquire read lock (read-write mode only) |
| `write(options?)` | Acquire write lock (read-write mode only) |
| `tryAcquire()` | Try to acquire exclusive lock immediately (returns null if unavailable) |
| `tryRead()` | Try to acquire read lock immediately |
| `tryWrite()` | Try to acquire write lock immediately |

**LockGuard:**

The acquire methods return a `LockGuard` that automatically releases the lock when disposed:

```typescript
// Automatic release with `await using`
await using guard = await lock.acquire()
// Lock is held here
// Automatically released when guard goes out of scope

// Manual release
const guard = await lock.acquire()
await guard.release()
```

**Read-Write Lock Example:**

```typescript
const lock = s.acquireLock({ allowMultipleReaders: true })

// Multiple concurrent readers
await using guard1 = await lock.read()
await using guard2 = await lock.read() // OK, concurrent reads allowed

// Exclusive writer
await using writeGuard = await lock.write() // Waits for all readers
```

---

### `scope({ circuitBreaker: options })`

Fault tolerance circuit breaker that automatically stops calling failing services. Circuit breaker is automatically applied to all tasks spawned within the scope.

```typescript
import { scope } from 'go-go-scope'

// Create scope with circuit breaker
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    resetTimeout: 30000,      // Try again after 30 seconds
    successThreshold: 2       // Require 2 successes to close
  }
})

// All tasks automatically use circuit breaker protection
const [err, result] = await s.task(async (signal) => {
  return await fetchData({ signal })
})

if (err && err.message === 'Circuit breaker is open') {
  // Use fallback
}
```

**CircuitBreakerOptions:**

| Name | Type | Description |
|------|------|-------------|
| `failureThreshold` | `number` | Failures before opening (default: 5) |
| `resetTimeout` | `number` | Milliseconds before retry (default: 30000) |
| `successThreshold` | `number` | Consecutive successes to close from half-open (default: 1) |
| `advanced.adaptiveThreshold` | `boolean` | Enable adaptive threshold based on error rate |
| `advanced.minThreshold` | `number` | Minimum threshold for adaptive mode (default: 2) |
| `advanced.maxThreshold` | `number` | Maximum threshold for adaptive mode (default: 10) |
| `advanced.slidingWindow` | `boolean` | Use sliding window for failure count |
| `advanced.slidingWindowSizeMs` | `number` | Window size for sliding window (default: 60000) |
| `onStateChange` | `(from, to, failureCount) => void` | State change callback |
| `onOpen` | `(failureCount) => void` | Circuit opened callback |
| `onClose` | `() => void` | Circuit closed callback |
| `onHalfOpen` | `() => void` | Circuit half-open callback |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `stateChange` | `(from, to, failureCount)` | State transition occurred |
| `open` | `(failureCount)` | Circuit opened |
| `close` | `()` | Circuit closed |
| `halfOpen` | `()` | Circuit entered half-open |
| `success` | `()` | Request succeeded |
| `failure` | `()` | Request failed |
| `thresholdAdapt` | `(newThreshold, errorRate)` | Adaptive threshold changed |

**Event Example:**

```typescript
await using s = scope({
  circuitBreaker: {
    failureThreshold: 3,
    onOpen: (failureCount) => {
      console.log(`Circuit opened after ${failureCount} failures`)
      alertOpsTeam('Service degraded')
    },
    onClose: () => {
      console.log('Circuit closed - service recovered')
    },
    onStateChange: (from, to, count) => {
      console.log(`Circuit: ${from} -> ${to} (failures: ${count})`)
    }
  }
})

// Tasks automatically use circuit breaker
const [err, data] = await s.task(() => fetchData())
```

**Adaptive Threshold Example:**

```typescript
await using s = scope({
  circuitBreaker: {
    advanced: {
      adaptiveThreshold: true,
      minThreshold: 2,
      maxThreshold: 10,
      errorRateWindowMs: 60000
    }
  }
})

// Threshold automatically adjusts based on error rate
// Higher error rate = lower threshold (faster to open)
```

---

### `scope.tokenBucket(options)`

Create a token bucket rate limiter for controlling API request rates.

```typescript
const bucket = s.tokenBucket({
  capacity: 100,      // Maximum burst size
  refillRate: 100     // Tokens per second
});

// Acquire token and execute
await bucket.acquire(1, async () => {
  await makeApiCall();
});

// Or check without blocking
if (await bucket.tryConsume(1)) {
  await makeApiCall();
}
```

**TokenBucket Methods:**

| Method | Description |
|--------|-------------|
| `tryConsume(tokens)` | Try to consume tokens without blocking |
| `acquire(tokens, fn)` | Acquire tokens and execute function |
| `acquireWithTimeout(tokens, timeoutMs, fn)` | Acquire with timeout |
| `reset()` | Reset bucket to full capacity |
| `getTokens()` | Get current token count |
| `getState()` | Get bucket state |

---

### `WorkerPool` (Internal)

A pool of worker threads for executing CPU-intensive tasks in parallel (v2.4.0+). **For internal and workspace package use only** - most users should use `parallel()`, `race()`, `scope.task()`, or `benchmark()` with worker options instead.

```typescript
import { WorkerPool } from "go-go-scope";  // @internal - workspace packages only

// Create a pool with 4 workers
await using pool = new WorkerPool({ size: 4 });

// Execute a CPU-intensive task
const result = await pool.execute((n: number) => {
  // This runs in a worker thread
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.sqrt(i);
  }
  return sum;
}, 1000000);

// Execute multiple tasks in batch
const results = await pool.executeBatch(
  [1, 2, 3, 4, 5],
  (n: number) => {
    // CPU-intensive work
    let factorial = 1;
    for (let i = 2; i <= n; i++) factorial *= i;
    return factorial;
  },
  { ordered: true }
);
// Returns: [[undefined, 1], [undefined, 2], [undefined, 6], [undefined, 24], [undefined, 120]]
```

**WorkerPoolOptions:**

| Option | Type | Description |
|--------|------|-------------|
| `size` | `number` | Number of worker threads (default: CPU count - 1) |
| `idleTimeout` | `number` | Milliseconds before idle workers terminate (default: 60000) |
| `sharedMemory` | `boolean` | Enable SharedArrayBuffer (default: false) |
| `resourceLimits` | `object` | Memory limits per worker |

**WorkerPool Methods:**

| Method | Description |
|--------|-------------|
| `execute(fn, data, transferList?)` | Execute function in worker thread |
| `executeBatch(items, fn, options?)` | Execute multiple tasks in parallel |
| `stats()` | Get pool statistics (total, busy, idle, pending) |
| `[Symbol.asyncDispose]()` | Dispose pool and terminate all workers |

**Notes:**
- Functions passed to `execute()` must be serializable (no external references)
- Worker threads are best for CPU-intensive synchronous work
- Use `parallel()` with `workers` option for simpler API

---

### `AsyncDisposableResource`

A resource wrapper that manages acquire/dispose lifecycle.

```typescript
import { AsyncDisposableResource } from "go-go-scope";

const resource = new AsyncDisposableResource(
  async () => await createDatabaseConnection(),
  async (conn) => await conn.close()
);

// Acquire the resource
await using r = await resource.acquire();
const conn = r.value;

// Use the resource
await conn.query("SELECT 1");

// Automatically disposed when exiting scope
```

---

### `GracefulShutdownController`

Handles shutdown signals (SIGTERM, SIGINT) gracefully.

**New in v2.6.0:** Use the `gracefulShutdown` scope option for automatic setup:

```typescript
await using s = scope({
  gracefulShutdown: {
    timeout: 30000,
    onShutdown: async (signal) => {
      console.log(`Received ${signal}, starting cleanup...`);
    },
    onComplete: () => {
      console.log('Shutdown complete');
    }
  }
});

// Check if shutdown requested using scope property
s.task(async () => {
  while (!s.isShutdownRequested) {
    await processWork();
  }
});
```

**GracefulShutdownController Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `isShutdownRequested` | `boolean` | Whether shutdown has been requested |
| `shutdownComplete` | `Promise<void>` | Promise that resolves when shutdown is complete |

**Methods:**

| Method | Description |
|--------|-------------|
| `shutdown(signal?)` | Manually trigger shutdown |
| `cleanup()` | Remove signal handlers |

**Scope Property:**

When using the `gracefulShutdown` option, the scope gets an `isShutdownRequested` property:

```typescript
await using s = scope({ gracefulShutdown: {} });

if (s.isShutdownRequested) {
  // Shutdown has been requested
}
```

---

### `PerformanceMonitor`

Monitor scope performance metrics over time.

```typescript
import { performanceMonitor } from "go-go-scope";

await using s = scope();

const monitor = performanceMonitor(s, {
  sampleInterval: 1000,
  maxSnapshots: 100,
  trackMemory: true
});

// Get current metrics
const metrics = monitor.getMetrics();
console.log(metrics);
// { taskCount: 10, activeTaskCount: 2, tasksPerSecond: 5.2, ... }

// Get performance trends
const trends = monitor.getTrends();
// { taskRateTrend: 'increasing', durationTrend: 'stable' }
```

---

### `MemoryTracker`

Track memory usage and detect potential leaks.

```typescript
import { MemoryTracker } from "go-go-scope";

const tracker = new MemoryTracker(50);

// Take periodic snapshots
tracker.snapshot();

// Check for leaks
if (tracker.checkForLeaks(10)) {  // 10% growth threshold
  console.warn('Potential memory leak!');
  console.log('Growth rate:', tracker.getGrowthRate(), 'bytes/sec');
}
```

---

### `createCache()`

Create an in-memory cache provider.

```typescript
import { createCache } from "go-go-scope";

const cache = createCache({ maxSize: 1000 });

await cache.set("key", value, 60000);  // TTL in ms
const value = await cache.get("key");
const stats = cache.stats();
```

---

### `createIdempotencyProvider()`

Create an in-memory idempotency provider.

```typescript
import { createIdempotencyProvider } from "go-go-scope";

const idempotency = createIdempotencyProvider({ maxSize: 1000 });

await using s = scope({
  persistence: { idempotency }
});

// Tasks with idempotency key will be cached
const [err, result] = await s.task(
  () => processPayment(orderId),
  { idempotency: { key: `payment:${orderId}`, ttl: 60000 } }
);
```

---

### `installPlugins()`

Install plugins on a scope (usually called internally).

```typescript
import { installPlugins, type ScopePlugin } from "go-go-scope";

const myPlugin: ScopePlugin = {
  name: 'my-plugin',
  install(scope) {
    // Add methods to scope
  }
};

installPlugins(scope, [myPlugin]);
```

---

### `benchmark()`

Run a performance benchmark.

```typescript
import { benchmark } from "go-go-scope";

const result = await benchmark(
  'fetch-data',
  async () => {
    await fetchData();
  },
  {
    warmup: 100,
    iterations: 1000,
    minDuration: 1000
  }
);

console.log(result);
// { name: 'fetch-data', avgDuration: 1.25, opsPerSecond: 800, ... }
```

#### Benchmark with Worker Threads (v2.4.0+)

Run CPU-intensive benchmarks in a worker thread to avoid blocking the main thread:

```typescript
// CPU-intensive benchmark runs in worker thread
const result = await benchmark(
  'fibonacci-calc',
  () => {
    // Self-contained function (no external references)
    function fib(n: number): number {
      return n < 2 ? n : fib(n - 1) + fib(n - 2);
    }
    fib(35); // Computationally expensive
  },
  {
    warmup: 10,
    iterations: 100,
    worker: true  // Run in worker thread
  }
);

console.log(`Average: ${result.avgDuration}ms`);
console.log(`Ops/sec: ${result.opsPerSecond}`);
```

**Benefits of worker benchmarks:**
- Doesn't block the main thread event loop
- More accurate timing for CPU-bound operations
- Can benchmark without affecting application responsiveness

---

### `performanceMonitor()`

Create and start a performance monitor for a scope.

```typescript
import { performanceMonitor } from "go-go-scope";

const monitor = performanceMonitor(s, {
  sampleInterval: 1000,
  trackMemory: true
});

// Automatically tracks metrics
// Access via monitor.getMetrics()
```

---

### `ScopedEventEmitter`

A typed EventEmitter with automatic listener cleanup when the parent scope disposes.

```typescript
class ScopedEventEmitter<Events extends Record<string, (...args: unknown[]) => void>> {
  on<K extends keyof Events>(event: K, handler: Events[K]): () => void
  once<K extends keyof Events>(event: K, handler: Events[K]): void
  off<K extends keyof Events>(event: K, handler: Events[K]): void
  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): number
  emitAsync<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): Promise<number>
  listenerCount<K extends keyof Events>(event: K): number
  hasListeners<K extends keyof Events>(event: K): boolean
  eventNames(): (keyof Events)[]
  removeAllListeners<K extends keyof Events>(event?: K): void
}
```

**Type Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `Events` | `Record<string, (...args: unknown[]) => void>` | Event name to handler type mapping |

**Constructor:**

```typescript
new ScopedEventEmitter<Events>(scope: Scope)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `on(event, handler)` | Subscribe to an event. Returns unsubscribe function. |
| `once(event, handler)` | Subscribe once. Handler auto-removed after first call. |
| `off(event, handler)` | Unsubscribe a specific handler. |
| `emit(event, ...args)` | Emit event synchronously. Returns count of handlers called. |
| `emitAsync(event, ...args)` | Emit event asynchronously. Awaits all async handlers. |
| `listenerCount(event)` | Get number of listeners for an event. |
| `hasListeners(event)` | Check if event has any listeners. |
| `eventNames()` | Get array of event names with listeners. |
| `removeAllListeners(event?)` | Remove all listeners for a specific event or all events. |

**Example:**

```typescript
import { scope, ScopedEventEmitter } from 'go-go-scope'

await using s = scope()

// Create typed emitter
const emitter = new ScopedEventEmitter<{
  data: (chunk: string) => void
  end: () => void
  error: (err: Error) => void
}>(s)

// Subscribe
const unsubscribe = emitter.on('data', (chunk) => {
  console.log('Received:', chunk)
})

// Emit
emitter.emit('data', 'Hello World')

// Unsubscribe
unsubscribe()

// Or use once
emitter.once('end', () => {
  console.log('Stream ended')
})

// All listeners auto-removed when scope disposes
```

**Features:**

- **Type-safe**: Full TypeScript support for event names and payloads
- **Auto-cleanup**: All listeners removed when parent scope disposes
- **Error isolation**: Errors in handlers don't affect other handlers
- **Multiple handlers**: Multiple handlers can subscribe to the same event
- **Async support**: `emitAsync` waits for all async handlers to complete

---

## Error Classes

### `AbortError`

Error thrown when an operation is aborted via AbortSignal.

```typescript
import { AbortError } from "go-go-scope";

try {
  await s.task(async ({ signal }) => {
    throw new AbortError("Operation cancelled");
  });
} catch (err) {
  if (err instanceof AbortError) {
    console.log("Operation was aborted:", err.reason);
  }
}
```

---

### `ChannelFullError`

Error thrown when a channel buffer is full with 'error' backpressure strategy.

```typescript
import { ChannelFullError } from "go-go-scope";

const ch = s.channel<number>(1, { backpressure: 'error' });
await ch.send(1);
try {
  await ch.send(2); // Throws ChannelFullError
} catch (err) {
  if (err instanceof ChannelFullError) {
    console.log("Channel is full");
  }
}
```

---

### `UnknownError`

A catch-all error class for system/infrastructure errors.

```typescript
import { UnknownError } from "go-go-scope";

const [err, data] = await s.task(() => fetchData());
if (err instanceof UnknownError) {
  // System error (network, timeout, etc.)
  console.error("System failure:", err.message);
}
```

---

## Additional Types

### `DisposableScope`

Minimal scope interface for internal use and plugins.

```typescript
interface DisposableScope {
  readonly isDisposed: boolean;
  readonly signal: AbortSignal;
  registerDisposable(disposable: Disposable | AsyncDisposable): void;
}
```

---

### `ScopePlugin`

Interface for creating plugins to extend scope functionality.

```typescript
interface ScopePlugin {
  name: string;
  install(scope: Scope, options: ScopeOptions): void;
  cleanup?(scope: Scope): void;
}
```

---

### `GracefulShutdownOptions`

Options for graceful shutdown configuration. Pass to the `gracefulShutdown` scope option.

```typescript
interface GracefulShutdownOptions {
  /** Signals to listen for (default: ['SIGTERM', 'SIGINT']) */
  signals?: NodeJS.Signals[];
  /** Timeout in milliseconds before forceful exit (default: 30000) */
  timeout?: number;
  /** Callback when shutdown is requested */
  onShutdown?: (signal: NodeJS.Signals) => void | Promise<void>;
  /** Callback when shutdown is complete */
  onComplete?: () => void | Promise<void>;
  /** Exit process after shutdown (default: true) */
  exit?: boolean;
  /** Exit code on success (default: 0) */
  successExitCode?: number;
  /** Exit code on timeout (default: 1) */
  timeoutExitCode?: number;
}
```

**Example:**

```typescript
await using s = scope({
  gracefulShutdown: {
    signals: ['SIGTERM', 'SIGINT'],
    timeout: 30000,
    onShutdown: async (signal) => {
      console.log(`Received ${signal}, cleaning up...`);
    },
    onComplete: () => {
      console.log('Shutdown complete');
    }
  }
});
```

---

### `TokenBucketOptions`

Options for creating a token bucket rate limiter.

```typescript
interface TokenBucketOptions {
  capacity: number;
  refillRate: number;
  initialTokens?: number;
  cache?: CacheProvider;
  key?: string;
}
```

---

### `PrioritizedItem<T>`

Interface for items that have a priority in priority channels.

```typescript
interface PrioritizedItem<T> {
  value: T;
  priority: number;
}
```

---

### `PriorityComparator<T>`

Comparator function type for priority channels.

```typescript
type PriorityComparator<T> = (a: T, b: T) => number;
```

---

### `HealthCheckResult`

Result of a resource pool health check.

```typescript
interface HealthCheckResult {
  healthy: boolean;
  message?: string;
}
```

