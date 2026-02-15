# Testing

Helper functions for testing code that uses `go-go-scope`.

## Table of Contents

- [Installation](#installation)
- [createMockScope](#createmockscope)
- [Mocking Services](#mocking-services)
- [Using override() for Testing](#using-override-for-testing)
- [createControlledTimer](#createcontrolledtimer)
- [createTimeController](#createtimecontroller)
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
- `overrides` - Services to override (for mocking)
- `aborted` - Start in aborted state
- `abortReason` - Initial abort reason

**Mock Scope Methods:**
- `getTaskCalls()` - Get all recorded task calls
- `clearTaskCalls()` - Clear recorded calls
- `abort(reason?)` - Abort the scope
- `mockService(key, value)` - Override a service with a mock

---

## Mocking Services

Replace real services with mocks for isolated unit testing.

### Using `overrides` Option

Provide services first, then override them with mocks:

```typescript
import { createMockScope } from 'go-go-scope/testing'

test('should use mocked database', async () => {
  const mockDb = {
    query: vi.fn().mockResolvedValue([{ id: 1, name: 'John' }])
  }

  const s = createMockScope({
    services: {
      db: { query: () => { throw new Error('Should not be called') } }
    },
    overrides: {
      db: mockDb
    }
  })

  // Your code uses s.use('db') which now returns mockDb
  const result = await (s as any).db.query('SELECT * FROM users')
  
  expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users')
  expect(result).toEqual([{ id: 1, name: 'John' }])
})
```

### Using `mockService()` Method

Override services at any time:

```typescript
import { createMockScope } from 'go-go-scope/testing'

test('should allow runtime mocking', async () => {
  const s = createMockScope({
    services: {
      api: { baseUrl: 'https://api.example.com' }
    }
  })

  // Replace the API with a mock
  s.mockService('api', {
    baseUrl: 'https://mock-api.example.com',
    fetch: vi.fn().mockResolvedValue({ data: 'mocked' })
  })

  // Now code using s.use('api') gets the mock
  const api = (s as any).api
  expect(api.baseUrl).toBe('https://mock-api.example.com')
})
```

### Chaining Mocks

Chain multiple mocks in a fluent style:

```typescript
const s = createMockScope({ services: { db: realDb, cache: realCache } })
  .mockService('db', mockDb)
  .mockService('cache', mockCache)
```

---

## Using override() for Testing

The `override()` method on `Scope` allows replacing services in any scope, making it perfect for testing production code with dependency injection.

### Basic Override Pattern

```typescript
import { scope } from 'go-go-scope'
import { describe, test, expect, vi } from 'vitest'

// Your production code
async function fetchUser(userId: string, s: Scope) {
  const db = s.use('db')
  return db.query('SELECT * FROM users WHERE id = ?', [userId])
}

describe('fetchUser', () => {
  test('returns user from database', async () => {
    await using s = scope()
      .provide('db', () => ({
        query: vi.fn().mockResolvedValue({ id: '1', name: 'John' })
      }))

    const user = await fetchUser('1', s)

    expect(user).toEqual({ id: '1', name: 'John' })
  })

  test('handles database error', async () => {
    await using s = scope()
      .provide('db', () => ({
        query: vi.fn().mockRejectedValue(new Error('Connection failed'))
      }))

    await expect(fetchUser('1', s)).rejects.toThrow('Connection failed')
  })
})
```

### Testing with Real + Mock Services

```typescript
// Production service that uses multiple dependencies
async function processOrder(orderId: string, s: Scope) {
  const db = s.use('db')
  const payment = s.use('payment')
  const email = s.use('email')

  const order = await db.getOrder(orderId)
  const result = await payment.charge(order.total)
  await email.sendConfirmation(order.customerEmail, result.id)
  
  return result
}

describe('processOrder', () => {
  test('charges payment and sends email', async () => {
    const mockPayment = {
      charge: vi.fn().mockResolvedValue({ id: 'pay_123', status: 'success' })
    }
    const mockEmail = {
      sendConfirmation: vi.fn().mockResolvedValue(undefined)
    }

    await using s = scope()
      .provide('db', () => ({
        getOrder: vi.fn().mockResolvedValue({ 
          id: 'ord_1', 
          total: 100,
          customerEmail: 'john@example.com'
        })
      }))
      .provide('payment', () => mockPayment)  // Real implementation
      .provide('email', () => mockEmail)      // Real implementation
      // Override just the payment service for this test
      .override('payment', () => ({
        charge: vi.fn().mockResolvedValue({ id: 'mock_pay', status: 'success' })
      }))

    const result = await processOrder('ord_1', s)

    expect(result.id).toBe('mock_pay')
  })
})
```

### Testing with Task Context

When services are injected via task context, override works seamlessly:

```typescript
// Production code
async function getUserWithRetry(userId: string, s: Scope) {
  const [err, user] = await s.task(
    ({ services }) => services.api.fetchUser(userId),
    { retry: { maxRetries: 3 } }
  )
  
  if (err) throw err
  return user
}

describe('getUserWithRetry', () => {
  test('retries on failure', async () => {
    const fetchUser = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ id: '1', name: 'John' })

    await using s = scope()
      .provide('api', () => ({ fetchUser: vi.fn() }))  // Placeholder
      .override('api', () => ({ fetchUser }))          // Real mock

    const user = await getUserWithRetry('1', s)

    expect(fetchUser).toHaveBeenCalledTimes(3)
    expect(user).toEqual({ id: '1', name: 'John' })
  })
})
```

### Testing Parent-Child Scope Inheritance

Override services in child scopes while keeping parent services intact:

```typescript
describe('parent-child with overrides', () => {
  test('child can override parent services', async () => {
    await using parent = scope()
      .provide('db', () => ({ name: 'real-db', query: () => 'real' }))

    await using child = scope({ parent })
      .override('db', () => ({ name: 'mock-db', query: () => 'mock' }))

    // Parent still has real service
    expect(parent.use('db').name).toBe('real-db')
    
    // Child has mock
    expect(child.use('db').name).toBe('mock-db')
  })
})
```

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

## createTimeController

Advanced time control for testing timeouts, retries, and debouncing. Allows you to manipulate time globally within your tests.

```typescript
import { createTimeController } from 'go-go-scope/testing'

test('should timeout after 5 seconds', async () => {
  const time = createTimeController()
  time.install()  // Override global Date.now and setTimeout
  
  await using s = scope({ timeout: 5000 })
  const taskPromise = s.task(() => longRunningOperation())
  
  // Fast forward 5 seconds instantly
  time.advance(5000)
  
  const [err] = await taskPromise
  expect(err?.message).toContain('timeout')
  
  time.uninstall()  // Restore original timers
})
```

**TimeController Methods:**
- `install()` - Override global Date.now, setTimeout, clearTimeout
- `uninstall()` - Restore original global functions
- `advance(ms)` - Advance simulated time
- `jumpTo(timestamp)` - Jump to specific time
- `runAll()` - Execute all pending timeouts
- `reset()` - Reset time to 0
- `delay(ms)` - Create promise that resolves after delay

**Tip:** Use `afterEach(() => time.uninstall())` to ensure cleanup.

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
