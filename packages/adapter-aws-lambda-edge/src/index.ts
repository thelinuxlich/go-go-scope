/**
 * AWS Lambda@Edge adapter for go-go-scope
 * Provides request-scoped structured concurrency for Lambda@Edge functions
 */

import type {
	CloudFrontRequestEvent,
	CloudFrontRequestResult,
	CloudFrontResponseEvent,
	CloudFrontResponseResult,
	Context,
} from "aws-lambda";
import { type Scope, scope } from "go-go-scope";

export interface LambdaEdgeGoGoScopeOptions {
	/** Root scope name */
	name?: string;
	/** Default timeout for all requests in ms (Lambda@Edge has 5-30s limit) */
	timeout?: number;
	/** Enable debug logging */
	debug?: boolean;
}

// Lambda@Edge specific types
export interface LambdaEdgeRequest {
	readonly Records: Array<{
		readonly cf: {
			readonly config: {
				readonly distributionDomainName: string;
				readonly distributionId: string;
				readonly eventType: string;
				readonly requestId: string;
			};
			readonly request: {
				readonly uri: string;
				readonly method: string;
				readonly clientIp: string;
				readonly headers: Record<string, Array<{ key?: string; value: string }>>;
				readonly querystring: string;
			};
		};
	}>;
}

/**
 * Lambda@Edge handler wrapper for go-go-scope integration
 *
 * @example
 * ```typescript
 * // src/viewer-request.ts
 * import { lambdaEdgeGoGoScope } from '@go-go-scope/adapter-aws-lambda-edge'
 *
 * export const handler = lambdaEdgeGoGoScope({
 *   name: 'my-lambda-edge',
 *   timeout: 5000
 * }, async (event, scope) => {
 *   const [err, data] = await scope.task(() => validateRequest(event))
 *   if (err) {
 *     return {
 *       status: '403',
 *       statusDescription: 'Forbidden',
 *       body: 'Invalid request'
 *     }
 *   }
 *   return event.Records[0].cf.request
 * })
 * ```
 */
export function lambdaEdgeGoGoScope<T extends CloudFrontRequestResult | CloudFrontResponseResult>(
	options: LambdaEdgeGoGoScopeOptions,
	handler: (
		event: CloudFrontRequestEvent | CloudFrontResponseEvent,
		scope: Scope,
		context: Context,
	) => Promise<T>,
): (event: CloudFrontRequestEvent | CloudFrontResponseEvent, context: Context) => Promise<T> {
	const { name = "lambda-edge", timeout, debug = false } = options;

	// Create root application scope (singleton per Lambda instance)
	const rootScope = scope({ name });

	if (debug) {
		console.log(`[go-go-scope] Root scope created: ${name}`);
	}

	return async (event, context) => {
		const requestId = event.Records[0]?.cf?.config?.requestId || `req-${Date.now()}`;

		// Create request-scoped child
		const scopeOptions: { parent: Scope; name: string; timeout?: number } = {
			parent: rootScope as Scope,
			name: `request-${requestId}`,
		};
		if (timeout) scopeOptions.timeout = timeout;

		const requestScope = scope(scopeOptions);

		if (debug) {
			console.log(`[go-go-scope] Request scope created: ${requestId}`);
		}

		try {
			return await handler(event, requestScope, context);
		} finally {
			// Cleanup request scope
			await requestScope[Symbol.asyncDispose]().catch(() => {});

			if (debug) {
				console.log(`[go-go-scope] Request scope disposed: ${requestId}`);
			}
		}
	};
}

/**
 * Helper for viewer request handlers (incoming request)
 *
 * @example
 * ```typescript
 * // src/viewer-request.ts
 * import { viewerRequestHandler } from '@go-go-scope/adapter-aws-lambda-edge'
 *
 * export const handler = viewerRequestHandler({
 *   name: 'viewer-request-handler'
 * }, async (request, scope) => {
 *   const [err, user] = await scope.task(() => authenticate(request))
 *   if (err || !user) {
 *     return {
 *       status: '302',
 *       statusDescription: 'Found',
 *       headers: {
 *         location: [{ key: 'Location', value: '/login' }]
 *       }
 *     }
 *   }
 *   return request
 * })
 * ```
 */
