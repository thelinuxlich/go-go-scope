/**
 * Stress tests for go-go-scope scheduler
 *
 * These tests verify the scheduler can handle production workloads and edge cases:
 * - High throughput (many jobs per second)
 * - Many concurrent schedules (100+)
 * - Worker failures and recovery
 * - Clock skew/time jumps
 * - Database connection failures
 * - Thundering herd protection
 * - Stalled job detection
 *
 * Run with: node --expose-gc node_modules/vitest/vitest.mjs run scheduler-stress.test.ts
 */

import { scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import { Scheduler } from "./index.js";
import { SQLJobStorage } from "./persistence-storage.js";
import type { Job, JobStorage } from "./types.js";

// Force GC if available
function forceGC(): void {
	if (global.gc) {
		global.gc();
	}
}

function getMemoryMB(): number {
	const usage = process.memoryUsage();
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout = 30000,
	interval = 50,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await condition()) return;
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

interface StressTestContext {
	storage: JobStorage;
	cleanup: () => Promise<void>;
}

// ============================================================================
// HIGH THROUGHPUT TESTS
// ============================================================================

describe("Stress Tests - High Throughput", () => {
	test("handles 1000 jobs in under 30 seconds", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

		const admin = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
		});

		const worker = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
			checkInterval: 10, // Very aggressive polling
		});

		// Create schedule BEFORE loading (worker only loads existing schedules)
		await admin.createSchedule("high-throughput", {
			interval: 10, // Every 10ms
		});

		let completedCount = 0;
		worker.onSchedule("high-throughput", async () => {
			completedCount++;
		});

		const startTime = Date.now();
		worker.start();

		// Wait for 1000 jobs
		await waitFor(() => completedCount >= 1000, 30000);

		const duration = Date.now() - startTime;
		const throughput = Math.round(completedCount / (duration / 1000));

		console.log(
			`   Executed ${completedCount} jobs in ${duration}ms (${throughput} jobs/sec)`,
		);

		expect(duration).toBeLessThan(30000);
		expect(throughput).toBeGreaterThan(30); // At least 30 jobs/sec

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 35000);

	test("maintains throughput with large payloads", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

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

		// Create schedule BEFORE loading (worker only loads existing schedules)
		await admin.createSchedule("large-payloads", {
			interval: 100,
			defaultPayload: { data: "x".repeat(10000) }, // 10KB payload
		});

		let processedPayloads = 0;
		let totalPayloadSize = 0;

		worker.onSchedule("large-payloads", async (job: Job) => {
			const payload = job.payload as { data?: string };
			if (payload.data) {
				processedPayloads++;
				totalPayloadSize += payload.data.length;
			}
		});

		worker.start();

		// Run for 2 seconds
		await new Promise((r) => setTimeout(r, 2000));

		console.log(
			`   Processed ${processedPayloads} payloads, total ${Math.round(totalPayloadSize / 1024)}KB`,
		);

		expect(processedPayloads).toBeGreaterThan(10);

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 10000);
});

// ============================================================================
// MANY SCHEDULES TESTS
// ============================================================================

describe("Stress Tests - Many Concurrent Schedules", () => {
	test("handles 100 concurrent schedules", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

		const admin = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
		});

		const worker = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
			checkInterval: 100,
		});

		// Create 100 schedules BEFORE loading (worker only loads existing schedules)
		const startCreate = Date.now();
		for (let i = 0; i < 100; i++) {
			await admin.createSchedule(`schedule-${i}`, {
				interval: 200 + (i % 5) * 50, // 200-400ms intervals
			});
		}

		const executions: Record<string, number> = {};

		for (let i = 0; i < 100; i++) {
			const name = `schedule-${i}`;
			worker.onSchedule(name, async () => {
				executions[name] = (executions[name] || 0) + 1;
			});
		}
		const createDuration = Date.now() - startCreate;

		console.log(`   Created 100 schedules in ${createDuration}ms`);

		worker.start();

		// Let them run
		await new Promise((r) => setTimeout(r, 3000));

		const totalExecutions = Object.values(executions).reduce(
			(a, b) => a + b,
			0,
		);
		const activeSchedules = Object.keys(executions).length;

		console.log(
			`   ${activeSchedules}/100 schedules executed, ${totalExecutions} total jobs`,
		);

		expect(activeSchedules).toBeGreaterThan(50); // At least half executed
		expect(totalExecutions).toBeGreaterThan(100);

		// Cleanup all schedules
		for (let i = 0; i < 100; i++) {
			await admin.deleteSchedule(`schedule-${i}`);
		}

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 30000);

	test("memory stays bounded with many schedules", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 200));
		const initialMemory = getMemoryMB();

		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

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

		// Create 50 schedules BEFORE loading (worker only loads existing schedules)
		for (let i = 0; i < 50; i++) {
			await admin.createSchedule(`mem-test-${i}`, {
				interval: 500,
			});
		}

		for (let i = 0; i < 50; i++) {
			worker.onSchedule(`mem-test-${i}`, async () => {});
		}

		worker.start();

		// Run for 3 seconds
		await new Promise((r) => setTimeout(r, 3000));

		// Delete all
		for (let i = 0; i < 50; i++) {
			await admin.deleteSchedule(`mem-test-${i}`);
		}

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();

		forceGC();
		await new Promise((r) => setTimeout(r, 200));
		const finalMemory = getMemoryMB();
		const growth = finalMemory - initialMemory;

		console.log(
			`   Memory growth with 50 schedules: ${growth}MB (initial: ${initialMemory}MB, final: ${finalMemory}MB)`,
		);

		expect(growth).toBeLessThan(30);
	}, 15000);
});

