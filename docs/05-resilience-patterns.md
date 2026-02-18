# Resilience Patterns

Patterns for building fault-tolerant applications with `go-go-scope`.

## Table of Contents

- [Circuit Breaker](#circuit-breaker)
- [Retry](#retry)
- [Timeout](#timeout)
- [Deadlock Detection](#deadlock-detection)
- [Typed Error Handling](#typed-error-handling)
- [Business Errors vs System Errors](#business-errors-vs-system-errors)

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

Using the built-in helper:

```typescript
import { exponentialBackoff } from 'go-go-scope'

const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: exponentialBackoff({ initial: 1000, max: 30000, jitter: 0.3 })
      // Attempt 1: ~1000ms (±30% jitter)
      // Attempt 2: ~2000ms (±30% jitter)
      // Attempt 3: ~4000ms (±30% jitter)
      // ... up to 30000ms
    }
  }
)
```

Or manually:

```typescript
const [err, result] = await s.task(
  () => fetchData(),
  {
    retry: {
      maxRetries: 5,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
    }
  }
)
```

### Built-in Retry Strategies

```typescript
import { 
  exponentialBackoff,  // Exponential with optional jitter
  jitter,              // Fixed delay with jitter
  linear,              // Linear increasing delay
  fullJitterBackoff,   // AWS-style full jitter
  decorrelatedJitter   // Azure-style decorrelated jitter
} from 'go-go-scope'

// Jitter - adds randomness to prevent thundering herd
await s.task(() => fetchData(), {
  retry: {
    delay: jitter(1000, 0.2)  // 1000ms ± 20%
  }
})

// Linear - increases by fixed amount
await s.task(() => fetchData(), {
  retry: {
    delay: linear(100, 50)  // 100, 150, 200, 250ms...
  }
})
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
import { assertNever } from 'go-go-try'

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
      // Compile-time safety: assertNever throws if any case is missing
      assertNever(err)
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

## Business Errors vs System Errors

A critical aspect of error handling is distinguishing between **business errors** (expected domain exceptions) and **system errors** (unexpected infrastructure failures). This distinction affects how you respond to errors:

| Aspect | Business Errors | System Errors |
|--------|----------------|---------------|
| **Cause** | Invalid input, business rule violation | Network failure, DB down, timeout |
| **Retry?** | No (deterministic) | Yes (may succeed later) |
| **HTTP Status** | 400, 404, 409, 422 | 500, 502, 503 |
| **Logging** | Info/Warn level | Error level + alert |
| **User Message** | Specific, actionable | Generic "Internal error" |
| **Default Class** | Your custom errors (with `_tag`) | `UnknownError` (from `go-go-scope`)

### Convention: Module-Based Error Classification

Rather than adding complexity to the library, use a simple **convention**: organize errors by module to make their nature obvious:

```
src/
├── errors/
│   ├── business.ts    # Expected domain errors
│   └── system.ts      # Infrastructure errors
├── services/
│   └── userService.ts
```

**`src/errors/business.ts`** - Expected business domain errors:

```typescript
import { taggedError } from 'go-go-try'

export const ValidationError = taggedError('ValidationError')
export const NotFoundError = taggedError('NotFoundError')
export const InsufficientFundsError = taggedError('InsufficientFundsError')
export const DuplicateEmailError = taggedError('DuplicateEmailError')
```

**`src/errors/system.ts`** - Infrastructure/system errors:

```typescript
import { taggedError } from 'go-go-try'

export const DatabaseError = taggedError('DatabaseError')
export const NetworkError = taggedError('NetworkError')
export const CacheError = taggedError('CacheError')
export const TimeoutError = taggedError('TimeoutError')
```

### Pattern: Using `systemErrorClass` (Defaults to `UnknownError`)

By default, all untagged errors are automatically wrapped in `UnknownError`, while tagged business errors are preserved. Use `systemErrorClass` when you want to use a custom error class instead of `UnknownError`.

```typescript
import { scope, UnknownError } from 'go-go-scope'
import { taggedError, success, failure, assert, assertNever } from 'go-go-try'
import { DatabaseError } from '../errors/system.js'
import { NotFoundError, InsufficientFundsError } from '../errors/business.js'

async function getUser(userId: string) {
  await using s = scope()
  
  // By default, untagged errors become UnknownError
  const [err, user] = await s.task(
    async () => {
      const record = await db.query('SELECT * FROM users WHERE id = ?', [userId])
      // Business condition: user doesn't exist
      // NotFoundError has _tag, so it's preserved (not wrapped)
      assert(record, NotFoundError, `User ${userId} not found`)
      return record
    }
    // No systemErrorClass specified - uses UnknownError by default
  )
  
  // Success case - early return
  if (err === undefined) return { status: 200, body: { user }}
  
  // Exhaustive error handling by _tag
  switch (err._tag) {
    case 'UnknownError':
      // System error (connection failure, timeout, etc.)
      logger.error('Database failure', err.cause)
      return { status: 500 }
    case 'NotFoundError':
      // Business error
      return { status: 404, body: { error: err.message } }
    default:
      // Compile-time check: TypeScript errors if any case is missing
      return assertNever(err)
  }
}

// Or specify a custom systemErrorClass:
async function getUserWithCustomError(userId: string) {
  await using s = scope()
  
  const [err, user] = await s.task(
    async () => {
      const record = await db.query('SELECT * FROM users WHERE id = ?', [userId])
      if (!record) throw new NotFoundError('User not found')
      return record
    },
    { 
      systemErrorClass: DatabaseError  // Use custom instead of UnknownError
    }
  )
  
  // err can be NotFoundError (business) or DatabaseError (system)
  if (err) return failure(err)
  return success(user)
}

async function transferMoney(fromId: string, toId: string, amount: number) {
  await using s = scope()
  
  // Fetch users - returns NotFoundError or DatabaseError
  const [fromErr, fromUser] = await getUser(fromId)
  if (fromErr) return failure(fromErr)
  
  const [toErr, toUser] = await getUser(toId)
  if (toErr) return failure(toErr)
  
  // Business validation - no system calls
  if (fromUser.balance < amount) {
    return failure(new InsufficientFundsError(fromUser.balance, amount))
  }
  
  // Execute transfer - only system errors possible
  const [txErr, tx] = await s.task(
    () => db.transaction(async (trx) => {
      await trx.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, fromId])
      await trx.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, toId])
      return { transactionId: generateId() }
    }),
    { systemErrorClass: DatabaseError }
  )
  
  if (txErr) return failure(txErr)
  
  return success(tx)
}
```

**How it works:**

By default (when neither option is specified):
- Errors with `_tag` property → preserved as-is (business errors)
- Errors without `_tag` → wrapped in `UnknownError` (system errors)

| Option | Behavior |
|--------|----------|
| No option (default) | Untagged errors → `UnknownError`; Tagged errors → preserved |
| `systemErrorClass` | Untagged errors → custom class; Tagged errors → preserved |
| `errorClass` | **All** errors → wrapped (overrides everything) |

### Differentiating at the Call Site

Import location tells you the error nature, but check the error type for business logic:

```typescript
import { DatabaseError, NetworkError } from './errors/system.js'
import { NotFoundError, ValidationError } from './errors/business.js'

const [err, result] = await transferMoney('user1', 'user2', 100)

if (err) {
  // Business errors: return appropriate HTTP status with details
  if (err instanceof NotFoundError) {
    return { status: 404, body: { error: err.message, code: 'USER_NOT_FOUND' } }
  }
  
  if (err instanceof InsufficientFundsError) {
    return { status: 422, body: { error: err.message, code: 'INSUFFICIENT_FUNDS' } }
  }
  
  // System errors: log, alert, return generic message
  if (err instanceof DatabaseError || err instanceof NetworkError) {
    logger.error('System failure during transfer', { error: err, fromId, toId, amount })
    alertOps(err)  // Page the on-call engineer
    return { status: 500, body: { error: 'Internal server error' } }
  }
  
  // Unknown error - treat as system error
  logger.error('Unexpected error', err)
  return { status: 500, body: { error: 'Internal server error' } }
}
```

### Retry Configuration by Error Type

Use `retryCondition` to avoid retrying business errors (they're deterministic). With the default `UnknownError` or a custom `systemErrorClass`, you get clean error handling:

```typescript
import { UnknownError } from 'go-go-scope'
import { NotFoundError, ValidationError } from './errors/business.js'

// Using default UnknownError
const [err, data] = await s.task(
  async () => {
    const record = await fetchExternalData(id)
    if (!record) throw new NotFoundError('Data not found')  // Preserved
    return record
  },
  {
    retry: {
      maxRetries: 3,
      delay: exponentialBackoff(),
      retryCondition: (error) => {
        // Don't retry business errors - they'll fail the same way
        if (error instanceof NotFoundError) return false
        if (error instanceof ValidationError) return false
        
        // Retry system errors (wrapped in UnknownError by default)
        // They may be transient network failures
        return error instanceof UnknownError
      }
    }
  }
)
```

Or with a custom `systemErrorClass`:

```typescript
import { DatabaseError } from './errors/system.js'
import { NotFoundError } from './errors/business.js'

const [err, data] = await s.task(
  async () => {
    const record = await db.query('SELECT * FROM data WHERE id = ?', [id])
    if (!record) throw new NotFoundError('Not found')
    return record
  },
  {
    systemErrorClass: DatabaseError,  // Use instead of UnknownError
    retry: {
      maxRetries: 3,
      delay: exponentialBackoff(),
      retryCondition: (error) => error instanceof DatabaseError
    }
  }
)

### Key Takeaways

1. **Organize by module**: Put system errors in `errors/system.ts`, business errors in `errors/business.ts`
2. **Default behavior**: Untagged errors are automatically wrapped in `UnknownError`; tagged business errors are preserved
3. **Use `systemErrorClass`**: Override the default `UnknownError` with a custom class (e.g., `DatabaseError`)
4. **Different handling**: Business errors → specific HTTP status + message; System errors (`UnknownError`) → 500 + alert + generic message
5. **Retry wisely**: Never retry business errors; retry system errors with backoff

This convention keeps your error handling explicit, testable, and maintainable.

---

## Next Steps

- **[Observability](./06-observability.md)** - Metrics, logging, and profiling
- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
