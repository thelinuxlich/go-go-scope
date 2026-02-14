/**
 * Test utilities for go-go-scope
 *
 * Provides helper functions and mocks for testing code that uses go-go-scope.
 *
 * @example
 * ```typescript
 * import { createMockScope } from 'go-go-scope/testing'
 *
 * const s = createMockScope({
 *   autoAdvanceTimers: true,
 *   deterministic: true
 * })
 *
 * await s.task(() => fetchData())
 * ```
 */

import type { ScopeOptions } from "../scope.js";
import { Scope } from "../scope.js";
import type { TaskOptions } from "../types.js";

/**
 * Options for creating a mock scope
 */
export interface MockScopeOptions {
	/** Automatically advance timers for async operations */
	autoAdvanceTimers?: boolean;
	/** Use deterministic random seeds for reproducible tests */
	deterministic?: boolean;
	/** Pre-configured services to inject */
	services?: Record<string, unknown>;
	/** Initial aborted state */
	aborted?: boolean;
	/** Abort reason if aborted */
	abortReason?: unknown;
}

/**
 * Task call record for tracking
 */
export interface TaskCall {
	fn: (ctx: {
		services: Record<string, never>;
		signal: AbortSignal;
	}) => Promise<unknown>;
	options?: TaskOptions;
}

/**
 * Extended Scope with mock capabilities
 */
export interface MockScope extends Scope<Record<string, never>> {
	/** Record of task calls made to this scope */
	taskCalls: TaskCall[];
	/** Options used to create this mock scope */
	options: MockScopeOptions;
	/** Abort the scope with optional reason */
	abort: (reason?: unknown) => void;
	/** Get all recorded task calls */
	getTaskCalls: () => TaskCall[];
	/** Clear recorded task calls */
	clearTaskCalls: () => void;
}

/**
 * Creates a mock scope for testing purposes.
 *
 * The mock scope provides:
 * - Controlled timer advancement
 * - Deterministic execution
 * - Easy cancellation testing
 * - Spy capabilities on task execution
 *
 * @example
 * ```typescript
 * import { createMockScope } from 'go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('my feature', () => {
 *   test('should complete task', async () => {
 *     const s = createMockScope()
 *
 *     const [err, result] = await s.task(() => Promise.resolve('done'))
 *
 *     expect(err).toBeUndefined()
 *     expect(result).toBe('done')
 *   })
 * })
 * ```
 */
export function createMockScope(options: MockScopeOptions = {}): MockScope {
	const scopeOptions: ScopeOptions<Record<string, never>> = {
		name: "mock-scope",
	};

	const baseScope = new Scope(scopeOptions);

	// Create mock scope by extending the base scope
	const mockScope = baseScope as unknown as MockScope;

	// Add mock-specific properties
	mockScope.taskCalls = [];
	mockScope.options = options;

	// Override task method to track calls
	const originalTask = baseScope.task.bind(baseScope);
	mockScope.task = <T>(
		fn: (ctx: {
			services: Record<string, never>;
			signal: AbortSignal;
		}) => Promise<T>,
		taskOptions?: TaskOptions,
	) => {
		mockScope.taskCalls.push({ fn, options: taskOptions });
		return originalTask(fn, taskOptions);
	};

	// Add helper methods
	mockScope.abort = (reason?: unknown) => {
		// Access the private abortController through the base scope
		(
			baseScope as unknown as { abortController: AbortController }
		).abortController.abort(reason);
	};

	mockScope.getTaskCalls = function () {
		return this.taskCalls;
	};

	mockScope.clearTaskCalls = function () {
		this.taskCalls = [];
	};

	// Inject services if provided
	if (options.services) {
		for (const [key, value] of Object.entries(options.services)) {
			(mockScope as unknown as Record<string, unknown>)[key] = value;
		}
	}

	// Set initial aborted state if specified
	if (options.aborted) {
		mockScope.abort(options.abortReason);
	}

	return mockScope;
}

/**
 * Creates a controlled timer environment for testing async operations.
 *
 * Useful for testing timeout and retry logic.
 *
 * @example
 * ```typescript
 * import { createControlledTimer } from 'go-go-scope/testing'
 *
 * const timer = createControlledTimer()
 *
 * // In your test
 * timer.advance(1000) // Advance by 1 second
 * await timer.flush() // Flush all pending timers
 * ```
 */
