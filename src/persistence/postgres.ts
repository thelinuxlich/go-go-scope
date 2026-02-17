/**
 * PostgreSQL persistence adapter for go-go-scope
 *
 * Provides distributed locks, rate limiting, and circuit breaker state
 * using PostgreSQL as the backend.
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg'
 * import { PostgresAdapter } from 'go-go-scope/persistence/postgres'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const persistence = new PostgresAdapter(pool, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 * using lock = await s.acquireLock('resource:123')
 * ```
 */

import type { Pool } from "pg";
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
 * PostgreSQL persistence adapter
 */
export class PostgresAdapter
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

		// Try to acquire lock using atomic INSERT with ON CONFLICT
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");

			try {
				// Check if lock exists and is not expired
				const checkResult = await client.query(
					"SELECT owner, expires_at FROM go_goscope_locks WHERE key = $1 FOR UPDATE",
					[fullKey],
				);

				if (checkResult.rows.length > 0) {
					// Lock exists - check if expired
					const expiresAt = new Date(checkResult.rows[0].expires_at).getTime();
					if (expiresAt > Date.now()) {
						// Lock is still valid - same owner can reacquire
						if (checkResult.rows[0].owner !== lockOwner) {
							await client.query("ROLLBACK");
							client.release();
							return null;
						}
					}
					// Lock is expired or same owner - update it
					await client.query(
						"UPDATE go_goscope_locks SET owner = $2, expires_at = NOW() + INTERVAL '1 millisecond' * $3 WHERE key = $1",
						[fullKey, lockOwner, ttl],
					);
				} else {
					// No lock exists - insert new one
					await client.query(
						"INSERT INTO go_goscope_locks (key, owner, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 millisecond' * $3)",
						[fullKey, lockOwner, ttl],
					);
				}

				await client.query("COMMIT");

				const handle: LockHandle = {
					release: async () => {
						await this.pool.query(
							"DELETE FROM go_goscope_locks WHERE key = $1 AND owner = $2",
							[fullKey, lockOwner],
						);
						client.release();
					},
					extend: async (newTtl: number) => {
						return this.extendLock(fullKey, newTtl, lockOwner);
					},
					isValid: async () => {
						const result = await this.pool.query(
							"SELECT owner FROM go_goscope_locks WHERE key = $1 AND expires_at > NOW()",
							[fullKey],
						);
						return result.rows[0]?.owner === lockOwner;
					},
				};

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
			"DELETE FROM go_goscope_locks WHERE expires_at < NOW()",
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
		return result.rowCount > 0;
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
	// Rate Limit Provider
	// ============================================================================

	async checkAndIncrement(
		key: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult> {
		const fullKey = this.prefix(`ratelimit:${key}`);

		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");

			// Clean old entries and get current count
			const windowStart = new Date(Date.now() - config.windowMs).toISOString();
			await client.query(
				"DELETE FROM go_goscope_ratelimit WHERE key = $1 AND request_time < $2",
				[fullKey, windowStart],
			);

			const countResult = await client.query(
				"SELECT COUNT(*) as count FROM go_goscope_ratelimit WHERE key = $1",
				[fullKey],
			);
			const currentCount = parseInt(countResult.rows[0].count, 10);

			const allowed = currentCount < config.max;

			if (allowed) {
				await client.query(
					"INSERT INTO go_goscope_ratelimit (key, request_time) VALUES ($1, NOW())",
					[fullKey],
				);
			}

			await client.query("COMMIT");

			// Get oldest entry for reset time calculation
			const oldestResult = await this.pool.query(
				"SELECT MIN(request_time) as oldest FROM go_goscope_ratelimit WHERE key = $1",
				[fullKey],
			);
			const oldestTime = oldestResult.rows[0]?.oldest
				? new Date(oldestResult.rows[0].oldest).getTime()
				: Date.now();
			const resetTimeMs = oldestTime + config.windowMs - Date.now();

			return {
				allowed,
				remaining: Math.max(0, config.max - currentCount - (allowed ? 1 : 0)),
				limit: config.max,
				resetTimeMs: Math.max(0, resetTimeMs),
			};
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	async reset(key: string): Promise<void> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		await this.pool.query("DELETE FROM go_goscope_ratelimit WHERE key = $1", [
			fullKey,
		]);
	}

	async getCount(key: string, windowMs: number): Promise<number> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const windowStart = new Date(Date.now() - windowMs).toISOString();

		const result = await this.pool.query(
			"SELECT COUNT(*) as count FROM go_goscope_ratelimit WHERE key = $1 AND request_time > $2",
			[fullKey, windowStart],
		);

		return parseInt(result.rows[0].count, 10);
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
        
        CREATE TABLE IF NOT EXISTS go_goscope_ratelimit (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL,
          request_time TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_ratelimit_key_time ON go_goscope_ratelimit(key, request_time);
        
        CREATE TABLE IF NOT EXISTS go_goscope_circuit (
          key TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          failure_count INTEGER NOT NULL DEFAULT 0,
          last_failure_time TIMESTAMP,
          last_success_time TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_circuit_updated ON go_goscope_circuit(updated_at);
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
}
