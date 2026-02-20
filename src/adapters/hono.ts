/**
 * Hono adapter for go-go-scope
 * Lightweight middleware for Hono applications
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { type Scope, scope } from "../index.js";

// Extend Hono context
declare module "hono" {
	interface ContextVariableMap {
		scope: Scope;
		rootScope: Scope;
	}
}

export interface HonoGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Root scope reference for the Hono application
 */
let rootScope: Scope | null = null;

/**
 * Hono middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono'
 * import { goGoScope, getScope } from 'go-go-scope/adapters/hono'
 *
 * const app = new Hono()
 * app.use(goGoScope({ metrics: true }))
 *
 * app.get('/users/:id', async (c) => {
 *   const scope = getScope(c)
 *   const [err, user] = await scope.task(
 *     () => fetchUser(c.req.param('id')),
 *     { retry: 'exponential' }
 *   )
 *
 *   if (err) {
 *     return c.json({ error: err.message }, 500)
 *   }
 *   return c.json(user)
 * })
 * ```
 */
export function goGoScope(
	options: HonoGoGoScopeOptions = {},
): MiddlewareHandler {
	const { name = "hono-app", metrics = false, timeout } = options;

	// Create root scope on first use
	if (!rootScope) {
		rootScope = scope({ name, metrics });
	}

	return async (c: Context, next: Next) => {
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope!,
			name: `request-${c.req.url}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);
		c.set("scope", requestScope);
		c.set("rootScope", rootScope!);

		try {
			await next();
		} finally {
			await requestScope[Symbol.asyncDispose]().catch(() => {});
		}
	};
}

/**
 * Get the request-scoped scope from Hono context
 */
export function getScope(c: Context): Scope {
	return c.get("scope");
}

/**
 * Get the root application scope from Hono context
 */
export function getRootScope(c: Context): Scope {
	return c.get("rootScope");
}
