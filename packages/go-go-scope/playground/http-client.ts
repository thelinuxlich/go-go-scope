/**
 * HTTP Client Playground Example
 *
 * Run with: npm run playground:http-client
 */

import { scope, exponentialBackoff } from "../src/index.js";

console.log("🌐 HTTP Client Example\n");

// Mock HTTP responses for demonstration
let requestCount = 0;
const mockFetch = async (url: string): Promise<Response> => {
	requestCount++;
	console.log(`   📡 Request #${requestCount}: GET ${url}`);

	// Simulate network delay
	await new Promise((r) => setTimeout(r, 100));

	// Simulate occasional failures
	if (requestCount % 3 === 0 && requestCount < 5) {
		throw new Error("Network error: Connection reset");
	}

	return {
		ok: true,
		status: 200,
		json: async () => ({ id: 1, name: "John Doe", email: "john@example.com" }),
	} as Response;
};

// Example 1: Simple HTTP client with retry
console.log("1️⃣  Simple HTTP client with retry:");
{
	await using s = scope();

	const [err, user] = await s.task(
		async ({ signal }) => {
			const response = await mockFetch("https://api.example.com/users/1");
			return response.json();
		},
		{ retry: "exponential" },
	);

	console.log(err ? `   ❌ Error: ${err.message}` : `   ✅ User: ${JSON.stringify(user)}`);
}

// Reset counter
requestCount = 0;

// Example 2: HTTP client with circuit breaker
console.log("\n2️⃣  HTTP client with circuit breaker:");
{
	await using s = scope({
		circuitBreaker: {
			failureThreshold: 2,
			resetTimeout: 1000,
			onStateChange: (from, to, count) => {
				console.log(`   🔄 Circuit: ${from} → ${to} (failures: ${count})`);
			},
		},
	});

	// First few requests
	for (let i = 0; i < 3; i++) {
		const [err, user] = await s.task(async () => {
			const response = await mockFetch(`https://api.example.com/users/${i}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json();
		});

		if (err) {
			console.log(`   ❌ Request ${i + 1} failed: ${err.message}`);
		}
	}
}

// Reset counter
requestCount = 0;

// Example 3: Batch requests with concurrency limit
console.log("\n3️⃣  Batch requests with concurrency limit:");
{
	await using s = scope({ concurrency: 2 });

	const userIds = [1, 2, 3, 4, 5];
	const startTime = Date.now();

	const results = await s.parallel(
		userIds.map((id) => async () => {
			const response = await mockFetch(`https://api.example.com/users/${id}`);
			return response.json();
		}),
	);

	const duration = Date.now() - startTime;

	console.log(`   ⏱️  Completed ${results.length} requests in ${duration}ms`);
	console.log(`   📝 (Limited to 2 concurrent requests)`);

	const successCount = results.filter(([err]) => !err).length;
	console.log(`   ✅ Successful: ${successCount}/${results.length}`);
}

// Reset counter
requestCount = 0;

// Example 4: Request with timeout and fallback
console.log("\n4️⃣  Request with timeout and fallback:");
{
	await using s = scope({ timeout: 150 });

	const fetchWithTimeout = async (): Promise<unknown> => {
		const [err, user] = await s.task(async ({ signal }) => {
			// Simulate slow API
			await new Promise((r) => setTimeout(r, 300));
			return { id: 1, name: "John" };
		});

		if (err) {
			console.log(`   ⏱️  Primary request timed out`);
			return null;
		}
		return user;
	};

	const user = await fetchWithTimeout();

	if (!user) {
		console.log(`   🔄 Falling back to cached data`);
		console.log(`   ✅ Fallback: { id: 1, name: "Cached User" }`);
	} else {
		console.log(`   ✅ Result: ${JSON.stringify(user)}`);
	}
}

// Example 5: Metrics tracking
console.log("\n5️⃣  HTTP client with metrics:");
{
	await using s = scope({ metrics: true });

	// Make some requests
	for (let i = 0; i < 5; i++) {
		await s.task(async () => {
			const response = await mockFetch(`https://api.example.com/data/${i}`);
			return response.json();
		});
	}

	const metrics = s.metrics();
	if (metrics) {
		console.log(`   📊 Tasks spawned: ${metrics.tasksSpawned}`);
		console.log(`   📊 Tasks completed: ${metrics.tasksCompleted}`);
		console.log(`   📊 Tasks failed: ${metrics.tasksFailed}`);
		console.log(`   📊 Avg duration: ${metrics.avgTaskDuration.toFixed(2)}ms`);
	}
}

console.log("\n✨ HTTP Client examples completed!");
