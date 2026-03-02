/**
 * Checkpoint utilities for go-go-scope
 *
 * This module provides checkpoint provider implementations and helper functions
 * for the native checkpoint/resume feature in scope.task().
 *
 * The checkpoint feature is native - when a checkpoint provider is configured
 * in scope persistence, tasks automatically receive checkpoint and progress
 * utilities in their context.
 *
 * @example
 * ```typescript
 * await using s = scope({
 *   persistence: { checkpoint: new RedisCheckpointProvider(redis) }
 * })
 *
 * // Task with checkpoint support
 * const [err, result] = await s.task(
 *   async ({ checkpoint, progress }) => {
 *     const data = await loadData()
 *     let processed = checkpoint?.data?.processed ?? 0
 *
 *     for (let i = processed; i < data.length; i++) {
 *       await processItem(data[i])
 *       progress.update((i / data.length) * 100)
 *
 *       if (i % 100 === 0) {
 *         await checkpoint.save({ processed: i })
 *       }
 *     }
 *
 *     return { total: data.length }
 *   },
 *   {
 *     id: 'data-processing-job',
 *     checkpoint: {
 *       interval: 60000,
 *       onCheckpoint: (cp) => console.log(`Checkpoint ${cp.sequence} saved`)
 *     }
 *   }
 * )
 *
 * // Resume a task from its last checkpoint
 * const [err2, result2] = await s.resumeTask('data-processing-job', async ({ checkpoint, progress }) => {
 *   // Continue from checkpoint.data
 * })
 * ```
 */

import type { Checkpoint, CheckpointProvider } from "./persistence/types.js";
import type { ProgressContext, TaskOptions } from "./types.js";

/**
 * In-memory checkpoint provider for testing or simple use cases
 */
export class InMemoryCheckpointProvider implements CheckpointProvider {
	private checkpoints = new Map<string, Checkpoint<unknown>[]>();

	async save<T>(checkpoint: Checkpoint<T>): Promise<void> {
		const list = this.checkpoints.get(checkpoint.taskId) ?? [];
		list.push(checkpoint as Checkpoint<unknown>);
		this.checkpoints.set(checkpoint.taskId, list);
	}

	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const list = this.checkpoints.get(taskId) ?? [];
		return list[list.length - 1] as Checkpoint<T> | undefined;
	}

	async load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined> {
		for (const list of this.checkpoints.values()) {
			const found = list.find((cp) => cp.id === checkpointId);
			if (found) return found as Checkpoint<T>;
		}
		return undefined;
	}

	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		return [...(this.checkpoints.get(taskId) ?? [])];
	}

	async cleanup(taskId: string, keepCount: number): Promise<void> {
		const list = this.checkpoints.get(taskId);
		if (!list || list.length <= keepCount) return;

		const sorted = list.sort((a, b) => a.sequence - b.sequence);
		const kept = sorted.slice(-keepCount);
		this.checkpoints.set(taskId, kept);
	}

	async deleteAll(taskId: string): Promise<void> {
		this.checkpoints.delete(taskId);
	}
}

/**
 * Internal checkpoint state for task execution
 * @internal
 */
export interface CheckpointState<T> {
	provider: CheckpointProvider;
	taskId: string;
	current?: Checkpoint<T>;
	sequence: number;
	maxCheckpoints: number;
	onCheckpoint?: (checkpoint: Checkpoint<T>) => void;
}

/**
 * Create checkpoint context for task execution
 * @internal
 */
export function createCheckpointContext<T>(state: CheckpointState<T>): {
	save: (data: T) => Promise<void>;
	data?: T;
} {
	return {
		save: async (data: T) => {
			state.sequence++;
			const checkpoint: Checkpoint<T> = {
				id: `${state.taskId}-${Date.now()}-${state.sequence}`,
				taskId: state.taskId,
				sequence: state.sequence,
				timestamp: Date.now(),
				progress: 0,
				data,
			};

			await state.provider.save(checkpoint);
			state.current = checkpoint;

			// Cleanup old checkpoints
			await state.provider.cleanup(state.taskId, state.maxCheckpoints);

			state.onCheckpoint?.(checkpoint);
		},
		data: state.current?.data,
	};
}

