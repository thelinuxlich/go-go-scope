/**
 * Fastify adapter for go-go-scope
 * Provides request-scoped structured concurrency for Fastify applications
 */

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { type Scope, scope } from "../index.js";

// Augment Fastify types
declare module "fastify" {
	interface FastifyInstance {
		scope: Scope;
	}
	interface FastifyRequest {
		scope: Scope;
	}
}

export interface FastifyGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Fastify plugin for go-go-scope integration
 *
 * @example
 * ```typescript
 * import fastify from 'fastify'
 * import { fastifyGoGoScope } from 'go-go-scope/adapters/fastify'
 *
 * const app = fastify()
 * await app.register(fastifyGoGoScope, { metrics: true })
 *
 * app.get('/users/:id', async (request, reply) => {
 *   const [err, user] = await request.scope.task(
 *     () => fetchUser(request.params.id),
 *     { retry: 'exponential', timeout: 5000 }
 *   )
 *
 *   if (err) {
 *     return reply.code(500).send({ error: err.message })
 *   }
 *   return user
 * })
 * ```
 */
export const fastifyGoGoScope: FastifyPluginAsync<FastifyGoGoScopeOptions> = fp(
	async (fastify, opts = {}) => {
		const options = opts as FastifyGoGoScopeOptions;
		const { name = "fastify-app", metrics = false, timeout } = options;

		// Create root application scope
		const rootScope = scope({ name, metrics });
		fastify.decorate("scope", rootScope as Scope);

		// Create request-scoped child for each request
		fastify.addHook("onRequest", async (request) => {
			const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
				parent: rootScope as Scope,
				name: `request-${request.id}`,
			};
			if (timeout) scopeOptions.timeout = timeout;

			request.scope = scope(scopeOptions);
		});

		// Cleanup request scope after response
		fastify.addHook("onResponse", async (request) => {
			await request.scope[Symbol.asyncDispose]().catch(() => {});
		});

		// Cleanup root scope on close
		fastify.addHook("onClose", async () => {
			await rootScope[Symbol.asyncDispose]().catch(() => {});
		});
	},
);
