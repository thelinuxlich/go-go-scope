import type { Logger } from "go-go-scope";
import { describe, expect, test, vi } from "vitest";
import {
	adaptPino,
	adaptWinston,
	createChildLogger,
	createRedactedLogger,
} from "./index.js";

// Mock Pino-like logger
function createMockPino(): {
	logger: {
		debug: (obj: unknown, msg?: string) => void;
		info: (obj: unknown, msg?: string) => void;
		warn: (obj: unknown, msg?: string) => void;
		error: (obj: unknown, msg?: string) => void;
		child: (
			bindings: Record<string, unknown>,
		) => ReturnType<typeof createMockPino>["logger"];
	};
	logs: { level: string; obj: unknown; msg?: string }[];
} {
	const logs: { level: string; obj: unknown; msg?: string }[] = [];

	const logger = {
		debug: (obj: unknown, msg?: string) =>
			logs.push({ level: "debug", obj, msg }),
		info: (obj: unknown, msg?: string) =>
			logs.push({ level: "info", obj, msg }),
		warn: (obj: unknown, msg?: string) =>
			logs.push({ level: "warn", obj, msg }),
		error: (obj: unknown, msg?: string) =>
			logs.push({ level: "error", obj, msg }),
		child: (bindings: Record<string, unknown>) => {
			const childLogs = createMockPino();
			const originalPush = childLogs.logs.push.bind(childLogs.logs);
			childLogs.logs.push = (...args) => {
				const result = originalPush(...args);
				// Merge bindings with logged object
				const lastLog = childLogs.logs[childLogs.logs.length - 1];
				if (
					lastLog &&
					typeof lastLog.obj === "object" &&
					lastLog.obj !== null
				) {
					lastLog.obj = {
						...bindings,
						...(lastLog.obj as Record<string, unknown>),
					};
				}
				return result;
			};
			return childLogs.logger;
		},
	};

	return { logger, logs };
}

// Mock Winston-like logger
function createMockWinston(): {
	logger: {
		debug: (message: string, ...meta: unknown[]) => void;
		info: (message: string, ...meta: unknown[]) => void;
		warn: (message: string, ...meta: unknown[]) => void;
		error: (message: string, ...meta: unknown[]) => void;
		child: (options: Record<string, unknown>) => ReturnType<typeof createMockWinston>["logger"];
	};
	logs: { level: string; message: string; meta: unknown[] }[];
} {
	const logs: { level: string; message: string; meta: unknown[] }[] = [];

	const logger = {
		debug: (message: string, ...meta: unknown[]) =>
			logs.push({ level: "debug", message, meta }),
		info: (message: string, ...meta: unknown[]) =>
			logs.push({ level: "info", message, meta }),
		warn: (message: string, ...meta: unknown[]) =>
			logs.push({ level: "warn", message, meta }),
		error: (message: string, ...meta: unknown[]) =>
			logs.push({ level: "error", message, meta }),
		child: () => logger,
	};

	return { logger, logs };
}

describe("adaptPino", () => {
	test("adapts pino logger to go-go-scope Logger interface", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		logger.info("test message");

		expect(logs).toHaveLength(1);
		expect(logs[0].level).toBe("info");
		expect((logs[0].obj as Record<string, unknown>).msg).toBe("test message");
	});

	test("logs at different levels", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		logger.debug("debug message");
		logger.info("info message");
		logger.warn("warn message");
		logger.error("error message");

		expect(logs).toHaveLength(4);
		expect(logs[0].level).toBe("debug");
		expect(logs[1].level).toBe("info");
		expect(logs[2].level).toBe("warn");
		expect(logs[3].level).toBe("error");
	});

	test("includes additional arguments", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		logger.info("user action", { userId: 123, action: "login" });

		const loggedObj = logs[0].obj as Record<string, unknown>;
		expect(loggedObj.msg).toBe("user action");
		expect(loggedObj.userId).toBe(123);
		expect(loggedObj.action).toBe("login");
	});

	test("merges context with log object", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0], {
			context: { service: "test-service", version: "1.0.0" },
		});

		logger.info("test message");

		const loggedObj = logs[0].obj as Record<string, unknown>;
		expect(loggedObj.service).toBe("test-service");
		expect(loggedObj.version).toBe("1.0.0");
	});

	test("handles Error objects correctly", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		const error = new Error("test error");
		logger.error("operation failed", error);

		const loggedObj = logs[0].obj as Record<string, unknown>;
		// Error properties are spread into the log object
		expect(loggedObj.name).toBe("Error");
		expect(loggedObj.message).toBe("test error");
		expect(loggedObj.stack).toBeDefined();
	});

	test("handles nested objects with redaction", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0], {
			redact: { paths: ["password"], censor: "[HIDDEN]" },
		});

		logger.info("user data", {
			user: {
				id: 1,
				name: "John",
				password: "secret123",
			},
		});

		const loggedObj = logs[0].obj as Record<string, unknown>;
		const user = loggedObj.user as Record<string, unknown>;
		expect(user.id).toBe(1);
		expect(user.name).toBe("John");
		expect(user.password).toBe("[HIDDEN]");
	});
});

describe("adaptWinston", () => {
	test("adapts winston logger to go-go-scope Logger interface", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0]);

		logger.info("test message");

		expect(logs).toHaveLength(1);
		expect(logs[0].level).toBe("info");
		expect(logs[0].message).toBe("test message");
	});

	test("logs at different levels", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0]);

		logger.debug("debug message");
		logger.info("info message");
		logger.warn("warn message");
		logger.error("error message");

		expect(logs).toHaveLength(4);
		expect(logs[0].level).toBe("debug");
		expect(logs[1].level).toBe("info");
		expect(logs[2].level).toBe("warn");
		expect(logs[3].level).toBe("error");
	});

	test("passes additional arguments as meta", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0]);

		logger.info("user action", { userId: 123, action: "login" });

		expect(logs[0].meta).toEqual([{ userId: 123, action: "login" }]);
	});
});

describe("createChildLogger", () => {
	test("creates child logger with additional context", () => {
		const { logger: mockPino, logs } = createMockPino();
		const parentLogger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		const childLogger = createChildLogger(parentLogger, { requestId: "abc-123" });

		childLogger.info("processing request");

		const loggedObj = logs[0].obj as Record<string, unknown>;
		expect(loggedObj.requestId).toBe("abc-123");
		expect(loggedObj.msg).toBe("processing request");
	});
});

describe("createRedactedLogger", () => {
	test("creates logger with redaction enabled", () => {
		const { logger: mockPino, logs } = createMockPino();
		const baseLogger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		const redactedLogger = createRedactedLogger(baseLogger, {
			paths: ["token"],
			censor: "[REDACTED]",
		});

		redactedLogger.info("API call", { endpoint: "/users", token: "secret-token" });

		const loggedObj = logs[0].obj as Record<string, unknown>;
		expect(loggedObj.endpoint).toBe("/users");
		expect(loggedObj.token).toBe("[REDACTED]");
	});
});
