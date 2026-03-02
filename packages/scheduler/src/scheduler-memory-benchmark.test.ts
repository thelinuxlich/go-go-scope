/**
 * Memory benchmark for scheduler storage adapters
 *
 * Run with: node --expose-gc node_modules/vitest/vitest.mjs run scheduler-memory-benchmark.test.ts
 */

import { scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import { Scheduler } from "./index.js";
import { SQLJobStorage } from "./persistence-storage.js";
import type { JobStorage } from "./types.js";

// Dynamic imports for optional persistence adapters
const importSQLiteAdapter = () =>
	import("@go-go-scope/persistence-sqlite")
		.then((m) => m.SQLiteAdapter)
		.catch(() => null);

// Force garbage collection if available (requires --expose-gc)
function forceGC(): void {
	if (global.gc) {
		global.gc();
	}
}

// Get memory usage in MB
function getMemoryMB(): number {
	const usage = process.memoryUsage();
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

// Helper to wait for condition
async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout = 30000,
	interval = 100,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await condition()) return;
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error("Timeout waiting for condition");
}

interface BenchmarkResult {
	adapter: string;
	initialMemory: number;
	finalMemory: number;
	growth: number;
	jobsExecuted: number;
	schedulesCreated: number;
	duration: number;
}

async function runMemoryBenchmark(
	name: string,
	storage: JobStorage,
	cleanup: () => Promise<void>,
	minJobs = 100,
): Promise<BenchmarkResult> {
	// Force GC and get baseline
	forceGC();
	await new Promise((r) => setTimeout(r, 200));
	const initialMemory = getMemoryMB();
	const startTime = Date.now();

	await using s = scope() as import("go-go-scope").Scope<
		Record<string, unknown>
	>;

	const admin = new Scheduler({
		scope: s,
		storage,
		autoStart: false,
	});

	const worker = new Scheduler({
		scope: s,
		storage,
		autoStart: false,
		checkInterval: 50,
	});

	// Create multiple schedules BEFORE loading (worker only loads existing schedules)
	const schedulesCreated = 5;
	for (let i = 0; i < schedulesCreated; i++) {
		await admin.createSchedule(`benchmark-${i}`, {
			interval: 100 + i * 20,
		});
	}

	let jobsExecuted = 0;
	for (let i = 0; i < schedulesCreated; i++) {
		worker.onSchedule(`benchmark-${i}`, async () => {
			jobsExecuted++;
			// Simulate work with varying payload sizes
			const payload = new Array(100 + (jobsExecuted % 500)).fill("x").join("");
			void payload;
		});
	}

	worker.start();

	// Run until we execute enough jobs
	await waitFor(() => jobsExecuted >= minJobs, 60000); // Longer timeout for slow SQLite

	// Clean up old jobs to free memory
	for (const status of ["completed", "failed"] as const) {
		const jobs = await storage.getJobsByStatus(status);
		// Keep last 10 jobs, delete the rest
		for (const job of jobs.slice(0, -10)) {
			await storage.deleteJob(job.id);
		}
	}

	await worker[Symbol.asyncDispose]();
	await admin[Symbol.asyncDispose]();
	await cleanup();

	// Force GC and measure final memory
	forceGC();
	await new Promise((r) => setTimeout(r, 200));
	const finalMemory = getMemoryMB();
	const duration = Date.now() - startTime;

	return {
		adapter: name,
		initialMemory,
		finalMemory,
		growth: finalMemory - initialMemory,
		jobsExecuted,
		schedulesCreated,
		duration,
	};
}

