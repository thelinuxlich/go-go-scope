# logger API Reference

> Auto-generated documentation for logger

## Table of Contents

- [Functions](#Functions)
  - [redactObject](#redactobject)
  - [redactArgs](#redactargs)
  - [adaptPino](#adaptpino)
  - [adaptWinston](#adaptwinston)
  - [createChildLogger](#createchildlogger)
  - [createRedactedLogger](#createredactedlogger)
- [Interfaces](#Interfaces)
  - [RedactOptions](#redactoptions)
  - [AdapterOptions](#adapteroptions)
  - [PinoLogger](#pinologger)
  - [WinstonLogger](#winstonlogger)

## Functions

### redactObject

```typescript
function redactObject(obj: unknown, paths: string[], censor: string): unknown
```

Deep clone and redact sensitive fields from an object

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `obj` | `unknown` |  |
| `paths` | `string[]` |  |
| `censor` | `string` |  |

**Returns:** `unknown`

*Source: [index.ts:32](packages/logger/src/index.ts#L32)*

---

### redactArgs

```typescript
function redactArgs(args: unknown[], redactOptions: RedactOptions | undefined): unknown[]
```

Redact sensitive fields from log arguments

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `args` | `unknown[]` |  |
| `redactOptions` | `RedactOptions | undefined` |  |

**Returns:** `unknown[]`

*Source: [index.ts:69](packages/logger/src/index.ts#L69)*

---

### adaptPino

```typescript
function adaptPino(pinoLogger: PinoLogger, options: AdapterOptions = {}): Logger
```

Adapter for Pino logger

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pinoLogger` | `PinoLogger` |  |
| `options` (optional) | `AdapterOptions` |  |

**Returns:** `Logger`

**Examples:**

```typescript
import pino from 'pino'
import { adaptPino } from '@go-go-scope/logger'

const pinoLogger = pino()
const logger = adaptPino(pinoLogger, {
  redact: { paths: ['password', 'token'] }
})

await using s = scope({ logger })
```

*Source: [index.ts:126](packages/logger/src/index.ts#L126)*

---

### adaptWinston

```typescript
function adaptWinston(winstonLogger: WinstonLogger, options: AdapterOptions = {}): Logger
```

Adapter for Winston logger

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `winstonLogger` | `WinstonLogger` |  |
| `options` (optional) | `AdapterOptions` |  |

**Returns:** `Logger`

**Examples:**

```typescript
import winston from 'winston'
import { adaptWinston } from '@go-go-scope/logger'

const winstonLogger = winston.createLogger({...})
const logger = adaptWinston(winstonLogger, {
  redact: { paths: ['password', 'token'] }
})

await using s = scope({ logger })
```

*Source: [index.ts:179](packages/logger/src/index.ts#L179)*

---

### createChildLogger

```typescript
function createChildLogger(parentLogger: Logger, context: Record<string, unknown>): Logger
```

Create a child logger with additional context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `parentLogger` | `Logger` |  |
| `context` | `Record<string, unknown>` |  |

**Returns:** `Logger`

**Examples:**

```typescript
const childLogger = createChildLogger(parentLogger, {
  scope: 'user-service',
  requestId: 'abc-123'
})
```

*Source: [index.ts:220](packages/logger/src/index.ts#L220)*

---

### createRedactedLogger

```typescript
function createRedactedLogger(baseLogger: Logger, options: RedactOptions): Logger
```

Create a logger with redaction support Wraps any logger to automatically redact sensitive fields.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `baseLogger` | `Logger` |  |
| `options` | `RedactOptions` |  |

**Returns:** `Logger`

**Examples:**

```typescript
import { createRedactedLogger } from '@go-go-scope/logger'

const logger = createRedactedLogger(consoleLogger, {
  paths: ['password', 'creditCard', 'ssn'],
  censor: '***REDACTED***'
})

logger.info('User login', { userId: 1, password: 'secret' })
// Output: User login { userId: 1, password: '***REDACTED***' }
```

*Source: [index.ts:254](packages/logger/src/index.ts#L254)*

---

## Interfaces

### RedactOptions

```typescript
interface RedactOptions
```

Options for redacting sensitive fields from log output

*Source: [index.ts:12](packages/logger/src/index.ts#L12)*

---

### AdapterOptions

```typescript
interface AdapterOptions
```

Options for logger adapters

*Source: [index.ts:22](packages/logger/src/index.ts#L22)*

---

### PinoLogger

```typescript
interface PinoLogger
```

Pino logger interface (subset for compatibility)

*Source: [index.ts:91](packages/logger/src/index.ts#L91)*

---

### WinstonLogger

```typescript
interface WinstonLogger
```

Winston logger interface (subset for compatibility)

*Source: [index.ts:102](packages/logger/src/index.ts#L102)*

---

