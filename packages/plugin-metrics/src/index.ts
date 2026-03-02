/**
 * Metrics plugin for go-go-scope
 */

import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * Counter metric interface
 */
export interface Counter {
	/** Increment the counter */
	inc(amount?: number): void;
	/** Get current value */
	value(): number;
	/** Reset to zero */
	reset(): void;
}

/**
 * Gauge metric interface
 */
export interface Gauge {
	/** Set to specific value */
	set(value: number): void;
	/** Increment */
	inc(amount?: number): void;
	/** Decrement */
	dec(amount?: number): void;
	/** Get current value */
	value(): number;
}

/**
 * Histogram snapshot
 */
export interface HistogramSnapshot {
	name: string;
	count: number;
	sum: number;
	min: number;
	max: number;
	avg: number;
	p50: number;
	p90: number;
	p95: number;
	p99: number;
}

/**
 * Histogram metric interface
 */
export interface Histogram {
	/** Record a value */
	record(value: number): void;
	/** Get snapshot with percentiles */
	snapshot(): HistogramSnapshot;
}

/**
 * Counter implementation
 */
class CounterImpl implements Counter {
	private _value = 0;
	constructor(_name: string) {
		void _name;
	}
	inc(amount = 1): void {
		this._value += amount;
	}
	value(): number {
		return this._value;
	}
	reset(): void {
		this._value = 0;
	}
}

/**
 * Gauge implementation
 */
class GaugeImpl implements Gauge {
	private _value = 0;
	constructor(_name: string) {
		void _name;
	}
	set(value: number): void {
		this._value = value;
	}
	inc(amount = 1): void {
		this._value += amount;
	}
	dec(amount = 1): void {
		this._value -= amount;
	}
	value(): number {
		return this._value;
	}
}

/**
 * Histogram implementation
 */
class HistogramImpl implements Histogram {
	private values: number[] = [];
	private sum = 0;
	private min = Infinity;
	private max = -Infinity;

	constructor(private readonly name: string) {}

	record(value: number): void {
		this.values.push(value);
		this.sum += value;
		this.min = Math.min(this.min, value);
		this.max = Math.max(this.max, value);
	}

	snapshot(): HistogramSnapshot {
		const count = this.values.length;
		if (count === 0) {
			return {
				name: this.name,
				count: 0,
				sum: 0,
				min: 0,
				max: 0,
				avg: 0,
				p50: 0,
				p90: 0,
				p95: 0,
				p99: 0,
			};
		}

		const sorted = [...this.values].sort((a, b) => a - b);
		const avg = this.sum / count;

		return {
			name: this.name,
			count,
			sum: this.sum,
			min: this.min,
			max: this.max,
			avg,
			p50: this.percentile(sorted, 0.5),
			p90: this.percentile(sorted, 0.9),
			p95: this.percentile(sorted, 0.95),
			p99: this.percentile(sorted, 0.99),
		};
	}

	private percentile(sorted: number[], p: number): number {
		const index = Math.floor(sorted.length * p);
		return sorted[index] ?? sorted.at(-1) ?? 0;
	}
}

/**
 * Scope metrics data
 */
export interface ScopeMetrics {
	tasksSpawned: number;
	tasksCompleted: number;
	tasksFailed: number;
	totalTaskDuration: number;
	avgTaskDuration: number;
	p95TaskDuration: number;
	resourcesRegistered: number;
	resourcesDisposed: number;
	scopeDuration?: number;
}

/**
 * Metrics export format options
 */
export interface MetricsExportOptions {
	format: "json" | "prometheus" | "otel";
	prefix?: string;
	includeTimestamps?: boolean;
}

/**
 * Metrics collector for a scope
 */
class MetricsCollector implements Disposable {
	private metricsData: {
		tasksSpawned: number;
		tasksCompleted: number;
		tasksFailed: number;
		totalTaskDuration: number;
		durations: number[];
		resourcesRegistered: number;
		resourcesDisposed: number;
	};
	private histograms = new Map<string, HistogramImpl>();
	private counters = new Map<string, CounterImpl>();
	private gauges = new Map<string, GaugeImpl>();
	private startTime: number;

	constructor() {
		this.startTime = performance.now();
		this.metricsData = {
			tasksSpawned: 0,
			tasksCompleted: 0,
			tasksFailed: 0,
			totalTaskDuration: 0,
			durations: [],
			resourcesRegistered: 0,
			resourcesDisposed: 0,
		};
	}

