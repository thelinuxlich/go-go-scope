/**
 * Integration tests for Next.js adapter
 */

import { describe, expect, test, vi } from "vitest";
import type { NextRequest } from "./index.js";
import {
	createRouteConfig,
	NextJSRouteError,
	withScope,
	withScopeEdge,
	withScopeServer,
} from "./index.js";

// Mock NextRequest
function createMockRequest(
	url: string,
	options: { method?: string; body?: unknown } = {},
): NextRequest {
	return {
		url,
		method: options.method ?? "GET",
		signal: new AbortController().signal,
		json: async () => options.body,
	} as unknown as NextRequest;
}

describe("Next.js Adapter", () => {
	describe("withScope", () => {
		test("should execute handler with scope", async () => {
			const handler = withScope(async (_req, { scope }) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ message: "Hello" }),
				);
				if (err) return Response.json({ error: err.message }, { status: 500 });
				return Response.json(result);
			});

			const req = createMockRequest("http://localhost:3000/api/hello");
			const response = await handler(req);
			const data = await response.json();

			expect(data).toEqual({ message: "Hello" });
		});

		test("should handle errors with custom error handler", async () => {
			const customError = new Error("Custom error");
			const errorHandler = vi
				.fn()
				.mockReturnValue(Response.json({ error: "Handled" }, { status: 500 }));

			const handler = withScope(
				async () => {
					throw customError;
				},
				{ onError: errorHandler },
			);

			const req = createMockRequest("http://localhost:3000/api/test");
			const response = await handler(req);
			const data = (await response.json()) as { error: string };

			expect(errorHandler).toHaveBeenCalledWith(customError, req);
			expect(data).toEqual({ error: "Handled" });
		});

		test("should inject services into scope", async () => {
			const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };

			const handler = withScope(
				async (_req, { scope }) => {
					const database = scope.use("db");
					const result = await database.query();
					return Response.json(result);
				},
				{ services: { db } },
			);

			const req = createMockRequest("http://localhost:3000/api/users");
			const response = await handler(req);
			const data = await response.json();

			expect(data).toEqual([{ id: 1 }]);
			expect(db.query).toHaveBeenCalled();
		});

		test("should timeout long-running requests", async () => {
			const handler = withScope(
				async (_req, { scope }) => {
					const [err] = await scope.task(
						() => new Promise((resolve) => setTimeout(resolve, 1000)),
					);
					if (err) {
						return Response.json({ error: "Request timeout" }, { status: 504 });
					}
					return Response.json({ success: true });
				},
				{ timeout: 100 },
			);

			const req = createMockRequest("http://localhost:3000/api/slow");

			// Should return timeout error response
			const response = await handler(req);
			expect(response.status).toBe(504);
			const data = (await response.json()) as { error: string };
			expect(data.error).toBe("Request timeout");
		});
	});

	describe("withScopeEdge", () => {
		test("should execute edge handler with scope", async () => {
			const handler = withScopeEdge(async (_req, { scope }) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve("edge-result"),
				);
				if (err) return new Response("Error", { status: 500 });
				return new Response(result);
			});

			const req = new Request("https://example.com/api/edge");
			const response = await handler(req);
			const text = await response.text();

			expect(text).toBe("edge-result");
		});

		test("should handle abort signal", async () => {
			const abortController = new AbortController();

			const handler = withScopeEdge(async (_req, { signal }) => {
				// Check if signal is properly linked
				expect(signal).toBeDefined();
				return new Response("OK");
			});

			const req = new Request("https://example.com/api/test", {
				signal: abortController.signal,
			});

			const response = await handler(req);
			expect(response.status).toBe(200);
		});
	});

	describe("withScopeServer", () => {
		test("should execute server component with scope", async () => {
			const component = withScopeServer(async (_props, { scope }) => {
				const [err, data] = await scope.task(() =>
					Promise.resolve({ users: [] }),
				);
				if (err) throw err;
				return {
					type: "div",
					props: { children: `Users: ${data.users.length}` },
				} as unknown as JSX.Element;
			});

			const result = await component({});
			expect(result).toBeDefined();
		});
	});

	describe("createRouteConfig", () => {
		test("should create reusable route configuration", async () => {
			const db = { query: vi.fn() };
			const errorHandler = vi
				.fn()
				.mockReturnValue(
					Response.json({ error: "Route error" }, { status: 500 }),
				);

			const config = createRouteConfig({
				timeout: 5000,
				services: { db },
				onError: errorHandler,
			});

			const handler = config.wrap(async (_req, { scope }) => {
				const database = scope.use("db");
				await database.query();
				return Response.json({ success: true });
			});

			const req = createMockRequest("http://localhost:3000/api/configured");
			const response = await handler(req);
			const data = await response.json();

			expect(data).toEqual({ success: true });
		});
	});

	describe("NextJSRouteError", () => {
		test("should create error with status code", () => {
			const error = new NextJSRouteError("Not found", 404, "NOT_FOUND");
			expect(error.message).toBe("Not found");
			expect(error.statusCode).toBe(404);
			expect(error.code).toBe("NOT_FOUND");
		});
	});
});
