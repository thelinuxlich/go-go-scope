/**
 * Production-ready distributed job scheduler
 * 
 * Architecture: Admin + Workers Pattern (Mandatory)
 * 
 * - **Admin Instance**: Creates and manages schedules. Only the admin can call
 *   `createSchedule()` and `deleteSchedule()`. There should typically be only
 *   one admin instance running at a time.
 * 
 * - **Worker Instances**: Load schedules from storage and execute jobs.
 *   Workers call `loadSchedules()` to get schedule definitions and provide
 *   handler functions. Multiple workers can run for high availability.
 * 
 * @example
 * ```typescript
 * // Admin instance
 * const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage });
 * await admin.createSchedule("daily-report", {
 *   cron: "0 9 * * *",
 *   timezone: "America/New_York",
 * });
 * 
 * // Worker instance
 * const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage });
 * await worker.loadSchedules({
 *   handlerFactory: (name, schedule) => {
 *     if (name === "daily-report") {
 *       return async (job, scope) => { // generate report
 *       };
 *     }
 *     return null;
 *   }
 * });
 * worker.start();
 * ```
 * 
 * @module go-go-scope/scheduler
 */

import type { Scope } from "go-go-scope";
import { scope } from "go-go-scope";
import type { Result } from "go-go-scope";
import createDebug from "debug";
import { parseCron, CronPresets } from "./cron.js";

import {
  type Job,
  type JobStatus,
  type Schedule,
  type ScheduleStats,
  type SchedulerOptions,
  type JobStorage,
  type JobPayload,
  type SchedulerEvents,
  type ScheduleJobResult,
  type CreateScheduleOptions,
  type UpdateScheduleOptions,
  type LoadSchedulesOptions,
  type ScheduleHandler,
  type SchedulerMetrics,
  type MetricsExportOptions,
  type JobProfile,
  InMemoryJobStorage,
  SchedulerRole,
  ScheduleState,
  StaleJobBehavior,
  SCHEDULER_VERSION,
} from "./types.js";

// Debug loggers
const debugScheduler = createDebug("go-go-scope:scheduler");
const debugJob = createDebug("go-go-scope:scheduler:job");
const debugLock = createDebug("go-go-scope:scheduler:lock");

/**
 * Typed event emitter for scheduler events
 */
class SchedulerEventEmitter {
  private listeners: { [K in keyof SchedulerEvents]?: Array<SchedulerEvents[K]> } = {};

