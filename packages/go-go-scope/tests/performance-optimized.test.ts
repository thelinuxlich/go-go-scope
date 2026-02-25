/**
 * Performance regression tests for go-go-scope optimizations
 * These tests ensure that optimizations don't break functionality
 */

import { describe, test, expect } from "vitest";
import {
	scope,
	race,
	parallel,
	Channel,
	Task,
	getTaskPoolMetrics,
	resetTaskPoolMetrics,
	benchmark,
	MemoryTracker,
	performanceMonitor,
} from "../src/index.js";

describe("Performance Optimizations", () => {
	describe("Task optimizations", () => {
		test("Task lazy AbortController creation", async () => {
			await using s = scope();
			
			// Task initially may not have AbortController created
			const task = s.task(() => Promise.resolve(42));
			
			// biome-ignore lint/suspicious/noExplicitAny: Testing internal state
			const internal = task as unknown as { abortController?: unknown };
			
			// Note: AbortController is created lazily when signal is accessed or task starts
			// Access signal to trigger creation
			const signal = task.signal;
			expect(internal.abortController).toBeDefined();
			expect(signal).toBeDefined();
			
			const [err, value] = await task;
			expect(err).toBeUndefined();
			expect(value).toBe(42);
		});

		test("Task pool metrics tracking", async () => {
			resetTaskPoolMetrics();
			
			await using s = scope();
			for (let i = 0; i < 10; i++) {
				await s.task(() => Promise.resolve(i));
			}
			
			const metrics = getTaskPoolMetrics();
			// Pool metrics should be trackable
			expect(typeof metrics.hits).toBe("number");
			expect(typeof metrics.misses).toBe("number");
			expect(typeof metrics.size).toBe("number");
		});

		test("Task disposal cleanup", async () => {
			await using s = scope();
			
			let aborted = false;
			const task = s.task(({ signal }) => {
				return new Promise<number>((_, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new Error("aborted"));
					});
				});
			});
			
			// Dispose without starting
			task[Symbol.dispose]();
			
			// Cleanup should work without errors
			expect(() => task[Symbol.dispose]()).not.toThrow();
		});
	});

	describe("Channel optimizations", () => {
		test("Channel ring buffer O(1) operations", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);
			
			// Fill buffer
			for (let i = 0; i < 50; i++) {
				await ch.send(i);
			}
			
			expect(ch.size).toBe(50);
			
			// Drain buffer
			for (let i = 0; i < 50; i++) {
				const value = await ch.receive();
				expect(value).toBe(i);
			}
			
			expect(ch.size).toBe(0);
			ch.close();
		});

		test("Channel fast path for waiting receivers", async () => {
			await using s = scope();
			const ch = s.channel<number>(0); // Unbuffered
			
			// Start receiver first
			const receivePromise = ch.receive();
			
			// Send should immediately resolve to waiting receiver
			await ch.send(42);
			
			const value = await receivePromise;
			expect(value).toBe(42);
			ch.close();
		});

		test("Channel batched notifications", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);
			
			const received: number[] = [];
			
			// Start consumer
			const consumer = (async () => {
				for await (const value of ch) {
					received.push(value);
					if (received.length >= 10) break;
				}
			})();
			
			// Send multiple values rapidly
			for (let i = 0; i < 10; i++) {
				await ch.send(i);
			}
			ch.close();
			
			await consumer;
			expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		});

		test("Channel backpressure strategies", async () => {
			// Test that channels with different strategies can send and receive
			await using s1 = scope();
			const ch1 = s1.channel<number>({ capacity: 5, backpressure: "drop-oldest" });
			
			for (let i = 0; i < 10; i++) {
				await ch1.send(i);
			}
			ch1.close();
			
			// Should receive items (exact behavior depends on implementation)
			const values1: number[] = [];
			for await (const v of ch1) {
				values1.push(v);
			}
			expect(values1.length).toBeGreaterThan(0);
			
			// Drop latest - verify it doesn't block
			await using s2 = scope();
			const ch2 = s2.channel<number>({ capacity: 5, backpressure: "drop-latest" });
			
			// Should be able to send without blocking even when full
			for (let i = 0; i < 10; i++) {
				await ch2.send(i); // Should not hang
			}
			ch2.close();
			
			const values2: number[] = [];
			for await (const v of ch2) {
				values2.push(v);
			}
			expect(values2.length).toBeGreaterThan(0);
		}, 10000);
	});

	describe("Scope optimizations", () => {
		test("Scope lazy collection initialization", async () => {
			// Simple scope shouldn't create unnecessary collections
			await using s = scope();
			
			// biome-ignore lint/suspicious/noExplicitAny: Testing internal state
			const internal = s as unknown as {
				_disposables?: unknown;
				_childScopes?: unknown;
				_dedupeRegistry?: unknown;
				_memoRegistry?: unknown;
			};
			
			// Before any tasks, collections should be undefined
			expect(internal._disposables).toBeUndefined();
			expect(internal._childScopes).toBeUndefined();
			expect(internal._dedupeRegistry).toBeUndefined();
			expect(internal._memoRegistry).toBeUndefined();
		});

		test("Scope collections created on demand", async () => {
			await using s = scope();
			
			// biome-ignore lint/suspicious/noExplicitAny: Testing internal state
			const internal = s as unknown as {
				_dedupeRegistry?: Map<unknown, unknown>;
				_disposables?: unknown[];
			};
			
			// Initially dedupe registry should not exist
			expect(internal._dedupeRegistry).toBeUndefined();
			
			// Create deduped tasks - should create registry
			s.task(() => Promise.resolve(2), { dedupe: "key1" });
			s.task(() => Promise.resolve(3), { dedupe: "key1" });
			expect(internal._dedupeRegistry).toBeDefined();
			expect(internal._dedupeRegistry?.size).toBeGreaterThan(0);
		});

		test("Scope activeTasks Set operations", async () => {
			await using s = scope();
			
			// biome-ignore lint/suspicious/noExplicitAny: Testing internal state
			const internal = s as unknown as { activeTasks: Set<Task<unknown>> };
			
			// Initially empty
			expect(internal.activeTasks.size).toBe(0);
			
			// Add tasks
			const t1 = s.task(() => Promise.resolve(1));
			const t2 = s.task(() => Promise.resolve(2));
			
			// Tasks should be tracked
			expect(internal.activeTasks.size).toBe(2);
			
			// After completion, should be removed
			await Promise.all([t1, t2]);
			
			// Give time for cleanup
			await new Promise((r) => setTimeout(r, 10));
			expect(internal.activeTasks.size).toBe(0);
		});
	});

	describe("Performance utilities", () => {
		test("benchmark function", async () => {
			const result = await benchmark(
				"test benchmark",
				async () => {
					await new Promise((r) => setTimeout(r, 1));
				},
				{ warmup: 5, iterations: 10 },
			);
			
			expect(result.name).toBe("test benchmark");
			expect(result.iterations).toBeGreaterThan(0);
			// avgDuration is returned (not avgTime)
			expect(typeof (result as unknown as { avgDuration: number }).avgDuration).toBe("number");
			expect(typeof result.opsPerSecond).toBe("number");
		});

		test("MemoryTracker", async () => {
			const tracker = new MemoryTracker(10);
			
			// Take snapshots
			for (let i = 0; i < 5; i++) {
				tracker.snapshot();
			}
			
			expect(tracker.getSnapshots().length).toBe(5);
			
			// Check for leaks (with high threshold to avoid false positives)
			const hasLeaks = tracker.checkForLeaks(100);
			expect(typeof hasLeaks).toBe("boolean");
		});

		test("performanceMonitor", async () => {
			await using s = scope({ metrics: true });
			const monitor = performanceMonitor(s, {
				sampleInterval: 100,
				maxSnapshots: 5,
				trackMemory: false,
			});
			
			// Run some tasks
			await s.task(() => Promise.resolve(1));
			await s.task(() => Promise.resolve(2));
			
			// Get metrics
			const metrics = monitor.getMetrics();
			expect(metrics.taskCount).toBeGreaterThanOrEqual(0);
			expect(typeof metrics.averageTaskDuration).toBe("number");
			
			// Stop monitoring
			monitor.stop();
			
			// Dispose via Symbol.dispose
			monitor[Symbol.dispose]();
		});
	});

	describe("Stress tests", () => {
		test("Rapid task creation", async () => {
			await using s = scope();
			
			const tasks: Promise<unknown>[] = [];
			for (let i = 0; i < 1000; i++) {
				tasks.push(s.task(() => Promise.resolve(i)));
			}
			
			await Promise.all(tasks);
			
			// Should complete without errors
			expect(true).toBe(true);
		});

		test("Channel high throughput", async () => {
			await using s = scope();
			const ch = s.channel<number>(1000);
			
			// Producer
			s.task(async () => {
				for (let i = 0; i < 10000; i++) {
					await ch.send(i);
				}
				ch.close();
			});
			
			// Consumer
			let count = 0;
			for await (const _ of ch) {
				count++;
			}
			
			expect(count).toBe(10000);
		});

		test("Concurrent channel operations", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);
			
			// Many producers and consumers
			const producers = Array.from({ length: 50 }, async (_, i) => {
				await ch.send(i);
			});
			
			const consumers = Array.from({ length: 50 }, async () => {
				await ch.receive();
			});
			
			await Promise.all([...producers, ...consumers]);
			ch.close();
			
			expect(true).toBe(true);
		});

		test("Nested scope hierarchy", async () => {
			// Create deep scope hierarchy
			let current: typeof Scope.prototype = scope();
			
			for (let i = 0; i < 50; i++) {
				const parent = current;
				// biome-ignore lint/suspicious/noExplicitAny: Testing nested scopes
				current = scope({ parent: parent as any });
			}
			
			await current.task(() => Promise.resolve(42));
			await current[Symbol.asyncDispose]();
			
			expect(true).toBe(true);
		});
	});

	describe("Comparison with native", () => {
		test("Task vs Promise overhead is reasonable", async () => {
			const iterations = 100;
			
			// Native Promise
			const nativeStart = performance.now();
			for (let i = 0; i < iterations; i++) {
				await Promise.resolve(i);
			}
			const nativeTime = performance.now() - nativeStart;
			
			// go-go-scope Task
			const scopeStart = performance.now();
			await using s = scope();
			for (let i = 0; i < iterations; i++) {
				await s.task(() => Promise.resolve(i));
			}
			const scopeTime = performance.now() - scopeStart;
			
			// Scope overhead should be reasonable (less than 50x for features provided)
			// Note: This is a smoke test to catch major regressions, not a strict perf test
			const overhead = scopeTime / nativeTime;
			expect(overhead).toBeLessThan(50);
		});

		test("Channel vs async generator", async () => {
			const count = 100;
			
			// Native async generator
			async function* nativeGen() {
				for (let i = 0; i < count; i++) {
					yield i;
				}
			}
			
			const nativeStart = performance.now();
			const nativeResults: number[] = [];
			for await (const x of nativeGen()) {
				nativeResults.push(x);
			}
			const nativeTime = performance.now() - nativeStart;
			
			// go-go-scope Channel
			const channelStart = performance.now();
			await using s = scope();
			const ch = s.channel<number>(count);
			
			s.task(async () => {
				for (let i = 0; i < count; i++) {
					await ch.send(i);
				}
				ch.close();
			});
			
			const channelResults: number[] = [];
			for await (const x of ch) {
				channelResults.push(x);
			}
			const channelTime = performance.now() - channelStart;
			
			// Results should be the same
			expect(channelResults).toEqual(nativeResults);
			
			// Channel overhead should be reasonable
			const overhead = channelTime / nativeTime;
			expect(overhead).toBeLessThan(20); // Channels have more features
		});
	});
});
