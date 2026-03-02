/**
 * Koa adapter for go-go-scope
 * Provides request-scoped structured concurrency for Koa applications
 */

import { type Scope, scope } from "go-go-scope";
import type { Context, Middleware, Next } from "koa";

// Augment Koa types
declare module "koa" {
	interface DefaultState {
		scope: Scope<Record<string, unknown>>;
		rootScope: Scope<Record<string, unknown>>;
	}
}

export interface KoaGoGoScopeOptions {
	/** Root scope name */
	name?: string;

	/** Default timeout for all requests */
	timeout?: number;
	/** Optional error handler */
	onError?: (error: Error, ctx: Context) => void;
}

/**
 * Root scope reference for the Koa application
 */
let rootScope: Scope<Record<string, unknown>> | null = null;

/**
 * Koa middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * import Koa from 'koa'
 * import { koaGoGoScope } from '@go-go-scope/adapter-koa'
 *
 * const app = new Koa()
 * app.use(koaGoGoScope({ name: 'my-api', metrics: true }))
 *
 * app.use(async (ctx) => {
 *   const scope = ctx.state.scope
 *   const [err, user] = await scope.task(
 *     () => fetchUser(ctx.params.id),
 *     { retry: 'exponential' }
 *   )
 *
 *   if (err) {
 *     ctx.status = 500
 *     ctx.body = { error: err.message }
 *     return
 *   }
 *   ctx.body = user
 * })
 * ```
 */
export function koaGoGoScope(options: KoaGoGoScopeOptions = {}): Middleware {
	const { name = "koa-app", timeout, onError } = options;

	// Create root scope on first use
	if (!rootScope) {
		rootScope = scope({ name });
	}

	return async (ctx: Context, next: Next) => {
		if (!rootScope) {
			throw new Error("Root scope not initialized");
		}

		const scopeOptions: {
			parent: Scope<Record<string, unknown>>;
			name: string;
			timeout?: number;
		} = {
			parent: rootScope!,
			name: `request-${ctx.request.url}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);
		ctx.state.scope = requestScope;
		ctx.state.rootScope = rootScope;

		try {
			await next();
		} catch (error) {
			if (onError) {
				onError(error as Error, ctx);
			}
			throw error;
		} finally {
			await requestScope[Symbol.asyncDispose]().catch((err) => {
				if (onError) {
					onError(err as Error, ctx);
				}
			});
		}
	};
}

/**
 * Get the request-scoped scope from Koa context
 */
export function getScope(ctx: Context): Scope<Record<string, unknown>> {
	return ctx.state.scope;
}

/**
 * Get the root application scope from Koa context
 */
export function getRootScope(ctx: Context): Scope<Record<string, unknown>> {
	return ctx.state.rootScope;
}

/**
 * Graceful shutdown helper for Koa applications
 * Disposes the root scope when the server is closing
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await closeKoaScope()
 *   server.close()
 * })
 * ```
 */
export async function closeKoaScope(): Promise<void> {
	if (rootScope) {
		await rootScope[Symbol.asyncDispose]().catch(() => {});
		rootScope = null;
	}
}