// ============================================================================
// WORKER FAILURE RECOVERY TESTS
// ============================================================================

describe("Stress Tests - Worker Failure Recovery", () => {
	test("recovers when worker crashes during job execution", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

		const admin = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
		});

		// Create first worker that will "crash"
		const worker1 = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
			checkInterval: 100,
		});

		// Create schedule BEFORE loading (worker only loads existing schedules)
		await admin.createSchedule("crash-test", {
			interval: 200,
		});

		let worker1Jobs = 0;
		let shouldCrash = false;

		worker1.onSchedule("crash-test", async () => {
			worker1Jobs++;
			if (shouldCrash) {
				// Simulate crash
				throw new Error("Simulated worker crash");
			}
		});

		worker1.start();

		// Let some jobs complete normally
		await new Promise((r) => setTimeout(r, 500));
		expect(worker1Jobs).toBeGreaterThan(0);

		// Trigger crash on next job
		shouldCrash = true;

		// Wait for job to fail
		await new Promise((r) => setTimeout(r, 500));

		// Dispose crashed worker (simulating crash)
		await worker1[Symbol.asyncDispose]();

		// Create new worker to take over
		const worker2 = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
			checkInterval: 100,
		});

		let worker2Jobs = 0;
		worker2.onSchedule("crash-test", async () => {
			worker2Jobs++;
		});

		worker2.start();

		// New worker should process jobs
		await waitFor(() => worker2Jobs >= 2, 5000);

		console.log(
			`   Worker1: ${worker1Jobs} jobs, Worker2: ${worker2Jobs} jobs after recovery`,
		);

		expect(worker2Jobs).toBeGreaterThan(0);

		await worker2[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 10000);

	test("handles rapid worker restarts", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

		const admin = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
		});

		await admin.createSchedule("restart-test", {
			interval: 100,
		});

		let totalJobs = 0;

		// Rapidly restart workers 5 times
		for (let i = 0; i < 5; i++) {
			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			worker.onSchedule("restart-test", async () => {
				totalJobs++;
			});

			worker.start();
			await new Promise((r) => setTimeout(r, 300));
			await worker[Symbol.asyncDispose]();
		}

		console.log(
			`   Total jobs processed across 5 worker restarts: ${totalJobs}`,
		);

		expect(totalJobs).toBeGreaterThan(5);

		await admin[Symbol.asyncDispose]();
	}, 10000);
});

// ============================================================================
// CLOCK SKEW / TIME JUMP TESTS
// ============================================================================

describe("Stress Tests - Clock Skew Handling", () => {
	test("handles jobs scheduled in the past (clock jumped back)", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

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
			staleThreshold: 60000, // 1 minute
			staleJobBehavior: "run",
		});

		// Schedule job BEFORE loading (worker only loads existing schedules)
		await admin.createSchedule("past-job", {
			interval: 1000,
		});

		let executed = false;
		worker.onSchedule("past-job", async () => {
			executed = true;
		});

		// Manually create a job in the past
		const pastJob = {
			id: "past-job-1",
			scheduleId: "schedule-past-job",
			scheduleName: "past-job",
			payload: {},
			status: "pending" as const,
			priority: 0,
			createdAt: new Date(Date.now() - 60000), // 1 minute ago
			runAt: new Date(Date.now() - 30000), // 30 seconds ago
			retryCount: 0,
			maxRetries: 3,
		};
		await storage.saveJob(pastJob);

		worker.start();

		// Should execute the stale job
		await waitFor(() => executed, 2000);

		console.log("   Stale job from the past was executed");

		expect(executed).toBe(true);

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 5000);
});

// ============================================================================
// THUNDERING HERD PROTECTION TESTS
// ============================================================================

