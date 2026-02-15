# Resilience Patterns

Patterns for building fault-tolerant applications with `go-go-scope`.

## Table of Contents

- [Circuit Breaker](#circuit-breaker)
- [Retry](#retry)
- [Timeout](#timeout)
- [Deadlock Detection](#deadlock-detection)
- [Typed Error Handling](#typed-error-handling)

---

## Circuit Breaker

Prevent cascading failures by stopping calls to failing services.

### How It Works

1. **Closed state**: Requests pass through normally
2. **Open state**: After `failureThreshold` failures, requests fail fast
3. **Half-open state**: After `resetTimeout`, one request is allowed to test recovery

### Basic Usage

```typescript
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,    // Open after 5 failures
    resetTimeout: 30000     // Try again after 30 seconds
  }
})

// All tasks automatically use the circuit breaker
const [err, result] = await s.task(() => fetchCriticalData())
```

### With Fallback

```typescript
await using s = scope({
  circuitBreaker: { failureThreshold: 3, resetTimeout: 10000 }
})

const primary = s.task(() => fetchFromPrimary())
const fallback = s.task(() => fetchFromFallback())

// Try primary first
const [err, result] = await primary
if (err) {
  // Circuit might be open, try fallback
  const [fallbackErr, fallbackResult] = await fallback
  if (fallbackErr) throw fallbackErr
  return fallbackResult
}
return result
```

---

## Retry

Add automatic retry logic to any task.

### Basic Retry

```typescript
await using s = scope()

const [err, user] = await s.task(
  () => fetchUser(id),
  { retry: { maxRetries: 3 } }
)
```

### With Delay

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: 1000  // 1 second between retries
    }
  }
)
```

### Exponential Backoff

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
      // Attempt 1: 2000ms
      // Attempt 2: 4000ms
      // Attempt 3: 8000ms
      // ... up to 30000ms
    }
  }
)
```

### Conditional Retry

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 3,
      retryCondition: (error) => {
        // Only retry network errors
        return error instanceof NetworkError
      },
      onRetry: (error, attempt) => {
        console.log(`Retry ${attempt} after error: ${error.message}`)
      }
    }
  }
)
```

### Retry with Timeout

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    timeout: 5000,  // Each attempt has 5 seconds
    retry: {
      maxRetries: 3,
      delay: 1000
    }
  }
)
```

---

## Timeout

Set timeouts at scope or task level for automatic cancellation.

### Scope-Level Timeout

```typescript
// All tasks in this scope must complete within 5 seconds
await using s = scope({ timeout: 5000 })

const [err, result] = await s.task(() => fetchData())
// If fetch takes >5s, task is cancelled and returns error
```

### Task-Level Timeout

```typescript
await using s = scope()

// Specific timeout for this task only
const [err, result] = await s.task(
  () => fetchData(),
  { timeout: 3000 }  // 3 second timeout for this task
)
```

### Nested Timeouts

```typescript
// Scope has 10s timeout
await using s = scope({ timeout: 10000 })

// This task has stricter 3s timeout
const [err, result] = await s.task(
  () => fetchData(),
  { timeout: 3000 }
)
// Task times out after 3s, even though scope allows 10s
```

---

## Deadlock Detection

Detect potential deadlocks in your concurrent code.

### Basic Usage

```typescript
await using s = scope({
  deadlockDetection: {
    timeout: 30000,  // Warn if tasks wait >30s
    onDeadlock: (waitingTasks) => {
      console.error('Potential deadlock detected:', waitingTasks)
    }
  }
})

// If any task waits too long, you'll get a warning
await s.task(async () => {
  // Long-running operation
})
```

### How It Works

The deadlock detector monitors tasks waiting on resources (channels, semaphores, pools) and warns if they've been waiting longer than the configured timeout.

**Note:** This detects *potential* deadlocks (tasks stuck waiting), not actual circular waits.

---

---

## Typed Error Handling

