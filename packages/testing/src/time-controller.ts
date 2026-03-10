/**
 * Time travel testing utilities for go-go-scope.
 *
 * Allows controlling time in tests for deterministic timeout and retry testing.
 * Useful for testing time-sensitive code without waiting for actual time to pass.
 *
 * @module @go-go-scope/testing/time-controller
 */

import type { Scope } from "go-go-scope";

/**
 * A controller for manipulating time in tests.
 * Use this to fast-forward through delays and timeouts without waiting.
 *
 * @example
 * ```typescript
 * import { createTimeController } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect, beforeEach, afterEach } from 'vitest'
 *
 * describe('time control', () => {
 *   let time: ReturnType<typeof createTimeController>
 *
 *   beforeEach(() => {
 *     time = createTimeController()
 *     time.install()
 *   })
 *
 *   afterEach(() => {
 *     time.uninstall()
 *   })
 *
 *   test('timeouts work', async () => {
 *     await using s = scope({ timeout: 5000 })
 *     const taskPromise = s.task(() => longOperation(), { timeout: 10000 })
 *
 *     // Fast forward 10 seconds instantly
 *     time.advance(10000)
 *
 *     // Task will have timed out
 *     const [err] = await taskPromise
 *     expect(err?.message).toContain('timeout')
 *   })
 * })
 * ```
 */
export interface TimeController {
	/** Current simulated time in milliseconds */
	readonly now: number;

	/**
	 * Advance time by the specified amount.
	 * Any pending timeouts scheduled within this time window will fire.
	 * @param ms - Milliseconds to advance
	 */
	advance(ms: number): void;

	/**
	 * Jump to a specific absolute time.
	 * All pending timeouts up to that point will fire.
	 * @param timestamp - Absolute time in milliseconds
	 */
	jumpTo(timestamp: number): void;

	/**
	 * Run all pending timeouts immediately.
	 * Equivalent to jumping to the time of the last scheduled timeout.
	 */
	runAll(): void;

	/**
	 * Reset time to 0 and clear all pending timeouts.
	 * Use this between tests to ensure isolation.
	 */
	reset(): void;

	/**
	 * Create a Promise that resolves after the specified delay.
	 * Respects time control - the promise won't resolve until time is advanced.
	 * @param ms - Delay in milliseconds
	 * @returns Promise that resolves after the delay
	 */
	delay(ms: number): Promise<void>;

	/**
	 * Install this controller as the global time source.
	 * Overrides Date.now, setTimeout, and clearTimeout globally.
	 * Call `uninstall()` to restore original behavior.
	 */
	install(): void;

	/**
	 * Uninstall this controller and restore original global time.
	 * Must be called after `install()` to clean up.
	 */
	uninstall(): void;
}

/**
 * Internal representation of a pending timeout.
 */
interface PendingTimeout {
	/** Unique identifier for the timeout */
	id: number;
	/** Callback to execute when the timeout fires */
	callback: () => void;
	/** Scheduled time when the timeout should fire */
	time: number;
}

/**
 * Creates a time controller for testing.
 * Provides fine-grained control over time without actually waiting.
 *
 * @returns A TimeController instance for manipulating simulated time
 *
 * @example
 * ```typescript
 * import { createTimeController } from '@go-go-scope/testing'
 * import { describe, test, expect, beforeEach, afterEach } from 'vitest'
 *
 * describe('with time control', () => {
 *   let time: ReturnType<typeof createTimeController>
 *
 *   beforeEach(() => {
 *     time = createTimeController()
 *   })
 *
 *   afterEach(() => {
 *     time.uninstall()
 *   })
 *
 *   test('timeouts work', async () => {
 *     time.install()
 *     await using s = scope({ timeout: 5000 })
 *
 *     // Fast forward past timeout
 *     time.advance(5001)
 *
 *     expect(s.signal.aborted).toBe(true)
 *   })
 *
 *   test('multiple timeouts', () => {
 *     time.install()
 *     const results: number[] = []
 *
 *     setTimeout(() => results.push(1), 100)
 *     setTimeout(() => results.push(2), 200)
 *     setTimeout(() => results.push(3), 300)
 *
 *     time.advance(250)
 *     expect(results).toEqual([1, 2])
 *
 *     time.advance(100)
 *     expect(results).toEqual([1, 2, 3])
 *   })
 *
 *   test('delay promise', async () => {
 *     const delayPromise = time.delay(1000)
 *     let resolved = false
 *     delayPromise.then(() => { resolved = true })
 *
 *     expect(resolved).toBe(false)
 *     time.advance(1000)
 *     await delayPromise
 *     expect(resolved).toBe(true)
 *   })
 * })
 * ```
 */
