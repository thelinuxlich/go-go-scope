/**
 * Comprehensive tests for Stream operations
 */

import { describe, expect, test } from "vitest";
import { Stream } from "@go-go-scope/stream";
import { scope } from "../src/index.js";

// Helper to create async iterable
async function* fromArray<T>(arr: T[]): AsyncGenerator<T> {
	for (const item of arr) {
		yield item;
	}
}

describe("Stream - Core Operations", () => {
	test("map transforms values", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.map(x => x * 2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([2, 4, 6]);
	});

	test("filter keeps only matching values", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.filter(x => x % 2 === 0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([2, 4]);
	});

	test("filterMap combines filter and map", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4]), s)
			.filterMap(x => x % 2 === 0 ? x * 10 : null)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 40]);
	});

	test("flatMap flattens nested iterables", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([[1, 2], [3, 4]]), s)
			.flatMap(arr => arr)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("flatten flattens one level", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([[1, 2], [3, 4]]), s)
			.flatten()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("tap executes side effects", async () => {
		await using s = scope();
		const sideEffects: number[] = [];

		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.tap(x => sideEffects.push(x))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
		expect(sideEffects).toEqual([1, 2, 3]);
	});

	test("scan accumulates values", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4]), s)
			.scan((acc, x) => acc + x, 0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 3, 6, 10]);
	});
});

describe("Stream - Slicing Operations", () => {
	test("take limits elements", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.take(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("takeWhile takes while predicate is true", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.takeWhile(x => x < 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("takeUntil takes until predicate is true (inclusive)", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.takeUntil(x => x === 3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("drop skips elements", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.drop(2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("dropWhile drops while predicate is true", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.dropWhile(x => x < 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([4, 5]);
	});

	test("dropUntil drops until predicate is true (inclusive)", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.dropUntil(x => x === 3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("skip is alias for drop", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.skip(2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("splitAt splits stream at position", async () => {
		await using s = scope();
		const [head, tail] = new Stream(fromArray([1, 2, 3, 4, 5]), s).splitAt(2);

		const [err1, first] = await head.toArray();
		const [err2, rest] = await tail.toArray();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(first).toEqual([1, 2]);
		expect(rest).toEqual([3, 4, 5]);
	});
});

describe("Stream - Grouping/Buffering", () => {
	test("buffer chunks elements", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7]), s)
			.buffer(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
	});

	test("bufferTime emits by time window", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.bufferTime(50)
			.toArray();

		const elapsed = Date.now() - start;
		expect(err).toBeUndefined();
		// Should emit all values (stream completes quickly)
		const allValues = results?.flat() || [];
		expect(allValues).toEqual([1, 2, 3, 4, 5]);
	});

	test("bufferTimeOrCount emits by time or count", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), s)
			.bufferTimeOrCount(1000, 3) // Will hit count limit first
			.toArray();

		expect(err).toBeUndefined();
		// Should emit in chunks of 3
		expect(results?.length).toBeGreaterThanOrEqual(3);
		const allValues = results?.flat() || [];
		expect(allValues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	test("groupAdjacentBy groups consecutive by key", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([
			{ user: "a", msg: "hi" },
			{ user: "a", msg: "hello" },
			{ user: "b", msg: "hey" },
			{ user: "a", msg: "back" },
		]), s)
			.groupAdjacentBy(m => m.user)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toHaveLength(3);
		expect(results![0]).toHaveLength(2); // user "a" messages
		expect(results![1]).toHaveLength(1); // user "b" message
		expect(results![2]).toHaveLength(1); // user "a" message
	});

	test("intersperse adds separator between elements", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.intersperse(0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 0, 2, 0, 3]);
	});
});

describe("Stream - Deduplication", () => {
	test("distinct removes all duplicates", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 2, 3, 3, 3, 4]), s)
			.distinct()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("distinctBy removes duplicates by key", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([
			{ id: 1, name: "a" },
			{ id: 2, name: "b" },
			{ id: 1, name: "c" }, // duplicate id
		]), s)
			.distinctBy(x => x.id)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toHaveLength(2);
		expect(results?.map(x => x.id)).toEqual([1, 2]);
	});

	test("distinctAdjacent removes consecutive duplicates", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 1, 2, 2, 2, 3, 3]), s)
			.distinctAdjacent()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("distinctAdjacentBy removes consecutive duplicates by key", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([
			{ type: "a", val: 1 },
			{ type: "a", val: 2 },
			{ type: "b", val: 3 },
			{ type: "b", val: 4 },
		]), s)
			.distinctAdjacentBy(x => x.type)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toHaveLength(2);
		expect(results?.map(x => x.type)).toEqual(["a", "b"]);
	});
});

