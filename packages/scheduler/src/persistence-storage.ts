/**
 * Persistence-based job storage for distributed scheduling
 * Uses go-go-scope persistence adapters (Redis, PostgreSQL, MySQL, SQLite)
 */

import type { LockProvider } from "go-go-scope";
import { parseCron } from "./cron.js";
import type { Job, JobStatus, JobStorage, Schedule } from "./types.js";

/**
 * Lua script for atomic check-and-schedule operation in Redis.
 * This ensures idempotency even with multiple concurrent workers.
 *
 * Keys:
 *   KEYS[1] = pending jobs set
 *   KEYS[2] = jobs hash
 *   KEYS[3] = due jobs sorted set
 *
 * Args:
 *   ARGV[1] = schedule name
 *   ARGV[2] = new job ID
 *   ARGV[3] = serialized job data
 *   ARGV[4] = runAt timestamp (for zadd)
 *
 * Returns:
 *   1 if job was scheduled, 0 if already had pending job for schedule
 */
const REDIS_SCHEDULE_LUA_SCRIPT = `
local scheduleName = ARGV[1]
local pendingKey = KEYS[1]
local jobsKey = KEYS[2]
local dueKey = KEYS[3]

-- Check if there's already a pending job for this schedule
local pendingJobs = redis.call('smembers', pendingKey)
for _, jobId in ipairs(pendingJobs) do
  local jobData = redis.call('hget', jobsKey, jobId)
  if jobData then
    local job = cjson.decode(jobData)
    if job.scheduleName == scheduleName then
      return 0 -- Already have pending job
    end
  end
end

-- No pending job found, create new job
local newJobId = ARGV[2]
local newJobData = ARGV[3]
local runAt = tonumber(ARGV[4])

redis.call('hset', jobsKey, newJobId, newJobData)
redis.call('sadd', pendingKey, newJobId)
redis.call('zadd', dueKey, runAt, newJobId)

return 1
`;

/**
 * Options for persistence-based job storage
 */
export interface PersistenceJobStorageOptions {
	/** Lock provider for distributed locking (required for job execution coordination) */
	lockProvider: LockProvider;
	/** Key prefix for all storage keys (default: 'scheduler:') */
	keyPrefix?: string;
	/** Default lock TTL in milliseconds (default: 30000) */
	lockTTL?: number;
	/** Optional function to serialize job data to string (default: JSON.stringify) */
	serialize?: (data: unknown) => string;
	/** Optional function to deserialize job data from string (default: JSON.parse) */
	deserialize?: (data: string) => unknown;
}

/**
 * Redis-based job storage for distributed scheduling.
 *
 * Requires a Redis client with hash, set, and sorted set operations.
 * Supports Lua scripting for atomic check-and-schedule operations (Redis 6.0+).
 *
 * Use this storage for production deployments with multiple scheduler instances.
 *
 * @example
 * ```typescript
 * import { RedisJobStorage } from '@go-go-scope/scheduler';
 * import { createRedisAdapter } from '@go-go-scope/persistence-redis';
 * import Redis from 'ioredis';
 *
 * // Create Redis client and adapter
 * const redis = new Redis({ host: 'localhost', port: 6379 });
 * const lockProvider = createRedisAdapter(redis);
 *
 * // Create storage with default prefix
 * const storage = new RedisJobStorage(redis, lockProvider);
 *
 * // Create storage with custom key prefix
 * const storage = new RedisJobStorage(redis, lockProvider, {
 *   keyPrefix: 'myapp:scheduler:'
 * });
 *
 * // Use with Scheduler
 * const scheduler = new Scheduler({
 *   storage,
 *   enableWebUI: true,
 *   webUIPort: 8080
 * });
 *
 * await scheduler.createSchedule('cleanup', {
 *   cron: '0 0 * * *',
 *   defaultPayload: { maxAge: 86400000 }
 * });
 * ```
 */
