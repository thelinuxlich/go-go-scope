# testing API Reference

> Auto-generated documentation for testing

## Table of Contents

- [Functions](#Functions)
  - [expectTask](#expecttask)
  - [assertResolves](#assertresolves)
  - [assertRejects](#assertrejects)
  - [assertResolvesWithin](#assertresolveswithin)
  - [createMockScope](#createmockscope)
  - [createControlledTimer](#createcontrolledtimer)
  - [flushPromises](#flushpromises)
  - [createSpy](#createspy)
  - [assertScopeDisposed](#assertscopedisposed)
  - [createMockChannel](#createmockchannel)
  - [createTimeTravelController](#createtimetravelcontroller)
  - [createTimeController](#createtimecontroller)
  - [createTestScope](#createtestscope)
- [Interfaces](#Interfaces)
  - [TaskAssertion](#taskassertion)
  - [MockScopeOptions](#mockscopeoptions)
  - [TaskCall](#taskcall)
  - [MockScope](#mockscope)
  - [ControlledTimer](#controlledtimer)
  - [Spy](#spy)
  - [MockChannel](#mockchannel)
  - [TimelineEvent](#timelineevent)
  - [HistoryEntry](#historyentry)
  - [TimeTravelController](#timetravelcontroller)
  - [TimeController](#timecontroller)
  - [PendingTimeout](#pendingtimeout)

## Functions

### expectTask

```typescript
function expectTask<T>(task: Task<Result<Error, T>>): TaskAssertion<T>
```

Creates assertion helpers for a task. Provides a fluent API for asserting task resolution, rejection, and timing.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `task` | `Task<Result<Error, T>>` | - The task to assert against |

**Returns:** `TaskAssertion<T>`

A TaskAssertion object with chainable assertion methods

**Examples:**

```typescript
import { expectTask } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('task assertions', () => {
  test('task succeeds', async () => {
    const s = scope()
    await expectTask(s.task(() => Promise.resolve('done')))
      .toResolveWith('done')
  })

  test('task fails', async () => {
    const s = scope()
    await expectTask(s.task(() => Promise.reject(new Error('fail'))))
      .toRejectWith('fail')
  })

  test('task times out', async () => {
    const s = scope()
    await expectTask(s.task(() => new Promise(() => {})))
      .toResolveWithin(100)
      .toReject()
  })

  test('custom error type', async () => {
    class ValidationError extends Error {}
    const s = scope()
    await expectTask(s.task(() => Promise.reject(new ValidationError())))
      .toRejectWithType(ValidationError)
  })

  test('manual result inspection', async () => {
    const s = scope()
    const [err, result] = await expectTask(s.task(() => Promise.resolve(42))).result()
    expect(err).toBeUndefined()
    expect(result).toBe(42)
  })
})
```

**@typeparam:** T - The type of the successful task result

**@param:** - The task to assert against

**@returns:** A TaskAssertion object with chainable assertion methods

*Source: [assertions.ts:141](packages/testing/src/assertions.ts#L141)*

---

### assertResolves

```typescript
function assertResolves<T>(task: Task<Result<Error, T>>): Promise<Result<Error, T>>
```

Asserts that a task resolves successfully. Throws an error if the task rejects, otherwise returns the result tuple.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `task` | `Task<Result<Error, T>>` | - The task to assert against |

**Returns:** `Promise<Result<Error, T>>`

Promise resolving to the Result tuple [undefined, T]

**Examples:**

```typescript
import { assertResolves } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('assertResolves', () => {
  test('task succeeds', async () => {
    const s = scope()
    const [err, result] = await assertResolves(s.task(() => Promise.resolve('done')))
    expect(err).toBeUndefined()
    expect(result).toBe('done')
  })

  test('task fails - throws', async () => {
    const s = scope()
    await expect(
      assertResolves(s.task(() => Promise.reject(new Error('fail'))))
    ).rejects.toThrow('Expected task to resolve')
  })
})
```

**@typeparam:** T - The type of the successful task result

**@param:** - The task to assert against

**@returns:** Promise resolving to the Result tuple [undefined, T]

**@throws:** Error if the task rejects

*Source: [assertions.ts:295](packages/testing/src/assertions.ts#L295)*

---

### assertRejects

```typescript
function assertRejects<T>(task: Task<Result<Error, T>>): Promise<Error>
```

Asserts that a task rejects with an error. Throws an error if the task resolves, otherwise returns the error.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `task` | `Task<Result<Error, T>>` | - The task to assert against |

**Returns:** `Promise<Error>`

Promise resolving to the Error if the task rejects

**Examples:**

```typescript
import { assertRejects } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('assertRejects', () => {
  test('task fails', async () => {
    const s = scope()
    const err = await assertRejects(s.task(() => Promise.reject(new Error('fail'))))
    expect(err.message).toBe('fail')
  })

  test('task succeeds - throws', async () => {
    const s = scope()
    await expect(
      assertRejects(s.task(() => Promise.resolve('success')))
    ).rejects.toThrow('Expected task to reject')
  })

  test('error inspection', async () => {
    class CustomError extends Error {
      constructor(public code: number) { super('custom') }
    }
    const s = scope()
    const err = await assertRejects(
      s.task(() => Promise.reject(new CustomError(404)))
    )
    expect(err).toBeInstanceOf(CustomError)
    expect((err as CustomError).code).toBe(404)
  })
})
```

**@typeparam:** T - The type of the successful task result (should not be returned)

**@param:** - The task to assert against

**@returns:** Promise resolving to the Error if the task rejects

**@throws:** Error if the task resolves successfully

*Source: [assertions.ts:350](packages/testing/src/assertions.ts#L350)*

---

### assertResolvesWithin

```typescript
function assertResolvesWithin<T>(task: Task<Result<Error, T>>, timeoutMs: number): Promise<Result<Error, T>>
```

Asserts that a task resolves within a specified timeout period. Useful for testing performance requirements and detecting slow operations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `task` | `Task<Result<Error, T>>` | - The task to assert against |
| `timeoutMs` | `number` | - Maximum allowed time in milliseconds |

**Returns:** `Promise<Result<Error, T>>`

Promise resolving to the Result tuple

**Examples:**

```typescript
import { assertResolvesWithin } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('assertResolvesWithin', () => {
  test('fast operation', async () => {
    const s = scope()
    const [err, result] = await assertResolvesWithin(
      s.task(() => Promise.resolve('quick')),
      100
    )
    expect(result).toBe('quick')
  })

  test('slow operation times out', async () => {
    const s = scope()
    await expect(
      assertResolvesWithin(
        s.task(() => new Promise(r => setTimeout(r, 200))),
        100
      )
    ).rejects.toThrow('did not resolve within')
  })

  test('performance requirement', async () => {
    const s = scope()
    // Ensure API call completes within 1 second
    const [err, data] = await assertResolvesWithin(
      s.task(() => fetchUserData()),
      1000
    )
    expect(data).toBeDefined()
  })
})
```

**@typeparam:** T - The type of the successful task result

**@param:** - Maximum allowed time in milliseconds

**@returns:** Promise resolving to the Result tuple

**@throws:** Error if the task takes longer than the timeout

*Source: [assertions.ts:408](packages/testing/src/assertions.ts#L408)*

---

### createMockScope

```typescript
function createMockScope(options: MockScopeOptions = {}): MockScope
```

Creates a mock scope for testing purposes. The mock scope provides: - Controlled timer advancement - Deterministic execution - Easy cancellation testing - Spy capabilities on task execution - Service mocking

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `MockScopeOptions` | - Configuration options for the mock scope |

**Returns:** `MockScope`

A mock scope with testing utilities

**Examples:**

```typescript
import { createMockScope } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('my feature', () => {
  test('should complete task', async () => {
    const s = createMockScope()

    const [err, result] = await s.task(() => Promise.resolve('done'))

    expect(err).toBeUndefined()
    expect(result).toBe('done')
  })

  test('should track task calls', async () => {
    const s = createMockScope()

    s.task(() => Promise.resolve(1))
    s.task(() => Promise.resolve(2))

    expect(s.getTaskCalls()).toHaveLength(2)
  })
})
```

**@param:** - Abort reason if aborted initially - provides context for the abortion

**@returns:** A mock scope with testing utilities

*Source: [index.ts:198](packages/testing/src/index.ts#L198)*

---

### createControlledTimer

```typescript
function createControlledTimer(): ControlledTimer
```

Creates a controlled timer environment for testing async operations. Useful for testing timeout and retry logic without waiting for real time.

**Returns:** `ControlledTimer`

A controlled timer with methods to manipulate simulated time

**Examples:**

```typescript
import { createControlledTimer } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('timeout testing', () => {
  test('handles timeouts', async () => {
    const timer = createControlledTimer()
    let timedOut = false

    timer.setTimeout(() => { timedOut = true }, 5000)

    expect(timedOut).toBe(false)

    timer.advance(5000)
    expect(timedOut).toBe(true)
  })

  test('clears timeouts', () => {
    const timer = createControlledTimer()
    let called = false

    const id = timer.setTimeout(() => { called = true }, 1000)
    timer.clearTimeout(id)
    timer.advance(2000)

    expect(called).toBe(false)
  })
})
```

**@returns:** A controlled timer with methods to manipulate simulated time

*Source: [index.ts:367](packages/testing/src/index.ts#L367)*

---

### flushPromises

```typescript
function flushPromises(): Promise<void>
```

Waits for all promises in the scope to settle. Useful for testing async operations that involve microtasks.

**Returns:** `Promise<void>`

A promise that resolves after the current call stack clears

**Examples:**

```typescript
import { flushPromises } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('async operations', () => {
  test('flushes promises', async () => {
    const s = scope()
    let resolved = false

    s.task(async () => {
      await Promise.resolve()
      resolved = true
    })

    expect(resolved).toBe(false)
    await flushPromises()
    expect(resolved).toBe(true)
  })
})
```

**@returns:** A promise that resolves after the current call stack clears

*Source: [index.ts:467](packages/testing/src/index.ts#L467)*

---

### createSpy

```typescript
function createSpy<TArgs extends unknown[], TReturn>(): Spy<
	TArgs,
	TReturn
>
```

Creates a spy function for testing. Tracks calls and can return mock values.

**Returns:** `Spy<
	TArgs,
	TReturn
>`

A spy function with tracking and mocking capabilities

**Examples:**

```typescript
import { createSpy } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('spy testing', () => {
  test('basic spy', () => {
    const spy = createSpy().mockReturnValue('mocked')

    const result = spy()

    expect(result).toBe('mocked')
    expect(spy.wasCalled()).toBe(true)
  })

  test('spy with args', () => {
    const spy = createSpy<[string, number], string>()
    spy.mockImplementation((name, age) => `${name} is ${age}`)

    spy('Alice', 30)
    spy('Bob', 25)

    expect(spy.getCalls()[0].args).toEqual(['Alice', 30])
    expect(spy.getCalls()[1].result).toBe('Bob is 25')
  })

  test('reset spy', () => {
    const spy = createSpy().mockReturnValue(42)
    spy()

    spy.mockReset()

    expect(spy.wasCalled()).toBe(false)
    expect(spy()).toBeUndefined()
  })
})
```

**@typeparam:** TReturn - Return type of the function

**@returns:** A spy function with tracking and mocking capabilities

*Source: [index.ts:597](packages/testing/src/index.ts#L597)*

---

### assertScopeDisposed

```typescript
function assertScopeDisposed(scope: Scope): Promise<void>
```

Asserts that a scope has been properly disposed. Checks that all resources are cleaned up and the signal is aborted.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` | - The scope to check for proper disposal |

**Returns:** `Promise<void>`

A promise that resolves if disposal is successful

**Examples:**

```typescript
import { assertScopeDisposed } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test } from 'vitest'

describe('scope disposal', () => {
  test('should dispose properly', async () => {
    const s = scope()
    s.task(() => Promise.resolve())

    await assertScopeDisposed(s)
    // Scope is now disposed and cleaned up
  })
})
```

**@param:** - The scope to check for proper disposal

**@returns:** A promise that resolves if disposal is successful

**@throws:** Error if the scope is not properly disposed

*Source: [index.ts:673](packages/testing/src/index.ts#L673)*

---

### createMockChannel

```typescript
function createMockChannel<T>(): MockChannel<T>
```

Creates a mock channel for testing. Useful for testing code that uses channels without actual async operations.

**Returns:** `MockChannel<T>`

A mock channel with control methods

**Examples:**

```typescript
import { createMockChannel } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('channel communication', () => {
  test('channel communication', async () => {
    const mockCh = createMockChannel<number>()
    mockCh.setReceiveValues([1, 2, 3])

    const ch = mockCh.channel
    const value = await ch.receive()
    expect(value).toBe(1)
  })

  test('async iteration', async () => {
    const mockCh = createMockChannel<string>()
    mockCh.setReceiveValues(['a', 'b', 'c'])

    const results: string[] = []
    for await (const val of mockCh.channel) {
      results.push(val)
    }

    expect(results).toEqual(['a', 'b', 'c'])
  })

  test('closed channel returns undefined', async () => {
    const mockCh = createMockChannel<number>()
    mockCh.close()

    const value = await mockCh.channel.receive()
    expect(value).toBeUndefined()
  })
})
```

**@typeparam:** T - The type of values passed through the channel

**@returns:** A mock channel with control methods

*Source: [index.ts:806](packages/testing/src/index.ts#L806)*

---

### createTimeTravelController

```typescript
function createTimeTravelController(): TimeTravelController
```

Time travel controller for deterministic testing of time-based operations. More powerful than createControlledTimer - allows jumping to specific times, inspecting the timeline, and running all pending events.

**Returns:** `TimeTravelController`

A time travel controller with advanced time manipulation capabilities

**Examples:**

```typescript
import { createTimeTravelController } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('time-based operations', () => {
  test('time-based operations', async () => {
    const time = createTimeTravelController()

    // Schedule operations
    const results: number[] = []
    time.setTimeout(() => results.push(1), 100)
    time.setTimeout(() => results.push(2), 200)

    // Jump to specific time
    time.jumpTo(150)
    expect(results).toEqual([1]) // Only first timer fired

    // Continue to end
    time.advance(100)
    expect(results).toEqual([1, 2])
  })

  test('intervals work', () => {
    const time = createTimeTravelController()
    let count = 0

    time.setInterval(() => count++, 100)

    time.advance(300)
    expect(count).toBe(3)
  })

  test('history tracking', () => {
    const time = createTimeTravelController()
    time.setTimeout(() => {}, 100, 'my-event')
    time.runAll()

    expect(time.history).toEqual([{ time: 100, action: 'my-event' }])
  })
})
```

**@returns:** A time travel controller with advanced time manipulation capabilities

*Source: [index.ts:1043](packages/testing/src/index.ts#L1043)*

---

### createTimeController

```typescript
function createTimeController(): TimeController
```

Creates a time controller for testing. Provides fine-grained control over time without actually waiting.

**Returns:** `TimeController`

A TimeController instance for manipulating simulated time

**Examples:**

```typescript
import { createTimeController } from '@go-go-scope/testing'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('with time control', () => {
  let time: ReturnType<typeof createTimeController>

  beforeEach(() => {
    time = createTimeController()
  })

  afterEach(() => {
    time.uninstall()
  })

  test('timeouts work', async () => {
    time.install()
    await using s = scope({ timeout: 5000 })

    // Fast forward past timeout
    time.advance(5001)

    expect(s.signal.aborted).toBe(true)
  })

  test('multiple timeouts', () => {
    time.install()
    const results: number[] = []

    setTimeout(() => results.push(1), 100)
    setTimeout(() => results.push(2), 200)
    setTimeout(() => results.push(3), 300)

    time.advance(250)
    expect(results).toEqual([1, 2])

    time.advance(100)
    expect(results).toEqual([1, 2, 3])
  })

  test('delay promise', async () => {
    const delayPromise = time.delay(1000)
    let resolved = false
    delayPromise.then(() => { resolved = true })

    expect(resolved).toBe(false)
    time.advance(1000)
    await delayPromise
    expect(resolved).toBe(true)
  })
})
```

**@returns:** A TimeController instance for manipulating simulated time

*Source: [time-controller.ts:172](packages/testing/src/time-controller.ts#L172)*

---

### createTestScope

```typescript
function createTestScope(options?: {
	timeout?: number;
	concurrency?: number;
}): Promise<{
	/** The created scope with time control installed */
	scope: Scope<Record<string, unknown>>;
	/** Time controller for manipulating time */
	time: TimeController;
}>
```

Test helper that creates a scope with time control enabled. Automatically installs the time controller and returns both the scope and controller.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `{
	timeout?: number;
	concurrency?: number;
}` | - Configuration options for the test scope |

**Returns:** `Promise<{
	/** The created scope with time control installed */
	scope: Scope<Record<string, unknown>>;
	/** Time controller for manipulating time */
	time: TimeController;
}>`

Promise resolving to an object with scope and time controller

**Examples:**

```typescript
import { createTestScope } from '@go-go-scope/testing'
import { describe, test, expect, afterEach } from 'vitest'

describe('with test scope', () => {
  test('task retries', async () => {
    const { scope, time } = await createTestScope({ timeout: 5000 })

    let attempts = 0
    const task = scope.task(() => {
      attempts++
      if (attempts < 3) throw new Error('fail')
      return 'success'
    }, { retry: { max: 3, delay: 1000 } })

    // Fast forward through retries
    time.advance(1000) // First retry
    time.advance(1000) // Second retry

    const [err, result] = await task
    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  test('timeout handling', async () => {
    const { scope, time } = await createTestScope({ timeout: 1000 })

    const task = scope.task(() => new Promise(() => {})) // Never resolves

    time.advance(1001) // Past timeout

    const [err] = await task
    expect(err).toBeDefined()
  })

  test('concurrency with time', async () => {
    const { scope, time } = await createTestScope({ concurrency: 2 })
    const results: number[] = []

    // Start multiple concurrent tasks
    scope.task(async () => {
      await time.delay(100)
      results.push(1)
    })
    scope.task(async () => {
      await time.delay(200)
      results.push(2)
    })

    time.advance(150)
    expect(results).toEqual([1])

    time.advance(100)
    expect(results).toEqual([1, 2])
  })
})
```

**@param:** - Optional concurrency limit for the scope (default: no limit)

**@returns:** Promise resolving to an object with scope and time controller

*Source: [time-controller.ts:362](packages/testing/src/time-controller.ts#L362)*

---

## Interfaces

### TaskAssertion

```typescript
interface TaskAssertion
```

Assertion result with fluent helper methods for task validation. Provides a chainable API for asserting various aspects of task execution.

**Examples:**

```typescript
import { expectTask } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect } from 'vitest'

describe('task assertions', () => {
  test('task resolves successfully', async () => {
    const s = scope()
    await expectTask(s.task(() => Promise.resolve('done')))
      .toResolveWith('done')
  })

  test('task rejects with error', async () => {
    const s = scope()
    await expectTask(s.task(() => Promise.reject(new Error('fail'))))
      .toRejectWith('fail')
  })

  test('task completes within timeout', async () => {
    const s = scope()
    await expectTask(s.task(() => Promise.resolve('quick')))
      .toResolveWithin(1000)
      .toResolve()
  })
})
```

**@typeparam:** T - The type of the successful task result

*Source: [assertions.ts:46](packages/testing/src/assertions.ts#L46)*

---

### MockScopeOptions

```typescript
interface MockScopeOptions
```

Options for creating a mock scope. Use these options to configure the behavior of the mock scope for testing.

**Examples:**

```typescript
import { createMockScope } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('my tests', () => {
  test('with auto-advance', async () => {
    const s = createMockScope({
      autoAdvanceTimers: true,
      deterministic: true,
      services: { api: mockApi }
    })

    const [err, result] = await s.task(() => s.services.api.fetch())
    expect(result).toBeDefined()
  })
})
```

*Source: [index.ts:59](packages/testing/src/index.ts#L59)*

---

### TaskCall

```typescript
interface TaskCall
```

Task call record for tracking task invocations. Captures the function and options passed to each task call for inspection in tests.

**Examples:**

```typescript
import { createMockScope } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('task tracking', () => {
  test('tracks task calls', async () => {
    const s = createMockScope()
    const fn = () => Promise.resolve('result')

    s.task(fn, { retry: 3 })

    expect(s.taskCalls).toHaveLength(1)
    expect(s.taskCalls[0].options?.retry).toBe(3)
  })
})
```

*Source: [index.ts:96](packages/testing/src/index.ts#L96)*

---

### MockScope

```typescript
interface MockScope
```

Extended Scope with mock capabilities. Provides additional methods for testing like call tracking, mocking, and manual abortion.

**Examples:**

```typescript
import { createMockScope } from '@go-go-scope/testing'
import { describe, test, expect, vi } from 'vitest'

describe('mock scope', () => {
  test('mocks services', async () => {
    const s = createMockScope()
    const mockDb = { query: vi.fn().mockResolvedValue([]) }

    s.mockService('db', mockDb)

    await s.task(async ({ services }) => {
      return services.db.query('SELECT *')
    })

    expect(mockDb.query).toHaveBeenCalledWith('SELECT *')
  })
})
```

*Source: [index.ts:133](packages/testing/src/index.ts#L133)*

---

### ControlledTimer

```typescript
interface ControlledTimer
```

Return type of createControlledTimer. Provides methods for controlling and inspecting simulated time in tests.

**Examples:**

```typescript
import { createControlledTimer } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('timer control', () => {
  test('advances time', () => {
    const timer = createControlledTimer()
    const results: number[] = []

    timer.setTimeout(() => results.push(1), 100)
    timer.setTimeout(() => results.push(2), 200)

    timer.advance(150)
    expect(results).toEqual([1])

    timer.advance(100)
    expect(results).toEqual([1, 2])
  })
})
```

*Source: [index.ts:297](packages/testing/src/index.ts#L297)*

---

### Spy

```typescript
interface Spy
```

Spy function interface for testing. Provides methods to track calls, set mock implementations, and inspect invocation history.

**Examples:**

```typescript
import { createSpy } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('spy usage', () => {
  test('tracks calls', () => {
    const spy = createSpy<[string], number>()
    spy.mockReturnValue(42)

    const result = spy('hello')

    expect(result).toBe(42)
    expect(spy.wasCalled()).toBe(true)
    expect(spy.wasCalledWith('hello')).toBe(true)
    expect(spy.getCalls()).toHaveLength(1)
  })

  test('uses mock implementation', () => {
    const spy = createSpy<[number, number], number>()
    spy.mockImplementation((a, b) => a + b)

    expect(spy(2, 3)).toBe(5)
    expect(spy(10, 20)).toBe(30)
  })
})
```

**@typeparam:** TReturn - Return type of the function

*Source: [index.ts:506](packages/testing/src/index.ts#L506)*

---

### MockChannel

```typescript
interface MockChannel
```

Mock channel interface for testing. Provides fine-grained control over channel behavior for unit testing.

**Examples:**

```typescript
import { createMockChannel } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('mock channel', () => {
  test('receives preset values', async () => {
    const mockCh = createMockChannel<number>()
    mockCh.setReceiveValues([1, 2, 3])

    const ch = mockCh.channel
    expect(await ch.receive()).toBe(1)
    expect(await ch.receive()).toBe(2)
  })

  test('tracks sent values', async () => {
    const mockCh = createMockChannel<string>()
    const ch = mockCh.channel

    await ch.send('hello')
    await ch.send('world')

    expect(mockCh.getSentValues()).toEqual(['hello', 'world'])
  })
})
```

**@typeparam:** T - The type of values passed through the channel

*Source: [index.ts:721](packages/testing/src/index.ts#L721)*

---

### TimelineEvent

```typescript
interface TimelineEvent
```

Timeline event in the time travel controller. Represents a scheduled callback with timing information.

*Source: [index.ts:878](packages/testing/src/index.ts#L878)*

---

### HistoryEntry

```typescript
interface HistoryEntry
```

History entry for tracking executed events.

*Source: [index.ts:892](packages/testing/src/index.ts#L892)*

---

### TimeTravelController

```typescript
interface TimeTravelController
```

Time travel controller interface for deterministic testing of time-based operations. More powerful than createControlledTimer - allows jumping to specific times, rewinding (not supported), and inspecting the timeline.

**Examples:**

```typescript
import { createTimeTravelController } from '@go-go-scope/testing'
import { describe, test, expect } from 'vitest'

describe('time travel', () => {
  test('jumps to specific times', () => {
    const time = createTimeTravelController()
    const results: number[] = []

    time.setTimeout(() => results.push(1), 100)
    time.setTimeout(() => results.push(2), 200)
    time.setTimeout(() => results.push(3), 300)

    time.jumpTo(250)
    expect(results).toEqual([1, 2])
    expect(time.now).toBe(250)
  })

  test('inspects timeline', () => {
    const time = createTimeTravelController()
    time.setTimeout(() => {}, 100, 'first')
    time.setTimeout(() => {}, 200, 'second')

    const timeline = time.timeline
    expect(timeline).toHaveLength(2)
    expect(timeline[0].time).toBe(100)
  })
})
```

*Source: [index.ts:935](packages/testing/src/index.ts#L935)*

---

### TimeController

```typescript
interface TimeController
```

A controller for manipulating time in tests. Use this to fast-forward through delays and timeouts without waiting.

**Examples:**

```typescript
import { createTimeController } from '@go-go-scope/testing'
import { scope } from 'go-go-scope'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('time control', () => {
  let time: ReturnType<typeof createTimeController>

  beforeEach(() => {
    time = createTimeController()
    time.install()
  })

  afterEach(() => {
    time.uninstall()
  })

  test('timeouts work', async () => {
    await using s = scope({ timeout: 5000 })
    const taskPromise = s.task(() => longOperation(), { timeout: 10000 })

    // Fast forward 10 seconds instantly
    time.advance(10000)

    // Task will have timed out
    const [err] = await taskPromise
    expect(err?.message).toContain('timeout')
  })
})
```

*Source: [time-controller.ts:48](packages/testing/src/time-controller.ts#L48)*

---

### PendingTimeout

```typescript
interface PendingTimeout
```

Internal representation of a pending timeout.

*Source: [time-controller.ts:103](packages/testing/src/time-controller.ts#L103)*

---

