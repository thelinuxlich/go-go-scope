/**
 * Metrics exporter for go-go-scope
 */

import type { MetricsExportOptions, ScopeMetrics } from "./types.js";

/**
 * Export metrics in various formats.
 *
 * @example
 * ```typescript
 * const s = scope({ metrics: true })
 * // ... run tasks
 * const metrics = s.metrics()
 * if (metrics) {
 *   const json = exportMetrics(metrics, { format: 'json' })
 *   console.log(json)
 * }
 * ```
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

	// Help and type annotations
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

	return lines.join("\n") + "\n";
}

function exportAsOtel(metrics: ScopeMetrics, prefix = "go-go-scope"): string {
	// OpenTelemetry format (simplified OTLP JSON)
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
							aggregationTemporality: 2, // Cumulative
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
 * Create a metrics reporter that periodically exports metrics.
 *
 * @example
 * ```typescript
 * const reporter = createMetricsReporter(s, {
 *   format: 'prometheus',
 *   interval: 60000,
 *   onExport: (data) => sendToPrometheus(data)
 * })
 * ```
 */
export interface MetricsReporterOptions extends MetricsExportOptions {
	interval: number;
	onExport: (data: string) => void | Promise<void>;
}

export class MetricsReporter {
	private intervalId?: ReturnType<typeof setInterval>;
	private scope: { metrics(): ScopeMetrics | undefined };
	private options: MetricsReporterOptions;

	constructor(
		scope: { metrics(): ScopeMetrics | undefined },
		options: MetricsReporterOptions,
	) {
		this.scope = scope;
		this.options = options;
		this.start();
	}

	/**
	 * Start reporting metrics.
	 */
	start(): void {
		if (this.intervalId) return;

		// Report immediately
		void this.report();

		// Then report on interval
		this.intervalId = setInterval(() => {
			void this.report();
		}, this.options.interval);
	}

	/**
	 * Stop reporting metrics.
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
	}

	/**
	 * Force an immediate report.
	 */
	async report(): Promise<void> {
		const metrics = this.scope.metrics();
		if (!metrics) return;

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

	/**
	 * Dispose the reporter.
	 */
	dispose(): void {
		this.stop();
	}
}
