import { describe, expect, test } from "vitest";
import {
	createIdempotencyProvider,
	InMemoryIdempotencyProvider,
	scope,
} from "../src/index.js";

describe("Idempotency", () => {
	describe("InMemoryIdempotencyProvider", () => {
		test("stores and retrieves values", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" });
			const result = await provider.get("key1");

			expect(result).toEqual({
				value: { data: "value1" },
				expiresAt: undefined,
			});
		});

		test("returns null for non-existent keys", async () => {
			const provider = new InMemoryIdempotencyProvider();

			const result = await provider.get("nonexistent");

			expect(result).toBeNull();
		});

		test("respects TTL", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" }, 50);

			// Should exist immediately
			const result1 = await provider.get("key1");
			expect(result1?.value).toEqual({ data: "value1" });

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 60));

			// Should be expired
			const result2 = await provider.get("key1");
			expect(result2).toBeNull();
		});

		test("deletes values", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" });
			await provider.delete("key1");

			const result = await provider.get("key1");
			expect(result).toBeNull();
		});

		test("clears all values", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" });
			await provider.set("key2", { data: "value2" });
			await provider.clear();

			expect(await provider.get("key1")).toBeNull();
			expect(await provider.get("key2")).toBeNull();
			expect(provider.size).toBe(0);
		});

		test("cleanup removes expired entries", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" }, 10);
			await provider.set("key2", { data: "value2" }); // No TTL

			// Wait for expiration
			await new Promise((r) => setTimeout(r, 20));

			const removed = provider.cleanup();

			expect(removed).toBe(1);
			expect(await provider.get("key1")).toBeNull();
			expect(await provider.get("key2")).toBeTruthy();
		});

		test("dispose clears the store", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await provider.set("key1", { data: "value1" });
			provider[Symbol.dispose]();

			expect(provider.size).toBe(0);
		});

		test("respects maxSize", async () => {
			const provider = new InMemoryIdempotencyProvider({ maxSize: 10 });

			// Add 10 entries
			for (let i = 0; i < 10; i++) {
				await provider.set(`key${i}`, { data: i });
			}

			expect(provider.size).toBe(10);

			// Add one more - should trigger eviction
			await provider.set("key10", { data: 10 });

			// Size should still be around 10 (some entries evicted)
			expect(provider.size).toBeLessThanOrEqual(10);
		});
	});

	describe("createIdempotencyProvider", () => {
		test("creates provider with options", () => {
			const provider = createIdempotencyProvider({ maxSize: 100 });
			expect(provider).toBeInstanceOf(InMemoryIdempotencyProvider);
		});

		test("creates provider without options", () => {
			const provider = createIdempotencyProvider();
			expect(provider).toBeInstanceOf(InMemoryIdempotencyProvider);
		});
	});

	describe("Task idempotency", () => {
		test("same key returns same result", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call executes
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "test-key" },
			});
			const [err1, result1] = await t1;

			expect(err1).toBeUndefined();
			expect(result1).toBe("result-1");
			expect(executionCount).toBe(1);

			// Second call with same key returns cached result
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "test-key" },
			});
			const [err2, result2] = await t2;

			expect(err2).toBeUndefined();
			expect(result2).toBe("result-1"); // Same result as first call
			expect(executionCount).toBe(1); // Function not called again
		});

		test("different keys execute independently", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call with key1
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "key-1" },
			});
			const [, result1] = await t1;
			expect(result1).toBe("result-1");

			// Second call with key2
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "key-2" },
			});
			const [, result2] = await t2;
			expect(result2).toBe("result-2");

			expect(executionCount).toBe(2);
		});

		test("errors are not cached", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async () => {
				executionCount++;
				if (executionCount === 1) {
					throw new Error("first attempt fails");
				}
				return `success-${executionCount}`;
			};

			// First call fails
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "error-key" },
			});
			const [err1] = await t1;
			expect(err1).toBeInstanceOf(Error);
			expect(executionCount).toBe(1);

			// Second call with same key should retry (error not cached)
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "error-key" },
			});
			const [err2, result2] = await t2;
			expect(err2).toBeUndefined();
			expect(result2).toBe("success-2");
			expect(executionCount).toBe(2);
		});

		test("TTL expiration", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call with short TTL
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "ttl-key", ttl: 50 },
			});
			const [, result1] = await t1;
			expect(result1).toBe("result-1");

			// Wait for TTL to expire
			await new Promise((r) => setTimeout(r, 60));

			// Second call should re-execute
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "ttl-key", ttl: 50 },
			});
			const [, result2] = await t2;
			expect(result2).toBe("result-2");
			expect(executionCount).toBe(2);
		});

		test("idempotencyKey as function", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async (id: string) => {
				executionCount++;
				return `result-${id}-${executionCount}`;
			};

			const id = "user123";

			// First call
			const t1 = await s.task(
				({ signal }) => fn(id),
				{
					idempotency: { key: () => `user:${id}` },
				},
			);
			const [, result1] = await t1;
			expect(result1).toBe("result-user123-1");

			// Second call with same key generator
			const t2 = await s.task(
				({ signal }) => fn(id),
				{
					idempotency: { key: () => `user:${id}` },
				},
			);
			const [, result2] = await t2;
			expect(result2).toBe("result-user123-1"); // Cached result
			expect(executionCount).toBe(1);
		});

		test("uses scope default TTL when not specified on task", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
				idempotency: { defaultTTL: 50 },
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call (uses default TTL)
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "default-ttl-key" },
			});
			const [, result1] = await t1;
			expect(result1).toBe("result-1");

			// Wait for default TTL to expire
			await new Promise((r) => setTimeout(r, 60));

			// Second call should re-execute
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "default-ttl-key" },
			});
			const [, result2] = await t2;
			expect(result2).toBe("result-2");
			expect(executionCount).toBe(2);
		});

		test("task TTL overrides scope default TTL", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using s = scope({
				persistence: { idempotency: provider },
				idempotency: { defaultTTL: 5000 }, // Long default
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call with short TTL override
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "override-key", ttl: 50 },
			});
			const [, result1] = await t1;
			expect(result1).toBe("result-1");

			// Wait for short TTL to expire
			await new Promise((r) => setTimeout(r, 60));

			// Second call should re-execute
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "override-key", ttl: 50 },
			});
			const [, result2] = await t2;
			expect(result2).toBe("result-2");
			expect(executionCount).toBe(2);
		});

		test("works without idempotency provider (no caching)", async () => {
			let executionCount = 0;

			await using s = scope(); // No idempotency provider

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "no-provider-key" },
			});
			const [, result1] = await t1;
			expect(result1).toBe("result-1");

			// Second call - should re-execute (no caching without provider)
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "no-provider-key" },
			});
			const [, result2] = await t2;
			expect(result2).toBe("result-2");
			expect(executionCount).toBe(2);
		});

		test("idempotency inherits from parent scope", async () => {
			const provider = new InMemoryIdempotencyProvider();
			let executionCount = 0;

			await using parent = scope({
				persistence: { idempotency: provider },
				idempotency: { defaultTTL: 1000 },
			});

			const fn = async () => {
				executionCount++;
				return `result-${executionCount}`;
			};

			// First call in parent scope
			const t1 = await parent.task(({ signal }) => fn(), {
				idempotency: { key: "inherit-key" },
			});
			await t1;

			// Second call in child scope (should inherit provider)
			await using child = scope({ parent });
			const t2 = await child.task(({ signal }) => fn(), {
				idempotency: { key: "inherit-key" },
			});
			const [, result2] = await t2;

			expect(result2).toBe("result-1"); // Cached result from parent
			expect(executionCount).toBe(1);
		});

		test("Result tuple is properly cached", async () => {
			const provider = new InMemoryIdempotencyProvider();

			await using s = scope({
				persistence: { idempotency: provider },
			});

			const fn = async () => ({ id: 1, name: "Test" });

			// First call
			const t1 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "result-key" },
			});
			const [err1, result1] = await t1;

			expect(err1).toBeUndefined();
			expect(result1).toEqual({ id: 1, name: "Test" });

			// Second call should return same Result structure
			const t2 = await s.task(({ signal }) => fn(), {
				idempotency: { key: "result-key" },
			});
			const [err2, result2] = await t2;

			expect(err2).toBeUndefined();
			expect(result2).toEqual({ id: 1, name: "Test" });
		});
	});
});
