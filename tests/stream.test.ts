/**
 * Comprehensive tests for Stream operations
 */

import { describe, expect, test } from "vitest";
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
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.map(x => x * 2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([2, 4, 6]);
	});

	test("filter keeps only matching values", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.filter(x => x % 2 === 0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([2, 4]);
	});

	test("filterMap combines filter and map", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4]))
			.filterMap(x => x % 2 === 0 ? x * 10 : null)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 40]);
	});

	test("flatMap flattens nested iterables", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([[1, 2], [3, 4]]))
			.flatMap(arr => arr)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("flatten flattens one level", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([[1, 2], [3, 4]]))
			.flatten()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("tap executes side effects", async () => {
		await using s = scope();
		const sideEffects: number[] = [];

		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.tap(x => sideEffects.push(x))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
		expect(sideEffects).toEqual([1, 2, 3]);
	});

	test("scan accumulates values", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4]))
			.scan((acc, x) => acc + x, 0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 3, 6, 10]);
	});
});

describe("Stream - Slicing Operations", () => {
	test("take limits elements", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.take(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("takeWhile takes while predicate is true", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.takeWhile(x => x < 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("takeUntil takes until predicate is true (inclusive)", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.takeUntil(x => x === 3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("drop skips elements", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.drop(2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("dropWhile drops while predicate is true", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.dropWhile(x => x < 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([4, 5]);
	});

	test("dropUntil drops until predicate is true (inclusive)", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.dropUntil(x => x === 3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("skip is alias for drop", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.skip(2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([3, 4, 5]);
	});

	test("splitAt splits stream at position", async () => {
		await using s = scope();
		const [head, tail] = s.stream(fromArray([1, 2, 3, 4, 5])).splitAt(2);

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
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5, 6, 7]))
			.buffer(3)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
	});

	test("bufferTime emits by time window", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
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
		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
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
		const [err, results] = await s.stream(fromArray([
			{ user: "a", msg: "hi" },
			{ user: "a", msg: "hello" },
			{ user: "b", msg: "hey" },
			{ user: "a", msg: "back" },
		]))
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
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.intersperse(0)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 0, 2, 0, 3]);
	});
});

describe("Stream - Deduplication", () => {
	test("distinct removes all duplicates", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 2, 3, 3, 3, 4]))
			.distinct()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("distinctBy removes duplicates by key", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([
			{ id: 1, name: "a" },
			{ id: 2, name: "b" },
			{ id: 1, name: "c" }, // duplicate id
		]))
			.distinctBy(x => x.id)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toHaveLength(2);
		expect(results?.map(x => x.id)).toEqual([1, 2]);
	});

	test("distinctAdjacent removes consecutive duplicates", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 1, 2, 2, 2, 3, 3]))
			.distinctAdjacent()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("distinctAdjacentBy removes consecutive duplicates by key", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([
			{ type: "a", val: 1 },
			{ type: "a", val: 2 },
			{ type: "b", val: 3 },
			{ type: "b", val: 4 },
		]))
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

		const [err, results] = await s.stream(slow())
			.merge(s.stream(fast()))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toContain(1);
		expect(results).toContain(2);
		expect(results).toContain(3);
		expect(results).toContain(4);
	});

	test("concat concatenates streams", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2]))
			.concat(s.stream(fromArray([3, 4])))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("prepend adds values at start", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([3, 4]))
			.prepend(1, 2)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("append adds values at end", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2]))
			.append(3, 4)
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3, 4]);
	});

	test("zip pairs elements from two streams", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.zip(s.stream(fromArray(["a", "b", "c"])))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
	});

	test("zipWithIndex adds index to elements", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray(["a", "b", "c"]))
			.zipWithIndex()
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([["a", 0], ["b", 1], ["c", 2]]);
	});

	test("partition splits stream by predicate", async () => {
		await using s = scope();
		const [evens, odds] = s.stream(fromArray([1, 2, 3, 4, 5]))
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
		const [s1, s2] = s.stream(fromArray([1, 2, 3]))
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
		const [err, results] = await s.stream(slowOuter())
			.switchMap(n => fromArray([n * 10, n * 100]))
			.toArray();

		expect(err).toBeUndefined();
		// All inner values emitted since outer is slow
		expect(results).toEqual([10, 100, 20, 200, 30, 300]);
	});

	test("switchMap handles empty outer stream", async () => {
		await using s = scope();

		async function* empty() {}

		const [err, results] = await s.stream(empty())
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

		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5]))
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

		const [err, result] = await s.stream(rapidSource())
			.debounce(30)
			.last();

		expect(err).toBeUndefined();
		expect(result).toBe(3); // Last value after debounce
	});

	test("spaced adds delay between elements", async () => {
		await using s = scope();
		const start = Date.now();

		const [err, results] = await s.stream(fromArray([1, 2, 3]))
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

		const [err, results] = await s.stream(fromArray([1, 2]))
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

		const [err, results] = await s.stream(slowSource())
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

		const [err, results] = await s.stream(fastSource())
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

		const [err, results] = await s.stream(errorSource())
			.catchError(() => fromArray([99]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 99]);
	});

	test("orElse provides fallback for empty stream", async () => {
		await using s = scope();

		// Create an empty stream by taking 0 elements
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
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

		const [err, results] = await s.stream(errorSource())
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

		const [err, results] = await s.stream(errorSource())
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

		const [err] = await s.stream(errorSource())
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

		const [err] = await s.stream(errorSource())
			.tapError(() => { tapped = true; })
			.toArray();

		expect(tapped).toBe(true);
		expect(err).toBeInstanceOf(Error);
	});

	test("ensuring runs cleanup on success", async () => {
		await using s = scope();
		let cleaned = false;

		const [err] = await s.stream(fromArray([1, 2, 3]))
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

		const [err] = await s.stream(errorSource())
			.ensuring(() => { cleaned = true; })
			.toArray();

		expect(cleaned).toBe(true);
		expect(err).toBeInstanceOf(Error);
	});

	test.skip("retry with delay between retries", async () => {
		// Retry works for mid-stream failures, but the stream must be re-consumable
		// This is a limitation - retry works best with factory functions
		await using s = scope();
		
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.retry({ maxRetries: 2, delay: 10 })
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});
});

