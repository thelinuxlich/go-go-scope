/**
 * Fresh (Deno) adapter for go-go-scope
 * Provides request-scoped structured concurrency for Fresh applications
 */

import { type Scope, scope } from "go-go-scope";

// Fresh types
export interface FreshContext {
	params: Record<string, string | string[]>;
	url: URL;
}

export interface FreshRequest extends Request {
	ctx: FreshContext;
}

export interface FreshHandlers {
	GET?: FreshHandler;
	POST?: FreshHandler;
	PUT?: FreshHandler;
	DELETE?: FreshHandler;
	PATCH?: FreshHandler;
}

export type FreshHandler = (
	req: Request,
	ctx: FreshContext,
) => Response | Promise<Response>;

export interface FreshGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Fresh middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * // routes/_middleware.ts
 * import { freshGoGoScope } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = freshGoGoScope({
 *   name: 'my-fresh-app',
 *   timeout: 30000
 * })
 * ```
 */
export function freshGoGoScope(
	options: FreshGoGoScopeOptions = {},
): (req: Request, ctx: FreshContext) => Promise<Response> {
	const { name = "fresh-app", timeout, debug = false } = options;

	// Create root application scope (singleton per process)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (_req, ctx) => {
		// Create request-scoped child
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${ctx.url.pathname}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);

		if (debug) {
			console.log(`[go-go-scope] Request scope created: ${scopeOptions.name}`);
		}

		// Store scope in context for access by handlers
		(ctx as any).scope = requestScope;

		try {
			// Continue to next handler - Fresh will handle the route matching
			return new Response("Middleware placeholder - use defineRouteHandler", {
				status: 200,
			});
		} finally {
			// Note: In Fresh, we need to wrap individual route handlers
			// This middleware just sets up the scope
		}
	};
}

/**
 * Helper to define a route handler with automatic scope integration
 *
 * @example
 * ```typescript
 * // routes/api/users.ts
 * import { defineRouteHandler } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = defineRouteHandler({
 *   async GET(req, ctx, scope) {
 *     const [err, users] = await scope.task(() => fetchUsers())
 *     if (err) return new Response('Error', { status: 500 })
 *     return Response.json(users)
 *   },
 *   async POST(req, ctx, scope) {
 *     const [err, user] = await scope.task(() => createUser(req))
 *     if (err) return new Response('Error', { status: 500 })
 *     return Response.json(user, { status: 201 })
 *   }
 * })
 * ```
 */
export function defineRouteHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}): FreshHandlers {
	const wrappedHandlers: FreshHandlers = {};

	for (const [method, handler] of Object.entries(handlers)) {
		if (!handler) continue;

		wrappedHandlers[method as keyof FreshHandlers] = async (req: Request, ctx: FreshContext) => {
			const requestScope = scope({
				name: `fresh-${method}-${ctx.url.pathname}`,
			});
			
			try {
				return await handler(req, ctx, requestScope);
			} finally {
				await requestScope[Symbol.asyncDispose]().catch(() => {});
			}
		};
	}

	return wrappedHandlers;
}

/**
 * Helper to get the current scope from Fresh context
 *
 * @example
 * ```typescript
 * // routes/api/data.ts
 * import { getScope } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = {
 *   async GET(req, ctx) {
 *     const scope = getScope(ctx)
 *     const [err, data] = await scope.task(() => fetchData())
 *     return Response.json(data)
 *   }
 * }
 * ```
 */
export function getScope(ctx: FreshContext | { scope?: Scope }): Scope {
	const s = "scope" in ctx ? (ctx as any).scope : undefined;
	if (!s) {
		throw new Error(
			"No scope found in context. Make sure the freshGoGoScope middleware is registered.",
		);
	}
	return s;
}

/**
 * Helper for Fresh Islands with scope integration
 *
 * @example
 * ```typescript
 * // islands/Counter.tsx
 * import { withIslandScope } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = withIslandScope(async (req, scope) => {
 *   const [err, count] = await scope.task(() => getCount())
 *   return { count: count || 0 }
 * })
 * ```
 */
export async function withIslandScope<T>(
	handler: (req: Request, scope: Scope<any>) => Promise<T>,
	opts: { name?: string; timeout?: number } = {},
): Promise<T> {
	const { name = "fresh-island", timeout } = opts;

	const s = scope({ name, timeout });
	try {
		return await handler({} as Request, s);
	} finally {
		await s[Symbol.asyncDispose]().catch(() => {});
	}
}

/**
 * Helper for Fresh handlers with automatic error handling
 *
 * @example
 * ```typescript
 * // routes/api/users.ts
 * import { createSafeHandler } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = createSafeHandler({
 *   async GET(req, ctx, scope) {
 *     const users = await scope.task(() => fetchUsers())
 *     return Response.json(users[1]) // users[1] is the data
 *   }
 * })
 * ```
 */
export function createSafeHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}): FreshHandlers {
	const wrappedHandlers: FreshHandlers = {};

	for (const [method, handler] of Object.entries(handlers)) {
		if (!handler) continue;

		wrappedHandlers[method as keyof FreshHandlers] = async (req: Request, ctx: FreshContext) => {
			const requestScope = scope({
				name: `fresh-${method}-${ctx.url.pathname}`,
			});

			try {
				return await handler(req, ctx, requestScope);
			} catch (error) {
				console.error(`[go-go-scope] ${method} handler error:`, error);
				return new Response(
					JSON.stringify({ error: "Internal Server Error" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			} finally {
				await requestScope[Symbol.asyncDispose]().catch(() => {});
			}
		};
	}

	return wrappedHandlers;
}

/**
 * Helper to create a JSON API response handler
 *
 * @example
 * ```typescript
 * // routes/api/users.ts
 * import { createJsonHandler } from '@go-go-scope/adapter-fresh'
 *
 * export const handler = createJsonHandler({
 *   async GET(req, ctx, scope) {
 *     const [err, users] = await scope.task(() => fetchUsers())
 *     if (err) throw err
 *     return users
 *   },
 *   async POST(req, ctx, scope) {
 *     const body = await req.json()
 *     const [err, user] = await scope.task(() => createUser(body))
 *     if (err) throw err
 *     return { data: user, status: 201 }
 *   }
 * })
 * ```
 */
export function createJsonHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
}): FreshHandlers {
	const wrappedHandlers: FreshHandlers = {};

	for (const [method, handler] of Object.entries(handlers)) {
		if (!handler) continue;

		wrappedHandlers[method as keyof FreshHandlers] = async (req: Request, ctx: FreshContext) => {
			const requestScope = scope({
				name: `fresh-json-${method}-${ctx.url.pathname}`,
			});

			try {
				const result = await handler(req, ctx, requestScope);

				// Support { data, status } format
				if (result && typeof result === "object" && "data" in result) {
					const { data, status = 200 } = result as { data: unknown; status?: number };
					return Response.json(data, { status });
				}

				return Response.json(result);
			} catch (error) {
				console.error(`[go-go-scope] ${method} handler error:`, error);
				const message = error instanceof Error ? error.message : "Unknown error";
				return Response.json({ error: message }, { status: 500 });
			}
		};
	}

	return wrappedHandlers;
}
