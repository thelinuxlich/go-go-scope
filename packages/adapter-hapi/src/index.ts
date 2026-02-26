/**
 * Hapi adapter for go-go-scope
 * Provides request-scoped structured concurrency for Hapi applications
 */

import type { Plugin, Request, Server } from "@hapi/hapi";
import { type Scope, scope } from "go-go-scope";

// Augment Hapi types
declare module "@hapi/hapi" {
	interface Request {
		scope: Scope<Record<string, unknown>>;
		rootScope: Scope<Record<string, unknown>>;
	}
	interface Server {
		rootScope: Scope<Record<string, unknown>>;
	}
}

export interface HapiGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Hapi plugin for go-go-scope integration
 *
 * @example
 * ```typescript
 * import Hapi from '@hapi/hapi'
 * import { hapiGoGoScope } from '@go-go-scope/adapter-hapi'
 *
 * const server = Hapi.server({ port: 3000 })
 * await server.register({
 *   plugin: hapiGoGoScope,
 *   options: { name: 'my-api', metrics: true }
 * })
 *
 * server.route({
 *   method: 'GET',
 *   path: '/users/{id}',
 *   handler: async (request) => {
 *     const [err, user] = await request.scope.task(
 *       () => fetchUser(request.params.id),
 *       { retry: 'exponential' }
 *     )
 *
 *     if (err) {
 *       return { error: err.message }
 *     }
 *     return user
 *   }
 * })
 * ```
 */
export const hapiGoGoScope: Plugin<HapiGoGoScopeOptions> = {
	name: "hapi-go-go-scope",
	version: "2.1.0",
	register: async (server: Server, options: HapiGoGoScopeOptions) => {
		const { name = "hapi-app", timeout } = options;

		// Create root application scope
		const rootScope = scope({ name });
		server.rootScope = rootScope;

		// Extend request with scope decoration
		// biome-ignore lint/suspicious/noExplicitAny: Hapi decoration requires any
		server.decorate("request", "scope", null as any);
		server.decorate("request", "rootScope", rootScope);

		// Create request-scoped child on each request
		server.ext("onRequest", (request: Request, h) => {
			const scopeOptions: { parent: Scope<Record<string, unknown>>; name: string; timeout?: number } = {
				parent: rootScope,
				// biome-ignore lint/suspicious/noExplicitAny: Hapi request info access
				name: `request-${(request as any).id || request.info.id}`,
			};
			if (timeout) scopeOptions.timeout = timeout;

			// biome-ignore lint/suspicious/noExplicitAny: Hapi decoration pattern
			(request as any).scope = scope(scopeOptions);

			return h.continue;
		});

		// Cleanup request scope after response
		server.ext("onPostResponse", async (request: Request, h) => {
			// biome-ignore lint/suspicious/noExplicitAny: Accessing decorated property
			const requestScope = (request as any).scope as Scope | undefined;
			if (requestScope) {
				await requestScope[Symbol.asyncDispose]().catch(() => {});
			}
			return h.continue;
		});

		// Cleanup root scope on server stop
		server.ext("onPostStop", async () => {
			await rootScope[Symbol.asyncDispose]().catch(() => {});
		});
	},
};

/**
 * Get the request-scoped scope from Hapi request
 */
export function getScope(request: Request): Scope<Record<string, unknown>> {
	// biome-ignore lint/suspicious/noExplicitAny: Accessing decorated property
	const requestScope = (request as any).scope as Scope | undefined;
	if (!requestScope) {
		throw new Error(
			"Scope not available. Ensure hapiGoGoScope plugin is registered.",
		);
	}
	return requestScope;
}

/**
 * Get the root application scope from Hapi server
 */
export function getRootScope(server: Server): Scope<Record<string, unknown>> {
	if (!server.rootScope) {
		throw new Error(
			"Root scope not available. Ensure hapiGoGoScope plugin is registered.",
		);
	}
	return server.rootScope;
}

/**
 * Graceful shutdown helper for Hapi applications
 * Disposes the root scope when the server is closing
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await closeHapiScope(server)
 *   await server.stop()
 * })
 * ```
 */
export async function closeHapiScope(server: Server): Promise<void> {
	if (server.rootScope) {
		await server.rootScope[Symbol.asyncDispose]().catch(() => {});
	}
}
