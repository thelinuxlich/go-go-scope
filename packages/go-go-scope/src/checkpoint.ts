/**
 * Checkpoint utilities for go-go-scope
 *
 * This module provides checkpoint provider implementations and helper functions
 * for the native checkpoint/resume feature in scope.task().
 *
 * The checkpoint feature allows long-running tasks to save their progress periodically
 * and resume from the last saved state if the process restarts or crashes.
 *
 * ## How Checkpoints Work
 *
 * When a checkpoint provider is configured in scope persistence, tasks automatically
 * receive checkpoint and progress utilities in their context:
 *
 * - `checkpoint.save(data)` - Save the current state
 * - `checkpoint.data` - Access the last saved state (or undefined)
 * - `progress.update(percent)` - Update progress percentage
 * - `progress.onUpdate(callback)` - Listen for progress updates
 *
 * ## Persistence Integration
 *
 * For production use, use a distributed checkpoint provider from
 * @go-go-scope/persistence-* packages (Redis, PostgreSQL, etc.).
 *
 * @module checkpoint
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 * import { RedisCheckpointProvider } from "@go-go-scope/persistence-redis";
 *
 * // Configure with distributed checkpoint provider
 * await using s = scope({
 *   persistence: { checkpoint: new RedisCheckpointProvider(redis) }
 * });
 *
 * // Task with checkpoint support
 * const [err, result] = await s.task(
 *   async ({ checkpoint, progress }) => {
 *     const data = await loadData();
 *
 *     // Resume from checkpoint if available
 *     let processed = checkpoint?.data?.processed ?? 0;
 *
 *     for (let i = processed; i < data.length; i++) {
 *       await processItem(data[i]);
 *
 *       // Update progress
 *       progress.update((i / data.length) * 100);
 *
 *       // Save checkpoint every 100 items
 *       if (i % 100 === 0) {
 *         await checkpoint.save({ processed: i });
 *       }
 *     }
 *
 *     return { total: data.length };
 *   },
 *   {
 *     id: 'data-processing-job', // Required for checkpointing
 *     checkpoint: {
 *       interval: 60000, // Auto-save every 60 seconds
 *       onCheckpoint: (cp) => console.log(`Checkpoint ${cp.sequence} saved`)
 *     }
 *   }
 * );
 *
 * // Resume a task from its last checkpoint
 * const [err2, result2] = await s.resumeTask('data-processing-job', async ({ checkpoint, progress }) => {
 *   // Continue from checkpoint.data
 *   const processed = checkpoint?.data?.processed ?? 0;
 *   // ... continue processing
 * });
 * ```
 */

import type { Checkpoint, CheckpointProvider } from "./persistence/types.js";
import type { ProgressContext, TaskOptions } from "./types.js";

/**
 * In-memory checkpoint provider for testing or simple use cases.
 *
 * Stores checkpoints in a Map. All data is lost when the process exits.
 * For production use with persistence across restarts, use a distributed
 * provider from @go-go-scope/persistence-* packages.
 *
 * @implements {CheckpointProvider}
 *
 * @example
 * ```typescript
 * import { scope, InMemoryCheckpointProvider } from "go-go-scope";
 *
 * const provider = new InMemoryCheckpointProvider();
 *
 * await using s = scope({
 *   persistence: { checkpoint: provider }
 * });
 *
 * // Use checkpoint in tasks
 * const [err, result] = await s.task(
 *   async ({ checkpoint }) => {
 *     const state = checkpoint?.data ?? { count: 0 };
 *     await checkpoint.save({ count: state.count + 1 });
 *     return state.count + 1;
 *   },
 *   { id: 'counter-task' }
 * );
 *
 * // List all checkpoints for a task
 * const checkpoints = await provider.list('counter-task');
 * console.log(`Saved ${checkpoints.length} checkpoints`);
 *
 * // Clean up old checkpoints (keep only last 5)
 * await provider.cleanup('counter-task', 5);
 *
 * // Delete all checkpoints for a task
 * await provider.deleteAll('counter-task');
 * ```
 */
export class InMemoryCheckpointProvider implements CheckpointProvider {
	private checkpoints = new Map<string, Checkpoint<unknown>[]>();

