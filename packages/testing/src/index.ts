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
 *
 * @module @go-go-scope/testing
 */

import { Scope, type ScopeOptions, type TaskOptions } from "go-go-scope";

// Re-export assertion helpers
export {
	assertRejects,
	assertResolves,
	assertResolvesWithin,
	expectTask,
} from "./assertions.js";
// Re-export time controller
export {
	createTestScope,
	createTimeController,
} from "./time-controller.js";

/**
 * Options for creating a mock scope.
 * Use these options to configure the behavior of the mock scope for testing.
 *
 * @example
 * ```typescript
 * import { createMockScope } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('my tests', () => {
 *   test('with auto-advance', async () => {
 *     const s = createMockScope({
 *       autoAdvanceTimers: true,
 *       deterministic: true,
 *       services: { api: mockApi }
 *     })
 *
 *     const [err, result] = await s.task(() => s.services.api.fetch())
 *     expect(result).toBeDefined()
 *   })
 * })
 * ```
 */
export interface MockScopeOptions {
	/** Automatically advance timers for async operations */
	autoAdvanceTimers?: boolean;
	/** Use deterministic random seeds for reproducible tests */
	deterministic?: boolean;
	/** Pre-configured services to inject into the scope */
	services?: Record<string, unknown>;
	/** Services to override (for mocking existing services) */
	overrides?: Record<string, unknown>;
	/** Initial aborted state - if true, scope starts already aborted */
	aborted?: boolean;
	/** Abort reason if aborted - provides context for the abortion */
	abortReason?: unknown;
}

/**
 * Task call record for tracking task invocations.
 * Captures the function and options passed to each task call for inspection in tests.
 *
 * @example
 * ```typescript
 * import { createMockScope } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('task tracking', () => {
 *   test('tracks task calls', async () => {
 *     const s = createMockScope()
 *     const fn = () => Promise.resolve('result')
 *
 *     s.task(fn, { retry: 3 })
 *
 *     expect(s.taskCalls).toHaveLength(1)
 *     expect(s.taskCalls[0].options?.retry).toBe(3)
 *   })
 * })
 * ```
 */
export interface TaskCall {
	/** The task function that was invoked */
	fn: (ctx: {
		services: Record<string, never>;
		signal: AbortSignal;
		logger: import("go-go-scope").Logger;
		context: Record<string, unknown>;
	}) => Promise<unknown>;
	/** The options passed to the task */
	options?: TaskOptions;
}

