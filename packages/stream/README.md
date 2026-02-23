# @go-go-scope/stream

Lazy async iterable streams for go-go-scope with 50+ composable operations.

## Installation

```bash
npm install @go-go-scope/stream
```

## Usage

### Standalone

```typescript
import { Stream } from '@go-go-scope/stream'
import { scope } from 'go-go-scope'

await using s = scope()

const [err, results] = await new Stream(async function*() {
  yield 1; yield 2; yield 3
}, s)
  .map(x => x * 2)
  .filter(x => x > 2)
  .toArray()
```

### With Plugin (adds stream() method to Scope)

```typescript
import { scope } from 'go-go-scope'
import { streamPlugin } from '@go-go-scope/stream'

const s = scope({ plugins: [streamPlugin] })

const [err, results] = await s.stream([1, 2, 3, 4, 5])
  .map(x => x * 2)
  .filter(x => x > 4)
  .take(2)
  .toArray()
```

## Available Operations

- **Transform**: `map`, `flatMap`, `tap`
- **Filter**: `filter`, `take`, `drop`, `distinct`, `distinctBy`
- **Combine**: `zip`, `concat`, `merge`
- **Buffer**: `buffer`, `bufferTime`, `groupAdjacentBy`
- **Timing**: `debounce`, `throttle`, `delay`
- **Advanced**: `exhaustMap`, `concatMap`, `switchMap`, `pairwise`, `window`
- **Terminal**: `toArray`, `forEach`, `reduce`, `drain`

## License

MIT
