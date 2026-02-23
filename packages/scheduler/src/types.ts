/**
 * Type definitions for the go-go-scope scheduler
 * 
 * The scheduler uses a mandatory admin + workers pattern:
 * - Admin instance: Creates and manages schedules
 * - Worker instances: Load schedules from storage and execute jobs
 */

import type { Scope } from "go-go-scope";

/**
 * Scheduler version
 */
export const SCHEDULER_VERSION = "2.0.0";

/**
 * Job status lifecycle
 */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Scheduler role - admin creates schedules, workers execute them
 */
export enum SchedulerRole {
  /** Admin instance creates and manages schedules */
  ADMIN = "admin",
  /** Worker instances load schedules and execute jobs */
  WORKER = "worker",
}

/**
 * Job payload - arbitrary data for job handlers
 */
export interface JobPayload {
  [key: string]: unknown;
}

/**
 * Job definition
 */
export interface Job {
  /** Unique job ID */
  id: string;
  /** Reference to schedule that created this job */
  scheduleId: string;
  /** Schedule name */
  scheduleName: string;
  /** Job payload data */
  payload: JobPayload;
  /** Current status */
  status: JobStatus;
  /** Priority (higher = runs first) */
  priority: number;
  /** When job was created */
  createdAt: Date;
  /** When job should run (undefined = immediate) */
  runAt?: Date;
  /** When job was last executed */
  lastExecutedAt?: Date;
  /** When job completed/failed */
  completedAt?: Date;
  /** Lock expiration time (distributed locking) */
  lockExpiresAt?: Date;
  /** Current retry count */
  retryCount: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Schedule state
 */
export enum ScheduleState {
  /** Schedule is active and creating jobs */
  ACTIVE = "active",
  /** Schedule is paused, no new jobs will be created */
  PAUSED = "paused",
  /** Schedule is disabled, will be skipped by workers */
  DISABLED = "disabled",
}

/**
 * Schedule metadata (stored in persistence layer)
 * Note: Handler is NOT stored - workers provide handlers at runtime
 */
export interface Schedule {
  /** Unique schedule ID */
  id: string;
  /** Schedule name (unique) */
  name: string;
  /** Cron expression (e.g., "0 * * * *") */
  cron?: string;
  /** Interval in milliseconds (alternative to cron) */
  interval?: number;
  /** Timezone for cron execution (IANA format, e.g., "America/New_York") */
  timezone?: string;
  /** Default payload for jobs */
  payload?: JobPayload;
  /** Current state */
  state: ScheduleState;
  /** When schedule was created */
  createdAt: Date;
  /** When schedule was last updated */
  updatedAt: Date;
  /** Last run time */
  lastRunAt?: Date;
  /** Next scheduled run time */
  nextRunAt?: Date;
  /** Total jobs created */
  totalJobs?: number;
  /** Successful job count */
  successCount?: number;
  /** Failed job count */
  failureCount?: number;
  /** Execution options */
  options?: {
    /** Maximum concurrent executions (default: 1) */
    concurrent?: boolean;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Delay between retries in ms (default: 1000) */
    retryDelay?: number;
    /** Job timeout in ms (default: 30000) */
    timeout?: number;
    /** Random jitter in ms to prevent thundering herd (default: 0) */
    jitter?: number;
  };
}

/**
 * Schedule statistics
 */
export interface ScheduleStats {
  name: string;
  state: ScheduleState;
  cron?: string;
  interval?: number;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  successRate: number; // 0-100
  averageDuration?: number; // milliseconds
}

/**
 * Options for updating a schedule
 */
export interface UpdateScheduleOptions {
  cron?: string;
  interval?: number;
  timezone?: string;
  defaultPayload?: JobPayload;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  concurrent?: boolean;
  jitter?: number;
}

/**
 * Handler function for a schedule (provided by workers at runtime)
 */
export type ScheduleHandler = (job: Job, scope: Scope) => Promise<void>;

/**
 * Result of scheduling a job
 */
export interface ScheduleJobResult {
  jobId: string;
  runAt?: Date;
}

/**
 * Options for creating a schedule (admin only)
 */
export interface CreateScheduleOptions {
  /** Cron expression for recurring execution */
  cron?: string;
  /** Interval in milliseconds (alternative to cron) */
  interval?: number;
  /** Timezone for execution */
  timezone?: string;
  /** Default payload for jobs */
  defaultPayload?: JobPayload;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Job timeout in ms (default: 30000) */
  timeout?: number;
  /** Allow concurrent execution (default: false) */
  concurrent?: boolean;
  /** Random jitter in ms (default: 0) */
  jitter?: number;
}

/**
 * Stale job behavior when a job is too old
 */
export enum StaleJobBehavior {
  /** Run stale jobs anyway (default) */
  RUN = "run",
  /** Skip stale jobs (mark as completed without running) */
  SKIP = "skip",
  /** Fail stale jobs permanently */
  FAIL = "fail",
}

/**
 * Cron expression parser result
 */
export interface CronExpression {
  /** Optional IANA timezone for the cron expression */
  timezone?: string;
  /** Get the next occurrence of this cron expression */
  next(from?: Date): Date | null;
}

/**
 * Storage interface for jobs and schedules
 * Implementations: InMemoryJobStorage, RedisJobStorage, SQLJobStorage
 */
export interface JobStorage {
  /** Save or update a job */
  saveJob(job: Job): Promise<void>;
  /** Get job by ID */
  getJob(id: string): Promise<Job | null>;
  /** Get jobs by status */
  getJobsByStatus(status: JobStatus): Promise<Job[]>;
  /** Get pending jobs that should run by given time */
  getDueJobs(before: Date): Promise<Job[]>;
  /** Delete a job */
  deleteJob(id: string): Promise<void>;

