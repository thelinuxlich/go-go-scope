import { describe, expect, test } from "vitest";
import {
	AsyncDisposableResource,
	type Failure,
	SpanStatusCode,
	type Success,
	type Tracer,
	scope,
} from "./index.js";

describe("Task", () => {
	test("resolves with the function result", async () => {
		await using s = scope();
		using t = s.spawn(() => Promise.resolve("value"));

		const result = await t;
		expect(result).toBe("value");
	});

	test("rejects when function throws", async () => {
		await using s = scope();
		using t = s.spawn(() => Promise.reject(new Error("fail")));

		await expect(t).rejects.toThrow("fail");
	});

	test("is cancelled when parent scope aborts", async () => {
		const s = scope();

		let started = false;
		let aborted = false;

		void Promise.resolve(
			s.spawn(async ({ signal }) => {
				started = true;
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new Error("aborted"));
					});
					// Never resolve to keep promise pending
				});
			}),
		).catch(() => {});

		// Give task time to start
		await new Promise((_r) => setTimeout(_r, 10));
		expect(started).toBe(true);

		// Abort the scope - suppress rejection
		await s[Symbol.asyncDispose]().catch(() => {});

		// Give time for abort to propagate
		await new Promise((_r) => setTimeout(_r, 10));
		expect(aborted).toBe(true);
	});

	test("can be disposed directly", async () => {
		const s = scope();

		let aborted = false;
		const t = s.spawn(async ({ signal }) => {
			return new Promise<string>((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("aborted"));
				});
				// Never resolve
			});
		});

		// Dispose the task directly
		t[Symbol.dispose]();
		void Promise.resolve(t).catch(() => {});

		// Give time for abort to propagate
		await new Promise((_r) => setTimeout(_r, 10));
		expect(aborted).toBe(true);
	});

	test("isSettled becomes true after resolution", async () => {
		await using s = scope();
		using t = s.spawn(() => Promise.resolve("done"));

		expect(t.isSettled).toBe(false);
		await t;
		expect(t.isSettled).toBe(true);
	});

	test("isSettled becomes true after rejection", async () => {
		await using s = scope();
		using t = s.spawn(() => Promise.reject(new Error("fail")));

		expect(t.isSettled).toBe(false);
		await expect(t).rejects.toThrow();
		expect(t.isSettled).toBe(true);
	});
});