export class RedisJobStorage implements JobStorage {
	private redis: {
		/** Set hash field value */
		hset(key: string, field: string, value: string): Promise<void>;
		/** Get hash field value */
		hget(key: string, field: string): Promise<string | null>;
		/** Delete hash field */
		hdel(key: string, field: string): Promise<void>;
		/** Get all hash fields and values */
		hgetall(key: string): Promise<Record<string, string>>;
		/** Add members to set */
		sadd(key: string, ...members: string[]): Promise<void>;
		/** Remove members from set */
		srem(key: string, ...members: string[]): Promise<void>;
		/** Get all set members */
		smembers(key: string): Promise<string[]>;
		/** Add member to sorted set with score */
		zadd(key: string, score: number, member: string): Promise<void>;
		/** Remove member from sorted set */
		zrem(key: string, member: string): Promise<void>;
		/** Get members from sorted set within score range */
		zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
		/** Execute Lua script (for atomic check-and-schedule) */
		eval?(
			script: string,
			keys: string[],
			args: (string | number)[],
		): Promise<unknown>;
		/** Define script for later execution (Redis 6.0+) */
		defineScript?(name: string, script: string): void;
	};
	private lockProvider: LockProvider;
	private keyPrefix: string;

	/**
	 * Create a new Redis-based job storage.
	 *
	 * @param redis - Redis client with hash, set, and sorted set operations
	 * @param lockProvider - Lock provider for distributed job locking
	 * @param options - Optional configuration
	 * @param options.keyPrefix - Key prefix for all storage keys (default: 'scheduler:')
	 */
	constructor(
		redis: RedisJobStorage["redis"],
		lockProvider: LockProvider,
		options?: { keyPrefix?: string },
	) {
		this.redis = redis;
		this.lockProvider = lockProvider;
		this.keyPrefix = options?.keyPrefix ?? "scheduler:";
	}

	private jobsIndexKey(status: JobStatus): string {
		return `${this.keyPrefix}jobs:${status}`;
	}

	private schedulesIndexKey(): string {
		return `${this.keyPrefix}schedules`;
	}

	private lockKey(jobId: string): string {
		return `${this.keyPrefix}lock:${jobId}`;
	}

	private serialize(data: unknown): string {
		return JSON.stringify(data);
	}

	private deserialize(data: string): unknown {
		return JSON.parse(data);
	}

	private serializeJob(job: Job): string {
		return this.serialize({
			...job,
			createdAt: job.createdAt.toISOString(),
			runAt: job.runAt?.toISOString(),
			lastExecutedAt: job.lastExecutedAt?.toISOString(),
			completedAt: job.completedAt?.toISOString(),
			lockExpiresAt: job.lockExpiresAt?.toISOString(),
		});
	}

