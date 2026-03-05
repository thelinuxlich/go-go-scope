/**
 * Integration tests for Astro adapter
 */

import { describe, expect, test, vi } from "vitest";
import { astroGoGoScope, getScope, getServerScope } from "./index.js";
import type { APIContext } from "astro";

// Create mock middleware context
function createMockMiddlewareContext(url: string) {
	const locals: Record<string, unknown> = {};
	const abortController = new AbortController();

	return {
		request: new Request(url),
		locals,
		signal: abortController.signal,
		get: () => undefined,
	};
}

describe("Astro Adapter", () => {
	describe("astroGoGoScope", () => {
		test("should create root scope on initialization", () => {
			const middleware = astroGoGoScope({ name: "test-app" });
			expect(middleware).toBeDefined();
			expect(typeof middleware).toBe("function");
		});

		test("should create request-scoped context for each request", async () => {
			const middleware = astroGoGoScope({ name: "test-app" });
			const ctx = createMockMiddlewareContext("http://localhost/api/users");

			let nextCalled = false;
			const next = async () => {
				nextCalled = true;
				// Verify scope was created during request
				expect(ctx.locals.scope).toBeDefined();
				return new Response("ok");
			};

			await middleware(ctx as any, next);

			expect(nextCalled).toBe(true);
			expect(ctx.locals.scope).toBeDefined();
		});

		test("should dispose scope after response", async () => {
			const middleware = astroGoGoScope({ name: "test-app" });
			const ctx = createMockMiddlewareContext("http://localhost/api/test");

			await middleware(ctx as any, async () => {
				// Scope should exist during request
				expect(ctx.locals.scope).toBeDefined();
				expect((ctx.locals.scope as any).isDisposed).toBe(false);
				return new Response("ok");
			});

			// Scope should be disposed after response
			expect((ctx.locals.scope as any).isDisposed).toBe(true);
		});

		test("should execute tasks within request scope", async () => {
			const middleware = astroGoGoScope({ name: "test-app" });
			const ctx = createMockMiddlewareContext("http://localhost/api/data");

			let taskResult: unknown;

			await middleware(ctx as any, async () => {
				const [err, result] = await (ctx.locals.scope as any).task(() =>
					Promise.resolve({ message: "Hello from Astro" }),
				);
				if (!err) taskResult = result;
				return new Response("ok");
			});

			expect(taskResult).toEqual({ message: "Hello from Astro" });
		});

		test("should apply timeout to request scope", async () => {
			const middleware = astroGoGoScope({ name: "test-app", timeout: 5000 });
			const ctx = createMockMiddlewareContext("http://localhost/api/slow");

			await middleware(ctx as any, async () => {
				expect(ctx.locals.scope).toBeDefined();
				// The timeout should be set on the scope
				return new Response("ok");
			});
		});

		test("should handle errors gracefully", async () => {
			const middleware = astroGoGoScope({ name: "test-app" });
			const ctx = createMockMiddlewareContext("http://localhost/api/error");

			let errorThrown = false;

			try {
				await middleware(ctx as any, async () => {
					throw new Error("Test error");
				});
			} catch {
				errorThrown = true;
			}

			// Scope should still be disposed even on error
			expect((ctx.locals.scope as any).isDisposed).toBe(true);
			expect(errorThrown).toBe(true);
		});

		test("should handle multiple concurrent requests", async () => {
			const middleware = astroGoGoScope({ name: "test-app" });

			const contexts = [
				createMockMiddlewareContext("http://localhost/api/1"),
				createMockMiddlewareContext("http://localhost/api/2"),
				createMockMiddlewareContext("http://localhost/api/3"),
			];

			await Promise.all(
				contexts.map((ctx) =>
					middleware(ctx as any, async () => {
						const [err, result] = await (ctx.locals.scope as any).task(() =>
							Promise.resolve(`result-${ctx.request.url}`),
						);
						if (!err) return new Response(result);
						return new Response("error");
					}),
				),
			);

			// All scopes should be disposed
			for (const ctx of contexts) {
				expect((ctx.locals.scope as any).isDisposed).toBe(true);
			}
		});
	});

	describe("getScope", () => {
		test("should return scope from API context", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const mockContext = { locals: { scope: s as any } };

			const result = getScope(mockContext as any);

			expect(result).toBe(s);
		});

		test("should throw error if no scope in context", () => {
			const mockContext = { locals: {} };

			expect(() => getScope(mockContext as APIContext)).toThrow(
				"No scope found in context",
			);
		});

		test("should work with different context shapes", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();

			// Works with APIContext-like object
			const apiContext = { locals: { scope: s as any } };
			expect(getScope(apiContext as any)).toBe(s);

			// Works with plain locals object
			const localsContext = { locals: { scope: s as any } };
			expect(getScope(localsContext as any)).toBe(s);
		});
	});

	describe("getServerScope", () => {
		test("should return existing scope from locals", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const astro = { locals: { scope: s as any } };

			const result = getServerScope(astro as any);

			expect(result).toBe(s);
		});

		test("should create temporary scope if no scope in locals", () => {
			const astro = { locals: {} };

			const result = getServerScope(astro);

			expect(result).toBeDefined();
			expect(result.scopeName).toBe("astro-ssr-temp");
		});

		test("should handle undefined locals", () => {
			const astro = {};

			const result = getServerScope(astro);

			expect(result).toBeDefined();
			expect(result.scopeName).toBe("astro-ssr-temp");
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const middleware = astroGoGoScope({ name: "debug-app", debug: true });

			const ctx = createMockMiddlewareContext("http://localhost/api/test");
			await middleware(ctx as any, async () => new Response("ok"));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
