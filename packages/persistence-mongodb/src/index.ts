/**
 * MongoDB persistence adapter for go-go-scope
 *
 * Provides distributed locks, circuit breaker state, and caching
 * using MongoDB as the backend.
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb'
 * import { MongoDBAdapter } from '@go-go-scope/persistence-mongodb'
 *
 * const client = new MongoClient(process.env.MONGODB_URL)
 * const db = client.db('myapp')
 * const persistence = new MongoDBAdapter(db, { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 *
 * // Acquire a lock with 30 second TTL
 * const lock = await s.acquireLock('resource:123', 30000)
 * if (!lock) {
 *   throw new Error('Could not acquire lock')
 * }
 * ```
 */

import type {
	CacheProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";
import type { Db } from "mongodb";

/**
 * MongoDB persistence adapter
 */
export class MongoDBAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CacheProvider,
		PersistenceAdapter
{
	private readonly db: Db;
	private readonly keyPrefix: string;
	private connected = false;

	constructor(db: Db, options: PersistenceAdapterOptions = {}) {
		this.db = db;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private get locksCollection() {
		return this.db.collection("go_goscope_locks");
	}

	private get circuitCollection() {
		return this.db.collection("go_goscope_circuit");
	}

	private get cacheCollection() {
		return this.db.collection("go_goscope_cache");
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// Create indexes
		await this.locksCollection.createIndex({ key: 1 }, { unique: true });
		await this.locksCollection.createIndex(
			{ expiresAt: 1 },
			{ expireAfterSeconds: 0 },
		);

		await this.circuitCollection.createIndex({ key: 1 }, { unique: true });

		await this.cacheCollection.createIndex({ key: 1 }, { unique: true });
		await this.cacheCollection.createIndex(
			{ expiresAt: 1 },
			{ expireAfterSeconds: 0 },
		);

		this.connected = true;
	}

	async disconnect(): Promise<void> {
		this.connected = false;
	}

	isConnected(): boolean {
		return this.connected;
	}

	// ============================================================================
	// Lock Provider
	// ============================================================================

	async acquire(
		key: string,
		ttl: number,
		owner?: string,
	): Promise<LockHandle | null> {
		const fullKey = this.prefix(`lock:${key}`);
		const lockOwner = owner ?? this.generateOwner();
		const expiresAt = new Date(Date.now() + ttl);

		try {
			await this.locksCollection.insertOne({
				key: fullKey,
				owner: lockOwner,
				expiresAt,
				createdAt: new Date(),
			});

			const handle: LockHandle = {
				release: async () => {
					await this.locksCollection.deleteOne({
						key: fullKey,
						owner: lockOwner,
					});
				},
				extend: async (newTtl: number) => {
					const result = await this.locksCollection.updateOne(
						{ key: fullKey, owner: lockOwner },
						{ $set: { expiresAt: new Date(Date.now() + newTtl) } },
					);
					return result.modifiedCount === 1;
				},
				isValid: async () => {
					const lock = await this.locksCollection.findOne({
						key: fullKey,
						owner: lockOwner,
					});
					return !!lock && lock.expiresAt > new Date();
				},
			};

			return handle;
		} catch (err) {
			// Duplicate key error - lock already held
			if ((err as { code?: number }).code === 11000) {
				return null;
			}
			throw err;
		}
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const result = await this.locksCollection.updateOne(
			{ key: fullKey, owner },
			{ $set: { expiresAt: new Date(Date.now() + ttl) } },
		);
		return result.modifiedCount === 1;
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		await this.locksCollection.deleteOne({ key: fullKey });
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);

		const doc = await this.circuitCollection.findOne({ key: fullKey });
		if (!doc) {
			return null;
		}

		return {
			state: doc.state,
			failureCount: doc.failureCount,
			lastFailureTime: doc.lastFailureTime?.getTime(),
			lastSuccessTime: doc.lastSuccessTime?.getTime(),
		};
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`circuit:${key}`);

		await this.circuitCollection.updateOne(
			{ key: fullKey },
			{
				$set: {
					state: state.state,
					failureCount: state.failureCount,
					lastFailureTime: state.lastFailureTime
						? new Date(state.lastFailureTime)
						: undefined,
					lastSuccessTime: state.lastSuccessTime
						? new Date(state.lastSuccessTime)
						: undefined,
					updatedAt: new Date(),
				},
			},
			{ upsert: true },
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

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);

		const doc = await this.cacheCollection.findOne({ key: fullKey });
		if (!doc) {
			return null;
		}

		// Check expiration (MongoDB TTL is eventually consistent)
		if (doc.expiresAt && doc.expiresAt < new Date()) {
			return null;
		}

		return doc.value as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);

		await this.cacheCollection.updateOne(
			{ key: fullKey },
			{
				$set: {
					key: fullKey,
					value,
					expiresAt: ttl ? new Date(Date.now() + ttl) : undefined,
					updatedAt: new Date(),
				},
			},
			{ upsert: true },
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		await this.cacheCollection.deleteOne({ key: fullKey });
	}

	async has(key: string): Promise<boolean> {
		const fullKey = this.prefix(`cache:${key}`);

		const doc = await this.cacheCollection.findOne(
			{ key: fullKey },
			{ projection: { _id: 1 } },
		);

		if (!doc) {
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		if (this.keyPrefix) {
			await this.cacheCollection.deleteMany({
				key: { $regex: `^${this.prefix("cache:")}` },
			});
		} else {
			await this.cacheCollection.deleteMany({});
		}
	}

	async keys(pattern?: string): Promise<string[]> {
		const query: { key: { $regex: string } } = {
			key: { $regex: this.prefix("cache:") },
		};

		if (pattern) {
			// Escape regex special chars and convert * to .*
			const escapedPattern = pattern
				.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\\\*/g, ".*");
			query.key.$regex = `${this.prefix("cache:")}${escapedPattern}`;
		}

		const docs = await this.cacheCollection
			.find(query, { projection: { key: 1 } })
			.toArray();

		// Remove prefix from returned keys
		const prefixLength = this.prefix("cache:").length;
		return docs.map((doc) => doc.key.slice(prefixLength));
	}
}
export { MongoDBIdempotencyAdapter } from "./idempotency.js";
