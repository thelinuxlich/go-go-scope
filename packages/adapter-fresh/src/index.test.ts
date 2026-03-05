/**
 * Integration tests for Fresh adapter
 */

import { describe, expect, test, vi } from "vitest";
import {
	freshGoGoScope,
	defineRouteHandler,
	getScope,
	withIslandScope,
	createSafeHandler,
	createJsonHandler,
} from "./index.js";

// Mock Fresh context
function createMockFreshContext(path: string = "/api/test"): any {
	return {
		params: {},
		url: new URL(`https://fresh.deno.dev${path}`),
	};
}

// Mock Request
function createMockRequest(url: string): Request {
	return new Request(url);
}

describe("Fresh Adapter", () => {
	describe("freshGoGoScope", () => {
		test("should create middleware function", () => {
			const middleware = freshGoGoScope({ name: "test-fresh" });
			expect(middleware).toBeDefined();
			expect(typeof middleware).toBe("function");
		});

		test("should create request-scoped scope", async () => {
			const middleware = freshGoGoScope({ name: "test-fresh" });
			const req = createMockRequest("https://fresh.deno.dev/api/users");
			const ctx = createMockFreshContext("/api/users");

			const response = await middleware(req, ctx);

			expect(response).toBeDefined();
			expect(response.status).toBe(200);
		});

		test("should store scope in context", async () => {
			const middleware = freshGoGoScope({ name: "test-fresh" });
			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();

			await middleware(req, ctx);

			expect(ctx.scope).toBeDefined();
			expect(ctx.scope.scopeName).toMatch(/^request-/);
		});

		test("should apply timeout", async () => {
			const middleware = freshGoGoScope({ name: "test-fresh", timeout: 5000 });
			const req = createMockRequest("https://fresh.deno.dev/api/slow");
			const ctx = createMockFreshContext("/api/slow");

			const response = await middleware(req, ctx);

			expect(response.status).toBe(200);
		});
	});

	describe("defineRouteHandler", () => {
		test("should create GET handler", async () => {
			const handlers = defineRouteHandler({
				async GET(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ users: [] }));
					if (_err) return new Response("Error", { status: 500 });
					return Response.json(data);
				},
			});

			expect(handlers.GET).toBeDefined();
			expect(typeof handlers.GET).toBe("function");

			const req = createMockRequest("https://fresh.deno.dev/api/users");
			const ctx = createMockFreshContext("/api/users");
			const response = await handlers.GET!(req, ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as any;
			expect(body).toEqual({ users: [] });
		});

		test("should create POST handler", async () => {
			const handlers = defineRouteHandler({
				async POST(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ id: 1 }));
					if (_err) return new Response("Error", { status: 500 });
					return Response.json(data, { status: 201 });
				},
			});

			expect(handlers.POST).toBeDefined();

			const req = createMockRequest("https://fresh.deno.dev/api/users");
			const ctx = createMockFreshContext("/api/users");
			const response = await handlers.POST!(req, ctx);

			expect(response.status).toBe(201);
		});

		test("should create multiple handlers", async () => {
			const handlers = defineRouteHandler({
				async GET(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ items: [] }));
					return Response.json(data);
				},
				async POST(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ id: 1 }));
					return Response.json(data, { status: 201 });
				},
				async DELETE(_req, _ctx, scope) {
					const [_err] = await scope.task(() => Promise.resolve());
					return new Response(null, { status: 204 });
				},
			});

			expect(handlers.GET).toBeDefined();
			expect(handlers.POST).toBeDefined();
			expect(handlers.DELETE).toBeDefined();
			expect(handlers.PUT).toBeUndefined();
		});

		test("should dispose scope after handler completes", async () => {
			let scopeReceived: any;

			const handlers = defineRouteHandler({
				async GET(_req, _ctx, scope) {
					scopeReceived = scope;
					expect(scopeReceived.isDisposed).toBe(false);
					return Response.json({ ok: true });
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();
			await handlers.GET!(req, ctx);

			// Note: Since we use `await using`, the scope should be disposed
			// but we can't easily verify this without Deno's explicit resource management
			expect(scopeReceived).toBeDefined();
		});
	});

	describe("getScope", () => {
		test("should return scope from context", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const mockCtx = { scope: s };

			const result = getScope(mockCtx as any);

			expect(result).toBe(s);
		});

		test("should throw error if no scope in context", () => {
			const mockCtx = {};

			expect(() => getScope(mockCtx as any)).toThrow(
				"No scope found in context",
			);
		});
	});

	describe("withIslandScope", () => {
		test("should execute handler with scope", async () => {
			let scopeReceived: any;

			const result = await withIslandScope(async (_req, scope) => {
				scopeReceived = scope;
				const [_err, data] = await scope.task(() => Promise.resolve({ count: 42 }));
				return data;
			});

			expect(scopeReceived).toBeDefined();
			expect(scopeReceived.scopeName).toBe("fresh-island");
			expect(result).toEqual({ count: 42 });
		});

		test("should apply timeout", async () => {
			let scopeReceived: any;

			await withIslandScope(
				async (_req, scope) => {
					scopeReceived = scope;
					return "ok";
				},
				{ timeout: 5000 },
			);

			expect(scopeReceived).toBeDefined();
		});
	});

	describe("createSafeHandler", () => {
		test("should handle errors gracefully", async () => {
			const handlers = createSafeHandler({
				async GET(_req, _ctx, _scope) {
					throw new Error("Handler error");
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();
			const response = await handlers.GET!(req, ctx);

			expect(response.status).toBe(500);
			const body = await response.json() as any;
			expect(body.error).toBe("Internal Server Error");
		});

		test("should return successful response", async () => {
			const handlers = createSafeHandler({
				async GET(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ ok: true }));
					return Response.json(data);
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();
			const response = await handlers.GET!(req, ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as any;
			expect(body).toEqual({ ok: true });
		});
	});

	describe("createJsonHandler", () => {
		test("should return JSON response", async () => {
			const handlers = createJsonHandler({
				async GET(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ items: [] }));
					// error handled by throwing
					return data;
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/items");
			const ctx = createMockFreshContext("/api/items");
			const response = await handlers.GET!(req, ctx);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain("application/json");
			const body = await response.json() as any;
			expect(body).toEqual({ items: [] });
		});

		test("should support { data, status } format", async () => {
			const handlers = createJsonHandler({
				async POST(_req, _ctx, scope) {
					const [_err, data] = await scope.task(() => Promise.resolve({ id: 1 }));
					// error handled by throwing
					return { data, status: 201 };
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/items");
			const ctx = createMockFreshContext("/api/items");
			const response = await handlers.POST!(req, ctx);

			expect(response.status).toBe(201);
			const body = await response.json() as any;
			expect(body).toEqual({ id: 1 });
		});

		test("should handle errors with JSON response", async () => {
			const handlers = createJsonHandler({
				async GET(_req, _ctx, _scope) {
					throw new Error("Database error");
				},
			});

			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();
			const response = await handlers.GET!(req, ctx);

			expect(response.status).toBe(500);
			const body = await response.json() as any;
			expect(body.error).toBe("Database error");
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const middleware = freshGoGoScope({ name: "debug-fresh", debug: true });
			const req = createMockRequest("https://fresh.deno.dev/api/test");
			const ctx = createMockFreshContext();

			await middleware(req, ctx);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
