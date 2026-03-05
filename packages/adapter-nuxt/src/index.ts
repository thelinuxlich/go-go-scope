/**
 * Nuxt adapter for go-go-scope
 * Provides request-scoped structured concurrency for Nuxt applications
 */

import type { NitroApp, NitroAppPlugin } from "nitropack";
import { type Scope, scope } from "go-go-scope";

// Augment Nitro types
declare module "nitropack" {
	interface NitroApp {
		scope: Scope;
		hooks: {
			hook: (name: string, fn: (...args: any[]) => any) => void;
			callHook: (name: string, ...args: any[]) => Promise<void>;
		};
	}
}

declare module "h3" {
	interface H3EventContext {
		scope: Scope;
	}
}

export interface NuxtGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Nuxt Nitro plugin for go-go-scope integration
 *
 * @example
 * ```typescript
 * // server/plugins/go-go-scope.ts
 * import { nuxtGoGoScope } from '@go-go-scope/adapter-nuxt'
 *
 * export default defineNitroPlugin(nuxtGoGoScope({
 *   name: 'my-nuxt-app',
 *   timeout: 30000
 * }))
 * ```
 *
 * @example
 * ```typescript
 * // server/api/users/[id].get.ts
 * import { scope } from 'go-go-scope'
 *
 * export default defineEventHandler(async (event) => {
 *   const s = event.context.scope
 *
 *   const [err, user] = await s.task(
 *     () => fetchUser(getRouterParam(event, 'id')!),
 *     { retry: 'exponential', timeout: 5000 }
 *   )
 *
 *   if (err) {
 *     throw createError({ statusCode: 500, message: err.message })
 *   }
 *   return user
 * })
 * ```
 */
export function nuxtGoGoScope(
	options: NuxtGoGoScopeOptions = {},
): NitroAppPlugin {
	const { name = "nuxt-app", timeout, debug = false } = options;

	return (nitroApp: NitroApp) => {
		// Create root application scope
		const rootScope = scope({ name });
		nitroApp.scope = rootScope as Scope;

		if (debug) {
			console.log(`[go-go-scope] Root scope created: ${name}`);
		}

		// Create request-scoped child for each request
		nitroApp.hooks.hook("request", async (event: any) => {
			const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
				parent: rootScope as Scope,
				name: `request-${event.context.sessionId || Date.now()}`,
			};
			if (timeout) scopeOptions.timeout = timeout;

			event.context.scope = scope(scopeOptions);

			if (debug) {
				console.log(`[go-go-scope] Request scope created: ${scopeOptions.name}`);
			}
		});

		// Cleanup request scope after response
		nitroApp.hooks.hook("afterResponse", async (event: any) => {
			if (event.context.scope) {
				await event.context.scope[Symbol.asyncDispose]().catch(() => {});

				if (debug) {
					console.log(`[go-go-scope] Request scope disposed`);
				}
			}
		});

		// Cleanup root scope on shutdown
		nitroApp.hooks.hook("close", async () => {
			await rootScope[Symbol.asyncDispose]().catch(() => {});

			if (debug) {
				console.log(`[go-go-scope] Root scope disposed`);
			}
		});
	};
}

/**
 * Helper to get the current scope from the event
 *
 * @example
 * ```typescript
 * export default defineEventHandler(async (event) => {
 *   const s = getScope(event)
 *   const [err, data] = await s.task(() => fetchData())
 *   // ...
 * })
 * ```
 */
export function getScope(event: { context: { scope?: Scope } }): Scope {
	const s = event.context.scope;
	if (!s) {
		throw new Error(
			"No scope found in event context. Make sure the nuxtGoGoScope plugin is registered.",
		);
	}
	return s;
}

/**
 * Helper to create a server handler with automatic scope integration
 *
 * @example
 * ```typescript
 * // server/api/users.get.ts
 * import { defineScopedHandler } from '@go-go-scope/adapter-nuxt'
 *
 * export default defineScopedHandler(async (event, scope) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) throw createError({ statusCode: 500 })
 *   return users
 * })
 * ```
 */
export function defineScopedHandler<T>(
	handler: (event: { context: { scope: Scope } }, scope: Scope) => Promise<T>,
): (event: { context: { scope?: Scope } }) => Promise<T> {
	return async (event) => {
		const s = getScope(event);
		return handler(event as { context: { scope: Scope } }, s);
	};
}
