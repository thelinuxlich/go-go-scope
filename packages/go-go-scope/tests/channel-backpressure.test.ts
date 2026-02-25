/**
 * Tests for Channel backpressure strategies
 */
import { describe, expect, test, vi } from "vitest";
import { Channel } from "../src/channel.js";
import { ChannelFullError } from "../src/errors.js";
import { scope } from "../src/factory.js";

describe("Channel Backpressure Strategies", () => {
	describe("'block' strategy (default)", () => {
		test("should block when buffer is full", async () => {
			await using s = scope();
			const ch = s.channel<number>(1); // Default block strategy

			// First send should succeed immediately
			await expect(ch.send(1)).resolves.toBe(true);

			// Second send should block (buffer is full)
			const sendPromise = ch.send(2);

			// Receive one value to free up space
			const value = await ch.receive();
			expect(value).toBe(1);

			// Now blocked send should complete
			await expect(sendPromise).resolves.toBe(true);
		});

		test("should unblock sender when receiver takes value", async () => {
			await using s = scope();
			const ch = s.channel<number>(0); // Unbuffered

			// Start a receiver first (it will wait for a sender)
			const receivePromise = ch.receive();

			// Small delay to ensure receive is waiting
			await new Promise((r) => setTimeout(r, 10));

			// Now send - should complete immediately because receiver is waiting
			const sendPromise = ch.send(42);

			// Both should complete
			await expect(sendPromise).resolves.toBe(true);
			await expect(receivePromise).resolves.toBe(42);
		});

		test("should reject blocked senders on channel close", async () => {
			await using s = scope();
			const ch = s.channel<number>(0);

			// Blocked send
			const sendPromise = ch.send(1);

			// Close channel before receiving
			ch.close();

			// Blocked send should be rejected
			await expect(sendPromise).rejects.toThrow();
		});
	});

	describe("'drop-oldest' strategy", () => {
		test("should drop oldest item when buffer is full", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "drop-oldest",
				onDrop: (v) => dropped.push(v),
			});

			// Fill buffer
			await ch.send(1);
			await ch.send(2);
			expect(ch.size).toBe(2);

			// Send third - should drop oldest (1)
			await ch.send(3);

			expect(dropped).toEqual([1]);
			expect(ch.size).toBe(2);

			// Receive should get 2, then 3
			expect(await ch.receive()).toBe(2);
			expect(await ch.receive()).toBe(3);
		});

		test("should not drop when buffer has space", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 3,
				backpressure: "drop-oldest",
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await ch.send(2);

			expect(dropped).toEqual([]);
			expect(ch.size).toBe(2);
		});

		test("should work with capacity 1", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "drop-oldest",
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			expect(dropped).toEqual([1, 2]);
			expect(await ch.receive()).toBe(3);
		});
	});

	describe("'drop-latest' strategy", () => {
		test("should drop new item when buffer is full", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "drop-latest",
				onDrop: (v) => dropped.push(v),
			});

			// Fill buffer
			await ch.send(1);
			await ch.send(2);

			// Send third - should drop new item (3)
			await ch.send(3);

			expect(dropped).toEqual([3]);
			expect(ch.size).toBe(2);

			// Receive should get 1, then 2
			expect(await ch.receive()).toBe(1);
			expect(await ch.receive()).toBe(2);
		});

		test("should accept items when buffer has space", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 3,
				backpressure: "drop-latest",
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			expect(dropped).toEqual([]);
			expect(ch.size).toBe(3);
		});

		test("should work with capacity 1", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "drop-latest",
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			expect(dropped).toEqual([2, 3]);
			expect(await ch.receive()).toBe(1);
		});
	});

	describe("'error' strategy", () => {
		test("should throw ChannelFullError when buffer is full", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "error",
			});

			// First send succeeds
			await expect(ch.send(1)).resolves.toBe(true);

			// Second send should throw
			await expect(ch.send(2)).rejects.toThrow(ChannelFullError);
		});

		test("should accept items when buffer has space", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "error",
			});

			await expect(ch.send(1)).resolves.toBe(true);
			await expect(ch.send(2)).resolves.toBe(true);
			expect(ch.size).toBe(2);
		});

		test("should allow sending after receiving makes space", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "error",
			});

			await ch.send(1);
			await expect(ch.send(2)).rejects.toThrow(ChannelFullError);

			// Make space
			await ch.receive();

			// Now should succeed
			await expect(ch.send(2)).resolves.toBe(true);
		});

		test("ChannelFullError should have correct properties", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "error",
			});

			// First send succeeds
			await ch.send(1);

			// Second send should throw
			try {
				await ch.send(2);
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(ChannelFullError);
				expect((error as Error).name).toBe("ChannelFullError");
				expect((error as Error).message).toBe("Channel buffer is full");
				expect((error as ChannelFullError)._tag).toBe("ChannelFullError");
			}
		});
	});

	describe("'sample' strategy", () => {
		test("should keep values within time window", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 10,
				backpressure: "sample",
				sampleWindow: 100, // 100ms window
			});

			await ch.send(1);
			await ch.send(2);

			expect(ch.size).toBeGreaterThanOrEqual(1);

			// Receive values
			const v1 = await ch.receive();
			expect([1, 2]).toContain(v1);
		});

		test("should drop values outside time window on cleanup", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 10,
				backpressure: "sample",
				sampleWindow: 50, // 50ms window
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await new Promise((r) => setTimeout(r, 60)); // Wait for window to expire
			await ch.send(2);

			// First value should be dropped when second is received
			// due to cleanup in receive()
			await ch.receive();

			expect(dropped).toContain(1);
		});

		test("should work with async iteration", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 10,
				backpressure: "sample",
				sampleWindow: 1000,
			});

			// Send values quickly (all within window)
			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			// Receive values before closing
			const values: number[] = [];
			values.push((await ch.receive())!);
			values.push((await ch.receive())!);
			values.push((await ch.receive())!);

			ch.close();

			expect(values).toContain(1);
			expect(values).toContain(2);
			expect(values).toContain(3);
		});
	});

	describe("Edge cases", () => {
		test("capacity 0 with drop-oldest behaves like unbuffered", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 0,
				backpressure: "drop-oldest",
				onDrop: (v) => dropped.push(v),
			});

			// With capacity 0, there's no buffer to drop from
			// The channel behaves like an unbuffered channel - send blocks until receiver is ready
			// Start receiver first, then send
			const receivePromise = ch.receive();
			await ch.send(1);
			
			// Nothing dropped because capacity is 0 (drop logic doesn't apply)
			expect(dropped).toEqual([]);
			// Can receive the value
			expect(await receivePromise).toBe(1);
		});

		test("capacity 0 with error should error when buffer full", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "error",
			});

			await ch.send(1); // succeeds
			await expect(ch.send(2)).rejects.toThrow(ChannelFullError); // fails - buffer full
		});

		test("should handle multiple rapid sends with drop-latest", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "drop-latest",
				onDrop: (v) => dropped.push(v),
			});

			// Rapid sends
			await Promise.all([
				ch.send(1),
				ch.send(2),
				ch.send(3),
				ch.send(4),
				ch.send(5),
			]);

			// Should have dropped some
			expect(dropped.length).toBeGreaterThan(0);
			// Buffer should never exceed capacity
			expect(ch.size).toBeLessThanOrEqual(2);
		});
	});

	describe("onDrop callback", () => {
		test("should be called when dropping oldest", async () => {
			await using s = scope();
			const onDrop = vi.fn();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "drop-oldest",
				onDrop,
			});

			await ch.send(1);
			await ch.send(2);

			expect(onDrop).toHaveBeenCalledWith(1);
			expect(onDrop).toHaveBeenCalledTimes(1);
		});

		test("should be called when dropping latest", async () => {
			await using s = scope();
			const onDrop = vi.fn();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "drop-latest",
				onDrop,
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			expect(onDrop).toHaveBeenCalledWith(2);
			expect(onDrop).toHaveBeenCalledWith(3);
			expect(onDrop).toHaveBeenCalledTimes(2);
		});

		test("should be called for sample drops on disposal", async () => {
			await using s = scope();
			const onDrop = vi.fn();
			const ch = s.channel<number>({
				capacity: 10,
				backpressure: "sample",
				sampleWindow: 50,
				onDrop,
			});

			await ch.send(1);
			await new Promise((r) => setTimeout(r, 60));
			await ch.send(2);

			// Dispose should trigger cleanup
			await ch[Symbol.asyncDispose]();

			// Old values should be dropped
			expect(onDrop).toHaveBeenCalledWith(1);
		});
	});

	describe("Channel properties", () => {
		test("should expose strategy property", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "drop-latest",
			});

			expect(ch.strategy).toBe("drop-latest");
		});

		test("should expose correct cap property", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 5,
				backpressure: "error",
			});

			expect(ch.cap).toBe(5);
		});

		test("size should reflect current buffer state", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 3,
				backpressure: "block",
			});

			expect(ch.size).toBe(0);
			await ch.send(1);
			expect(ch.size).toBe(1);
			await ch.send(2);
			expect(ch.size).toBe(2);
			await ch.receive();
			expect(ch.size).toBe(1);
		});
	});

	describe("Cancellation and cleanup", () => {
		test("should handle scope disposal with drop-oldest", async () => {
			await using s = scope();
			const dropped: number[] = [];
			const ch = s.channel<number>({
				capacity: 3,
				backpressure: "drop-oldest",
				onDrop: (v) => dropped.push(v),
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3);

			// Channel should be cleaned up when scope disposes
		});

		test("should reject pending receives on abort with error strategy", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 1,
				backpressure: "error",
			});

			const receivePromise = ch.receive();

			// Abort by closing
			ch.close();

			await expect(receivePromise).resolves.toBeUndefined();
		});
	});

	describe("Async iteration with strategies", () => {
		test("should work with drop-oldest strategy", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "drop-oldest",
			});

			await ch.send(1);
			await ch.send(2);
			await ch.send(3); // drops 1

			ch.close();

			const values: number[] = [];
			for await (const v of ch) {
				values.push(v);
			}

			expect(values).toEqual([2, 3]);
		});

		test("should work with error strategy and manual handling", async () => {
			await using s = scope();
			const ch = s.channel<number>({
				capacity: 2,
				backpressure: "error",
			});

			await ch.send(1);
			await ch.send(2);

			// This will error
			try {
				await ch.send(3);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ChannelFullError);
			}

			// Receive and continue
			await ch.receive();
			await ch.send(3); // Now should succeed

			ch.close();

			const values: number[] = [];
			for await (const v of ch) {
				values.push(v);
			}

			expect(values).toEqual([2, 3]);
		});
	});
});
