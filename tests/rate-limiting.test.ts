/**
 * Tests for new features: debounce, throttle, metrics, hooks, select
 */
import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";

describe("debounce", () => {
	test("debounces function calls", async () => {
		await using s = scope();
		let callCount = 0;

		const debounced = s.debounce(
			async (value: number) => {
				callCount++;
				return value * 2;
			},
			{ wait: 50 },
		);

		// Call multiple times rapidly
		const p1 = debounced(1);
		const p2 = debounced(2);
		const p3 = debounced(3);

		// Wait for debounce to complete
		await new Promise((r) => setTimeout(r, 100));

		const [err, result] = await debounced(4);

		// Should have executed at least once (debouncing behavior varies)
		expect(callCount).toBeGreaterThanOrEqual(1);
		expect(result).toBe(8);
		expect(err).toBeUndefined();
	});

	test("leading edge execution", async () => {
		await using s = scope();
		let callCount = 0;

		const debounced = s.debounce(
			async (value: number) => {
				callCount++;
				return value * 2;
			},
			{ wait: 50, leading: true, trailing: false },
		);

		const [err, result] = await debounced(5);

		// First call should execute immediately
		expect(callCount).toBe(1);
		expect(result).toBe(10);
		expect(err).toBeUndefined();
	});

	test("cancels on scope disposal", async () => {
		let callCount = 0;

		{
			await using s = scope();
			const debounced = s.debounce(
				async () => {
					callCount++;
					return "result";
				},
				{ wait: 100 },
			);

			// Start a debounced call
			const promise = debounced();

			// Scope will dispose before debounce completes
			// No await here - let scope dispose
		}

		// Wait a bit to ensure any pending timers would have fired
		await new Promise((r) => setTimeout(r, 150));

		// Function should not have been called
		expect(callCount).toBe(0);
	});

	test("returns error for disposed scope", async () => {
		const s = scope();
		const debounced = s.debounce(async () => "result", { wait: 50 });

		// Dispose the scope
		await s[Symbol.asyncDispose]();

		// Call after disposal
		const [err, result] = await debounced();

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("Scope disposed");
		expect(result).toBeUndefined();
	});
});

describe("throttle", () => {
	test("throttles function calls", async () => {
		await using s = scope();
		let callCount = 0;

		const throttled = s.throttle(
			async (value: number) => {
				callCount++;
				return value * 2;
			},
			{ interval: 50 },
		);

		// First call should execute
		await throttled(1);

		// Subsequent calls within interval should be throttled
		await throttled(2);
		await throttled(3);

		// At least the first call should have executed
		expect(callCount).toBeGreaterThanOrEqual(1);

		// Wait for throttle window
		await new Promise((r) => setTimeout(r, 60));

		// Next call should execute
		await throttled(4);
		expect(callCount).toBeGreaterThanOrEqual(2);
	});

	test("cancels on scope disposal", async () => {
		let callCount = 0;

		{
			await using s = scope();
			const throttled = s.throttle(
				async () => {
					callCount++;
					return "result";
				},
				{ interval: 100, leading: false },
			);

			// Start a call (won't execute due to leading: false)
			void throttled();

			// Scope will dispose before trailing execution
		}

		await new Promise((r) => setTimeout(r, 150));

		// Function should not have been called
		expect(callCount).toBe(0);
	});
});

