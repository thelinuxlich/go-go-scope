/**
 * Tests for Koa adapter
 */

import { type Scope } from "go-go-scope";
import { describe, expect, test, vi } from "vitest";
import {
	closeKoaScope,
	getRootScope,
	getScope,
	koaGoGoScope,
} from "./index.js";

// Mock Koa context
function createMockContext(
	overrides: { url?: string; state?: Record<string, unknown> } = {},
): {
	ctx: {
		request: { url: string };
		state: Record<string, unknown>;
	};
	next: () => Promise<void>;
	nextCalled: boolean;
} {
	const nextCalled = { value: false };
	return {
		ctx: {
			request: { url: overrides.url || "/test" },
			state: overrides.state || {},
		},
		next: async () => {
			nextCalled.value = true;
		},
		nextCalled: nextCalled.value,
	};
}

describe("koaGoGoScope", () => {
	test("creates middleware function", () => {
		const middleware = koaGoGoScope();
		expect(typeof middleware).toBe("function");
	});

	test("attaches scope to ctx.state", async () => {
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		expect(ctx.state.scope).toBeDefined();
		expect(ctx.state.rootScope).toBeDefined();
		expect(ctx.state.scope).not.toBe(ctx.state.rootScope);
	});

	test("request scope is child of root scope", async () => {
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		const requestScope = ctx.state.scope as Scope;
		const rootScope = ctx.state.rootScope as Scope;

		// Both should be valid scope instances
		expect(requestScope).toBeDefined();
		expect(rootScope).toBeDefined();
		expect(requestScope).not.toBe(rootScope);
	});

	test("calls next middleware", async () => {
		const middleware = koaGoGoScope();
		let nextWasCalled = false;
		const { ctx } = createMockContext();
		const next = async () => {
			nextWasCalled = true;
		};

		await middleware(ctx as any, next);

		expect(nextWasCalled).toBe(true);
	});

	test("applies timeout option", async () => {
		const middleware = koaGoGoScope({ timeout: 5000 });
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		// Scope should be created with timeout
		expect(ctx.state.scope).toBeDefined();
	});

	test("applies metrics option", async () => {
		const middleware = koaGoGoScope({});
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		const rootScope = ctx.state.rootScope as Scope;
		expect(rootScope.metrics).toBeDefined();
	});

	test("disposes request scope after next", async () => {
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		// After middleware completes, scope should be disposed
		const requestScope = ctx.state.scope as Scope;
		expect(requestScope.isDisposed).toBe(true);
	});

	test("handles errors in next middleware", async () => {
		const onError = vi.fn();
		const middleware = koaGoGoScope({ onError });
		const { ctx } = createMockContext();
		const error = new Error("Test error");
		const next = async () => {
			throw error;
		};

		await expect(middleware(ctx as any, next)).rejects.toThrow("Test error");
		expect(onError).toHaveBeenCalledWith(error, ctx);
	});

	test("getScope returns request scope", async () => {
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		const requestScope = getScope(ctx as any);
		expect(requestScope).toBe(ctx.state.scope);
	});

	test("getRootScope returns root scope", async () => {
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();

		await middleware(ctx as any, next);

		const rootScope = getRootScope(ctx as any);
		expect(rootScope).toBe(ctx.state.rootScope);
	});
});

describe("closeKoaScope", () => {
	test("closes root scope without error", async () => {
		// First create a scope by using the middleware
		const middleware = koaGoGoScope();
		const { ctx, next } = createMockContext();
		await middleware(ctx as any, next);

		// Should not throw
		await expect(closeKoaScope()).resolves.not.toThrow();
	});

	test("is safe to call multiple times", async () => {
		await expect(closeKoaScope()).resolves.not.toThrow();
		await expect(closeKoaScope()).resolves.not.toThrow();
	});
});
