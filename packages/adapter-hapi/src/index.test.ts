/**
 * Tests for Hapi adapter
 */

import { type Scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import {
	closeHapiScope,
	getRootScope,
	getScope,
	hapiGoGoScope,
} from "./index.js";

// Mock Hapi server
function createMockServer(): {
	server: {
		rootScope?: Scope;
		decorations: { request: Map<string, unknown> };
		decorationsApplied: string[];
		extensions: Map<string, ((request: unknown, h: unknown) => unknown)[]>;
		decorate: (type: string, property: string, value: unknown) => void;
		ext: (
			event: string,
			method: (request: unknown, h: unknown) => unknown,
		) => void;
	};
	h: { continue: symbol };
} {
	const decorationsApplied: string[] = [];
	const extensions = new Map<
		string,
		((request: unknown, h: unknown) => unknown)[]
	>();

	return {
		server: {
			decorations: { request: new Map() },
			decorationsApplied,
			extensions,
			decorate(type: string, property: string, value: unknown) {
				decorationsApplied.push(`${type}.${property}`);
				if (type === "request") {
					this.decorations.request.set(property, value);
				} else if (type === "server" && property === "rootScope") {
					// biome-ignore lint/suspicious/noExplicitAny: Mock implementation
					(this as any).rootScope = value;
				}
			},
			ext(event: string, method: (request: unknown, h: unknown) => unknown) {
				if (!extensions.has(event)) {
					extensions.set(event, []);
				}
				extensions.get(event)!.push(method);
			},
		},
		h: { continue: Symbol("continue") },
	};
}

// Mock Hapi request
function createMockRequest(overrides: { id?: string } = {}): {
	request: { id: string; scope?: Scope; rootScope?: Scope };
} {
	return {
		request: {
			id: overrides.id || `req-${Date.now()}`,
		},
	};
}

describe("hapiGoGoScope", () => {
	test("exports plugin with correct metadata", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Plugin metadata access
		const plugin = hapiGoGoScope as any;
		expect(plugin.name).toBe("hapi-go-go-scope");
		expect(plugin.version).toBe("2.1.0");
		expect(typeof plugin.register).toBe("function");
	});

	test("registers decorations on server", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, {});

		expect(server.decorationsApplied).toContain("request.scope");
		expect(server.decorationsApplied).toContain("request.rootScope");
	});

	test("creates root scope on server", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, { name: "test-app" });

		expect(server.rootScope).toBeDefined();
	});

	test("applies metrics option", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, { metrics: true });

		const rootScope = server.rootScope!;
		expect(rootScope.metrics).toBeDefined();
	});

	test("onRequest extension creates request scope", async () => {
		const { server, h } = createMockServer();
		const { request } = createMockRequest();

		await hapiGoGoScope.register(server as any, {});

		const onRequestHandlers = server.extensions.get("onRequest") || [];
		expect(onRequestHandlers.length).toBeGreaterThan(0);

		// biome-ignore lint/suspicious/noExplicitAny: Mock request type
		await onRequestHandlers[0]!(request as any, h);

		// Request should have a scope after onRequest
		// biome-ignore lint/suspicious/noExplicitAny: Testing decorated property
		expect((request as any).scope).toBeDefined();
	});

	test("onPostResponse extension disposes request scope", async () => {
		const { server, h } = createMockServer();
		const { request } = createMockRequest();

		await hapiGoGoScope.register(server as any, {});

		// First call onRequest to create the scope
		const onRequestHandlers = server.extensions.get("onRequest") || [];
		// biome-ignore lint/suspicious/noExplicitAny: Mock request type
		await onRequestHandlers[0]!(request as any, h);

		// Then call onPostResponse to dispose it
		const onPostResponseHandlers =
			server.extensions.get("onPostResponse") || [];
		// biome-ignore lint/suspicious/noExplicitAny: Mock request type
		await onPostResponseHandlers[0]!(request as any, h);

		// Scope should be disposed
		// biome-ignore lint/suspicious/noExplicitAny: Testing decorated property
		expect((request as any).scope.isDisposed).toBe(true);
	});

	test("request scope is child of root scope", async () => {
		const { server, h } = createMockServer();
		const { request } = createMockRequest();

		await hapiGoGoScope.register(server as any, {});

		const onRequestHandlers = server.extensions.get("onRequest") || [];
		// biome-ignore lint/suspicious/noExplicitAny: Mock request type
		await onRequestHandlers[0]!(request as any, h);

		// biome-ignore lint/suspicious/noExplicitAny: Testing decorated property
		const requestScope = (request as any).scope as Scope;
		const rootScope = server.rootScope!;

		expect(requestScope).toBeDefined();
		expect(rootScope).toBeDefined();
		expect(requestScope).not.toBe(rootScope);
	});

	test("onPostStop extension disposes root scope", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, {});

		const onPostStopHandlers = server.extensions.get("onPostStop") || [];
		expect(onPostStopHandlers.length).toBe(1);

		// Should not throw
		await expect(onPostStopHandlers[0]!({}, {})).resolves.not.toThrow();
	});
});

describe("getScope", () => {
	test("returns request scope when available", async () => {
		const { server, h } = createMockServer();
		const { request } = createMockRequest();

		await hapiGoGoScope.register(server as any, {});

		const onRequestHandlers = server.extensions.get("onRequest") || [];
		// biome-ignore lint/suspicious/noExplicitAny: Mock request type
		await onRequestHandlers[0]!(request as any, h);

		// biome-ignore lint/suspicious/noExplicitAny: Testing with mock request
		const requestScope = getScope(request as any);
		// biome-ignore lint/suspicious/noExplicitAny: Testing decorated property
		expect(requestScope).toBe((request as any).scope);
	});

	test("throws when scope is not available", () => {
		const request = {};
		expect(() => getScope(request as any)).toThrow(
			"Scope not available. Ensure hapiGoGoScope plugin is registered.",
		);
	});
});

describe("getRootScope", () => {
	test("returns root scope when available", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, {});

		const rootScope = getRootScope(server as any);
		expect(rootScope).toBe(server.rootScope);
	});

	test("throws when root scope is not available", () => {
		const server = {};
		expect(() => getRootScope(server as any)).toThrow(
			"Root scope not available. Ensure hapiGoGoScope plugin is registered.",
		);
	});
});

describe("closeHapiScope", () => {
	test("closes root scope without error", async () => {
		const { server } = createMockServer();

		await hapiGoGoScope.register(server as any, {});

		// Should not throw
		await expect(closeHapiScope(server as any)).resolves.not.toThrow();
	});

	test("is safe to call when rootScope is not set", async () => {
		const server = {};
		// Should not throw
		await expect(closeHapiScope(server as any)).resolves.not.toThrow();
	});
});
