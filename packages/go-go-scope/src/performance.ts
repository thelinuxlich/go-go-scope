/**
 * Performance monitoring utilities for go-go-scope
 */

import type { Scope } from "./scope.js";

/**
 * Performance metrics for a scope
 */
export interface PerformanceMetrics {
	/** Total number of tasks created */
	taskCount: number;
	/** Number of active tasks */
	activeTaskCount: number;
	/** Number of channels created */
	channelCount: number;
	/** Number of child scopes */
	childScopeCount: number;
	/** Number of resources registered for cleanup */
	resourcesRegistered: number;
	/** Number of resources disposed */
	resourcesDisposed: number;
	/** Average task duration in milliseconds */
	averageTaskDuration: number;
	/** Total scope duration in milliseconds */
	scopeDuration: number;
	/** Tasks spawned per second */
	tasksPerSecond: number;
	/** Memory usage estimate (if available) */
	memoryUsage?: {
		used: number;
		total: number;
	};
}

/**
 * Performance snapshot for tracking over time
 */
export interface PerformanceSnapshot {
	timestamp: number;
	metrics: PerformanceMetrics;
}

/**
 * Configuration for performance monitoring
 */
export interface PerformanceMonitorOptions {
	/** Sample interval in milliseconds (default: 1000) */
	sampleInterval?: number;
	/** Maximum number of snapshots to keep (default: 100) */
	maxSnapshots?: number;
	/** Enable memory tracking (default: true) */
	trackMemory?: boolean;
}

/**
 * Performance monitor for a scope
 */
export class PerformanceMonitor {
	private scope: Scope<Record<string, unknown>>;
	private options: Required<PerformanceMonitorOptions>;
	private snapshots: PerformanceSnapshot[] = [];
	private startTime: number;
	private intervalId?: ReturnType<typeof setInterval>;
	private lastTaskCount = 0;

	constructor(
		scope: Scope<Record<string, unknown>>,
		options: PerformanceMonitorOptions = {},
	) {
		this.scope = scope;
		this.options = {
			sampleInterval: options.sampleInterval ?? 1000,
			maxSnapshots: options.maxSnapshots ?? 100,
			trackMemory: options.trackMemory ?? true,
		};
		this.startTime = performance.now();
	}

	/**
	 * Start monitoring
	 */
	start(): void {
		if (this.intervalId) return;

		this.intervalId = setInterval(() => {
			this.takeSnapshot();
		}, this.options.sampleInterval);
	}

	/**
	 * Stop monitoring
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
	}

	/**
	 * Take a manual snapshot
	 */
	takeSnapshot(): PerformanceSnapshot {
		const metrics = this.getMetrics();
		const snapshot: PerformanceSnapshot = {
			timestamp: performance.now(),
			metrics,
		};

		this.snapshots.push(snapshot);

		// Keep only the most recent snapshots
		if (this.snapshots.length > this.options.maxSnapshots) {
			this.snapshots.shift();
		}

		// Update last task count for rate calculation
		this.lastTaskCount = metrics.taskCount;
		// Suppress TS6133 by referencing the value (used for future rate calculations)
		void this.lastTaskCount;

		return snapshot;
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): PerformanceMetrics {
		// biome-ignore lint/suspicious/noExplicitAny: Accessing optional metrics plugin
		const scopeMetrics = (this.scope as any).metrics?.();
		const now = performance.now();
		const elapsedSeconds = (now - this.startTime) / 1000;

		// Access internal properties for more detailed metrics
		// biome-ignore lint/suspicious/noExplicitAny: Accessing internal properties for monitoring
		const internal = this.scope as any;

		const taskCount = scopeMetrics?.tasksSpawned ?? 0;
		const tasksPerSecond = elapsedSeconds > 0 ? taskCount / elapsedSeconds : 0;

		const metrics: PerformanceMetrics = {
			taskCount,
			activeTaskCount: internal.activeTasks?.size ?? 0,
			channelCount: internal._channelCount ?? 0,
			childScopeCount: internal.childScopes?.length ?? 0,
			resourcesRegistered: scopeMetrics?.resourcesRegistered ?? 0,
			resourcesDisposed: scopeMetrics?.resourcesDisposed ?? 0,
			averageTaskDuration: scopeMetrics?.avgTaskDuration ?? 0,
			scopeDuration: now - this.startTime,
			tasksPerSecond,
		};

		// Add memory usage if available and tracking is enabled
		if (this.options.trackMemory && typeof process !== "undefined") {
			const memUsage = process.memoryUsage();
			metrics.memoryUsage = {
				used: memUsage.heapUsed,
				total: memUsage.heapTotal,
			};
		}

		return metrics;
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): PerformanceSnapshot[] {
		return [...this.snapshots];
	}

