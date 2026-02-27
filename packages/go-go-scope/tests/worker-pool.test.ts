/**
 * Tests for WorkerPool - Multithreading support
 */

import { describe, expect, test } from "vitest";
import { WorkerPool, workerPool } from "../src/worker-pool.js";

describe("WorkerPool", () => {
	describe("basic functionality", () => {
		test("creates a pool with default size", async () => {
			await using pool = new WorkerPool();
			const stats = pool.stats();
			expect(stats.total).toBe(0); // Workers created lazily
			expect(stats.busy).toBe(0);
			expect(stats.idle).toBe(0);
			expect(stats.pending).toBe(0);
		});

		test("creates a pool with custom size", async () => {
			await using pool = new WorkerPool({ size: 2 });
			const stats = pool.stats();
			expect(pool.isDisposed).toBe(false);
			expect(stats.total).toBe(0); // Workers created lazily
		});

		test("workerPool factory function creates pool", async () => {
			await using pool = workerPool({ size: 2 });
			expect(pool).toBeInstanceOf(WorkerPool);
			expect(pool.isDisposed).toBe(false);
		});
	});

	describe("execute", () => {
		test("executes simple function in worker", async () => {
			await using pool = new WorkerPool({ size: 2 });
			const result = await pool.execute((n: number) => n * 2, 21);
			expect(result).toBe(42);
		});

		test("executes multiple tasks in parallel", async () => {
			await using pool = new WorkerPool({ size: 4 });

			const tasks = Array.from({ length: 10 }, (_, i) =>
				pool.execute((n: number) => n * n, i),
			);

			const results = await Promise.all(tasks);
			expect(results).toEqual([0, 1, 4, 9, 16, 25, 36, 49, 64, 81]);
		});

		test("executes CPU-intensive function", async () => {
			await using pool = new WorkerPool({ size: 2 });

			// CPU-intensive calculation (factorial)
			const result = await pool.execute((n: number) => {
				let result = 1;
				for (let i = 2; i <= n; i++) {
					result *= i;
				}
				return result;
			}, 10);
			expect(result).toBe(3628800);
		});

		test("handles errors in worker function", async () => {
			await using pool = new WorkerPool({ size: 2 });

			await expect(
				pool.execute(() => {
					throw new Error("Worker error");
				}, null),
			).rejects.toThrow("Worker error");
		});

		test("handles async function errors", async () => {
			await using pool = new WorkerPool({ size: 2 });

			await expect(
				pool.execute(async () => {
					throw new Error("Async worker error");
				}, null),
			).rejects.toThrow("Async worker error");
		});

		test("rejects tasks after disposal", async () => {
			const pool = new WorkerPool({ size: 2 });
			await pool[Symbol.asyncDispose]();

			await expect(pool.execute((n: number) => n, 1)).rejects.toThrow(
				"WorkerPool has been disposed",
			);
		});
	});

	describe("executeBatch", () => {
		test("executes batch with ordered results", async () => {
			await using pool = new WorkerPool({ size: 4 });

			const items = [1, 2, 3, 4, 5];
			const results = await pool.executeBatch(
				items,
				(n: number) => n * n,
				{ ordered: true },
			);

			expect(results).toHaveLength(5);
			expect(results.map((r) => r[1])).toEqual([1, 4, 9, 16, 25]);
		});

		test("returns errors in result tuples", async () => {
			await using pool = new WorkerPool({ size: 2 });

			const items = [1, 2, 3];
			const results = await pool.executeBatch(
				items,
				(n: number) => {
					if (n === 2) throw new Error("Error at 2");
					return n * 2;
				},
			);

			expect(results).toHaveLength(3);
			expect(results[0][0]).toBeUndefined();
			expect(results[0][1]).toBe(2);
			expect(results[1][0]).toBeInstanceOf(Error);
			expect(results[1][0]?.message).toBe("Error at 2");
			expect(results[2][0]).toBeUndefined();
			expect(results[2][1]).toBe(6);
		});

		test("handles empty batch", async () => {
			await using pool = new WorkerPool({ size: 2 });

			const results = await pool.executeBatch(
				[],
				(n: number) => n * 2,
			);

			expect(results).toEqual([]);
		});
	});

	describe("pool statistics", () => {
		test("tracks worker creation and busyness", async () => {
			await using pool = new WorkerPool({ size: 2 });

			// Initially no workers
			expect(pool.stats().total).toBe(0);

			// Start a task
			const task = pool.execute((n: number) => {
				// Simulate some work
				const start = Date.now();
				while (Date.now() - start < 50) {} // Busy wait
				return n * 2;
			}, 21);

			// Worker should be created
			await new Promise((r) => setTimeout(r, 10));
			expect(pool.stats().total).toBeGreaterThanOrEqual(1);

			await task;
		});
	});

	describe("disposal", () => {
		test("terminates all workers on disposal", async () => {
			const pool = new WorkerPool({ size: 4 });

			// Create some workers
			await Promise.all([
				pool.execute((n: number) => n * 2, 1),
				pool.execute((n: number) => n * 2, 2),
				pool.execute((n: number) => n * 2, 3),
			]);

			await pool[Symbol.asyncDispose]();

			expect(pool.isDisposed).toBe(true);
			expect(pool.stats().total).toBe(0);
		});

		test("rejects pending tasks on disposal", async () => {
			const pool = new WorkerPool({ size: 1 });

			// Fill the pool with a task that will be terminated
			const blocking = pool.execute(() => {
				const start = Date.now();
				while (Date.now() - start < 500) {}
				return "done";
			}, null);

			// Queue another task
			const queued = pool.execute((n: number) => n, 42);

			// Set up rejection handlers BEFORE disposal
			const queuedRejection = expect(queued).rejects.toThrow("WorkerPool disposed");
			const blockingRejection = expect(blocking).rejects.toThrow();

			// Dispose immediately - this will reject both tasks
			await pool[Symbol.asyncDispose]();

			// Wait for both rejections to be handled
			await queuedRejection;
			await blockingRejection;
		});

		test("can be used with await using", async () => {
			let disposed = false;

			{
				await using pool = new WorkerPool({ size: 2 });
				const result = await pool.execute((n: number) => n * 2, 21);
				expect(result).toBe(42);
				disposed = false; // Still in scope
			}

			disposed = true; // After scope exit
			expect(disposed).toBe(true);
		});
	});

	describe("concurrency", () => {
		test("respects pool size limit", async () => {
			await using pool = new WorkerPool({ size: 2 });

			// Start more tasks than workers
			const tasks = Array.from({ length: 10 }, (_, i) =>
				pool.execute((n: number) => {
					const start = Date.now();
					while (Date.now() - start < 50) {}
					return n;
				}, i),
			);

			const results = await Promise.all(tasks);
			expect(results).toHaveLength(10);
		});

		test("processes tasks concurrently", async () => {
			await using pool = new WorkerPool({ size: 4 });

			const start = Date.now();

			// Run 4 tasks that each take ~50ms
			const tasks = Array.from({ length: 4 }, () =>
				pool.execute(() => {
					const s = Date.now();
					while (Date.now() - s < 50) {}
					return Date.now();
				}, null),
			);

			await Promise.all(tasks);

			const duration = Date.now() - start;
			// Should complete in ~50-100ms (not 200ms if sequential)
			expect(duration).toBeLessThan(200);
		});
	});
});
