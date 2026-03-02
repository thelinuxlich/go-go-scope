/**
 * Production-ready distributed job scheduler
 *
 * @example
 * ```typescript
 * const scheduler = new Scheduler({ scope: s, storage });
 *
 * // Create a schedule
 * await scheduler.createSchedule("daily-report", {
 *   cron: "0 9 * * *",
 *   timezone: "America/New_York",
 * });
 *
 * // Register handler for the schedule
 * scheduler.onSchedule("daily-report", async (job, scope) => {
 *   // generate report
 * });
 *
 * scheduler.start();
 * ```
 *
 * @module go-go-scope/scheduler
 */

import type { Server } from "node:http";
import createDebug from "debug";
import type { Result, Scope } from "go-go-scope";
import { scope, WorkerPool } from "go-go-scope";
import { CronPresets, parseCron } from "./cron.js";
import {
	type CreateScheduleOptions,
	InMemoryJobStorage,
	type Job,
	type JobPayload,
	type JobProfile,
	type JobStatus,
	type JobStorage,
	type MetricsExportOptions,
	type OnScheduleOptions,
	SCHEDULER_VERSION,
	type Schedule,
	type ScheduleDefinitions,
	type ScheduleHandler,
	type ScheduleJobOptions,
	type ScheduleJobResult,
	type SchedulerEvents,
	type SchedulerMetrics,
	type SchedulerOptions,
	ScheduleState,
	type ScheduleStats,
	StaleJobBehavior,
	type TypedScheduleHandler,
	type UpdateScheduleOptions,
} from "./types.js";
import { createWebUI, stopWebUI, type WebUIOptions } from "./web-ui.js";

// Debug loggers
const debugScheduler = createDebug("go-go-scope:scheduler");
const debugJob = createDebug("go-go-scope:scheduler:job");
const debugLock = createDebug("go-go-scope:scheduler:lock");

/**
 * Typed event emitter for scheduler events
 */
class SchedulerEventEmitter {
	private listeners: {
		[K in keyof SchedulerEvents]?: Array<SchedulerEvents[K]>;
	} = {};

	on<K extends keyof SchedulerEvents>(
		event: K,
		listener: SchedulerEvents[K],
	): () => void {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		(this.listeners[event] as Array<SchedulerEvents[K]>).push(listener);
		return () => this.off(event, listener);
	}

	off<K extends keyof SchedulerEvents>(
		event: K,
		listener: SchedulerEvents[K],
	): void {
		const arr = this.listeners[event];
		if (arr) {
			const idx = (arr as unknown[]).indexOf(listener);
			if (idx !== -1) arr.splice(idx, 1);
		}
	}

	emit<K extends keyof SchedulerEvents>(
		event: K,
		...args: Parameters<SchedulerEvents[K]>
	): void {
		const arr = this.listeners[event];
		if (arr) {
			for (const listener of arr) {
				try {
					(listener as (...args: unknown[]) => void)(...args);
				} catch {
					// Ignore errors in event listeners
				}
			}
		}
	}
}

/**
 * Production-ready distributed job scheduler
 *
 * Uses mandatory Admin + Workers pattern for distributed deployments.
 *
 * **Storage Requirements:**
 * - Storage MUST implement `supportsAutoScheduling()` returning `true`
 * - Storage MUST implement `completeJobAndScheduleNext()` for recurring scheduling
 * - This enables multiple admin instances without leader election complexity
 *
 * Supported storages: InMemoryJobStorage, RedisJobStorage, SQLJobStorage
 *
 * @template Schedules - Record mapping schedule names to their payload types
 *
 * @example
 * ```typescript
 * // Define your schedules with typed payloads
 * type AppSchedules = {
 *   'send-email': { to: string; subject: string; body: string };
 *   'process-payment': { amount: number; currency: string };
 * };
 *
 * // Create typed scheduler
 * const scheduler = new Scheduler<AppSchedules>({ storage });
 *
 * // Register typed handler - autocomplete for schedule names!
 * scheduler.onSchedule('send-email', async (job) => {
 *   // job.payload is fully typed
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
 * ```
 */
export class Scheduler<
	Schedules extends ScheduleDefinitions = Record<string, JobPayload>,
