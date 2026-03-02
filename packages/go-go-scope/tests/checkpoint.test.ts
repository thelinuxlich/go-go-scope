/**
 * Tests for checkpoint/resume functionality
 */

import { describe, expect, test, vi } from "vitest";
import {
	createCheckpointContext,
	createProgressContext,
	InMemoryCheckpointProvider,
	scope,
} from "../src/index.js";
import type { Checkpoint } from "../src/persistence/types.js";

describe("checkpoint", () => {
	describe("InMemoryCheckpointProvider", () => {
		test("should save and load checkpoint", async () => {
			const provider = new InMemoryCheckpointProvider();
			const checkpoint: Checkpoint<{ count: number }> = {
				id: "task-1-1234567890-1",
				taskId: "task-1",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
				estimatedTimeRemaining: 5000,
			};

			await provider.save(checkpoint);
			const loaded = await provider.loadLatest<{ count: number }>("task-1");

			expect(loaded).toBeDefined();
			expect(loaded?.data.count).toBe(100);
			expect(loaded?.progress).toBe(50);
		});

		test("should return undefined for non-existent checkpoint", async () => {
			const provider = new InMemoryCheckpointProvider();
			const loaded = await provider.loadLatest("non-existent");
			expect(loaded).toBeUndefined();
		});

		test("should list checkpoints in order", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "task-1-1",
				taskId: "task-1",
				sequence: 1,
				timestamp: 1000,
				progress: 25,
				data: { step: 1 },
			});
			await provider.save({
				id: "task-1-2",
				taskId: "task-1",
				sequence: 2,
				timestamp: 2000,
				progress: 50,
				data: { step: 2 },
			});
			await provider.save({
				id: "task-1-3",
				taskId: "task-1",
				sequence: 3,
				timestamp: 3000,
				progress: 75,
				data: { step: 3 },
			});

			const list = await provider.list("task-1");
			expect(list).toHaveLength(3);
			expect(list[0].sequence).toBe(1);
			expect(list[1].sequence).toBe(2);
			expect(list[2].sequence).toBe(3);
		});

		test("should load latest checkpoint", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "task-1-1",
				taskId: "task-1",
				sequence: 1,
				timestamp: 1000,
				progress: 25,
				data: { step: 1 },
			});
			await provider.save({
				id: "task-1-2",
				taskId: "task-1",
				sequence: 2,
				timestamp: 2000,
				progress: 50,
				data: { step: 2 },
			});

			const latest = await provider.loadLatest("task-1");
			expect(latest?.sequence).toBe(2);
			expect(latest?.data).toEqual({ step: 2 });
		});

		test("should cleanup old checkpoints", async () => {
			const provider = new InMemoryCheckpointProvider();

			for (let i = 1; i <= 5; i++) {
				await provider.save({
					id: `task-1-${i}`,
					taskId: "task-1",
					sequence: i,
					timestamp: i * 1000,
					progress: i * 20,
					data: { step: i },
				});
			}

			await provider.cleanup("task-1", 3);
			const list = await provider.list("task-1");

			expect(list).toHaveLength(3);
			expect(list[0].sequence).toBe(3);
			expect(list[1].sequence).toBe(4);
			expect(list[2].sequence).toBe(5);
		});

		test("should delete all checkpoints for a task", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "task-1-1",
				taskId: "task-1",
				sequence: 1,
				timestamp: 1000,
				progress: 50,
				data: { step: 1 },
			});

			await provider.deleteAll("task-1");
			const loaded = await provider.loadLatest("task-1");

			expect(loaded).toBeUndefined();
		});

		test("should load specific checkpoint by id", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "specific-id",
				taskId: "task-1",
				sequence: 1,
				timestamp: 1000,
				progress: 50,
				data: { step: 1 },
			});

			const loaded = await provider.load("specific-id");
			expect(loaded?.id).toBe("specific-id");
		});
	});

	describe("createCheckpointContext", () => {
		test("should create checkpoint with save function", async () => {
			const provider = new InMemoryCheckpointProvider();
			const state = {
				provider,
				taskId: "task-1",
				sequence: 0,
				maxCheckpoints: 10,
			};

			const ctx = createCheckpointContext(state);
			expect(ctx.save).toBeDefined();
			expect(ctx.data).toBeUndefined();
		});

		test("should save checkpoint data", async () => {
			const provider = new InMemoryCheckpointProvider();
			const state = {
				provider,
				taskId: "task-1",
				sequence: 0,
				maxCheckpoints: 10,
			};

			const ctx = createCheckpointContext(state);
			await ctx.save({ count: 42 });

			const loaded = await provider.loadLatest("task-1");
			expect(loaded?.data).toEqual({ count: 42 });
			expect(loaded?.sequence).toBe(1);
		});

		test("should call onCheckpoint callback", async () => {
			const provider = new InMemoryCheckpointProvider();
			const onCheckpoint = vi.fn();
			const state = {
				provider,
				taskId: "task-1",
				sequence: 0,
				maxCheckpoints: 10,
				onCheckpoint,
			};

			const ctx = createCheckpointContext(state);
			await ctx.save({ count: 42 });

			expect(onCheckpoint).toHaveBeenCalledTimes(1);
			expect(onCheckpoint).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: "task-1",
					sequence: 1,
					data: { count: 42 },
				}),
			);
		});

		test("should provide current checkpoint data", async () => {
			const provider = new InMemoryCheckpointProvider();
			const state = {
				provider,
				taskId: "task-1",
				sequence: 0,
				maxCheckpoints: 10,
			};

			const ctx = createCheckpointContext(state);
			await ctx.save({ count: 42 });

			// Re-create context with loaded checkpoint
			const loaded = await provider.loadLatest("task-1");
			const state2 = {
				provider,
				taskId: "task-1",
				current: loaded,
				sequence: loaded?.sequence ?? 0,
				maxCheckpoints: 10,
			};
			const ctx2 = createCheckpointContext(state2);

			expect(ctx2.data).toEqual({ count: 42 });
		});
	});

	describe("createProgressContext", () => {
		test("should track progress updates", () => {
			const ctx = createProgressContext();

			ctx.update(50);
			const progress = ctx.get();

			expect(progress.percentage).toBe(50);
		});

		test("should call onUpdate listeners", () => {
			const ctx = createProgressContext();
			const listener = vi.fn();

			const unsubscribe = ctx.onUpdate(listener);
			ctx.update(75);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({ percentage: 75 }),
			);

			unsubscribe();
			ctx.update(100);

			// Listener should not be called after unsubscribe
			expect(listener).toHaveBeenCalledTimes(1);
		});

		test("should calculate ETA", async () => {
			const ctx = createProgressContext();

			ctx.update(25);
			await new Promise((r) => setTimeout(r, 10));
			ctx.update(50);

			const progress = ctx.get();
			// ETA should be approximately equal to elapsed time (since we're 50% done)
			expect(progress.eta).toBeDefined();
			expect(progress.eta).toBeGreaterThan(0);
		});
	});

	describe("scope.task with checkpoint", () => {
		test("should inject checkpoint and progress when provider configured", async () => {
			await using s = scope({
				persistence: { checkpoint: new InMemoryCheckpointProvider() },
			});

			let receivedCheckpoint: unknown;
			let receivedProgress: unknown;

			const [err] = await s.task(
				async ({ checkpoint, progress }) => {
					receivedCheckpoint = checkpoint;
					receivedProgress = progress;
					return "done";
				},
				{ id: "test-task", checkpoint: {} },
			);

			expect(err).toBeUndefined();
			expect(receivedCheckpoint).toBeDefined();
			expect(receivedProgress).toBeDefined();
		});

		test("should NOT inject checkpoint when no provider configured", async () => {
			await using s = scope();

			let receivedCheckpoint: unknown;
			let receivedProgress: unknown;

			const [err] = await s.task(
				async ({ checkpoint, progress }) => {
					receivedCheckpoint = checkpoint;
					receivedProgress = progress;
					return "done";
				},
				{ id: "test-task", checkpoint: {} },
			);

			expect(err).toBeUndefined();
			expect(receivedCheckpoint).toBeUndefined();
			expect(receivedProgress).toBeUndefined();
		});

		test("should NOT inject checkpoint when no checkpoint option provided", async () => {
			await using s = scope({
				persistence: { checkpoint: new InMemoryCheckpointProvider() },
			});

			let receivedCheckpoint: unknown;
			let receivedProgress: unknown;

			const [err] = await s.task(
				async ({ checkpoint, progress }) => {
					receivedCheckpoint = checkpoint;
					receivedProgress = progress;
					return "done";
				},
				{ id: "test-task" },
			);

			expect(err).toBeUndefined();
			expect(receivedCheckpoint).toBeUndefined();
			expect(receivedProgress).toBeUndefined();
		});

		test("should save checkpoint data", async () => {
			const provider = new InMemoryCheckpointProvider();
			let savedData: unknown;

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			const [err] = await s.task(
				async ({ checkpoint }) => {
					await checkpoint?.save({ step: 1 });
					// Verify checkpoint was saved during task execution
					const current = await provider.loadLatest("test-task");
					savedData = current?.data;
					return "done";
				},
				{ id: "test-task", checkpoint: {} },
			);

			expect(err).toBeUndefined();
			expect(savedData).toEqual({ step: 1 });
			// Note: Checkpoints are cleaned up after successful task completion
			const afterTask = await provider.loadLatest("test-task");
			expect(afterTask).toBeUndefined();
		});

		test("should call onCheckpoint callback", async () => {
			const onCheckpoint = vi.fn();
			await using s = scope({
				persistence: { checkpoint: new InMemoryCheckpointProvider() },
			});

			const [err] = await s.task(
				async ({ checkpoint }) => {
					await checkpoint?.save({ step: 1 });
					return "done";
				},
				{
					id: "test-task",
					checkpoint: { onCheckpoint },
				},
			);

			expect(err).toBeUndefined();
			expect(onCheckpoint).toHaveBeenCalledTimes(1);
		});

		test("should load existing checkpoint data on resume", async () => {
			const provider = new InMemoryCheckpointProvider();

			// First, create a checkpoint
			await provider.save({
				id: "test-task-1",
				taskId: "test-task",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
			});

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			let loadedData: unknown;
			const onResume = vi.fn();

			const [err] = await s.task(
				async ({ checkpoint }) => {
					loadedData = checkpoint?.data;
					return "done";
				},
				{
					id: "test-task",
					checkpoint: { onResume },
				},
			);

			expect(err).toBeUndefined();
			expect(loadedData).toEqual({ count: 100 });
			expect(onResume).toHaveBeenCalledTimes(1);
		});

		test("should cleanup checkpoints on task success", async () => {
			const provider = new InMemoryCheckpointProvider();

			// Pre-populate a checkpoint
			await provider.save({
				id: "test-task-1",
				taskId: "test-task",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
			});

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			const [err] = await s.task(
				async () => {
					return "success";
				},
				{ id: "test-task", checkpoint: {} },
			);

			expect(err).toBeUndefined();

			// Checkpoints should be cleaned up on success
			const remaining = await provider.list("test-task");
			expect(remaining).toHaveLength(0);
		});

		test("should NOT cleanup checkpoints on task failure", async () => {
			const provider = new InMemoryCheckpointProvider();

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			const [err] = await s.task(
				async ({ checkpoint }) => {
					await checkpoint?.save({ step: 1 });
					throw new Error("Task failed");
				},
				{ id: "test-task", checkpoint: {} },
			);

			expect(err).toBeDefined();

			// Checkpoints should remain for retry
			const remaining = await provider.list("test-task");
			expect(remaining).toHaveLength(1);
		});
	});

	describe("scope.resumeTask", () => {
		test("should throw if no checkpoint provider configured", async () => {
			await using s = scope();

			await expect(
				s.resumeTask("test-task", async () => "done"),
			).rejects.toThrow("No checkpoint provider configured");
		});

		test("should start fresh if no checkpoint exists", async () => {
			await using s = scope({
				persistence: { checkpoint: new InMemoryCheckpointProvider() },
			});

			let checkpointData: unknown;

			const [err] = await s.resumeTask("new-task", async ({ checkpoint }) => {
				checkpointData = checkpoint?.data;
				return "done";
			});

			expect(err).toBeUndefined();
			expect(checkpointData).toBeUndefined();
		});

		test("should resume from existing checkpoint", async () => {
			const provider = new InMemoryCheckpointProvider();

			// Pre-populate a checkpoint
			await provider.save({
				id: "task-1",
				taskId: "existing-task",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
			});

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			let checkpointData: unknown;
			const onResume = vi.fn();

			const [err] = await s.resumeTask(
				"existing-task",
				async ({ checkpoint }) => {
					checkpointData = checkpoint?.data;
					return "done";
				},
				{ checkpoint: { onResume } },
			);

			expect(err).toBeUndefined();
			expect(checkpointData).toEqual({ count: 100 });
			expect(onResume).toHaveBeenCalledTimes(1);
		});

		test("should throw with requireExisting if no checkpoint", async () => {
			await using s = scope({
				persistence: { checkpoint: new InMemoryCheckpointProvider() },
			});

			await expect(
				s.resumeTask("non-existent-task", async () => "done", {
					requireExisting: true,
				}),
			).rejects.toThrow("No checkpoint found for task ID: non-existent-task");
		});

		test("should NOT throw with requireExisting if checkpoint exists", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "task-1",
				taskId: "existing-task",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
			});

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			const [err] = await s.resumeTask(
				"existing-task",
				async ({ checkpoint }) => {
					return checkpoint?.data;
				},
				{ requireExisting: true },
			);

			expect(err).toBeUndefined();
		});

		test("should use task ID from resumeTask parameter", async () => {
			const provider = new InMemoryCheckpointProvider();

			await provider.save({
				id: "task-1",
				taskId: "my-task-id",
				sequence: 1,
				timestamp: Date.now(),
				progress: 50,
				data: { count: 100 },
			});

			await using s = scope({
				persistence: { checkpoint: provider },
			});

			let loadedData: unknown;

			// Using different ID in resumeTask than the checkpoint
			const [err] = await s.resumeTask("my-task-id", async ({ checkpoint }) => {
				loadedData = checkpoint?.data;
				return "done";
			});

			expect(err).toBeUndefined();
			expect(loadedData).toEqual({ count: 100 });
		});
	});

	describe("integration - data migration scenario", () => {
		test("should process items with checkpointing", async () => {
			const provider = new InMemoryCheckpointProvider();
			await using s = scope({
				persistence: { checkpoint: provider },
			});

			const items = [1, 2, 3, 4, 5];
			const processed: number[] = [];
			let checkpointCount = 0;

			const [err] = await s.task(
				async ({ checkpoint, progress }) => {
					// Start from checkpoint or beginning
					const startIndex = checkpoint?.data?.lastIndex ?? 0;

					for (let i = startIndex; i < items.length; i++) {
						processed.push(items[i]);
						progress.update(((i + 1) / items.length) * 100);

						// Checkpoint every 2 items
						if ((i + 1) % 2 === 0) {
							await checkpoint?.save({ lastIndex: i + 1 });
							// Verify checkpoint was saved
							const current = await provider.list("migration-task");
							checkpointCount = current.length;
						}
					}

					return { total: items.length };
				},
				{ id: "migration-task", checkpoint: {} },
			);

			expect(err).toBeUndefined();
			expect(processed).toEqual([1, 2, 3, 4, 5]);
			// Checkpoints were saved during task execution
			expect(checkpointCount).toBeGreaterThan(0);
			// But cleaned up after successful completion
			const afterTask = await provider.list("migration-task");
			expect(afterTask.length).toBe(0);
		});

		test("should resume from checkpoint after failure", async () => {
			const provider = new InMemoryCheckpointProvider();
			const items = [1, 2, 3, 4, 5];

			// First attempt - fails after processing item 3
			{
				await using s = scope({
					persistence: { checkpoint: provider },
				});

				await s.task(
					async ({ checkpoint }) => {
						const startIndex = checkpoint?.data?.lastIndex ?? 0;

						for (let i = startIndex; i < items.length; i++) {
							// Save checkpoint before processing
							await checkpoint?.save({ lastIndex: i });

							// Fail at item 3
							if (items[i] === 3) {
								throw new Error("Failed at item 3");
							}
						}
					},
					{ id: "resume-task", checkpoint: {} },
				);
			}

			// Second attempt - resumes from checkpoint
			{
				await using s = scope({
					persistence: { checkpoint: provider },
				});

				const processed: number[] = [];

				const [err] = await s.resumeTask(
					"resume-task",
					async ({ checkpoint }) => {
						const startIndex = checkpoint?.data?.lastIndex ?? 0;

						for (let i = startIndex; i < items.length; i++) {
							processed.push(items[i]);
							await checkpoint?.save({ lastIndex: i + 1 });
						}

						return processed;
					},
				);

				expect(err).toBeUndefined();
				// Should resume from item 3 (index 2)
				expect(processed).toEqual([3, 4, 5]);
			}
		});
	});
});
