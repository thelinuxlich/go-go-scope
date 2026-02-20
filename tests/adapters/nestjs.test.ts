/**
 * NestJS adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope } from "../../src/index.js";

describe("NestJS adapter", () => {
	test("exports scope for NestJS integration", () => {
		const s = scope({ name: "nestjs-test" });
		expect(s).toBeDefined();
	});

	test("NestJS root scope pattern", async () => {
		// Simulate @Injectable({ scope: Scope.DEFAULT })
		const rootScope = scope({ name: "nestjs-app", metrics: true });

		const [err, result] = await rootScope.task(async () => {
			return { service: "ready" };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ service: "ready" });

		await rootScope[Symbol.asyncDispose]();
	});

	test("NestJS request scope pattern", async () => {
		const rootScope = scope({ name: "nestjs-app" });

		// Simulate @Injectable({ scope: Scope.REQUEST })
		const requestScope = scope({
			parent: rootScope,
			name: "request-123",
		});

		const [err, result] = await requestScope.task(async () => {
			return { userId: "789", role: "admin" };
		});

		expect(err).toBeUndefined();
		expect(result).toEqual({ userId: "789", role: "admin" });

		await requestScope[Symbol.asyncDispose]();
		await rootScope[Symbol.asyncDispose]();
	});
});
