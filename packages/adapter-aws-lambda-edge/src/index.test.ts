/**
 * Integration tests for AWS Lambda@Edge adapter
 */

import { describe, expect, test, vi } from "vitest";
import type { CloudFrontRequestEvent, CloudFrontResponseEvent, Context } from "aws-lambda";
import {
	lambdaEdgeGoGoScope,
	viewerRequestHandler,
	originRequestHandler,
	originResponseHandler,
	viewerResponseHandler,
	getClientIp,
	getRequestUri,
	addHeader,
	getHeader,
} from "./index.js";

// Mock Lambda@Edge events
function createMockRequestEvent(uri: string = "/test"): CloudFrontRequestEvent {
	return {
		Records: [
			{
				cf: {
					config: {
						distributionDomainName: "d1234.cloudfront.net",
						distributionId: "EDFDVBD6EXAMPLE",
						eventType: "viewer-request",
						requestId: "test-request-id",
					},
					request: {
						uri,
						method: "GET",
						clientIp: "192.168.1.1",
						headers: {
							host: [{ key: "Host", value: "example.com" }],
							"user-agent": [{ key: "User-Agent", value: "TestAgent" }],
						},
						querystring: "",
					},
				},
			},
		],
	};
}

function createMockResponseEvent(): CloudFrontResponseEvent {
	return {
		Records: [
			{
				cf: {
					config: {
						distributionDomainName: "d1234.cloudfront.net",
						distributionId: "EDFDVBD6EXAMPLE",
						eventType: "viewer-response",
						requestId: "test-request-id",
					},
					request: {
						uri: "/test",
						method: "GET",
						clientIp: "192.168.1.1",
						headers: {},
						querystring: "",
					},
					response: {
						status: "200",
						statusDescription: "OK",
						headers: {
							"content-type": [{ key: "Content-Type", value: "text/html" }],
						},
					},
				},
			},
		],
	};
}

function createMockContext(): Context {
	return {
		awsRequestId: "test-request-id",
		functionName: "test-function",
		memoryLimitInMB: "128",
		functionVersion: "1",
		invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789:function:test",
		done: () => {},
		fail: () => {},
		succeed: () => {},
		getRemainingTimeInMillis: () => 30000,
		callbackWaitsForEmptyEventLoop: false,
		logGroupName: "/aws/lambda/test-function",
		logStreamName: "2024/01/01/[$LATEST]test123",
	} as unknown as Context;
}

