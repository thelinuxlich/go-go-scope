/**
 * Race Stagger Tests - Hedging pattern
 */
import { describe, expect, test, vi } from "vitest";
import { race, scope } from "../src/index.js";

describe("race with staggerDelay", () => {
	test("starts tasks with delay between them", async () => {
		const startTimes: number[] = [];

		const factories = [
			async () => {
				startTimes.push(Date.now());
				await new Promise((r) => setTimeout(r, 1000)); // Extremely slow
				return "first";
			},
			async () => {
				startTimes.push(Date.now());
				return "second"; // Returns immediately
			},
			async () => {
				startTimes.push(Date.now());
				return "third";
			},
		];

		const [err, result] = await race(factories, { staggerDelay: 50 });

		expect(err).toBeUndefined();
		expect(result).toBeDefined(); // Some task wins

		// Verify stagger timing - second task should start ~50ms after first
		expect(startTimes.length).toBeGreaterThanOrEqual(2);
		if (startTimes.length >= 2) {
			const delay = startTimes[1]! - startTimes[0]!;
			expect(delay).toBeGreaterThanOrEqual(40); // Allow some tolerance
		}
	});

	test("stops starting new tasks after winner", async () => {
		let startedCount = 0;

		const factories = [
			async () => {
				startedCount++;
				await new Promise((r) => setTimeout(r, 1000)); // Extremely slow
				return "slow";
			},
			async () => {
				startedCount++;
				return "fast"; // Returns immediately
			},
			async () => {
				startedCount++;
				return "never-started";
			},
		];

		const [err, result] = await race(factories, { staggerDelay: 500 });

		expect(err).toBeUndefined();
		expect(result).toBeDefined(); // Some task should win
		// Third task should not start because second wins immediately (before 500ms stagger)
		expect(startedCount).toBe(2);
	});

	test("respects staggerMaxConcurrent limit", async () => {
		let concurrentCount = 0;
		let maxConcurrent = 0;

		const factories = Array.from({ length: 5 }, () => async () => {
			concurrentCount++;
			maxConcurrent = Math.max(maxConcurrent, concurrentCount);
			await new Promise((r) => setTimeout(r, 200));
			concurrentCount--;
			return "done";
		});

		const [err] = await race(factories, {
			staggerDelay: 30,
			staggerMaxConcurrent: 2,
		});

		// Should timeout or complete but never exceed 2 concurrent
		expect(maxConcurrent).toBeLessThanOrEqual(2);
	});

	test("first task starts immediately without delay", async () => {
		const startTime = Date.now();
		let firstTaskStart = 0;

		const factories = [
			async () => {
				firstTaskStart = Date.now();
				await new Promise((r) => setTimeout(r, 100));
				return "first";
			},
			async () => {
				await new Promise((r) => setTimeout(r, 50));
				return "second";
			},
		];

		await race(factories, { staggerDelay: 1000 });

		// First task should start immediately (within 50ms)
		const delay = firstTaskStart - startTime;
		expect(delay).toBeLessThan(50);
	});

	test("works with requireSuccess", async () => {
		let attemptCount = 0;

		const factories = [
			async () => {
				attemptCount++;
				throw new Error("first fails");
			},
			async () => {
				attemptCount++;
				await new Promise((r) => setTimeout(r, 50));
				throw new Error("second fails");
			},
			async () => {
				attemptCount++;
				return "third succeeds";
			},
		];

		const [err, result] = await race(factories, {
			staggerDelay: 30,
			requireSuccess: true,
		});

		expect(err).toBeUndefined();
		expect(result).toBe("third succeeds");
	});

	test("cancels stagger timer on abort", async () => {
		const controller = new AbortController();
		const factories = [
			async () => {
				await new Promise((r) => setTimeout(r, 100));
				return "slow";
			},
			async () => {
				await new Promise((r) => setTimeout(r, 200));
				return "slower";
			},
		];

		// Abort after 50ms
		setTimeout(() => controller.abort(), 50);

		const [err] = await race(factories, {
			staggerDelay: 100,
			signal: controller.signal,
		});

		expect(err).toBeDefined();
	});

	test("stagger without max concurrent eventually starts all", async () => {
		const started: boolean[] = [false, false, false];

		const factories = [
			async () => {
				started[0] = true;
				await new Promise((r) => setTimeout(r, 1000)); // Extremely slow
				return "first";
			},
			async () => {
				started[1] = true;
				await new Promise((r) => setTimeout(r, 900)); // Also very slow
				return "second";
			},
			async () => {
				started[2] = true;
				return "third"; // Fastest
			},
		];

		const [err, result] = await race(factories, { staggerDelay: 50 });

		// All should eventually start since no maxConcurrent limit
		expect(started[0]).toBe(true);
		expect(started[1]).toBe(true);
		expect(started[2]).toBe(true);
		expect(result).toBeDefined(); // Some task should win
	});

	test("continues stagger after task failure with requireSuccess", async () => {
		let startedCount = 0;

		const factories = [
			async () => {
				startedCount++;
				throw new Error("fail immediately");
			},
			async () => {
				startedCount++;
				await new Promise((r) => setTimeout(r, 100));
				throw new Error("fail slow");
			},
			async () => {
				startedCount++;
				return "success";
			},
		];

		const [err, result] = await race(factories, {
			staggerDelay: 50,
			requireSuccess: true,
		});

		expect(err).toBeUndefined();
		expect(result).toBe("success");
		// Third task should start even though first failed immediately
		expect(startedCount).toBeGreaterThanOrEqual(2);
	});
});

describe("race stagger with scope", () => {
	test("works with scope.race", async () => {
		await using s = scope();

		const results: string[] = [];

		const [err, winner] = await s.race([
			async () => {
				results.push("first");
				await new Promise((r) => setTimeout(r, 200));
				return "slow";
			},
			async () => {
				results.push("second");
				return "fast";
			},
		]);

		expect(err).toBeUndefined();
		expect(winner).toBe("fast");
		expect(results).toContain("first");
		expect(results).toContain("second");
	});
});
