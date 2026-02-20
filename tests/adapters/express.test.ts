/**
 * Express adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope } from "../../src/index.js";

describe("Express adapter", () => {
	test("exports scope for Express integration", () => {
		const s = scope({ name: "express-test" });
		expect(s).toBeDefined();
		expect(s.task).toBeDefined();
	});

	test("Express integration pattern works", async () => {
		const rootScope = scope({ name: "express-app" });

		// Simulate middleware creating request scope
		const requestScope = scope({
			parent: rootScope,
			name: "request-123",
		});

		// Simulate route handler
		const [err, result] = await requestScope.task(async () => {
			return { userId: "456", email: "test@example.com" };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ userId: "456", email: "test@example.com" });

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});

	test("Express error handling", async () => {
		const rootScope = scope({ name: "express-app" });
		const requestScope = scope({ parent: rootScope, name: "request-789" });

		const [err] = await requestScope.task(async () => {
			throw new Error("Not found");
		});

		expect(err).toBeInstanceOf(Error);
		expect(err?.message).toBe("Not found");

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});
});
