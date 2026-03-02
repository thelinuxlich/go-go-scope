/**
 * SvelteKit adapter for go-go-scope
 *
 * Provides structured concurrency for SvelteKit server hooks,
 * API routes, and form actions with automatic cleanup.
 *
 * @example
 * ```typescript
 * // src/hooks.server.ts
 * import { createScopeHandle } from '@go-go-scope/adapter-sveltekit'
 *
 * export const handle = createScopeHandle({
 *   timeout: 30000,
 *   services: { db: createDatabase() }
 * })
 * ```
 */

import type { Handle, RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { type Scope, scope } from "go-go-scope";

/**
 * SvelteKit context with scope
 */
export interface SvelteKitContext<
	T extends Record<string, unknown> = Record<string, never>,
> {
	/** The scope for this request */
	scope: Scope<T>;
	/** Request signal for cancellation */
	signal: AbortSignal;
}

/**
 * Options for scope configuration
 */
export interface SvelteKitScopeOptions<
	T extends Record<string, unknown> = Record<string, never>,
> {
	/** Scope timeout in milliseconds */
	timeout?: number;
	/** Initial services to provide */
	services?: T;
	/** Error handler */
	onError?: (
		error: unknown,
		event: RequestEvent,
	) => Response | Promise<Response>;
}

/**
 * Create a SvelteKit handle with scope integration
 *
 * @example
 * ```typescript
 * // src/hooks.server.ts
 * import { createScopeHandle } from '@go-go-scope/adapter-sveltekit'
 * import { sequence } from '@sveltejs/kit/hooks'
 *
 * export const handle = sequence(
 *   createScopeHandle({ timeout: 30000 }),
 *   async ({ event, resolve }) => resolve(event)
 * )
 * ```
 */
export function createScopeHandle<T extends Record<string, unknown>>(
	options: SvelteKitScopeOptions<T> = {},
): Handle {
	return async ({ event, resolve }) => {
		const abortController = new AbortController();

		await using s = scope({
			timeout: options.timeout,
			signal: abortController.signal,
			name: `sveltekit-${event.request.method}-${event.url.pathname}`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		// Attach scope to event locals
		(
			event.locals as unknown as { scope: Scope<T>; signal: AbortSignal }
		).scope = s as Scope<T>;
		(
			event.locals as unknown as { scope: Scope<T>; signal: AbortSignal }
		).signal = abortController.signal;

		try {
			return await resolve(event);
		} catch (error) {
			if (options.onError) {
				return await options.onError(error, event);
			}
			throw error;
		}
	};
}

/**
 * Wrap a server load function with a scope
 *
 * @example
 * ```typescript
 * // src/routes/+page.server.ts
 * import { withScopeLoad } from '@go-go-scope/adapter-sveltekit'
 *
 * export const load = withScopeLoad(async (event) => {
 *   const { scope } = event.locals as { scope: Scope }
 *   const [err, data] = await scope.task(() => fetchData())
 *   if (err) throw error(500, err.message)
 *   return { data }
 * })
 * ```
 */
export function withScopeLoad<
	T extends Record<string, unknown>,
	R extends Record<string, unknown>,
>(
	loader: (event: ServerLoadEvent & { scope: Scope<T> }) => Promise<R> | R,
	options: Omit<SvelteKitScopeOptions<T>, "services"> = {},
): (event: ServerLoadEvent) => Promise<R> {
	return async (event: ServerLoadEvent): Promise<R> => {
		// Check if scope already exists from handle
		const existingScope = (event.locals as unknown as { scope?: Scope<T> })
			.scope;

		if (existingScope) {
			return await loader({ ...event, scope: existingScope });
		}

		// Create new scope
		await using s = scope({
			timeout: options.timeout,
			name: `sveltekit-load-${event.url.pathname}`,
		});

		return await loader({ ...event, scope: s as Scope<T> });
	};
}

/**
 * Wrap a form action with a scope
 *
 * @example
 * ```typescript
 * // src/routes/+page.server.ts
 * import { withScopeAction } from '@go-go-scope/adapter-sveltekit'
 * import { fail } from '@sveltejs/kit'
 *
 * export const actions = {
 *   create: withScopeAction(async (event) => {
 *     const { scope } = event.locals as { scope: Scope }
 *     const data = await event.request.formData()
 *
 *     const [err, result] = await scope.task(() => createItem(data))
 *     if (err) return fail(400, { error: err.message })
 *     return { success: true, result }
 *   })
 * }
 * ```
 */
export function withScopeAction<
	T extends Record<string, unknown>,
	R extends Record<string, unknown>,
>(
	action: (event: RequestEvent & { scope: Scope<T> }) => Promise<R> | R,
	options: Omit<SvelteKitScopeOptions<T>, "services"> = {},
): (event: RequestEvent) => Promise<R> {
	return async (event: RequestEvent): Promise<R> => {
		// Check if scope already exists from handle
		const existingScope = (event.locals as unknown as { scope?: Scope<T> })
			.scope;

		if (existingScope) {
			return await action({ ...event, scope: existingScope });
		}

		// Create new scope
		await using s = scope({
			timeout: options.timeout,
			name: `sveltekit-action-${event.url.pathname}`,
		});

		return await action({ ...event, scope: s as Scope<T> });
	};
}

/**
 * Type augmentation for SvelteKit locals
 */
declare global {
	namespace App {
		interface Locals {
			scope?: Scope;
			signal?: AbortSignal;
		}
	}
}
