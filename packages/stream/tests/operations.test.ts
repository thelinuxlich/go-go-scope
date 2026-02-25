/**
 * Tests for Stream operations - collect, collectWhile, grouped, pipe, runHead, runLast, runSum
 */

import { describe, expect, test } from "vitest";
import { Stream } from "../src/index.js";
import { scope } from "go-go-scope";

// Helper to create async iterable
async function* fromArray<T>(arr: T[]): AsyncGenerator<T> {
	for (const item of arr) {
		yield item;
	}
}

describe("Stream - collect", () => {
	test("collect filters and maps with partial function", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6]), s)
			.collect((x) => (x % 2 === 0 ? x * 10 : undefined))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 40, 60]);
	});

	test("collect with string parsing", async () => {
		await using s = scope();
		const [err, results] = await new Stream(
			fromArray(["1", "a", "2", "b", "3"]),
			s,
		)
			.collect((x) => {
				const n = Number.parseInt(x, 10);
				return Number.isNaN(n) ? undefined : n;
			})
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("collect returns empty for no matches", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 3, 5]), s)
			.collect((x) => (x % 2 === 0 ? x : undefined))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});

	test("collect with type transformation", async () => {
		await using s = scope();
		interface User {
			name: string;
			age?: number;
		}

		const users: User[] = [
			{ name: "Alice", age: 30 },
			{ name: "Bob" },
			{ name: "Charlie", age: 25 },
		];

		const [err, results] = await new Stream(fromArray(users), s)
			.collect((u) => u.age) // only users with age
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([30, 25]);
	});

	test("collect on empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, results] = await new Stream(empty(), s)
			.collect((x) => x)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});
});

describe("Stream - collectWhile", () => {
	test("collectWhile stops at first undefined", async () => {
		await using s = scope();
		const [err, results] = await new Stream(
			fromArray(["1", "2", "3", "stop", "4"]),
			s,
		)
			.collectWhile((x) => {
				if (x === "stop") return undefined;
				const n = Number.parseInt(x, 10);
				return Number.isNaN(n) ? undefined : n;
			})
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("collectWhile processes all when all match", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.collectWhile((x) => (x < 10 ? x * 2 : undefined))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([2, 4, 6, 8, 10]);
	});

	test("collectWhile stops immediately if first is undefined", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([10, 1, 2, 3]), s)
			.collectWhile((x) => (x < 5 ? x : undefined))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});

	test("collectWhile with predicate on objects", async () => {
		await using s = scope();
		const items = [
			{ type: "num", value: 1 },
			{ type: "num", value: 2 },
			{ type: "str", value: "stop" },
			{ type: "num", value: 3 },
		];

		const [err, results] = await new Stream(fromArray(items), s)
			.collectWhile((item) =>
				item.type === "num" ? item.value : undefined,
			)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2]);
	});

	test("collectWhile on empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, results] = await new Stream(empty(), s)
			.collectWhile((x) => x)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});
});

describe("Stream - grouped", () => {
	test("grouped chunks elements into fixed sizes", async () => {
		await using s = scope();
		const [err, results] = await new Stream(
			fromArray([1, 2, 3, 4, 5, 6, 7]),
			s,
		)
			.grouped(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
	});

	test("grouped with exact multiple", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6]), s)
			.grouped(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2, 3], [4, 5, 6]]);
	});

	test("grouped with size 1", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.grouped(1)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1], [2], [3]]);
	});

	test("grouped on empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, results] = await new Stream(empty(), s).grouped(3).toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});

	test("grouped is alias for buffer", async () => {
		await using s = scope();
		const [err1, groupedResults] = await new Stream(
			fromArray([1, 2, 3, 4, 5]),
			s,
		)
			.grouped(2)
			.toArray();

		const [err2, bufferResults] = await new Stream(
			fromArray([1, 2, 3, 4, 5]),
			s,
		)
			.buffer(2)
			.toArray();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(groupedResults).toEqual(bufferResults);
	});
});

