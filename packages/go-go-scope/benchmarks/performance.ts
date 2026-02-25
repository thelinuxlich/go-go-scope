/**
 * Comprehensive performance benchmarks for go-go-scope
 * Compares optimized versions with native approaches
 */

import { performance } from "perf_hooks";
import {
	scope,
	race,
	benchmark,
	Channel,
	Task,
	getTaskPoolMetrics,
	resetTaskPoolMetrics,
	type Scope,
} from "../dist/index.mjs";

interface BenchmarkResult {
	name: string;
	opsPerSecond: number;
	avgTime: number;
	minTime: number;
	maxTime: number;
	samples: number;
	memoryDelta?: number;
}

interface BenchmarkSuite {
	name: string;
	results: BenchmarkResult[];
}

// Helper to format numbers
function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
	return num.toFixed(2);
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	return `${bytes.toFixed(2)} B`;
}

// ============================================================================
// Task Creation Benchmarks
// ============================================================================

async function benchTaskCreation(): Promise<BenchmarkSuite> {
	console.log("\n📊 Task Creation Benchmarks\n");

	const results: BenchmarkResult[] = [];

	// Native Promise baseline
	results.push(
		await benchmark("Native Promise.resolve", async () => {
			const promise = Promise.resolve(42);
			await promise;
		}),
	);

	// Native Promise with new Promise
	results.push(
		await benchmark("Native new Promise", async () => {
			const promise = new Promise<number>((resolve) => resolve(42));
			await promise;
		}),
	);

	// Task creation with scope
	results.push(
		await benchmark("Task creation (simple)", async () => {
			await using s = scope();
			const task = s.task(() => Promise.resolve(42));
			await task;
		}),
	);

	// Task creation with lazy signal access
	results.push(
		await benchmark("Task creation (lazy signal)", async () => {
			await using s = scope();
			const task = s.task(({ signal }) => {
				// Touch signal to force creation
				return Promise.resolve(signal.aborted ? 0 : 42);
			});
			await task;
		}),
	);

	// Task with timeout
	results.push(
		await benchmark("Task with timeout", async () => {
			await using s = scope();
			const task = s.task(() => Promise.resolve(42), { timeout: 5000 });
			await task;
		}),
	);

	// Task with retry
	results.push(
		await benchmark("Task with retry", async () => {
			await using s = scope();
			let attempts = 0;
			const task = s.task(
				() => {
					attempts++;
					if (attempts < 2) throw new Error("fail");
					return Promise.resolve(42);
				},
				{ retry: { maxRetries: 3, delay: 0 } },
			);
			await task;
		}),
	);

	return { name: "Task Creation", results };
}

// ============================================================================
// Channel Benchmarks
// ============================================================================

async function benchChannels(): Promise<BenchmarkSuite> {
	console.log("\n📊 Channel Benchmarks\n");

	const results: BenchmarkResult[] = [];

	// Native async queue pattern
	results.push(
		await benchmark("Native async queue", async () => {
			const queue: number[] = [];
			const resolvers: ((value: number | undefined) => void)[] = [];

			// Producer
			queue.push(42);
			const resolver = resolvers.shift();
			if (resolver) resolver(42);

			// Consumer
			const value =
				queue.shift() ??
				(new Promise<number | undefined>((resolve) => resolvers.push(resolve)) as Promise<number | undefined>);
			await value;
		}),
	);

	// Channel send/receive (fast path)
	results.push(
		await benchmark("Channel send/receive (fast path)", async () => {
			await using s = scope();
			const ch = s.channel<number>(10);

			// Direct send without waiting
			await ch.send(42);
			await ch.receive();
			ch.close();
		}),
	);

	// Channel with waiting receiver
	results.push(
		await benchmark("Channel with waiting receiver", async () => {
			await using s = scope();
			const ch = s.channel<number>(0); // Unbuffered

			const receivePromise = ch.receive();
			await ch.send(42);
			await receivePromise;
			ch.close();
		}),
	);

	// Channel throughput test
	results.push(
		await benchmark("Channel throughput (100 messages)", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);

			s.task(async () => {
				for (let i = 0; i < 100; i++) {
					await ch.send(i);
				}
				ch.close();
			});

			let count = 0;
			for await (const _ of ch) {
				count++;
			}
		}),
	);

	// Channel with drop-oldest strategy
	results.push(
		await benchmark("Channel drop-oldest (10 capacity)", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 10,
				backpressure: "drop-oldest",
			});

			for (let i = 0; i < 100; i++) {
				await ch.send(i);
			}
			ch.close();
		}),
	);

	// Channel map operation
	results.push(
		await benchmark("Channel.map()", async () => {
			const ch = new Channel<number>(10);
			const mapped = ch.map((x) => x * 2);

			await ch.send(21);
			await mapped.receive();
			ch.close();
			await mapped[Symbol.asyncDispose]();
		}),
	);

	return { name: "Channels", results };
}

