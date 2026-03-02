/**
 * Next.js adapter for go-go-scope
 *
 * Provides structured concurrency for Next.js API routes, Edge functions,
 * and Server Components with automatic cleanup.
 *
 * @example
 * ```typescript
 * // API Route (app/api/users/route.ts)
 * import { withScope } from '@go-go-scope/adapter-nextjs'
 *
 * export const GET = withScope(async (req, ctx) => {
 *   const [err, users] = await ctx.scope.task(() => fetchUsers())
 *   if (err) return Response.json({ error: err.message }, { status: 500 })
 *   return Response.json(users)
 * })
 * ```
 */

import { type Scope, scope } from "go-go-scope";

// Minimal NextRequest type for adapter (full types from next/server in consuming projects)
export interface NextRequest extends Request {
	cookies: {
		get(name: string): { name: string; value: string } | undefined;
		getAll(): { name: string; value: string }[];
		has(name: string): boolean;
	};
	nextUrl: {
		pathname: string;
		search: string;
	};
	ip?: string;
	geo?: {
		city?: string;
		country?: string;
		region?: string;
	};
}

// JSX namespace for server components
declare global {
	namespace JSX {
		interface Element {}
		interface IntrinsicElements {}
	}
}

/**
 * Context passed to Next.js route handlers
 */
export interface NextJSContext<
	T extends Record<string, unknown> = Record<string, never>,
> {
	/** The scope for this request */
	scope: Scope<T>;
	/** Request signal for cancellation */
	signal: AbortSignal;
}

/**
 * API Route handler with scope
 */
export type APIRouteHandler<
	T extends Record<string, unknown> = Record<string, never>,
> = (
	req: NextRequest,
	context: NextJSContext<T>,
) => Promise<Response> | Response;

/**
 * Edge Route handler with scope
 */
export type EdgeRouteHandler<
	T extends Record<string, unknown> = Record<string, never>,
> = (req: Request, context: NextJSContext<T>) => Promise<Response> | Response;

/**
 * Options for withScope wrapper
 */
export interface WithScopeOptions<
	T extends Record<string, unknown> = Record<string, never>,
> {
	/** Scope timeout in milliseconds */
	timeout?: number;
	/** Initial services to provide */
	services?: T;
	/** Enable request tracing */
	trace?: boolean;
	/** Error handler for uncaught errors */
	onError?: (error: unknown, req: NextRequest) => Response | Promise<Response>;
}

/**
 * Wrap a Next.js API route handler with a scope
 *
 * @example
 * ```typescript
 * // app/api/users/route.ts
 * import { withScope } from '@go-go-scope/adapter-nextjs'
 *
 * export const GET = withScope(async (req, { scope }) => {
 *   const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))
 *   if (err) return Response.json({ error: err.message }, { status: 500 })
 *   return Response.json(users)
 * })
 *
 * // With custom options
 * export const POST = withScope(
 *   async (req, { scope }) => {
 *     const [err, result] = await scope.task(() => createUser(req))
 *     if (err) return Response.json({ error: err.message }, { status: 400 })
 *     return Response.json(result, { status: 201 })
 *   },
 *   { timeout: 5000 }
 * )
 * ```
 */
export function withScope<
	T extends Record<string, unknown> = Record<string, never>,
