/**
 * Type checking tests - verifies compile-time type safety
 */

import { describe, test, expect } from "vitest";
import { scope, parallel } from "../src/index.js";
import type { Result } from "../src/index.js";

class TestError extends Error {}
class SystemError extends Error {}

describe("type safety", () => {
	test("errorClass and systemErrorClass are mutually exclusive", async () => {
		await using s = scope();

		// These should work - only errorClass
		const t1 = s.task(async () => "ok", { errorClass: TestError });
		await t1;

		// These should work - only systemErrorClass
		const t2 = s.task(async () => "ok", { systemErrorClass: SystemError });
		await t2;

		// These should work - neither specified
		const t3 = s.task(async () => "ok");
		await t3;

		// @ts-expect-error - errorClass and systemErrorClass cannot be used together
		const invalid = s.task(async () => "ok", {
			errorClass: TestError,
			systemErrorClass: SystemError,
		});
	});

	test("use() is type-safe with provide()", () => {
		const s = scope()
			.provide("db", () => ({ query: () => "result" }))
			.provide("cache", () => ({ get: () => "cached" }))

		// These should work
		const db = s.use("db")
		const cache = s.use("cache")

		// Type inference should work
		expect(typeof db.query).toBe("function")
		expect(typeof cache.get).toBe("function")

		// @ts-expect-error - 'invalid' is not a valid service key
		const invalid = s.use("invalid")
	});

	test("has() is type-safe", () => {
		const s = scope().provide("api", () => ({ fetch: () => "data" }))

		// These should work
		expect(s.has("api")).toBe(true)

		// @ts-expect-error - 'other' is not a valid service key
		expect(s.has("other")).toBe(false)
	});

	test("override() is type-safe", () => {
		const s = scope()
			.provide("db", () => ({ name: "postgres" }))

		// Should work - same key
		s.override("db", () => ({ name: "mock" }))

		// @ts-expect-error - 'invalid' is not a valid service key
		// Also throws at runtime
		expect(() => s.override("invalid", () => ({}))).toThrow(
			"Cannot override service 'invalid'",
		)
	});

	test("task services are typed", async () => {
		await using s = scope()
			.provide("db", () => ({ query: (sql: string) => [sql] }))

		const [err, result] = await s.task(({ services }) => {
			// services.db should be typed
			return services.db.query("SELECT 1")
		})

		expect(err).toBeUndefined()
		expect(result).toEqual(["SELECT 1"])
	});

	test("chained provide tracks all services", () => {
		const s = scope()
			.provide("a", () => 1)
			.provide("b", () => 2)
			.provide("c", () => 3)

		// All should be accessible
		expect(s.use("a")).toBe(1)
		expect(s.use("b")).toBe(2)
		expect(s.use("c")).toBe(3)

		// @ts-expect-error - 'd' is not defined
		s.use("d")
	});

	test("parallel preserves individual result types", async () => {
		interface User {
			id: number;
			name: string;
		}
		interface Order {
			orderId: string;
			total: number;
		}

		const [userResult, orderResult, numResult] = await parallel([
			async (): Promise<User> => ({ id: 1, name: "John" }),
			async (): Promise<Order> => ({ orderId: "abc", total: 100 }),
			async (): Promise<number> => 42,
		]);

		// TypeScript should infer the correct types for each result
		const [userErr, user] = userResult;
		const [orderErr, order] = orderResult;
		const [numErr, num] = numResult;

		// These should type-check correctly
		if (!userErr && user) {
			const id: number = user.id;
			const name: string = user.name;
			expect(id).toBe(1);
			expect(name).toBe("John");
		}

		if (!orderErr && order) {
			const orderId: string = order.orderId;
			const total: number = order.total;
			expect(orderId).toBe("abc");
			expect(total).toBe(100);
		}

		if (!numErr && num !== undefined) {
			const n: number = num;
			expect(n).toBe(42);
		}
	});

	test("scope.parallel preserves individual result types", async () => {
		await using s = scope();

		const [r1, r2, r3] = await s.parallel([
			async () => "string" as const,
			async () => 123 as const,
			async () => true as const,
		]);

		// TypeScript should infer: Result<unknown, "string">, Result<unknown, 123>, Result<unknown, true>
		const [, s1] = r1;
		const [, n1] = r2;
		const [, b1] = r3;

		if (s1) {
			const str: "string" = s1;
			expect(str).toBe("string");
		}
		if (n1 !== undefined) {
			const num: 123 = n1;
			expect(num).toBe(123);
		}
		if (b1 !== undefined) {
			const bool: true = b1;
			expect(bool).toBe(true);
		}
	});
});

