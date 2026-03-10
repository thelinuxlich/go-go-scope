/**
 * Tests for dynamic context API
 */

import { describe, expect, test } from "vitest";
import { scope } from "../src/factory.js";

describe("dynamic context API", () => {
	describe("setContext", () => {
		test("sets context value", async () => {
			await using s = scope();
			s.setContext("key", "value");
			expect(s.getContext("key")).toBe("value");
		});

		test("returns scope for chaining", async () => {
			await using s = scope();
			const result = s.setContext("key", "value");
			expect(result).toBe(s);
		});

		test("allows chaining multiple sets", async () => {
			await using s = scope();
			s.setContext("key1", "value1")
				.setContext("key2", "value2")
				.setContext("key3", "value3");
			expect(s.getContext("key1")).toBe("value1");
			expect(s.getContext("key2")).toBe("value2");
			expect(s.getContext("key3")).toBe("value3");
		});

		test("throws on disposed scope", async () => {
			const s = scope();
			await s[Symbol.asyncDispose]();
			expect(() => s.setContext("key", "value")).toThrow(
				"Cannot set context on disposed scope",
			);
		});

		test("overwrites existing key", async () => {
			await using s = scope();
			s.setContext("key", "value1");
			s.setContext("key", "value2");
			expect(s.getContext("key")).toBe("value2");
		});
	});

	describe("getContext", () => {
		test("returns undefined for missing key", async () => {
			await using s = scope();
			expect(s.getContext("nonexistent")).toBeUndefined();
		});

		test("returns value with correct type", async () => {
			await using s = scope();
			s.setContext("string", "value");
			s.setContext("number", 42);
			s.setContext("boolean", true);
			s.setContext("object", { foo: "bar" });

			expect(s.getContext<string>("string")).toBe("value");
			expect(s.getContext<number>("number")).toBe(42);
			expect(s.getContext<boolean>("boolean")).toBe(true);
			expect(s.getContext<{ foo: string }>("object")).toEqual({ foo: "bar" });
		});

		test("inherits context from parent scope", async () => {
			await using parent = scope();
			parent.setContext("parentKey", "parentValue");

			const child = parent.createChild();
			expect(child.getContext("parentKey")).toBe("parentValue");

			await child[Symbol.asyncDispose]();
		});

		test("child can override parent context", async () => {
			await using parent = scope();
			parent.setContext("key", "parentValue");

			const child = parent.createChild();
			child.setContext("key", "childValue");
			expect(child.getContext("key")).toBe("childValue");
			expect(parent.getContext("key")).toBe("parentValue");

			await child[Symbol.asyncDispose]();
		});
	});

	describe("hasContext", () => {
		test("returns false for missing key", async () => {
			await using s = scope();
			expect(s.hasContext("missing")).toBe(false);
		});

		test("returns true for existing key", async () => {
			await using s = scope();
			s.setContext("key", "value");
			expect(s.hasContext("key")).toBe(true);
		});

		test("returns true for inherited context", async () => {
			await using parent = scope();
			parent.setContext("key", "value");

			const child = parent.createChild();
			expect(child.hasContext("key")).toBe(true);

			await child[Symbol.asyncDispose]();
		});
	});

	describe("removeContext", () => {
		test("removes existing key", async () => {
			await using s = scope();
			s.setContext("key", "value");
			expect(s.hasContext("key")).toBe(true);

			const removed = s.removeContext("key");
			expect(removed).toBe(true);
			expect(s.hasContext("key")).toBe(false);
		});

		test("returns false for missing key", async () => {
			await using s = scope();
			const removed = s.removeContext("nonexistent");
			expect(removed).toBe(false);
		});

		test("does not affect parent context when child removes own key", async () => {
			await using parent = scope();
			parent.setContext("key", "parentValue");

			const child = parent.createChild();
			// Child sets its own key
			child.setContext("childKey", "childValue");

			// Remove child's own key
			expect(child.removeContext("childKey")).toBe(true);
			expect(child.hasContext("childKey")).toBe(false);

			// Parent and inherited context unaffected
			expect(parent.hasContext("childKey")).toBe(false);
			expect(child.hasContext("key")).toBe(true);
			expect(parent.hasContext("key")).toBe(true);

			await child[Symbol.asyncDispose]();
		});
	});

	describe("getAllContext", () => {
		test("returns empty object initially", async () => {
			await using s = scope();
			const ctx = s.getAllContext();
			expect(ctx).toEqual({});
		});

		test("returns all context values", async () => {
			await using s = scope();
			s.setContext("key1", "value1");
			s.setContext("key2", "value2");

			const ctx = s.getAllContext();
			expect(ctx).toEqual({
				key1: "value1",
				key2: "value2",
			});
		});

		test("returns readonly copy", async () => {
			await using s = scope();
			s.setContext("key", "value");

			const ctx = s.getAllContext();
			// @ts-expect-error Testing that it's readonly
			ctx.key = "modified";

			// Original should be unchanged
			expect(s.getContext("key")).toBe("value");
		});

		test("includes inherited context", async () => {
			await using parent = scope();
			parent.setContext("parentKey", "parentValue");

			const child = parent.createChild();
			child.setContext("childKey", "childValue");

			const ctx = child.getAllContext();
			expect(ctx).toEqual({
				parentKey: "parentValue",
				childKey: "childValue",
			});

			await child[Symbol.asyncDispose]();
		});
	});

	describe("integration with tasks", () => {
		test("task receives context via context property", async () => {
			await using s = scope();
			s.setContext("requestId", "abc-123");

			const [err, result] = await s.task(({ context }) => {
				return context.requestId;
			});

			expect(err).toBeUndefined();
			expect(result).toBe("abc-123");
		});

		test("task context includes initial context", async () => {
			await using s = scope({ context: { initial: true } });
			s.setContext("dynamic", "value");

			const [err, result] = await s.task(({ context }) => {
				return {
					initial: context.initial,
					dynamic: context.dynamic,
				};
			});

			expect(err).toBeUndefined();
			expect(result).toEqual({
				initial: true,
				dynamic: "value",
			});
		});

		test("child scope context is isolated", async () => {
			await using parent = scope();
			parent.setContext("parentKey", "parentValue");

			const child = parent.createChild();
			child.setContext("childKey", "childValue");

			const [err1, parentResult] = await parent.task(({ context }) => context);
			const [err2, childResult] = await child.task(({ context }) => context);

			expect(err1).toBeUndefined();
			expect(err2).toBeUndefined();

			// Parent should not see child's key
			expect(parentResult).toEqual({ parentKey: "parentValue" });
			// Child should see both
			expect(childResult).toEqual({
				parentKey: "parentValue",
				childKey: "childValue",
			});

			await child[Symbol.asyncDispose]();
		});
	});
});