  /** Save or update a schedule */
  saveSchedule(schedule: Schedule): Promise<void>;
  /** Get schedule by name */
  getSchedule(name: string): Promise<Schedule | null>;
  /** Get all schedules */
  getSchedules(): Promise<Schedule[]>;
  /** Delete a schedule */
  deleteSchedule(name: string): Promise<void>;

  /** Acquire lock for job execution (distributed locking) */
  acquireJobLock?(jobId: string, instanceId: string, ttl: number): Promise<boolean>;
  /** Release lock for job execution */
  releaseJobLock?(jobId: string, instanceId: string): Promise<void>;
  /** Extend lock TTL */
  extendJobLock?(jobId: string, instanceId: string, ttl: number): Promise<boolean>;
}

/**
 * In-memory job storage (single-node deployments, testing)
 */
export class InMemoryJobStorage implements JobStorage {
  private jobs = new Map<string, Job>();
  private schedules = new Map<string, Schedule>();

  async saveJob(job: Job): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async getJob(id: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async getJobsByStatus(status: JobStatus): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.status === status)
      .map(j => ({ ...j }));
  }

  async getDueJobs(before: Date): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.status === "pending" && (!j.runAt || j.runAt <= before))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(j => ({ ...j }));
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async saveSchedule(schedule: Schedule): Promise<void> {
    this.schedules.set(schedule.name, { ...schedule });
  }

  async getSchedule(name: string): Promise<Schedule | null> {
    const schedule = this.schedules.get(name);
    return schedule ? { ...schedule } : null;
  }

  async getSchedules(): Promise<Schedule[]> {
    return Array.from(this.schedules.values()).map(s => ({ ...s }));
  }

  async deleteSchedule(name: string): Promise<void> {
    this.schedules.delete(name);
  }

  // In-memory locking (no distributed coordination needed)
  private locks = new Map<string, { instanceId: string; expiresAt: number }>();

  async acquireJobLock(jobId: string, instanceId: string, ttl: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(jobId);
    
    if (existing && existing.expiresAt > now) {
      return false; // Lock held by another instance
    }
    
    this.locks.set(jobId, { instanceId, expiresAt: now + ttl });
    return true;
  }

  async releaseJobLock(jobId: string, instanceId: string): Promise<void> {
    const existing = this.locks.get(jobId);
    if (existing && existing.instanceId === instanceId) {
      this.locks.delete(jobId);
    }
  }

  async extendJobLock(jobId: string, instanceId: string, ttl: number): Promise<boolean> {
    const existing = this.locks.get(jobId);
    if (existing && existing.instanceId === instanceId) {
      existing.expiresAt = Date.now() + ttl;
      return true;
    }
    return false;
  }
}

/**
 * Scheduler events for monitoring and observability
 */
export interface SchedulerEvents {
  /** Emitted when scheduler starts */
  started: (event: { instanceId: string; role: SchedulerRole }) => void;
  /** Emitted when scheduler stops */
  stopped: (event: { instanceId: string; role: SchedulerRole }) => void;
  /** Emitted when a schedule is created */
  scheduleCreated: (event: { schedule: Schedule }) => void;
  /** Emitted when a schedule is updated */
  scheduleUpdated: (event: { schedule: Schedule }) => void;
  /** Emitted when a schedule's state changes (pause/resume/disable) */
  scheduleStateChanged: (event: { schedule: Schedule; state: ScheduleState }) => void;
  /** Emitted when a schedule is deleted */
  scheduleDeleted: (event: { scheduleName: string }) => void;
  /** Emitted when schedules are loaded from storage */
  schedulesLoaded: (event: { count: number; names: string[] }) => void;
  /** Emitted when a job is scheduled */
  jobScheduled: (event: { job: Job }) => void;
  /** Emitted when a job starts execution */
  jobStarted: (event: { job: Job; instanceId: string }) => void;
  /** Emitted when a job completes successfully */
  jobCompleted: (event: { job: Job; duration: number }) => void;
  /** Emitted when a job fails (may retry) */
  jobFailed: (event: { job: Job; error: Error; permanent: boolean }) => void;
  /** Emitted when a job is scheduled for retry */
  jobRetryScheduled: (event: { job: Job; error: Error; retryDelay: number }) => void;
  /** Emitted when a job is cancelled */
  jobCancelled: (event: { job: Job }) => void;
  /** Emitted when a stale job is skipped (staleJobBehavior: SKIP) */
  jobSkipped: (event: { job: Job; reason: "stale"; staleness: number }) => void;
}

