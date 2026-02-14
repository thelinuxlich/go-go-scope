/**
 * Simple Example: Prometheus Metrics Export
 *
 * This example demonstrates exporting go-go-scope metrics in Prometheus format.
 * No Docker required - just shows the output format.
 */

import { exportMetrics, scope } from "../dist/index.mjs";

async function main() {
	console.log("🚀 go-go-scope Prometheus Metrics Example\n");

	// Create scope with metrics collection
	await using s = scope({
		metrics: true,
		name: "simple-example",
		concurrency: 3,
	});

	// Run some tasks
	console.log("Running tasks...");

	// Successful tasks
	await s.task(async () => {
		await new Promise((r) => setTimeout(r, 50));
		return "task-1";
	});

	await s.task(async () => {
		await new Promise((r) => setTimeout(r, 75));
		return "task-2";
	});

	// Task with retry
	await s.task(
		async () => {
			await new Promise((r) => setTimeout(r, 25));
			return "task-3";
		},
		{ retry: { maxRetries: 2 } },
	);

	// Parallel tasks
	await s.parallel([
		() => new Promise((r) => setTimeout(r, 30)),
		() => new Promise((r) => setTimeout(r, 40)),
		() => new Promise((r) => setTimeout(r, 50)),
	]);

	// Get metrics
	const metrics = s.metrics();
	if (!metrics) {
		console.log("❌ Metrics not available");
		return;
	}

	// Export in different formats
	console.log("\n" + "=".repeat(60));
	console.log("METRICS EXPORT");
	console.log("=".repeat(60));

	// JSON format
	console.log("\n📄 JSON Format:");
	console.log(exportMetrics(metrics, { format: "json" }));

	// Prometheus format
	console.log("\n📊 Prometheus Format:");
	const promOutput = exportMetrics(metrics, {
		format: "prometheus",
		prefix: "goscope",
	});
	console.log(promOutput);

	// OpenTelemetry format
	console.log("\n🔭 OpenTelemetry Format:");
	console.log(exportMetrics(metrics, { format: "otel", prefix: "goscope" }));

	// Summary
	console.log("\n" + "=".repeat(60));
	console.log("SUMMARY");
	console.log("=".repeat(60));
	console.log(`Tasks Spawned:     ${metrics.tasksSpawned}`);
	console.log(`Tasks Completed:   ${metrics.tasksCompleted}`);
	console.log(`Tasks Failed:      ${metrics.tasksFailed}`);
	console.log(`Avg Duration:      ${metrics.avgTaskDuration.toFixed(2)}ms`);
	console.log(`P95 Duration:      ${metrics.p95TaskDuration.toFixed(2)}ms`);
	console.log(`Resources Registered: ${metrics.resourcesRegistered}`);
	console.log(`Resources Disposed:   ${metrics.resourcesDisposed}`);

	console.log("\n✅ Done!");
}

main().catch(console.error);
