/**
 * Integration tests for Remix adapter
 */

import { describe, expect, test, vi } from "vitest";
import {
	createRemixScope,
	withScopeAction,
	withScopeLoader,
} from "./index.js";

// Mock LoaderFunctionArgs / ActionFunctionArgs
function createMockArgs(url: string, options: { method?: string; body?: FormData } = {}) {
	return {
		request: new Request(url, {
			method: options.method ?? "GET",
			body: options.body,
		}),
		params: {},
		context: {},
		signal: new AbortController().signal,
	};
}

describe("Remix Adapter", () => {
	describe("withScopeLoader", () => {
		test("should execute loader with scope", async () => {
			const loader = withScopeLoader(async ({ request, scope }) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ message: "Hello from loader" }),
				);
				if (err) throw new Response(err.message, { status: 500 });
				return result;
			});

			const args = createMockArgs("http://localhost:3000/users");
			const result = await loader(args);

			expect(result).toEqual({ message: "Hello from loader" });
		});

		test("should inject services into scope", async () => {
			const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };

			const loader = withScopeLoader(
				async ({ scope }) => {
					const database = scope.use("db");
					const result = await database.query();
					return result;
				},
				{ services: { db } },
			);

			const args = createMockArgs("http://localhost:3000/api/users");
			const result = await loader(args);

			expect(result).toEqual([{ id: 1 }]);
			expect(db.query).toHaveBeenCalled();
		});

		test("should timeout long-running loaders", async () => {
			const loader = withScopeLoader(
				async ({ scope }) => {
					const [err] = await scope.task(
						() => new Promise((resolve) => setTimeout(resolve, 1000)),
					);
					if (err) {
						return { error: "Request timeout", status: 504 };
					}
					return { success: true };
				},
				{ timeout: 100 },
			);

			const args = createMockArgs("http://localhost:3000/api/slow");
			const result = await loader(args);

			expect(result).toEqual({ error: "Request timeout", status: 504 });
		});
	});

	describe("withScopeAction", () => {
		test("should execute action with scope", async () => {
			const action = withScopeAction(async ({ request, scope }) => {
				const [err, result] = await scope.task(() =>
					Promise.resolve({ created: true }),
				);
				if (err) return { error: err.message };
				return result;
			});

			const args = createMockArgs("http://localhost:3000/users", {
				method: "POST",
				body: new FormData(),
			});
			const result = await action(args);

			expect(result).toEqual({ created: true });
		});

		test("should inject services into action scope", async () => {
			const db = { create: vi.fn().mockResolvedValue({ id: 1, name: "Test" }) };

			const action = withScopeAction(
				async ({ scope }) => {
					const database = scope.use("db");
					const result = await database.create();
					return result;
				},
				{ services: { db } },
			);

			const args = createMockArgs("http://localhost:3000/api/users", {
				method: "POST",
				body: new FormData(),
			});
			const result = await action(args);

			expect(result).toEqual({ id: 1, name: "Test" });
			expect(db.create).toHaveBeenCalled();
		});

		test("should timeout long-running actions", async () => {
			const action = withScopeAction(
				async ({ scope }) => {
					const [err] = await scope.task(
						() => new Promise((resolve) => setTimeout(resolve, 1000)),
					);
					if (err) {
						return { error: "Action timeout", status: 504 };
					}
					return { success: true };
				},
				{ timeout: 100 },
			);

			const args = createMockArgs("http://localhost:3000/api/slow", {
				method: "POST",
				body: new FormData(),
			});
			const result = await action(args);

			expect(result).toEqual({ error: "Action timeout", status: 504 });
		});
	});

	describe("createRemixScope", () => {
		test("creates reusable scope configuration", async () => {
			const db = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };
			const remixScope = createRemixScope({
				timeout: 5000,
				services: { db },
			});

			const loader = remixScope.loader(async ({ scope }) => {
				const database = scope.use("db");
				return database.query();
			});

			const action = remixScope.action(async ({ scope }) => {
				const database = scope.use("db");
				return database.query();
			});

			const loaderArgs = createMockArgs("http://localhost:3000/users");
			const loaderResult = await loader(loaderArgs);

			const actionArgs = createMockArgs("http://localhost:3000/users", {
				method: "POST",
				body: new FormData(),
			});
			const actionResult = await action(actionArgs);

			expect(loaderResult).toEqual([{ id: 1 }]);
			expect(actionResult).toEqual([{ id: 1 }]);
			expect(db.query).toHaveBeenCalledTimes(2);
		});
	});
});
