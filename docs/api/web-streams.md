# web-streams API Reference

> Auto-generated documentation for web-streams

## Table of Contents

- [Functions](#Functions)
  - [channelToReadableStream](#channeltoreadablestream)
  - [readableStreamToChannel](#readablestreamtochannel)
  - [channelToWritableStream](#channeltowritablestream)
  - [writableStreamToChannel](#writablestreamtochannel)
  - [streamToReadableStream](#streamtoreadablestream)
  - [readableStreamToStream](#readablestreamtostream)
  - [teeStream](#teestream)
  - [pipeStreams](#pipestreams)
  - [iterableToReadableStream](#iterabletoreadablestream)
  - [streamToArray](#streamtoarray)
  - [streamFirst](#streamfirst)
  - [mapStream](#mapstream)
  - [filterStream](#filterstream)
  - [bufferStream](#bufferstream)
  - [debounceStream](#debouncestream)
  - [throttleStream](#throttlestream)
  - [takeStream](#takestream)
  - [skipStream](#skipstream)
  - [isReadableStream](#isreadablestream)
  - [isWritableStream](#iswritablestream)
  - [isTransformStream](#istransformstream)
- [Interfaces](#Interfaces)
  - [StreamConversionOptions](#streamconversionoptions)
  - [TransformConfig](#transformconfig)
  - [DuplexStream](#duplexstream)

## Functions

### channelToReadableStream

```typescript
function channelToReadableStream<T>(channel: Channel<T>, options: StreamConversionOptions = {}): ReadableStream<T>
```

Convert a go-go-scope Channel to a ReadableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `channel` | `Channel<T>` |  |
| `options` (optional) | `StreamConversionOptions` |  |

**Returns:** `ReadableStream<T>`

**Examples:**

```typescript
const ch = s.channel<string>()
const stream = channelToReadableStream(ch)

const reader = stream.getReader()
const { value } = await reader.read()
```

*Source: [index.ts:32](packages/web-streams/src/index.ts#L32)*

---

### readableStreamToChannel

```typescript
function readableStreamToChannel<T>(scope: Scope, stream: ReadableStream<T>, options: { capacity?: number } = {}): Channel<T>
```

Convert a ReadableStream to a go-go-scope Channel

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `stream` | `ReadableStream<T>` |  |
| `options` (optional) | `{ capacity?: number }` |  |

**Returns:** `Channel<T>`

**Examples:**

```typescript
const response = await fetch('/api/data')
const ch = readableStreamToChannel(s, response.body!)

for await (const chunk of ch) {
  console.log(chunk)
}
```

*Source: [index.ts:82](packages/web-streams/src/index.ts#L82)*

---

### channelToWritableStream

```typescript
function channelToWritableStream<T>(channel: Channel<T>, options: StreamConversionOptions = {}): WritableStream<T>
```

Convert a go-go-scope Channel to a WritableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `channel` | `Channel<T>` |  |
| `options` (optional) | `StreamConversionOptions` |  |

**Returns:** `WritableStream<T>`

**Examples:**

```typescript
const ch = s.channel<string>()
const stream = channelToWritableStream(ch)

const writer = stream.getWriter()
await writer.write('hello')
```

*Source: [index.ts:126](packages/web-streams/src/index.ts#L126)*

---

### writableStreamToChannel

```typescript
function writableStreamToChannel<T>(scope: Scope, stream: WritableStream<T>): Channel<T>
```

Convert a WritableStream to a go-go-scope Channel

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `stream` | `WritableStream<T>` |  |

**Returns:** `Channel<T>`

**Examples:**

```typescript
const ws = new WebSocketStream('wss://example.com')
const ch = writableStreamToChannel(s, ws.writable)

await ch.send('hello')
```

*Source: [index.ts:170](packages/web-streams/src/index.ts#L170)*

---

### streamToReadableStream

```typescript
function streamToReadableStream<T>(stream: AsyncIterable<T>, options: StreamConversionOptions = {}): ReadableStream<T>
```

Convert a go-go-scope Stream (from @go-go-scope/stream) to a ReadableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `stream` | `AsyncIterable<T>` |  |
| `options` (optional) | `StreamConversionOptions` |  |

**Returns:** `ReadableStream<T>`

**Examples:**

```typescript
import { stream } from '@go-go-scope/stream'

const st = s.stream(data)
.map(x => x * 2)
.filter(x => x > 10)

const readable = streamToReadableStream(st)
```

**@go-go-scope:** /stream) to a ReadableStream

*Source: [index.ts:254](packages/web-streams/src/index.ts#L254)*

---

### readableStreamToStream

```typescript
function readableStreamToStream<T>(stream: ReadableStream<T>): AsyncIterable<T> & { [Symbol.asyncDispose](): Promise<void> }
```

Convert a ReadableStream to a go-go-scope Stream-compatible async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `stream` | `ReadableStream<T>` |  |

**Returns:** `AsyncIterable<T> & { [Symbol.asyncDispose](): Promise<void> }`

**Examples:**

```typescript
const response = await fetch('/api/data')
const stream = readableStreamToStream(response.body!)

// Use with

**@go-go-scope:** /stream
const result = await stream
.pipeThrough(new TransformStream(...))
.pipeTo(new WritableStream(...))
```

*Source: [index.ts:306](packages/web-streams/src/index.ts#L306)*

---

### teeStream

```typescript
function teeStream<T>(scope: Scope, stream: ReadableStream<T>, options: { capacity?: number } = {}): [Channel<T>, Channel<T>]
```

Tee a ReadableStream into two channels

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `stream` | `ReadableStream<T>` |  |
| `options` (optional) | `{ capacity?: number }` |  |

**Returns:** `[Channel<T>, Channel<T>]`

**Examples:**

```typescript
const stream = fetch('/api/data').then(r => r.body!)
const [ch1, ch2] = teeStream(s, await stream)

// ch1 and ch2 both receive all values
```

*Source: [index.ts:387](packages/web-streams/src/index.ts#L387)*

---

### pipeStreams

```typescript
function pipeStreams<T>(source: ReadableStream<T>, ...transforms: (TransformStream<T, T> | WritableStream<T>)[]): Promise<void>
```

Create a backpressure-aware stream pipe

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `source` | `ReadableStream<T>` |  |
| `transforms` | `(TransformStream<T, T> | WritableStream<T>)[]` |  |

**Returns:** `Promise<void>`

**Examples:**

```typescript
await pipeStreams(
  fetch('/api/data').then(r => r.body!),
  transformStream,
  writableStream
)
```

*Source: [index.ts:412](packages/web-streams/src/index.ts#L412)*

---

### iterableToReadableStream

```typescript
function iterableToReadableStream<T>(iterable: AsyncIterable<T>, options: StreamConversionOptions = {}): ReadableStream<T>
```

Create a stream from an async iterable with proper backpressure

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `options` (optional) | `StreamConversionOptions` |  |

**Returns:** `ReadableStream<T>`

*Source: [index.ts:431](packages/web-streams/src/index.ts#L431)*

---

### streamToArray

```typescript
function streamToArray<T>(stream: ReadableStream<T>): Promise<T[]>
```

Collect a ReadableStream into an array

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `stream` | `ReadableStream<T>` |  |

**Returns:** `Promise<T[]>`

*Source: [index.ts:472](packages/web-streams/src/index.ts#L472)*

---

### streamFirst

```typescript
function streamFirst<T>(stream: ReadableStream<T>): Promise<T | undefined>
```

Read the first value from a ReadableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `stream` | `ReadableStream<T>` |  |

**Returns:** `Promise<T | undefined>`

*Source: [index.ts:494](packages/web-streams/src/index.ts#L494)*

---

### mapStream

```typescript
function mapStream<I, O>(fn: (chunk: I) => O | Promise<O>): TransformStream<I, O>
```

Apply a function to each chunk of a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(chunk: I) => O | Promise<O>` |  |

**Returns:** `TransformStream<I, O>`

*Source: [index.ts:510](packages/web-streams/src/index.ts#L510)*

---

### filterStream

```typescript
function filterStream<T>(predicate: (chunk: T) => boolean | Promise<boolean>): TransformStream<T, T>
```

Filter chunks in a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(chunk: T) => boolean | Promise<boolean>` |  |

**Returns:** `TransformStream<T, T>`

*Source: [index.ts:528](packages/web-streams/src/index.ts#L528)*

---

### bufferStream

```typescript
function bufferStream<T>(size: number): TransformStream<T, T[]>
```

Buffer stream chunks into arrays

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `size` | `number` |  |

**Returns:** `TransformStream<T, T[]>`

*Source: [index.ts:547](packages/web-streams/src/index.ts#L547)*

---

### debounceStream

```typescript
function debounceStream<T>(ms: number): TransformStream<T, T>
```

Debounce a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` |  |

**Returns:** `TransformStream<T, T>`

*Source: [index.ts:569](packages/web-streams/src/index.ts#L569)*

---

### throttleStream

```typescript
function throttleStream<T>(ms: number): TransformStream<T, T>
```

Throttle a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` |  |

**Returns:** `TransformStream<T, T>`

*Source: [index.ts:602](packages/web-streams/src/index.ts#L602)*

---

### takeStream

```typescript
function takeStream<T>(n: number): TransformStream<T, T>
```

Take only the first n chunks from a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` |  |

**Returns:** `TransformStream<T, T>`

*Source: [index.ts:623](packages/web-streams/src/index.ts#L623)*

---

### skipStream

```typescript
function skipStream<T>(n: number): TransformStream<T, T>
```

Skip the first n chunks from a stream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `n` | `number` |  |

**Returns:** `TransformStream<T, T>`

*Source: [index.ts:643](packages/web-streams/src/index.ts#L643)*

---

### isReadableStream

```typescript
function isReadableStream(value: unknown): value is ReadableStream
```

Type guard to check if value is a ReadableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `unknown` |  |

**Returns:** `value is ReadableStream`

*Source: [index.ts:659](packages/web-streams/src/index.ts#L659)*

---

### isWritableStream

```typescript
function isWritableStream(value: unknown): value is WritableStream
```

Type guard to check if value is a WritableStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `unknown` |  |

**Returns:** `value is WritableStream`

*Source: [index.ts:670](packages/web-streams/src/index.ts#L670)*

---

### isTransformStream

```typescript
function isTransformStream(value: unknown): value is TransformStream
```

Type guard to check if value is a TransformStream

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `unknown` |  |

**Returns:** `value is TransformStream`

*Source: [index.ts:681](packages/web-streams/src/index.ts#L681)*

---

## Interfaces

### StreamConversionOptions

```typescript
interface StreamConversionOptions
```

Options for stream conversion

*Source: [index.ts:13](packages/web-streams/src/index.ts#L13)*

---

### TransformConfig

```typescript
interface TransformConfig
```

Create a TransformStream from a channel transformation

**Examples:**

```typescript
const transform = createTransformStream<string, number>({
  transform: (chunk) => chunk.length
})

await readable
  .pipeThrough(transform)
  .pipeTo(writable)
```

*Source: [index.ts:208](packages/web-streams/src/index.ts#L208)*

---

### DuplexStream

```typescript
interface DuplexStream
```

Create a duplex stream (ReadableStream + WritableStream) from two channels

**Examples:**

```typescript
const { readable, writable } = createDuplexStream<string, number>(s)

// Write strings
const writer = writable.getWriter()
await writer.write('hello')

// Read numbers
const reader = readable.getReader()
const { value } = await reader.read()
```

*Source: [index.ts:353](packages/web-streams/src/index.ts#L353)*

---

