# Job Scheduler

The `@go-go-scope/scheduler` module provides a production-ready distributed job scheduler with automatic database-driven scheduling.

## Features

- **Simple API**: Create schedules and register handlers on the same instance
- **Schedule Management**: Create, update, pause, resume, disable, and delete schedules
- **Schedule States**: Active, paused, or disabled states with automatic handling
- **Statistics**: Track job success rates, durations, and counts
- **CLI Tool**: Command-line interface for managing schedules
- **TUI Tool**: Interactive terminal UI for real-time monitoring and control
- **Timezone Support**: Full IANA timezone support with DST handling
- **Distributed Locking**: Prevents duplicate execution across multiple instances
- **Persistent Storage**: Redis, PostgreSQL, MySQL, SQLite support
- **Debug Logging**: Built-in debug output via `debug` module
- **OpenTelemetry Tracing**: Automatic span creation for job execution
- **Structured Logging**: Logger integration for job lifecycle events
- **Job Lifecycle Hooks**: Custom `beforeJob`, `afterJob`, `onJobError` hooks
- **Deadlock Detection**: Automatic detection of stuck jobs
- **Metrics Export**: Prometheus, OpenTelemetry, and JSON formats
- **Job Profiling**: Detailed execution timing and stage breakdowns
- **Optional Scope**: Auto-creates scope if not provided

## Quick Start

> 💡 **Tip**: Always instantiate schedulers with `using` for automatic cleanup:
> ```typescript
> using scheduler = new Scheduler({ storage });
> ```

### Disposal Patterns

The scheduler implements `AsyncDisposable`, enabling the `await using` declaration for automatic cleanup:

```typescript
// Async disposal
await using scheduler = new Scheduler({ storage });
// For async cleanup operations
```

**What gets cleaned up:**
- Polling timers stopped
- Running jobs cancelled
- Internal scope disposed (if auto-created)
- Event listeners removed
- "stopped" event emitted

### Basic Usage

```typescript
import { scope } from "go-go-scope";
import { Scheduler, CronPresets } from "@go-go-scope/scheduler";
import { RedisJobStorage } from "@go-go-scope/scheduler";
import { RedisAdapter } from "@go-go-scope/persistence-redis";
import Redis from "ioredis";

const redis = new Redis("redis://localhost:6379");
const redisAdapter = new RedisAdapter(redis);

await using s = scope();

// Use 'using' for automatic cleanup (recommended)
using scheduler = new Scheduler({
  scope: s,
  storage: new RedisJobStorage(redis, redisAdapter),
});

// Create schedules
await scheduler.createSchedule("daily-report", {
  cron: CronPresets.DAILY,
  timezone: "America/New_York",
  maxRetries: 3,
  timeout: 30000,
});

// Register handler for the schedule
scheduler.onSchedule("daily-report", async (job, jobScope) => {
  // Generate report
  const [err, data] = await jobScope.task(async () => {
    return fetchReportData();
  });
  
  if (err) throw err;
  await sendReport(data);
});

scheduler.start();
console.log("Scheduler ready to process jobs");
// scheduler is automatically disposed when 'using' block exits
```

## Schedule Management

### Schedule States

Schedules can be in one of three states:

- **`ACTIVE`** (default): Schedule is running normally, creating jobs
- **`PAUSED`**: Schedule temporarily stopped, no new jobs created
- **`DISABLED`**: Schedule disabled, handlers will skip jobs

```typescript
// Pause a schedule (no new jobs)
await scheduler.pauseSchedule("daily-report");

// Resume a paused schedule
await scheduler.resumeSchedule("daily-report");

// Disable a schedule (handlers will skip)
await scheduler.disableSchedule("daily-report");
```

### Listing and Getting Schedules

```typescript
// List all schedules
const schedules = await scheduler.listSchedules();
// [{ name: "daily-report", state: "active", cron: "0 9 * * *", ... }]

// Get specific schedule
const schedule = await scheduler.getSchedule("daily-report");
```

### Updating Schedules

```typescript
// Update schedule configuration
await scheduler.updateSchedule("daily-report", {
  cron: "0 10 * * *",        // Change to 10 AM
  timezone: "Europe/London", // Change timezone
  maxRetries: 5,             // More retries
  timeout: 60000,            // Longer timeout
});
```

### Schedule Statistics

