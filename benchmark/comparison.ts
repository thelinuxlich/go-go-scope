/**
 * Benchmark: Structured Concurrency Comparison
 *
 * Side-by-side examples comparing:
 * - Vanilla JS (AbortController + Promise)
 * - Effect (effect-ts)
 * - go-go-scope (this library)
 */

import { Effect, Schedule, Layer, Context } from "effect";
import { scope } from "../src/index.js";

// =============================================================================
// SETUP: Mock utilities
// =============================================================================

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fetchUser = async (id: number) => {
	await delay(5);
	return { id, name: `User ${id}` };
};
const fetchPosts = async (userId: number) => {
	await delay(5);
	return [{ id: 1, title: "Post 1" }];
};
const fetchWithRetry = async (url: string) => {
	await delay(5);
	return { data: "result" };
};

// =============================================================================
// EXAMPLE 1: Basic Scoped Operations with Timeout
// =============================================================================

console.log("=".repeat(60));
console.log("EXAMPLE 1: Basic Scoped Operations with Timeout");
console.log("=".repeat(60));

// --- Vanilla JS ---
console.log("\n🟨 Vanilla JS:");
{
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(new Error("timeout")),
		100,
	);

	try {
		const user = await fetchUser(1);
		clearTimeout(timeoutId);
		console.log("  User:", user);
	} catch (err) {
		clearTimeout(timeoutId);
		console.log("  Error:", err);
	}
}

// --- Effect ---
console.log("\n🟦 Effect:");
{
	const program = Effect.gen(function* () {
		const user = yield* Effect.tryPromise({
			try: () => fetchUser(1),
			catch: (e) => new Error(String(e)),
		});
		return user;
	});

	const withTimeout = Effect.timeout(program, "100 millis");
	const result = await Effect.runPromise(Effect.either(withTimeout));
	console.log("  Result:", result);
}

// --- go-go-scope ---
console.log("\n🟩 go-go-scope:");
{
	await using s = scope({ timeout: 100 });
	const [err, user] = await s.task(() => fetchUser(1));
	console.log("  User:", user, "Error:", err);
}

// =============================================================================
// EXAMPLE 2: Parallel Execution with Error Handling
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("EXAMPLE 2: Parallel Execution with Error Handling");
console.log("=".repeat(60));

// --- Vanilla JS ---
console.log("\n🟨 Vanilla JS:");
{
	const controller = new AbortController();

	try {
		const [user, posts] = await Promise.all([
			fetchUser(1),
			fetchPosts(1),
		]);
		console.log("  User:", user);
		console.log("  Posts:", posts);
	} catch (err) {
		controller.abort();
		console.log("  Error:", err);
	}
}

// --- Effect ---
console.log("\n🟦 Effect:");
{
	const fetchUserEffect = Effect.tryPromise({
		try: () => fetchUser(1),
		catch: (e) => e,
	});
	const fetchPostsEffect = Effect.tryPromise({
		try: () => fetchPosts(1),
		catch: (e) => e,
	});

	const parallel = Effect.all([fetchUserEffect, fetchPostsEffect], {
		concurrency: 2,
	});
	const result = await Effect.runPromise(parallel);
	console.log("  Results:", result);
}

// --- go-go-scope ---
console.log("\n🟩 go-go-scope:");
{
	await using s = scope();

	const userTask = s.task(() => fetchUser(1));
	const postsTask = s.task(() => fetchPosts(1));

	const [[userErr, user], [postsErr, posts]] = await Promise.all([
		userTask,
		postsTask,
	]);

	if (!userErr) console.log("  User:", user);
	if (!postsErr) console.log("  Posts:", posts);
}

// =============================================================================
// EXAMPLE 3: Race Operations
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("EXAMPLE 3: Race Operations (First Wins)");
console.log("=".repeat(60));