	recordTaskSpawned(): void {
		this.metricsData.tasksSpawned++;
	}

	recordTaskCompleted(duration: number, succeeded: boolean): void {
		if (succeeded) {
			this.metricsData.tasksCompleted++;
		} else {
			this.metricsData.tasksFailed++;
		}
		this.metricsData.totalTaskDuration += duration;
		this.metricsData.durations.push(duration);
	}

	recordResourceRegistered(): void {
		this.metricsData.resourcesRegistered++;
	}

	recordResourceDisposed(): void {
		this.metricsData.resourcesDisposed++;
	}

	getMetrics(): ScopeMetrics {
		const durations = this.metricsData.durations;
		const avgTaskDuration =
			durations.length > 0
				? this.metricsData.totalTaskDuration / durations.length
				: 0;

		// Calculate p95
		const sorted = [...durations].sort((a, b) => a - b);
		const p95Index = Math.floor(sorted.length * 0.95);
		const p95TaskDuration = sorted[p95Index] ?? 0;

		return {
			tasksSpawned: this.metricsData.tasksSpawned,
			tasksCompleted: this.metricsData.tasksCompleted,
			tasksFailed: this.metricsData.tasksFailed,
			totalTaskDuration: this.metricsData.totalTaskDuration,
			avgTaskDuration,
			p95TaskDuration,
			resourcesRegistered: this.metricsData.resourcesRegistered,
			resourcesDisposed: this.metricsData.resourcesDisposed,
			scopeDuration: performance.now() - this.startTime,
		};
	}

	histogram(name: string): Histogram {
		let histogram = this.histograms.get(name);
		if (!histogram) {
			histogram = new HistogramImpl(name);
			this.histograms.set(name, histogram);
		}
		return histogram;
	}

	counter(name: string): Counter {
		let counter = this.counters.get(name);
		if (!counter) {
			counter = new CounterImpl(name);
			this.counters.set(name, counter);
		}
		return counter;
	}

	gauge(name: string): Gauge {
		let gauge = this.gauges.get(name);
		if (!gauge) {
			gauge = new GaugeImpl(name);
			this.gauges.set(name, gauge);
		}
		return gauge;
	}

	[Symbol.dispose](): void {
		this.histograms.clear();
		this.counters.clear();
		this.gauges.clear();
	}
}

/**
 * Export metrics in various formats
 */
export function exportMetrics(
	metrics: ScopeMetrics,
	options: MetricsExportOptions,
): string {
	switch (options.format) {
		case "json":
			return exportAsJson(metrics, options.prefix);
		case "prometheus":
			return exportAsPrometheus(
				metrics,
				options.prefix,
				options.includeTimestamps ?? true,
			);
		case "otel":
			return exportAsOtel(metrics, options.prefix);
		default:
			throw new Error(`Unknown format: ${options.format}`);
	}
}

function exportAsJson(metrics: ScopeMetrics, prefix?: string): string {
	const data = prefix ? { [prefix]: metrics } : metrics;
	return JSON.stringify(data, null, 2);
}