```typescript
// Get stats for one schedule
const stats = await scheduler.getScheduleStats("daily-report");
console.log(stats);
// {
//   name: "daily-report",
//   state: "active",
//   totalJobs: 100,
//   pendingJobs: 0,
//   runningJobs: 1,
//   completedJobs: 95,
//   failedJobs: 4,
//   cancelledJobs: 0,
//   successRate: 95,
//   averageDuration: 2500, // ms
// }

// Get stats for all schedules
const allStats = await scheduler.getAllScheduleStats();
```

### Manual Trigger

```typescript
// Trigger a schedule to run immediately
const [err, result] = await scheduler.triggerSchedule("daily-report", {
  force: true, // Optional: bypass paused state
});

if (result) {
  console.log("Triggered job:", result.jobId);
}
```

## Handler Registration

Register handlers using `onSchedule()`. Handlers can be registered before or after schedules are created:

```typescript
// Register handler BEFORE schedule exists
scheduler.onSchedule("future-task", async (job, scope) => {
  console.log("Handler ready!");
});

// Later, create the schedule
await scheduler.createSchedule("future-task", { interval: 5000 });
```

### Multiple Handlers

Multiple handlers can be registered for the same schedule (each job runs once, picked up by one handler):

```typescript
// In a distributed setup, multiple instances can register
// for the same schedule - only one will execute each job
scheduler.onSchedule("shared-task", async (job) => {
  console.log(`Processing job ${job.id}`);
});
```

### Removing Handlers

```typescript
// Remove handler when no longer needed
scheduler.offSchedule("daily-report");
```

## CLI & TUI Tools

The scheduler includes both a CLI and an interactive TUI for management.

### CLI Tool

Command-line interface for scripting and automation.

```bash
npm install -g go-go-scope
```

### TUI Tool (Interactive)

Real-time interactive interface for monitoring and controlling schedules.

```bash
# Start the TUI
npx go-go-scheduler-tui

# With Redis storage
npx go-go-scheduler-tui -s redis -u redis://localhost:6379
```

**TUI Controls:**
- `↑/↓` - Navigate schedules
- `Enter` - View schedule details
- `p` - Pause/Resume schedule
- `d` - Disable schedule
- `t` - Trigger schedule (run now)
- `r` - Refresh data
- `q` or `Ctrl+C` - Quit

**TUI Features:**
- Real-time schedule list with status colors
- Success rates and job counts
- Schedule details view
- Interactive pause/resume/disable/trigger
- Auto-refresh every 5 seconds

### CLI Usage

```bash
# List all schedules
npx go-go-scheduler list --storage redis --url redis://localhost:6379

# Create a schedule
npx go-go-scheduler create daily-report \
  --cron "0 9 * * *" \
  --timezone America/New_York

# Get schedule details
npx go-go-scheduler get daily-report

# Show statistics
npx go-go-scheduler stats daily-report
# or for all schedules
npx go-go-scheduler stats

# Update a schedule
npx go-go-scheduler update daily-report --cron "0 10 * * *"

# Pause/resume/disable
npx go-go-scheduler pause daily-report
npx go-go-scheduler resume daily-report
npx go-go-scheduler disable daily-report

# Trigger immediately
npx go-go-scheduler trigger daily-report

# Delete a schedule
npx go-go-scheduler delete daily-report

# List jobs for a schedule
npx go-go-scheduler jobs daily-report
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-s, --storage` | Storage type: `redis`, `memory` (default: memory) |
| `-u, --url` | Connection URL for storage |
| `--cron` | Cron expression |
| `--interval` | Interval in milliseconds |
| `-tz, --timezone` | IANA timezone |
| `--maxRetries` | Maximum retry attempts |
| `--timeout` | Job timeout in ms |
| `--concurrent` | Allow concurrent execution |

## API Reference

### Scheduler Constructor