	/**
	 * Saves a checkpoint for a task.
	 *
	 * @typeParam T - The type of checkpoint data
	 * @param checkpoint - The checkpoint to save
	 * @returns Promise that resolves when the checkpoint is saved
	 *
	 * @example
	 * ```typescript
	 * await provider.save({
	 *   id: 'task-1-1234567890-1',
	 *   taskId: 'task-1',
	 *   sequence: 1,
	 *   timestamp: Date.now(),
	 *   progress: 50,
	 *   data: { processed: 100 }
	 * });
	 * ```
	 */
	async save<T>(checkpoint: Checkpoint<T>): Promise<void> {
		const list = this.checkpoints.get(checkpoint.taskId) ?? [];
		list.push(checkpoint as Checkpoint<unknown>);
		this.checkpoints.set(checkpoint.taskId, list);
	}

	/**
	 * Loads the most recent checkpoint for a task.
	 *
	 * @typeParam T - The expected type of checkpoint data
	 * @param taskId - The task ID to look up
	 * @returns The latest checkpoint or undefined if none exists
	 *
	 * @example
	 * ```typescript
	 * const checkpoint = await provider.loadLatest<MyState>('data-processing');
	 * if (checkpoint) {
	 *   console.log(`Resuming from checkpoint ${checkpoint.sequence}`);
	 *   console.log(`Progress: ${checkpoint.progress}%`);
	 *   return checkpoint.data; // Typed as MyState
	 * }
	 * ```
	 */
	async loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined> {
		const list = this.checkpoints.get(taskId) ?? [];
		return list[list.length - 1] as Checkpoint<T> | undefined;
	}

	/**
	 * Loads a specific checkpoint by its ID.
	 *
	 * @typeParam T - The expected type of checkpoint data
	 * @param checkpointId - The unique checkpoint ID
	 * @returns The checkpoint or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const checkpoint = await provider.load<MyState>('task-1-1234567890-5');
	 * ```
	 */
	async load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined> {
		for (const list of this.checkpoints.values()) {
			const found = list.find((cp) => cp.id === checkpointId);
			if (found) return found as Checkpoint<T>;
		}
		return undefined;
	}

	/**
	 * Lists all checkpoints for a task, sorted by sequence.
	 *
	 * @param taskId - The task ID to look up
	 * @returns Array of checkpoints for the task
	 *
	 * @example
	 * ```typescript
	 * const checkpoints = await provider.list('data-processing');
	 * for (const cp of checkpoints) {
	 *   console.log(`Checkpoint ${cp.sequence}: ${cp.progress}%`);
	 * }
	 * ```
	 */
	async list(taskId: string): Promise<Checkpoint<unknown>[]> {
		return [...(this.checkpoints.get(taskId) ?? [])];
	}

	/**
	 * Removes old checkpoints, keeping only the most recent ones.
	 *
	 * @param taskId - The task ID to clean up
	 * @param keepCount - Number of most recent checkpoints to keep
	 * @returns Promise that resolves when cleanup is complete
	 *
	 * @example
	 * ```typescript
	 * // Keep only the last 5 checkpoints
	 * await provider.cleanup('data-processing', 5);
	 * ```
	 */
	async cleanup(taskId: string, keepCount: number): Promise<void> {
		const list = this.checkpoints.get(taskId);
		if (!list || list.length <= keepCount) return;

		const sorted = list.sort((a, b) => a.sequence - b.sequence);
		const kept = sorted.slice(-keepCount);
		this.checkpoints.set(taskId, kept);
	}

	/**
	 * Deletes all checkpoints for a task.
	 *
	 * @param taskId - The task ID to delete
	 * @returns Promise that resolves when all checkpoints are deleted
	 *
	 * @example
	 * ```typescript
	 * // After task completes successfully, clean up checkpoints
	 * await provider.deleteAll('data-processing');
	 * ```
	 */
	async deleteAll(taskId: string): Promise<void> {
		this.checkpoints.delete(taskId);
	}
}

/**
 * Internal checkpoint state for task execution.
 *
 * This interface is used internally to track checkpoint state during task execution.
 *
 * @internal
 */