/**
 * Extended Scope with mock capabilities.
 * Provides additional methods for testing like call tracking, mocking, and manual abortion.
 *
 * @example
 * ```typescript
 * import { createMockScope } from '@go-go-scope/testing'
 * import { describe, test, expect, vi } from 'vitest'
 *
 * describe('mock scope', () => {
 *   test('mocks services', async () => {
 *     const s = createMockScope()
 *     const mockDb = { query: vi.fn().mockResolvedValue([]) }
 *
 *     s.mockService('db', mockDb)
 *
 *     await s.task(async ({ services }) => {
 *       return services.db.query('SELECT *')
 *     })
 *
 *     expect(mockDb.query).toHaveBeenCalledWith('SELECT *')
 *   })
 * })
 * ```
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
	/**
	 * Override a service with a mock implementation.
	 * @param key - The service key to override
	 * @param value - The mock value to use
	 * @returns The mock scope for chaining
	 */
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
 * - Service mocking
 *
 * @param options - Configuration options for the mock scope
 * @param options.autoAdvanceTimers - Automatically advance timers for async operations (default: false)
 * @param options.deterministic - Use deterministic random seeds for reproducible tests (default: false)
 * @param options.services - Pre-configured services to inject into the scope
 * @param options.overrides - Services to override (for mocking existing services)
 * @param options.aborted - Initial aborted state - if true, scope starts already aborted (default: false)
 * @param options.abortReason - Abort reason if aborted initially - provides context for the abortion
 * @returns A mock scope with testing utilities
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
 *
 *   test('should track task calls', async () => {
 *     const s = createMockScope()
 *
 *     s.task(() => Promise.resolve(1))
 *     s.task(() => Promise.resolve(2))
 *
 *     expect(s.getTaskCalls()).toHaveLength(2)
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
			logger: import("go-go-scope").Logger;
			context: Record<string, unknown>;
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
 * Return type of createControlledTimer.
 * Provides methods for controlling and inspecting simulated time in tests.
 *
 * @example
 * ```typescript
 * import { createControlledTimer } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('timer control', () => {
 *   test('advances time', () => {
 *     const timer = createControlledTimer()
 *     const results: number[] = []
 *
 *     timer.setTimeout(() => results.push(1), 100)
 *     timer.setTimeout(() => results.push(2), 200)
 *
 *     timer.advance(150)
 *     expect(results).toEqual([1])
 *
 *     timer.advance(100)
 *     expect(results).toEqual([1, 2])
 *   })
 * })
 * ```
 */
export interface ControlledTimer {
	/** Current simulated time in milliseconds */
	readonly currentTime: number;
	/**
	 * Schedule a callback to run after a delay.
	 * @param callback - Function to execute after the delay
	 * @param delay - Delay in milliseconds
	 * @returns Timer ID that can be used with clearTimeout
	 */
	setTimeout(callback: () => void, delay: number): number;
	/**
	 * Cancel a scheduled callback.
	 * @param id - Timer ID returned by setTimeout
	 */
	clearTimeout(id: number): void;
	/**
	 * Advance time by specified milliseconds.
	 * Executes all callbacks scheduled within the new time window.
	 * @param ms - Milliseconds to advance
	 */
	advance(ms: number): void;
	/**
	 * Run all pending timers immediately.
	 * @returns Promise that resolves when all timers are flushed
	 */
	flush(): Promise<void>;
	/**
	 * Reset all timers to initial state.
	 * Clears all pending timers and resets time to 0.
	 */
	reset(): void;
}

/**
 * Creates a controlled timer environment for testing async operations.
 * Useful for testing timeout and retry logic without waiting for real time.
 *
 * @returns A controlled timer with methods to manipulate simulated time
 *
 * @example
 * ```typescript
 * import { createControlledTimer } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('timeout testing', () => {
 *   test('handles timeouts', async () => {
 *     const timer = createControlledTimer()
 *     let timedOut = false
 *
 *     timer.setTimeout(() => { timedOut = true }, 5000)
 *
 *     expect(timedOut).toBe(false)
 *
 *     timer.advance(5000)
 *     expect(timedOut).toBe(true)
 *   })
 *
 *   test('clears timeouts', () => {
 *     const timer = createControlledTimer()
 *     let called = false
 *
 *     const id = timer.setTimeout(() => { called = true }, 1000)
 *     timer.clearTimeout(id)
 *     timer.advance(2000)
 *
 *     expect(called).toBe(false)
 *   })
 * })
 * ```
 */
export function createControlledTimer(): ControlledTimer {
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
 * Useful for testing async operations that involve microtasks.
 *
 * @returns A promise that resolves after the current call stack clears
 *
 * @example
 * ```typescript
 * import { flushPromises } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('async operations', () => {
 *   test('flushes promises', async () => {
 *     const s = scope()
 *     let resolved = false
 *
 *     s.task(async () => {
 *       await Promise.resolve()
 *       resolved = true
 *     })
 *
 *     expect(resolved).toBe(false)
 *     await flushPromises()
 *     expect(resolved).toBe(true)
 *   })
 * })
 * ```
 */
export async function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Spy function interface for testing.
 * Provides methods to track calls, set mock implementations, and inspect invocation history.
 *
 * @typeparam TArgs - Tuple type of function arguments
 * @typeparam TReturn - Return type of the function
 *
 * @example
 * ```typescript
 * import { createSpy } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('spy usage', () => {
 *   test('tracks calls', () => {
 *     const spy = createSpy<[string], number>()
 *     spy.mockReturnValue(42)
 *
 *     const result = spy('hello')
 *
 *     expect(result).toBe(42)
 *     expect(spy.wasCalled()).toBe(true)
 *     expect(spy.wasCalledWith('hello')).toBe(true)
 *     expect(spy.getCalls()).toHaveLength(1)
 *   })
 *
 *   test('uses mock implementation', () => {
 *     const spy = createSpy<[number, number], number>()
 *     spy.mockImplementation((a, b) => a + b)
 *
 *     expect(spy(2, 3)).toBe(5)
 *     expect(spy(10, 20)).toBe(30)
 *   })
 * })
 * ```
 */
export interface Spy<TArgs extends unknown[], TReturn> {
	/**
	 * Execute the spy function and record the call.
	 * @param args - Arguments passed to the function
	 * @returns The mock return value or undefined
	 */
	(...args: TArgs): TReturn;
	/** Array of recorded calls with arguments and results */
	calls: { args: TArgs; result: TReturn }[];
	/**
	 * Set a mock implementation for the spy.
	 * @param fn - Function to use as the implementation
	 * @returns The spy for chaining
	 */
	mockImplementation: (fn: (...args: TArgs) => TReturn) => Spy<TArgs, TReturn>;
	/**
	 * Set a static return value for the spy.
	 * @param value - Value to return on each call
	 * @returns The spy for chaining
	 */
	mockReturnValue: (value: TReturn) => Spy<TArgs, TReturn>;
	/**
	 * Reset the spy to its initial state.
	 * Clears all calls and mock implementations.
	 * @returns The spy for chaining
	 */
	mockReset: () => Spy<TArgs, TReturn>;
	/**
	 * Get all recorded calls.
	 * @returns Array of call records
	 */
	getCalls: () => { args: TArgs; result: TReturn }[];
	/**
	 * Check if the spy was called at least once.
	 * @returns True if called, false otherwise
	 */
	wasCalled: () => boolean;
	/**
	 * Check if the spy was called with specific arguments.
	 * @param expectedArgs - Arguments to match
	 * @returns True if a matching call exists
	 */
	wasCalledWith: (...expectedArgs: TArgs) => boolean;
}

/**
 * Creates a spy function for testing.
 * Tracks calls and can return mock values.
 *
 * @typeparam TArgs - Tuple type of function arguments
 * @typeparam TReturn - Return type of the function
 * @returns A spy function with tracking and mocking capabilities
 *
 * @example
 * ```typescript
 * import { createSpy } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('spy testing', () => {
 *   test('basic spy', () => {
 *     const spy = createSpy().mockReturnValue('mocked')
 *
 *     const result = spy()
 *
 *     expect(result).toBe('mocked')
 *     expect(spy.wasCalled()).toBe(true)
 *   })
 *
 *   test('spy with args', () => {
 *     const spy = createSpy<[string, number], string>()
 *     spy.mockImplementation((name, age) => `${name} is ${age}`)
 *
 *     spy('Alice', 30)
 *     spy('Bob', 25)
 *
 *     expect(spy.getCalls()[0].args).toEqual(['Alice', 30])
 *     expect(spy.getCalls()[1].result).toBe('Bob is 25')
 *   })
 *
 *   test('reset spy', () => {
 *     const spy = createSpy().mockReturnValue(42)
 *     spy()
 *
 *     spy.mockReset()
 *
 *     expect(spy.wasCalled()).toBe(false)
 *     expect(spy()).toBeUndefined()
 *   })
 * })
 * ```
 */
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
 * Checks that all resources are cleaned up and the signal is aborted.
 *
 * @param scope - The scope to check for proper disposal
 * @returns A promise that resolves if disposal is successful
 * @throws Error if the scope is not properly disposed
 *
 * @example
 * ```typescript
 * import { assertScopeDisposed } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test } from 'vitest'
 *
 * describe('scope disposal', () => {
 *   test('should dispose properly', async () => {
 *     const s = scope()
 *     s.task(() => Promise.resolve())
 *
 *     await assertScopeDisposed(s)
 *     // Scope is now disposed and cleaned up
 *   })
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
 * Mock channel interface for testing.
 * Provides fine-grained control over channel behavior for unit testing.
 *
 * @typeparam T - The type of values passed through the channel
 *
 * @example
 * ```typescript
 * import { createMockChannel } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('mock channel', () => {
 *   test('receives preset values', async () => {
 *     const mockCh = createMockChannel<number>()
 *     mockCh.setReceiveValues([1, 2, 3])
 *
 *     const ch = mockCh.channel
 *     expect(await ch.receive()).toBe(1)
 *     expect(await ch.receive()).toBe(2)
 *   })
 *
 *   test('tracks sent values', async () => {
 *     const mockCh = createMockChannel<string>()
 *     const ch = mockCh.channel
 *
 *     await ch.send('hello')
 *     await ch.send('world')
 *
 *     expect(mockCh.getSentValues()).toEqual(['hello', 'world'])
 *   })
 * })
 * ```
 */
export interface MockChannel<T> {
	/** The channel instance with send/receive/close methods */
	channel: {
		/** Send a value through the channel */
		send: (value: T) => Promise<boolean>;
		/** Receive a value from the channel */
		receive: () => Promise<T | undefined>;
		/** Close the channel */
		close: () => void;
		/** Async iterator for the channel */
		[Symbol.asyncIterator]: () => AsyncIterator<T>;
	};
	/** Pre-configured values to be received */
	mockReceiveValues: T[];
	/** Record of sent values */
	sentValues: T[];
	/** Whether the channel is closed */
	isClosed: boolean;
	/**
	 * Set values to be received from the channel.
	 * @param values - Array of values to return on receive calls
	 */
	setReceiveValues: (values: T[]) => void;
	/**
	 * Simulate receiving a value (adds to receive queue).
	 * @param value - Value to add to the receive queue
	 */
	mockReceive: (value: T) => void;
	/**
	 * Get all values sent through the channel.
	 * @returns Array of sent values
	 */
	getSentValues: () => T[];
	/** Clear all recorded sent values */
	clearSentValues: () => void;
	/** Close the mock channel */
	close: () => void;
	/** Reset the mock channel to its initial state */
	reset: () => void;
}

/**
 * Creates a mock channel for testing.
 * Useful for testing code that uses channels without actual async operations.
 *
 * @typeparam T - The type of values passed through the channel
 * @returns A mock channel with control methods
 *
 * @example
 * ```typescript
 * import { createMockChannel } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('channel communication', () => {
 *   test('channel communication', async () => {
 *     const mockCh = createMockChannel<number>()
 *     mockCh.setReceiveValues([1, 2, 3])
 *
 *     const ch = mockCh.channel
 *     const value = await ch.receive()
 *     expect(value).toBe(1)
 *   })
 *
 *   test('async iteration', async () => {
 *     const mockCh = createMockChannel<string>()
 *     mockCh.setReceiveValues(['a', 'b', 'c'])
 *
 *     const results: string[] = []
 *     for await (const val of mockCh.channel) {
 *       results.push(val)
 *     }
 *
 *     expect(results).toEqual(['a', 'b', 'c'])
 *   })
 *
 *   test('closed channel returns undefined', async () => {
 *     const mockCh = createMockChannel<number>()
 *     mockCh.close()
 *
 *     const value = await mockCh.channel.receive()
 *     expect(value).toBeUndefined()
 *   })
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
 * Timeline event in the time travel controller.
 * Represents a scheduled callback with timing information.
 */
interface TimelineEvent {
	/** Unique identifier for the event */
	id: number;
	/** Time at which the event is scheduled to fire */
	time: number;
	/** Callback function to execute */
	callback: () => void;
	/** Optional description for debugging */
	description?: string;
}

/**
 * History entry for tracking executed events.
 */
interface HistoryEntry {
	/** Time when the event executed */
	time: number;
	/** Description of the action that executed */
	action: string;
}

/**
 * Time travel controller interface for deterministic testing of time-based operations.
 * More powerful than createControlledTimer - allows jumping to specific times,
 * rewinding (not supported), and inspecting the timeline.
 *
 * @example
 * ```typescript
 * import { createTimeTravelController } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('time travel', () => {
 *   test('jumps to specific times', () => {
 *     const time = createTimeTravelController()
 *     const results: number[] = []
 *
 *     time.setTimeout(() => results.push(1), 100)
 *     time.setTimeout(() => results.push(2), 200)
 *     time.setTimeout(() => results.push(3), 300)
 *
 *     time.jumpTo(250)
 *     expect(results).toEqual([1, 2])
 *     expect(time.now).toBe(250)
 *   })
 *
 *   test('inspects timeline', () => {
 *     const time = createTimeTravelController()
 *     time.setTimeout(() => {}, 100, 'first')
 *     time.setTimeout(() => {}, 200, 'second')
 *
 *     const timeline = time.timeline
 *     expect(timeline).toHaveLength(2)
 *     expect(timeline[0].time).toBe(100)
 *   })
 * })
 * ```
 */
export interface TimeTravelController {
	/** Current simulated time in milliseconds */
	readonly now: number;
	/** Get the event timeline (sorted by time) */
	readonly timeline: Array<{ id: number; time: number; description?: string }>;
	/** Get the execution history */
	readonly history: HistoryEntry[];
	/**
	 * Schedule a callback to run after delay.
	 * @param callback - Function to execute
	 * @param delay - Delay in milliseconds
	 * @param description - Optional description for debugging
	 * @returns Event ID
	 */
	setTimeout(callback: () => void, delay: number, description?: string): number;
	/**
	 * Cancel a scheduled callback.
	 * @param id - Event ID to cancel
	 * @returns True if an event was cancelled
	 */
	clearTimeout(id: number): boolean;
	/**
	 * Set an interval that repeats.
	 * @param callback - Function to execute
	 * @param delay - Interval in milliseconds
	 * @param description - Optional description for debugging
	 * @returns Interval ID
	 */
	setInterval(callback: () => void, delay: number, description?: string): number;
	/**
	 * Advance time by specified milliseconds.
	 * @param ms - Milliseconds to advance
	 */
	advance(ms: number): void;
	/**
	 * Jump to a specific absolute time.
	 * @param targetTime - Absolute time to jump to
	 */
	jumpTo(targetTime: number): void;
	/**
	 * Get the next scheduled event time, or Infinity if none.
	 * @returns Time of next event or Infinity
	 */
	nextEventTime(): number;
	/**
	 * Run all events until no more remain.
	 */
	runAll(): void;
	/**
	 * Reset to initial state.
	 */
	reset(): void;
	/**
	 * Print the timeline for debugging.
	 */
	printTimeline(): void;
}

/**
 * Time travel controller for deterministic testing of time-based operations.
 * More powerful than createControlledTimer - allows jumping to specific times,
 * inspecting the timeline, and running all pending events.
 *
 * @returns A time travel controller with advanced time manipulation capabilities
 *
 * @example
 * ```typescript
 * import { createTimeTravelController } from '@go-go-scope/testing'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('time-based operations', () => {
 *   test('time-based operations', async () => {
 *     const time = createTimeTravelController()
 *
 *     // Schedule operations
 *     const results: number[] = []
 *     time.setTimeout(() => results.push(1), 100)
 *     time.setTimeout(() => results.push(2), 200)
 *
 *     // Jump to specific time
 *     time.jumpTo(150)
 *     expect(results).toEqual([1]) // Only first timer fired
 *
 *     // Continue to end
 *     time.advance(100)
 *     expect(results).toEqual([1, 2])
 *   })
 *
 *   test('intervals work', () => {
 *     const time = createTimeTravelController()
 *     let count = 0
 *
 *     time.setInterval(() => count++, 100)
 *
 *     time.advance(300)
 *     expect(count).toBe(3)
 *   })
 *
 *   test('history tracking', () => {
 *     const time = createTimeTravelController()
 *     time.setTimeout(() => {}, 100, 'my-event')
 *     time.runAll()
 *
 *     expect(time.history).toEqual([{ time: 100, action: 'my-event' }])
 *   })
 * })
 * ```
 */
export function createTimeTravelController(): TimeTravelController {
	let currentTime = 0;
	const timeline: TimelineEvent[] = [];
	const history: HistoryEntry[] = [];
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