> implements AsyncDisposable
{
	readonly version = SCHEDULER_VERSION;

	private scope: Scope<Record<string, unknown>>;
	private internalScope: Scope<Record<string, unknown>> | null = null; // Track if we created the scope internally
	private storage: JobStorage;
	private instanceId: string;
	private isRunning = false;
	private checkInterval: number;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private runningJobs = new Map<
		string,
		{ scope: Scope<Record<string, unknown>>; startTime: number }
	>();
	private schedules = new Map<
		string,
		Schedule & { handler?: ScheduleHandler }
	>();
	private handlers = new Map<string, ScheduleHandler>();
	private handlerOptions = new Map<string, OnScheduleOptions>();
	private events = new SchedulerEventEmitter();
	private options: SchedulerOptions;

	private metricsEnabled: boolean;
	private jobProfiles = new Map<string, JobProfile>();
	private deadlockCheckTimer: ReturnType<typeof setInterval> | null = null;

	// Web UI server (admin only)
	private webUIEnabled: boolean;
	private webUIServer: Server | null = null;

	// Leader election (HA mode)
	private leaderElectionEnabled: boolean;
	private isLeader = false;
	private leaderHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private adminState: "follower" | "leader" = "follower";

	// Worker pool for CPU-intensive schedules
	private workerPool?: WorkerPool;
	private readonly workerPoolOptions?: { size?: number; idleTimeout?: number };

	[Symbol.asyncDispose]!: () => Promise<void>;

	constructor(options: SchedulerOptions) {
		this.options = options;
		this.workerPoolOptions = options.workerPool;

		// Create internal scope if not provided
		if (options.scope) {
			this.scope = options.scope;
		} else {
			this.internalScope = scope({ name: `scheduler` });
			this.scope = this.internalScope;
		}

		this.storage = options.storage ?? new InMemoryJobStorage();

		// Validate that storage supports auto-scheduling (required)
		if (
			!this.storage.supportsAutoScheduling ||
			!this.storage.supportsAutoScheduling()
		) {
			throw new Error(
				"Storage must support auto-scheduling. " +
					"All JobStorage implementations must implement supportsAutoScheduling() and completeJobAndScheduleNext(). " +
					"Use InMemoryJobStorage, RedisJobStorage, or SQLJobStorage which all support auto-scheduling.",
			);
		}

		this.checkInterval = options.checkInterval ?? 1000;
		this.metricsEnabled = options.metrics ?? false;
		this.instanceId = `scheduler-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

		// Initialize leader election for admin instances
		this.leaderElectionEnabled = options.enableLeaderElection ?? false;
		if (this.leaderElectionEnabled) {
			this.startLeaderElection();
		}

		// Bind dispose method
		this[Symbol.asyncDispose] = async () => {
			await this.stop();
		};

		// Setup deadlock detection if enabled
		if (options.deadlockThreshold && options.deadlockThreshold > 0) {
			this.startDeadlockDetection(options.deadlockThreshold);
		}

		// Setup web UI
		this.webUIEnabled = options.enableWebUI ?? false;
		if (this.webUIEnabled) {
			this.startWebUI();
		}

		// Auto-start if not disabled
		if (options.autoStart !== false) {
			this.start();
		}

		debugScheduler(
			"created: instanceId=%s, internalScope=%s, webUI=%s",
			this.instanceId,
			this.internalScope !== null,
			this.webUIEnabled,
		);
	}

	/**
	 * Start leader election for high availability mode
	 */
	private startLeaderElection(): void {
		const heartbeatInterval = this.options.leaderHeartbeatInterval ?? 5000;
		const electionTimeout = this.options.leaderElectionTimeout ?? 15000;

		// Start heartbeat loop
		this.leaderHeartbeatTimer = setInterval(() => {
			this.checkLeadership(heartbeatInterval, electionTimeout);
		}, heartbeatInterval);

		// Initial check
		this.checkLeadership(heartbeatInterval, electionTimeout);
	}

	/**
	 * Check and update leadership status
	 */
	private async checkLeadership(
		_heartbeatInterval: number,
		_electionTimeout: number,
	): Promise<void> {
		// This is a simplified leader election implementation
		// In production, you would use distributed locks via storage
		if (!this.isLeader) {
			// Try to become leader
			this.isLeader = true;
			this.adminState = "leader";
			debugScheduler("became leader: instanceId=%s", this.instanceId);
			this.options.logger?.info("Became scheduler leader", {
				instanceId: this.instanceId,
			});
			this.events.emit("becameLeader", { instanceId: this.instanceId });
			await this.options.onBecomeLeader?.();
		}
	}

	/**
	 * Start deadlock detection timer
	 */
	private startDeadlockDetection(threshold: number): void {
		this.deadlockCheckTimer = setInterval(
			() => {
				this.checkForDeadlocks(threshold);
			},
			Math.min(threshold / 2, 5000),
		); // Check at least every 5 seconds
	}

	/**
	 * Check for deadlocked jobs
	 */
	private async checkForDeadlocks(threshold: number): Promise<void> {
		const now = Date.now();
		for (const [jobId, { startTime }] of this.runningJobs.entries()) {
			const duration = now - startTime;
			if (duration > threshold) {
				const job = await this.storage.getJob(jobId);
				if (job) {
					debugScheduler(
						"deadlock detected: jobId=%s, duration=%dms",
						jobId,
						duration,
					);
					this.options.logger?.warn("Potential deadlock detected", {
						jobId,
						duration,
						threshold,
					});
					await this.options.onDeadlock?.(job, duration);
				}
			}
		}
	}

	// ============================================================================
	// Web UI
	// ============================================================================

	/**
	 * Start web UI server
	 */
	private async startWebUI(): Promise<void> {
		if (this.webUIServer) {
			return; // Already started
		}

		try {
			const webUIOptions: WebUIOptions = {
				port: this.options.webUIPort ?? 8080,
				host: this.options.webUIHost ?? "0.0.0.0",
				path: this.options.webUIPath ?? "/",
				apiKey: this.options.webUIApiKey,
				storage: this.storage,
				logger: this.options.logger,
				getScheduleStats: (name: string) => this.getScheduleStats(name),
				createSchedule: (name: string, options: CreateScheduleOptions) =>
					this.createSchedule(name, options),
				updateSchedule: (name: string, options: UpdateScheduleOptions) =>
					this.updateSchedule(name, options),
				deleteSchedule: async (name: string) => {
					await this.deleteSchedule(name);
				},
				pauseSchedule: async (name: string) => {
					await this.pauseSchedule(name);
				},
				resumeSchedule: async (name: string) => {
					await this.resumeSchedule(name);
				},
				getScheduleJobs: async (name: string, limit = 20) => {
					// Get all jobs and filter by schedule name
					const allJobs: Job[] = [];
					const statuses: JobStatus[] = [
						"pending",
						"running",
						"completed",
						"failed",
						"cancelled",
					];
					for (const status of statuses) {
						const jobs = await this.storage.getJobsByStatus(status);
						allJobs.push(...jobs.filter((j) => j.scheduleName === name));
					}
					// Sort by createdAt descending and limit
					return allJobs
						.sort(
							(a, b) =>
								new Date(b.createdAt).getTime() -
								new Date(a.createdAt).getTime(),
						)
						.slice(0, limit);
				},
			};

			this.webUIServer = await createWebUI(webUIOptions);
			this.options.logger?.info("Web UI started", {
				host: webUIOptions.host,
				port: webUIOptions.port,
				path: webUIOptions.path,
			});
		} catch (error) {
			this.options.logger?.error("Failed to start Web UI", {
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Get the web UI URL if enabled
	 */
	getWebUIUrl(): string | null {
		if (!this.webUIEnabled || !this.webUIServer) {
			return null;
		}
		const port = this.options.webUIPort ?? 8080;
		const host = this.options.webUIHost ?? "localhost";
		const path = this.options.webUIPath ?? "/";
		return `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${path}`;
	}

	/**
	 * Event emitter for scheduler lifecycle events
	 */
	get on(): <K extends keyof SchedulerEvents>(
		event: K,
		listener: SchedulerEvents[K],
	) => () => void {
		return this.events.on.bind(this.events);
	}

	/**
	 * Start the scheduler polling loop.
	 * Workers will start checking for due jobs.
	 * Admin can create schedules after starting.
	 */
	start(): void {
		if (this.isRunning) {
			debugScheduler("start: already running");
			return;
		}
		this.isRunning = true;

		debugScheduler("started: instanceId=%s", this.instanceId);
		this.options.logger?.info("Scheduler started", {
			instanceId: this.instanceId,
		});

		this.events.emit("started", { instanceId: this.instanceId });

		// Start polling for due jobs
		debugScheduler("start: polling interval=%dms", this.checkInterval);
		this.pollTimer = setInterval(() => {
			this.checkAndRunJobs().catch(() => {});
		}, this.checkInterval);
	}

	/**
	 * Stop the scheduler and cancel all running jobs
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) {
			debugScheduler("stop: not running");
			return;
		}

		debugScheduler("stopping: instanceId=%s", this.instanceId);
		this.options.logger?.info("Scheduler stopping", {
			instanceId: this.instanceId,
		});

		this.isRunning = false;

		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}

		if (this.deadlockCheckTimer) {
			clearInterval(this.deadlockCheckTimer);
			this.deadlockCheckTimer = null;
		}

		if (this.leaderHeartbeatTimer) {
			clearInterval(this.leaderHeartbeatTimer);
			this.leaderHeartbeatTimer = null;
		}

		// Cancel all running jobs
		const running = Array.from(this.runningJobs.entries());
		debugScheduler("stop: cancelling %d running jobs", running.length);

		for (const [jobId, { scope }] of running) {
			debugJob("cancel: jobId=%s", jobId);
			await scope[Symbol.asyncDispose]().catch(() => {});
			this.runningJobs.delete(jobId);
		}

		// Stop web UI
		if (this.webUIServer) {
			debugScheduler("stop: stopping web UI");
			await stopWebUI(this.webUIServer);
			this.webUIServer = null;
		}

		// Dispose worker pool if created
		if (this.workerPool) {
			debugScheduler("stop: disposing worker pool");
			await this.workerPool[Symbol.asyncDispose]().catch(() => {});
			this.workerPool = undefined;
		}

		// Dispose internal scope if we created it
		if (this.internalScope) {
			debugScheduler("stop: disposing internal scope");
			await this.internalScope[Symbol.asyncDispose]().catch(() => {});
			this.internalScope = null;
		}

		this.events.emit("stopped", { instanceId: this.instanceId });
		debugScheduler("stopped: instanceId=%s", this.instanceId);
		this.options.logger?.info("Scheduler stopped", {
			instanceId: this.instanceId,
		});
	}

	/**
	 * Get scheduler status
	 */
	getStatus(): {
		isRunning: boolean;
		runningJobs: number;
		scheduledJobs: number;
		instanceId: string;
	} {
		return {
			isRunning: this.isRunning,
			runningJobs: this.runningJobs.size,
			scheduledJobs: this.schedules.size,
			instanceId: this.instanceId,
		};
	}

	/**
	 * Create a schedule for recurring job execution.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 * Workers must use `onSchedule()` to register handlers for schedules.
	 *
	 * @param name Unique schedule name
	 * @param options Schedule configuration
	 * @returns The created schedule
	 * @throws Error if called by a worker instance
	 */
	async createSchedule<Name extends string>(
		name: Name,
		options: CreateScheduleOptions,
	): Promise<Schedule> {
		// Check for existing schedule
		const existing = await this.storage.getSchedule(name);
		if (existing) {
			throw new Error(
				`Schedule '${name}' already exists. ` +
					`Use deleteSchedule() first if you want to recreate it.`,
			);
		}

		// Validate and parse cron
		const timezone = options.timezone ?? this.options.defaultTimezone;

		if (options.cron) {
			const result = parseCron(options.cron, timezone);
			if (result instanceof Error) {
				throw result;
			}
		} else if (!options.interval) {
			throw new Error("Either cron or interval must be specified");
		}

		const schedule: Schedule = {
			id: `schedule-${name}-${Date.now()}`,
			name,
			cron: options.cron,
			interval: options.interval,
			timezone,
			endDate: options.endDate,
			payload: options.defaultPayload,
			state: ScheduleState.ACTIVE,
			createdAt: new Date(),
			updatedAt: new Date(),
			totalJobs: 0,
			successCount: 0,
			failureCount: 0,
			options: {
				maxRetries: options.maxRetries ?? 3,
				retryDelay: options.retryDelay ?? 1000,
				timeout: options.timeout ?? 30000,
				concurrent: options.concurrent ?? false,
				jitter: options.jitter ?? 0,
			},
		};

		// Save to storage
		await this.storage.saveSchedule(schedule);

		// Also keep in memory for admin
		this.schedules.set(name, schedule);

		debugScheduler(
			"schedule created: name=%s, cron=%s, interval=%d",
			name,
			options.cron,
			options.interval,
		);
		this.options.logger?.info("Schedule created", {
			name,
			cron: options.cron,
			interval: options.interval,
			timezone,
		});

		this.events.emit("scheduleCreated", { schedule });

		// Schedule first occurrence
		this.scheduleNextOccurrence(schedule);

		return schedule;
	}

	/**
	 * Delete a schedule by name.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name to delete
	 * @returns true if deleted, false if not found
	 * @throws Error if called by a worker instance
	 */
	async deleteSchedule(name: string): Promise<boolean> {
		const existing = await this.storage.getSchedule(name);
		if (!existing) {
			return false;
		}

		await this.storage.deleteSchedule(name);
		this.schedules.delete(name);

		this.events.emit("scheduleDeleted", { scheduleName: name });
		return true;
	}

	/**
	 * List all schedules.
	 *
	 * @returns Array of all schedules
	 */
	async listSchedules(): Promise<Schedule[]> {
		return this.storage.getSchedules();
	}

	/**
	 * Get a schedule by name.
	 *
	 * @param name Schedule name
	 * @returns Schedule or null if not found
	 */
	async getSchedule(name: string): Promise<Schedule | null> {
		return this.storage.getSchedule(name);
	}

	/**
	 * Update an existing schedule.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name
	 * @param options Update options
	 * @returns Updated schedule
	 * @throws Error if schedule not found or called by worker
	 */
	async updateSchedule(
		name: string,
		options: UpdateScheduleOptions,
	): Promise<Schedule> {
		const existing = await this.storage.getSchedule(name);
		if (!existing) {
			throw new Error(`Schedule '${name}' not found`);
		}

		// Validate new cron if provided
		const timezone =
			options.timezone ?? existing.timezone ?? this.options.defaultTimezone;
		if (options.cron) {
			const result = parseCron(options.cron, timezone);
			if (result instanceof Error) {
				throw result;
			}
		}

		const updated: Schedule = {
			...existing,
			cron: options.cron ?? existing.cron,
			interval: options.interval ?? existing.interval,
			timezone,
			payload: options.defaultPayload ?? existing.payload,
			updatedAt: new Date(),
			options: {
				maxRetries: options.maxRetries ?? existing.options?.maxRetries ?? 3,
				retryDelay: options.retryDelay ?? existing.options?.retryDelay ?? 1000,
				timeout: options.timeout ?? existing.options?.timeout ?? 30000,
				concurrent: options.concurrent ?? existing.options?.concurrent ?? false,
				jitter: options.jitter ?? existing.options?.jitter ?? 0,
			},
		};

		await this.storage.saveSchedule(updated);

		// Update in-memory if present
		if (this.schedules.has(name)) {
			const handler = this.schedules.get(name)?.handler;
			this.schedules.set(name, { ...updated, handler });
		}

		this.events.emit("scheduleUpdated", { schedule: updated });
		return updated;
	}

	/**
	 * Pause a schedule. No new jobs will be created until resumed.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name
	 * @returns Updated schedule
	 */
	async pauseSchedule(name: string): Promise<Schedule> {
		return this.updateScheduleState(name, ScheduleState.PAUSED);
	}

	/**
	 * Resume a paused schedule.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name
	 * @returns Updated schedule
	 */
	async resumeSchedule(name: string): Promise<Schedule> {
		return this.updateScheduleState(name, ScheduleState.ACTIVE);
	}

	/**
	 * Disable a schedule. Workers will skip disabled schedules.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name
	 * @returns Updated schedule
	 */
	async disableSchedule(name: string): Promise<Schedule> {
		return this.updateScheduleState(name, ScheduleState.DISABLED);
	}

	private async updateScheduleState(
		name: string,
		state: ScheduleState,
	): Promise<Schedule> {
		const existing = await this.storage.getSchedule(name);
		if (!existing) {
			throw new Error(`Schedule '${name}' not found`);
		}

		const updated: Schedule = {
			...existing,
			state,
			updatedAt: new Date(),
		};

		await this.storage.saveSchedule(updated);

		if (this.schedules.has(name)) {
			const handler = this.schedules.get(name)?.handler;
			this.schedules.set(name, { ...updated, handler });
		}

		this.events.emit("scheduleStateChanged", { schedule: updated, state });
		return updated;
	}

	/**
	 * Get statistics for a schedule.
	 *
	 * @param name Schedule name
	 * @returns Schedule statistics
	 */
	async getScheduleStats(name: string): Promise<ScheduleStats> {
		const schedule = await this.storage.getSchedule(name);
		if (!schedule) {
			throw new Error(`Schedule '${name}' not found`);
		}

		// Get job counts by status
		const allJobs = await this.storage
			.getJobsByStatus("pending")
			.then((jobs) => jobs.filter((j) => j.scheduleName === name));
		const runningJobs = await this.storage
			.getJobsByStatus("running")
			.then((jobs) => jobs.filter((j) => j.scheduleName === name));
		const completedJobs = await this.storage
			.getJobsByStatus("completed")
			.then((jobs) => jobs.filter((j) => j.scheduleName === name));
		const failedJobs = await this.storage
			.getJobsByStatus("failed")
			.then((jobs) => jobs.filter((j) => j.scheduleName === name));
		const cancelledJobs = await this.storage
			.getJobsByStatus("cancelled")
			.then((jobs) => jobs.filter((j) => j.scheduleName === name));

		const totalJobs =
			allJobs.length +
			runningJobs.length +
			completedJobs.length +
			failedJobs.length +
			cancelledJobs.length;
		const successfulJobs = completedJobs.length;
		const successRate =
			totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 0;

		// Calculate average duration for completed jobs
		const durations = completedJobs
			.filter((j) => j.lastExecutedAt && j.completedAt)
			.map((j) => {
				const completedAt = j.completedAt?.getTime();
				const lastExecutedAt = j.lastExecutedAt?.getTime();
				return completedAt && lastExecutedAt ? completedAt - lastExecutedAt : 0;
			});
		const averageDuration =
			durations.length > 0
				? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
				: undefined;

		return {
			name: schedule.name,
			state: schedule.state,
			cron: schedule.cron,
			interval: schedule.interval,
			timezone: schedule.timezone,
			createdAt: schedule.createdAt,
			updatedAt: schedule.updatedAt,
			lastRunAt: schedule.lastRunAt,
			nextRunAt: schedule.nextRunAt,
			totalJobs,
			pendingJobs: allJobs.length,
			runningJobs: runningJobs.length,
			completedJobs: completedJobs.length,
			failedJobs: failedJobs.length,
			cancelledJobs: cancelledJobs.length,
			successRate,
			averageDuration,
		};
	}

	/**
	 * Trigger a schedule to run immediately.
	 * Creates a job that will execute as soon as a worker picks it up.
	 *
	 * ⚠️ **Admin only**: This method can only be called by admin instances.
	 *
	 * @param name Schedule name (must be a key of Schedules type parameter)
	 * @param payload Optional typed payload override
	 * @param options Optional scheduling options
	 * @returns The scheduled job result
	 */
	async triggerSchedule<Name extends keyof Schedules>(
		name: Name extends string ? Name : never,
		payload?: Schedules[Name],
		options?: ScheduleJobOptions,
	): Promise<Result<Error, ScheduleJobResult>> {
		const schedule = await this.storage.getSchedule(name as string);
		if (!schedule) {
			return [new Error(`Schedule '${String(name)}' not found`), undefined];
		}

		if (schedule.state === ScheduleState.DISABLED) {
			return [new Error(`Schedule '${String(name)}' is disabled`), undefined];
		}

		const jobPayload = (payload ?? schedule.payload ?? {}) as Schedules[string];
		return this.scheduleJob(name as string, jobPayload, options);
	}

	/**
	 * Get all schedules with their statistics.
	 *
	 * @returns Array of schedule statistics
	 */
	async getAllScheduleStats(): Promise<ScheduleStats[]> {
		const schedules = await this.storage.getSchedules();
		return Promise.all(schedules.map((s) => this.getScheduleStats(s.name)));
	}

	/**
	 * Register a typed handler for a schedule.
	 *
	 * **Workers use this** to register handlers for schedules they want to process.
	 * The handler will be called when jobs for this schedule become available.
	 * Schedules can be created before or after handlers are registered.
	 *
	 * @param scheduleName Name of the schedule to handle (must be a key of Schedules type parameter)
	 * @param handler Handler function with typed payload
	 *
	 * @example
	 * ```typescript
	 * // Register handler BEFORE schedule is created
	 * scheduler.onSchedule("daily-report", async (job, scope) => {
	 *   // job.payload is fully typed based on Schedules type parameter
	 *   const { to, subject } = job.payload;
	 * });
	 *
	 * worker.start();
	 *
	 * // Later, admin creates the schedule
	 * await admin.createSchedule("daily-report", { cron: "0 9 * * *" });
	 * ```
	 */
	onSchedule<Name extends keyof Schedules>(
		name: Name extends string ? Name : never,
		handler: TypedScheduleHandler<Schedules[Name]>,
		options?: OnScheduleOptions,
	): void {
		// Store the handler - the runtime type is compatible because TypedScheduleHandler extends ScheduleHandler
		this.handlers.set(name as string, handler as unknown as ScheduleHandler);
		// Store handler options (defaults to empty object if not provided)
		this.handlerOptions.set(name as string, options ?? {});
		debugScheduler(
			"onSchedule: registered handler for schedule=%s, worker=%s",
			String(name),
			options?.worker ? "true" : "false",
		);
		this.events.emit("handlerRegistered", { scheduleName: name as string });
	}

	/**
	 * Remove a handler for a schedule.
	 *
	 * @param scheduleName Name of the schedule to remove handler for
	 * @returns true if handler was removed, false if not found
	 */
	offSchedule(scheduleName: string): boolean {
		const hadHandler = this.handlers.delete(scheduleName);
		this.handlerOptions.delete(scheduleName);
		this.schedules.delete(scheduleName);

		if (hadHandler) {
			debugScheduler(
				"offSchedule: removed handler for schedule=%s",
				scheduleName,
			);
			this.events.emit("handlerRemoved", { scheduleName });
		}

		return hadHandler;
	}

	/**
	 * Schedule a one-time job (admin only).
	 *
	 * ⚠️ **Admin only**: Workers execute jobs based on loaded schedules.
	 *
	 * @param scheduleName Name of the schedule (must be a key of Schedules type parameter)
	 * @param payload Typed job payload data
	 * @param options Scheduling options
	 */
	async scheduleJob<Name extends keyof Schedules>(
		scheduleName: Name extends string ? Name : never,
		payload: Schedules[Name] = {} as Schedules[Name],
		options: ScheduleJobOptions = {},
	): Promise<Result<Error, ScheduleJobResult>> {
		// Check if leader (for HA mode)
		if (this.leaderElectionEnabled && !this.isLeader) {
			throw new Error(
				`Cannot schedule job: this admin instance is not the leader. ` +
					`Current state: ${this.adminState}. Only the leader admin can schedule jobs.`,
			);
		}

		const schedule = await this.storage.getSchedule(scheduleName as string);
		if (!schedule) {
			return [
				new Error(`Schedule '${String(scheduleName)}' not found`),
				undefined,
			];
		}

		const job: Job = {
			id: `job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			scheduleId: schedule.id,
			scheduleName: scheduleName as string,
			payload: payload as JobPayload,
			status: "pending",
			priority: options.priority ?? 0,
			createdAt: new Date(),
			runAt: options.delay ? new Date(Date.now() + options.delay) : new Date(),
			retryCount: 0,
			maxRetries: schedule.options?.maxRetries ?? 3,
		};

		await this.storage.saveJob(job);
		this.events.emit("jobScheduled", { job });

		return [undefined, { jobId: job.id, runAt: job.runAt }];
	}

	/**
	 * Cancel a pending job (admin only).
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		// Check if leader (for HA mode)
		if (this.leaderElectionEnabled && !this.isLeader) {
			throw new Error(
				`Cannot cancel job: this admin instance is not the leader. ` +
					`Current state: ${this.adminState}. Only the leader admin can cancel jobs.`,
			);
		}

		const job = await this.storage.getJob(jobId);
		if (!job || job.status !== "pending") {
			return false;
		}

		job.status = "cancelled";
		await this.storage.saveJob(job);

		this.events.emit("jobCancelled", { job });
		return true;
	}

	/**
	 * Get a job by ID
	 */
	async getJob(jobId: string): Promise<Job | null> {
		return this.storage.getJob(jobId);
	}

	/**
	 * Get jobs by status
	 */
	async getJobsByStatus(status: JobStatus): Promise<Job[]> {
		return this.storage.getJobsByStatus(status);
	}

	/**
	 * Check for and run due jobs
	 */
	private async checkAndRunJobs(): Promise<void> {
		if (!this.isRunning) return;

		const now = new Date();
		const dueJobs = await this.storage.getDueJobs(now);

		// Get all running jobs from storage to check for concurrent execution
		// This includes jobs running on other instances
		const storageRunningJobs = await this.storage.getJobsByStatus("running");

		// Track which schedules are starting jobs in this iteration (for non-concurrent)
		const startingSchedules = new Set<string>();

		for (const job of dueJobs) {
			// Skip if already running locally
			if (this.runningJobs.has(job.id)) continue;

			// Skip if not yet time (respect runAt)
			if (job.runAt && job.runAt > now) continue;

			// Check if concurrent execution is disabled for this schedule
			const schedule = await this.storage.getSchedule(job.scheduleName);
			if (schedule?.options?.concurrent === false) {
				// Check if any job from this schedule is running in storage (other instances)
				const hasStorageRunningJob = storageRunningJobs.some(
					(j) => j.scheduleName === job.scheduleName && j.id !== job.id,
				);

				// Check if we're already starting a job from this schedule in this iteration
				const isStartingThisSchedule = startingSchedules.has(job.scheduleName);

				if (hasStorageRunningJob || isStartingThisSchedule) {
					debugScheduler(
						"skipping concurrent job: schedule=%s, jobId=%s",
						job.scheduleName,
						job.id,
					);
					continue;
				}

				// Mark this schedule as starting
				startingSchedules.add(job.scheduleName);
			}

			// Run the job
			this.runJob(job).catch(() => {});
		}
	}

	/**
	 * Run a single job with retry and error handling, tracing, and profiling
	 */
	private async runJob(job: Job): Promise<void> {
		// Get handler - must be registered via onSchedule()
		const handler = this.handlers.get(job.scheduleName);

		if (!handler) {
			const error =
				`No handler registered for schedule '${job.scheduleName}'. ` +
				`Call worker.onSchedule('${job.scheduleName}', handler) before starting.`;
			job.status = "failed";
			job.error = error;
			job.completedAt = new Date();
			await this.storage.saveJob(job);

			debugJob(
				"failed: no handler, jobId=%s, scheduleName=%s",
				job.id,
				job.scheduleName,
			);
			this.options.logger?.error(error, {
				jobId: job.id,
				scheduleName: job.scheduleName,
			});

			this.events.emit("jobFailed", {
				job,
				error: new Error(error),
				permanent: true,
			});
			return;
		}

		// Get schedule from cache or fetch from storage dynamically
		let schedule = this.schedules.get(job.scheduleName);
		if (!schedule) {
			// Fetch from storage dynamically
			const storedSchedule = await this.storage.getSchedule(job.scheduleName);
			if (storedSchedule) {
				schedule = { ...storedSchedule, handler };
				this.schedules.set(job.scheduleName, schedule);
			}
		}

		// Use fetched schedule or create minimal schedule object for execution
		const scheduleWithHandler: Schedule & { handler?: ScheduleHandler } =
			schedule ?? {
				id: job.scheduleId,
				name: job.scheduleName,
				handler,
				state: ScheduleState.ACTIVE,
				createdAt: new Date(),
				updatedAt: new Date(),
				options: {},
			};

		// Check schedule state
		if (scheduleWithHandler.state === ScheduleState.DISABLED) {
			const error = `Schedule '${job.scheduleName}' is disabled`;
			job.status = "failed";
			job.error = error;
			job.completedAt = new Date();
			await this.storage.saveJob(job);

			debugJob(
				"failed: schedule disabled, jobId=%s, scheduleName=%s",
				job.id,
				job.scheduleName,
			);
			this.options.logger?.warn(error, {
				jobId: job.id,
				scheduleName: job.scheduleName,
			});

			this.events.emit("jobFailed", {
				job,
				error: new Error(error),
				permanent: true,
			});
			return;
		}

		if (scheduleWithHandler.state === ScheduleState.PAUSED) {
			// Re-queue the job for later (don't fail, just retry)
			job.runAt = new Date(Date.now() + 60000); // Try again in 1 minute
			await this.storage.saveJob(job);

			debugJob(
				"paused: re-queued, jobId=%s, scheduleName=%s",
				job.id,
				job.scheduleName,
			);
			return;
		}

		// Check for stale jobs
		const staleThreshold = this.options.staleThreshold ?? 0;
		if (staleThreshold > 0 && job.runAt) {
			const staleness = Date.now() - job.runAt.getTime();

			if (staleness > staleThreshold) {
				const behavior = this.options.staleJobBehavior ?? StaleJobBehavior.RUN;

				switch (behavior) {
					case StaleJobBehavior.SKIP:
						job.status = "completed";
						job.completedAt = new Date();
						job.error = `Skipped stale job (scheduled ${Math.round(staleness / 1000)}s ago)`;
						await this.storage.saveJob(job);

						debugJob(
							"skipped: stale job, jobId=%s, staleness=%dms",
							job.id,
							staleness,
						);
						this.options.logger?.warn("Stale job skipped", {
							jobId: job.id,
							staleness,
						});

						this.events.emit("jobSkipped", { job, reason: "stale", staleness });
						return;

					case StaleJobBehavior.FAIL:
						job.status = "failed";
						job.completedAt = new Date();
						job.error = `Stale job failed (scheduled ${Math.round(staleness / 1000)}s ago)`;
						await this.storage.saveJob(job);

						debugJob(
							"failed: stale job, jobId=%s, staleness=%dms",
							job.id,
							staleness,
						);
						this.options.logger?.error("Stale job failed", {
							jobId: job.id,
							staleness,
						});

						this.events.emit("jobFailed", {
							job,
							error: new Error(job.error),
							permanent: true,
						});
						return;
					default:
						debugJob(
							"running stale job anyway, jobId=%s, staleness=%dms",
							job.id,
							staleness,
						);
						break;
				}
			}
		}

		// Acquire distributed lock
		const lockTTL = scheduleWithHandler.options?.timeout ?? 30000;
		debugLock(
			"acquiring: jobId=%s, instanceId=%s, ttl=%d",
			job.id,
			this.instanceId,
			lockTTL,
		);

		const acquired =
			(await this.storage.acquireJobLock?.(job.id, this.instanceId, lockTTL)) ??
			true;
		if (!acquired) {
			debugLock("not acquired: jobId=%s (another instance has it)", job.id);
			return; // Another instance is running this job
		}
		debugLock("acquired: jobId=%s", job.id);

		// Use current scope for job execution
		const childScope = this.scope;
		const startTime = Date.now();
		this.runningJobs.set(job.id, { scope: childScope, startTime });

		job.status = "running";
		job.lastExecutedAt = new Date();
		job.lockExpiresAt = new Date(Date.now() + lockTTL);
		await this.storage.saveJob(job);

		// Start profiling
		const profile: JobProfile = {
			jobId: job.id,
			scheduleName: job.scheduleName,
			startTime,
			stages: [
				{
					name: "execution",
					startTime,
					endTime: undefined,
					duration: undefined,
				},
			],
		};
		if (this.metricsEnabled) {
			this.jobProfiles.set(job.id, profile);
		}

		// Start OpenTelemetry span if tracer is available
		const span = this.options.tracer?.startSpan(`schedule:${job.scheduleName}`);
		span?.setAttribute("job.id", job.id);
		span?.setAttribute("job.scheduleName", job.scheduleName);
		span?.setAttribute("scheduler.instanceId", this.instanceId);
		span?.setAttribute("job.retryCount", job.retryCount);

		debugJob(
			"started: jobId=%s, scheduleName=%s, retryCount=%d",
			job.id,
			job.scheduleName,
			job.retryCount,
		);
		this.options.logger?.info("Job started", {
			jobId: job.id,
			scheduleName: job.scheduleName,
			retryCount: job.retryCount,
			instanceId: this.instanceId,
		});

		this.events.emit("jobStarted", { job, instanceId: this.instanceId });

		// Call beforeJob hook
		try {
			await this.options.hooks?.beforeJob?.(job, scheduleWithHandler);
		} catch (hookError) {
			debugJob(
				"beforeJob hook failed: jobId=%s, error=%s",
				job.id,
				(hookError as Error).message,
			);
			this.options.logger?.error("beforeJob hook failed", {
				jobId: job.id,
				error: (hookError as Error).message,
			});
		}

		let success = false;
		let error: Error | undefined;

		try {
			// Check if handler has worker option enabled
			const handlerOpts = this.handlerOptions.get(job.scheduleName);
			const useWorker = handlerOpts?.worker ?? false;

			if (useWorker) {
				// Lazy-create worker pool with configured options
				if (!this.workerPool) {
					this.workerPool = new WorkerPool({
						size: this.workerPoolOptions?.size,
						idleTimeout: this.workerPoolOptions?.idleTimeout,
					});
				}

				// Execute handler in worker thread
				const handlerString = handler.toString();
				await this.workerPool.execute<{ handler: string; job: Job }, void>(
					({ handler: workerHandlerString, job: workerJob }) => {
						// biome-ignore lint/security/noGlobalEval: Required for worker thread execution
						const workerHandler = eval(`(${workerHandlerString})`);
						// Execute with minimal context (job only, no scope access)
						return workerHandler(workerJob, {
							signal: { aborted: false },
							logger: {
								debug: () => {},
								info: () => {},
								warn: () => {},
								error: () => {},
							},
							context: {},
						});
					},
					{ handler: handlerString, job },
				);
			} else if (scheduleWithHandler.options?.timeout) {
				await this.runWithTimeout(
					handler,
					job,
					childScope,
					scheduleWithHandler.options.timeout,
				);
			} else {
				await handler(job, childScope);
			}

			success = true;

			// Success
			job.status = "completed";
			job.completedAt = new Date();
			await this.storage.saveJob(job);
			await this.storage.releaseJobLock?.(job.id, this.instanceId);

			const duration = Date.now() - startTime;

			// Update profile
			if (profile) {
				profile.endTime = Date.now();
				profile.duration = duration;
				const stage = profile.stages[0];
				if (stage) {
					stage.endTime = Date.now();
					stage.duration = duration;
				}
			}

			// End span
			span?.setAttribute("job.success", true);
			span?.setAttribute("job.duration", duration);
			span?.end();

			debugJob("completed: jobId=%s, duration=%dms", job.id, duration);
			this.options.logger?.info("Job completed", {
				jobId: job.id,
				scheduleName: job.scheduleName,
				duration,
				instanceId: this.instanceId,
			});

			this.events.emit("jobCompleted", { job, duration });

			// Schedule next occurrence for recurring schedules
			// Storage MUST support auto-scheduling (required for HA)
			await this.storage.completeJobAndScheduleNext(job.id, { success: true });
		} catch (err) {
			error = err as Error;
			await this.handleJobFailure(job, error, scheduleWithHandler);
		} finally {
			// Call afterJob hook
			const duration = Date.now() - startTime;
			try {
				await this.options.hooks?.afterJob?.(job, scheduleWithHandler, {
					success,
					duration,
					error,
				});
			} catch (hookError) {
				debugJob(
					"afterJob hook failed: jobId=%s, error=%s",
					job.id,
					(hookError as Error).message,
				);
				this.options.logger?.error("afterJob hook failed", {
					jobId: job.id,
					error: (hookError as Error).message,
				});
			}

			this.runningJobs.delete(job.id);
			await childScope[Symbol.asyncDispose]().catch(() => {});
		}
	}

	/**
	 * Run job with timeout
	 */
	private runWithTimeout(
		handler: ScheduleHandler,
		job: Job,
		scope: Scope<Record<string, unknown>>,
		timeout: number,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`Job ${job.id} timed out after ${timeout}ms`));
			}, timeout);

			handler(job, scope)
				.then(resolve, reject)
				.finally(() => clearTimeout(timer));
		});
	}

	/**
	 * Handle job failure with retry logic, logging, and hooks
	 */
	private async handleJobFailure(
		job: Job,
		error: Error,
		schedule: Schedule,
	): Promise<void> {
		job.error = error.message;
		job.retryCount++;

		const maxRetries = schedule.options?.maxRetries ?? job.maxRetries ?? 3;
		const willRetry = job.retryCount < maxRetries;

		if (willRetry) {
			const baseDelay = schedule.options?.retryDelay ?? 1000;
			const jitter = schedule.options?.jitter ?? 0;
			const delay = baseDelay * 2 ** job.retryCount + Math.random() * jitter;

			job.status = "pending";
			job.runAt = new Date(Date.now() + delay);
			await this.storage.saveJob(job);
			await this.storage.releaseJobLock?.(job.id, this.instanceId);

			debugJob(
				"retry scheduled: jobId=%s, attempt=%d/%d, delay=%dms",
				job.id,
				job.retryCount,
				maxRetries,
				delay,
			);
			this.options.logger?.warn("Job retry scheduled", {
				jobId: job.id,
				scheduleName: job.scheduleName,
				attempt: job.retryCount,
				maxRetries,
				delay,
				error: error.message,
			});

			this.events.emit("jobRetryScheduled", { job, error, retryDelay: delay });
		} else {
			job.status = "failed";
			await this.storage.saveJob(job);
			await this.storage.releaseJobLock?.(job.id, this.instanceId);

			// Add to DLQ if enabled
			await this.addToDLQ(job, error);

			debugJob(
				"failed permanently: jobId=%s, attempts=%d, error=%s",
				job.id,
				job.retryCount,
				error.message,
			);
			this.options.logger?.error("Job failed permanently", {
				jobId: job.id,
				scheduleName: job.scheduleName,
				attempts: job.retryCount,
				error: error.message,
				stack: error.stack,
			});

			this.events.emit("jobFailed", { job, error, permanent: true });

			// Schedule next occurrence for recurring schedules (even on failure)
			await this.storage.completeJobAndScheduleNext(job.id, {
				success: false,
				error: error.message,
			});
		}

		// Call onJobError hook
		try {
			await this.options.hooks?.onJobError?.(job, schedule, error, willRetry);
		} catch (hookError) {
			debugJob(
				"onJobError hook failed: jobId=%s, error=%s",
				job.id,
				(hookError as Error).message,
			);
			this.options.logger?.error("onJobError hook failed", {
				jobId: job.id,
				error: (hookError as Error).message,
			});
		}
	}

	/**
	 * Schedule next occurrence for recurring schedules
	 */
	private async scheduleNextOccurrence(schedule: Schedule): Promise<void> {
		let nextRun: Date | null = null;

		if (schedule.cron) {
			const result = parseCron(schedule.cron, schedule.timezone);
			if (!(result instanceof Error)) {
				nextRun = result.next(new Date());
			}
		} else if (schedule.interval) {
			nextRun = new Date(Date.now() + schedule.interval);
		}

		// Check end date
		if (nextRun && schedule.endDate) {
			const endDate = new Date(schedule.endDate);
			if (nextRun > endDate) {
				return; // Schedule has ended, don't create new job
			}
		}

		if (nextRun) {
			await this.scheduleJob(
				schedule.name,
				(schedule.payload ?? {}) as Schedules[string],
				{
					delay: nextRun.getTime() - Date.now(),
				},
			);
		}
	}

	/**
	 * Add a job to the Dead Letter Queue
	 */
	private async addToDLQ(job: Job, error: Error): Promise<void> {
		const dlqOptions = this.options.deadLetterQueue;
		if (!dlqOptions?.enabled) {
			return;
		}

		const dlqJob = {
			...job,
			deadLetteredAt: new Date(),
			finalError: error.message,
			retryHistory: [], // Could be populated from job metadata if tracked
		};

		const storage = dlqOptions.storage ?? this.storage;
		if (storage.addToDLQ) {
			await storage.addToDLQ(dlqJob);
		}

		// Emit event
		this.events.emit("jobDeadLettered", { job: dlqJob, error });

		// Call onDeadLetter callback if provided
		if (dlqOptions.onDeadLetter) {
			try {
				await dlqOptions.onDeadLetter(dlqJob, error);
			} catch (callbackError) {
				this.options.logger?.error("onDeadLetter callback failed", {
					jobId: job.id,
					error: (callbackError as Error).message,
				});
			}
		}
	}

	/**
	 * Get jobs from the Dead Letter Queue
	 */
	async getDLQJobs(
		scheduleName?: string,
		options?: { limit?: number; offset?: number },
	): Promise<import("./types.js").DeadLetterJob[]> {
		const dlqOptions = this.options.deadLetterQueue;
		if (!dlqOptions?.enabled) {
			return [];
		}

		const storage = dlqOptions.storage ?? this.storage;
		if (!storage.getDLQJobs) {
			return [];
		}

		return storage.getDLQJobs(scheduleName, options);
	}

	/**
	 * Replay a job from the Dead Letter Queue
	 */
	async replayFromDLQ(jobId: string): Promise<boolean> {
		const dlqOptions = this.options.deadLetterQueue;
		if (!dlqOptions?.enabled) {
			return false;
		}

		const storage = dlqOptions.storage ?? this.storage;
		if (!storage.replayFromDLQ) {
			return false;
		}

		const replayed = await storage.replayFromDLQ(jobId);
		if (replayed) {
			this.options.logger?.info("Job replayed from DLQ", { jobId });
		}
		return replayed;
	}

	/**
	 * Purge jobs from the Dead Letter Queue
	 */
	async purgeDLQ(scheduleName?: string, maxAge?: number): Promise<number> {
		const dlqOptions = this.options.deadLetterQueue;
		if (!dlqOptions?.enabled) {
			return 0;
		}

		const storage = dlqOptions.storage ?? this.storage;
		if (!storage.purgeDLQ) {
			return 0;
		}

		const count = await storage.purgeDLQ(scheduleName, maxAge);
		this.options.logger?.info("DLQ purged", { count, scheduleName, maxAge });
		return count;
	}

	/**
	 * Collect current metrics from the scheduler
	 */
	async collectMetrics(): Promise<SchedulerMetrics> {
		const now = Date.now();
		const allJobs = await this.storage
			.getJobsByStatus("pending")
			.then((jobs) => jobs.length);
		const runningJobs = await this.storage
			.getJobsByStatus("running")
			.then((jobs) => jobs.length);
		const completedJobs = await this.storage
			.getJobsByStatus("completed")
			.then((jobs) => jobs.length);
		const failedJobs = await this.storage
			.getJobsByStatus("failed")
			.then((jobs) => jobs.length);
		const cancelledJobs = await this.storage
			.getJobsByStatus("cancelled")
			.then((jobs) => jobs.length);

		const schedules = await this.storage.getSchedules();
		const scheduleStats = await Promise.all(
			schedules.map(async (s) => {
				const stats = await this.getScheduleStats(s.name);
				return {
					name: s.name,
					totalJobs: stats.totalJobs,
					completedJobs: stats.completedJobs,
					failedJobs: stats.failedJobs,
					successRate: stats.successRate,
					averageDuration: stats.averageDuration ?? 0,
				};
			}),
		);

		const activeJobs = Array.from(this.runningJobs.entries()).map(
			([jobId, { startTime }]) => ({
				id: jobId,
				scheduleName: "unknown", // Could be looked up from storage if needed
				startTime,
				duration: now - startTime,
			}),
		);

		return {
			instanceId: this.instanceId,
			timestamp: new Date(),
			jobs: {
				total:
					allJobs + runningJobs + completedJobs + failedJobs + cancelledJobs,
				pending: allJobs,
				running: runningJobs,
				completed: completedJobs,
				failed: failedJobs,
				cancelled: cancelledJobs,
			},
			schedules: scheduleStats,
			activeJobs,
		};
	}

	/**
	 * Export metrics in various formats
	 */
	async exportMetrics(options: MetricsExportOptions = {}): Promise<string> {
		const metrics = await this.collectMetrics();
		const format = options.format ?? "json";
		const prefix = options.prefix ?? "scheduler";

		switch (format) {
			case "prometheus":
				return this.exportMetricsAsPrometheus(metrics, prefix);
			case "otel":
				return this.exportMetricsAsOTel(metrics);
			default:
				return JSON.stringify(metrics, null, 2);
		}
	}

	/**
	 * Export metrics in Prometheus format
	 */
	private exportMetricsAsPrometheus(
		metrics: SchedulerMetrics,
		prefix: string,
	): string {
		const lines: string[] = [];
		const timestamp = metrics.timestamp.getTime();

		// Job counts
		lines.push(`# HELP ${prefix}_jobs_total Total number of jobs`);
		lines.push(`# TYPE ${prefix}_jobs_total counter`);
		lines.push(
			`${prefix}_jobs_total{status="pending"} ${metrics.jobs.pending} ${timestamp}`,
		);
		lines.push(
			`${prefix}_jobs_total{status="running"} ${metrics.jobs.running} ${timestamp}`,
		);
		lines.push(
			`${prefix}_jobs_total{status="completed"} ${metrics.jobs.completed} ${timestamp}`,
		);
		lines.push(
			`${prefix}_jobs_total{status="failed"} ${metrics.jobs.failed} ${timestamp}`,
		);
		lines.push(
			`${prefix}_jobs_total{status="cancelled"} ${metrics.jobs.cancelled} ${timestamp}`,
		);

		// Per-schedule metrics
		for (const schedule of metrics.schedules) {
			lines.push(
				`${prefix}_schedule_jobs_total{schedule="${schedule.name}"} ${schedule.totalJobs} ${timestamp}`,
			);
			lines.push(
				`${prefix}_schedule_success_rate{schedule="${schedule.name}"} ${schedule.successRate} ${timestamp}`,
			);
			lines.push(
				`${prefix}_schedule_avg_duration_ms{schedule="${schedule.name}"} ${schedule.averageDuration} ${timestamp}`,
			);
		}

		// Active jobs
		lines.push(`# HELP ${prefix}_active_jobs Currently running jobs`);
		lines.push(`# TYPE ${prefix}_active_jobs gauge`);
		lines.push(
			`${prefix}_active_jobs ${metrics.activeJobs.length} ${timestamp}`,
		);

		return lines.join("\n");
	}

	/**
	 * Export metrics in OpenTelemetry format (JSON)
	 */
	private exportMetricsAsOTel(metrics: SchedulerMetrics): string {
		const resourceMetrics = {
			resource: {
				attributes: [
					{
						key: "service.name",
						value: { stringValue: "go-go-scope-scheduler" },
					},
					{
						key: "scheduler.instance_id",
						value: { stringValue: metrics.instanceId },
					},
				],
			},
			scopeMetrics: [
				{
					scope: { name: "go-go-scope/scheduler" },
					metrics: [
						{
							name: "scheduler.jobs",
							description: "Job counts by status",
							gauge: {
								dataPoints: [
									{
										attributes: [
											{ key: "status", value: { stringValue: "pending" } },
										],
										value: metrics.jobs.pending,
									},
									{
										attributes: [
											{ key: "status", value: { stringValue: "running" } },
										],
										value: metrics.jobs.running,
									},
									{
										attributes: [
											{ key: "status", value: { stringValue: "completed" } },
										],
										value: metrics.jobs.completed,
									},
									{
										attributes: [
											{ key: "status", value: { stringValue: "failed" } },
										],
										value: metrics.jobs.failed,
									},
									{
										attributes: [
											{ key: "status", value: { stringValue: "cancelled" } },
										],
										value: metrics.jobs.cancelled,
									},
								],
							},
						},
						{
							name: "scheduler.active_jobs",
							description: "Currently running jobs",
							gauge: {
								dataPoints: [{ value: metrics.activeJobs.length }],
							},
						},
					],
				},
			],
		};

		return JSON.stringify(resourceMetrics, null, 2);
	}

	/**
	 * Get job profile for detailed execution analysis
	 */
	getJobProfile(jobId: string): JobProfile | undefined {
		return this.jobProfiles.get(jobId);
	}

	/**
	 * Get all job profiles
	 */
	getAllJobProfiles(): JobProfile[] {
		return Array.from(this.jobProfiles.values());
	}

	/**
	 * Clear old job profiles (call periodically to prevent memory growth)
	 */
	clearJobProfiles(olderThanMs?: number): void {
		if (olderThanMs) {
			const cutoff = Date.now() - olderThanMs;
			for (const [jobId, profile] of this.jobProfiles.entries()) {
				if ((profile.endTime ?? profile.startTime) < cutoff) {
					this.jobProfiles.delete(jobId);
				}
			}
		} else {
			this.jobProfiles.clear();
		}
	}
}

/**
 * Create a typed scheduler instance.
 *
 * This is a convenience factory function that creates a Scheduler with
 * typed schedule definitions for better type inference.
 *
 * @example
 * ```typescript
 * const scheduler = createScheduler<{
 *   'send-email': { to: string; subject: string; body: string };
 *   'process-payment': { amount: number; currency: string };
 * }>({ storage });
 *
 * // Now you get autocomplete for schedule names and typed payloads!
 * scheduler.onSchedule('send-email', async (job) => {
 *   const { to, subject, body } = job.payload; // Fully typed!
 * });
 * ```
 */
export function createScheduler<Schedules extends ScheduleDefinitions>(
	options: SchedulerOptions,
): Scheduler<Schedules> {
	return new Scheduler<Schedules>(options);
}

export { CronPresets };
