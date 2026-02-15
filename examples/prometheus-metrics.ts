/**
 * Example: Sending go-go-scope metrics to Prometheus
 *
 * This example demonstrates:
 * 1. Creating a scope with metrics collection enabled
 * 2. Running various tasks with different configurations
 * 3. Exporting metrics in Prometheus format
 * 4. Pushing metrics to Prometheus Pushgateway
 * 5. Exposing metrics via HTTP for Prometheus scraping
 *
 * Setup:
 *   npm run prometheus:up
 *
 * Run:
 *   npm run example:prometheus
 *
 * View metrics:
 *   Prometheus UI: http://localhost:9091
 *   Pushgateway UI: http://localhost:9092
 *   Grafana UI: http://localhost:3001 (admin/admin)
 */

import { createServer } from "http";
import { exportMetrics, MetricsReporter, scope } from "../dist/index.mjs";

// Configuration
const METRICS_PORT = 9095; // Local port to expose metrics for Prometheus scraping
const PUSHGATEWAY_URL = "http://localhost:9092"; // Prometheus Pushgateway

// Simulated work functions
async function fetchUser(id: number): Promise<{ id: number; name: string }> {
	await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
	if (Math.random() < 0.1) throw new Error(`User ${id} not found`);
	return { id, name: `User ${id}` };
}

async function fetchOrders(userId: number): Promise<{ orderId: number }[]> {
	await new Promise((r) => setTimeout(r, 30 + Math.random() * 70));
	return [{ orderId: 1 }, { orderId: 2 }];
}

async function processOrder(orderId: number): Promise<void> {
	await new Promise((r) => setTimeout(r, 20 + Math.random() * 50));
	if (Math.random() < 0.05) throw new Error(`Order ${orderId} processing failed`);
}

/**
 * Push metrics to Prometheus Pushgateway
 */
async function pushMetrics(
	jobName: string,
	metrics: string,
): Promise<void> {
	const url = `${PUSHGATEWAY_URL}/metrics/job/${jobName}`;

	try {
		const response = await fetch(url, {
			method: "POST",
			body: metrics,
			headers: {
				"Content-Type": "text/plain; version=0.0.4",
			},
		});

		if (!response.ok) {
			console.error(
				`❌ Failed to push metrics: ${response.status} ${response.statusText}`,
			);
		} else {
			console.log(`✅ Metrics pushed to Pushgateway (${url})`);
		}
	} catch (error) {
		console.error(`❌ Error pushing metrics: ${(error as Error).message}`);
		console.log(`   Make sure Pushgateway is running: npm run prometheus:up`);
	}
}

/**
 * Delete metrics from Pushgateway
 */
async function deleteMetrics(jobName: string): Promise<void> {
	const url = `${PUSHGATEWAY_URL}/metrics/job/${jobName}`;

	try {
		const response = await fetch(url, { method: "DELETE" });
		if (response.ok) {
			console.log(`🗑️  Cleaned up metrics from Pushgateway`);
		}
	} catch {
		// Ignore cleanup errors
	}
}

