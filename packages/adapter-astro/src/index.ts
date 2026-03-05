/**
 * Astro adapter for go-go-scope
 * Provides request-scoped structured concurrency for Astro applications
 */

import type { APIContext, MiddlewareHandler } from "astro";
import { type Scope, scope } from "go-go-scope";

// Augment Astro types
declare module "astro" {
	interface APIContext {
		scope: Scope;
	}
	interface Locals {
		scope?: Scope;
	}
}

export interface AstroGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Astro middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * // src/middleware.ts
 * import { astroGoGoScope } from '@go-go-scope/adapter-astro'
 *
 * export const onRequest = astroGoGoScope({
 *   name: 'my-astro-app',
 *   timeout: 30000
 * })
 * ```
 *
 * @example
 * ```typescript
 * // src/pages/api/users/[id].ts
 * import type { APIRoute } from 'astro'
 *
 * export const GET: APIRoute = async ({ params, locals }) => {
 *   const s = locals.scope!
 *
 *   const [err, user] = await s.task(
 *     () => fetchUser(params.id!),
 *     { retry: 'exponential', timeout: 5000 }
 *   )
 *
 *   if (err) {
 *     return new Response(JSON.stringify({ error: err.message }), {
 *       status: 500,
 *       headers: { 'Content-Type': 'application/json' }
 *     })
 *   }
 *
 *   return new Response(JSON.stringify(user), {
 *     headers: { 'Content-Type': 'application/json' }
 *   })
 * }
 * ```
 */
export function astroGoGoScope(
	options: AstroGoGoScopeOptions = {},
): MiddlewareHandler {
	const { name = "astro-app", timeout, debug = false } = options;

	// Create root application scope (singleton per process)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (context, next) => {
		// Create request-scoped child
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${context.request.url}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);
		context.locals.scope = requestScope;

		if (debug) {
			console.log(`[go-go-scope] Request scope created: ${scopeOptions.name}`);
		}

		try {
			return await next();
		} finally {
			// Cleanup request scope
			await requestScope[Symbol.asyncDispose]().catch(() => {});

			if (debug) {
				console.log(`[go-go-scope] Request scope disposed`);
			}
		}
	};
}

/**
 * Helper to get the current scope from the API context
 *
 * @example
 * ```typescript
 * export const GET: APIRoute = async (context) => {
 *   const s = getScope(context)
 *   const [err, data] = await s.task(() => fetchData())
 *   // ...
 * }
 * ```
 */
export function getScope(context: APIContext | { locals: { scope?: Scope } }): Scope {
	const s = "locals" in context ? context.locals.scope : (context as APIContext).locals.scope;
	if (!s) {
		throw new Error(
			"No scope found in context. Make sure the astroGoGoScope middleware is registered.",
		);
	}
	return s;
}

/**
 * Helper to create an API route with automatic scope integration
 *
 * @example
 * ```typescript
 * // src/pages/api/users.ts
 * import { defineScopedRoute } from '@go-go-scope/adapter-astro'
 * import type { APIRoute } from 'astro'
 *
 * export const GET: APIRoute = defineScopedRoute(async (context, scope) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) return new Response(null, { status: 500 })
 *   return Response.json(users)
 * })
 * ```
 */
export function defineScopedRoute<T>(
	handler: (context: APIContext, scope: Scope) => Promise<T>,
): (context: APIContext) => Promise<T> {
	return async (context) => {
		const s = getScope(context);
		return handler(context, s);
	};
}

/**
 * Server-side rendering helper for Astro pages
 * Provides scope access during SSR
 *
 * @example
 * ```typescript
 * // src/pages/users.astro
 * ---
 * import { getServerScope } from '@go-go-scope/adapter-astro'
 *
 * const s = getServerScope(Astro)
 * const [err, users] = await s.task(() => fetchUsers())
 * ---
 * ```
 */
export function getServerScope(
	astro: { locals?: { scope?: Scope } },
): Scope {
	const s = astro.locals?.scope;
	if (!s) {
		// During SSR without middleware, create a temporary scope
		return scope({ name: "astro-ssr-temp" });
	}
	return s;
}
