import { describe, expect, test } from "vitest";
import { poll, Semaphore, scope, stream } from "../src/index.js";

describe("Channel", () => {
	test("basic send and receive", async () => {
		await using s = scope();
		const ch = s.channel<string>(10);

		await ch.send("hello");
		await ch.send("world");

		expect(await ch.receive()).toBe("hello");
		expect(await ch.receive()).toBe("world");
	});

	test("async iterator works", async () => {
		await using s = scope();
		const ch = s.channel<number>(5);

		// Producer
		s.task(async () => {
			for (let i = 1; i <= 3; i++) {
				await ch.send(i);
			}
			ch.close();
		});

		// Consumer via async iterator
		const received: number[] = [];
		for await (const value of ch) {
			received.push(value);
		}

		expect(received).toEqual([1, 2, 3]);
	});

	test("backpressure when buffer full", async () => {
		await using s = scope();
		const ch = s.channel<string>(2); // Small buffer

		// Fill buffer
		await ch.send("a");
		await ch.send("b");

		// Third send should block until we receive
		let thirdSendResolved = false;
		const thirdSend = ch.send("c").then(() => {
			thirdSendResolved = true;
		});

		// Give it a moment to start blocking
		await new Promise((r) => setTimeout(r, 10));
		expect(thirdSendResolved).toBe(false);

		// Receive one, should unblock third send
		await ch.receive();
		await thirdSend;
		expect(thirdSendResolved).toBe(true);
	});

	test("multiple producers and consumers", async () => {
		await using s = scope();
		const ch = s.channel<number>(10);

		// 3 producers
		const producers = [1, 2, 3].map((id) =>
			s.task(async () => {
				for (let i = 0; i < 5; i++) {
					await ch.send(id * 10 + i);
				}
			}),
		);

		// Collect all values
		const received: number[] = [];
		s.task(async () => {
			await Promise.all(producers);
			ch.close();
		});

		for await (const value of ch) {
			received.push(value);
		}

		expect(received).toHaveLength(15);
		expect(new Set(received).size).toBe(15); // All unique
	});

	test("cancels when scope disposed", async () => {
		const s = scope();
		const ch = s.channel<string>(5);

		// Start a blocking receive
		const receivePromise = ch.receive();

		// Dispose scope
		await s[Symbol.asyncDispose]();

		// Receive should resolve with undefined (channel closed)
		const result = await receivePromise;
		expect(result).toBeUndefined();
	});

	test("close prevents further sends", async () => {
		await using s = scope();
		const ch = s.channel<string>(5);

		await ch.send("before");
		ch.close();

		// Send after close should return false
		const result = await ch.send("after");
		expect(result).toBe(false);

		// Can still receive buffered items
		expect(await ch.receive()).toBe("before");

		// Then receive undefined
		expect(await ch.receive()).toBeUndefined();
	});

	test("size and capacity properties", async () => {
		await using s = scope();
		const ch = s.channel<string>(5);

		expect(ch.cap).toBe(5);
		expect(ch.size).toBe(0);

		await ch.send("a");
		expect(ch.size).toBe(1);

		await ch.send("b");
		expect(ch.size).toBe(2);

		await ch.receive();
		expect(ch.size).toBe(1);
	});
});

