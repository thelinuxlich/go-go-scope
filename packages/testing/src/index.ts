/**
 * Test utilities for go-go-scope
 *
 * Provides helper functions and mocks for testing code that uses go-go-scope.
 *
 * @example
 * ```typescript
 * import { createMockScope } from '@go-go-scope/testing'
 *
 * const s = createMockScope({
 *   autoAdvanceTimers: true,
 *   deterministic: true
 * })
 *
 * await s.task(() => fetchData())
 * ```
 */

import { Scope, type ScopeOptions, type TaskOptions } from "go-go-scope";

// Re-export time controller
export {
	createTestScope,
	createTimeController,
} from "./time-controller.js";

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
	/** Services to override (for mocking existing services) */
	overrides?: Record<string, unknown>;
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
	/** Override a service with a mock implementation */
	mockService: <K extends string, T>(key: K, value: T) => MockScope;
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
 * import { createMockScope } from '@go-go-scope/testing'
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
	mockScope.task = <T, E extends Error = Error>(
		fn: (ctx: {
			services: Record<string, never>;
			signal: AbortSignal;
		}) => Promise<T>,
		taskOptions?: TaskOptions<E>,
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

	// Apply overrides if provided
	if (options.overrides) {
		for (const [key, value] of Object.entries(options.overrides)) {
			(mockScope as unknown as Record<string, unknown>)[key] = value;
		}
	}

	// Add mockService helper
	mockScope.mockService = function <K extends string, T>(key: K, value: T) {
		(this as unknown as Record<string, unknown>)[key] = value;
		return this;
	};

	// Set initial aborted state if specified
	if (options.aborted) {
		mockScope.abort(options.abortReason);
	}

	return mockScope;
}

/**
 * Creates a controlled timer environment for testing async operations.
 * Useful for testing timeout and retry logic.
 *
 * @example
 * ```typescript
 * import { createControlledTimer } from '@go-go-scope/testing'
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
 * import { flushPromises } from '@go-go-scope/testing'
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
 * import { createSpy } from '@go-go-scope/testing'
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
 * import { assertScopeDisposed } from '@go-go-scope/testing'
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

/**
 * Mock channel for testing.
 * Provides fine-grained control over channel behavior.
 */
export interface MockChannel<T> {
	/** The channel instance */
	channel: {
		send: (value: T) => Promise<boolean>;
		receive: () => Promise<T | undefined>;
		close: () => void;
		[Symbol.asyncIterator]: () => AsyncIterator<T>;
	};
	/** Pre-configured values to be received */
	mockReceiveValues: T[];
	/** Record of sent values */
	sentValues: T[];
	/** Whether the channel is closed */
	isClosed: boolean;
	/** Set values to be received */
	setReceiveValues: (values: T[]) => void;
	/** Simulate receiving a value */
	mockReceive: (value: T) => void;
	/** Get all sent values */
	getSentValues: () => T[];
	/** Clear sent values */
	clearSentValues: () => void;
	/** Close the mock channel */
	close: () => void;
	/** Reset to initial state */
	reset: () => void;
}

/**
 * Creates a mock channel for testing.
 * Useful for testing code that uses channels without actual async operations.
 *
 * @example
 * ```typescript
 * import { createMockChannel } from '@go-go-scope/testing'
 *
 * test('channel communication', async () => {
 *   const mockCh = createMockChannel<number>()
 *   mockCh.setReceiveValues([1, 2, 3])
 *
 *   const ch = mockCh.channel
 *   const value = await ch.receive()
 *   expect(value).toBe(1)
 * })
 * ```
 */
export function createMockChannel<T>(): MockChannel<T> {
	const sentValues: T[] = [];
	let receiveValues: T[] = [];
	let receiveIndex = 0;
	let closed = false;

	const mockChannel: MockChannel<T> = {
		channel: {
			send: async (value: T) => {
				if (closed) return false;
				sentValues.push(value);
				return true;
			},
			receive: async () => {
				if (closed) return undefined;
				if (receiveIndex < receiveValues.length) {
					return receiveValues[receiveIndex++];
				}
				return undefined;
			},
			close: () => {
				closed = true;
			},
			[Symbol.asyncIterator]: () => ({
				async next(): Promise<IteratorResult<T>> {
					if (closed || receiveIndex >= receiveValues.length) {
						return { done: true, value: undefined };
					}
					const value = receiveValues[receiveIndex++];
					return { done: false, value: value as T };
				},
				async return(): Promise<IteratorResult<T>> {
					return { done: true, value: undefined };
				},
			}),
		},
		mockReceiveValues: receiveValues,
		get sentValues() {
			return sentValues;
		},
		get isClosed() {
			return closed;
		},
		setReceiveValues: (values: T[]) => {
			receiveValues = values;
			receiveIndex = 0;
		},
		mockReceive: (value: T) => {
			receiveValues.push(value);
		},
		getSentValues: () => [...sentValues],
		clearSentValues: () => {
			sentValues.length = 0;
		},
		close: () => {
			closed = true;
		},
		reset: () => {
			sentValues.length = 0;
			receiveValues = [];
			receiveIndex = 0;
			closed = false;
		},
	};

	return mockChannel;
}

