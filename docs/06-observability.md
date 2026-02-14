# Observability

Monitor and debug your concurrent applications with metrics, logging, profiling, and tracing.

## Table of Contents

- [Metrics](#metrics)
- [Metrics Export](#metrics-export)
- [Structured Logging](#structured-logging)
- [Task Profiling](#task-profiling)
- [OpenTelemetry Integration](#opentelemetry-integration)

---

## Metrics

Collect runtime metrics for performance monitoring.

### Basic Usage

```typescript
await using s = scope({ metrics: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchUser(2))

const metrics = s.metrics()
console.log(metrics)
// {
//   tasksSpawned: 2,
//   tasksCompleted: 2,
//   tasksFailed: 0,
//   totalTaskDuration: 45.2,
//   avgTaskDuration: 22.6,
//   p95TaskDuration: 25.1,
//   resourcesRegistered: 0,
//   resourcesDisposed: 0
// }
```

### Metrics Available

| Metric | Description |
|--------|-------------|
| `tasksSpawned` | Total tasks created |
| `tasksCompleted` | Tasks that succeeded |
| `tasksFailed` | Tasks that threw errors |
| `totalTaskDuration` | Sum of all task execution times (ms) |
| `avgTaskDuration` | Average task execution time (ms) |
| `p95TaskDuration` | 95th percentile task duration (ms) |
| `resourcesRegistered` | Services registered with cleanup |
| `resourcesDisposed` | Resources successfully cleaned up |
| `scopeDuration` | Total scope lifetime (ms, after disposal) |

### Performance Monitoring

```typescript
await using s = scope({ metrics: true, name: 'api-request' })

// Make some API calls
await s.parallel(urls.map(url => () => fetch(url)))

// Log performance data
const metrics = s.metrics()
console.log(`Completed ${metrics.tasksCompleted} tasks`)
console.log(`Average time: ${metrics.avgTaskDuration.toFixed(2)}ms`)
console.log(`P95 time: ${metrics.p95TaskDuration.toFixed(2)}ms`)
```

---

## Metrics Export

Export metrics in various formats for external monitoring systems.

### JSON Format

```typescript
import { exportMetrics } from 'go-go-scope'

await using s = scope({ metrics: true })
// ... run tasks

const metrics = s.metrics()
if (metrics) {
  const json = exportMetrics(metrics, { format: 'json' })
  console.log(json)
}
```

### Prometheus Format

```typescript
const prometheus = exportMetrics(metrics, { 
  format: 'prometheus',
  prefix: 'myapp'
})
// Outputs:
// # HELP myapp_tasks_spawned_total Total number of tasks spawned
// # TYPE myapp_tasks_spawned_total counter
// myapp_tasks_spawned_total 10 1234567890
// ...
```

### OpenTelemetry Format

```typescript
const otel = exportMetrics(metrics, { format: 'otel' })
// Outputs OTLP-compatible JSON
```

### Metrics Reporter

Automatically report metrics at intervals:

```typescript
import { MetricsReporter } from 'go-go-scope'

await using s = scope({ metrics: true })

const reporter = new MetricsReporter(s, {
  format: 'prometheus',
  interval: 60000,  // Report every minute
  onExport: async (data) => {
    await sendToPrometheusPushgateway(data)
  }
})

// Reporter automatically starts
// Stop when needed
reporter.stop()

// Force immediate report
await reporter.report()
```

---

## Structured Logging

Integrate with structured logging systems.

### Basic Usage

```typescript
import { scope, ConsoleLogger } from 'go-go-scope'

await using s = scope({ 
  logger: new ConsoleLogger('my-scope', 'debug'),
  logLevel: 'debug'
})

// Logs are automatically generated for scope events
await s.task(() => fetchData())
// Output: [my-scope] Spawning task #1 "task-1"
```

### Custom Logger

```typescript
import type { Logger } from 'go-go-scope'

class PinoLogger implements Logger {
  constructor(private pino: typeof import('pino')) {}
  
  debug(msg: string, ...args: unknown[]) {
    this.pino.debug(msg, ...args)
  }
  info(msg: string, ...args: unknown[]) {
    this.pino.info(msg, ...args)
  }
  warn(msg: string, ...args: unknown[]) {
    this.pino.warn(msg, ...args)
  }
  error(msg: string, ...args: unknown[]) {
    this.pino.error(msg, ...args)
  }
}

await using s = scope({
  logger: new PinoLogger(pino)
})
```

### Using Console Logger

```typescript
await using s = scope({ 
  logLevel: 'info'  // Only info and above
})

// Or with specific scope name
await using s = scope({ 
  name: 'api-handler',
  logLevel: 'debug'
})
```

---

## Task Profiling

Profile task execution to understand performance characteristics.

### Basic Usage

```typescript
await using s = scope({ profiler: true })

await s.task(() => fetchUser(1))
await s.task(() => fetchPosts(1))

// Get profile report
const report = s.getProfileReport()
console.log(report.statistics)
// {
//   totalTasks: 2,
//   successfulTasks: 2,
//   failedTasks: 0,
//   avgTotalDuration: 45.2,
//   avgExecutionDuration: 40.1,
//   totalRetryAttempts: 0
// }
```

### Per-Task Profiles

```typescript
const report = s.getProfileReport()

for (const task of report.tasks) {
  console.log(`${task.name}:`)
  console.log(`  Total: ${task.totalDuration.toFixed(2)}ms`)
  console.log(`  Execution: ${task.stages.execution.toFixed(2)}ms`)
  console.log(`  Circuit Breaker: ${task.stages.circuitBreaker?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Concurrency: ${task.stages.concurrency?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Retry: ${task.stages.retry?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Timeout: ${task.stages.timeout?.toFixed(2) ?? 'N/A'}ms`)
  console.log(`  Retry Attempts: ${task.retryAttempts}`)
}
```

### Identifying Bottlenecks

```typescript
const report = s.getProfileReport()

// Find tasks with high retry counts
const retriedTasks = report.tasks.filter(t => t.retryAttempts > 0)

// Find slowest tasks
const slowestTasks = [...report.tasks]
  .sort((a, b) => b.totalDuration - a.totalDuration)
  .slice(0, 5)
```

---

## OpenTelemetry Integration

Optional tracing for observability.

### Basic Tracing

```typescript
import { trace } from '@opentelemetry/api'
import { scope } from 'go-go-scope'

const tracer = trace.getTracer('my-app')

await using s = scope({ tracer, name: 'fetch-user-data' })

// Creates spans automatically
const userTask = s.task(() => fetchUser(1))
const postsTask = s.task(() => fetchPosts(1))
```

### Custom Span Names

```typescript
const [err, user] = await s.task(
  () => fetchUser(id),
  {
    otel: {
      name: 'fetch-user',
      attributes: { 'user.id': id }
    }
  }
)
```

### Spans Created

| Span Name | Description | Attributes |
|-----------|-------------|------------|
| `scope` (or custom) | Scope lifecycle | `scope.timeout`, `scope.duration_ms`, `scope.errors` |
| `scope.task` (or custom) | Each task | `task.duration_ms`, `task.error_reason`, `task.retry_attempts` |

### Viewing Traces

Traces appear in your OpenTelemetry backend (Jaeger, Zipkin, etc.):

```
[fetch-user-data] scope
├── [fetch-user] task - 150ms
└── [fetch-posts] task - 80ms ✓
```

See the [integrations guide](./11-integrations.md) for complete OpenTelemetry setup.

---

## Next Steps

- **[Rate Limiting](./07-rate-limiting.md)** - Debounce, throttle, and concurrency limits
- **[Testing](./08-testing.md)** - Testing utilities and patterns