// --- Vanilla JS ---
console.log("\n🟨 Vanilla JS:");
{
	const controller = new AbortController();
	const signals: AbortController[] = [];

	const createRacer = (name: string, delayMs: number) => {
		const ac = new AbortController();
		signals.push(ac);
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => resolve({ name }), delayMs);
			ac.signal.addEventListener("abort", () => {
				clearTimeout(timeout);
				reject(new Error("cancelled"));
			});
		});
	};

	try {
		const winner = await Promise.race([
			createRacer("fast", 10),
			createRacer("slow", 100),
		]);
		signals.forEach((s) => s.abort()); // Cancel losers
		console.log("  Winner:", winner);
	} catch (err) {
		console.log("  Error:", err);
	}
}

// --- Effect ---
console.log("\n🟦 Effect:");
{
	const racers = [
		Effect.tryPromise({
			try: () => delay(10).then(() => "fast"),
			catch: (e) => e,
		}),
		Effect.tryPromise({
			try: () => delay(100).then(() => "slow"),
			catch: (e) => e,
		}),
	];

	const race = Effect.raceAll(racers);
	const winner = await Effect.runPromise(race);
	console.log("  Winner:", winner);
}

// --- go-go-scope ---
console.log("\n🟩 go-go-scope:");
{
	await using s = scope();

	const [err, winner] = await s.race([
		() => delay(10).then(() => "fast"),
		() => delay(100).then(() => "slow"),
	]);

	console.log("  Winner:", winner, "Error:", err);
}

// =============================================================================
// EXAMPLE 4: Retry Logic
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("EXAMPLE 4: Retry Logic");
console.log("=".repeat(60));

// --- Vanilla JS ---
console.log("\n🟨 Vanilla JS:");
{
	async function withRetry<T>(
		fn: () => Promise<T>,
		maxRetries: number,
		delayMs: number,
	): Promise<T> {
		let lastError: unknown;
		for (let i = 0; i <= maxRetries; i++) {
			try {
				return await fn();
			} catch (e) {
				lastError = e;
				if (i < maxRetries)
					await new Promise((r) => setTimeout(r, delayMs));
			}
		}
		throw lastError;
	}

	try {
		const result = await withRetry(() => fetchWithRetry("api/data"), 3, 10);
		console.log("  Result:", result);
	} catch (e) {
		console.log("  Failed after retries:", e);
	}
}

// --- Effect ---
console.log("\n🟦 Effect:");
{
	const fetchEffect = Effect.tryPromise({
		try: () => fetchWithRetry("api/data"),
		catch: (e) => e,
	});

	const withRetry = Effect.retry(
		fetchEffect,
		Schedule.recurs(3).pipe(Schedule.addDelay(() => "10 millis")),
	);

	const result = await Effect.runPromise(withRetry);
	console.log("  Result:", result);
}

// --- go-go-scope ---
console.log("\n🟩 go-go-scope:");
{
	await using s = scope();

	const [err, result] = await s.task(() => fetchWithRetry("api/data"), {
		retry: {
			maxRetries: 3,
			delay: 10,
		},
	});

	console.log("  Result:", result, "Error:", err);
}

// =============================================================================
// EXAMPLE 5: Resource Management (Dependency Injection)
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("EXAMPLE 5: Resource Management");
console.log("=".repeat(60));

class Database {
	async query(sql: string) {
		return [{ id: 1 }];
	}
	close() {
		console.log("  Database closed");
	}
}

class Cache {
	async get(key: string) {
		return "cached-value";
	}
	close() {
		console.log("  Cache closed");
	}
}

// --- Vanilla JS ---
console.log("\n🟨 Vanilla JS:");
{
	const db = new Database();
	const cache = new Cache();

	try {
		const user = await db.query("SELECT * FROM users");
		console.log("  User:", user);
	} finally {
		db.close();
		cache.close();
	}
}

