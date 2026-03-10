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
- [Classs](#Classs)
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

Parse a cron expression and return the next occurrence @param expression - Cron expression (5 fields: minute hour day month dayOfWeek) @param timezone - Optional IANA timezone (e.g., "America/New_York") @returns CronExpression object for getting next occurrence

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expression` | `string` | - Cron expression (5 fields: minute hour day month dayOfWeek) |
| `timezone` (optional) | `string` | - Optional IANA timezone (e.g., "America/New_York") |

**Returns:** `CronExpression`

CronExpression object for getting next occurrence

**@param:** - Optional IANA timezone (e.g., "America/New_York")

**@returns:** CronExpression object for getting next occurrence

*Source: [cron.ts:72](packages/scheduler/src/cron.ts#L72)*

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

*Source: [cron.ts:142](packages/scheduler/src/cron.ts#L142)*

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

*Source: [cron.ts:197](packages/scheduler/src/cron.ts#L197)*

---

### describeCron

```typescript
function describeCron(expression: string): string
```

Human-readable description of a cron expression

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `expression` | `string` |  |

**Returns:** `string`

*Source: [cron.ts:286](packages/scheduler/src/cron.ts#L286)*

---

### createScheduler

```typescript
function createScheduler<Schedules extends ScheduleDefinitions>(options: SchedulerOptions): Scheduler<Schedules>
```

Create a typed scheduler instance. This is a convenience factory function that creates a Scheduler with typed schedule definitions for better type inference. @example ```typescript const scheduler = createScheduler<{   'send-email': { to: string; subject: string; body: string };   'process-payment': { amount: number; currency: string }; }>({ storage }); // Now you get autocomplete for schedule names and typed payloads! scheduler.onSchedule('send-email', async (job) => {   const { to, subject, body } = job.payload; // Fully typed! }); ```

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

Create web UI server. @param options - Web UI configuration options @param options.port - Port to listen on (e.g., 8080) @param options.host - Host to bind to (e.g., '0.0.0.0') @param options.apiKey - Optional API key for authentication @param options.path - Base path for the UI (default: '/') @param options.storage - Storage backend for schedules and jobs @param options.getScheduleStats - Function to get schedule statistics @param options.createSchedule - Function to create a new schedule @param options.updateSchedule - Function to update an existing schedule @param options.deleteSchedule - Function to delete a schedule @param options.pauseSchedule - Function to pause a schedule @param options.resumeSchedule - Function to resume a schedule @param options.getScheduleJobs - Function to get jobs for a schedule @param options.logger - Optional logger for web UI events @returns HTTP server instance

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `WebUIOptions` | - Web UI configuration options |

**Returns:** `Promise<Server>`

HTTP server instance

**@param:** - Optional logger for web UI events

**@returns:** HTTP server instance

*Source: [web-ui.ts:845](packages/scheduler/src/web-ui.ts#L845)*

---

### stopWebUI

```typescript
function stopWebUI(server: Server): Promise<void>
```

Stop web UI server. @param server - HTTP server instance to stop @returns Promise that resolves when server is closed

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `server` | `Server` | - HTTP server instance to stop |

**Returns:** `Promise<void>`

Promise that resolves when server is closed

**@param:** - HTTP server instance to stop

**@returns:** Promise that resolves when server is closed

*Source: [web-ui.ts:1019](packages/scheduler/src/web-ui.ts#L1019)*

---

## Classs

### RedisJobStorage

```typescript
class RedisJobStorage
```

Redis-based job storage Requires Redis adapter with hash and set support

*Source: [persistence-storage.ts:78](packages/scheduler/src/persistence-storage.ts#L78)*

---

### SQLJobStorage

```typescript
class SQLJobStorage
```

SQL-based job storage (PostgreSQL, MySQL, SQLite)

*Source: [persistence-storage.ts:454](packages/scheduler/src/persistence-storage.ts#L454)*

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

Production-ready distributed job scheduler Uses mandatory Admin + Workers pattern for distributed deployments. **Storage Requirements:** - Storage MUST implement `supportsAutoScheduling()` returning `true` - Storage MUST implement `completeJobAndScheduleNext()` for recurring scheduling - This enables multiple admin instances without leader election complexity Supported storages: InMemoryJobStorage, RedisJobStorage, SQLJobStorage @template Schedules - Record mapping schedule names to their payload types @example ```typescript // Define your schedules with typed payloads type AppSchedules = {   'send-email': { to: string; subject: string; body: string };   'process-payment': { amount: number; currency: string }; }; // Create typed scheduler const scheduler = new Scheduler<AppSchedules>({ storage }); // Register typed handler - autocomplete for schedule names! scheduler.onSchedule('send-email', async (job) => {   // job.payload is fully typed   const { to, subject, body } = job.payload;   await sendEmail({ to, subject, body }); }); // Trigger with typed payload - type checking works! await scheduler.triggerSchedule('send-email', {   to: 'user@example.com',   subject: 'Hello',   body: 'World' }); ```

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

In-memory job storage (single-node deployments, testing)

*Source: [types.ts:353](packages/scheduler/src/types.ts#L353)*

---

### Scheduler

```typescript
class Scheduler<Schedules extends ScheduleDefinitions = Record<string, JobPayload>>
```

Scheduler class with typed schedules @template Schedules - Record mapping schedule names to their payload types @example ```typescript type AppSchedules = {   'send-email': { to: string; subject: string; body: string };   'process-payment': { amount: number; currency: string }; }; const scheduler = new Scheduler<AppSchedules>({ storage }); // Type-safe handler registration scheduler.onSchedule('send-email', async (job) => {   // job.payload is typed as { to: string; subject: string; body: string }   const { to, subject, body } = job.payload; }); // Type-safe trigger await scheduler.triggerSchedule('send-email', {   to: 'user@example.com',   subject: 'Hello',   body: 'World' }); ```

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

*Source: [types.ts:1012](packages/scheduler/src/types.ts#L1012)*

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

*Source: [types.ts:608](packages/scheduler/src/types.ts#L608)*

---

### DeadLetterJob

```typescript
interface DeadLetterJob
```

Dead Letter Queue job - contains additional metadata for failed jobs

*Source: [types.ts:659](packages/scheduler/src/types.ts#L659)*

---

### DeadLetterQueueOptions

```typescript
interface DeadLetterQueueOptions
```

Dead Letter Queue configuration options

*Source: [types.ts:671](packages/scheduler/src/types.ts#L671)*

---

### JobResult

```typescript
interface JobResult
```

Job execution result

*Source: [types.ts:685](packages/scheduler/src/types.ts#L685)*

---

### SchedulerHooks

```typescript
interface SchedulerHooks
```

Job lifecycle hooks

*Source: [types.ts:694](packages/scheduler/src/types.ts#L694)*

---

### SchedulerMetrics

```typescript
interface SchedulerMetrics
```

Scheduler metrics for export

*Source: [types.ts:715](packages/scheduler/src/types.ts#L715)*

---

### MetricsExportOptions

```typescript
interface MetricsExportOptions
```

Metrics export options

*Source: [types.ts:750](packages/scheduler/src/types.ts#L750)*

---

### SchedulerOptions

```typescript
interface SchedulerOptions
```

Scheduler configuration options

*Source: [types.ts:760](packages/scheduler/src/types.ts#L760)*

---

### JobProfile

```typescript
interface JobProfile
```

Job execution profile for detailed timing

*Source: [types.ts:911](packages/scheduler/src/types.ts#L911)*

---

### TriggerOptions

```typescript
interface TriggerOptions
```

Options for triggering a schedule

*Source: [types.ts:967](packages/scheduler/src/types.ts#L967)*

---

### ScheduleJobOptions

```typescript
interface ScheduleJobOptions
```

Options for scheduling a job

*Source: [types.ts:977](packages/scheduler/src/types.ts#L977)*

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

// ============================================================================ // Type-safe schedule definitions // ============================================================================  Helper type to define schedules with typed payloads @example ```typescript type AppSchedules = {   'send-email': { to: string; subject: string; body: string };   'process-payment': { amount: number; currency: string }; }; const scheduler = new Scheduler<AppSchedules>({ storage }); ```

**Examples:**

```typescript
type AppSchedules = {
  'send-email': { to: string; subject: string; body: string };
  'process-payment': { amount: number; currency: string };
};

const scheduler = new Scheduler<AppSchedules>({ storage });
```

*Source: [types.ts:942](packages/scheduler/src/types.ts#L942)*

---

### SchedulePayload

```typescript
type SchedulePayload = Schedules[Name]
```

Helper type to extract the payload type for a specific schedule

*Source: [types.ts:947](packages/scheduler/src/types.ts#L947)*

---

### SchedulesOf

```typescript
type SchedulesOf = T extends Scheduler<infer S> ? S : never
```

Helper type to extract schedule types from a scheduler instance @example ```typescript const scheduler = new Scheduler<AppSchedules>({ storage }); type MySchedules = SchedulesOf<typeof scheduler>; // MySchedules = AppSchedules ```

**Examples:**

```typescript
const scheduler = new Scheduler<AppSchedules>({ storage });
type MySchedules = SchedulesOf<typeof scheduler>;
// MySchedules = AppSchedules
```

*Source: [types.ts:962](packages/scheduler/src/types.ts#L962)*

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

*Source: [persistence-storage.ts:423](packages/scheduler/src/persistence-storage.ts#L423)*

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

// ============================================================================ // Web UI // ============================================================================  Start web UI server

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

Create a schedule for recurring job execution. ⚠️ **Admin only**: This method can only be called by admin instances. Workers must use `onSchedule()` to register handlers for schedules. @param name - Unique schedule name (used as identifier) @param options - Schedule configuration options @param options.cron - Cron expression for recurring execution (e.g., '0 9 * * *' for daily at 9am) @param options.interval - Interval in milliseconds (alternative to cron, e.g., 60000 for 1 minute) @param options.timezone - Timezone for execution (IANA format, e.g., 'America/New_York', 'UTC') @param options.endDate - End date for the schedule - no new jobs after this date @param options.defaultPayload - Default payload for jobs (merged with trigger payload) @param options.max - Maximum retry attempts before marking job as failed (default: 3) @param options.retryDelay - Delay between retries in milliseconds (default: 1000) @param options.timeout - Job timeout in milliseconds (default: 30000) @param options.concurrent - Allow concurrent execution of multiple jobs from this schedule (default: false) @param options.jitter - Random jitter in milliseconds to prevent thundering herd (default: 0) @returns The created schedule @throws Error if schedule already exists or if called by a worker instance

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

Delete a schedule by name. ⚠️ **Admin only**: This method can only be called by admin instances. @param name Schedule name to delete @returns true if deleted, false if not found @throws Error if called by a worker instance

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

List all schedules. @returns Array of all schedules

**Returns:** `Promise<Schedule[]>`

Array of all schedules

**@returns:** Array of all schedules

*Source: [scheduler.ts:666](packages/scheduler/src/scheduler.ts#L666)*

---

### Scheduler.getSchedule

```typescript
Scheduler.getSchedule(name: string): Promise<Schedule | null>
```

Get a schedule by name. @param name Schedule name @returns Schedule or null if not found

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

Update an existing schedule. ⚠️ **Admin only**: This method can only be called by admin instances. @param name - Schedule name to update @param options - Update options (only provided fields are updated) @param options.cron - Cron expression for recurring execution (e.g., '0 9 * * *') @param options.interval - Interval in milliseconds (alternative to cron) @param options.timezone - Timezone for execution (IANA format, e.g., 'America/New_York') @param options.defaultPayload - Default payload for jobs @param options.max - Maximum retry attempts (default: 3) @param options.retryDelay - Delay between retries in milliseconds (default: 1000) @param options.timeout - Job timeout in milliseconds (default: 30000) @param options.concurrent - Allow concurrent execution (default: false) @param options.jitter - Random jitter in milliseconds (default: 0) @returns Updated schedule @throws Error if schedule not found or called by worker

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

Pause a schedule. No new jobs will be created until resumed. ⚠️ **Admin only**: This method can only be called by admin instances. @param name Schedule name @returns Updated schedule

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

Resume a paused schedule. ⚠️ **Admin only**: This method can only be called by admin instances. @param name Schedule name @returns Updated schedule

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

Disable a schedule. Workers will skip disabled schedules. ⚠️ **Admin only**: This method can only be called by admin instances. @param name Schedule name @returns Updated schedule

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

Get statistics for a schedule. @param name Schedule name @returns Schedule statistics

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

Trigger a schedule to run immediately. Creates a job that will execute as soon as a worker picks it up. ⚠️ **Admin only**: This method can only be called by admin instances. @param name - Schedule name (must be a key of Schedules type parameter) @param payload - Optional typed payload override (merged with schedule's default payload) @param options - Optional scheduling options @param options.delay - Delay before running in milliseconds (default: 0 - immediate) @param options.priority - Job priority (higher = runs first, default: 0) @returns The scheduled job result

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

Get all schedules with their statistics. @returns Array of schedule statistics

**Returns:** `Promise<ScheduleStats[]>`

Array of schedule statistics

**@returns:** Array of schedule statistics

*Source: [scheduler.ts:917](packages/scheduler/src/scheduler.ts#L917)*

---

### Scheduler.onSchedule

```typescript
Scheduler.onSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, handler: TypedScheduleHandler<Schedules[Name]>, options?: OnScheduleOptions): void
```

Register a typed handler for a schedule. **Workers use this** to register handlers for schedules they want to process. The handler will be called when jobs for this schedule become available. Schedules can be created before or after handlers are registered. @param name - Name of the schedule to handle (must be a key of Schedules type parameter) @param handler - Handler function with typed payload (receives job and scope) @param options - Optional handler registration options @param options.worker - Execute jobs in worker threads for CPU-intensive tasks (default: false) @example ```typescript // Register handler BEFORE schedule is created scheduler.onSchedule("daily-report", async (job, scope) => {   // job.payload is fully typed based on Schedules type parameter   const { to, subject } = job.payload; }); worker.start(); // Later, admin creates the schedule await admin.createSchedule("daily-report", { cron: "0 9 * * *" }); ```

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

Remove a handler for a schedule. @param scheduleName Name of the schedule to remove handler for @returns true if handler was removed, false if not found

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

Schedule a one-time job (admin only). ⚠️ **Admin only**: Workers execute jobs based on loaded schedules. @param scheduleName - Name of the schedule (must be a key of Schedules type parameter) @param payload - Typed job payload data (default: empty object) @param options - Scheduling options @param options.delay - Delay before running in milliseconds (default: 0 - immediate) @param options.priority - Job priority (higher = runs first, default: 0)

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

Export metrics in various formats. @param options - Export options @param options.format - Export format: 'json', 'prometheus', or 'otel' (default: 'json') @param options.prefix - Prefix for metric names in Prometheus format (default: 'scheduler') @returns Metrics string in the requested format

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

Register a typed handler for a schedule. The handler will be called when jobs for this schedule become available. @param name - Schedule name (must be a key of Schedules) @param handler - Handler function with typed payload

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `handler` | `TypedScheduleHandler<Schedules[Name]>` | - Handler function with typed payload |

**Returns:** `void`

**@param:** - Handler function with typed payload

*Source: [types.ts:1027](packages/scheduler/src/types.ts#L1027)*

---

### Scheduler.triggerSchedule

```typescript
Scheduler.triggerSchedule<Name extends keyof Schedules>(name: Name extends string ? Name : never, payload?: Schedules[Name], options?: ScheduleJobOptions): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>
```

Trigger a schedule to run immediately. Creates a job that will execute as soon as a worker picks it up. @param name - Schedule name (must be a key of Schedules) @param payload - Typed payload for the job @param options - Optional trigger options

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `payload` (optional) | `Schedules[Name]` | - Typed payload for the job |
| `options` (optional) | `ScheduleJobOptions` | - Optional trigger options |

**Returns:** `Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>`

**@param:** - Optional trigger options

*Source: [types.ts:1040](packages/scheduler/src/types.ts#L1040)*

---

### Scheduler.scheduleJob

```typescript
Scheduler.scheduleJob<Name extends keyof Schedules>(scheduleName: Name extends string ? Name : never, payload?: Schedules[Name], options?: ScheduleJobOptions): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>
```

Schedule a one-time job. @param scheduleName - Schedule name (must be a key of Schedules) @param payload - Typed payload for the job @param options - Optional scheduling options

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scheduleName` | `Name extends string ? Name : never` | - Schedule name (must be a key of Schedules) |
| `payload` (optional) | `Schedules[Name]` | - Typed payload for the job |
| `options` (optional) | `ScheduleJobOptions` | - Optional scheduling options |

**Returns:** `Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>`

**@param:** - Optional scheduling options

*Source: [types.ts:1053](packages/scheduler/src/types.ts#L1053)*

---

### Scheduler.createSchedule

```typescript
Scheduler.createSchedule<Name extends string>(name: Name, options: CreateScheduleOptions): Promise<Schedule>
```

Create a schedule for recurring job execution. @param name - Unique schedule name @param options - Schedule configuration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `Name` | - Unique schedule name |
| `options` | `CreateScheduleOptions` | - Schedule configuration |

**Returns:** `Promise<Schedule>`

**@param:** - Schedule configuration

*Source: [types.ts:1065](packages/scheduler/src/types.ts#L1065)*

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

*Source: [types.ts:1073](packages/scheduler/src/types.ts#L1073)*

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

*Source: [types.ts:1078](packages/scheduler/src/types.ts#L1078)*

---

### Scheduler.listSchedules

```typescript
Scheduler.listSchedules(): Promise<Schedule[]>
```

List all schedules.

**Returns:** `Promise<Schedule[]>`

*Source: [types.ts:1083](packages/scheduler/src/types.ts#L1083)*

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

*Source: [types.ts:1088](packages/scheduler/src/types.ts#L1088)*

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

*Source: [types.ts:1093](packages/scheduler/src/types.ts#L1093)*

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

*Source: [types.ts:1101](packages/scheduler/src/types.ts#L1101)*

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

*Source: [types.ts:1106](packages/scheduler/src/types.ts#L1106)*

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

*Source: [types.ts:1111](packages/scheduler/src/types.ts#L1111)*

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

*Source: [types.ts:1116](packages/scheduler/src/types.ts#L1116)*

---

### Scheduler.getAllScheduleStats

```typescript
Scheduler.getAllScheduleStats(): Promise<ScheduleStats[]>
```

Get all schedules with their statistics.

**Returns:** `Promise<ScheduleStats[]>`

*Source: [types.ts:1121](packages/scheduler/src/types.ts#L1121)*

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

*Source: [types.ts:1126](packages/scheduler/src/types.ts#L1126)*

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

*Source: [types.ts:1131](packages/scheduler/src/types.ts#L1131)*

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

*Source: [types.ts:1136](packages/scheduler/src/types.ts#L1136)*

---

### Scheduler.start

```typescript
Scheduler.start(): void
```

Start the scheduler polling loop.

**Returns:** `void`

*Source: [types.ts:1141](packages/scheduler/src/types.ts#L1141)*

---

### Scheduler.stop

```typescript
Scheduler.stop(): Promise<void>
```

Stop the scheduler and cancel all running jobs.

**Returns:** `Promise<void>`

*Source: [types.ts:1146](packages/scheduler/src/types.ts#L1146)*

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

*Source: [types.ts:1151](packages/scheduler/src/types.ts#L1151)*

---

### Scheduler.getWebUIUrl

```typescript
Scheduler.getWebUIUrl(): string | null
```

Get the web UI URL if enabled.

**Returns:** `string | null`

*Source: [types.ts:1161](packages/scheduler/src/types.ts#L1161)*

---

### Scheduler.collectMetrics

```typescript
Scheduler.collectMetrics(): Promise<SchedulerMetrics>
```

Collect current metrics from the scheduler.

**Returns:** `Promise<SchedulerMetrics>`

*Source: [types.ts:1174](packages/scheduler/src/types.ts#L1174)*

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

*Source: [types.ts:1179](packages/scheduler/src/types.ts#L1179)*

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

*Source: [types.ts:1184](packages/scheduler/src/types.ts#L1184)*

---

### Scheduler.getAllJobProfiles

```typescript
Scheduler.getAllJobProfiles(): JobProfile[]
```

Get all job profiles.

**Returns:** `JobProfile[]`

*Source: [types.ts:1189](packages/scheduler/src/types.ts#L1189)*

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

*Source: [types.ts:1194](packages/scheduler/src/types.ts#L1194)*

---