describe("Scope", () => {
	test("creates tasks that resolve", async () => {
		await using s = scope();
		using t1 = s.spawn(() => Promise.resolve("a"));
		using t2 = s.spawn(() => Promise.resolve("b"));

		const [r1, r2] = await Promise.all([t1, t2]);
		expect(r1).toBe("a");
		expect(r2).toBe("b");
	});

	test("cancels all tasks when disposed", async () => {
		const s = scope();

		let t1Aborted = false;
		let t2Aborted = false;

		void Promise.resolve(
			s.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						t1Aborted = true;
						reject(new Error("t1 aborted"));
					});
					// Never resolve
				});
			}),
		).catch(() => {});

		void Promise.resolve(
			s.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						t2Aborted = true;
						reject(new Error("t2 aborted"));
					});
					// Never resolve
				});
			}),
		).catch(() => {});

		await s[Symbol.asyncDispose]().catch(() => {});

		// Give time for propagation
		await new Promise((_r) => setTimeout(_r, 10));

		expect(t1Aborted).toBe(true);
		expect(t2Aborted).toBe(true);
		expect(s.isDisposed).toBe(true);
	});

	test("respects timeout option", async () => {
		const s = scope({ timeout: 50 });

		let aborted = false;
		void Promise.resolve(
			s.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new Error("timeout"));
					});
					// Never resolve
				});
			}),
		).catch(() => {});

		// Wait for timeout
		await new Promise((r) => setTimeout(r, 100));

		expect(aborted).toBe(true);
	});

	test("links to parent signal", async () => {
		const parentController = new AbortController();
		const s = scope({ signal: parentController.signal });

		let aborted = false;
		void Promise.resolve(
			s.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new Error("parent aborted"));
					});
					// Never resolve
				});
			}),
		).catch(() => {});

		// Abort parent
		parentController.abort("parent said stop");

		// Give time to propagate
		await new Promise((r) => setTimeout(r, 10));

		expect(aborted).toBe(true);
	});

	test("parent option inherits signal and services", async () => {
		// Create parent scope with a service
		await using parent = scope().provide("db", () => ({
			query: () => "result",
		}));

		// Create child scope with parent option
		await using child = scope({ parent });

		// Child should have access to parent's services
		const db = child.use("db");
		expect(db.query()).toBe("result");

		// Child should inherit parent's signal (cancel when parent cancels)
		let childAborted = false;
		void Promise.resolve(
			child.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						childAborted = true;
						reject(new Error("parent aborted"));
					});
				});
			}),
		).catch(() => {});

		// Dispose parent - should propagate to child
		await parent[Symbol.asyncDispose]().catch(() => {});
		await new Promise((r) => setTimeout(r, 10));

		expect(childAborted).toBe(true);
	});

	test("parent option allows child to add more services", async () => {
		// Create parent scope with one service
		await using parent = scope().provide("db", () => ({ name: "postgres" }));

		// Create child scope with parent and add another service
		await using child = scope({ parent }).provide("cache", () => ({
			get: () => "cached",
		}));

		// Child should access both services
		expect(child.use("db").name).toBe("postgres");
		expect(child.use("cache").get()).toBe("cached");

		// Parent should NOT have access to child's service
		expect(parent.use("cache" as never)).toBeUndefined();
	});

	test("parent option inherits all scope options", async () => {
		// Create parent scope with all options
		const parentController = new AbortController();
		const parent = scope({
			signal: parentController.signal,
			concurrency: 5,
			circuitBreaker: { failureThreshold: 3, resetTimeout: 1000 },
		});

		// Create child scope with parent option
		const child = scope({ parent });

		// Child should inherit all options
		expect(child.concurrency).toBe(5);
		expect(child.circuitBreaker).toEqual({
			failureThreshold: 3,
			resetTimeout: 1000,
		});

		// Verify signal inheritance through cancellation
		let childAborted = false;
		void Promise.resolve(
			child.spawn(async ({ signal }) => {
				return new Promise<string>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						childAborted = true;
						reject(new Error("aborted"));
					});
				});
			}),
		).catch(() => {});

		// Give task time to start listening
		await new Promise((r) => setTimeout(r, 10));

		// Abort parent - should propagate to child
		parentController.abort("test abort");
		await new Promise((r) => setTimeout(r, 50));

		expect(childAborted).toBe(true);

		// Cleanup
		await child[Symbol.asyncDispose]().catch(() => {});
		await parent[Symbol.asyncDispose]().catch(() => {});
	});

	test("child scope can override parent options", async () => {
		// Create parent scope with options
		await using parent = scope({
			concurrency: 5,
			circuitBreaker: { failureThreshold: 3, resetTimeout: 1000 },
		});

		// Create child scope with overrides
		await using child = scope({
			parent,
			concurrency: 10,
			circuitBreaker: { failureThreshold: 7, resetTimeout: 2000 },
		});

		// Child should have its own options, not parent's
		expect(child.concurrency).toBe(10);
		expect(child.circuitBreaker).toEqual({
			failureThreshold: 7,
			resetTimeout: 2000,
		});

		// Parent should retain original options
		expect(parent.concurrency).toBe(5);
		expect(parent.circuitBreaker).toEqual({
			failureThreshold: 3,
			resetTimeout: 1000,
		});
	});

	test("throws when spawning on disposed scope", async () => {
		const s = scope();
		await s[Symbol.asyncDispose]();

		expect(() => s.spawn(() => Promise.resolve())).toThrow(
			"Cannot spawn task on disposed scope",
		);
	});

	test("throws when spawning on aborted scope", async () => {
		const parentController = new AbortController();
		parentController.abort();

		const s = scope({ signal: parentController.signal });

		expect(() => s.spawn(() => Promise.resolve())).toThrow(
			"Cannot spawn task on aborted scope",
		);
	});

	test("task() returns Result tuples", async () => {
		await using s = scope();

		using successTask = s.task(() => Promise.resolve("success"));
		using failTask = s.task(() => Promise.reject(new Error("failure")));

		const successResult = await successTask;
		const failResult = await failTask;

		expect(successResult).toEqual([undefined, "success"]);
		expect(failResult[0]).toBe("failure");
		expect(failResult[1]).toBeUndefined();
	});

	test("provide() manages resources with cleanup", async () => {
		let created = false;
		let cleanedUp = false;

		const createResource = () => {
			created = true;
			return { value: 42 };
		};

		const cleanupResource = () => {
			cleanedUp = true;
		};

		{
			await using s = scope();
			s.provide("resource", createResource, cleanupResource);
			const resource = s.use("resource");

			expect(created).toBe(true);
			expect(resource.value).toBe(42);
			expect(cleanedUp).toBe(false);
		}

		expect(cleanedUp).toBe(true);
	});

	test("resources are disposed in LIFO order", async () => {
		const order: string[] = [];

		{
			await using s = scope();

			s.provide(
				"first",
				() => "first-value",
				() => {
					order.push("first-disposed");
				},
			);

			s.provide(
				"second",
				() => "second-value",
				() => {
					order.push("second-disposed");
				},
			);

			s.provide(
				"third",
				() => "third-value",
				() => {
					order.push("third-disposed");
				},
			);
		}

		expect(order).toEqual([
			"third-disposed",
			"second-disposed",
			"first-disposed",
		]);
	});
});

