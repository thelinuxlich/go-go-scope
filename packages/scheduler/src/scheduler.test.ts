/**
 * Scheduler tests - Admin + Workers Pattern
 */

import { describe, test, expect, vi } from "vitest";
import { scope } from "go-go-scope";
import { Scheduler, InMemoryJobStorage, SchedulerRole, CronPresets, StaleJobBehavior } from "./index.js";
import type { Job, JobStatus } from "./types.js";

describe("Scheduler", () => {
  describe("Role Enforcement", () => {
    test("requires role in options", async () => {
      await using s = scope();
      
      // @ts-expect-error - Testing missing role
      expect(() => new Scheduler({ scope: s })).toThrow("role is required");
    });

    test("admin can create schedules", async () => {
      await using s = scope();
      const scheduler = new Scheduler({
        role: SchedulerRole.ADMIN,
        scope: s,
        autoStart: false,
      });

      const schedule = await scheduler.createSchedule("test", {
        cron: "* * * * *",
      });

      expect(schedule.name).toBe("test");
      await scheduler[Symbol.asyncDispose]();
    });

    test("worker cannot create schedules", async () => {
      await using s = scope();
      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        autoStart: false,
      });

      await expect(
        worker.createSchedule("test", { cron: "* * * * *" })
      ).rejects.toThrow("Cannot create schedule from worker instance");

      await worker[Symbol.asyncDispose]();
    });

    test("admin cannot load schedules", async () => {
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
        scope: s,
        autoStart: false,
      });

      await expect(
        admin.loadSchedules({
          handlerFactory: () => async () => {},
        })
      ).rejects.toThrow("Admin instances manage schedules directly");

      await admin[Symbol.asyncDispose]();
    });

    test("worker can load schedules", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      // Admin creates schedule
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("test", { cron: "* * * * *" });

      // Worker loads it
      const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false });
      const loaded = await worker.loadSchedules({
        handlerFactory: (name) => {
          if (name === "test") return async () => {};
          return null;
        },
      });

      expect(loaded).toContain("test");
      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });
  });

  describe("Admin Schedule Management", () => {
    test("creates schedule with cron expression", async () => {
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
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
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
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
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
        scope: s,
        autoStart: false,
      });

      await admin.createSchedule("duplicate", { cron: "* * * * *" });

      await expect(
        admin.createSchedule("duplicate", { cron: "0 * * * *" })
      ).rejects.toThrow("already exists");

      await admin[Symbol.asyncDispose]();
    });

    test("deletes schedule", async () => {
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
        scope: s,
        autoStart: false,
      });

      await admin.createSchedule("to-delete", { cron: "* * * * *" });
      const deleted = await admin.deleteSchedule("to-delete");

      expect(deleted).toBe(true);

      // Verify it's gone
      await expect(
        admin.createSchedule("to-delete", { cron: "* * * * *" })
      ).resolves.toBeDefined();

      await admin[Symbol.asyncDispose]();
    });

    test("worker cannot delete schedules", async () => {
      await using s = scope();
      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        autoStart: false,
      });

      await expect(worker.deleteSchedule("test")).rejects.toThrow(
        "Cannot delete schedule from worker instance"
      );

      await worker[Symbol.asyncDispose]();
    });
  });

  describe("Worker Schedule Loading", () => {
    test("loads all schedules with handlers", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("a", { cron: "* * * * *" });
      await admin.createSchedule("b", { cron: "0 * * * *" });

      const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false });
      const handlers: string[] = [];
      
      const loaded = await worker.loadSchedules({
        handlerFactory: (name) => {
          handlers.push(name);
          return async () => {};
        },
      });

      expect(loaded).toHaveLength(2);
      expect(handlers).toContain("a");
      expect(handlers).toContain("b");

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });

    test("skips schedules without handlers", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("known", { cron: "* * * * *" });
      await admin.createSchedule("unknown", { cron: "0 * * * *" });

      const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false });
      const loaded = await worker.loadSchedules({
        handlerFactory: (name) => {
          if (name === "known") return async () => {};
          return null; // Skip unknown
        },
      });

      expect(loaded).toEqual(["known"]);

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });

    test("schedulesLoaded event emitted", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("test", { cron: "* * * * *" });

      const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false });
      const events: Array<{ count: number; names: string[] }> = [];
      
      worker.on("schedulesLoaded", (e) => events.push(e));
      
      await worker.loadSchedules({
        handlerFactory: () => async () => {},
      });

      expect(events).toHaveLength(1);
      expect(events[0].count).toBe(1);
      expect(events[0].names).toContain("test");

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });
  });

  describe("Job Execution", () => {
    test("worker executes scheduled jobs", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      // Admin creates schedule
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("exec-test", { cron: "* * * * *" });
      
      // Schedule a job
      const [_, result] = await admin.scheduleJob("exec-test", {});

      // Worker loads and executes
      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        storage,
        autoStart: false,
        checkInterval: 50,
      });

      let executed = false;
      await worker.loadSchedules({
        handlerFactory: (name) => {
          if (name === "exec-test") {
            return async () => { executed = true; };
          }
          return null;
        },
      });

      worker.start();
      await new Promise(r => setTimeout(r, 300));

      expect(executed).toBe(true);

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });

    test("job fails when schedule not loaded by worker", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      // Admin creates schedule and job
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("missing", { cron: "* * * * *" });
      const [_, result] = await admin.scheduleJob("missing", {});

      // Worker starts but doesn't load the schedule
      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        storage,
        autoStart: false,
        checkInterval: 50,
      });

      const events: Array<{ job: Job; permanent?: boolean }> = [];
      worker.on("jobFailed", (e) => events.push(e));

      worker.start();
      await new Promise(r => setTimeout(r, 300));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].permanent).toBe(true);

      const job = await storage.getJob(result!.jobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toContain("not found");

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });

    test("distributed locking prevents duplicate execution", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      // Admin creates schedule
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("lock-test", { cron: "* * * * *" });
      await admin.scheduleJob("lock-test", {});

      // Two workers
      const worker1 = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false, checkInterval: 50 });
      const worker2 = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage, autoStart: false, checkInterval: 50 });

      let executionCount = 0;
      const handler = async () => {
        executionCount++;
        await new Promise(r => setTimeout(r, 100));
      };

      await worker1.loadSchedules({ handlerFactory: () => handler });
      await worker2.loadSchedules({ handlerFactory: () => handler });

      worker1.start();
      worker2.start();
      await new Promise(r => setTimeout(r, 400));

      // Should only execute once despite two workers
      expect(executionCount).toBe(1);

      await admin[Symbol.asyncDispose]();
      await worker1[Symbol.asyncDispose]();
      await worker2[Symbol.asyncDispose]();
    });
  });

  describe("Stale Jobs", () => {
    test("stale jobs are skipped with SKIP behavior", async () => {
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage, autoStart: false });
      await admin.createSchedule("stale-test", { cron: "* * * * *" });

      // Create job scheduled 10 seconds ago
      const [_, result] = await admin.scheduleJob("stale-test", {});
      const job = await storage.getJob(result!.jobId);
      job!.runAt = new Date(Date.now() - 10000);
      await storage.saveJob(job!);

      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        storage,
        autoStart: false,
        checkInterval: 50,
        staleThreshold: 5000,
        staleJobBehavior: StaleJobBehavior.SKIP,
      });

      const events: Array<{ type: string }> = [];
      worker.on("jobSkipped", () => events.push({ type: "skipped" }));

      await worker.loadSchedules({ handlerFactory: () => async () => {} });
      worker.start();
      await new Promise(r => setTimeout(r, 300));

      expect(events.length).toBe(1);

      const updated = await storage.getJob(result!.jobId);
      expect(updated?.status).toBe("completed");

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });
  });

  describe("Lifecycle Events", () => {
    test("emits started/stopped events with role", async () => {
      await using s = scope();
      const events: Array<{ type: string; role: SchedulerRole }> = [];

      const worker = new Scheduler({
        role: SchedulerRole.WORKER,
        scope: s,
        autoStart: false,
      });

      worker.on("started", (e) => events.push({ type: "started", role: e.role }));
      worker.on("stopped", (e) => events.push({ type: "stopped", role: e.role }));

      worker.start();
      await worker.stop();

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("started");
      expect(events[0].role).toBe(SchedulerRole.WORKER);
      expect(events[1].type).toBe("stopped");
      expect(events[1].role).toBe(SchedulerRole.WORKER);

      await worker[Symbol.asyncDispose]();
    });
  });

  describe("Timezone Support", () => {
    test("schedule stores timezone", async () => {
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
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
      await using s = scope();
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
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
      await using s = scope();
      const storage = new InMemoryJobStorage();
      
      const admin = new Scheduler({
        role: SchedulerRole.ADMIN,
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
        role: SchedulerRole.WORKER,
        scope: s,
        storage,
        autoStart: false,
        checkInterval: 50,
      });

      let attempts = 0;
      const events: Array<{ type: string }> = [];
      
      worker.on("jobRetryScheduled", () => events.push({ type: "retry" }));
      worker.on("jobFailed", () => events.push({ type: "failed" }));

      await worker.loadSchedules({
        handlerFactory: () => async () => {
          attempts++;
          throw new Error("Always fails");
        },
      });

      worker.start();
      await new Promise(r => setTimeout(r, 500));

      expect(attempts).toBeGreaterThanOrEqual(1);

      await admin[Symbol.asyncDispose]();
      await worker[Symbol.asyncDispose]();
    });
  });
});
