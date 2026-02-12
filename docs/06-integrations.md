# Integrations

How to integrate `go-go-scope` with other libraries.

## Table of Contents

- [go-go-try](#go-go-try)
- [OpenTelemetry](#opentelemetry)

---

## go-go-try

[go-go-try](https://github.com/thelinuxlich/go-go-try) provides Golang-style error handling that works seamlessly with `go-go-scope`.

### Installation

```bash
npm install go-go-try
```

### Using goTry Inside Tasks

Use `goTry` inside big tasks to handle individual operations without breaking the entire task:

```typescript
import { scope } from 'go-go-scope'
import { goTry, goTryRaw } from 'go-go-try'

async function processOrder(orderId: string) {
  await using s = scope({ timeout: 30000 })
  
  const [err, result] = await s.task(async ({ services, signal }) => {
    // Each operation can fail independently
    
    // Parse order data - if this fails, we still continue
    const [parseErr, orderData] = goTry(() => 
      JSON.parse(localStorage.getItem(`order:${orderId}`) || '{}')
    )
    
    // Validate order - use error message
    const [validateErr, isValid] = await goTry(
      services.db.query('SELECT validate_order(?)', [orderId])
    )
    
    if (validateErr) {
      console.log('Validation warning:', validateErr) // string message
    }
    
    // Fetch user with raw error for logging
    const [userErr, user] = await goTryRaw(
      services.db.query('SELECT * FROM users WHERE id = ?', [orderData.userId])
    )
    
    if (userErr) {
      // userErr is Error object with stack trace
      console.error('User fetch failed:', userErr.message)
      console.error(userErr.stack)
    }
    
    // Process payment - critical operation
    const [paymentErr, payment] = await goTry(
      services.payment.process(orderData.amount, orderData.currency)
    )
    
    if (paymentErr) {
      // This error will fail the entire task
      throw new Error(`Payment failed: ${paymentErr}`)
    }
    
    // Send notifications - non-critical, don't throw
    const [emailErr] = await goTry(services.email.send(user.email, 'Order confirmed'))
    const [smsErr] = await goTry(services.sms.send(user.phone, 'Order confirmed'))
    
    // Log non-critical errors but don't fail
    if (emailErr) console.log('Email failed:', emailErr)
    if (smsErr) console.log('SMS failed:', smsErr)
    
    // Cache result - best effort
    goTry(() => {
      localStorage.setItem(`order:${orderId}:processed`, JSON.stringify(payment))
    })
    
    return { orderId, payment, user }
  })
  
  if (err) {
    console.error('Order processing failed:', err)
    return null
  }
  
  return result
}
```

### goTry vs goTryRaw

- **`goTry`** - Returns error as `string` (error message)
- **`goTryRaw`** - Returns error as `Error` object (with stack trace)

```typescript
import { goTry, goTryRaw } from 'go-go-try'

await s.task(async () => {
  // goTry - error is string | undefined (good for simple checks)
  const [err, value] = goTry(() => JSON.parse(data))
  if (err) console.log('Parse error:', err) // "Unexpected token..."
  
  // goTryRaw - error is Error | undefined (good for logging)
  const [err, value] = goTryRaw(() => riskyOperation())
  if (err) {
    console.error(err.message)
    console.error(err.stack) // Full stack trace
  }
})
```

### Pattern: Collecting Partial Results

Use `goTry` to process many items where some might fail:

```typescript
const [err, results] = await s.task(async ({ services }) => {
  const userIds = [1, 2, 3, 4, 5]
  const successful: User[] = []
  const failed: { id: number; error: string }[] = []
  
  for (const userId of userIds) {
    const [fetchErr, user] = await goTry(
      services.db.query('SELECT * FROM users WHERE id = ?', [userId])
    )
    
    if (fetchErr) {
      failed.push({ id: userId, error: fetchErr })
      continue // Don't stop, process next user
    }
    
    // Parse profile - might fail for some users
    const [parseErr, profile] = goTry(() => JSON.parse(user.profile_json))
    
    successful.push({
      ...user,
      profile: parseErr ? null : profile
    })
  }
  
  return { successful, failed }
})
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

### Complete Example

See [examples/jaeger-tracing.ts](../examples/jaeger-tracing.ts) for a complete working example with Jaeger tracing.

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
