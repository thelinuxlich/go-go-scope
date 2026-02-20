/**
 * Basic go-go-scope Playground Example
 *
 * Run with: npm run playground:basic
 */

import { scope } from "../src/index.js";

console.log("🚀 Basic Scope Example\n");

// Example 1: Simple task
console.log("1️⃣  Simple task execution:");
{
	await using s = scope();
	const [err, result] = await s.task(async () => {
		await new Promise((r) => setTimeout(r, 100));
		return "Hello from task!";
	});
	console.log(err ? `   ❌ Error: ${err.message}` : `   ✅ Result: ${result}`);
}

// Example 2: Multiple concurrent tasks
console.log("\n2️⃣  Multiple concurrent tasks:");
{
	await using s = scope();

	const tasks = [
		s.task(async () => {
			await new Promise((r) => setTimeout(r, 50));
			return "Task 1";
		}),
		s.task(async () => {
			await new Promise((r) => setTimeout(r, 100));
			return "Task 2";
		}),
		s.task(async () => {
			await new Promise((r) => setTimeout(r, 75));
			return "Task 3";
		}),
	];

	const results = await Promise.all(tasks);
	for (const [err, result] of results) {
		console.log(err ? `   ❌ Error: ${err.message}` : `   ✅ ${result}`);
	}
}

// Example 3: Error handling
console.log("\n3️⃣  Error handling with Result tuples:");
{
	await using s = scope();

	const [err, result] = await s.task(async () => {
		throw new Error("Something went wrong!");
	});

	if (err) {
		console.log(`   ⚠️  Caught error: ${err.message}`);
		console.log(`   📝 Error type: ${err.constructor.name}`);
	} else {
		console.log(`   ✅ Result: ${result}`);
	}
}

// Example 4: Timeout (task-level)
console.log("\n4️⃣  Timeout handling:");
{
	await using s = scope();

	const [err, result] = await s.task(
		async () => {
			await new Promise((r) => setTimeout(r, 500));
			return "This won't complete";
		},
		{ timeout: 200 }
	);

	if (err) {
		console.log(`   ⏱️  Task timed out as expected`);
		console.log(`   📝 Error: ${err.message}`);
	}
}

// Example 5: Retry with exponential backoff
console.log("\n5️⃣  Retry with exponential backoff:");
{
	await using s = scope();

	let attempts = 0;
	const [err, result] = await s.task(
		async () => {
			attempts++;
			if (attempts < 3) {
				console.log(`   🔄 Attempt ${attempts} failed, retrying...`);
				throw new Error(`Attempt ${attempts} failed`);
			}
			return `Success after ${attempts} attempts!`;
		},
		{ retry: "exponential" },
	);

	console.log(err ? `   ❌ Error: ${err.message}` : `   ✅ ${result}`);
}

// Example 6: Dependency injection
console.log("\n6️⃣  Dependency injection:");
{
	interface Database {
		query(sql: string): Promise<string[]>;
	}

	const mockDb: Database = {
		query: async (sql) => [`Result for: ${sql}`],
	};

	await using s = scope().provide("db", () => mockDb);

	const [err, result] = await s.task(async ({ services }) => {
		const db = services.db as Database;
		return db.query("SELECT * FROM users");
	});

	console.log(err ? `   ❌ Error: ${err.message}` : `   ✅ ${result}`);
}

console.log("\n✨ All examples completed!");