// ============================================================================
// Scope Benchmarks
// ============================================================================

async function benchScopes(): Promise<BenchmarkSuite> {
	console.log("\n📊 Scope Benchmarks\n");

	const results: BenchmarkResult[] = [];

	// Simple scope creation/disposal
	results.push(
		await benchmark("Scope creation/disposal", async () => {
			await using s = scope();
		}),
	);

	// Scope with timeout
	results.push(
		await benchmark("Scope with timeout", async () => {
			await using s = scope({ timeout: 10000 });
		}),
	);

	// Scope with services
	results.push(
		await benchmark("Scope with services", async () => {
			await using s = scope().provide("db", () => ({ id: 1 }));
			s.use("db");
		}),
	);

	// Scope task spawning
	results.push(
		await benchmark("Scope task spawning (10 tasks)", async () => {
			await using s = scope();
			const tasks: Promise<unknown>[] = [];
			for (let i = 0; i < 10; i++) {
				tasks.push(s.task(() => Promise.resolve(i)));
			}
			await Promise.all(tasks);
		}),
	);

	// Scope with metrics
	results.push(
		await benchmark("Scope with metrics (10 tasks)", async () => {
			await using s = scope({ metrics: true });
			for (let i = 0; i < 10; i++) {
				await s.task(() => Promise.resolve(i));
			}
			s.metrics();
		}),
	);

	// Nested scopes
	results.push(
		await benchmark("Nested scopes (3 levels)", async () => {
			await using parent = scope({ name: "parent" });
			await using child1 = scope({ parent, name: "child1" });
			await using child2 = scope({ parent: child1, name: "child2" });
			await child2.task(() => Promise.resolve(42));
		}),
	);

	return { name: "Scopes", results };
}

// ============================================================================
// Parallel Execution Benchmarks
// ============================================================================

async function benchParallel(): Promise<BenchmarkSuite> {
	console.log("\n📊 Parallel Execution Benchmarks\n");

	const results: BenchmarkResult[] = [];

	const items = Array.from({ length: 100 }, (_, i) => i);

	// Native Promise.all
	results.push(
		await benchmark("Promise.all (100 items)", async () => {
			await Promise.all(items.map((i) => Promise.resolve(i * 2)));
		}),
	);

	// Scope parallel
	results.push(
		await benchmark("Scope.parallel (100 items)", async () => {
			await using s = scope();
			await s.parallel(items.map((i) => () => Promise.resolve(i * 2)));
		}),
	);

	// Scope parallel with concurrency
	results.push(
		await benchmark("Scope.parallel with concurrency (100 items, limit 5)", async () => {
			await using s = scope();
			await s.parallel(
				items.map((i) => () => Promise.resolve(i * 2)),
				{ concurrency: 5 },
			);
		}),
	);

	// Scope-level concurrency
	results.push(
		await benchmark("Scope-level concurrency (100 items, limit 5)", async () => {
			await using s = scope({ concurrency: 5 });
			await Promise.all(
				items.map((i) => s.task(() => Promise.resolve(i * 2))),
			);
		}),
	);

	// Race function
	results.push(
		await benchmark("Race (5 competitors)", async () => {
			const factories = Array.from({ length: 5 }, (_, i) => () =>
				Promise.resolve(i),
			);
			await race(factories);
		}),
	);

	// Native Promise.race
	results.push(
		await benchmark("Promise.race (5 competitors)", async () => {
			const promises = Array.from({ length: 5 }, (_, i) => Promise.resolve(i));
			await Promise.race(promises);
		}),
	);

	return { name: "Parallel Execution", results };
}

