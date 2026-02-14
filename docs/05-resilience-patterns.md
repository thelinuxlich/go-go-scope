# Resilience Patterns

Patterns for building fault-tolerant applications with `go-go-scope`.

## Table of Contents

- [Circuit Breaker](#circuit-breaker)
- [Retry](#retry)
- [Timeout](#timeout)
- [Deadlock Detection](#deadlock-detection)

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

## Next Steps

- **[Observability](./06-observability.md)** - Metrics, logging, and profiling
- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
