/**
 * Elysia adapter for go-go-scope
 * Native Bun-first adapter for Elysia applications
 */

import type { Elysia } from "elysia";
import { type Scope, scope } from "go-go-scope";

export interface ElysiaGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Store root scope reference
 */
let rootScope: Scope<Record<string, unknown>> | null = null;

/**
 * Symbol for storing scope in Elysia store
 */
export const SCOPE_KEY = Symbol("go-go-scope");
export const ROOT_SCOPE_KEY = Symbol("go-go-root-scope");

// Note: Elysia's Context is a type alias, not an interface,
// so we cannot use module augmentation. The scope is injected
// via the .derive() method in the plugin.

/**
 * Elysia plugin for go-go-scope integration
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { goGoScope } from '@go-go-scope/adapter-elysia'
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
	const { name = "elysia-app", timeout } = options;

	// Create root scope on first use
	if (!rootScope) {
		rootScope = scope({ name });
	}

	return (app: Elysia) => {
		if (!rootScope) {
			throw new Error("Root scope not initialized");
		}

		return (
			app
				// Use state to store root scope
				.state("rootScope", rootScope)
				.onRequest(({ store, request }) => {
					// Create request-scoped child
					const scopeOptions: {
						parent: Scope<Record<string, unknown>>;
						name: string;
						timeout?: number;
					} = {
						parent: rootScope!,
						// biome-ignore lint/suspicious/noExplicitAny: Elysia request access
						name: `request-${(request as any).url || "unknown"}`,
					};
					if (timeout) scopeOptions.timeout = timeout;

					// Store request scope using symbol
					(store as Record<symbol, Scope<Record<string, unknown>>>)[SCOPE_KEY] = scope(scopeOptions);
				})
				.derive(({ store }) => ({
					scope: (store as Record<symbol, Scope<Record<string, unknown>>>)[SCOPE_KEY],
					rootScope: store.rootScope as Scope<Record<string, unknown>>,
				}))
				.onAfterResponse(({ store }) => {
					// Cleanup request scope
					const requestScope = (store as Record<symbol, Scope<Record<string, unknown>> | undefined>)[
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
export function getScope(context: { scope?: Scope<Record<string, unknown>> }): Scope<Record<string, unknown>> {
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
export function getRootScope(context: { rootScope?: Scope<Record<string, unknown>> }): Scope<Record<string, unknown>> {
	if (!context.rootScope) {
		throw new Error(
			"Root scope not available. Ensure goGoScope plugin is registered.",
		);
	}
	return context.rootScope;
}
