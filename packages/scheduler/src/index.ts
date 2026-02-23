/**
 * Scheduler module for go-go-scope
 * 
 * **Architecture: Admin + Workers Pattern**
 * 
 * The scheduler uses a mandatory admin + workers architecture:
 * 
 * 1. **Admin Instance**: Creates and manages schedules
 *    - Calls `createSchedule()` to define recurring jobs
 *    - Stores schedule metadata in persistent storage
 *    - Only one admin should typically run at a time
 * 
 * 2. **Worker Instances**: Load schedules and execute jobs
 *    - Call `loadSchedules()` to get schedule definitions
 *    - Provide handler functions for each schedule
 *    - Multiple workers can run for high availability
 *    - Distributed locking prevents duplicate execution
 * 
 * @example
 * ```typescript
 * import { Scheduler, SchedulerRole, CronPresets } from 'go-go-scope/scheduler'
 * import { scope } from 'go-go-scope'
 * import { RedisAdapter } from 'go-go-scope/persistence/redis'
 * 
 * await using s = scope()
 * 
 * // Admin: Create schedules
 * const admin = new Scheduler({
 *   role: SchedulerRole.ADMIN,
 *   scope: s,
 *   storage: new RedisJobStorage(redis, redisAdapter)
 * })
 * 
 * await admin.createSchedule('daily-report', {
 *   cron: CronPresets.DAILY,
 *   timezone: 'America/New_York'
 * })
 * 
 * // Worker: Load and execute
 * const worker = new Scheduler({
 *   role: SchedulerRole.WORKER,
 *   scope: s,
 *   storage: new RedisJobStorage(redis, redisAdapter)
 * })
 * 
 * await worker.loadSchedules({
 *   handlerFactory: (name, schedule) => {
 *     if (name === 'daily-report') {
 *       return async (job, scope) => {
 *         // Generate report
 *       }
 *     }
 *     return null
 *   }
 * })
 * 
 * worker.start()
 * ```
 */

export { Scheduler, SchedulerRole } from "./scheduler.js";
export { parseCron, CronPresets, describeCron } from "./cron.js";
export {
  InMemoryJobStorage,
  ScheduleState,
  StaleJobBehavior,
  SCHEDULER_VERSION,
  type Job,
  type JobStatus,
  type JobPayload,
  type JobResult,
  type Schedule,
  type ScheduleStats,
  type ScheduleHandler,
  type SchedulerOptions,
  type LoadSchedulesOptions,
  type CreateScheduleOptions,
  type UpdateScheduleOptions,
  type JobStorage,
  type SchedulerEvents,
  type ScheduleJobResult,
  type CronExpression,
  type SchedulerHooks,
  type SchedulerMetrics,
  type MetricsExportOptions,
  type JobProfile,
} from "./types.js";
export {
  RedisJobStorage,
  SQLJobStorage,
  type PersistenceJobStorageOptions,
} from "./persistence-storage.js";

// CLI Tool: npx go-go-scheduler <command>
// TUI Tool: npx go-go-scheduler-tui