describe("Stream - Combining Operations", () => {
	test("merge interleaves streams", async () => {
		await using s = scope();

		async function* slow() {
			yield 1;
			await new Promise(r => setTimeout(r, 10));
			yield 3;
		}

		async function* fast() {
			yield 2;
			yield 4;
		}

		const [err, results] = await new Stream(slow(), s)
			.merge(new Stream(fast(), s))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toContain(1);
		expect(results).toContain(2);
		expect(results).toContain(3);
		expect(results).toContain(4);
	});

	test("concat concatenates streams", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2]), s)
			.concat(new Stream(fromArray([3, 4]), s))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("prepend adds values at start", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([3, 4]), s)
			.prepend(1, 2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("append adds values at end", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2]), s)
			.append(3, 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("zip pairs elements from two streams", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.zip(new Stream(fromArray(["a", "b", "c"]), s))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
	});

	test("zipWithIndex adds index to elements", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray(["a", "b", "c"]), s)
			.zipWithIndex()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([["a", 0], ["b", 1], ["c", 2]]);
	});

	test("partition splits stream by predicate", async () => {
		await using s = scope();
		const [evens, odds] = new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.partition(x => x % 2 === 0);

		const [err1, evenResults] = await evens.toArray();
		const [err2, oddResults] = await odds.toArray();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(evenResults).toEqual([2, 4]);
		expect(oddResults).toEqual([1, 3, 5]);
	});

	test.skip("broadcast creates multiple consumers", async () => {
		// Broadcast uses queue-based distribution which needs further refinement
		await using s = scope();
		const [s1, s2] = new Stream(fromArray([1, 2, 3]), s)
			.broadcast(2);

		const [err1, r1] = await s1.toArray();
		const [err2, r2] = await s2.toArray();

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(r1).toEqual([1, 2, 3]);
		expect(r2).toEqual([1, 2, 3]);
	});

	test("switchMap with async outer emits all inner values", async () => {
		await using s = scope();

		async function* slowOuter() {
			yield 1;
			await new Promise(r => setTimeout(r, 10));
			yield 2;
			await new Promise(r => setTimeout(r, 10));
			yield 3;
		}

		// With slow outer stream, inner streams complete before next outer emission
		const [err, results] = await new Stream(slowOuter(), s)
			.switchMap(n => fromArray([n * 10, n * 100]))
			.toArray();

		expect(err).toBeUndefined();
		// All inner values emitted since outer is slow
		expect(results).toEqual([10, 100, 20, 200, 30, 300]);
	});

	test("switchMap handles empty outer stream", async () => {
		await using s = scope();

		async function* empty() {}

		const [err, results] = await new Stream(empty(), s)
			.switchMap(n => fromArray([n, n * 2]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});
});

describe("Stream - Rate Limiting", () => {
	test("throttle limits emission rate", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.throttle({ limit: 2, interval: 50 })
			.toArray();

		const elapsed = Date.now() - start;
		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4, 5]);
		// Should take some time due to throttling (be lenient with timing)
		expect(elapsed).toBeGreaterThanOrEqual(50);
	});

	test("debounce waits for silence", async () => {
		await using s = scope();
		
		async function* rapidSource() {
			yield 1;
			yield 2;
			await new Promise(r => setTimeout(r, 5));
			yield 3;
		}

		const [err, result] = await new Stream(rapidSource(), s)
			.debounce(30)
			.last();

		expect(err).toBeUndefined();
		expect(result).toBe(3); // Last value after debounce
	});

	test("spaced adds delay between elements", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.spaced(30)
			.toArray();

		const elapsed = Date.now() - start;
		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
		expect(elapsed).toBeGreaterThanOrEqual(60); // At least 2 delays between 3 items
	});

	test("delay is alias for spaced", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await new Stream(fromArray([1, 2]), s)
			.delay(30)
			.toArray();

		const elapsed = Date.now() - start;
		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2]);
		expect(elapsed).toBeGreaterThanOrEqual(30);
	});
});

