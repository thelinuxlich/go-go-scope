/**
 * Example: Using Test Utilities
 *
 * This example demonstrates how to use go-go-scope's testing utilities.
 *
 * Run:
 *   npm run build && node --experimental-strip-types examples/testing-utilities.ts
 */

import {
	assertScopeDisposed,
	createControlledTimer,
	createMockScope,
	createSpy,
	flushPromises,
} from "../dist/testing/index.mjs";

async function testMockScope() {
	console.log("🧪 Testing createMockScope\n");

	const s = createMockScope({
		autoAdvanceTimers: true,
		deterministic: true,
	});

	// Track task calls
	await s.task(() => Promise.resolve("task-1"));
	await s.task(() => Promise.resolve("task-2"));
	await s.task(() => Promise.reject(new Error("failed")));

	console.log(`✅ Tasks executed: ${s.getTaskCalls().length}`);
	console.log(`   Task 1: ${s.getTaskCalls()?.[0]?.fn}`);

	// Clear calls
	s.clearTaskCalls();
	console.log(`✅ Calls cleared: ${s.getTaskCalls().length} remaining`);
}

async function testControlledTimer() {
	console.log("\n⏱️ Testing createControlledTimer\n");

	const timer = createControlledTimer();
	const events: string[] = [];

	// Schedule some timeouts
	timer.setTimeout(() => events.push("after 100ms"), 100);
	timer.setTimeout(() => events.push("after 200ms"), 200);
	timer.setTimeout(() => events.push("after 50ms"), 50);

	console.log(`   Initial time: ${timer.currentTime}ms`);
	console.log(`   Scheduled 3 timeouts`);

	// Advance time
	timer.advance(100);
	console.log(`   After 100ms: [${events.join(", ")}]`);

	timer.advance(100);
	console.log(`   After 200ms: [${events.join(", ")}]`);

	timer.reset();
	console.log(`✅ Timer reset: ${timer.currentTime}ms`);
}

async function testSpy() {
	console.log("\n👁️ Testing createSpy\n");

	// Create a spy function
	const spy = createSpy<[number, number], number>();
	spy.mockImplementation((a, b) => a + b);

	// Call it
	const result1 = spy(2, 3);
	const result2 = spy(5, 7);

	console.log(`   spy(2, 3) = ${result1}`);
	console.log(`   spy(5, 7) = ${result2}`);
	console.log(`✅ Called ${spy.getCalls().length} times`);
	console.log(`   Was called with (2, 3): ${spy.wasCalledWith(2, 3)}`);
	console.log(`   Was called with (1, 1): ${spy.wasCalledWith(1, 1)}`);

	// Reset
	spy.mockReset();
	console.log(`✅ After reset: ${spy.getCalls().length} calls`);
}

async function testFlushPromises() {
	console.log("\n🌊 Testing flushPromises\n");

	let resolved = false;
	Promise.resolve().then(() => {
		resolved = true;
	});

	console.log(`   Before flush: resolved = ${resolved}`);
	await flushPromises();
	console.log(`✅ After flush: resolved = ${resolved}`);
}

async function testAssertScopeDisposed() {
	console.log("\n🗑️ Testing assertScopeDisposed\n");

	const s = createMockScope();
	await s.task(() => Promise.resolve("data"));

	await assertScopeDisposed(s);
	console.log(`✅ Scope disposed: ${s.isDisposed}`);
	console.log(`✅ Signal aborted: ${s.signal.aborted}`);
}

async function testMockServices() {
	console.log("\n🎭 Testing Mock Services\n");

	// Example 1: Using overrides option
	const mockDb = {
		query: (sql: string) => Promise.resolve([{ id: 1, name: "Mock User" }]),
	};

	const s1 = createMockScope({
		services: {
			db: { query: () => Promise.reject(new Error("Real DB")) },
		},
		overrides: {
			db: mockDb,
		},
	});

	// Access the mock service
	const db1 = (s1 as unknown as { db: typeof mockDb }).db;
	const result1 = await db1.query("SELECT * FROM users");
	console.log(`✅ Override works: ${JSON.stringify(result1)}`);

	// Example 2: Using mockService method
	const s2 = createMockScope({
		services: {
			api: { baseUrl: "https://api.example.com" },
		},
	});

	// Replace the API service
	s2.mockService("api", {
		baseUrl: "https://mock-api.example.com",
		fetch: (path: string) => Promise.resolve({ data: "mocked" }),
	});

	const api2 = (s2 as unknown as { api: { baseUrl: string } }).api;
	console.log(`✅ mockService works: baseUrl = ${api2.baseUrl}`);

	// Example 3: Chaining mocks
	const s3 = createMockScope({
		services: {
			db: { name: "real-db" },
			cache: { name: "real-cache" },
		},
	});

	s3.mockService("db", { name: "mock-db" }).mockService("cache", {
		name: "mock-cache",
	});

	const db3 = (s3 as unknown as { db: { name: string } }).db;
	const cache3 = (s3 as unknown as { cache: { name: string } }).cache;
	console.log(`✅ Chained mocks: db=${db3.name}, cache=${cache3.name}`);
}

async function main() {
	console.log("=".repeat(60));
	console.log("go-go-scope Test Utilities Example");
	console.log("=".repeat(60));

	await testMockScope();
	await testControlledTimer();
	await testSpy();
	await testFlushPromises();
	await testAssertScopeDisposed();
	await testMockServices();

	console.log("\n" + "=".repeat(60));
	console.log("✅ All testing utilities demonstrated!");
	console.log("=".repeat(60));
	console.log("\nUse these utilities in your tests:");
	console.log("  import { createMockScope } from 'go-go-scope/testing'");
}

main().catch(console.error);
