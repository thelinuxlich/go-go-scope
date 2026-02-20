/**
 * Express adapter for go-go-scope
 * Provides request-scoped structured concurrency for Express applications
 */

import type {
	Application,
	NextFunction,
	Request,
	RequestHandler,
	Response,
} from "express";
import { type Scope, scope } from "../index.js";

// Augment Express types
declare global {
	namespace Express {
		interface Request {
			scope: Scope;
		}
		interface Application {
			scope: Scope;
		}
	}
}

export interface ExpressGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Express middleware for go-go-scope integration
 *
 * @example
 * ```typescript
 * import express from 'express'
 * import { goGoScope } from 'go-go-scope/adapters/express'
 *
 * const app = express()
 * app.use(goGoScope(app, { metrics: true }))
 *
 * app.get('/users/:id', async (req, res) => {
 *   const [err, user] = await req.scope.task(
 *     () => fetchUser(req.params.id),
 *     { retry: 'exponential' }
 *   )
 *
 *   if (err) {
 *     return res.status(500).json({ error: err.message })
 *   }
 *   res.json(user)
 * })
 * ```
 */
export function goGoScope(
	app: Application,
	options: ExpressGoGoScopeOptions = {},
): RequestHandler {
	const { name = "express-app", metrics = false, timeout } = options;

	// Create root application scope
	const rootScope = scope({ name, metrics });
	app.scope = rootScope as Scope;

	// Return middleware that creates request-scoped children
	return (req: Request, res: Response, next: NextFunction) => {
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		req.scope = scope(scopeOptions);

		// Cleanup on response finish
		res.on("finish", () => {
			req.scope[Symbol.asyncDispose]().catch(() => {});
		});

		// Also cleanup on close (for streaming responses)
		res.on("close", () => {
			req.scope[Symbol.asyncDispose]().catch(() => {});
		});

		next();
	};
}

/**
 * Graceful shutdown helper for Express applications
 * Disposes the root scope when the server is closing
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await closeScope(app)
 *   server.close()
 * })
 * ```
 */
export async function closeScope(app: Application): Promise<void> {
	if (app.scope) {
		await app.scope[Symbol.asyncDispose]().catch(() => {});
	}
}
