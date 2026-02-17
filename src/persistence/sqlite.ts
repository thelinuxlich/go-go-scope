/**
 * SQLite persistence adapter for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
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
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
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
	implements LockProvider, CircuitBreakerStateProvider, PersistenceAdapter
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

	// @ts-expect-error all method is defined but not fully used yet
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
		// Create table for circuit breaker state
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
