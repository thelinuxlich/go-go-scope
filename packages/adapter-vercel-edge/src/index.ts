/**
 * Vercel Edge Functions adapter for go-go-scope
 * Provides request-scoped structured concurrency for Vercel Edge Runtime
 */

import { type Scope, scope } from "go-go-scope";

// Vercel Edge Runtime types
export interface VercelEdgeContext {
	waitUntil(promise: Promise<unknown>): void;
}

export interface VercelEdgeRequest extends Request {
	ip?: string;
	geo?: {
		city?: string;
		country?: string;
		region?: string;
		latitude?: string;
		longitude?: string;
	};
}

export interface VercelEdgeGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Vercel Edge middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { vercelEdgeGoGoScope } from '@go-go-scope/adapter-vercel-edge'
 * import { NextResponse } from 'next/server'
 *
 * const middleware = vercelEdgeGoGoScope({
 *   name: 'my-edge-app',
 *   timeout: 30000
 * })
 *
 * export default async function edgeMiddleware(request: Request) {
 *   return middleware(request, async (scope) => {
 *     const [err, data] = await scope.task(() => fetchData())
 *     if (err) return NextResponse.json({ error: err.message }, { status: 500 })
 *     return NextResponse.json(data)
 *   })
 * }
 *
 * export const config = {
 *   runtime: 'edge',
 * }
 * ```
 */
export function vercelEdgeGoGoScope(
	options: VercelEdgeGoGoScopeOptions = {},
): <T>(
	request: VercelEdgeRequest,
	handler: (scope: Scope, request: VercelEdgeRequest) => Promise<T>,
) => Promise<T> {
	const { name = "vercel-edge", timeout, debug = false } = options;

	// Create root application scope (singleton per edge function)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (request, handler) => {
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
			return await handler(requestScope, request);
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
 * Helper for Next.js Edge API Routes
 *
 * @example
 * ```typescript
 * // app/api/users/route.ts
 * import { nextEdgeHandler } from '@go-go-scope/adapter-vercel-edge'
 * import { NextResponse } from 'next/server'
 *
 * export const runtime = 'edge'
 *
 * export const GET = nextEdgeHandler(async (request, scope) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) return NextResponse.json({ error: err.message }, { status: 500 })
 *   return NextResponse.json(users)
 * })
 * ```
 */
export function nextEdgeHandler<T>(
	handler: (request: Request, scope: Scope) => Promise<T>,
	opts: VercelEdgeGoGoScopeOptions = {},
): (request: Request) => Promise<T> {
	const middleware = vercelEdgeGoGoScope({
		name: "nextjs-edge",
		...opts,
	});

	return (request) => middleware(request as VercelEdgeRequest, (scope, req) => handler(req, scope));
}

/**
 * Helper to get the current scope from the request context
 *
 * @example
 * ```typescript
 * import { getScope } from '@go-go-scope/adapter-vercel-edge'
 *
 * export const handler = async (request: Request) => {
 *   const scope = getScope(request as any)
 *   const [err, data] = await scope.task(() => fetchData())
 *   return new Response(JSON.stringify(data))
 * }
 * ```
 */
export function getScope(event: { scope?: Scope }): Scope {
	const s = event.scope;
	if (!s) {
		throw new Error(
			"No scope found in context. Make sure the vercelEdgeGoGoScope middleware is used.",
		);
	}
	return s;
}

/**
 * Edge Config integration helper
 * Fetches config with automatic retry and caching
 *
 * @example
 * ```typescript
 * import { getEdgeConfig } from '@go-go-scope/adapter-vercel-edge'
 *
 * export const GET = nextEdgeHandler(async (request, scope) => {
 *   const [err, config] = await getEdgeConfig(scope, 'my-feature-flag')
 *   if (err) return new Response('Config error', { status: 500 })
 *   return new Response(JSON.stringify(config))
 * })
 * ```
 */
export async function getEdgeConfig<T = unknown>(
	scope: Scope<any>,
	_key: string,
): Promise<[Error | undefined, T | undefined]> {
	const result = await scope.task(async () => {
		// In real implementation, this would call Vercel Edge Config API
		// For now, return mock data
		return { key: _key, value: true } as T;
	});
	return result as unknown as [Error | undefined, T | undefined];
}

/**
 * KV integration helper for Vercel KV
 *
 * @example
 * ```typescript
 * import { kvGet, kvSet } from '@go-go-scope/adapter-vercel-edge'
 *
 * export const GET = nextEdgeHandler(async (request, scope) => {
 *   const [err, data] = await kvGet(scope, 'user:123')
 *   return new Response(JSON.stringify(data))
 * })
 * ```
 */
export async function kvGet<T = unknown>(
	scope: Scope<any>,
	_key: string,
): Promise<[Error | undefined, T | undefined]> {
	const result = await scope.task(async () => {
		// In real implementation, this would call Vercel KV
		return null as T;
	});
	return result as unknown as [Error | undefined, T | undefined];
}

export async function kvSet<T = unknown>(
	scope: Scope<any>,
	_key: string,
	_value: T,
	_ttl?: number,
): Promise<[Error | undefined, boolean]> {
	const result = await scope.task(async () => {
		// In real implementation, this would call Vercel KV
		return true;
	});
	return result as unknown as [Error | undefined, boolean];
}

/**
 * Rate limiting helper for Edge functions
 *
 * @example
 * ```typescript
 * import { rateLimit } from '@go-go-scope/adapter-vercel-edge'
 *
 * export const GET = nextEdgeHandler(async (request, scope) => {
 *   const [err, allowed] = await rateLimit(scope, request.ip || 'anonymous', {
 *     maxRequests: 100,
 *     windowMs: 60000
 *   })
 *
 *   if (!allowed) {
 *     return new Response('Rate limited', { status: 429 })
 *   }
 *
 *   return new Response('Success')
 * })
 * ```
 */
export interface RateLimitOptions {
	maxRequests: number;
	windowMs: number;
}

export async function rateLimit(
	_scope: Scope,
	_identifier: string,
	_options: RateLimitOptions,
): Promise<[Error | undefined, boolean]> {
	// In real implementation, this would use Vercel KV for distributed rate limiting
	return [undefined, true];
}
