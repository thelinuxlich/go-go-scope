/**
 * Memory leak detection tests
 * Verifies that scopes properly clean up resources and don't leak memory
 */

import { describe, test, expect } from "vitest";
import { scope } from "../src/index.js";

// Helper to force garbage collection if available
function forceGC(): void {
	if (global.gc) {
		global.gc();
	}
}

// Helper to get memory usage in MB
function getMemoryMB(): number {
	const usage = process.memoryUsage();
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

describe("memory leak detection", () => {
	test("no memory leak after 10,000 scope operations", async () => {
		// Take initial memory reading
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Run 10,000 scope operations
		for (let i = 0; i < 10000; i++) {
			await using s = scope();
			await s.task(() => Promise.resolve(i));
		}

		// Force GC and wait for cleanup
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		// Memory should not have grown significantly (allow 50MB buffer)
		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with concurrent scopes", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create many concurrent scopes
		const scopes = Array.from({ length: 1000 }, () => scope());

		// Use them
		await Promise.all(
			scopes.map(async (s) => {
				await s.task(() => Promise.resolve(Math.random()));
			}),
		);

		// Dispose all
		await Promise.all(
			scopes.map((s) => s[Symbol.asyncDispose]()),
		);

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with channels", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create and use many channels
		for (let i = 0; i < 1000; i++) {
			await using s = scope();
			const ch = s.channel<number>(100);

			// Send some data
			for (let j = 0; j < 10; j++) {
				await ch.send(j);
			}
			ch.close();

			// Consume
			const received: number[] = [];
			for await (const val of ch) {
				received.push(val);
			}
		}

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with task references", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create scopes with many tasks
		for (let i = 0; i < 1000; i++) {
			await using s = scope();

			// Create multiple tasks
			const tasks = Array.from({ length: 10 }, (_, j) =>
				s.task(() => Promise.resolve(j)),
			);

			await Promise.all(tasks);
		}

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with error handling", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create scopes with error-throwing tasks
		for (let i = 0; i < 1000; i++) {
			await using s = scope();

			const tasks = Array.from({ length: 5 }, () =>
				s.task(async () => {
					if (Math.random() > 0.5) {
						throw new Error("Random error");
					}
					return Promise.resolve("success");
				}),
			);

			await Promise.all(tasks);
		}

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with parent-child scopes", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create nested scope hierarchies
		for (let i = 0; i < 500; i++) {
			await using parent = scope();

			for (let j = 0; j < 5; j++) {
				await using child = scope({ parent });
				await child.task(() => Promise.resolve(j));
			}
		}

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);

	test("no memory leak with services", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const initialMemory = getMemoryMB();

		// Create scopes with services
		for (let i = 0; i < 1000; i++) {
			await using s = scope()
				.provide("db", () => ({ query: () => Promise.resolve([]) }))
				.provide("cache", () => ({ get: () => Promise.resolve(null) }));

			await s.task(async ({ services }) => {
				return Promise.resolve(services);
			});
		}

		forceGC();
		await new Promise((r) => setTimeout(r, 100));
		const finalMemory = getMemoryMB();

		const memoryGrowth = finalMemory - initialMemory;
		console.log(`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`);

		expect(memoryGrowth).toBeLessThan(50);
	}, 30000);
});
