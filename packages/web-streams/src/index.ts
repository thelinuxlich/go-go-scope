/**
 * Web Streams API integration for go-go-scope
 *
 * Provides interop between go-go-scope primitives and Web Streams API
 * (ReadableStream, WritableStream, TransformStream)
 */

import type { Channel, Scope } from "go-go-scope";

/**
 * Options for stream conversion
 */
export interface StreamConversionOptions {
	/** Signal to abort the stream */
	signal?: AbortSignal;
	/** High water mark for backpressure */
	highWaterMark?: number;
}

/**
 * Convert a go-go-scope Channel to a ReadableStream
 *
 * @example
 * ```typescript
 * const ch = s.channel<string>()
 * const stream = channelToReadableStream(ch)
 *
 * const reader = stream.getReader()
 * const { value } = await reader.read()
 * ```
 */
export function channelToReadableStream<T>(
	channel: Channel<T>,
	options: StreamConversionOptions = {},
): ReadableStream<T> {
	const { signal } = options;

	return new ReadableStream<T>(
		{
			async pull(controller) {
				if (signal?.aborted) {
					controller.error(signal.reason);
					return;
				}

				try {
					const value = await channel.receive();

					if (value === undefined) {
						controller.close();
					} else {
						controller.enqueue(value);
					}
				} catch (error) {
					controller.error(error);
				}
			},

			cancel() {
				// Channel will be closed when scope disposes
			},
		},
		{
			highWaterMark: options.highWaterMark ?? 1,
		},
	);
}

/**
 * Convert a ReadableStream to a go-go-scope Channel
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/data')
 * const ch = readableStreamToChannel(s, response.body!)
 *
 * for await (const chunk of ch) {
 *   console.log(chunk)
 * }
 * ```
 */
export function readableStreamToChannel<T>(
	scope: Scope,
	stream: ReadableStream<T>,
	options: { capacity?: number } = {},
): Channel<T> {
	const channel = scope.channel<T>(options.capacity ?? 0);

	// Start consuming the stream
	(async () => {
		const reader = stream.getReader();

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					channel.close();
					break;
				}

				await channel.send(value);
			}
		} catch (error) {
			// Channel will be cleaned up when scope disposes
		} finally {
			reader.releaseLock();
		}
	})();

	return channel;
}

/**
 * Convert a go-go-scope Channel to a WritableStream
 *
 * @example
 * ```typescript
 * const ch = s.channel<string>()
 * const stream = channelToWritableStream(ch)
 *
 * const writer = stream.getWriter()
 * await writer.write('hello')
 * ```
 */
export function channelToWritableStream<T>(
	channel: Channel<T>,
	options: StreamConversionOptions = {},
): WritableStream<T> {
	const { signal } = options;

	return new WritableStream<T>(
		{
			async write(chunk) {
				if (signal?.aborted) {
					throw signal.reason;
				}

				const sent = await channel.send(chunk);
				if (!sent) {
					throw new Error("Channel closed");
				}
			},

			close() {
				channel.close();
			},

			abort(reason) {
				// Channel will be cleaned up when scope disposes
			},
		},
		{
			highWaterMark: options.highWaterMark ?? 1,
		},
	);
}

/**
 * Convert a WritableStream to a go-go-scope Channel
 *
 * @example
 * ```typescript
 * const ws = new WebSocketStream('wss://example.com')
 * const ch = writableStreamToChannel(s, ws.writable)
 *
 * await ch.send('hello')
 * ```
 */
export function writableStreamToChannel<T>(
	scope: Scope,
	stream: WritableStream<T>,
): Channel<T> {
	const channel = scope.channel<T>();
	const writer = stream.getWriter();

	// Start piping channel to stream
	(async () => {
		try {
			for await (const value of channel) {
				if (value === undefined) break;
				await writer.write(value);
			}
		} catch (error) {
			// Handle error
		} finally {
			await writer.close();
		}
	})();

	return channel;
}

/**
 * Create a TransformStream from a channel transformation
 *
 * @example
 * ```typescript
 * const transform = createTransformStream<string, number>({
 *   transform: (chunk) => chunk.length
 * })
 *
 * await readable
 *   .pipeThrough(transform)
 *   .pipeTo(writable)
 * ```
 */
export interface TransformConfig<I, O> {
	/** Transform function */
	transform: (chunk: I) => O | Promise<O>;
	/** Optional flush function called at the end */
	flush?: () => void | Promise<void>;
}

export function createTransformStream<I, O>(
	config: TransformConfig<I, O>,
): TransformStream<I, O> {
	return new TransformStream<I, O>({
		async transform(chunk, controller) {
			try {
				const result = await config.transform(chunk);
				controller.enqueue(result);
			} catch (error) {
				controller.error(error);
			}
		},

		async flush(controller) {
			if (config.flush) {
				try {
					await config.flush();
				} catch (error) {
					controller.error(error);
				}
			}
		},
	});
}