describe("task deduplication", () => {
	test("deduplicates tasks with same key", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			await new Promise((r) => setTimeout(r, 50));
			return "result";
		};

		// Start two tasks with the same dedupe key
		const t1 = s.task(() => fetchData(), { dedupe: "key1" });
		const t2 = s.task(() => fetchData(), { dedupe: "key1" });

		const [r1, r2] = await Promise.all([t1, t2]);

		// Both should succeed
		expect(r1[0]).toBeUndefined();
		expect(r2[0]).toBeUndefined();
		expect(r1[1]).toBe("result");
		expect(r2[1]).toBe("result");

		// But only one call should have been made
		expect(callCount).toBe(1);
	});

	test("different keys do not deduplicate", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return "result";
		};

		// Start two tasks with different dedupe keys
		const t1 = s.task(() => fetchData(), { dedupe: "key1" });
		const t2 = s.task(() => fetchData(), { dedupe: "key2" });

		await Promise.all([t1, t2]);

		// Both calls should have been made
		expect(callCount).toBe(2);
	});

	test("dedupe key is released after completion", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return "result";
		};

		// First task
		const t1 = s.task(() => fetchData(), { dedupe: "key1" });
		await t1;

		// Second task with same key after first completes
		const t2 = s.task(() => fetchData(), { dedupe: "key1" });
		await t2;

		// Both calls should have been made (key was released)
		expect(callCount).toBe(2);
	});

	test("dedupe works with errors", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			throw new Error("failed");
		};

		// Start two tasks with the same dedupe key
		const t1 = s.task(() => fetchData(), { dedupe: "key1" });
		const t2 = s.task(() => fetchData(), { dedupe: "key1" });

		const [r1, r2] = await Promise.all([t1, t2]);

		// Both should fail
		expect(r1[0]).toBeInstanceOf(Error);
		expect(r2[0]).toBeInstanceOf(Error);

		// But only one call should have been made
		expect(callCount).toBe(1);
	});

	test("symbol keys work for deduplication", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return "result";
		};

		const key = Symbol("myKey");

		const t1 = s.task(() => fetchData(), { dedupe: key });
		const t2 = s.task(() => fetchData(), { dedupe: key });

		await Promise.all([t1, t2]);

		expect(callCount).toBe(1);
	});
});

describe("task memoization", () => {
	test("memoizes successful results", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return `result-${callCount}`;
		};

		// First call executes
		const r1 = await s.task(() => fetchData(), {
			memo: { key: "test-key", ttl: 1000 },
		});
		expect(r1[1]).toBe("result-1");
		expect(callCount).toBe(1);

		// Second call returns cached result
		const r2 = await s.task(() => fetchData(), {
			memo: { key: "test-key", ttl: 1000 },
		});
		expect(r2[1]).toBe("result-1"); // Same cached value
		expect(callCount).toBe(1); // No additional call
	});

	test("does not memoize errors", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			throw new Error(`error-${callCount}`);
		};

		// First call fails
		const r1 = await s.task(() => fetchData(), {
			memo: { key: "error-key", ttl: 1000 },
		});
		expect(r1[0]).toBeInstanceOf(Error);
		expect(callCount).toBe(1);

		// Second call retries (error not cached)
		const r2 = await s.task(() => fetchData(), {
			memo: { key: "error-key", ttl: 1000 },
		});
		expect(r2[0]).toBeInstanceOf(Error);
		expect(callCount).toBe(2); // Retried
	});

	test("expires after TTL", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return `result-${callCount}`;
		};

		// First call executes
		const r1 = await s.task(() => fetchData(), {
			memo: { key: "ttl-key", ttl: 50 }, // 50ms TTL
		});
		expect(r1[1]).toBe("result-1");

		// Immediately call again - should be cached
		const r2 = await s.task(() => fetchData(), {
			memo: { key: "ttl-key", ttl: 50 },
		});
		expect(r2[1]).toBe("result-1");
		expect(callCount).toBe(1);

		// Wait for TTL to expire
		await new Promise((r) => setTimeout(r, 60));

		// Now should execute again
		const r3 = await s.task(() => fetchData(), {
			memo: { key: "ttl-key", ttl: 50 },
		});
		expect(r3[1]).toBe("result-2");
		expect(callCount).toBe(2);
	});

	test("different keys have separate caches", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async (id: number) => {
			callCount++;
			return `user-${id}`;
		};

		// Cache user 1
		const r1 = await s.task(() => fetchData(1), {
			memo: { key: "user:1", ttl: 1000 },
		});
		expect(r1[1]).toBe("user-1");

		// Cache user 2
		const r2 = await s.task(() => fetchData(2), {
			memo: { key: "user:2", ttl: 1000 },
		});
		expect(r2[1]).toBe("user-2");

		// Two separate calls
		expect(callCount).toBe(2);

		// Both should be cached now
		await s.task(() => fetchData(1), { memo: { key: "user:1", ttl: 1000 } });
		await s.task(() => fetchData(2), { memo: { key: "user:2", ttl: 1000 } });
		expect(callCount).toBe(2); // No new calls
	});

	test("symbol keys work for memoization", async () => {
		await using s = scope();

		let callCount = 0;
		const fetchData = async () => {
			callCount++;
			return "result";
		};

		const key = Symbol("memoKey");

		// First call
		await s.task(() => fetchData(), { memo: { key, ttl: 1000 } });
		expect(callCount).toBe(1);

		// Second call - cached
		await s.task(() => fetchData(), { memo: { key, ttl: 1000 } });
		expect(callCount).toBe(1);
	});
});
