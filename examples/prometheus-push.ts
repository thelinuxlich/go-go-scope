/**
 * Simple Example: Pushing metrics to Prometheus Pushgateway
 *
 * This is the simplest way to get metrics into Prometheus.
 * Just run this after starting the monitoring stack.
 *
 * Setup:
 *   npm run prometheus:up
 *
 * Run:
 *   node --experimental-strip-types examples/prometheus-push.ts
 */

import { exportMetrics, scope } from "../dist/index.mjs";

const PUSHGATEWAY_URL = "http://localhost:9092";

async function pushMetrics(jobName: string, metrics: string): Promise<void> {
	const url = `${PUSHGATEWAY_URL}/metrics/job/${jobName}`;

	const response = await fetch(url, {
		method: "POST",
		body: metrics,
		headers: {
			"Content-Type": "text/plain; version=0.0.4",
		},
	});

	if (!response.ok) {
		throw new Error(`Push failed: ${response.status} ${response.statusText}`);
	}
	console.log(`✅ Pushed to ${url}`);
}

async function main() {
	console.log("🚀 Pushgateway Example\n");

	// Create scope with metrics
	await using s = scope({ metrics: true, name: "push-example" });

	// Run some tasks
	console.log("Running tasks...");
	await s.task(() => Promise.resolve("task-1"));
	await s.task(() => Promise.resolve("task-2"));
	await s.task(() => Promise.reject(new Error("simulated error")));

	// Get and export metrics
	const metrics = s.metrics();
	if (!metrics) {
		console.log("❌ No metrics available");
		return;
	}

	const promOutput = exportMetrics(metrics, {
		format: "prometheus",
		prefix: "goscope",
		includeTimestamps: false, // Required for Pushgateway
	});

	// Push to Pushgateway
	console.log("\n📤 Pushing metrics...");
	try {
		await pushMetrics("my-batch-job", promOutput);
		console.log("\n✅ Done! Check Prometheus at http://localhost:9091");
		console.log("   Query: goscope_tasks_completed_total");
	} catch (err) {
		console.error("\n❌ Failed to push metrics:");
		console.error(`   ${(err as Error).message}`);
		console.log("\n   Make sure Prometheus stack is running:");
		console.log("   npm run prometheus:up");
	}
}

main().catch(console.error);
