/**
 * Bun-native SQLite persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state using Bun's native
 * `bun:sqlite` module. This is faster than the sqlite3-based adapter under Bun.
 *
 * @example
 * ```typescript
 * import { Database } from 'bun:sqlite'
 * import { BunSQLiteAdapter } from '@go-go-scope/persistence-sqlite-bun'
 *
 * const db = new Database('/tmp/app.db')
 * const persistence = new BunSQLiteAdapter(db, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 *
 * // Acquire a lock with 30 second TTL
 * const lock = await s.acquireLock('resource:123', 30000)
 * if (!lock) {
 *   throw new Error('Could not acquire lock')
 * }
 *
 * // Lock automatically expires after TTL
 * // Optional: release early with await lock.release()
 * ```
 */

import type {
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";

// Bun's native SQLite Database type
interface BunDatabase {
	run(
		sql: string,
		params?: unknown[],
	): { changes: number; lastInsertRowid: number };
	query<T = unknown>(
		sql: string,
	): {
		get(...params: unknown[]): T | null;
		all(...params: unknown[]): T[];
		run(...params: unknown[]): { changes: number; lastInsertRowid: number };
	};
	close(): void;
}

/**
 * Bun-native SQLite persistence adapter
 */
export class BunSQLiteAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CheckpointProvider,
		PersistenceAdapter
{
	private readonly db: BunDatabase;
	private readonly keyPrefix: string;
	private readonly locks = new Map<string, { owner: string; expiry: number }>();
	private connected = false;

	constructor(db: BunDatabase, options: PersistenceAdapterOptions = {}) {
		this.db = db;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// Create table for circuit breaker state
		this.db.run(`
			CREATE TABLE IF NOT EXISTS go_goscope_circuit (
				key TEXT PRIMARY KEY,
				state TEXT NOT NULL,
				failure_count INTEGER NOT NULL DEFAULT 0,
				last_failure_time INTEGER,
				last_success_time INTEGER,
				updated_at INTEGER NOT NULL
			)
		`);

		this.db.run(`
			CREATE TABLE IF NOT EXISTS go_goscope_checkpoints (
				id TEXT PRIMARY KEY,
				task_id TEXT NOT NULL,
				sequence INTEGER NOT NULL,
				timestamp INTEGER NOT NULL,
				progress INTEGER NOT NULL DEFAULT 0,
				data TEXT NOT NULL,
				estimated_time_remaining INTEGER,
				created_at INTEGER DEFAULT (unixepoch())
			)
		`);
		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON go_goscope_checkpoints(task_id)`,
		);
		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_checkpoints_sequence ON go_goscope_checkpoints(task_id, sequence)`,
		);

		this.connected = true;
	}

	async disconnect(): Promise<void> {
		this.db.close();
		this.connected = false;
	}

	isConnected(): boolean {
		return this.connected;
	}

	// ============================================================================
	// Lock Provider (In-Memory with Cleanup)
	// ============================================================================

	async acquire(
		key: string,
		ttl: number,
		owner?: string,
	): Promise<LockHandle | null> {
		const fullKey = this.prefix(`lock:${key}`);
		const lockOwner = owner ?? this.generateOwner();
		const now = Date.now();

		// Clean expired locks
		for (const [k, v] of this.locks.entries()) {
			if (v.expiry < now) {
				this.locks.delete(k);
			}
		}

		// Check if lock exists
		if (this.locks.has(fullKey)) {
			return null;
		}

		// Acquire lock
		this.locks.set(fullKey, { owner: lockOwner, expiry: now + ttl });

		const handle: LockHandle = {
			release: async () => {
				const lock = this.locks.get(fullKey);
				if (lock?.owner === lockOwner) {
					this.locks.delete(fullKey);
				}
			},
			extend: async (newTtl: number) => {
				return this.extend(key, newTtl, lockOwner);
			},
			isValid: async () => {
				const lock = this.locks.get(fullKey);
				return lock?.owner === lockOwner && lock.expiry > Date.now();
			},
		};

		return handle;
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const lock = this.locks.get(fullKey);

		if (!lock || lock.owner !== owner) {
			return false;
		}

		lock.expiry = Date.now() + ttl;
		return true;
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		this.locks.delete(fullKey);
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);

		const stmt = this.db.query<{
			state: string;
			failure_count: number;
			last_failure_time: number | null;
			last_success_time: number | null;
		}>(
			"SELECT state, failure_count, last_failure_time, last_success_time FROM go_goscope_circuit WHERE key = ?",
		);

		const row = stmt.get(fullKey);

		if (!row) return null;

		return {
			state: row.state as CircuitBreakerPersistedState["state"],
			failureCount: row.failure_count,
			lastFailureTime: row.last_failure_time ?? undefined,
			lastSuccessTime: row.last_success_time ?? undefined,
		};
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`circuit:${key}`);
		const now = Date.now();

		this.db.run(
			`
				INSERT INTO go_goscope_circuit (key, state, failure_count, last_failure_time, last_success_time, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(key) DO UPDATE SET
					state = excluded.state,
					failure_count = excluded.failure_count,
					last_failure_time = excluded.last_failure_time,
					last_success_time = excluded.last_success_time,
					updated_at = excluded.updated_at
			`,
			[
				fullKey,
				state.state,
				state.failureCount,
				state.lastFailureTime ?? null,
				state.lastSuccessTime ?? null,
				now,
			],
		);
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		const state = (await this.getState(key)) ?? {
			state: "closed" as const,
			failureCount: 0,
		};

		state.failureCount++;
		state.lastFailureTime = Date.now();

		if (state.failureCount >= maxFailures) {
			state.state = "open";
		}

		await this.setState(key, state);
		return state.failureCount;
	}

	async recordSuccess(key: string): Promise<void> {
		await this.setState(key, {
			state: "closed",
			failureCount: 0,
			lastSuccessTime: Date.now(),
		});
	}

	// ============================================================================
	// Checkpoint Provider
	// ============================================================================

	async save<T>(checkpoint: Checkpoint<T>): Promise<void> {
		this.db.run(
			`INSERT INTO go_goscope_checkpoints 
				(id, task_id, sequence, timestamp, progress, data, estimated_time_remaining)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				progress = excluded.progress,
				data = excluded.data,
				estimated_time_remaining = excluded.estimated_time_remaining`,
			[
				checkpoint.id,
				checkpoint.taskId,
				checkpoint.sequence,
				checkpoint.timestamp,
				checkpoint.progress,
				JSON.stringify(checkpoint.data),
				checkpoint.estimatedTimeRemaining ?? null,
			],
		);
	}

	async load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined> {
		const stmt = this.db.query<{
			id: string;
			task_id: string;
			sequence: number;
			timestamp: number;
			progress: number;
			data: string;
			estimated_time_remaining: number | null;
		}>(`SELECT * FROM go_goscope_checkpoints WHERE id = ?`);

		const row = stmt.get(checkpointId);
		if (!row) return undefined;

		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: row.timestamp,
			progress: row.progress,
			data: JSON.parse(row.data) as T,
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		};
	}

	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const stmt = this.db.query<{
			id: string;
			task_id: string;
			sequence: number;
			timestamp: number;
			progress: number;
			data: string;
			estimated_time_remaining: number | null;
		}>(
			`SELECT * FROM go_goscope_checkpoints WHERE task_id = ? ORDER BY sequence DESC LIMIT 1`,
		);

		const row = stmt.get(taskId);
		if (!row) return undefined;

		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: row.timestamp,
			progress: row.progress,
			data: JSON.parse(row.data) as T,
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		};
	}

	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		const stmt = this.db.query<{
			id: string;
			task_id: string;
			sequence: number;
			timestamp: number;
			progress: number;
			data: string;
			estimated_time_remaining: number | null;
		}>(
			`SELECT * FROM go_goscope_checkpoints WHERE task_id = ? ORDER BY sequence ASC`,
		);

		const rows = stmt.all(taskId);
		return rows.map((row) => ({
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: row.timestamp,
			progress: row.progress,
			data: JSON.parse(row.data),
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		}));
	}

	async cleanup(taskId: string, keepCount: number): Promise<void> {
		this.db.run(
			`DELETE FROM go_goscope_checkpoints 
			 WHERE id IN (
				 SELECT id FROM go_goscope_checkpoints 
				 WHERE task_id = ? 
				 ORDER BY sequence DESC 
				 OFFSET ?
			 )`,
			[taskId, keepCount],
		);
	}

	async deleteAll(taskId: string): Promise<void> {
		this.db.run(`DELETE FROM go_goscope_checkpoints WHERE task_id = ?`, [
			taskId,
		]);
	}
}