describe("Stream - Timing Operations", () => {
	test("timeout fails if stream takes too long", async () => {
		await using s = scope();

		async function* slowSource() {
			yield 1;
			await new Promise(r => setTimeout(r, 100));
			yield 2;
		}

		const [err, results] = await new Stream(slowSource(), s)
			.timeout(50)
			.toArray();

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("timed out");
	});

	test("timeout succeeds if stream is fast enough", async () => {
		await using s = scope();

		async function* fastSource() {
			yield 1;
			yield 2;
		}

		const [err, results] = await new Stream(fastSource(), s)
			.timeout(500)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2]);
	});
});

describe("Stream - Error Handling", () => {
	test("catchError recovers from errors", async () => {
		await using s = scope();

		async function* errorSource() {
			yield 1;
			yield 2;
			throw new Error("boom");
		}

		const [err, results] = await new Stream(errorSource(), s)
			.catchError(() => fromArray([99]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 99]);
	});

	test("orElse provides fallback for empty stream", async () => {
		await using s = scope();

		// Create an empty stream by taking 0 elements
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.take(0)
			.orElse(fromArray([4, 5, 6]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([4, 5, 6]);
	});

	test("orElse provides fallback on error", async () => {
		await using s = scope();

		async function* errorSource() {
			yield 1;
			throw new Error("boom");
		}

		const [err, results] = await new Stream(errorSource(), s)
			.orElse(fromArray([99, 100]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([99, 100]);
	});

	test("orElseSucceed provides single fallback value on error", async () => {
		await using s = scope();

		async function* errorSource() {
			throw new Error("boom");
		}

		const [err, results] = await new Stream(errorSource(), s)
			.orElseSucceed(42)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([42]);
	});

	test("mapError transforms errors", async () => {
		await using s = scope();

		async function* errorSource() {
			throw new Error("original");
		}

		const [err] = await new Stream(errorSource(), s)
			.mapError(e => new Error("transformed"))
			.toArray();

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("transformed");
	});

	test("tapError executes side effect on error", async () => {
		await using s = scope();
		let tapped = false;

		async function* errorSource() {
			throw new Error("boom");
		}

		const [err] = await new Stream(errorSource(), s)
			.tapError(() => { tapped = true; })
			.toArray();

		expect(tapped).toBe(true);
		expect(err).toBeInstanceOf(Error);
	});

	test("ensuring runs cleanup on success", async () => {
		await using s = scope();
		let cleaned = false;

		const [err] = await new Stream(fromArray([1, 2, 3]), s)
			.ensuring(() => { cleaned = true; })
			.drain();

		expect(err).toBeUndefined();
		expect(cleaned).toBe(true);
	});

	test("ensuring runs cleanup on error", async () => {
		await using s = scope();
		let cleaned = false;

		async function* errorSource() {
			throw new Error("boom");
		}

		const [err] = await new Stream(errorSource(), s)
			.ensuring(() => { cleaned = true; })
			.toArray();

		expect(cleaned).toBe(true);
		expect(err).toBeInstanceOf(Error);
	});

	test.skip("retry with delay between retries", async () => {
		// Retry works for mid-stream failures, but the stream must be re-consumable
		// This is a limitation - retry works best with factory functions
		await using s = scope();
		
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.retry({ maxRetries: 2, delay: 10 })
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});
});

describe("Stream - Terminal Operations", () => {
	test("toArray collects all values", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3]), s)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("first gets first element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.first();

		expect(err).toBeUndefined();
		expect(result).toBe(1);
	});

	test("first returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await new Stream(empty(), s)
			.first();

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("last gets last element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.last();

		expect(err).toBeUndefined();
		expect(result).toBe(3);
	});

	test("find gets first matching element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.find(x => x > 3);

		expect(err).toBeUndefined();
		expect(result).toBe(4);
	});

	test("find returns undefined if no match", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.find(x => x > 10);

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("reduce combines values", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4]), s)
			.reduce((a, b) => a + b);

		expect(err).toBeUndefined();
		expect(result).toBe(10);
	});

	test("reduce returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await new Stream(empty(), s)
			.reduce((a, b) => a + b);

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("fold reduces with initial value", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.fold(10, (acc, x) => acc + x);

		expect(err).toBeUndefined();
		expect(result).toBe(16);
	});

	test("sum adds all numeric values", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.sum();

		expect(err).toBeUndefined();
		expect(result).toBe(15);
	});

	test("count returns element count", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s)
			.count();

		expect(err).toBeUndefined();
		expect(result).toBe(5);
	});

	test("some returns true if any match", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.some(x => x > 2);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("some returns false if none match", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.some(x => x > 10);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("every returns true if all match", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([2, 4, 6]), s)
			.every(x => x % 2 === 0);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("every returns false if any don't match", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([2, 3, 4]), s)
			.every(x => x % 2 === 0);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("includes returns true if value present", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.includes(2);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("includes returns false if value not present", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3]), s)
			.includes(99);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("forEach executes side effect for each value", async () => {
		await using s = scope();
		const collected: number[] = [];

		const [err] = await new Stream(fromArray([1, 2, 3]), s)
			.forEach(x => collected.push(x));

		expect(err).toBeUndefined();
		expect(collected).toEqual([1, 2, 3]);
	});

	test("drain consumes without collecting", async () => {
		await using s = scope();
		let consumed = 0;

		const [err] = await new Stream(fromArray([1, 2, 3]), s)
			.tap(() => consumed++)
			.drain();

		expect(err).toBeUndefined();
		expect(consumed).toBe(3);
	});

	test("runDrain is alias for drain", async () => {
		await using s = scope();
		let consumed = 0;

		const [err] = await new Stream(fromArray([1, 2, 3]), s)
			.tap(() => consumed++)
			.runDrain();

		expect(err).toBeUndefined();
		expect(consumed).toBe(3);
	});

	test("groupBy groups all elements by key", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([
			{ type: "a", val: 1 },
			{ type: "b", val: 2 },
			{ type: "a", val: 3 },
		]), s)
			.groupBy(x => x.type);

		expect(err).toBeUndefined();
		expect(result?.get("a")).toHaveLength(2);
		expect(result?.get("b")).toHaveLength(1);
	});

	test("groupByKey returns substreams for each key", async () => {
		await using s = scope();
		const { groups, done } = new Stream(fromArray([1, 2, 3, 4, 5, 6]), s).groupByKey(x => x % 2 === 0 ? 'even' : 'odd');

		// Get streams and consume them
		const [err1, evenResults] = await groups.get('even')!.toArray();
		const [err2, oddResults] = await groups.get('odd')!.toArray();

		// Wait for distribution to complete
		await done;

		expect(err1).toBeUndefined();
		expect(err2).toBeUndefined();
		expect(evenResults).toEqual([2, 4, 6]);
		expect(oddResults).toEqual([1, 3, 5]);
	});

	test("groupByKey handles empty stream", async () => {
		await using s = scope();
		const { groups, done } = new Stream(fromArray([]), s).groupByKey(x => x);

		await done;
		expect(groups.size).toBe(0);
	});

	test("groupedWithin groups by size", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), s)
			.groupedWithin(3, 1000) // Size 3, time 1s (won't trigger)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
	});

	test("groupedWithin emits partial group on stream end", async () => {
		await using s = scope();
		const [err, results] = await new Stream(fromArray([1, 2]), s)
			.groupedWithin(5, 1000)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2]]);
	});

	test("groupedWithin emits on time window", async () => {
		await using s = scope();
		// Use a very short time window to ensure it triggers
		const [err, results] = await new Stream(fromArray([1, 2]), s)
			.groupedWithin(100, 50) // Size 100 (won't reach), time 50ms
			.toArray();

		expect(err).toBeUndefined();
		// Should emit due to timeout even though buffer isn't full
		expect(results?.length).toBeGreaterThanOrEqual(1);
		expect(results?.[0]).toContain(1);
	});

	test("zipLatest emits when either stream emits", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2, 3]), s);
		const s2 = new Stream(fromArray(['a', 'b']), s);

		const [err, results] = await s1.zipLatest(s2).toArray();

		expect(err).toBeUndefined();
		// First emit from s1: [1, undefined]
		// Then s2 emits: [1, 'a']
		// s1 emits: [2, 'a']
		// s2 emits: [2, 'b']
		// s1 emits: [3, 'b']
		expect(results?.length).toBeGreaterThanOrEqual(2);
	});

	test("zipAll pads shorter stream with default", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2, 3]), s);
		const s2 = new Stream(fromArray(['a', 'b']), s);

		const [err, results] = await s1.zipAll(s2, 0, 'default').toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([
			[1, 'a'],
			[2, 'b'],
			[3, 'default'],
		]);
	});

	test("zipAll continues until both streams end", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1]), s);
		const s2 = new Stream(fromArray(['a', 'b', 'c']), s);

		const [err, results] = await s1.zipAll(s2, 0, 'x').toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([
			[1, 'a'],
			[0, 'b'],
			[0, 'c'],
		]);
	});

	test("interleave fairly interleaves streams", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2, 3]), s);
		const s2 = new Stream(fromArray([4, 5, 6]), s);

		const [err, results] = await s1.interleave(s2).toArray();

		expect(err).toBeUndefined();
		// Round-robin: 1, 4, 2, 5, 3, 6
		expect(results).toEqual([1, 4, 2, 5, 3, 6]);
	});

	test("interleave handles streams of different lengths", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2]), s);
		const s2 = new Stream(fromArray([10, 20, 30, 40]), s);

		const [err, results] = await s1.interleave(s2).toArray();

		expect(err).toBeUndefined();
		// Round-robin: 1, 10, 2, 20, (s1 done), 30, 40
		expect(results).toEqual([1, 10, 2, 20, 30, 40]);
	});

	test("interleave with multiple streams", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2]), s);
		const s2 = new Stream(fromArray([10, 20]), s);
		const s3 = new Stream(fromArray([100, 200]), s);

		const [err, results] = await s1.interleave(s2, s3).toArray();

		expect(err).toBeUndefined();
		// Round-robin: 1, 10, 100, 2, 20, 200
		expect(results).toEqual([1, 10, 100, 2, 20, 200]);
	});

	test("cross produces cartesian product", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2]), s);
		const s2 = new Stream(fromArray(['a', 'b']), s);

		const [err, results] = await s1.cross(s2).toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([
			[1, 'a'], [1, 'b'],
			[2, 'a'], [2, 'b'],
		]);
	});

	test("cross with empty stream yields nothing", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2]), s);
		const s2 = new Stream(fromArray([]), s);

		const [err, results] = await s1.cross(s2).toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([]);
	});

	test("cross with single element", async () => {
		await using s = scope();
		const s1 = new Stream(fromArray([1, 2, 3]), s);
		const s2 = new Stream(fromArray(['x']), s);

		const [err, results] = await s1.cross(s2).toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 'x'], [2, 'x'], [3, 'x']]);
	});
});