/**
 * Job execution result
 */
export interface JobResult {
  success: boolean;
  duration: number;
  error?: Error;
}

/**
 * Job lifecycle hooks
 */
export interface SchedulerHooks {
  /** Called before a job starts executing */
  beforeJob?: (job: Job, schedule: Schedule) => void | Promise<void>;
  /** Called after a job completes (success or failure) */
  afterJob?: (job: Job, schedule: Schedule, result: JobResult) => void | Promise<void>;
  /** Called when a job fails (including retries) */
  onJobError?: (job: Job, schedule: Schedule, error: Error, willRetry: boolean) => void | Promise<void>;
}

/**
 * Scheduler metrics for export
 */
export interface SchedulerMetrics {
  /** Scheduler instance ID */
  instanceId: string;
  /** Scheduler role */
  role: SchedulerRole;
  /** Timestamp of metrics collection */
  timestamp: Date;
  /** Overall job statistics */
  jobs: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  /** Per-schedule statistics */
  schedules: Array<{
    name: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    successRate: number;
    averageDuration: number;
  }>;
  /** Currently running jobs with duration */
  activeJobs: Array<{
    id: string;
    scheduleName: string;
    startTime: number;
    duration: number;
  }>;
}

/**
 * Metrics export options
 */
export interface MetricsExportOptions {
  /** Format for export: 'json', 'prometheus', or 'otel' */
  format?: 'json' | 'prometheus' | 'otel';
  /** Optional prefix for metric names (Prometheus format) */
  prefix?: string;
}

/**
 * Scheduler configuration options
 */
export interface SchedulerOptions {
  /** 
   * Scheduler role: ADMIN creates schedules, WORKER loads and executes them.
   * This is required - there is no default.
   */
  role: SchedulerRole;
  /** 
   * Parent scope for structured concurrency.
   * If not provided, a new scope will be created automatically.
   */
  scope?: Scope;
  /** Storage backend (default: InMemoryJobStorage) */
  storage?: JobStorage;
  /** Poll interval in milliseconds (default: 1000) */
  checkInterval?: number;
  /** Auto-start scheduler on creation (default: true) */
  autoStart?: boolean;
  /**
   * Stale job threshold in milliseconds.
   * Jobs that are past their scheduled time by more than this threshold
   * are considered "stale" when a server starts.
   * Set to 0 to disable stale detection (default).
   */
  staleThreshold?: number;
  /**
   * How to handle stale jobs (default: RUN)
   * - RUN: Execute stale jobs anyway
   * - SKIP: Skip stale jobs (mark as completed without running)
   * - FAIL: Mark stale jobs as failed permanently
   */
  staleJobBehavior?: StaleJobBehavior;
  /**
   * Default IANA timezone for all schedules (e.g., "America/New_York", "UTC").
   * Individual schedules can override this with their own timezone option.
   * If not specified, uses system local time.
   */
  defaultTimezone?: string;
  /**
   * OpenTelemetry tracer for distributed tracing.
   * When provided, the scheduler will create spans for job execution.
   */
  tracer?: { startSpan(name: string): { setAttribute(key: string, value: unknown): void; end(): void } };
  /**
   * Structured logger for scheduler events.
   * When provided, the scheduler will log job lifecycle events.
   */
  logger?: { 
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  /**
   * Job lifecycle hooks for custom instrumentation.
   */
  hooks?: SchedulerHooks;
  /**
   * Enable metrics collection (default: false)
   */
  metrics?: boolean;
  /**
   * Deadlock detection threshold in milliseconds.
   * Jobs running longer than this will trigger the onDeadlock callback.
   * Set to 0 to disable (default).
   */
  deadlockThreshold?: number;
  /**
   * Callback invoked when a potential deadlock is detected.
   */
  onDeadlock?: (job: Job, duration: number) => void | Promise<void>;
}

/**
 * Options for loading schedules (workers only)
 */
/**
 * Job execution profile for detailed timing
 */
export interface JobProfile {
  jobId: string;
  scheduleName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  stages: Array<{
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
  }>;
}

export interface LoadSchedulesOptions {
  /** 
   * Handler factory function that receives schedule name and metadata,
   * returns handler function or null to skip the schedule.
   */
  handlerFactory: (name: string, schedule: Schedule) => ScheduleHandler | null | Promise<ScheduleHandler | null>;
  /** 
   * Whether to auto-reload schedules periodically (default: false)
   * If true, schedules will be reloaded at the specified interval
   */
  autoReload?: boolean;
  /** 
   * Reload interval in milliseconds (default: 60000 = 1 minute)
   * Only used if autoReload is true
   */
  reloadInterval?: number;
}