export function createTimeController(): TimeController {
	let currentTime = 0;
	const pendingTimeouts: PendingTimeout[] = [];
	let nextId = 1;
	let originalDateNow: (() => number) | undefined;
	let originalSetTimeout: typeof setTimeout | undefined;
	let originalClearTimeout: typeof clearTimeout | undefined;
	let installed = false;

	const processTimeouts = (upToTime: number): void => {
		// Sort by time
		pendingTimeouts.sort((a, b) => a.time - b.time);

		// Fire all timeouts up to the target time
		while (pendingTimeouts.length > 0) {
			const next = pendingTimeouts[0];
			if (!next || next.time > upToTime) break;

			pendingTimeouts.shift();
			currentTime = next.time;
			next.callback();
		}
	};

	return {
		get now() {
			return currentTime;
		},

		advance(ms: number): void {
			const targetTime = currentTime + ms;
			processTimeouts(targetTime);
			currentTime = targetTime;
		},

		jumpTo(timestamp: number): void {
			if (timestamp < currentTime) {
				throw new Error(
					`Cannot jump backwards in time: ${timestamp} < ${currentTime}`,
				);
			}
			processTimeouts(timestamp);
			currentTime = timestamp;
		},

		runAll(): void {
			if (pendingTimeouts.length === 0) return;

			// Sort and find max time
			pendingTimeouts.sort((a, b) => a.time - b.time);
			const lastTimeout = pendingTimeouts.at(-1);
			if (lastTimeout) {
				processTimeouts(lastTimeout.time);
			}
		},

		reset(): void {
			pendingTimeouts.length = 0;
			currentTime = 0;
			nextId = 1;
		},

		delay(ms: number): Promise<void> {
			return new Promise((resolve) => {
				const id = nextId++;
				pendingTimeouts.push({
					id,
					callback: resolve,
					time: currentTime + ms,
				});
			});
		},

		install(): void {
			if (installed) return;
			installed = true;

			// Store originals
			originalDateNow = Date.now;
			originalSetTimeout = globalThis.setTimeout;
			originalClearTimeout = globalThis.clearTimeout;

			// Override Date.now
			Date.now = () => currentTime;

			// Override setTimeout/clearTimeout
			// @ts-expect-error - Type mismatch due to Node.js setTimeout signature
			globalThis.setTimeout = (
				callback: () => void,
				delay = 0,
			): ReturnType<typeof setTimeout> => {
				const id = nextId++;
				pendingTimeouts.push({
					id,
					callback,
					time: currentTime + delay,
				});
				return id as unknown as ReturnType<typeof setTimeout>;
			};

			// @ts-expect-error - Type mismatch due to Node.js clearTimeout signature
			globalThis.clearTimeout = (id: ReturnType<typeof setTimeout>): void => {
				const index = pendingTimeouts.findIndex(
					(t) => t.id === (id as unknown as number),
				);
				if (index !== -1) {
					pendingTimeouts.splice(index, 1);
				}
			};
		},

		uninstall(): void {
			if (!installed) return;
			installed = false;

			if (originalDateNow) Date.now = originalDateNow;
			if (originalSetTimeout) globalThis.setTimeout = originalSetTimeout;
			if (originalClearTimeout) globalThis.clearTimeout = originalClearTimeout;
		},
	};
}

/**
 * Test helper that creates a scope with time control enabled.
 * Automatically installs the time controller and returns both the scope and controller.
 *
 * @param options - Configuration options for the test scope
 * @param options.timeout - Optional timeout in milliseconds for the scope (default: no timeout)
 * @param options.concurrency - Optional concurrency limit for the scope (default: no limit)
 * @returns Promise resolving to an object with scope and time controller
 *
 * @example
 * ```typescript
 * import { createTestScope } from '@go-go-scope/testing'
 * import { describe, test, expect, afterEach } from 'vitest'
 *
 * describe('with test scope', () => {
 *   test('task retries', async () => {
 *     const { scope, time } = await createTestScope({ timeout: 5000 })
 *
 *     let attempts = 0
 *     const task = scope.task(() => {
 *       attempts++
 *       if (attempts < 3) throw new Error('fail')
 *       return 'success'
 *     }, { retry: { max: 3, delay: 1000 } })
 *
 *     // Fast forward through retries
 *     time.advance(1000) // First retry
 *     time.advance(1000) // Second retry
 *
 *     const [err, result] = await task
 *     expect(result).toBe('success')
 *     expect(attempts).toBe(3)
 *   })
 *
 *   test('timeout handling', async () => {
 *     const { scope, time } = await createTestScope({ timeout: 1000 })
 *
 *     const task = scope.task(() => new Promise(() => {})) // Never resolves
 *
 *     time.advance(1001) // Past timeout
 *
 *     const [err] = await task
 *     expect(err).toBeDefined()
 *   })
 *
 *   test('concurrency with time', async () => {
 *     const { scope, time } = await createTestScope({ concurrency: 2 })
 *     const results: number[] = []
 *
 *     // Start multiple concurrent tasks
 *     scope.task(async () => {
 *       await time.delay(100)
 *       results.push(1)
 *     })
 *     scope.task(async () => {
 *       await time.delay(200)
 *       results.push(2)
 *     })
 *
 *     time.advance(150)
 *     expect(results).toEqual([1])
 *
 *     time.advance(100)
 *     expect(results).toEqual([1, 2])
 *   })
 * })
 * ```
 */
export async function createTestScope(options?: {
	timeout?: number;
	concurrency?: number;
}): Promise<{
	/** The created scope with time control installed */
	scope: Scope<Record<string, unknown>>;
	/** Time controller for manipulating time */
	time: TimeController;
}> {
	const time = createTimeController();
	time.install();

	const { scope } = await import("go-go-scope");
	const s = scope(options);

	return { scope: s, time };
}
