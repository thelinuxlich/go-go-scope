/**
 * Tests for benchmark() with worker threads
 */

import { describe, test, expect } from "vitest";
import { benchmark } from "../src/index.js";

describe("benchmark() with workers", () => {
	test("runs benchmark in worker thread", async () => {
		const result = await benchmark(
			"fibonacci",
			() => {
				// Self-contained Fibonacci computation
				function fib(n: number): number {
					return n < 2 ? n : fib(n - 1) + fib(n - 2);
				}
				fib(25);
			},
			{
				warmup: 10,
				iterations: 50,
				worker: true,
			},
		);

		expect(result.name).toBe("fibonacci");
		expect(result.iterations).toBeGreaterThanOrEqual(50);
		expect(result.totalDuration).toBeGreaterThan(0);
		expect(result.avgDuration).toBeGreaterThan(0);
		expect(result.opsPerSecond).toBeGreaterThan(0);
	});

	test("worker benchmark provides accurate timing", async () => {
		const result = await benchmark(
			"timing-test",
			() => {
				// Simple computation that takes some time
				let sum = 0;
				for (let i = 0; i < 100000; i++) {
					sum += Math.sqrt(i);
				}
			},
			{
				warmup: 5,
				iterations: 20,
				worker: true,
			},
		);

		// Verify timing stats are reasonable
		expect(result.minDuration).toBeGreaterThan(0);
		expect(result.maxDuration).toBeGreaterThanOrEqual(result.minDuration);
		expect(result.avgDuration).toBeGreaterThanOrEqual(result.minDuration);
		expect(result.avgDuration).toBeLessThanOrEqual(result.maxDuration);
	});

	test("worker benchmark does not block main thread", async () => {
		const start = Date.now();

		// Start worker benchmark
		const benchmarkPromise = benchmark(
			"non-blocking",
			() => {
				// CPU-intensive work
				let sum = 0;
				for (let i = 0; i < 1000000; i++) {
					sum += Math.sqrt(i);
				}
			},
			{
				warmup: 5,
				iterations: 30,
				worker: true,
			},
		);

		// Main thread should be responsive (this check runs immediately)
		const elapsedBefore = Date.now() - start;
		expect(elapsedBefore).toBeLessThan(100); // Should return immediately

		// Wait for benchmark to complete
		const result = await benchmarkPromise;
		expect(result.iterations).toBeGreaterThanOrEqual(30);
	});
});
