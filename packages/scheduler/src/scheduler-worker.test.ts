/**
 * Tests for scheduler with worker option in onSchedule
 */

import { describe, expect, test } from "vitest";
import { Scheduler } from "./scheduler.js";
import { InMemoryJobStorage } from "./types.js";

describe("Scheduler onSchedule with worker option", () => {
	test("registers handler without worker option (default)", async () => {
		await using scheduler = new Scheduler({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		scheduler.onSchedule("test-schedule", async (_job) => {
			// Handler registered
		});

		expect(scheduler["handlers"].has("test-schedule")).toBe(true);
		expect(scheduler["handlerOptions"].get("test-schedule")?.worker).toBeUndefined();
	});

	test("registers handler with worker option enabled", async () => {
		await using scheduler = new Scheduler({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		scheduler.onSchedule("cpu-intensive", async (_job) => {
			// Handler registered
		}, { worker: true });

		expect(scheduler["handlers"].has("cpu-intensive")).toBe(true);
		expect(scheduler["handlerOptions"].get("cpu-intensive")?.worker).toBe(true);
	});

	test("registers handler with worker option disabled", async () => {
		await using scheduler = new Scheduler({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		scheduler.onSchedule("regular-schedule", async (_job) => {
			// Regular handler
		}, { worker: false });

		expect(scheduler["handlerOptions"].get("regular-schedule")?.worker).toBe(false);
	});

	test("offSchedule removes handler and options", async () => {
		await using scheduler = new Scheduler({
			storage: new InMemoryJobStorage(),
			autoStart: false,
		});

		scheduler.onSchedule("test-schedule", async (_job) => {}, { worker: true });
		
		expect(scheduler["handlers"].has("test-schedule")).toBe(true);
		expect(scheduler["handlerOptions"].has("test-schedule")).toBe(true);

		scheduler.offSchedule("test-schedule");

		expect(scheduler["handlers"].has("test-schedule")).toBe(false);
		expect(scheduler["handlerOptions"].has("test-schedule")).toBe(false);
	});

	test("different workers can use different options for same schedule", async () => {
		// This test verifies that worker options are per-handler, not per-schedule
		const storage = new InMemoryJobStorage();
		
		await using scheduler1 = new Scheduler({
			storage,
			autoStart: false,
		});
		
		await using scheduler2 = new Scheduler({
			storage,
			autoStart: false,
		});

		// Worker 1 uses worker threads
		scheduler1.onSchedule("process-data", async (_job) => {}, { worker: true });
		
		// Worker 2 uses main thread
		scheduler2.onSchedule("process-data", async (_job) => {}, { worker: false });

		expect(scheduler1["handlerOptions"].get("process-data")?.worker).toBe(true);
		expect(scheduler2["handlerOptions"].get("process-data")?.worker).toBe(false);
	});
});
