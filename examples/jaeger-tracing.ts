/**
 * Example: OpenTelemetry tracing with Jaeger
 *
 * This example demonstrates go-go-scope's OpenTelemetry integration
 * by sending traces to a local Jaeger instance.
 *
 * Usage:
 *   1. Start Jaeger: docker compose up -d
 *   2. Run this example: npm run example:jaeger
 *   3. Open http://<wsl-ip>:16687/search to view traces (WSL users: use the IP shown in output)
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import pkg from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";

const { resourceFromAttributes } = pkg;

import { execSync } from "node:child_process";
import { trace } from "@opentelemetry/api";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { scope } from "../dist/index.mjs";

// Detect WSL environment and get the correct IP for Windows browser access
// In WSL2, Windows can access WSL services via localhost (auto-port-forwarding)
// or via the WSL VM IP
function getWSLIP(): string | undefined {
	try {
		// Get the first IP from hostname -I (WSL VM IP)
		const result = execSync("hostname -I", { encoding: "utf8" }).trim();
		return result.split(/\s+/)[0];
	} catch {
		return undefined;
	}
}

const isWSL =
	process.platform === "linux" &&
	(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
const wslIP = isWSL ? getWSLIP() : undefined;
const jaegerHost = wslIP ?? "localhost";
const jaegerURL = `http://${jaegerHost}:16687`;

// Configure OpenTelemetry SDK with Jaeger
const sdk = new NodeSDK({
	traceExporter: new OTLPTraceExporter({
		url: "http://localhost:4319/v1/traces",
	}),
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: "go-go-scope-example",
	}),
});

// Start the SDK
await sdk.start();

const tracer = trace.getTracer("go-go-scope-example");

console.log("🚀 Running go-go-scope examples with Jaeger tracing...");
console.log("💡 Tasks are now child spans of their parent scope");
console.log(`📊 View traces at: ${jaegerURL}/search`);
if (isWSL) {
	console.log("   (WSL detected - use the above URL in your Windows browser)");
	console.log(
		"   If that doesn't work, also try: http://localhost:16687/search",
	);
}
console.log("");

// Example 1: Simple task
console.log("1️⃣  Running simple task...");
{
	await using s = scope({ tracer, name: "simple-task-example" });
	const t = s.task(
		async () => {
			await delay(100);
			return "Hello from simple task!";
		},
		{ otel: { name: "simple-task" } },
	);
	const [err, result] = await t;
	console.log(`   Result: ${err ? `Error: ${err}` : result}`);
}

// Example 2: Parallel tasks with concurrency limit
console.log("2️⃣  Running parallel tasks with concurrency=2...");
{
	await using s = scope({ tracer, name: "parallel-tasks", concurrency: 2 });

	const parallelResult = await s.parallel([
		async () => {
			await delay(50);
			return "Task 1";
		},
		async () => {
			await delay(100);
			return "Task 2";
		},
		async () => {
			await delay(75);
			return "Task 3";
		},
		async () => {
			await delay(25);
			return "Task 4";
		},
	]);

	parallelResult.forEach((result, index) => {
		const [, value] = result;
		console.log(`   Task ${index + 1}: ${value}`);
	});
	parallelResult.forEach((result, index) => {
		const [error] = result;
		if (!error) return;
		console.log(`   Task ${index + 1}: Error - ${error}`);
	});
}

// Example 3: Race - first to complete wins
console.log("3️⃣  Running race...");
{
	await using s = scope({ tracer, name: "race-example" });

	const [err, winner] = await s.race([
		async () => {
			await delay(200);
			return "Slow winner";
		},
		async () => {
			await delay(50);
			return "Fast winner!";
		},
		async () => {
			await delay(100);
			return "Medium";
		},
	]);

	console.log(`   Winner: ${err ? `Error: ${err}` : winner}`);
}

// Example 4: Task with retry
console.log("4️⃣  Running task with retry (will fail twice then succeed)...");
{
	await using s = scope({ tracer, name: "retry-example" });
	let attempts = 0;

	const t = s.task(
		async () => {
			attempts++;
			if (attempts < 3) {
				throw new Error(`Attempt ${attempts} failed`);
			}
			await delay(50);
			return `Success after ${attempts} attempts!`;
		},
		{
			otel: { name: "retryable-task" },
			retry: {
				maxRetries: 3,
				delay: 100,
				onRetry: (err, attempt) => {
					console.log(`   Retry ${attempt}: ${err}`);
				},
			},
		},
	);

	const [err, result] = await t;
	console.log(`   Result: ${err ? `Error: ${err}` : result}`);
}

// Example 5: Task with timeout (will fail)
console.log("5️⃣  Running task with timeout (expected to fail)...");
{
	await using s = scope({ tracer, name: "timeout-example" });

	const t = s.task(
		async () => {
			await delay(500); // This will timeout
			return "This won't be reached";
		},
		{
			otel: { name: "slow-task" },
			timeout: 100,
		},
	);

	const [err, result] = await t;
	console.log(`   Result: ${err ? "Timeout error (expected)" : result}`);
}

// Example 6: Nested scopes with parent/child relationship
console.log("6️⃣  Running nested scopes...");
{
	await using parent = scope({
		tracer,
		name: "parent-scope",
	}).provide("db", () => ({ connection: "postgresql://localhost" }));

	await using child = scope({ parent, name: "child-scope" });

	const t = child.task(
		async ({ services }) => {
			await delay(75);
			return `Using ${services.db.connection}`;
		},
		{ otel: { name: "db-query-task" } },
	);

	const [err, result] = await t;
	console.log(`   Result: ${err ? `Error: ${err}` : result}`);
}

// Example 7: Channel communication
console.log("7️⃣  Running channel producer/consumer...");
{
	await using s = scope({ tracer, name: "channel-example" });
	const ch = s.channel<number>(5);

	// Producer
	s.task(
		async () => {
			for (let i = 1; i <= 5; i++) {
				await ch.send(i);
				await delay(30);
			}
			ch.close();
		},
		{ otel: { name: "channel-producer" } },
	);

	// Consumer
	const consumer = s.task(
		async () => {
			const values: number[] = [];
			for await (const val of ch) {
				values.push(val);
			}
			return `Consumed: ${values.join(", ")}`;
		},
		{ otel: { name: "channel-consumer" } },
	);

	const [err, result] = await consumer;
	console.log(`   Result: ${err ? `Error: ${err}` : result}`);
}

console.log("");
console.log("✅ All examples completed!");
console.log(
	`📊 View traces at: ${jaegerURL}/search?service=go-go-scope-example`,
);
if (isWSL) {
	console.log("   (Detected WSL - use this URL in your Windows browser)");
}

// Shutdown SDK to flush traces with timeout
console.log("🔄 Shutting down tracer (sending traces to Jaeger)...");
const shutdownTimeout = new Promise((_, reject) =>
	setTimeout(() => reject(new Error("Shutdown timeout")), 5000),
);
try {
	await Promise.race([sdk.shutdown(), shutdownTimeout]);
	console.log("✅ Traces sent to Jaeger!");
} catch {
	console.log("⚠️  Could not connect to Jaeger (is it running?).");
	console.log("   Start Jaeger with: docker compose up -d");
	process.exit(0);
}

// Helper function
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
