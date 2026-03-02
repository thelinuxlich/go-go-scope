/**
 * Remix adapter for go-go-scope
 *
 * Provides structured concurrency for Remix loaders and actions
 * with automatic cleanup.
 *
 * @example
 * ```typescript
 * // app/routes/users.tsx
 * import { withScopeLoader, withScopeAction } from '@go-go-scope/adapter-remix'
 * import { json } from '@remix-run/node'
 *
 * export const loader = withScopeLoader(async ({ request, scope }) => {
 *   const [err, users] = await scope.task(() => fetchUsers())
 *   if (err) throw new Response(err.message, { status: 500 })
 *   return json({ users })
 * })
 *
 * export const action = withScopeAction(async ({ request, scope }) => {
 *   const formData = await request.formData()
 *   const [err, result] = await scope.task(() => createUser(formData))
 *   if (err) return json({ error: err.message }, { status: 400 })
 *   return json({ result })
 * })
 * ```
 */

import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
} from "@remix-run/server-runtime";
import { type Scope, scope } from "go-go-scope";

/**
 * Remix context with scope
 */
export interface RemixContext<
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
export interface RemixScopeOptions<
	T extends Record<string, unknown> = Record<string, never>,
> {
	/** Scope timeout in milliseconds */
	timeout?: number;
	/** Initial services to provide */
	services?: T;
}

/**
 * Wrap a Remix loader with scope
 *
 * @example
 * ```typescript
 * // app/routes/users.tsx
 * import { withScopeLoader } from '@go-go-scope/adapter-remix'
 * import { json } from '@remix-run/node'
 *
 * export const loader = withScopeLoader(async ({ request, scope }) => {
 *   const url = new URL(request.url)
 *   const page = url.searchParams.get('page') || '1'
 *
 *   const [err, users] = await scope.task(() => fetchUsers(page))
 *   if (err) throw new Response(err.message, { status: 500 })
 *
 *   return json({ users })
 * })
 * ```
 */
export function withScopeLoader<T extends Record<string, unknown>, R>(
	loader: (args: LoaderFunctionArgs & RemixContext<T>) => Promise<R> | R,
	options: RemixScopeOptions<T> = {},
): (args: LoaderFunctionArgs) => Promise<R> {
	return async (args: LoaderFunctionArgs): Promise<R> => {
		await using s = scope({
			timeout: options.timeout,
			signal: args.signal,
			name: `remix-loader-${args.request.method}-${new URL(args.request.url).pathname}`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		const context: RemixContext<T> = {
			scope: s as Scope<T>,
			signal: s.signal,
		};

		return await loader({ ...args, ...context });
	};
}

/**
 * Wrap a Remix action with scope
 *
 * @example
 * ```typescript
 * // app/routes/users.tsx
 * import { withScopeAction } from '@go-go-scope/adapter-remix'
 * import { json } from '@remix-run/node'
 *
 * export const action = withScopeAction(async ({ request, scope }) => {
 *   const formData = await request.formData()
 *
 *   const [err, result] = await scope.task(() => createUser(formData))
 *   if (err) return json({ error: err.message }, { status: 400 })
 *
 *   return json({ result })
 * })
 * ```
 */
export function withScopeAction<T extends Record<string, unknown>, R>(
	action: (args: ActionFunctionArgs & RemixContext<T>) => Promise<R> | R,
	options: RemixScopeOptions<T> = {},
): (args: ActionFunctionArgs) => Promise<R> {
	return async (args: ActionFunctionArgs): Promise<R> => {
		await using s = scope({
			timeout: options.timeout,
			signal: args.signal,
			name: `remix-action-${args.request.method}-${new URL(args.request.url).pathname}`,
		});

		// Provide initial services
		if (options.services) {
			for (const [key, value] of Object.entries(options.services)) {
				s.provide(key, value);
			}
		}

		const context: RemixContext<T> = {
			scope: s as Scope<T>,
			signal: s.signal,
		};

		return await action({ ...args, ...context });
	};
}

/**
 * Create reusable scope configuration for loaders/actions
 *
 * @example
 * ```typescript
 * // app/lib/scope.ts
 * import { createRemixScope } from '@go-go-scope/adapter-remix'
 * import { db } from './db'
 *
 * export const remixScope = createRemixScope({
 *   timeout: 10000,
 *   services: { db }
 * })
 *
 * // app/routes/users.tsx
 * import { remixScope } from '~/lib/scope'
 *
 * export const loader = remixScope.loader(async ({ request, scope }) => {
 *   const db = scope.use('db')
 *   // ...
 * })
 * ```
 */
export function createRemixScope<T extends Record<string, unknown>>(
	config: RemixScopeOptions<T>,
) {
	return {
		loader: <R>(
			loader: (args: LoaderFunctionArgs & RemixContext<T>) => Promise<R> | R,
		) => withScopeLoader(loader, config),
		action: <R>(
			action: (args: ActionFunctionArgs & RemixContext<T>) => Promise<R> | R,
		) => withScopeAction(action, config),
	};
}