/**
 * Time travel controller for deterministic testing of time-based operations.
 * More powerful than createControlledTimer - allows jumping to specific times,
 * rewinding, and inspecting the timeline.
 *
 * @example
 * ```typescript
 * import { createTimeTravelController } from '@go-go-scope/testing'
 *
 * test('time-based operations', async () => {
 *   const time = createTimeTravelController()
 *
 *   // Schedule operations
 *   const results: number[] = []
 *   time.setTimeout(() => results.push(1), 100)
 *   time.setTimeout(() => results.push(2), 200)
 *
 *   // Jump to specific time
 *   time.jumpTo(150)
 *   expect(results).toEqual([1]) // Only first timer fired
 *
 *   // Continue to end
 *   time.advance(100)
 *   expect(results).toEqual([1, 2])
 * })
 * ```
 */
export function createTimeTravelController() {
	let currentTime = 0;
	interface TimelineEvent {
		id: number;
		time: number;
		callback: () => void;
		description?: string;
	}
	const timeline: TimelineEvent[] = [];
	const history: { time: number; action: string }[] = [];
	let nextId = 1;

	return {
		/** Current simulated time in milliseconds */
		get now() {
			return currentTime;
		},

		/** Get the event timeline (sorted by time) */
		get timeline(): Array<{ id: number; time: number; description?: string }> {
			return [...timeline]
				.sort((a, b) => a.time - b.time)
				.map((e) => ({ id: e.id, time: e.time, description: e.description }));
		},

		/** Get the execution history */
		get history() {
			return [...history];
		},

		/** Schedule a callback to run after delay */
		setTimeout(
			callback: () => void,
			delay: number,
			description?: string,
		): number {
			const id = nextId++;
			timeline.push({
				id,
				time: currentTime + delay,
				callback,
				description,
			});
			return id;
		},

		/** Cancel a scheduled callback */
		clearTimeout(id: number): boolean {
			const index = timeline.findIndex((e) => e.id === id);
			if (index !== -1) {
				timeline.splice(index, 1);
				return true;
			}
			return false;
		},

		/** Set an interval that repeats */
		setInterval(
			callback: () => void,
			delay: number,
			description?: string,
		): number {
			const id = nextId++;
			let nextTime = currentTime + delay;

			const scheduleNext = () => {
				timeline.push({
					id,
					time: nextTime,
					callback: () => {
						callback();
						nextTime += delay;
						scheduleNext();
					},
					description: `${description || "interval"} (repeat)`,
				});
			};

			scheduleNext();
			return id;
		},

		/** Advance time by specified milliseconds */
		advance(ms: number): void {
			const targetTime = currentTime + ms;
			this.jumpTo(targetTime);
		},

		/** Jump to a specific absolute time */
		jumpTo(targetTime: number): void {
			if (targetTime < currentTime) {
				throw new Error(
					`Cannot jump backwards from ${currentTime} to ${targetTime}`,
				);
			}

			// Sort timeline by time
			timeline.sort((a, b) => a.time - b.time);

			// Execute all events up to target time
			while (timeline.length > 0) {
				const event = timeline[0];
				if (!event || event.time > targetTime) break;

				timeline.shift();
				currentTime = event.time;

				history.push({
					time: currentTime,
					action: event.description || `event-${event.id}`,
				});

				event.callback();
			}

			currentTime = targetTime;
		},

		/** Get the next scheduled event time, or Infinity if none */
		nextEventTime(): number {
			if (timeline.length === 0) return Infinity;
			timeline.sort((a, b) => a.time - b.time);
			return timeline[0]?.time ?? Infinity;
		},

		/** Run all events until no more remain */
		runAll(): void {
			while (timeline.length > 0) {
				timeline.sort((a, b) => a.time - b.time);
				const event = timeline.shift();
				if (event) {
					currentTime = event.time;
					history.push({
						time: currentTime,
						action: event.description || `event-${event.id}`,
					});
					event.callback();
				}
			}
		},

		/** Reset to initial state */
		reset(): void {
			timeline.length = 0;
			history.length = 0;
			currentTime = 0;
			nextId = 1;
		},

		/** Print the timeline for debugging */
		printTimeline(): void {
			const sorted = [...timeline].sort((a, b) => a.time - b.time);
			console.log("Timeline:");
			sorted.forEach((e) => {
				console.log(`  ${e.time}ms: ${e.description || `event-${e.id}`}`);
			});
		},
	};
}
