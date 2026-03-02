/**
 * Tests for Web Streams API integration
 */
import { describe, expect, test } from "vitest";
import { scope } from "go-go-scope";
import {
	channelToReadableStream,
	channelToWritableStream,
	readableStreamToChannel,
	writableStreamToChannel,
	createTransformStream,
	streamToReadableStream,
	readableStreamToStream,
	createDuplexStream,
	teeStream,
	streamToArray,
	streamFirst,
	mapStream,
	filterStream,
	bufferStream,
	takeStream,
	skipStream,
	isReadableStream,
	isWritableStream,
	isTransformStream,
	pipeStreams,
} from "./index.js";

describe("channelToReadableStream", () => {
	test("should create readable stream from channel", async () => {
		await using s = scope();
		const ch = s.channel<string>();

		const stream = channelToReadableStream(ch);

		expect(stream).toBeInstanceOf(ReadableStream);
	});

	test("should handle abort signal", async () => {
		await using s = scope();
		const ch = s.channel<string>();
		const controller = new AbortController();

		const stream = channelToReadableStream(ch, { signal: controller.signal });

		controller.abort(new Error("Aborted"));

		const reader = stream.getReader();
		await expect(reader.read()).rejects.toThrow("Aborted");
	});
});

describe("readableStreamToChannel", () => {
	test("should convert readable stream to channel", async () => {
		await using s = scope();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.close();
			},
		});

		const ch = readableStreamToChannel(s, stream);

		const result1 = await ch.receive();
		const result2 = await ch.receive();

		expect(result1).toBe(1);
		expect(result2).toBe(2);
	});
});

describe("channelToWritableStream", () => {
	test("should convert channel to writable stream", async () => {
		await using s = scope();
		const ch = s.channel<string>();
		const received: string[] = [];

		// Start receiving from channel
		(async () => {
			for await (const value of ch) {
				if (value === undefined) break;
				received.push(value);
			}
		})();

		const stream = channelToWritableStream(ch);
		const writer = stream.getWriter();

		await writer.write("hello");
		await writer.write("world");
		await writer.close();

		// Wait a bit for processing
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(received).toEqual(["hello", "world"]);
	});
});

describe("writableStreamToChannel", () => {
	test("should create channel from writable stream", async () => {
		await using s = scope();
		const writable = new WritableStream();

		const ch = writableStreamToChannel(s, writable);

		// Verify channel was created
		expect(ch).toBeDefined();
		expect(ch.send).toBeDefined();
		expect(ch.receive).toBeDefined();
	});
});

describe("createTransformStream", () => {
	test("should transform stream data", async () => {
		const transform = createTransformStream<string, number>({
			transform: (chunk) => chunk.length,
		});

		const input = new ReadableStream({
			start(controller) {
				controller.enqueue("hello");
				controller.enqueue("world");
				controller.close();
			},
		});

		const output = input.pipeThrough(transform);
		const result = await streamToArray(output);

		expect(result).toEqual([5, 5]);
	});

	test("should call flush function", async () => {
		let flushed = false;
		const transform = createTransformStream<number, number>({
			transform: (chunk) => chunk,
			flush: () => {
				flushed = true;
			},
		});

		const input = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.close();
			},
		});

		await input.pipeThrough(transform).pipeTo(new WritableStream());

		expect(flushed).toBe(true);
	});
});

describe("streamToReadableStream", () => {
	test("should convert async iterable to readable stream", async () => {
		async function* generate() {
			yield 1;
			yield 2;
			yield 3;
		}

		const stream = streamToReadableStream(generate());
		const result = await streamToArray(stream);

		expect(result).toEqual([1, 2, 3]);
	});
});

describe("readableStreamToStream", () => {
	test("should convert readable stream to async iterable", async () => {
		const readable = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.close();
			},
		});

		const iterable = readableStreamToStream(readable);
		const result: number[] = [];

		for await (const value of iterable) {
			result.push(value);
		}

		expect(result).toEqual([1, 2]);
	});

	test("should support async disposal", async () => {
		const readable = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.close();
			},
		});

		await using iterable = readableStreamToStream(readable);
		const result = await iterable[Symbol.asyncIterator]().next();
		expect(result.value).toBe(1);
	});
});

