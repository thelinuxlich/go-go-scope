/**
 * Integration tests for @go-go-scope/persistence-cloudflare-do
 */
import { describe, test, expect, beforeEach } from "vitest";
import { DurableObjectAdapter } from "../src/index.js";

// Mock Durable Object storage for testing
class MockDurableObjectStorage {
	private data = new Map<string, unknown>();

	async get<T>(key: string): Promise<T | undefined> {
		return this.data.get(key) as T | undefined;
	}

	async put<T>(key: string, value: T): Promise<void> {
		this.data.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
	}

	async transaction<T>(closure: (txn: MockTransaction) => Promise<T>): Promise<T> {
		const txn = new MockTransaction(this.data);
		const result = await closure(txn);
		txn.commit();
		return result;
	}

	async list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
		const result = new Map<string, T>();
		for (const [key, value] of this.data) {
			if (!options?.prefix || key.startsWith(options.prefix)) {
				result.set(key, value as T);
			}
		}
		return result;
	}

	clear(): void {
		this.data.clear();
	}
}

class MockTransaction {
	private data: Map<string, unknown>;
	private writes = new Map<string, unknown>();
	private deletes = new Set<string>();

	constructor(data: Map<string, unknown>) {
		this.data = data;
	}

	async get<T>(key: string): Promise<T | undefined> {
		if (this.deletes.has(key)) {
			return undefined;
		}
		if (this.writes.has(key)) {
			return this.writes.get(key) as T;
		}
		return this.data.get(key) as T | undefined;
	}

	put<T>(key: string, value: T): void {
		this.writes.set(key, value);
		this.deletes.delete(key);
	}

	delete(key: string): void {
		this.deletes.add(key);
		this.writes.delete(key);
	}

	commit(): void {
		for (const [key, value] of this.writes) {
			this.data.set(key, value);
		}
		for (const key of this.deletes) {
			this.data.delete(key);
		}
	}
}

