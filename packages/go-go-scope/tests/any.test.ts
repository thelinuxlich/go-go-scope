import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";

describe("scope.any()", () => {
	test("returns first successful result", async () => {
		await using s = scope();

		const [err, result] = await s.any([
			async () => {
				await new Promise((r) => setTimeout(r, 50));
				return "first";
			},
			async () => {
				await new Promise((r) => setTimeout(r, 100));
				return "second";
			},
		]);

		expect(err).toBeUndefined();
		expect(result).toBe("first");
	});

	test("returns success even if some fail", async () => {
		await using s = scope();

		const [err, result] = await s.any([
			async () => {
				throw new Error("fail1");
			},
			async () => {
				await new Promise((r) => setTimeout(r, 20));
				return "success";
			},
			async () => {
				throw new Error("fail2");
			},
		]);

		expect(err).toBeUndefined();
		expect(result).toBe("success");
	});

	test("returns aggregate error if all fail", async () => {
		await using s = scope();

		const [err, result] = await s.any([
			async () => {
				throw new Error("fail1");
			},
			async () => {
				throw new Error("fail2");
			},
		]);

		expect(err).toBeInstanceOf(Error);
		expect(result).toBeUndefined();
	});

	test("returns error for empty array", async () => {
		await using s = scope();

		const [err, result] = await s.any([]);

		expect(err).toBeInstanceOf(Error);
		expect(result).toBeUndefined();
	});

	test("respects timeout option", async () => {
		await using s = scope();

		const [err, result] = await s.any(
			[
				async () => {
					await new Promise((r) => setTimeout(r, 1000));
					return "slow";
				},
			],
			{ timeout: 50 },
		);

		expect(err).toBeDefined();
		expect(result).toBeUndefined();
	});

	test("cancels remaining tasks after first success", async () => {
		await using s = scope();
		let slowTaskStarted = false;
		let slowTaskCompleted = false;

		const [err, result] = await s.any([
			async () => {
				return "fast";
			},
			async () => {
				slowTaskStarted = true;
				await new Promise((r) => setTimeout(r, 200));
				slowTaskCompleted = true;
				return "slow";
			},
		]);

		expect(result).toBe("fast");
		// Give time for cleanup
		await new Promise((r) => setTimeout(r, 50));
		// Slow task may have started but shouldn't complete
		expect(slowTaskCompleted).toBe(false);
	});
});
