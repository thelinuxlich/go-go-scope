# Integrations

How to integrate `go-go-scope` with other libraries and monitoring systems.

## Table of Contents

- [go-go-try](#go-go-try)
- [OpenTelemetry](#opentelemetry)
- [Prometheus](#prometheus)
- [Grafana](#grafana)
- [Persistence Adapters](#persistence-adapters)

---

## go-go-try

[go-go-try](https://github.com/thelinuxlich/go-go-try) provides Golang-style error handling that works seamlessly with `go-go-scope`.

### Installation

```bash
npm install go-go-try
```

### Automatic Union Inference (New in v7.2+)

Use `taggedError` with the `errorClass` option for automatic union inference of typed errors:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure } from 'go-go-try'

// Define tagged error classes using the helper
const DatabaseError = taggedError('DatabaseError')
const NetworkError = taggedError('NetworkError')

// Automatic union inference - no explicit return type needed!
// TypeScript infers: Promise<Result<DatabaseError | NetworkError, User>>
async function fetchUser(id: string) {
  await using s = scope({ timeout: 5000 })
  
  // errorClass wraps errors in the typed error class
  const [dbErr, user] = await s.task(
    () => queryDatabase(id),
    { errorClass: DatabaseError }
  )
  if (dbErr) return failure(dbErr)
  
  const [netErr, enriched] = await s.task(
    () => enrichUserData(user!),
    { errorClass: NetworkError }
  )
  if (netErr) return failure(netErr)
  
  return success(enriched)
}

// Exhaustive pattern matching with type narrowing
import { assertNever } from 'go-go-try'

const [err, user] = await fetchUser('123')
if (err) {
  switch (err._tag) {
    case 'DatabaseError':
      console.error('DB failed:', err.message)
      break
    case 'NetworkError':
      console.error('Network issue:', err.message)
      break
    default:
      // Compile-time safety: TypeScript ensures all cases are handled
      assertNever(err)
  }
} else {
  console.log('Got user:', user.name)
}
```

### Benefits

- **No explicit types needed** - TypeScript infers the union automatically
- **Exhaustive checking** - Pattern matching ensures all error cases are handled
- **Type narrowing** - Inside each `case`, the error is fully typed with the `_tag` discriminator
- **Refactoring safety** - Adding a new error type causes TypeScript errors where not handled

### Alternative: Using goTryRaw Directly

If you don't need scope's automatic signal propagation, use `goTryRaw` directly on raw operations:

```typescript
import { scope } from 'go-go-scope'
import { taggedError, success, failure, goTryRaw } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')

async function fetchUser(id: string) {
  await using s = scope({ timeout: 5000 })
  
  // Use goTryRaw on raw operations (not s.task)
  const [err, user] = await goTryRaw(
    () => queryDatabase(id),  // Raw operation
    DatabaseError
  )
  if (err) return failure(err)
  
  return success(user!)
}
```

> **Note:** `goTryRaw(s.task(...))` doesn't work because `s.task()` already returns `Result<unknown, T>`, which would cause double-wrapping.

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

Run with: `npm run jaeger:up`

View traces at: http://localhost:16687

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

---

## Prometheus

Export go-go-scope metrics to Prometheus for monitoring and alerting.

### Setup

Start Prometheus and Grafana:

```bash
npm run prometheus:up
```

This starts:
- **Prometheus UI**: http://localhost:9091
- **Grafana UI**: http://localhost:3001 (admin/admin)

### Basic Usage

Export metrics in Prometheus format:

```typescript
import { exportMetrics, scope } from 'go-go-scope'

await using s = scope({ metrics: true })

// Run some tasks
await s.task(() => fetchUser(1))
await s.task(() => fetchUser(2))

// Get metrics
const metrics = s.metrics()
if (metrics) {
  // Export in Prometheus format
  const promOutput = exportMetrics(metrics, {
    format: 'prometheus',
    prefix: 'myapp'  // Custom prefix for your app
  })
  
  console.log(promOutput)
}
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `goscope_tasks_spawned_total` | counter | Total tasks created |
| `goscope_tasks_completed_total` | counter | Tasks that succeeded |
| `goscope_tasks_failed_total` | counter | Tasks that failed |
| `goscope_task_duration_seconds_total` | counter | Total execution time |
| `goscope_task_duration_avg_seconds` | gauge | Average task duration |
| `goscope_task_duration_p95_seconds` | gauge | P95 task duration |
| `goscope_resources_registered_total` | counter | Resources registered |
| `goscope_resources_disposed_total` | counter | Resources cleaned up |
| `goscope_scope_duration_seconds` | gauge | Total scope lifetime |

### Metrics Reporter

Automatically report metrics at intervals:

```typescript
import { MetricsReporter, scope } from 'go-go-scope'

await using s = scope({ metrics: true })

const reporter = new MetricsReporter(s, {
  format: 'prometheus',
  interval: 60000,  // Report every minute
  onExport: async (data) => {
    // Send to your monitoring system
    await fetch('http://your-metrics-endpoint', {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
})

// Reporter starts automatically
// Stop when done
reporter.stop()
```

### Exposing Metrics Endpoint

For Prometheus scraping, expose an HTTP endpoint:

```typescript
import { createServer } from 'http'
import { exportMetrics, scope } from 'go-go-scope'

// Create scope
const s = scope({ metrics: true })

// Create metrics server
const server = createServer((req, res) => {
  if (req.url === '/metrics') {
    const metrics = s.metrics()
    if (metrics) {
      const output = exportMetrics(metrics, {
        format: 'prometheus',
        prefix: 'goscope'
      })
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(output)
    } else {
      res.writeHead(503)
      res.end('Metrics not available')
    }
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(9095)
console.log('Metrics available at http://localhost:9095/metrics')
```

### Complete Example

See [examples/prometheus-metrics.ts](../examples/prometheus-metrics.ts) for a complete working example.

Run it with:

```bash
npm run prometheus:up      # Start Prometheus & Grafana
npm run example:prometheus # Run the example
```

---

## Grafana

Visualize go-go-scope metrics in Grafana.

### Default Dashboard

When you start the monitoring stack with `npm run prometheus:up`, a default dashboard is provisioned with the following panels:

#### Task Metrics
- **Tasks Spawned/Completed/Failed** - Rate of task execution
- **Task Duration** - Average and P95 duration over time
- **Task Success Rate** - Percentage of successful tasks

#### Resource Metrics
- **Resources Registered/Disposed** - Cleanup tracking
- **Active Resources** - Difference between registered and disposed

#### Scope Metrics
- **Scope Lifetime** - How long scopes are running
- **Concurrent Tasks** - Current concurrency level

### Custom Dashboard

Create your own dashboard by importing the following JSON model:

```json
{
  "dashboard": {
    "title": "go-go-scope Metrics",
    "panels": [
      {
        "title": "Tasks per Second",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(goscope_tasks_completed_total[5m])",
            "legendFormat": "Tasks/sec"
          }
        ]
      },
      {
        "title": "Task Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "goscope_task_duration_avg_seconds",
            "legendFormat": "Average"
          },
          {
            "expr": "goscope_task_duration_p95_seconds",
            "legendFormat": "P95"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(goscope_tasks_failed_total[5m]) / rate(goscope_tasks_spawned_total[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      }
    ]
  }
}
```

### Accessing Grafana

1. Start the monitoring stack:
   ```bash
   npm run monitoring:up
   ```

2. Open Grafana: http://localhost:3001

3. Login with:
   - Username: `admin`
   - Password: `admin`

4. Navigate to **Dashboards > Manage** to see provisioned dashboards

### Alerting

Set up alerts for important metrics:

#### High Error Rate
```yaml
alert: HighTaskErrorRate
expr: rate(goscope_tasks_failed_total[5m]) / rate(goscope_tasks_spawned_total[5m]) > 0.1
for: 5m
labels:
  severity: warning
annotations:
  summary: "High task error rate detected"
```

#### Slow Tasks
```yaml
alert: SlowTasks
expr: goscope_task_duration_p95_seconds > 5
for: 5m
labels:
  severity: warning
annotations:
  summary: "P95 task duration exceeds 5 seconds"
```

#### Resource Leak
```yaml
alert: PotentialResourceLeak
expr: goscope_resources_registered_total - goscope_resources_disposed_total > 100
for: 10m
labels:
  severity: critical
annotations:
  summary: "Resources may be leaking"
```

### Stopping the Stack

```bash
npm run monitoring:down
```

---

## Persistence Adapters

Distributed locks, rate limiting, and circuit breaker state persistence across multiple database backends.

### Supported Databases

| Database | Adapter | Lock TTL | Notes |
|----------|---------|----------|-------|
| **Redis** | `RedisAdapter` | ✅ Native | Best for distributed locks |
| **PostgreSQL** | `PostgresAdapter` | ✅ App-level | Uses advisory locks + TTL table |
| **MySQL** | `MySQLAdapter` | ✅ App-level | Uses named locks + TTL table |
| **SQLite** | `SQLiteAdapter` | ✅ App-level | Single-node, file-based |

### Installation

Install the peer dependencies for your database:

```bash
# Redis
npm install ioredis

# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite (Node.js)
npm install sqlite3

# SQLite (Bun native - built-in)
# No install needed, use bun:sqlite
```

### Quick Start

```typescript
import { scope } from 'go-go-scope'
import { RedisAdapter } from 'go-go-scope/persistence/redis'
import { Pool } from 'pg'

// Redis example
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL)
const redisAdapter = new RedisAdapter(redis)

await using s = scope({
  persistence: {
    lock: redisAdapter,
    rateLimit: redisAdapter,
    circuitBreaker: redisAdapter
  }
})

// Acquire distributed lock
const lock = await s.acquireLock('critical-section', 30000)
if (!lock) {
  console.log('Could not acquire lock')
  return
}

// Lock automatically released when scope exits
// Or release manually:
await lock.release()
```

### Distributed Locks

All adapters provide TTL-based distributed locks that expire automatically:

```typescript
import { scope } from 'go-go-scope'
import { RedisAdapter } from 'go-go-scope/persistence/redis'

const redis = new Redis()
const adapter = new RedisAdapter(redis)

await using s = scope({
  persistence: { lock: adapter }
})

// Try to acquire lock with 5 second TTL
const lock = await s.acquireLock('resource:123', 5000)

if (lock) {
  console.log('Lock acquired!')
  
  // Check if still valid
  if (await lock.isValid()) {
    console.log('Lock is still valid')
  }
  
  // Extend lock TTL
  await lock.extend(10000) // Extend to 10 more seconds
  
  // Release when done
  await lock.release()
} else {
  console.log('Resource is locked by another process')
}
```

**Lock TTL Behavior:**

If a node acquires a lock and then crashes:
- **Redis**: Lock expires via native TTL after specified time
- **PostgreSQL/MySQL**: Lock expires based on `expires_at` timestamp
- **SQLite**: Lock expires based on in-memory timestamp

After TTL expires, any node can acquire the lock.

### Rate Limiting

Distributed rate limiting with sliding window algorithm:

```typescript
import { scope } from 'go-go-scope'
import { PostgresAdapter } from 'go-go-scope/persistence/postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PostgresAdapter(pool)

await using s = scope({
  persistence: { rateLimit: adapter }
})

// Check rate limit
const result = await adapter.checkAndIncrement('user:123', {
  max: 100,        // 100 requests
  windowMs: 60000  // per minute
})

if (!result.allowed) {
  console.log(`Rate limited. Retry after ${result.resetTimeMs}ms`)
  return
}

console.log(`Requests remaining: ${result.remaining}`)
```

### Circuit Breaker State

Share circuit breaker state across instances:

```typescript
import { scope } from 'go-go-scope'
import { MySQLAdapter } from 'go-go-scope/persistence/mysql'

const pool = createPool(process.env.DATABASE_URL)
const adapter = new MySQLAdapter(pool)

await using s = scope({
  persistence: { circuitBreaker: adapter },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000
  }
})

// Circuit breaker state is now shared across all instances
// If one instance opens the circuit, all instances see it
```

### Database-Specific Notes

#### Redis
- Best performance for distributed locks
- Native TTL support via `PX` option
- Supports pub/sub for real-time notifications

#### PostgreSQL
- Uses application-level locks (not advisory locks) for TTL support
- Lock state stored in `go_goscope_locks` table
- Requires `connect()` to create tables

#### MySQL
- Uses application-level locks for TTL support
- Requires UTC timezone configuration for accurate TTL
- Lock state stored in `go_goscope_locks` table

#### SQLite
- Single-node only (file-based or in-memory)
- Uses in-memory Map for locks
- Great for development/testing

### Bun Compatibility

All persistence adapters work with Bun:

```typescript
// Bun with SQLite
import { SQLiteAdapter } from 'go-go-scope/persistence/sqlite'
import sqlite3 from 'sqlite3'

const db = new sqlite3.Database(':memory:')
const adapter = new SQLiteAdapter(db)
await adapter.connect()

await using s = scope({
  persistence: { lock: adapter }
})
```

---

## Next Steps

- **[Quick Start](./01-quick-start.md)** - Get started in 5 minutes
- **[API Reference](./03-api-reference.md)** - Complete API documentation