```typescript
interface SchedulerOptions {
  /** 
   * Parent scope for structured concurrency.
   * If not provided, a new scope is created automatically.
   */
  scope?: Scope;
  
  /** Storage backend (default: InMemoryJobStorage for testing) */
  storage?: JobStorage;
  
  /** Poll interval in milliseconds (default: 1000) */
  checkInterval?: number;
  
  /** Auto-start on creation (default: true) */
  autoStart?: boolean;
  
  /** Stale job threshold (default: 0 = disabled) */
  staleThreshold?: number;
  
  /** How to handle stale jobs (default: RUN) */
  staleJobBehavior?: StaleJobBehavior;
  
  /** Default timezone for schedules (default: system local time) */
  defaultTimezone?: string;
  
  /** OpenTelemetry tracer for distributed tracing */
  tracer?: { startSpan(name: string): { setAttribute(key: string, value: unknown): void; end(): void } };
  
  /** Structured logger for job lifecycle events */
  logger?: { 
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  
  /** Job lifecycle hooks */
  hooks?: {
    beforeJob?: (job: Job, schedule: Schedule) => void | Promise<void>;
    afterJob?: (job: Job, schedule: Schedule, result: JobResult) => void | Promise<void>;
    onJobError?: (job: Job, schedule: Schedule, error: Error, willRetry: boolean) => void | Promise<void>;
  };
  
  /** Enable metrics collection (default: false) */
  metrics?: boolean;
  
  /** Deadlock detection threshold in ms (default: 0 = disabled) */
  deadlockThreshold?: number;
  
  /** Callback invoked when a deadlock is detected */
  onDeadlock?: (job: Job, duration: number) => void | Promise<void>;
}
```

### Schedule Management Methods

#### `createSchedule(name, options)`

Creates a schedule.

```typescript
await scheduler.createSchedule("my-schedule", {
  cron: "0 9 * * *",           // Cron expression
  interval: undefined,         // Or use interval (ms)
  timezone: "America/New_York", // IANA timezone
  maxRetries: 3,               // Retry attempts
  retryDelay: 1000,            // Delay between retries
  timeout: 30000,              // Job timeout
  concurrent: false,           // Allow concurrent job execution
  jitter: 0,                   // Random jitter (ms)
});
```

#### `deleteSchedule(name)`

Deletes a schedule.

```typescript
await scheduler.deleteSchedule("my-schedule");
```

#### `listSchedules()`

List all schedules.

```typescript
const schedules = await scheduler.listSchedules();
// [Schedule, Schedule, ...]
```

#### `getSchedule(name)`

Get a specific schedule by name.

```typescript
const schedule = await scheduler.getSchedule("my-schedule");
```

#### `updateSchedule(name, options)`

Update an existing schedule.

```typescript
await scheduler.updateSchedule("my-schedule", {
  cron: "0 10 * * *",        // New time
  timezone: "Europe/London",  // New timezone
  maxRetries: 5,
});
```

#### `pauseSchedule(name)` / `resumeSchedule(name)` / `disableSchedule(name)`

Change schedule state.

```typescript
await scheduler.pauseSchedule("my-schedule");    // No new jobs
await scheduler.resumeSchedule("my-schedule");   // Resume normal operation
await scheduler.disableSchedule("my-schedule");  // Handlers will skip
```

#### `getScheduleStats(name)` / `getAllScheduleStats()`

Get statistics for schedules.

```typescript
// One schedule
const stats = await scheduler.getScheduleStats("my-schedule");

// All schedules
const allStats = await scheduler.getAllScheduleStats();
```

#### `triggerSchedule(name, payload?)`

Manually trigger a schedule to run immediately.

```typescript
const [err, result] = await scheduler.triggerSchedule("my-schedule");
if (result) {
  console.log("Job ID:", result.jobId);
}
```

#### `scheduleJob(scheduleName, payload?, options?)`

Schedules a one-time job.

```typescript
const [err, result] = await scheduler.scheduleJob("my-schedule", 
  { userId: "123" },  // payload
  { delay: 60000 }    // run in 1 minute
);

if (result) {
  console.log("Job scheduled:", result.jobId);
}
```

#### `cancelJob(jobId)`

Cancels a pending job.

```typescript
await scheduler.cancelJob(jobId);
```

### Concurrent Execution Control

The `concurrent` option controls whether multiple jobs from the same schedule can run simultaneously.

#### `concurrent: false` (Default)

When `concurrent: false`, only **one job per schedule** runs at a time. If a job is already running when another job becomes due, the new job waits until the current one completes.

```typescript
// Sequential execution - jobs run one at a time
await scheduler.createSchedule("sequential-task", {
  interval: 60000,
  concurrent: false,  // Default
});

scheduler.onSchedule("sequential-task", async (job) => {
  // This handler will never run concurrently for the same schedule
  console.log(`Starting job ${job.id}`);
  await longRunningProcess();
  console.log(`Completed job ${job.id}`);
});
```

**Use cases for `concurrent: false`:**
- Database migrations or schema updates
- Report generation that writes to the same file
- API calls with rate limits per schedule
- Any task that modifies shared state

#### `concurrent: true`

When `concurrent: true`, **multiple jobs from the same schedule** can run simultaneously. This is useful when jobs are independent and you want to maximize throughput.

