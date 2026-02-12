/**
 * Performance tests for go-go-scope
 * These help identify bottlenecks and measure optimization impact
 */
import { describe, test } from "vitest";
import { scope } from "./index.js";

describe("performance", () => {
	test("simple task overhead", async () => {
		const iterations = 10000;

		// Baseline: native promise
		const baselineStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await Promise.resolve(42);
		}
		const baselineDuration = performance.now() - baselineStart;

		// go-go-scope simple task
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using _s = scope();
			await _s.task(() => Promise.resolve(42));
		}
		const scopeDuration = performance.now() - scopeStart;

		console.log(
			`\n  Baseline (Promise.resolve): ${baselineDuration.toFixed(2)}ms`,
		);
		console.log(`  go-go-scope (simple task):  ${scopeDuration.toFixed(2)}ms`);
		console.log(
			`  Overhead per task: ${(((scopeDuration - baselineDuration) / iterations) * 1000).toFixed(3)}µs`,
		);
	});

	test("task creation without execution", async () => {
		const iterations = 10000;

		await using s = scope();

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			using _task = s.task(() => Promise.resolve(42));
		}
		const duration = performance.now() - start;

		console.log(
			`\n  Task creation (lazy, no execution): ${duration.toFixed(2)}ms`,
		);
		console.log(`  Per task: ${((duration / iterations) * 1000).toFixed(3)}µs`);
	});

	test("scope creation overhead", async () => {
		const iterations = 10000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope();
		}
		const duration = performance.now() - start;

		console.log(`\n  Scope creation + disposal: ${duration.toFixed(2)}ms`);
		console.log(
			`  Per scope: ${((duration / iterations) * 1000).toFixed(3)}µs`,
		);
	});

	test("parallel task execution", async () => {
		const iterations = 1000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			await Promise.all([
				s.task(() => Promise.resolve(1)),
				s.task(() => Promise.resolve(2)),
				s.task(() => Promise.resolve(3)),
			]);
		}
		const duration = performance.now() - start;

		console.log(
			`\n  3 parallel tasks x ${iterations}: ${duration.toFixed(2)}ms`,
		);
		console.log(`  Per iteration: ${(duration / iterations).toFixed(3)}ms`);
	});
});