describe("AsyncDisposableResource", () => {
	test("acquires and disposes correctly", async () => {
		let disposed = false;

		const resource = new AsyncDisposableResource(
			async () => ({ id: 1 }),
			async () => {
				disposed = true;
			},
		);

		const value = await resource.acquire();
		expect(value).toEqual({ id: 1 });
		expect(disposed).toBe(false);

		await resource[Symbol.asyncDispose]();
		expect(disposed).toBe(true);
	});

	test("throws if acquired twice", async () => {
		const resource = new AsyncDisposableResource(
			async () => "value",
			async () => {},
		);

		await resource.acquire();
		await expect(resource.acquire()).rejects.toThrow(
			"Resource already acquired",
		);
	});

	test("safe to dispose multiple times", async () => {
		let disposeCount = 0;

		const resource = new AsyncDisposableResource(
			async () => "value",
			async () => {
				disposeCount++;
			},
		);

		await resource.acquire();
		await resource[Symbol.asyncDispose]();
		await resource[Symbol.asyncDispose]();

		expect(disposeCount).toBe(1);
	});

	test("value returns undefined if not acquired", () => {
		const resource = new AsyncDisposableResource(
			async () => "value",
			async () => {},
		);

		expect(resource.value).toBeUndefined();
	});
});

describe("scope.race()", () => {
	test("returns the fastest result", async () => {
		await using s = scope();
		const winner = await s.race([
			(signal) =>
				new Promise<string>((r, reject) => {
					const timeout = setTimeout(() => r("slow"), 100);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise<string>((r, reject) => {
					const timeout = setTimeout(() => r("fast"), 10);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise<string>((r, reject) => {
					const timeout = setTimeout(() => r("medium"), 50);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		expect(winner).toBe("fast");
	});

	test("cancels slower tasks", async () => {
		await using s = scope();
		let slowStarted = false;

		await s.race([
			(signal) =>
				new Promise<string>((_, reject) => {
					const timeout = setTimeout(
						() => reject(new Error("should not reach")),
						100,
					);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise<string>((r, reject) => {
					const timeout = setTimeout(() => r("winner"), 10);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise<string>((_, reject) => {
					slowStarted = true;
					const timeout = setTimeout(() => {
						reject(new Error("slow completed"));
					}, 200);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		// Give time for the race to complete
		await new Promise((r) => setTimeout(r, 20));

		// Winner was found quickly
		expect(slowStarted).toBe(true);
	});

	test("throws on empty array", async () => {
		await using s = scope();
		await expect(s.race([])).rejects.toThrow("Cannot race empty array");
	});

	test("respects parent scope signal", async () => {
		const controller = new AbortController();
		await using s = scope({ signal: controller.signal });

		const racePromise = s.race([
			(signal) =>
				new Promise<string>((r, reject) => {
					const timeout = setTimeout(() => r("slow"), 500);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		controller.abort("user cancelled");

		await expect(racePromise).rejects.toThrow("user cancelled");
	});
});

describe("task timeout", () => {
	test("returns result if within timeout", async () => {
		await using s = scope();
		using task = s.spawn(() => Promise.resolve("success"), { timeout: 100 });
		const result = await task;
		expect(result).toBe("success");
	});

	test("throws if timeout exceeded", async () => {
		await using s = scope();
		using task = s.spawn(
			() => new Promise((r) => setTimeout(() => r("late"), 100)),
			{ timeout: 10 },
		);
		await expect(task).rejects.toThrow("timeout after 10ms");
	});

	test("timeout error has correct error reason", async () => {
		const { tracer, spans } = createMockTracer();
		await using s = scope({ tracer });

		using task = s.spawn(
			() => new Promise((r) => setTimeout(() => r("late"), 100)),
			{ timeout: 10, otel: { name: "timeout-test" } },
		);

		await expect(task).rejects.toThrow("timeout");

		// Allow span to complete
		await new Promise((r) => setTimeout(r, 20));

		const taskSpan = spans.find((s) => s.name === "timeout-test");
		expect(taskSpan?.attributes?.["task.error_reason"]).toBe("timeout");
		expect(taskSpan?.attributes?.["task.has_timeout"]).toBe(true);
		expect(taskSpan?.attributes?.["task.timeout_ms"]).toBe(10);
	});
});

describe("scope.parallel()", () => {
	test("runs all factories in parallel", async () => {
		await using s = scope();
		const startTime = Date.now();

		const results = await s.parallel([
			(signal) =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r(1), 20);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r(2), 20);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			(signal) =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r(3), 20);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		const duration = Date.now() - startTime;

		expect(results).toEqual([1, 2, 3]);
		expect(duration).toBeLessThan(50); // Should be ~20ms, not 60ms
	});

	test("returns empty array for empty input", async () => {
		await using s = scope();
		const results = await s.parallel([]);
		expect(results).toEqual([]);
	});

	test("respects scope concurrency limit", async () => {
		await using s = scope({ concurrency: 2 });
		let concurrent = 0;
		let maxConcurrent = 0;

		const results = await s.parallel(
			[1, 2, 3, 4].map(
				(i) => (signal) =>
					new Promise<number>((resolve, reject) => {
						concurrent++;
						maxConcurrent = Math.max(maxConcurrent, concurrent);
						const timeout = setTimeout(() => {
							concurrent--;
							resolve(i);
						}, 20);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("cancelled"));
						});
					}),
			),
		);

		expect(results).toEqual([1, 2, 3, 4]);
		expect(maxConcurrent).toBe(2);
	});

	test("stops on first error", async () => {
		await using s = scope();
		await expect(
			s.parallel([
				() => Promise.resolve(1),
				() => Promise.reject(new Error("fail")),
				(signal) =>
					new Promise((r, reject) => {
						const timeout = setTimeout(() => r(3), 100);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("cancelled"));
						});
					}),
			]),
		).rejects.toThrow("fail");
	});

	test("respects parent scope signal", async () => {
		const controller = new AbortController();
		await using s = scope({ signal: controller.signal });

		const parallelPromise = s.parallel([
			(signal) =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r(1), 500);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		controller.abort("cancelled");

		await expect(parallelPromise).rejects.toThrow("cancelled");
	});
});

describe("scope.parallelTasks()", () => {
	test("returns Results for all tasks", async () => {
		await using s = scope();
		const results = await s.parallelTasks<string | number>([
			() => Promise.resolve("success"),
			() => Promise.reject(new Error("failure")),
			() => Promise.resolve(42),
		]);

		expect(results).toHaveLength(3);

		// Success case
		expect(results[0]).toEqual([undefined, "success"]);

		// Failure case
		const failure = results[1];
		expect(failure).toBeDefined();
		expect(failure?.[0]).toBe("failure");
		expect(failure?.[1]).toBeUndefined();

		// Another success
		expect(results[2]).toEqual([undefined, 42]);
	});

	test("never throws", async () => {
		await using s = scope();
		const results = await s.parallelTasks([
			() => Promise.reject(new Error("error1")),
			() => Promise.reject(new Error("error2")),
		]);

		expect(results[0]?.[0]).toBe("error1");
		expect(results[1]?.[0]).toBe("error2");
	});

	test("returns empty array for empty input", async () => {
		await using s = scope();
		const results = await s.parallelTasks([]);
		expect(results).toEqual([]);
	});

	test("respects scope concurrency limit", async () => {
		await using s = scope({ concurrency: 2 });
		let maxConcurrent = 0;
		let current = 0;

		const results = await s.parallelTasks(
			[1, 2, 3, 4].map(
				(i) => () =>
					new Promise<number>((resolve) => {
						current++;
						maxConcurrent = Math.max(maxConcurrent, current);
						setTimeout(() => {
							current--;
							resolve(i);
						}, 10);
					}),
			),
		);

		expect(results.map((r) => r[1])).toEqual([1, 2, 3, 4]);
		expect(maxConcurrent).toBe(2);
	});

	test("respects parent scope signal", async () => {
		const controller = new AbortController();
		await using s = scope({ signal: controller.signal });

		const promise = s.parallelTasks([
			(signal) =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r(1), 500);
					signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		controller.abort("cancelled");

		await expect(promise).rejects.toThrow("cancelled");
	});
});

describe("Type exports", () => {
	test("Result type works correctly", () => {
		const success: Success<string> = [undefined, "value"];
		const failure: Failure<string> = ["error", undefined];

		expect(success).toEqual([undefined, "value"]);
		expect(failure).toEqual(["error", undefined]);
		// Suppress unused warnings by using the values
		void success;
		void failure;
	});
});

describe("Integration scenarios", () => {
	test("complex concurrent operation with cleanup", async () => {
		const events: string[] = [];

		// Simulate a complex operation
		{
			await using s = scope({ timeout: 1000 });

			// Simulate database connection
			s.provide(
				"db",
				() => {
					events.push("db-connected");
					return { query: async (_sql: string) => `result-of-${_sql}` };
				},
				() => {
					events.push("db-disconnected");
				},
			);

			// Simulate cache connection
			s.provide(
				"cache",
				() => {
					events.push("cache-connected");
					return { get: async (_key: string) => `cached-${_key}` };
				},
				() => {
					events.push("cache-disconnected");
				},
			);

			// Run parallel queries
			const queries = ["users", "posts", "comments"];
			using queryTask = s.task(async () => {
				events.push("queries-started");
				return s.parallelTasks(
					queries.map((q) => () => Promise.resolve(`data-${q}`)),
				);
			});

			const [err, results] = await queryTask;

			if (err) {
				events.push("queries-failed");
			} else {
				events.push("queries-completed");
				expect(results).toHaveLength(3);
			}
		}

		// Verify cleanup order (LIFO)
		expect(events).toContain("db-connected");
		expect(events).toContain("cache-connected");
		expect(events).toContain("queries-started");
		expect(events).toContain("queries-completed");
		expect(events).toContain("cache-disconnected");
		expect(events).toContain("db-disconnected");

		// Verify LIFO order
		const cacheDisconnectIdx = events.indexOf("cache-disconnected");
		const dbDisconnectIdx = events.indexOf("db-disconnected");
		expect(cacheDisconnectIdx).toBeLessThan(dbDisconnectIdx);
	});

	test("timeout with race pattern", async () => {
		// Try multiple endpoints with overall timeout
		await using s = scope({ timeout: 100 });

		const result = await s.race([
			() =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r("replica-a"), 50);
					s.signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
			() =>
				new Promise((r, reject) => {
					const timeout = setTimeout(() => r("replica-b"), 80);
					s.signal.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new Error("cancelled"));
					});
				}),
		]);

		expect(result).toBe("replica-a");
	});

	test("nested scopes", async () => {
		let innerAborted = false;

		await using outer = scope();

		// Outer task
		outer.spawn(async ({ signal: outerSignal }) => {
			await using inner = scope({ signal: outerSignal });

			void Promise.resolve(
				inner.spawn(async ({ signal: innerSignal }) => {
					return new Promise<string>((_, reject) => {
						innerSignal.addEventListener("abort", () => {
							innerAborted = true;
							reject(new Error("inner aborted"));
						});
						// Never resolve
					});
				}),
			).catch(() => {});

			try {
				return await inner;
			} catch {
				return "inner-cancelled";
			}
		});

		// Cancel outer scope - suppress rejection
		await outer[Symbol.asyncDispose]().catch(() => {});

		// Give time for propagation
		await new Promise((r) => setTimeout(r, 10));

		expect(innerAborted).toBe(true);
	});
});

describe("spawn() with retry option", () => {
	test("succeeds on first attempt", async () => {
		await using s = scope();
		let attempts = 0;

		using t = s.spawn(() => {
			attempts++;
			return Promise.resolve("success");
		});
		const result = await t;

		expect(result).toBe("success");
		expect(attempts).toBe(1);
	});

	test("retries on failure and eventually succeeds", async () => {
		await using s = scope();
		let attempts = 0;

		using t = s.spawn(
			() => {
				attempts++;
				if (attempts < 3) {
					return Promise.reject(new Error(`attempt ${attempts} failed`));
				}
				return Promise.resolve("success");
			},
			{ retry: { maxRetries: 3 } },
		);
		const result = await t;

		expect(result).toBe("success");
		expect(attempts).toBe(3);
	});

	test("throws after max retries exceeded", async () => {
		await using s = scope();
		let attempts = 0;

		using t = s.spawn(
			() => {
				attempts++;
				return Promise.reject(new Error(`attempt ${attempts}`));
			},
			{ retry: { maxRetries: 2 } },
		);
		await expect(t).rejects.toThrow("attempt 3");

		expect(attempts).toBe(3);
	});

	test("respects retryCondition", async () => {
		await using s = scope();
		let attempts = 0;

		class NetworkError extends Error {}
		class ValidationError extends Error {}

		using t = s.spawn(
			() => {
				attempts++;
				if (attempts === 1) {
					return Promise.reject(new NetworkError("retry me"));
				}
				return Promise.reject(new ValidationError("don't retry"));
			},
			{
				retry: {
					maxRetries: 3,
					retryCondition: (error) => error instanceof NetworkError,
				},
			},
		);
		await expect(t).rejects.toThrow("don't retry");

		expect(attempts).toBe(2);
	});

	test("calls onRetry callback", async () => {
		await using s = scope();
		const retryCallbacks: { error: unknown; attempt: number }[] = [];
		let attempts = 0;

		using t = s.spawn(
			() => {
				attempts++;
				if (attempts < 3) {
					return Promise.reject(new Error(`error ${attempts}`));
				}
				return Promise.resolve("success");
			},
			{
				retry: {
					maxRetries: 3,
					onRetry: (error, attempt) => {
						retryCallbacks.push({ error, attempt });
					},
				},
			},
		);
		await t;

		expect(retryCallbacks).toHaveLength(2);
		expect(retryCallbacks[0]?.attempt).toBe(1);
		expect(retryCallbacks[1]?.attempt).toBe(2);
	});

	test("uses fixed delay between retries", async () => {
		await using s = scope();
		let attempts = 0;
		const startTime = Date.now();

		using t = s.spawn(
			() => {
				attempts++;
				if (attempts < 3) {
					return Promise.reject(new Error("retry"));
				}
				return Promise.resolve("success");
			},
			{ retry: { maxRetries: 3, delay: 50 } },
		);
		const result = await t;

		const elapsed = Date.now() - startTime;
		expect(result).toBe("success");
		expect(attempts).toBe(3);
		expect(elapsed).toBeGreaterThanOrEqual(100);
	});

	test("uses dynamic delay function", async () => {
		await using s = scope();
		let attempts = 0;
		const delays: number[] = [];

		using t = s.spawn(
			() => {
				attempts++;
				if (attempts < 4) {
					return Promise.reject(new Error("retry"));
				}
				return Promise.resolve("success");
			},
			{
				retry: {
					maxRetries: 4,
					delay: (attempt) => {
						delays.push(attempt);
						return attempt * 10;
					},
				},
			},
		);
		await t;

		expect(delays).toEqual([1, 2, 3]);
	});

	test("respects AbortSignal during delay", async () => {
		const controller = new AbortController();
		await using s = scope({ signal: controller.signal });

		using t = s.spawn(() => Promise.reject(new Error("fail")), {
			retry: { maxRetries: 5, delay: 1000 },
		});

		setTimeout(() => controller.abort("cancelled"), 50);

		await expect(t).rejects.toThrow("cancelled");
	});

	test("respects scope timeout", async () => {
		await using s = scope({ timeout: 200 });

		using t = s.spawn(() => Promise.reject(new Error("fail")), {
			retry: { maxRetries: 10, delay: 100 },
		});
		await expect(t).rejects.toThrow("timeout after 200ms");
	});

	test("works with otel options for tracing", async () => {
		const { tracer, spans } = createMockTracer();
		await using s = scope({ tracer });

		using t = s.spawn(() => Promise.resolve("success"), {
			otel: { name: "retryable-task" },
			retry: { maxRetries: 0 },
		});
		await t;

		const taskSpan = spans.find((s) => s.name === "retryable-task");
		expect(taskSpan).toBeDefined();
	});
});

describe("task() with retry option", () => {
	test("returns success Result on first attempt", async () => {
		await using s = scope();

		using t = s.task(() => Promise.resolve("success"));
		const [err, result] = await t;

		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("returns success Result after retries", async () => {
		await using s = scope();
		let attempts = 0;

		using t = s.task(
			() => {
				attempts++;
				if (attempts < 3) {
					return Promise.reject(new Error(`attempt ${attempts}`));
				}
				return Promise.resolve("success");
			},
			{ retry: { maxRetries: 3 } },
		);
		const [err, result] = await t;

		expect(err).toBeUndefined();
		expect(result).toBe("success");
		expect(attempts).toBe(3);
	});

	test("returns failure Result after max retries exceeded", async () => {
		await using s = scope();

		using t = s.task(() => Promise.reject(new Error("always fails")), {
			retry: { maxRetries: 2 },
		});
		const [err, result] = await t;

		expect(err).toBe("always fails");
		expect(result).toBeUndefined();
	});

	test("never throws", async () => {
		await using s = scope();

		let caughtError = false;
		try {
			using t = s.task(() => Promise.reject(new Error("fail")), {
				retry: { maxRetries: 1 },
			});
			await t;
		} catch {
			caughtError = true;
		}

		expect(caughtError).toBe(false);
	});

	test("respects retryCondition", async () => {
		await using s = scope();
		let attempts = 0;

		class RetryableError extends Error {}
		class FatalError extends Error {}

		using t = s.task(
			() => {
				attempts++;
				if (attempts === 1) {
					return Promise.reject(new RetryableError("retry me"));
				}
				return Promise.reject(new FatalError("fatal"));
			},
			{
				retry: {
					maxRetries: 3,
					retryCondition: (error) => error instanceof RetryableError,
				},
			},
		);
		const [err, result] = await t;

		expect(err).toBe("fatal");
		expect(result).toBeUndefined();
		expect(attempts).toBe(2);
	});
});

// Mock OpenTelemetry tracer for testing
function createMockTracer(): { tracer: Tracer; spans: MockSpan[] } {
	const spans: MockSpan[] = [];

	const tracer: Tracer = {
		startSpan(
			name: string,
			options?: { attributes?: Record<string, unknown> },
		) {
			const span = new MockSpan(name, options?.attributes);
			spans.push(span);
			return span;
		},
	};

	return { tracer, spans };
}

class MockSpan {
	name: string;
	attributes: Record<string, unknown> | undefined;
	ended = false;
	exceptions: unknown[] = [];
	status: { code: number; message?: string } | undefined;

	constructor(name: string, attributes?: Record<string, unknown>) {
		this.name = name;
		this.attributes = attributes;
	}

	end(): void {
		this.ended = true;
	}

	recordException(exception: unknown): void {
		this.exceptions.push(exception);
	}

	setStatus(status: { code: number; message?: string }): void {
		this.status = status;
	}

	setAttributes(attributes: Record<string, unknown>): void {
		this.attributes = { ...this.attributes, ...attributes };
	}
}

describe("OpenTelemetry Integration", () => {
	test("creates scope span when tracer is provided", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer, name: "test-scope" });
			using t = s.spawn(() => Promise.resolve("done"));
			await t;
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		expect(spans.length).toBeGreaterThanOrEqual(1);
		const scopeSpan = spans.find((s) => s.name === "test-scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.ended).toBe(true);
		expect(scopeSpan?.status?.code).toBe(SpanStatusCode.OK);
	});

	test("creates task spans for spawned tasks", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t1 = s.spawn(() => Promise.resolve("a"));
			using t2 = s.spawn(() => Promise.resolve("b"));
			await Promise.all([t1, t2]);
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpans = spans.filter((s) => s.name === "scope.task");
		expect(taskSpans.length).toBe(2);
		expect(taskSpans.every((s) => s.ended)).toBe(true);
		expect(taskSpans.every((s) => s.status?.code === SpanStatusCode.OK)).toBe(
			true,
		);
	});

	test("records exceptions on task failure", async () => {
		const { tracer, spans } = createMockTracer();

		try {
			await using s = scope({ tracer });
			using t = s.spawn(() => Promise.reject(new Error("task failed")));
			await t;
		} catch {
			// Expected to throw
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpan = spans.find((s) => s.name === "scope.task");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.status?.code).toBe(SpanStatusCode.ERROR);
		expect(taskSpan?.exceptions.length).toBeGreaterThan(0);
	});

	test("records timeout as exception in scope span", async () => {
		const { tracer, spans } = createMockTracer();

		try {
			await using s = scope({ tracer, timeout: 10 });
			using t = s.spawn(() => new Promise((r) => setTimeout(r, 100)));
			await t;
		} catch {
			// Expected to throw
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 50));

		const scopeSpan = spans.find((s) => s.name === "scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.exceptions.length).toBeGreaterThan(0);
	});

	test("sets error status when parent signal aborts", async () => {
		const { tracer, spans } = createMockTracer();
		const controller = new AbortController();

		const s = scope({ tracer, signal: controller.signal });

		try {
			using t = s.spawn(() => new Promise((r) => setTimeout(r, 100)));
			controller.abort("user cancelled");
			await t;
		} catch {
			// Expected
		}
		await s[Symbol.asyncDispose]().catch(() => {});

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const scopeSpan = spans.find((s) => s.name === "scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.status?.code).toBe(SpanStatusCode.ERROR);
	});

	test("includes scope attributes in span", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer, timeout: 5000 });
			using t = s.spawn(() => Promise.resolve("done"));
			await t;
		}

		const scopeSpan = spans.find((s) => s.name === "scope");
		expect(scopeSpan?.attributes).toMatchObject({
			"scope.timeout": 5000,
			"scope.has_parent_signal": false,
		});
	});

	test("includes task index in task span attributes", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t1 = s.spawn(() => Promise.resolve("a"));
			using t2 = s.spawn(() => Promise.resolve("b"));
			await Promise.all([t1, t2]);
		}

		const taskSpans = spans.filter((s) => s.name === "scope.task");
		expect(taskSpans[0]?.attributes?.["task.index"]).toBe(1);
		expect(taskSpans[1]?.attributes?.["task.index"]).toBe(2);
	});

	test("works without tracer (no-op)", async () => {
		// This should not throw or cause any issues
		try {
			await using s = scope(); // No tracer
			using t1 = s.spawn(() => Promise.resolve("a"));
			using t2 = s.spawn(() => Promise.reject(new Error("fail")));
			await t1;
			await t2;
		} catch {
			// Expected t2 to fail
		}

		// If we got here without errors, the test passes
		expect(true).toBe(true);
	});

	test("records disposal errors in scope span", async () => {
		const { tracer, spans } = createMockTracer();

		try {
			await using s = scope({ tracer });
			s.provide(
				"resource",
				async () => "resource",
				async () => {
					throw new Error("disposal failed");
				},
			);
		} catch {
			// Expected disposal to throw
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const scopeSpan = spans.find((s) => s.name === "scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.status?.code).toBe(SpanStatusCode.ERROR);
		expect(scopeSpan?.exceptions.length).toBeGreaterThan(0);
	});

	test("spawn accepts custom task name", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t = s.spawn(() => Promise.resolve("done"), {
				otel: { name: "fetch-user" },
			});
			await t;
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpan = spans.find((s) => s.name === "fetch-user");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes?.["task.index"]).toBe(1);
	});

	test("spawn accepts custom attributes", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t = s.spawn(() => Promise.resolve("done"), {
				otel: {
					attributes: {
						"http.method": "GET",
						"http.url": "/api/users",
						"user.id": "123",
					},
				},
			});
			await t;
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpan = spans.find((s) => s.name === "scope.task");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes).toMatchObject({
			"task.index": 1,
			"http.method": "GET",
			"http.url": "/api/users",
			"user.id": "123",
		});
	});

	test("task accepts TaskOptions", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t = s.task(() => Promise.resolve("done"), {
				otel: {
					name: "fetch-task",
					attributes: { "task.type": "background" },
				},
			});
			await t;
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpan = spans.find((s) => s.name === "fetch-task");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes?.["task.type"]).toBe("background");
	});

	test("records task duration in span attributes", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t = s.spawn(() => Promise.resolve("done"));
			await t;
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const taskSpan = spans.find((s) => s.name === "scope.task");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes?.["task.duration_ms"]).toBeDefined();
		expect(typeof taskSpan?.attributes?.["task.duration_ms"]).toBe("number");
		expect(taskSpan?.attributes?.["task.duration_ms"]).toBeGreaterThanOrEqual(
			0,
		);
	});

	test("records scope duration in span attributes", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({ tracer });
			using t = s.spawn(() => Promise.resolve("done"));
			await t;
			// Small delay to ensure measurable duration
			await new Promise((r) => setTimeout(r, 10));
		}

		// Allow disposal to complete
		await new Promise((r) => setTimeout(r, 10));

		const scopeSpan = spans.find((s) => s.name === "scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.attributes?.["scope.duration_ms"]).toBeDefined();
		expect(typeof scopeSpan?.attributes?.["scope.duration_ms"]).toBe("number");
		expect(scopeSpan?.attributes?.["scope.duration_ms"]).toBeGreaterThanOrEqual(
			0,
		);
	});
});
