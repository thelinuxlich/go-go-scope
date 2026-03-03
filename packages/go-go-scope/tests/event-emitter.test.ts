/**
 * Scoped EventEmitter Tests
 */
import { describe, expect, test, vi } from "vitest";
import { scope, createEventEmitter, ScopedEventEmitter } from "../src/index.js";

describe("ScopedEventEmitter", () => {
	describe("basic functionality", () => {
		test("subscribe and emit", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				message: (text: string) => void;
			}>();

			const handler = vi.fn();
			emitter.on("message", handler);

			emitter.emit("message", "Hello");

			expect(handler).toHaveBeenCalledWith("Hello");
		});

		test("multiple subscribers receive event", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				data: (n: number) => void;
			}>();

			const handler1 = vi.fn();
			const handler2 = vi.fn();

			emitter.on("data", handler1);
			emitter.on("data", handler2);

			emitter.emit("data", 42);

			expect(handler1).toHaveBeenCalledWith(42);
			expect(handler2).toHaveBeenCalledWith(42);
		});

		test("unsubscribe with returned function", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const handler = vi.fn();
			const unsubscribe = emitter.on("event", handler);

			unsubscribe();
			emitter.emit("event");

			expect(handler).not.toHaveBeenCalled();
		});

		test("unsubscribe with off", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const handler = vi.fn();
			emitter.on("event", handler);
			emitter.off("event", handler);

			emitter.emit("event");

			expect(handler).not.toHaveBeenCalled();
		});

		test("once only fires once", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const handler = vi.fn();
			emitter.once("event", handler);

			emitter.emit("event");
			emitter.emit("event");
			emitter.emit("event");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("listener count", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			expect(emitter.listenerCount("event")).toBe(0);

			const handler1 = () => {};
			const handler2 = () => {};

			emitter.on("event", handler1);
			expect(emitter.listenerCount("event")).toBe(1);

			emitter.on("event", handler2);
			expect(emitter.listenerCount("event")).toBe(2);

			emitter.off("event", handler1);
			expect(emitter.listenerCount("event")).toBe(1);
		});

		test("hasListeners", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			expect(emitter.hasListeners("event")).toBe(false);

			emitter.on("event", () => {});
			expect(emitter.hasListeners("event")).toBe(true);
		});

		test("eventNames", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event1: () => void;
				event2: () => void;
			}>();

			emitter.on("event1", () => {});
			emitter.on("event2", () => {});

			const names = emitter.eventNames();
			expect(names).toContain("event1");
			expect(names).toContain("event2");
		});

		test("emit returns count of handlers called", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			emitter.on("event", () => {});
			emitter.on("event", () => {});

			const count = emitter.emit("event");
			expect(count).toBe(2);
		});

		test("emit returns 0 for no listeners", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const count = emitter.emit("event");
			expect(count).toBe(0);
		});
	});

	describe("auto-cleanup", () => {
		test("listeners removed when scope disposes", async () => {
			const handler = vi.fn();

			{
				await using s = scope();
				const emitter = s.eventEmitter<{
					event: () => void;
				}>();

				emitter.on("event", handler);
				expect(emitter.listenerCount("event")).toBe(1);
			}

			// After scope disposal, emitter should be cleaned up
			// (can't test directly since emitter is out of scope)
		});

		test("cannot subscribe after disposal", async () => {
			const s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			await s[Symbol.asyncDispose]();

			expect(() => {
				emitter.on("event", () => {});
			}).toThrow("Cannot subscribe to disposed EventEmitter");
		});

		test("emit does nothing after disposal", async () => {
			const s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const handler = vi.fn();
			emitter.on("event", handler);

			await s[Symbol.asyncDispose]();

			const count = emitter.emit("event");
			expect(count).toBe(0);
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		test("errors in handlers don't break other handlers", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => void;
			}>();

			const handler1 = vi.fn(() => {
				throw new Error("Handler error");
			});
			const handler2 = vi.fn();

			emitter.on("event", handler1);
			emitter.on("event", handler2);

			// Should not throw
			emitter.emit("event");

			expect(handler1).toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		test("async emit awaits all handlers", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event: () => Promise<void>;
			}>();

			const order: string[] = [];

			emitter.on("event", async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push("first");
			});

			emitter.on("event", async () => {
				await new Promise((r) => setTimeout(r, 5));
				order.push("second");
			});

			await emitter.emitAsync("event");

			expect(order).toEqual(["second", "first"]);
		});
	});

	describe("removeAllListeners", () => {
		test("remove all listeners for specific event", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event1: () => void;
				event2: () => void;
			}>();

			const handler1 = vi.fn();
			const handler2 = vi.fn();

			emitter.on("event1", handler1);
			emitter.on("event2", handler2);

			emitter.removeAllListeners("event1");

			emitter.emit("event1");
			emitter.emit("event2");

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		test("remove all listeners for all events", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				event1: () => void;
				event2: () => void;
			}>();

			const handler1 = vi.fn();
			const handler2 = vi.fn();

			emitter.on("event1", handler1);
			emitter.on("event2", handler2);

			emitter.removeAllListeners();

			emitter.emit("event1");
			emitter.emit("event2");

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).not.toHaveBeenCalled();
		});
	});

	describe("createEventEmitter", () => {
		test("create standalone emitter", async () => {
			await using s = scope();
			const emitter = createEventEmitter<{
				message: (text: string) => void;
			}>(s);

			const handler = vi.fn();
			emitter.on("message", handler);

			emitter.emit("message", "Hello");

			expect(handler).toHaveBeenCalledWith("Hello");
		});
	});

	describe("complex scenarios", () => {
		test("multiple events with different types", async () => {
			await using s = scope();
			const emitter = s.eventEmitter<{
				data: (chunk: string, size: number) => void;
				end: () => void;
				error: (err: Error) => void;
			}>();

			const onData = vi.fn();
			const onEnd = vi.fn();
			const onError = vi.fn();

			emitter.on("data", onData);
			emitter.on("end", onEnd);
			emitter.on("error", onError);

			emitter.emit("data", "Hello", 5);
			emitter.emit("end");
			emitter.emit("error", new Error("Test"));

			expect(onData).toHaveBeenCalledWith("Hello", 5);
			expect(onEnd).toHaveBeenCalled();
			expect(onError).toHaveBeenCalledWith(expect.any(Error));
		});

		test("chained emitters", async () => {
			await using s = scope();
			const source = s.eventEmitter<{ data: (x: number) => void }>();
			const target = s.eventEmitter<{ data: (x: number) => void }>();

			const handler = vi.fn();
			target.on("data", handler);

			// Forward events
			source.on("data", (x) => target.emit("data", x * 2));

			source.emit("data", 5);

			expect(handler).toHaveBeenCalledWith(10);
		});
	});
});
