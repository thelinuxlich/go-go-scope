import { describe, expect, test } from "vitest";
import {
	AsyncDisposableResource,
	type Failure,
	type Result,
	Scope,
	type Span,
	SpanStatusCode,
	type Success,
	Task,
	type Tracer,
	parallel,
	parallelResults,
	race,
	scope,
	timeout,
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

		using t = s.spawn(async (signal) => {
			started = true;
			return new Promise<string>((resolve, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("aborted"));
				});
				// Never resolve to keep promise pending
			});
		});

		// Give task time to start
		await new Promise((r) => setTimeout(r, 10));
		expect(started).toBe(true);

		// Abort the scope - suppress rejection
		await s[Symbol.asyncDispose]().catch(() => {});

		// Give time for abort to propagate
		await new Promise((r) => setTimeout(r, 10));
		expect(aborted).toBe(true);
	});

	test("can be disposed directly", async () => {
		const s = scope();

		let aborted = false;
		using t = s.spawn(async (signal) => {
			return new Promise<string>((resolve, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("aborted"));
				});
				// Never resolve
			});
		});

		// Dispose the task directly
		t[Symbol.dispose]();

		// Give time for abort to propagate
		await new Promise((r) => setTimeout(r, 10));
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

		using t1 = s.spawn(async (signal) => {
			return new Promise<string>((_, reject) => {
				signal.addEventListener("abort", () => {
					t1Aborted = true;
					reject(new Error("t1 aborted"));
				});
				// Never resolve
			});
		});

		using t2 = s.spawn(async (signal) => {
			return new Promise<string>((_, reject) => {
				signal.addEventListener("abort", () => {
					t2Aborted = true;
					reject(new Error("t2 aborted"));
				});
				// Never resolve
			});
		});

		await s[Symbol.asyncDispose]().catch(() => {});

		// Give time for propagation
		await new Promise((r) => setTimeout(r, 10));

		expect(t1Aborted).toBe(true);
		expect(t2Aborted).toBe(true);
		expect(s.isDisposed).toBe(true);
	});

	test("respects timeout option", async () => {
		const s = scope({ timeout: 50 });

		let aborted = false;
		using t = s.spawn(async (signal) => {
			return new Promise<string>((_, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("timeout"));
				});
				// Never resolve
			});
		});

		// Wait for timeout
		await new Promise((r) => setTimeout(r, 100));

		expect(aborted).toBe(true);
	});

	test("links to parent signal", async () => {
		const parentController = new AbortController();
		const s = scope({ signal: parentController.signal });

		let aborted = false;
		using t = s.spawn(async (signal) => {
			return new Promise<string>((_, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("parent aborted"));
				});
				// Never resolve
			});
		});

		// Abort parent
		parentController.abort("parent said stop");

		// Give time to propagate
		await new Promise((r) => setTimeout(r, 10));

		expect(aborted).toBe(true);
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

	test("acquire() manages resources", async () => {
		let acquired = false;
		let disposed = false;

		const createResource = async () => {
			acquired = true;
			return { value: 42 };
		};

		const disposeResource = async (r: { value: number }) => {
			disposed = true;
		};

		{
			await using s = scope();
			const resource = await s.acquire(createResource, disposeResource);

			expect(acquired).toBe(true);
			expect(resource.value).toBe(42);
			expect(disposed).toBe(false);
		}

		expect(disposed).toBe(true);
	});

	test("resources are disposed in LIFO order", async () => {
		const order: string[] = [];

		{
			await using s = scope();

			await s.acquire(
				async () => "first",
				async () => order.push("first-disposed"),
			);

			await s.acquire(
				async () => "second",
				async () => order.push("second-disposed"),
			);

			await s.acquire(
				async () => "third",
				async () => order.push("third-disposed"),
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

describe("race()", () => {
	test("returns the fastest result", async () => {
		const winner = await race([
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
		let slowStarted = false;

		await race([
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
		await expect(race([])).rejects.toThrow("Cannot race empty array");
	});

	test("respects signal option", async () => {
		const controller = new AbortController();

		const racePromise = race(
			[
				(signal) =>
					new Promise<string>((r, reject) => {
						const timeout = setTimeout(() => r("slow"), 500);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("cancelled"));
						});
					}),
			],
			{ signal: controller.signal },
		);

		controller.abort("user cancelled");

		await expect(racePromise).rejects.toThrow("user cancelled");
	});
});

describe("timeout()", () => {
	test("returns result if within timeout", async () => {
		const result = await timeout(100, () => Promise.resolve("success"));
		expect(result).toBe("success");
	});

	test("throws if timeout exceeded", async () => {
		await expect(
			timeout(10, () => new Promise((r) => setTimeout(() => r("late"), 100))),
		).rejects.toThrow("timeout after 10ms");
	});

	test("aborts signal when timeout is reached", async () => {
		let aborted = false;

		await expect(
			timeout(10, async (signal) => {
				return new Promise((_, reject) => {
					signal.addEventListener("abort", () => {
						aborted = true;
						reject(new Error("aborted"));
					});
					// Never resolve
				});
			}),
		).rejects.toThrow();

		expect(aborted).toBe(true);
	});

	test("respects signal option", async () => {
		const controller = new AbortController();

		const timeoutPromise = timeout(
			1000,
			() => new Promise((r) => setTimeout(() => r("done"), 500)),
			{ signal: controller.signal },
		);

		controller.abort("user cancelled");

		await expect(timeoutPromise).rejects.toThrow("user cancelled");
	});
});

describe("parallel()", () => {
	test("runs all factories in parallel", async () => {
		const startTime = Date.now();

		const results = await parallel([
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
		const results = await parallel([]);
		expect(results).toEqual([]);
	});

	test("respects concurrency limit", async () => {
		let concurrent = 0;
		let maxConcurrent = 0;

		const results = await parallel(
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
			{ concurrency: 2 },
		);

		expect(results).toEqual([1, 2, 3, 4]);
		expect(maxConcurrent).toBe(2);
	});

	test("stops on first error", async () => {
		await expect(
			parallel([
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

	test("respects signal option", async () => {
		const controller = new AbortController();

		const parallelPromise = parallel(
			[
				(signal) =>
					new Promise((r, reject) => {
						const timeout = setTimeout(() => r(1), 500);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("cancelled"));
						});
					}),
			],
			{ signal: controller.signal },
		);

		controller.abort("cancelled");

		await expect(parallelPromise).rejects.toThrow("cancelled");
	});
});

describe("parallelResults()", () => {
	test("returns Results for all tasks", async () => {
		const results = await parallelResults([
			() => Promise.resolve("success"),
			() => Promise.reject(new Error("failure")),
			() => Promise.resolve(42),
		]);

		expect(results).toHaveLength(3);

		// Success case
		expect(results[0]).toEqual([undefined, "success"]);

		// Failure case
		expect(results[1][0]).toBe("failure");
		expect(results[1][1]).toBeUndefined();

		// Another success
		expect(results[2]).toEqual([undefined, 42]);
	});

	test("never throws", async () => {
		const results = await parallelResults([
			() => Promise.reject(new Error("error1")),
			() => Promise.reject(new Error("error2")),
		]);

		expect(results[0][0]).toBe("error1");
		expect(results[1][0]).toBe("error2");
	});

	test("returns empty array for empty input", async () => {
		const results = await parallelResults([]);
		expect(results).toEqual([]);
	});

	test("respects concurrency limit", async () => {
		let maxConcurrent = 0;
		let current = 0;

		const results = await parallelResults(
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
			{ concurrency: 2 },
		);

		expect(results.map((r) => r[1])).toEqual([1, 2, 3, 4]);
		expect(maxConcurrent).toBe(2);
	});

	test("respects signal option", async () => {
		const controller = new AbortController();

		const promise = parallelResults(
			[
				(signal) =>
					new Promise((r, reject) => {
						const timeout = setTimeout(() => r(1), 500);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("cancelled"));
						});
					}),
			],
			{ signal: controller.signal },
		);

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
	});
});

describe("Integration scenarios", () => {
	test("complex concurrent operation with cleanup", async () => {
		const events: string[] = [];

		// Simulate a complex operation
		{
			await using s = scope({ timeout: 1000 });

			// Simulate database connection
			await s.acquire(
				async () => {
					events.push("db-connected");
					return { query: async (sql: string) => `result-of-${sql}` };
				},
				async () => events.push("db-disconnected"),
			);

			// Simulate cache connection
			await s.acquire(
				async () => {
					events.push("cache-connected");
					return { get: async (key: string) => `cached-${key}` };
				},
				async () => events.push("cache-disconnected"),
			);

			// Run parallel queries
			const queries = ["users", "posts", "comments"];
			using queryTask = s.task(async () => {
				events.push("queries-started");
				return parallelResults(
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
		const result = await timeout(100, async (signal) => {
			return race(
				[
					(sig) =>
						new Promise((r, reject) => {
							const timeout = setTimeout(() => r("replica-a"), 50);
							sig.addEventListener("abort", () => {
								clearTimeout(timeout);
								reject(new Error("cancelled"));
							});
						}),
					(sig) =>
						new Promise((r, reject) => {
							const timeout = setTimeout(() => r("replica-b"), 80);
							sig.addEventListener("abort", () => {
								clearTimeout(timeout);
								reject(new Error("cancelled"));
							});
						}),
				],
				{ signal },
			);
		});

		expect(result).toBe("replica-a");
	});

	test("nested scopes", async () => {
		let innerAborted = false;

		await using outer = scope();

		// Outer task
		using outerTask = outer.spawn(async (outerSignal) => {
			await using inner = scope({ signal: outerSignal });

			using innerTask = inner.spawn(async (innerSignal) => {
				return new Promise<string>((_, reject) => {
					innerSignal.addEventListener("abort", () => {
						innerAborted = true;
						reject(new Error("inner aborted"));
					});
					// Never resolve
				});
			});

			try {
				return await innerTask;
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
			await s.acquire(
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
			using t = s.spawn(() => Promise.resolve("done"), { name: "fetch-user" });
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
				attributes: {
					"http.method": "GET",
					"http.url": "/api/users",
					"user.id": "123",
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
				name: "fetch-task",
				attributes: { "task.type": "background" },
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
