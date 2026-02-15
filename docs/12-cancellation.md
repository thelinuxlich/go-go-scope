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

## Next Steps

- **[API Reference](./03-api-reference.md)** - Complete API documentation
- **[Advanced Patterns](./09-advanced-patterns.md)** - More complex usage patterns
