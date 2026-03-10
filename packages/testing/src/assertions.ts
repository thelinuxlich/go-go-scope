/**
 * Assertion helpers for testing go-go-scope tasks.
 *
 * Provides fluent assertion API and helper functions for verifying task behavior
 * in tests. Compatible with Vitest, Jest, and other test frameworks.
 *
 * @module @go-go-scope/testing/assertions
 */

import type { Result, Task } from "go-go-scope";

/**
 * Assertion result with fluent helper methods for task validation.
 * Provides a chainable API for asserting various aspects of task execution.
 *
 * @typeparam T - The type of the successful task result
 *
 * @example
 * ```typescript
 * import { expectTask } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('task assertions', () => {
 *   test('task resolves successfully', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.resolve('done')))
 *       .toResolveWith('done')
 *   })
 *
 *   test('task rejects with error', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.reject(new Error('fail'))))
 *       .toRejectWith('fail')
 *   })
 *
 *   test('task completes within timeout', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.resolve('quick')))
 *       .toResolveWithin(1000)
 *       .toResolve()
 *   })
 * })
 * ```
 */
export interface TaskAssertion<T> {
	/**
	 * Assert that the task resolves without error.
	 * @returns Promise that resolves if the task succeeds, throws if it fails
	 */
	toResolve: () => Promise<void>;
	/**
	 * Assert that the task resolves with a specific value.
	 * @param expected - The expected result value
	 * @returns Promise that resolves if values match, throws with diff if not
	 */
	toResolveWith: (expected: T) => Promise<void>;
	/**
	 * Assert that the task resolves within a timeout period.
	 * @param timeoutMs - Timeout in milliseconds
	 * @returns A new TaskAssertion that includes the timeout constraint
	 */
	toResolveWithin: (timeoutMs: number) => TaskAssertion<T>;
	/**
	 * Assert that the task rejects with an error.
	 * @returns Promise that resolves if the task fails, throws if it succeeds
	 */
	toReject: () => Promise<void>;
	/**
	 * Assert that the task rejects with a specific error message.
	 * @param message - Expected error message (string) or pattern (RegExp)
	 * @returns Promise that resolves if error matches, throws with diff if not
	 */
	toRejectWith: (message: string | RegExp) => Promise<void>;
	/**
	 * Assert that the task fails with a specific error type.
	 * @typeparam E - The expected error class type
	 * @param errorClass - The expected error constructor
	 * @returns Promise that resolves if error type matches, throws if not
	 */
	toRejectWithType: <E extends Error>(
		errorClass: new (...args: never[]) => E,
	) => Promise<void>;
	/**
	 * Get the result tuple for manual assertions.
	 * @returns Promise resolving to the Result tuple [Error | undefined, T | undefined]
	 */
	result: () => Promise<Result<Error, T>>;
}

/**
 * Creates assertion helpers for a task.
 * Provides a fluent API for asserting task resolution, rejection, and timing.
 *
 * @typeparam T - The type of the successful task result
 * @param task - The task to assert against
 * @returns A TaskAssertion object with chainable assertion methods
 *
 * @example
 * ```typescript
 * import { expectTask } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('task assertions', () => {
 *   test('task succeeds', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.resolve('done')))
 *       .toResolveWith('done')
 *   })
 *
 *   test('task fails', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.reject(new Error('fail'))))
 *       .toRejectWith('fail')
 *   })
 *
 *   test('task times out', async () => {
 *     const s = scope()
 *     await expectTask(s.task(() => new Promise(() => {})))
 *       .toResolveWithin(100)
 *       .toReject()
 *   })
 *
 *   test('custom error type', async () => {
 *     class ValidationError extends Error {}
 *     const s = scope()
 *     await expectTask(s.task(() => Promise.reject(new ValidationError())))
 *       .toRejectWithType(ValidationError)
 *   })
 *
 *   test('manual result inspection', async () => {
 *     const s = scope()
 *     const [err, result] = await expectTask(s.task(() => Promise.resolve(42))).result()
 *     expect(err).toBeUndefined()
 *     expect(result).toBe(42)
 *   })
 * })
 * ```
 */
