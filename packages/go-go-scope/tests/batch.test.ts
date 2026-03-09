import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";

describe("scope.batch()", () => {
	test("processes items when batch size is reached", async () => {
		await using s = scope();
		const processed: string[][] = [];

		const batcher = s.batch({
			size: 3,
			process: async (items: string[]) => {
				processed.push([...items]);
				return items.length;
			},
		});

		await batcher.add("a");
		expect(processed.length).toBe(0);

		await batcher.add("b");
		expect(processed.length).toBe(0);

		const [err, result] = await batcher.add("c")!;
		expect(err).toBeUndefined();
		expect(result).toBe(3);
		expect(processed.length).toBe(1);
		expect(processed[0]).toEqual(["a", "b", "c"]);
	});

	test("auto-flushes on timeout", async () => {
		await using s = scope();
		const processed: number[][] = [];

		const batcher = s.batch({
			size: 100, // Won't be reached
			timeout: 50,
			process: async (items: number[]) => {
				processed.push([...items]);
				return items.length;
			},
		});

		await batcher.add(1);
		await batcher.add(2);

		// Wait for timeout
		await new Promise((r) => setTimeout(r, 100));

		expect(processed.length).toBe(1);
		expect(processed[0]).toEqual([1, 2]);
	});

	test("manual flush works", async () => {
		await using s = scope();
		const processed: string[] = [];

		const batcher = s.batch({
			size: 100,
			process: async (items: string[]) => {
				processed.push(...items);
				return items.length;
			},
		});

		await batcher.add("a");
		await batcher.add("b");

		const [err, result] = await batcher.flush();
		expect(err).toBeUndefined();
		expect(result).toBe(2);
		expect(processed).toEqual(["a", "b"]);
	});

	test("flush returns error when batch is empty", async () => {
		await using s = scope();

		const batcher = s.batch({
			process: async (items: string[]) => items.length,
		});

		const [err, result] = await batcher.flush();
		expect(err).toBeInstanceOf(Error);
		expect(result).toBeUndefined();
	});

	test("addMany adds multiple items", async () => {
		await using s = scope();
		const processed: number[][] = [];

		const batcher = s.batch({
			size: 5,
			process: async (items: number[]) => {
				processed.push([...items]);
				return items.length;
			},
		});

		await batcher.addMany([1, 2, 3, 4, 5]);

		expect(processed.length).toBe(1);
		expect(processed[0]).toEqual([1, 2, 3, 4, 5]);
	});

	test("stop flushes remaining items", async () => {
		await using s = scope();
		const processed: string[] = [];

		const batcher = s.batch({
			size: 100,
			process: async (items: string[]) => {
				processed.push(...items);
				return items.length;
			},
		});

		await batcher.add("a");
		await batcher.add("b");

		await batcher.stop();

		expect(processed).toEqual(["a", "b"]);
		expect(batcher.isStopped).toBe(true);
	});

	test("auto-flush on scope disposal", async () => {
		const s = scope();
		const processed: string[] = [];

		const batcher = s.batch({
			size: 100,
			process: async (items: string[]) => {
				processed.push(...items);
				return items.length;
			},
		});

		await batcher.add("a");
		await batcher.add("b");

		// Use stop() which properly awaits flush
		await batcher.stop();

		expect(processed).toEqual(["a", "b"]);
	});

	test("size property returns current batch size", async () => {
		await using s = scope();

		const batcher = s.batch({
			size: 10,
			process: async (items: string[]) => items.length,
		});

		expect(batcher.size).toBe(0);
		await batcher.add("a");
		expect(batcher.size).toBe(1);
		await batcher.add("b");
		expect(batcher.size).toBe(2);

		await batcher.flush();
		expect(batcher.size).toBe(0);
	});

	test("add returns error when stopped", async () => {
		await using s = scope();

		const batcher = s.batch({
			process: async (items: string[]) => items.length,
		});

		await batcher.stop();

		const result = await batcher.add("a");
		expect(result?.[0]).toBeInstanceOf(Error);
	});

	test("handles process errors", async () => {
		await using s = scope();

		const batcher = s.batch({
			size: 2,
			process: async () => {
				throw new Error("Process failed");
			},
		});

		await batcher.add("a");
		const [err, result] = await batcher.add("b")!;

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("Process failed");
		expect(result).toBeUndefined();
	});

	test("multiple flushes from addMany", async () => {
		await using s = scope();
		const processed: number[][] = [];

		const batcher = s.batch({
			size: 3,
			process: async (items: number[]) => {
				processed.push([...items]);
				return items.length;
			},
		});

		const results = await batcher.addMany([1, 2, 3, 4, 5, 6, 7]);

		// Should have triggered 2 full batches + 1 pending
		expect(results.length).toBe(2); // Two full batches flushed
		expect(processed.length).toBe(2);
		expect(processed[0]).toEqual([1, 2, 3]);
		expect(processed[1]).toEqual([4, 5, 6]);
		expect(batcher.size).toBe(1); // 7th item remains
	});
});
