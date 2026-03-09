import { describe, expect, test, vi } from "vitest";
import {
	PriorityChannel,
	Scope,
	scope,
} from "go-go-scope";
import {
	assertRejects,
	assertResolves,
	assertResolvesWithin,
	createMockScope,
	expectTask,
// @ts-expect-error - Testing package not built yet during development
} from "../../testing/src/index.js";

describe("v2.3.0 Features", () => {
	describe("Child Loggers per Task", () => {
		test("task receives logger in context", async () => {
			await using s = scope({ logLevel: "debug" });
			const logs: string[] = [];

			const mockLogger = {
				debug: vi.fn((msg: string) => logs.push(msg)),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			// Override the scope's logger
			(s as unknown as { logger: typeof mockLogger }).logger = mockLogger;

			await s.task(async ({ logger }) => {
				logger.debug("task executing");
				return "done";
			});

			expect(logs.some((log) => log.includes("task executing"))).toBe(true);
		});

		test("child logger includes task context", async () => {
			await using s = scope({ name: "test-scope", logLevel: "debug" });
			const logs: Array<{ level: string; message: string }> = [];

			const mockLogger = {
				debug: vi.fn((msg: string) => logs.push({ level: "debug", message: msg })),
				info: vi.fn((msg: string) => logs.push({ level: "info", message: msg })),
				warn: vi.fn(),
				error: vi.fn(),
			};

			(s as unknown as { logger: typeof mockLogger }).logger = mockLogger;

			await s.task(
				async ({ logger }) => {
					logger.info("hello from task");
					return "done";
				},
				{ id: "my-task" },
			);

			const logEntry = logs.find((l) => l.message.includes("hello from task"));
			expect(logEntry).toBeDefined();
			expect(logEntry?.message).toContain("test-scope");
			expect(logEntry?.message).toContain("my-task");
		});
	});

	describe("Request Context Propagation", () => {
		test("context is accessible in task", async () => {
			await using s = scope({
				context: { requestId: "abc-123", userId: "user-456" },
			});

			const [err, result] = await s.task(async ({ context }) => {
				return {
					requestId: context.requestId,
					userId: context.userId,
				};
			});

			expect(err).toBeUndefined();
			expect(result).toEqual({ requestId: "abc-123", userId: "user-456" });
		});

		test("context is inherited from parent scope", async () => {
			await using parent = scope({
				context: { requestId: "parent-123" },
			});

			await using child = scope({
				parent: parent as unknown as Scope<Record<string, never>>,
				context: { userId: "user-789" },
			});

			const [err, result] = await child.task(async ({ context }) => {
				return {
					requestId: context.requestId,
					userId: context.userId,
				};
			});

			expect(err).toBeUndefined();
			expect(result).toEqual({
				requestId: "parent-123",
				userId: "user-789",
			});
		});

		test("child context overrides parent context", async () => {
			await using parent = scope({
				context: { requestId: "parent-123", shared: "parent-value" },
			});

			await using child = scope({
				parent: parent as unknown as Scope<Record<string, never>>,
				context: { requestId: "child-456" },
			});

			const [err, result] = await child.task(async ({ context }) => {
				return {
					requestId: context.requestId,
					shared: context.shared,
				};
			});

			expect(err).toBeUndefined();
			expect(result).toEqual({
				requestId: "child-456",
				shared: "parent-value",
			});
		});

		test("context is accessible on scope directly", async () => {
			await using s = scope({
				context: { key: "value" },
			});

			expect(s.requestContext.key).toBe("value");
		});
	});

	describe("Priority Channel", () => {
		test("delivers items in priority order", async () => {
			const pq = new PriorityChannel<number>({
				capacity: 10,
				comparator: (a, b) => a - b,
			});

			await pq.send(5);
			await pq.send(1);
			await pq.send(3);
			await pq.send(2);

			expect(await pq.receive()).toBe(1);
			expect(await pq.receive()).toBe(2);
			expect(await pq.receive()).toBe(3);
			expect(await pq.receive()).toBe(5);
		});

		test("trySend returns false when full", () => {
			const pq = new PriorityChannel<string>({
				capacity: 2,
				comparator: (a, b) => a.localeCompare(b),
			});

			expect(pq.trySend("a")).toBe(true);
			expect(pq.trySend("b")).toBe(true);
			expect(pq.trySend("c")).toBe(false);
		});

		test("tryReceive returns undefined when empty", () => {
			const pq = new PriorityChannel<number>({
				capacity: 10,
				comparator: (a, b) => a - b,
			});

			expect(pq.tryReceive()).toBeUndefined();
		});

		test("sendOrDrop drops value when full", async () => {
			const dropped: string[] = [];
			const pq = new PriorityChannel<string>({
				capacity: 2,
				comparator: (a, b) => a.localeCompare(b),
				onDrop: (value) => dropped.push(value),
			});

			await pq.send("a");
			await pq.send("b");
			pq.sendOrDrop("c");

			expect(dropped).toContain("c");
			expect(pq.size).toBe(2);
		});

		test("peek returns highest priority without removing", async () => {
			const pq = new PriorityChannel<number>({
				capacity: 10,
				comparator: (a, b) => a - b,
			});

			await pq.send(5);
			await pq.send(1);
			await pq.send(3);

			expect(pq.peek()).toBe(1);
			expect(pq.size).toBe(3);
			expect(await pq.receive()).toBe(1);
		});

		test("async iteration works", async () => {
			const pq = new PriorityChannel<number>({
				capacity: 10,
				comparator: (a, b) => a - b,
			});

			await pq.send(3);
			await pq.send(1);
			await pq.send(2);
			pq.close();

			const results: number[] = [];
			for await (const value of pq) {
				results.push(value);
			}

			expect(results).toEqual([1, 2, 3]);
		});

		test("returns undefined when closed and empty", async () => {
			const pq = new PriorityChannel<number>({
				capacity: 10,
				comparator: (a, b) => a - b,
			});

			await pq.send(1);
			pq.close();

			expect(await pq.receive()).toBe(1);
			expect(await pq.receive()).toBeUndefined();
		});
	});

	describe("Task Assertion Helpers", () => {
		test("expectTask toResolve passes when task succeeds", async () => {
			await using s = scope();

			await expectTask(s.task(async () => "success")).toResolve();
		});

		test("expectTask toResolve fails when task errors", async () => {
			await using s = scope();

			await expect(
				expectTask(
					s.task(async () => {
						throw new Error("fail");
					}),
				).toResolve(),
			).rejects.toThrow("Expected task to resolve");
		});

		test("expectTask toResolveWith checks value", async () => {
			await using s = scope();

			await expectTask(s.task(async () => "expected")).toResolveWith("expected");

			await expect(
				expectTask(s.task(async () => "wrong")).toResolveWith("expected"),
			).rejects.toThrow('Expected task to resolve with "expected"');
		});

		test("expectTask toReject passes when task fails", async () => {
			await using s = scope();

			await expectTask(
				s.task(async () => {
					throw new Error("fail");
				}),
			).toReject();
		});

		test("expectTask toRejectWith checks message", async () => {
			await using s = scope();

			await expectTask(
				s.task(async () => {
					throw new Error("specific error");
				}),
			).toRejectWith("specific error");

			await expect(
				expectTask(
					s.task(async () => {
						throw new Error("other error");
					}),
				).toRejectWith("specific error"),
			).rejects.toThrow('Expected error message "specific error"');
		});

		test("expectTask toRejectWith supports regex", async () => {
			await using s = scope();

			await expectTask(
				s.task(async () => {
					throw new Error("error code: 12345");
				}),
			).toRejectWith(/error code: \d+/);
		});

		test("expectTask toResolveWithin checks timeout", async () => {
			await using s = scope();

			// Fast task should pass
			await expectTask(s.task(async () => "fast")).toResolveWithin(1000);

			// Slow task should fail
			const slowTask = s.task(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return "slow";
			});
			
			await expect(
				expectTask(slowTask).toResolveWithin(10).toResolve()
			).rejects.toThrow("did not resolve within");
		});

		test("assertResolves returns result on success", async () => {
			await using s = scope();

			const result = await assertResolves(s.task(async () => "success"));
			expect(result[1]).toBe("success");
		});

		test("assertResolves throws on error", async () => {
			await using s = scope();

			await expect(
				assertResolves(
					s.task(async () => {
						throw new Error("fail");
					}),
				),
			).rejects.toThrow("Expected task to resolve");
		});

		test("assertRejects returns error on failure", async () => {
			await using s = scope();

			const err = await assertRejects(
				s.task(async () => {
					throw new Error("expected error");
				}),
			);
			expect(err.message).toBe("expected error");
		});

		test("assertRejects throws on success", async () => {
			await using s = scope();

			await expect(assertRejects(s.task(async () => "success"))).rejects.toThrow(
				"Expected task to reject",
			);
		});

		test("assertResolvesWithin throws on timeout", async () => {
			await using s = scope();

			await expect(
				assertResolvesWithin(
					s.task(async () => {
						await new Promise((resolve) => setTimeout(resolve, 100));
						return "slow";
					}),
					10,
				),
			).rejects.toThrow("did not resolve within");
		});
	});

	describe("Token Bucket Rate Limiter", () => {
		test("creates local token bucket", async () => {
			await using s = scope();
			const bucket = s.tokenBucket({
				capacity: 10,
				refillRate: 1,
			});

			expect(bucket).toBeDefined();
			const state = await bucket.getState();
			expect(state.capacity).toBe(10);
			expect(state.refillRate).toBe(1);
		});

		test("tryConsume returns true when tokens available", async () => {
			await using s = scope();
			const bucket = s.tokenBucket({
				capacity: 5,
				refillRate: 1,
				initialTokens: 5,
			});

			expect(await bucket.tryConsume(1)).toBe(true);
			expect(await bucket.tryConsume(3)).toBe(true);
			expect(await bucket.tryConsume(2)).toBe(false); // Only 1 left
		});

		test("acquire executes function when tokens available", async () => {
			await using s = scope();
			const bucket = s.tokenBucket({
				capacity: 5,
				refillRate: 1,
				initialTokens: 5,
			});

			const result = await bucket.acquire(1, async () => "executed");
			expect(result).toBe("executed");
		});

		test("reset restores bucket to full capacity", async () => {
			await using s = scope();
			const bucket = s.tokenBucket({
				capacity: 10,
				refillRate: 1,
				initialTokens: 5,
			});

			await bucket.tryConsume(3);
			let state = await bucket.getState();
			expect(state.tokens).toBe(2);

			await bucket.reset();
			state = await bucket.getState();
			expect(state.tokens).toBe(10);
		});

		test("throws if cache provided without key", async () => {
			await using s = scope();
			expect(() =>
				s.tokenBucket({
					capacity: 10,
					refillRate: 1,
					cache: {} as unknown as import("go-go-scope").CacheProvider,
				}),
			).toThrow("key is required when using cache");
		});
	});

	describe("Semaphore Improvements", () => {
		test("tryAcquire returns true when permit available", async () => {
			await using s = scope();
			const sem = s.semaphore(1);

			expect(sem.tryAcquire()).toBe(true);
			expect(sem.tryAcquire()).toBe(false);

			// Release and try again
			sem.release();
			expect(sem.tryAcquire()).toBe(true);
		});

		test("tryAcquireWithFn executes when permit available", async () => {
			await using s = scope();
			const sem = s.semaphore(1);

			const result = await sem.tryAcquireWithFn(async () => "executed");
			expect(result).toBe("executed");

			// Acquire first, then try should fail
			sem.tryAcquire();
			const result2 = await sem.tryAcquireWithFn(async () => "executed");
			expect(result2).toBeUndefined();
		});

		test("acquireWithTimeout returns true within timeout", async () => {
			await using s = scope();
			const sem = s.semaphore(1);

			const acquired = await sem.acquireWithTimeout(100);
			expect(acquired).toBe(true);
		});

		test("acquireWithTimeout returns false when timeout reached", async () => {
			await using s = scope();
			const sem = s.semaphore(1);

			// Take the only permit
			sem.tryAcquire();

			// Try to acquire with short timeout
			const acquired = await sem.acquireWithTimeout(10);
			expect(acquired).toBe(false);
		});

		test("acquireWithTimeoutAndFn executes when acquired", async () => {
			await using s = scope();
			const sem = s.semaphore(1);

			const result = await sem.acquireWithTimeoutAndFn(100, async () => "executed");
			expect(result).toBe("executed");
		});

		test("bulkAcquire acquires multiple permits", async () => {
			await using s = scope();
			const sem = s.semaphore(5);

			// Check initial state
			expect(sem.available).toBe(5);

			const result = await sem.bulkAcquire(3, async () => {
				// Inside the function, permits should be reduced
				expect(sem.available).toBe(2); // 5 - 3 = 2
				return "executed";
			});
			expect(result).toBe("executed");

			// After bulkAcquire completes, permits are released
			expect(sem.available).toBe(5);
		});

		test("tryBulkAcquire returns true when permits available", async () => {
			await using s = scope();
			const sem = s.semaphore(5);

			expect(sem.tryBulkAcquire(3)).toBe(true);
			expect(sem.available).toBe(2);

			expect(sem.tryBulkAcquire(3)).toBe(false); // Only 2 left

			// Release the acquired permits
			sem.release();
			sem.release();
			sem.release();
			expect(sem.available).toBe(5);
		});

		test("throws on invalid bulk acquire count", async () => {
			await using s = scope();
			const sem = s.semaphore(5);

			expect(() => sem.tryBulkAcquire(0)).toThrow("count must be positive");
			expect(sem.tryBulkAcquire(10)).toBe(false); // Exceeds capacity
		});
	});

	describe("Graceful Shutdown Helper", () => {
		test("gracefulShutdown option creates controller", async () => {
			await using s = scope({
				gracefulShutdown: {
					signals: [], // Don't register actual signals in test
					exit: false,
				},
			});

			expect(s._shutdownController).toBeDefined();
			expect(s.isShutdownRequested).toBe(false);
		});

		test("isShutdownRequested returns true after manual shutdown", async () => {
			await using s = scope({
				gracefulShutdown: {
					signals: [],
					exit: false,
				},
			});

			expect(s.isShutdownRequested).toBe(false);
			await s._shutdownController?.shutdown();
			expect(s.isShutdownRequested).toBe(true);
		});

		test("onShutdown callback is called during shutdown", async () => {
			let callbackCalled = false;
			await using s = scope({
				gracefulShutdown: {
					signals: [],
					exit: false,
					onShutdown: async () => {
						callbackCalled = true;
					},
				},
			});

			await s._shutdownController?.shutdown();
			expect(callbackCalled).toBe(true);
		});

		test("onComplete callback is called after shutdown", async () => {
			let callbackCalled = false;
			await using s = scope({
				gracefulShutdown: {
					signals: [],
					exit: false,
					onComplete: async () => {
						callbackCalled = true;
					},
				},
			});

			await s._shutdownController?.shutdown();
			expect(callbackCalled).toBe(true);
		});

		test("scope has isShutdownRequested property", async () => {
			await using s = scope({
				gracefulShutdown: {
					signals: [],
					exit: false,
				},
			});

			expect(s.isShutdownRequested).toBe(false);
		});
	});
});
