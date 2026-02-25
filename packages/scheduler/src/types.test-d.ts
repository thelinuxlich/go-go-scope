/**
 * Type-level tests for Scheduler typed schedules
 *
 * These tests verify TypeScript type inference works correctly.
 * They don't need to run - just need to pass type checking.
 */

import { describe, expectTypeOf, it } from "vitest";
import { createScheduler, Scheduler } from "./scheduler.js";
import type { JobPayload, ScheduleDefinitions } from "./types.js";
import { InMemoryJobStorage } from "./types.js";

describe("Scheduler type safety", () => {
	// Define test schedule types
	type TestSchedules = {
		"send-email": { to: string; subject: string; body: string };
		"process-payment": { amount: number; currency: string };
		"cleanup-temp-files": { maxAge: number };
	};

	it("should infer payload types in onSchedule handler", () => {
		const scheduler = new Scheduler<TestSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Handler for 'send-email' should have typed payload
		scheduler.onSchedule("send-email", async (job) => {
			expectTypeOf(job.payload.to).toBeString();
			expectTypeOf(job.payload.subject).toBeString();
			expectTypeOf(job.payload.body).toBeString();

			// These should cause type errors if uncommented:
			// @ts-expect-error - 'amount' doesn't exist on send-email payload
			const _amount = job.payload.amount;
		});

		// Handler for 'process-payment' should have different typed payload
		scheduler.onSchedule("process-payment", async (job) => {
			expectTypeOf(job.payload.amount).toBeNumber();
			expectTypeOf(job.payload.currency).toBeString();

			// @ts-expect-error - 'to' doesn't exist on process-payment payload
			const _to = job.payload.to;
		});

		// Cleanup
		scheduler.stop();
	});

	it("should only allow valid schedule names in onSchedule", () => {
		const scheduler = new Scheduler<TestSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Valid schedule names should work
		scheduler.onSchedule("send-email", async () => {});
		scheduler.onSchedule("process-payment", async () => {});
		scheduler.onSchedule("cleanup-temp-files", async () => {});

		// @ts-expect-error - 'invalid-schedule' is not a valid schedule name
		scheduler.onSchedule("invalid-schedule", async () => {});

		scheduler.stop();
	});

	it("should infer payload types in triggerSchedule", () => {
		const scheduler = new Scheduler<TestSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Valid payload for 'send-email'
		scheduler.triggerSchedule("send-email", {
			to: "user@example.com",
			subject: "Hello",
			body: "World",
		});

		// Valid payload for 'process-payment'
		scheduler.triggerSchedule("process-payment", {
			amount: 100,
			currency: "USD",
		});

		// @ts-expect-error - missing required 'subject' field
		scheduler.triggerSchedule("send-email", {
			to: "user@example.com",
			body: "World",
		});

		scheduler.triggerSchedule("process-payment", {
			amount: 100,
			currency: "USD",
		});

		scheduler.stop();
	});

	it("should infer payload types in scheduleJob", () => {
		const scheduler = new Scheduler<TestSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Valid payload
		scheduler.scheduleJob("cleanup-temp-files", {
			maxAge: 86400,
		});

		scheduler.scheduleJob("cleanup-temp-files", {
			maxAge: 86400,
		});

		scheduler.stop();
	});

	it("should maintain backward compatibility with default type", () => {
		// Scheduler without explicit type parameter should accept any string name
		const scheduler = new Scheduler({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Should accept any string
		scheduler.onSchedule("any-schedule-name", async (job) => {
			// Payload should be generic JobPayload
			expectTypeOf(job.payload).toEqualTypeOf<JobPayload>();
		});

		scheduler.triggerSchedule("any-schedule-name", { any: "payload" });
		scheduler.scheduleJob("any-schedule-name", { any: "payload" });

		scheduler.stop();
	});

	it("should work with createScheduler factory function", () => {
		const scheduler = createScheduler<TestSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// Type inference should work the same as with constructor
		scheduler.onSchedule("send-email", async (job) => {
			expectTypeOf(job.payload.to).toBeString();
		});

		scheduler.triggerSchedule("process-payment", {
			amount: 50,
			currency: "EUR",
		});

		scheduler.stop();
	});
});

describe("Type helpers", () => {
	it("ScheduleDefinitions should accept valid schedule type definitions", () => {
		// Valid schedule definitions
		type ValidSchedules = {
			"job-a": { data: string };
			"job-b": { count: number };
		};

		// This should compile without errors
		const _valid: ScheduleDefinitions = {} as ValidSchedules;
		// Use _valid to avoid unused variable warning
		// biome-ignore lint/correctness/noUnusedVariables: Type checking only
		void _valid;
	});
});

describe("Scheduler method type inference", () => {
	type AppSchedules = {
		"daily-report": { reportType: string };
		"weekly-cleanup": { retentionDays: number };
	};

	it("should correctly type schedule management methods", async () => {
		const scheduler = new Scheduler<AppSchedules>({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		// createSchedule should still accept any string (for defining new schedules)
		const schedule = await scheduler.createSchedule("new-schedule", {
			cron: "0 9 * * *",
		});

		// Return type should be Schedule
		expectTypeOf(schedule.name).toBeString();
		expectTypeOf(schedule.cron).toEqualTypeOf<string | undefined>();

		// Other methods should work with string names
		await scheduler.deleteSchedule("any-name");
		await scheduler.pauseSchedule("any-name");
		await scheduler.resumeSchedule("any-name");
		await scheduler.disableSchedule("any-name");
		await scheduler.getSchedule("any-name");
		await scheduler.getScheduleStats("any-name");

		scheduler.stop();
	});
});