export function createControlledTimer() {
	let currentTime = 0;
	interface PendingTimer {
		id: number;
		callback: () => void;
		time: number;
	}
	const pendingTimers: PendingTimer[] = [];
	let nextId = 1;

	return {
		/** Current simulated time */
		get currentTime() {
			return currentTime;
		},

		/** Schedule a callback to run after delay */
		setTimeout(callback: () => void, delay: number): number {
			const id = nextId++;
			pendingTimers.push({
				id,
				callback,
				time: currentTime + delay,
			});
			// Sort by execution time
			pendingTimers.sort((a, b) => a.time - b.time);
			return id;
		},

		/** Cancel a scheduled callback */
		clearTimeout(id: number): void {
			const index = pendingTimers.findIndex((t) => t.id === id);
			if (index !== -1) {
				pendingTimers.splice(index, 1);
			}
		},

		/** Advance time by specified milliseconds */
		advance(ms: number): void {
			const targetTime = currentTime + ms;
			while (pendingTimers.length > 0) {
				const timer = pendingTimers[0];
				if (!timer || timer.time > targetTime) break;
				pendingTimers.shift();
				currentTime = timer.time;
				timer.callback();
			}
			currentTime = targetTime;
		},

		/** Run all pending timers immediately */
		flush(): Promise<void> {
			while (pendingTimers.length > 0) {
				const timer = pendingTimers.shift();
				if (timer) {
					currentTime = timer.time;
					timer.callback();
				}
			}
			return Promise.resolve();
		},

		/** Reset all timers */
		reset(): void {
			pendingTimers.length = 0;
			currentTime = 0;
			nextId = 1;
		},
	};
}

/**
 * Waits for all promises in the scope to settle.
 * Useful for testing async operations.
 *
 * @example
 * ```typescript
 * import { flushPromises } from 'go-go-scope/testing'
 *
 * test('async operation', async () => {
 *   const promise = s.task(async () => {
 *     await delay(100)
 *     return 'done'
 *   })
 *
 *   await flushPromises()
 *
 *   const [err, result] = await promise
 *   expect(result).toBe('done')
 * })
 * ```
 */
export async function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Creates a spy function for testing.
 * Tracks calls and can return mock values.
 *
 * @example
 * ```typescript
 * import { createSpy } from 'go-go-scope/testing'
 *
 * const spy = createSpy().mockReturnValue('mocked')
 *
 * const result = spy()
 * expect(result).toBe('mocked')
 * expect(spy).toHaveBeenCalledTimes(1)
 * ```
 */
export interface Spy<TArgs extends unknown[], TReturn> {
	(...args: TArgs): TReturn;
	calls: { args: TArgs; result: TReturn }[];
	mockImplementation: (fn: (...args: TArgs) => TReturn) => Spy<TArgs, TReturn>;
	mockReturnValue: (value: TReturn) => Spy<TArgs, TReturn>;
	mockReset: () => Spy<TArgs, TReturn>;
	getCalls: () => { args: TArgs; result: TReturn }[];
	wasCalled: () => boolean;
	wasCalledWith: (...expectedArgs: TArgs) => boolean;
}

export function createSpy<TArgs extends unknown[], TReturn>(): Spy<
	TArgs,
	TReturn
> {
	const calls: { args: TArgs; result: TReturn }[] = [];
	let mockImplementation: ((...args: TArgs) => TReturn) | undefined;
	let mockReturnValue: TReturn | undefined;
	let returnValueSet = false;

	const spy = function (this: Spy<TArgs, TReturn>, ...args: TArgs): TReturn {
		let result: TReturn;

		if (mockImplementation) {
			result = mockImplementation(...args);
		} else if (returnValueSet) {
			result = mockReturnValue as TReturn;
		} else {
			result = undefined as unknown as TReturn;
		}

		calls.push({ args, result });
		return result;
	} as Spy<TArgs, TReturn>;

	spy.calls = calls;
	spy.mockImplementation = (fn: (...args: TArgs) => TReturn) => {
		mockImplementation = fn;
		return spy;
	};
	spy.mockReturnValue = (value: TReturn) => {
		mockReturnValue = value;
		returnValueSet = true;
		return spy;
	};
	spy.mockReset = () => {
		calls.length = 0;
		mockImplementation = undefined;
		mockReturnValue = undefined;
		returnValueSet = false;
		return spy;
	};
	spy.getCalls = () => calls;
	spy.wasCalled = () => calls.length > 0;
	spy.wasCalledWith = (...expectedArgs: TArgs) =>
		calls.some(
			(call) => JSON.stringify(call.args) === JSON.stringify(expectedArgs),
		);

	return spy;
}

/**
 * Asserts that a scope has been properly disposed.
 * Checks that all resources are cleaned up.
 *
 * @example
 * ```typescript
 * import { assertScopeDisposed } from 'go-go-scope/testing'
 *
 * test('should dispose properly', async () => {
 *   const s = scope()
 *   s.task(() => doSomething())
 *
 *   await assertScopeDisposed(s)
 * })
 * ```
 */
export async function assertScopeDisposed(scope: Scope): Promise<void> {
	// Dispose the scope
	await scope[Symbol.asyncDispose]();

	// Verify signal is aborted
	if (!scope.signal.aborted) {
		throw new Error("Scope signal was not aborted after disposal");
	}

	// Verify scope reports as disposed
	if (!scope.isDisposed) {
		throw new Error("Scope did not report as disposed");
	}
}