// ============================================================================
// Memory Benchmarks
// ============================================================================

async function benchMemory(): Promise<BenchmarkSuite> {
	console.log("\n📊 Memory Benchmarks\n");

	const results: BenchmarkResult[] = [];

	if (typeof global.gc === "function") {
		global.gc();
	}

	const getMemory = () =>
		typeof process !== "undefined" ? process.memoryUsage().heapUsed : 0;

	// Task creation memory
	const beforeTasks = getMemory();
	results.push(
		await benchmark("Task creation memory (1000 tasks)", async () => {
			await using s = scope();
			const tasks: Promise<unknown>[] = [];
			for (let i = 0; i < 1000; i++) {
				tasks.push(s.task(() => Promise.resolve(i)));
			}
			await Promise.all(tasks);
		}),
	);
	const afterTasks = getMemory();

	// Channel memory
	const beforeChannels = getMemory();
	results.push(
		await benchmark("Channel memory (100 channels)", async () => {
			await using s = scope();
			const channels: Channel<number>[] = [];
			for (let i = 0; i < 100; i++) {
				channels.push(s.channel(10));
			}
			for (const ch of channels) {
				ch.close();
			}
		}),
	);
	const afterChannels = getMemory();

	// Scope hierarchy memory
	const beforeScopes = getMemory();
	results.push(
		await benchmark("Scope hierarchy memory (100 nested)", async () => {
			let current: Scope<Record<string, unknown>> = scope();
			for (let i = 0; i < 100; i++) {
				const parent = current;
				current = scope({ parent });
			}
			await current[Symbol.asyncDispose]();
		}),
	);
	const afterScopes = getMemory();

	console.log(`  Task memory delta: ${formatBytes(afterTasks - beforeTasks)}`);
	console.log(`  Channel memory delta: ${formatBytes(afterChannels - beforeChannels)}`);
	console.log(`  Scope memory delta: ${formatBytes(afterScopes - beforeScopes)}`);

	return { name: "Memory", results };
}

// ============================================================================
// Stress Tests
// ============================================================================

async function benchStress(): Promise<BenchmarkSuite> {
	console.log("\n📊 Stress Tests\n");

	const results: BenchmarkResult[] = [];

	// Rapid task creation
	results.push(
		await benchmark("Rapid task creation (10,000 tasks)", async () => {
			await using s = scope();
			for (let i = 0; i < 10000; i++) {
				s.task(() => Promise.resolve(i));
			}
		}),
	);

	// Channel throughput stress
	results.push(
		await benchmark("Channel throughput (10,000 messages)", async () => {
			await using s = scope();
			const ch = s.channel<number>(1000);

			s.task(async () => {
				for (let i = 0; i < 10000; i++) {
					await ch.send(i);
				}
				ch.close();
			});

			let count = 0;
			for await (const _ of ch) {
				count++;
			}
		}),
	);

	// Concurrent channel operations
	results.push(
		await benchmark("Concurrent channel ops (100 producers/consumers)", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);

			// Producers
			const producers = Array.from({ length: 100 }, async (_, i) => {
				await ch.send(i);
			});

			// Consumers
			const consumers = Array.from({ length: 100 }, async () => {
				await ch.receive();
			});

			await Promise.all([...producers, ...consumers]);
			ch.close();
		}),
	);

	return { name: "Stress Tests", results };
}

// ============================================================================
// Comparison with Native
// ============================================================================

