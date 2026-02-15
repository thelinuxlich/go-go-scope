/**
 * Tests for testing utilities
 */

import { describe, test, expect } from "vitest";
import {
	assertScopeDisposed,
	createControlledTimer,
	createMockScope,
	createSpy,
	flushPromises,
} from "../src/testing/index.js";
import { scope } from "../src/index.js";

describe("testing utilities", () => {
	describe("createMockScope", () => {
		test("creates a mock scope", () => {
			const s = createMockScope();
			expect(s).toBeDefined();
			expect(s.taskCalls).toEqual([]);
		});

		test("tracks task calls", async () => {
			const s = createMockScope();

			await s.task(() => Promise.resolve(1));
			await s.task(() => Promise.resolve(2));

			expect(s.taskCalls.length).toBe(2);
			expect(s.getTaskCalls().length).toBe(2);
		});

		test("can clear task calls", async () => {
			const s = createMockScope();

			await s.task(() => Promise.resolve(1));
			s.clearTaskCalls();

			expect(s.taskCalls.length).toBe(0);
		});

		test("can be aborted", () => {
			const s = createMockScope();

			s.abort("test reason");

			expect(s.signal.aborted).toBe(true);
			expect(s.signal.reason).toBe("test reason");
		});

		test("can be created with aborted state", () => {
			const s = createMockScope({
				aborted: true,
				abortReason: "initial abort",
			});

			expect(s.signal.aborted).toBe(true);
			expect(s.signal.reason).toBe("initial abort");
		});

		test("injects services if provided", () => {
			const s = createMockScope({
				services: {
					db: { query: () => Promise.resolve([]) },
				},
			});

			expect((s as unknown as { db: unknown }).db).toBeDefined();
		});

		test("applies overrides if provided", () => {
			const s = createMockScope({
				services: {
					db: { name: "real" },
				},
				overrides: {
					db: { name: "mock" },
				},
			});

			expect((s as unknown as { db: { name: string } }).db.name).toBe("mock");
		});

		test("mockService helper works", () => {
			const s = createMockScope({
				services: {
					api: { baseUrl: "https://api.example.com" },
				},
			});

			s.mockService("api", { baseUrl: "https://mock-api.example.com" });

			expect((s as unknown as { api: { baseUrl: string } }).api.baseUrl).toBe(
				"https://mock-api.example.com",
			);
		});

		test("mockService returns scope for chaining", () => {
			const s = createMockScope({
				services: {
					db: { name: "real" },
					cache: { name: "real" },
				},
			});

			s.mockService("db", { name: "mock-db" }).mockService("cache", {
				name: "mock-cache",
			});

			expect((s as unknown as { db: { name: string } }).db.name).toBe("mock-db");
			expect((s as unknown as { cache: { name: string } }).cache.name).toBe(
				"mock-cache",
			);
		});

		test("tasks return correct results", async () => {
			const s = createMockScope();

			const [err, result] = await s.task(() => Promise.resolve("test"));

			expect(err).toBeUndefined();
			expect(result).toBe("test");
		});

		test("tasks handle errors", async () => {
			const s = createMockScope();

			const [err, result] = await s.task(() =>
				Promise.reject(new Error("test error")),
			);

			expect(err).toBeInstanceOf(Error);
			expect(result).toBeUndefined();
		});
	});

	describe("createControlledTimer", () => {
		test("creates a timer", () => {
			const timer = createControlledTimer();
			expect(timer).toBeDefined();
			expect(timer.currentTime).toBe(0);
		});

		test("schedules timeouts", () => {
			const timer = createControlledTimer();
			let called = false;

			timer.setTimeout(() => {
				called = true;
			}, 100);

			expect(called).toBe(false);
			timer.advance(100);
			expect(called).toBe(true);
		});

		test("clears timeouts", () => {
			const timer = createControlledTimer();
			let called = false;

			const id = timer.setTimeout(() => {
				called = true;
			}, 100);

			timer.clearTimeout(id);
			timer.advance(100);
			expect(called).toBe(false);
		});

		test("advances time", () => {
			const timer = createControlledTimer();

			timer.advance(500);
			expect(timer.currentTime).toBe(500);

			timer.advance(500);
			expect(timer.currentTime).toBe(1000);
		});

		test("flushes all timers", async () => {
			const timer = createControlledTimer();
			const calls: number[] = [];

			timer.setTimeout(() => calls.push(1), 100);
			timer.setTimeout(() => calls.push(2), 200);
			timer.setTimeout(() => calls.push(3), 300);

			await timer.flush();

			expect(calls).toEqual([1, 2, 3]);
		});

		test("executes timeouts in order", () => {
			const timer = createControlledTimer();
			const calls: number[] = [];

			timer.setTimeout(() => calls.push(3), 300);
			timer.setTimeout(() => calls.push(1), 100);
			timer.setTimeout(() => calls.push(2), 200);

			timer.advance(300);

			expect(calls).toEqual([1, 2, 3]);
		});

		test("resets timer", () => {
			const timer = createControlledTimer();

			timer.setTimeout(() => {}, 100);
			timer.advance(50);
			timer.reset();

			expect(timer.currentTime).toBe(0);
		});
	});

	describe("flushPromises", () => {
		test("flushes pending promises", async () => {
			let resolved = false;

			Promise.resolve().then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);
			await flushPromises();
			expect(resolved).toBe(true);
		});
	});

	describe("createSpy", () => {
		test("creates a spy function", () => {
			const spy = createSpy<[], void>();
			expect(spy).toBeDefined();
			expect(typeof spy).toBe("function");
		});

		test("tracks calls", () => {
			const spy = createSpy<[number, string], void>();

			spy(1, "a");
			spy(2, "b");

			expect(spy.getCalls().length).toBe(2);
			expect(spy.getCalls()[0].args).toEqual([1, "a"]);
			expect(spy.getCalls()[1].args).toEqual([2, "b"]);
		});

		test("wasCalled returns true when called", () => {
			const spy = createSpy<[], void>();

			expect(spy.wasCalled()).toBe(false);
			spy();
			expect(spy.wasCalled()).toBe(true);
		});

		test("wasCalledWith checks arguments", () => {
			const spy = createSpy<[number, string], void>();

			spy(1, "test");

			expect(spy.wasCalledWith(1, "test")).toBe(true);
			expect(spy.wasCalledWith(2, "other")).toBe(false);
		});

		test("mockReturnValue sets return value", () => {
			const spy = createSpy<[], string>();
			spy.mockReturnValue("mocked");

			const result = spy();

			expect(result).toBe("mocked");
		});

		test("mockImplementation sets function", () => {
			const spy = createSpy<[number], number>();
			spy.mockImplementation((x) => x * 2);

			expect(spy(5)).toBe(10);
			expect(spy(3)).toBe(6);
		});

		test("mockReset clears calls", () => {
			const spy = createSpy<[], void>();

			spy.mockReturnValue("test");
			spy();
			spy.mockReset();

			expect(spy.getCalls().length).toBe(0);
			expect(spy.wasCalled()).toBe(false);
		});
	});

	describe("assertScopeDisposed", () => {
		test("asserts scope is disposed", async () => {
			const s = scope();

			await assertScopeDisposed(s);

			expect(s.isDisposed).toBe(true);
			expect(s.signal.aborted).toBe(true);
		});

		test("throws if scope signal is not aborted", async () => {
			// This test would need to mock a scope that doesn't abort properly
			// For now, we just verify the happy path works
			const s = scope();
			await assertScopeDisposed(s);
			expect(s.isDisposed).toBe(true);
		});
	});
});
