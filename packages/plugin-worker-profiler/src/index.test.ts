import { describe, expect, test } from "vitest";
import { WorkerProfiler, workerProfilerPlugin } from "./index.js";

describe("WorkerProfiler", () => {
	test("tracks task execution", () => {
		const profiler = new WorkerProfiler();

		profiler.startTask("task-1", "./math.js", "compute", 1024);

		// Simulate some work
		const start = Date.now();
		while (Date.now() - start < 10) {} // 10ms delay

		profiler.endTask("task-1", true);

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(1);
		expect(report.tasks[0]!.taskId).toBe("task-1");
		expect(report.tasks[0]!.module).toBe("./math.js");
		expect(report.tasks[0]!.export).toBe("compute");
		expect(report.tasks[0]!.succeeded).toBe(true);
		expect(report.tasks[0]!.duration).toBeGreaterThan(0);
		expect(report.statistics.totalTasks).toBe(1);
		expect(report.statistics.successfulTasks).toBe(1);

		profiler.dispose();
	});

	test("tracks failed tasks", () => {
		const profiler = new WorkerProfiler();

		profiler.startTask("task-1", "./math.js", "compute");
		profiler.endTask("task-1", false, new Error("Computation failed"));

		const report = profiler.getReport();
		expect(report.tasks[0]!.succeeded).toBe(false);
		expect(report.tasks[0]!.error).toBe("Computation failed");
		expect(report.statistics.failedTasks).toBe(1);

		profiler.dispose();
	});

	test("calculates statistics correctly", () => {
		const profiler = new WorkerProfiler();

		// Add 3 tasks
		for (let i = 0; i < 3; i++) {
			profiler.startTask(`task-${i}`, "./math.js", "compute");
			profiler.endTask(`task-${i}`, i < 2); // 2 succeed, 1 fails
		}

		const report = profiler.getReport();
		expect(report.statistics.totalTasks).toBe(3);
		expect(report.statistics.successfulTasks).toBe(2);
		expect(report.statistics.failedTasks).toBe(1);
		expect(report.statistics.avgDuration).toBeGreaterThan(0);

		profiler.dispose();
	});

	test("limits max profiles", () => {
		const profiler = new WorkerProfiler({ maxProfiles: 5 });

		// Add 10 tasks
		for (let i = 0; i < 10; i++) {
			profiler.startTask(`task-${i}`, "./math.js", "compute");
			profiler.endTask(`task-${i}`, true);
		}

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(5); // Only 5 kept

		profiler.dispose();
	});

	test("filters profiles by module", () => {
		const profiler = new WorkerProfiler();

		profiler.startTask("task-1", "./math.js", "add");
		profiler.endTask("task-1", true);

		profiler.startTask("task-2", "./string.js", "concat");
		profiler.endTask("task-2", true);

		const mathProfiles = profiler.getModuleProfiles("./math.js");
		expect(mathProfiles).toHaveLength(1);
		expect(mathProfiles[0]!.export).toBe("add");

		profiler.dispose();
	});

	test("filters profiles by export", () => {
		const profiler = new WorkerProfiler();

		profiler.startTask("task-1", "./math.js", "add");
		profiler.endTask("task-1", true);

		profiler.startTask("task-2", "./math.js", "multiply");
		profiler.endTask("task-2", true);

		const addProfiles = profiler.getExportProfiles("./math.js", "add");
		expect(addProfiles).toHaveLength(1);
		expect(addProfiles[0]!.export).toBe("add");

		profiler.dispose();
	});

	test("returns empty report when no tasks", () => {
		const profiler = new WorkerProfiler();

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(0);
		expect(report.statistics.totalTasks).toBe(0);
		expect(report.statistics.avgDuration).toBe(0);

		profiler.dispose();
	});

	test("clear removes all profiles", () => {
		const profiler = new WorkerProfiler();

		profiler.startTask("task-1", "./math.js", "compute");
		profiler.endTask("task-1", true);

		expect(profiler.getReport().tasks).toHaveLength(1);

		profiler.clear();

		expect(profiler.getReport().tasks).toHaveLength(0);

		profiler.dispose();
	});
});

describe("workerProfilerPlugin", () => {
	test("creates plugin with correct name", () => {
		const plugin = workerProfilerPlugin();
		expect(plugin.name).toBe("workerProfiler");
	});

	test("accepts custom options", () => {
		const plugin = workerProfilerPlugin({
			trackCpuTime: false,
			trackMemory: false,
			maxProfiles: 100,
		});
		expect(plugin.name).toBe("workerProfiler");
	});
});