async function benchNativeComparison(): Promise<BenchmarkSuite> {
	console.log("\n📊 Native Comparison\n");

	const results: BenchmarkResult[] = [];

	// Cancellation
	results.push(
		await benchmark("Native AbortController", async () => {
			const controller = new AbortController();
			const promise = new Promise((_, reject) => {
				controller.signal.addEventListener("abort", () => {
					reject(controller.signal.reason);
				});
			});
			controller.abort();
			try {
				await promise;
			} catch {
				// Expected
			}
		}),
	);

	results.push(
		await benchmark("Scope cancellation", async () => {
			await using s = scope();
			s.task(({ signal }) => {
				return new Promise((_, reject) => {
					signal.addEventListener("abort", () => {
						reject(signal.reason);
					});
				});
			});
			// Auto-cancels on scope exit
		}),
	);

	// Async iteration
	async function* nativeGenerator(n: number) {
		for (let i = 0; i < n; i++) {
			yield i;
		}
	}

	results.push(
		await benchmark("Native async iteration (1000 items)", async () => {
			const results: number[] = [];
			for await (const x of nativeGenerator(1000)) {
				results.push(x);
			}
		}),
	);

	results.push(
		await benchmark("Channel async iteration (1000 items)", async () => {
			await using s = scope();
			const ch = s.channel<number>(100);

			s.task(async () => {
				for (let i = 0; i < 1000; i++) {
					await ch.send(i);
				}
				ch.close();
			});

			const results: number[] = [];
			for await (const x of ch) {
				results.push(x);
			}
		}),
	);

	return { name: "Native Comparison", results };
}

// ============================================================================
// Results Formatting
// ============================================================================

function printResults(suites: BenchmarkSuite[]) {
	console.log("\n" + "=".repeat(80));
	console.log("📈 BENCHMARK RESULTS");
	console.log("=".repeat(80));

	for (const suite of suites) {
		console.log(`\n${suite.name}`);
		console.log("-".repeat(80));
		console.log(
			`${"Benchmark".padEnd(45)} ${"Ops/sec".padStart(12)} ${"Avg (ms)".padStart(12)} ${"Min (ms)".padStart(12)}`,
		);
		console.log("-".repeat(80));

		for (const result of suite.results) {
			console.log(
				`${result.name.padEnd(45)} ${formatNumber(result.opsPerSecond).padStart(12)} ${(result.avgTime).toFixed(4).padStart(12)} ${(result.minTime).toFixed(4).padStart(12)}`,
			);
		}
	}

	console.log("\n" + "=".repeat(80));
}

function printSummary(suites: BenchmarkSuite[]) {
	console.log("\n📊 SUMMARY\n");

	// Find key comparisons
	const allResults = suites.flatMap((s) => s.results);

	const nativePromise = allResults.find((r) =>
		r.name.includes("Native Promise.resolve"),
	);
	const scopeTask = allResults.find((r) => r.name.includes("Task creation (simple)"));

	if (nativePromise && scopeTask) {
		const overhead = scopeTask.avgTime / nativePromise.avgTime;
		console.log(`Task overhead vs native Promise: ${overhead.toFixed(2)}x`);
	}

	const nativeAll = allResults.find((r) => r.name.includes("Promise.all"));
	const scopeParallel = allResults.find((r) => r.name.includes("Scope.parallel (100 items)"));

	if (nativeAll && scopeParallel) {
		const overhead = scopeParallel.avgTime / nativeAll.avgTime;
		console.log(`Parallel overhead vs Promise.all: ${overhead.toFixed(2)}x`);
	}

	// Pool metrics
	const poolMetrics = getTaskPoolMetrics();
	console.log(`\nTask pool metrics:`);
	console.log(`  Hits: ${poolMetrics.hits}`);
	console.log(`  Misses: ${poolMetrics.misses}`);
	console.log(`  Pool size: ${poolMetrics.size}`);

	console.log("\n" + "=".repeat(80));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	console.log("🚀 go-go-scope Performance Benchmark Suite v2.0\n");
	console.log("Optimized performance benchmarks comparing with native patterns\n");

	// Reset pool metrics
	resetTaskPoolMetrics();

	const suites: BenchmarkSuite[] = [];

	suites.push(await benchTaskCreation());
	suites.push(await benchChannels());
	suites.push(await benchScopes());
	suites.push(await benchParallel());
	suites.push(await benchMemory());
	suites.push(await benchStress());
	suites.push(await benchNativeComparison());

	printResults(suites);
	printSummary(suites);
}

main().catch(console.error);
