/**
 * Performance tests for go-go-scope
 * These help identify bottlenecks and measure optimization impact
 */

import { Effect } from "effect";
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

		// Effect simple task
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.promise(() => Promise.resolve(42));
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(
			`\n  Baseline (Promise.resolve): ${baselineDuration.toFixed(2)}ms`,
		);
		console.log(`  go-go-scope (simple task):  ${scopeDuration.toFixed(2)}ms`);
		console.log(`  Effect (simple):            ${effectDuration.toFixed(2)}ms`);
		console.log(
			`  Overhead per task (scope): ${(((scopeDuration - baselineDuration) / iterations) * 1000).toFixed(3)}µs`,
		);
		console.log(
			`  Overhead per task (effect): ${(((effectDuration - baselineDuration) / iterations) * 1000).toFixed(3)}µs`,
		);
	});

	test("task creation without execution", async () => {
		const iterations = 10000;

		// go-go-scope: lazy task creation (no execution)
		await using s = scope();
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			using _task = s.task(() => Promise.resolve(42));
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect: program definition (no execution)
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const _program = Effect.promise(() => Promise.resolve(42));
		}
		const effectDuration = performance.now() - effectStart;

		console.log(
			`\n  go-go-scope (lazy creation): ${scopeDuration.toFixed(2)}ms`,
		);
		console.log(
			`  Effect (program def):          ${effectDuration.toFixed(2)}ms`,
		);
		console.log(
			`  Per task (scope): ${((scopeDuration / iterations) * 1000).toFixed(3)}µs`,
		);
		console.log(
			`  Per task (effect): ${((effectDuration / iterations) * 1000).toFixed(3)}µs`,
		);
	});

	test("scope creation overhead", async () => {
		const iterations = 10000;

		// go-go-scope scope creation
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using _s = scope();
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect: just creating and running a simple program (closest equivalent)
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.promise(() => Promise.resolve(42));
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(
			`\n  go-go-scope (scope creation): ${scopeDuration.toFixed(2)}ms`,
		);
		console.log(
			`  Effect (program run):         ${effectDuration.toFixed(2)}ms`,
		);
		console.log(
			`  Per scope (go-go): ${((scopeDuration / iterations) * 1000).toFixed(3)}µs`,
		);
		console.log(
			`  Per scope (effect): ${((effectDuration / iterations) * 1000).toFixed(3)}µs`,
		);
	});

	test("parallel task execution", async () => {
		const iterations = 1000;

		// go-go-scope parallel tasks
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			await Promise.all([
				s.task(() => Promise.resolve(1)),
				s.task(() => Promise.resolve(2)),
				s.task(() => Promise.resolve(3)),
			]);
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect parallel tasks
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.all([
				Effect.promise(() => Promise.resolve(1)),
				Effect.promise(() => Promise.resolve(2)),
				Effect.promise(() => Promise.resolve(3)),
			]);
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(`\n  3 parallel tasks x ${iterations}:`);
		console.log(`  go-go-scope: ${scopeDuration.toFixed(2)}ms`);
		console.log(`  Effect:      ${effectDuration.toFixed(2)}ms`);
		console.log(
			`  Per iteration (scope): ${(scopeDuration / iterations).toFixed(3)}ms`,
		);
		console.log(
			`  Per iteration (effect): ${(effectDuration / iterations).toFixed(3)}ms`,
		);
	});

	test("retry overhead", async () => {
		const iterations = 1000;

		// go-go-scope with retry
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			await s.task(() => Promise.resolve(42), {
				retry: { maxRetries: 1, delay: 0 },
			});
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect with retry
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.retry(
				Effect.promise(() => Promise.resolve(42)),
				{ times: 1 },
			);
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(`\n  Retry (1 retry) x ${iterations}:`);
		console.log(`  go-go-scope: ${scopeDuration.toFixed(2)}ms`);
		console.log(`  Effect:      ${effectDuration.toFixed(2)}ms`);
		console.log(
			`  Per iteration (scope): ${(scopeDuration / iterations).toFixed(3)}ms`,
		);
		console.log(
			`  Per iteration (effect): ${(effectDuration / iterations).toFixed(3)}ms`,
		);
	});

	test("timeout overhead", async () => {
		const iterations = 1000;

		// go-go-scope with timeout
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope({ timeout: 5000 });
			await s.task(() => Promise.resolve(42));
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect with timeout
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.timeout(
				Effect.promise(() => Promise.resolve(42)),
				"5000 millis",
			);
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(`\n  Timeout (5000ms) x ${iterations}:`);
		console.log(`  go-go-scope: ${scopeDuration.toFixed(2)}ms`);
		console.log(`  Effect:      ${effectDuration.toFixed(2)}ms`);
		console.log(
			`  Per iteration (scope): ${(scopeDuration / iterations).toFixed(3)}ms`,
		);
		console.log(
			`  Per iteration (effect): ${(effectDuration / iterations).toFixed(3)}ms`,
		);
	});

	test("race overhead", async () => {
		const iterations = 1000;

		// go-go-scope race
		const scopeStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			await using s = scope();
			await s.race([() => Promise.resolve(1), () => Promise.resolve(2)]);
		}
		const scopeDuration = performance.now() - scopeStart;

		// Effect race
		const effectStart = performance.now();
		for (let i = 0; i < iterations; i++) {
			const program = Effect.raceAll([
				Effect.promise(() => Promise.resolve(1)),
				Effect.promise(() => Promise.resolve(2)),
			]);
			await Effect.runPromise(program);
		}
		const effectDuration = performance.now() - effectStart;

		console.log(`\n  Race (2 tasks) x ${iterations}:`);
		console.log(`  go-go-scope: ${scopeDuration.toFixed(2)}ms`);
		console.log(`  Effect:      ${effectDuration.toFixed(2)}ms`);
		console.log(
			`  Per iteration (scope): ${(scopeDuration / iterations).toFixed(3)}ms`,
		);
		console.log(
			`  Per iteration (effect): ${(effectDuration / iterations).toFixed(3)}ms`,
		);
	});
});