```typescript
// Parallel execution - jobs can run simultaneously
await scheduler.createSchedule("parallel-task", {
  cron: "*/5 * * * *",  // Every 5 minutes
  concurrent: true,
});

scheduler.onSchedule("parallel-task", async (job) => {
  // Multiple jobs from this schedule can run at the same time
  console.log(`Processing job ${job.id}`);
  await processIndependentData(job.payload);
});
```

**Use cases for `concurrent: true`:**
- Processing independent user data
- Image/video encoding jobs
- Sending emails or notifications
- Any embarrassingly parallel workload

#### Cross-Instance Coordination

The `concurrent` setting is respected **across all scheduler instances**. If you have multiple workers:

```typescript
// Worker 1
const worker1 = new Scheduler({ storage });
worker1.onSchedule("task", handler);

// Worker 2
const worker2 = new Scheduler({ storage });
worker2.onSchedule("task", handler);

// With concurrent: false, only one worker will execute a job at a time
// even if both poll at the same moment
```

### Handler Methods

#### `onSchedule(name, handler)`

Register a handler for a schedule.

```typescript
scheduler.onSchedule("my-schedule", async (job: Job, scope: Scope) => {
  // Execute job
  const [err, data] = await scope.task(async () => {
    return fetchData();
  });
  
  if (err) throw err;
  await process(data);
});
```

#### `offSchedule(name)`

Remove a handler for a schedule.

```typescript
scheduler.offSchedule("my-schedule");
```

### Common Methods

#### `start()` / `stop()`

Control the scheduler lifecycle.

```typescript
scheduler.start();  // Start polling for jobs
await scheduler.stop();  // Stop and cleanup
```

#### `getStatus()`

Get current scheduler status.

```typescript
const status = scheduler.getStatus();
// {
//   isRunning: true,
//   runningJobs: 2,
//   scheduledJobs: 5,
//   instanceId: "scheduler-abc123"
// }
```

### Events

All instances emit events for monitoring:

```typescript
scheduler.on("started", ({ instanceId }) => {
  console.log(`Scheduler started: ${instanceId}`);
});

scheduler.on("stopped", ({ instanceId }) => {
  console.log(`Scheduler stopped: ${instanceId}`);
});

scheduler.on("scheduleCreated", ({ schedule }) => {
  console.log("Schedule created:", schedule.name);
});

scheduler.on("scheduleUpdated", ({ schedule }) => {
  console.log("Schedule updated:", schedule.name);
});

scheduler.on("scheduleStateChanged", ({ schedule, state }) => {
  console.log(`Schedule ${schedule.name} is now ${state}`);
});

scheduler.on("scheduleDeleted", ({ scheduleName }) => {
  console.log("Schedule deleted:", scheduleName);
});

scheduler.on("handlerRegistered", ({ scheduleName }) => {
  console.log(`Handler registered for: ${scheduleName}`);
});

scheduler.on("jobStarted", ({ job, instanceId }) => {
  console.log(`Job ${job.id} started on ${instanceId}`);
});

scheduler.on("jobCompleted", ({ job, duration }) => {
  console.log(`Job completed in ${duration}ms`);
});

scheduler.on("jobFailed", ({ job, error, permanent }) => {
  console.error(`Job failed${permanent ? " permanently" : ""}:`, error);
});
```

## Observability Features

### Debug Logging

Enable debug output using the `DEBUG` environment variable:

```bash
# All scheduler logs
DEBUG=go-go-scope:scheduler node app.js

# Job execution only
DEBUG=go-go-scope:scheduler:job node app.js

# Distributed lock events
DEBUG=go-go-scope:scheduler:lock node app.js

# All scheduler namespaces
DEBUG=go-go-scope:scheduler* node app.js
```

### OpenTelemetry Tracing

Automatic span creation for each job execution:

```typescript
import { trace } from "@opentelemetry/api";

const scheduler = new Scheduler({
  storage,
  tracer: trace.getTracer("my-app"),
});

// Each job creates a span:
// - schedule:{scheduleName}
// - Attributes: job.id, job.scheduleName, scheduler.instanceId, job.retryCount
```

### Structured Logging

Provide a logger to receive structured job lifecycle events:

```typescript
import { pino } from "pino";

const logger = pino({ level: "info" });

const scheduler = new Scheduler({
  storage,
  logger: {
    debug: (msg, meta) => logger.debug(meta, msg),
    info: (msg, meta) => logger.info(meta, msg),
    warn: (msg, meta) => logger.warn(meta, msg),
    error: (msg, meta) => logger.error(meta, msg),
  },
});

// Logs include:
// - Job started/completed/failed
// - Retry scheduled
// - Deadlock detected
// - Schedule created/deleted
```

