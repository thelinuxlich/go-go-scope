/**
 * PostgreSQL cache adapter for go-go-scope
 */

import type { CacheProvider, CacheStats } from "go-go-scope";
import type { Pool } from "pg";

export interface PostgresCacheAdapterOptions {
	/** Table name for cache entries */
	tableName?: string;
	/** Key prefix */
	keyPrefix?: string;
}

/**
 * PostgreSQL cache adapter implementing CacheProvider
 */
export class PostgresCacheAdapter implements CacheProvider {
	private readonly pool: Pool;
	private readonly tableName: string;
	private readonly keyPrefix: string;

	constructor(pool: Pool, options: PostgresCacheAdapterOptions = {}) {
		this.pool = pool;
		this.tableName = options.tableName ?? "cache";
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	/**
	 * Initialize the cache table
	 */
	async initialize(): Promise<void> {
		await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key VARCHAR(512) PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

		// Create index for expiration queries
		await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires 
      ON ${this.tableName}(expires_at) 
      WHERE expires_at IS NOT NULL
    `);
	}

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(key);

		const result = await this.pool.query(
			`
        SELECT value FROM ${this.tableName}
        WHERE key = $1 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `,
			[fullKey],
		);

		if (result.rows.length === 0) {
			return null;
		}

		// Update accessed_at
		await this.pool.query(
			`UPDATE ${this.tableName} SET accessed_at = CURRENT_TIMESTAMP WHERE key = $1`,
			[fullKey],
		);

		return result.rows[0].value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? new Date(Date.now() + ttl).toISOString() : null;

		await this.pool.query(
			`
        INSERT INTO ${this.tableName} (key, value, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          expires_at = EXCLUDED.expires_at,
          accessed_at = CURRENT_TIMESTAMP
      `,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.pool.query(`DELETE FROM ${this.tableName} WHERE key = $1`, [
			fullKey,
		]);
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(key);

		const result = await this.pool.query(
			`
        SELECT 1 FROM ${this.tableName}
        WHERE key = $1 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `,
			[fullKey],
		);

		return result.rows.length > 0;
	}

	async clear(): Promise<void> {
		if (this.keyPrefix) {
			await this.pool.query(`DELETE FROM ${this.tableName} WHERE key LIKE $1`, [
				`${this.keyPrefix}%`,
			]);
		} else {
			await this.pool.query(`DELETE FROM ${this.tableName}`);
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		let query: string;
		let params: string[] = [];

		if (this.keyPrefix) {
			const prefixPattern = pattern
				? `${this.keyPrefix}${pattern.replace(/\*/g, "%")}`
				: `${this.keyPrefix}%`;
			query = `SELECT key FROM ${this.tableName} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
			params = [prefixPattern];
		} else if (pattern) {
			query = `SELECT key FROM ${this.tableName} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
			params = [pattern.replace(/\*/g, "%")];
		} else {
			query = `SELECT key FROM ${this.tableName} WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`;
		}

		const result = await this.pool.query(query, params);
		const keys = result.rows.map((r) => r.key as string);

		// Remove prefix from returned keys
		if (this.keyPrefix) {
			return keys.map((k) =>
				k.startsWith(this.keyPrefix) ? k.slice(this.keyPrefix.length) : k,
			);
		}
		return keys;
	}

	/**
	 * Get cache statistics
	 */
	async stats(): Promise<CacheStats> {
		const result = await this.pool.query(
			`
        SELECT 
          COUNT(*) as size
        FROM ${this.tableName}
        WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP
      `,
		);

		return {
			hits: 0, // Would require separate tracking
			misses: 0,
			size: parseInt(result.rows[0].size, 10),
			hitRatio: 0,
		};
	}

	/**
	 * Clear expired entries
	 */
	async prune(): Promise<number> {
		const result = await this.pool.query(
			`DELETE FROM ${this.tableName} WHERE expires_at < CURRENT_TIMESTAMP`,
		);
		return result.rowCount ?? 0;
	}
}