/**
 * Create progress tracking context for task execution
 * @internal
 */
export function createProgressContext(): ProgressContext {
	const listeners = new Set<
		(progress: { percentage: number; eta?: number }) => void
	>();
	let currentProgress = { percentage: 0, eta: undefined as number | undefined };
	let startTime: number | undefined;

	return {
		update: (percentage: number) => {
			if (startTime === undefined) {
				startTime = Date.now();
			}

			// Calculate ETA based on progress rate
			let eta: number | undefined;
			if (startTime && percentage > 0 && percentage < 100) {
				const elapsed = Date.now() - startTime;
				const rate = percentage / elapsed; // percent per ms
				const remainingPercent = 100 - percentage;
				eta = Math.round(remainingPercent / rate);
			}

			currentProgress = { percentage, eta };
			for (const listener of listeners) {
				listener(currentProgress);
			}
		},
		get: () => ({ ...currentProgress }),
		onUpdate: (callback) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
	};
}

/**
 * Check if task options have checkpoint configuration
 * @internal
 */
export function hasCheckpointConfig(options?: TaskOptions): boolean {
	return options?.checkpoint !== undefined;
}

/**
 * Load checkpoint for task resumption
 * @internal
 */
export async function loadCheckpointForTask<T>(
	provider: CheckpointProvider,
	taskId: string,
	onResume?: (checkpoint: Checkpoint<T>) => void,
): Promise<Checkpoint<T> | undefined> {
	const checkpoint = await provider.loadLatest<T>(taskId);
	if (checkpoint && onResume) {
		onResume(checkpoint);
	}
	return checkpoint;
}

/**
 * Delete all checkpoints for a task
 * @internal
 */
export async function cleanupTaskCheckpoints(
	provider: CheckpointProvider,
	taskId: string,
): Promise<void> {
	await provider.deleteAll(taskId);
}

// Extend Scope interface to include resumeTask
declare module "./scope.js" {
	interface Scope {
		/**
		 * Resume a task from its last checkpoint.
		 *
		 * If a checkpoint exists for the task ID, the task will be executed
		 * with the checkpoint data available in the context. If no checkpoint
		 * exists, the task starts fresh with `checkpoint.data` as `undefined`.
		 *
		 * Use `requireExisting: true` to throw an error if no checkpoint exists.
		 *
		 * @param taskId - The unique task ID to resume
		 * @param fn - The task function to execute
		 * @param options - Optional task options (excluding id) plus resume-specific options
		 * @returns Promise that resolves to the task result
		 *
		 * @example
		 * ```typescript
		 * // Resume from last checkpoint (or start fresh if none exists)
		 * const [err, result] = await s.resumeTask('migration-job', async ({ checkpoint, progress }) => {
		 *   // checkpoint.data contains the saved state (or undefined if new)
		 *   const processed = checkpoint?.data?.processed ?? 0
		 *   // Continue processing from checkpoint...
		 * })
		 *
		 * // Require an existing checkpoint (throws if none exists)
		 * const [err2, result2] = await s.resumeTask('migration-job', async ({ checkpoint }) => {
		 *   const processed = checkpoint.data.processed  // guaranteed to exist
		 * }, { requireExisting: true })
		 * ```
		 */
		resumeTask<T, E extends Error = Error>(
			taskId: string,
			fn: (ctx: {
				services: unknown;
				signal: AbortSignal;
				logger: import("./types.js").Logger;
				context: Record<string, unknown>;
				checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown };
				progress?: ProgressContext;
			}) => Promise<T>,
			options?: Omit<TaskOptions<E>, "id"> & {
				/** If true, throw an error if no checkpoint exists for this task ID */
				requireExisting?: boolean;
			},
		): Promise<import("./types.js").Result<E, T>>;
	}
}