// --- Effect ---
console.log("\n🟦 Effect:");
{
	class DatabaseService extends Context.Tag("Database")<
		DatabaseService,
		{ query: (sql: string) => Effect.Effect<unknown> }
	>() {}

	class CacheService extends Context.Tag("Cache")<
		CacheService,
		{ get: (key: string) => Effect.Effect<string> }
	>() {}

	const DatabaseLive = Layer.succeed(DatabaseService, {
		query: (sql) => Effect.succeed([{ id: 1 }]),
	});

	const CacheLive = Layer.succeed(CacheService, {
		get: (key) => Effect.succeed("cached-value"),
	});

	const program = Effect.gen(function* () {
		const db = yield* DatabaseService;
		const user = yield* db.query("SELECT * FROM users");
		return user;
	});

	const runnable = Effect.provide(
		program,
		Layer.merge(DatabaseLive, CacheLive),
	);
	const result = await Effect.runPromise(runnable);
	console.log("  User:", result);
}

// --- go-go-scope ---
console.log("\n🟩 go-go-scope:");
{
	await using s = scope()
		.provide("db", () => new Database(), (db) => db.close())
		.provide("cache", () => new Cache(), (cache) => cache.close());

	const [err, user] = await s.task(async ({ services }) => {
		return services.db.query("SELECT * FROM users");
	});

	console.log("  User:", user);
	// Resources auto-close in LIFO order
}

// =============================================================================
// PERFORMANCE BENCHMARK
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("PERFORMANCE BENCHMARK");
console.log("=".repeat(60));

async function benchmark(
	name: string,
	fn: () => Promise<void>,
	iterations = 1000,
) {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fn();
	}
	const duration = performance.now() - start;
	console.log(
		`${name.padEnd(35)} ${duration.toFixed(2).padStart(8)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
	return duration;
}

console.log("\nRunning 1000 iterations each...\n");

// Vanilla JS
await benchmark("Vanilla JS (simple promise)", async () => {
	await Promise.resolve(42);
});

// Effect
await benchmark("Effect (simple)", async () => {
	const program = Effect.succeed(42);
	await Effect.runPromise(program);
});

await benchmark("Effect (with retry)", async () => {
	const program = Effect.retry(
		Effect.succeed(42),
		Schedule.recurs(1).pipe(Schedule.addDelay(() => "0 millis")),
	);
	await Effect.runPromise(program);
});

// go-go-scope
await benchmark("go-go-scope (simple task)", async () => {
	await using s = scope();
	const [err, result] = await s.task(() => Promise.resolve(42));
});

await benchmark("go-go-scope (with timeout)", async () => {
	await using s = scope({ timeout: 5000 });
	const [err, result] = await s.task(() => Promise.resolve(42));
});

await benchmark("go-go-scope (with retry)", async () => {
	await using s = scope();
	const [err, result] = await s.task(() => Promise.resolve(42), {
		retry: { maxRetries: 1, delay: 0 },
	});
});

await benchmark("go-go-scope (2 parallel tasks)", async () => {
	await using s = scope();
	await Promise.all([
		s.task(() => Promise.resolve(1)),
		s.task(() => Promise.resolve(2)),
	]);
});

console.log("\n" + "=".repeat(60));
console.log("Summary:");
console.log("=".repeat(60));
console.log(`
┌─────────────────┬────────────────────────────────────────────────┐
│ Approach        │ Characteristics                                │
├─────────────────┼────────────────────────────────────────────────┤
│ Vanilla JS      │ Verbose, manual cleanup, error-prone          │
│                 │ No built-in structured concurrency            │
├─────────────────┼────────────────────────────────────────────────┤
│ Effect          │ Powerful but steep learning curve             │
│                 │ Heavy abstraction, complex types              │
│                 │ Requires understanding of functional concepts │
├─────────────────┼────────────────────────────────────────────────┤
│ go-go-scope     │ Minimal API surface                           │
│                 │ Native 'using'/'await using' syntax           │
│                 │ Lazy execution, Result tuples                 │
│                 │ Familiar async/await patterns                 │
└─────────────────┴────────────────────────────────────────────────┘
`);
