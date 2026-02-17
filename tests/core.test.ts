import type { Context, Span, SpanOptions } from "@opentelemetry/api";
import { describe, expect, test } from "vitest";
import {
	AsyncDisposableResource,
	type Failure,
	type Success,
	scope,
	type Tracer,
} from "../src/index.js";

describe("Task", () => {
	test("resolves with the function result", async () => {
		await using s = scope()
		const t = s.task(() => Promise.resolve("value"));

		const [err, result] = await t;
		expect(err).toBeUndefined();
		expect(result).toBe("value");
	});

	test("rejects when function throws", async () => {
		await using s = scope();
		const t = s.task(() => Promise.reject(new Error("fail")));

		const [err] = await t;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("fail");
	});

	test("preserves custom error class in result tuple", async () => {
		class NetworkError extends Error {
			constructor(
				message: string,
				public statusCode: number,
			) {
				super(message);
				this.name = "NetworkError";
			}
		}

		class ValidationError extends Error {
			constructor(
				message: string,
				public field: string,
			) {
				super(message);
				this.name = "ValidationError";
			}
		}

		await using s = scope();

		// Test NetworkError preservation
		const t1 = s.task(() =>
			Promise.reject(new NetworkError("Connection failed", 503)),
		);
		const [err1] = await t1;
		expect(err1).toBeInstanceOf(NetworkError);
		expect(err1).toBeInstanceOf(Error);
		expect((err1 as NetworkError).message).toBe("Connection failed");
		expect((err1 as NetworkError).statusCode).toBe(503);

		// Test ValidationError preservation
		const t2 = s.task(() =>
			Promise.reject(new ValidationError("Invalid email", "email")),
		);
		const [err2] = await t2;
		expect(err2).toBeInstanceOf(ValidationError);
		expect(err2).toBeInstanceOf(Error);
		expect((err2 as ValidationError).message).toBe("Invalid email");
		expect((err2 as ValidationError).field).toBe("email");
	});

	test("is cancelled when parent scope aborts", async () => {
		const s = scope();

		let started = false;
		let aborted = false;

		void Promise.resolve(
			s.task(async ({ signal }) => {
				started = true;
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
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

	test("isSettled becomes true after resolution", async () => {
		await using s = scope();
		const t = s.task(() => Promise.resolve("done"));

		expect(t.isSettled).toBe(false);
		await t;
		expect(t.isSettled).toBe(true);
	});

	test("isSettled becomes true after rejection", async () => {
		await using s = scope();
		const t = s.task(() => Promise.reject(new Error("fail")));

		expect(t.isSettled).toBe(false);
		await t;
		expect(t.isSettled).toBe(true);
	});
});

describe("Scope", () => {
	test("creates tasks that resolve", async () => {
		await using s = scope();
		const t1 = s.task(() => Promise.resolve("a"));
		const t2 = s.task(() => Promise.resolve("b"));

		const [r1, r2] = await Promise.all([t1, t2]);
		expect(r1[1]).toBe("a");
		expect(r2[1]).toBe("b");
	});

	test("cancels all tasks when disposed", async () => {
		const s = scope();

		let t1Aborted = false;
		let t2Aborted = false;

		void Promise.resolve(
			s.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						t1Aborted = true;
						reject(new Error("t1 aborted"));
					});
					// Never resolve
				});
			}),
		).catch(() => {});

		void Promise.resolve(
			s.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
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
			s.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
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
			s.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
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
			child.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
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
		await using parent = scope({
			concurrency: 5,
			circuitBreaker: { failureThreshold: 3, resetTimeout: 1000 },
		});

		// Create child scope with parent option
		await using child = scope({ parent });

		// Child should inherit all options
		expect(child.concurrency).toBe(5);
		expect(child.circuitBreaker).toEqual({
			failureThreshold: 3,
			resetTimeout: 1000,
		});

		// Verify signal inheritance through cancellation
		// Just verify the child's signal is aborted when parent is disposed
		let childAborted = false;
		void Promise.resolve(
			child.task(async ({ signal }) => {
				return new Promise<readonly [undefined, string]>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						childAborted = true;
						reject(new Error("aborted"));
					});
				});
			}),
		).catch(() => {});

		// Give task time to start listening
		await new Promise((r) => setTimeout(r, 10));

		// Dispose parent
		await parent[Symbol.asyncDispose]().catch(() => {});
		await new Promise((r) => setTimeout(r, 10));

		// Child's signal should also be aborted (inherited from parent)
		expect(child.signal.aborted).toBe(true);

		// Verify the child task was actually aborted
		expect(childAborted).toBe(true);
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

	test("throws when task() on disposed scope", async () => {
		const s = scope();
		await s[Symbol.asyncDispose]();

		expect(() => s.task(() => Promise.resolve())).toThrow(
			"Cannot spawn task on disposed scope",
		);
	});

	test("throws when task() on aborted scope", async () => {
		const parentController = new AbortController();
		parentController.abort();

		const s = scope({ signal: parentController.signal });

		expect(() => s.task(() => Promise.resolve())).toThrow(
			"Cannot spawn task on aborted scope",
		);
	});

	test("task() returns Result tuples", async () => {
		await using s = scope();

		const successTask = s.task(() => Promise.resolve("success"));
		const failTask = s.task(() => Promise.reject(new Error("failure")));

		const successResult = await successTask;
		const failResult = await failTask;

		expect(successResult).toEqual([undefined, "success"]);
		expect(failResult[0]).toBeInstanceOf(Error);
		expect((failResult[0] as Error).message).toBe("failure");
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
			await using s = scope().provide(
				"resource",
				createResource,
				cleanupResource,
			);
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

describe("override()", () => {
	test("replaces an existing service", async () => {
		await using s = scope()
			.provide("config", () => ({ env: "production" }))
			.override("config", () => ({ env: "testing" }));

		const config = s.use("config");
		expect(config.env).toBe("testing");
	});

	test("throws when overriding non-existent service", async () => {
		await using s = scope();

		expect(() => {
			s.override("db", () => ({ query: () => "mock" }));
		}).toThrow("Cannot override service 'db': it was not provided");
	});

	test("allows chaining with provide()", async () => {
		await using s = scope()
			.provide("db", () => ({ name: "real" }))
			.provide("cache", () => ({ name: "real-cache" }))
			.override("db", () => ({ name: "mock" }));

		expect(s.use("db").name).toBe("mock");
		expect(s.use("cache").name).toBe("real-cache");
	});

	test("registers cleanup for overridden service", async () => {
		const cleanups: string[] = [];

		{
			await using s = scope()
				.provide(
					"db",
					() => ({ name: "real" }),
					() => cleanups.push("real-cleanup"),
				)
				.override(
					"db",
					() => ({ name: "mock" }),
					() => cleanups.push("mock-cleanup"),
				);

			expect(s.use("db").name).toBe("mock");
		}

		// Both cleanups should run (LIFO)
		expect(cleanups).toEqual(["mock-cleanup", "real-cleanup"]);
	});

	test("works with task context", async () => {
		interface Database {
			query: () => string;
		}

		await using s = scope()
			.provide<"db", Database>("db", () => ({ query: () => "real" }))
			.override<"db", Database>("db", () => ({ query: () => "mock" }));

		const [err, result] = await s.task(({ services }) => {
			return services.db.query();
		});

		expect(err).toBeUndefined();
		expect(result).toBe("mock");
	});

	test("throws on disposed scope", async () => {
		const s = scope().provide("db", () => ({ query: () => "real" }));
		await s[Symbol.asyncDispose]();

		expect(() => {
			s.override("db", () => ({ query: () => "mock" }));
		}).toThrow("Cannot override service on disposed scope");
	});

	test("allows multiple overrides", async () => {
		await using s = scope()
			.provide("value", () => 1)
			.override("value", () => 2)
			.override("value", () => 3);

		expect(s.use("value")).toBe(3);
	});
});

describe("has()", () => {
	test("returns true for existing service", async () => {
		await using s = scope().provide("db", () => ({ query: () => "result" }));

		expect(s.has("db")).toBe(true);
	});

	test("returns false for non-existent service", async () => {
		await using s = scope();

		expect(s.has("db")).toBe(false);
	});

	test("returns false for disposed scope", async () => {
		const s = scope().provide("db", () => ({ query: () => "result" }));
		await s[Symbol.asyncDispose]();

		expect(s.has("db")).toBe(false);
	});

	test("returns true after override", async () => {
		await using s = scope()
			.provide("db", () => ({ query: () => "real" }))
			.override("db", () => ({ query: () => "mock" }));

		expect(s.has("db")).toBe(true);
	});

	test("works with inherited services from parent", async () => {
		await using parent = scope().provide("db", () => ({ query: () => "parent" }));
		await using child = scope({ parent });

		expect(child.has("db")).toBe(true);
		expect(parent.has("db")).toBe(true);
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

describe("task() with retry option", () => {
	test("returns success Result on first attempt", async () => {
		await using s = scope();

		const t = s.task(() => Promise.resolve("success"));
		const [err, result] = await t;

		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("returns success Result after retries", async () => {
		await using s = scope();
		let attempts = 0;

		const t = s.task(
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
		let attempts = 0;

		const t = s.task(
			() => {
				attempts++;
				return Promise.reject(new Error(`attempt ${attempts}`));
			},
			{ retry: { maxRetries: 2 } },
		);
		const [err, result] = await t;

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("attempt 3");
		expect(result).toBeUndefined();
		expect(attempts).toBe(3);
	});

	test("respects retryCondition", async () => {
		await using s = scope();
		let attempts = 0;

		class RetryableError extends Error {}
		class FatalError extends Error {}

		const t = s.task(
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

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("fatal");
		expect(result).toBeUndefined();
		expect(attempts).toBe(2);
	});

	test("calls onRetry callback", async () => {
		await using s = scope();
		const retryCallbacks: { error: unknown; attempt: number }[] = [];
		let attempts = 0;

		const t = s.task(
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

		const t = s.task(
			() => {
				attempts++;
				if (attempts < 3) {
					return Promise.reject(new Error("retry"));
				}
				return Promise.resolve("success");
			},
			{ retry: { maxRetries: 3, delay: 50 } },
		);
		const [err, result] = await t;

		const elapsed = Date.now() - startTime;
		expect(err).toBeUndefined();
		expect(result).toBe("success");
		expect(attempts).toBe(3);
		expect(elapsed).toBeGreaterThanOrEqual(100);
	});

	test("uses dynamic delay function", async () => {
		await using s = scope();
		let attempts = 0;
		const delays: number[] = [];

		const t = s.task(
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

		const t = s.task(() => Promise.reject(new Error("fail")), {
			retry: { maxRetries: 5, delay: 1000 },
		});

		setTimeout(() => controller.abort("cancelled"), 50);

		const [err] = await t;
		expect(err).toBe("cancelled");
	});

	test("respects scope timeout", async () => {
		await using s = scope({ timeout: 200 });

		const t = s.task(() => Promise.reject(new Error("fail")), {
			retry: { maxRetries: 10, delay: 100 },
		});
		const [err] = await t;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("timeout");
	});

	test("works with otel options for tracing", async () => {
		const { tracer, spans } = createMockTracer();
		await using s = scope({ tracer });

		const t = s.task(() => Promise.resolve("success"), {
			otel: { name: "retryable-task" },
			retry: { maxRetries: 0 },
		});
		await t;

		const taskSpan = spans.find((s) => s.name === "retryable-task");
		expect(taskSpan).toBeDefined();
	});

	test("records task duration in otel span", async () => {
		const { tracer, spans } = createMockTracer();
		await using s = scope({ tracer });

		const t = s.task(
			async () => {
				await new Promise((r) => setTimeout(r, 50));
				return "success";
			},
			{ otel: { name: "timed-task" } },
		);
		await t;

		const taskSpan = spans.find((s) => s.name === "timed-task");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes?.["task.duration_ms"]).toBeDefined();
		expect(taskSpan?.attributes?.["task.duration_ms"]).toBeGreaterThanOrEqual(
			40,
		);
	});
});

describe("errorClass option", () => {
	test("returns untyped error when errorClass is not provided", async () => {
		await using s = scope();

		const [err, value] = await s.task(() =>
			Promise.reject(new Error("plain error")),
		);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("plain error");
		expect(value).toBeUndefined();
	});

	test("wraps error in provided error class", async () => {
		await using s = scope();

		class CustomError extends Error {
			constructor(
				message: string,
				options?: { cause?: unknown },
			) {
				super(message, options);
				this.name = "CustomError";
			}
		}

		const [err, value] = await s.task(
			() => Promise.reject(new Error("original error")),
			{ errorClass: CustomError },
		);

		expect(err).toBeInstanceOf(CustomError);
		expect(err?.message).toBe("original error");
		expect((err as CustomError)?.cause).toBeInstanceOf(Error);
		expect(((err as CustomError)?.cause as Error)?.message).toBe(
			"original error",
		);
		expect(value).toBeUndefined();
	});

	test("returns success value unchanged", async () => {
		await using s = scope();

		class CustomError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "CustomError";
			}
		}

		const [err, value] = await s.task(() => Promise.resolve("success"), {
			errorClass: CustomError,
		});

		expect(err).toBeUndefined();
		expect(value).toBe("success");
	});

	test("handles non-Error values and wraps them", async () => {
		await using s = scope();

		class CustomError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "CustomError";
			}
		}

		// Task that throws a string
		const [err, value] = await s.task(
			() => {
				throw "string error";
			},
			{ errorClass: CustomError },
		);

		expect(err).toBeInstanceOf(CustomError);
		expect(err?.message).toBe("string error");
		expect(value).toBeUndefined();
	});

	test("works with taggedError-style classes", async () => {
		await using s = scope();

		// Simulating go-go-try's taggedError
		const DatabaseError = class extends Error {
			readonly _tag = "DatabaseError" as const;
			constructor(
				message: string,
				options?: { cause?: unknown },
			) {
				super(message, options);
				this.name = "DatabaseError";
			}
		};

		const NetworkError = class extends Error {
			readonly _tag = "NetworkError" as const;
			constructor(
				message: string,
				options?: { cause?: unknown },
			) {
				super(message, options);
				this.name = "NetworkError";
			}
		};

		// First operation fails with DatabaseError
		const [dbErr, user] = await s.task(
			() => Promise.reject(new Error("DB failed")),
			{ errorClass: DatabaseError },
		);

		if (dbErr) {
			expect(dbErr._tag).toBe("DatabaseError");
			expect(dbErr).toBeInstanceOf(DatabaseError);
		}

		// Second operation succeeds
		const [netErr, data] = await s.task(
			() => Promise.resolve({ id: "123", name: "Test" }),
			{ errorClass: NetworkError },
		);

		expect(netErr).toBeUndefined();
		expect(data).toEqual({ id: "123", name: "Test" });
	});

	test("combines with retry option", async () => {
		await using s = scope();

		class RetryableError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "RetryableError";
			}
		}

		let attempts = 0;
		const [err, value] = await s.task(
			() => {
				attempts++;
				if (attempts < 2) {
					throw new Error("transient failure");
				}
				return "success after retry";
			},
			{
				errorClass: RetryableError,
				retry: { maxRetries: 2 },
			},
		);

		expect(err).toBeUndefined();
		expect(value).toBe("success after retry");
		expect(attempts).toBe(2);
	});

	test("combines with timeout option", async () => {
		await using s = scope();

		class TimeoutError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "TimeoutError";
			}
		}

		const [err, value] = await s.task(
			() =>
				new Promise<string>((resolve) => {
					setTimeout(() => resolve("too late"), 1000);
				}),
			{
				errorClass: TimeoutError,
				timeout: 50,
			},
		);

		expect(err).toBeInstanceOf(TimeoutError);
		expect(err?.message).toContain("timeout");
		expect(value).toBeUndefined();
	});
});

// Mock OpenTelemetry tracer for testing
let mockSpanIdCounter = 0;

function createMockTracer(): { tracer: Tracer; spans: MockSpan[] } {
	const spans: MockSpan[] = [];

	const tracer: Tracer = {
		startSpan(
			name: string,
			options?: {
				attributes?: Record<string, unknown>;
				links?: {
					context: { traceId: string; spanId: string; traceFlags: number };
				}[];
			},
		) {
			const parentContext = options?.links?.[0]?.context;
			const span = new MockSpan(name, options?.attributes, parentContext);
			spans.push(span);
			return span;
		},
		startActiveSpan<F extends (span: Span) => unknown>(
			name: string,
			optionsOrFn: SpanOptions | F,
			_contextOrFn?: Context | F,
			fn?: F,
		): ReturnType<F> {
			// Simple implementation - just call the function with a new span
			const span = this.startSpan(name, optionsOrFn as SpanOptions);
			const callback = (
				typeof optionsOrFn === "function" ? optionsOrFn : fn
			) as F;
			return callback(span) as ReturnType<F>;
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
	parent?: { traceId: string; spanId: string; traceFlags: number };
	traceId: string;
	spanId: string;
	recording = true;

	constructor(
		name: string,
		attributes?: Record<string, unknown>,
		parentContext?: { traceId: string; spanId: string; traceFlags: number },
	) {
		this.name = name;
		this.attributes = attributes;
		this.parent = parentContext;
		this.traceId = parentContext?.traceId ?? `trace-${mockSpanIdCounter++}`;
		this.spanId = `span-${mockSpanIdCounter++}`;
	}

	spanContext() {
		return {
			traceId: this.traceId,
			spanId: this.spanId,
			traceFlags: 1,
		};
	}

	end(): void {
		this.ended = true;
	}

	recordException(exception: unknown): void {
		this.exceptions.push(exception);
	}

	setStatus(status: { code: number; message?: string }): this {
		this.status = status;
		return this;
	}

	setAttributes(attributes: Record<string, unknown>): this {
		this.attributes = { ...this.attributes, ...attributes };
		return this;
	}

	// Stub implementations for Span interface compatibility
	setAttribute(_key: string, _value: unknown): this {
		// Not implemented in mock
		return this;
	}

	addEvent(
		_name: string,
		_attributesOrStartTime?: unknown,
		_startTime?: unknown,
	): this {
		// Not implemented in mock
		return this;
	}

	addLink(_context: {
		context: { traceId: string; spanId: string; traceFlags: number };
	}): this {
		// Not implemented in mock
		return this;
	}

	addLinks(
		_contexts: {
			context: { traceId: string; spanId: string; traceFlags: number };
		}[],
	): this {
		// Not implemented in mock
		return this;
	}

	updateName(_name: string): this {
		// Not implemented in mock
		return this;
	}

	isRecording(): boolean {
		return this.recording;
	}
}
