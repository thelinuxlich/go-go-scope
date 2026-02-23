# @go-go-scope/testing

Testing utilities for go-go-scope - mocks, spies, time control, and test helpers.

## Installation

```bash
npm install -D @go-go-scope/testing
```

## Usage

### Mock Scope

```typescript
import { createMockScope } from '@go-go-scope/testing'

const s = createMockScope({
  autoAdvanceTimers: true,
  deterministic: true
})

const [err, result] = await s.task(() => Promise.resolve('done'))
expect(result).toBe('done')
```

### Spies

```typescript
import { createSpy } from '@go-go-scope/testing'

const spy = createSpy().mockReturnValue('mocked')
const result = spy()
expect(result).toBe('mocked')
expect(spy.wasCalled()).toBe(true)
```

### Time Control

```typescript
import { createTimeTravelController } from '@go-go-scope/testing'

const time = createTimeTravelController()

// Schedule operations
const results: number[] = []
time.setTimeout(() => results.push(1), 100)
time.setTimeout(() => results.push(2), 200)

// Jump to specific time
time.jumpTo(150)
expect(results).toEqual([1]) // Only first timer fired
```

### Mock Channels

```typescript
import { createMockChannel } from '@go-go-scope/testing'

const mockCh = createMockChannel<number>()
mockCh.setReceiveValues([1, 2, 3])

const ch = mockCh.channel
const value = await ch.receive()
expect(value).toBe(1)
```

## License

MIT