	/**
	 * Get performance trends
	 */
	getTrends(): {
		taskRateTrend: "increasing" | "decreasing" | "stable";
		durationTrend: "increasing" | "decreasing" | "stable";
	} {
		if (this.snapshots.length < 2) {
			return { taskRateTrend: "stable", durationTrend: "stable" };
		}

		const recent = this.snapshots.slice(-10);
		const first = recent[0];
		const last = recent[recent.length - 1];

		if (!first || !last) {
			return { taskRateTrend: "stable", durationTrend: "stable" };
		}

		const taskRateChange =
			last.metrics.tasksPerSecond - first.metrics.tasksPerSecond;
		const durationChange =
			last.metrics.averageTaskDuration - first.metrics.averageTaskDuration;

		const threshold = 0.1; // 10% change threshold

		return {
			taskRateTrend:
				Math.abs(taskRateChange) < threshold
					? "stable"
					: taskRateChange > 0
						? "increasing"
						: "decreasing",
			durationTrend:
				Math.abs(durationChange) < threshold
					? "stable"
					: durationChange > 0
						? "increasing"
						: "decreasing",
		};
	}

	/**
	 * Dispose the monitor
	 */
	[Symbol.dispose](): void {
		this.stop();
	}
}

/**
 * Create a performance monitor for a scope
 */
export function performanceMonitor(
	scope: Scope<Record<string, unknown>>,
	options?: PerformanceMonitorOptions,
): PerformanceMonitor {
	const monitor = new PerformanceMonitor(scope, options);
	monitor.start();
	return monitor;
}

/**
 * Benchmark runner for performance testing
 */
export interface BenchmarkOptions {
	/** Number of warmup iterations */
	warmup?: number;
	/** Number of benchmark iterations */
	iterations?: number;
	/** Minimum duration in milliseconds */
	minDuration?: number;
	/**
	 * Run benchmark in a worker thread.
	 * Useful for CPU-intensive benchmarks that would block the main thread.
	 * @default false
	 */
	worker?: boolean;
}

/**
 * Results from a benchmark execution.
 *
 * Contains timing statistics and performance metrics from running
 * a function multiple times to measure its performance characteristics.
 *
 * @example
 * ```typescript
 * const result = await benchmark('my-function', () => {
 *   // Function to benchmark
 * }, { iterations: 1000 });
 *
 * console.log(`Average: ${result.avgDuration}ms`);
 * console.log(`Ops/sec: ${result.opsPerSecond}`);
 * ```
 */
export interface BenchmarkResult {
	/** Name of the benchmark */
	name: string;
	/** Number of iterations executed */
	iterations: number;
	/** Total duration of all iterations in milliseconds */
	totalDuration: number;
	/** Average duration per iteration in milliseconds */
	avgDuration: number;
	/** Minimum duration of any iteration in milliseconds */
	minDuration: number;
	/** Maximum duration of any iteration in milliseconds */
	maxDuration: number;
	/** Operations per second (throughput) */
	opsPerSecond: number;
}

/**
 * Run a benchmark in a worker thread
 */
