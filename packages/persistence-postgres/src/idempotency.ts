/**
 * PostgreSQL idempotency adapter for go-go-scope
 */

import type { IdempotencyProvider } from "go-go-scope";
import type { Pool } from "pg";

export interface PostgresIdempotencyAdapterOptions {
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * PostgreSQL idempotency adapter implementing IdempotencyProvider
 */
export class PostgresIdempotencyAdapter implements IdempotencyProvider {
	private readonly pool: Pool;
	private readonly keyPrefix: string;

	constructor(pool: Pool, options: PostgresIdempotencyAdapterOptions = {}) {
		this.pool = pool;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	async connect(): Promise<void> {
		const client = await this.pool.connect();
		try {
			// Create table if not exists
			await client.query(`
				CREATE TABLE IF NOT EXISTS go_goscope_idempotency (
					key VARCHAR(255) PRIMARY KEY,
					value JSONB NOT NULL,
					expires_at TIMESTAMP WITH TIME ZONE,
					created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create index on expires_at for cleanup
			await client.query(`
				CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
				ON go_goscope_idempotency(expires_at) 
				WHERE expires_at IS NOT NULL
			`);
		} finally {
			client.release();
		}
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);
		const result = await this.pool.query(
			`SELECT value, expires_at 
			 FROM go_goscope_idempotency 
			 WHERE key = $1 
			 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
			[fullKey],
		);

		if (result.rows.length === 0) {
			return null;
		}

		const row = result.rows[0];
		return {
			value: row.value as T,
			expiresAt: row.expires_at
				? new Date(row.expires_at).getTime()
				: undefined,
		};
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? new Date(Date.now() + ttl).toISOString() : null;

		await this.pool.query(
			`INSERT INTO go_goscope_idempotency (key, value, expires_at, updated_at)
			 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
			 ON CONFLICT (key) 
			 DO UPDATE SET value = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP`,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.pool.query("DELETE FROM go_goscope_idempotency WHERE key = $1", [
			fullKey,
		]);
	}
}
