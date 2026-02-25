/**
 * MongoDB idempotency adapter for go-go-scope
 */

import type { IdempotencyProvider } from "go-go-scope";
import type { Db } from "mongodb";

export interface MongoDBIdempotencyAdapterOptions {
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * MongoDB idempotency adapter implementing IdempotencyProvider
 */
export class MongoDBIdempotencyAdapter implements IdempotencyProvider {
	private readonly db: Db;
	private readonly keyPrefix: string;

	constructor(db: Db, options: MongoDBIdempotencyAdapterOptions = {}) {
		this.db = db;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private get collection() {
		return this.db.collection("go_goscope_idempotency");
	}

	async connect(): Promise<void> {
		// Create indexes
		await this.collection.createIndex({ key: 1 }, { unique: true });
		await this.collection.createIndex(
			{ expiresAt: 1 },
			{ expireAfterSeconds: 0 },
		);
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);
		const doc = await this.collection.findOne({ key: fullKey });

		if (!doc) {
			return null;
		}

		// Check if expired (for non-TTL collections or manual check)
		if (doc.expiresAt && doc.expiresAt < new Date()) {
			await this.collection.deleteOne({ key: fullKey });
			return null;
		}

		return {
			value: doc.value as T,
			expiresAt: doc.expiresAt?.getTime(),
		};
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? new Date(Date.now() + ttl) : undefined;

		await this.collection.updateOne(
			{ key: fullKey },
			{
				$set: {
					key: fullKey,
					value,
					expiresAt,
					updatedAt: new Date(),
				},
			},
			{ upsert: true },
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);
		await this.collection.deleteOne({ key: fullKey });
	}
}
