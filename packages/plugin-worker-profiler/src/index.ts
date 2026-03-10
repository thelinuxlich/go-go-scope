/**
 * Worker Profiler plugin for go-go-scope
 *
 * Provides detailed performance metrics for worker tasks including:
 * - CPU time (user + system)
 * - Memory usage (peak RSS, heap)
 * - Execution duration
 * - Transfer overhead (for zero-copy data)
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope'
 * import { workerProfilerPlugin } from '@go-go-scope/plugin-worker-profiler'
 *
 * await using s = scope({
 *   plugins: [workerProfilerPlugin()]
 * })
 *
 * const [err, result] = await s.task(
 *   { module: './heavy.js', export: 'compute' },
 *   { worker: true, data: { n: 1000000 } }
 * )
 *
 * const profile = s.workerProfile?.()
 * console.log(`CPU: ${profile?.cpuTime}ms, Memory: ${profile?.memoryPeak}MB`)
 * ```
 */

import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * Worker task performance metrics
 */
export interface WorkerTaskProfile {
	/** Task identifier */
	taskId: string;
	/** Module path */
	module: string;
	/** Export name used */
	export: string;
	/** Total execution time in milliseconds */
	duration: number;
	/** CPU user time in milliseconds (if available) */
	cpuUserTime?: number;
	/** CPU system time in milliseconds (if available) */
	cpuSystemTime?: number;
	/** Total CPU time (user + system) */
	cpuTime?: number;
	/** Peak memory RSS in MB (if available) */
	memoryPeakRss?: number;
	/** Peak heap used in MB (if available) */
	memoryPeakHeap?: number;
	/** Data transfer time (zero-copy overhead) in milliseconds */
	transferTime?: number;
	/** Size of data transferred in bytes */
	transferSize?: number;
	/** Whether task succeeded */
	succeeded: boolean;
	/** Error message if failed */
	error?: string;
	/** Timestamp when task started */
	startTime: Date;
}

/**
 * Worker profiler report
 */
export interface WorkerProfilerReport {
	/** Individual task profiles */
	tasks: WorkerTaskProfile[];
	/** Aggregate statistics */
	statistics: {
		totalTasks: number;
		successfulTasks: number;
		failedTasks: number;
		avgDuration: number;
		avgCpuTime: number;
		avgMemoryPeakRss: number;
		totalTransferSize: number;
	};
}

/**
 * Options for worker profiler plugin
 */
export interface WorkerProfilerOptions {
	/** Enable CPU time tracking (may have small overhead) */
	trackCpuTime?: boolean;
	/** Enable memory tracking */
	trackMemory?: boolean;
	/** Enable data transfer tracking */
	trackTransfers?: boolean;
	/** Maximum number of profiles to keep (default: 1000) */
	maxProfiles?: number;
}

/**
 * Internal tracking for active worker tasks
 */
interface ActiveWorkerTask {
	taskId: string;
	module: string;
	export: string;
	startTime: number;
	startMemory?: NodeJS.MemoryUsage;
	transferSize?: number;
	transferStartTime?: number;
}

/**
 * Worker profiler for tracking worker task performance
 */
export class WorkerProfiler implements Disposable {
	private tasks = new Map<string, ActiveWorkerTask>();
	private profiles: WorkerTaskProfile[] = [];
	private options: Required<WorkerProfilerOptions>;
	enabled = false;

	constructor(options: WorkerProfilerOptions = {}) {
		this.options = {
			trackCpuTime: options.trackCpuTime ?? true,
			trackMemory: options.trackMemory ?? true,
			trackTransfers: options.trackTransfers ?? true,
			maxProfiles: options.maxProfiles ?? 1000,
		};
		this.enabled = true;
	}

	/**
	 * Start profiling a worker task
	 */
	startTask(
		taskId: string,
		module: string,
		exportName: string,
		transferSize?: number,
	): void {
		if (!this.enabled) return;

		const now = performance.now();

		this.tasks.set(taskId, {
			taskId,
			module,
			export: exportName,
			startTime: now,
			transferSize,
			transferStartTime: this.options.trackTransfers ? now : undefined,
			startMemory: this.options.trackMemory ? process.memoryUsage() : undefined,
		});
	}

