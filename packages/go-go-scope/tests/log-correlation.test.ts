/**
 * Log Correlation Tests
 */
import { describe, expect, test, vi } from "vitest";
import {
	CorrelatedLogger,
	createCorrelatedLogger,
	generateSpanId,
	generateTraceId,
	getCorrelationContext,
	isCorrelatedLogger,
	scope,
} from "../src/index.js";

describe("log correlation", () => {
	describe("generateTraceId", () => {
		test("generates 32-character hex string", () => {
			const traceId = generateTraceId();
			expect(traceId).toHaveLength(32);
			expect(traceId).toMatch(/^[0-9a-f]+$/);
		});

		test("generates unique trace IDs", () => {
			const ids = new Set(Array.from({ length: 100 }, generateTraceId));
			expect(ids.size).toBe(100);
		});
	});

	describe("generateSpanId", () => {
		test("generates 16-character hex string", () => {
			const spanId = generateSpanId();
			expect(spanId).toHaveLength(16);
			expect(spanId).toMatch(/^[0-9a-f]+$/);
		});

		test("generates unique span IDs", () => {
			const ids = new Set(Array.from({ length: 100 }, generateSpanId));
			expect(ids.size).toBe(100);
		});
	});

	describe("CorrelatedLogger", () => {
		test("wraps delegate logger with correlation context", () => {
			const delegate = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test-scope",
			};

			const logger = new CorrelatedLogger(delegate, correlation);

			logger.info("Test message");

			expect(delegate.info).toHaveBeenCalledWith(
				"[traceId=abc123] [spanId=xyz789] Test message",
				{
					traceId: "abc123",
					spanId: "xyz789",
					scopeName: "test-scope",
				},
			);
		});

		test("includes parentSpanId when present", () => {
			const delegate = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test-scope",
				parentSpanId: "parent456",
			};

			const logger = new CorrelatedLogger(delegate, correlation);

			logger.info("Test message");

			expect(delegate.info).toHaveBeenCalledWith(
				expect.stringContaining("Test message"),
				expect.objectContaining({
					parentSpanId: "parent456",
				}),
			);
		});

		test("passes through extra arguments", () => {
			const delegate = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test-scope",
			};

			const logger = new CorrelatedLogger(delegate, correlation);

			logger.info("Test message", { extra: "data" });

			expect(delegate.info).toHaveBeenCalledWith(
				"[traceId=abc123] [spanId=xyz789] Test message",
				{ extra: "data" },
			);
		});

		test("getCorrelationContext returns correlation data", () => {
			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test-scope",
			};

			const logger = new CorrelatedLogger(
				{ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
				correlation,
			);

			expect(logger.getCorrelationContext()).toEqual(correlation);
		});
	});

	describe("isCorrelatedLogger", () => {
		test("returns true for CorrelatedLogger", () => {
			const logger = new CorrelatedLogger(
				{ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
				{ traceId: "abc", spanId: "xyz", scopeName: "test" },
			);

			expect(isCorrelatedLogger(logger)).toBe(true);
		});

		test("returns false for regular logger", () => {
			const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

			expect(isCorrelatedLogger(logger)).toBe(false);
		});
	});

	describe("getCorrelationContext", () => {
		test("extracts context from CorrelatedLogger", () => {
			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test-scope",
			};

			const logger = new CorrelatedLogger(
				{ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
				correlation,
			);

			expect(getCorrelationContext(logger)).toEqual(correlation);
		});

		test("returns undefined for regular logger", () => {
			const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

			expect(getCorrelationContext(logger)).toBeUndefined();
		});
	});

	describe("scope with logCorrelation", () => {
		test("generates traceId and spanId when enabled", async () => {
			await using s = scope({
				name: "correlated-scope",
				logCorrelation: true,
			});

			expect(s.traceId).toBeDefined();
			expect(s.traceId).toHaveLength(32);
			expect(s.spanId).toBeDefined();
			expect(s.spanId).toHaveLength(16);
		});

		test("does not generate traceId when disabled", async () => {
			await using s = scope({
				name: "uncorrelated-scope",
			});

			expect(s.traceId).toBeUndefined();
			expect(s.spanId).toBeUndefined();
		});

		test("inherits traceId from parent scope", async () => {
			await using parent = scope({
				name: "parent",
				logCorrelation: true,
			});

			const parentTraceId = parent.traceId;

			await using child = scope({
				name: "child",
				parent,
				logCorrelation: true,
			});

			expect(child.traceId).toBe(parentTraceId);
			expect(child.spanId).not.toBe(parent.spanId);
		});

		test("uses external traceId when provided", async () => {
			await using s = scope({
				name: "external-trace",
				logCorrelation: true,
				traceId: "external-trace-id-1234567890abcd",
			});

			expect(s.traceId).toBe("external-trace-id-1234567890abcd");
		});

		test("external traceId takes precedence over parent", async () => {
			await using parent = scope({
				name: "parent",
				logCorrelation: true,
			});

			await using child = scope({
				name: "child",
				parent,
				logCorrelation: true,
				traceId: "child-specific-trace-id-123456",
			});

			expect(child.traceId).toBe("child-specific-trace-id-123456");
		});

		test("logger includes correlation context", async () => {
			const logs: string[] = [];

			await using s = scope({
				name: "correlated-scope",
				logCorrelation: true,
				logger: {
					debug: (msg: string) => logs.push(msg),
					info: (msg: string) => logs.push(msg),
					warn: (msg: string) => logs.push(msg),
					error: (msg: string) => logs.push(msg),
				},
			});

			const [err] = await s.task(async ({ logger }) => {
				logger.info("Test message from task");
				return "done";
			});

			if (!err) {
				expect(logs.some((log) => log.includes("traceId="))).toBe(true);
				expect(logs.some((log) => log.includes("spanId="))).toBe(true);
			}
		});

		test("task logger has task context with correlation", async () => {
			const logs: string[] = [];

			await using s = scope({
				name: "correlated-scope",
				logCorrelation: true,
				logger: {
					debug: (msg: string) => logs.push(msg),
					info: (msg: string) => logs.push(msg),
					warn: (msg: string) => logs.push(msg),
					error: (msg: string) => logs.push(msg),
				},
			});

			const [err] = await s.task(async ({ logger }) => {
				logger.info("Task message");
				return "done";
			});

			if (!err) {
				// Should have both scope and task context
				expect(logs.some((log) => log.includes("correlated-scope"))).toBe(true);
				expect(logs.some((log) => log.includes("traceId="))).toBe(true);
			}
		});
	});

	describe("createCorrelatedLogger", () => {
		test("creates CorrelatedLogger instance", () => {
			const delegate = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			const correlation = {
				traceId: "abc123",
				spanId: "xyz789",
				scopeName: "test",
			};

			const logger = createCorrelatedLogger(delegate, correlation);

			expect(isCorrelatedLogger(logger)).toBe(true);
			expect(logger.getCorrelationContext()).toEqual(correlation);
		});
	});
});