describe("AWS Lambda@Edge Adapter", () => {
	describe("lambdaEdgeGoGoScope", () => {
		test("should create handler wrapper", () => {
			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge" },
				async (_event, _scope) => {
					return { status: "200", statusDescription: "OK" };
				},
			);
			expect(handler).toBeDefined();
			expect(typeof handler).toBe("function");
		});

		test("should create request-scoped scope for each invocation", async () => {
			const event = createMockRequestEvent();
			const context = createMockContext();

			let scopeReceived: any;

			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge" },
				async (_event, scope) => {
					scopeReceived = scope;
					return { status: "200", statusDescription: "OK" };
				},
			);

			await handler(event, context);

			expect(scopeReceived).toBeDefined();
			expect(scopeReceived.scopeName).toMatch(/^request-/);
		});

		test("should execute tasks within request scope", async () => {
			const event = createMockRequestEvent();
			const context = createMockContext();

			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge" },
				async (_event, scope) => {
					const [err, result] = await scope.task(() =>
						Promise.resolve({ authenticated: true }),
					);
					if (err) {
						return { status: "500", statusDescription: "Error" };
					}
					return {
						status: "200",
						statusDescription: "OK",
						body: JSON.stringify(result),
					};
				},
			);

			const result = await handler(event, context);

			expect(result.status).toBe("200");
			expect((result as any).body).toContain("authenticated");
		});

		test("should dispose scope after handler completes", async () => {
			const event = createMockRequestEvent();
			const context = createMockContext();

			let scopeReceived: any;

			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge" },
				async (_event, scope) => {
					scopeReceived = scope;
					expect(scopeReceived.isDisposed).toBe(false);
					return { status: "200", statusDescription: "OK" };
				},
			);

			await handler(event, context);

			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should handle errors gracefully", async () => {
			const event = createMockRequestEvent();
			const context = createMockContext();

			let errorThrown = false;
			let scopeReceived: any;

			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge" },
				async (_event, scope) => {
					scopeReceived = scope;
					throw new Error("Handler error");
				},
			);

			try {
				await handler(event, context);
			} catch {
				errorThrown = true;
			}

			expect(errorThrown).toBe(true);
			expect(scopeReceived.isDisposed).toBe(true);
		});

		test("should apply timeout to request scope", async () => {
			const event = createMockRequestEvent();
			const context = createMockContext();

			const handler = lambdaEdgeGoGoScope(
				{ name: "test-lambda-edge", timeout: 5000 },
				async (_event, scope) => {
					expect(scope).toBeDefined();
					return { status: "200", statusDescription: "OK" };
				},
			);

			const result = await handler(event, context);
			expect(result.status).toBe("200");
		});
	});

	describe("viewerRequestHandler", () => {
		test("should handle viewer request events", async () => {
			const handler = viewerRequestHandler(
				{ name: "viewer-request" },
				async (request, scope) => {
					const [err, user] = await scope.task(() =>
						Promise.resolve({ id: "123" }),
					);
					if (err || !user) {
						return {
							status: "302",
							statusDescription: "Found",
							headers: {
								location: [{ key: "Location", value: "/login" }],
							},
						};
					}
					return request;
				},
			);

			const event = createMockRequestEvent();
			const context = createMockContext();
			const result = await handler(event, context);

			expect(result).toBeDefined();
		});
	});

	describe("originRequestHandler", () => {
		test("should handle origin request events", async () => {
			const handler = originRequestHandler(
				{ name: "origin-request" },
				async (request, scope) => {
					const [err, modified] = await scope.task(() =>
						Promise.resolve({ ...request, uri: "/modified" + request.uri }),
					);
					if (err) return request;
					return modified;
				},
			);

			const event = createMockRequestEvent("/test");
			const context = createMockContext();
			const result = await handler(event, context);

			expect((result as any).uri).toBe("/modified/test");
		});
	});

	describe("originResponseHandler", () => {
		test("should handle origin response events", async () => {
			const handler = originResponseHandler(
				{ name: "origin-response" },
				async (response, _scope) => {
					// Add custom header
					if (!response.headers) response.headers = {};
					response.headers["x-custom"] = [{ key: "X-Custom", value: "value" }];
					return response;
				},
			);

			const event = createMockResponseEvent();
			const context = createMockContext();
			const result = await handler(event, context);

			expect((result as any).headers["x-custom"]).toEqual([
				{ key: "X-Custom", value: "value" },
			]);
		});
	});

	describe("viewerResponseHandler", () => {
		test("should handle viewer response events", async () => {
			const handler = viewerResponseHandler(
				{ name: "viewer-response" },
				async (response, _scope) => {
					// Add security headers
					if (!response.headers) response.headers = {};
					response.headers["strict-transport-security"] = [
						{ key: "Strict-Transport-Security", value: "max-age=63072000" },
					];
					return response;
				},
			);

			const event = createMockResponseEvent();
			const context = createMockContext();
			const result = await handler(event, context);

			expect((result as any).headers["strict-transport-security"]).toEqual([
				{ key: "Strict-Transport-Security", value: "max-age=63072000" },
			]);
		});
	});

	describe("utility functions", () => {
		test("getClientIp should return client IP", () => {
			const event = createMockRequestEvent();
			const ip = getClientIp(event as any);
			expect(ip).toBe("192.168.1.1");
		});

		test("getRequestUri should return URI", () => {
			const event = createMockRequestEvent("/api/users");
			const uri = getRequestUri(event as any);
			expect(uri).toBe("/api/users");
		});

		test("addHeader should add header to response", () => {
			const response: any = { status: "200" };
			addHeader(response, "X-Custom", "value");
			expect(response.headers["x-custom"]).toEqual([{ key: "X-Custom", value: "value" }]);
		});

		test("addHeader should create headers if not exists", () => {
			const response: any = { status: "200" };
			addHeader(response, "X-Frame-Options", "DENY");
			expect(response.headers).toBeDefined();
			expect(response.headers["x-frame-options"]).toEqual([
				{ key: "X-Frame-Options", value: "DENY" },
			]);
		});

		test("getHeader should return header value", () => {
			const event = createMockRequestEvent();
			const host = getHeader(event.Records[0]!.cf.request, "Host");
			expect(host).toBe("example.com");
		});

		test("getHeader should return undefined for missing header", () => {
			const event = createMockRequestEvent();
			const value = getHeader(event.Records[0]!.cf.request, "X-Not-Exists");
			expect(value).toBeUndefined();
		});
	});

	describe("debug mode", () => {
		test("should log debug messages when enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const handler = lambdaEdgeGoGoScope(
				{ name: "debug-lambda-edge", debug: true },
				async () => ({ status: "200", statusDescription: "OK" }),
			);

			const event = createMockRequestEvent();
			const context = createMockContext();
			await handler(event, context);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[go-go-scope] Root scope created"),
			);

			consoleSpy.mockRestore();
		});
	});
});