describe("createDuplexStream", () => {
	test("should create duplex stream with readable and writable ends", async () => {
		await using s = scope();
		const { readable, writable } = createDuplexStream<string, string>(s);

		// Note: This test verifies the duplex stream structure
		// Full duplex functionality would require a transform in between
		expect(readable).toBeInstanceOf(ReadableStream);
		expect(writable).toBeInstanceOf(WritableStream);
	});
});

describe("teeStream", () => {
	test("should tee stream into two channels", async () => {
		await using s = scope();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue("data");
				controller.close();
			},
		});

		const [ch1, ch2] = teeStream(s, stream, { capacity: 1 });

		// Verify both channels were created
		expect(ch1).toBeDefined();
		expect(ch2).toBeDefined();
		expect(ch1.receive).toBeDefined();
		expect(ch2.receive).toBeDefined();
	});
});

describe("streamToArray", () => {
	test("should collect stream into array", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.close();
			},
		});

		const result = await streamToArray(stream);
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("streamFirst", () => {
	test("should read first value from stream", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue("first");
				controller.enqueue("second");
				controller.close();
			},
		});

		const result = await streamFirst(stream);
		expect(result).toBe("first");
	});

	test("should return undefined for empty stream", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.close();
			},
		});

		const result = await streamFirst(stream);
		expect(result).toBeUndefined();
	});
});

describe("mapStream", () => {
	test("should map stream values", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.close();
			},
		});

		const mapped = stream.pipeThrough(mapStream((x) => x * 2));
		const result = await streamToArray(mapped);

		expect(result).toEqual([2, 4]);
	});
});

describe("filterStream", () => {
	test("should filter stream values", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.close();
			},
		});

		const filtered = stream.pipeThrough(filterStream((x) => x > 1));
		const result = await streamToArray(filtered);

		expect(result).toEqual([2, 3]);
	});
});

describe("bufferStream", () => {
	test("should buffer stream values into arrays", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.enqueue(4);
				controller.close();
			},
		});

		const buffered = stream.pipeThrough(bufferStream(2));
		const result = await streamToArray(buffered);

		expect(result).toEqual([[1, 2], [3, 4]]);
	});
});

describe("takeStream", () => {
	test("should take only first n values", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.enqueue(4);
				controller.close();
			},
		});

		const taken = stream.pipeThrough(takeStream(2));
		const result = await streamToArray(taken);

		expect(result).toEqual([1, 2]);
	});
});

describe("skipStream", () => {
	test("should skip first n values", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.enqueue(4);
				controller.close();
			},
		});

		const skipped = stream.pipeThrough(skipStream(2));
		const result = await streamToArray(skipped);

		expect(result).toEqual([3, 4]);
	});
});

describe("type guards", () => {
	test("isReadableStream should identify ReadableStream", () => {
		const stream = new ReadableStream();
		expect(isReadableStream(stream)).toBe(true);
		expect(isReadableStream({})).toBe(false);
		expect(isReadableStream(null)).toBe(false);
	});

	test("isWritableStream should identify WritableStream", () => {
		const stream = new WritableStream();
		expect(isWritableStream(stream)).toBe(true);
		expect(isWritableStream({})).toBe(false);
		expect(isWritableStream(null)).toBe(false);
	});

	test("isTransformStream should identify TransformStream", () => {
		const stream = new TransformStream();
		expect(isTransformStream(stream)).toBe(true);
		expect(isTransformStream({})).toBe(false);
		expect(isTransformStream(null)).toBe(false);
	});
});

describe("pipeStreams", () => {
	test("should pipe through transforms and to writable", async () => {
		const received: number[] = [];

		const source = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.close();
			},
		});

		const transform = mapStream((x: number) => x * 2);
		const sink = new WritableStream({
			write(chunk) {
				received.push(chunk);
			},
		});

		await pipeStreams(source, transform, sink);

		expect(received).toEqual([2, 4]);
	});
});
