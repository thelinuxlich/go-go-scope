#!/usr/bin/env node
/**
 * Manual integration test for scheduler with different storage adapters
 *
 * Usage:
 *   npx tsx adapter-test.ts [adapter]
 *
 * Adapters: memory, redis, postgres, mysql, sqlite
 *
 * Examples:
 *   npx tsx adapter-test.ts memory
 *   npx tsx adapter-test.ts redis
 *   REDIS_URL=redis://localhost:6379 npx tsx adapter-test.ts redis
 */

import { scope } from "go-go-scope";
import { CronPresets, Scheduler, SchedulerRole } from "../src/index.js";
import { RedisJobStorage, SQLJobStorage } from "../src/persistence-storage.js";
import { InMemoryJobStorage } from "../src/types.js";

const adapter = process.argv[2] || "memory";

// Force GC if available
function forceGC() {
	if (global.gc) {
		global.gc();
	}
}

function getMemoryMB() {
	const usage = process.memoryUsage();
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

async function runTest() {
	console.log(`🧪 Testing scheduler with ${adapter} adapter\n`);

	const initialMemory = getMemoryMB();
	console.log(`Initial memory: ${initialMemory} MB`);

	await using s = scope();

	// Create storage based on adapter
	let storage:
		| InstanceType<typeof RedisJobStorage>
		| InstanceType<typeof SQLJobStorage>
		| InMemoryJobStorage;
	let cleanup = async () => {};

	switch (adapter) {
		case "memory": {
			storage = new InMemoryJobStorage();
			break;
		}

		case "sqlite": {
			const { SQLiteAdapter } = await import("go-go-scope/persistence/sqlite");
			const sqlite3 = await import("sqlite3");
			const { open } = await import("sqlite");

			const db = await open({
				filename: ":memory:",
				driver: sqlite3.Database,
			});

			await db.exec(`
				CREATE TABLE scheduler_schedules (name TEXT PRIMARY KEY, data TEXT NOT NULL);
				CREATE TABLE scheduler_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL, run_at TEXT);
			`);

			const lockProvider = new SQLiteAdapter(db);
			storage = new SQLJobStorage(
				{
					query: async (sql, params) => ({ rows: await db.all(sql, params) }),
					exec: async (sql, params) => {
						await db.run(sql, params);
					},
				},
				lockProvider,
				"sqlite",
				{ keyPrefix: "scheduler:" },
			);
			cleanup = async () => {
				await db.close();
			};
			break;
		}

		case "redis": {
			const { RedisAdapter } = await import("go-go-scope/persistence/redis");
			const Redis = await import("ioredis");
			const redis = new Redis.default(
				process.env.REDIS_URL || "redis://localhost:6379",
			);
			const lockProvider = new RedisAdapter(redis);
			storage = new RedisJobStorage(redis, lockProvider, {
				keyPrefix: "scheduler:test:",
			});
			cleanup = async () => {
				const keys = await redis.keys("scheduler:test:*");
				if (keys.length > 0) await redis.del(...keys);
				await redis.quit();
			};
			break;
		}

		case "postgres":
		case "postgresql": {
			const { PostgresAdapter } = await import(
				"go-go-scope/persistence/postgres"
			);
			const { Client } = await import("pg");
			const client = new Client({
				connectionString:
					process.env.DATABASE_URL ||
					"postgres://postgres:postgres@localhost:5432/test",
			});
			await client.connect();
			const lockProvider = new PostgresAdapter(client);
			storage = new SQLJobStorage(
				{
					query: async (sql, params) => await client.query(sql, params),
					exec: async (sql, params) => {
						await client.query(sql, params);
					},
				},
				lockProvider,
				"postgres",
				{ keyPrefix: "scheduler:test:" },
			);
			cleanup = async () => {
				await client.query(
					"DELETE FROM scheduler_schedules WHERE name LIKE 'scheduler:test:%'",
				);
				await client.query(
					"DELETE FROM scheduler_jobs WHERE id LIKE 'scheduler:test:%'",
				);
				await client.end();
			};
			break;
		}

		case "mysql": {
			const { MySQLAdapter } = await import("go-go-scope/persistence/mysql");
			const mysql = await import("mysql2/promise");
			const connection = await mysql.createConnection({
				host: process.env.MYSQL_HOST || "localhost",
				port: parseInt(process.env.MYSQL_PORT || "3306"),
				database: process.env.MYSQL_DB || "test",
				user: process.env.MYSQL_USER || "root",
				password: process.env.MYSQL_PASSWORD || "",
			});
			const lockProvider = new MySQLAdapter(connection);
			storage = new SQLJobStorage(
				{
					query: async (sql, params) => {
						const [rows] = await connection.execute(sql, params);
						return { rows: rows as unknown[] };
					},
					exec: async (sql, params) => {
						await connection.execute(sql, params);
					},
				},
				lockProvider,
				"mysql",
				{ keyPrefix: "scheduler:test:" },
			);
			cleanup = async () => {
				await connection.execute(
					"DELETE FROM scheduler_schedules WHERE name LIKE 'scheduler:test:%'",
				);
				await connection.execute(
					"DELETE FROM scheduler_jobs WHERE id LIKE 'scheduler:test:%'",
				);
				await connection.end();
			};
			break;
		}

		default:
			console.error(`Unknown adapter: ${adapter}`);
			console.error(
				"Available adapters: memory, sqlite, redis, postgres, mysql",
			);
			process.exit(1);
	}

	// Create admin
	const admin = new Scheduler({
		role: SchedulerRole.ADMIN,
		scope: s,
		storage,
		autoStart: false,
	});

	// Create worker
	const worker = new Scheduler({
		role: SchedulerRole.WORKER,
		scope: s,
		storage,
		autoStart: false,
		checkInterval: 100,
	});

	// Track job executions
	const executions: string[] = [];

	await worker.loadSchedules({
		handlerFactory: (name) => {
			if (name === "test-interval" || name === "test-cron") {
				return async (job) => {
					executions.push(`${name}:${job.id}`);
					process.stdout.write(".");
				};
			}
			return null;
		},
	});

	console.log("\n📅 Creating schedules...");

	// Create interval-based schedule
	await admin.createSchedule("test-interval", {
		interval: 500,
	});
	console.log("  ✓ Created interval schedule (500ms)");

	// Create cron-based schedule
	await admin.createSchedule("test-cron", {
		cron: "* * * * *", // Every minute
	});
	console.log("  ✓ Created cron schedule (every minute)");

	// Start worker
	console.log("\n▶️  Starting worker...");
	worker.start();

	// Wait for jobs
	console.log("⏳ Waiting for jobs to execute...");
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Stop worker
	console.log("\n\n🛑 Stopping worker...");
	await worker[Symbol.asyncDispose]();

	// Print stats
	console.log("\n📊 Results:");
	console.log(`  Jobs executed: ${executions.length}`);
	console.log(
		`  Unique schedules: ${new Set(executions.map((e) => e.split(":")[0])).size}`,
	);

	// Check storage
	const pending = await storage.getJobsByStatus("pending");
	const completed = await storage.getJobsByStatus("completed");
	console.log(`  Pending jobs: ${pending.length}`);
	console.log(`  Completed jobs: ${completed.length}`);

	// Cleanup
	console.log("\n🧹 Cleaning up...");
	await admin.deleteSchedule("test-interval");
	await admin.deleteSchedule("test-cron");
	await admin[Symbol.asyncDispose]();
	await cleanup();

	// Memory check
	forceGC();
	await new Promise((r) => setTimeout(r, 200));
	const finalMemory = getMemoryMB();
	const growth = finalMemory - initialMemory;

	console.log("\n💾 Memory Usage:");
	console.log(`  Initial: ${initialMemory} MB`);
	console.log(`  Final: ${finalMemory} MB`);
	console.log(`  Growth: ${growth} MB`);

	if (growth > 50) {
		console.log("\n⚠️  WARNING: High memory growth detected!");
		process.exit(1);
	} else {
		console.log("\n✅ Test completed successfully!");
	}
}

runTest().catch((err) => {
	console.error("\n❌ Test failed:", err.message);
	process.exit(1);
});
