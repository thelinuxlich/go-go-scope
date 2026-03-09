import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";

describe("scope.every()", () => {
	test("executes function at interval", async () => {
		await using s = scope();
		const executions: number[] = [];

		const stop = s.every(50, async () => {
			executions.push(Date.now());
		});

		// Wait for 3 executions (initial + 2 intervals)
		await new Promise((r) => setTimeout(r, 140));
		stop();

		// Should have at least 2 executions
		expect(executions.length).toBeGreaterThanOrEqual(2);
	});

	test("stops when stop() is called", async () => {
		await using s = scope();
		let count = 0;

		const stop = s.every(30, async () => {
			count++;
		});

		await new Promise((r) => setTimeout(r, 80));
		stop();

		const countAfterStop = count;
		await new Promise((r) => setTimeout(r, 80));

		expect(count).toBe(countAfterStop);
	});

	test("stops when scope is disposed", async () => {
		const s = scope();
		let count = 0;

		s.every(30, async () => {
			count++;
		});

		await new Promise((r) => setTimeout(r, 80));
		await s[Symbol.asyncDispose]();

		const countAfterDispose = count;
		await new Promise((r) => setTimeout(r, 80));

		expect(count).toBe(countAfterDispose);
	});

	test("errors do not stop the interval", async () => {
		await using s = scope();
		let successes = 0;
		let errors = 0;

		const stop = s.every(30, async () => {
			if (errors < 2) {
				errors++;
				throw new Error("fail");
			}
			successes++;
		});

		await new Promise((r) => setTimeout(r, 150));
		stop();

		expect(errors).toBe(2);
		expect(successes).toBeGreaterThanOrEqual(1);
	});

	test("passes AbortSignal to function", async () => {
		await using s = scope();
		let receivedSignal: AbortSignal | null = null;

		const stop = s.every(10, async ({ signal }) => {
			receivedSignal = signal;
			stop();
		});

		await new Promise((r) => setTimeout(r, 50));

		expect(receivedSignal).not.toBeNull();
		expect(receivedSignal?.aborted).toBe(false);
	});
});