export function expectTask<T>(task: Task<Result<Error, T>>): TaskAssertion<T> {
	let resolvedResult: Result<Error, T> | undefined;
	let resolved = false;

	const getResult = async (): Promise<Result<Error, T>> => {
		if (!resolved) {
			resolvedResult = await task;
			resolved = true;
		}
		return resolvedResult!;
	};

	const assertion: TaskAssertion<T> = {
		toResolve: async () => {
			const [err] = await getResult();
			if (err) {
				throw new Error(
					`Expected task to resolve, but rejected: ${err.message}`,
				);
			}
		},

		toResolveWith: async (expected: T) => {
			const [err, result] = await getResult();
			if (err) {
				throw new Error(
					`Expected task to resolve with ${JSON.stringify(expected)}, but rejected: ${err.message}`,
				);
			}
			if (result !== expected) {
				throw new Error(
					`Expected task to resolve with ${JSON.stringify(expected)}, but got ${JSON.stringify(result)}`,
				);
			}
		},

		toResolveWithin: (timeoutMs: number): TaskAssertion<T> => {
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Task did not resolve within ${timeoutMs}ms`));
				}, timeoutMs);
			});

			// Create a racing assertion
			const racingAssertion: TaskAssertion<T> = {
				toResolve: async () => {
					await Promise.race([assertion.toResolve(), timeoutPromise]);
				},
				toResolveWith: async (expected: T) => {
					await Promise.race([
						assertion.toResolveWith(expected),
						timeoutPromise,
					]);
				},
				toResolveWithin: () => racingAssertion,
				toReject: async () => {
					await Promise.race([assertion.toReject(), timeoutPromise]);
				},
				toRejectWith: async (message: string | RegExp) => {
					await Promise.race([assertion.toRejectWith(message), timeoutPromise]);
				},
				toRejectWithType: async <E extends Error>(
					errorClass: new (...args: never[]) => E,
				) => {
					await Promise.race([
						assertion.toRejectWithType(errorClass),
						timeoutPromise,
					]);
				},
				result: getResult,
			};

			return racingAssertion;
		},

		toReject: async () => {
			const [err] = await getResult();
			if (!err) {
				throw new Error("Expected task to reject, but resolved successfully");
			}
		},

		toRejectWith: async (message: string | RegExp) => {
			const [err] = await getResult();
			if (!err) {
				throw new Error(
					`Expected task to reject with "${message}", but resolved successfully`,
				);
			}
			const matches =
				typeof message === "string"
					? err.message === message
					: message.test(err.message);
			if (!matches) {
				throw new Error(
					`Expected error message "${message}", but got "${err.message}"`,
				);
			}
		},

		toRejectWithType: async <E extends Error>(
			errorClass: new (...args: never[]) => E,
		) => {
			const [err] = await getResult();
			if (!err) {
				throw new Error(
					`Expected task to reject with ${errorClass.name}, but resolved successfully`,
				);
			}
			if (!(err instanceof errorClass)) {
				throw new Error(
					`Expected error to be instance of ${errorClass.name}, but got ${err.constructor.name}`,
				);
			}
		},

		result: getResult,
	};

	return assertion;
}

/**
 * Asserts that a task resolves successfully.
 * Throws an error if the task rejects, otherwise returns the result tuple.
 *
 * @typeparam T - The type of the successful task result
 * @param task - The task to assert against
 * @returns Promise resolving to the Result tuple [undefined, T]
 * @throws Error if the task rejects
 *
 * @example
 * ```typescript
 * import { assertResolves } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('assertResolves', () => {
 *   test('task succeeds', async () => {
 *     const s = scope()
 *     const [err, result] = await assertResolves(s.task(() => Promise.resolve('done')))
 *     expect(err).toBeUndefined()
 *     expect(result).toBe('done')
 *   })
 *
 *   test('task fails - throws', async () => {
 *     const s = scope()
 *     await expect(
 *       assertResolves(s.task(() => Promise.reject(new Error('fail'))))
 *     ).rejects.toThrow('Expected task to resolve')
 *   })
 * })
 * ```
 */
export async function assertResolves<T>(
	task: Task<Result<Error, T>>,
): Promise<Result<Error, T>> {
	const result = await task;
	if (result[0]) {
		throw new Error(
			`Expected task to resolve, but rejected: ${result[0].message}`,
		);
	}
	return result;
}

/**
 * Asserts that a task rejects with an error.
 * Throws an error if the task resolves, otherwise returns the error.
 *
 * @typeparam T - The type of the successful task result (should not be returned)
 * @param task - The task to assert against
 * @returns Promise resolving to the Error if the task rejects
 * @throws Error if the task resolves successfully
 *
 * @example
 * ```typescript
 * import { assertRejects } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('assertRejects', () => {
 *   test('task fails', async () => {
 *     const s = scope()
 *     const err = await assertRejects(s.task(() => Promise.reject(new Error('fail'))))
 *     expect(err.message).toBe('fail')
 *   })
 *
 *   test('task succeeds - throws', async () => {
 *     const s = scope()
 *     await expect(
 *       assertRejects(s.task(() => Promise.resolve('success')))
 *     ).rejects.toThrow('Expected task to reject')
 *   })
 *
 *   test('error inspection', async () => {
 *     class CustomError extends Error {
 *       constructor(public code: number) { super('custom') }
 *     }
 *     const s = scope()
 *     const err = await assertRejects(
 *       s.task(() => Promise.reject(new CustomError(404)))
 *     )
 *     expect(err).toBeInstanceOf(CustomError)
 *     expect((err as CustomError).code).toBe(404)
 *   })
 * })
 * ```
 */
export async function assertRejects<T>(
	task: Task<Result<Error, T>>,
): Promise<Error> {
	const [err] = await task;
	if (!err) {
		throw new Error("Expected task to reject, but resolved successfully");
	}
	return err;
}

/**
 * Asserts that a task resolves within a specified timeout period.
 * Useful for testing performance requirements and detecting slow operations.
 *
 * @typeparam T - The type of the successful task result
 * @param task - The task to assert against
 * @param timeoutMs - Maximum allowed time in milliseconds
 * @returns Promise resolving to the Result tuple
 * @throws Error if the task takes longer than the timeout
 *
 * @example
 * ```typescript
 * import { assertResolvesWithin } from '@go-go-scope/testing'
 * import { scope } from 'go-go-scope'
 * import { describe, test, expect } from 'vitest'
 *
 * describe('assertResolvesWithin', () => {
 *   test('fast operation', async () => {
 *     const s = scope()
 *     const [err, result] = await assertResolvesWithin(
 *       s.task(() => Promise.resolve('quick')),
 *       100
 *     )
 *     expect(result).toBe('quick')
 *   })
 *
 *   test('slow operation times out', async () => {
 *     const s = scope()
 *     await expect(
 *       assertResolvesWithin(
 *         s.task(() => new Promise(r => setTimeout(r, 200))),
 *         100
 *       )
 *     ).rejects.toThrow('did not resolve within')
 *   })
 *
 *   test('performance requirement', async () => {
 *     const s = scope()
 *     // Ensure API call completes within 1 second
 *     const [err, data] = await assertResolvesWithin(
 *       s.task(() => fetchUserData()),
 *       1000
 *     )
 *     expect(data).toBeDefined()
 *   })
 * })
 * ```
 */
export async function assertResolvesWithin<T>(
	task: Task<Result<Error, T>>,
	timeoutMs: number,
): Promise<Result<Error, T>> {
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			reject(new Error(`Task did not resolve within ${timeoutMs}ms`));
		}, timeoutMs);
	});

	return Promise.race([task, timeoutPromise]);
}
