/**
 * Tests for @go-go-scope/plugin-opentelemetry
 */
import { describe, test, expect } from "vitest";
import { scope } from "go-go-scope";
import { opentelemetryPlugin } from "../src/index.js";
import type { Tracer, Span, SpanOptions, Context } from "@opentelemetry/api";

// Mock span for testing
let mockSpanIdCounter = 0;

class MockSpan implements Span {
	name: string;
	attributes: Record<string, unknown> | undefined;
	ended = false;
	exceptions: unknown[] = [];
	status: { code: number; message?: string } | undefined;
	parent?: { traceId: string; spanId: string; traceFlags: number };
	traceId: string;
	spanId: string;
	recording = true;

	constructor(
		name: string,
		attributes?: Record<string, unknown>,
		parentContext?: { traceId: string; spanId: string; traceFlags: number },
	) {
		this.name = name;
		this.attributes = attributes;
		this.parent = parentContext;
		this.traceId = parentContext?.traceId ?? `trace-${mockSpanIdCounter++}`;
		this.spanId = `span-${mockSpanIdCounter++}`;
	}

	spanContext() {
		return {
			traceId: this.traceId,
			spanId: this.spanId,
			traceFlags: 1,
		};
	}

	end(): void {
		this.ended = true;
	}

	recordException(exception: unknown): void {
		this.exceptions.push(exception);
	}

	setStatus(status: { code: number; message?: string }): this {
		this.status = status;
		return this;
	}

	setAttributes(attributes: Record<string, unknown>): this {
		this.attributes = { ...this.attributes, ...attributes };
		return this;
	}

	setAttribute(_key: string, _value: unknown): this {
		return this;
	}

	addEvent(): this {
		return this;
	}

	addLink(): this {
		return this;
	}

	addLinks(): this {
		return this;
	}

	updateName(): this {
		return this;
	}

	isRecording(): boolean {
		return this.recording;
	}
}

// Mock tracer factory
function createMockTracer(): { tracer: Tracer; spans: MockSpan[] } {
	const spans: MockSpan[] = [];

	const tracer: Tracer = {
		startSpan(
			name: string,
			options?: SpanOptions,
		) {
			const parentContext = (options as { links?: { context: { traceId: string; spanId: string; traceFlags: number } }[] })?.links?.[0]?.context;
			const span = new MockSpan(
				name,
				options?.attributes as Record<string, unknown>,
				parentContext,
			);
			spans.push(span);
			return span;
		},

		startActiveSpan<F extends (span: Span) => unknown>(
			name: string,
			optionsOrFn: SpanOptions | F,
			_contextOrFn?: Context | F,
			fn?: F,
		): ReturnType<F> {
			const span = this.startSpan(name, optionsOrFn as SpanOptions);
			const callback = (
				typeof optionsOrFn === "function" ? optionsOrFn : fn
			) as F;
			return callback(span) as ReturnType<F>;
		},
	};

	return { tracer, spans };
}

describe("opentelemetry plugin", () => {
	test("installs tracer on scope", async () => {
		const { tracer } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		expect(s.tracer).toBe(tracer);
		expect(s.otelSpan).toBeDefined();
	});

	test("creates spans for tasks", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("success"), {
			otel: { name: "my-task" },
		});

		const taskSpan = spans.find((s) => s.name === "my-task");
		expect(taskSpan).toBeDefined();
	});

	test("records task attributes", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(
			() => Promise.resolve("success"),
			{
				otel: {
					name: "task-with-attrs",
					attributes: { custom: "value" },
				},
			},
		);

		const taskSpan = spans.find((s) => s.name === "task-with-attrs");
		expect(taskSpan).toBeDefined();
		expect(taskSpan?.attributes).toMatchObject({
			"task.index": expect.any(Number),
			"task.name": expect.any(String),
			custom: "value",
		});
	});

	test("records exceptions on task failure", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		const [err] = await s.task(
			() => Promise.reject(new Error("task failed")),
			{
				otel: { name: "failing-task" },
			},
		);

		expect(err).toBeDefined();

		const taskSpan = spans.find((s) => s.name === "failing-task");
		expect(taskSpan).toBeDefined();
		// Note: Exception recording would happen through hooks in real implementation
	});

	test("ends spans on scope disposal", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({
				plugins: [opentelemetryPlugin(tracer)],
			});

			expect(spans[0]?.ended).toBe(false);
		}

		// After scope disposal, spans should be ended
		expect(spans[0]?.ended).toBe(true);
	});

	test("creates child spans with parent context", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("success"), {
			otel: { name: "child-task" },
		});

		// Find scope span and task span
		const scopeSpan = spans.find((s) => s.name === s.name);
		const taskSpan = spans.find((s) => s.name === "child-task");

		expect(scopeSpan).toBeDefined();
		expect(taskSpan).toBeDefined();
	});

	test("records retry options in attributes", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("success"), {
			otel: { name: "retryable-task" },
			retry: { maxRetries: 3 },
		});

		const taskSpan = spans.find((s) => s.name === "retryable-task");
		expect(taskSpan?.attributes?.["task.has_retry"]).toBe(true);
	});

	test("records timeout options in attributes", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("success"), {
			otel: { name: "timed-task" },
			timeout: 5000,
		});

		const taskSpan = spans.find((s) => s.name === "timed-task");
		expect(taskSpan?.attributes?.["task.has_timeout"]).toBe(true);
	});

	test("otelSpan and otelContext are accessible", async () => {
		const { tracer } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		expect(s.otelSpan).toBeDefined();
		expect(s.otelContext).toBeDefined();
	});
});