/**
 * Convert a go-go-scope Stream (from @go-go-scope/stream) to a ReadableStream
 *
 * @example
 * ```typescript
 * import { stream } from '@go-go-scope/stream'
 *
 * const st = s.stream(data)
 *   .map(x => x * 2)
 *   .filter(x => x > 10)
 *
 * const readable = streamToReadableStream(st)
 * ```
 */
export function streamToReadableStream<T>(
	stream: AsyncIterable<T>,
	options: StreamConversionOptions = {},
): ReadableStream<T> {
	const { signal } = options;
	const iterator = stream[Symbol.asyncIterator]();

	return new ReadableStream<T>(
		{
			async pull(controller) {
				if (signal?.aborted) {
					controller.error(signal.reason);
					return;
				}

				try {
					const result = await iterator.next();

					if (result.done) {
						controller.close();
					} else {
						controller.enqueue(result.value);
					}
				} catch (error) {
					controller.error(error);
				}
			},

			cancel() {
				iterator.return?.();
			},
		},
		{
			highWaterMark: options.highWaterMark ?? 1,
		},
	);
}

/**
 * Convert a ReadableStream to a go-go-scope Stream-compatible async iterable
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/data')
 * const stream = readableStreamToStream(response.body!)
 *
 * // Use with @go-go-scope/stream
 * const result = await stream
 *   .pipeThrough(new TransformStream(...))
 *   .pipeTo(new WritableStream(...))
 * ```
 */
export function readableStreamToStream<T>(
	stream: ReadableStream<T>,
): AsyncIterable<T> & { [Symbol.asyncDispose](): Promise<void> } {
	const reader = stream.getReader();
	let done = false;

	return {
		async *[Symbol.asyncIterator](): AsyncGenerator<T> {
			try {
				while (!done) {
					const result = await reader.read();

					if (result.done) {
						done = true;
						break;
					}

					yield result.value;
				}
			} finally {
				reader.releaseLock();
			}
		},

		async [Symbol.asyncDispose](): Promise<void> {
			await reader.cancel();
			reader.releaseLock();
		},
	};
}

/**
 * Create a duplex stream (ReadableStream + WritableStream) from two channels
 *
 * @example
 * ```typescript
 * const { readable, writable } = createDuplexStream<string, number>(s)
 *
 * // Write strings
 * const writer = writable.getWriter()
 * await writer.write('hello')
 *
 * // Read numbers
 * const reader = readable.getReader()
 * const { value } = await reader.read()
 * ```
 */
export interface DuplexStream<I, O> {
	/** Readable end - read from this */
	readable: ReadableStream<O>;
	/** Writable end - write to this */
	writable: WritableStream<I>;
}

export function createDuplexStream<I, O>(
	scope: Scope,
	options: {
		inputCapacity?: number;
		outputCapacity?: number;
	} = {},
): DuplexStream<I, O> {
	const inputChannel = scope.channel<I>(options.inputCapacity ?? 0);
	const outputChannel = scope.channel<O>(options.outputCapacity ?? 0);

	return {
		readable: channelToReadableStream(outputChannel),
		writable: channelToWritableStream(inputChannel),
	};
}

/**
 * Tee a ReadableStream into two channels
 *
 * @example
 * ```typescript
 * const stream = fetch('/api/data').then(r => r.body!)
 * const [ch1, ch2] = teeStream(s, await stream)
 *
 * // ch1 and ch2 both receive all values
 * ```
 */
export function teeStream<T>(
	scope: Scope,
	stream: ReadableStream<T>,
	options: { capacity?: number } = {},
): [Channel<T>, Channel<T>] {
	const [branch1, branch2] = stream.tee();

	return [
		readableStreamToChannel(scope, branch1, options),
		readableStreamToChannel(scope, branch2, options),
	];
}

/**
 * Create a backpressure-aware stream pipe
 *
 * @example
 * ```typescript
 * await pipeStreams(
 *   fetch('/api/data').then(r => r.body!),
 *   transformStream,
 *   writableStream
 * )
 * ```
 */
export async function pipeStreams<T>(
	source: ReadableStream<T>,
	...transforms: (TransformStream<T, T> | WritableStream<T>)[]
): Promise<void> {
	let stream: ReadableStream<T> = source;

	for (const transform of transforms) {
		if (transform instanceof WritableStream) {
			await stream.pipeTo(transform);
			return;
		} else {
			stream = stream.pipeThrough(transform);
		}
	}
}

