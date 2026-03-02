/**
 * MySQL/MariaDB persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * using MySQL as the backend.
 *
 * @example
 * ```typescript
 * import { createPool } from 'mysql2/promise'
 * import { MySQLAdapter } from '@go-go-scope/persistence-mysql'
 *
 * const pool = createPool({ uri: process.env.DATABASE_URL })
 * const persistence = new MySQLAdapter(pool, { keyPrefix: 'myapp:' })
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
	CacheProvider,
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";
import type { Pool } from "mysql2/promise";

export { MySQLCacheAdapter } from "./cache.js";

/**
 * MySQL persistence adapter
 */
export class MySQLAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CacheProvider,
		CheckpointProvider,
		PersistenceAdapter
{
	private readonly pool: Pool;
	private readonly keyPrefix: string;

	constructor(pool: Pool, options: PersistenceAdapterOptions = {}) {
		this.pool = pool;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	// ============================================================================
	// Lock Provider (Application-level with TTL)
	// ============================================================================

	async acquire(
		key: string,
		ttl: number,
		owner?: string,
	): Promise<LockHandle | null> {
		const fullKey = this.prefix(`lock:${key}`);
		const lockOwner = owner ?? this.generateOwner();
		// Use client-side time for consistency
		const now = new Date();
		const expiresAt = new Date(now.getTime() + ttl);

		// Clean up expired locks first
		await this.cleanupExpiredLocks();

		// Try to acquire lock using atomic INSERT
		// This avoids GET_LOCK() which doesn't respect TTL
		const connection = await this.pool.getConnection();
		try {
			await connection.query("START TRANSACTION");

			try {
				// Check if lock exists and is not expired
				const [existing] = await connection.query(
					"SELECT owner, expires_at FROM go_goscope_locks WHERE `key` = ? FOR UPDATE",
					[fullKey],
				);

				const rows = existing as Array<{ owner: string; expires_at: Date }>;

				if (rows.length > 0) {
					// Lock exists - check if expired
					const firstRow = rows[0];
					if (!firstRow) return null;
					const rowExpiresAt = new Date(firstRow.expires_at).getTime();
					const rowNow = Date.now();
					if (rowExpiresAt > rowNow) {
						// Lock is still valid - same owner can reacquire
						if (firstRow.owner !== lockOwner) {
							await connection.query("ROLLBACK");
							connection.release();
							return null;
						}
					}
					// Lock is expired or same owner - update it
					await connection.query(
						"UPDATE go_goscope_locks SET owner = ?, expires_at = ? WHERE `key` = ?",
						[lockOwner, expiresAt, fullKey],
					);
				} else {
					// No lock exists - insert new one
					await connection.query(
						"INSERT INTO go_goscope_locks (`key`, owner, expires_at) VALUES (?, ?, ?)",
						[fullKey, lockOwner, expiresAt],
					);
				}

				await connection.query("COMMIT");

				const handle: LockHandle = {
					release: async () => {
						await this.pool.query(
							"DELETE FROM go_goscope_locks WHERE `key` = ? AND owner = ?",
							[fullKey, lockOwner],
						);
					},
					extend: async (newTtl: number) => {
						return this.extendLock(fullKey, newTtl, lockOwner);
					},
					isValid: async () => {
						const [rows] = await this.pool.query(
							"SELECT owner, expires_at FROM go_goscope_locks WHERE `key` = ?",
							[fullKey],
						);
						const result = (rows as { owner: string; expires_at: Date }[])[0];
						if (!result) return false;
						// Use client-side time comparison for consistency
						return (
							result.owner === lockOwner &&
							new Date(result.expires_at).getTime() > Date.now()
						);
					},
				};

				return handle;
			} catch (error) {
				await connection.query("ROLLBACK");
				throw error;
			}
		} finally {
			connection.release();
		}
	}

	private async cleanupExpiredLocks(): Promise<void> {
		// Clean up expired locks periodically
		// This is a best-effort cleanup - stale locks are also checked at acquire time
		await this.pool.query("DELETE FROM go_goscope_locks WHERE expires_at < ?", [
			new Date(),
		]);
	}

	private async extendLock(
		key: string,
		ttl: number,
		owner: string,
	): Promise<boolean> {
		const newExpiresAt = new Date(Date.now() + ttl);
		const [result] = await this.pool.query(
			"UPDATE go_goscope_locks SET expires_at = ? WHERE `key` = ? AND owner = ? AND expires_at > ?",
			[newExpiresAt, key, owner, new Date()],
		);
		return (result as { affectedRows: number }).affectedRows > 0;
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		return this.extendLock(fullKey, ttl, owner);
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.pool.query("DELETE FROM go_goscope_locks WHERE `key` = ?", [
			fullKey,
		]);
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);

		const [result] = await this.pool.query(
			"SELECT state, failure_count, last_failure_time, last_success_time FROM go_goscope_circuit WHERE `key` = ?",
			[fullKey],
		);

		const rows = result as Array<{
			state: string;
			failure_count: number;
			last_failure_time: Date | null;
			last_success_time: Date | null;
		}>;

		if (rows.length === 0) {
			return null;
		}

		const row = rows[0]!;
		return {
			state: row.state as CircuitBreakerPersistedState["state"],
			failureCount: row.failure_count,
			lastFailureTime: row.last_failure_time?.getTime(),
			lastSuccessTime: row.last_success_time?.getTime(),
		};
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`circuit:${key}`);

		await this.pool.query(
			`
        INSERT INTO go_goscope_circuit 
          (\`key\`, state, failure_count, last_failure_time, last_success_time, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          state = VALUES(state),
          failure_count = VALUES(failure_count),
          last_failure_time = VALUES(last_failure_time),
          last_success_time = VALUES(last_success_time),
          updated_at = VALUES(updated_at)
      `,
			[
				fullKey,
				state.state,
				state.failureCount,
				state.lastFailureTime ? new Date(state.lastFailureTime) : null,
				state.lastSuccessTime ? new Date(state.lastSuccessTime) : null,
			],
		);
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		const state = (await this.getState(key)) ?? {
			state: "closed",
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
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			// Create tables
			await connection.query(`
        CREATE TABLE IF NOT EXISTS go_goscope_locks (
          \`key\` VARCHAR(255) PRIMARY KEY,
          owner VARCHAR(255) NOT NULL,
          expires_at DATETIME NOT NULL,
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB;
      `);

			await connection.query(`
        CREATE TABLE IF NOT EXISTS go_goscope_circuit (
          \`key\` VARCHAR(255) PRIMARY KEY,
          state VARCHAR(20) NOT NULL,
          failure_count INT NOT NULL DEFAULT 0,
          last_failure_time DATETIME,
          last_success_time DATETIME,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_updated (updated_at)
        ) ENGINE=InnoDB;
      `);

			await connection.query(`
        CREATE TABLE IF NOT EXISTS go_goscope_cache (
          \`key\` VARCHAR(255) PRIMARY KEY,
          value JSON NOT NULL,
          expires_at DATETIME,
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB;
      `);

			await connection.query(`
        CREATE TABLE IF NOT EXISTS go_goscope_checkpoints (
          id VARCHAR(255) PRIMARY KEY,
          task_id VARCHAR(255) NOT NULL,
          sequence INT NOT NULL,
          timestamp BIGINT NOT NULL,
          progress INT NOT NULL DEFAULT 0,
          data JSON NOT NULL,
          estimated_time_remaining BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_checkpoints_task (task_id),
          INDEX idx_checkpoints_sequence (task_id, sequence)
        ) ENGINE=InnoDB;
      `);
		} finally {
			connection.release();
		}
	}

	async disconnect(): Promise<void> {
		await this.pool.end();
	}

	isConnected(): boolean {
		return true;
	}

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);

		const [rows] = await this.pool.query(
			`SELECT value FROM go_goscope_cache WHERE \`key\` = ? AND (expires_at IS NULL OR expires_at > NOW())`,
			[fullKey],
		);

		const results = rows as Array<{ value: unknown }>;
		if (results.length === 0) {
			return null;
		}

		const firstResult = results[0];
		if (!firstResult) {
			return null;
		}
		return firstResult.value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const expiresAt = ttl
			? new Date(Date.now() + ttl).toISOString().slice(0, 19).replace("T", " ")
			: null;

		await this.pool.query(
			`INSERT INTO go_goscope_cache (\`key\`, value, expires_at) VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE value = VALUES(value), expires_at = VALUES(expires_at)`,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		await this.pool.query(`DELETE FROM go_goscope_cache WHERE \`key\` = ?`, [
			fullKey,
		]);
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(`cache:${key}`);

		const [rows] = await this.pool.query(
			`SELECT 1 FROM go_goscope_cache WHERE \`key\` = ? AND (expires_at IS NULL OR expires_at > NOW())`,
			[fullKey],
		);

		return (rows as unknown[]).length > 0;
	}

	async clear(): Promise<void> {
		if (this.keyPrefix) {
			await this.pool.query(
				`DELETE FROM go_goscope_cache WHERE \`key\` LIKE ?`,
				[`${this.keyPrefix}cache:%`],
			);
		} else {
			await this.pool.query(`DELETE FROM go_goscope_cache`);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		let query: string;
		let params: string[] = [];

		if (this.keyPrefix) {
			if (pattern) {
				query = `SELECT \`key\` FROM go_goscope_cache WHERE \`key\` LIKE ? AND (expires_at IS NULL OR expires_at > NOW())`;
				params = [`${this.keyPrefix}cache:${pattern.replace(/\*/g, "%")}`];
			} else {
				query = `SELECT \`key\` FROM go_goscope_cache WHERE \`key\` LIKE ? AND (expires_at IS NULL OR expires_at > NOW())`;
				params = [`${this.keyPrefix}cache:%`];
			}
		} else if (pattern) {
			query = `SELECT \`key\` FROM go_goscope_cache WHERE \`key\` LIKE ? AND (expires_at IS NULL OR expires_at > NOW())`;
			params = [pattern.replace(/\*/g, "%")];
		} else {
			query = `SELECT \`key\` FROM go_goscope_cache WHERE expires_at IS NULL OR expires_at > NOW()`;
		}

		const [rows] = await this.pool.query(query, params);
		const keys = (rows as Array<{ key: string }>).map((r) => r.key);

		// Remove prefix from returned keys
		if (this.keyPrefix) {
			return keys.map((k) =>
				k.startsWith(`${this.keyPrefix}cache:`)
					? k.slice(`${this.keyPrefix}cache:`.length)
					: k,
			);
		}
		return keys;
	}

	// ============================================================================
	// Checkpoint Provider
	// ============================================================================

	async save<T>(checkpoint: Checkpoint<T>): Promise<void> {
		await this.pool.query(
			`INSERT INTO go_goscope_checkpoints 
				(id, task_id, sequence, timestamp, progress, data, estimated_time_remaining)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE
				progress = VALUES(progress),
				data = VALUES(data),
				estimated_time_remaining = VALUES(estimated_time_remaining)`,
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
		const [rows] = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints WHERE id = ?`,
			[checkpointId],
		);

		const results = rows as Array<{
			id: string;
			task_id: string;
			sequence: number;
			timestamp: number;
			progress: number;
			data: unknown;
			estimated_time_remaining: number | null;
		}>;

		if (results.length === 0) return undefined;

		const row = results[0]!;
		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data as T,
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		};
	}

	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const [rows] = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints 
			 WHERE task_id = ? 
			 ORDER BY sequence DESC 
			 LIMIT 1`,
			[taskId],
		);

		const results = rows as Array<{
			id: string;
			task_id: string;
			sequence: number;
			timestamp: number;
			progress: number;
			data: unknown;
			estimated_time_remaining: number | null;
		}>;

		if (results.length === 0) return undefined;

		const row = results[0]!;
		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data as T,
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		};
	}

	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		const [rows] = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints 
			 WHERE task_id = ? 
			 ORDER BY sequence ASC`,
			[taskId],
		);

		return (
			rows as Array<{
				id: string;
				task_id: string;
				sequence: number;
				timestamp: number;
				progress: number;
				data: unknown;
				estimated_time_remaining: number | null;
			}>
		).map((row) => ({
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data,
			estimatedTimeRemaining: row.estimated_time_remaining ?? undefined,
		}));
	}

	async cleanup(taskId: string, keepCount: number): Promise<void> {
		await this.pool.query(
			`DELETE FROM go_goscope_checkpoints 
			 WHERE id IN (
				 SELECT id FROM (
					 SELECT id FROM go_goscope_checkpoints 
					 WHERE task_id = ? 
					 ORDER BY sequence DESC 
					 LIMIT 18446744073709551615 OFFSET ?
				 ) AS subquery
			 )`,
			[taskId, keepCount],
		);
	}

	async deleteAll(taskId: string): Promise<void> {
		await this.pool.query(
			`DELETE FROM go_goscope_checkpoints WHERE task_id = ?`,
			[taskId],
		);
	}
}
export { MySQLIdempotencyAdapter } from "./idempotency.js";
