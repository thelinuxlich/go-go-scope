/**
 * Scheduler tests - Admin + Workers Pattern
 */

import { scope } from "go-go-scope";
import { describe, expect, test } from "vitest";
import {
	CronPresets,
	InMemoryJobStorage,
	Scheduler,
	StaleJobBehavior,
} from "./index.js";
import type { Job } from "./types.js";

describe("Scheduler", () => {
	describe("Schedule Management", () => {
		test("can create schedules", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
			});

			const schedule = await scheduler.createSchedule("test", {
				cron: "* * * * *",
			});

			expect(schedule.name).toBe("test");
			await scheduler[Symbol.asyncDispose]();
		});

		test("can register handlers", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			// Create schedule
			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("test", { cron: "* * * * *" });

			// Register handler
			const worker = new Scheduler({ scope: s, storage, autoStart: false });
			worker.onSchedule("test", async () => {});

			// Handler is registered
			// @ts-ignore - accessing private property for test verification
			expect(worker.handlers.has("test")).toBe(true);
			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});
	});

	describe("Admin Schedule Management", () => {
		test("creates schedule with cron expression", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				autoStart: false,
			});

			const schedule = await admin.createSchedule("cron-test", {
				cron: CronPresets.EVERY_HOUR,
				timezone: "America/New_York",
			});

			expect(schedule.name).toBe("cron-test");
			expect(schedule.cron).toBe(CronPresets.EVERY_HOUR);
			expect(schedule.timezone).toBe("America/New_York");

			await admin[Symbol.asyncDispose]();
		});

		test("creates schedule with interval", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				autoStart: false,
			});

			const schedule = await admin.createSchedule("interval-test", {
				interval: 60000,
			});

			expect(schedule.interval).toBe(60000);

			await admin[Symbol.asyncDispose]();
		});

		test("throws when creating duplicate schedule", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				autoStart: false,
			});

			await admin.createSchedule("duplicate", { cron: "* * * * *" });

			await expect(
				admin.createSchedule("duplicate", { cron: "0 * * * *" }),
			).rejects.toThrow("already exists");

			await admin[Symbol.asyncDispose]();
		});

		test("deletes schedule", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				autoStart: false,
			});

			await admin.createSchedule("to-delete", { cron: "* * * * *" });
			const deleted = await admin.deleteSchedule("to-delete");

			expect(deleted).toBe(true);

			// Verify it's gone
			await expect(
				admin.createSchedule("to-delete", { cron: "* * * * *" }),
			).resolves.toBeDefined();

			await admin[Symbol.asyncDispose]();
		});

		test("cannot delete non-existent schedule", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const scheduler = new Scheduler({
				scope: s,
				autoStart: false,
			});

			await expect(scheduler.deleteSchedule("non-existent")).resolves.toBe(
				false,
			);

			await scheduler[Symbol.asyncDispose]();
		});
	});

	describe("Worker Schedule Handlers", () => {
		test("registers handlers for schedules", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("a", { cron: "* * * * *" });
			await admin.createSchedule("b", { cron: "0 * * * *" });

			const worker = new Scheduler({ scope: s, storage, autoStart: false });

			// Register handlers for both schedules
			worker.onSchedule("a", async () => {});
			worker.onSchedule("b", async () => {});

			// @ts-ignore - accessing private property for test verification
			expect(worker.handlers.has("a")).toBe(true);
			// @ts-ignore - accessing private property for test verification
			expect(worker.handlers.has("b")).toBe(true);

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});

		test("only processes schedules with registered handlers", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("known", { cron: "* * * * *" });
			await admin.createSchedule("unknown", { cron: "0 * * * *" });

			const worker = new Scheduler({ scope: s, storage, autoStart: false });
			// Only register handler for "known"
			worker.onSchedule("known", async () => {});

			// @ts-ignore - accessing private property for test verification
			expect(worker.handlers.has("known")).toBe(true);
			// @ts-ignore - accessing private property for test verification
			expect(worker.handlers.has("unknown")).toBe(false);

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});

		test("handlerRegistered event emitted", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("test", { cron: "* * * * *" });

			const worker = new Scheduler({ scope: s, storage, autoStart: false });
			const events: Array<{ scheduleName: string }> = [];

			worker.on("handlerRegistered", (e) => events.push(e));

			worker.onSchedule("test", async () => {});

			expect(events).toHaveLength(1);
			expect(events[0]!.scheduleName).toBe("test");

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});
	});

	describe("Job Execution", () => {
		test("worker executes scheduled jobs", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			// Admin creates schedule
			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("exec-test", { cron: "* * * * *" });

			// Schedule a job
			const [_, _result] = await admin.scheduleJob("exec-test", {});

			// Worker loads and executes
			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			let executed = false;
			worker.onSchedule("exec-test", async () => {
				executed = true;
			});

			worker.start();
			await new Promise((r) => setTimeout(r, 300));

			expect(executed).toBe(true);

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});

		test("job fails when schedule not loaded by worker", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			// Admin creates schedule and job
			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("missing", { cron: "* * * * *" });
			const [_, result] = await admin.scheduleJob("missing", {});

			// Worker starts but doesn't load the schedule
			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			const events: Array<{ job: Job; permanent?: boolean }> = [];
			worker.on("jobFailed", (e) => events.push(e));

			worker.start();
			await new Promise((r) => setTimeout(r, 300));

			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events[0]!.permanent).toBe(true);

			const job = await storage.getJob(result!.jobId);
			expect(job?.status).toBe("failed");
			expect(job?.error).toContain("No handler registered");

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});

		test("distributed locking prevents duplicate execution", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			// Admin creates schedule
			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("lock-test", { cron: "* * * * *" });
			await admin.scheduleJob("lock-test", {});

			// Two workers
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

			let executionCount = 0;
			const handler = async () => {
				executionCount++;
				await new Promise((r) => setTimeout(r, 100));
			};

			worker1.onSchedule("lock-test", handler);
			worker2.onSchedule("lock-test", handler);

			worker1.start();
			worker2.start();
			await new Promise((r) => setTimeout(r, 400));

			// Should only execute once despite two workers
			expect(executionCount).toBe(1);

			await admin[Symbol.asyncDispose]();
			await worker1[Symbol.asyncDispose]();
			await worker2[Symbol.asyncDispose]();
		});
	});

	describe("Stale Jobs", () => {
		test("stale jobs are skipped with SKIP behavior", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			const admin = new Scheduler({ scope: s, storage, autoStart: false });
			await admin.createSchedule("stale-test", { cron: "* * * * *" });

			// Create job scheduled 10 seconds ago
			const [_, result] = await admin.scheduleJob("stale-test", {});
			const job = await storage.getJob(result!.jobId);
			job!.runAt = new Date(Date.now() - 10000);
			await storage.saveJob(job!);

			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
				staleThreshold: 5000,
				staleJobBehavior: StaleJobBehavior.SKIP,
			});

			const events: Array<{ type: string }> = [];
			worker.on("jobSkipped", () => events.push({ type: "skipped" }));

			worker.onSchedule("stale-test", async () => {});
			worker.start();
			await new Promise((r) => setTimeout(r, 300));

			expect(events.length).toBe(1);

			const updated = await storage.getJob(result!.jobId);
			expect(updated?.status).toBe("completed");

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});
	});

	describe("Lifecycle Events", () => {
		test("emits started/stopped events", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const events: Array<{ type: string }> = [];

			const worker = new Scheduler({
				scope: s,
				autoStart: false,
			});

			worker.on("started", () => events.push({ type: "started" }));
			worker.on("stopped", () => events.push({ type: "stopped" }));

			worker.start();
			await worker.stop();

			expect(events).toHaveLength(2);
			expect(events[0]!.type).toBe("started");
			expect(events[1]!.type).toBe("stopped");

			await worker[Symbol.asyncDispose]();
		});
	});

	describe("Timezone Support", () => {
		test("schedule stores timezone", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				defaultTimezone: "America/New_York",
				autoStart: false,
			});

			const schedule = await admin.createSchedule("tz-test", {
				cron: "0 9 * * *",
				// Uses default timezone
			});

			expect(schedule.timezone).toBe("America/New_York");

			await admin[Symbol.asyncDispose]();
		});

		test("schedule timezone overrides default", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const admin = new Scheduler({
				scope: s,
				defaultTimezone: "America/New_York",
				autoStart: false,
			});

			const schedule = await admin.createSchedule("tz-override", {
				cron: "0 9 * * *",
				timezone: "Europe/London",
			});

			expect(schedule.timezone).toBe("Europe/London");

			await admin[Symbol.asyncDispose]();
		});
	});

	describe("Job Retry", () => {
		test("failed jobs are retried", async () => {
			await using s = scope() as import("go-go-scope").Scope<Record<string, unknown>>;
			const storage = new InMemoryJobStorage();

			const admin = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
			});

			await admin.createSchedule("retry-test", {
				cron: "* * * * *",
				maxRetries: 2,
				retryDelay: 50,
			});

			await admin.scheduleJob("retry-test", {});

			const worker = new Scheduler({
				scope: s,
				storage,
				autoStart: false,
				checkInterval: 50,
			});

			let attempts = 0;
			const events: Array<{ type: string }> = [];

			worker.on("jobRetryScheduled", () => events.push({ type: "retry" }));
			worker.on("jobFailed", () => events.push({ type: "failed" }));

			worker.onSchedule("retry-test", async () => {
				attempts++;
				throw new Error("Always fails");
			});

			worker.start();
			await new Promise((r) => setTimeout(r, 500));

			expect(attempts).toBeGreaterThanOrEqual(1);

			await admin[Symbol.asyncDispose]();
			await worker[Symbol.asyncDispose]();
		});
	});
});