/**
 * Create a stream from an async iterable with proper backpressure
 */
export function iterableToReadableStream<T>(
	iterable: AsyncIterable<T>,
	options: StreamConversionOptions = {},
): ReadableStream<T> {
	const { signal } = options;
	const iterator = iterable[Symbol.asyncIterator]();

	return new ReadableStream<T>(
		{
			async pull(controller) {
				if (signal?.aborted) {
					controller.error(signal.reason);
					return;
				}

				try {
					const result = await iterator.next();

					if (result.done) {
						controller.close();
					} else {
						controller.enqueue(result.value);
					}
				} catch (error) {
					controller.error(error);
				}
			},

			cancel() {
				iterator.return?.();
			},
		},
		{
			highWaterMark: options.highWaterMark ?? 1,
		},
	);
}

/**
 * Collect a ReadableStream into an array
 */
export async function streamToArray<T>(
	stream: ReadableStream<T>,
): Promise<T[]> {
	const reader = stream.getReader();
	const result: T[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			result.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	return result;
}

/**
 * Read the first value from a ReadableStream
 */
export async function streamFirst<T>(
	stream: ReadableStream<T>,
): Promise<T | undefined> {
	const reader = stream.getReader();

	try {
		const { value } = await reader.read();
		return value;
	} finally {
		reader.releaseLock();
	}
}

/**
 * Apply a function to each chunk of a stream
 */
export function mapStream<I, O>(
	fn: (chunk: I) => O | Promise<O>,
): TransformStream<I, O> {
	return new TransformStream<I, O>({
		async transform(chunk, controller) {
			try {
				const result = await fn(chunk);
				controller.enqueue(result);
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

/**
 * Filter chunks in a stream
 */
export function filterStream<T>(
	predicate: (chunk: T) => boolean | Promise<boolean>,
): TransformStream<T, T> {
	return new TransformStream<T, T>({
		async transform(chunk, controller) {
			try {
				if (await predicate(chunk)) {
					controller.enqueue(chunk);
				}
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

/**
 * Buffer stream chunks into arrays
 */
export function bufferStream<T>(size: number): TransformStream<T, T[]> {
	const buffer: T[] = [];

	return new TransformStream<T, T[]>({
		transform(chunk, controller) {
			buffer.push(chunk);
			if (buffer.length >= size) {
				controller.enqueue(buffer.splice(0, buffer.length));
			}
		},

		flush(controller) {
			if (buffer.length > 0) {
				controller.enqueue(buffer);
			}
		},
	});
}

/**
 * Debounce a stream
 */
export function debounceStream<T>(ms: number): TransformStream<T, T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let lastChunk: T | undefined;

	return new TransformStream<T, T>({
		transform(chunk, controller) {
			lastChunk = chunk;

			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			timeoutId = setTimeout(() => {
				if (lastChunk !== undefined) {
					controller.enqueue(lastChunk);
				}
			}, ms);
		},

		flush(controller) {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			if (lastChunk !== undefined) {
				controller.enqueue(lastChunk);
			}
		},
	});
}

/**
 * Throttle a stream
 */
export function throttleStream<T>(ms: number): TransformStream<T, T> {
	let lastEmit = 0;

	return new TransformStream<T, T>({
		async transform(chunk, controller) {
			const now = Date.now();
			const waitTime = lastEmit + ms - now;

			if (waitTime > 0) {
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}

			lastEmit = Date.now();
			controller.enqueue(chunk);
		},
	});
}

/**
 * Take only the first n chunks from a stream
 */
export function takeStream<T>(n: number): TransformStream<T, T> {
	let count = 0;

	return new TransformStream<T, T>({
		transform(chunk, controller) {
			if (count < n) {
				controller.enqueue(chunk);
				count++;
			}

			if (count >= n) {
				controller.terminate();
			}
		},
	});
}

/**
 * Skip the first n chunks from a stream
 */
export function skipStream<T>(n: number): TransformStream<T, T> {
	let count = 0;

	return new TransformStream<T, T>({
		transform(chunk, controller) {
			if (count >= n) {
				controller.enqueue(chunk);
			}
			count++;
		},
	});
}

/**
 * Type guard to check if value is a ReadableStream
 */
export function isReadableStream(value: unknown): value is ReadableStream {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as ReadableStream).getReader === "function"
	);
}

/**
 * Type guard to check if value is a WritableStream
 */
export function isWritableStream(value: unknown): value is WritableStream {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as WritableStream).getWriter === "function"
	);
}

/**
 * Type guard to check if value is a TransformStream
 */
export function isTransformStream(value: unknown): value is TransformStream {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as TransformStream).readable === "object" &&
		typeof (value as TransformStream).writable === "object"
	);
}
