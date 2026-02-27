/**
 * Tests for race() with worker threads
 */

import { describe, test, expect } from "vitest";
import { race } from "../src/index.js";

describe("race() with workers", () => {
	test("executes tasks in worker threads", async () => {
		const [err, result] = await race(
			[
				() => {
					let sum = 0;
					for (let i = 0; i < 1000000; i++) sum += i;
					return { worker: 1, sum };
				},
				() => {
					let sum = 0;
					for (let i = 0; i < 1000000; i++) sum += i * 2;
					return { worker: 2, sum };
				},
			],
			{ workers: { threads: 2 } },
		);

		expect(err).toBeUndefined();
		expect(result).toBeDefined();
		expect([1, 2]).toContain(result?.worker);
	});

	test("returns first result without requireSuccess", async () => {
		const [err, result] = await race(
			[
				() => {
					// Fast success
					return "winner";
				},
				() => {
					// Slower
					let sum = 0;
					for (let i = 0; i < 10000000; i++) sum += i;
					return "loser";
				},
			],
			{ workers: { threads: 2 } },
		);

		expect(err).toBeUndefined();
		expect(result).toBe("winner");
	});

	test("returns first success with requireSuccess (skips errors)", async () => {
		const [err, result] = await race(
			[
				() => {
					throw new Error("Error 1");
				},
				() => {
					// Small computation to ensure it's not instant
					let sum = 0;
					for (let i = 0; i < 100000; i++) sum += i;
					return "success";
				},
			],
			{ workers: { threads: 2 }, requireSuccess: true },
		);

		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("respects timeout", async () => {
		const start = Date.now();
		const [err, result] = await race(
			[
				() => {
					// Long running task
					const start = Date.now();
					while (Date.now() - start < 2000) {}
					return "slow";
				},
				() => {
					// Also slow
					const start = Date.now();
					while (Date.now() - start < 2000) {}
					return "also slow";
				},
			],
			{ workers: { threads: 2 }, timeout: 100 },
		);
		const elapsed = Date.now() - start;

		expect(err).toBeDefined();
		expect(result).toBeUndefined();
		expect(elapsed).toBeLessThan(200); // Should timeout quickly
	});

	test("returns error when all tasks fail with requireSuccess", async () => {
		const [err, result] = await race(
			[
				() => {
					throw new Error("Error 1");
				},
				() => {
					throw new Error("Error 2");
				},
			],
			{ workers: { threads: 2 }, requireSuccess: true },
		);

		expect(err).toBeDefined();
		expect(result).toBeUndefined();
	});

	test("works with single task", async () => {
		const [err, result] = await race(
			[
				() => {
					return "single winner";
				},
			],
			{ workers: { threads: 1 } },
		);

		expect(err).toBeUndefined();
		expect(result).toBe("single winner");
	});

	test("handles empty factories array", async () => {
		const [err, result] = await race([], { workers: { threads: 2 } });

		expect(err).toBeDefined();
		expect(err?.message).toContain("empty");
		expect(result).toBeUndefined();
	});

	test("worker functions are self-contained", async () => {
		// This test verifies that functions in workers can't access outer scope
		const [err, result] = await race(
			[
				() => {
					// Self-contained computation
					const factorial = (n: number): number =>
						n <= 1 ? 1 : n * factorial(n - 1);
					return factorial(10);
				},
				() => {
					const fib = (n: number): number =>
						n < 2 ? n : fib(n - 1) + fib(n - 2);
					return fib(20);
				},
			],
			{ workers: { threads: 2 } },
		);

		expect(err).toBeUndefined();
		expect(result).toBeDefined();
		// Either factorial(10) = 3628800 or fib(20) = 6765
		expect([3628800, 6765]).toContain(result);
	});
});
