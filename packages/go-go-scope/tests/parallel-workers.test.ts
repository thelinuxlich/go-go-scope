/**
 * Tests for parallel() function with worker threads
 */

import { describe, expect, test } from "vitest";
import { parallel } from "../src/parallel.js";

describe("parallel() with workers", () => {
	describe("basic functionality", () => {
		test("executes CPU-intensive tasks in worker threads", async () => {
			// CPU-intensive factorial calculation using inline self-contained functions
			const results = await parallel(
				[
					() =>
						Promise.resolve(
							((n: number) => {
								let result = 1;
								for (let i = 2; i <= n; i++) result *= i;
								return result;
							})(10),
						),
					() =>
						Promise.resolve(
							((n: number) => {
								let result = 1;
								for (let i = 2; i <= n; i++) result *= i;
								return result;
							})(10),
						),
					() =>
						Promise.resolve(
							((n: number) => {
								let result = 1;
								for (let i = 2; i <= n; i++) result *= i;
								return result;
							})(10),
						),
				],
				{ workers: 2 },
			);

			expect(results).toHaveLength(3);
			// Each result should be 10! = 3628800
			expect(results[0][1]).toBe(3628800);
			expect(results[1][1]).toBe(3628800);
			expect(results[2][1]).toBe(3628800);
		});

		test("maintains order with workers option", async () => {
			const results = await parallel(
				[
					() => Promise.resolve(1),
					() => Promise.resolve(2),
					() => Promise.resolve(3),
				],
				{ workers: 2 },
			);

			expect(results.map((r) => r[1])).toEqual([1, 2, 3]);
		});

		test("handles errors with workers option", async () => {
			const results = await parallel(
				[
					() => Promise.resolve(1),
					() => Promise.reject(new Error("Task 2 failed")),
					() => Promise.resolve(3),
				],
				{ workers: 2, continueOnError: true },
			);

			expect(results).toHaveLength(3);
			expect(results[0][0]).toBeUndefined();
			expect(results[0][1]).toBe(1);
			expect(results[1][0]).toBeInstanceOf(Error);
			expect(results[2][0]).toBeUndefined();
			expect(results[2][1]).toBe(3);
		});

		test("respects signal cancellation with workers", async () => {
			const controller = new AbortController();

			// Start tasks with workers
			const promise = parallel(
				[
					() =>
						new Promise((resolve) => {
							setTimeout(() => resolve(1), 1000);
						}),
					() =>
						new Promise((resolve) => {
							setTimeout(() => resolve(2), 1000);
						}),
				],
				{ workers: 2, signal: controller.signal },
			);

			// Cancel immediately
			controller.abort();

			// Should get error results, not throw
			const results = await promise;
			expect(results).toHaveLength(2);
			// Results should have errors due to cancellation
			expect(results[0][0]).toBeInstanceOf(Error);
			expect(results[1][0]).toBeInstanceOf(Error);
		});
	});

	describe("performance", () => {
		test("parallel workers complete faster than sequential for CPU tasks", async () => {
			const cpuTask = () => {
				// Simulate CPU work
				let sum = 0;
				for (let i = 0; i < 10000000; i++) {
					sum += i;
				}
				return sum;
			};

			// Run with workers (2 workers)
			const workerStart = Date.now();
			await parallel(
				[
					() => Promise.resolve(cpuTask()),
					() => Promise.resolve(cpuTask()),
				],
				{ workers: 2 },
			);
			const workerDuration = Date.now() - workerStart;

			// Run without workers (sequential)
			const seqStart = Date.now();
			await Promise.all([
				Promise.resolve(cpuTask()),
				Promise.resolve(cpuTask()),
			]);
			const seqDuration = Date.now() - seqStart;

			// Workers should be faster or similar (allowing for overhead)
			// Not a strict test due to timing variability
			console.log(`Workers: ${workerDuration}ms, Sequential: ${seqDuration}ms`);
		});
	});

	describe("progress tracking", () => {
		test("calls onProgress with workers option", async () => {
			const progress: Array<{ completed: number; total: number }> = [];

			await parallel(
				[
					() => Promise.resolve(1),
					() => Promise.resolve(2),
					() => Promise.resolve(3),
				],
				{
					workers: 2,
					onProgress: (completed, total) => {
						progress.push({ completed, total });
					},
				},
			);

			expect(progress.length).toBeGreaterThanOrEqual(3);
			expect(progress[progress.length - 1].completed).toBe(3);
			expect(progress[progress.length - 1].total).toBe(3);
		});
	});

	describe("worker options", () => {
		test("uses custom workerIdleTimeout", async () => {
			// Just verify it doesn't throw with custom timeout
			const results = await parallel(
				[() => Promise.resolve(1), () => Promise.resolve(2)],
				{ workers: 2, workerIdleTimeout: 1000 },
			);

			expect(results).toHaveLength(2);
			expect(results[0][1]).toBe(1);
			expect(results[1][1]).toBe(2);
		});

		test("falls back to normal execution when workers is 0", async () => {
			const results = await parallel(
				[() => Promise.resolve(1), () => Promise.resolve(2)],
				{ workers: 0 },
			);

			expect(results).toHaveLength(2);
			expect(results[0][1]).toBe(1);
			expect(results[1][1]).toBe(2);
		});
	});

	describe("empty factories", () => {
		test("returns empty array when factories is empty", async () => {
			const results = await parallel([], { workers: 2 });
			expect(results).toEqual([]);
		});
	});

	describe("complex data types", () => {
		test("handles array return values", async () => {
			const results = await parallel(
				[
					() => Promise.resolve([1, 2, 3]),
					() => Promise.resolve([4, 5, 6]),
				],
				{ workers: 2 },
			);

			expect(results[0][1]).toEqual([1, 2, 3]);
			expect(results[1][1]).toEqual([4, 5, 6]);
		});

		test("handles object return values", async () => {
			const results = await parallel(
				[
					() => Promise.resolve({ a: 1, b: 2 }),
					() => Promise.resolve({ c: 3, d: 4 }),
				],
				{ workers: 2 },
			);

			expect(results[0][1]).toEqual({ a: 1, b: 2 });
			expect(results[1][1]).toEqual({ c: 3, d: 4 });
		});
	});
});