function exportAsPrometheus(
	metrics: ScopeMetrics,
	prefix = "goscope",
	includeTimestamps = true,
): string {
	const lines: string[] = [];
	const timestamp = includeTimestamps ? ` ${Date.now()}` : "";

	lines.push(
		`# HELP ${prefix}_tasks_spawned_total Total number of tasks spawned`,
	);
	lines.push(`# TYPE ${prefix}_tasks_spawned_total counter`);
	lines.push(
		`${prefix}_tasks_spawned_total ${metrics.tasksSpawned}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_tasks_completed_total Total number of tasks completed`,
	);
	lines.push(`# TYPE ${prefix}_tasks_completed_total counter`);
	lines.push(
		`${prefix}_tasks_completed_total ${metrics.tasksCompleted}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_tasks_failed_total Total number of tasks failed`,
	);
	lines.push(`# TYPE ${prefix}_tasks_failed_total counter`);
	lines.push(`${prefix}_tasks_failed_total ${metrics.tasksFailed}${timestamp}`);

	lines.push(
		`# HELP ${prefix}_task_duration_seconds_total Total task execution time`,
	);
	lines.push(`# TYPE ${prefix}_task_duration_seconds_total counter`);
	lines.push(
		`${prefix}_task_duration_seconds_total ${(metrics.totalTaskDuration / 1000).toFixed(3)}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_task_duration_avg_seconds Average task execution time`,
	);
	lines.push(`# TYPE ${prefix}_task_duration_avg_seconds gauge`);
	lines.push(
		`${prefix}_task_duration_avg_seconds ${(metrics.avgTaskDuration / 1000).toFixed(3)}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_task_duration_p95_seconds 95th percentile task duration`,
	);
	lines.push(`# TYPE ${prefix}_task_duration_p95_seconds gauge`);
	lines.push(
		`${prefix}_task_duration_p95_seconds ${(metrics.p95TaskDuration / 1000).toFixed(3)}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_resources_registered_total Total resources registered`,
	);
	lines.push(`# TYPE ${prefix}_resources_registered_total counter`);
	lines.push(
		`${prefix}_resources_registered_total ${metrics.resourcesRegistered}${timestamp}`,
	);

	lines.push(
		`# HELP ${prefix}_resources_disposed_total Total resources disposed`,
	);
	lines.push(`# TYPE ${prefix}_resources_disposed_total counter`);
	lines.push(
		`${prefix}_resources_disposed_total ${metrics.resourcesDisposed}${timestamp}`,
	);

	if (metrics.scopeDuration !== undefined) {
		lines.push(`# HELP ${prefix}_scope_duration_seconds Total scope lifetime`);
		lines.push(`# TYPE ${prefix}_scope_duration_seconds gauge`);
		lines.push(
			`${prefix}_scope_duration_seconds ${(metrics.scopeDuration / 1000).toFixed(3)}${timestamp}`,
		);
	}

	return `${lines.join("\n")}\n`;
}

function exportAsOtel(metrics: ScopeMetrics, prefix = "go-go-scope"): string {
	const resourceMetrics = {
		resource: {
			attributes: [{ key: "service.name", value: { stringValue: prefix } }],
		},
		scopeMetrics: [
			{
				scope: { name: "go-go-scope", version: "1.0.0" },
				metrics: [
					{
						name: `${prefix}.tasks.spawned`,
						sum: {
							dataPoints: [{ asInt: metrics.tasksSpawned }],
							isMonotonic: true,
							aggregationTemporality: 2,
						},
					},
					{
						name: `${prefix}.tasks.completed`,
						sum: {
							dataPoints: [{ asInt: metrics.tasksCompleted }],
							isMonotonic: true,
							aggregationTemporality: 2,
						},
					},
					{
						name: `${prefix}.tasks.failed`,
						sum: {
							dataPoints: [{ asInt: metrics.tasksFailed }],
							isMonotonic: true,
							aggregationTemporality: 2,
						},
					},
					{
						name: `${prefix}.task.duration.avg`,
						gauge: {
							dataPoints: [{ asDouble: metrics.avgTaskDuration }],
						},
					},
					{
						name: `${prefix}.task.duration.p95`,
						gauge: {
							dataPoints: [{ asDouble: metrics.p95TaskDuration }],
						},
					},
				],
			},
		],
	};

	return JSON.stringify({ resourceMetrics: [resourceMetrics] }, null, 2);
}

/**
 * Metrics reporter options
 */
export interface MetricsReporterOptions extends MetricsExportOptions {
	interval: number;
	onExport: (data: string) => void | Promise<void>;
}

/**
 * Metrics reporter
 */
export class MetricsReporter implements Disposable {
	private intervalId?: ReturnType<typeof setInterval>;
	private collector: MetricsCollector;
	private options: MetricsReporterOptions;

	constructor(collector: MetricsCollector, options: MetricsReporterOptions) {
		this.collector = collector;
		this.options = options;
		this.start();
	}

	start(): void {
		if (this.intervalId) return;

		void this.report();

		this.intervalId = setInterval(() => {
			void this.report();
		}, this.options.interval);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
	}

	async report(): Promise<void> {
		const metrics = this.collector.getMetrics();

		try {
			const data = exportMetrics(metrics, {
				format: this.options.format,
				prefix: this.options.prefix,
			});
			await this.options.onExport(data);
		} catch (error) {
			console.error("Failed to export metrics:", error);
		}
	}

	dispose(): void {
		this.stop();
	}

