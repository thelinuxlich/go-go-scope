/**
 * Debug Tree Tests - Visual scope hierarchy representation
 */
import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";

describe("createChild", () => {
	test("creates child scope with parent", async () => {
		await using s = scope({ name: "parent" });
		const child = s.createChild({ name: "child" });

		expect(child.scopeName).toBe("child");
	});

	test("child inherits parent signal", async () => {
		await using s = scope({ name: "parent" });
		const child = s.createChild({ name: "child" });

		// Child should have the same signal (or linked signal)
		expect(child.signal.aborted).toBe(s.signal.aborted);
	});

	test("child inherits parent traceId", async () => {
		await using s = scope({ 
			name: "parent",
			logCorrelation: true
		});
		const child = s.createChild({ 
			name: "child",
			logCorrelation: true  // Must enable to get traceId
		});

		expect(child.traceId).toBe(s.traceId);
		expect(child.spanId).not.toBe(s.spanId); // Different spanId
	});

	test("nested children", async () => {
		await using s = scope({ name: "grandparent" });
		const parent = s.createChild({ name: "parent" });
		const child = parent.createChild({ name: "child" });

		expect(child.scopeName).toBe("child");
	});
});

describe("debugTree", () => {
	describe("ASCII format", () => {
		test("renders single scope", async () => {
			await using s = scope({ name: "root" });
			const tree = s.debugTree({ format: "ascii" });
			
			expect(tree).toContain("📦");
			expect(tree).toContain("root");
		});

		test("renders scope hierarchy", async () => {
			await using s = scope({ name: "root" });
			const child = s.createChild({ name: "child" });
			const grandchild = child.createChild({ name: "grandchild" });
			
			const tree = s.debugTree({ format: "ascii" });
			
			expect(tree).toContain("root");
			expect(tree).toContain("child");
			expect(tree).toContain("grandchild");
		});

		test("renders multiple children", async () => {
			await using s = scope({ name: "root" });
			s.createChild({ name: "child1" });
			s.createChild({ name: "child2" });
			s.createChild({ name: "child3" });
			
			const tree = s.debugTree({ format: "ascii" });
			
			expect(tree).toContain("child1");
			expect(tree).toContain("child2");
			expect(tree).toContain("child3");
		});

		test("includes stats by default", async () => {
			await using s = scope({ name: "root" });
			
			// Create some tasks
			s.task(() => Promise.resolve("task1"));
			s.task(() => Promise.resolve("task2"));
			
			const tree = s.debugTree({ format: "ascii", includeStats: true });
			
			expect(tree).toContain("tasks:");
		});

		test("excludes stats when includeStats is false", async () => {
			await using s = scope({ name: "root" });
			
			const tree = s.debugTree({ format: "ascii", includeStats: false });
			
			expect(tree).not.toContain("tasks:");
		});

		test("shows disposed status", async () => {
			const s = scope({ name: "root" });
			const child = s.createChild({ name: "child" });
			
			// Dispose child
			await child[Symbol.asyncDispose]();
			
			const tree = s.debugTree({ format: "ascii" });
			
			expect(tree).toContain("💀");
		});
	});

	describe("Mermaid format", () => {
		test("renders mermaid graph", async () => {
			await using s = scope({ name: "root" });
			const child = s.createChild({ name: "child" });
			child.createChild({ name: "grandchild" });
			
			const tree = s.debugTree({ format: "mermaid" });
			
			expect(tree).toContain("graph TD");
			expect(tree).toContain("[");
			expect(tree).toContain("]");
		});

		test("renders single scope in mermaid", async () => {
			await using s = scope({ name: "root" });
			const tree = s.debugTree({ format: "mermaid" });
			
			expect(tree).toContain("graph TD");
			expect(tree).toContain("root");
		});

		test("renders connections between scopes", async () => {
			await using s = scope({ name: "root" });
			const child = s.createChild({ name: "child" });
			const grandchild = child.createChild({ name: "grandchild" });
			
			const tree = s.debugTree({ format: "mermaid" });
			
			// Should contain arrows connecting scopes
			expect(tree).toContain("-->");
		});
	});

	describe("default format", () => {
		test("defaults to ASCII format", async () => {
			await using s = scope({ name: "root" });
			const tree = s.debugTree();
			
			// ASCII format uses box emoji and tree characters
			expect(tree).toContain("📦");
			expect(tree).not.toContain("graph TD");
		});
	});

	describe("complex hierarchies", () => {
		test("renders deep hierarchy", async () => {
			await using s = scope({ name: "level0" });
			let current = s;
			for (let i = 1; i <= 5; i++) {
				current = current.createChild({ name: `level${i}` });
			}
			
			const tree = s.debugTree({ format: "ascii" });
			
			for (let i = 0; i <= 5; i++) {
				expect(tree).toContain(`level${i}`);
			}
		});

		test("renders wide hierarchy", async () => {
			await using s = scope({ name: "root" });
			for (let i = 0; i < 10; i++) {
				s.createChild({ name: `child${i}` });
			}
			
			const tree = s.debugTree({ format: "ascii" });
			
			for (let i = 0; i < 10; i++) {
				expect(tree).toContain(`child${i}`);
			}
		});
	});
});
