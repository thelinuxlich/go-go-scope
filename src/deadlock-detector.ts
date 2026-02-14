/**
 * Deadlock detector for go-go-scope
 */

import type { DeadlockDetectionOptions } from "./types.js";

/**
 * Tracks task waiting states to detect potential deadlocks.
 *
 * @example
 * ```typescript
 * await using s = scope({
 *   deadlockDetection: {
 *     timeout: 30000,
 *     onDeadlock: (tasks) => console.warn('Potential deadlock:', tasks)
 *   }
 * })
 * ```
 */
export class DeadlockDetector {
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

		for (const [_, task] of this.waitingTasks) {
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
	 * Get the number of currently waiting tasks.
	 */
	get waitingCount(): number {
		return this.waitingTasks.size;
	}
}
