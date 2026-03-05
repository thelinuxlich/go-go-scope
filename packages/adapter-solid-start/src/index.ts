/**
 * SolidStart adapter for go-go-scope
 * Provides request-scoped structured concurrency for SolidStart applications
 */

import type { FetchEvent } from "@solidjs/start/server";
import { type Scope, scope } from "go-go-scope";

// Augment SolidStart types
declare module "@solidjs/start/server" {
	interface FetchEvent {
		scope: Scope;
		request: Request;
		respondWith(response: Response | Promise<Response>): Promise<void>;
	}
}

export interface SolidStartGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * SolidStart middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * // src/middleware.ts
 * import { createMiddleware } from '@solidjs/start/middleware'
 * import { solidStartGoGoScope } from '@go-go-scope/adapter-solid-start'
 *
 * export default createMiddleware({
 *   onRequest: [
 *     solidStartGoGoScope({
 *       name: 'my-solid-app',
 *       timeout: 30000
 *     })
 *   ]
 * })
 * ```
 *
 * @example
 * ```typescript
 * // src/routes/api/users/[id].ts
 * import { json } from '@solidjs/router'
 * import { getScope } from '@go-go-scope/adapter-solid-start'
 * import type { APIEvent } from '@solidjs/start/server'
 *
 * export const GET = async (event: APIEvent) => {
 *   const s = getScope(event)
 *   const id = event.params.id
 *
 *   const [err, user] = await s.task(
 *     () => fetchUser(id),
 *     { retry: 'exponential', timeout: 5000 }
 *   )
 *
 *   if (err) {
 *     return json({ error: err.message }, { status: 500 })
 *   }
 *   return json(user)
 * }
 * ```
 */
export function solidStartGoGoScope(
	options: SolidStartGoGoScopeOptions = {},
) {
	const { name = "solid-start-app", timeout, debug = false } = options;

	// Create root application scope (singleton per process)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (event: FetchEvent) => {
		// Create request-scoped child
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${event.request.url}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		event.scope = scope(scopeOptions);

		if (debug) {
			console.log(`[go-go-scope] Request scope created: ${scopeOptions.name}`);
		}

		// Attach cleanup to event response
		const originalRespondWith = event.respondWith.bind(event);
		event.respondWith = async (response: Response | Promise<Response>) => {
			try {
				return await originalRespondWith(response);
			} finally {
				// Cleanup request scope
				await event.scope[Symbol.asyncDispose]().catch(() => {});

				if (debug) {
					console.log(`[go-go-scope] Request scope disposed`);
				}
			}
		};
	};
}

/**
 * Helper to get the current scope from the fetch event
 *
 * @example
 * ```typescript
 * const GET = async (event: APIEvent) => {
 *   const s = getScope(event)
 *   const [err, data] = await s.task(() => fetchData())
 *   // ...
 * }
 * ```
 */
export function getScope(event: { scope?: Scope<any> }): Scope<any> {
	const s = event.scope;
	if (!s) {
		throw new Error(
			"No scope found in event. Make sure the solidStartGoGoScope middleware is registered.",
		);
	}
	return s;
}

/**
 * Helper to create an API handler with automatic scope integration
 *
 * @example
 * ```typescript
 * import { defineScopedHandler } from '@go-go-scope/adapter-solid-start'
 * import type { APIEvent } from '@solidjs/start/server'
 *
 * export const GET = defineScopedHandler(async (event, scope) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) return json({ error: err.message }, { status: 500 })
 *   return json(users)
 * })
 * ```
 */
export function defineScopedHandler<T>(
	handler: (event: FetchEvent, scope: Scope<any>) => Promise<T>,
): (event: FetchEvent) => Promise<T> {
	return async (event) => {
		const s = getScope(event);
		return handler(event, s);
	};
}

/**
 * Server function wrapper with scope access
 * For use with SolidStart's createServerData$, createServerAction$, etc.
 *
 * @example
 * ```typescript
 * // src/lib/users.ts
 * import { createServerAction$ } from '@solidjs/router'
 * import { withScope } from '@go-go-scope/adapter-solid-start'
 *
 * export const createUser = withScope(async (scope, formData: FormData) => {
 *   const name = formData.get('name') as string
 *   const [err, user] = await scope.task(() => db.insert('users', { name }))
 *   if (err) throw err
 *   return user
 * })
 *
 * // Usage in component
 * const [, createUserAction] = createServerAction$(createUser)
 * ```
 */
export function withScope<TArgs extends unknown[], TReturn>(
	fn: (scope: Scope<any>, ...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
	return async (...args) => {
		// Create a temporary scope for this server function call
		const s = scope({ name: "solid-start-server-fn" });
		try {
			return await fn(s, ...args);
		} finally {
			await s[Symbol.asyncDispose]().catch(() => {});
		}
	};
}