Use [`go-go-try`](https://github.com/thelinuxlich/go-go-try) alongside `go-go-scope` for automatic union inference of typed errors. This enables exhaustive pattern matching on error types without explicit type annotations.

### Why Typed Errors?

Instead of `unknown` error types, define specific tagged error classes using the `taggedError` helper:

```typescript
import { taggedError } from 'go-go-try'

// Define tagged error classes with the helper
const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')
const ValidationError = taggedError('ValidationError')

// Create a union type
import type { TaggedUnion } from 'go-go-try'
type AppError = TaggedUnion<[typeof DatabaseError, typeof NetworkError, typeof ValidationError]>
// Equivalent to: DatabaseError | NetworkError | ValidationError
```

### Using Typed Errors with `errorClass`

Use the `errorClass` option to automatically wrap errors in typed error classes. This enables automatic union inference when combined with go-go-try's `success()` and `failure()` helpers.

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')

// No explicit return type needed!
// TypeScript infers: Promise<Result<DatabaseError | NetworkError, User>>
async function fetchUser(id: string) {
  await using s = scope()
  
  // Database operation - errors wrapped in DatabaseError
  const [dbErr, user] = await s.task(
    () => queryDatabase(id),
    { errorClass: DatabaseError }
  )
  if (dbErr) return failure(dbErr)
  
  // Network operation - errors wrapped in NetworkError
  const [netErr, enriched] = await s.task(
    () => enrichUserData(user!),
    { errorClass: NetworkError }
  )
  if (netErr) return failure(netErr)
  
  return success(enriched)
}

// Usage with exhaustive pattern matching
const [err, user] = await fetchUser('123')
if (err) {
  switch (err._tag) {
    case 'DatabaseError':
      console.error('DB failed:', err.message)
      break
    case 'NetworkError': 
      console.error('Network issue:', err.message)
      break
    default:
      // Compile-time safety: TypeScript errors if any case is missing
      const _exhaustive: never = err
  }
} else {
  console.log('Got user:', user.name)
}
```

### Alternative: Using goTryRaw with Raw Operations

If you don't need all scope features (like automatic cancellation signal propagation), use `goTryRaw` directly on raw operations:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure, goTryRaw } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')

// Use goTryRaw directly on raw operations (not wrapped in s.task)
async function fetchUser(id: string) {
  await using s = scope({ timeout: 5000 })
  
  // goTryRaw wraps the operation and converts errors
  const [dbErr, user] = await goTryRaw(
    () => queryDatabase(id),  // Raw operation
    DatabaseError
  )
  if (dbErr) return failure(dbErr)
  
  const [netErr, enriched] = await goTryRaw(
    () => enrichUserData(user!),  // Raw operation
    NetworkError
  )
  if (netErr) return failure(netErr)
  
  return success(enriched)
}
```

> **Note:** When using `goTryRaw` with raw operations, you lose automatic `AbortSignal` propagation. For cancellation support, pass the signal manually:
> ```typescript
> const [err, data] = await goTryRaw(
>   () => fetch(`/api/data?id=${id}`, { signal: s.signal }),
>   NetworkError
> )
> ```

### With Scope Features

Combine typed errors with all `go-go-scope` features:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')
const CacheError = taggedError('CacheError')

async function resilientFetch(id: string) {
  await using s = scope({
    timeout: 10000,
    circuitBreaker: { failureThreshold: 3 },
    retry: { maxRetries: 2 }
  })
  
  // All scope features work with typed errors
  const [dbErr, data] = await s.task(
    () => fetchFromDatabase(id),
    { errorClass: DatabaseError }
  )
  if (dbErr) return failure(dbErr)
  
  const [cacheErr, cached] = await s.task(
    () => updateCache(data!),
    { errorClass: CacheError }
  )
  if (cacheErr) return failure(cacheErr)
  
  return success(cached!)
}
```

### Helper Functions

The `go-go-try` package provides:

- **`taggedError(tag)`** - Creates a tagged error class for discriminated unions
- **`goTryRaw(fn, ErrorClass)`** - Wraps a function/promise and converts errors to your typed error class
- **`success(value)`** - Returns `Success<T>` for consistent return types
- **`failure(error)`** - Returns `Failure<E>` for consistent return types
- **`TaggedUnion<[...]>`** - Helper type to create union types from tagged error classes

### `go-go-scope` Integration

The `errorClass` option in `TaskOptions` enables typed error handling:

```typescript
task<T, E extends Error = Error>(
  fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>,
  options?: TaskOptions<E>
): Task<Result<E, T>>
```

When `errorClass` is provided, errors are automatically wrapped in that class.

### Type Inference Benefits

1. **No explicit types needed** - TypeScript infers the union automatically
2. **Exhaustive checking** - Pattern matching ensures all cases are handled
3. **Type narrowing** - Inside each `case`, the error is fully typed
4. **Refactoring safety** - Adding a new error type causes TypeScript errors where not handled

### Installation

```bash
npm install go-go-scope go-go-try
```

---

## Next Steps

- **[Observability](./06-observability.md)** - Metrics, logging, and profiling
- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
