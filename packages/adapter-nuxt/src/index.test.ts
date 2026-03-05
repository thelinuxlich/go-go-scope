/**
 * Integration tests for Nuxt adapter
 */

import { describe, expect, test, vi } from "vitest";
import { getScope, nuxtGoGoScope } from "./index.js";
import type { NitroApp } from "nitropack";

// Create mock Nitro app
function createMockNitroApp(): NitroApp {
	const hooks: Record<string, ((...args: unknown[]) => Promise<void> | void)[]> = {};

	return {
		hooks: {
			hook: (name: string, fn: (...args: unknown[]) => Promise<void> | void) => {
				if (!hooks[name]) hooks[name] = [];
				hooks[name].push(fn);
			},
			callHook: async (name: string, ...args: unknown[]) => {
				const handlers = hooks[name] || [];
				for (const fn of handlers) {
					await fn(...args);
				}
			},
		},
	} as unknown as NitroApp;
}

// Create mock H3 event
function createMockH3Event(url: string, sessionId?: string) {
	const abortController = new AbortController();
	return {
		context: {
			sessionId: sessionId || `test-${Date.now()}`,
		},
		request: {
			url,
		},
		signal: abortController.signal,
	};
}

describe("Nuxt Adapter", () => {
	describe("nuxtGoGoScope", () => {
		test("should create root scope on plugin initialization", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);

			expect(nitroApp.scope).toBeDefined();
			expect(nitroApp.scope.scopeName).toBe("test-app");
		});

		test("should create request-scoped child for each request", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);

			const event = createMockH3Event("/api/users");
			await nitroApp.hooks.callHook("request", event);

			expect((event.context as any).scope).toBeDefined();
			expect((event.context as any).scope.scopeName).toMatch(/^request-/);
			expect((event.context as any).scope.isDisposed).toBe(false);
		});

		test("should dispose request scope after response", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);

			const event = createMockH3Event("/api/users");
			await nitroApp.hooks.callHook("request", event);
			const s = (event.context as any).scope;

			await nitroApp.hooks.callHook("afterResponse", event);

			expect(s.isDisposed).toBe(true);
		});

		test("should execute tasks within request scope", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);

			const event = createMockH3Event("/api/data");
			await nitroApp.hooks.callHook("request", event);

			const [err, result] = await (event.context as any).scope.task(() =>
				Promise.resolve({ data: "test" }),
			);

			expect(err).toBeUndefined();
			expect(result).toEqual({ data: "test" });
		});

		test("should apply timeout to request scope", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app", timeout: 100 });

			await plugin(nitroApp);

			const event = createMockH3Event("/api/slow");
			await nitroApp.hooks.callHook("request", event);

			// Verify timeout is set
			expect((event.context as any).scope).toBeDefined();
		});

		test("should dispose root scope on close", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);
			const rootScope = (nitroApp as any).scope;

			await nitroApp.hooks.callHook("close");

			expect(rootScope.isDisposed).toBe(true);
		});

		test("should handle multiple concurrent requests", async () => {
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "test-app" });

			await plugin(nitroApp);

			// Simulate multiple concurrent requests
			const events = [
				createMockH3Event("/api/1", "session-1"),
				createMockH3Event("/api/2", "session-2"),
				createMockH3Event("/api/3", "session-3"),
			];

			for (const event of events) {
				await nitroApp.hooks.callHook("request", event);
			}

			// All scopes should be independent
			const scopes = events.map((e) => (e.context as any).scope);
			expect(scopes[0]).not.toBe(scopes[1]);
			expect(scopes[1]).not.toBe(scopes[2]);

			// Each should be able to run tasks
			const results = await Promise.all(
				scopes.map((s) => s.task(() => Promise.resolve("ok"))),
			);

			for (const [err, result] of results) {
				expect(err).toBeUndefined();
				expect(result).toBe("ok");
			}
		});
	});

	describe("getScope", () => {
		test("should return scope from event context", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const mockEvent = { context: { scope: s as any } };

			const result = getScope(mockEvent as any);

			expect(result).toBe(s);
		});

		test("should throw error if no scope in context", () => {
			const mockEvent = { context: {} };

			expect(() => getScope(mockEvent)).toThrow(
				"No scope found in event context",
			);
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when debug is enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const nitroApp = createMockNitroApp();
			const plugin = nuxtGoGoScope({ name: "debug-app", debug: true });

			await plugin(nitroApp);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
