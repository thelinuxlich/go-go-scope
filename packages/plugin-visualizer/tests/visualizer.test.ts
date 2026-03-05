/**
 * Integration tests for @go-go-scope/plugin-visualizer
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { scope } from "go-go-scope";
import { visualizerPlugin, type VisualizerEvent } from "../src/index.js";
import WebSocket from "ws";

describe("visualizer plugin integration", () => {
	const TEST_PORT = 3456;
	let plugin: ReturnType<typeof visualizerPlugin>;

	beforeAll(() => {
		plugin = visualizerPlugin({ port: TEST_PORT });
	});

	afterAll(() => {
		const dashboard = plugin.getDashboard();
		if (dashboard) {
			dashboard.stop();
		}
	});

	test("dashboard server starts and serves HTML", async () => {
		// Create a scope with the plugin
		await using s = scope({
			name: "test-dashboard",
			plugins: [plugin],
		});

		// Give time for server to start
		await new Promise((r) => setTimeout(r, 100));

		// Fetch the dashboard HTML
		const response = await fetch(`http://localhost:${TEST_PORT}/`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");

		const html = await response.text();
		expect(html).toContain("go-go-scope Visualizer");
		expect(html).toContain("WebSocket");
	});

	test("WebSocket connection receives snapshot", async () => {
		await using s = scope({
			name: "test-ws",
			plugins: [plugin],
		});

		// Give time for server to start
		await new Promise((r) => setTimeout(r, 100));

		// Connect via WebSocket
		const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

		const message = await new Promise<VisualizerEvent>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("WebSocket message timeout"));
			}, 2000);

			ws.on("message", (data) => {
				clearTimeout(timeout);
				resolve(JSON.parse(data.toString()));
			});

			ws.on("error", (err) => {
				clearTimeout(timeout);
				reject(err);
			});
		});

		ws.close();

		expect(message.type).toBe("snapshot");
		if (message.type === "snapshot") {
			expect(Array.isArray(message.scopes)).toBe(true);
		}
	});

	test("tracks scope creation events", async () => {
		await using s = scope({
			name: "test-scope-tracking",
			plugins: [plugin],
		});

		// Give time for server to start
		await new Promise((r) => setTimeout(r, 100));

		// Connect via WebSocket to receive events
		const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

		const events: VisualizerEvent[] = [];

		ws.on("message", (data) => {
			events.push(JSON.parse(data.toString()));
		});

		// Wait a bit for connection
		await new Promise((r) => setTimeout(r, 100));

		// Create a child scope
		await using childScope = scope({
			name: "child-scope",
			plugins: [plugin],
		});

		// Wait for event
		await new Promise((r) => setTimeout(r, 200));

		ws.close();

		// Should have received scope-created event
		const scopeCreated = events.find((e) => e.type === "scope-created");
		expect(scopeCreated).toBeDefined();
		if (scopeCreated?.type === "scope-created") {
			expect(scopeCreated.name).toBe("child-scope");
		}
	});

	test("multiple clients receive same events", async () => {
		// Give time for server to start
		await new Promise((r) => setTimeout(r, 100));

		// Connect two clients
		const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
		const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}`);

		const events1: VisualizerEvent[] = [];
		const events2: VisualizerEvent[] = [];

		ws1.on("message", (data) => {
			events1.push(JSON.parse(data.toString()));
		});

		ws2.on("message", (data) => {
			events2.push(JSON.parse(data.toString()));
		});

		// Wait for connections
		await new Promise((r) => setTimeout(r, 150));

		// Create a scope with plugin
		await using s = scope({
			name: "test-multi-client",
			plugins: [plugin],
		});

		// Wait for events
		await new Promise((r) => setTimeout(r, 200));

		ws1.close();
		ws2.close();

		// Both clients should have received the scope-created event
		expect(events1.some((e) => e.type === "scope-created")).toBe(true);
		expect(events2.some((e) => e.type === "scope-created")).toBe(true);
	});

	test("serves events via HTTP endpoint", async () => {
		await using s = scope({
			name: "test-http-events",
			plugins: [plugin],
		});

		// Give time for server to start
		await new Promise((r) => setTimeout(r, 100));

		// Wait for events to be recorded
		await new Promise((r) => setTimeout(r, 200));

		// Fetch events via HTTP
		const response = await fetch(`http://localhost:${TEST_PORT}/events`);
		expect(response.status).toBe(200);

		const events = await response.json();
		expect(Array.isArray(events)).toBe(true);

		// Should have scope-created events
		const scopeCreated = events.find((e: VisualizerEvent) => e.type === "scope-created");
		expect(scopeCreated).toBeDefined();
	});
});
