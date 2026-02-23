/**
 * Persistence-based job storage for distributed scheduling
 * Uses go-go-scope persistence adapters (Redis, PostgreSQL, MySQL, SQLite)
 */

import type { LockProvider } from "go-go-scope/persistence/index.js";
import type { Job, JobStatus, JobStorage, Schedule } from "./types.js";

/**
 * Options for persistence-based job storage
 */
export interface PersistenceJobStorageOptions {
  /** Lock provider for distributed locking */
  lockProvider: LockProvider;
  /** Key prefix for all storage keys */
  keyPrefix?: string;
  /** Default lock TTL in milliseconds */
  lockTTL?: number;
  /** Optional: Function to serialize job data */
  serialize?: (data: unknown) => string;
  /** Optional: Function to deserialize job data */
  deserialize?: (data: string) => unknown;
}

/**
 * Redis-based job storage
 * Requires Redis adapter with hash and set support
 */
export class RedisJobStorage implements JobStorage {
  private redis: {
    hset(key: string, field: string, value: string): Promise<void>;
    hget(key: string, field: string): Promise<string | null>;
    hdel(key: string, field: string): Promise<void>;
    hgetall(key: string): Promise<Record<string, string>>;
    sadd(key: string, ...members: string[]): Promise<void>;
    srem(key: string, ...members: string[]): Promise<void>;
    smembers(key: string): Promise<string[]>;
    zadd(key: string, score: number, member: string): Promise<void>;
    zrem(key: string, member: string): Promise<void>;
    zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  };
  private lockProvider: LockProvider;
  private keyPrefix: string;

  constructor(
    redis: RedisJobStorage["redis"],
    lockProvider: LockProvider,
    options?: { keyPrefix?: string }
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
      lastExecutedAt: parsed.lastExecutedAt ? new Date(parsed.lastExecutedAt as string) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt as string) : undefined,
      lockExpiresAt: parsed.lockExpiresAt ? new Date(parsed.lockExpiresAt as string) : undefined,
    } as Job;
  }

  private serializeSchedule(schedule: Schedule): string {
    return this.serialize({
      ...schedule,
      createdAt: schedule.createdAt.toISOString(),
      lastRunAt: schedule.lastRunAt?.toISOString(),
      nextRunAt: schedule.nextRunAt?.toISOString(),
    });
  }

  private deserializeSchedule(data: string): Schedule {
    const parsed = this.deserialize(data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt as string),
      lastRunAt: parsed.lastRunAt ? new Date(parsed.lastRunAt as string) : undefined,
      nextRunAt: parsed.nextRunAt ? new Date(parsed.nextRunAt as string) : undefined,
    } as Schedule;
  }

  async saveJob(job: Job): Promise<void> {
    const jobData = this.serializeJob(job);
    await this.redis.hset(this.keyPrefix + "jobs", job.id, jobData);
    
    // Update status index
    await this.redis.sadd(this.jobsIndexKey(job.status), job.id);
    
    // Remove from other status indexes
    const statuses: JobStatus[] = ["pending", "running", "completed", "failed", "cancelled"];
    for (const status of statuses) {
      if (status !== job.status) {
        await this.redis.srem(this.jobsIndexKey(status), job.id);
      }
    }

    // Add to due jobs sorted set if pending
    if (job.status === "pending" && job.runAt) {
      await this.redis.zadd(
        this.keyPrefix + "jobs:due",
        job.runAt.getTime(),
        job.id
      );
    } else {
      await this.redis.zrem(this.keyPrefix + "jobs:due", job.id);
    }
  }

  async getJob(id: string): Promise<Job | null> {
    const data = await this.redis.hget(this.keyPrefix + "jobs", id);
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
      this.keyPrefix + "jobs:due",
      0,
      before.getTime()
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
      await this.redis.zrem(this.keyPrefix + "jobs:due", id);
    }
    await this.redis.hdel(this.keyPrefix + "jobs", id);
  }

  async saveSchedule(schedule: Schedule): Promise<void> {
    const data = this.serializeSchedule(schedule);
    await this.redis.hset(this.keyPrefix + "schedules", schedule.name, data);
    await this.redis.sadd(this.schedulesIndexKey(), schedule.name);
  }

  async getSchedule(name: string): Promise<Schedule | null> {
    const data = await this.redis.hget(this.keyPrefix + "schedules", name);
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
    await this.redis.hdel(this.keyPrefix + "schedules", name);
    await this.redis.srem(this.schedulesIndexKey(), name);
  }

  async acquireJobLock(jobId: string, instanceId: string, ttl: number): Promise<boolean> {
    const lock = await this.lockProvider.acquire(this.lockKey(jobId), ttl, instanceId);
    return lock !== null;
  }

  async releaseJobLock(jobId: string, _instanceId: string): Promise<void> {
    await this.lockProvider.forceRelease(this.lockKey(jobId));
  }

  async extendJobLock(jobId: string, _instanceId: string, ttl: number): Promise<boolean> {
    return this.lockProvider.extend(this.lockKey(jobId), ttl, _instanceId);
  }
}