describe("Semaphore", () => {
	test("basic acquire and release", async () => {
		const sem = new Semaphore(1);

		let acquired = false;
		await sem.acquire(async () => {
			acquired = true;
		});

		expect(acquired).toBe(true);
		expect(sem.available).toBe(1);
	});

	test("limits concurrent access", async () => {
		const sem = new Semaphore(2);
		await using s = scope();

		let concurrent = 0;
		let maxConcurrent = 0;

		await s.parallel(
			[1, 2, 3, 4].map(
				() => () =>
					sem.acquire(async () => {
						concurrent++;
						maxConcurrent = Math.max(maxConcurrent, concurrent);
						await new Promise((r) => setTimeout(r, 20));
						concurrent--;
					}),
			),
		);

		expect(maxConcurrent).toBe(2);
	});

	test("releases permit on error", async () => {
		const sem = new Semaphore(1);

		await expect(
			sem.acquire(async () => {
				throw new Error("fail");
			}),
		).rejects.toThrow("fail");

		// Permit should be released
		expect(sem.available).toBe(1);

		// Should be able to acquire again
		await sem.acquire(async () => {
			expect(true).toBe(true);
		});
	});

	test("cancels waiting acquirers on dispose", async () => {
		const sem = new Semaphore(1);

		// Acquire the only permit and hold it
		let released = false;
		void sem.acquire(async () => {
			// Hold until explicitly told to release
			while (!released) {
				await new Promise((r) => setTimeout(r, 10));
			}
		});

		// Give time for permit to be acquired
		await new Promise((r) => setTimeout(r, 10));

		// This should wait for the permit
		const waitingAcquire = sem.acquire(async () => {
			return "should not reach";
		});

		// Give it time to start waiting
		await new Promise((r) => setTimeout(r, 10));

		// Dispose semaphore
		await sem[Symbol.asyncDispose]();

		// Waiting acquire should reject
		await expect(waitingAcquire).rejects.toThrow();

		// Release the holding acquire so it can complete
		released = true;
		// It may complete or reject depending on timing - just don't await it
	});

	test("available and waiting properties", async () => {
		const sem = new Semaphore(3);

		expect(sem.available).toBe(3);
		expect(sem.waiting).toBe(0);
		expect(sem.totalPermits).toBe(3);
	});
});