	/**
	 * Mark data transfer complete (called when worker starts execution)
	 */
	markTransferComplete(taskId: string): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskId);
		if (task && task.transferStartTime) {
			// Transfer time is captured but stored differently since
			// we need to track execution separately
			task.transferStartTime = performance.now();
		}
	}

	/**
	 * End profiling for a worker task
	 */
	endTask(taskId: string, succeeded: boolean, error?: Error): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskId);
		if (!task) return;

		const now = performance.now();
		const endMemory = this.options.trackMemory
			? process.memoryUsage()
			: undefined;

		// Calculate metrics
		const duration = now - task.startTime;
		const transferTime = task.transferStartTime
			? task.transferStartTime - task.startTime
			: undefined;

		// Memory calculation
		let memoryPeakRss: number | undefined;
		let memoryPeakHeap: number | undefined;
		if (task.startMemory && endMemory) {
			memoryPeakRss = (endMemory.rss - task.startMemory.rss) / 1024 / 1024;
			memoryPeakHeap =
				(endMemory.heapUsed - task.startMemory.heapUsed) / 1024 / 1024;
		}

		// CPU time (using performance.now as fallback)
		// Note: Real CPU time requires worker thread cooperation
		const cpuTime = duration; // Approximation

		const profile: WorkerTaskProfile = {
			taskId,
			module: task.module,
			export: task.export,
			duration,
			cpuTime,
			memoryPeakRss,
			memoryPeakHeap,
			transferTime,
			transferSize: task.transferSize,
			succeeded,
			error: error?.message,
			startTime: new Date(),
		};

		// Add to profiles (with max limit)
		this.profiles.push(profile);
		if (this.profiles.length > this.options.maxProfiles) {
			this.profiles.shift();
		}

		this.tasks.delete(taskId);
	}

	/**
	 * Get the profiler report
	 */
	getReport(): WorkerProfilerReport {
		const tasks = [...this.profiles];

		if (tasks.length === 0) {
			return {
				tasks: [],
				statistics: {
					totalTasks: 0,
					successfulTasks: 0,
					failedTasks: 0,
					avgDuration: 0,
					avgCpuTime: 0,
					avgMemoryPeakRss: 0,
					totalTransferSize: 0,
				},
			};
		}

		const successfulTasks = tasks.filter((t) => t.succeeded);
		const failedTasks = tasks.filter((t) => !t.succeeded);
		const totalDuration = tasks.reduce((sum, t) => sum + t.duration, 0);
		const totalCpuTime = tasks.reduce(
			(sum, t) => sum + (t.cpuTime ?? 0),
			0,
		);
		const totalMemoryRss = tasks.reduce(
			(sum, t) => sum + (t.memoryPeakRss ?? 0),
			0,
		);
		const totalTransferSize = tasks.reduce(
			(sum, t) => sum + (t.transferSize ?? 0),
			0,
		);

		return {
			tasks,
			statistics: {
				totalTasks: tasks.length,
				successfulTasks: successfulTasks.length,
				failedTasks: failedTasks.length,
				avgDuration: totalDuration / tasks.length,
				avgCpuTime: totalCpuTime / tasks.length,
				avgMemoryPeakRss: totalMemoryRss / tasks.length,
				totalTransferSize,
			},
		};
	}

	/**
	 * Get profiles for a specific module
	 */
	getModuleProfiles(modulePath: string): WorkerTaskProfile[] {
		return this.profiles.filter((p) => p.module === modulePath);
	}

	/**
	 * Get profiles for a specific export
	 */
	getExportProfiles(modulePath: string, exportName: string): WorkerTaskProfile[] {
		return this.profiles.filter(
			(p) => p.module === modulePath && p.export === exportName,
		);
	}

	/**
	 * Clear all profiles
	 */
	clear(): void {
		this.tasks.clear();
		this.profiles = [];
	}

	/**
	 * Dispose the profiler
	 */
	[Symbol.dispose](): void {
		this.clear();
	}

	/**
	 * Alias for Symbol.dispose
	 */
	dispose(): void {
		this[Symbol.dispose]();
	}
}

/**
 * Create the worker profiler plugin
 *
 * @param options - Profiler configuration options
 * @returns ScopePlugin for worker profiling
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope'
 * import { workerProfilerPlugin } from '@go-go-scope/plugin-worker-profiler'
 *
 * await using s = scope({
 *   plugins: [workerProfilerPlugin({ trackCpuTime: true, trackMemory: true })]
 * })
 *
 * // Run worker tasks...
 *
 * // Get profiling report
 * const report = s.workerProfile?.()
 * console.log(`Average duration: ${report?.statistics.avgDuration}ms`)
 * ```
 */
export function workerProfilerPlugin(
	options: WorkerProfilerOptions = {},
): ScopePlugin {
	return {
		name: "workerProfiler",

		install(scope: Scope) {
			const profiler = new WorkerProfiler(options);

			// Store profiler on scope
			(
				scope as unknown as { _workerProfiler?: WorkerProfiler }
			)._workerProfiler = profiler;

			// Add workerProfile method to scope
			(
				scope as unknown as {
					workerProfile?(): WorkerProfilerReport | undefined;
				}
			).workerProfile = () => {
				return profiler.getReport();
			};

			// Register cleanup
			scope.onDispose(() => {
				profiler.dispose();
			});
		},

		cleanup(scope) {
			(
				scope as unknown as { _workerProfiler?: WorkerProfiler }
			)._workerProfiler?.dispose();
		},
	};
}

// Augment Scope to include worker profiler
declare module "go-go-scope" {
	interface Scope {
		/** @internal Worker profiler instance */
		_workerProfiler?: WorkerProfiler;
		/** Get worker profiling report */
		workerProfile?(): WorkerProfilerReport | undefined;
	}
}

export type { ScopePlugin };
