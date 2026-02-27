/**
 * Tests for scope.task() with worker option
 */

import { describe, expect, test } from "vitest";
import { scope } from "../src/factory.js";

describe("scope.task() with worker option", () => {
	test("executes task in worker thread", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			() => {
				// CPU-intensive calculation
				let sum = 0;
				for (let i = 0; i < 1000000; i++) {
					sum += Math.sqrt(i);
				}
				return sum;
			},
			{ worker: true },
		);

		expect(err).toBeUndefined();
		expect(typeof result).toBe("number");
		expect(result).toBeGreaterThan(0);
	});

	test("returns correct result from worker", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			({ services }) => {
				// Simple calculation
				return 42;
			},
			{ worker: true },
		);

		expect(err).toBeUndefined();
		expect(result).toBe(42);
	});

	test("handles errors in worker thread", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			() => {
				throw new Error("Worker error");
			},
			{ worker: true },
		);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("Worker error");
		expect(result).toBeUndefined();
	});

	test("multiple worker tasks run in parallel", async () => {
		await using s = scope();

		const tasks = [
			s.task(
				() => {
					let sum = 0;
					for (let i = 0; i < 100000; i++) sum += i;
					return sum;
				},
				{ worker: true },
			),
			s.task(
				() => {
					let product = 1;
					for (let i = 1; i <= 10; i++) product *= i;
					return product;
				},
				{ worker: true },
			),
			s.task(
				() => {
					return "hello from worker";
				},
				{ worker: true },
			),
		];

		const results = await Promise.all(tasks);

		expect(results[0][0]).toBeUndefined();
		expect(results[0][1]).toBe(4999950000);

		expect(results[1][0]).toBeUndefined();
		expect(results[1][1]).toBe(3628800);

		expect(results[2][0]).toBeUndefined();
		expect(results[2][1]).toBe("hello from worker");
	});

	test("worker task with async function", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			async () => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "async result";
			},
			{ worker: true },
		);

		expect(err).toBeUndefined();
		expect(result).toBe("async result");
	});

	test("worker task with complex return type", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			() => {
				return {
					data: [1, 2, 3],
					meta: { count: 3 },
				};
			},
			{ worker: true },
		);

		expect(err).toBeUndefined();
		expect(result).toEqual({
			data: [1, 2, 3],
			meta: { count: 3 },
		});
	});

	test("worker option combines with other options", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			() => {
				return "success";
			},
			{
				worker: true,
				errorContext: { operation: "test" },
			},
		);

		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("regular task and worker task can coexist", async () => {
		await using s = scope();

		const [regularErr, regularResult] = await s.task(() =>
			Promise.resolve("regular"),
		);

		const [workerErr, workerResult] = await s.task(
			() => "worker",
			{ worker: true },
		);

		expect(regularErr).toBeUndefined();
		expect(regularResult).toBe("regular");

		expect(workerErr).toBeUndefined();
		expect(workerResult).toBe("worker");
	});
});