describe("DurableObjectAdapter integration", () => {
	let storage: MockDurableObjectStorage;
	let adapter: DurableObjectAdapter;

	beforeEach(() => {
		storage = new MockDurableObjectStorage();
		adapter = new DurableObjectAdapter(storage, { keyPrefix: "test:" });
	});

	describe("Lock Provider", () => {
		test("acquire and release lock", async () => {
			const lock = await adapter.acquire("test-resource", 5000);
			expect(lock).toBeDefined();
			expect(lock).not.toBeNull();

			const isValid = await lock!.isValid();
			expect(isValid).toBe(true);

			await lock!.release();

			const isStillValid = await lock!.isValid();
			expect(isStillValid).toBe(false);
		});

		test("lock prevents concurrent access", async () => {
			// First acquire should succeed
			const lock1 = await adapter.acquire("concurrent-resource", 5000);
			expect(lock1).toBeDefined();

			// Second acquire should fail (lock is held)
			const lock2 = await adapter.acquire("concurrent-resource", 5000);
			expect(lock2).toBeNull();

			// Release first lock
			await lock1!.release();

			// Now acquire should succeed
			const lock3 = await adapter.acquire("concurrent-resource", 5000);
			expect(lock3).toBeDefined();
			await lock3!.release();
		});

		test("lock extension", async () => {
			const lock = await adapter.acquire("extend-resource", 1000);
			expect(lock).toBeDefined();

			// Extend the lock
			const extended = await lock!.extend(5000);
			expect(extended).toBe(true);

			// Lock should still be valid
			const isValid = await lock!.isValid();
			expect(isValid).toBe(true);
		});

		test("force release", async () => {
			const lock = await adapter.acquire("force-release-resource", 5000);
			expect(lock).toBeDefined();

			// Force release
			await adapter.forceRelease("force-release-resource");

			// Lock should no longer be valid
			const isValid = await lock!.isValid();
			expect(isValid).toBe(false);
		});

		test("same owner can reacquire", async () => {
			const owner = "test-owner-123";

			// First acquire
			const lock1 = await adapter.acquire("owner-test", 5000, owner);
			expect(lock1).toBeDefined();

			// Same owner can reacquire (extend)
			const lock2 = await adapter.acquire("owner-test", 5000, owner);
			expect(lock2).toBeDefined();

			// Different owner cannot acquire
			const lock3 = await adapter.acquire("owner-test", 5000, "different-owner");
			expect(lock3).toBeNull();
		});

		test("expired lock can be acquired", async () => {
			// Acquire with very short TTL
			const lock = await adapter.acquire("expiring-resource", 1);
			expect(lock).toBeDefined();

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 10));

			// Should be able to acquire again
			const lock2 = await adapter.acquire("expiring-resource", 5000);
			expect(lock2).toBeDefined();
		});
	});

	describe("Circuit Breaker State Provider", () => {
		test("get and set state", async () => {
			// Initial state should be null
			const initialState = await adapter.getState("test-circuit");
			expect(initialState).toBeNull();

			// Set state
			await adapter.setState("test-circuit", {
				state: "closed",
				failureCount: 0,
				lastSuccessTime: Date.now(),
			});

			// Get state
			const state = await adapter.getState("test-circuit");
			expect(state).toBeDefined();
			expect(state!.state).toBe("closed");
			expect(state!.failureCount).toBe(0);
		});

		test("record failure increments count", async () => {
			// Record failures
			const count1 = await adapter.recordFailure("failure-test", 5);
			expect(count1).toBe(1);

			const count2 = await adapter.recordFailure("failure-test", 5);
			expect(count2).toBe(2);

			// Check state
			const state = await adapter.getState("failure-test");
			expect(state).toBeDefined();
			expect(state!.failureCount).toBe(2);
			expect(state!.state).toBe("closed"); // Not enough failures to open
		});

		test("record failure opens circuit", async () => {
			// Record failures until circuit opens
			await adapter.recordFailure("open-test", 2);
			await adapter.recordFailure("open-test", 2);
			await adapter.recordFailure("open-test", 2);

			// Circuit should be open now
			const state = await adapter.getState("open-test");
			expect(state).toBeDefined();
			expect(state!.state).toBe("open");
			expect(state!.failureCount).toBe(3);
		});

		test("record success resets failures", async () => {
			// Record some failures
			await adapter.recordFailure("success-test", 5);
			await adapter.recordFailure("success-test", 5);

			// Record success
			await adapter.recordSuccess("success-test");

			// Check state
			const state = await adapter.getState("success-test");
			expect(state).toBeDefined();
			expect(state!.failureCount).toBe(0);
			expect(state!.state).toBe("closed");
			expect(state!.lastSuccessTime).toBeDefined();
		});
	});

	describe("Cache Provider", () => {
		test("get and set", async () => {
			// Set a value
			await adapter.set("test-key", { data: "hello" });

			// Get the value
			const value = await adapter.get("test-key");
			expect(value).toEqual({ data: "hello" });
		});

		test("get returns null for non-existent key", async () => {
			const value = await adapter.get("non-existent-key");
			expect(value).toBeNull();
		});

		test("cache with TTL", async () => {
			// Set a value with short TTL
			await adapter.set("ttl-key", { data: "expires" }, 50);

			// Value should exist immediately
			const value1 = await adapter.get("ttl-key");
			expect(value1).toEqual({ data: "expires" });

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 100));

			// Value should be expired
			const value2 = await adapter.get("ttl-key");
			expect(value2).toBeNull();
		});

		test("has and delete", async () => {
			// Set a value
			await adapter.set("has-key", { data: "exists" });

			// Should exist
			const exists1 = await adapter.has("has-key");
			expect(exists1).toBe(true);

			// Delete it
			await adapter.delete("has-key");

			// Should no longer exist
			const exists2 = await adapter.has("has-key");
			expect(exists2).toBe(false);
		});

		test("keys", async () => {
			// Set multiple values
			await adapter.set("key-a", 1);
			await adapter.set("key-b", 2);
			await adapter.set("key-c", 3);

			// Get all keys
			const keys = await adapter.keys();
			expect(keys).toContain("key-a");
			expect(keys).toContain("key-b");
			expect(keys).toContain("key-c");
		});

		test("clear", async () => {
			// Set multiple values
			await adapter.set("clear-1", 1);
			await adapter.set("clear-2", 2);

			// Clear all
			await adapter.clear();

			// All should be gone
			const value1 = await adapter.get("clear-1");
			const value2 = await adapter.get("clear-2");
			expect(value1).toBeNull();
			expect(value2).toBeNull();
		});

		test("expired entries are cleaned up on access", async () => {
			// Set an expiring value
			await adapter.set("expiring-key", { data: "test" }, 1);

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 10));

			// Access should clean it up
			const exists = await adapter.has("expiring-key");
			expect(exists).toBe(false);
		});
	});

	describe("Key Prefix Isolation", () => {
		test("different prefixes are isolated", async () => {
			const adapter1 = new DurableObjectAdapter(storage, { keyPrefix: "app1:" });
			const adapter2 = new DurableObjectAdapter(storage, { keyPrefix: "app2:" });

			// Set same key in both adapters
			await adapter1.set("shared-key", { app: 1 });
			await adapter2.set("shared-key", { app: 2 });

			// Each should see their own value
			const value1 = await adapter1.get("shared-key");
			const value2 = await adapter2.get("shared-key");

			expect(value1).toEqual({ app: 1 });
			expect(value2).toEqual({ app: 2 });
		});
	});

	describe("Persistence Adapter", () => {
		test("connect and disconnect", async () => {
			await adapter.connect();
			expect(adapter.isConnected()).toBe(true);

			await adapter.disconnect();
			// Still returns true as there's no real connection
			expect(adapter.isConnected()).toBe(true);
		});
	});
});