async function simulateWorkload() {
	console.log("🚀 Starting workload simulation...\n");

	// Create scope with metrics collection enabled
	await using s = scope({
		metrics: true,
		name: "prometheus-example",
		concurrency: 5, // Limit concurrent operations
	});

	// Simulate various workloads
	console.log("1️⃣ Running sequential tasks...");
	for (let i = 1; i <= 3; i++) {
		await s.task(() => fetchUser(i));
	}

	console.log("2️⃣ Running parallel tasks with concurrency limit...");
	const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	await s.parallel(
		userIds.map((id) => () => fetchUser(id)),
		{ continueOnError: true },
	);

	console.log("3️⃣ Running tasks with retry logic...");
	await s.task(
		() => fetchUser(999),
		{
			retry: {
				maxRetries: 3,
				delay: 100,
				onRetry: (err, attempt) => {
					console.log(
						`   Retry ${attempt} after error: ${(err as Error).message}`,
					);
				},
			},
		},
	);

	console.log("4️⃣ Running tasks with timeout...");
	await s.task(
		async ({ signal }) => {
			await new Promise((r) => setTimeout(r, 500));
			return "completed";
		},
		{ timeout: 100 }, // This will timeout
	);

	console.log("5️⃣ Using channels for worker pattern...");
	const workCh = s.channel<number>(10);
	const resultCh = s.channel<{ id: number; success: boolean }>(10);

	// Workers
	for (let w = 0; w < 3; w++) {
		s.task(async () => {
			for await (const orderId of workCh) {
				if (orderId === undefined) break;
				try {
					await processOrder(orderId);
					await resultCh.send({ id: orderId, success: true });
				} catch {
					await resultCh.send({ id: orderId, success: false });
				}
			}
		});
	}

	// Producer
	s.task(async () => {
		for (let i = 1; i <= 10; i++) {
			await workCh.send(i);
		}
		workCh.close();
	});

	// Collector
	await s.task(async () => {
		let completed = 0;
		let failed = 0;
		for await (const result of resultCh) {
			if (result === undefined) break;
			if (result.success) completed++;
			else failed++;
		}
		console.log(`   Processed: ${completed} completed, ${failed} failed`);
	});

	// Wait for channel processing to complete
	await new Promise((r) => setTimeout(r, 200));

	// Get final metrics
	console.log("\n6️⃣ Final Metrics:");
	const metrics = s.metrics();
	if (metrics) {
		console.log(`   Tasks Spawned: ${metrics.tasksSpawned}`);
		console.log(`   Tasks Completed: ${metrics.tasksCompleted}`);
		console.log(`   Tasks Failed: ${metrics.tasksFailed}`);
		console.log(`   Avg Duration: ${metrics.avgTaskDuration.toFixed(2)}ms`);
		console.log(`   P95 Duration: ${metrics.p95TaskDuration.toFixed(2)}ms`);

		// Export and push to Prometheus
		console.log("\n📤 Pushing metrics to Prometheus...");
		const promOutput = exportMetrics(metrics, {
			format: "prometheus",
			prefix: "goscope",
			includeTimestamps: false, // Required for Pushgateway
		});

		// Push to Pushgateway
		await pushMetrics("go-go-scope-example", promOutput);

		return promOutput;
	}

	return null;
}

/**
 * Start HTTP server for Prometheus scraping
 */
async function startMetricsServer(
	getMetrics: () => string | null,
): Promise<ReturnType<typeof createServer>> {
	const server = createServer((req, res) => {
		if (req.url === "/metrics") {
			const metrics = getMetrics();
			if (metrics) {
				res.writeHead(200, { "Content-Type": "text/plain" });
				res.end(metrics);
			} else {
				res.writeHead(503);
				res.end("Metrics not available");
			}
		} else {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`
				<h1>go-go-scope Metrics Server</h1>
				<p><a href="/metrics">View Metrics</a></p>
			`);
		}
	});

	return new Promise((resolve, reject) => {
		server.listen(METRICS_PORT, () => {
			console.log(
				`\n🌐 Metrics HTTP server running at http://localhost:${METRICS_PORT}/metrics`,
			);
			console.log("   (Prometheus can scrape from this endpoint)");
			resolve(server);
		});
		server.on("error", reject);
	});
}

async function main() {
	console.log("=".repeat(60));
	console.log("go-go-scope Prometheus Metrics Example");
	console.log("=".repeat(60));
	console.log("\n📋 This example will:");
	console.log("   1. Run various workload simulations");
	console.log("   2. Export metrics in Prometheus format");
	console.log("   3. Push metrics to Pushgateway");
	console.log("   4. Expose metrics via HTTP for scraping\n");

	let metricsOutput: string | null = null;
	let metricsServer: ReturnType<typeof createServer> | null = null;

	try {
		// Run the workload and get metrics
		metricsOutput = await simulateWorkload();

		// Start HTTP server for Prometheus scraping
		metricsServer = await startMetricsServer(() => metricsOutput);

		console.log("\n" + "=".repeat(60));
		console.log("Monitoring Setup:");
		console.log("  Prometheus:    http://localhost:9091");
		console.log("  Pushgateway:   http://localhost:9092");
		console.log("  Grafana:       http://localhost:3001 (admin/admin)");
		console.log("  This app:      http://localhost:9095/metrics");
		console.log("=".repeat(60));

		console.log("\n📊 In Prometheus UI, query for:");
		console.log("   - goscope_tasks_completed_total");
		console.log("   - goscope_task_duration_avg_seconds");
		console.log("   - rate(goscope_tasks_failed_total[5m])");

		console.log("\n⏳ Keeping metrics server alive for 60 seconds...");
		console.log("   Press Ctrl+C to stop early\n");

		// Keep server alive for a while so Prometheus can scrape
		await new Promise((resolve) => setTimeout(resolve, 60000));
	} catch (error) {
		console.error("\n❌ Error:", error);
	} finally {
		// Cleanup
		console.log("\n🧹 Cleaning up...");
		if (metricsServer) {
			metricsServer.close();
			console.log("   HTTP server stopped");
		}
		await deleteMetrics("go-go-scope-example");
		console.log("   👋 Goodbye!");
	}
}

main().catch(console.error);
