/**
 * Integration tests for SvelteKit adapter
 */

import { describe, expect, test, vi } from "vitest";
import {
	createScopeHandle,
	withScopeAction,
	withScopeLoad,
} from "./index.js";

// Mock SvelteKit types
function createMockRequestEvent(url: string, options: { method?: string; body?: FormData } = {}) {
	return {
		request: new Request(url, {
			method: options.method ?? "GET",
			body: options.body,
		}),
		url: new URL(url),
		params: {},
		locals: {},
		cookies: {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn(),
		},
		fetch: vi.fn(),
		getClientAddress: () => "127.0.0.1",
		platform: {},
	} as unknown as import("@sveltejs/kit").RequestEvent;
}

function createMockServerLoadEvent(url: string, locals: Record<string, unknown> = {}) {
	return {
		request: new Request(url),
		url: new URL(url),
		params: {},
		locals,
		cookies: {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn(),
		},
		fetch: vi.fn(),
		platform: {},
		parent: vi.fn().mockResolvedValue({}),
	} as unknown as import("@sveltejs/kit").ServerLoadEvent;
}

describe("SvelteKit Adapter", () => {
	describe("createScopeHandle", () => {
		test("should attach scope to event locals", async () => {
			const handle = createScopeHandle();

			const event = createMockRequestEvent("http://localhost:3000/users");
			const resolve = vi.fn().mockResolvedValue(new Response('{"ok": true}'));

			await handle({ event, resolve });

			expect((event.locals as { scope?: unknown }).scope).toBeDefined();
			expect((event.locals as { signal?: AbortSignal }).signal).toBeDefined();
		});

		test("should inject services into scope", async () => {
			const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };
			const handle = createScopeHandle({ services: { db } });

			const event = createMockRequestEvent("http://localhost:3000/users");
			const resolve = vi.fn().mockImplementation(async (event) => {
				const scope = (event.locals as { scope: { use: (k: string) => unknown } }).scope;
				const database = scope.use("db");
				const result = await database.query();
				return Response.json(result);
			});

			const response = await handle({ event, resolve });
			const data = await response.json();

			expect(data).toEqual([{ id: 1 }]);
			expect(db.query).toHaveBeenCalled();
		});

		test("should call custom error handler on error", async () => {
			const customError = new Error("Custom error");
			const errorHandler = vi.fn().mockReturnValue(
				Response.json({ error: "Handled" }, { status: 500 }),
			);

			const handle = createScopeHandle({ onError: errorHandler });

			const event = createMockRequestEvent("http://localhost:3000/test");
			const resolve = vi.fn().mockRejectedValue(customError);

			const response = await handle({ event, resolve });
			const data = await response.json();

			expect(errorHandler).toHaveBeenCalledWith(customError, event);
			expect(data).toEqual({ error: "Handled" });
		});
	});

	describe("withScopeLoad", () => {
		test("should execute load function with scope", async () => {
			const load = withScopeLoad(async (event) => {
				const [err, result] = await event.scope.task(() =>
					Promise.resolve({ message: "Hello from load" }),
				);
				if (err) throw new Error(err.message);
				return result;
			});

			const event = createMockServerLoadEvent("http://localhost:3000/users");
			const result = await load(event);

			expect(result).toEqual({ message: "Hello from load" });
		});

		test("should reuse scope from event.locals if available", async () => {
			const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };

			// First create a scope via handle
			const handle = createScopeHandle({ services: { db } });
			const event = createMockRequestEvent("http://localhost:3000/users");
			
			// Capture the scope from locals after handle runs
			let capturedScope: unknown;
			const resolve = vi.fn().mockImplementation(async (event) => {
				capturedScope = (event.locals as { scope: unknown }).scope;
				return Response.json({ ok: true });
			});

			await handle({ event, resolve });
			
			// Now use the same scope in a load event
			const loadEvent = createMockServerLoadEvent("http://localhost:3000/users", {
				scope: capturedScope,
			});

			const load = withScopeLoad(async (event) => {
				const database = event.scope.use("db");
				return database.query();
			});

			const result = await load(loadEvent);

			expect(result).toEqual([{ id: 1 }]);
			expect(db.query).toHaveBeenCalledTimes(1);
		});

		test("should timeout long-running loads", async () => {
			const load = withScopeLoad(
				async (event) => {
					const [err] = await event.scope.task(
						() => new Promise((resolve) => setTimeout(resolve, 1000)),
					);
					if (err) {
						return { error: "Load timeout", status: 504 };
					}
					return { success: true };
				},
				{ timeout: 100 },
			);

			const event = createMockServerLoadEvent("http://localhost:3000/slow");
			const result = await load(event);

			expect(result).toEqual({ error: "Load timeout", status: 504 });
		});
	});

	describe("withScopeAction", () => {
		test("should execute action with scope", async () => {
			const action = withScopeAction(async (event) => {
				const [err, result] = await event.scope.task(() =>
					Promise.resolve({ created: true }),
				);
				if (err) return { error: err.message };
				return result;
			});

			const event = createMockRequestEvent("http://localhost:3000/users", {
				method: "POST",
				body: new FormData(),
			});
			const result = await action(event);

			expect(result).toEqual({ created: true });
		});

		test("should reuse scope from event.locals if available", async () => {
			const db = { create: vi.fn().mockResolvedValue({ id: 1 }) };

			// First create a scope via handle
			const handle = createScopeHandle({ services: { db } });
			const event = createMockRequestEvent("http://localhost:3000/users", {
				method: "POST",
				body: new FormData(),
			});
			
			// Capture the scope from locals after handle runs
			let capturedScope: unknown;
			const resolve = vi.fn().mockImplementation(async (event) => {
				capturedScope = (event.locals as { scope: unknown }).scope;
				return Response.json({ ok: true });
			});

			await handle({ event, resolve });
			
			// Now use the same scope in an action event
			const actionEvent = createMockRequestEvent("http://localhost:3000/users", {
				method: "POST",
				body: new FormData(),
			});
			(actionEvent as { locals: Record<string, unknown> }).locals = { scope: capturedScope };

			const action = withScopeAction(async (event) => {
				const database = event.scope.use("db");
				return database.create();
			});

			const result = await action(actionEvent);

			expect(result).toEqual({ id: 1 });
			expect(db.create).toHaveBeenCalledTimes(1);
		});

		test("should timeout long-running actions", async () => {
			const action = withScopeAction(
				async (event) => {
					const [err] = await event.scope.task(
						() => new Promise((resolve) => setTimeout(resolve, 1000)),
					);
					if (err) {
						return { error: "Action timeout", status: 504 };
					}
					return { success: true };
				},
				{ timeout: 100 },
			);

			const event = createMockRequestEvent("http://localhost:3000/slow", {
				method: "POST",
				body: new FormData(),
			});
			const result = await action(event);

			expect(result).toEqual({ error: "Action timeout", status: 504 });
		});
	});
});
