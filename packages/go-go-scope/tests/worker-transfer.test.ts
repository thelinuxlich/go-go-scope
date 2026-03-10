/**
 * Tests for zero-copy transfer with worker tasks
 */
import { describe, test, expect } from "vitest";
import { scope } from "../src/index.js";

describe("worker zero-copy transfer", () => {
	test("should transfer ArrayBuffer to worker without copying", async () => {
		await using s = scope();

		// Create a buffer with some data
		const buffer = new ArrayBuffer(1024);
		const view = new Uint8Array(buffer);
		for (let i = 0; i < view.length; i++) {
			view[i] = i % 256;
		}

		// Calculate expected sum
		const expectedSum = view.reduce((a, b) => a + b, 0);

		// Execute in worker - ArrayBuffer automatically transferred
		const [err, result] = await s.task(
			({ data }) => {
				// data.buffer is the transferred ArrayBuffer (zero-copy)
				const transferredView = new Uint8Array(data.buffer);
				return transferredView.reduce((a, b) => a + b, 0);
			},
			{
				worker: true,
				data: { buffer }, // ArrayBuffers in data are auto-transferred
			},
		);

		expect(err).toBeUndefined();
		expect(result).toBe(expectedSum);

		// Buffer should be detached (transferred) in main thread
		expect(buffer.byteLength).toBe(0);
	});

	test("should transfer multiple ArrayBuffers from data object", async () => {
		await using s = scope();

		const buffer1 = new ArrayBuffer(256);
		const buffer2 = new ArrayBuffer(512);
		const view1 = new Uint8Array(buffer1);
		const view2 = new Uint8Array(buffer2);

		view1.fill(1);
		view2.fill(2);

		const [err, result] = await s.task(
			({ data }) => {
				const v1 = new Uint8Array(data.buf1);
				const v2 = new Uint8Array(data.buf2);
				return v1.reduce((a, b) => a + b, 0) + v2.reduce((a, b) => a + b, 0);
			},
			{
				worker: true,
				data: { buf1: buffer1, buf2: buffer2 },
			},
		);

		expect(err).toBeUndefined();
		expect(result).toBe(256 * 1 + 512 * 2); // 256 + 1024 = 1280

		// Both buffers should be detached
		expect(buffer1.byteLength).toBe(0);
		expect(buffer2.byteLength).toBe(0);
	});

	test("should work without data (normal mode)", async () => {
		await using s = scope();

		const [err, result] = await s.task(
			() => {
				// Simple computation without data transfer
				let sum = 0;
				for (let i = 1; i <= 100; i++) {
					sum += i;
				}
				return sum;
			},
			{ worker: true },
		);

		expect(err).toBeUndefined();
		expect(result).toBe(5050); // Sum of 1 to 100
	});

	test("should transfer ArrayBuffers nested in data", async () => {
		await using s = scope();

		const buffer = new ArrayBuffer(1024);
		const view = new Uint8Array(buffer);
		view.fill(42);

		const [err, result] = await s.task(
			({ data }) => {
				// Access nested buffer
				const v = new Uint8Array(data.nested.buffer);
				return v[0];
			},
			{
				worker: true,
				data: { nested: { buffer } },
			},
		);

		expect(err).toBeUndefined();
		expect(result).toBe(42);
		expect(buffer.byteLength).toBe(0);
	});

	test("should transfer ArrayBuffers in arrays", async () => {
		await using s = scope();

		const buffers = [
			new ArrayBuffer(100),
			new ArrayBuffer(200),
			new ArrayBuffer(300),
		];
		for (const buf of buffers) {
			new Uint8Array(buf).fill(5);
		}

		const [err, result] = await s.task(
			({ data }) => {
				return data.buffers.reduce((sum: number, buf: ArrayBuffer) => {
					return sum + new Uint8Array(buf).reduce((a, b) => a + b, 0);
				}, 0);
			},
			{
				worker: true,
				data: { buffers },
			},
		);

		expect(err).toBeUndefined();
		expect(result).toBe(5 * (100 + 200 + 300)); // 5 * 600 = 3000

		// All buffers should be detached
		for (const buf of buffers) {
			expect(buf.byteLength).toBe(0);
		}
	});

	test("should handle large buffers efficiently", async () => {
		await using s = scope();

		// 10MB buffer
		const buffer = new ArrayBuffer(10 * 1024 * 1024);
		const view = new Uint8Array(buffer);
		view[0] = 42;
		view[view.length - 1] = 24;

		const [err, result] = await s.task(
			({ data }) => {
				const v = new Uint8Array(data.buffer);
				return { first: v[0], last: v[v.length - 1], length: v.length };
			},
			{
				worker: true,
				data: { buffer },
			},
		);

		expect(err).toBeUndefined();
		expect(result).toEqual({
			first: 42,
			last: 24,
			length: 10 * 1024 * 1024,
		});
	}, 30000);

	test("should handle Float64Array buffer", async () => {
		await using s = scope();

		const buffer = new ArrayBuffer(1024);
		const view = new Float64Array(buffer);
		for (let i = 0; i < view.length; i++) {
			view[i] = i * 1.5;
		}

		const [err, result] = await s.task(
			({ data }) => {
				const v = new Float64Array(data.buffer);
				// Calculate average
				const sum = v.reduce((a, b) => a + b, 0);
				return sum / v.length;
			},
			{
				worker: true,
				data: { buffer },
			},
		);

		expect(err).toBeUndefined();
		expect(typeof result).toBe("number");
		expect(result).toBeGreaterThan(0);
	});
});
