/**
 * Integration tests for Cloudflare Workers adapter
 */

import { describe, expect, test, vi } from "vitest";
import {
	cloudflareWorkersGoGoScope,
	getScope,
	defineScopedHandler,
	withDurableObjectScope,
} from "./index.js";

// Mock ExecutionContext
function createMockExecutionContext(): ExecutionContext {
	const waitUntilPromises: Promise<unknown>[] = [];

	return {
		waitUntil: (promise: Promise<unknown>) => {
			waitUntilPromises.push(promise);
		},
		async flush() {
			await Promise.all(waitUntilPromises);
		},
	} as unknown as ExecutionContext;
}

// Mock Request
function createMockRequest(url: string): Request {
	return new Request(url);
}

describe("Cloudflare Workers Adapter", () => {
	describe("cloudflareWorkersGoGoScope", () => {
		test("should create middleware function", () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });
			expect(middleware).toBeDefined();
			expect(typeof middleware).toBe("function");
		});

		test("should create request-scoped scope for each request", async () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });
			const request = createMockRequest("https://api.example.com/users");
			const ctx = createMockExecutionContext();
			const env = {};

			let scopeReceived: any;

			await middleware(request, env, ctx, async (scope) => {
				scopeReceived = scope;
				return new Response("ok");
			});

			expect(scopeReceived).toBeDefined();
			expect(scopeReceived.scopeName).toMatch(/^request-/);
		});

		test("should execute tasks within request scope", async () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });
			const request = createMockRequest("https://api.example.com/data");
			const ctx = createMockExecutionContext();
			const env = {};

			const response = await middleware(request, env, ctx, async (scope) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ message: "Hello from Cloudflare" }),
				);
				if (err) return new Response("Error", { status: 500 });
				return new Response(JSON.stringify(result));
			});

			expect(response).toBeDefined();
			const body = await response.text();
			expect(body).toContain("Hello from Cloudflare");
		});

		test("should schedule scope disposal via waitUntil", async () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });
			const request = createMockRequest("https://api.example.com/test");
			const ctx = createMockExecutionContext();
			const env = {};

			let scopeReceived: any;

			await middleware(request, env, ctx, async (scope) => {
				scopeReceived = scope;
				expect(scopeReceived.isDisposed).toBe(false);
				return new Response("ok");
			});

			// Flush waitUntil promises
			await (ctx as any).flush();

			// After flush, scope should be disposed
			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should apply timeout to request scope", async () => {
			const middleware = cloudflareWorkersGoGoScope({
				name: "test-worker",
				timeout: 5000,
			});
			const request = createMockRequest("https://api.example.com/slow");
			const ctx = createMockExecutionContext();
			const env = {};

			const response = await middleware(request, env, ctx, async (scope) => {
				expect(scope).toBeDefined();
				return new Response("ok");
			});

			expect(response.status).toBe(200);
		});

		test("should handle errors gracefully", async () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });
			const request = createMockRequest("https://api.example.com/error");
			const ctx = createMockExecutionContext();
			const env = {};

			let errorThrown = false;

			try {
				await middleware(request, env, ctx, async () => {
					throw new Error("Test error");
				});
			} catch {
				errorThrown = true;
			}

			expect(errorThrown).toBe(true);
		});

		test("should handle multiple concurrent requests", async () => {
			const middleware = cloudflareWorkersGoGoScope({ name: "test-worker" });

			const requests = [
				createMockRequest("https://api.example.com/1"),
				createMockRequest("https://api.example.com/2"),
				createMockRequest("https://api.example.com/3"),
			];

			const scopes: any[] = [];

			await Promise.all(
				requests.map((request) => {
					const ctx = createMockExecutionContext();
					return middleware(request, {}, ctx, async (scope) => {
						scopes.push(scope);
						return new Response("ok");
					});
				}),
			);

			// All scopes should be independent
			expect(scopes.length).toBe(3);
			expect(scopes[0]).not.toBe(scopes[1]);
			expect(scopes[1]).not.toBe(scopes[2]);
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

	describe("defineScopedHandler", () => {
		test("should create handler with scope access", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			const handler = defineScopedHandler(async (request, scope, _env, _ctx) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ url: request.url }),
				);
				if (err) return new Response("Error", { status: 500 });
				return new Response(JSON.stringify(result));
			});

			const request = createMockRequest("https://api.example.com/test");
			const response = await handler(request, s as any, {}, createMockExecutionContext());

			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).toContain("api.example.com");
		});
	});

	describe("withDurableObjectScope", () => {
		test("should create scope for Durable Object", async () => {
			const request = createMockRequest("https://api.example.com/do");

			let scopeReceived: any;

			const result = await withDurableObjectScope(
				request,
				async (scope) => {
					scopeReceived = scope;
					return { success: true };
				},
				{ name: "test-do" },
			);

			expect(scopeReceived).toBeDefined();
			expect(scopeReceived.scopeName).toBe("test-do");
			expect(result).toEqual({ success: true });
			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should apply timeout to Durable Object scope", async () => {
			const request = createMockRequest("https://api.example.com/do");

			const result = await withDurableObjectScope(
				request,
				async (scope) => {
					expect(scope).toBeDefined();
					return "ok";
				},
				{ timeout: 5000 },
			);

			expect(result).toBe("ok");
		});

		test("should dispose scope even on error", async () => {
			const request = createMockRequest("https://api.example.com/do");

			let scopeReceived: any;
			let errorThrown = false;

			try {
				await withDurableObjectScope(
					request,
					async (scope) => {
						scopeReceived = scope;
						throw new Error("DO error");
					},
				);
			} catch {
				errorThrown = true;
			}

			expect(errorThrown).toBe(true);
			expect(scopeReceived.isDisposed).toBe(true);
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const middleware = cloudflareWorkersGoGoScope({
				name: "debug-worker",
				debug: true,
			});
			const request = createMockRequest("https://api.example.com/test");
			const ctx = createMockExecutionContext();

			await middleware(request, {}, ctx, async () => {
				return new Response("ok");
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
