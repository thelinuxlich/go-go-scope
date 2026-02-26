/**
 * Assertion helpers for testing go-go-scope tasks
 */

import type { Result, Task } from "go-go-scope";

/**
 * Assertion result with helper methods
 */
interface TaskAssertion<T> {
	/** Assert task resolves without error */
	toResolve: () => Promise<void>;
	/** Assert task resolves with specific value */
	toResolveWith: (expected: T) => Promise<void>;
	/** Assert task resolves within timeout */
	toResolveWithin: (timeoutMs: number) => TaskAssertion<T>;
	/** Assert task rejects with error */
	toReject: () => Promise<void>;
	/** Assert task rejects with specific error message */
	toRejectWith: (message: string | RegExp) => Promise<void>;
	/** Assert task fails with specific error type */
	toRejectWithType: <E extends Error>(errorClass: new (...args: never[]) => E) => Promise<void>;
	/** Get the result tuple for manual assertions */
	result: () => Promise<Result<Error, T>>;
}

/**
 * Create assertion helpers for a task.
 *
 * @example
 * ```typescript
 * import { expectTask } from '@go-go-scope/testing'
 *
 * test('task succeeds', async () => {
 *   const s = scope()
 *   await expectTask(s.task(() => Promise.resolve('done')))
 *     .toResolveWith('done')
 * })
 *
 * test('task fails', async () => {
 *   const s = scope()
 *   await expectTask(s.task(() => Promise.reject(new Error('fail'))))
 *     .toRejectWith('fail')
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
				throw new Error(`Expected task to resolve, but rejected: ${err.message}`);
			}
		},

		toResolveWith: async (expected: T) => {
			const [err, result] = await getResult();
			if (err) {
				throw new Error(`Expected task to resolve with ${JSON.stringify(expected)}, but rejected: ${err.message}`);
			}
			if (result !== expected) {
				throw new Error(
					`Expected task to resolve with ${JSON.stringify(expected)}, but got ${JSON.stringify(result)}`
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
					await Promise.race([assertion.toResolveWith(expected), timeoutPromise]);
				},
				toResolveWithin: () => racingAssertion,
				toReject: async () => {
					await Promise.race([assertion.toReject(), timeoutPromise]);
				},
				toRejectWith: async (message: string | RegExp) => {
					await Promise.race([assertion.toRejectWith(message), timeoutPromise]);
				},
				toRejectWithType: async <E extends Error>(errorClass: new (...args: never[]) => E) => {
					await Promise.race([assertion.toRejectWithType(errorClass), timeoutPromise]);
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
				throw new Error(`Expected task to reject with "${message}", but resolved successfully`);
			}
			const matches = typeof message === "string"
				? err.message === message
				: message.test(err.message);
			if (!matches) {
				throw new Error(
					`Expected error message "${message}", but got "${err.message}"`
				);
			}
		},

		toRejectWithType: async <E extends Error>(errorClass: new (...args: never[]) => E) => {
			const [err] = await getResult();
			if (!err) {
				throw new Error(`Expected task to reject with ${errorClass.name}, but resolved successfully`);
			}
			if (!(err instanceof errorClass)) {
				throw new Error(
					`Expected error to be instance of ${errorClass.name}, but got ${err.constructor.name}`
				);
			}
		},

		result: getResult,
	};

	return assertion;
}

/**
 * Assert that a task resolves successfully.
 *
 * @example
 * ```typescript
 * import { assertResolves } from '@go-go-scope/testing'
 *
 * test('task succeeds', async () => {
 *   const s = scope()
 *   const [err, result] = await assertResolves(s.task(() => Promise.resolve('done')))
 *   expect(result).toBe('done')
 * })
 * ```
 */
export async function assertResolves<T>(task: Task<Result<Error, T>>): Promise<Result<Error, T>> {
	const result = await task;
	if (result[0]) {
		throw new Error(`Expected task to resolve, but rejected: ${result[0].message}`);
	}
	return result;
}

/**
 * Assert that a task rejects with an error.
 *
 * @example
 * ```typescript
 * import { assertRejects } from '@go-go-scope/testing'
 *
 * test('task fails', async () => {
 *   const s = scope()
 *   const err = await assertRejects(s.task(() => Promise.reject(new Error('fail'))))
 *   expect(err.message).toBe('fail')
 * })
 * ```
 */
export async function assertRejects<T>(task: Task<Result<Error, T>>): Promise<Error> {
	const [err] = await task;
	if (!err) {
		throw new Error("Expected task to reject, but resolved successfully");
	}
	return err;
}

/**
 * Assert that a task resolves within a timeout.
 *
 * @example
 * ```typescript
 * import { assertResolvesWithin } from '@go-go-scope/testing'
 *
 * test('task is fast', async () => {
 *   const s = scope()
 *   const [err, result] = await assertResolvesWithin(
 *     s.task(() => fetchData()),
 *     1000
 *   )
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
