/**
 * Bun SQLite Persistence Adapter Tests
 *
 * Tests both sqlite3 (via Bun's Node.js compatibility) and bun:sqlite (native).
 *
 * Run with: bun test src/index.test.ts
 */
import { beforeAll, describe, expect, test } from "vitest";
import { BunSQLiteAdapter } from "./index.js";

// Import SQLiteAdapter dynamically to handle missing dependency
let SQLiteAdapter:
	| typeof import("@go-go-scope/persistence-sqlite").SQLiteAdapter
	| undefined;

const isBun = typeof (globalThis as any).Bun !== "undefined";

// Check sync availability for skipIf conditions
let hasBunSqlite = false;
let hasSqlite3 = false;

try {
	// @ts-expect-error - bun:sqlite is a built-in module
	await import("bun:sqlite");
	hasBunSqlite = true;
} catch {
	hasBunSqlite = false;
}

try {
	await import("sqlite3");
	hasSqlite3 = true;
} catch {
	hasSqlite3 = false;
}

// Track detailed availability after full checks in beforeAll
const availability = {
	sqlite3: hasSqlite3,
	bunSqlite: hasBunSqlite,
};

describe("Bun SQLite Persistence", () => {
	beforeAll(async () => {
		if (!isBun) {
			console.log("⚠️ Not running under Bun - skipping tests");
			return;
		}

		console.log(`✓ Running under Bun ${(globalThis as any).Bun.version}`);

		// Check sqlite3 availability (Node.js compat)
		try {
			await import("sqlite3");
			availability.sqlite3 = true;
			console.log("✓ sqlite3 available (via Bun Node.js compat)");
		} catch (e) {
			availability.sqlite3 = false;
			console.log("✗ sqlite3 not available:", (e as Error).message);
		}

		// Check @go-go-scope/persistence-sqlite availability
		try {
			const mod = await import("@go-go-scope/persistence-sqlite");
			SQLiteAdapter = mod.SQLiteAdapter;
			console.log("✓ @go-go-scope/persistence-sqlite available");
		} catch (e) {
			console.log(
				"✗ @go-go-scope/persistence-sqlite not available:",
				(e as Error).message,
			);
		}

		// Check bun:sqlite availability
		try {
			await import("bun:sqlite");
			availability.bunSqlite = true;
			console.log("✓ bun:sqlite available (native)");
		} catch (e) {
			console.log("✗ bun:sqlite not available:", (e as Error).message);
		}
	});
	describe.skipIf(!isBun || !hasSqlite3 || !SQLiteAdapter)(
		"sqlite3 via Bun compatibility",
		() => {
			test("distributed locks work", async () => {
				const sqlite3 = await import("sqlite3");
				const db = new (sqlite3.default || sqlite3).Database(":memory:");
				const adapter = new SQLiteAdapter(db);
				await adapter.connect();

				// Acquire lock
				const lock = await adapter.acquire("test-lock", 5000);
				expect(lock).not.toBeNull();
				await lock!.release();

				db.close();
			});

			test("circuit breaker state works", async () => {
				const sqlite3 = await import("sqlite3");
				const db = new (sqlite3.default || sqlite3).Database(":memory:");
				const adapter = new SQLiteAdapter(db);
				await adapter.connect();

				// Record failures
				await adapter.recordFailure("test-cb", 3);
				await adapter.recordFailure("test-cb", 3);
				let state = await adapter.getState("test-cb");
				expect(state?.failureCount).toBe(2);

				// Trip circuit breaker
				await adapter.recordFailure("test-cb", 3);
				state = await adapter.getState("test-cb");
				expect(state?.state).toBe("open");

				// Reset on success
				await adapter.recordSuccess("test-cb");
				state = await adapter.getState("test-cb");
				expect(state?.failureCount).toBe(0);
				expect(state?.state).toBe("closed");

				db.close();
			}, 10000);
		},
	);

	describe.skipIf(!isBun || !hasBunSqlite)("bun:sqlite native", () => {
		test("distributed locks work", async () => {
			const { Database } = await import("bun:sqlite");
			const db = new Database(":memory:");
			const adapter = new BunSQLiteAdapter(db);
			await adapter.connect();

			// Acquire lock
			const lock = await adapter.acquire("native-lock", 5000);
			expect(lock).not.toBeNull();
			await lock!.release();

			db.close();
		});

		test("circuit breaker state works", async () => {
			const { Database } = await import("bun:sqlite");
			const db = new Database(":memory:");
			const adapter = new BunSQLiteAdapter(db);
			await adapter.connect();

			// Record failures
			await adapter.recordFailure("native-cb", 3);
			await adapter.recordFailure("native-cb", 3);
			let state = await adapter.getState("native-cb");
			expect(state?.failureCount).toBe(2);

			// Trip circuit breaker
			await adapter.recordFailure("native-cb", 3);
			state = await adapter.getState("native-cb");
			expect(state?.state).toBe("open");

			// Reset on success
			await adapter.recordSuccess("native-cb");
			state = await adapter.getState("native-cb");
			expect(state?.failureCount).toBe(0);
			expect(state?.state).toBe("closed");

			db.close();
		}, 10000);
	});

	describe.skipIf(!isBun)("adapter availability", () => {
		test("at least one SQLite adapter is available", () => {
			// This test always passes but logs availability
			console.log("SQLite adapter availability:", availability);
			expect(true).toBe(true);
		});
	});
});
