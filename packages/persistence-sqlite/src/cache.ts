/**
 * SQLite cache adapter for go-go-scope
 */

import type { CacheProvider, CacheStats } from "go-go-scope";
import type { Database } from "sqlite3";

export interface SQLiteCacheAdapterOptions {
	/** Table name for cache entries */
	tableName?: string;
	/** Key prefix */
	keyPrefix?: string;
}

/**
 * SQLite cache adapter implementing CacheProvider
 */
export class SQLiteCacheAdapter implements CacheProvider {
	private readonly db: Database;
	private readonly tableName: string;
	private readonly keyPrefix: string;

	constructor(db: Database, options: SQLiteCacheAdapterOptions = {}) {
		this.db = db;
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
		return new Promise((resolve, reject) => {
			this.db.run(
				`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch()),
          accessed_at INTEGER DEFAULT (unixepoch())
        )
      `,
				(err) => {
					if (err) reject(err);
					else {
						// Create index for expiration
						this.db.run(
							`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires ON ${this.tableName}(expires_at)`,
							(err) => {
								if (err) reject(err);
								else resolve();
							},
						);
					}
				},
			);
		});
	}

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(key);
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			this.db.get(
				`
          SELECT value FROM ${this.tableName}
          WHERE key = ? 
          AND (expires_at IS NULL OR expires_at > ?)
        `,
				[fullKey, now],
				(err, row: { value: string } | undefined) => {
					if (err) {
						reject(err);
					} else if (!row) {
						resolve(null);
					} else {
						try {
							resolve(JSON.parse(row.value) as T);
						} catch {
							resolve(null);
						}
					}
				},
			);
		});
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? Math.floor((Date.now() + ttl) / 1000) : null;

		return new Promise((resolve, reject) => {
			this.db.run(
				`
          INSERT INTO ${this.tableName} (key, value, expires_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            expires_at = excluded.expires_at,
            accessed_at = unixepoch()
        `,
				[fullKey, JSON.stringify(value), expiresAt],
				(err) => {
					if (err) reject(err);
					else resolve();
				},
			);
		});
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);

		return new Promise((resolve, reject) => {
			this.db.run(
				`DELETE FROM ${this.tableName} WHERE key = ?`,
				[fullKey],
				(err) => {
					if (err) reject(err);
					else resolve();
				},
			);
		});
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(key);
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			this.db.get(
				`
          SELECT 1 FROM ${this.tableName}
          WHERE key = ? 
          AND (expires_at IS NULL OR expires_at > ?)
        `,
				[fullKey, now],
				(err, row) => {
					if (err) reject(err);
					else resolve(!!row);
				},
			);
		});
	}

	async clear(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.keyPrefix) {
				this.db.run(
					`DELETE FROM ${this.tableName} WHERE key LIKE ?`,
					[`${this.keyPrefix}%`],
					(err) => {
						if (err) reject(err);
						else resolve();
					},
				);
			} else {
				this.db.run(`DELETE FROM ${this.tableName}`, (err) => {
					if (err) reject(err);
					else resolve();
				});
			}
		});
	}

	async keys(pattern?: string): Promise<string[]> {
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			let sql: string;
			let params: (string | number)[] = [now];

			if (this.keyPrefix) {
				const prefixPattern = pattern
					? `${this.keyPrefix}${pattern.replace(/\*/g, "%")}`
					: `${this.keyPrefix}%`;
				sql = `SELECT key FROM ${this.tableName} WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)`;
				params = [prefixPattern, now];
			} else if (pattern) {
				sql = `SELECT key FROM ${this.tableName} WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)`;
				params = [pattern.replace(/\*/g, "%"), now];
			} else {
				sql = `SELECT key FROM ${this.tableName} WHERE expires_at IS NULL OR expires_at > ?`;
			}

			this.db.all(sql, params, (err, rows: Array<{ key: string }>) => {
				if (err) {
					reject(err);
				} else {
					const keys = rows.map((r) => r.key);
					// Remove prefix from returned keys
					if (this.keyPrefix) {
						resolve(
							keys.map((k) =>
								k.startsWith(this.keyPrefix)
									? k.slice(this.keyPrefix.length)
									: k,
							),
						);
					} else {
						resolve(keys);
					}
				}
			});
		});
	}

	/**
	 * Get cache statistics
	 */
	async stats(): Promise<CacheStats> {
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			this.db.get(
				`
          SELECT COUNT(*) as size
          FROM ${this.tableName}
          WHERE expires_at IS NULL OR expires_at > ?
        `,
				[now],
				(err, row: { size: number }) => {
					if (err) reject(err);
					else {
						resolve({
							hits: 0,
							misses: 0,
							size: row?.size ?? 0,
							hitRatio: 0,
						});
					}
				},
			);
		});
	}

	/**
	 * Clear expired entries
	 */
	async prune(): Promise<number> {
		const now = Math.floor(Date.now() / 1000);

		return new Promise((resolve, reject) => {
			this.db.run(
				`DELETE FROM ${this.tableName} WHERE expires_at < ?`,
				[now],
				function (err) {
					if (err) reject(err);
					else resolve(this.changes ?? 0);
				},
			);
		});
	}
}
