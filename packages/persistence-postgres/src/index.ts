/**
 * PostgreSQL persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * using PostgreSQL as the backend.
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg'
 * import { PostgresAdapter } from '@go-go-scope/persistence-postgres'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const persistence = new PostgresAdapter(pool, { keyPrefix: 'myapp:' })
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
import type { Pool } from "pg";

export { PostgresCacheAdapter } from "./cache.js";

/**
 * PostgreSQL persistence adapter
 */
export class PostgresAdapter
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

		// Clean up expired locks first
		await this.cleanupExpiredLocks();

		// Try to acquire lock using atomic INSERT with ON CONFLICT
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");

			try {
				// Use client-side time for consistency
				const now = new Date();
				const expiresAt = new Date(now.getTime() + ttl);

				// Check if lock exists and is not expired
				const checkResult = await client.query(
					"SELECT owner, expires_at FROM go_goscope_locks WHERE key = $1 FOR UPDATE",
					[fullKey],
				);

				if (checkResult.rows.length > 0) {
					// Lock exists - check if expired
					const rowExpiresAt = new Date(
						checkResult.rows[0].expires_at,
					).getTime();
					if (rowExpiresAt > Date.now()) {
						// Lock is still valid - same owner can reacquire
						if (checkResult.rows[0].owner !== lockOwner) {
							await client.query("ROLLBACK");
							client.release();
							return null;
						}
					}
					// Lock is expired or same owner - update it
					await client.query(
						"UPDATE go_goscope_locks SET owner = $2, expires_at = $3 WHERE key = $1",
						[fullKey, lockOwner, expiresAt],
					);
				} else {
					// No lock exists - insert new one
					await client.query(
						"INSERT INTO go_goscope_locks (key, owner, expires_at) VALUES ($1, $2, $3)",
						[fullKey, lockOwner, expiresAt],
					);
				}

				await client.query("COMMIT");

				const handle: LockHandle = {
					release: async () => {
						await this.pool.query(
							"DELETE FROM go_goscope_locks WHERE key = $1 AND owner = $2",
							[fullKey, lockOwner],
						);
					},
					extend: async (newTtl: number) => {
						return this.extendLock(fullKey, newTtl, lockOwner);
					},
					isValid: async () => {
						// Use client-side time for consistency
						const result = await this.pool.query(
							"SELECT owner, expires_at FROM go_goscope_locks WHERE key = $1",
							[fullKey],
						);
						if (!result.rows[0]) return false;
						return (
							result.rows[0].owner === lockOwner &&
							new Date(result.rows[0].expires_at).getTime() > Date.now()
						);
					},
				};

				client.release();
				return handle;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			}
		} catch (error) {
			client.release();
			throw error;
		}
	}

	private async cleanupExpiredLocks(): Promise<void> {
		// Clean up expired locks periodically
		await this.pool.query(
			"DELETE FROM go_goscope_locks WHERE expires_at < $1",
			[new Date()],
		);
	}

	private async extendLock(
		key: string,
		ttl: number,
		owner: string,
	): Promise<boolean> {
		const result = await this.pool.query(
			"UPDATE go_goscope_locks SET expires_at = NOW() + INTERVAL '1 millisecond' * $2 WHERE key = $1 AND owner = $3 AND expires_at > NOW()",
			[key, ttl, owner],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		return this.extendLock(fullKey, ttl, owner);
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.pool.query("DELETE FROM go_goscope_locks WHERE key = $1", [
			fullKey,
		]);
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);

		const result = await this.pool.query(
			"SELECT state, failure_count, last_failure_time, last_success_time FROM go_goscope_circuit WHERE key = $1",
			[fullKey],
		);

		if (result.rows.length === 0) {
			return null;
		}

		const row = result.rows[0];
		return {
			state: row.state,
			failureCount: parseInt(row.failure_count, 10),
			lastFailureTime: row.last_failure_time
				? new Date(row.last_failure_time).getTime()
				: undefined,
			lastSuccessTime: row.last_success_time
				? new Date(row.last_success_time).getTime()
				: undefined,
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
          (key, state, failure_count, last_failure_time, last_success_time, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (key) DO UPDATE SET
          state = EXCLUDED.state,
          failure_count = EXCLUDED.failure_count,
          last_failure_time = EXCLUDED.last_failure_time,
          last_success_time = EXCLUDED.last_success_time,
          updated_at = EXCLUDED.updated_at
      `,
			[
				fullKey,
				state.state,
				state.failureCount,
				state.lastFailureTime
					? new Date(state.lastFailureTime).toISOString()
					: null,
				state.lastSuccessTime
					? new Date(state.lastSuccessTime).toISOString()
					: null,
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
		const client = await this.pool.connect();
		try {
			// Create tables if they don't exist
			await client.query(`
        CREATE TABLE IF NOT EXISTS go_goscope_locks (
          key TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_locks_expires ON go_goscope_locks(expires_at);
        
        CREATE TABLE IF NOT EXISTS go_goscope_circuit (
          key TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          failure_count INTEGER NOT NULL DEFAULT 0,
          last_failure_time TIMESTAMP,
          last_success_time TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_circuit_updated ON go_goscope_circuit(updated_at);
        
        CREATE TABLE IF NOT EXISTS go_goscope_cache (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          expires_at TIMESTAMP,
          accessed_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON go_goscope_cache(expires_at);
      `);
		} finally {
			client.release();
		}
	}

	async disconnect(): Promise<void> {
		await this.pool.end();
	}

	isConnected(): boolean {
		return this.pool.totalCount > 0;
	}

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);

		const result = await this.pool.query(
			`SELECT value FROM go_goscope_cache WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
			[fullKey],
		);

		if (result.rows.length === 0) {
			return null;
		}

		return result.rows[0].value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const expiresAt = ttl ? new Date(Date.now() + ttl).toISOString() : null;

		await this.pool.query(
			`INSERT INTO go_goscope_cache (key, value, expires_at) VALUES ($1, $2, $3)
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		await this.pool.query(`DELETE FROM go_goscope_cache WHERE key = $1`, [
			fullKey,
		]);
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(`cache:${key}`);

		const result = await this.pool.query(
			`SELECT 1 FROM go_goscope_cache WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
			[fullKey],
		);

		return result.rows.length > 0;
	}

	async clear(): Promise<void> {
		if (this.keyPrefix) {
			await this.pool.query(`DELETE FROM go_goscope_cache WHERE key LIKE $1`, [
				`${this.keyPrefix}cache:%`,
			]);
		} else {
			await this.pool.query(`DELETE FROM go_goscope_cache`);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		let query = `SELECT key FROM go_goscope_cache WHERE expires_at IS NULL OR expires_at > NOW()`;
		let params: string[] = [];

		if (this.keyPrefix) {
			if (pattern) {
				query = `SELECT key FROM go_goscope_cache WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`;
				params = [`${this.keyPrefix}cache:${pattern}`];
			} else {
				query = `SELECT key FROM go_goscope_cache WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`;
				params = [`${this.keyPrefix}cache:%`];
			}
		} else if (pattern) {
			query = `SELECT key FROM go_goscope_cache WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`;
			params = [pattern];
		}

		const result = await this.pool.query(query, params);
		const keys = result.rows.map((r) => r.key as string);

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
		const query = `
			INSERT INTO go_goscope_checkpoints 
				(id, task_id, sequence, timestamp, progress, data, estimated_time_remaining)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id) DO UPDATE SET
				progress = EXCLUDED.progress,
				data = EXCLUDED.data,
				estimated_time_remaining = EXCLUDED.estimated_time_remaining
		`;

		await this.pool.query(query, [
			checkpoint.id,
			checkpoint.taskId,
			checkpoint.sequence,
			checkpoint.timestamp,
			checkpoint.progress,
			JSON.stringify(checkpoint.data),
			checkpoint.estimatedTimeRemaining ?? null,
		]);
	}

	async load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined> {
		const result = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints WHERE id = $1`,
			[checkpointId],
		);

		if (result.rows.length === 0) {
			return undefined;
		}

		const row = result.rows[0];
		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data as T,
			estimatedTimeRemaining: row.estimated_time_remaining
				? Number(row.estimated_time_remaining)
				: undefined,
		};
	}

	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const result = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints 
			 WHERE task_id = $1 
			 ORDER BY sequence DESC 
			 LIMIT 1`,
			[taskId],
		);

		if (result.rows.length === 0) {
			return undefined;
		}

		const row = result.rows[0];
		return {
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data as T,
			estimatedTimeRemaining: row.estimated_time_remaining
				? Number(row.estimated_time_remaining)
				: undefined,
		};
	}

	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		const result = await this.pool.query(
			`SELECT * FROM go_goscope_checkpoints 
			 WHERE task_id = $1 
			 ORDER BY sequence ASC`,
			[taskId],
		);

		return result.rows.map((row) => ({
			id: row.id,
			taskId: row.task_id,
			sequence: row.sequence,
			timestamp: Number(row.timestamp),
			progress: row.progress,
			data: row.data,
			estimatedTimeRemaining: row.estimated_time_remaining
				? Number(row.estimated_time_remaining)
				: undefined,
		}));
	}

	async cleanup(taskId: string, keepCount: number): Promise<void> {
		// Delete old checkpoints, keeping only the most recent N
		await this.pool.query(
			`DELETE FROM go_goscope_checkpoints 
			 WHERE id IN (
				 SELECT id FROM go_goscope_checkpoints 
				 WHERE task_id = $1 
				 ORDER BY sequence DESC 
				 OFFSET $2
			 )`,
			[taskId, keepCount],
		);
	}

	async deleteAll(taskId: string): Promise<void> {
		await this.pool.query(
			`DELETE FROM go_goscope_checkpoints WHERE task_id = $1`,
			[taskId],
		);
	}
}
export { PostgresIdempotencyAdapter } from "./idempotency.js";
