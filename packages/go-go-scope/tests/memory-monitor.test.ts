/**
 * Tests for memory monitoring functionality
 */

import { describe, expect, test, vi } from "vitest";
import {
	getMemoryUsage,
	isMemoryMonitoringAvailable,
	MemoryMonitor,
} from "../src/memory-monitor.js";
import { scope } from "../src/factory.js";

describe("memory monitoring", () => {
	describe("getMemoryUsage", () => {
		test("returns memory usage object", () => {
			const usage = getMemoryUsage();
			expect(usage).toBeDefined();
			expect(typeof usage.used).toBe("number");
			expect(typeof usage.total).toBe("number");
			expect(typeof usage.limit).toBe("number");
			expect(typeof usage.percentageUsed).toBe("number");
			expect(typeof usage.isOverLimit).toBe("boolean");
		});
	});

	describe("isMemoryMonitoringAvailable", () => {
		test("returns boolean", () => {
			const available = isMemoryMonitoringAvailable();
			expect(typeof available).toBe("boolean");
		});
	});

	describe("MemoryMonitor", () => {
		test("creates monitor with numeric limit", () => {
			const monitor = new MemoryMonitor({ limit: 100 * 1024 * 1024 }); // 100MB
			expect(monitor.getLimit()).toBe(100 * 1024 * 1024);
			monitor[Symbol.dispose]();
		});

		test("creates monitor with string limit", () => {
			const monitor = new MemoryMonitor({ limit: "100mb" });
			expect(monitor.getLimit()).toBe(100 * 1024 * 1024);
			monitor[Symbol.dispose]();
		});

		test("creates monitor with GB string limit", () => {
			const monitor = new MemoryMonitor({ limit: "1gb" });
			expect(monitor.getLimit()).toBe(1024 * 1024 * 1024);
			monitor[Symbol.dispose]();
		});

		test("throws on invalid limit format", () => {
			expect(() => new MemoryMonitor({ limit: "invalid" })).toThrow(
				"Invalid memory limit format",
			);
		});

		test("getUsage returns memory usage", () => {
			const monitor = new MemoryMonitor({ limit: "100mb" });
			const usage = monitor.getUsage();
			expect(usage).toBeDefined();
			expect(typeof usage.used).toBe("number");
			monitor[Symbol.dispose]();
		});

		test("setLimit updates the limit", () => {
			const monitor = new MemoryMonitor({ limit: "100mb" });
			expect(monitor.getLimit()).toBe(100 * 1024 * 1024);
			monitor.setLimit("200mb");
			expect(monitor.getLimit()).toBe(200 * 1024 * 1024);
			monitor[Symbol.dispose]();
		});

		test("calls onPressure when threshold exceeded", async () => {
			const onPressure = vi.fn();
			// Set a very low limit to trigger pressure
			const monitor = new MemoryMonitor({
				limit: 1, // 1 byte - will definitely exceed
				onPressure,
				checkInterval: 100,
				pressureThreshold: 0, // 0% threshold - always trigger
			});

			// Wait for check interval
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(onPressure).toHaveBeenCalled();
			const callArg = onPressure.mock.calls[0]![0];
			expect(callArg).toMatchObject({
				used: expect.any(Number),
				total: expect.any(Number),
				limit: expect.any(Number),
				isOverLimit: true,
			});
			// The configured limit should be 1, but the actual limit might differ based on environment
			expect(monitor.getLimit()).toBe(1);

			monitor[Symbol.dispose]();
		});

		test("disposes cleanly", () => {
			const monitor = new MemoryMonitor({ limit: "100mb" });
			expect(() => monitor[Symbol.dispose]()).not.toThrow();
			// Dispose twice should not throw
			expect(() => monitor[Symbol.dispose]()).not.toThrow();
		});

		test("async disposes cleanly", async () => {
			const monitor = new MemoryMonitor({ limit: "100mb" });
			await expect(monitor[Symbol.asyncDispose]()).resolves.not.toThrow();
		});
	});

	describe("scope integration", () => {
		test("scope with memoryLimit option", async () => {
			await using s = scope({ memoryLimit: "100mb" });
			expect(s.isMemoryMonitoringEnabled).toBe(true);
			expect(s.memoryLimit).toBe(100 * 1024 * 1024);
		});

		test("scope with memoryLimit object", async () => {
			const onPressure = vi.fn();
			await using s = scope({
				memoryLimit: {
					limit: "100mb",
					onPressure,
					checkInterval: 1000,
					pressureThreshold: 80,
				},
			});
			expect(s.isMemoryMonitoringEnabled).toBe(true);
		});

		test("scope memoryUsage returns usage", async () => {
			await using s = scope({ memoryLimit: "100mb" });
			const usage = s.memoryUsage();
			expect(usage).toBeDefined();
			expect(typeof usage?.used).toBe("number");
		});

		test("scope without memoryLimit still returns basic usage", async () => {
			await using s = scope();
			// Should return usage if monitoring is available
			if (isMemoryMonitoringAvailable()) {
				const usage = s.memoryUsage();
				expect(usage).toBeDefined();
			}
		});

		test("setMemoryLimit updates limit", async () => {
			await using s = scope({ memoryLimit: "100mb" });
			expect(s.memoryLimit).toBe(100 * 1024 * 1024);
			s.setMemoryLimit("200mb");
			expect(s.memoryLimit).toBe(200 * 1024 * 1024);
		});

		test("setMemoryLimit throws if not enabled", async () => {
			await using s = scope();
			expect(() => s.setMemoryLimit("100mb")).toThrow(
				"Memory monitoring not enabled",
			);
		});

		test("scope with onMemoryPressure callback", async () => {
			const onMemoryPressure = vi.fn();
			await using s = scope({
				memoryLimit: 1, // Very low to trigger pressure
				onMemoryPressure,
			});
			expect(s.isMemoryMonitoringEnabled).toBe(true);
		});
	});
});
