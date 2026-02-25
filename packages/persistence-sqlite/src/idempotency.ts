/**
 * SQLite idempotency adapter for go-go-scope
 */

import type { IdempotencyProvider } from "go-go-scope";
import type { Database } from "sqlite3";

export interface SQLiteIdempotencyAdapterOptions {
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * SQLite idempotency adapter implementing IdempotencyProvider
 */
export class SQLiteIdempotencyAdapter implements IdempotencyProvider {
	private readonly db: Database;
	private readonly keyPrefix: string;

	constructor(db: Database, options: SQLiteIdempotencyAdapterOptions = {}) {
		this.db = db;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	async connect(): Promise<void> {
		// Create table if not exists
		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`CREATE TABLE IF NOT EXISTS go_goscope_idempotency (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					expires_at INTEGER,
					created_at INTEGER DEFAULT (unixepoch()),
					updated_at INTEGER DEFAULT (unixepoch())
				)`,
				(err) => (err ? reject(err) : resolve()),
			);
		});

		// Create index on expires_at
		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
				 ON go_goscope_idempotency(expires_at) 
				 WHERE expires_at IS NOT NULL`,
				(err) => (err ? reject(err) : resolve()),
			);
		});
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);

		return new Promise((resolve, reject) => {
			const now = Math.floor(Date.now() / 1000);
			this.db.get(
				`SELECT value, expires_at 
				 FROM go_goscope_idempotency 
				 WHERE key = ? 
				 AND (expires_at IS NULL OR expires_at > ?)`,
				[fullKey, now],
				(
					err,
					row: { value: string; expires_at: number | null } | undefined,
				) => {
					if (err) {
						reject(err);
					} else if (!row) {
						resolve(null);
					} else {
						resolve({
							value: JSON.parse(row.value) as T,
							expiresAt: row.expires_at ? row.expires_at * 1000 : undefined,
						});
					}
				},
			);
		});
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? Math.floor((Date.now() + ttl) / 1000) : null;
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			this.db.run(
				`INSERT INTO go_goscope_idempotency (key, value, expires_at, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(key) DO UPDATE SET 
					value = excluded.value, 
					expires_at = excluded.expires_at,
					updated_at = excluded.updated_at`,
				[fullKey, JSON.stringify(value), expiresAt, now, now],
				(err) => (err ? reject(err) : resolve()),
			);
		});
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);

		return new Promise((resolve, reject) => {
			this.db.run(
				"DELETE FROM go_goscope_idempotency WHERE key = ?",
				[fullKey],
				(err) => (err ? reject(err) : resolve()),
			);
		});
	}
}
