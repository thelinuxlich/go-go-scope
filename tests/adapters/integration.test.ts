/**
 * Framework Adapter Integration Tests
 * 
 * Tests all adapters (Fastify, Express, NestJS, Hono, Elysia) with real
 * framework instances to ensure adapters work correctly in production.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { scope, type Scope } from "../../src/index.js";
import { Elysia } from "elysia";
import { goGoScope as elysiaGoGoScope, getScope as getElysiaScope } from "../../src/adapters/elysia.js";
import fastify from "fastify";
import { fastifyGoGoScope } from "../../src/adapters/fastify.js";
import express from "express";
import { goGoScope as expressGoGoScope } from "../../src/adapters/express.js";
import { Hono } from "hono";
import { goGoScope as honoGoGoScope, getScope as getHonoScope } from "../../src/adapters/hono.js";
import { 
  GoGoScopeService, 
  GoGoRequestScopeService, 
  Task, 
  GoGoScopeModule 
} from "../../src/adapters/nestjs.js";

// ============================================================================
// Test Scenarios
// ============================================================================

interface TestScenario {
	name: string;
	handler: (scope: Scope) => Promise<unknown>;
	expectedError?: boolean;
	expectedResult?: unknown;
}

const testScenarios: TestScenario[] = [
	{
		name: "simple success",
		handler: async (s) => {
			const [err, result] = await s.task(async () => ({ message: "hello" }));
			if (err) throw err;
			return result;
		},
		expectedResult: { message: "hello" },
	},
	{
		name: "parallel processing",
		handler: async (s) => {
			const items = [1, 2, 3, 4, 5];
			const factories = items.map((i) => async () => i * 2);
			const results = await s.parallel(factories, { concurrency: 2 });
			return results.map((r) => (r[0] ? null : r[1]));
		},
		expectedResult: [2, 4, 6, 8, 10],
	},
	{
		name: "error handling",
		handler: async (s) => {
			const [err] = await s.task(async () => {
				throw new Error("test error");
			});
			return { error: err?.message };
		},
		expectedResult: { error: "test error" },
	},
	{
		name: "channel communication",
		handler: async (s) => {
			const ch = s.channel<number>(3);
			await ch.send(1);
			await ch.send(2);
			await ch.send(3);
			ch.close();
			const results: number[] = [];
			for await (const val of ch) {
				results.push(val);
			}
			return results;
		},
		expectedResult: [1, 2, 3],
	},
	{
		name: "race operation",
		handler: async (s) => {
			const factories = [
				async () => {
					await new Promise((r) => setTimeout(r, 50));
					return "slow";
				},
				async () => "fast",
			];
			const [err, result] = await s.race(factories);
			if (err) throw err;
			return { result };
		},
		expectedResult: { result: "fast" },
	},
];

// ============================================================================
// Fastify Tests (Real Framework)
// ============================================================================

describe("Fastify Adapter", () => {
	test("module exports exist", async () => {
		expect(fastifyGoGoScope).toBeDefined();
	});

	test("plugin registers and creates scopes", async () => {
		const app = fastify();
		await app.register(fastifyGoGoScope, { name: "fastify-test" });

		expect(app.scope).toBeDefined();
		expect(app.scope.task).toBeDefined();

		await app.close();
	});

	test("request scope is created for each request", async () => {
		const app = fastify();
		await app.register(fastifyGoGoScope, { name: "fastify-req-test" });

		let capturedScope: Scope | undefined;

		app.get("/test", async (request, reply) => {
			capturedScope = request.scope;
			expect(request.scope).toBeDefined();
			expect(request.scope).not.toBe(app.scope);
			return { ok: true };
		});

		const response = await app.inject({
			method: "GET",
			url: "/test",
		});

		expect(response.statusCode).toBe(200);
		expect(capturedScope).toBeDefined();

		await app.close();
	});

	for (const scenario of testScenarios) {
		test(`scenario: ${scenario.name}`, async () => {
			const app = fastify();
			await app.register(fastifyGoGoScope, { name: `fastify-${scenario.name}` });

			app.get("/test", async (request) => {
				return scenario.handler(request.scope);
			});

			const response = await app.inject({
				method: "GET",
				url: "/test",
			});

			expect(response.statusCode).toBe(200);
			if (scenario.expectedResult !== undefined) {
				expect(JSON.parse(response.payload)).toEqual(scenario.expectedResult);
			}

			await app.close();
		});
	}
});

// ============================================================================
// Express Tests (Real Framework)
// ============================================================================

import request from "supertest";

describe("Express Adapter", () => {
	test("module exports exist", async () => {
		const { closeScope } = await import("../../src/adapters/express.js");
		expect(expressGoGoScope).toBeDefined();
		expect(closeScope).toBeDefined();
	});

	test("middleware attaches scope to app and request", async () => {
		const app = express();
		const middleware = expressGoGoScope(app, { name: "express-test" });

		expect(app.scope).toBeDefined();
		expect(app.scope.task).toBeDefined();

		let capturedScope: Scope | undefined;

		app.use(middleware);
		app.get("/test", (req, res) => {
			capturedScope = req.scope;
			res.json({ ok: true });
		});

		const response = await request(app).get("/test");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ ok: true });
		expect(capturedScope).toBeDefined();

		await app.scope[Symbol.asyncDispose]();
	});

	for (const scenario of testScenarios) {
		test(`scenario: ${scenario.name}`, async () => {
			const app = express();
			app.use(express.json());
			const middleware = expressGoGoScope(app, { name: `express-${scenario.name}` });
			app.use(middleware);

			app.get("/test", async (req, res) => {
				try {
					const result = await scenario.handler(req.scope);
					res.json(result);
				} catch (err) {
					res.status(500).json({ error: (err as Error).message });
				}
			});

			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
			if (scenario.expectedResult !== undefined) {
				expect(response.body).toEqual(scenario.expectedResult);
			}

			await app.scope[Symbol.asyncDispose]();
		});
	}
});

// ============================================================================
// NestJS Tests (Real Framework)
// ============================================================================

describe("NestJS Adapter", () => {
	test("module exports exist", async () => {
		expect(GoGoScopeService).toBeDefined();
		expect(GoGoRequestScopeService).toBeDefined();
		expect(Task).toBeDefined();
		expect(GoGoScopeModule).toBeDefined();
	});

	test("service can create and use scopes", async () => {
		const service = new GoGoScopeService();

		const rootScope = service.rootScope;
		expect(rootScope).toBeDefined();
		expect(rootScope.task).toBeDefined();

		const requestScope = service.createScope("test-request");
		expect(requestScope).toBeDefined();
		expect(requestScope).not.toBe(rootScope);

		const [err, result] = await requestScope.task(async () => "test");
		expect(err).toBeUndefined();
		expect(result).toBe("test");

		await requestScope[Symbol.asyncDispose]();
		await service.onModuleDestroy();
	});

	for (const scenario of testScenarios) {
		test(`scenario: ${scenario.name}`, async () => {
			const service = new GoGoScopeService();

			const requestScope = service.createScope(`nestjs-${scenario.name}`);
			try {
				const result = await scenario.handler(requestScope);
				if (scenario.expectedResult !== undefined) {
					expect(result).toEqual(scenario.expectedResult);
				}
			} finally {
				await requestScope[Symbol.asyncDispose]();
				await service.onModuleDestroy();
			}
		});
	}
});

// ============================================================================
// Hono Tests (Real Framework)
// ============================================================================

describe("Hono Adapter", () => {
	test("module exports exist", async () => {
		expect(honoGoGoScope).toBeDefined();
		expect(getHonoScope).toBeDefined();
	});

	test("middleware attaches scope to context", async () => {
		const app = new Hono();
		app.use(honoGoGoScope());

		let capturedScope: Scope | undefined;

		app.get("/test", (c) => {
			capturedScope = getHonoScope(c);
			expect(capturedScope).toBeDefined();
			return c.json({ ok: true });
		});

		const req = new Request("http://localhost/test");
		const res = await app.fetch(req);

		expect(res.status).toBe(200);
		expect(capturedScope).toBeDefined();
		expect(capturedScope?.isDisposed).toBe(true);
	});

	for (const scenario of testScenarios) {
		test(`scenario: ${scenario.name}`, async () => {
			const app = new Hono();
			app.use(honoGoGoScope());

			app.get("/test", async (c) => {
				const requestScope = getHonoScope(c);
				try {
					const result = await scenario.handler(requestScope);
					return c.json(result);
				} catch (err) {
					return c.json({ error: (err as Error).message }, 500);
				}
			});

			const req = new Request("http://localhost/test");
			const res = await app.fetch(req);

			expect(res.status).toBe(200);
			if (scenario.expectedResult !== undefined) {
				expect(await res.json()).toEqual(scenario.expectedResult);
			}
		});
	}
});

// ============================================================================
// Elysia Tests (Real Framework)
// ============================================================================

describe("Elysia Adapter", () => {
	test("module exports exist", async () => {
		expect(elysiaGoGoScope).toBeDefined();
		expect(getElysiaScope).toBeDefined();
	});

	test("plugin creates scope structure", async () => {
		const app = new Elysia()
			.use(elysiaGoGoScope({ name: "test-app", metrics: true }))
			.get("/test", ({ scope }) => {
				expect(scope).toBeDefined();
				expect(scope.task).toBeDefined();
				return { ok: true };
			});

		const response = await app.handle(new Request("http://localhost/test"));
		expect(response.status).toBe(200);
	});

	test("request scope is isolated per request", async () => {
		const scopes: Scope[] = [];

		const app = new Elysia()
			.use(elysiaGoGoScope({ name: "elysia-isolated-test" }))
			.get("/test/:id", ({ scope }) => {
				scopes.push(scope);
				return { id: scope.name };
			});

		// Make multiple requests
		for (let i = 0; i < 3; i++) {
			const response = await app.handle(new Request(`http://localhost/test/${i}`));
			expect(response.status).toBe(200);
		}

		// Each request should have a different scope
		expect(scopes.length).toBe(3);
		expect(scopes[0]).not.toBe(scopes[1]);
		expect(scopes[1]).not.toBe(scopes[2]);

		// Note: In Elysia, scope disposal happens in onAfterResponse
		// which may be async, so we check they were different objects
		// The disposal itself is tested in the adapter
	});

	for (const scenario of testScenarios) {
		test(`scenario: ${scenario.name}`, async () => {
			const app = new Elysia()
				.use(elysiaGoGoScope({ name: `elysia-${scenario.name}` }))
				.get("/test", async ({ scope }) => {
					try {
						const result = await scenario.handler(scope);
						return result;
					} catch (err) {
						return { error: (err as Error).message };
					}
				});

			const response = await app.handle(new Request("http://localhost/test"));
			expect(response.status).toBe(200);

			if (scenario.expectedResult !== undefined) {
				expect(await response.json()).toEqual(scenario.expectedResult);
			}
		});
	}
});

// ============================================================================
// Cross-Framework Consistency Tests
// ============================================================================

describe("Cross-Framework Consistency", () => {
	test("all adapters are available", async () => {
		const adapters = await Promise.all([
			import("../../dist/adapters/fastify.mjs"),
			import("../../dist/adapters/express.mjs"),
			import("../../dist/adapters/nestjs.mjs"),
			import("../../dist/adapters/hono.mjs"),
			import("../../dist/adapters/elysia.mjs"),
		]);

		expect(adapters.length).toBe(5);

		for (const adapter of adapters) {
			expect(adapter).toBeDefined();
		}
	});

	test("parallel execution produces consistent results across frameworks", async () => {
		const items = [1, 2, 3, 4, 5];
		const expected = [2, 4, 6, 8, 10];

		const runParallel = async (s: Scope) => {
			const factories = items.map((i) => async () => i * 2);
			const results = await s.parallel(factories, { concurrency: 2 });
			return results.map((r) => (r[0] ? null : r[1]));
		};

		// Test with each framework
		const fastifyApp = fastify();
		await fastifyApp.register(fastifyGoGoScope);
		const fastifyResult = await runParallel(fastifyApp.scope);
		expect(fastifyResult).toEqual(expected);
		await fastifyApp.close();

		const expressApp = express();
		expressGoGoScope(expressApp);
		const expressResult = await runParallel(expressApp.scope);
		expect(expressResult).toEqual(expected);
		await expressApp.scope[Symbol.asyncDispose]();

		const nestService = new GoGoScopeService();
		const nestResult = await runParallel(nestService.rootScope);
		expect(nestResult).toEqual(expected);
		await nestService.onModuleDestroy();

		const honoApp = new Hono().use(honoGoGoScope());
		const honoReq = new Request("http://localhost/test");
		let honoResult: any;
		honoApp.get("/test", async (c) => {
			honoResult = await runParallel(getHonoScope(c));
			return c.json(honoResult);
		});
		await honoApp.fetch(honoReq);
		expect(honoResult).toEqual(expected);

		const elysiaApp = new Elysia().use(elysiaGoGoScope()).get("/test", async ({ scope }) => {
			return { result: await runParallel(scope) };
		});
		const elysiaResponse = await elysiaApp.handle(new Request("http://localhost/test"));
		const elysiaResult = (await elysiaResponse.json()).result;
		expect(elysiaResult).toEqual(expected);
	});
});
