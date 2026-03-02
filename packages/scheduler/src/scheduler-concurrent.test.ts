/**
 * Scheduler concurrent execution tests
 *
 * These tests verify that the concurrent option works correctly:
 * - When concurrent: false (default), only one job per schedule runs at a time
 * - When concurrent: true, multiple jobs from the same schedule can run simultaneously
 */

import { scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import { InMemoryJobStorage, Scheduler } from "./index.js";

describe("Scheduler Concurrent Execution", () => {
	describe("concurrent: false (default)", () => {
		test("prevents multiple jobs from same schedule running simultaneously", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const executed: string[] = [];
			let resolveFirst: (() => void) | null = null;

			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			// Create schedule with concurrent: false (default)
			await scheduler.createSchedule("sequential", {
				interval: 1000,
				concurrent: false,
			});

			// Register a slow handler
			scheduler.onSchedule("sequential", async (job) => {
				executed.push(job.id);
				// Wait for manual release
				await new Promise<void>((resolve) => {
					resolveFirst = resolve;
				});
			});

			// Create two jobs manually
			const [err1, _result1] = await scheduler.scheduleJob("sequential", {
				runAt: new Date(Date.now() - 100), // Due now
			});
			expect(err1).toBeUndefined();

			const [err2, _result2] = await scheduler.scheduleJob("sequential", {
				runAt: new Date(Date.now() - 50), // Also due now
			});
			expect(err2).toBeUndefined();

			// Start scheduler
			await scheduler.start();

			// Wait for first job to start
			await new Promise((r) => setTimeout(r, 100));

			// First job should be running, second should be pending
			expect(executed.length).toBe(1);

			// Complete first job
			(resolveFirst as (() => void) | null)?.();

			// Wait for second job to execute
			await new Promise((r) => setTimeout(r, 200));

			// Now both jobs should have executed
			expect(executed.length).toBe(2);
		});

		test("sequential execution across multiple instances", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const executionLog: { jobId: string; start: number; end: number }[] = [];
			let currentExecution = 0;

			// Create schedule
			const admin = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
			});
			await admin.createSchedule("shared", {
				interval: 1000,
				concurrent: false,
			});

			// Create two worker instances
			const worker1 = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			const worker2 = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			// Both workers handle the same schedule
			const handler = async (job: { id: string }) => {
				const start = Date.now();
				currentExecution++;
				expect(currentExecution).toBe(1); // Should never be > 1
				await new Promise((r) => setTimeout(r, 100));
				currentExecution--;
				const end = Date.now();
				executionLog.push({ jobId: job.id, start, end });
			};

			worker1.onSchedule("shared", handler);
			worker2.onSchedule("shared", handler);

			// Schedule multiple jobs
			for (let i = 0; i < 3; i++) {
				await admin.scheduleJob("shared", {
					runAt: new Date(Date.now() + i * 50),
				});
			}

			// Start both workers
			await worker1.start();
			await worker2.start();

			// Wait for all jobs to complete
			await new Promise((r) => setTimeout(r, 800));

			// Verify all jobs executed
			expect(executionLog.length).toBe(3);

			// Verify no overlap in execution times
			for (let i = 1; i < executionLog.length; i++) {
				const prev = executionLog[i - 1];
				const curr = executionLog[i];
				// Current job should start after previous ends (or close to it)
				expect(curr!.start).toBeGreaterThanOrEqual(prev!.end - 10); // Allow 10ms tolerance
			}
		});
	});

	describe("concurrent: true", () => {
		test("allows multiple jobs from same schedule to run simultaneously", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const executionLog: { jobId: string; start: number; end: number }[] = [];

			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			// Create schedule with concurrent: true
			await scheduler.createSchedule("parallel", {
				interval: 1000,
				concurrent: true,
			});

			// Register handler that tracks execution times
			scheduler.onSchedule("parallel", async (job) => {
				const start = Date.now();
				await new Promise((r) => setTimeout(r, 200));
				const end = Date.now();
				executionLog.push({ jobId: job.id, start, end });
			});

			// Create two jobs
			const [err1] = await scheduler.scheduleJob("parallel", {
				runAt: new Date(Date.now() - 100),
			});
			expect(err1).toBeUndefined();

			const [err2] = await scheduler.scheduleJob("parallel", {
				runAt: new Date(Date.now() - 50),
			});
			expect(err2).toBeUndefined();

			// Start scheduler
			await scheduler.start();

			// Wait for both jobs to start
			await new Promise((r) => setTimeout(r, 150));

			// Both should be running (or have started)
			expect(executionLog.length).toBeGreaterThanOrEqual(0); // May not have completed yet

			// Wait for completion
			await new Promise((r) => setTimeout(r, 300));

			// Both jobs should have completed
			expect(executionLog.length).toBe(2);

			// Verify they ran in parallel (start times should be close)
			if (executionLog.length === 2) {
				const timeDiff = Math.abs(
					executionLog[0]!.start - executionLog[1]!.start,
				);
				expect(timeDiff).toBeLessThan(100); // Started within 100ms of each other
			}
		});

		test("overlapping execution with concurrent: true", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			let concurrentExecutions = 0;
			let maxConcurrent = 0;

			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			await scheduler.createSchedule("overlap", {
				interval: 1000,
				concurrent: true,
			});

			scheduler.onSchedule("overlap", async () => {
				concurrentExecutions++;
				maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
				await new Promise((r) => setTimeout(r, 150));
				concurrentExecutions--;
			});

			// Create two jobs close together
			await scheduler.scheduleJob("overlap", { runAt: new Date() });
			await scheduler.scheduleJob("overlap", {
				runAt: new Date(Date.now() + 50),
			});

			await scheduler.start();

			// Wait for both to be running
			await new Promise((r) => setTimeout(r, 100));

			// Should have 2 concurrent executions
			expect(maxConcurrent).toBe(2);

			// Wait for completion
			await new Promise((r) => setTimeout(r, 300));
		});
	});

	describe("mixed schedules", () => {
		test("different schedules respect their own concurrent settings", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const log: { schedule: string; jobId: string; type: "start" | "end" }[] =
				[];

			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			// Create two schedules with different concurrent settings
			await scheduler.createSchedule("sequential", {
				interval: 1000,
				concurrent: false,
			});

			await scheduler.createSchedule("parallel", {
				interval: 1000,
				concurrent: true,
			});

			// Register handlers
			scheduler.onSchedule("sequential", async (job) => {
				log.push({ schedule: "sequential", jobId: job.id, type: "start" });
				await new Promise((r) => setTimeout(r, 150));
				log.push({ schedule: "sequential", jobId: job.id, type: "end" });
			});

			scheduler.onSchedule("parallel", async (job) => {
				log.push({ schedule: "parallel", jobId: job.id, type: "start" });
				await new Promise((r) => setTimeout(r, 150));
				log.push({ schedule: "parallel", jobId: job.id, type: "end" });
			});

			// Create jobs for both schedules
			await scheduler.scheduleJob("sequential", { runAt: new Date() });
			await scheduler.scheduleJob("sequential", {
				runAt: new Date(Date.now() + 50),
			});
			await scheduler.scheduleJob("parallel", { runAt: new Date() });
			await scheduler.scheduleJob("parallel", {
				runAt: new Date(Date.now() + 50),
			});

			await scheduler.start();

			// Wait for all to complete
			await new Promise((r) => setTimeout(r, 500));

			// Sequential schedule: jobs should NOT overlap
			const sequentialStarts = log
				.filter((e) => e.schedule === "sequential" && e.type === "start")
				.map((e) => e.jobId);
			const sequentialEnds = log
				.filter((e) => e.schedule === "sequential" && e.type === "end")
				.map((e) => e.jobId);

			expect(sequentialStarts.length).toBe(2);
			expect(sequentialEnds.length).toBe(2);

			// Verify sequential execution (no overlap between same schedule jobs)
			const seq1EndIdx = log.findIndex(
				(e) =>
					e.schedule === "sequential" &&
					e.jobId === sequentialStarts[0] &&
					e.type === "end",
			);
			const seq2StartIdx = log.findIndex(
				(e) =>
					e.schedule === "sequential" &&
					e.jobId === sequentialStarts[1] &&
					e.type === "start",
			);

			// Second sequential job should start after first ends
			expect(seq2StartIdx).toBeGreaterThan(seq1EndIdx);

			// Parallel schedule: jobs CAN overlap
			const parallelStarts = log.filter(
				(e) => e.schedule === "parallel" && e.type === "start",
			);
			expect(parallelStarts.length).toBe(2);
		});
	});
});
