/**
 * DynamoDB persistence adapter for go-go-scope
 *
 * Provides distributed locks, circuit breaker state, and caching
 * using DynamoDB as the backend with a single-table design.
 *
 * Uses DynamoDB's native TTL feature for automatic expiration.
 *
 * @example
 * ```typescript
 * import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
 * import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
 * import { DynamoDBAdapter } from '@go-go-scope/persistence-dynamodb'
 * import { scope } from 'go-go-scope'
 *
 * const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
 * const persistence = new DynamoDBAdapter(client, 'my-table', { keyPrefix: 'myapp:' })
 *
 * await using s = scope({ persistence })
 *
 * // Acquire a lock with 30 second TTL
 * const lock = await s.acquireLock('resource:123', 30000)
 * if (!lock) {
 *   throw new Error('Could not acquire lock')
 * }
 *
 * // Lock automatically expires via DynamoDB TTL
 * // Optional: release early with await lock.release()
 * ```
 */

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
	DeleteCommand,
	GetCommand,
	PutCommand,
	QueryCommand,
	ScanCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
	CacheProvider,
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";

/**
 * DynamoDB persistence adapter
 *
 * Uses a single-table design with the following structure:
 * - pk: Partition key (LOCK#<key>, CB#<key>, CACHE#<key>)
 * - sk: Sort key (always METADATA)
 * - data: JSON serialized data
 * - expiresAt: Unix timestamp for DynamoDB TTL
 * - owner: Lock owner identifier
 * - version: Optimistic locking version
 */