>(
	handler: APIRouteHandler<T>,
	options: WithScopeOptions<T> = {},
): (req: NextRequest) => Promise<Response> {
	return async (req: NextRequest): Promise<Response> => {
		await using s = scope({
			timeout: options.timeout,
			signal: req.signal,
			name: `nextjs-${req.method}-${req.url}`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		const context: NextJSContext<T> = {
			scope: s as Scope<T>,
			signal: req.signal,
		};

		try {
			return await handler(req, context);
		} catch (error) {
			if (options.onError) {
				return await options.onError(error, req);
			}
			console.error("Unhandled error in Next.js route:", error);
			return Response.json({ error: "Internal Server Error" }, { status: 500 });
		}
	};
}

/**
 * Wrap a Next.js Edge route handler with a scope
 *
 * @example
 * ```typescript
 * // middleware.ts or edge route
 * import { withScopeEdge } from '@go-go-scope/adapter-nextjs'
 *
 * export const config = {
 *   runtime: 'edge',
 * }
 *
 * export default withScopeEdge(async (req, { scope }) => {
 *   const [err, result] = await scope.task(() => fetchEdgeData())
 *   if (err) return new Response('Error', { status: 500 })
 *   return new Response(JSON.stringify(result))
 * })
 * ```
 */
export function withScopeEdge<
	T extends Record<string, unknown> = Record<string, never>,
>(
	handler: EdgeRouteHandler<T>,
	options: WithScopeOptions<T> = {},
): (req: Request) => Promise<Response> {
	return async (req: Request): Promise<Response> => {
		const abortController = new AbortController();

		// Link to request signal if available
		if ((req as unknown as { signal?: AbortSignal }).signal) {
			(req as unknown as { signal: AbortSignal }).signal.addEventListener(
				"abort",
				() => {
					abortController.abort();
				},
			);
		}

		await using s = scope({
			timeout: options.timeout,
			signal: abortController.signal,
			name: `nextjs-edge-${req.url}`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		const context: NextJSContext<T> = {
			scope: s as Scope<T>,
			signal: abortController.signal,
		};

		try {
			return await handler(req, context);
		} catch (error) {
			if (options.onError) {
				return await options.onError(error, req as unknown as NextRequest);
			}
			console.error("Unhandled error in Edge route:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	};
}

/**
 * Server Component wrapper with scope
 *
 * @example
 * ```typescript
 * // app/users/page.tsx
 * import { withScopeServer } from '@go-go-scope/adapter-nextjs'
 *
 * export default withScopeServer(async (searchParams, { scope }) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) return <Error message={err.message} />
 *   return <UserList users={users} />
 * })
 * ```
 */
export function withScopeServer<
	T extends Record<string, unknown> = Record<string, never>,
	Props extends Record<string, unknown> = Record<string, never>,
>(
	component: (
		props: Props,
		context: NextJSContext<T>,
	) => Promise<JSX.Element> | JSX.Element,
	options: WithScopeOptions<T> = {},
): (props: Props) => Promise<JSX.Element> {
	return async (props: Props): Promise<JSX.Element> => {
		await using s = scope({
			timeout: options.timeout,
			name: `nextjs-server-component`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		const context: NextJSContext<T> = {
			scope: s as Scope<T>,
			signal: s.signal,
		};

		try {
			return await component(props, context);
		} catch (error) {
			console.error("Unhandled error in Server Component:", error);
			throw error;
		}
	};
}

/**
 * Middleware wrapper with scope
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { withScopeMiddleware } from '@go-go-scope/adapter-nextjs'
 * import { NextResponse } from 'next/server'
 *
 * export default withScopeMiddleware(async (req, { scope }) => {
 *   const [err, session] = await scope.task(() => validateSession(req))
 *   if (err || !session) {
 *     return NextResponse.redirect(new URL('/login', req.url))
 *   }
 *   return NextResponse.next()
 * })
 * ```
 */
export function withScopeMiddleware<
	T extends Record<string, unknown> = Record<string, never>,
>(
	handler: (
		req: NextRequest,
		context: NextJSContext<T>,
	) => Promise<Response> | Response,
	options: WithScopeOptions<T> = {},
): (req: NextRequest) => Promise<Response> {
	return withScope(handler, options);
}

/**
 * Higher-order function for route handlers with dependency injection
 *
 * @example
 * ```typescript
 * // With dependency injection
 * const handler = withScopeAndServices(
 *   { db: createDatabase() },
 *   async (req, { scope }) => {
 *     const db = scope.use('db')
 *     const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))
 *     return Response.json(users)
 *   }
 * )
 * ```
 */
export function withScopeAndServices<T extends Record<string, unknown>>(
	services: T,
	handler: APIRouteHandler<T>,
	options: Omit<WithScopeOptions<T>, "services"> = {},
): (req: NextRequest) => Promise<Response> {
	return withScope(handler, { ...options, services });
}

/**
 * Create a reusable scope configuration for API routes
 *
 * @example
 * ```typescript
 * // lib/scope.ts
 * import { createRouteConfig } from '@go-go-scope/adapter-nextjs'
 * import { createDatabase } from './db'
 *
 * export const routeConfig = createRouteConfig({
 *   timeout: 10000,
 *   services: { db: createDatabase() },
 *   onError: (err) => Response.json({ error: err.message }, { status: 500 })
 * })
 *
 * // app/api/users/route.ts
 * import { routeConfig } from '@/lib/scope'
 *
 * export const GET = routeConfig.wrap(async (req, { scope }) => {
 *   const db = scope.use('db')
 *   // ...
 * })
 * ```
 */
export function createRouteConfig<T extends Record<string, unknown>>(
	config: WithScopeOptions<T>,
) {
	return {
		wrap: (handler: APIRouteHandler<T>) => withScope(handler, config),
		wrapEdge: (handler: EdgeRouteHandler<T>) => withScopeEdge(handler, config),
		wrapServer: <Props extends Record<string, unknown>>(
			component: (
				props: Props,
				context: NextJSContext<T>,
			) => Promise<JSX.Element> | JSX.Element,
		) => withScopeServer(component, config),
	};
}

/**
 * Error classes for Next.js adapter
 */
export class NextJSRouteError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number = 500,
		public readonly code?: string,
	) {
		super(message);
		this.name = "NextJSRouteError";
	}
}

/**
 * Helper to create typed error responses
 */
export function errorResponse(error: unknown, statusCode = 500): Response {
	if (error instanceof NextJSRouteError) {
		return Response.json(
			{ error: error.message, code: error.code },
			{ status: error.statusCode },
		);
	}

	const message = error instanceof Error ? error.message : "Unknown error";
	return Response.json({ error: message }, { status: statusCode });
}

/**
 * Helper to create success responses with proper typing
 */
export function jsonResponse<T>(data: T, statusCode = 200): Response {
	return Response.json(data, { status: statusCode });
}