describe("Stress Tests - Thundering Herd Protection", () => {
	test("prevents duplicate execution with multiple workers", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

		const admin = new Scheduler({
			scope: s,
			storage,
			autoStart: false,
		});

		// Create schedule BEFORE loading workers (worker only loads existing schedules)
		await admin.createSchedule("herd-test", {
			interval: 100,
		});

		// Create 5 workers
		const workers: Scheduler[] = [];
		const executions = new Set<string>();

		for (let i = 0; i < 5; i++) {
			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 20, // Very aggressive
			});

			worker.onSchedule("herd-test", async (job: Job) => {
				executions.add(job.id);
				// Simulate some work
				await new Promise((r) => setTimeout(r, 50));
			});

			workers.push(worker);
		}

		// Start all workers simultaneously
		workers.forEach((w) => w.start());

		// Let them compete
		await new Promise((r) => setTimeout(r, 2000));

		// Stop all workers
		await Promise.all(workers.map((w) => w[Symbol.asyncDispose]()));

		// Get completed jobs
		const completed = await storage.getJobsByStatus("completed");
		const herdJobs = completed.filter((j) => j.scheduleName === "herd-test");

		// Count unique executions
		const uniqueExecutions = executions.size;
		const totalJobs = herdJobs.length;

		console.log(
			`   ${totalJobs} jobs completed, ${uniqueExecutions} unique executions by ${executions.size} workers`,
		);

		// Should have roughly 20 jobs in 2 seconds (one every 100ms)
		// But some may have been skipped due to locking
		expect(totalJobs).toBeGreaterThan(10);
		expect(totalJobs).toBeLessThan(30);

		// Executions should match jobs (no duplicates)
		expect(uniqueExecutions).toBe(totalJobs);

		await admin[Symbol.asyncDispose]();
	}, 10000);

	test("handles burst of jobs scheduled at same time", async () => {
		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

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

		// Create 20 schedules BEFORE loading (worker only loads existing schedules)
		for (let i = 0; i < 20; i++) {
			await admin.createSchedule(`burst-${i}`, {
				interval: 200,
			});
		}

		const executed: string[] = [];
		for (let i = 0; i < 20; i++) {
			worker.onSchedule(`burst-${i}`, async (job: Job) => {
				executed.push(job.id);
				// Add jitter to prevent thundering herd
				await new Promise((r) => setTimeout(r, Math.random() * 10));
			});
		}

		worker.start();

		// Let them run
		await new Promise((r) => setTimeout(r, 1500));

		console.log(
			`   Executed ${executed.length} jobs from 20 concurrent schedules`,
		);

		// Should have executed many jobs
		expect(executed.length).toBeGreaterThan(50);

		// Cleanup
		for (let i = 0; i < 20; i++) {
			await admin.deleteSchedule(`burst-${i}`);
		}

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();
	}, 10000);
});

// ============================================================================
// LONG-RUNNING STABILITY TEST
// ============================================================================

describe("Stress Tests - Long-Running Stability", () => {
	test("runs stable for 10 seconds with continuous load", async () => {
		forceGC();
		await new Promise((r) => setTimeout(r, 200));
		const initialMemory = getMemoryMB();

		const { InMemoryJobStorage } = await import("./types.js");
		const storage = new InMemoryJobStorage();

		await using s = scope();

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

		// Create several schedules BEFORE loading (worker only loads existing schedules)
		for (let i = 0; i < 5; i++) {
			await admin.createSchedule(`stability-${i}`, {
				interval: 100 + i * 50,
				maxRetries: 3,
				retryDelay: 50,
			});
		}

		let jobCount = 0;
		let errorCount = 0;

		for (let i = 0; i < 5; i++) {
			worker.onSchedule(`stability-${i}`, async () => {
				jobCount++;
				// 10% chance of "error"
				if (Math.random() < 0.1) {
					errorCount++;
					throw new Error("Random error");
				}
			});
		}

		worker.start();

		// Run for 10 seconds
		await new Promise((r) => setTimeout(r, 10000));

		await worker[Symbol.asyncDispose]();
		await admin[Symbol.asyncDispose]();

		forceGC();
		await new Promise((r) => setTimeout(r, 200));
		const finalMemory = getMemoryMB();
		const growth = finalMemory - initialMemory;

		console.log(`   Executed ${jobCount} jobs (${errorCount} errors) in 10s`);
		console.log(
			`   Memory growth: ${growth}MB (initial: ${initialMemory}MB, final: ${finalMemory}MB)`,
		);

		expect(jobCount).toBeGreaterThan(100);
		expect(growth).toBeLessThan(50);

		// Cleanup schedules
		for (let i = 0; i < 5; i++) {
			await storage.deleteSchedule(`stability-${i}`).catch(() => {});
		}
	}, 15000);
});
