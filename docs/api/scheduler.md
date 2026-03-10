# scheduler API Reference

> Auto-generated documentation for scheduler

## Table of Contents

- [Functions](#Functions)
  - [getDateInTimezone](#getdateintimezone)
  - [convertToTargetTimezone](#converttotargettimezone)
  - [parseCron](#parsecron)
  - [matchesField](#matchesfield)
  - [matchesDayOfWeek](#matchesdayofweek)
  - [describeCron](#describecron)
  - [createScheduler](#createscheduler)
  - [jsonResponse](#jsonresponse)
  - [createWebUIHTML](#createwebuihtml)
  - [parseBody](#parsebody)
  - [createWebUI](#createwebui)
  - [stopWebUI](#stopwebui)
- [Classes](#Classes)
  - [RedisJobStorage](#redisjobstorage)
  - [SQLJobStorage](#sqljobstorage)
  - [SchedulerEventEmitter](#schedulereventemitter)
  - [Scheduler](#scheduler)
  - [InMemoryJobStorage](#inmemoryjobstorage)
  - [Scheduler](#scheduler)
- [Interfaces](#Interfaces)
  - [PersistenceJobStorageOptions](#persistencejobstorageoptions)
  - [JobPayload](#jobpayload)
  - [Job](#job)
  - [Schedule](#schedule)
  - [ScheduleStats](#schedulestats)
  - [UpdateScheduleOptions](#updatescheduleoptions)
  - [OnScheduleOptions](#onscheduleoptions)
  - [ScheduleJobResult](#schedulejobresult)
  - [CreateScheduleOptions](#createscheduleoptions)
  - [CronExpression](#cronexpression)
  - [JobStorage](#jobstorage)
  - [SchedulerEvents](#schedulerevents)
  - [DeadLetterJob](#deadletterjob)
  - [DeadLetterQueueOptions](#deadletterqueueoptions)
  - [JobResult](#jobresult)
  - [SchedulerHooks](#schedulerhooks)
  - [SchedulerMetrics](#schedulermetrics)
  - [MetricsExportOptions](#metricsexportoptions)
  - [SchedulerOptions](#scheduleroptions)
  - [JobProfile](#jobprofile)
  - [TriggerOptions](#triggeroptions)
  - [ScheduleJobOptions](#schedulejoboptions)
  - [WebUIOptions](#webuioptions)
- [Types](#Types)
  - [JobStatus](#jobstatus)
  - [TypedJob](#typedjob)
  - [ScheduleHandler](#schedulehandler)
  - [TypedScheduleHandler](#typedschedulehandler)
  - [ScheduleDefinitions](#scheduledefinitions)
  - [SchedulePayload](#schedulepayload)
  - [SchedulesOf](#schedulesof)
- [Methods](#Methods)
  - [RedisJobStorage.calculateNextRun](#redisjobstorage-calculatenextrun)
  - [Scheduler.startLeaderElection](#scheduler-startleaderelection)
  - [Scheduler.checkLeadership](#scheduler-checkleadership)
  - [Scheduler.startDeadlockDetection](#scheduler-startdeadlockdetection)
  - [Scheduler.checkForDeadlocks](#scheduler-checkfordeadlocks)
  - [Scheduler.startWebUI](#scheduler-startwebui)
  - [Scheduler.getWebUIUrl](#scheduler-getwebuiurl)
  - [Scheduler.start](#scheduler-start)
  - [Scheduler.stop](#scheduler-stop)
  - [Scheduler.getStatus](#scheduler-getstatus)
  - [Scheduler.createSchedule](#scheduler-createschedule)
  - [Scheduler.deleteSchedule](#scheduler-deleteschedule)
  - [Scheduler.listSchedules](#scheduler-listschedules)
  - [Scheduler.getSchedule](#scheduler-getschedule)
  - [Scheduler.updateSchedule](#scheduler-updateschedule)
  - [Scheduler.pauseSchedule](#scheduler-pauseschedule)
  - [Scheduler.resumeSchedule](#scheduler-resumeschedule)
  - [Scheduler.disableSchedule](#scheduler-disableschedule)
  - [Scheduler.getScheduleStats](#scheduler-getschedulestats)
  - [Scheduler.triggerSchedule](#scheduler-triggerschedule)
  - [Scheduler.getAllScheduleStats](#scheduler-getallschedulestats)
  - [Scheduler.onSchedule](#scheduler-onschedule)
  - [Scheduler.offSchedule](#scheduler-offschedule)
  - [Scheduler.scheduleJob](#scheduler-schedulejob)
  - [Scheduler.cancelJob](#scheduler-canceljob)
  - [Scheduler.getJob](#scheduler-getjob)
  - [Scheduler.getJobsByStatus](#scheduler-getjobsbystatus)
  - [Scheduler.checkAndRunJobs](#scheduler-checkandrunjobs)
  - [Scheduler.runJob](#scheduler-runjob)
  - [Scheduler.runWithTimeout](#scheduler-runwithtimeout)
  - [Scheduler.handleJobFailure](#scheduler-handlejobfailure)
  - [Scheduler.scheduleNextOccurrence](#scheduler-schedulenextoccurrence)
  - [Scheduler.addToDLQ](#scheduler-addtodlq)
  - [Scheduler.getDLQJobs](#scheduler-getdlqjobs)
  - [Scheduler.replayFromDLQ](#scheduler-replayfromdlq)
  - [Scheduler.purgeDLQ](#scheduler-purgedlq)
  - [Scheduler.collectMetrics](#scheduler-collectmetrics)
  - [Scheduler.exportMetrics](#scheduler-exportmetrics)
  - [Scheduler.exportMetricsAsPrometheus](#scheduler-exportmetricsasprometheus)
  - [Scheduler.exportMetricsAsOTel](#scheduler-exportmetricsasotel)
  - [Scheduler.getJobProfile](#scheduler-getjobprofile)
  - [Scheduler.getAllJobProfiles](#scheduler-getalljobprofiles)
  - [Scheduler.clearJobProfiles](#scheduler-clearjobprofiles)
  - [Scheduler.onSchedule](#scheduler-onschedule)
  - [Scheduler.triggerSchedule](#scheduler-triggerschedule)
  - [Scheduler.scheduleJob](#scheduler-schedulejob)
  - [Scheduler.createSchedule](#scheduler-createschedule)
  - [Scheduler.offSchedule](#scheduler-offschedule)
  - [Scheduler.deleteSchedule](#scheduler-deleteschedule)
  - [Scheduler.listSchedules](#scheduler-listschedules)
  - [Scheduler.getSchedule](#scheduler-getschedule)
  - [Scheduler.updateSchedule](#scheduler-updateschedule)
  - [Scheduler.pauseSchedule](#scheduler-pauseschedule)
  - [Scheduler.resumeSchedule](#scheduler-resumeschedule)
  - [Scheduler.disableSchedule](#scheduler-disableschedule)
  - [Scheduler.getScheduleStats](#scheduler-getschedulestats)
  - [Scheduler.getAllScheduleStats](#scheduler-getallschedulestats)
  - [Scheduler.cancelJob](#scheduler-canceljob)
  - [Scheduler.getJob](#scheduler-getjob)
  - [Scheduler.getJobsByStatus](#scheduler-getjobsbystatus)
  - [Scheduler.start](#scheduler-start)
  - [Scheduler.stop](#scheduler-stop)
  - [Scheduler.getStatus](#scheduler-getstatus)
  - [Scheduler.getWebUIUrl](#scheduler-getwebuiurl)
  - [Scheduler.collectMetrics](#scheduler-collectmetrics)
  - [Scheduler.exportMetrics](#scheduler-exportmetrics)
  - [Scheduler.getJobProfile](#scheduler-getjobprofile)
  - [Scheduler.getAllJobProfiles](#scheduler-getalljobprofiles)
  - [Scheduler.clearJobProfiles](#scheduler-clearjobprofiles)

## Functions

### getDateInTimezone

```typescript
function getDateInTimezone(date: Date, timezone?: string): Date
```

Get current date in a specific timezone Returns a Date object that represents the time in that timezone

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `date` | `Date` |  |
| `timezone` (optional) | `string` |  |

**Returns:** `Date`

*Source: [cron.ts:12](packages/scheduler/src/cron.ts#L12)*

---

### convertToTargetTimezone

```typescript
function convertToTargetTimezone(localDate: Date, timezone: string): Date
```

Convert a local date back to the target timezone's UTC equivalent

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `localDate` | `Date` |  |
| `timezone` | `string` |  |

**Returns:** `Date`

*Source: [cron.ts:53](packages/scheduler/src/cron.ts#L53)*

---

### parseCron

```typescript
function parseCron(expression: string, timezone?: string): CronExpression
```

Parse a cron expression and return the next occurrence. Supports: `*` (any), `*`/`n` (step), `n` (value), `n-m` (range), `n,m` (list) Day names: sun, mon, tue, wed, thu, fri, sat

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expression` | `string` | - Cron expression (5 fields: minute hour day month dayOfWeek) |
| `timezone` (optional) | `string` | - Optional IANA timezone (e.g., "America/New_York") |

**Returns:** `CronExpression`

CronExpression object for getting next occurrence

**Examples:**

```typescript
import { parseCron } from '@go-go-scope/scheduler';

// Parse a daily at midnight expression
const daily = parseCron('0 0 * * *');
const nextRun = daily.next();
console.log(nextRun); // Date object for next midnight

// Parse weekdays at 9 AM
const workHours = parseCron('0 9 * * 1-5');

// Parse with timezone (America/New_York)
const nySchedule = parseCron('0 9 * * 1-5', 'America/New_York');
const nextRunNY = nySchedule.next();

// Use presets
import { CronPresets } from '@go-go-scope/scheduler';
const hourly = parseCron(CronPresets.EVERY_HOUR);
const weekly = parseCron(CronPresets.WEEKLY);
```

**@param:** - Optional IANA timezone (e.g., "America/New_York")

**@returns:** CronExpression object for getting next occurrence

*Source: [cron.ts:98](packages/scheduler/src/cron.ts#L98)*

---

### matchesField

```typescript
function matchesField(expr: string, value: number, min: number, max: number): boolean
```

Check if a value matches a cron field expression

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expr` | `string` |  |
| `value` | `number` |  |
| `min` | `number` |  |
| `max` | `number` |  |

**Returns:** `boolean`

*Source: [cron.ts:168](packages/scheduler/src/cron.ts#L168)*

---

### matchesDayOfWeek

```typescript
function matchesDayOfWeek(expr: string, value: number): boolean
```

Check if day of week matches Supports both 0-6 (Sun-Sat) and names

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expr` | `string` |  |
| `value` | `number` |  |

**Returns:** `boolean`

*Source: [cron.ts:223](packages/scheduler/src/cron.ts#L223)*

---

### describeCron

```typescript
function describeCron(expression: string): string
```

Human-readable description of a cron expression. Returns preset names for known expressions (e.g., "every 5 minutes"), or the raw cron expression for custom schedules.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expression` | `string` | - Cron expression string |

**Returns:** `string`

Human-readable description

**Examples:**

```typescript
import { describeCron, CronPresets } from '@go-go-scope/scheduler';

// Describe a preset expression
console.log(describeCron(CronPresets.EVERY_5_MINUTES));
// Output: "every 5 minutes"

console.log(describeCron(CronPresets.DAILY));
// Output: "daily"

console.log(describeCron(CronPresets.WEEKDAYS_9AM));
// Output: "weekdays 9am"

// Describe a custom expression
console.log(describeCron('0 30 10 * * 1'));
// Output: "cron: 0 30 10 * * 1"

// Use with parseCron for debugging
const schedule = parseCron('0 0 * * *');
console.log(`Schedule: ${describeCron('0 0 * * *')}`);
console.log(`Next run: ${schedule.next()?.toLocaleString()}`);
```

**@param:** - Cron expression string

**@returns:** Human-readable description

*Source: [cron.ts:342](packages/scheduler/src/cron.ts#L342)*

---

### createScheduler

```typescript
function createScheduler<Schedules extends ScheduleDefinitions>(options: SchedulerOptions): Scheduler<Schedules>
```

Create a typed scheduler instance. This is a convenience factory function that creates a Scheduler with typed schedule definitions for better type inference.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `SchedulerOptions` |  |

**Returns:** `Scheduler<Schedules>`

**Examples:**

```typescript
const scheduler = createScheduler<{
  'send-email': { to: string; subject: string; body: string };
  'process-payment': { amount: number; currency: string };
}>({ storage });

// Now you get autocomplete for schedule names and typed payloads!
scheduler.onSchedule('send-email', async (job) => {
  const { to, subject, body } = job.payload; // Fully typed!
});
```

*Source: [scheduler.ts:1984](packages/scheduler/src/scheduler.ts#L1984)*

---

### jsonResponse

```typescript
function jsonResponse(res: ServerResponse, status: number, data: unknown): void
```

HTTP response helper

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `res` | `ServerResponse` |  |
| `status` | `number` |  |
| `data` | `unknown` |  |

**Returns:** `void`

*Source: [web-ui.ts:64](packages/scheduler/src/web-ui.ts#L64)*

---

### createWebUIHTML

```typescript
function createWebUIHTML(basePath: string): string
```

Create the web UI HTML

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `basePath` | `string` |  |

**Returns:** `string`

*Source: [web-ui.ts:81](packages/scheduler/src/web-ui.ts#L81)*

---

### parseBody

```typescript
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>>
```

Parse request body

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `req` | `IncomingMessage` |  |

**Returns:** `Promise<Record<string, unknown>>`

*Source: [web-ui.ts:811](packages/scheduler/src/web-ui.ts#L811)*

---

### createWebUI

```typescript
function createWebUI(options: WebUIOptions): Promise<Server>
```

Create web UI server for managing scheduler schedules. Provides a web interface and REST API for creating, updating, deleting, and monitoring schedules. Includes a responsive dashboard showing schedule statistics, job status, and execution history. REST API endpoints: - GET /api/schedules - List all schedules - POST /api/schedules - Create a new schedule - DELETE /api/schedules/:name - Delete a schedule - POST /api/schedules/:name/pause - Pause a schedule - POST /api/schedules/:name/resume - Resume a schedule - GET /api/schedules/:name/jobs?limit=20 - Get jobs for a schedule

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `WebUIOptions` | - Web UI configuration options |

**Returns:** `Promise<Server>`

HTTP server instance

**Examples:**

```typescript
import { createWebUI, stopWebUI, InMemoryJobStorage } from '@go-go-scope/scheduler';
import type { Server } from 'node:http';

const storage = new InMemoryJobStorage();

// Create web UI with basic configuration
const server: Server = await createWebUI({
  port: 8080,
  host: '0.0.0.0',
  path: '/',
  storage,
  getScheduleStats: async (name) => {
    // Return schedule statistics
    return {
      name,
      state: 'ACTIVE',
      totalJobs: 10,
      pendingJobs: 2,
      runningJobs: 1,
      completedJobs: 7,
      failedJobs: 0,
      cancelledJobs: 0,
      successRate: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  },
  createSchedule: async (name, options) => {
    // Create schedule in your storage
    const schedule: Schedule = {
      id: crypto.randomUUID(),
      name,
      cron: options.cron,
      interval: options.interval,
      timezone: options.timezone,
      state: ScheduleState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      payload: options.defaultPayload
    };
    await storage.saveSchedule(schedule);
    return schedule;
  },
  updateSchedule: async (name, options) => { return schedule; },
  deleteSchedule: async (name) => { await storage.deleteSchedule(name); },
  pauseSchedule: async (name) => { },
  resumeSchedule: async (name) => { },
  getScheduleJobs: async (name, limit) => {
    const allJobs = await storage.getJobsByStatus('pending');
    return allJobs.filter(j => j.scheduleName === name).slice(0, limit);
  },
  logger: {
    info: (msg, meta) => console.log(`[WebUI] ${msg}`, meta),
    error: (msg, meta) => console.error(`[WebUI] ${msg}`, meta)
  }
});

console.log('Web UI available at http://localhost:8080');

// With API key authentication
const secureServer = await createWebUI({
  port: 8080,
  host: '0.0.0.0',
  apiKey: 'your-secret-api-key',
  // ... other options
});

// Access API with authentication
// curl -H "Authorization: Bearer your-secret-api-key" http://localhost:8080/api/schedules
```

**@param:** - Optional logger for web UI events

**@returns:** HTTP server instance

*Source: [web-ui.ts:930](packages/scheduler/src/web-ui.ts#L930)*

---

### stopWebUI

```typescript
function stopWebUI(server: Server): Promise<void>
```

Stop web UI server gracefully. Closes the HTTP server and waits for all pending connections to close. This should be called during application shutdown to ensure clean termination.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `server` | `Server` | - HTTP server instance returned by createWebUI |

**Returns:** `Promise<void>`

Promise that resolves when server is closed

**Examples:**

```typescript
import { createWebUI, stopWebUI } from '@go-go-scope/scheduler';
import { scope } from 'go-go-scope';

await using s = scope();

// Create and start web UI
const server = await createWebUI({
  port: 8080,
  host: '0.0.0.0',
  path: '/',
  storage,
  getScheduleStats: async (name) => { return stats; },
  createSchedule: async (name, options) => { return schedule; },
  updateSchedule: async (name, options) => { return schedule; },
  deleteSchedule: async (name) => { },
  pauseSchedule: async (name) => { },
  resumeSchedule: async (name) => { },
  getScheduleJobs: async (name, limit) => { return jobs; }
});

// Use in your application...

// Graceful shutdown with structured concurrency
s.onDispose(async () => {
  console.log('Shutting down web UI...');
  await stopWebUI(server);
  console.log('Web UI stopped');
});

// Or stop manually when needed
async function shutdown() {
  await stopWebUI(server);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**@param:** - HTTP server instance returned by createWebUI

**@returns:** Promise that resolves when server is closed

*Source: [web-ui.ts:1148](packages/scheduler/src/web-ui.ts#L1148)*

---

## Classes

### RedisJobStorage

```typescript
class RedisJobStorage
```

Redis-based job storage for distributed scheduling. Requires a Redis client with hash, set, and sorted set operations. Supports Lua scripting for atomic check-and-schedule operations (Redis 6.0+). Use this storage for production deployments with multiple scheduler instances.

**Examples:**

```typescript
import { RedisJobStorage } from '@go-go-scope/scheduler';
import { createRedisAdapter } from '@go-go-scope/persistence-redis';
import Redis from 'ioredis';

// Create Redis client and adapter
const redis = new Redis({ host: 'localhost', port: 6379 });
const lockProvider = createRedisAdapter(redis);

// Create storage with default prefix
const storage = new RedisJobStorage(redis, lockProvider);

// Create storage with custom key prefix
const storage = new RedisJobStorage(redis, lockProvider, {
  keyPrefix: 'myapp:scheduler:'
});

// Use with Scheduler
const scheduler = new Scheduler({
  storage,
  enableWebUI: true,
  webUIPort: 8080
});

await scheduler.createSchedule('cleanup', {
  cron: '0 0 * * *',
  defaultPayload: { maxAge: 86400000 }
});
```

*Source: [persistence-storage.ts:113](packages/scheduler/src/persistence-storage.ts#L113)*

---

### SQLJobStorage

```typescript
class SQLJobStorage
```

SQL-based job storage for distributed scheduling. Supports PostgreSQL, MySQL, and SQLite databases. Uses UPSERT operations for atomic job updates. Use this storage for production deployments where Redis is not available, or when you prefer to use your existing SQL database for job persistence.

**Examples:**

```typescript
import { SQLJobStorage } from '@go-go-scope/scheduler';
import { createPostgresAdapter } from '@go-go-scope/persistence-postgres';
import { Pool } from 'pg';

// PostgreSQL setup
const pool = new Pool({
  host: 'localhost',
  database: 'scheduler',
  user: 'postgres',
  password: 'secret'
});

const db = {
  query: (sql: string, params?: unknown[]) => pool.query(sql, params),
  exec: (sql: string, params?: unknown[]) => pool.query(sql, params).then(() => {})
};

const lockProvider = createPostgresAdapter(pool);
const storage = new SQLJobStorage(db, lockProvider, 'postgres', {
  keyPrefix: 'scheduler_'
});

// MySQL setup
import { createMysqlAdapter } from '@go-go-scope/persistence-mysql';
import mysql from 'mysql2/promise';

const mysqlPool = mysql.createPool({ host: 'localhost', database: 'scheduler' });
const mysqlDb = {
  query: (sql: string, params?: unknown[]) => mysqlPool.execute(sql, params),
  exec: (sql: string, params?: unknown[]) => mysqlPool.execute(sql, params).then(() => {})
};
const mysqlLockProvider = createMysqlAdapter(mysqlPool);
const mysqlStorage = new SQLJobStorage(mysqlDb, mysqlLockProvider, 'mysql');

// SQLite setup (for development)
import { createSqliteAdapter } from '@go-go-scope/persistence-sqlite';
import sqlite3 from 'sqlite3';

const sqliteDb = new sqlite3.Database(':memory:');
// ... wrap with query/exec interface
```

*Source: [persistence-storage.ts:539](packages/scheduler/src/persistence-storage.ts#L539)*

---

### SchedulerEventEmitter

```typescript
class SchedulerEventEmitter
```

Typed event emitter for scheduler events

*Source: [scheduler.ts:65](packages/scheduler/src/scheduler.ts#L65)*

---

### Scheduler

```typescript
class Scheduler<Schedules extends ScheduleDefinitions = Record<string, JobPayload>>
```

Production-ready distributed job scheduler Uses mandatory Admin + Workers pattern for distributed deployments. **Storage Requirements:** - Storage MUST implement `supportsAutoScheduling()` returning `true` - Storage MUST implement `completeJobAndScheduleNext()` for recurring scheduling - This enables multiple admin instances without leader election complexity Supported storages: InMemoryJobStorage, RedisJobStorage, SQLJobStorage

**Examples:**

```typescript
// Define your schedules with typed payloads
type AppSchedules = {
  'send-email': { to: string; subject: string; body: string };
  'process-payment': { amount: number; currency: string };
};

// Create typed scheduler
const scheduler = new Scheduler<AppSchedules>({ storage });

// Register typed handler - autocomplete for schedule names!
scheduler.onSchedule('send-email', async (job) => {
  // job.payload is fully typed
  const { to, subject, body } = job.payload;
  await sendEmail({ to, subject, body });
});

// Trigger with typed payload - type checking works!
await scheduler.triggerSchedule('send-email', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World'
});
```

**@template:** - Record mapping schedule names to their payload types

*Source: [scheduler.ts:149](packages/scheduler/src/scheduler.ts#L149)*

---

### InMemoryJobStorage

```typescript
class InMemoryJobStorage
```

In-memory job storage for single-node deployments and testing. Stores jobs and schedules in JavaScript Maps. Data is lost when the process exits. This is ideal for development, testing, or single-instance deployments where persistence is not required. Features: - In-memory locking (no distributed coordination needed) - Dead Letter Queue (DLQ) support - Fast access for development and testing

**Examples:**

```typescript
import { Scheduler, InMemoryJobStorage } from '@go-go-scope/scheduler';

// Create in-memory storage
const storage = new InMemoryJobStorage();

// Use for testing
const scheduler = new Scheduler({
  storage,
  checkInterval: 1000 // Check for due jobs every second
});

// Create a schedule
await scheduler.createSchedule('test-job', {
  interval: 5000, // Run every 5 seconds
  defaultPayload: { message: 'Hello from scheduler!' }
});

// Register handler
scheduler.onSchedule('test-job', async (job) => {
  console.log('Received payload:', job.payload);
});

scheduler.start();

// For testing with DLQ support
const storage = new InMemoryJobStorage();
const scheduler = new Scheduler({
  storage,
  deadLetterQueue: { enabled: true }
});

// Access DLQ jobs directly
const dlqJobs = await storage.getDLQJobs();
await storage.replayFromDLQ(jobId); // Retry a failed job
```

*Source: [types.ts:400](packages/scheduler/src/types.ts#L400)*

---

### Scheduler

```typescript
class Scheduler<Schedules extends ScheduleDefinitions = Record<string, JobPayload>>
```

Scheduler class with typed schedules

**Examples:**

```typescript
type AppSchedules = {
  'send-email': { to: string; subject: string; body: string };
  'process-payment': { amount: number; currency: string };
};

const scheduler = new Scheduler<AppSchedules>({ storage });

// Type-safe handler registration
scheduler.onSchedule('send-email', async (job) => {
  // job.payload is typed as { to: string; subject: string; body: string }
  const { to, subject, body } = job.payload;
});

// Type-safe trigger
await scheduler.triggerSchedule('send-email', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World'
});
```

**@template:** - Record mapping schedule names to their payload types

*Source: [types.ts:1059](packages/scheduler/src/types.ts#L1059)*

---

## Interfaces

### PersistenceJobStorageOptions

```typescript
interface PersistenceJobStorageOptions
```

Options for persistence-based job storage

*Source: [persistence-storage.ts:61](packages/scheduler/src/persistence-storage.ts#L61)*

---

### JobPayload

```typescript
interface JobPayload
```

Job payload - arbitrary data for job handlers

*Source: [types.ts:29](packages/scheduler/src/types.ts#L29)*

---

### Job

```typescript
interface Job
```

Job definition

*Source: [types.ts:36](packages/scheduler/src/types.ts#L36)*

---

### Schedule

```typescript
interface Schedule
```

Schedule metadata (stored in persistence layer) Note: Handler is NOT stored - workers provide handlers at runtime

*Source: [types.ts:91](packages/scheduler/src/types.ts#L91)*

---

### ScheduleStats

```typescript
interface ScheduleStats
```

Schedule statistics

*Source: [types.ts:140](packages/scheduler/src/types.ts#L140)*

---

### UpdateScheduleOptions

```typescript
interface UpdateScheduleOptions
```

Options for updating a schedule

*Source: [types.ts:163](packages/scheduler/src/types.ts#L163)*

---

### OnScheduleOptions

```typescript
interface OnScheduleOptions
```

Options for onSchedule handler registration

*Source: [types.ts:187](packages/scheduler/src/types.ts#L187)*

---

### ScheduleJobResult

```typescript
interface ScheduleJobResult
```

Result of scheduling a job

*Source: [types.ts:224](packages/scheduler/src/types.ts#L224)*

---

### CreateScheduleOptions

```typescript
interface CreateScheduleOptions
```

Options for creating a schedule (admin only)

*Source: [types.ts:232](packages/scheduler/src/types.ts#L232)*

---

### CronExpression

```typescript
interface CronExpression
```

Cron expression parser result

*Source: [types.ts:270](packages/scheduler/src/types.ts#L270)*

---

### JobStorage

```typescript
interface JobStorage
```

Storage interface for jobs and schedules Implementations: InMemoryJobStorage, RedisJobStorage, SQLJobStorage

*Source: [types.ts:281](packages/scheduler/src/types.ts#L281)*

---

### SchedulerEvents

```typescript
interface SchedulerEvents
```

Scheduler events for monitoring and observability

*Source: [types.ts:655](packages/scheduler/src/types.ts#L655)*

---

### DeadLetterJob

```typescript
interface DeadLetterJob
```

Dead Letter Queue job - contains additional metadata for failed jobs

*Source: [types.ts:706](packages/scheduler/src/types.ts#L706)*

---

### DeadLetterQueueOptions

```typescript
interface DeadLetterQueueOptions
```

Dead Letter Queue configuration options

*Source: [types.ts:718](packages/scheduler/src/types.ts#L718)*

---

### JobResult

```typescript
interface JobResult
```

Job execution result

*Source: [types.ts:732](packages/scheduler/src/types.ts#L732)*

---

### SchedulerHooks

```typescript
interface SchedulerHooks
```

Job lifecycle hooks

*Source: [types.ts:741](packages/scheduler/src/types.ts#L741)*

---

### SchedulerMetrics

```typescript
interface SchedulerMetrics
```

Scheduler metrics for export

*Source: [types.ts:762](packages/scheduler/src/types.ts#L762)*

---

### MetricsExportOptions

```typescript
interface MetricsExportOptions
```

Metrics export options

*Source: [types.ts:797](packages/scheduler/src/types.ts#L797)*

---

### SchedulerOptions

```typescript
interface SchedulerOptions
```

Scheduler configuration options

*Source: [types.ts:807](packages/scheduler/src/types.ts#L807)*

---

### JobProfile

```typescript
interface JobProfile
```

Job execution profile for detailed timing

*Source: [types.ts:958](packages/scheduler/src/types.ts#L958)*

---

### TriggerOptions

```typescript
interface TriggerOptions
```

Options for triggering a schedule

*Source: [types.ts:1014](packages/scheduler/src/types.ts#L1014)*

---

### ScheduleJobOptions

```typescript
interface ScheduleJobOptions
```

Options for scheduling a job

*Source: [types.ts:1024](packages/scheduler/src/types.ts#L1024)*

---

### WebUIOptions

```typescript
interface WebUIOptions
```

Web UI server options

*Source: [web-ui.ts:21](packages/scheduler/src/web-ui.ts#L21)*

---

## Types

### JobStatus

```typescript
type JobStatus = | "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled"
```

Job status lifecycle

*Source: [types.ts:19](packages/scheduler/src/types.ts#L19)*

---

### TypedJob

```typescript
type TypedJob = Omit<Job, "payload"> & {
	/** Job payload data with specific type */
	payload: Payload;
}
```

Typed job definition with specific payload type

*Source: [types.ts:70](packages/scheduler/src/types.ts#L70)*

---

### ScheduleHandler

```typescript
type ScheduleHandler = (
	job: Job,
	scope: Scope<Record<string, unknown>>,
) => Promise<void>
```

Handler function for a schedule (provided by workers at runtime)

*Source: [types.ts:208](packages/scheduler/src/types.ts#L208)*

---

### TypedScheduleHandler

```typescript
type TypedScheduleHandler = (
	job: TypedJob<Payload>,
	scope: Scope<Record<string, unknown>>,
) => Promise<void>
```

Typed handler function for a schedule with specific payload type

*Source: [types.ts:216](packages/scheduler/src/types.ts#L216)*

---

### ScheduleDefinitions

```typescript
type ScheduleDefinitions = Record<string, JobPayload>
```

// ============================================================================ // Type-safe schedule definitions // ============================================================================ Helper type to define schedules with typed payloads

**Examples:**

```typescript
type AppSchedules = {
  'send-email': { to: string; subject: string; body: string };
  'process-payment': { amount: number; currency: string };
};

const scheduler = new Scheduler<AppSchedules>({ storage });
```

*Source: [types.ts:989](packages/scheduler/src/types.ts#L989)*

---

### SchedulePayload

```typescript
type SchedulePayload = Schedules[Name]
```

Helper type to extract the payload type for a specific schedule

*Source: [types.ts:994](packages/scheduler/src/types.ts#L994)*

---

### SchedulesOf

```typescript
type SchedulesOf = T extends Scheduler<infer S> ? S : never
```

Helper type to extract schedule types from a scheduler instance

**Examples:**

```typescript
const scheduler = new Scheduler<AppSchedules>({ storage });
type MySchedules = SchedulesOf<typeof scheduler>;
// MySchedules = AppSchedules
```

*Source: [types.ts:1009](packages/scheduler/src/types.ts#L1009)*

---

## Methods

### RedisJobStorage.calculateNextRun

```typescript
RedisJobStorage.calculateNextRun(schedule: Schedule): Date | null
```

Calculate the next run time for a schedule. Handles cron expressions, intervals, and end dates.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `schedule` | `Schedule` |  |

**Returns:** `Date | null`

*Source: [persistence-storage.ts:458](packages/scheduler/src/persistence-storage.ts#L458)*

---

### Scheduler.startLeaderElection

```typescript
Scheduler.startLeaderElection(): void
```

Start leader election for high availability mode

**Returns:** `void`

*Source: [scheduler.ts:263](packages/scheduler/src/scheduler.ts#L263)*

---

### Scheduler.checkLeadership

```typescript
Scheduler.checkLeadership(_heartbeatInterval: number, _electionTimeout: number): Promise<void>
```

Check and update leadership status

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_heartbeatInterval` | `number` |  |
| `_electionTimeout` | `number` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:279](packages/scheduler/src/scheduler.ts#L279)*

---

### Scheduler.startDeadlockDetection

```typescript
Scheduler.startDeadlockDetection(threshold: number): void
```

Start deadlock detection timer

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `threshold` | `number` |  |

**Returns:** `void`

*Source: [scheduler.ts:301](packages/scheduler/src/scheduler.ts#L301)*

---

### Scheduler.checkForDeadlocks

```typescript
Scheduler.checkForDeadlocks(threshold: number): Promise<void>
```

Check for deadlocked jobs

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `threshold` | `number` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:313](packages/scheduler/src/scheduler.ts#L313)*

---

### Scheduler.startWebUI

```typescript
Scheduler.startWebUI(): Promise<void>
```

// ============================================================================ // Web UI // ============================================================================ Start web UI server

**Returns:** `Promise<void>`

*Source: [scheduler.ts:343](packages/scheduler/src/scheduler.ts#L343)*

---

### Scheduler.getWebUIUrl

```typescript
Scheduler.getWebUIUrl(): string | null
```

Get the web UI URL if enabled

**Returns:** `string | null`

*Source: [scheduler.ts:411](packages/scheduler/src/scheduler.ts#L411)*

---

### Scheduler.start

```typescript
Scheduler.start(): void
```

Start the scheduler polling loop. Workers will start checking for due jobs. Admin can create schedules after starting.

**Returns:** `void`

*Source: [scheduler.ts:436](packages/scheduler/src/scheduler.ts#L436)*

---

### Scheduler.stop

```typescript
Scheduler.stop(): Promise<void>
```

Stop the scheduler and cancel all running jobs

**Returns:** `Promise<void>`

*Source: [scheduler.ts:460](packages/scheduler/src/scheduler.ts#L460)*

---

### Scheduler.getStatus

```typescript
Scheduler.getStatus(): {
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	}
```

Get scheduler status

**Returns:** `{
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	}`

*Source: [scheduler.ts:529](packages/scheduler/src/scheduler.ts#L529)*

---

### Scheduler.createSchedule

```typescript
Scheduler.createSchedule<Name extends string>(name: Name, options: CreateScheduleOptions): Promise<Schedule>
```

Create a schedule for recurring job execution. ⚠️ **Admin only**: This method can only be called by admin instances. Workers must use `onSchedule()` to register handlers for schedules.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name` | - Unique schedule name (used as identifier) |
| `options` | `CreateScheduleOptions` | - Schedule configuration options |

**Returns:** `Promise<Schedule>`

The created schedule

**@param:** - Random jitter in milliseconds to prevent thundering herd (default: 0)

**@returns:** The created schedule

**@throws:** Error if schedule already exists or if called by a worker instance

*Source: [scheduler.ts:564](packages/scheduler/src/scheduler.ts#L564)*

---

### Scheduler.deleteSchedule

```typescript
Scheduler.deleteSchedule(name: string): Promise<boolean>
```

Delete a schedule by name. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name to delete |

**Returns:** `Promise<boolean>`

true if deleted, false if not found

**@param:** Schedule name to delete

**@returns:** true if deleted, false if not found

**@throws:** Error if called by a worker instance

*Source: [scheduler.ts:648](packages/scheduler/src/scheduler.ts#L648)*

---

### Scheduler.listSchedules

```typescript
Scheduler.listSchedules(): Promise<Schedule[]>
```

List all schedules.

**Returns:** `Promise<Schedule[]>`

Array of all schedules

**@returns:** Array of all schedules

*Source: [scheduler.ts:666](packages/scheduler/src/scheduler.ts#L666)*

---

### Scheduler.getSchedule

```typescript
Scheduler.getSchedule(name: string): Promise<Schedule | null>
```

Get a schedule by name.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name |

**Returns:** `Promise<Schedule | null>`

Schedule or null if not found

**@param:** Schedule name

**@returns:** Schedule or null if not found

*Source: [scheduler.ts:676](packages/scheduler/src/scheduler.ts#L676)*

---

### Scheduler.updateSchedule

```typescript
Scheduler.updateSchedule(name: string, options: UpdateScheduleOptions): Promise<Schedule>
```

Update an existing schedule. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | - Schedule name to update |
| `options` | `UpdateScheduleOptions` | - Update options (only provided fields are updated) |

**Returns:** `Promise<Schedule>`

Updated schedule

**@param:** - Random jitter in milliseconds (default: 0)

**@returns:** Updated schedule

**@throws:** Error if schedule not found or called by worker

*Source: [scheduler.ts:699](packages/scheduler/src/scheduler.ts#L699)*

---

### Scheduler.pauseSchedule

```typescript
Scheduler.pauseSchedule(name: string): Promise<Schedule>
```

Pause a schedule. No new jobs will be created until resumed. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name |

**Returns:** `Promise<Schedule>`

Updated schedule

**@param:** Schedule name

**@returns:** Updated schedule

*Source: [scheduler.ts:754](packages/scheduler/src/scheduler.ts#L754)*

---

### Scheduler.resumeSchedule

```typescript
Scheduler.resumeSchedule(name: string): Promise<Schedule>
```

Resume a paused schedule. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name |

**Returns:** `Promise<Schedule>`

Updated schedule

**@param:** Schedule name

**@returns:** Updated schedule

*Source: [scheduler.ts:766](packages/scheduler/src/scheduler.ts#L766)*

---

### Scheduler.disableSchedule

```typescript
Scheduler.disableSchedule(name: string): Promise<Schedule>
```

Disable a schedule. Workers will skip disabled schedules. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name |

**Returns:** `Promise<Schedule>`

Updated schedule

**@param:** Schedule name

**@returns:** Updated schedule

*Source: [scheduler.ts:778](packages/scheduler/src/scheduler.ts#L778)*

---

### Scheduler.getScheduleStats

```typescript
Scheduler.getScheduleStats(name: string): Promise<ScheduleStats>
```

Get statistics for a schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Schedule name |

**Returns:** `Promise<ScheduleStats>`

Schedule statistics

**@param:** Schedule name

**@returns:** Schedule statistics

*Source: [scheduler.ts:814](packages/scheduler/src/scheduler.ts#L814)*

---

### Scheduler.triggerSchedule

```typescript
Scheduler.triggerSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, payload?: Schedules[Name], options?: ScheduleJobOptions): Promise<Result<Error, ScheduleJobResult>>
```

Trigger a schedule to run immediately. Creates a job that will execute as soon as a worker picks it up. ⚠️ **Admin only**: This method can only be called by admin instances.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules type parameter) |
| `payload` (optional) | `Schedules[Name]` | - Optional typed payload override (merged with schedule's default payload) |
| `options` (optional) | `ScheduleJobOptions` | - Optional scheduling options |

**Returns:** `Promise<Result<Error, ScheduleJobResult>>`

The scheduled job result

**@param:** - Job priority (higher = runs first, default: 0)

**@returns:** The scheduled job result

*Source: [scheduler.ts:894](packages/scheduler/src/scheduler.ts#L894)*

---

### Scheduler.getAllScheduleStats

```typescript
Scheduler.getAllScheduleStats(): Promise<ScheduleStats[]>
```

Get all schedules with their statistics.

**Returns:** `Promise<ScheduleStats[]>`

Array of schedule statistics

**@returns:** Array of schedule statistics

*Source: [scheduler.ts:917](packages/scheduler/src/scheduler.ts#L917)*

---

### Scheduler.onSchedule

```typescript
Scheduler.onSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, handler: TypedScheduleHandler<Schedules[Name]>, options?: OnScheduleOptions): void
```

Register a typed handler for a schedule. **Workers use this** to register handlers for schedules they want to process. The handler will be called when jobs for this schedule become available. Schedules can be created before or after handlers are registered.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Name of the schedule to handle (must be a key of Schedules type parameter) |
| `handler` | `TypedScheduleHandler<Schedules[Name]>` | - Handler function with typed payload (receives job and scope) |
| `options` (optional) | `OnScheduleOptions` | - Optional handler registration options |

**Returns:** `void`

**Examples:**

```typescript
// Register handler BEFORE schedule is created
scheduler.onSchedule("daily-report", async (job, scope) => {
  // job.payload is fully typed based on Schedules type parameter
  const { to, subject } = job.payload;
});

worker.start();

// Later, admin creates the schedule
await admin.createSchedule("daily-report", { cron: "0 9 * * *" });
```

**@param:** - Execute jobs in worker threads for CPU-intensive tasks (default: false)

*Source: [scheduler.ts:948](packages/scheduler/src/scheduler.ts#L948)*

---

### Scheduler.offSchedule

```typescript
Scheduler.offSchedule(scheduleName: string): boolean
```

Remove a handler for a schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` | `string` | Name of the schedule to remove handler for |

**Returns:** `boolean`

true if handler was removed, false if not found

**@param:** Name of the schedule to remove handler for

**@returns:** true if handler was removed, false if not found

*Source: [scheduler.ts:971](packages/scheduler/src/scheduler.ts#L971)*

---

### Scheduler.scheduleJob

```typescript
Scheduler.scheduleJob<Name extends keyof Schedules>(scheduleName: Name extends string ? Name : never, payload: Schedules[Name] = {} as Schedules[Name], options: ScheduleJobOptions = {}): Promise<Result<Error, ScheduleJobResult>>
```

Schedule a one-time job (admin only). ⚠️ **Admin only**: Workers execute jobs based on loaded schedules.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` | `Name extends string ? Name : never` | - Name of the schedule (must be a key of Schedules type parameter) |
| `payload` (optional) | `Schedules[Name]` | - Typed job payload data (default: empty object) |
| `options` (optional) | `ScheduleJobOptions` | - Scheduling options |

**Returns:** `Promise<Result<Error, ScheduleJobResult>>`

**@param:** - Job priority (higher = runs first, default: 0)

*Source: [scheduler.ts:998](packages/scheduler/src/scheduler.ts#L998)*

---

### Scheduler.cancelJob

```typescript
Scheduler.cancelJob(jobId: string): Promise<boolean>
```

Cancel a pending job (admin only).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `Promise<boolean>`

*Source: [scheduler.ts:1041](packages/scheduler/src/scheduler.ts#L1041)*

---

### Scheduler.getJob

```typescript
Scheduler.getJob(jobId: string): Promise<Job | null>
```

Get a job by ID

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `Promise<Job | null>`

*Source: [scheduler.ts:1065](packages/scheduler/src/scheduler.ts#L1065)*

---

### Scheduler.getJobsByStatus

```typescript
Scheduler.getJobsByStatus(status: JobStatus): Promise<Job[]>
```

Get jobs by status

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `status` | `JobStatus` |  |

**Returns:** `Promise<Job[]>`

*Source: [scheduler.ts:1072](packages/scheduler/src/scheduler.ts#L1072)*

---

### Scheduler.checkAndRunJobs

```typescript
Scheduler.checkAndRunJobs(): Promise<void>
```

Check for and run due jobs

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1079](packages/scheduler/src/scheduler.ts#L1079)*

---

### Scheduler.runJob

```typescript
Scheduler.runJob(job: Job): Promise<void>
```

Run a single job with retry and error handling, tracing, and profiling

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `job` | `Job` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1131](packages/scheduler/src/scheduler.ts#L1131)*

---

### Scheduler.runWithTimeout

```typescript
Scheduler.runWithTimeout(handler: ScheduleHandler, job: Job, scope: Scope<Record<string, unknown>>, timeout: number): Promise<void>
```

Run job with timeout

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `ScheduleHandler` |  |
| `job` | `Job` |  |
| `scope` | `Scope<Record<string, unknown>>` |  |
| `timeout` | `number` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1487](packages/scheduler/src/scheduler.ts#L1487)*

---

### Scheduler.handleJobFailure

```typescript
Scheduler.handleJobFailure(job: Job, error: Error, schedule: Schedule): Promise<void>
```

Handle job failure with retry logic, logging, and hooks

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `job` | `Job` |  |
| `error` | `Error` |  |
| `schedule` | `Schedule` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1507](packages/scheduler/src/scheduler.ts#L1507)*

---

### Scheduler.scheduleNextOccurrence

```typescript
Scheduler.scheduleNextOccurrence(schedule: Schedule): Promise<void>
```

Schedule next occurrence for recurring schedules

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `schedule` | `Schedule` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1595](packages/scheduler/src/scheduler.ts#L1595)*

---

### Scheduler.addToDLQ

```typescript
Scheduler.addToDLQ(job: Job, error: Error): Promise<void>
```

Add a job to the Dead Letter Queue

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `job` | `Job` |  |
| `error` | `Error` |  |

**Returns:** `Promise<void>`

*Source: [scheduler.ts:1629](packages/scheduler/src/scheduler.ts#L1629)*

---

### Scheduler.getDLQJobs

```typescript
Scheduler.getDLQJobs(scheduleName?: string, options?: { limit?: number; offset?: number }): Promise<import("./types.js").DeadLetterJob[]>
```

Get jobs from the Dead Letter Queue

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` (optional) | `string` |  |
| `options` (optional) | `{ limit?: number; offset?: number }` |  |

**Returns:** `Promise<import("./types.js").DeadLetterJob[]>`

*Source: [scheduler.ts:1666](packages/scheduler/src/scheduler.ts#L1666)*

---

### Scheduler.replayFromDLQ

```typescript
Scheduler.replayFromDLQ(jobId: string): Promise<boolean>
```

Replay a job from the Dead Letter Queue

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `Promise<boolean>`

*Source: [scheduler.ts:1686](packages/scheduler/src/scheduler.ts#L1686)*

---

### Scheduler.purgeDLQ

```typescript
Scheduler.purgeDLQ(scheduleName?: string, maxAge?: number): Promise<number>
```

Purge jobs from the Dead Letter Queue

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` (optional) | `string` |  |
| `maxAge` (optional) | `number` |  |

**Returns:** `Promise<number>`

*Source: [scheduler.ts:1707](packages/scheduler/src/scheduler.ts#L1707)*

---

### Scheduler.collectMetrics

```typescript
Scheduler.collectMetrics(): Promise<SchedulerMetrics>
```

Collect current metrics from the scheduler

**Returns:** `Promise<SchedulerMetrics>`

*Source: [scheduler.ts:1726](packages/scheduler/src/scheduler.ts#L1726)*

---

### Scheduler.exportMetrics

```typescript
Scheduler.exportMetrics(options: MetricsExportOptions = {}): Promise<string>
```

Export metrics in various formats.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `MetricsExportOptions` | - Export options |

**Returns:** `Promise<string>`

Metrics string in the requested format

**@param:** - Prefix for metric names in Prometheus format (default: 'scheduler')

**@returns:** Metrics string in the requested format

*Source: [scheduler.ts:1793](packages/scheduler/src/scheduler.ts#L1793)*

---

### Scheduler.exportMetricsAsPrometheus

```typescript
Scheduler.exportMetricsAsPrometheus(metrics: SchedulerMetrics, prefix: string): string
```

Export metrics in Prometheus format

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `metrics` | `SchedulerMetrics` |  |
| `prefix` | `string` |  |

**Returns:** `string`

*Source: [scheduler.ts:1811](packages/scheduler/src/scheduler.ts#L1811)*

---

### Scheduler.exportMetricsAsOTel

```typescript
Scheduler.exportMetricsAsOTel(metrics: SchedulerMetrics): string
```

Export metrics in OpenTelemetry format (JSON)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `metrics` | `SchedulerMetrics` |  |

**Returns:** `string`

*Source: [scheduler.ts:1863](packages/scheduler/src/scheduler.ts#L1863)*

---

### Scheduler.getJobProfile

```typescript
Scheduler.getJobProfile(jobId: string): JobProfile | undefined
```

Get job profile for detailed execution analysis

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `JobProfile | undefined`

*Source: [scheduler.ts:1937](packages/scheduler/src/scheduler.ts#L1937)*

---

### Scheduler.getAllJobProfiles

```typescript
Scheduler.getAllJobProfiles(): JobProfile[]
```

Get all job profiles

**Returns:** `JobProfile[]`

*Source: [scheduler.ts:1944](packages/scheduler/src/scheduler.ts#L1944)*

---

### Scheduler.clearJobProfiles

```typescript
Scheduler.clearJobProfiles(olderThanMs?: number): void
```

Clear old job profiles (call periodically to prevent memory growth)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `olderThanMs` (optional) | `number` |  |

**Returns:** `void`

*Source: [scheduler.ts:1951](packages/scheduler/src/scheduler.ts#L1951)*

---

### Scheduler.onSchedule

```typescript
Scheduler.onSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, handler: TypedScheduleHandler<Schedules[Name]>): void
```

Register a typed handler for a schedule. The handler will be called when jobs for this schedule become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `handler` | `TypedScheduleHandler<Schedules[Name]>` | - Handler function with typed payload |

**Returns:** `void`

**@param:** - Handler function with typed payload

*Source: [types.ts:1074](packages/scheduler/src/types.ts#L1074)*

---

### Scheduler.triggerSchedule

```typescript
Scheduler.triggerSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, payload?: Schedules[Name], options?: ScheduleJobOptions): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>
```

Trigger a schedule to run immediately. Creates a job that will execute as soon as a worker picks it up.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `payload` (optional) | `Schedules[Name]` | - Typed payload for the job |
| `options` (optional) | `ScheduleJobOptions` | - Optional trigger options |

**Returns:** `Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>`

**@param:** - Optional trigger options

*Source: [types.ts:1087](packages/scheduler/src/types.ts#L1087)*

---

### Scheduler.scheduleJob

```typescript
Scheduler.scheduleJob<Name extends keyof Schedules>(scheduleName: Name extends string ? Name : never, payload?: Schedules[Name], options?: ScheduleJobOptions): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>
```

Schedule a one-time job.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `payload` (optional) | `Schedules[Name]` | - Typed payload for the job |
| `options` (optional) | `ScheduleJobOptions` | - Optional scheduling options |

**Returns:** `Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>`

**@param:** - Optional scheduling options

*Source: [types.ts:1100](packages/scheduler/src/types.ts#L1100)*

---

### Scheduler.createSchedule

```typescript
Scheduler.createSchedule<Name extends string>(name: Name, options: CreateScheduleOptions): Promise<Schedule>
```

Create a schedule for recurring job execution.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name` | - Unique schedule name |
| `options` | `CreateScheduleOptions` | - Schedule configuration |

**Returns:** `Promise<Schedule>`

**@param:** - Schedule configuration

*Source: [types.ts:1112](packages/scheduler/src/types.ts#L1112)*

---

### Scheduler.offSchedule

```typescript
Scheduler.offSchedule(name: string): boolean
```

Remove a handler for a schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `boolean`

*Source: [types.ts:1120](packages/scheduler/src/types.ts#L1120)*

---

### Scheduler.deleteSchedule

```typescript
Scheduler.deleteSchedule(name: string): Promise<boolean>
```

Delete a schedule by name.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<boolean>`

*Source: [types.ts:1125](packages/scheduler/src/types.ts#L1125)*

---

### Scheduler.listSchedules

```typescript
Scheduler.listSchedules(): Promise<Schedule[]>
```

List all schedules.

**Returns:** `Promise<Schedule[]>`

*Source: [types.ts:1130](packages/scheduler/src/types.ts#L1130)*

---

### Scheduler.getSchedule

```typescript
Scheduler.getSchedule(name: string): Promise<Schedule | null>
```

Get a schedule by name.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<Schedule | null>`

*Source: [types.ts:1135](packages/scheduler/src/types.ts#L1135)*

---

### Scheduler.updateSchedule

```typescript
Scheduler.updateSchedule(name: string, options: UpdateScheduleOptions): Promise<Schedule>
```

Update an existing schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `options` | `UpdateScheduleOptions` |  |

**Returns:** `Promise<Schedule>`

*Source: [types.ts:1140](packages/scheduler/src/types.ts#L1140)*

---

### Scheduler.pauseSchedule

```typescript
Scheduler.pauseSchedule(name: string): Promise<Schedule>
```

Pause a schedule. No new jobs will be created until resumed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<Schedule>`

*Source: [types.ts:1148](packages/scheduler/src/types.ts#L1148)*

---

### Scheduler.resumeSchedule

```typescript
Scheduler.resumeSchedule(name: string): Promise<Schedule>
```

Resume a paused schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<Schedule>`

*Source: [types.ts:1153](packages/scheduler/src/types.ts#L1153)*

---

### Scheduler.disableSchedule

```typescript
Scheduler.disableSchedule(name: string): Promise<Schedule>
```

Disable a schedule. Workers will skip disabled schedules.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<Schedule>`

*Source: [types.ts:1158](packages/scheduler/src/types.ts#L1158)*

---

### Scheduler.getScheduleStats

```typescript
Scheduler.getScheduleStats(name: string): Promise<ScheduleStats>
```

Get statistics for a schedule.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `Promise<ScheduleStats>`

*Source: [types.ts:1163](packages/scheduler/src/types.ts#L1163)*

---

### Scheduler.getAllScheduleStats

```typescript
Scheduler.getAllScheduleStats(): Promise<ScheduleStats[]>
```

Get all schedules with their statistics.

**Returns:** `Promise<ScheduleStats[]>`

*Source: [types.ts:1168](packages/scheduler/src/types.ts#L1168)*

---

### Scheduler.cancelJob

```typescript
Scheduler.cancelJob(jobId: string): Promise<boolean>
```

Cancel a pending job.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `Promise<boolean>`

*Source: [types.ts:1173](packages/scheduler/src/types.ts#L1173)*

---

### Scheduler.getJob

```typescript
Scheduler.getJob(jobId: string): Promise<Job | null>
```

Get a job by ID.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `Promise<Job | null>`

*Source: [types.ts:1178](packages/scheduler/src/types.ts#L1178)*

---

### Scheduler.getJobsByStatus

```typescript
Scheduler.getJobsByStatus(status: JobStatus): Promise<Job[]>
```

Get jobs by status.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `status` | `JobStatus` |  |

**Returns:** `Promise<Job[]>`

*Source: [types.ts:1183](packages/scheduler/src/types.ts#L1183)*

---

### Scheduler.start

```typescript
Scheduler.start(): void
```

Start the scheduler polling loop.

**Returns:** `void`

*Source: [types.ts:1188](packages/scheduler/src/types.ts#L1188)*

---

### Scheduler.stop

```typescript
Scheduler.stop(): Promise<void>
```

Stop the scheduler and cancel all running jobs.

**Returns:** `Promise<void>`

*Source: [types.ts:1193](packages/scheduler/src/types.ts#L1193)*

---

### Scheduler.getStatus

```typescript
Scheduler.getStatus(): {
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	}
```

Get scheduler status.

**Returns:** `{
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	}`

*Source: [types.ts:1198](packages/scheduler/src/types.ts#L1198)*

---

### Scheduler.getWebUIUrl

```typescript
Scheduler.getWebUIUrl(): string | null
```

Get the web UI URL if enabled.

**Returns:** `string | null`

*Source: [types.ts:1208](packages/scheduler/src/types.ts#L1208)*

---

### Scheduler.collectMetrics

```typescript
Scheduler.collectMetrics(): Promise<SchedulerMetrics>
```

Collect current metrics from the scheduler.

**Returns:** `Promise<SchedulerMetrics>`

*Source: [types.ts:1221](packages/scheduler/src/types.ts#L1221)*

---

### Scheduler.exportMetrics

```typescript
Scheduler.exportMetrics(options?: MetricsExportOptions): Promise<string>
```

Export metrics in various formats.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `MetricsExportOptions` |  |

**Returns:** `Promise<string>`

*Source: [types.ts:1226](packages/scheduler/src/types.ts#L1226)*

---

### Scheduler.getJobProfile

```typescript
Scheduler.getJobProfile(jobId: string): JobProfile | undefined
```

Get job profile for detailed execution analysis.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `jobId` | `string` |  |

**Returns:** `JobProfile | undefined`

*Source: [types.ts:1231](packages/scheduler/src/types.ts#L1231)*

---

### Scheduler.getAllJobProfiles

```typescript
Scheduler.getAllJobProfiles(): JobProfile[]
```

Get all job profiles.

**Returns:** `JobProfile[]`

*Source: [types.ts:1236](packages/scheduler/src/types.ts#L1236)*

---

### Scheduler.clearJobProfiles

```typescript
Scheduler.clearJobProfiles(olderThanMs?: number): void
```

Clear old job profiles.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `olderThanMs` (optional) | `number` |  |

**Returns:** `void`

*Source: [types.ts:1241](packages/scheduler/src/types.ts#L1241)*

---

