/**
 * Tests for @go-go-scope/persistence-deno-kv
 * Run with: deno test --allow-all tests/deno-kv.test.ts
 */

import { assertEquals, assertNotEquals, assertExists } from "jsr:@std/assert";
import { DenoKVAdapter } from "../src/index.ts";

// Test helper to create a fresh KV instance for each test
async function createTestAdapter(): Promise<{ adapter: DenoKVAdapter; kv: Deno.Kv; prefix: string }> {
	const kv = await Deno.openKv();
	// Use unique prefix per test to avoid cross-test contamination
	const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2)}:`;
	const adapter = new DenoKVAdapter(kv, { keyPrefix: prefix });
	return { adapter, kv, prefix };
}

Deno.test("DenoKVAdapter - connect and disconnect", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();
		assertEquals(adapter.isConnected(), true);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - acquire and release lock", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Acquire a lock
		const lock = await adapter.acquire("test-resource", 5000);
		assertExists(lock);

		// Verify lock is valid
		const isValid = await lock.isValid();
		assertEquals(isValid, true);

		// Release the lock
		await lock.release();

		// Verify lock is no longer valid
		const isStillValid = await lock.isValid();
		assertEquals(isStillValid, false);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - lock prevents concurrent access", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// First acquire should succeed
		const lock1 = await adapter.acquire("concurrent-resource", 5000);
		assertExists(lock1);

		// Second acquire should fail (lock is held)
		const lock2 = await adapter.acquire("concurrent-resource", 5000);
		assertEquals(lock2, null);

		// Release first lock
		await lock1.release();

		// Now acquire should succeed
		const lock3 = await adapter.acquire("concurrent-resource", 5000);
		assertExists(lock3);
		await lock3.release();
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - lock extension", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Acquire a lock
		const lock = await adapter.acquire("extend-resource", 1000);
		assertExists(lock);

		// Extend the lock
		const extended = await lock.extend(5000);
		assertEquals(extended, true);

		// Lock should still be valid
		const isValid = await lock.isValid();
		assertEquals(isValid, true);

		await lock.release();
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - force release", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Acquire a lock
		const lock = await adapter.acquire("force-release-resource", 5000);
		assertExists(lock);

		// Force release
		await adapter.forceRelease("force-release-resource");

		// Lock should no longer be valid
		const isValid = await lock.isValid();
		assertEquals(isValid, false);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - circuit breaker state", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Initial state should be null
		const initialState = await adapter.getState("test-circuit");
		assertEquals(initialState, null);

		// Set state
		await adapter.setState("test-circuit", {
			state: "closed",
			failureCount: 0,
			lastSuccessTime: Date.now(),
		});

		// Get state
		const state = await adapter.getState("test-circuit");
		assertExists(state);
		assertEquals(state.state, "closed");
		assertEquals(state.failureCount, 0);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - record failure increments count", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Record failures
		const count1 = await adapter.recordFailure("failure-test", 5);
		assertEquals(count1, 1);

		const count2 = await adapter.recordFailure("failure-test", 5);
		assertEquals(count2, 2);

		// Check state
		const state = await adapter.getState("failure-test");
		assertExists(state);
		assertEquals(state.failureCount, 2);
		assertEquals(state.state, "closed"); // Not enough failures to open
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - record failure opens circuit", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Record failures until circuit opens
		await adapter.recordFailure("open-test", 2);
		await adapter.recordFailure("open-test", 2);
		const count = await adapter.recordFailure("open-test", 2);

		// Circuit should be open now
		const state = await adapter.getState("open-test");
		assertExists(state);
		assertEquals(state.state, "open");
		assertEquals(state.failureCount, 3);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - record success resets failures", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Record some failures
		await adapter.recordFailure("success-test", 5);
		await adapter.recordFailure("success-test", 5);

		// Record success
		await adapter.recordSuccess("success-test");

		// Check state
		const state = await adapter.getState("success-test");
		assertExists(state);
		assertEquals(state.failureCount, 0);
		assertEquals(state.state, "closed");
		assertExists(state.lastSuccessTime);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - cache get/set", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Set a value
		await adapter.set("test-key", { data: "hello" });

		// Get the value
		const value = await adapter.get("test-key");
		assertEquals(value, { data: "hello" });
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - cache with TTL", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Set a value with short TTL
		await adapter.set("ttl-key", { data: "expires" }, 50);

		// Value should exist immediately
		const value1 = await adapter.get("ttl-key");
		assertEquals(value1, { data: "expires" });

		// Wait for expiration
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Value should be expired
		const value2 = await adapter.get("ttl-key");
		assertEquals(value2, null);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - cache has/delete", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Set a value
		await adapter.set("has-key", { data: "exists" });

		// Should exist
		const exists1 = await adapter.has("has-key");
		assertEquals(exists1, true);

		// Delete it
		await adapter.delete("has-key");

		// Should no longer exist
		const exists2 = await adapter.has("has-key");
		assertEquals(exists2, false);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - cache keys", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Set multiple values
		await adapter.set("key-a", 1);
		await adapter.set("key-b", 2);
		await adapter.set("key-c", 3);

		// Get all keys
		const keys = await adapter.keys();
		assertEquals(keys.includes("key-a"), true);
		assertEquals(keys.includes("key-b"), true);
		assertEquals(keys.includes("key-c"), true);
	} finally {
		await adapter.clear();
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - cache clear", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Set multiple values
		await adapter.set("clear-1", 1);
		await adapter.set("clear-2", 2);

		// Clear all
		await adapter.clear();

		// All should be gone
		const value1 = await adapter.get("clear-1");
		const value2 = await adapter.get("clear-2");
		assertEquals(value1, null);
		assertEquals(value2, null);
	} finally {
		await adapter.disconnect();
	}
});

Deno.test("DenoKVAdapter - key prefix isolation", async () => {
	const kv = await Deno.openKv();

	try {
		const adapter1 = new DenoKVAdapter(kv, { keyPrefix: "app1:" });
		const adapter2 = new DenoKVAdapter(kv, { keyPrefix: "app2:" });

		await adapter1.connect();
		await adapter2.connect();

		// Set same key in both adapters
		await adapter1.set("shared-key", { app: 1 });
		await adapter2.set("shared-key", { app: 2 });

		// Each should see their own value
		const value1 = await adapter1.get("shared-key");
		const value2 = await adapter2.get("shared-key");

		assertEquals(value1, { app: 1 });
		assertEquals(value2, { app: 2 });
	} finally {
		await kv.close();
	}
});

Deno.test("DenoKVAdapter - lock same owner can reacquire", async () => {
	const { adapter, kv } = await createTestAdapter();

	try {
		await adapter.connect();

		// Acquire lock with specific owner
		const owner = "test-owner-123";
		const lock1 = await adapter.acquire("owner-test", 5000, owner);
		assertExists(lock1);

		// Same owner should be able to reacquire (extend)
		const lock2 = await adapter.acquire("owner-test", 5000, owner);
		assertExists(lock2);

		// Different owner should not be able to acquire
		const lock3 = await adapter.acquire("owner-test", 5000, "different-owner");
		assertEquals(lock3, null);
	} finally {
		await adapter.disconnect();
	}
});
