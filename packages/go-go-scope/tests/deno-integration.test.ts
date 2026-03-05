/**
 * Deno integration tests for go-go-scope
 */

import { scope, Task } from "../src/index.ts";
import { describe, test } from "vitest";

// Skip if Deno is not available
const isDeno = typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";

function expect<T>(value: T) {
	return {
		toBe(expected: T) {
			if (value !== expected) {
				throw new Error(`Expected ${expected} but got ${value}`);
			}
		},
		toEqual(expected: T) {
			if (JSON.stringify(value) !== JSON.stringify(expected)) {
				throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
			}
		},
		toBeDefined() {
			if (value === undefined) {
				throw new Error(`Expected value to be defined`);
			}
		},
		toBeUndefined() {
			if (value !== undefined) {
				throw new Error(`Expected value to be undefined`);
			}
		},
		toBeNull() {
			if (value !== null) {
				throw new Error(`Expected value to be null`);
			}
		},
		toBeGreaterThan(expected: number) {
			if ((value as unknown as number) <= expected) {
				throw new Error(`Expected ${value} to be greater than ${expected}`);
			}
		},
		get not() {
			return {
				toBeUndefined() {
					if (value === undefined) {
						throw new Error(`Expected value not to be undefined`);
					}
				},
			};
		},
	};
}

describe.skipIf(!isDeno)("Deno Integration", () => {
	test("should create a scope", async () => {
		await using s = scope({ name: "deno-test" });
		expect(s).toBeDefined();
		expect(s.scopeName).toBe("deno-test");
	});

	test("should execute a task", async () => {
		await using s = scope();
		const result = await s.task(() => Promise.resolve(42));
		expect(result[0]).toBeUndefined();
		expect(result[1]).toBe(42);
	});

	test("should handle task errors", async () => {
		await using s = scope();
		const result = await s.task(() => Promise.reject(new Error("test error")));
		expect(result[0]).not.toBeUndefined();
		expect(result[1]).toBeUndefined();
	});

	test("should support parallel execution", async () => {
		await using s = scope();
		const factories = [
			() => Promise.resolve(1),
			() => Promise.resolve(2),
			() => Promise.resolve(3),
		];
		const results = await s.parallel(factories);
		expect(results.length).toBe(3);
		expect(results[0]![1]).toBe(1);
		expect(results[1]![1]).toBe(2);
		expect(results[2]![1]).toBe(3);
	});

	test("should support race", async () => {
		await using s = scope();
		const factories = [
			() => new Promise<number>((resolve) => setTimeout(() => resolve(1), 100)),
			() => new Promise<number>((resolve) => setTimeout(() => resolve(2), 50)),
		];
		const result = await s.race(factories);
		expect(result[0]).toBeUndefined();
		expect(result[1]).toBe(2);
	});

	test("should create channels", async () => {
		await using s = scope();
		const ch = s.channel<number>(10);
		expect(ch).toBeDefined();
		expect(ch.capacity).toBe(10);
		expect(ch.size).toBe(0);
	});

	test("should support timeouts", async () => {
		await using s = scope({ timeout: 100 });
		const result = await s.task(() => new Promise((resolve) => setTimeout(resolve, 200)));
		expect(result[0]).not.toBeUndefined();
	});
});

if (isDeno) {
	console.log("🦕 Running Deno integration tests...");
}
