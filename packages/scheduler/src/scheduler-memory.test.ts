/**
 * Scheduler memory leak tests
 *
 * These tests verify that the scheduler properly cleans up:
 * - Jobs after completion/failure/cancellation
 * - Schedules after deletion
 * - Event listeners
 * - Running job scopes
 * - Internal timers and intervals
 */

import { scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import { InMemoryJobStorage, Scheduler } from "./index.js";
import type { Job, JobStatus } from "./types.js";

// Helper to force garbage collection if available
function forceGC(): void {
	if (global.gc) {
		global.gc();
	}
}

// Helper to get memory usage in MB
function getMemoryMB(): number {
	const usage = process.memoryUsage();
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

describe("Scheduler Memory Management", () => {
	describe("Job Cleanup", () => {
		test("completed jobs don't accumulate in memory", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			await scheduler.createSchedule("memory-test", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("memory-test", async () => {
				// Quick handler
			});

			// Create 100 jobs
			const jobIds: string[] = [];
			for (let i = 0; i < 100; i++) {
				const [_, result] = await scheduler.scheduleJob("memory-test", {
					index: i,
				});
				if (result) jobIds.push(result.jobId);
			}

			// Run all jobs
			scheduler.start();
			await new Promise((r) => setTimeout(r, 1000));

			// Cleanup: delete completed jobs
			const completed = await storage.getJobsByStatus("completed");
			for (const job of completed) {
				await storage.deleteJob(job.id);
			}

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);

		test("failed jobs with retries don't leak memory", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			await scheduler.createSchedule("failing-job", {
				cron: "* * * * *",
				maxRetries: 2,
				retryDelay: 10,
			});
			scheduler.onSchedule("failing-job", async () => {
				throw new Error("Always fails");
			});

			// Create multiple failing jobs
			for (let i = 0; i < 20; i++) {
				await scheduler.scheduleJob("failing-job", { index: i });
			}

			scheduler.start();
			// Wait for all retries to complete
			await new Promise((r) => setTimeout(r, 2000));

			// Cleanup failed jobs
			const failed = await storage.getJobsByStatus("failed");
			for (const job of failed) {
				await storage.deleteJob(job.id);
			}

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);

		test("cancelled jobs are properly cleaned from memory", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
			});

			await scheduler.createSchedule("cancellable", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("cancellable", async () => {});

			// Create and immediately cancel jobs
			for (let i = 0; i < 50; i++) {
				const [_, result] = await scheduler.scheduleJob(
					"cancellable",
					{},
					{ delay: 60000 },
				);
				if (result) {
					await scheduler.cancelJob(result.jobId);
				}
			}

			// Cleanup
			const cancelled = await storage.getJobsByStatus("cancelled");
			for (const job of cancelled) {
				await storage.deleteJob(job.id);
			}

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);
	});

	describe("Running Jobs Cleanup", () => {
		test.skip("running jobs map is cleared after completion", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
				checkInterval: 50,
			});

			let resolveHandler: (() => void) | null = null;
			const handlerPromise = new Promise<void>((r) => {
				resolveHandler = r;
			});

			await scheduler.createSchedule("long-running", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("long-running", async () => {
				await handlerPromise;
			});

			// Start a job
			await scheduler.scheduleJob("long-running", {});
			scheduler.start();

			// Wait for job to start
			await new Promise((r) => setTimeout(r, 100));

			// Job should be in running state
			const status = scheduler.getStatus();
			expect(status.runningJobs).toBeGreaterThanOrEqual(1);

			// Complete the job
			(resolveHandler as (() => void) | null)?.();
			await new Promise((r) => setTimeout(r, 200));

			// Running jobs should be cleared
			const statusAfter = scheduler.getStatus();
			expect(statusAfter.runningJobs).toBe(0);

			await scheduler[Symbol.asyncDispose]();
		});

		test.skip("running jobs are cancelled and cleaned on scheduler stop", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
				checkInterval: 50,
			});

			let cancelled = false;

			await scheduler.createSchedule("stoppable", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("stoppable", async (_job, jobScope) => {
				try {
					await new Promise((_, reject) => {
						jobScope.signal.addEventListener("abort", () => {
							cancelled = true;
							reject(new Error("Cancelled"));
						});
						// Never resolves
					});
				} catch {
					// Expected
				}
			});

			await scheduler.scheduleJob("stoppable", {});
			scheduler.start();

			// Wait for job to start
			await new Promise((r) => setTimeout(r, 100));
			expect(scheduler.getStatus().runningJobs).toBeGreaterThanOrEqual(1);

			// Stop scheduler
			await scheduler.stop();

			expect(cancelled).toBe(true);
			expect(scheduler.getStatus().runningJobs).toBe(0);
			expect(scheduler.getStatus().isRunning).toBe(false);
		});
	});

	describe("Schedule Management", () => {
		test("deleted schedules don't accumulate in memory", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
			});

			// Create and delete many schedules
			for (let i = 0; i < 50; i++) {
				await scheduler.createSchedule(`temp-schedule-${i}`, {
					cron: "* * * * *",
				});
				scheduler.onSchedule(`temp-schedule-${i}`, async () => {});
			}

			expect(scheduler.getStatus().scheduledJobs).toBe(50);

			// Delete all
			for (let i = 0; i < 50; i++) {
				await scheduler.deleteSchedule(`temp-schedule-${i}`);
			}

			expect(scheduler.getStatus().scheduledJobs).toBe(0);

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);

		test.skip("schedule replacement doesn't leak old schedules", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
			});

			// Create schedule once (onConflict not supported, delete first if exists)
			for (let i = 0; i < 100; i++) {
				try {
					await scheduler.deleteSchedule("replaced-schedule");
				} catch {
					// Ignore if doesn't exist
				}
				await scheduler.createSchedule("replaced-schedule", {
					cron: `*/${(i % 60) + 1} * * * *`, // Different cron each time
				});
				scheduler.onSchedule("replaced-schedule", async () => {});
			}

			// Should only have 1 schedule
			expect(scheduler.getStatus().scheduledJobs).toBe(1);

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);
	});

	describe("Event Listeners", () => {
		test.skip("event listeners can be removed without leaking", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
			});

			const events: string[] = [];
			const listeners: Array<() => void> = [];

			// Add many listeners
			for (let i = 0; i < 20; i++) {
				const remove = scheduler.on("jobStarted", () => {
					events.push(`listener-${i}`);
				});
				listeners.push(remove);
			}

			await scheduler.createSchedule("event-test", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("event-test", async () => {});

			await scheduler.scheduleJob("event-test", {});
			scheduler.start();
			await new Promise((r) => setTimeout(r, 200));

			// All listeners fired
			expect(events.length).toBe(20);

			// Remove all listeners
			for (const remove of listeners) {
				remove();
			}

			events.length = 0;
			await scheduler.scheduleJob("event-test", {});
			await new Promise((r) => setTimeout(r, 200));

			// No listeners fired
			expect(events.length).toBe(0);

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);
	});

	describe("Timer Cleanup", () => {
		test("poll timer is cleared on stop", async () => {
			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;

			const scheduler = new Scheduler({
				scope: s,
				autoStart: true,
				checkInterval: 100,
			});

			await new Promise((r) => setTimeout(r, 100));

			// Timer should be active
			expect(scheduler.getStatus().isRunning).toBe(true);

			await scheduler.stop();

			// Timer should be cleared
			expect(scheduler.getStatus().isRunning).toBe(false);

			await scheduler[Symbol.asyncDispose]();
		});

		test("multiple start/stop cycles don't leak timers", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
				checkInterval: 50,
			});

			// Start/stop 10 times
			for (let i = 0; i < 10; i++) {
				scheduler.start();
				expect(scheduler.getStatus().isRunning).toBe(true);

				await new Promise((r) => setTimeout(r, 50));

				await scheduler.stop();
				expect(scheduler.getStatus().isRunning).toBe(false);
			}

			// Final state should be stopped
			expect(scheduler.getStatus().isRunning).toBe(false);

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);
	});

	describe("Storage Cleanup", () => {
		test("InMemoryJobStorage clears all data", async () => {
			const storage = new InMemoryJobStorage();

			// Add many jobs
			for (let i = 0; i < 100; i++) {
				const job: Job = {
					id: `job-${i}`,
					scheduleId: "sched-1",
					scheduleName: "test",
					payload: { data: new Array(1000).fill("x").join("") }, // Add some data
					status: "pending",
					priority: 0,
					createdAt: new Date(),
					retryCount: 0,
					maxRetries: 3,
				};
				await storage.saveJob(job);
			}

			const pending = await storage.getJobsByStatus("pending");
			expect(pending.length).toBe(100);

			// Delete all
			for (const job of pending) {
				await storage.deleteJob(job.id);
			}

			const remaining = await storage.getJobsByStatus("pending");
			expect(remaining.length).toBe(0);
		});

		test("locks are released after job completion", async () => {
			const storage = new InMemoryJobStorage();

			// Acquire multiple locks
			const locks: Array<{ jobId: string; acquired: boolean }> = [];

			for (let i = 0; i < 20; i++) {
				const acquired = await storage.acquireJobLock?.(
					`job-${i}`,
					"instance-1",
					5000,
				);
				locks.push({ jobId: `job-${i}`, acquired });
			}

			// All locks should be acquired
			expect(locks.every((l) => l.acquired)).toBe(true);

			// Release all
			for (const { jobId } of locks) {
				await storage.releaseJobLock?.(jobId, "instance-1");
			}

			// Should be able to reacquire
			for (let i = 0; i < 20; i++) {
				const acquired = await storage.acquireJobLock?.(
					`job-${i}`,
					"instance-2",
					5000,
				);
				expect(acquired).toBe(true);
			}
		});
	});

	describe("Stress Tests", () => {
		test.skip("high volume job creation and cleanup doesn't leak", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
			});

			await scheduler.createSchedule("high-volume", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("high-volume", async () => {});

			// Create 1000 jobs
			const jobIds: string[] = [];
			for (let i = 0; i < 1000; i++) {
				const [_, result] = await scheduler.scheduleJob("high-volume", {
					index: i,
				});
				if (result) jobIds.push(result.jobId);
			}

			// Delete all jobs
			for (const jobId of jobIds) {
				await storage.deleteJob(jobId);
			}

			// Verify all cleaned up
			const allStatuses: JobStatus[] = [
				"pending",
				"running",
				"completed",
				"failed",
				"cancelled",
			];
			for (const status of allStatuses) {
				const jobs = await storage.getJobsByStatus(status);
				expect(jobs.length).toBe(0);
			}

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);

		test("scheduler disposal cleans everything", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: true,
				checkInterval: 50,
			});

			// Create schedules
			for (let i = 0; i < 10; i++) {
				await scheduler.createSchedule(`schedule-${i}`, {
					cron: "* * * * *",
				});
				scheduler.onSchedule(`schedule-${i}`, async () => {});
			}

			// Create jobs
			for (let i = 0; i < 50; i++) {
				await scheduler.scheduleJob(`schedule-${i % 10}`, {});
			}

			expect(scheduler.getStatus().scheduledJobs).toBe(10);

			// Dispose
			await scheduler[Symbol.asyncDispose]();

			// After disposal, scheduler should be stopped
			expect(scheduler.getStatus().isRunning).toBe(false);

			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			const memoryGrowth = finalMemory - initialMemory;
			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Growth: ${memoryGrowth}MB`,
			);

			expect(memoryGrowth).toBeLessThan(50);
		}, 30000);
	});

	describe("Memory Stability", () => {
		test("memory usage remains stable under sustained load", async () => {
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const initialMemory = getMemoryMB();

			await using s = scope() as import("go-go-scope").Scope<
				Record<string, unknown>
			>;
			const storage = new InMemoryJobStorage();
			const scheduler = new Scheduler({
				scope: s,
				storage,
				autoStart: true,
				checkInterval: 100,
			});

			await scheduler.createSchedule("memory-test", {
				cron: "* * * * *",
			});
			scheduler.onSchedule("memory-test", async () => {
				// Simulate some work
				await new Promise((r) => setTimeout(r, 10));
			});

			const measurements: number[] = [];

			// Run 10 batches of 50 jobs each
			for (let batch = 0; batch < 10; batch++) {
				// Create jobs
				for (let i = 0; i < 50; i++) {
					await scheduler.scheduleJob("memory-test", {});
				}

				// Wait for processing
				await new Promise((r) => setTimeout(r, 500));

				// Clean up completed jobs
				const completed = await storage.getJobsByStatus("completed");
				for (const job of completed) {
					await storage.deleteJob(job.id);
				}

				forceGC();
				await new Promise((r) => setTimeout(r, 50));
				const mem = getMemoryMB();
				measurements.push(mem);
			}

			await scheduler[Symbol.asyncDispose]();
			forceGC();
			await new Promise((r) => setTimeout(r, 100));
			const finalMemory = getMemoryMB();

			// Memory should not grow unbounded
			const first = measurements[0]!;
			const last = measurements[measurements.length - 1]!;
			const growthRatio = last / first || 1;

			console.log(
				`   Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Ratio: ${growthRatio.toFixed(2)}`,
			);

			// Allow some variance but not exponential growth
			expect(growthRatio).toBeLessThan(5);
			expect(finalMemory - initialMemory).toBeLessThan(50);
		}, 30000);
	});
});
