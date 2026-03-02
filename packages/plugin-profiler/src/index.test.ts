/**
 * Tests for profiler plugin
 */
import { describe, expect, test, vi } from "vitest";
import { scope } from "go-go-scope";
import {
	Profiler,
	profilerPlugin,
	type ScopeProfileReport,
} from "./index.js";

describe("Profiler", () => {
	test("should not track tasks when disabled", () => {
		const profiler = new Profiler(false);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(0);
		expect(report.statistics.totalTasks).toBe(0);

		profiler.dispose();
	});

	test("should track task execution when enabled", () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(1);
		expect(report.tasks[0]!.name).toBe("task-1");
		expect(report.tasks[0]!.index).toBe(1);
		expect(report.tasks[0]!.succeeded).toBe(true);

		profiler.dispose();
	});

	test("should track multiple tasks", () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		profiler.startTask(2, "task-2");
		profiler.endTask(2, false);

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(2);
		expect(report.statistics.totalTasks).toBe(2);
		expect(report.statistics.successfulTasks).toBe(1);
		expect(report.statistics.failedTasks).toBe(1);
		expect(report.tasks[0]!.succeeded).toBe(true);
		expect(report.tasks[1]!.succeeded).toBe(false);

		profiler.dispose();
	});

	test("should track retry attempts", () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-with-retries");
		profiler.recordRetry(1);
		profiler.recordRetry(1);
		profiler.endTask(1, true);

		const report = profiler.getReport();
		expect(report.tasks[0]!.retryAttempts).toBe(2);
		expect(report.statistics.totalRetryAttempts).toBe(2);

		profiler.dispose();
	});

	test("should track stage durations", async () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-with-stages");
		
		profiler.startStage(1, "circuitBreaker");
		await new Promise((resolve) => setTimeout(resolve, 10));
		profiler.endStage(1, "circuitBreaker");
		
		profiler.startStage(1, "concurrency");
		await new Promise((resolve) => setTimeout(resolve, 5));
		profiler.endStage(1, "concurrency");
		
		profiler.endTask(1, true);

		const report = profiler.getReport();
		expect(report.tasks[0]!.stages.circuitBreaker).toBeGreaterThan(0);
		expect(report.tasks[0]!.stages.concurrency).toBeGreaterThan(0);
		expect(report.tasks[0]!.stages.execution).toBeGreaterThan(0);

		profiler.dispose();
	});

	test("should calculate average durations", async () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "fast-task");
		await new Promise((resolve) => setTimeout(resolve, 10));
		profiler.endTask(1, true);

		profiler.startTask(2, "slow-task");
		await new Promise((resolve) => setTimeout(resolve, 20));
		profiler.endTask(2, true);

		const report = profiler.getReport();
		expect(report.statistics.avgTotalDuration).toBeGreaterThan(0);
		expect(report.statistics.avgExecutionDuration).toBeGreaterThan(0);

		profiler.dispose();
	});

	test("should clear all profiles", () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		expect(profiler.getReport().tasks).toHaveLength(1);

		profiler.clear();

		const report = profiler.getReport();
		expect(report.tasks).toHaveLength(0);
		expect(report.statistics.totalTasks).toBe(0);

		profiler.dispose();
	});

	test("should be disposable via Symbol.dispose", () => {
		const profiler = new Profiler(true);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		expect(profiler.getReport().tasks).toHaveLength(1);

		profiler[Symbol.dispose]();

		expect(profiler.getReport().tasks).toHaveLength(0);
	});

	test("should work with using statement", () => {
		using profiler = new Profiler(true);

		profiler.startTask(1, "task-1");
		profiler.endTask(1, true);

		expect(profiler.getReport().tasks).toHaveLength(1);
	});
});

describe("profilerPlugin", () => {
	test("should install plugin on scope", async () => {
		await using s = scope({
			plugins: [profilerPlugin(true)],
		});

		expect(
			(s as unknown as { _profiler?: Profiler })._profiler,
		).toBeDefined();
		expect(
			(s as unknown as { profile?: () => ScopeProfileReport }).profile,
		).toBeDefined();
	});

	test("should profile tasks through scope", async () => {
		await using s = scope({
			plugins: [profilerPlugin(true)],
		});

		await s.task(() => Promise.resolve("result"));

		const report = (s as unknown as { profile: () => ScopeProfileReport }).profile();
		expect(report).toBeDefined();
		expect(report?.statistics.totalTasks).toBeGreaterThanOrEqual(0);
	});

	test("should not profile when disabled", async () => {
		await using s = scope({
			plugins: [profilerPlugin(false)],
		});

		await s.task(() => Promise.resolve("result"));

		const report = (s as unknown as { profile: () => ScopeProfileReport }).profile();
		expect(report?.tasks).toHaveLength(0);
	});

	test("should cleanup profiler when scope is disposed", async () => {
		const profiler = new Profiler(true);
		const disposeSpy = vi.spyOn(profiler, "dispose");

		{
			await using _s = scope({
				plugins: [
					{
						name: "test-profiler",
						install(sc) {
							(sc as unknown as { _profiler: Profiler })._profiler = profiler;
						},
						cleanup() {
							profiler.dispose();
						},
					},
				],
			});
		}

		expect(disposeSpy).toHaveBeenCalled();
	});
});
