/**
 * Integration tests for Vercel Edge adapter
 */

import { describe, expect, test, vi } from "vitest";
import {
	vercelEdgeGoGoScope,
	nextEdgeHandler,
	getScope,
	rateLimit,
	kvGet,
	kvSet,
	getEdgeConfig,
} from "./index.js";

// Mock Vercel Edge Request
function createMockEdgeRequest(url: string, opts: { ip?: string } = {}): Request {
	return new Request(url, {
		headers: {
			"x-forwarded-for": opts.ip || "127.0.0.1",
		},
	});
}

describe("Vercel Edge Adapter", () => {
	describe("vercelEdgeGoGoScope", () => {
		test("should create middleware function", () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			expect(middleware).toBeDefined();
			expect(typeof middleware).toBe("function");
		});

		test("should create request-scoped scope for each request", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			const request = createMockEdgeRequest("https://api.example.com/users");

			let scopeReceived: any;

			await middleware(request, async (scope) => {
				scopeReceived = scope;
				return new Response("ok");
			});

			expect(scopeReceived).toBeDefined();
			expect(scopeReceived.scopeName).toMatch(/^request-/);
		});

		test("should execute tasks within request scope", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			const request = createMockEdgeRequest("https://api.example.com/data");

			const response = await middleware(request, async (scope) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ message: "Hello from Vercel Edge" }),
				);
				if (err) return new Response("Error", { status: 500 });
				return new Response(JSON.stringify(result));
			});

			expect(response).toBeDefined();
			const body = await response.text();
			expect(body).toContain("Hello from Vercel Edge");
		});

		test("should dispose scope after response", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			const request = createMockEdgeRequest("https://api.example.com/test");

			let scopeReceived: any;

			await middleware(request, async (scope) => {
				scopeReceived = scope;
				expect(scopeReceived.isDisposed).toBe(false);
				return new Response("ok");
			});

			// After handler completes, scope should be disposed
			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should apply timeout to request scope", async () => {
			const middleware = vercelEdgeGoGoScope({
				name: "test-edge",
				timeout: 5000,
			});
			const request = createMockEdgeRequest("https://api.example.com/slow");

			const response = await middleware(request, async (scope) => {
				expect(scope).toBeDefined();
				return new Response("ok");
			});

			expect(response.status).toBe(200);
		});

		test("should handle errors gracefully", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			const request = createMockEdgeRequest("https://api.example.com/error");

			let errorThrown = false;
			let scopeReceived: any;

			try {
				await middleware(request, async (scope) => {
					scopeReceived = scope;
					throw new Error("Test error");
				});
			} catch {
				errorThrown = true;
			}

			expect(errorThrown).toBe(true);
			// Scope should still be disposed on error
			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should handle multiple concurrent requests", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });

			const requests = [
				createMockEdgeRequest("https://api.example.com/1"),
				createMockEdgeRequest("https://api.example.com/2"),
				createMockEdgeRequest("https://api.example.com/3"),
			];

			const scopes: any[] = [];

			await Promise.all(
				requests.map((request) =>
					middleware(request, async (scope) => {
						scopes.push(scope);
						return new Response("ok");
					}),
				),
			);

			// All scopes should be independent
			expect(scopes.length).toBe(3);
			expect(scopes[0]).not.toBe(scopes[1]);
			expect(scopes[1]).not.toBe(scopes[2]);
		});

		test("should pass request to handler", async () => {
			const middleware = vercelEdgeGoGoScope({ name: "test-edge" });
			const request = createMockEdgeRequest("https://api.example.com/test", {
				ip: "192.168.1.1",
			});

			let receivedRequest: any;

			await middleware(request, async (_scope, req) => {
				receivedRequest = req;
				return new Response("ok");
			});

			expect(receivedRequest).toBeDefined();
			expect(receivedRequest.url).toBe("https://api.example.com/test");
		});
	});

	describe("nextEdgeHandler", () => {
		test("should create Next.js Edge handler", async () => {
			const handler = nextEdgeHandler(async (request, scope) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ url: request.url }),
				);
				if (err) return new Response("Error", { status: 500 });
				return new Response(JSON.stringify(result));
			});

			const request = createMockEdgeRequest("https://api.example.com/test");
			const response = await handler(request);

			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).toContain("api.example.com");
		});

		test("should apply custom options", async () => {
			const handler = nextEdgeHandler(
				async (_request, scope) => {
					expect(scope).toBeDefined();
					return new Response("ok");
				},
				{ name: "custom-next-handler", timeout: 10000 },
			);

			const request = createMockEdgeRequest("https://api.example.com/test");
			const response = await handler(request);

			expect(response.status).toBe(200);
		});
	});

	describe("getScope", () => {
		test("should return scope from context", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const mockContext = { scope: s as any };

			const result = getScope(mockContext as any);

			expect(result).toBe(s);
		});

		test("should throw error if no scope in context", () => {
			const mockContext = {};

			expect(() => getScope(mockContext as any)).toThrow(
				"No scope found in context",
			);
		});
	});

	describe("helpers", () => {
		test("rateLimit should return allowed by default", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			const [err, allowed] = await rateLimit(s as any, "user-123", {
				maxRequests: 100,
				windowMs: 60000,
			});

			expect(err).toBeUndefined();
			expect(allowed).toBe(true);
		});

		test("kvGet should return null by default", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			const [err, data] = await kvGet(s as any, "key");

			expect(err).toBeUndefined();
			expect(data).toBeNull();
		});

		test("kvSet should return true by default", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			const [err, success] = await kvSet(s as any, "key", { data: "value" }, 3600);

			expect(err).toBeUndefined();
			expect(success).toBe(true);
		});

		test("getEdgeConfig should return config by default", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			const [err, config] = await getEdgeConfig(s as any, "feature-flag");

			expect(err).toBeUndefined();
			expect(config).toEqual({ key: "feature-flag", value: true });
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const middleware = vercelEdgeGoGoScope({
				name: "debug-edge",
				debug: true,
			});
			const request = createMockEdgeRequest("https://api.example.com/test");

			await middleware(request, async () => {
				return new Response("ok");
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