export function viewerRequestHandler(
	options: LambdaEdgeGoGoScopeOptions,
	handler: (request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>,
) {
	return lambdaEdgeGoGoScope<CloudFrontRequestResult>(options, async (event, scope) => {
		const request = (event as CloudFrontRequestEvent).Records[0]?.cf?.request;
		if (!request) throw new Error("No request found in event");
		return handler(request, scope);
	});
}

/**
 * Helper for origin request handlers (before sending to origin)
 *
 * @example
 * ```typescript
 * // src/origin-request.ts
 * import { originRequestHandler } from '@go-go-scope/adapter-aws-lambda-edge'
 *
 * export const handler = originRequestHandler({
 *   name: 'origin-request-handler'
 * }, async (request, scope) => {
 *   const [err, modified] = await scope.task(() => modifyRequest(request))
 *   if (err) return request
 *   return modified
 * })
 * ```
 */
export function originRequestHandler(
	options: LambdaEdgeGoGoScopeOptions,
	handler: (request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>,
) {
	return lambdaEdgeGoGoScope<CloudFrontRequestResult>(options, async (event, scope) => {
		const request = (event as CloudFrontRequestEvent).Records[0]?.cf?.request;
		if (!request) throw new Error("No request found in event");
		return handler(request, scope);
	});
}

/**
 * Helper for origin response handlers (after receiving from origin)
 *
 * @example
 * ```typescript
 * // src/origin-response.ts
 * import { originResponseHandler } from '@go-go-scope/adapter-aws-lambda-edge'
 *
 * export const handler = originResponseHandler({
 *   name: 'origin-response-handler'
 * }, async (response, scope) => {
 *   const [err, processed] = await scope.task(() => processResponse(response))
 *   if (err) return response
 *   return processed
 * })
 * ```
 */
export function originResponseHandler(
	options: LambdaEdgeGoGoScopeOptions,
	handler: (
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>,
) {
	return lambdaEdgeGoGoScope<CloudFrontResponseResult>(options, async (event, scope) => {
		const response = (event as CloudFrontResponseEvent).Records[0]?.cf?.response;
		if (!response) throw new Error("No response found in event");
		return handler(response, scope);
	});
}

/**
 * Helper for viewer response handlers (before sending to viewer)
 *
 * @example
 * ```typescript
 * // src/viewer-response.ts
 * import { viewerResponseHandler } from '@go-go-scope/adapter-aws-lambda-edge'
 *
 * export const handler = viewerResponseHandler({
 *   name: 'viewer-response-handler'
 * }, async (response, scope) => {
 *   // Add security headers
 *   response.headers['strict-transport-security'] = [{
 *     key: 'Strict-Transport-Security',
 *     value: 'max-age=63072000'
 *   }]
 *   return response
 * })
 * ```
 */
export function viewerResponseHandler(
	options: LambdaEdgeGoGoScopeOptions,
	handler: (
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>,
) {
	return lambdaEdgeGoGoScope<CloudFrontResponseResult>(options, async (event, scope) => {
		const response = (event as CloudFrontResponseEvent).Records[0]?.cf?.response;
		if (!response) throw new Error("No response found in event");
		return handler(response, scope);
	});
}

/**
 * Get client IP from Lambda@Edge event
 */
export function getClientIp(event: LambdaEdgeRequest): string {
	return event.Records[0]?.cf?.request?.clientIp || "unknown";
}

/**
 * Get request URI from Lambda@Edge event
 */
export function getRequestUri(event: LambdaEdgeRequest): string {
	return event.Records[0]?.cf?.request?.uri || "/";
}

/**
 * Helper to add headers to response
 */
export function addHeader(
	response: CloudFrontResponseResult,
	name: string,
	value: string,
): void {
	if (!response) return;
	if (!response.headers) {
		response.headers = {};
	}
	response.headers[name.toLowerCase()] = [{ key: name, value }];
}

/**
 * Helper to get header from request
 */
export function getHeader(
	request: LambdaEdgeRequest["Records"][0]["cf"]["request"],
	name: string,
): string | undefined {
	const headers = request.headers[name.toLowerCase()];
	return headers?.[0]?.value;
}
