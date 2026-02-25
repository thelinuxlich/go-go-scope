/**
 * DynamoDB idempotency adapter for go-go-scope
 */

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { IdempotencyProvider } from "go-go-scope";

export interface DynamoDBIdempotencyAdapterOptions {
	/** DynamoDB table name */
	tableName: string;
	/** Key prefix for all idempotency entries */
	keyPrefix?: string;
}

/**
 * DynamoDB idempotency adapter implementing IdempotencyProvider
 */
export class DynamoDBIdempotencyAdapter implements IdempotencyProvider {
	private readonly client: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly keyPrefix: string;

	constructor(
		client: DynamoDBDocumentClient,
		options: DynamoDBIdempotencyAdapterOptions,
	) {
		this.client = client;
		this.tableName = options.tableName;
		this.keyPrefix = options.keyPrefix ?? "";
	}

	private prefix(key: string): string {
		return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
	}

	async get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null> {
		const fullKey = this.prefix(key);

		const result = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: {
					pk: `idempotency:${fullKey}`,
					sk: "METADATA",
				},
			}),
		);

		if (!result.Item) {
			return null;
		}

		// Check if expired
		if (
			result.Item.expiresAt &&
			result.Item.expiresAt < Math.floor(Date.now() / 1000)
		) {
			// Delete expired item
			await this.delete(key);
			return null;
		}

		return {
			value: result.Item.value as T,
			expiresAt: result.Item.expiresAt
				? result.Item.expiresAt * 1000
				: undefined,
		};
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const fullKey = this.prefix(key);
		const expiresAt = ttl ? Math.floor((Date.now() + ttl) / 1000) : undefined;

		await this.client.send(
			new PutCommand({
				TableName: this.tableName,
				Item: {
					pk: `idempotency:${fullKey}`,
					sk: "METADATA",
					value,
					expiresAt,
					updatedAt: Math.floor(Date.now() / 1000),
				},
			}),
		);
	}

	async delete(key: string): Promise<void> {
		const fullKey = this.prefix(key);

		await this.client.send(
			new DeleteCommand({
				TableName: this.tableName,
				Key: {
					pk: `idempotency:${fullKey}`,
					sk: "METADATA",
				},
			}),
		);
	}
}
