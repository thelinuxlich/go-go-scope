# Integrations

How to integrate `go-go-scope` with other libraries.

## Table of Contents

- [go-go-try](#go-go-try)
- [OpenTelemetry](#opentelemetry)

---

## go-go-try

[go-go-try](https://github.com/thelinuxlich/go-go-try) provides Result type utilities that work seamlessly with `go-go-scope`.

### Installation

```bash
npm install go-go-try
```

### Basic Integration

```typescript
import { scope } from 'go-go-scope'
import { goTry, isSuccess, isFailure, unwrap, unwrapOr } from 'go-go-try'

async function example() {
  await using s = scope()
  
  const task1 = s.task(() => fetchUser(1))
  const task2 = s.task(() => fetchUser(2))
  
  const [r1, r2] = await Promise.all([task1, task2])
  
  // r1 and r2 are Result<unknown, User>
  if (isSuccess(r1)) {
    console.log('User 1:', r1[1])
  }
  
  if (isFailure(r2)) {
    console.log('User 2 failed:', r2[0])
  }
}
```

### Converting Results

```typescript
import { goTry, tryCatch } from 'go-go-try'

async function example() {
  await using s = scope()
  
  // go-go-scope returns Result
  const [err, user] = await s.task(() => fetchUser(1))
  
  // Convert to go-go-try Result
  const result = tryCatch(
    () => { if (err) throw err; return user },
    (e) => e
  )
  
  // Or use goTry
  const result2 = await goTry(() => {
    if (err) throw err
    return user
  })
}
```

### Unwrapping Results

```typescript
import { unwrap, unwrapOr, unwrapOrElse } from 'go-go-try'

async function example() {
  await using s = scope()
  
  const [err, user] = await s.task(() => fetchUser(1))
  
  // Throw if error
  const user1 = unwrap([err, user])
  
  // Default if error
  const user2 = unwrapOr([err, user], { id: 0, name: 'Anonymous' })
  
  // Compute default if error
  const user3 = unwrapOrElse([err, user], (err) => {
    console.log('Failed:', err)
    return { id: 0, name: 'Anonymous' }
  })
}
```

### Chaining Operations

```typescript
import { andThen, map, mapErr } from 'go-go-try'

async function example() {
  await using s = scope()
  
  const result = await s.task(() => fetchUser(1))
  
  // Transform success value
  const withEmail = map(result, (user) => ({
    ...user,
    email: `${user.name}@example.com`
  }))
  
  // Chain another operation
  const withPosts = await andThen(withEmail, async (user) => {
    const [err, posts] = await s.task(() => fetchPosts(user.id))
    if (err) return [err, undefined]
    return [undefined, { ...user, posts }]
  })
}
```

---

## OpenTelemetry

`go-go-scope` provides optional OpenTelemetry tracing integration.

### Installation

```bash
npm install @opentelemetry/api
```

### Basic Setup

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

const tracer = trace.getTracer('my-app')

async function fetchWithTracing(userId: string) {
  await using s = scope({ tracer, name: 'fetch-user-data' })
  
  const userTask = s.task(() => fetchUser(userId))
  const postsTask = s.task(() => fetchPosts(userId))
  
  const [userResult, postsResult] = await Promise.all([userTask, postsTask])
  const [userErr, user] = userResult
  const [postsErr, posts] = postsResult
  
  if (userErr) throw userErr
  if (postsErr) throw postsErr
  
  return { user, posts }
}
```

### Custom Span Names

```typescript
const [err, user] = await s.task(
  () => fetchUser(id),
  {
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id, 'source': 'database' }
    }
  }
)
```

### Complete Example with Jaeger

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

// Initialize OpenTelemetry
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
})

sdk.start()

// Get tracer
const tracer = trace.getTracer('my-service')

// Use in your code
async function processOrder(orderId: string) {
  await using s = scope({ 
    tracer, 
    name: 'process-order',
    timeout: 30000 
  })
  
  const [validateErr] = await s.task(
    () => validateOrder(orderId),
    { otel: { name: 'validate-order' } }
  )
  if (validateErr) throw validateErr
  
  const [paymentErr] = await s.task(
    () => processPayment(orderId),
    { 
      otel: { name: 'process-payment' },
      retry: { maxRetries: 3 }
    }
  )
  if (paymentErr) throw paymentErr
  
  const [notifyErr] = await s.task(
    () => sendNotification(orderId),
    { otel: { name: 'send-notification' } }
  )
  // Non-critical, don't throw
  
  return { success: true }
}
```

### Spans Created

| Span Name | Type | Attributes |
|-----------|------|------------|
| `scope` (or custom) | Scope lifecycle | `scope.timeout`, `scope.has_parent_signal`, `scope.has_parent_scope`, `scope.concurrency`, `scope.duration_ms` |
| `scope.task` (or custom) | Task execution | `task.index`, `task.has_retry`, `task.has_timeout`, `task.has_circuit_breaker`, `task.scope_concurrency`, `task.duration_ms`, `task.error_reason`, `task.retry_attempts` |

### Viewing Traces

In Jaeger UI, you'll see:

```
[process-order] scope
├── [validate-order] task - 45ms ✓
├── [process-payment] task - 120ms ✓
│   └── Attributes: task.retry_attempts: 1
└── [send-notification] task - 30ms ✓
```

### Docker Compose for Jaeger

```yaml
version: '3'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

Run with: `docker compose up -d`

View traces at: http://localhost:16686

### Parent-Child Trace Context

Scopes automatically propagate trace context to child scopes:

```typescript
await using parent = scope({ 
  tracer, 
  name: 'parent-operation' 
})

// Child span will be a child of parent span
await using child = scope({ 
  parent,
  name: 'child-operation' 
})

// This creates a proper parent-child relationship in traces
```

### Adding Custom Attributes

```typescript
await using s = scope({ 
  tracer,
  name: 'api-request' 
})

const [err, user] = await s.task(
  async ({ signal }) => {
    const response = await fetch('/api/user', { signal })
    return response.json()
  },
  {
    otel: {
      name: 'fetch-user-api',
      attributes: {
        'http.method': 'GET',
        'http.route': '/api/user',
        'user.agent': 'my-app/1.0'
      }
    }
  }
)
```
