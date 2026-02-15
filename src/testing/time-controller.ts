/**
 * Time travel testing utilities for go-go-scope
 *
 * Allows controlling time in tests for deterministic timeout and retry testing.
 */

/**
 * A controller for manipulating time in tests.
 * Use this to fast-forward through delays and timeouts without waiting.
 *
 * @example
 * ```typescript
 * const time = createTimeController()
 *
 * await using s = scope({ timeout: 5000 })
 * const taskPromise = s.task(() => longOperation(), { timeout: 10000 })
 *
 * // Fast forward 10 seconds instantly
 * time.advance(10000)
 *
 * // Task will have timed out
 * const [err] = await taskPromise
 * expect(err?.message).toContain('timeout')
 * ```
 */
export interface TimeController {
	/** Current simulated time in milliseconds */
	readonly now: number;

	/**
	 * Advance time by the specified amount.
	 * Any pending timeouts scheduled within this time window will fire.
	 */
	advance(ms: number): void;

	/**
	 * Jump to a specific absolute time.
	 * All pending timeouts up to that point will fire.
	 */
	jumpTo(timestamp: number): void;

	/**
	 * Run all pending timeouts immediately.
	 */
	runAll(): void;

	/**
	 * Reset time to 0 and clear all pending timeouts.
	 */
	reset(): void;

	/**
	 * Create a Promise that resolves after the specified delay.
	 * Respects time control.
	 */
	delay(ms: number): Promise<void>;

	/**
	 * Install this controller as the global time source.
	 * Call `uninstall()` to restore original behavior.
	 */
	install(): void;

	/**
	 * Uninstall this controller and restore original global time.
	 */
	uninstall(): void;
}

interface PendingTimeout {
	id: number;
	callback: () => void;
	time: number;
}

/**
 * Create a time controller for testing.
 *
 * @example
 * ```typescript
 * describe('with time control', () => {
 *   const time = createTimeController()
 *
 *   afterEach(() => {
 *     time.reset()
 *   })
 *
 *   test('timeouts work', async () => {
 *     await using s = scope({ timeout: 5000 })
 *
 *     // Fast forward past timeout
 *     time.advance(5001)
 *
 *     expect(s.signal.aborted).toBe(true)
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
			const lastTimeout = pendingTimeouts[pendingTimeouts.length - 1];
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
 * Useful for testing timeout and retry logic.
 *
 * @example
 * ```typescript
 * test('task retries', async () => {
 *   const { scope, time } = createTestScope({ timeout: 5000 })
 *
 *   let attempts = 0
 *   const task = scope.task(() => {
 *     attempts++
 *     if (attempts < 3) throw new Error('fail')
 *     return 'success'
 *   }, { retry: { maxRetries: 3, delay: 1000 } })
 *
 *   // Fast forward through retries
 *   time.advance(1000) // First retry
 *   time.advance(1000) // Second retry
 *
 *   const [err, result] = await task
 *   expect(result).toBe('success')
 * })
 * ```
 */
export function createTestScope(options?: {
	timeout?: number;
	concurrency?: number;
}): {
	scope: import("../scope.js").Scope;
	time: TimeController;
} {
	const time = createTimeController();
	time.install();

	const { scope } = require("../scope.js");
	const s = scope(options);

	return { scope: s, time };
}
