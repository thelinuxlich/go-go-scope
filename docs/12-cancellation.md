# Cancellation Utilities

Lightweight helper functions for working with `AbortSignal` without introducing new classes or concepts.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [throwIfAborted](#throwifaborted)
- [onAbort](#onabort)
- [abortPromise](#abortpromise)
- [raceSignals](#racesignals)
- [whenAborted](#whenaborted)
- [Usage Examples](#usage-examples)
- [Edge Cases and Careful Handling](#edge-cases-and-careful-handling)

---

## Overview

These utilities provide ergonomic helpers for `AbortSignal`, the web standard for cancellation. They work seamlessly with go-go-scope's structured concurrency while remaining compatible with any code that uses `AbortSignal`.

### Why These Utilities?

| Without Utilities | With Utilities |
|-------------------|----------------|
| `if (signal.aborted) throw signal.reason` | `throwIfAborted(signal)` |
| `signal.addEventListener('abort', ...)` | `onAbort(signal, callback)` |
| Manual AbortController wiring | `raceSignals([s1, s2])` |

---

## Installation

```typescript
import {
  throwIfAborted,
  onAbort,
  abortPromise,
  raceSignals,
  whenAborted
} from 'go-go-scope'
```

---

## throwIfAborted

Throws the abort reason if the signal is already aborted. Useful for early-exit checks.

```typescript
function throwIfAborted(signal: AbortSignal): void
```

**Example:**

```typescript
await s.task(({ signal }) => {
  throwIfAborted(signal)  // Exit early if cancelled
  
  const data = await fetchPart1()
  throwIfAborted(signal)  // Check again before part 2
  
  const moreData = await fetchPart2()
  return process(data, moreData)
})
```

---

## onAbort

Registers a callback to be invoked when the signal is aborted. Returns a `Disposable` that can be used to unregister the callback.

```typescript
function onAbort(
  signal: AbortSignal,
  callback: (reason: unknown) => void
): Disposable
```

**Features:**
- Calls callback immediately if signal is already aborted
- Callback is invoked only once
- Returns a `Disposable` - use with `using` for automatic cleanup

**Example:**

```typescript
await s.task(({ signal }) => {
  // Register cleanup
  using _cleanup = onAbort(signal, (reason) => {
    console.log('Task cancelled:', reason)
  })
  
  // Cleanup is automatically unregistered when:
  // 1. Task completes successfully
  // 2. Task throws
  // 3. Signal is aborted (callback fires first)
  
  return await longRunningOperation()
})
```

**Manual unregister:**

```typescript
const disposable = onAbort(signal, () => {
  console.log('Aborted!')
})

// Later: unregister without waiting for abort
disposable[Symbol.dispose]()
```

---

## abortPromise

Creates a promise that rejects when the signal is aborted. Useful for racing operations against cancellation.

```typescript
function abortPromise(signal: AbortSignal): Promise<never>
```

**Example:**

```typescript
await s.task(async ({ signal }) => {
  try {
    const result = await Promise.race([
      fetchData(),
      abortPromise(signal)
    ])
    return result
  } catch (err) {
    if (signal.aborted) {
      console.log('Request was cancelled')
    }
    throw err
  }
})
```

---

## raceSignals

Creates a new signal that aborts when **any** of the input signals abort.

```typescript
function raceSignals(signals: AbortSignal[]): AbortSignal
```

**Use cases:**
- Combine scope cancellation with a custom timeout
- Race multiple independent cancellation sources
- Bridge between different cancellation contexts

**Example:**

```typescript
// Create a 5-second timeout
const timeoutController = new AbortController()
setTimeout(() => timeoutController.abort(new Error('Timeout')), 5000)

// Race between scope cancellation and timeout
const combined = raceSignals([
  scope.signal,
  timeoutController.signal
])

// Use with fetch
await fetch(url, { signal: combined })
// Aborts if EITHER:
// - scope is disposed
// - 5 second timeout fires
```

**With go-go-scope:**

```typescript
await using s = scope()

// Custom operation timeout
const opTimeout = new AbortController()
setTimeout(() => opTimeout.abort(), 1000)

await s.task(async ({ signal }) => {
  const combined = raceSignals([signal, opTimeout.signal])
  
  // This fetch respects both scope cancellation AND operation timeout
  return await fetch(url, { signal: combined })
})
```

---

## whenAborted

Returns a promise that resolves when the signal is aborted. Useful for awaiting cancellation.

```typescript
function whenAborted(signal: AbortSignal): Promise<unknown>
```

**Example:**

```typescript
await s.task(async ({ signal }) => {
  // Start operation
  const operation = longRunningOperation()
  
  // Also wait for cancellation
  const cancellation = whenAborted(signal)
  
  // Race them
  const result = await Promise.race([operation, cancellation])
  
  if (signal.aborted) {
    console.log('Cancelled before completion')
    // Clean up partial work
    await cleanup()
    return null
  }
  
  return result
})
```

---

## Usage Examples

### Example 1: Cooperative Cancellation in a Loop

```typescript
await s.task(({ signal }) => {
  const results: string[] = []
  
  for (const item of items) {
    // Check cancellation before each iteration
    throwIfAborted(signal)
    
    const result = await process(item)
    results.push(result)
  }
  
  return results
})
```

### Example 2: Cleanup on Cancellation

```typescript
await s.task(({ signal }) => {
  const tempFile = createTempFile()
  
  // Ensure temp file is cleaned up if cancelled
  using _cleanup = onAbort(signal, () => {
    tempFile.delete()
  })
  
  // Write data
  await tempFile.write(data)
  
  // Process
  const result = await processFile(tempFile)
  
  // Success - move to permanent location
  await tempFile.moveToPermanent()
  
  return result
  // Cleanup disposable auto-disposes here (but callback won't fire
  // since signal isn't aborted)
})
```

### Example 3: Multiple Cancellation Sources

```typescript
await using s = scope()

// User cancellation
const userCancel = new AbortController()
cancelButton.onClick = () => userCancel.abort(new Error('User cancelled'))

// Server timeout
const serverTimeout = new AbortController()
setTimeout(() => serverTimeout.abort(new Error('Server timeout')), 30000)

await s.task(async ({ signal }) => {
  // Combine all cancellation sources
  const combined = raceSignals([
    signal,           // Scope disposal
    userCancel.signal, // User clicked cancel
    serverTimeout.signal // Server timeout
  ])
  
  try {
    return await fetchData({ signal: combined })
  } catch (err) {
    if (signal.aborted) {
      console.log('Scope cancelled')
    } else if (userCancel.signal.aborted) {
      console.log('User cancelled')
    } else if (serverTimeout.signal.aborted) {
      console.log('Server timeout')
    }
    throw err
  }
})
```

### Example 4: Polling with Cancellation

```typescript
await s.task(async ({ signal }) => {
  while (true) {
    throwIfAborted(signal)
    
    try {
      const status = await checkStatus()
      if (status.complete) return status
    } catch (err) {
      console.error('Check failed:', err)
    }
    
    // Wait before next poll, but allow cancellation
    await Promise.race([
      delay(5000),
      whenAborted(signal)
    ])
  }
})
```

### Example 5: Streaming with Cleanup

```typescript
await s.task(async ({ signal }) => {
  const stream = createReadStream()
  
  using _cleanup = onAbort(signal, () => {
    stream.close()
  })
  
  for await (const chunk of stream) {
    throwIfAborted(signal)
    await processChunk(chunk)
  }
})
```

---

## Edge Cases and Careful Handling

While `AbortSignal` is the web standard for cancellation, it has some limitations that require careful handling. Understanding these edge cases will help you write more robust code.

### 1. AbortSignal is Advisory

The most important limitation: **AbortSignal only cancels operations that check for it**. If code doesn't respect the signal, it runs to completion regardless of cancellation.

```typescript
await using s = scope()

const task = s.task(async ({ signal }) => {
  const response = await fetch('/api/data', { signal })
  // ❌ Problem: This line executes even if signal is aborted
  // if fetch completed but abort fired during the await
  await saveToDatabase(response)  // No signal check!
})

await s[Symbol.asyncDispose]()
```

**Solution:** Check the signal at critical points:

```typescript
await s.task(async ({ signal }) => {
  const response = await fetch('/api/data', { signal })
  
  // ✅ Check before proceeding
  throwIfAborted(signal)
  
  await saveToDatabase(response)
})
```

### 2. Non-Cancellable Operations

Some operations cannot be cancelled:

```typescript
await s.task(async ({ signal }) => {
  // ❌ This blocks the event loop and ignores AbortSignal
  const crypto = require('crypto')
  crypto.pbkdf2Sync('password', 'salt', 100000, 64, 'sha512')
  
  // Signal is already aborted, but this still runs
  throwIfAborted(signal)  // Too late!
})
```

**Solution:** Use async alternatives that respect the signal:

```typescript
import { pbkdf2 } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)

await s.task(async ({ signal }) => {
  // ✅ Check before heavy work
  throwIfAborted(signal)
  
  // Do the work
  const key = await pbkdf2Async('password', 'salt', 100000, 64, 'sha512')
  
  // ✅ Check after
  throwIfAborted(signal)
  
  return key
})
```

### 3. Missing Signal Propagation

A common mistake is not passing the signal to all async operations:

```typescript
await s.task(async ({ signal }) => {
  const data = await fetchWithSignal(url, signal)
  
  // ❌ Forgot to pass signal - won't be cancelled!
  const processed = await processData(data)
  
  return processed
})
```

**Solution:** Pass signal to all cancellable operations:

```typescript
await s.task(async ({ signal }) => {
  const data = await fetchWithSignal(url, signal)
  
  // ✅ Pass signal through
  const processed = await processData(data, { signal })
  
  return processed
})
```

### 4. Race Between Completion and Cancellation

There's a window where a task can complete after abort fires but before the scope notices:

```typescript
await using s = scope()

const task = s.task(async ({ signal }) => {
  await delay(100)
  // At this point, signal might be aborted
  // but we're about to return
  return 'completed'
})

// Fire abort
timeout(() => s[Symbol.asyncDispose](), 50)

// Task might complete before disposal checks
const [err, result] = await task
// Could get result even though scope was disposed!
```

**Solution:** Check signal before returning:

```typescript
await s.task(async ({ signal }) => {
  await delay(100)
  
  // ✅ Verify still valid
  throwIfAborted(signal)
  
  return 'completed'
})
```

### 5. Cleanup Ordering

Resources are disposed in LIFO order, but disposal is async and can fail:

```typescript
await using s = scope()

s.provide('db', () => connect(), db => db.close())
s.provide('cache', () => createCache(), cache => cache.flush())

// On disposal:
// 1. cache.flush() runs
// 2. If flush() throws, db.close() still runs
// 3. But errors might hide each other
```

**Solution:** Use hooks to track cleanup:

```typescript
await using s = scope({
  hooks: {
    onDispose: (index, error) => {
      if (error) {
        console.error(`Resource ${index} failed to dispose:`, error)
      }
    }
  }
})
```

### 6. Signal State After Disposal

After a scope is disposed, its signal remains aborted. Be careful with cached references:

```typescript
const scopes: Scope[] = []

async function createWorker() {
  await using s = scope()
  scopes.push(s)  // ❌ Don't do this - scope will dispose
  
  // Later, trying to use cached scope:
  // s.signal is aborted, s.task() throws
}
```

**Solution:** Pass scopes explicitly or use parent-child relationships:

```typescript
async function createWorker(parent: Scope) {
  // ✅ Child scope inherits parent's lifetime
  await using s = scope({ parent })
  
  // When parent disposes, child is automatically cancelled
}
```

### Best Practices Checklist

- [ ] Check `signal.aborted` or use `throwIfAborted()` before and after heavy operations
- [ ] Pass `signal` to all cancellable async operations (fetch, streams, timeouts)
- [ ] Use `onAbort()` to register cleanup for external resources
- [ ] Avoid synchronous blocking operations in tasks
- [ ] Don't cache scope references that outlive their `await using` block
- [ ] Test cancellation by disposing scopes mid-operation
- [ ] Use child scopes for operations that should be cancelled together

### Comparison with Fiber-Based Systems

Libraries like Effect use fibers (cooperative multitasking) which provide:
- Precise interruption at yield points
- Uninterruptible sections for critical code
- Guaranteed finalizer execution

go-go-scope uses native Promises + AbortSignal which:
- ✅ Works with standard web APIs
- ✅ No runtime overhead
- ✅ Familiar async/await syntax
- ⚠️ Requires discipline to check signals
- ⚠️ Cannot interrupt blocking sync code

For most applications, careful use of AbortSignal provides sufficient cancellation guarantees. For mission-critical systems requiring absolute shutdown guarantees, consider fiber-based alternatives.

---

## Next Steps

- **[API Reference](./03-api-reference.md)** - Complete API documentation
- **[Advanced Patterns](./09-advanced-patterns.md)** - More complex usage patterns