describe("CircuitBreaker", () => {
	test("scope-level circuit breaker opens after threshold failures", async () => {
		await using s = scope({ circuitBreaker: { failureThreshold: 3 } });

		// Fail 3 times
		for (let i = 0; i < 3; i++) {
			const [err] = await s.task(() => Promise.reject(new Error("fail")));
			expect(err).toBeInstanceOf(Error);
		}

		// Next request should be rejected immediately by circuit breaker
		const [err] = await s.task(() => Promise.resolve("success"));
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("Circuit breaker is open");
	});

	test("circuit breaker allows successful requests when closed", async () => {
		await using s = scope({ circuitBreaker: { failureThreshold: 3 } });

		const [err, result] = await s.task(() => Promise.resolve("success"));
		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("circuit breaker becomes half-open after reset timeout", async () => {
		await using s = scope({
			circuitBreaker: { failureThreshold: 2, resetTimeout: 50 },
		});

		// Open the circuit
		const [err1] = await s.task(() => Promise.reject(new Error("fail1")));
		expect(err1).toBeInstanceOf(Error);
		const [err2] = await s.task(() => Promise.reject(new Error("fail2")));
		expect(err2).toBeInstanceOf(Error);

		// Circuit should be open
		const [err3] = await s.task(() => Promise.resolve("test"));
		expect(err3).toBeInstanceOf(Error);
		expect((err3 as Error).message).toBe("Circuit breaker is open");

		// Wait for reset timeout
		await new Promise((r) => setTimeout(r, 60));

		// Should be half-open now - one request allowed through
		const [err4, result] = await s.task(() => Promise.resolve("success"));
		expect(err4).toBeUndefined();
		expect(result).toBe("success");
	});

	test("circuit breaker resets failure count on success", async () => {
		await using s = scope({ circuitBreaker: { failureThreshold: 5 } });

		// Some failures but not enough to open
		const [err1] = await s.task(() => Promise.reject(new Error("fail")));
		expect(err1).toBeInstanceOf(Error);
		const [err2] = await s.task(() => Promise.reject(new Error("fail")));
		expect(err2).toBeInstanceOf(Error);

		// Success should reset failure count
		const [err3, result] = await s.task(() => Promise.resolve("success"));
		expect(err3).toBeUndefined();
		expect(result).toBe("success");

		// Would need 5 more failures to open now
		const [err4, result2] = await s.task(() => Promise.resolve("still closed"));
		expect(err4).toBeUndefined();
		expect(result2).toBe("still closed");
	});

	test("circuit breaker with fallback pattern", async () => {
		await using s = scope({ circuitBreaker: { failureThreshold: 2 } });

		let failures = 0;

		// Try to fetch with circuit breaker
		async function fetchWithFallback(): Promise<string> {
			const [err, result] = await s.task(async () => {
				if (failures < 3) {
					failures++;
					throw new Error("service down");
				}
				return "success";
			});
			if (err) {
				// Circuit open or error - use fallback
				return "fallback";
			}
			return result as string;
		}

		// First 2 calls fail but circuit is still closed
		expect(await fetchWithFallback()).toBe("fallback");
		expect(await fetchWithFallback()).toBe("fallback");

		// Circuit is now open - subsequent calls immediately use fallback
		expect(await fetchWithFallback()).toBe("fallback");
	});
});

describe("stream", () => {
	async function* testSource() {
		yield 1;
		yield 2;
		yield 3;
	}

	test("iterates all values", async () => {
		const results: number[] = [];

		for await (const value of stream(testSource())) {
			results.push(value);
		}

		expect(results).toEqual([1, 2, 3]);
	});

	test("stops on abort signal", async () => {
		const controller = new AbortController();
		const results: number[] = [];

		// Create a slow stream
		async function* slowSource() {
			for (let i = 1; i <= 10; i++) {
				await new Promise((r) => setTimeout(r, 20));
				yield i;
			}
		}

		// Start iterating
		const iteratePromise = (async () => {
			for await (const value of stream(slowSource(), controller.signal)) {
				results.push(value);
			}
		})();

		// Abort after 50ms
		await new Promise((r) => setTimeout(r, 50));
		controller.abort("cancelled");

		await expect(iteratePromise).rejects.toThrow("cancelled");
		expect(results.length).toBeLessThan(10);
	});

	test("cleans up iterator on break", async () => {
		let cleanedUp = false;

		async function* sourceWithCleanup() {
			try {
				yield 1;
				yield 2;
				yield 3;
			} finally {
				cleanedUp = true;
			}
		}

		for await (const value of stream(sourceWithCleanup())) {
			if (value === 2) break;
		}

		expect(cleanedUp).toBe(true);
	});

	test("scope.stream method works", async () => {
		await using s = scope();

		async function* source() {
			yield "a";
			yield "b";
			yield "c";
		}

		const results: string[] = [];
		for await (const value of s.stream(source())) {
			results.push(value);
		}

		expect(results).toEqual(["a", "b", "c"]);
	});
});

describe("poll", () => {
	test("calls function at interval", async () => {
		const results: number[] = [];
		let counter = 0;

		void poll(
			() => Promise.resolve(++counter),
			(value) => {
				results.push(value);
			},
			{ interval: 50, immediate: true },
		);

		// Let it run for ~150ms
		await new Promise((r) => setTimeout(r, 170));

		// Cancel it
		const controller = new AbortController();
		controller.abort();

		// Should have been called ~3 times
		expect(results.length).toBeGreaterThanOrEqual(2);
		expect(results.length).toBeLessThanOrEqual(4);
	});

	test("respects immediate option", async () => {
		const results: string[] = [];
		const controller = new AbortController();

		// immediate: false - should wait for first interval
		const pollController = poll<string>(
			() => Promise.resolve("value"),
			() => {
				results.push("called");
			},
			{ interval: 100, immediate: false, signal: controller.signal },
		);

		// Check after 50ms - should not have been called yet
		await new Promise((r) => setTimeout(r, 50));
		expect(results.length).toBe(0);
		expect(pollController.status().pollCount).toBe(0);

		// Cancel
		controller.abort();
	});

	test("continues on error", async () => {
		const results: string[] = [];
		let calls = 0;

		const controller = poll<string>(
			async () => {
				calls++;
				if (calls === 1) throw new Error("fail");
				return "success";
			},
			(value) => {
				results.push(value);
			},
			{ interval: 50, immediate: true },
		);

		// Let it run for ~120ms
		await new Promise((r) => setTimeout(r, 120));

		// Stop
		controller.stop();

		// Should have continued despite error
		expect(calls).toBeGreaterThanOrEqual(2);
		expect(controller.status().pollCount).toBeGreaterThanOrEqual(2);
	});

	test("respects abort signal", async () => {
		const controller = new AbortController();
		const results: string[] = [];

		// Start with aborted controller - should not create or should be stopped
		controller.abort("stopped");

		expect(() => {
			poll<string>(
				() => Promise.resolve("value"),
				() => {
					results.push("called");
				},
				{ interval: 1000, signal: controller.signal },
			);
		}).toThrow("stopped");

		expect(results.length).toBe(0);
	});

	test("scope.poll method works", async () => {
		await using s = scope();

		const results: number[] = [];
		let counter = 0;

		// Start polling
		const controller = s.poll(
			() => Promise.resolve(++counter),
			(value) => {
				results.push(value);
			},
			{ interval: 50, immediate: true },
		);

		// Let it run
		await new Promise((r) => setTimeout(r, 120));

		// Should have some results
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(controller.status().running).toBe(true);
		expect(controller.status().pollCount).toBeGreaterThanOrEqual(1);
	});

	test("poll controller start/stop/status", async () => {
		const results: string[] = [];

		const controller = poll<string>(
			() => Promise.resolve("value"),
			(value) => {
				results.push(value);
			},
			{ interval: 100, immediate: false }, // Don't auto-start
		);

		// Initially not running
		expect(controller.status().running).toBe(false);
		expect(controller.status().pollCount).toBe(0);

		// Start
		controller.start();
		expect(controller.status().running).toBe(true);

		// Let it run
		await new Promise((r) => setTimeout(r, 150));
		expect(controller.status().pollCount).toBeGreaterThanOrEqual(1);

		// Stop
		controller.stop();
		expect(controller.status().running).toBe(false);

		// Check time until next (should be 0 when stopped)
		expect(controller.status().timeUntilNext).toBe(0);
	});
});

describe("Integration: Real-world scenarios", () => {
	test("log aggregation with channels", async () => {
		await using s = scope();

		// Channel for log entries
		const logChannel = s.channel<string>(100);
		const processedLogs: string[] = [];

		// Simulate 3 WebSocket producers
		const producers = [1, 2, 3].map((id) =>
			s.task(async () => {
				for (let i = 0; i < 5; i++) {
					await logChannel.send(`server${id}-log${i}`);
				}
			}),
		);

		// Batch processor consumer
		const consumer = s.task(async () => {
			const batch: string[] = [];

			for await (const log of logChannel) {
				batch.push(log);

				// Process batch of 3
				if (batch.length >= 3) {
					processedLogs.push(...batch);
					batch.length = 0;
				}
			}

			// Process remaining
			if (batch.length > 0) {
				processedLogs.push(...batch);
			}
		});

		// Close channel when all producers done
		s.task(async () => {
			await Promise.all(producers);
			logChannel.close();
		});

		const [err] = await consumer;
		expect(err).toBeUndefined();

		expect(processedLogs.length).toBe(15);
	});

	test("scope concurrency limits concurrent tasks", async () => {
		// Scope with concurrency limit of 2
		await using s = scope({ concurrency: 2 });

		let concurrent = 0;
		let maxConcurrent = 0;
		const results: number[] = [];

		// Spawn 5 tasks, but only 2 should run concurrently
		const tasks = Array.from({ length: 5 }, (_, i) =>
			s.task(async () => {
				concurrent++;
				maxConcurrent = Math.max(maxConcurrent, concurrent);

				// Simulate work
				await new Promise((r) => setTimeout(r, 20));
				results.push(i);

				concurrent--;
			}),
		);

		await Promise.all(tasks);

		expect(results).toHaveLength(5);
		expect(maxConcurrent).toBeLessThanOrEqual(2);
		expect(maxConcurrent).toBeGreaterThan(1); // Should have some concurrency
	});
});
