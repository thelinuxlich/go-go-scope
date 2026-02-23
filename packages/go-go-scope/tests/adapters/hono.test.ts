/**
 * Hono adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope } from "../../src/index.js";

describe("Hono adapter", () => {
	test("exports scope for Hono integration", () => {
		const s = scope({ name: "hono-test" });
		expect(s).toBeDefined();
	});

	test("Hono middleware pattern", async () => {
		const rootScope = scope({ name: "hono-app" });

		// Simulate middleware creating request scope
		const requestScope = scope({
			parent: rootScope,
			name: "request-/api/users",
		});

		const [err, result] = await requestScope.task(async () => {
			return { users: ["user1", "user2"] };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ users: ["user1", "user2"] });

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});
});
