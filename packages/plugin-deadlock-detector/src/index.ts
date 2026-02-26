/**
 * Deadlock detector plugin for go-go-scope
 */

import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * Options for deadlock detection
 */
export interface DeadlockDetectionOptions {
	/** Timeout in milliseconds before considering a task stuck */
	timeout: number;
	/** Callback when potential deadlock is detected */
	onDeadlock?: (tasks: string[]) => void;
}

/**
 * Tracks task waiting states to detect potential deadlocks.
 * Automatically registered with scope for cleanup.
 */
/* #__PURE__ */
export class DeadlockDetector implements Disposable {
	private waitingTasks: Map<
		number,
		{ name: string; waitingOn: string; since: number }
	> = new Map();
	private timeoutId?: ReturnType<typeof setTimeout>;
	private options: DeadlockDetectionOptions;

	constructor(
		options: DeadlockDetectionOptions,
		private scopeName: string,
	) {
		this.options = options;
		this.startMonitoring();
	}

	/**
	 * Register that a task is waiting on a resource.
	 */
	taskWaiting(taskIndex: number, taskName: string, waitingOn: string): void {
		this.waitingTasks.set(taskIndex, {
			name: taskName,
			waitingOn,
			since: performance.now(),
		});
	}

	/**
	 * Register that a task is no longer waiting.
	 */
	taskResumed(taskIndex: number): void {
		this.waitingTasks.delete(taskIndex);
	}

	/**
	 * Start monitoring for deadlocks.
	 */
	private startMonitoring(): void {
		const checkInterval = Math.min(this.options.timeout / 2, 5000);

		this.timeoutId = setInterval(() => {
			this.checkForDeadlocks();
		}, checkInterval);
	}

	/**
	 * Check if any tasks have been waiting longer than the timeout.
	 */
	private checkForDeadlocks(): void {
		const now = performance.now();
		const stuckTasks: string[] = [];

		for (const [, task] of this.waitingTasks) {
			const waitTime = now - task.since;
			if (waitTime > this.options.timeout) {
				stuckTasks.push(
					`${task.name} (waiting on ${task.waitingOn} for ${Math.round(waitTime)}ms)`,
				);
			}
		}

		if (stuckTasks.length > 0) {
			this.options.onDeadlock?.(stuckTasks);

			// Also log a warning
			console.warn(
				`[${this.scopeName}] Potential deadlock detected - ${stuckTasks.length} tasks stuck:`,
				stuckTasks,
			);
		}
	}

	/**
	 * Dispose the detector and stop monitoring.
	 */
	dispose(): void {
		if (this.timeoutId) {
			clearInterval(this.timeoutId);
			this.timeoutId = undefined;
		}
		this.waitingTasks.clear();
	}

	/**
	 * Dispose the detector when scope is disposed.
	 */
	[Symbol.dispose](): void {
		this.dispose();
	}

	/**
	 * Get the number of currently waiting tasks.
	 */
	get waitingCount(): number {
		return this.waitingTasks.size;
	}
}

/**
 * Deadlock detector plugin
 */
export interface DeadlockDetectorPluginOptions {
	deadlockDetection: DeadlockDetectionOptions;
}

/**
 * Create the deadlock detector plugin
 */
export function deadlockDetectorPlugin(
	options: DeadlockDetectionOptions,
): ScopePlugin {
	return {
		name: "deadlock-detector",

		install(scope: Scope, _scopeOptions) {
			const detector = new DeadlockDetector(
				options,
				(scope as unknown as { name: string }).name ?? "scope",
			);

			// Store detector on scope
			(
				scope as unknown as { _deadlockDetector?: DeadlockDetector }
			)._deadlockDetector = detector;

			// Register cleanup
			scope.onDispose(() => {
				detector.dispose();
			});
		},

		cleanup(scope) {
			(
				scope as unknown as { _deadlockDetector?: DeadlockDetector }
			)._deadlockDetector?.dispose();
		},
	};
}

// Augment Scope to include deadlock detector
declare module "go-go-scope" {
	interface Scope {
		/** @internal Deadlock detector instance */
		_deadlockDetector?: DeadlockDetector;
	}
}

export type { ScopePlugin };
