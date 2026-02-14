/**
 * Race function for go-go-scope
 */

import createDebug from "debug";
import { Scope } from "./scope.js";
import type { RaceOptions, Result } from "./types.js";

const debugScope = createDebug("go-go-scope:race");

/**
 * Race multiple tasks - the first to settle wins, others are cancelled.
 * Implements structured concurrency: all tasks run within a scope.
 *
 * @param factories - Array of factory functions that receive AbortSignal and create promises
 * @param options - Optional race configuration
 * @returns A Promise that resolves to the value of the first settled task
 *
 * @example
 * ```typescript
 * const winner = await race([
 *   ({ signal }) => fetch('https://a.com', { signal }),
 *   ({ signal }) => fetch('https://b.com', { signal }),
 * ])
 * ```
 */
export async function race<T>(
	factories: readonly ((signal: AbortSignal) => Promise<T>)[],
	options?: RaceOptions,
): Promise<Result<unknown, T>> {
	const totalTasks = factories.length;

	if (totalTasks === 0) {
		return [new Error("Cannot race empty array of factories"), undefined];
	}

	if (debugScope.enabled) {
		debugScope("starting race with %d competitors", totalTasks);
	}

	// Check if signal is already aborted
	if (options?.signal?.aborted) {
		if (debugScope.enabled) {
			debugScope("already aborted");
		}
		return [options.signal.reason, undefined];
	}

	const s = new Scope({ signal: options?.signal, tracer: options?.tracer });
	let settledCount = 0;
	let winnerIndex = -1;

	try {
		// Create abort promise that returns error as Result
		const abortPromise = new Promise<Result<unknown, T>>((resolve) => {
			s.signal.addEventListener(
				"abort",
				() => {
					if (debugScope.enabled) {
						debugScope(
							"aborted, %d/%d tasks settled",
							settledCount,
							totalTasks,
						);
					}
					resolve([s.signal.reason, undefined]);
				},
				{ once: true },
			);
		});

		const debugEnabled = debugScope.enabled;
		// Spawn all tasks with tracking
		const tasks = factories.map((factory, idx) =>
			s
				.task(async ({ signal }) => {
					const result = await factory(signal);
					settledCount++;
					if (winnerIndex === -1) {
						winnerIndex = idx;
						if (debugEnabled) {
							debugScope(
								"winner! task %d/%d won the race",
								idx + 1,
								totalTasks,
							);
						}
					} else if (debugEnabled) {
						debugScope("task %d/%d settled (loser)", idx + 1, totalTasks);
					}
					return result;
				})
				.then(([err, result]): Result<unknown, T> => {
					if (err) return [err, undefined];
					return [undefined, result as T];
				}),
		);

		// Race all tasks against abort
		const result = await Promise.race([...tasks, abortPromise]);
		if (debugEnabled) {
			debugScope(
				"race complete, winner was task %d/%d",
				winnerIndex + 1,
				totalTasks,
			);
		}
		return result;
	} finally {
		// Clean up scope - cancels all tasks
		await s[Symbol.asyncDispose]();
	}
}
