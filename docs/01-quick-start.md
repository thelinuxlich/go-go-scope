# Quick Start Guide

Welcome! This guide will get you started with `go-go-scope` in 5 minutes.

## Your First Example

The simplest way to understand `go-go-scope` is with a timeout example:

```typescript
import { scope } from 'go-go-scope'

// Fetch data with a 5-second timeout
async function fetchData() {
  await using s = scope({ timeout: 5000 })
  
  const [err, data] = await s.task(async ({ signal }) => {
    const response = await fetch('/api/data', { signal })
    return response.json()
  })
  
  if (err) {
    console.log('Failed:', err.message)
    return null
  }
  
  return data
}
```

**What just happened?**
- `scope({ timeout: 5000 })` creates a scope that auto-cancels after 5 seconds
- `s.task()` creates a task that can be cancelled
- `{ signal }` is an `AbortSignal` you pass to `fetch()` for cancellation
- `[err, data]` is a Result tuple - always `[error, value]`
- `await using` automatically cleans up when done

## Key Pattern: The Result Tuple

Every task returns `[error, value]`:

```typescript
const [err, user] = await s.task(() => fetchUser(1))

if (err) {
  // Handle error
} else {
  // Use user
}
```

This is different from Promises that throw errors. Result tuples never throw!

## Common Patterns

### 1. Parallel Operations

```typescript
await using s = scope()

// Start multiple tasks
const userTask = s.task(() => fetchUser(1))
const postsTask = s.task(() => fetchPosts(1))

// Wait for both
const [[userErr, user], [postsErr, posts]] = await Promise.all([
  userTask,
  postsTask
])
```

### 2. Race Operations

```typescript
await using s = scope()

// First to complete wins, others are cancelled
const [err, fastest] = await s.race([
  () => fetch('https://fast.com'),
  () => fetch('https://slow.com'),
])
```

### 3. Retry on Failure

```typescript
await using s = scope()

const [err, result] = await s.task(
  () => fetchData(),
  { retry: { maxRetries: 3, delay: 1000 } }
)
```

## Next Steps

Now that you've seen the basics:

1. **[Core Concepts](./02-concepts.md)** - Learn why structured concurrency matters and understand Scope vs Task
2. **[API Reference](./03-api-reference.md)** - Explore all available methods and options
3. **[Advanced Features](./04-advanced-features.md)** - Discover channels, circuit breakers, and polling
