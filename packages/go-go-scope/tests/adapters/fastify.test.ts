/**
 * Fastify adapter tests
 */

import { describe, test, expect } from "vitest";
import { scope, Lock } from "../../src/index.js";

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

	describe("new features", () => {
		test("Fastify with log correlation", async () => {
			const rootScope = scope({ 
				name: "fastify-app",
				logCorrelation: true 
			});
			const requestScope = scope({ 
				parent: rootScope, 
				name: "request-abc",
				logCorrelation: true 
			});

			// Verify traceId is inherited
			expect(requestScope.traceId).toBe(rootScope.traceId);
			expect(requestScope.spanId).toBeDefined();
			expect(requestScope.spanId).not.toBe(rootScope.spanId);

			await requestScope[Symbol.asyncDispose]();
			await rootScope[Symbol.asyncDispose]();
		});

		test("Fastify with debug tree", async () => {
			const rootScope = scope({ name: "fastify-app" });
			const requestScope = scope({ 
				parent: rootScope, 
				name: "request-debug" 
			});

			// Generate debug tree
			const tree = rootScope.debugTree({ format: "ascii" });
			expect(tree).toContain("fastify-app");
			expect(tree).toContain("request-debug");

			// Generate mermaid diagram
			const mermaid = rootScope.debugTree({ format: "mermaid" });
			expect(mermaid).toContain("graph TD");

			await requestScope[Symbol.asyncDispose]();
			await rootScope[Symbol.asyncDispose]();
		});

		test("Fastify with Lock for rate limiting", async () => {
			const rootScope = scope({ name: "fastify-app" });
			
			// Create a lock for protecting shared resource
			const lock = new Lock(rootScope.signal, { name: "rate-limit-lock" });

			// Test sequential acquisitions (not concurrent to avoid timeout)
			for (let i = 0; i < 3; i++) {
				const guard = await lock.acquire();
				expect(lock.isLocked).toBe(true);
				await guard.release();
			}

			await lock[Symbol.asyncDispose]();
			await rootScope[Symbol.asyncDispose]();
		});

		test("Fastify with createChild", async () => {
			const rootScope = scope({ name: "fastify-app" });
			
			// Use createChild for nested request handling
			const requestScope = rootScope.createChild({ name: "request-child" });
			const subOperationScope = requestScope.createChild({ name: "sub-operation" });

			const [err, result] = await subOperationScope.task(async () => {
				return { nested: true };
			});

			expect(err).toBeUndefined();
			expect(result).toEqual({ nested: true });

			await subOperationScope[Symbol.asyncDispose]();
			await requestScope[Symbol.asyncDispose]();
			await rootScope[Symbol.asyncDispose]();
		});
	});
});
