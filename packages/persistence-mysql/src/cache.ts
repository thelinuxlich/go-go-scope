/**
 * MySQL cache adapter for go-go-scope
 */

import type { CacheProvider, CacheStats } from "go-go-scope";
import type { Pool } from "mysql2/promise";

export interface MySQLCacheAdapterOptions {
	/** Table name for cache entries */
	tableName?: string;
	/** Key prefix */
	keyPrefix?: string;
}

/**
 * MySQL cache adapter implementing CacheProvider
 */
export class MySQLCacheAdapter implements CacheProvider {
	private readonly pool: Pool;
	private readonly tableName: string;
	private readonly keyPrefix: string;

	constructor(pool: Pool, options: MySQLCacheAdapterOptions = {}) {
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
        \`key\` VARCHAR(512) PRIMARY KEY,
        value JSON NOT NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
	}

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(key);

		const [rows] = await this.pool.query(
			`
        SELECT value FROM ${this.tableName}
        WHERE \`key\` = ? 
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
			[fullKey],
		);

		const results = rows as Array<{ value: unknown }>;
		if (results.length === 0) {
			return null;
		}

		const firstResult = results[0];
		if (!firstResult) {
			return null;
		}
		return firstResult.value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl
			? new Date(Date.now() + ttl).toISOString().slice(0, 19).replace("T", " ")
			: null;

		await this.pool.query(
			`
        INSERT INTO ${this.tableName} (\`key\`, value, expires_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          value = VALUES(value),
          expires_at = VALUES(expires_at)
      `,
			[fullKey, JSON.stringify(value), expiresAt],
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.pool.query(`DELETE FROM ${this.tableName} WHERE \`key\` = ?`, [
			fullKey,
		]);
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(key);

		const [rows] = await this.pool.query(
			`
        SELECT 1 FROM ${this.tableName}
        WHERE \`key\` = ? 
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
			[fullKey],
		);

		return (rows as unknown[]).length > 0;
	}

	async clear(): Promise<void> {
		if (this.keyPrefix) {
			await this.pool.query(
				`DELETE FROM ${this.tableName} WHERE \`key\` LIKE ?`,
				[`${this.keyPrefix}%`],
			);
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
			query = `SELECT \`key\` FROM ${this.tableName} WHERE \`key\` LIKE ? AND (expires_at IS NULL OR expires_at > NOW())`;
			params = [prefixPattern];
		} else if (pattern) {
			query = `SELECT \`key\` FROM ${this.tableName} WHERE \`key\` LIKE ? AND (expires_at IS NULL OR expires_at > NOW())`;
			params = [pattern.replace(/\*/g, "%")];
		} else {
			query = `SELECT \`key\` FROM ${this.tableName} WHERE expires_at IS NULL OR expires_at > NOW()`;
		}

		const [rows] = await this.pool.query(query, params);
		const keys = (rows as Array<{ key: string }>).map((r) => r.key);

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
		const [rows] = await this.pool.query(
			`
        SELECT 
          COUNT(*) as size
        FROM ${this.tableName}
        WHERE expires_at IS NULL OR expires_at > NOW()
      `,
		);

		const resultRows = rows as Array<{ size: number }>;
		const firstRow = resultRows[0];
		return {
			hits: 0,
			misses: 0,
			size: firstRow?.size ?? 0,
			hitRatio: 0,
		};
	}

	/**
	 * Clear expired entries
	 */
	async prune(): Promise<number> {
		const [result] = await this.pool.query(
			`DELETE FROM ${this.tableName} WHERE expires_at < NOW()`,
		);
		return (result as { affectedRows: number }).affectedRows ?? 0;
	}
}
