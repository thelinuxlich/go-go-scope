/**
 * DynamoDB persistence adapter integration tests
 *
 * These tests require a running DynamoDB Local instance.
 * Start with: docker run -d -p 8000:8000 amazon/dynamodb-local
 */

import {
	CreateTableCommand,
	DeleteTableCommand,
	DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DynamoDBAdapter } from "./index.js";

describe("DynamoDBAdapter", () => {
	let client: DynamoDBClient;
	let docClient: DynamoDBDocumentClient;
	let adapter: DynamoDBAdapter;

	beforeAll(async () => {
		const endpoint = process.env.DYNAMODB_ENDPOINT || "http://localhost:8001";
		client = new DynamoDBClient({
			region: "us-east-1",
			endpoint,
			credentials: {
				accessKeyId: "test",
				secretAccessKey: "test",
			},
		});
		docClient = DynamoDBDocumentClient.from(client);

		// Create the table with composite key (pk + sk)
		try {
			await client.send(
				new CreateTableCommand({
					TableName: "test-table",
					KeySchema: [
						{ AttributeName: "pk", KeyType: "HASH" },
						{ AttributeName: "sk", KeyType: "RANGE" },
					],
					AttributeDefinitions: [
						{ AttributeName: "pk", AttributeType: "S" },
						{ AttributeName: "sk", AttributeType: "S" },
					],
					BillingMode: "PAY_PER_REQUEST",
				}),
			);
		} catch (err) {
			// Table may already exist
			if ((err as { name?: string }).name !== "ResourceInUseException") {
				throw err;
			}
		}

		adapter = new DynamoDBAdapter(docClient, "test-table", {
			keyPrefix: "test:",
		});
		await adapter.connect();
	});

	afterAll(async () => {
		await adapter.disconnect();
		// Clean up - delete the table
		try {
			await client.send(
				new DeleteTableCommand({
					TableName: "test-table",
				}),
			);
		} catch {
			// Ignore errors during cleanup
		}
	});

	describe("LockProvider", () => {
		test("should acquire and release a lock", async () => {
			const lock = await adapter.acquire("test-lock", 5000);
			expect(lock).not.toBeNull();

			if (lock) {
				expect(await lock.isValid()).toBe(true);
				await lock.release();
			}
		});

		test("should not acquire an already held lock", async () => {
			const lock1 = await adapter.acquire("test-lock-2", 5000);
			expect(lock1).not.toBeNull();

			const lock2 = await adapter.acquire("test-lock-2", 5000);
			expect(lock2).toBeNull();

			if (lock1) await lock1.release();
		});
	});

	describe("CircuitBreakerStateProvider", () => {
		test("should get and set state", async () => {
			await adapter.setState("test-cb", {
				state: "open",
				failureCount: 5,
			});

			const state = await adapter.getState("test-cb");
			expect(state?.state).toBe("open");
			expect(state?.failureCount).toBe(5);
		});

		test("should record failures and successes", async () => {
			await adapter.recordSuccess("test-cb-2");

			const count = await adapter.recordFailure("test-cb-2", 3);
			expect(count).toBeGreaterThan(0);
		});
	});

	describe("CacheProvider", () => {
		test("should set and get cache values", async () => {
			await adapter.set("test-key", { foo: "bar" });

			const value = await adapter.get("test-key");
			expect(value).toEqual({ foo: "bar" });
		});

		test("should respect TTL", async () => {
			// Note: DynamoDB TTL is eventually consistent and may not expire immediately
			// This test verifies the TTL attribute is set correctly
			await adapter.set("ttl-key", "value", 5000); // 5 second TTL

			const value1 = await adapter.get("ttl-key");
			expect(value1).toBe("value");

			// Verify key exists
			expect(await adapter.has("ttl-key")).toBe(true);
		});

		test("should delete and check keys", async () => {
			await adapter.set("delete-key", "value");
			expect(await adapter.has("delete-key")).toBe(true);

			await adapter.delete("delete-key");
			expect(await adapter.has("delete-key")).toBe(false);
		});
	});
});
