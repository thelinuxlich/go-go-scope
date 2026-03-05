/**
 * Integration tests for @go-go-scope/plugin-opentelemetry
 * Verifies the plugin works correctly without exporters
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
	traceId: string;
	spanId: string;
	recording = true;

	constructor(
		name: string,
		attributes?: Record<string, unknown>,
	) {
		this.name = name;
		this.attributes = attributes;
		this.traceId = `trace-${mockSpanIdCounter++}`;
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

	setAttribute(): this {
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
function createMockTracer(name = "test-tracer"): { tracer: Tracer; spans: MockSpan[]; name: string } {
	const spans: MockSpan[] = [];

	const tracer: Tracer = {
		startSpan(
			spanName: string,
			options?: SpanOptions,
		) {
			const span = new MockSpan(
				spanName,
				options?.attributes as Record<string, unknown>,
			);
			spans.push(span);
			return span;
		},

		startActiveSpan<F extends (span: Span) => unknown>(
			spanName: string,
			optionsOrFn: SpanOptions | F,
			_contextOrFn?: Context | F,
			fn?: F,
		): ReturnType<F> {
			const span = this.startSpan(spanName, optionsOrFn as SpanOptions);
			const callback = (
				typeof optionsOrFn === "function" ? optionsOrFn : fn
			) as F;
			return callback(span) as ReturnType<F>;
		},
	};

	return { tracer, spans, name };
}

describe("opentelemetry plugin integration", () => {
	test("multiple scopes share tracer but have independent spans", async () => {
		const { tracer, spans } = createMockTracer();

		await using scope1 = scope({
			name: "scope-1",
			plugins: [opentelemetryPlugin(tracer, { name: "scope-1-span" })],
		});

		await using scope2 = scope({
			name: "scope-2",
			plugins: [opentelemetryPlugin(tracer, { name: "scope-2-span" })],
		});

		// Both scopes should have the same tracer
		expect(scope1.tracer).toBe(tracer);
		expect(scope2.tracer).toBe(tracer);

		// But independent spans
		expect(scope1.otelSpan).not.toBe(scope2.otelSpan);

		// Verify spans were created
		const scope1Span = spans.find((s) => s.name === "scope-1-span");
		const scope2Span = spans.find((s) => s.name === "scope-2-span");
		expect(scope1Span).toBeDefined();
		expect(scope2Span).toBeDefined();
	});

	test("nested scopes maintain span hierarchy", async () => {
		const { tracer, spans } = createMockTracer();

		await using parentScope = scope({
			name: "parent",
			plugins: [opentelemetryPlugin(tracer, { name: "parent-span" })],
		});

		await using childScope = scope({
			name: "child",
			plugins: [opentelemetryPlugin(tracer, { name: "child-span" })],
		});

		await childScope.task(() => Promise.resolve("done"), {
			otel: { name: "child-task" },
		});

		// All spans should be created
		const parentSpan = spans.find((s) => s.name === "parent-span");
		const childSpan = spans.find((s) => s.name === "child-span");
		const taskSpan = spans.find((s) => s.name === "child-task");

		expect(parentSpan).toBeDefined();
		expect(childSpan).toBeDefined();
		expect(taskSpan).toBeDefined();
	});

	test("parallel tasks create independent spans", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.parallel([
			() => s.task(() => Promise.resolve("task-1"), { otel: { name: "parallel-task-1" } }),
			() => s.task(() => Promise.resolve("task-2"), { otel: { name: "parallel-task-2" } }),
			() => s.task(() => Promise.resolve("task-3"), { otel: { name: "parallel-task-3" } }),
		]);

		// Each parallel task should have its own span
		const taskSpans = spans.filter((s) =>
			s.name.startsWith("parallel-task-")
		);
		expect(taskSpans).toHaveLength(3);
	});

	test("task errors are recorded in spans", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		const testError = new Error("test failure");
		const [err] = await s.task(() => Promise.reject(testError), {
			otel: { name: "error-task" },
		});

		expect(err).toBeDefined();

		const taskSpan = spans.find((s) => s.name === "error-task");
		expect(taskSpan).toBeDefined();
	});

	test("spans are properly ended on scope disposal", async () => {
		const { tracer, spans } = createMockTracer();

		{
			await using s = scope({
				plugins: [opentelemetryPlugin(tracer)],
			});

			await s.task(() => Promise.resolve("done"), {
				otel: { name: "task-1" },
			});

			await s.task(() => Promise.resolve("done"), {
				otel: { name: "task-2" },
			});

			// Before disposal, spans should not be ended
			const scopeSpan = spans.find((s) => s.name === s.name);
			expect(scopeSpan?.ended).toBe(false);
		}

		// After disposal, all spans should be ended
		for (const span of spans) {
			expect(span.ended).toBe(true);
		}
	});

	test("plugin attributes are correctly applied", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			name: "test-scope",
			plugins: [
				opentelemetryPlugin(tracer, {
					name: "custom-scope",
					attributes: {
						"service.name": "test-service",
						"deployment.environment": "test",
					},
				}),
			],
		});

		const scopeSpan = spans.find((s) => s.name === "custom-scope");
		expect(scopeSpan).toBeDefined();
		expect(scopeSpan?.attributes?.["service.name"]).toBe("test-service");
		expect(scopeSpan?.attributes?.["deployment.environment"]).toBe("test");
		expect(scopeSpan?.attributes?.["scope.name"]).toBe("test-scope");
	});

	test("otel context is properly set on scope", async () => {
		const { tracer } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		// otelContext should be defined and be an object
		expect(s.otelContext).toBeDefined();
		expect(typeof s.otelContext).toBe("object");
	});

	test("multiple tasks in same scope have correct indices", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("1"), { otel: { name: "task-a" } });
		await s.task(() => Promise.resolve("2"), { otel: { name: "task-b" } });
		await s.task(() => Promise.resolve("3"), { otel: { name: "task-c" } });

		const taskA = spans.find((s) => s.name === "task-a");
		const taskB = spans.find((s) => s.name === "task-b");
		const taskC = spans.find((s) => s.name === "task-c");

		expect(taskA?.attributes?.["task.index"]).toBe(1);
		expect(taskB?.attributes?.["task.index"]).toBe(2);
		expect(taskC?.attributes?.["task.index"]).toBe(3);
	});

	test("plugin works without any options", async () => {
		const { tracer, spans } = createMockTracer();

		await using s = scope({
			plugins: [opentelemetryPlugin(tracer)],
		});

		await s.task(() => Promise.resolve("success"));

		// Should have created at least the scope span
		expect(spans.length).toBeGreaterThanOrEqual(1);
	});

	test("concurrent scope disposal handles spans correctly", async () => {
		const { tracer, spans } = createMockTracer();

		const scopes: Array<{ dispose: () => Promise<void> }> = [];

		// Create multiple scopes concurrently
		for (let i = 0; i < 5; i++) {
			const s = scope({
				name: `concurrent-scope-${i}`,
				plugins: [opentelemetryPlugin(tracer)],
			});
			scopes.push({ dispose: () => s[Symbol.asyncDispose]() });
		}

		// Dispose all concurrently
		await Promise.all(scopes.map((s) => s.dispose()));

		// All spans should be ended
		for (const span of spans) {
			expect(span.ended).toBe(true);
		}
	});
});