	private deserializeJob(data: string): Job {
		const parsed = this.deserialize(data) as Record<string, unknown>;
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt as string),
			runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
			lastExecutedAt: parsed.lastExecutedAt
				? new Date(parsed.lastExecutedAt as string)
				: undefined,
			completedAt: parsed.completedAt
				? new Date(parsed.completedAt as string)
				: undefined,
			lockExpiresAt: parsed.lockExpiresAt
				? new Date(parsed.lockExpiresAt as string)
				: undefined,
		} as Job;
	}

	private serializeSchedule(schedule: Schedule): string {
		return this.serialize({
			...schedule,
			createdAt: schedule.createdAt.toISOString(),
			lastRunAt: schedule.lastRunAt?.toISOString(),
			nextRunAt: schedule.nextRunAt?.toISOString(),
			endDate: schedule.endDate?.toISOString(),
		});
	}

	private deserializeSchedule(data: string): Schedule {
		const parsed = this.deserialize(data) as Record<string, unknown>;
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt as string),
			lastRunAt: parsed.lastRunAt
				? new Date(parsed.lastRunAt as string)
				: undefined,
			nextRunAt: parsed.nextRunAt
				? new Date(parsed.nextRunAt as string)
				: undefined,
			endDate: parsed.endDate ? new Date(parsed.endDate as string) : undefined,
		} as Schedule;
	}

	async saveJob(job: Job): Promise<void> {
		const jobData = this.serializeJob(job);
		await this.redis.hset(`${this.keyPrefix}jobs`, job.id, jobData);

		// Update status index
		await this.redis.sadd(this.jobsIndexKey(job.status), job.id);

		// Remove from other status indexes
		const statuses: JobStatus[] = [
			"pending",
			"running",
			"completed",
			"failed",
			"cancelled",
		];
		for (const status of statuses) {
			if (status !== job.status) {
				await this.redis.srem(this.jobsIndexKey(status), job.id);
			}
		}

		// Add to due jobs sorted set if pending
		if (job.status === "pending" && job.runAt) {
			await this.redis.zadd(
				`${this.keyPrefix}jobs:due`,
				job.runAt.getTime(),
				job.id,
			);
		} else {
			await this.redis.zrem(`${this.keyPrefix}jobs:due`, job.id);
		}
	}

	async getJob(id: string): Promise<Job | null> {
		const data = await this.redis.hget(`${this.keyPrefix}jobs`, id);
		return data ? this.deserializeJob(data) : null;
	}

	async getJobsByStatus(status: JobStatus): Promise<Job[]> {
		const ids = await this.redis.smembers(this.jobsIndexKey(status));
		const jobs: Job[] = [];
		for (const id of ids) {
			const job = await this.getJob(id);
			if (job) jobs.push(job);
		}
		return jobs;
	}

	async getDueJobs(before: Date): Promise<Job[]> {
		const ids = await this.redis.zrangebyscore(
			`${this.keyPrefix}jobs:due`,
			0,
			before.getTime(),
		);
		const jobs: Job[] = [];
		for (const id of ids) {
			const job = await this.getJob(id);
			if (job && job.status === "pending") {
				jobs.push(job);
			}
		}
		return jobs;
	}

	async deleteJob(id: string): Promise<void> {
		const job = await this.getJob(id);
		if (job) {
			await this.redis.srem(this.jobsIndexKey(job.status), id);
			await this.redis.zrem(`${this.keyPrefix}jobs:due`, id);
		}
		await this.redis.hdel(`${this.keyPrefix}jobs`, id);
	}

	async saveSchedule(schedule: Schedule): Promise<void> {
		const data = this.serializeSchedule(schedule);
		await this.redis.hset(`${this.keyPrefix}schedules`, schedule.name, data);
		await this.redis.sadd(this.schedulesIndexKey(), schedule.name);
	}

	async getSchedule(name: string): Promise<Schedule | null> {
		const data = await this.redis.hget(`${this.keyPrefix}schedules`, name);
		return data ? this.deserializeSchedule(data) : null;
	}

	async getSchedules(): Promise<Schedule[]> {
		const names = await this.redis.smembers(this.schedulesIndexKey());
		const schedules: Schedule[] = [];
		for (const name of names) {
			const schedule = await this.getSchedule(name);
			if (schedule) schedules.push(schedule);
		}
		return schedules;
	}

	async deleteSchedule(name: string): Promise<void> {
		await this.redis.hdel(`${this.keyPrefix}schedules`, name);
		await this.redis.srem(this.schedulesIndexKey(), name);
	}

	async acquireJobLock(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean> {
		const lock = await this.lockProvider.acquire(
			this.lockKey(jobId),
			ttl,
			instanceId,
		);
		return lock !== null;
	}

	async releaseJobLock(jobId: string, _instanceId: string): Promise<void> {
		await this.lockProvider.forceRelease(this.lockKey(jobId));
	}

	async extendJobLock(
		jobId: string,
		_instanceId: string,
		ttl: number,
	): Promise<boolean> {
		return this.lockProvider.extend(this.lockKey(jobId), ttl, _instanceId);
	}

	supportsAutoScheduling(): boolean {
		return true;
	}

	async completeJobAndScheduleNext(
		jobId: string,
		result: { success: boolean; error?: string },
	): Promise<boolean> {
		// Get the job and its schedule
		const job = await this.getJob(jobId);
		if (!job) {
			return false;
		}

		// Mark job as completed/failed
		job.status = result.success ? "completed" : "failed";
		job.completedAt = new Date();
		if (result.error) {
			job.error = result.error;
		}
		await this.saveJob(job);

		// Get schedule
		const schedule = await this.getSchedule(job.scheduleName);
		if (!schedule) {
			return false;
		}

		// Calculate next run time with proper cron parsing and end-date handling
		const nextRun = this.calculateNextRun(schedule);
		if (!nextRun) {
			return false; // No more occurrences (past end date or no valid next run)
		}

		// Create next job
		const nextJob: Job = {
			id: `${this.keyPrefix}job:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
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

		// Use Lua script for atomic check-and-schedule if available
		if (this.redis.eval) {
			const keys = [
				this.jobsIndexKey("pending"),
				`${this.keyPrefix}jobs`,
				`${this.keyPrefix}jobs:due`,
			];
			const args = [
				schedule.name,
				nextJob.id,
				this.serializeJob(nextJob),
				nextRun.getTime(),
			];

			try {
				const result = await this.redis.eval(
					REDIS_SCHEDULE_LUA_SCRIPT,
					keys,
					args,
				);
				return result === 1;
			} catch (error) {
				// Fall back to non-atomic implementation on Lua error
				console.warn(
					"Redis Lua script failed, falling back to non-atomic scheduling:",
					error,
				);
			}
		}

		// Non-atomic fallback: Check for idempotency
		const pendingJobs = await this.getJobsByStatus("pending");
		const hasPendingForSchedule = pendingJobs.some(
			(j) => j.scheduleName === schedule.name,
		);
		if (hasPendingForSchedule) {
			return false; // Already have pending job for this schedule
		}

		await this.saveJob(nextJob);
		return true;
	}

	/**
	 * Calculate the next run time for a schedule.
	 * Handles cron expressions, intervals, and end dates.
	 */
	private calculateNextRun(schedule: Schedule): Date | null {
		let nextRun: Date | null = null;

		if (schedule.cron) {
			// Use proper cron parser with timezone support
			try {
				const cron = parseCron(schedule.cron, schedule.timezone);
				nextRun = cron.next(new Date());
			} catch {
				// Invalid cron expression
				return null;
			}
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
}

/**
 * SQL-based job storage for distributed scheduling.
 *
 * Supports PostgreSQL, MySQL, and SQLite databases.
 * Uses UPSERT operations for atomic job updates.
 *
 * Use this storage for production deployments where Redis is not available,
 * or when you prefer to use your existing SQL database for job persistence.
 *
 * @example
 * ```typescript
 * import { SQLJobStorage } from '@go-go-scope/scheduler';
 * import { createPostgresAdapter } from '@go-go-scope/persistence-postgres';
 * import { Pool } from 'pg';
 *
 * // PostgreSQL setup
 * const pool = new Pool({
 *   host: 'localhost',
 *   database: 'scheduler',
 *   user: 'postgres',
 *   password: 'secret'
 * });
 *
 * const db = {
 *   query: (sql: string, params?: unknown[]) => pool.query(sql, params),
 *   exec: (sql: string, params?: unknown[]) => pool.query(sql, params).then(() => {})
 * };
 *
 * const lockProvider = createPostgresAdapter(pool);
 * const storage = new SQLJobStorage(db, lockProvider, 'postgres', {
 *   keyPrefix: 'scheduler_'
 * });
 *
 * // MySQL setup
 * import { createMysqlAdapter } from '@go-go-scope/persistence-mysql';
 * import mysql from 'mysql2/promise';
 *
 * const mysqlPool = mysql.createPool({ host: 'localhost', database: 'scheduler' });
 * const mysqlDb = {
 *   query: (sql: string, params?: unknown[]) => mysqlPool.execute(sql, params),
 *   exec: (sql: string, params?: unknown[]) => mysqlPool.execute(sql, params).then(() => {})
 * };
 * const mysqlLockProvider = createMysqlAdapter(mysqlPool);
 * const mysqlStorage = new SQLJobStorage(mysqlDb, mysqlLockProvider, 'mysql');
 *
 * // SQLite setup (for development)
 * import { createSqliteAdapter } from '@go-go-scope/persistence-sqlite';
 * import sqlite3 from 'sqlite3';
 *
 * const sqliteDb = new sqlite3.Database(':memory:');
 * // ... wrap with query/exec interface
 * ```
 */
export class SQLJobStorage implements JobStorage {
	private db: {
		/** Execute a query and return results */
		query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
		/** Execute a statement without returning results */
		exec(sql: string, params?: unknown[]): Promise<void>;
	};
	private lockProvider: LockProvider;
	private dialect: "postgres" | "mysql" | "sqlite";
	private keyPrefix: string;

	/**
	 * Create a new SQL-based job storage.
	 *
	 * @param db - Database client with query and exec methods
	 * @param lockProvider - Lock provider for distributed job locking
	 * @param dialect - SQL dialect: 'postgres', 'mysql', or 'sqlite'
	 * @param options - Optional configuration
	 * @param options.keyPrefix - Table prefix for all storage tables (default: 'scheduler:')
	 */
	constructor(
		db: SQLJobStorage["db"],
		lockProvider: LockProvider,
		dialect: "postgres" | "mysql" | "sqlite",
		options?: { keyPrefix?: string },
	) {
		this.db = db;
		this.lockProvider = lockProvider;
		this.dialect = dialect;
		this.keyPrefix = options?.keyPrefix ?? "scheduler:";
	}

	private getParamIndex(index: number): string {
		return this.dialect === "postgres" ? `$${index}` : "?";
	}

	private serialize(data: unknown): string {
		return JSON.stringify(data);
	}

	private deserialize(data: string): unknown {
		return JSON.parse(data);
	}

	private lockKey(jobId: string): string {
		return `${this.keyPrefix}lock:${jobId}`;
	}

	async saveJob(job: Job): Promise<void> {
		const table = `${this.keyPrefix}jobs`;
		const data = this.serialize({
			...job,
			createdAt: job.createdAt.toISOString(),
			runAt: job.runAt?.toISOString(),
			lastExecutedAt: job.lastExecutedAt?.toISOString(),
			completedAt: job.completedAt?.toISOString(),
			lockExpiresAt: job.lockExpiresAt?.toISOString(),
		});

		if (this.dialect === "postgres") {
			await this.db.exec(
				`INSERT INTO ${table} (id, status, data, run_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET status = $2, data = $3, run_at = $4`,
				[job.id, job.status, data, job.runAt?.toISOString() ?? null],
			);
		} else if (this.dialect === "mysql") {
			await this.db.exec(
				`INSERT INTO ${table} (id, status, data, run_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = ?, data = ?, run_at = ?`,
				[
					job.id,
					job.status,
					data,
					job.runAt?.toISOString() ?? null,
					job.status,
					data,
					job.runAt?.toISOString() ?? null,
				],
			);
		} else {
			await this.db.exec(
				`INSERT OR REPLACE INTO ${table} (id, status, data, run_at) VALUES (?, ?, ?, ?)`,
				[job.id, job.status, data, job.runAt?.toISOString() ?? null],
			);
		}
	}

	async getJob(id: string): Promise<Job | null> {
		const result = await this.db.query(
			`SELECT data FROM ${this.keyPrefix}jobs WHERE id = ${this.getParamIndex(1)}`,
			[id],
		);
		const row = result.rows[0] as { data: string } | undefined;
		if (!row) return null;

		const parsed = this.deserialize(row.data) as Record<string, unknown>;
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt as string),
			runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
			lastExecutedAt: parsed.lastExecutedAt
				? new Date(parsed.lastExecutedAt as string)
				: undefined,
			completedAt: parsed.completedAt
				? new Date(parsed.completedAt as string)
				: undefined,
			lockExpiresAt: parsed.lockExpiresAt
				? new Date(parsed.lockExpiresAt as string)
				: undefined,
		} as Job;
	}

	async getJobsByStatus(status: JobStatus): Promise<Job[]> {
		const result = await this.db.query(
			`SELECT data FROM ${this.keyPrefix}jobs WHERE status = ${this.getParamIndex(1)}`,
			[status],
		);
		return (result.rows as { data: string }[]).map((row) => {
			const parsed = this.deserialize(row.data) as Record<string, unknown>;
			return {
				...parsed,
				createdAt: new Date(parsed.createdAt as string),
				runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
				lastExecutedAt: parsed.lastExecutedAt
					? new Date(parsed.lastExecutedAt as string)
					: undefined,
				completedAt: parsed.completedAt
					? new Date(parsed.completedAt as string)
					: undefined,
				lockExpiresAt: parsed.lockExpiresAt
					? new Date(parsed.lockExpiresAt as string)
					: undefined,
			} as Job;
		});
	}

	async getDueJobs(before: Date): Promise<Job[]> {
		const result = await this.db.query(
			`SELECT data FROM ${this.keyPrefix}jobs 
       WHERE status = 'pending' AND (run_at IS NULL OR run_at <= ${this.getParamIndex(1)})`,
			[before.toISOString()],
		);
		return (result.rows as { data: string }[]).map((row) => {
			const parsed = this.deserialize(row.data) as Record<string, unknown>;
			return {
				...parsed,
				createdAt: new Date(parsed.createdAt as string),
				runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
				lastExecutedAt: parsed.lastExecutedAt
					? new Date(parsed.lastExecutedAt as string)
					: undefined,
				completedAt: parsed.completedAt
					? new Date(parsed.completedAt as string)
					: undefined,
				lockExpiresAt: parsed.lockExpiresAt
					? new Date(parsed.lockExpiresAt as string)
					: undefined,
			} as Job;
		});
	}

	async deleteJob(id: string): Promise<void> {
		await this.db.exec(
			`DELETE FROM ${this.keyPrefix}jobs WHERE id = ${this.getParamIndex(1)}`,
			[id],
		);
	}

	async saveSchedule(schedule: Schedule): Promise<void> {
		const table = `${this.keyPrefix}schedules`;
		const data = this.serialize({
			...schedule,
			createdAt: schedule.createdAt.toISOString(),
			lastRunAt: schedule.lastRunAt?.toISOString(),
			nextRunAt: schedule.nextRunAt?.toISOString(),
			endDate: schedule.endDate?.toISOString(),
		});

		if (this.dialect === "postgres") {
			await this.db.exec(
				`INSERT INTO ${table} (name, data) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET data = $2`,
				[schedule.name, data],
			);
		} else if (this.dialect === "mysql") {
			await this.db.exec(
				`INSERT INTO ${table} (name, data) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data = ?`,
				[schedule.name, data, data],
			);
		} else {
			await this.db.exec(
				`INSERT OR REPLACE INTO ${table} (name, data) VALUES (?, ?)`,
				[schedule.name, data],
			);
		}
	}

	async getSchedule(name: string): Promise<Schedule | null> {
		const result = await this.db.query(
			`SELECT data FROM ${this.keyPrefix}schedules WHERE name = ${this.getParamIndex(1)}`,
			[name],
		);
		const row = result.rows[0] as { data: string } | undefined;
		if (!row) return null;

		const parsed = this.deserialize(row.data) as Record<string, unknown>;
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt as string),
			lastRunAt: parsed.lastRunAt
				? new Date(parsed.lastRunAt as string)
				: undefined,
			nextRunAt: parsed.nextRunAt
				? new Date(parsed.nextRunAt as string)
				: undefined,
			endDate: parsed.endDate ? new Date(parsed.endDate as string) : undefined,
		} as Schedule;
	}

	async getSchedules(): Promise<Schedule[]> {
		const result = await this.db.query(
			`SELECT data FROM ${this.keyPrefix}schedules`,
		);
		return (result.rows as { data: string }[]).map((row) => {
			const parsed = this.deserialize(row.data) as Record<string, unknown>;
			return {
				...parsed,
				createdAt: new Date(parsed.createdAt as string),
				lastRunAt: parsed.lastRunAt
					? new Date(parsed.lastRunAt as string)
					: undefined,
				nextRunAt: parsed.nextRunAt
					? new Date(parsed.nextRunAt as string)
					: undefined,
				endDate: parsed.endDate
					? new Date(parsed.endDate as string)
					: undefined,
			} as Schedule;
		});
	}

	async deleteSchedule(name: string): Promise<void> {
		await this.db.exec(
			`DELETE FROM ${this.keyPrefix}schedules WHERE name = ${this.getParamIndex(1)}`,
			[name],
		);
	}

	async acquireJobLock(
		jobId: string,
		instanceId: string,
		ttl: number,
	): Promise<boolean> {
		const lock = await this.lockProvider.acquire(
			this.lockKey(jobId),
			ttl,
			instanceId,
		);
		return lock !== null;
	}

	async releaseJobLock(jobId: string, _instanceId: string): Promise<void> {
		await this.lockProvider.forceRelease(this.lockKey(jobId));
	}

	async extendJobLock(
		jobId: string,
		_instanceId: string,
		ttl: number,
	): Promise<boolean> {
		return this.lockProvider.extend(this.lockKey(jobId), ttl, _instanceId);
	}

	supportsAutoScheduling(): boolean {
		return true;
	}

	async completeJobAndScheduleNext(
		jobId: string,
		result: { success: boolean; error?: string },
	): Promise<boolean> {
		// Get the job
		const job = await this.getJob(jobId);
		if (!job) {
			return false;
		}

		// Mark job as completed/failed
		job.status = result.success ? "completed" : "failed";
		job.completedAt = new Date();
		if (result.error) {
			job.error = result.error;
		}
		await this.saveJob(job);

		// Get schedule
		const schedule = await this.getSchedule(job.scheduleName);
		if (!schedule) {
			return false;
		}

		// Calculate next run time with proper cron parsing and end-date handling
		const nextRun = this.calculateNextRun(schedule);
		if (!nextRun) {
			return false; // No more occurrences (past end date or no valid next run)
		}

		// Create next job
		const nextJob: Job = {
			id: `${this.keyPrefix}job:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
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

		const table = `${this.keyPrefix}jobs`;

		// Atomic insert with idempotency check using INSERT WHERE NOT EXISTS pattern
		// This approach works across PostgreSQL, MySQL, and SQLite
		try {
			if (this.dialect === "postgres") {
				// Use CTE for atomic check-and-insert
				await this.db.exec(
					`WITH check_pending AS (
            SELECT 1 FROM ${table} 
            WHERE schedule_name = $1 AND status = 'pending' 
            LIMIT 1
          )
          INSERT INTO ${table} (id, status, data, run_at)
          SELECT $2, $3, $4, $5
          WHERE NOT EXISTS (SELECT 1 FROM check_pending)`,
					[
						schedule.name,
						nextJob.id,
						nextJob.status,
						this.serialize(nextJob),
						nextJob.runAt?.toISOString(),
					],
				);
			} else if (this.dialect === "mysql") {
				// Use INSERT IGNORE with a unique constraint or check in transaction
				// Fallback to simple check-then-insert (non-atomic but idempotent)
				const checkQuery = `SELECT id FROM ${table} WHERE schedule_name = ? AND status = 'pending' LIMIT 1`;
				const checkResult = await this.db.query(checkQuery, [schedule.name]);
				if ((checkResult.rows as { id: string }[]).length > 0) {
					return false;
				}
				await this.saveJob(nextJob);
			} else {
				// SQLite: Use INSERT WHERE NOT EXISTS
				await this.db.exec(
					`INSERT INTO ${table} (id, status, data, run_at)
           SELECT ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM ${table} WHERE schedule_name = ? AND status = 'pending'
           )`,
					[
						nextJob.id,
						nextJob.status,
						this.serialize(nextJob),
						nextJob.runAt?.toISOString(),
						schedule.name,
					],
				);
			}
			return true;
		} catch (_error) {
			// Duplicate key violation means we already have a pending job
			return false;
		}
	}

	private calculateNextRun(schedule: Schedule): Date | null {
		let nextRun: Date | null = null;

		if (schedule.cron) {
			// Use proper cron parser with timezone support
			try {
				const cron = parseCron(schedule.cron, schedule.timezone);
				nextRun = cron.next(new Date());
			} catch {
				// Invalid cron expression
				return null;
			}
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
}
