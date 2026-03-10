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
export type JobStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

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
	max: number;
	/** Error message if failed */
	error?: string;
}

/**
 * Typed job definition with specific payload type
 */
export type TypedJob<Payload extends JobPayload> = Omit<Job, "payload"> & {
	/** Job payload data with specific type */
	payload: Payload;
};

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
	/** End date for the schedule - no new jobs after this date */
	endDate?: Date;
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
		max?: number;
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
	/** Cron expression for recurring execution (e.g., '0 9 * * *' for daily at 9am) */
	cron?: string;
	/** Interval in milliseconds (alternative to cron, e.g., 60000 for 1 minute) */
	interval?: number;
	/** Timezone for execution (IANA format, e.g., 'America/New_York', 'UTC') */
	timezone?: string;
	/** Default payload for jobs (merged with trigger payload) */
	defaultPayload?: JobPayload;
	/** Maximum retry attempts before marking job as failed (default: 3) */
	max?: number;
	/** Delay between retries in milliseconds (default: 1000) */
	retryDelay?: number;
	/** Job timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Allow concurrent execution of multiple jobs from this schedule (default: false) */
	concurrent?: boolean;
	/** Random jitter in milliseconds to prevent thundering herd (default: 0) */
	jitter?: number;
}

/**
 * Options for onSchedule handler registration
 */
export interface OnScheduleOptions {
	/**
	 * Execute jobs in worker threads (default: false).
	 * Useful for CPU-intensive schedules that would block the event loop.
	 *
	 * @example
	 * ```typescript
	 * // CPU-intensive schedule running in worker thread
	 * worker.onSchedule("heavy-computation", async (job) => {
	 *   // This runs in a worker thread
	 *   const result = heavyCalculation(job.payload.data);
	 *   await saveResult(result);
	 * }, { worker: true });
	 * ```
	 */
	worker?: boolean;
}

/**
 * Handler function for a schedule (provided by workers at runtime)
 */
export type ScheduleHandler = (
	job: Job,
	scope: Scope<Record<string, unknown>>,
) => Promise<void>;

/**
 * Typed handler function for a schedule with specific payload type
 */
