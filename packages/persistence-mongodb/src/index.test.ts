/**
 * MongoDB persistence adapter integration tests
 *
 * These tests require a running MongoDB instance.
 * Start with: docker run -d -p 27017:27017 mongo:7
 */

import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MongoDBAdapter } from "./index.js";

describe("MongoDBAdapter", () => {
	let client: MongoClient;
	let adapter: MongoDBAdapter;

	beforeAll(async () => {
		const uri =
			process.env.MONGODB_URL ||
			"mongodb://test:test@localhost:27018/test?authSource=admin";
		client = new MongoClient(uri);
		await client.connect();
		const db = client.db("test");
		adapter = new MongoDBAdapter(db, { keyPrefix: "test:" });
		await adapter.connect();
	});

	afterAll(async () => {
		await client.close();
	});

	describe("LockProvider", () => {
		test("should acquire and release a lock", async () => {
			const lock = await adapter.acquire("test-lock", 5000);
			expect(lock).not.toBeNull();

			if (lock) {
				expect(await lock.isValid()).toBe(true);
				await lock.release();
				expect(await lock.isValid()).toBe(false);
			}
		});

		test("should not acquire an already held lock", async () => {
			const lock1 = await adapter.acquire("test-lock-2", 5000);
			expect(lock1).not.toBeNull();

			const lock2 = await adapter.acquire("test-lock-2", 5000);
			expect(lock2).toBeNull();

			if (lock1) await lock1.release();
		});

		test("should extend a lock", async () => {
			const lock = await adapter.acquire("test-lock-3", 1000);
			expect(lock).not.toBeNull();

			if (lock) {
				const extended = await lock.extend(5000);
				expect(extended).toBe(true);
				await lock.release();
			}
		});
	});

	describe("CircuitBreakerStateProvider", () => {
		test("should get and set state", async () => {
			await adapter.setState("test-cb", {
				state: "open",
				failureCount: 5,
			});

			const state = await adapter.getState("test-cb");
			expect(state).toEqual({
				state: "open",
				failureCount: 5,
			});
		});

		test("should record failures", async () => {
			await adapter.recordSuccess("test-cb-2");

			const count1 = await adapter.recordFailure("test-cb-2", 3);
			expect(count1).toBe(1);

			const count2 = await adapter.recordFailure("test-cb-2", 3);
			expect(count2).toBe(2);
		});

		test("should open circuit after max failures", async () => {
			await adapter.recordSuccess("test-cb-3");

			await adapter.recordFailure("test-cb-3", 2);
			await adapter.recordFailure("test-cb-3", 2);

			const state = await adapter.getState("test-cb-3");
			expect(state?.state).toBe("open");
		});
	});

	describe("CacheProvider", () => {
		test("should set and get cache values", async () => {
			await adapter.set("test-key", { foo: "bar" });

			const value = await adapter.get("test-key");
			expect(value).toEqual({ foo: "bar" });
		});

		test("should return null for non-existent keys", async () => {
			const value = await adapter.get("non-existent-key");
			expect(value).toBeNull();
		});

		test("should respect TTL", async () => {
			await adapter.set("ttl-key", "value", 100); // 100ms TTL

			const value1 = await adapter.get("ttl-key");
			expect(value1).toBe("value");

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 200));

			const value2 = await adapter.get("ttl-key");
			expect(value2).toBeNull();
		});

		test("should delete cache entries", async () => {
			await adapter.set("delete-key", "value");
			expect(await adapter.has("delete-key")).toBe(true);

			await adapter.delete("delete-key");
			expect(await adapter.has("delete-key")).toBe(false);
		});

		test("should list keys", async () => {
			await adapter.set("key-1", "value1");
			await adapter.set("key-2", "value2");

			const keys = await adapter.keys();
			expect(keys).toContain("key-1");
			expect(keys).toContain("key-2");
		});

		test("should clear all cache entries", async () => {
			await adapter.set("clear-key", "value");
			expect(await adapter.has("clear-key")).toBe(true);

			await adapter.clear();
			expect(await adapter.has("clear-key")).toBe(false);
		});
	});
});