export class DynamoDBAdapter
	implements
		LockProvider,
		CircuitBreakerStateProvider,
		CacheProvider,
		CheckpointProvider,
		PersistenceAdapter
{
	private readonly client: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly keyPrefix: string;

	constructor(
		client: DynamoDBDocumentClient,
		tableName: string,
		options: PersistenceAdapterOptions = {},
	) {
		this.client = client;
		this.tableName = tableName;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	private generateOwner(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private toSeconds(ms: number): number {
		return Math.floor(ms / 1000);
	}

	private getLockKey(key: string): string {
		return `LOCK#${key}`;
	}

	private getCircuitKey(key: string): string {
		return `CB#${key}`;
	}

	private getCacheKey(key: string): string {
		return `CACHE#${key}`;
	}

	private getCheckpointKey(key: string): string {
		return `CHECKPOINT#${key}`;
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
		const pk = this.getLockKey(fullKey);
		const expiresAt = Math.floor(Date.now() / 1000) + this.toSeconds(ttl);

		try {
			// Try to acquire lock using conditional write
			// Only succeed if the item doesn't exist or has expired
			await this.client.send(
				new PutCommand({
					TableName: this.tableName,
					Item: {
						pk,
						sk: "METADATA",
						owner: lockOwner,
						expiresAt,
						data: { acquiredAt: Date.now() },
						version: 1,
					},
					ConditionExpression: "attribute_not_exists(pk) OR expiresAt < :now",
					ExpressionAttributeValues: {
						":now": Math.floor(Date.now() / 1000),
					},
				}),
			);

			const handle: LockHandle = {
				release: async () => {
					await this.client.send(
						new DeleteCommand({
							TableName: this.tableName,
							Key: { pk, sk: "METADATA" },
							ConditionExpression: "#owner = :owner",
							ExpressionAttributeNames: {
								"#owner": "owner",
							},
							ExpressionAttributeValues: {
								":owner": lockOwner,
							},
						}),
					);
				},
				extend: async (newTtl: number) => {
					return this.extend(key, newTtl, lockOwner);
				},
				isValid: async () => {
					const result = await this.client.send(
						new GetCommand({
							TableName: this.tableName,
							Key: { pk, sk: "METADATA" },
						}),
					);
					if (!result.Item) return false;
					return (
						result.Item.owner === lockOwner &&
						result.Item.expiresAt > Math.floor(Date.now() / 1000)
					);
				},
			};

			return handle;
		} catch (error) {
			// Check if error is ConditionalCheckFailedException
			if (
				error instanceof Error &&
				error.name === "ConditionalCheckFailedException"
			) {
				return null;
			}
			throw error;
		}
	}

	async extend(key: string, ttl: number, owner: string): Promise<boolean> {
		const fullKey = this.prefix(`lock:${key}`);
		const pk = this.getLockKey(fullKey);
		const newExpiresAt = Math.floor(Date.now() / 1000) + this.toSeconds(ttl);

		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { pk, sk: "METADATA" },
					UpdateExpression: "SET expiresAt = :expiresAt",
					ConditionExpression: "#owner = :owner AND expiresAt > :now",
					ExpressionAttributeNames: {
						"#owner": "owner",
					},
					ExpressionAttributeValues: {
						":owner": owner,
						":expiresAt": newExpiresAt,
						":now": Math.floor(Date.now() / 1000),
					},
				}),
			);
			return true;
		} catch (error) {
			if (
				error instanceof Error &&
				error.name === "ConditionalCheckFailedException"
			) {
				return false;
			}
			throw error;
		}
	}

	async forceRelease(key: string): Promise<void> {
		const fullKey = this.prefix(`lock:${key}`);
		const pk = this.getLockKey(fullKey);

		await this.client.send(
			new DeleteCommand({
				TableName: this.tableName,
				Key: { pk, sk: "METADATA" },
			}),
		);
	}

	// ============================================================================
	// Circuit Breaker State Provider
	// ============================================================================

	async getState(key: string): Promise<CircuitBreakerPersistedState | null> {
		const fullKey = this.prefix(`circuit:${key}`);
		const pk = this.getCircuitKey(fullKey);

		const result = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { pk, sk: "METADATA" },
			}),
		);

		if (!result.Item) {
			return null;
		}

		try {
			return result.Item.data as CircuitBreakerPersistedState;
		} catch {
			return null;
		}
	}

	async setState(
		key: string,
		state: CircuitBreakerPersistedState,
	): Promise<void> {
		const fullKey = this.prefix(`circuit:${key}`);
		const pk = this.getCircuitKey(fullKey);
		// TTL for circuit breaker state: 1 hour
		const expiresAt = Math.floor(Date.now() / 1000) + 3600;

		await this.client.send(
			new PutCommand({
				TableName: this.tableName,
				Item: {
					pk,
					sk: "METADATA",
					data: state,
					expiresAt,
					version: 1,
				},
			}),
		);
	}

	async recordFailure(key: string, maxFailures: number): Promise<number> {
		const currentState = await this.getState(key);

		const newState: CircuitBreakerPersistedState = {
			state: currentState?.state ?? "closed",
			failureCount: (currentState?.failureCount ?? 0) + 1,
			lastFailureTime: Date.now(),
		};

		// Open circuit if max failures reached
		if (newState.failureCount >= maxFailures) {
			newState.state = "open";
		}

		await this.setState(key, newState);
		return newState.failureCount;
	}

	async recordSuccess(key: string): Promise<void> {
		const newState: CircuitBreakerPersistedState = {
			state: "closed",
			failureCount: 0,
			lastSuccessTime: Date.now(),
		};

		await this.setState(key, newState);
	}

	// ============================================================================
	// Cache Provider
	// ============================================================================

	async get<T>(key: string): Promise<T | null> {
		const fullKey = this.prefix(`cache:${key}`);
		const pk = this.getCacheKey(fullKey);

		const result = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { pk, sk: "METADATA" },
			}),
		);

		if (!result.Item) {
			return null;
		}

		// Check if expired (DynamoDB TTL is eventually consistent)
		if (
			result.Item.expiresAt &&
			result.Item.expiresAt <= Math.floor(Date.now() / 1000)
		) {
			return null;
		}

		return result.Item.data as T;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const pk = this.getCacheKey(fullKey);

		const item: Record<string, unknown> = {
			pk,
			sk: "METADATA",
			data: value,
			version: 1,
		};

		if (ttl !== undefined) {
			item.expiresAt = Math.floor(Date.now() / 1000) + this.toSeconds(ttl);
		}

		await this.client.send(
			new PutCommand({
				TableName: this.tableName,
				Item: item,
			}),
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(`cache:${key}`);
		const pk = this.getCacheKey(fullKey);

		await this.client.send(
			new DeleteCommand({
				TableName: this.tableName,
				Key: { pk, sk: "METADATA" },
			}),
		);
	}

	async has(key: string): Promise<boolean> {
		const value = await this.get(key);
		return value !== null;
	}

	async clear(): Promise<void> {
		// Scan for all cache items and delete them
		const prefix = this.prefix("cache:");
		const pkPrefix = this.getCacheKey(prefix);

		const result = await this.client.send(
			new ScanCommand({
				TableName: this.tableName,
				FilterExpression: "begins_with(pk, :prefix) AND sk = :sk",
				ExpressionAttributeValues: {
					":prefix": pkPrefix,
					":sk": "METADATA",
				},
			}),
		);

		if (!result.Items || result.Items.length === 0) {
			return;
		}

		// Delete items in batches
		const deletePromises = result.Items.map((item) =>
			this.client.send(
				new DeleteCommand({
					TableName: this.tableName,
					Key: { pk: item.pk, sk: item.sk },
				}),
			),
		);

		await Promise.all(deletePromises);
	}

	async keys(pattern?: string): Promise<string[]> {
		const prefix = this.prefix("cache:");
		const pkPrefix = this.getCacheKey(prefix);

		const result = await this.client.send(
			new QueryCommand({
				TableName: this.tableName,
				KeyConditionExpression: "sk = :sk AND begins_with(pk, :prefix)",
				ExpressionAttributeValues: {
					":sk": "METADATA",
					":prefix": pkPrefix,
				},
				IndexName: "sk-pk-index", // GSI for querying by sk
			}),
		);

		if (!result.Items || result.Items.length === 0) {
			return [];
		}

		// Extract keys from pk (remove prefix and CACHE#)
		const keys = result.Items.map((item) => {
			const pk = item.pk as string;
			// Remove CACHE# prefix and key prefix
			let key = pk.replace(/^CACHE#/, "");
			if (this.keyPrefix) {
				key = key.replace(new RegExp(`^${this.keyPrefix}`), "");
			}
			// Remove cache: prefix
			return key.replace(/^cache:/, "");
		});

		// Filter by pattern if provided
		if (pattern) {
			const regex = new RegExp(pattern.replace(/\*/g, ".*"));
			return keys.filter((k) => regex.test(k));
		}

		return keys;
	}

	// ============================================================================
	// Persistence Adapter
	// ============================================================================

	async connect(): Promise<void> {
		// DynamoDB is serverless, no connection needed
		// This method is kept for API compatibility
	}

	async disconnect(): Promise<void> {
		// DynamoDB is serverless, no disconnection needed
		// This method is kept for API compatibility
	}

	isConnected(): boolean {
		// Always return true as DynamoDB is serverless
		return true;
	}

	// ============================================================================
	// Checkpoint Provider
	// ============================================================================

	async save<T>(checkpoint: Checkpoint<T>): Promise<void> {
		const pk = this.getCheckpointKey(
			`${checkpoint.taskId}:${checkpoint.sequence}`,
		);

		await this.client.send(
			new PutCommand({
				TableName: this.tableName,
				Item: {
					pk,
					sk: "METADATA",
					id: checkpoint.id,
					taskId: checkpoint.taskId,
					sequence: checkpoint.sequence,
					timestamp: checkpoint.timestamp,
					progress: checkpoint.progress,
					data: checkpoint.data,
					estimatedTimeRemaining: checkpoint.estimatedTimeRemaining,
					updatedAt: Date.now(),
				},
			}),
		);
	}

	async load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined> {
		// Query by GSI to find checkpoint by id
		const result = await this.client.send(
			new ScanCommand({
				TableName: this.tableName,
				FilterExpression: "id = :id AND sk = :sk",
				ExpressionAttributeValues: {
					":id": checkpointId,
					":sk": "METADATA",
				},
			}),
		);

		if (!result.Items || result.Items.length === 0) {
			return undefined;
		}

		const item = result.Items[0];
		if (!item) {
			return undefined;
		}
		return {
			id: item.id as string,
			taskId: item.taskId as string,
			sequence: item.sequence as number,
			timestamp: item.timestamp as number,
			progress: item.progress as number,
			data: item.data as T,
			estimatedTimeRemaining: item.estimatedTimeRemaining as number | undefined,
		};
	}

	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const prefix = this.getCheckpointKey(taskId);

		const result = await this.client.send(
			new QueryCommand({
				TableName: this.tableName,
				KeyConditionExpression: "sk = :sk AND begins_with(pk, :prefix)",
				ExpressionAttributeValues: {
					":sk": "METADATA",
					":prefix": `${prefix}:`,
				},
				IndexName: "sk-pk-index",
				ScanIndexForward: false, // Descending order
				Limit: 1,
			}),
		);

		if (!result.Items || result.Items.length === 0) {
			return undefined;
		}

		const item = result.Items[0];
		if (!item) {
			return undefined;
		}
		return {
			id: item.id as string,
			taskId: item.taskId as string,
			sequence: item.sequence as number,
			timestamp: item.timestamp as number,
			progress: item.progress as number,
			data: item.data as T,
			estimatedTimeRemaining: item.estimatedTimeRemaining as number | undefined,
		};
	}

	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		const prefix = this.getCheckpointKey(taskId);

		const result = await this.client.send(
			new QueryCommand({
				TableName: this.tableName,
				KeyConditionExpression: "sk = :sk AND begins_with(pk, :prefix)",
				ExpressionAttributeValues: {
					":sk": "METADATA",
					":prefix": `${prefix}:`,
				},
				IndexName: "sk-pk-index",
				ScanIndexForward: true, // Ascending order
			}),
		);

		if (!result.Items) {
			return [];
		}

		return result.Items.map((item) => ({
			id: item.id as string,
			taskId: item.taskId as string,
			sequence: item.sequence as number,
			timestamp: item.timestamp as number,
			progress: item.progress as number,
			data: item.data,
			estimatedTimeRemaining: item.estimatedTimeRemaining as number | undefined,
		}));
	}

	async cleanup(taskId: string, keepCount: number): Promise<void> {
		const checkpoints = await this.list(taskId);
		if (checkpoints.length <= keepCount) return;

		// Sort by sequence and keep the most recent ones
		const sorted = [...checkpoints].sort((a, b) => a.sequence - b.sequence);
		const toDelete = sorted.slice(0, sorted.length - keepCount);

		// Delete old checkpoints
		const deletePromises = toDelete.map((cp) =>
			this.client.send(
				new DeleteCommand({
					TableName: this.tableName,
					Key: {
						pk: this.getCheckpointKey(`${cp.taskId}:${cp.sequence}`),
						sk: "METADATA",
					},
				}),
			),
		);

		await Promise.all(deletePromises);
	}

	async deleteAll(taskId: string): Promise<void> {
		const checkpoints = await this.list(taskId);

		const deletePromises = checkpoints.map((cp) =>
			this.client.send(
				new DeleteCommand({
					TableName: this.tableName,
					Key: {
						pk: this.getCheckpointKey(`${cp.taskId}:${cp.sequence}`),
						sk: "METADATA",
					},
				}),
			),
		);

		await Promise.all(deletePromises);
	}
}

// Re-export types
export type {
	CacheProvider,
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
} from "go-go-scope";
export { DynamoDBIdempotencyAdapter } from "./idempotency.js";
