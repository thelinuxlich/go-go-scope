/**
 * Elysia adapter for go-go-scope
 * Native Bun-first adapter for Elysia applications
 */

import type { Context, Elysia } from "elysia";
import { type Scope, scope } from "../index.js";

export interface ElysiaGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Store root scope reference
 */
let rootScope: Scope | null = null;

/**
 * Symbol for storing scope in Elysia store
 */
export const SCOPE_KEY = Symbol("go-go-scope");
export const ROOT_SCOPE_KEY = Symbol("go-go-root-scope");

// biome-ignore lint/suspicious/noRedeclare: Augmenting Elysia types for plugin
declare global {
	namespace Elysia {
		interface Context {
			scope: Scope;
			rootScope: Scope;
		}
	}
}

/**
 * Elysia plugin for go-go-scope integration
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { goGoScope } from 'go-go-scope/adapters/elysia'
 *
 * const app = new Elysia()
 *   .use(goGoScope({ metrics: true }))
 *   .get('/users/:id', async ({ scope, params }) => {
 *     const [err, user] = await scope.task(
 *       () => fetchUser(params.id),
 *       { retry: 'exponential' }
 *     )
 *
 *     if (err) {
 *       return { error: err.message }
 *     }
 *     return user
 *   })
 * ```
 */
export function goGoScope(options: ElysiaGoGoScopeOptions = {}) {
	const { name = "elysia-app", metrics = false, timeout } = options;

	// Create root scope on first use
	if (!rootScope) {
		rootScope = scope({ name, metrics });
	}

	return (app: Elysia) => {
		return (
			app
				// Use state to store root scope
				.state("rootScope", rootScope!)
				.onRequest(({ store, request }) => {
					// Create request-scoped child
					const scopeOptions: {
						parent: Scope;
						name: string;
						timeout?: number;
					} = {
						parent: rootScope!,
						name: `request-${request.url}`,
					};
					if (timeout) scopeOptions.timeout = timeout;

					// Store request scope using symbol
					(store as Record<symbol, Scope>)[SCOPE_KEY] = scope(scopeOptions);
				})
				.derive(({ store }) => ({
					scope: (store as Record<symbol, Scope>)[SCOPE_KEY],
					rootScope: store.rootScope,
				}))
				.onAfterResponse(({ store }) => {
					// Cleanup request scope
					const requestScope = (store as Record<symbol, Scope | undefined>)[
						SCOPE_KEY
					];
					if (requestScope) {
						requestScope[Symbol.asyncDispose]().catch(() => {});
					}
				})
		);
	};
}

/**
 * Get scope from Elysia context (for use outside of handlers)
 */
export function getScope(context: Context & { scope?: Scope }): Scope {
	if (!context.scope) {
		throw new Error(
			"Scope not available. Ensure goGoScope plugin is registered.",
		);
	}
	return context.scope;
}

/**
 * Get root scope from Elysia context
 */
export function getRootScope(context: Context & { rootScope?: Scope }): Scope {
	if (!context.rootScope) {
		throw new Error(
			"Root scope not available. Ensure goGoScope plugin is registered.",
		);
	}
	return context.rootScope;
}
