/**
 * Scheduler module for go-go-scope
 *
 * **Architecture: Admin + Workers Pattern with Database-Driven Scheduling**
 *
 * The scheduler uses a mandatory admin + workers architecture with automatic
 * recurring scheduling handled by the storage layer:
 *
 * 1. **Admin Instance**: Creates and manages schedules
 *    - Calls `createSchedule()` to define recurring jobs
 *    - Stores schedule metadata in persistent storage
 *    - Multiple admins can run simultaneously (HA without leader election)
 *    - Optional: Web UI for schedule management (`enableWebUI: true`)
 *
 * 2. **Worker Instances**: Load schedules and execute jobs
 *    - Call `loadSchedules()` to get schedule definitions
 *    - Provide handler functions for each schedule
 *    - Multiple workers can run for high availability
 *    - Distributed locking prevents duplicate execution
 *    - Automatically schedules next occurrence via storage layer
 *
 * **Storage Requirements:**
 * - Storage MUST support `supportsAutoScheduling()` returning `true`
 * - Storage MUST implement `completeJobAndScheduleNext()` for recurring scheduling
 * - Built-in implementations: `InMemoryJobStorage`, `RedisJobStorage`, `SQLJobStorage`
 *
 * **Web UI (Admin Only):**
 * Enable with `enableWebUI: true` to serve a management interface at `webUIPort` (default: 8080).
 * Access via `getWebUIUrl()` after starting the scheduler.
 *
 * **Type-Safe Schedules:**
 * The scheduler supports typed payloads for compile-time safety:
 *
 * @example
 * ```typescript
 * import { Scheduler, createScheduler } from '@go-go-scope/scheduler'
 * import { scope } from 'go-go-scope'
 * import { RedisAdapter } from 'go-go-scope/persistence/redis'
 *
 * // Define your schedules with typed payloads
 * type AppSchedules = {
 *   'send-email': { to: string; subject: string; body: string };
 *   'process-payment': { amount: number; currency: string };
 *   'cleanup-temp-files': { maxAge: number };
 * };
 *
 * await using s = scope()
 *
 * // Create typed scheduler using generic parameter
 * const scheduler = new Scheduler<AppSchedules>({
 *   scope: s,
 *   storage: new RedisJobStorage(redis, redisAdapter),
 *   enableWebUI: true,
 *   webUIPort: 8080
 * })
 *
 * // Or use the createScheduler factory function
 * const scheduler2 = createScheduler<AppSchedules>({
 *   scope: s,
 *   storage: new RedisJobStorage(redis, redisAdapter),
 * })
 *
 * // Autocomplete works for schedule names!
 * scheduler.onSchedule('send-email', async (job) => {
 *   // job.payload is fully typed as { to: string; subject: string; body: string }
 *   const { to, subject, body } = job.payload;
 *   await sendEmail({ to, subject, body });
 * });
 *
 * // Trigger with typed payload - type checking works!
 * await scheduler.triggerSchedule('send-email', {
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'World'
 * });
 *
 * scheduler.start()
 *
 * console.log('Web UI:', scheduler.getWebUIUrl()) // http://localhost:8080/
 * ```
 */

export { CronPresets, describeCron, parseCron } from "./cron.js";
export {
	type PersistenceJobStorageOptions,
	RedisJobStorage,
	SQLJobStorage,
} from "./persistence-storage.js";
export { createScheduler, Scheduler } from "./scheduler.js";
export {
	type CreateScheduleOptions,
	type CronExpression,
	InMemoryJobStorage,
	type Job,
	type JobPayload,
	type JobProfile,
	type JobResult,
	type JobStatus,
	type JobStorage,
	type MetricsExportOptions,
	SCHEDULER_VERSION,
	type Schedule,
	type ScheduleDefinitions,
	type ScheduleHandler,
	type ScheduleJobOptions,
	type ScheduleJobResult,
	type SchedulePayload,
	type SchedulerEvents,
	type SchedulerHooks,
	type SchedulerMetrics,
	type SchedulerOptions,
	ScheduleState,
	type ScheduleStats,
	type SchedulesOf,
	StaleJobBehavior,
	type TriggerOptions,
	type TypedJob,
	type TypedScheduleHandler,
	type UpdateScheduleOptions,
} from "./types.js";
export {
	createWebUI,
	stopWebUI,
	type WebUIOptions,
} from "./web-ui.js";

// CLI Tool: npx go-go-scheduler <command>
// TUI Tool: npx go-go-scheduler-tui
