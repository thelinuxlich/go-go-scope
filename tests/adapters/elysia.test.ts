/**
 * Elysia adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope } from "../../src/index.js";

describe("Elysia adapter", () => {
	test("exports scope for Elysia integration", () => {
		const s = scope({ name: "elysia-test" });
		expect(s).toBeDefined();
	});

	test("Elysia onRequest pattern", async () => {
		const rootScope = scope({ name: "elysia-app" });

		// Simulate onRequest hook creating scope
		const requestScope = scope({
			parent: rootScope,
			name: "request-/users/123",
		});

		const [err, result] = await requestScope.task(async () => {
			return { id: "123", name: "Alice" };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ id: "123", name: "Alice" });

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});

	test("Elysia with Bun runtime", async () => {
		// Elysia is optimized for Bun
		const appScope = scope({ name: "elysia-bun-app" });

		const [err, result] = await appScope.task(async () => {
			// Would use Bun's native fetch
			return { runtime: "bun", fast: true };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ runtime: "bun", fast: true });

		await appScope[Symbol.asyncDispose]();
	});
});
