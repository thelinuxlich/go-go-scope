/**
 * Tests for cancellation utilities
 */

import { describe, expect, test } from "vitest";
import {
	abortPromise,
	onAbort,
	raceSignals,
	throwIfAborted,
	whenAborted,
} from "../src/cancellation.js";

describe("throwIfAborted", () => {
	test("does nothing if signal is not aborted", () => {
		const controller = new AbortController();

		expect(() => throwIfAborted(controller.signal)).not.toThrow();
	});

	test("throws reason if signal is aborted", () => {
		const controller = new AbortController();
		controller.abort(new Error("cancelled"));

		expect(() => throwIfAborted(controller.signal)).toThrow("cancelled");
	});

	test("throws with any reason type", () => {
		const controller = new AbortController();
		controller.abort("string reason");

		expect(() => throwIfAborted(controller.signal)).toThrow("string reason");
	});
});

describe("onAbort", () => {
	test("registers callback for abort", async () => {
		const controller = new AbortController();
		let called = false;

		onAbort(controller.signal, () => {
			called = true;
		});

		expect(called).toBe(false);

		controller.abort();
		await new Promise((r) => setTimeout(r, 10));

		expect(called).toBe(true);
	});

	test("calls immediately if already aborted", () => {
		const controller = new AbortController();
		let called = false;

		controller.abort();

		onAbort(controller.signal, () => {
			called = true;
		});

		expect(called).toBe(true);
	});

	test("callback receives abort reason", () => {
		const controller = new AbortController();
		let receivedReason: unknown;

		controller.abort("test reason");

		onAbort(controller.signal, (reason) => {
			receivedReason = reason;
		});

		expect(receivedReason).toBe("test reason");
	});

	test("disposable unregisters callback", async () => {
		const controller = new AbortController();
		let called = false;

		const disposable = onAbort(controller.signal, () => {
			called = true;
		});

		// Unregister before abort
		disposable[Symbol.dispose]();

		controller.abort();
		await new Promise((r) => setTimeout(r, 10));

		expect(called).toBe(false);
	});

	test("works with using keyword", async () => {
		const controller = new AbortController();
		let called = false;

		{
			using _cleanup = onAbort(controller.signal, () => {
				called = true;
			});

			// Not aborted yet
			expect(called).toBe(false);
		}

		// After disposal, callback is unregistered
		controller.abort();
		await new Promise((r) => setTimeout(r, 10));

		expect(called).toBe(false);
	});
});

describe("abortPromise", () => {
	test("rejects when signal is aborted", async () => {
		const controller = new AbortController();

		const promise = abortPromise(controller.signal);

		controller.abort(new Error("cancelled"));

		await expect(promise).rejects.toThrow("cancelled");
	});

	test("rejects immediately if already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("already cancelled"));

		await expect(abortPromise(controller.signal)).rejects.toThrow(
			"already cancelled",
		);
	});

	test("can be used in Promise.race", async () => {
		const controller = new AbortController();

		const result = await Promise.race([
			new Promise<string>((resolve) => setTimeout(() => resolve("done"), 100)),
			abortPromise(controller.signal).catch(() => "cancelled"),
		]);

		expect(result).toBe("done");

		// Abort after
		controller.abort();
	});
});

describe("raceSignals", () => {
	test("returns signal that aborts when first input aborts", async () => {
		const controller1 = new AbortController();
		const controller2 = new AbortController();

		const raced = raceSignals([controller1.signal, controller2.signal]);

		expect(raced.aborted).toBe(false);

		controller1.abort(new Error("first"));

		expect(raced.aborted).toBe(true);
		expect(raced.reason).toBeInstanceOf(Error);
		expect((raced.reason as Error).message).toBe("first");
	});

	test("returns immediately if any signal already aborted", () => {
		const controller1 = new AbortController();
		const controller2 = new AbortController();

		controller1.abort(new Error("already"));

		const raced = raceSignals([controller1.signal, controller2.signal]);

		expect(raced.aborted).toBe(true);
		expect((raced.reason as Error).message).toBe("already");
	});

	test("returns same signal for single input", () => {
		const controller = new AbortController();

		const raced = raceSignals([controller.signal]);

		expect(raced).toBe(controller.signal);
	});

	test("returns new signal for empty array", () => {
		const raced = raceSignals([]);

		expect(raced.aborted).toBe(false);
	});

	test("works with multiple signals", async () => {
		const controllers = [
			new AbortController(),
			new AbortController(),
			new AbortController(),
		];

		const raced = raceSignals(controllers.map((c) => c.signal));

		// Abort middle one
		controllers[1]!.abort(new Error("middle"));

		expect(raced.aborted).toBe(true);
		expect((raced.reason as Error).message).toBe("middle");
	});
});

describe("whenAborted", () => {
	test("resolves when signal is aborted", async () => {
		const controller = new AbortController();

		const promise = whenAborted(controller.signal);

		controller.abort("test reason");

		const reason = await promise;
		expect(reason).toBe("test reason");
	});

	test("resolves immediately if already aborted", async () => {
		const controller = new AbortController();
		controller.abort("already aborted");

		const reason = await whenAborted(controller.signal);
		expect(reason).toBe("already aborted");
	});

	test("can be used in async operations", async () => {
		const controller = new AbortController();

		const result = await Promise.race([
			whenAborted(controller.signal),
			new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
		]);

		expect(result).toBe("timeout");
	});
});

describe("integration with scope signal", () => {
	test("throwIfAborted works with scope signal", async () => {
		const { scope } = await import("../src/index.js");

		const s = scope();

		// Initially not aborted
		expect(() => throwIfAborted(s.signal)).not.toThrow();

		// Abort the scope
		await s[Symbol.asyncDispose]();

		// Now should throw
		expect(() => throwIfAborted(s.signal)).toThrow();
	});

	test("onAbort works with scope signal", async () => {
		const { scope } = await import("../src/index.js");

		const s = scope();
		let aborted = false;

		using _cleanup = onAbort(s.signal, () => {
			aborted = true;
		});

		expect(aborted).toBe(false);

		// Abort the scope
		await s[Symbol.asyncDispose]();

		// Give time for event to propagate
		await new Promise((r) => setTimeout(r, 10));

		expect(aborted).toBe(true);
	});

	test("raceSignals combines scope and custom timeout", async () => {
		const { scope } = await import("../src/index.js");

		const s = scope();
		const timeoutController = new AbortController();

		// Create a combined signal
		const combined = raceSignals([s.signal, timeoutController.signal]);

		// Fire timeout
		timeoutController.abort(new Error("custom timeout"));

		expect(combined.aborted).toBe(true);
		expect((combined.reason as Error).message).toBe("custom timeout");
	});

	test("can use cancellation utilities in task", async () => {
		const { scope } = await import("../src/index.js");

		await using s = scope();

		const task = s.task(({ signal }) => {
			// Test throwIfAborted
			expect(() => throwIfAborted(signal)).not.toThrow();

			// Test onAbort
			let callbackFired = false;
			using _d = onAbort(signal, () => {
				callbackFired = true;
			});

			return { initialAborted: signal.aborted, callbackFired };
		});

		const [err, result] = await task;

		expect(err).toBeUndefined();
		expect(result?.initialAborted).toBe(false);
		expect(result?.callbackFired).toBe(false); // Not aborted yet
	});
});
