/**
 * MySQL/MariaDB persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * using MySQL as the backend.
 *
 * @example
 * ```typescript
 * import { createPool } from 'mysql2/promise'
 * import { MySQLAdapter } from 'go-go-scope/persistence/mysql'
 *
 * const pool = createPool({ uri: process.env.DATABASE_URL })
 * const persistence = new MySQLAdapter(pool, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 * using lock = await s.acquireLock('resource:123')
 * ```
 */

import type { Pool } from "mysql2/promise";
import type {
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "./types.js";

/**
 * MySQL persistence adapter
 */
export class MySQLAdapter
	implements LockProvider, CircuitBreakerStateProvider, PersistenceAdapter
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
}