async function benchmarkInWorker(
	name: string,
	fn: () => void,
	options: BenchmarkOptions,
): Promise<BenchmarkResult> {
	const { WorkerPool } = await import("./worker-pool.js");
	const pool = new WorkerPool({ size: 1 });

	try {
		const fnString = fn.toString();
		const { warmup = 100, iterations = 1000, minDuration = 1000 } = options;

		// Execute benchmark in worker
		return await pool.execute<
			{
				name: string;
				fnString: string;
				opts: { warmup: number; iterations: number; minDuration: number };
			},
			BenchmarkResult
		>(
			(data) => {
				// biome-ignore lint/security/noGlobalEval: Required for worker threads
				const workerFn = eval(`(${data.fnString})`);
				const { warmup, iterations, minDuration } = data.opts;

				// Warmup
				for (let i = 0; i < warmup; i++) {
					workerFn();
				}

				// Run benchmark
				const times: number[] = [];
				const startTime = performance.now();

				while (
					times.length < iterations &&
					performance.now() - startTime < minDuration * 10
				) {
					const iterStart = performance.now();
					workerFn();
					const iterEnd = performance.now();
					times.push(iterEnd - iterStart);
				}

				const totalDuration = times.reduce((a, b) => a + b, 0);
				const avgDuration = totalDuration / times.length;
				const minDuration_ = Math.min(...times);
				const maxDuration = Math.max(...times);
				const opsPerSecond = 1000 / avgDuration;

				return {
					name: data.name,
					iterations: times.length,
					totalDuration,
					avgDuration,
					minDuration: minDuration_,
					maxDuration,
					opsPerSecond,
				};
			},
			{ name, fnString, opts: { warmup, iterations, minDuration } },
		);
	} finally {
		await pool[Symbol.asyncDispose]();
	}
}

/**
 * Run a benchmark
 */
export async function benchmark(
	name: string,
	fn: () => Promise<void> | void,
	options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
	// Run in worker thread if requested
	if (options.worker) {
		// Worker threads only support sync functions
		// biome-ignore lint/suspicious/noAsyncPromiseExecutor: Worker execution
		return benchmarkInWorker(name, fn as () => void, options);
	}

	const warmup = options.warmup ?? 100;
	const iterations = options.iterations ?? 1000;
	const minDuration = options.minDuration ?? 1000;

	// Warmup
	for (let i = 0; i < warmup; i++) {
		await fn();
	}

	// Run benchmark
	const times: number[] = [];
	const startTime = performance.now();

	while (
		times.length < iterations &&
		performance.now() - startTime < minDuration * 10
	) {
		const iterStart = performance.now();
		await fn();
		const iterEnd = performance.now();
		times.push(iterEnd - iterStart);
	}

	const totalDuration = times.reduce((a, b) => a + b, 0);
	const avgDuration = totalDuration / times.length;
	const minDuration_ = Math.min(...times);
	const maxDuration = Math.max(...times);
	const opsPerSecond = 1000 / avgDuration;

	return {
		name,
		iterations: times.length,
		totalDuration,
		avgDuration,
		minDuration: minDuration_,
		maxDuration,
		opsPerSecond,
	};
}

/**
 * Memory tracker for detecting leaks
 */
export class MemoryTracker {
	private snapshots: { timestamp: number; usage: number }[] = [];
	private maxSnapshots: number;

	constructor(maxSnapshots = 50) {
		this.maxSnapshots = maxSnapshots;
	}

	/**
	 * Take a memory snapshot
	 */
	snapshot(): number {
		if (typeof process === "undefined") return 0;

		const usage = process.memoryUsage().heapUsed;
		this.snapshots.push({ timestamp: performance.now(), usage });

		if (this.snapshots.length > this.maxSnapshots) {
			this.snapshots.shift();
		}

		return usage;
	}

	/**
	 * Check for memory leaks
	 * Returns true if memory appears to be leaking
	 */
	checkForLeaks(thresholdPercent = 10): boolean {
		if (this.snapshots.length < 5) return false;

		const first = this.snapshots[0];
		const last = this.snapshots[this.snapshots.length - 1];
		if (!first || !last) return false;

		const growth = last.usage - first.usage;
		const growthPercent = (growth / first.usage) * 100;

		return growthPercent > thresholdPercent;
	}

	/**
	 * Get memory growth rate in bytes per second
	 */
	getGrowthRate(): number {
		if (this.snapshots.length < 2) return 0;

		const first = this.snapshots[0];
		const last = this.snapshots[this.snapshots.length - 1];
		if (!first || !last) return 0;

		const growth = last.usage - first.usage;
		const duration = (last.timestamp - first.timestamp) / 1000;

		return duration > 0 ? growth / duration : 0;
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): { timestamp: number; usage: number }[] {
		return [...this.snapshots];
	}
}
