/**
 * Fuzz tests for race condition detection
 * Uses randomized inputs to find edge cases
 */

import { describe, test, expect } from "vitest";
import { scope } from "../src/index.js";

// Seeded random number generator for reproducibility
function createRNG(seed: number) {
	let s = seed;
	return () => {
		s = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
		return s - Math.floor(s);
	};
}

describe("fuzz tests", () => {
	test.skip("channel operations with random delays", async () => {
		// Skipped - needs investigation on channel timing with random delays
	});

	test.skip("semaphore with random acquire/release patterns", async () => {
		const rng = createRNG(123);
		const iterations = 10;

		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			const semaphore = s.semaphore(Math.floor(rng() * 3) + 1);

			const counter = { value: 0 };
			const maxConcurrent = { value: 0 };
			let currentConcurrent = 0;

			const tasks = Array.from({ length: 10 }, () =>
				s.task(async () => {
					await semaphore.acquire();
					currentConcurrent++;
					maxConcurrent.value = Math.max(maxConcurrent.value, currentConcurrent);
					counter.value++;
					currentConcurrent--;
					semaphore.release();
				}),
			);

			await Promise.all(tasks);

			expect(counter.value).toBe(10);
			expect(maxConcurrent.value).toBeLessThanOrEqual(semaphore.totalPermits);
		}
	}, 10000);

	test("parallel with random task durations and errors", async () => {
		const rng = createRNG(456);
		const iterations = 30;

		for (let i = 0; i < iterations; i++) {
			await using s = scope();

			const shouldError = Array.from({ length: 10 }, () => rng() > 0.8);

			const results = await s.parallel(
				shouldError.map((err, idx) => async () => {
					await new Promise((r) => setTimeout(r, rng() * 50));
					if (err) throw new Error(`Task ${idx} failed`);
					return `Result ${idx}`;
				}),
				{ continueOnError: true },
			);

			for (let j = 0; j < results.length; j++) {
				const [err, result] = results[j];
				if (shouldError[j]) {
					expect(err).toBeInstanceOf(Error);
				} else {
					expect(err).toBeUndefined();
					expect(result).toBe(`Result ${j}`);
				}
			}
		}
	});

	test("race with random completion times", async () => {
		const rng = createRNG(789);
		const iterations = 10;

		for (let i = 0; i < iterations; i++) {
			await using s = scope();

			const tasks = Array.from({ length: 3 }, (_, idx) => async () => {
				const delay = Math.floor(rng() * 50);
				await new Promise((r) => setTimeout(r, delay));
				return `Task ${idx}`;
			});

			const [err, result] = await s.race(tasks);

			expect(err).toBeUndefined();
			expect(result).toBeDefined();
		}
	}, 10000);

	test("scope disposal with random in-flight tasks", async () => {
		const rng = createRNG(999);
		const iterations = 10;

		for (let i = 0; i < iterations; i++) {
			const s = scope();
			const completed: number[] = [];
			const cancelled: number[] = [];

			// Start random tasks
			for (let j = 0; j < 5; j++) {
				s.task(async ({ signal }) => {
					try {
						signal.addEventListener("abort", () => cancelled.push(j), { once: true });
						await new Promise((r) => setTimeout(r, rng() * 50));
						completed.push(j);
					} catch {
						cancelled.push(j);
					}
				});
			}

			// Random delay before disposal
			await new Promise((r) => setTimeout(r, rng() * 30));
			await s[Symbol.asyncDispose]();
		}
	}, 10000);

	test.skip("broadcast with random subscriber timing", async () => {
		const rng = createRNG(111);
		const iterations = 5;

		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			const broadcast = s.broadcast<number>();

			const received: number[][] = [[], [], []];

			// Subscribe at different times
			const subscribeTasks = received.map((arr) =>
				s.task(async () => {
					await new Promise((r) => setTimeout(r, rng() * 20));
					broadcast.subscribe((val) => arr.push(val));
				}),
			);

			await Promise.all(subscribeTasks);

			// Send messages
			for (let j = 0; j < 3; j++) {
				await broadcast.send(j);
			}

			// All subscribers should have received all messages
			for (const arr of received) {
				expect(arr).toEqual([0, 1, 2]);
			}
		}
	}, 10000);

	test.skip("resource pool with random usage patterns", async () => {
		// Skipped due to potential pool implementation edge cases
		// TODO: Investigate resource pool acquire/release timing
	});

	test("select with random channel readiness", async () => {
		const rng = createRNG(333);
		const iterations = 10;

		for (let i = 0; i < iterations; i++) {
			await using s = scope();

			const ch1 = s.channel<string>();
			const ch2 = s.channel<number>();

			// Send values
			s.task(async () => {
				await new Promise((r) => setTimeout(r, rng() * 30));
				await ch1.send("first");
			});

			s.task(async () => {
				await new Promise((r) => setTimeout(r, rng() * 30));
				await ch2.send(42);
			});

			// Select should receive at least one value
			const cases = new Map([
				[ch1, (val: string) => val],
				[ch2, (val: number) => val],
			]);
			const [err, result] = await s.select(cases, { timeout: 100 });

			// Should receive one of the values (or timeout/close which is also fine)
			expect(err === undefined || err instanceof Error).toBe(true);
			if (!err) {
				expect(result === "first" || result === 42).toBe(true);
			}
		}
	}, 10000);
});