### Job Lifecycle Hooks

Execute custom code at key points in job execution:

```typescript
const scheduler = new Scheduler({
  storage,
  hooks: {
    beforeJob: async (job, schedule) => {
      // Setup, validation, etc.
      console.log(`Starting job ${job.id} for ${schedule.name}`);
    },
    
    afterJob: async (job, schedule, result) => {
      // Cleanup, notifications, etc.
      console.log(`Job ${job.id} ${result.success ? 'succeeded' : 'failed'} in ${result.duration}ms`);
    },
    
    onJobError: async (job, schedule, error, willRetry) => {
      // Error handling, alerting, etc.
      if (!willRetry) {
        await alertOnPermanentFailure(job, error);
      }
    },
  },
});
```

### Deadlock Detection

Detect and handle jobs that get stuck:

```typescript
const scheduler = new Scheduler({
  storage,
  deadlockThreshold: 60000,  // Check after 60 seconds
  onDeadlock: async (job, duration) => {
    // Alert, log, or take corrective action
    console.error(`Job ${job.id} stuck for ${duration}ms`);
    await pagerDutyAlert(`Stuck job: ${job.scheduleName}`);
  },
});
```

### Metrics Export

Export scheduler metrics in multiple formats:

```typescript
// Collect current metrics
const metrics = await scheduler.collectMetrics();
// {
//   instanceId: "scheduler-abc123",
//   timestamp: Date,
//   jobs: { total, pending, running, completed, failed, cancelled },
//   schedules: [...],
//   activeJobs: [...]
// }

// Export as Prometheus
const prometheus = await scheduler.exportMetrics({ 
  format: "prometheus", 
  prefix: "myapp" 
});
// myapp_jobs_total{status="completed"} 42
// myapp_schedule_success_rate{schedule="daily"} 95

// Export as OpenTelemetry
const otel = await scheduler.exportMetrics({ format: "otel" });

// Export as JSON
const json = await scheduler.exportMetrics({ format: "json" });
```

### Job Profiling

Get detailed execution profiles for analysis:

```typescript
// Enable profiling
const scheduler = new Scheduler({
  storage,
  metrics: true,  // Enables profiling
});

// After job execution, get profile
const profile = scheduler.getJobProfile("job-123");
// {
//   jobId: "job-123",
//   scheduleName: "daily-report",
//   startTime: 1708704000000,
//   endTime: 1708704005000,
//   duration: 5000,
//   stages: [...]
// }

// Get all profiles
const allProfiles = scheduler.getAllJobProfiles();

// Cleanup old profiles
scheduler.clearJobProfiles(24 * 60 * 60 * 1000);  // Remove older than 24h
```

### Using Without External Scope

The scheduler can create its own scope if you don't provide one:

```typescript
// Without scope - creates one internally
// Always use 'using' for automatic cleanup!
using scheduler = new Scheduler({
  storage,
});

await scheduler.createSchedule("test", { cron: "* * * * *" });

// scheduler is automatically disposed when 'using' block exits
```

Compare with external scope:

```typescript
// With external scope
await using s = scope();

using scheduler = new Scheduler({
  scope: s,  // Uses existing scope
  storage,
});

// Both scheduler and 's' are automatically disposed
```

## Storage Backends

### Redis (Production)

```typescript
import { RedisJobStorage } from "@go-go-scope/scheduler";
import { RedisAdapter } from "@go-go-scope/persistence-redis";
import Redis from "ioredis";

const redis = new Redis("redis://localhost:6379");
const adapter = new RedisAdapter(redis);

const storage = new RedisJobStorage(redis, adapter, {
  keyPrefix: "myapp:scheduler:",
});
```

### PostgreSQL

```typescript
import { SQLJobStorage } from "@go-go-scope/scheduler";
import { PostgresAdapter } from "@go-go-scope/persistence-postgres";
import pg from "pg";

const pool = new pg.Pool({ /* config */ });
const adapter = new PostgresAdapter(pool);

const storage = new SQLJobStorage(
  { 
    query: (sql, params) => pool.query(sql, params),
    exec: (sql, params) => pool.query(sql, params)
  },
  adapter,
  "postgres"
);
```

### MySQL

