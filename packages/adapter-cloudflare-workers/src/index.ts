/**
 * Cloudflare Workers adapter for go-go-scope
 * Provides request-scoped structured concurrency for Cloudflare Workers
 */

import { type Scope, scope } from "go-go-scope";

// Augment Cloudflare Workers types
declare global {
	interface ExecutionContext {
		waitUntil(promise: Promise<unknown>): void;
	}
}

export interface CloudflareWorkersGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Cloudflare Workers middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * // src/index.ts
 * import { cloudflareWorkersGoGoScope, getScope } from '@go-go-scope/adapter-cloudflare-workers'
 *
 * const middleware = cloudflareWorkersGoGoScope({
 *   name: 'my-worker',
 *   timeout: 30000
 * })
 *
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     return middleware(request, env, ctx, async (scope) => {
 *       const [err, data] = await scope.task(() => fetchData())
 *       if (err) return new Response('Error', { status: 500 })
 *       return new Response(JSON.stringify(data))
 *     })
 *   }
 * }
 * ```
 */
export function cloudflareWorkersGoGoScope(
	options: CloudflareWorkersGoGoScopeOptions = {},
): <T>(
	request: Request,
	env: unknown,
	ctx: ExecutionContext,
	handler: (scope: Scope) => Promise<T>,
) => Promise<T> {
	const { name = "cloudflare-worker", timeout, debug = false } = options;

	// Create root application scope (singleton per isolate)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (request, _env, ctx, handler) => {
		// Create request-scoped child
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${request.url}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);

		if (debug) {
			console.log(`[go-go-scope] Request scope created: ${scopeOptions.name}`);
		}

		try {
			return await handler(requestScope);
		} finally {
			// Ensure scope cleanup happens after response
			ctx.waitUntil(
				requestScope[Symbol.asyncDispose]().catch(() => {
					// Ignore cleanup errors
				}),
			);

			if (debug) {
				console.log(`[go-go-scope] Request scope disposal scheduled`);
			}
		}
	};
}

/**
 * Helper to get the current scope from the request context
 * Note: In Cloudflare Workers, pass scope explicitly or use closure
 *
 * @example
 * ```typescript
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     const middleware = cloudflareWorkersGoGoScope()
 *     return middleware(request, env, ctx, async (scope) => {
 *       // Use scope directly
 *       const [err, data] = await scope.task(() => fetchData())
 *       return new Response(JSON.stringify(data))
 *     })
 *   }
 * }
 * ```
 */
export function getScope(event: { scope?: Scope }): Scope {
	const s = event.scope;
	if (!s) {
		throw new Error(
			"No scope found in context. Make sure the cloudflareWorkersGoGoScope middleware is used.",
		);
	}
	return s;
}

/**
 * Helper to create a handler with automatic scope integration
 *
 * @example
 * ```typescript
 * // src/handlers/api.ts
 * import { defineScopedHandler } from '@go-go-scope/adapter-cloudflare-workers'
 *
 * export const handler = defineScopedHandler(async (request, scope, env, ctx) => {
 *   const [err, data] = await scope.task(() => fetchData())
 *   if (err) return new Response('Error', { status: 500 })
 *   return new Response(JSON.stringify(data))
 * })
 *
 * // src/index.ts
 * import { cloudflareWorkersGoGoScope } from '@go-go-scope/adapter-cloudflare-workers'
 * import { handler } from './handlers/api'
 *
 * const middleware = cloudflareWorkersGoGoScope()
 *
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     return middleware(request, env, ctx, (scope) => handler(request, scope, env, ctx))
 *   }
 * }
 * ```
 */
export function defineScopedHandler<T>(
	handler: (
		request: Request,
		scope: Scope,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<T>,
): (
	request: Request,
	scope: Scope,
	env: unknown,
	ctx: ExecutionContext,
) => Promise<T> {
	return (request, scope, env, ctx) => {
		return handler(request, scope, env, ctx);
	};
}

/**
 * Durable Objects integration helper
 * Provides scoped execution within Durable Objects
 *
 * @example
 * ```typescript
 * // src/durable-object.ts
 * import { DurableObject } from 'cloudflare:workers'
 * import { withDurableObjectScope } from '@go-go-scope/adapter-cloudflare-workers'
 *
 * export class MyDurableObject extends DurableObject {
 *   async fetch(request: Request) {
 *     return withDurableObjectScope(request, async (scope) => {
 *       const [err, data] = await scope.task(() => this.process(request))
 *       return new Response(JSON.stringify(data))
 *     })
 *   }
 * }
 * ```
 */
export async function withDurableObjectScope<T>(
	_request: Request,
	handler: (scope: Scope<any>) => Promise<T>,
	opts: { name?: string; timeout?: number; debug?: boolean } = {},
): Promise<T> {
	const { name = "durable-object", timeout, debug = false } = opts;

	const s = scope({ name, timeout });

	if (debug) {
		console.log(`[go-go-scope] Durable Object scope created: ${name}`);
	}

	try {
		return await handler(s);
	} finally {
		await s[Symbol.asyncDispose]().catch(() => {});

		if (debug) {
			console.log(`[go-go-scope] Durable Object scope disposed`);
		}
	}
}
