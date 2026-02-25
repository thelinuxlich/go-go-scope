/**
 * MySQL idempotency adapter for go-go-scope
 */

import type { IdempotencyProvider } from "go-go-scope";
import type { Pool } from "mysql2/promise";

export interface MySQLIdempotencyAdapterOptions {
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * MySQL idempotency adapter implementing IdempotencyProvider
 */
export class MySQLIdempotencyAdapter implements IdempotencyProvider {
	private readonly pool: Pool;
	private readonly keyPrefix: string;

	constructor(pool: Pool, options: MySQLIdempotencyAdapterOptions = {}) {
		this.pool = pool;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	async connect(): Promise<void> {
		// Create table if not exists
		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS go_goscope_idempotency (
				key VARCHAR(255) PRIMARY KEY,
				value JSON NOT NULL,
				expires_at TIMESTAMP NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				INDEX idx_expires (expires_at)
			)
		`);
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);
		const [rows] = await this.pool.query(
			`SELECT value, expires_at 
			 FROM go_goscope_idempotency 
			 WHERE key = ? 
			 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())`,
			[fullKey],
		);

		const results = rows as Array<{ value: string; expires_at: Date | null }>;
		if (results.length === 0) {
			return null;
		}

		const row = results[0];
		if (!row) {
			return null;
		}
		return {
			value: JSON.parse(row.value) as T,
			expiresAt: row.expires_at ? row.expires_at.getTime() : undefined,
		};
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl
			? new Date(Date.now() + ttl).toISOString().slice(0, 19).replace("T", " ")
			: null;

		await this.pool.query(
			`INSERT INTO go_goscope_idempotency (key, value, expires_at)
			 VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE 
				value = VALUES(value), 
				expires_at = VALUES(expires_at)`,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.pool.query("DELETE FROM go_goscope_idempotency WHERE key = ?", [
			fullKey,
		]);
	}
}
