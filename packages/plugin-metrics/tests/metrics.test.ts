/**
 * Tests for @go-go-scope/plugin-metrics
 */
import { describe, test, expect } from "vitest";
import { scope } from "go-go-scope";
import {
	metricsPlugin,
	exportMetrics,
	MetricsReporter,
} from "../src/index.js";

describe("metrics plugin", () => {
	test("returns undefined when metrics plugin not installed", async () => {
		await using s = scope();
		expect(s.metrics?.()).toBeUndefined();
	});

	test("tracks task metrics", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(async () => "success1");
		await s.task(async () => {
			throw new Error("failure");
		});
		await s.task(async () => "success2");

		const metrics = s.metrics?.();

		expect(metrics).toBeDefined();
		expect(metrics?.tasksSpawned).toBe(3);
		expect(metrics?.tasksCompleted).toBe(2);
		expect(metrics?.tasksFailed).toBe(1);
	});

	test("tracks resource metrics", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		s.provide(
			"service1",
			() => ({ value: 1 }),
			() => {},
		);
		s.provide(
			"service2",
			() => ({ value: 2 }),
			() => {},
		);

		// Force disposal by ending scope
		await s[Symbol.asyncDispose]();

		const metrics = s.metrics?.();
		expect(metrics?.resourcesRegistered).toBe(2);
		expect(metrics?.resourcesDisposed).toBe(2);
	});

	test("calculates duration statistics", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(async () => {
			await new Promise((r) => setTimeout(r, 10));
			return "result";
		});

		const metrics = s.metrics?.();
		expect(metrics?.avgTaskDuration).toBeGreaterThan(0);
		expect(metrics?.p95TaskDuration).toBeGreaterThan(0);
	});

	test("exports metrics in json format", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics?.();
		expect(metrics).toBeDefined();

		const jsonOutput = exportMetrics(metrics!, { format: "json" });
		const parsed = JSON.parse(jsonOutput);

		expect(parsed.tasksSpawned).toBe(1);
		expect(parsed.tasksCompleted).toBe(1);
	});

	test("exports metrics in prometheus format", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));
		await s.task(() => Promise.resolve(2));

		const metrics = s.metrics?.();
		expect(metrics).toBeDefined();

		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "test",
		});

		expect(promOutput).toContain("# HELP test_tasks_spawned_total");
		expect(promOutput).toContain("# TYPE test_tasks_spawned_total counter");
		expect(promOutput).toContain("test_tasks_spawned_total 2");
		expect(promOutput).toContain("test_tasks_completed_total 2");
	});

	test("exports metrics in otel format", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics?.();
		expect(metrics).toBeDefined();

		const otelOutput = exportMetrics(metrics!, { format: "otel" });
		const parsed = JSON.parse(otelOutput);

		expect(parsed.resourceMetrics).toBeDefined();
		expect(parsed.resourceMetrics[0].scopeMetrics).toBeDefined();
	});

	test("prometheus output includes all metric types", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));
		await s.task(() => Promise.reject(new Error("test error")));

		const metrics = s.metrics?.();
		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "goscope",
		});

		// Check for all expected metrics
		expect(promOutput).toContain("goscope_tasks_spawned_total");
		expect(promOutput).toContain("goscope_tasks_completed_total");
		expect(promOutput).toContain("goscope_tasks_failed_total");
		expect(promOutput).toContain("goscope_task_duration_seconds_total");
		expect(promOutput).toContain("goscope_task_duration_avg_seconds");
		expect(promOutput).toContain("goscope_task_duration_p95_seconds");
		expect(promOutput).toContain("goscope_resources_registered_total");
		expect(promOutput).toContain("goscope_resources_disposed_total");
	});

	test("metrics reporter calls onExport", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });
		const exports: string[] = [];

		// Get the collector from scope
		const collector = (s as unknown as { _metricsCollector?: { getMetrics: () => unknown } })._metricsCollector;
		expect(collector).toBeDefined();

		const reporter = new MetricsReporter(collector!, {
			format: "prometheus",
			interval: 100,
			onExport: (data) => {
				exports.push(data);
			},
		});

		// Run a task
		await s.task(() => Promise.resolve(1));

		// Wait for at least one export
		await new Promise((r) => setTimeout(r, 150));

		reporter.stop();

		expect(exports.length).toBeGreaterThan(0);
		expect(exports[0]).toContain("goscope");
	});

	test("custom prefix is applied", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics?.();
		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "myapp_scope",
		});

		expect(promOutput).toContain("myapp_scope_tasks_spawned_total");
		expect(promOutput).toContain("myapp_scope_tasks_completed_total");
	});

	test("prometheus export without timestamps", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics?.();
		expect(metrics).toBeDefined();

		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "test",
			includeTimestamps: false,
		});

		// Should not have timestamps (no large numbers at end of lines)
		const lines = promOutput.split("\n");
		const metricLine = lines.find((l) => l.startsWith("test_tasks_spawned_total"));
		expect(metricLine).toBeDefined();
		// Line should end with just the value, no timestamp
		expect(metricLine).toMatch(/^test_tasks_spawned_total \d+$/);
	});

	test("prometheus export with timestamps (default)", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics?.();
		expect(metrics).toBeDefined();

		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "test",
			// includeTimestamps defaults to true
		});

		// Should have timestamps
		const lines = promOutput.split("\n");
		const metricLine = lines.find((l) => l.startsWith("test_tasks_spawned_total"));
		expect(metricLine).toBeDefined();
		// Line should have timestamp (large number)
		expect(metricLine).toMatch(/^test_tasks_spawned_total \d+ \d{13,}$/);
	});

	test("reporter can be stopped and started", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });
		let exportCount = 0;

		const collector = (s as unknown as { _metricsCollector?: { getMetrics: () => unknown } })._metricsCollector;
		expect(collector).toBeDefined();

		const reporter = new MetricsReporter(collector!, {
			format: "json",
			interval: 50,
			onExport: () => {
				exportCount++;
			},
		});

		// Should be exporting
		await new Promise((r) => setTimeout(r, 120));
		expect(exportCount).toBeGreaterThan(0);

		// Stop and wait
		reporter.stop();
		const countAfterStop = exportCount;
		await new Promise((r) => setTimeout(r, 100));
		expect(exportCount).toBe(countAfterStop);

		// Restart
		reporter.start();
		await new Promise((r) => setTimeout(r, 70));
		expect(exportCount).toBeGreaterThan(countAfterStop);

		reporter.stop();
	});

	test("counter metric works", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		const counter = s.counter?.("requests");
		expect(counter).toBeDefined();

		counter?.inc();
		expect(counter?.value()).toBe(1);

		counter?.inc(5);
		expect(counter?.value()).toBe(6);

		counter?.reset();
		expect(counter?.value()).toBe(0);
	});

	test("gauge metric works", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		const gauge = s.gauge?.("connections");
		expect(gauge).toBeDefined();

		gauge?.set(10);
		expect(gauge?.value()).toBe(10);

		gauge?.inc();
		expect(gauge?.value()).toBe(11);

		gauge?.dec();
		expect(gauge?.value()).toBe(10);

		gauge?.inc(5);
		expect(gauge?.value()).toBe(15);

		gauge?.dec(3);
		expect(gauge?.value()).toBe(12);
	});

	test("histogram metric works", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		const histogram = s.histogram?.("response_times");
		expect(histogram).toBeDefined();

		histogram?.record(10);
		histogram?.record(20);
		histogram?.record(30);
		histogram?.record(40);
		histogram?.record(50);

		const snapshot = histogram?.snapshot();
		expect(snapshot).toBeDefined();
		expect(snapshot?.count).toBe(5);
		expect(snapshot?.min).toBe(10);
		expect(snapshot?.max).toBe(50);
		expect(snapshot?.avg).toBe(30);
		expect(snapshot?.p50).toBeGreaterThanOrEqual(10);
		expect(snapshot?.p95).toBeGreaterThanOrEqual(10);
	});

	test("same counter name returns same instance", async () => {
		await using s = scope({ plugins: [metricsPlugin()] });

		const counter1 = s.counter?.("requests");
		const counter2 = s.counter?.("requests");

		expect(counter1).toBe(counter2);
	});
});
