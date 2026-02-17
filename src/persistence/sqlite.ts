/**
 * SQLite persistence adapter for go-go-scope
 *
 * Provides distributed locks, rate limiting, and circuit breaker state
 * using SQLite as the backend. Ideal for single-node deployments or testing.
 *
 * @example
 * ```typescript
 * import sqlite3 from 'sqlite3'
 * import { SQLiteAdapter } from 'go-go-scope/persistence/sqlite'
 *
 * const db = new sqlite3.Database('/tmp/app.db')
 * const persistence = new SQLiteAdapter(db, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 * using lock = await s.acquireLock('resource:123')
 * ```
 */

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
 * sqlite3 Database interface
 */
interface Database {
	run(
		sql: string,
		params: unknown[],
		callback?: (err: Error | null) => void,
	): void;
	get(
		sql: string,
		params: unknown[],
		callback: (err: Error | null, row?: unknown) => void,
	): void;
	all(
		sql: string,
		params: unknown[],
		callback: (err: Error | null, rows?: unknown[]) => void,
	): void;
	close(): void;
}

/**
 * SQLite persistence adapter
 */
export class SQLiteAdapter
	implements
		LockProvider,
		RateLimitProvider,
		CircuitBreakerStateProvider,
		PersistenceAdapter
{
	private readonly db: Database;
	private readonly keyPrefix: string;
	private readonly locks = new Map<string, { owner: string; expiry: number }>();
	private connected = false;

	constructor(db: Database, options: PersistenceAdapterOptions = {}) {
		this.db = db;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private async run(sql: string, params: unknown[] = []): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.run(sql, params, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	private async get<T>(
		sql: string,
		params: unknown[] = [],
	): Promise<T | undefined> {
		return new Promise((resolve, reject) => {
			this.db.get(sql, params, (err, row) => {
				if (err) reject(err);
				else resolve(row as T | undefined);
			});
		});
	}

	private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
		return new Promise((resolve, reject) => {
			this.db.all(sql, params, (err, rows) => {
				if (err) reject(err);
				else resolve((rows || []) as T[]);
			});
		});
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// Create tables for rate limiting and circuit breaker state
		await this.run(`
			CREATE TABLE IF NOT EXISTS go_goscope_ratelimit (
				key TEXT PRIMARY KEY,
				requests TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

		await this.run(`
			CREATE TABLE IF NOT EXISTS go_goscope_circuit (
				key TEXT PRIMARY KEY,
				state TEXT NOT NULL,
				failure_count INTEGER NOT NULL DEFAULT 0,
				last_failure_time INTEGER,
				last_success_time INTEGER,
				updated_at INTEGER NOT NULL
			)
		`);

		await this.run(`
			CREATE INDEX IF NOT EXISTS idx_ratelimit_updated ON go_goscope_ratelimit(updated_at)
		`);

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
	// Rate Limit Provider (Sliding Window)
	// ============================================================================

	async checkAndIncrement(
		key: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const now = Date.now();
		const windowStart = now - config.windowMs;

		// Get current requests
		const row = await this.get<{ requests: string }>(
			"SELECT requests FROM go_goscope_ratelimit WHERE key = ?",
			[fullKey],
		);

		let requests: number[] = [];
		if (row) {
			requests = JSON.parse(row.requests) as number[];
			// Filter to current window
			requests = requests.filter((t) => t > windowStart);
		}

		const currentCount = requests.length;
		const allowed = currentCount < config.max;

		if (allowed) {
			requests.push(now);
			await this.run(
				`
					INSERT INTO go_goscope_ratelimit (key, requests, updated_at)
					VALUES (?, ?, ?)
					ON CONFLICT(key) DO UPDATE SET
						requests = excluded.requests,
						updated_at = excluded.updated_at
				`,
				[fullKey, JSON.stringify(requests), now],
			);
		}

		// Calculate reset time
		const oldestRequest = requests[0] ?? now;
		const resetTimeMs = oldestRequest + config.windowMs - now;

		return {
			allowed,
			remaining: Math.max(0, config.max - currentCount - (allowed ? 1 : 0)),
			limit: config.max,
			resetTimeMs: Math.max(0, resetTimeMs),
		};
	}

	async reset(key: string): Promise<void> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		await this.run("DELETE FROM go_goscope_ratelimit WHERE key = ?", [fullKey]);
	}

	async getCount(key: string, windowMs: number): Promise<number> {
		const fullKey = this.prefix(`ratelimit:${key}`);
		const windowStart = Date.now() - windowMs;

		const row = await this.get<{ requests: string }>(
			"SELECT requests FROM go_goscope_ratelimit WHERE key = ?",
			[fullKey],
		);

		if (!row) return 0;

		const requests = JSON.parse(row.requests) as number[];
		return requests.filter((t) => t > windowStart).length;
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);

		const row = await this.get<{
			state: string;
			failure_count: number;
			last_failure_time: number | null;
			last_success_time: number | null;
		}>(
			"SELECT state, failure_count, last_failure_time, last_success_time FROM go_goscope_circuit WHERE key = ?",
			[fullKey],
		);

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

		await this.run(
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
}
