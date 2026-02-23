/**
 * Property-based tests for Scope operations
 */

import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { scope } from "../src/index.js";

describe("Scope Property-Based Tests", () => {
	describe("task properties", () => {
		test("task result is consistent on multiple awaits", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async (value) => {
						await using s = scope();

						const task = s.task(async () => value);

						// Await the same task multiple times
						const [err1, result1] = await task;
						const [err2, result2] = await task;

						expect(err1).toBeUndefined();
						expect(err2).toBeUndefined();
						expect(result1).toBe(value);
						expect(result2).toBe(value);
					},
				),
				{ numRuns: 100 },
			);
		});

		test("failed task returns error in result tuple", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string(),
					async (errorMessage) => {
						await using s = scope();

						const task = s.task(async () => {
							throw new Error(errorMessage);
						});

						const [err, result] = await task;

						expect(err).toBeDefined();
						expect(result).toBeUndefined();
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("parallel properties", () => {
		test("parallel preserves order of results", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
					async (values) => {
						await using s = scope();

						const factories = values.map(
							(v) => () => Promise.resolve(v),
						);

						const results = await s.parallel(factories);

						// Results should be in same order as factories
						for (let i = 0; i < values.length; i++) {
							const [, result] = results[i];
							expect(result).toBe(values[i]);
						}
					},
				),
				{ numRuns: 100 },
			);
		});

		test("parallel with concurrency=1 is sequential", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
					async (values) => {
						await using s = scope();

						const executionOrder: number[] = [];
						const factories = values.map((v, i) => async () => {
							executionOrder.push(i);
							return v;
						});

						await s.parallel(factories, { concurrency: 1 });

						// With concurrency=1, order should be preserved
						expect(executionOrder).toEqual(
							values.map((_, i) => i),
						);
					},
				),
				{ numRuns: 50 },
			);
		});
	});

	describe("race properties", () => {
		test("race with single task returns that task's result", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async (value) => {
						await using s = scope();

						const [err, result] = await s.race([
							() => Promise.resolve(value),
						]);

						expect(err).toBeUndefined();
						expect(result).toBe(value);
					},
				),
				{ numRuns: 100 },
			);
		});

		test("race returns one of the provided values", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
					async (values) => {
						await using s = scope();

						const factories = values.map(
							(v) => () => Promise.resolve(v),
						);

						const [err, result] = await s.race(factories);

						expect(err).toBeUndefined();
						expect(values).toContain(result);
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("dependency injection properties", () => {
		test("provided service can be retrieved with use", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async (value) => {
						await using s = scope().provide("test", () => value);

						const retrieved = s.use("test");
						expect(retrieved).toBe(value);
					},
				),
				{ numRuns: 100 },
			);
		});

		test("has returns true for provided services", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async (value) => {
						await using s = scope().provide("test", () => value);

						expect(s.has("test")).toBe(true);
						expect(s.has("nonexistent")).toBe(false);
					},
				),
				{ numRuns: 100 },
			);
		});

		test("override replaces existing service", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					fc.integer(),
					async (original, replacement) => {
						await using s = scope()
							.provide("test", () => original)
							.override("test", () => replacement);

						const retrieved = s.use("test");
						expect(retrieved).toBe(replacement);
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("cancellation properties", () => {
		test("disposed scope rejects new tasks", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async (value) => {
						const s = scope();
						await s[Symbol.asyncDispose]();

						expect(() => s.task(async () => value)).toThrow();
					},
				),
				{ numRuns: 100 },
			);
		});

		test("signal is aborted after scope disposal", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer(),
					async () => {
						const s = scope();
						expect(s.signal.aborted).toBe(false);

						await s[Symbol.asyncDispose]();
						expect(s.signal.aborted).toBe(true);
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});