export interface CheckpointState<T> {
	/** The checkpoint provider used for persistence */
	provider: CheckpointProvider;
	/** The task ID for this checkpoint series */
	taskId: string;
	/** The current checkpoint data (if loaded) */
	current?: Checkpoint<T>;
	/** The sequence number for the next checkpoint */
	sequence: number;
	/** Maximum number of checkpoints to keep */
	maxCheckpoints: number;
	/** Callback when a checkpoint is saved */
	onCheckpoint?: (checkpoint: Checkpoint<T>) => void;
}

/**
 * Creates checkpoint context for task execution.
 *
 * This function creates the checkpoint object that is passed to tasks
 * with checkpoint support enabled.
 *
 * @internal
 * @typeParam T - The type of checkpoint data
 * @param state - The checkpoint state
 * @param state.provider - The checkpoint provider used for persistence
 * @param state.taskId - The task ID for this checkpoint series
 * @param state.current - The current checkpoint data (if loaded)
 * @param state.sequence - The sequence number for the next checkpoint
 * @param state.maxCheckpoints - Maximum number of checkpoints to keep
 * @param state.onCheckpoint - Callback when a checkpoint is saved
 * @returns An object with save function and current data
 *
 * @example
 * ```typescript
 * const checkpoint = createCheckpointContext<MyState>({
 *   provider,
 *   taskId: 'my-task',
 *   current: await provider.loadLatest('my-task'),
 *   sequence: 0,
 *   maxCheckpoints: 10
 * });
 *
 * // Access loaded data
 * console.log(checkpoint.data);
 *
 * // Save new state
 * await checkpoint.save({ processed: 100 });
 * ```
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
 * Creates progress tracking context for task execution.
 *
 * This function creates the progress object that is passed to tasks
 * with checkpoint support enabled.
 *
 * @internal
 * @returns A ProgressContext with update, get, and onUpdate methods
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
 * Checks if task options have checkpoint configuration.
 *
 * @internal
 * @param options - Task options to check
 * @returns `true` if checkpoint configuration is present
 */
export function hasCheckpointConfig(options?: TaskOptions): boolean {
	return options?.checkpoint !== undefined;
}

/**
 * Loads checkpoint for task resumption.
 *
 * @internal
 * @typeParam T - The type of checkpoint data
 * @param provider - The checkpoint provider
 * @param taskId - The task ID to resume
 * @param onResume - Optional callback when a checkpoint is loaded
 * @returns The latest checkpoint or undefined
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
 * Deletes all checkpoints for a task.
 *
 * @internal
 * @param provider - The checkpoint provider
 * @param taskId - The task ID to clean up
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
		 * Resumes a task from its last checkpoint.
		 *
		 * If a checkpoint exists for the task ID, the task will be executed
		 * with the checkpoint data available in the context. If no checkpoint
		 * exists, the task starts fresh with `checkpoint.data` as `undefined`.
		 *
		 * Use `requireExisting: true` to throw an error if no checkpoint exists.
		 *
		 * @typeParam T - The return type of the task
		 * @typeParam E - The error type
		 * @param taskId - The unique task ID to resume
		 * @param fn - The task function to execute
		 * @param options - Optional task options (excluding id) plus resume-specific options
		 * @returns Promise that resolves to a Result tuple `[Error | undefined, T | undefined]`
		 * @throws Error if `requireExisting` is true and no checkpoint exists
		 *
		 * @example
		 * ```typescript
		 * // Resume from last checkpoint (or start fresh if none exists)
		 * const [err, result] = await s.resumeTask('migration-job', async ({ checkpoint, progress }) => {
		 *   // checkpoint.data contains the saved state (or undefined if new)
		 *   const processed = checkpoint?.data?.processed ?? 0;
		 *
		 *   const data = await loadData();
		 *   for (let i = processed; i < data.length; i++) {
		 *     await processItem(data[i]);
		 *     progress.update((i / data.length) * 100);
		 *     await checkpoint.save({ processed: i });
		 *   }
		 *
		 *   return { total: data.length };
		 * });
		 *
		 * // Require an existing checkpoint (throws if none exists)
		 * const [err2, result2] = await s.resumeTask('migration-job', async ({ checkpoint }) => {
		 *   const processed = checkpoint.data.processed; // guaranteed to exist
		 * }, { requireExisting: true });
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