  on<K extends keyof SchedulerEvents>(event: K, listener: SchedulerEvents[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as Array<SchedulerEvents[K]>).push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof SchedulerEvents>(event: K, listener: SchedulerEvents[K]): void {
    const arr = this.listeners[event];
    if (arr) {
      const idx = (arr as unknown[]).indexOf(listener);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  emit<K extends keyof SchedulerEvents>(event: K, ...args: Parameters<SchedulerEvents[K]>): void {
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
 */
export class Scheduler implements AsyncDisposable {
  readonly version = SCHEDULER_VERSION;
  readonly role: SchedulerRole;
  
  private scope: Scope;
  private internalScope: Scope | null = null;  // Track if we created the scope internally
  private storage: JobStorage;
  private instanceId: string;
  private isRunning = false;
  private checkInterval: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private runningJobs = new Map<string, { scope: Scope; startTime: number }>();
  private schedules = new Map<string, Schedule & { handler?: ScheduleHandler }>();
  private handlers = new Map<string, ScheduleHandler>();
  private events = new SchedulerEventEmitter();
  private options: SchedulerOptions;
  private reloadTimer: ReturnType<typeof setInterval> | null = null;
  private metricsEnabled: boolean;
  private jobProfiles = new Map<string, JobProfile>();
  private deadlockCheckTimer: ReturnType<typeof setInterval> | null = null;
  [Symbol.asyncDispose]!: () => Promise<void>;

  constructor(options: SchedulerOptions) {
    if (!options.role) {
      throw new Error(
        "Scheduler role is required. Use SchedulerRole.ADMIN for admin instances " +
        "or SchedulerRole.WORKER for worker instances."
      );
    }
    
    this.options = options;
    this.role = options.role;
    
    // Create internal scope if not provided
    if (options.scope) {
      this.scope = options.scope;
    } else {
      this.internalScope = scope({ name: `scheduler-${options.role}` });
      this.scope = this.internalScope;
    }
    
    this.storage = options.storage ?? new InMemoryJobStorage();
    this.checkInterval = options.checkInterval ?? 1000;
    this.metricsEnabled = options.metrics ?? false;
    this.instanceId = `scheduler-${options.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Bind dispose method
    this[Symbol.asyncDispose] = async () => {
      await this.stop();
    };

    // Setup deadlock detection if enabled
    if (options.deadlockThreshold && options.deadlockThreshold > 0) {
      this.startDeadlockDetection(options.deadlockThreshold);
    }

    // Auto-start if not disabled
    if (options.autoStart !== false) {
      this.start();
    }

    debugScheduler("created: role=%s, instanceId=%s, internalScope=%s", this.role, this.instanceId, this.internalScope !== null);
  }

  /**
   * Start deadlock detection timer
   */
  private startDeadlockDetection(threshold: number): void {
    this.deadlockCheckTimer = setInterval(() => {
      this.checkForDeadlocks(threshold);
    }, Math.min(threshold / 2, 5000)); // Check at least every 5 seconds
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
          debugScheduler("deadlock detected: jobId=%s, duration=%dms", jobId, duration);
          this.options.logger?.warn("Potential deadlock detected", { jobId, duration, threshold });
          await this.options.onDeadlock?.(job, duration);
        }
      }
    }
  }

  /**
   * Event emitter for scheduler lifecycle events
   */
  get on(): <K extends keyof SchedulerEvents>(
    event: K,
    listener: SchedulerEvents[K]
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
    
    debugScheduler("started: instanceId=%s, role=%s", this.instanceId, this.role);
    this.options.logger?.info("Scheduler started", { instanceId: this.instanceId, role: this.role });
    
    this.events.emit("started", { instanceId: this.instanceId, role: this.role });

    // Workers need to poll for due jobs
    if (this.role === SchedulerRole.WORKER) {
      debugScheduler("start: worker polling interval=%dms", this.checkInterval);
      this.pollTimer = setInterval(() => {
        this.checkAndRunJobs().catch(() => {});
      }, this.checkInterval);
    }
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
    this.options.logger?.info("Scheduler stopping", { instanceId: this.instanceId });
    
    this.isRunning = false;
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
    }

    if (this.deadlockCheckTimer) {
      clearInterval(this.deadlockCheckTimer);
      this.deadlockCheckTimer = null;
    }

    // Cancel all running jobs
    const running = Array.from(this.runningJobs.entries());
    debugScheduler("stop: cancelling %d running jobs", running.length);
    
    for (const [jobId, { scope }] of running) {
      debugJob("cancel: jobId=%s", jobId);
      await scope[Symbol.asyncDispose]().catch(() => {});
      this.runningJobs.delete(jobId);
    }

    // Dispose internal scope if we created it
    if (this.internalScope) {
      debugScheduler("stop: disposing internal scope");
      await this.internalScope[Symbol.asyncDispose]().catch(() => {});
      this.internalScope = null;
    }

    this.events.emit("stopped", { instanceId: this.instanceId, role: this.role });
    debugScheduler("stopped: instanceId=%s", this.instanceId);
    this.options.logger?.info("Scheduler stopped", { instanceId: this.instanceId });
  }

  /**
   * Get scheduler status
   */
  getStatus(): { 
    isRunning: boolean; 
    runningJobs: number; 
    scheduledJobs: number;
    instanceId: string;
    role: SchedulerRole;
  } {
    return {
      isRunning: this.isRunning,
      runningJobs: this.runningJobs.size,
      scheduledJobs: this.schedules.size,
      instanceId: this.instanceId,
      role: this.role,
    };
  }

  /**
   * Create a schedule for recurring job execution.
   * 
   * ⚠️ **Admin only**: This method can only be called by admin instances.
   * Workers must use `loadSchedules()` to get schedule definitions.
   * 
   * @param name Unique schedule name
   * @param options Schedule configuration
   * @returns The created schedule
   * @throws Error if called by a worker instance
   */
  async createSchedule(name: string, options: CreateScheduleOptions): Promise<Schedule> {
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error(
        `Cannot create schedule from worker instance. ` +
        `Schedules must be created by an admin instance (role: SchedulerRole.ADMIN). ` +
        `Workers should use loadSchedules() to load existing schedules.`
      );
    }

    // Check for existing schedule
    const existing = await this.storage.getSchedule(name);
    if (existing) {
      throw new Error(
        `Schedule '${name}' already exists. ` +
        `Use deleteSchedule() first if you want to recreate it.`
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

    debugScheduler("schedule created: name=%s, cron=%s, interval=%d", name, options.cron, options.interval);
    this.options.logger?.info("Schedule created", { 
      name, 
      cron: options.cron, 
      interval: options.interval,
      timezone 
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
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error(
        `Cannot delete schedule from worker instance. ` +
        `Schedules must be managed by an admin instance.`
      );
    }

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
  async updateSchedule(name: string, options: UpdateScheduleOptions): Promise<Schedule> {
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can update schedules");
    }

    const existing = await this.storage.getSchedule(name);
    if (!existing) {
      throw new Error(`Schedule '${name}' not found`);
    }

    // Validate new cron if provided
    const timezone = options.timezone ?? existing.timezone ?? this.options.defaultTimezone;
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
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can pause schedules");
    }

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
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can resume schedules");
    }

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
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can disable schedules");
    }

    return this.updateScheduleState(name, ScheduleState.DISABLED);
  }

  private async updateScheduleState(name: string, state: ScheduleState): Promise<Schedule> {
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
    const allJobs = await this.storage.getJobsByStatus("pending")
      .then(jobs => jobs.filter(j => j.scheduleName === name));
    const runningJobs = await this.storage.getJobsByStatus("running")
      .then(jobs => jobs.filter(j => j.scheduleName === name));
    const completedJobs = await this.storage.getJobsByStatus("completed")
      .then(jobs => jobs.filter(j => j.scheduleName === name));
    const failedJobs = await this.storage.getJobsByStatus("failed")
      .then(jobs => jobs.filter(j => j.scheduleName === name));
    const cancelledJobs = await this.storage.getJobsByStatus("cancelled")
      .then(jobs => jobs.filter(j => j.scheduleName === name));

    const totalJobs = allJobs.length + runningJobs.length + completedJobs.length + failedJobs.length + cancelledJobs.length;
    const successfulJobs = completedJobs.length;
    const successRate = totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 0;

    // Calculate average duration for completed jobs
    const durations = completedJobs
      .filter(j => j.lastExecutedAt && j.completedAt)
      .map(j => j.completedAt!.getTime() - j.lastExecutedAt!.getTime());
    const averageDuration = durations.length > 0
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
   * @param name Schedule name
   * @param payload Optional payload override
   * @returns The scheduled job result
   */
  async triggerSchedule(name: string, payload?: JobPayload): Promise<Result<Error, ScheduleJobResult>> {
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can trigger schedules");
    }

    const schedule = await this.storage.getSchedule(name);
    if (!schedule) {
      return [new Error(`Schedule '${name}' not found`), undefined];
    }

    if (schedule.state === ScheduleState.DISABLED) {
      return [new Error(`Schedule '${name}' is disabled`), undefined];
    }

    return this.scheduleJob(name, payload ?? schedule.payload ?? {}, { delay: 0 });
  }

  /**
   * Get all schedules with their statistics.
   * 
   * @returns Array of schedule statistics
   */
  async getAllScheduleStats(): Promise<ScheduleStats[]> {
    const schedules = await this.storage.getSchedules();
    return Promise.all(schedules.map(s => this.getScheduleStats(s.name)));
  }

  /**
   * Load schedules from persistent storage and register handlers.
   * 
   * **Workers must call this** before starting to process jobs.
   * This method loads schedule metadata from storage and associates
   * handler functions provided by the factory.
   * 
   * @param options Load options including handler factory
   * @returns Array of loaded schedule names
   * @throws Error if called by an admin instance
   * 
   * @example
   * ```typescript
   * await worker.loadSchedules({
   *   handlerFactory: (name, schedule) => {
   *     if (name === "daily-report") {
   *       return async (job, scope) => {
   *         // Generate the report
   *       };
   *     }
   *     return null; // Skip unknown schedules
   *   }
   * });
   * ```
   */
  async loadSchedules(options: LoadSchedulesOptions): Promise<string[]> {
    if (this.role !== SchedulerRole.WORKER) {
      throw new Error(
        `Admin instances manage schedules directly via createSchedule(). ` +
        `loadSchedules() is for workers to load schedule definitions from storage.`
      );
    }

    const storedSchedules = await this.storage.getSchedules();
    const loaded: string[] = [];

    for (const stored of storedSchedules) {
      // Get handler from factory
      const handler = await options.handlerFactory(stored.name, stored);
      
      if (!handler) {
        continue; // Skip schedules without handlers
      }

      // Store schedule with handler
      this.schedules.set(stored.name, { ...stored, handler });
      this.handlers.set(stored.name, handler);
      loaded.push(stored.name);
    }

    this.events.emit("schedulesLoaded", { count: loaded.length, names: loaded });

    // Set up auto-reload if enabled
    if (options.autoReload) {
      const interval = options.reloadInterval ?? 60000;
      this.reloadTimer = setInterval(async () => {
        await this.reloadSchedules(options.handlerFactory);
      }, interval);
    }

    return loaded;
  }

  /**
   * Reload schedules from storage.
   * Adds new schedules, removes deleted ones.
   */
  private async reloadSchedules(
    handlerFactory: LoadSchedulesOptions["handlerFactory"]
  ): Promise<void> {
    const storedSchedules = await this.storage.getSchedules();
    const storedNames = new Set(storedSchedules.map(s => s.name));
    const currentNames = new Set(this.schedules.keys());

    // Add new schedules
    for (const stored of storedSchedules) {
      if (!currentNames.has(stored.name)) {
        const handler = await handlerFactory(stored.name, stored);
        if (handler) {
          this.schedules.set(stored.name, { ...stored, handler });
          this.handlers.set(stored.name, handler);
        }
      }
    }

    // Remove deleted schedules
    for (const name of currentNames) {
      if (!storedNames.has(name)) {
        this.schedules.delete(name);
        this.handlers.delete(name);
      }
    }
  }

  /**
   * Schedule a one-time job (admin only).
   * 
   * ⚠️ **Admin only**: Workers execute jobs based on loaded schedules.
   * 
   * @param scheduleName Name of the schedule
   * @param payload Job payload data
   * @param options Scheduling options
   */
  async scheduleJob(
    scheduleName: string,
    payload: JobPayload = {},
    options: { delay?: number; priority?: number } = {}
  ): Promise<Result<Error, ScheduleJobResult>> {
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error(
        `Workers cannot schedule jobs directly. ` +
        `Jobs are created automatically based on loaded schedules.`
      );
    }

    const schedule = await this.storage.getSchedule(scheduleName);
    if (!schedule) {
      return [new Error(`Schedule '${scheduleName}' not found`), undefined];
    }

    const job: Job = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      scheduleId: schedule.id,
      scheduleName,
      payload,
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
    if (this.role !== SchedulerRole.ADMIN) {
      throw new Error("Only admin instances can cancel jobs");
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
   * Check for and run due jobs (workers only)
   */
  private async checkAndRunJobs(): Promise<void> {
    if (!this.isRunning || this.role !== SchedulerRole.WORKER) return;

    const now = new Date();
    const dueJobs = await this.storage.getDueJobs(now);

    for (const job of dueJobs) {
      // Skip if already running
      if (this.runningJobs.has(job.id)) continue;

      // Skip if not yet time (respect runAt)
      if (job.runAt && job.runAt > now) continue;

      // Run the job
      this.runJob(job).catch(() => {});
    }
  }

  /**
   * Run a single job with retry and error handling, tracing, and profiling
   */
  private async runJob(job: Job): Promise<void> {
    // Get schedule and handler
    const scheduleWithHandler = this.schedules.get(job.scheduleName);
    const handler = this.handlers.get(job.scheduleName);
    
    if (!scheduleWithHandler || !handler) {
      const error = `Schedule '${job.scheduleName}' not found (may have been deleted)`;
      job.status = "failed";
      job.error = error;
      job.completedAt = new Date();
      await this.storage.saveJob(job);
      
      debugJob("failed: schedule not found, jobId=%s, scheduleName=%s", job.id, job.scheduleName);
      this.options.logger?.error(error, { jobId: job.id, scheduleName: job.scheduleName });
      
      this.events.emit("jobFailed", { job, error: new Error(error), permanent: true });
      return;
    }
    
    // Check schedule state
    if (scheduleWithHandler.state === ScheduleState.DISABLED) {
      const error = `Schedule '${job.scheduleName}' is disabled`;
      job.status = "failed";
      job.error = error;
      job.completedAt = new Date();
      await this.storage.saveJob(job);
      
      debugJob("failed: schedule disabled, jobId=%s, scheduleName=%s", job.id, job.scheduleName);
      this.options.logger?.warn(error, { jobId: job.id, scheduleName: job.scheduleName });
      
      this.events.emit("jobFailed", { job, error: new Error(error), permanent: true });
      return;
    }
    
    if (scheduleWithHandler.state === ScheduleState.PAUSED) {
      // Re-queue the job for later (don't fail, just retry)
      job.runAt = new Date(Date.now() + 60000); // Try again in 1 minute
      await this.storage.saveJob(job);
      
      debugJob("paused: re-queued, jobId=%s, scheduleName=%s", job.id, job.scheduleName);
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
            
            debugJob("skipped: stale job, jobId=%s, staleness=%dms", job.id, staleness);
            this.options.logger?.warn("Stale job skipped", { jobId: job.id, staleness });
            
            this.events.emit("jobSkipped", { job, reason: "stale", staleness });
            return;
            
          case StaleJobBehavior.FAIL:
            job.status = "failed";
            job.completedAt = new Date();
            job.error = `Stale job failed (scheduled ${Math.round(staleness / 1000)}s ago)`;
            await this.storage.saveJob(job);
            
            debugJob("failed: stale job, jobId=%s, staleness=%dms", job.id, staleness);
            this.options.logger?.error("Stale job failed", { jobId: job.id, staleness });
            
            this.events.emit("jobFailed", { job, error: new Error(job.error), permanent: true });
            return;
            
          case StaleJobBehavior.RUN:
          default:
            debugJob("running stale job anyway, jobId=%s, staleness=%dms", job.id, staleness);
            break;
        }
      }
    }

    // Acquire distributed lock
    const lockTTL = scheduleWithHandler.options?.timeout ?? 30000;
    debugLock("acquiring: jobId=%s, instanceId=%s, ttl=%d", job.id, this.instanceId, lockTTL);
    
    const acquired = await this.storage.acquireJobLock?.(job.id, this.instanceId, lockTTL) ?? true;
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
      stages: [{ name: "execution", startTime, endTime: undefined, duration: undefined }],
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

    debugJob("started: jobId=%s, scheduleName=%s, retryCount=%d", job.id, job.scheduleName, job.retryCount);
    this.options.logger?.info("Job started", { 
      jobId: job.id, 
      scheduleName: job.scheduleName, 
      retryCount: job.retryCount,
      instanceId: this.instanceId 
    });

    this.events.emit("jobStarted", { job, instanceId: this.instanceId });

    // Call beforeJob hook
    try {
      await this.options.hooks?.beforeJob?.(job, scheduleWithHandler);
    } catch (hookError) {
      debugJob("beforeJob hook failed: jobId=%s, error=%s", job.id, (hookError as Error).message);
      this.options.logger?.error("beforeJob hook failed", { jobId: job.id, error: (hookError as Error).message });
    }

    let success = false;
    let error: Error | undefined;

    try {
      if (scheduleWithHandler.options?.timeout) {
        await this.runWithTimeout(handler, job, childScope, scheduleWithHandler.options.timeout);
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
        profile.stages[0].endTime = Date.now();
        profile.stages[0].duration = duration;
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
        instanceId: this.instanceId 
      });

      this.events.emit("jobCompleted", { job, duration });
      
      // Schedule next occurrence for recurring schedules
      if (this.role === SchedulerRole.ADMIN) {
        await this.scheduleNextOccurrence(scheduleWithHandler);
      }
    } catch (err) {
      error = err as Error;
      await this.handleJobFailure(job, error, scheduleWithHandler);
    } finally {
      // Call afterJob hook
      const duration = Date.now() - startTime;
      try {
        await this.options.hooks?.afterJob?.(job, scheduleWithHandler, { success, duration, error });
      } catch (hookError) {
        debugJob("afterJob hook failed: jobId=%s, error=%s", job.id, (hookError as Error).message);
        this.options.logger?.error("afterJob hook failed", { jobId: job.id, error: (hookError as Error).message });
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
    scope: Scope,
    timeout: number
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
    schedule: Schedule
  ): Promise<void> {
    job.error = error.message;
    job.retryCount++;

    const maxRetries = schedule.options?.maxRetries ?? job.maxRetries ?? 3;
    const willRetry = job.retryCount < maxRetries;
    
    if (willRetry) {
      const baseDelay = schedule.options?.retryDelay ?? 1000;
      const jitter = schedule.options?.jitter ?? 0;
      const delay = baseDelay * Math.pow(2, job.retryCount) + Math.random() * jitter;
      
      job.status = "pending";
      job.runAt = new Date(Date.now() + delay);
      await this.storage.saveJob(job);
      await this.storage.releaseJobLock?.(job.id, this.instanceId);
      
      debugJob("retry scheduled: jobId=%s, attempt=%d/%d, delay=%dms", job.id, job.retryCount, maxRetries, delay);
      this.options.logger?.warn("Job retry scheduled", { 
        jobId: job.id, 
        scheduleName: job.scheduleName,
        attempt: job.retryCount, 
        maxRetries, 
        delay,
        error: error.message 
      });
      
      this.events.emit("jobRetryScheduled", { job, error, retryDelay: delay });
    } else {
      job.status = "failed";
      await this.storage.saveJob(job);
      await this.storage.releaseJobLock?.(job.id, this.instanceId);
      
      debugJob("failed permanently: jobId=%s, attempts=%d, error=%s", job.id, job.retryCount, error.message);
      this.options.logger?.error("Job failed permanently", { 
        jobId: job.id, 
        scheduleName: job.scheduleName,
        attempts: job.retryCount, 
        error: error.message,
        stack: error.stack 
      });
      
      this.events.emit("jobFailed", { job, error, permanent: true });
    }
    
    // Call onJobError hook
    try {
      await this.options.hooks?.onJobError?.(job, schedule, error, willRetry);
    } catch (hookError) {
      debugJob("onJobError hook failed: jobId=%s, error=%s", job.id, (hookError as Error).message);
      this.options.logger?.error("onJobError hook failed", { jobId: job.id, error: (hookError as Error).message });
    }
  }

  /**
   * Schedule next occurrence for recurring schedules
   */
  private async scheduleNextOccurrence(schedule: Schedule): Promise<void> {
    if (schedule.cron) {
      const result = parseCron(schedule.cron, schedule.timezone);
      if (!(result instanceof Error)) {
        const nextRun = result.next(new Date());
        if (nextRun) {
          await this.scheduleJob(
            schedule.name, 
            schedule.payload ?? {}, 
            { delay: nextRun.getTime() - Date.now() }
          );
        }
      }
    } else if (schedule.interval) {
      await this.scheduleJob(schedule.name, schedule.payload ?? {}, { delay: schedule.interval });
    }
  }

  /**
   * Collect current metrics from the scheduler
   */
  async collectMetrics(): Promise<SchedulerMetrics> {
    const now = Date.now();
    const allJobs = await this.storage.getJobsByStatus("pending")
      .then(jobs => jobs.length);
    const runningJobs = await this.storage.getJobsByStatus("running")
      .then(jobs => jobs.length);
    const completedJobs = await this.storage.getJobsByStatus("completed")
      .then(jobs => jobs.length);
    const failedJobs = await this.storage.getJobsByStatus("failed")
      .then(jobs => jobs.length);
    const cancelledJobs = await this.storage.getJobsByStatus("cancelled")
      .then(jobs => jobs.length);

    const schedules = await this.storage.getSchedules();
    const scheduleStats = await Promise.all(
      schedules.map(async s => {
        const stats = await this.getScheduleStats(s.name);
        return {
          name: s.name,
          totalJobs: stats.totalJobs,
          completedJobs: stats.completedJobs,
          failedJobs: stats.failedJobs,
          successRate: stats.successRate,
          averageDuration: stats.averageDuration ?? 0,
        };
      })
    );

    const activeJobs = Array.from(this.runningJobs.entries()).map(([jobId, { startTime }]) => ({
      id: jobId,
      scheduleName: "unknown", // Could be looked up from storage if needed
      startTime,
      duration: now - startTime,
    }));

    return {
      instanceId: this.instanceId,
      role: this.role,
      timestamp: new Date(),
      jobs: {
        total: allJobs + runningJobs + completedJobs + failedJobs + cancelledJobs,
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
      case "json":
      default:
        return JSON.stringify(metrics, null, 2);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  private exportMetricsAsPrometheus(metrics: SchedulerMetrics, prefix: string): string {
    const lines: string[] = [];
    const timestamp = metrics.timestamp.getTime();

    // Job counts
    lines.push(`# HELP ${prefix}_jobs_total Total number of jobs`);
    lines.push(`# TYPE ${prefix}_jobs_total counter`);
    lines.push(`${prefix}_jobs_total{status="pending"} ${metrics.jobs.pending} ${timestamp}`);
    lines.push(`${prefix}_jobs_total{status="running"} ${metrics.jobs.running} ${timestamp}`);
    lines.push(`${prefix}_jobs_total{status="completed"} ${metrics.jobs.completed} ${timestamp}`);
    lines.push(`${prefix}_jobs_total{status="failed"} ${metrics.jobs.failed} ${timestamp}`);
    lines.push(`${prefix}_jobs_total{status="cancelled"} ${metrics.jobs.cancelled} ${timestamp}`);

    // Per-schedule metrics
    for (const schedule of metrics.schedules) {
      lines.push(`${prefix}_schedule_jobs_total{schedule="${schedule.name}"} ${schedule.totalJobs} ${timestamp}`);
      lines.push(`${prefix}_schedule_success_rate{schedule="${schedule.name}"} ${schedule.successRate} ${timestamp}`);
      lines.push(`${prefix}_schedule_avg_duration_ms{schedule="${schedule.name}"} ${schedule.averageDuration} ${timestamp}`);
    }

    // Active jobs
    lines.push(`# HELP ${prefix}_active_jobs Currently running jobs`);
    lines.push(`# TYPE ${prefix}_active_jobs gauge`);
    lines.push(`${prefix}_active_jobs ${metrics.activeJobs.length} ${timestamp}`);

    return lines.join("\n");
  }

  /**
   * Export metrics in OpenTelemetry format (JSON)
   */
  private exportMetricsAsOTel(metrics: SchedulerMetrics): string {
    const resourceMetrics = {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "go-go-scope-scheduler" } },
          { key: "scheduler.instance_id", value: { stringValue: metrics.instanceId } },
          { key: "scheduler.role", value: { stringValue: metrics.role } },
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
                  { attributes: [{ key: "status", value: { stringValue: "pending" } }], value: metrics.jobs.pending },
                  { attributes: [{ key: "status", value: { stringValue: "running" } }], value: metrics.jobs.running },
                  { attributes: [{ key: "status", value: { stringValue: "completed" } }], value: metrics.jobs.completed },
                  { attributes: [{ key: "status", value: { stringValue: "failed" } }], value: metrics.jobs.failed },
                  { attributes: [{ key: "status", value: { stringValue: "cancelled" } }], value: metrics.jobs.cancelled },
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

export { CronPresets, SchedulerRole };