export type TypedScheduleHandler<Payload extends JobPayload> = (
	job: TypedJob<Payload>,
	scope: Scope<Record<string, unknown>>,
) => Promise<void>;

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
	/** Cron expression for recurring execution (e.g., '0 9 * * *' for daily at 9am) */
	cron?: string;
	/** Interval in milliseconds (alternative to cron, e.g., 60000 for 1 minute) */
	interval?: number;
	/** Timezone for execution (IANA format, e.g., 'America/New_York', 'UTC') */
	timezone?: string;
	/** End date for the schedule - no new jobs after this date */
	endDate?: Date;
	/** Default payload for jobs (merged with trigger payload) */
	defaultPayload?: JobPayload;
	/** Maximum retry attempts before marking job as failed (default: 3) */
	max?: number;
	/** Delay between retries in milliseconds (default: 1000) */
	retryDelay?: number;
	/** Job timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Allow concurrent execution of multiple jobs from this schedule (default: false) */
	concurrent?: boolean;
	/** Random jitter in milliseconds to prevent thundering herd (default: 0) */
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
	acquireJobLock?(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean>;
	/** Release lock for job execution */
	releaseJobLock?(jobId: string, instanceId: string): Promise<void>;
	/** Extend lock TTL */
	extendJobLock?(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean>;

	// Database-driven scheduling (required for high availability)
	/**
	 * Mark a job as completed and trigger next occurrence scheduling.
	 * When the database handles scheduling, this method should:
	 * 1. Mark job complete
	 * 2. Calculate and schedule the next occurrence automatically
	 *
	 * Returns true if next occurrence was scheduled, false otherwise.
	 */
	completeJobAndScheduleNext(
		jobId: string,
		result: { success: boolean; error?: string },
	): Promise<boolean>;
	/**
	 * Check if this storage supports database-driven scheduling.
	 * Must return true for all storage implementations.
	 */
	supportsAutoScheduling(): boolean;

	// Dead Letter Queue methods (optional, required for DLQ support)
	/** Add a job to the dead letter queue */
	addToDLQ?(job: DeadLetterJob): Promise<void>;
	/** Get jobs from the dead letter queue */
	getDLQJobs?(
		scheduleName?: string,
		options?: { limit?: number; offset?: number },
	): Promise<DeadLetterJob[]>;
	/** Replay a job from the DLQ back to pending status */
	replayFromDLQ?(jobId: string): Promise<boolean>;
	/** Purge jobs from the DLQ. Returns number of jobs purged. */
	purgeDLQ?(scheduleName?: string, maxAge?: number): Promise<number>;
}

/**
 * In-memory job storage (single-node deployments, testing)
 */
export class InMemoryJobStorage implements JobStorage {
	private jobs = new Map<string, Job>();
	private schedules = new Map<string, Schedule>();
	private dlq = new Map<string, DeadLetterJob>();

	async saveJob(job: Job): Promise<void> {
		this.jobs.set(job.id, { ...job });
	}

	async getJob(id: string): Promise<Job | null> {
		const job = this.jobs.get(id);
		return job ? { ...job } : null;
	}

	async getJobsByStatus(status: JobStatus): Promise<Job[]> {
		return Array.from(this.jobs.values())
			.filter((j) => j.status === status)
			.map((j) => ({ ...j }));
	}

	async getDueJobs(before: Date): Promise<Job[]> {
		return Array.from(this.jobs.values())
			.filter((j) => j.status === "pending" && (!j.runAt || j.runAt <= before))
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
			.map((j) => ({ ...j }));
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
		return Array.from(this.schedules.values()).map((s) => ({ ...s }));
	}

	async deleteSchedule(name: string): Promise<void> {
		this.schedules.delete(name);
	}

	// In-memory locking (no distributed coordination needed)
	private locks = new Map<string, { instanceId: string; expiresAt: number }>();

	async acquireJobLock(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean> {
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

	async extendJobLock(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean> {
		const existing = this.locks.get(jobId);
		if (existing && existing.instanceId === instanceId) {
			existing.expiresAt = Date.now() + ttl;
			return true;
		}
		return false;
	}

	supportsAutoScheduling(): boolean {
		return true;
	}

	async completeJobAndScheduleNext(
		jobId: string,
		result: { success: boolean; error?: string },
	): Promise<boolean> {
		// Get the job
		const job = this.jobs.get(jobId);
		if (!job) {
			return false;
		}

		// Mark job as completed/failed
		job.status = result.success ? "completed" : "failed";
		job.completedAt = new Date();
		if (result.error) {
			job.error = result.error;
		}

		// Get schedule
		const schedule = this.schedules.get(job.scheduleName);
		if (!schedule) {
			return false;
		}

		// Calculate next run time
		const nextRun = this.calculateNextRun(schedule);
		if (!nextRun) {
			return false; // No more occurrences
		}

		// Check for idempotency - don't schedule if already have a pending job
		const pendingJobs = Array.from(this.jobs.values()).filter(
			(j) => j.scheduleName === schedule.name && j.status === "pending",
		);
		if (pendingJobs.length > 0) {
			return false; // Already have pending job for this schedule
		}

		// Create next job
		const nextJob: Job = {
			id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			scheduleId: schedule.id,
			scheduleName: schedule.name,
			payload: schedule.payload ?? {},
			status: "pending",
			priority: 0,
			createdAt: new Date(),
			runAt: nextRun,
			retryCount: 0,
			max: schedule.options?.max ?? 3,
		};

		this.jobs.set(nextJob.id, nextJob);
		return true;
	}

	private calculateNextRun(schedule: Schedule): Date | null {
		let nextRun: Date | null = null;

		if (schedule.cron) {
			// Simple cron parsing - just advances 1 minute for testing
			// Production storage adapters use proper cron parser
			const now = new Date();
			const next = new Date(now);
			next.setMinutes(next.getMinutes() + 1);
			next.setSeconds(0);
			next.setMilliseconds(0);
			nextRun = next;
		} else if (schedule.interval) {
			nextRun = new Date(Date.now() + schedule.interval);
		}

		// Check if next run is past the end date
		if (nextRun && schedule.endDate) {
			const endDate = new Date(schedule.endDate);
			if (nextRun > endDate) {
				return null; // Schedule has ended
			}
		}

		return nextRun;
	}

	// Dead Letter Queue methods
	async addToDLQ(job: DeadLetterJob): Promise<void> {
		this.dlq.set(job.id, { ...job });
	}

	async getDLQJobs(
		scheduleName?: string,
		options?: { limit?: number; offset?: number },
	): Promise<DeadLetterJob[]> {
		let jobs = Array.from(this.dlq.values());

		if (scheduleName) {
			jobs = jobs.filter((j) => j.scheduleName === scheduleName);
		}

		// Sort by deadLetteredAt descending (most recent first)
		jobs.sort(
			(a, b) =>
				new Date(b.deadLetteredAt).getTime() -
				new Date(a.deadLetteredAt).getTime(),
		);

		const offset = options?.offset ?? 0;
		const limit = options?.limit ?? jobs.length;

		return jobs.slice(offset, offset + limit).map((j) => ({ ...j }));
	}

	async replayFromDLQ(jobId: string): Promise<boolean> {
		const dlqJob = this.dlq.get(jobId);
		if (!dlqJob) {
			return false;
		}

		// Remove from DLQ
		this.dlq.delete(jobId);

		// Reset job to pending state
		const replayedJob: Job = {
			...dlqJob,
			status: "pending",
			retryCount: 0,
			error: undefined,
			completedAt: undefined,
			lastExecutedAt: undefined,
			lockExpiresAt: undefined,
			runAt: new Date(),
		};

		this.jobs.set(jobId, replayedJob);
		return true;
	}

	async purgeDLQ(scheduleName?: string, maxAge?: number): Promise<number> {
		const now = Date.now();
		let count = 0;

		for (const [id, job] of this.dlq.entries()) {
			// Filter by schedule name if specified
			if (scheduleName && job.scheduleName !== scheduleName) {
				continue;
			}

			// Filter by max age if specified
			if (maxAge) {
				const age = now - new Date(job.deadLetteredAt).getTime();
				if (age < maxAge) {
					continue;
				}
			}

			this.dlq.delete(id);
			count++;
		}

		return count;
	}
}

/**
 * Scheduler events for monitoring and observability
 */
export interface SchedulerEvents {
	/** Emitted when scheduler starts */
	started: (event: { instanceId: string }) => void;
	/** Emitted when scheduler stops */
	stopped: (event: { instanceId: string }) => void;
	/** Emitted when a schedule is created */
	scheduleCreated: (event: { schedule: Schedule }) => void;
	/** Emitted when a schedule is updated */
	scheduleUpdated: (event: { schedule: Schedule }) => void;
	/** Emitted when a schedule's state changes (pause/resume/disable) */
	scheduleStateChanged: (event: {
		schedule: Schedule;
		state: ScheduleState;
	}) => void;
	/** Emitted when a schedule is deleted */
	scheduleDeleted: (event: { scheduleName: string }) => void;
	/** Emitted when schedules are loaded from storage */
	schedulesLoaded: (event: { count: number; names: string[] }) => void;
	/** Emitted when a handler is registered */
	handlerRegistered: (event: { scheduleName: string }) => void;
	/** Emitted when a handler is removed */
	handlerRemoved: (event: { scheduleName: string }) => void;
	/** Emitted when a job is scheduled */
	jobScheduled: (event: { job: Job }) => void;
	/** Emitted when a job starts execution */
	jobStarted: (event: { job: Job; instanceId: string }) => void;
	/** Emitted when a job completes successfully */
	jobCompleted: (event: { job: Job; duration: number }) => void;
	/** Emitted when a job fails (may retry) */
	jobFailed: (event: { job: Job; error: Error; permanent: boolean }) => void;
	/** Emitted when a job is scheduled for retry */
	jobRetryScheduled: (event: {
		job: Job;
		error: Error;
		retryDelay: number;
	}) => void;
	/** Emitted when a job is cancelled */
	jobCancelled: (event: { job: Job }) => void;
	/** Emitted when a stale job is skipped (staleJobBehavior: SKIP) */
	jobSkipped: (event: { job: Job; reason: "stale"; staleness: number }) => void;
	/** Emitted when a job is moved to the dead letter queue */
	jobDeadLettered: (event: { job: DeadLetterJob; error: Error }) => void;
	/** Emitted when this admin instance becomes the leader (HA mode) */
	becameLeader: (event: { instanceId: string }) => void;
	/** Emitted when this admin instance steps down from leader role (HA mode) */
	steppedDown: (event: { instanceId: string }) => void;
}

/**
 * Dead Letter Queue job - contains additional metadata for failed jobs
 */
export interface DeadLetterJob extends Job {
	/** When the job was moved to the DLQ */
	deadLetteredAt: Date;
	/** The final error message that caused the job to be dead lettered */
	finalError: string;
	/** History of retry attempts with errors */
	retryHistory: Array<{ attemptedAt: Date; error: string }>;
}

/**
 * Dead Letter Queue configuration options
 */
export interface DeadLetterQueueOptions {
	/** Enable the dead letter queue (default: false) */
	enabled: boolean;
	/** Maximum retry attempts before moving to DLQ (defaults to schedule's max) */
	max?: number;
	/** Separate storage for DLQ jobs (defaults to main storage) */
	storage?: JobStorage;
	/** Callback invoked when a job is moved to the DLQ (receives job and final error) */
	onDeadLetter?: (job: DeadLetterJob, error: Error) => void | Promise<void>;
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
	/** Called before a job starts executing (receives job and schedule) */
	beforeJob?: (job: Job, schedule: Schedule) => void | Promise<void>;
	/** Called after a job completes (success or failure) (receives job, schedule, and result) */
	afterJob?: (
		job: Job,
		schedule: Schedule,
		result: JobResult,
	) => void | Promise<void>;
	/** Called when a job fails (including retries) (receives job, schedule, error, and willRetry flag) */
	onJobError?: (
		job: Job,
		schedule: Schedule,
		error: Error,
		willRetry: boolean,
	) => void | Promise<void>;
}

/**
 * Scheduler metrics for export
 */
export interface SchedulerMetrics {
	/** Scheduler instance ID */
	instanceId: string;
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
	format?: "json" | "prometheus" | "otel";
	/** Optional prefix for metric names (Prometheus format) */
	prefix?: string;
}

/**
 * Scheduler configuration options
 */
export interface SchedulerOptions {
	/**
	 * Parent scope for structured concurrency.
	 * If not provided, a new scope will be created automatically.
	 */
	scope?: Scope<Record<string, unknown>>;
	/** Storage backend for jobs and schedules (default: InMemoryJobStorage) */
	storage?: JobStorage;
	/** Poll interval in milliseconds for checking due jobs (default: 1000) */
	checkInterval?: number;
	/** Auto-start scheduler on creation (default: true) */
	autoStart?: boolean;
	/**
	 * Dead Letter Queue configuration.
	 * When enabled, jobs that fail after max are moved to the DLQ
	 * instead of just being marked as failed.
	 */
	deadLetterQueue?: DeadLetterQueueOptions;
	/**
	 * Stale job threshold in milliseconds.
	 * Jobs that are past their scheduled time by more than this threshold
	 * are considered "stale" when a server starts.
	 * Set to 0 to disable stale detection (default).
	 */
	staleThreshold?: number;
	/**
	 * How to handle stale jobs (default: StaleJobBehavior.RUN)
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
	tracer?: {
		/** Start a new span with the given name */
		startSpan(name: string): {
			/** Set an attribute on the span */
			setAttribute(key: string, value: unknown): void;
			/** End the span */
			end(): void;
		};
	};
	/**
	 * Structured logger for scheduler events.
	 * When provided, the scheduler will log job lifecycle events.
	 */
	logger?: {
		/** Log a debug message with optional metadata */
		debug: (msg: string, meta?: Record<string, unknown>) => void;
		/** Log an info message with optional metadata */
		info: (msg: string, meta?: Record<string, unknown>) => void;
		/** Log a warning message with optional metadata */
		warn: (msg: string, meta?: Record<string, unknown>) => void;
		/** Log an error message with optional metadata */
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
	 * Callback invoked when a potential deadlock is detected (receives job and duration in ms).
	 */
	onDeadlock?: (job: Job, duration: number) => void | Promise<void>;
	/**
	 * Enable high availability mode with leader election for admin instances.
	 * When enabled, multiple admins can run simultaneously with only one leader active.
	 * Followers will automatically take over if the leader fails.
	 * (default: false)
	 */
	enableLeaderElection?: boolean;
	/**
	 * Leader election heartbeat interval in milliseconds.
	 * The leader will update its presence at this interval.
	 * (default: 5000)
	 */
	leaderHeartbeatInterval?: number;
	/**
	 * Leader election timeout in milliseconds.
	 * If no heartbeat is received within this time, a new leader is elected.
	 * Should be 2-3x the heartbeat interval.
	 * (default: 15000)
	 */
	leaderElectionTimeout?: number;
	/**
	 * Callback invoked when this admin instance becomes the leader.
	 */
	onBecomeLeader?: () => void | Promise<void>;
	/**
	 * Callback invoked when this admin instance steps down from leader role.
	 */
	onStepDown?: () => void | Promise<void>;
	/**
	 * Enable web UI for admin instances.
	 * When enabled, the scheduler will start an HTTP server with a web interface
	 * for managing schedules (create, update, delete, list, view stats).
	 * (default: false)
	 */
	enableWebUI?: boolean;
	/**
	 * Port for the web UI server (default: 8080)
	 */
	webUIPort?: number;
	/**
	 * Host for the web UI server (default: "0.0.0.0")
	 */
	webUIHost?: string;
	/**
	 * API key for web UI authentication (optional).
	 * If provided, all API requests must include this key in the Authorization header.
	 */
	webUIApiKey?: string;
	/**
	 * Custom path for the web UI (default: "/")
	 */
	webUIPath?: string;
	/**
	 * Worker pool configuration for CPU-intensive scheduled jobs.
	 * When handlers are registered with `worker: true`, this pool will be used
	 * to execute them in worker threads.
	 */
	workerPool?: {
		/** Number of worker threads (default: CPU count - 1) */
		size?: number;
		/** Idle timeout in milliseconds before workers terminate (default: 60000) */
		idleTimeout?: number;
	};
}

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

// ============================================================================
// Type-safe schedule definitions
// ============================================================================

/**
 * Helper type to define schedules with typed payloads
 *
 * @example
 * ```typescript
 * type AppSchedules = {
 *   'send-email': { to: string; subject: string; body: string };
 *   'process-payment': { amount: number; currency: string };
 * };
 *
 * const scheduler = new Scheduler<AppSchedules>({ storage });
 * ```
 */
export type ScheduleDefinitions = Record<string, JobPayload>;

/**
 * Helper type to extract the payload type for a specific schedule
 */
export type SchedulePayload<
	Schedules extends ScheduleDefinitions,
	Name extends keyof Schedules,
> = Schedules[Name];

/**
 * Helper type to extract schedule types from a scheduler instance
 *
 * @example
 * ```typescript
 * const scheduler = new Scheduler<AppSchedules>({ storage });
 * type MySchedules = SchedulesOf<typeof scheduler>;
 * // MySchedules = AppSchedules
 * ```
 */
export type SchedulesOf<T> = T extends Scheduler<infer S> ? S : never;

/**
 * Options for triggering a schedule
 */
export interface TriggerOptions {
	/** Delay before running in milliseconds (default: 0 - immediate) */
	delay?: number;
	/** Override schedule's default payload (merged with schedule payload) */
	payload?: JobPayload;
}

/**
 * Options for scheduling a job
 */
export interface ScheduleJobOptions {
	/** Delay before running in milliseconds (default: 0 - immediate) */
	delay?: number;
	/** Job priority (higher = runs first, default: 0) */
	priority?: number;
}

/**
 * Scheduler class with typed schedules
 *
 * @template Schedules - Record mapping schedule names to their payload types
 *
 * @example
 * ```typescript
 * type AppSchedules = {
 *   'send-email': { to: string; subject: string; body: string };
 *   'process-payment': { amount: number; currency: string };
 * };
 *
 * const scheduler = new Scheduler<AppSchedules>({ storage });
 *
 * // Type-safe handler registration
 * scheduler.onSchedule('send-email', async (job) => {
 *   // job.payload is typed as { to: string; subject: string; body: string }
 *   const { to, subject, body } = job.payload;
 * });
 *
 * // Type-safe trigger
 * await scheduler.triggerSchedule('send-email', {
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'World'
 * });
 * ```
 */
export declare class Scheduler<
	Schedules extends ScheduleDefinitions = Record<string, JobPayload>,
> implements AsyncDisposable
{
	readonly version: string;

	constructor(options: SchedulerOptions);

	/**
	 * Register a typed handler for a schedule.
	 * The handler will be called when jobs for this schedule become available.
	 *
	 * @param name - Schedule name (must be a key of Schedules)
	 * @param handler - Handler function with typed payload
	 */
	onSchedule<Name extends keyof Schedules>(
		name: Name extends string ? Name : never,
		handler: TypedScheduleHandler<Schedules[Name]>,
	): void;

	/**
	 * Trigger a schedule to run immediately.
	 * Creates a job that will execute as soon as a worker picks it up.
	 *
	 * @param name - Schedule name (must be a key of Schedules)
	 * @param payload - Typed payload for the job
	 * @param options - Optional trigger options
	 */
	triggerSchedule<Name extends keyof Schedules>(
		name: Name extends string ? Name : never,
		payload?: Schedules[Name],
		options?: ScheduleJobOptions,
	): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>;

	/**
	 * Schedule a one-time job.
	 *
	 * @param scheduleName - Schedule name (must be a key of Schedules)
	 * @param payload - Typed payload for the job
	 * @param options - Optional scheduling options
	 */
	scheduleJob<Name extends keyof Schedules>(
		scheduleName: Name extends string ? Name : never,
		payload?: Schedules[Name],
		options?: ScheduleJobOptions,
	): Promise<import("go-go-scope").Result<Error, ScheduleJobResult>>;

	/**
	 * Create a schedule for recurring job execution.
	 *
	 * @param name - Unique schedule name
	 * @param options - Schedule configuration
	 */
	createSchedule<Name extends string>(
		name: Name,
		options: CreateScheduleOptions,
	): Promise<Schedule>;

	/**
	 * Remove a handler for a schedule.
	 */
	offSchedule(name: string): boolean;

	/**
	 * Delete a schedule by name.
	 */
	deleteSchedule(name: string): Promise<boolean>;

	/**
	 * List all schedules.
	 */
	listSchedules(): Promise<Schedule[]>;

	/**
	 * Get a schedule by name.
	 */
	getSchedule(name: string): Promise<Schedule | null>;

	/**
	 * Update an existing schedule.
	 */
	updateSchedule(
		name: string,
		options: UpdateScheduleOptions,
	): Promise<Schedule>;

	/**
	 * Pause a schedule. No new jobs will be created until resumed.
	 */
	pauseSchedule(name: string): Promise<Schedule>;

	/**
	 * Resume a paused schedule.
	 */
	resumeSchedule(name: string): Promise<Schedule>;

	/**
	 * Disable a schedule. Workers will skip disabled schedules.
	 */
	disableSchedule(name: string): Promise<Schedule>;

	/**
	 * Get statistics for a schedule.
	 */
	getScheduleStats(name: string): Promise<ScheduleStats>;

	/**
	 * Get all schedules with their statistics.
	 */
	getAllScheduleStats(): Promise<ScheduleStats[]>;

	/**
	 * Cancel a pending job.
	 */
	cancelJob(jobId: string): Promise<boolean>;

	/**
	 * Get a job by ID.
	 */
	getJob(jobId: string): Promise<Job | null>;

	/**
	 * Get jobs by status.
	 */
	getJobsByStatus(status: JobStatus): Promise<Job[]>;

	/**
	 * Start the scheduler polling loop.
	 */
	start(): void;

	/**
	 * Stop the scheduler and cancel all running jobs.
	 */
	stop(): Promise<void>;

	/**
	 * Get scheduler status.
	 */
	getStatus(): {
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	};

	/**
	 * Get the web UI URL if enabled.
	 */
	getWebUIUrl(): string | null;

	/**
	 * Event emitter for scheduler lifecycle events.
	 */
	on: <K extends keyof SchedulerEvents>(
		event: K,
		listener: SchedulerEvents[K],
	) => () => void;

	/**
	 * Collect current metrics from the scheduler.
	 */
	collectMetrics(): Promise<SchedulerMetrics>;

	/**
	 * Export metrics in various formats.
	 */
	exportMetrics(options?: MetricsExportOptions): Promise<string>;

	/**
	 * Get job profile for detailed execution analysis.
	 */
	getJobProfile(jobId: string): JobProfile | undefined;

	/**
	 * Get all job profiles.
	 */
	getAllJobProfiles(): JobProfile[];

	/**
	 * Clear old job profiles.
	 */
	clearJobProfiles(olderThanMs?: number): void;

	/**
	 * Async dispose the scheduler.
	 */
	[Symbol.asyncDispose](): Promise<void>;
}

/**
 * Create a typed scheduler instance.
 *
 * @example
 * ```typescript
 * const scheduler = createScheduler<{
 *   'send-email': { to: string; subject: string };
 *   'cleanup': { maxAge: number };
 * }>({ storage });
 * ```
 */
// createScheduler is implemented in scheduler.ts and re-exported from there
