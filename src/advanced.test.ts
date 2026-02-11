import { describe, expect, test } from "vitest";
import { stream, CircuitBreaker, parallel, poll, scope } from "./index.js";

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
		s.spawn(async () => {
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
			s.spawn(async () => {
				for (let i = 0; i < 5; i++) {
					await ch.send(id * 10 + i);
				}
			}),
		);

		// Collect all values
		const received: number[] = [];
		s.spawn(async () => {
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
		await using s = scope();
		const sem = s.semaphore(1);

		let acquired = false;
		await sem.acquire(async () => {
			acquired = true;
		});

		expect(acquired).toBe(true);
		expect(sem.available).toBe(1);
	});

	test("limits concurrent access", async () => {
		await using s = scope();
		const sem = s.semaphore(2);

		let concurrent = 0;
		let maxConcurrent = 0;

		await parallel(
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
		await using s = scope();
		const sem = s.semaphore(1);

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

	test("cancels waiting acquirers on scope dispose", async () => {
		const s = scope();
		const sem = s.semaphore(1);

		// Acquire the only permit and hold it
		s.spawn(async () => {
			await sem.acquire(async () => {
				await new Promise((r) => setTimeout(r, 200));
			});
		});

		// Give time for permit to be acquired
		await new Promise((r) => setTimeout(r, 10));

		// This should wait for the permit
		const waitingAcquire = sem.acquire(async () => {
			return "should not reach";
		});

		// Give it time to start waiting
		await new Promise((r) => setTimeout(r, 10));

		// Dispose scope
		await s[Symbol.asyncDispose]().catch(() => {});

		// Waiting acquire should reject
		await expect(waitingAcquire).rejects.toThrow();
	});

	test("available and waiting properties", async () => {
		await using s = scope();
		const sem = s.semaphore(3);

		expect(sem.available).toBe(3);
		expect(sem.waiting).toBe(0);
	});
});

describe("CircuitBreaker", () => {
	test("allows requests when closed", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({ failureThreshold: 3 });

		const result = await cb.execute(() => Promise.resolve("success"));
		expect(result).toBe("success");
		expect(cb.currentState).toBe("closed");
	});

	test("opens after threshold failures", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({ failureThreshold: 3 });

		// Fail 3 times
		for (let i = 0; i < 3; i++) {
			try {
				await cb.execute(() => Promise.reject(new Error("fail")));
			} catch {
				// Expected
			}
		}

		expect(cb.currentState).toBe("open");

		// Next request should be rejected immediately
		await expect(cb.execute(() => Promise.resolve("success"))).rejects.toThrow(
			"Circuit breaker is open",
		);
	});

	test("half-open after reset timeout", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({
			failureThreshold: 2,
			resetTimeout: 50,
		});

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail1")));
		} catch {}
		try {
			await cb.execute(() => Promise.reject(new Error("fail2")));
		} catch {}

		expect(cb.currentState).toBe("open");

		// Wait for reset timeout
		await new Promise((r) => setTimeout(r, 60));

		// Should be half-open now
		expect(cb.currentState).toBe("half-open");

		// Successful request should close it
		await cb.execute(() => Promise.resolve("success"));
		expect(cb.currentState).toBe("closed");
	});

	test("failure in half-open reopens circuit", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({
			failureThreshold: 1,
			resetTimeout: 50,
		});

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {}

		expect(cb.currentState).toBe("open");

		// Wait for reset
		await new Promise((r) => setTimeout(r, 60));
		expect(cb.currentState).toBe("half-open");

		// Fail in half-open
		await expect(
			cb.execute(() => Promise.reject(new Error("fail again"))),
		).rejects.toThrow("fail again");

		expect(cb.currentState).toBe("open");
	});

	test("resets to closed on success", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({ failureThreshold: 5 });

		// Some failures but not enough to open
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {}
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {}

		expect(cb.failureCount).toBe(2);

		// Success should reset
		await cb.execute(() => Promise.resolve("success"));
		expect(cb.failureCount).toBe(0);
		expect(cb.currentState).toBe("closed");
	});

	test("manual reset", async () => {
		await using s = scope();
		const cb = s.circuitBreaker({ failureThreshold: 1 });

		// Open circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {}
		expect(cb.currentState).toBe("open");

		// Manual reset
		cb.reset();
		expect(cb.currentState).toBe("closed");
		expect(cb.failureCount).toBe(0);

		// Should work again
		const result = await cb.execute(() => Promise.resolve("success"));
		expect(result).toBe("success");
	});

	test("respects parent signal", async () => {
		const controller = new AbortController();
		const cb = new CircuitBreaker({}, controller.signal);

		controller.abort("stopped");

		await expect(cb.execute(() => Promise.resolve("success"))).rejects.toThrow(
			"stopped",
		);
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
		const pollPromise = poll<string>(
			() => Promise.resolve("value"),
			() => {
				results.push("called");
			},
			{ interval: 100, immediate: false, signal: controller.signal },
		);

		// Check after 50ms - should not have been called yet
		await new Promise((r) => setTimeout(r, 50));
		expect(results.length).toBe(0);

		// Cancel
		controller.abort();
		await pollPromise.catch(() => {});
	});

	test("continues on error", async () => {
		const results: string[] = [];
		let calls = 0;

		void poll<string>(
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

		// Cancel
		const controller = new AbortController();
		controller.abort();

		// Should have continued despite error
		expect(calls).toBeGreaterThanOrEqual(2);
	});

	test("respects abort signal", async () => {
		const controller = new AbortController();
		const results: string[] = [];

		// Start with aborted controller - should reject immediately
		controller.abort("stopped");

		await expect(
			poll<string>(
				() => Promise.resolve("value"),
				() => {
					results.push("called");
				},
				{ interval: 1000, signal: controller.signal },
			),
		).rejects.toThrow("stopped");

		expect(results.length).toBe(0);
	});

	test("scope.poll method works", async () => {
		await using s = scope();

		const results: number[] = [];
		let counter = 0;

		// Start polling
		void s.poll(
			() => Promise.resolve(++counter),
			(value) => {
				results.push(value);
			},
			{ interval: 50, immediate: true },
		);

		// Let it run
		await new Promise((r) => setTimeout(r, 120));

		// Dispose scope to stop polling
		await s[Symbol.asyncDispose]();

		// Should have some results
		expect(results.length).toBeGreaterThanOrEqual(1);
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
			s.spawn(async () => {
				for (let i = 0; i < 5; i++) {
					await logChannel.send(`server${id}-log${i}`);
				}
			}),
		);

		// Batch processor consumer
		const consumer = s.spawn(async () => {
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
		s.spawn(async () => {
			await Promise.all(producers);
			logChannel.close();
		});

		await consumer;

		expect(processedLogs.length).toBe(15);
	});

	test("rate-limited worker pool", async () => {
		await using s = scope();

		const jobChannel = s.channel<number>(10);
		const results: number[] = [];

		// 3 workers with semaphore for rate limiting
		const sem = s.semaphore(2); // Max 2 concurrent jobs

		const workers = Array.from({ length: 3 }, () =>
			s.spawn(async () => {
				for await (const job of jobChannel) {
					await sem.acquire(async () => {
						// Simulate work
						await new Promise((r) => setTimeout(r, 10));
						results.push(job * 2);
					});
				}
			}),
		);

		// Producer
		s.spawn(async () => {
			for (let i = 1; i <= 10; i++) {
				await jobChannel.send(i);
			}
			jobChannel.close();
		});

		await Promise.all(workers);

		expect(results).toHaveLength(10);
		expect(results.sort((a, b) => a - b)).toEqual([
			2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
		]);
	});

	test("circuit breaker with fallback", async () => {
		await using s = scope();

		let failures = 0;
		const cb = s.circuitBreaker({ failureThreshold: 2 });

		// Try to fetch with circuit breaker
		async function fetchWithFallback() {
			try {
				return await cb.execute(async () => {
					if (failures < 3) {
						failures++;
						throw new Error("service down");
					}
					return "success";
				});
			} catch {
				// Circuit open or error - use fallback
				return "fallback";
			}
		}

		// First 2 calls fail but circuit is still closed
		expect(await fetchWithFallback()).toBe("fallback");
		expect(await fetchWithFallback()).toBe("fallback");

		// Circuit is now open
		expect(cb.currentState).toBe("open");

		// Subsequent calls immediately use fallback
		expect(await fetchWithFallback()).toBe("fallback");
	});
});
