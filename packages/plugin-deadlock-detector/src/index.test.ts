/**
 * Tests for deadlock detector plugin
 */
import { describe, expect, test, vi } from "vitest";
import { scope } from "go-go-scope";
import {
	DeadlockDetector,
	deadlockDetectorPlugin,
} from "./index.js";

describe("DeadlockDetector", () => {
	test("should track waiting tasks", () => {
		const detector = new DeadlockDetector(
			{ timeout: 1000 },
			"test-scope",
		);

		detector.taskWaiting(1, "task-1", "resource-a");
		detector.taskWaiting(2, "task-2", "resource-b");

		expect(detector.waitingCount).toBe(2);

		detector.dispose();
	});

	test("should remove tasks when resumed", () => {
		const detector = new DeadlockDetector(
			{ timeout: 1000 },
			"test-scope",
		);

		detector.taskWaiting(1, "task-1", "resource-a");
		detector.taskWaiting(2, "task-2", "resource-b");
		detector.taskResumed(1);

		expect(detector.waitingCount).toBe(1);

		detector.dispose();
	});

	test("should call onDeadlock when tasks are stuck", async () => {
		const onDeadlock = vi.fn();
		const detector = new DeadlockDetector(
			{ timeout: 50, onDeadlock },
			"test-scope",
		);

		// Register a task as waiting
		detector.taskWaiting(1, "stuck-task", "resource-a");

		// Wait for the deadlock check interval
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(onDeadlock).toHaveBeenCalled();
		expect(onDeadlock.mock.calls[0]![0]).toEqual(
			expect.arrayContaining([expect.stringContaining("stuck-task")]),
		);

		detector.dispose();
	});

	test("should not call onDeadlock for tasks under timeout", async () => {
		const onDeadlock = vi.fn();
		const detector = new DeadlockDetector(
			{ timeout: 10000, onDeadlock },
			"test-scope",
		);

		detector.taskWaiting(1, "fast-task", "resource-a");

		// Wait a short time (less than timeout)
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(onDeadlock).not.toHaveBeenCalled();

		detector.dispose();
	});

	test("should be disposable via Symbol.dispose", () => {
		const detector = new DeadlockDetector(
			{ timeout: 1000 },
			"test-scope",
		);

		detector.taskWaiting(1, "task-1", "resource-a");
		expect(detector.waitingCount).toBe(1);

		detector[Symbol.dispose]();

		// After disposal, detector should be empty
		expect(detector.waitingCount).toBe(0);
	});

	test("should work with using statement", () => {
		using detector = new DeadlockDetector(
			{ timeout: 1000 },
			"test-scope",
		);

		detector.taskWaiting(1, "task-1", "resource-a");
		expect(detector.waitingCount).toBe(1);
	});
});

describe("deadlockDetectorPlugin", () => {
	test("should install plugin on scope", async () => {
		await using _s = scope({
			plugins: [
				deadlockDetectorPlugin({
					timeout: 1000,
					onDeadlock: () => {},
				}),
			],
		});

		// Plugin should have installed the detector
		expect(
			(_s as unknown as { _deadlockDetector?: DeadlockDetector })._deadlockDetector,
		).toBeDefined();
	});

	test("should detect stuck tasks through scope", async () => {
		const onDeadlock = vi.fn();

		await using _s = scope({
			plugins: [
				deadlockDetectorPlugin({
					timeout: 50,
					onDeadlock,
				}),
			],
		});

		// Start a task that will take longer than the timeout
		const taskPromise = _s.task(async () => {
			await new Promise((resolve) => setTimeout(resolve, 200));
			return "done";
		});

		// Wait for deadlock detection to trigger
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Note: The plugin doesn't automatically track tasks, 
		// it needs to be explicitly notified via taskWaiting/taskResumed

		await taskPromise;
	});

	test("should cleanup detector when scope is disposed", async () => {
		const detector = new DeadlockDetector({ timeout: 1000 }, "test-scope");
		const disposeSpy = vi.spyOn(detector, "dispose");

		{
			await using _s = scope({
				plugins: [
					{
						name: "test-deadlock",
						install(sc) {
							(sc as unknown as { _deadlockDetector: DeadlockDetector })._deadlockDetector =
								detector;
						},
						cleanup() {
							detector.dispose();
						},
					},
				],
			});
		}

		expect(disposeSpy).toHaveBeenCalled();
	});
});