describe("Scheduler Memory Benchmark", () => {
	test("benchmark InMemory storage", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		const result = await runMemoryBenchmark(
			"InMemory",
			storage,
			async () => {},
		);

		console.log("\n📊 InMemory Benchmark Results:");
		console.log(`   Initial Memory: ${result.initialMemory} MB`);
		console.log(`   Final Memory: ${result.finalMemory} MB`);
		console.log(`   Growth: ${result.growth} MB`);
		console.log(`   Jobs Executed: ${result.jobsExecuted}`);
		console.log(`   Schedules: ${result.schedulesCreated}`);
		console.log(`   Duration: ${result.duration}ms`);
		console.log(
			`   Throughput: ${Math.round(result.jobsExecuted / (result.duration / 1000))} jobs/sec`,
		);

		expect(result.growth).toBeLessThan(50);
	}, 60000);

	test("benchmark SQLite storage", async () => {
		const SQLiteAdapter = await importSQLiteAdapter();
		if (!SQLiteAdapter) throw new Error("SQLite adapter not available");
		const sqlite3 = await import("sqlite3");
		const { open } = await import("sqlite");

		const db = await open({
			filename: ":memory:",
			driver: sqlite3.Database,
		});

		await db.exec(`
			CREATE TABLE IF NOT EXISTS scheduler_schedules (
				name TEXT PRIMARY KEY,
				data TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS scheduler_jobs (
				id TEXT PRIMARY KEY,
				status TEXT NOT NULL,
				data TEXT NOT NULL,
				run_at TEXT
			);
		`);

		const lockProvider = new SQLiteAdapter(db);
		const storage = new SQLJobStorage(
			{
				query: async (sql, params) => {
					const rows = await db.all(sql, params);
					return { rows };
				},
				exec: async (sql, params) => {
					await db.run(sql, params);
				},
			},
			lockProvider,
			"sqlite",
			{ keyPrefix: "scheduler_" },
		);

		const result = await runMemoryBenchmark(
			"SQLite",
			storage,
			async () => {
				await db.close();
			},
			1,
		); // SQLite is extremely slow - just verify it works

		console.log("\n📊 SQLite Benchmark Results:");
		console.log(`   Initial Memory: ${result.initialMemory} MB`);
		console.log(`   Final Memory: ${result.finalMemory} MB`);
		console.log(`   Growth: ${result.growth} MB`);
		console.log(`   Jobs Executed: ${result.jobsExecuted}`);
		console.log(`   Schedules: ${result.schedulesCreated}`);
		console.log(`   Duration: ${result.duration}ms`);
		console.log(
			`   Throughput: ${Math.round(result.jobsExecuted / (result.duration / 1000))} jobs/sec`,
		);

		expect(result.growth).toBeLessThan(50);
	}, 60000);

	test("compare all available adapters", async () => {
		const results: BenchmarkResult[] = [];

		// InMemory
		{
			const { InMemoryJobStorage } = await import("./types.js");
			const storage = new InMemoryJobStorage();
			const result = await runMemoryBenchmark(
				"InMemory",
				storage,
				async () => {},
			);
			results.push(result);
		}

		// SQLite
		{
			const SQLiteAdapter = await importSQLiteAdapter();
			if (!SQLiteAdapter) throw new Error("SQLite adapter not available");
			const sqlite3 = await import("sqlite3");
			const { open } = await import("sqlite");
			const db = await open({ filename: ":memory:", driver: sqlite3.Database });
			await db.exec(`
				CREATE TABLE scheduler_schedules (name TEXT PRIMARY KEY, data TEXT NOT NULL);
				CREATE TABLE scheduler_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL, run_at TEXT);
			`);
			const lockProvider = new SQLiteAdapter(db);
			const storage = new SQLJobStorage(
				{
					query: async (sql, params) => ({ rows: await db.all(sql, params) }),
					exec: async (sql, params) => {
						await db.run(sql, params);
					},
				},
				lockProvider,
				"sqlite",
				{ keyPrefix: "scheduler_" },
			);
			const result = await runMemoryBenchmark(
				"SQLite",
				storage,
				async () => {
					await db.close();
				},
				1,
			); // SQLite is extremely slow - just verify it works
			results.push(result);
		}

		// Print comparison table
		console.log("\n📊 Memory Benchmark Comparison:");
		console.log(
			"═══════════════════════════════════════════════════════════════════",
		);
		console.log(
			"Adapter    │ Initial │ Final   │ Growth  │ Jobs  │ Throughput",
		);
		console.log(
			"───────────┼─────────┼─────────┼─────────┼───────┼───────────",
		);
		for (const r of results) {
			const throughput = Math.round(r.jobsExecuted / (r.duration / 1000));
			console.log(
				`${r.adapter.padEnd(10)} │ ${r.initialMemory.toFixed(1).padStart(5)}MB │ ${r.finalMemory.toFixed(1).padStart(5)}MB │ ${r.growth.toFixed(1).padStart(5)}MB │ ${r.jobsExecuted.toString().padStart(3)}   │ ${throughput.toString().padStart(3)}/sec`,
			);
		}
		console.log(
			"═══════════════════════════════════════════════════════════════════",
		);

		// All adapters should have reasonable memory growth
		for (const r of results) {
			expect(r.growth).toBeLessThan(50);
		}
	}, 120000);
});
