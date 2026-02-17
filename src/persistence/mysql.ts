/**
 * MySQL/MariaDB persistence adapter for go-go-scope
 *
 * Provides distributed locks, rate limiting, and circuit breaker state
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
	RateLimitConfig,
	RateLimitProvider,
	RateLimitResult,
} from "./types.js";

/**
 * MySQL persistence adapter
 */
export class MySQLAdapter
	implements
		LockProvider,
		RateLimitProvider,
		CircuitBreakerStateProvider,
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
					// Use UTC comparison to avoid timezone issues
					const expiresAt = new Date(rows[0].expires_at).getTime();
					const now = Date.now();
					if (expiresAt > now) {
						// Lock is still valid - same owner can reacquire
						if (rows[0].owner !== lockOwner) {
							await connection.query("ROLLBACK");
							connection.release();
							return null;
						}
					}
					// Lock is expired or same owner - update it
					await connection.query(
						"UPDATE go_goscope_locks SET owner = ?, expires_at = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND) WHERE `key` = ?",
						[lockOwner, ttl * 1000, fullKey],
					);
				} else {
					// No lock exists - insert new one
					await connection.query(
						"INSERT INTO go_goscope_locks (`key`, owner, expires_at) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL ? MICROSECOND))",
						[fullKey, lockOwner, ttl * 1000],
					);
				}

				await connection.query("COMMIT");

				const handle: LockHandle = {
					release: async () => {
						await this.pool.query(
							"DELETE FROM go_goscope_locks WHERE `key` = ? AND owner = ?",
							[fullKey, lockOwner],
						);
						connection.release();
					},
					extend: async (newTtl: number) => {
						return this.extendLock(fullKey, newTtl, lockOwner);
					},
					isValid: async () => {
						const [rows] = await this.pool.query(
							"SELECT owner FROM go_goscope_locks WHERE `key` = ? AND expires_at > NOW(3)",
							[fullKey],
						);
						return (rows as { owner: string }[])[0]?.owner === lockOwner;
					},
				};

				return handle;
			} catch (error) {
				await connection.query("ROLLBACK");
				throw error;
			}
		} catch (error) {
			connection.release();
			throw error;
		}
	}

	private async cleanupExpiredLocks(): Promise<void> {
		// Clean up expired locks periodically
		// This is a best-effort cleanup - stale locks are also checked at acquire time
		await this.pool.query(
			"DELETE FROM go_goscope_locks WHERE expires_at < NOW()",
		);
	}

	private async extendLock(
		key: string,
		ttl: number,
		owner: string,
	): Promise<boolean> {
		const [result] = await this.pool.query(
			"UPDATE go_goscope_locks SET expires_at = DATE_ADD(NOW(), INTERVAL ? MICROSECOND) WHERE `key` = ? AND owner = ? AND expires_at > NOW()",
			[ttl * 1000, key, owner],
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
	// Rate Limit Provider
	// ============================================================================

	async checkAndIncrement(
		key: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const connection = await this.pool.getConnection();

		try {
			await connection.query("START TRANSACTION");

			// Clean old entries and get current count
			await connection.query(
				"DELETE FROM go_goscope_ratelimit WHERE `key` = ? AND request_time < DATE_SUB(NOW(3), INTERVAL ? MICROSECOND)",
				[fullKey, config.windowMs * 1000],
			);

			const [countResult] = await connection.query(
				"SELECT COUNT(*) as count FROM go_goscope_ratelimit WHERE `key` = ?",
				[fullKey],
			);
			const currentCount = (countResult as { count: number }[])[0].count;

			const allowed = currentCount < config.max;

			if (allowed) {
				await connection.query(
					"INSERT INTO go_goscope_ratelimit (`key`, request_time) VALUES (?, NOW())",
					[fullKey],
				);
			}

			await connection.query("COMMIT");

			// Get oldest entry for reset time
			const [oldestResult] = await this.pool.query(
				"SELECT MIN(request_time) as oldest FROM go_goscope_ratelimit WHERE `key` = ?",
				[fullKey],
			);
			const oldestTime = (oldestResult as { oldest: Date }[])[0]?.oldest;
			const resetTimeMs = oldestTime
				? oldestTime.getTime() + config.windowMs - Date.now()
				: config.windowMs;

			return {
				allowed,
				remaining: Math.max(0, config.max - currentCount - (allowed ? 1 : 0)),
				limit: config.max,
				resetTimeMs: Math.max(0, resetTimeMs),
			};
		} catch (error) {
			await connection.query("ROLLBACK");
			throw error;
		} finally {
			connection.release();
		}
	}

	async reset(key: string): Promise<void> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		await this.pool.query("DELETE FROM go_goscope_ratelimit WHERE `key` = ?", [
			fullKey,
		]);
	}

	async getCount(key: string, windowMs: number): Promise<number> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const [result] = await this.pool.query(
			"SELECT COUNT(*) as count FROM go_goscope_ratelimit WHERE `key` = ? AND request_time > DATE_SUB(NOW(3), INTERVAL ? MICROSECOND)",
			[fullKey, windowMs * 1000],
		);
		return (result as { count: number }[])[0].count;
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

		const row = rows[0];
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
        CREATE TABLE IF NOT EXISTS go_goscope_ratelimit (
          id INT AUTO_INCREMENT PRIMARY KEY,
          \`key\` VARCHAR(255) NOT NULL,
          request_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_key_time (\`key\`, request_time)
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