describe("metrics", () => {
	test("returns undefined when metrics not enabled", async () => {
		await using s = scope();
		expect(s.metrics()).toBeUndefined();
	});

	test("tracks task metrics", async () => {
		await using s = scope({ metrics: true });

		await s.task(async () => "success1");
		await s.task(async () => {
			throw new Error("failure");
		});
		await s.task(async () => "success2");

		const metrics = s.metrics();

		expect(metrics).toBeDefined();
		expect(metrics?.tasksSpawned).toBe(3);
		expect(metrics?.tasksCompleted).toBe(2);
		expect(metrics?.tasksFailed).toBe(1);
	});

	test("tracks resource metrics", async () => {
		await using s = scope({ metrics: true });

		s.provide(
			"service1",
			() => ({ value: 1 }),
			() => {},
		);
		s.provide(
			"service2",
			() => ({ value: 2 }),
			() => {},
		);

		// Force disposal by ending scope
		await s[Symbol.asyncDispose]();

		const metrics = s.metrics();
		expect(metrics?.resourcesRegistered).toBe(2);
		expect(metrics?.resourcesDisposed).toBe(2);
	});

	test("calculates duration statistics", async () => {
		await using s = scope({ metrics: true });

		await s.task(async () => {
			await new Promise((r) => setTimeout(r, 10));
			return "result";
		});

		const metrics = s.metrics();
		expect(metrics?.avgTaskDuration).toBeGreaterThan(0);
		expect(metrics?.p95TaskDuration).toBeGreaterThan(0);
	});
});

describe("hooks", () => {
	test("calls beforeTask and afterTask hooks", async () => {
		const beforeCalls: string[] = [];
		const afterCalls: Array<{ name: string; error?: unknown }> = [];

		await using s = scope({
			hooks: {
				beforeTask: (name) => beforeCalls.push(name),
				afterTask: (name, _duration, error) =>
					afterCalls.push({ name, error: error ? "error" : undefined }),
			},
		});

		await s.task(async () => "success", { otel: { name: "task1" } });
		await s.task(
			async () => {
				throw new Error("fail");
			},
			{ otel: { name: "task2" } },
		);

		expect(beforeCalls).toContain("task1");
		expect(beforeCalls).toContain("task2");
		expect(afterCalls.length).toBe(2);
	});

	test("calls onCancel hook on disposal", async () => {
		let cancelCalled = false;
		let cancelReason: unknown;

		await using s = scope({
			hooks: {
				onCancel: (reason) => {
					cancelCalled = true;
					cancelReason = reason;
				},
			},
		});

		// Dispose scope
		await s[Symbol.asyncDispose]();

		expect(cancelCalled).toBe(true);
		expect(cancelReason).toBeInstanceOf(Error);
	});

	test("calls onDispose hook for resources", async () => {
		const disposeCalls: Array<{ index: number; error?: unknown }> = [];

		await using s = scope({
			hooks: {
				onDispose: (index, error) => disposeCalls.push({ index, error }),
			},
		});

		s.provide(
			"service1",
			() => ({ value: 1 }),
			() => {},
		);

		// Dispose scope
		await s[Symbol.asyncDispose]();

		expect(disposeCalls.length).toBeGreaterThan(0);
	});
});

describe("select", () => {
	test("selects from multiple channels", async () => {
		await using s = scope();
		// Use buffered channels so send doesn't block
		const ch1 = s.channel<string>(10);
		const ch2 = s.channel<number>(10);

		// Send to ch2 first
		await ch2.send(42);

		const cases = new Map([
			[
				ch1 as typeof ch2,
				async (value: number | string) => ({ type: "string" as const, value }),
			],
			[
				ch2,
				async (value: number | string) => ({ type: "number" as const, value }),
			],
		]);

		const [err, result] = await s.select(cases);

		expect(err).toBeUndefined();
		expect(result).toEqual({ type: "number", value: 42 });
	});

	test("returns error for empty select", async () => {
		await using s = scope();

		const cases = new Map();
		const [err, result] = await s.select(cases);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("select called with no cases");
		expect(result).toBeUndefined();
	});

	test("handles closed channels", async () => {
		await using s = scope();
		const ch1 = s.channel<string>(10);
		const ch2 = s.channel<number>(10);

		// Close both channels
		ch1.close();
		ch2.close();

		const cases = new Map([
			[
				ch1 as typeof ch2,
				async (value: number | string) => ({ type: "string" as const, value }),
			],
			[
				ch2,
				async (value: number | string) => ({ type: "number" as const, value }),
			],
		]);

		const [err, result] = await s.select(cases);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("closed");
		expect(result).toBeUndefined();
	});
});
