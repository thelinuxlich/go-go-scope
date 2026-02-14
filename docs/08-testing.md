# Testing

Helper functions for testing code that uses `go-go-scope`.

## Table of Contents

- [Installation](#installation)
- [createMockScope](#createmockscope)
- [createControlledTimer](#createcontrolledtimer)
- [createSpy](#createspy)
- [flushPromises](#flushpromises)
- [assertScopeDisposed](#assertscopedisposed)
- [Complete Example](#complete-example)

---

## Installation

```typescript
import { createMockScope, createControlledTimer, createSpy, flushPromises, assertScopeDisposed } from 'go-go-scope/testing'
```

---

## createMockScope

Creates a mock scope for testing with tracking capabilities.

```typescript
import { createMockScope } from 'go-go-scope/testing'

test('should track task calls', async () => {
  const s = createMockScope({
    autoAdvanceTimers: true,
    deterministic: true
  })
  
  await s.task(() => Promise.resolve(1))
  await s.task(() => Promise.resolve(2))
  
  expect(s.getTaskCalls().length).toBe(2)
})
```

**Mock Scope Options:**
- `autoAdvanceTimers` - Automatically advance timers
- `deterministic` - Use deterministic random seeds
- `services` - Pre-configured services to inject
- `aborted` - Start in aborted state
- `abortReason` - Initial abort reason

**Mock Scope Methods:**
- `getTaskCalls()` - Get all recorded task calls
- `clearTaskCalls()` - Clear recorded calls
- `abort(reason?)` - Abort the scope

---

## createControlledTimer

Controlled timer environment for testing async operations.

```typescript
import { createControlledTimer } from 'go-go-scope/testing'

test('should handle timeouts', () => {
  const timer = createControlledTimer()
  const callback = vi.fn()
  
  // Schedule a timeout
  timer.setTimeout(callback, 1000)
  
  // Fast-forward time
  timer.advance(500)
  expect(callback).not.toHaveBeenCalled()
  
  timer.advance(500)
  expect(callback).toHaveBeenCalled()
})
```

**Timer Methods:**
- `setTimeout(callback, delay)` - Schedule callback
- `clearTimeout(id)` - Cancel scheduled callback
- `advance(ms)` - Advance time by milliseconds
- `flush()` - Run all pending timers immediately
- `reset()` - Reset all timers

---

## createSpy

Creates a spy function for testing.

```typescript
import { createSpy } from 'go-go-scope/testing'

test('should track calls', () => {
  const spy = createSpy<[number, number], number>()
    .mockImplementation((a, b) => a + b)
  
  const result = spy(2, 3)
  
  expect(result).toBe(5)
  expect(spy.wasCalled()).toBe(true)
  expect(spy.wasCalledWith(2, 3)).toBe(true)
  expect(spy.getCalls()).toHaveLength(1)
})
```

**Spy Methods:**
- `mockImplementation(fn)` - Set implementation
- `mockReturnValue(value)` - Set return value
- `mockReset()` - Clear all calls
- `wasCalled()` - Check if called
- `wasCalledWith(...args)` - Check if called with args
- `getCalls()` - Get all call records

---

## flushPromises

Waits for all promises to settle.

```typescript
import { flushPromises } from 'go-go-scope/testing'

test('async operation', async () => {
  let resolved = false
  Promise.resolve().then(() => { resolved = true })
  
  await flushPromises()
  
  expect(resolved).toBe(true)
})
```

---

## assertScopeDisposed

Asserts that a scope has been properly disposed.

```typescript
import { assertScopeDisposed } from 'go-go-scope/testing'

test('should dispose properly', async () => {
  const s = scope()
  
  await s.task(() => doSomething())
  
  await assertScopeDisposed(s)
  
  expect(s.isDisposed).toBe(true)
  expect(s.signal.aborted).toBe(true)
})
```

---

## Complete Example

```typescript
import { describe, test, expect } from 'vitest'
import { createMockScope, flushPromises } from 'go-go-scope/testing'

describe('UserService', () => {
  test('should fetch user with retries', async () => {
    const s = createMockScope()
    
    // Mock API call
    const mockApi = {
      fetchUser: vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ id: 1, name: 'John' })
    }
    
    const [err, user] = await s.task(
      () => mockApi.fetchUser(1),
      { retry: { maxRetries: 3 } }
    )
    
    expect(err).toBeUndefined()
    expect(user).toEqual({ id: 1, name: 'John' })
    expect(mockApi.fetchUser).toHaveBeenCalledTimes(2)
    expect(s.getTaskCalls()[0].options?.retry?.maxRetries).toBe(3)
  })
  
  test('should abort on cancellation', async () => {
    const s = createMockScope()
    
    const task = s.task(async ({ signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('Cancelled'))
        })
      })
    })
    
    // Abort after 100ms
    setTimeout(() => s.abort('user cancelled'), 100)
    
    const [err] = await task
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Cancelled')
  })
})
```

See `examples/testing-utilities.ts` for more examples.

---

## Next Steps

- **[Advanced Patterns](./09-advanced-patterns.md)** - Resource pools, parent-child scopes
- **[Comparisons](./10-comparisons.md)** - Compare with other approaches
