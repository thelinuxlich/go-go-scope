/**
 * Profiler plugin for go-go-scope
 */

import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * Task profile data
 */
export interface TaskProfile {
	name: string;
	index: number;
	stages: {
		execution: number;
		retry?: number;
		circuitBreaker?: number;
		concurrency?: number;
	};
	totalDuration: number;
	retryAttempts: number;
	succeeded?: boolean;
}

/**
 * Profile report for a scope
 */
export interface ScopeProfileReport {
	tasks: TaskProfile[];
	statistics: {
		totalTasks: number;
		successfulTasks: number;
		failedTasks: number;
		avgTotalDuration: number;
		avgExecutionDuration: number;
		totalRetryAttempts: number;
	};
}

/**
 * Internal tracking for task profiling
 */
interface TaskProfileData {
	name: string;
	index: number;
	startTime: number;
	stageStartTime: number;
	stages: TaskProfile["stages"];
	retryAttempts: number;
	succeeded?: boolean;
}

/**
 * Profiler for tracking task execution performance.
 * Measures time spent in each pipeline stage.
 */
/* #__PURE__ */
export class Profiler implements Disposable {
	private tasks: Map<number, TaskProfileData> = new Map();
	private profiles: TaskProfile[] = [];
	enabled = false;

	constructor(enabled = false) {
		this.enabled = enabled;
	}

	/**
	 * Start profiling a task.
	 */
	startTask(taskIndex: number, taskName: string): void {
		if (!this.enabled) return;

		const now = performance.now();
		this.tasks.set(taskIndex, {
			name: taskName,
			index: taskIndex,
			startTime: now,
			stageStartTime: now,
			stages: { execution: 0 },
			retryAttempts: 0,
		});
	}

	/**
	 * Record the start of a pipeline stage.
	 */
	startStage(taskIndex: number, _stageName: keyof TaskProfile["stages"]): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskIndex);
		if (!task) return;

		const now = performance.now();
		task.stageStartTime = now;
	}

	/**
	 * Record the end of a pipeline stage.
	 */
	endStage(taskIndex: number, stageName: keyof TaskProfile["stages"]): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskIndex);
		if (!task) return;

		const now = performance.now();
		const duration = now - task.stageStartTime;
		task.stages[stageName] = duration;
		task.stageStartTime = now;
	}

	/**
	 * Record a retry attempt.
	 */
	recordRetry(taskIndex: number): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskIndex);
		if (task) {
			task.retryAttempts++;
		}
	}

	/**
	 * End profiling for a task.
	 */
	endTask(taskIndex: number, succeeded: boolean): void {
		if (!this.enabled) return;

		const task = this.tasks.get(taskIndex);
		if (!task) return;

		const now = performance.now();
		task.stages.execution = now - task.stageStartTime;
		task.succeeded = succeeded;

		const totalDuration = now - task.startTime;

		this.profiles.push({
			name: task.name,
			index: task.index,
			stages: { ...task.stages },
			totalDuration,
			retryAttempts: task.retryAttempts,
			succeeded,
		});

		this.tasks.delete(taskIndex);
	}

	/**
	 * Get the profile report.
	 */
	getReport(): ScopeProfileReport {
		const tasks = [...this.profiles];

		if (tasks.length === 0) {
			return {
				tasks: [],
				statistics: {
					totalTasks: 0,
					successfulTasks: 0,
					failedTasks: 0,
					avgTotalDuration: 0,
					avgExecutionDuration: 0,
					totalRetryAttempts: 0,
				},
			};
		}

		const successfulTasks = tasks.filter((t) => t.succeeded);
		const failedTasks = tasks.filter((t) => !t.succeeded);
		const totalDuration = tasks.reduce((sum, t) => sum + t.totalDuration, 0);
		const totalExecutionDuration = tasks.reduce(
			(sum, t) => sum + t.stages.execution,
			0,
		);
		const totalRetryAttempts = tasks.reduce(
			(sum, t) => sum + t.retryAttempts,
			0,
		);

		return {
			tasks,
			statistics: {
				totalTasks: tasks.length,
				successfulTasks: successfulTasks.length,
				failedTasks: failedTasks.length,
				avgTotalDuration: totalDuration / tasks.length,
				avgExecutionDuration: totalExecutionDuration / tasks.length,
				totalRetryAttempts,
			},
		};
	}

	/**
	 * Clear all profiles.
	 */
	clear(): void {
		this.tasks.clear();
		this.profiles = [];
	}

	/**
	 * Dispose the profiler when scope is disposed.
	 */
	[Symbol.dispose](): void {
		this.clear();
	}

	/**
	 * Alias for Symbol.dispose for convenience.
	 */
	dispose(): void {
		this[Symbol.dispose]();
	}
}

/**
 * Profiler plugin options
 */
export interface ProfilerPluginOptions {
	profiler: boolean;
}

/**
 * Create the profiler plugin
 */
export function profilerPlugin(enabled = true): ScopePlugin {
	return {
		name: "profiler",

		install(scope: Scope) {
			const profiler = new Profiler(enabled);

			// Store profiler on scope
			(scope as unknown as { _profiler?: Profiler })._profiler = profiler;

			// Add profile method to scope
			(
				scope as unknown as {
					profile?(): ScopeProfileReport | undefined;
				}
			).profile = () => {
				return profiler.getReport();
			};

			// Register cleanup
			scope.onDispose(() => {
				profiler.dispose();
			});
		},

		cleanup(scope) {
			(scope as unknown as { _profiler?: Profiler })._profiler?.dispose();
		},
	};
}

// Augment Scope to include profiler
declare module "go-go-scope" {
	interface Scope {
		/** @internal Profiler instance */
		_profiler?: Profiler;
		/** Get profiling report */
		profile?(): ScopeProfileReport | undefined;
	}
}

export type { ScopePlugin };
