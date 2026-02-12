# Core Concepts

This document explains the fundamental concepts behind `go-go-scope`.

## Table of Contents

1. [What is Structured Concurrency?](#what-is-structured-concurrency)
2. [The Scope](#the-scope)
3. [The Task](#the-task)
4. [Result Tuples](#result-tuples)
5. [Cancellation](#cancellation)

---

## What is Structured Concurrency?

Structured concurrency is a programming paradigm that ensures:

1. **No task is left behind** - When a scope ends, all tasks inside it are cancelled
2. **No fire-and-forget** - Every async operation has a parent that waits for it
3. **Cleanup is guaranteed** - Resources are always cleaned up, even on error

Think of it like function calls:

```typescript
// Regular function - structured!
function parent() {
  const result = child()  // Parent waits for child
  console.log(result)     // This always runs after child
}

// Unstructured async (the problem)
async function parent() {
  child()  // Fire and forget! Parent doesn't wait
  console.log('Done')  // This might run before child finishes
}

// Structured async with go-go-scope
async function parent() {
  await using s = scope()
  const [err, result] = await s.task(() => child())  // Parent waits
  console.log(result)  // This always runs after child
}
```

### The Problem: Fire-and-Forget

Without structured concurrency:

```typescript
async function fetchUserData() {
  // These run independently - no cleanup guarantee!
  fetchUser(1)  // Might keep running forever
  fetchUser(2)  // Even if we return early
  
  return 'done'  // Tasks might still be running!
}
```

### The Solution: Scoped Operations

With structured concurrency:

```typescript
async function fetchUserData() {
  await using s = scope()
  
  // These are bound to the scope
  const [err1, user1] = await s.task(() => fetchUser(1))
  const [err2, user2] = await s.task(() => fetchUser(2))
  
  return 'done'  // All tasks are done too!
}
```

---

## The Scope

A **Scope** is a container for async operations. Think of it as a "workspace" for your tasks.

### Creating a Scope

```typescript
import { scope } from 'go-go-scope'

// Simple scope
await using s = scope()

// With timeout
await using s = scope({ timeout: 5000 })

// With concurrency limit
await using s = scope({ concurrency: 3 })
```

### What Does a Scope Do?

1. **Contains tasks** - All tasks are created within a scope
2. **Propagates cancellation** - When the scope ends, tasks are cancelled
3. **Manages resources** - Services you provide are cleaned up automatically
4. **Tracks execution** - Knows what tasks are running

### Scope Lifetime

```typescript
async function example() {
  // Scope starts
  await using s = scope({ timeout: 5000 })
  
  // Tasks run inside the scope
  const [err, user] = await s.task(() => fetchUser(1))
  
  // At the end of the function, scope automatically:
  // 1. Cancels any running tasks
  // 2. Cleans up resources
  // 3. Closes the scope
}
```

### Parent-Child Scopes

Scopes can inherit from parents:

```typescript
await using parent = scope()
  .provide('db', () => openDatabase())

// Child inherits parent's services and cancellation
await using child = scope({ parent })

// Can use parent's services!
const [err, result] = await child.task(({ services }) => {
  return services.db.query('SELECT 1')
})
```

---

## The Task

A **Task** is a unit of work within a scope. It's like a Promise, but:
- **Lazy** - Doesn't start until you await it
- **Cancellable** - Respects the AbortSignal
- **Returns a Result** - Never throws, always returns `[error, value]`

### Creating Tasks

```typescript
await using s = scope()

// Create a task (doesn't start yet!)
const userTask = s.task(() => fetchUser(1))

console.log(userTask.isStarted)  // false

// Start it by awaiting
const [err, user] = await userTask
console.log(userTask.isStarted)  // true
```

### Lazy Execution

Tasks don't run until you await them. This gives you control:

```typescript
await using s = scope()

const primary = s.task(() => fetchFromPrimary())
const fallback = s.task(() => fetchFromFallback())

// Try primary first
const [err, result] = await primary
if (err) {
  // Only now does fallback start!
  const [fallbackErr, fallbackResult] = await fallback
  return fallbackResult
}
return result
```

### Parallel Execution

To run tasks in parallel, use `Promise.all`:

```typescript
await using s = scope()

const userTask = s.task(() => fetchUser(1))
const postsTask = s.task(() => fetchPosts(1))

// Both start now
const [[userErr, user], [postsErr, posts]] = await Promise.all([
  userTask,
  postsTask
])
```

---

## Result Tuples

Every task returns a **Result tuple**: `[error, value]`

```typescript
const [err, user] = await s.task(() => fetchUser(1))
//     ^^^  ^^^^
//     |      |
//     |      The value (if success)
//     The error (if failure)
```

### Why Result Tuples?

Promises throw errors:

```typescript
try {
  const user = await fetchUser(1)  // Might throw!
} catch (err) {
  // Handle error
}
```

Tasks return errors:

```typescript
const [err, user] = await s.task(() => fetchUser(1))
if (err) {
  // Handle error
} else {
  // Use user
}
```

### Benefits

1. **Explicit** - You must check for errors
2. **Type-safe** - TypeScript knows both types
3. **Composable** - Easy to aggregate results
4. **No try/catch** - Cleaner control flow

### Working with Results

```typescript
await using s = scope()

// Single task
const [err, user] = await s.task(() => fetchUser(1))
if (err) return handleError(err)

// Multiple tasks with parallel
const [userResult, postsResult] = await Promise.all([
  s.task(() => fetchUser(1)),
  s.task(() => fetchPosts(1))
])

const [userErr, user] = userResult
const [postsErr, posts] = postsResult
```

---

## Cancellation

Every task receives an `AbortSignal` that you can use for cancellation:

```typescript
await s.task(async ({ signal }) => {
  // Pass to fetch for automatic cancellation
  const response = await fetch(url, { signal })
  
  // Or check manually
  if (signal.aborted) {
    throw new Error('Cancelled!')
  }
  
  // Or listen for abort events
  signal.addEventListener('abort', () => {
    console.log('Task was cancelled')
  })
})
```

### When is Cancellation Triggered?

1. **Timeout** - Scope timeout is reached
2. **Scope disposal** - `await using` block ends
3. **Parent cancellation** - Parent scope is cancelled
4. **Manual abort** - You call `scope.signal.abort()`

### Example: Timeout

```typescript
await using s = scope({ timeout: 5000 })

const [err, data] = await s.task(async ({ signal }) => {
  // fetch will be cancelled after 5 seconds
  const response = await fetch('/slow-endpoint', { signal })
  return response.json()
})

if (err) {
  console.log('Request timed out or failed:', err.message)
}
```

---

## Summary

| Concept | What it is | Key characteristic |
|---------|------------|-------------------|
| **Structured Concurrency** | Pattern for async code | Tasks are bounded by scopes |
| **Scope** | Container for tasks | Manages lifetime and cancellation |
| **Task** | Unit of work | Lazy, cancellable, returns Result |
| **Result Tuple** | `[error, value]` | Explicit error handling |
| **Cancellation** | `AbortSignal` | Automatic cleanup on timeout/error |
