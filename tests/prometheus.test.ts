/**
 * Tests for Prometheus metrics export
 */

import { describe, test, expect } from "vitest";
import { exportMetrics, MetricsReporter, scope } from "../src/index.js";

describe("prometheus metrics export", () => {
	test("exports metrics in prometheus format", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));
		await s.task(() => Promise.resolve(2));

		const metrics = s.metrics();
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

	test("exports metrics in json format", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
		expect(metrics).toBeDefined();

		const jsonOutput = exportMetrics(metrics!, { format: "json" });
		const parsed = JSON.parse(jsonOutput);

		expect(parsed.tasksSpawned).toBe(1);
		expect(parsed.tasksCompleted).toBe(1);
	});

	test("exports metrics in otel format", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
		expect(metrics).toBeDefined();

		const otelOutput = exportMetrics(metrics!, { format: "otel" });
		const parsed = JSON.parse(otelOutput);

		expect(parsed.resourceMetrics).toBeDefined();
		expect(parsed.resourceMetrics[0].scopeMetrics).toBeDefined();
	});

	test("prometheus output includes all metric types", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));
		await s.task(() => Promise.reject(new Error("test error")));

		const metrics = s.metrics();
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
		await using s = scope({ metrics: true });
		const exports: string[] = [];

		const reporter = new MetricsReporter(s, {
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

	test("metrics include timestamps", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "test",
		});

		// Prometheus format includes timestamps
		const lines = promOutput.split("\n");
		const metricLine = lines.find((l) =>
			l.startsWith("test_tasks_spawned_total"),
		);
		expect(metricLine).toBeDefined();

		// Should have timestamp (number at end)
		const parts = metricLine!.split(" ");
		expect(parts.length).toBeGreaterThanOrEqual(2);
	});

	test("custom prefix is applied", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
		const promOutput = exportMetrics(metrics!, {
			format: "prometheus",
			prefix: "myapp_scope",
		});

		expect(promOutput).toContain("myapp_scope_tasks_spawned_total");
		expect(promOutput).toContain("myapp_scope_tasks_completed_total");
	});

	test("reporter can be stopped and started", async () => {
		await using s = scope({ metrics: true });
		let exportCount = 0;

		const reporter = new MetricsReporter(s, {
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

	test("prometheus export without timestamps", async () => {
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
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
		await using s = scope({ metrics: true });

		await s.task(() => Promise.resolve(1));

		const metrics = s.metrics();
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
});