```typescript
import { SQLJobStorage } from "@go-go-scope/scheduler";
import { MySQLAdapter } from "@go-go-scope/persistence-mysql";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({ /* config */ });
const adapter = new MySQLAdapter(conn);

const storage = new SQLJobStorage(
  { 
    query: async (sql, params) => {
      const [rows] = await conn.execute(sql, params);
      return { rows: rows as unknown[] };
    },
    exec: async (sql, params) => { await conn.execute(sql, params); }
  },
  adapter,
  "mysql"
);
```

### SQLite

```typescript
import { SQLJobStorage } from "@go-go-scope/scheduler";
import { SQLiteAdapter } from "@go-go-scope/persistence-sqlite";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("scheduler.db");
const adapter = new SQLiteAdapter(db);

const storage = new SQLJobStorage(
  { 
    query: (sql, params) => new Promise((resolve, reject) => {
      db.all(sql, params ?? [], (err, rows) => {
        if (err) reject(err);
        else resolve({ rows: rows as unknown[] });
      });
    }),
    exec: (sql, params) => new Promise((resolve, reject) => {
      db.run(sql, params ?? [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    })
  },
  adapter,
  "sqlite"
);
```

### In-Memory (Testing Only)

```typescript
import { InMemoryJobStorage } from "@go-go-scope/scheduler";

const storage = new InMemoryJobStorage();
```

⚠️ **Warning**: InMemoryJobStorage is for testing only. It doesn't share state between instances.

## Timezone Support

The scheduler fully supports IANA timezones with automatic DST handling:

```typescript
// Set timezone on schedule
await scheduler.createSchedule("ny-report", {
  cron: "0 9 * * *",
  timezone: "America/New_York",  // Always 9 AM NY time
});

await scheduler.createSchedule("london-report", {
  cron: "0 9 * * *",
  timezone: "Europe/London",  // Always 9 AM London time
});

await scheduler.createSchedule("utc-report", {
  cron: "0 9 * * *",
  timezone: "UTC",  // Not affected by DST
});
```

## Stale Job Handling

When schedulers restart, they may find old jobs. Control this behavior:

```typescript
const scheduler = new Scheduler({
  scope: s,
  storage,
  staleThreshold: 5 * 60 * 1000,  // 5 minutes
  staleJobBehavior: StaleJobBehavior.SKIP,  // SKIP, FAIL, or RUN
});
```

| Behavior | Description |
|----------|-------------|
| `RUN` (default) | Execute stale jobs anyway |
| `SKIP` | Mark as completed without running |
| `FAIL` | Mark as failed permanently |

## Best Practices

1. **Always use `using`** - For automatic disposal and cleanup:
   ```typescript
   using scheduler = new Scheduler({ storage });
   // Automatically disposed when block exits
   ```
2. **Use persistent storage** for multi-instance deployments
3. **Handle errors in handlers** - Uncaught errors trigger retry
4. **Use job scope** for child operations to ensure cleanup
5. **Set appropriate timeouts** - Prevent stuck jobs
6. **Monitor events** - For observability and alerting
7. **Configure stale handling** - For deployments with downtime
8. **Enable debug logging** in development: `DEBUG=go-go-scope:scheduler*`
9. **Use structured logging** in production for better observability
10. **Set deadlock detection** to catch stuck jobs: `deadlockThreshold: 60000`
11. **Export metrics** for monitoring and alerting
12. **Use job hooks** for cross-cutting concerns (metrics, alerting)
13. **Enable OpenTelemetry tracing** for distributed systems
14. **Profile jobs** periodically to identify performance issues

## Error Handling

### Common Errors

```typescript
// Schedule not found
try {
  await scheduler.triggerSchedule("missing");
} catch (err) {
  // Error: Schedule 'missing' not found
}

// Duplicate schedule
try {
  await scheduler.createSchedule("existing", { cron: "* * * * *" });
  await scheduler.createSchedule("existing", { cron: "* * * * *" });
} catch (err) {
  // Error: Schedule 'existing' already exists
}
```

### Handler Errors

Errors in handlers trigger retry logic:

```typescript
scheduler.onSchedule("risky-task", async (job) => {
  // If this throws, job will be retried (up to maxRetries)
  await flakyOperation();
});
```

### Permanent Failures

After max retries, jobs are marked as failed:

```typescript
scheduler.on("jobFailed", ({ job, error, permanent }) => {
  if (permanent) {
    // Alert on permanent failure
    alertOpsTeam(job.scheduleName, error);
  }
});
```
