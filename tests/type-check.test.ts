/**
 * Type checking tests - verifies compile-time type safety
 */

import { describe, test, expect } from "vitest";
import { scope } from "../src/index.js";

describe("type safety", () => {
	test("use() is type-safe with provide()", () => {
		const s = scope()
			.provide("db", () => ({ query: () => "result" }))
			.provide("cache", () => ({ get: () => "cached" }))

		// These should work
		const db = s.use("db")
		const cache = s.use("cache")

		// Type inference should work
		expect(typeof db.query).toBe("function")
		expect(typeof cache.get).toBe("function")

		// @ts-expect-error - 'invalid' is not a valid service key
		const invalid = s.use("invalid")
	});

	test("has() is type-safe", () => {
		const s = scope().provide("api", () => ({ fetch: () => "data" }))

		// These should work
		expect(s.has("api")).toBe(true)

		// @ts-expect-error - 'other' is not a valid service key
		expect(s.has("other")).toBe(false)
	});

	test("override() is type-safe", () => {
		const s = scope()
			.provide("db", () => ({ name: "postgres" }))

		// Should work - same key
		s.override("db", () => ({ name: "mock" }))

		// @ts-expect-error - 'invalid' is not a valid service key
		// Also throws at runtime
		expect(() => s.override("invalid", () => ({}))).toThrow(
			"Cannot override service 'invalid'",
		)
	});

	test("task services are typed", async () => {
		await using s = scope()
			.provide("db", () => ({ query: (sql: string) => [sql] }))

		const [err, result] = await s.task(({ services }) => {
			// services.db should be typed
			return services.db.query("SELECT 1")
		})

		expect(err).toBeUndefined()
		expect(result).toEqual(["SELECT 1"])
	});

	test("chained provide tracks all services", () => {
		const s = scope()
			.provide("a", () => 1)
			.provide("b", () => 2)
			.provide("c", () => 3)

		// All should be accessible
		expect(s.use("a")).toBe(1)
		expect(s.use("b")).toBe(2)
		expect(s.use("c")).toBe(3)

		// @ts-expect-error - 'd' is not defined
		s.use("d")
	});
});