/**
 * SQL-based job storage (PostgreSQL, MySQL, SQLite)
 */
export class SQLJobStorage implements JobStorage {
  private db: {
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    exec(sql: string, params?: unknown[]): Promise<void>;
  };
  private lockProvider: LockProvider;
  private dialect: "postgres" | "mysql" | "sqlite";
  private keyPrefix: string;

  constructor(
    db: SQLJobStorage["db"],
    lockProvider: LockProvider,
    dialect: "postgres" | "mysql" | "sqlite",
    options?: { keyPrefix?: string }
  ) {
    this.db = db;
    this.lockProvider = lockProvider;
    this.dialect = dialect;
    this.keyPrefix = options?.keyPrefix ?? "scheduler:";
  }

  private get placeholder(): string {
    return this.dialect === "postgres" ? "$" : "?";
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
    const table = this.keyPrefix + "jobs";
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
        [job.id, job.status, data, job.runAt?.toISOString() ?? null]
      );
    } else if (this.dialect === "mysql") {
      await this.db.exec(
        `INSERT INTO ${table} (id, status, data, run_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = ?, data = ?, run_at = ?`,
        [job.id, job.status, data, job.runAt?.toISOString() ?? null, job.status, data, job.runAt?.toISOString() ?? null]
      );
    } else {
      await this.db.exec(
        `INSERT OR REPLACE INTO ${table} (id, status, data, run_at) VALUES (?, ?, ?, ?)`,
        [job.id, job.status, data, job.runAt?.toISOString() ?? null]
      );
    }
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.db.query(
      `SELECT data FROM ${this.keyPrefix}jobs WHERE id = ${this.placeholder}1`,
      [id]
    );
    const row = result.rows[0] as { data: string } | undefined;
    if (!row) return null;
    
    const parsed = this.deserialize(row.data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt as string),
      runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
      lastExecutedAt: parsed.lastExecutedAt ? new Date(parsed.lastExecutedAt as string) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt as string) : undefined,
      lockExpiresAt: parsed.lockExpiresAt ? new Date(parsed.lockExpiresAt as string) : undefined,
    } as Job;
  }

  async getJobsByStatus(status: JobStatus): Promise<Job[]> {
    const result = await this.db.query(
      `SELECT data FROM ${this.keyPrefix}jobs WHERE status = ${this.placeholder}1`,
      [status]
    );
    return (result.rows as { data: string }[]).map(row => {
      const parsed = this.deserialize(row.data) as Record<string, unknown>;
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt as string),
        runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
        lastExecutedAt: parsed.lastExecutedAt ? new Date(parsed.lastExecutedAt as string) : undefined,
        completedAt: parsed.completedAt ? new Date(parsed.completedAt as string) : undefined,
        lockExpiresAt: parsed.lockExpiresAt ? new Date(parsed.lockExpiresAt as string) : undefined,
      } as Job;
    });
  }

  async getDueJobs(before: Date): Promise<Job[]> {
    const result = await this.db.query(
      `SELECT data FROM ${this.keyPrefix}jobs 
       WHERE status = 'pending' AND (run_at IS NULL OR run_at <= ${this.placeholder}1)`,
      [before.toISOString()]
    );
    return (result.rows as { data: string }[]).map(row => {
      const parsed = this.deserialize(row.data) as Record<string, unknown>;
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt as string),
        runAt: parsed.runAt ? new Date(parsed.runAt as string) : undefined,
        lastExecutedAt: parsed.lastExecutedAt ? new Date(parsed.lastExecutedAt as string) : undefined,
        completedAt: parsed.completedAt ? new Date(parsed.completedAt as string) : undefined,
        lockExpiresAt: parsed.lockExpiresAt ? new Date(parsed.lockExpiresAt as string) : undefined,
      } as Job;
    });
  }

  async deleteJob(id: string): Promise<void> {
    await this.db.exec(
      `DELETE FROM ${this.keyPrefix}jobs WHERE id = ${this.placeholder}1`,
      [id]
    );
  }

  async saveSchedule(schedule: Schedule): Promise<void> {
    const table = this.keyPrefix + "schedules";
    const data = this.serialize({
      ...schedule,
      createdAt: schedule.createdAt.toISOString(),
      lastRunAt: schedule.lastRunAt?.toISOString(),
      nextRunAt: schedule.nextRunAt?.toISOString(),
    });
    
    if (this.dialect === "postgres") {
      await this.db.exec(
        `INSERT INTO ${table} (name, data) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET data = $2`,
        [schedule.name, data]
      );
    } else if (this.dialect === "mysql") {
      await this.db.exec(
        `INSERT INTO ${table} (name, data) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data = ?`,
        [schedule.name, data, data]
      );
    } else {
      await this.db.exec(
        `INSERT OR REPLACE INTO ${table} (name, data) VALUES (?, ?)`,
        [schedule.name, data]
      );
    }
  }

  async getSchedule(name: string): Promise<Schedule | null> {
    const result = await this.db.query(
      `SELECT data FROM ${this.keyPrefix}schedules WHERE name = ${this.placeholder}1`,
      [name]
    );
    const row = result.rows[0] as { data: string } | undefined;
    if (!row) return null;
    
    const parsed = this.deserialize(row.data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt as string),
      lastRunAt: parsed.lastRunAt ? new Date(parsed.lastRunAt as string) : undefined,
      nextRunAt: parsed.nextRunAt ? new Date(parsed.nextRunAt as string) : undefined,
    } as Schedule;
  }

  async getSchedules(): Promise<Schedule[]> {
    const result = await this.db.query(
      `SELECT data FROM ${this.keyPrefix}schedules`
    );
    return (result.rows as { data: string }[]).map(row => {
      const parsed = this.deserialize(row.data) as Record<string, unknown>;
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt as string),
        lastRunAt: parsed.lastRunAt ? new Date(parsed.lastRunAt as string) : undefined,
        nextRunAt: parsed.nextRunAt ? new Date(parsed.nextRunAt as string) : undefined,
      } as Schedule;
    });
  }

  async deleteSchedule(name: string): Promise<void> {
    await this.db.exec(
      `DELETE FROM ${this.keyPrefix}schedules WHERE name = ${this.placeholder}1`,
      [name]
    );
  }

  async acquireJobLock(jobId: string, instanceId: string, ttl: number): Promise<boolean> {
    const lock = await this.lockProvider.acquire(this.lockKey(jobId), ttl, instanceId);
    return lock !== null;
  }

  async releaseJobLock(jobId: string, _instanceId: string): Promise<void> {
    await this.lockProvider.forceRelease(this.lockKey(jobId));
  }

  async extendJobLock(jobId: string, _instanceId: string, ttl: number): Promise<boolean> {
    return this.lockProvider.extend(this.lockKey(jobId), ttl, _instanceId);
  }
}
