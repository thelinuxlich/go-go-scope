/**
 * Integration tests for SolidStart adapter
 */

import { describe, expect, test, vi } from "vitest";
import { getScope, solidStartGoGoScope, withScope } from "./index.js";
import type { FetchEvent } from "@solidjs/start/server";
import type { Scope } from "go-go-scope";

// Create mock FetchEvent
function createMockFetchEvent(url: string): FetchEvent {
	const abortController = new AbortController();
	let response: Response | undefined;

	return {
		request: new Request(url),
		signal: abortController.signal,
		url: new URL(url),
		respondWith: async (r: Response | Promise<Response>) => {
			response = await r;
			return response;
		},
		get response() {
			return response;
		},
	} as unknown as FetchEvent;
}

describe("SolidStart Adapter", () => {
	describe("solidStartGoGoScope", () => {
		test("should create middleware function", () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			expect(middleware).toBeDefined();
			expect(typeof middleware).toBe("function");
		});

		test("should create request scope for each request", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/users");

			await middleware(event);

			expect(event.scope).toBeDefined();
			expect(event.scope.scopeName).toMatch(/^request-/);
		});

		test("should execute tasks within request scope", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/data");

			await middleware(event);

			const [err, result] = await event.scope.task(() =>
				Promise.resolve({ message: "Hello from SolidStart" }),
			);

			expect(err).toBeUndefined();
			expect(result).toEqual({ message: "Hello from SolidStart" });
		});

		test("should dispose scope after response", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/test");

			await middleware(event);

			const scope = event.scope;
			expect(scope.isDisposed).toBe(false);

			// Simulate responding
			await event.respondWith(new Response("OK"));

			// Scope should be disposed after response
			expect(scope.isDisposed).toBe(true);
		});

		test("should apply timeout to request scope", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app", timeout: 5000 });
			const event = createMockFetchEvent("http://localhost/api/slow");

			await middleware(event);

			expect(event.scope).toBeDefined();
		});

		test("should handle multiple concurrent requests", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });

			const events = [
				createMockFetchEvent("http://localhost/api/1"),
				createMockFetchEvent("http://localhost/api/2"),
				createMockFetchEvent("http://localhost/api/3"),
			];

			// Initialize all scopes
			for (const event of events) {
				await middleware(event);
			}

			// All scopes should be independent
			const scopes = events.map((e) => e.scope);
			expect(scopes[0]).not.toBe(scopes[1]);
			expect(scopes[1]).not.toBe(scopes[2]);

			// Each should execute tasks independently
			const results = await Promise.all(
				scopes.map((s) => s.task(() => Promise.resolve("ok"))),
			);

			for (const [err, result] of results) {
				expect(err).toBeUndefined();
				expect(result).toBe("ok");
			}
		});

		test("should handle errors in handler gracefully", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/error");

			await middleware(event);
			const scope = event.scope;

			// Simulate error during response
			try {
				await event.respondWith(
					new Promise<Response>((_, reject) => {
						reject(new Error("Test error"));
					}),
				);
			} catch {
				// Expected
			}

			// Scope should still be disposed
			expect(scope.isDisposed).toBe(true);
		});
	});

	describe("getScope", () => {
		test("should return scope from event", async () => {
			const { scope } = await import("go-go-scope");
			await using s = scope();
			const mockEvent = { scope: s as any };

			const result = getScope(mockEvent as any);

			expect(result).toBe(s);
		});

		test("should throw error if no scope in event", () => {
			const mockEvent = {};

			expect(() => getScope(mockEvent)).toThrow(
				"No scope found in event",
			);
		});
	});

	describe("withScope", () => {
		test("should wrap handler with scope access", async () => {
			const handler = async (scope: Scope, data: string) => {
				const [err, result] = await scope.task(() => Promise.resolve(`handled-${data}`));
				if (err) throw err;
				return result;
			};

			const wrappedHandler = withScope(handler);
			const result = await wrappedHandler("test-data");

			expect(result).toBe("handled-test-data");
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const middleware = solidStartGoGoScope({ name: "debug-app", debug: true });
			const event = createMockFetchEvent("http://localhost/api/test");

			await middleware(event);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Request scope created"),
			);

			consoleSpy.mockRestore();
		});
	});

	describe("integration scenarios", () => {
		test("should work with server actions pattern", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/action");

			await middleware(event);

			// Simulate server action execution
			const actionResult = await event.scope.task(async () => {
				// Simulate database operation
				const [dbErr, dbResult] = await event.scope.task(() =>
					Promise.resolve({ id: 1, name: "Test" }),
				);
				if (dbErr) throw dbErr;
				return dbResult;
			});

			expect(actionResult[0]).toBeUndefined();
			expect(actionResult[1]).toEqual({ id: 1, name: "Test" });
		});

		test("should handle streaming responses", async () => {
			const middleware = solidStartGoGoScope({ name: "test-app" });
			const event = createMockFetchEvent("http://localhost/api/stream");

			await middleware(event);

			const scope = event.scope;

			// Start streaming response
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue("data: chunk1\n\n");
					controller.enqueue("data: chunk2\n\n");
					controller.close();
				},
			});

			await event.respondWith(
				new Response(stream, {
					headers: { "Content-Type": "text/event-stream" },
				}),
			);

			// Scope should be disposed after response
			expect(scope.isDisposed).toBe(true);
		});
	});
});
