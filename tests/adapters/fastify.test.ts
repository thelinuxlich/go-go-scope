/**
 * Fastify adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope } from "../../src/index.js";

describe("Fastify adapter", () => {
	test("exports scope for Fastify integration", () => {
		const s = scope({ name: "fastify-test" });
		expect(s).toBeDefined();
		expect(s.task).toBeDefined();
	});

	test("Fastify integration pattern works", async () => {
		// Simulate Fastify app setup
		const rootScope = scope({ name: "fastify-app" });

		// Simulate request scope
		const requestScope = scope({
			parent: rootScope,
			name: "request-123",
		});

		// Simulate route handler
		const [err, result] = await requestScope.task(async () => {
			return { userId: "123", name: "Test User" };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ userId: "123", name: "Test User" });

		// Cleanup
		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});

	test("Fastify error handling pattern", async () => {
		const rootScope = scope({ name: "fastify-app" });
		const requestScope = scope({ parent: rootScope, name: "request-456" });

		const [err, result] = await requestScope.task(async () => {
			throw new Error("Database connection failed");
		});

		// Fastify would return 500 with error message
		expect(err).toBeInstanceOf(Error);
		expect(err?.message).toBe("Database connection failed");
		expect(result).toBeUndefined();

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});

	test("Fastify retry pattern", async () => {
		let attempts = 0;
		const rootScope = scope({ name: "fastify-app" });
		const requestScope = scope({ parent: rootScope, name: "request-789" });

		const [err, result] = await requestScope.task(
			async () => {
				attempts++;
				if (attempts < 3) throw new Error("Temporary failure");
				return { data: "success" };
			},
			{ retry: { maxRetries: 3, delay: 10 } },
		);

		expect(err).toBeUndefined();
		expect(result).toEqual({ data: "success" });
		expect(attempts).toBe(3);

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});
});
