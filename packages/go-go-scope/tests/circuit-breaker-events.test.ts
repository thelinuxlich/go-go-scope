/**
 * Circuit Breaker Events Tests
 */
import { describe, expect, test, vi } from "vitest";
import { CircuitBreaker } from "../src/index.js";

describe("CircuitBreaker events", () => {
	describe("on/off", () => {
		test("subscribe to stateChange event", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 2 });
			const handler = vi.fn();

			cb.on("stateChange", handler);

			// Trigger state change
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).toHaveBeenCalledWith("closed", "open", 2);
		});

		test("subscribe to open event", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1 });
			const handler = vi.fn();

			cb.on("open", handler);

			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).toHaveBeenCalledWith(1);
		});

		test("subscribe to close event", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1, successThreshold: 1, resetTimeout: 10 });
			const handler = vi.fn();

			cb.on("close", handler);

			// Open the circuit
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}
			expect(cb.currentState).toBe("open");

			// Wait for reset timeout to transition to half-open
			await new Promise((r) => setTimeout(r, 20));

			// Close it with success (need 1 success in half-open)
			await cb.execute(() => "success");

			expect(cb.currentState).toBe("closed");
			expect(handler).toHaveBeenCalled();
		});

		test("subscribe to halfOpen event", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 10 });
			const handler = vi.fn();

			cb.on("halfOpen", handler);

			// Open the circuit
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			// Wait for reset timeout
			await new Promise((r) => setTimeout(r, 20));

			// This should transition to half-open
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).toHaveBeenCalled();
		});

		test("subscribe to success event", async () => {
			const cb = new CircuitBreaker();
			const handler = vi.fn();

			cb.on("success", handler);

			await cb.execute(() => "success");

			expect(handler).toHaveBeenCalled();
		});

		test("subscribe to failure event", async () => {
			const cb = new CircuitBreaker();
			const handler = vi.fn();

			cb.on("failure", handler);

			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).toHaveBeenCalled();
		});

		test("unsubscribe with off", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1 });
			const handler = vi.fn();

			cb.on("open", handler);
			cb.off("open", handler);

			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).not.toHaveBeenCalled();
		});

		test("unsubscribe with returned function", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1 });
			const handler = vi.fn();

			const unsubscribe = cb.on("open", handler);
			unsubscribe();

			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			expect(handler).not.toHaveBeenCalled();
		});

		test("once only fires once", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1 });
			const handler = vi.fn();

			cb.once("success", handler);

			await cb.execute(() => "success1");
			await cb.execute(() => "success2");

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("thresholdAdapt event", () => {
		test("emits thresholdAdapt when adaptive threshold changes", async () => {
			const cb = new CircuitBreaker({
				failureThreshold: 5,
				advanced: {
					adaptiveThreshold: true,
					errorRateWindowMs: 1000,
					minThreshold: 2,
					maxThreshold: 10,
				},
			});
			const handler = vi.fn();

			cb.on("thresholdAdapt", handler);

			// Generate many failures to trigger threshold adaptation
			for (let i = 0; i < 10; i++) {
				try { await cb.execute(() => { throw new Error("fail"); }); } catch {}
			}

			// Should have emitted thresholdAdapt
			expect(handler).toHaveBeenCalled();
			expect(handler.mock.calls[0]?.[0]).toBeTypeOf("number"); // threshold
			expect(handler.mock.calls[0]?.[1]).toBeTypeOf("number"); // errorRate
		});
	});

	describe("event handler isolation", () => {
		test("errors in event handlers don't break circuit breaker", async () => {
			const cb = new CircuitBreaker({ failureThreshold: 1 });

			cb.on("open", () => { throw new Error("Handler error"); });

			// Should not throw
			try { await cb.execute(() => { throw new Error("fail"); }); } catch {}

			// Circuit breaker should still be in correct state
			expect(cb.currentState).toBe("open");
		});

		test("multiple handlers all receive events", async () => {
			const cb = new CircuitBreaker();
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			cb.on("success", handler1);
			cb.on("success", handler2);

			await cb.execute(() => "success");

			expect(handler1).toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		test("disposing clears event listeners", async () => {
			const cb = new CircuitBreaker();
			const handler = vi.fn();

			cb.on("success", handler);
			await cb[Symbol.asyncDispose]();

			// After dispose, events shouldn't fire
			await cb.execute(() => "success");

			expect(handler).not.toHaveBeenCalled();
		});
	});
});