	[Symbol.dispose](): void {
		this.dispose();
	}
}

/**
 * Metrics plugin options
 */
export interface MetricsPluginOptions {
	metrics?: boolean;
	metricsExport?: {
		interval: number;
		format: "json" | "prometheus" | "otel";
		destination: (metrics: string) => void | Promise<void>;
		prefix?: string;
	};
}

/**
 * Create the metrics plugin
 */
export function metricsPlugin(options: MetricsPluginOptions = {}): ScopePlugin {
	return {
		name: "metrics",

		install(scope: Scope, _scopeOptions) {
			const collector = new MetricsCollector();

			// Store on scope
			(
				scope as unknown as { _metricsCollector?: MetricsCollector }
			)._metricsCollector = collector;

			// Add methods to scope
			(
				scope as unknown as {
					metrics?(): ScopeMetrics | undefined;
					histogram?(name: string): Histogram | undefined;
					counter?(name: string): Counter | undefined;
					gauge?(name: string): Gauge | undefined;
				}
			).metrics = () => collector.getMetrics();

			(
				scope as unknown as { histogram?(name: string): Histogram | undefined }
			).histogram = (name: string) => collector.histogram(name);

			(
				scope as unknown as { counter?(name: string): Counter | undefined }
			).counter = (name: string) => collector.counter(name);

			(scope as unknown as { gauge?(name: string): Gauge | undefined }).gauge =
				(name: string) => collector.gauge(name);

			// Track task start times for duration calculation
			const taskStartTimes = new Map<number, number>();

			// Set up hooks to track tasks using scope methods
			scope.onBeforeTask?.((_taskName: string, index: number) => {
				collector.recordTaskSpawned();
				taskStartTimes.set(index, performance.now());
			});

			scope.onAfterTask?.((name: string, duration: number, error?: unknown) => {
				const startTime = taskStartTimes.get(
					(name as unknown as { index?: number }).index ?? 0,
				);
				const actualDuration = startTime
					? performance.now() - startTime
					: duration;
				collector.recordTaskCompleted(actualDuration, !error);
				taskStartTimes.delete(
					(name as unknown as { index?: number }).index ?? 0,
				);
			});

			// Override provide to track resources (wrap dispose callback to track disposal)
			const originalProvide = scope.provide.bind(scope);
			Object.defineProperty(scope, "provide", {
				value: <K extends string, T>(
					key: K,
					value: T | (() => T),
					dispose?: (value: T) => void | Promise<void>,
				) => {
					collector.recordResourceRegistered();
					// Wrap dispose callback to track disposal
					const wrappedDispose = dispose
						? (val: T) => {
								dispose(val);
								collector.recordResourceDisposed();
							}
						: () => {
								collector.recordResourceDisposed();
							};
					return originalProvide(key, value, wrappedDispose);
				},
				writable: true,
				configurable: true,
			});

			// Set up automatic export if configured
			if (options.metricsExport) {
				const { interval, format, destination, prefix } = options.metricsExport;
				const reporter = new MetricsReporter(collector, {
					interval,
					format,
					onExport: destination,
					prefix,
				});

				(
					scope as unknown as { _metricsReporter?: MetricsReporter }
				)._metricsReporter = reporter;
			}

			// Register cleanup using scope.onDispose (not the local variable)
			scope.onDispose(() => {
				(
					scope as unknown as { _metricsReporter?: MetricsReporter }
				)._metricsReporter?.dispose();
				collector[Symbol.dispose]();
			});
		},

		cleanup(scope) {
			(
				scope as unknown as { _metricsReporter?: MetricsReporter }
			)._metricsReporter?.dispose();
			(
				scope as unknown as { _metricsCollector?: MetricsCollector }
			)._metricsCollector?.[Symbol.dispose]();
		},
	};
}

// Augment Scope to include metrics
declare module "go-go-scope" {
	interface Scope {
		/** @internal Metrics collector */
		_metricsCollector?: MetricsCollector;
		/** @internal Metrics reporter */
		_metricsReporter?: MetricsReporter;
		/** Get or create histogram */
		histogram?(name: string): Histogram | undefined;
		/** Get or create counter */
		counter?(name: string): Counter | undefined;
		/** Get or create gauge */
		gauge?(name: string): Gauge | undefined;
	}
}

export type { ScopePlugin };