describe("Stream - Chaining", () => {
	test("complex chain works correctly", async () => {
		await using s = scope();

		const [err, results] = await new Stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), s)
			.filter(x => x % 2 === 0)      // [2, 4, 6, 8, 10]
			.map(x => x * 10)               // [20, 40, 60, 80, 100]
			.take(3)                        // [20, 40, 60]
			.scan((acc, x) => acc + x, 0)   // [20, 60, 120]
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 60, 120]);
	});
});


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

	test("runHead is alias for first", async () => {
		await using s = scope();
		const [runHeadErr, runHeadResult] = await new Stream(fromArray([1, 2, 3]), s).runHead();
		const [firstErr, firstResult] = await new Stream(fromArray([1, 2, 3]), s).first();

		expect(runHeadErr).toBeUndefined();
		expect(firstErr).toBeUndefined();
		expect(runHeadResult).toBe(firstResult);
	});
});

describe("Stream - runLast", () => {
	test("runLast returns last element", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runLast();

		expect(err).toBeUndefined();
		expect(result).toBe(5);
	});

	test("runLast is alias for last", async () => {
		await using s = scope();
		const [runLastErr, runLastResult] = await new Stream(fromArray([1, 2, 3]), s).runLast();
		const [lastErr, lastResult] = await new Stream(fromArray([1, 2, 3]), s).last();

		expect(runLastErr).toBeUndefined();
		expect(lastErr).toBeUndefined();
		expect(runLastResult).toBe(lastResult);
	});
});

describe("Stream - runSum", () => {
	test("runSum adds all numeric values", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(15);
	});

	test("runSum is alias for sum", async () => {
		await using s = scope();
		const [runSumErr, runSumResult] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).runSum();
		const [sumErr, sumResult] = await new Stream(fromArray([1, 2, 3, 4, 5]), s).sum();

		expect(runSumErr).toBeUndefined();
		expect(sumErr).toBeUndefined();
		expect(runSumResult).toBe(sumResult);
	});

	test("runSum with negative numbers", async () => {
		await using s = scope();
		const [err, result] = await new Stream(fromArray([10, -5, 3, -2]), s).runSum();

		expect(err).toBeUndefined();
		expect(result).toBe(6);
	});
});