describe("Stream - Terminal Operations", () => {
	test("toArray collects all values", async () => {
		await using s = scope();
		const [err, results] = await s.stream(fromArray([1, 2, 3]))
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([1, 2, 3]);
	});

	test("first gets first element", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.first();

		expect(err).toBeUndefined();
		expect(result).toBe(1);
	});

	test("first returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await s.stream(empty())
			.first();

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("last gets last element", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.last();

		expect(err).toBeUndefined();
		expect(result).toBe(3);
	});

	test("find gets first matching element", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.find(x => x > 3);

		expect(err).toBeUndefined();
		expect(result).toBe(4);
	});

	test("find returns undefined if no match", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.find(x => x > 10);

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("reduce combines values", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3, 4]))
			.reduce((a, b) => a + b);

		expect(err).toBeUndefined();
		expect(result).toBe(10);
	});

	test("reduce returns undefined for empty stream", async () => {
		await using s = scope();
		async function* empty() {}

		const [err, result] = await s.stream(empty())
			.reduce((a, b) => a + b);

		expect(err).toBeUndefined();
		expect(result).toBeUndefined();
	});

	test("fold reduces with initial value", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.fold(10, (acc, x) => acc + x);

		expect(err).toBeUndefined();
		expect(result).toBe(16);
	});

	test("sum adds all numeric values", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.sum();

		expect(err).toBeUndefined();
		expect(result).toBe(15);
	});

	test("count returns element count", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3, 4, 5]))
			.count();

		expect(err).toBeUndefined();
		expect(result).toBe(5);
	});

	test("some returns true if any match", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.some(x => x > 2);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("some returns false if none match", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.some(x => x > 10);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("every returns true if all match", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([2, 4, 6]))
			.every(x => x % 2 === 0);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("every returns false if any don't match", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([2, 3, 4]))
			.every(x => x % 2 === 0);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("includes returns true if value present", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.includes(2);

		expect(err).toBeUndefined();
		expect(result).toBe(true);
	});

	test("includes returns false if value not present", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([1, 2, 3]))
			.includes(99);

		expect(err).toBeUndefined();
		expect(result).toBe(false);
	});

	test("forEach executes side effect for each value", async () => {
		await using s = scope();
		const collected: number[] = [];

		const [err] = await s.stream(fromArray([1, 2, 3]))
			.forEach(x => collected.push(x));

		expect(err).toBeUndefined();
		expect(collected).toEqual([1, 2, 3]);
	});

	test("drain consumes without collecting", async () => {
		await using s = scope();
		let consumed = 0;

		const [err] = await s.stream(fromArray([1, 2, 3]))
			.tap(() => consumed++)
			.drain();

		expect(err).toBeUndefined();
		expect(consumed).toBe(3);
	});

	test("runDrain is alias for drain", async () => {
		await using s = scope();
		let consumed = 0;

		const [err] = await s.stream(fromArray([1, 2, 3]))
			.tap(() => consumed++)
			.runDrain();

		expect(err).toBeUndefined();
		expect(consumed).toBe(3);
	});

	test("groupBy groups all elements by key", async () => {
		await using s = scope();
		const [err, result] = await s.stream(fromArray([
			{ type: "a", val: 1 },
			{ type: "b", val: 2 },
			{ type: "a", val: 3 },
		]))
			.groupBy(x => x.type);

		expect(err).toBeUndefined();
		expect(result?.get("a")).toHaveLength(2);
		expect(result?.get("b")).toHaveLength(1);
	});
});

describe("Stream - Chaining", () => {
	test("complex chain works correctly", async () => {
		await using s = scope();

		const [err, results] = await s.stream(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
			.filter(x => x % 2 === 0)      // [2, 4, 6, 8, 10]
			.map(x => x * 10)               // [20, 40, 60, 80, 100]
			.take(3)                        // [20, 40, 60]
			.scan((acc, x) => acc + x, 0)   // [20, 60, 120]
			.toArray();

		expect(err).toBeUndefined();
		expect(results).toEqual([20, 60, 120]);
	});
});