describe("Stream - pipe", () => {
	test("pipe applies transformation functions", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.pipe(
				(s) => s.filter((x) => x % 2 === 0),
				(s) => s.map((x) => x * 10),
				(s) => s.take(2),
			)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 40]);
	});

	test("pipe with single function", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.pipe((s) => s.filter((x) => x > 3))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([4, 5]);
	});

	test("pipe with many functions", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), s)
			.pipe(
				(s) => s.filter((x) => x % 2 === 0), // [2, 4, 6, 8, 10]
				(s) => s.map((x) => x / 2), // [1, 2, 3, 4, 5]
				(s) => s.filter((x) => x > 2), // [3, 4, 5]
				(s) => s.map((x) => x * x), // [9, 16, 25]
				(s) => s.take(2), // [9, 16]
			)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([9, 16]);
	});

	test("pipe with empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, results] = await new Stream(empty(), s)
			.pipe(
				(s) => s.map((x) => x * 2),
				(s) => s.filter((x) => x > 10),
			)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});

	test("pipe preserves type safety through chain", async () => {
		await using s = scope();
		interface User {
			id: number;
			name: string;
		}

		const users: User[] = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
			{ id: 3, name: "Charlie" },
		];

		const [err, results] = await new Stream(fromArray(users), s)
			.pipe(
				(s) => s.filter((u) => u.id > 1),
				(s) => s.map((u) => u.name.toUpperCase()),
				(s) => s.take(1),
			)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual(["BOB"]);
	});

	test("pipe with no functions returns same stream", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s).pipe().toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});
});

describe("Stream - runHead", () => {
	test("runHead returns first element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([5, 4, 3, 2, 1]), s).runHead();

		expect(err).toBeUndefined();
		expect(result).toBe(5);
	});

	test("runHead returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await new Stream(empty(), s).runHead();

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("runHead is alias for first", async () => {
		await using s = scope();
		const stream = new Stream(fromArray([1, 2, 3]), s);

		const [err1, headResult] = await stream.runHead();
		const [err2, firstResult] = await stream.runHead(); // Note: stream consumed, use fresh

		// Both should return the same for a fresh stream
		const freshStream = new Stream(fromArray([1, 2, 3]), s);
		const [err3, freshHead] = await freshStream.runHead();

		const anotherFresh = new Stream(fromArray([1, 2, 3]), s);
		const [err4, freshFirst] = await anotherFresh.first();

		expect(err3).toBeUndefined();
		expect(err4).toBeUndefined();
		expect(freshHead).toBe(freshFirst);
	});

	test("runHead with chained operations", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.filter((x) => x % 2 === 0)
			.map((x) => x * 10)
			.runHead();

		expect(err).toBeUndefined();
		expect(result).toBe(20);
	});
});

describe("Stream - runLast", () => {
	test("runLast returns last element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runLast();

		expect(err).toBeUndefined();
		expect(result).toBe(5);
	});

	test("runLast returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await new Stream(empty(), s).runLast();

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("runLast is alias for last", async () => {
		await using s = scope();
		const [err1, runLastResult] = await new Stream(fromArray([1, 2, 3]), s).runLast();

		const [err2, lastResult] = await new Stream(fromArray([1, 2, 3]), s).last();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(runLastResult).toBe(lastResult);
	});

	test("runLast with chained operations", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.filter((x) => x % 2 === 0)
			.map((x) => x * 10)
			.runLast();

		expect(err).toBeUndefined();
		expect(result).toBe(40);
	});
});

describe("Stream - runSum", () => {
	test("runSum adds all numeric values", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(15);
	});

	test("runSum with single element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([42]), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(42);
	});

	test("runSum returns 0 for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await new Stream(empty(), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(0);
	});

	test("runSum is alias for sum", async () => {
		await using s = scope();
		const [err1, runSumResult] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runSum();

		const [err2, sumResult] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).sum();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(runSumResult).toBe(sumResult);
	});

	test("runSum with negative numbers", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([10, -5, 3, -2]), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(6);
	});

	test("runSum with chained filter", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5, 6]), s)
			.filter((x) => x % 2 === 0)
			.runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(12); // 2 + 4 + 6
	});
});

describe("Stream - Integration with existing operations", () => {
	test("collect followed by grouped", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8]), s)
			.collect((x) => (x % 2 === 0 ? x : undefined))
			.grouped(2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([
			[2, 4],
			[6, 8],
		]);
	});

	test("collectWhile with pipe", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([2, 4, 6, 7, 8, 10]), s)
			.collectWhile((x) => (x % 2 === 0 ? x : undefined))
			.pipe(
				(s) => s.map((x) => x / 2),
				(s) => s.fold(0, (acc, x) => acc + x),
			);

		expect(err).toBeUndefined();
		expect(result).toBe(6); // (2+4+6)/2 = 6
	});

	test("complex pipeline with all new operations", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), s)
			.pipe(
				(s) => s.filter((x) => x > 2),
				(s) => s.collect((x) => (x % 2 === 0 ? x * 10 : undefined)),
				(s) => s.take(3),
			)
			.runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(180); // 40 + 60 + 80 = 180 (100 is excluded by take(3))
	});

	test("groupedWithin and runLast", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.groupedWithin(2, 1000)
			.runLast();

		expect(err).toBeUndefined();
		expect(result).toEqual([5]);
	});
});
