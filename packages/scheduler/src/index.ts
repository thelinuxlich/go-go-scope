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
 * @example
 * ```typescript
 * import { Scheduler, CronPresets } from 'go-go-scope/scheduler'
 * import { scope } from 'go-go-scope'
 * import { RedisAdapter } from 'go-go-scope/persistence/redis'
 *
 * await using s = scope()
 *
 * const scheduler = new Scheduler({
 *   scope: s,
 *   storage: new RedisJobStorage(redis, redisAdapter),
 *   enableWebUI: true,
 *   webUIPort: 8080
 * })
 *
 * await scheduler.createSchedule('daily-report', {
 *   cron: CronPresets.DAILY,
 *   timezone: 'America/New_York'
 * })
 *
 * scheduler.onSchedule('daily-report', async (job, scope) => {
 *   // Generate report
 * })
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
export { Scheduler } from "./scheduler.js";
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
	type ScheduleHandler,
	type ScheduleJobResult,
	type SchedulerEvents,
	type SchedulerHooks,
	type SchedulerMetrics,
	type SchedulerOptions,
	ScheduleState,
	type ScheduleStats,
	StaleJobBehavior,
	type UpdateScheduleOptions,
} from "./types.js";
export {
	createWebUI,
	stopWebUI,
	type WebUIOptions,
} from "./web-ui.js";

// CLI Tool: npx go-go-scheduler <command>
// TUI Tool: npx go-go-scheduler-tui
