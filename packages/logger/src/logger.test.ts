import { describe, expect, test, vi } from "vitest";
import {
	adaptPino,
	adaptWinston,
	createChildLogger,
	createRedactedLogger,
} from "./index.js";
import type { Logger } from "go-go-scope";

// Mock Pino-like logger
function createMockPino(): {
	logger: {
		debug: (obj: unknown, msg?: string) => void;
		info: (obj: unknown, msg?: string) => void;
		warn: (obj: unknown, msg?: string) => void;
		error: (obj: unknown, msg?: string) => void;
		child: (bindings: Record<string, unknown>) => ReturnType<typeof createMockPino>["logger"];
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
				if (lastLog && typeof lastLog.obj === "object" && lastLog.obj !== null) {
					lastLog.obj = { ...bindings, ...(lastLog.obj as Record<string, unknown>) };
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
		child?: (options: Record<string, unknown>) => ReturnType<typeof createMockWinston>["logger"];
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
		child: (options: Record<string, unknown>) => {
			const child = createMockWinston();
			const originalPush = child.logs.push.bind(child.logs);
			child.logs.push = (...args) => {
				const result = originalPush(...args);
				// Add context to message
				const lastLog = child.logs[child.logs.length - 1];
				if (lastLog) {
					lastLog.message = `[${JSON.stringify(options)}] ${lastLog.message}`;
				}
				return result;
			};
			return child.logger;
		},
	};

	return { logger, logs };
}

describe("adaptPino", () => {
	test("forwards log messages at all levels", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		logger.debug("debug message", { data: 1 });
		logger.info("info message", { data: 2 });
		logger.warn("warn message", { data: 3 });
		logger.error("error message", { data: 4 });

		expect(logs).toHaveLength(4);
		expect(logs[0].level).toBe("debug");
		expect(logs[1].level).toBe("info");
		expect(logs[2].level).toBe("warn");
		expect(logs[3].level).toBe("error");
	});

	test("includes message in log object", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0]);

		logger.info("test message");

		expect(logs).toHaveLength(1);
		expect((logs[0].obj as Record<string, unknown>).msg).toBe("test message");
	});

	test("redacts sensitive fields", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0], {
			redact: { paths: ["password", "token"], censor: "***" },
		});

		logger.info("user login", {
			userId: 1,
			password: "secret",
			token: "abc123",
		});

		const loggedObj = logs[0].obj as Record<string, unknown>;
		expect(loggedObj.userId).toBe(1);
		expect(loggedObj.password).toBe("***");
		expect(loggedObj.token).toBe("***");
	});

	test("includes context in all logs", () => {
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
		expect(loggedObj.args).toBeDefined();
	});

	test("handles nested objects with redaction", () => {
		const { logger: mockPino, logs } = createMockPino();
		const logger = adaptPino(mockPino as Parameters<typeof adaptPino>[0], {
			redact: { paths: ["password"], censor: "[HIDDEN]" },
		});

		logger.info("user data", {
			user: {
				id: 1,
				password: "secret123",
				profile: {
					password: "another-secret",
				},
			},
		});

		const loggedObj = logs[0].obj as Record<string, unknown>;
		const user = loggedObj.user as Record<string, unknown>;
		expect(user.id).toBe(1);
		expect(user.password).toBe("[HIDDEN]");
		expect((user.profile as Record<string, unknown>).password).toBe("[HIDDEN]");
	});
});

describe("adaptWinston", () => {
	test("forwards log messages at all levels", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0]);

		logger.debug("debug message", { data: 1 });
		logger.info("info message", { data: 2 });
		logger.warn("warn message", { data: 3 });
		logger.error("error message", { data: 4 });

		expect(logs).toHaveLength(4);
		expect(logs[0].level).toBe("debug");
		expect(logs[1].level).toBe("info");
		expect(logs[2].level).toBe("warn");
		expect(logs[3].level).toBe("error");
	});

	test("passes message and meta correctly", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0]);

		logger.info("test message", { key: "value" }, "extra");

		expect(logs[0].message).toBe("test message");
		expect(logs[0].meta).toHaveLength(2);
	});

	test("redacts sensitive fields", () => {
		const { logger: mockWinston, logs } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0], {
			redact: { paths: ["password", "apiKey"], censor: "***" },
		});

		logger.info("request", { password: "secret", apiKey: "key123", userId: 1 });

		const meta = logs[0].meta[0] as Record<string, unknown>;
		expect(meta.userId).toBe(1);
		expect(meta.password).toBe("***");
		expect(meta.apiKey).toBe("***");
	});

	test("creates child logger with context", () => {
		const { logger: mockWinston } = createMockWinston();
		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0], {
			context: { requestId: "abc-123" },
		});

		// Just verify it doesn't throw - child logger is used internally
		expect(() => logger.info("test")).not.toThrow();
	});

	test("handles logger without child method", () => {
		const mockWinston = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			// No child method
		};

		const logger = adaptWinston(mockWinston as Parameters<typeof adaptWinston>[0], {
			context: { service: "test" },
		});

		// Should not throw even without child method
		expect(() => logger.info("test")).not.toThrow();
	});
});

describe("createChildLogger", () => {
	test("prepends context to messages", () => {
		const parentLogs: { level: string; message: string; args: unknown[] }[] = [];
		const parentLogger: Logger = {
			debug: (msg, ...args) => parentLogs.push({ level: "debug", message: msg, args }),
			info: (msg, ...args) => parentLogs.push({ level: "info", message: msg, args }),
			warn: (msg, ...args) => parentLogs.push({ level: "warn", message: msg, args }),
			error: (msg, ...args) => parentLogs.push({ level: "error", message: msg, args }),
		};

		const childLogger = createChildLogger(parentLogger, {
			scope: "user-service",
			requestId: "abc-123",
		});

		childLogger.info("user created", { userId: 1 });

		expect(parentLogs[0].message).toBe("[scope=user-service requestId=abc-123] user created");
	});

	test("preserves log arguments", () => {
		const parentLogs: { level: string; message: string; args: unknown[] }[] = [];
		const parentLogger: Logger = {
			debug: (msg, ...args) => parentLogs.push({ level: "debug", message: msg, args }),
			info: (msg, ...args) => parentLogs.push({ level: "info", message: msg, args }),
			warn: (msg, ...args) => parentLogs.push({ level: "warn", message: msg, args }),
			error: (msg, ...args) => parentLogs.push({ level: "error", message: msg, args }),
		};

		const childLogger = createChildLogger(parentLogger, { component: "test" });

		childLogger.error("failed", new Error("test error"));

		expect(parentLogs[0].args).toHaveLength(1);
		expect(parentLogs[0].args[0]).toBeInstanceOf(Error);
	});
});

describe("createRedactedLogger", () => {
	test("redacts sensitive fields from log args", () => {
		const parentLogs: { level: string; message: string; args: unknown[] }[] = [];
		const parentLogger: Logger = {
			debug: (msg, ...args) => parentLogs.push({ level: "debug", message: msg, args }),
			info: (msg, ...args) => parentLogs.push({ level: "info", message: msg, args }),
			warn: (msg, ...args) => parentLogs.push({ level: "warn", message: msg, args }),
			error: (msg, ...args) => parentLogs.push({ level: "error", message: msg, args }),
		};

		const redactedLogger = createRedactedLogger(parentLogger, {
			paths: ["password", "ssn"],
			censor: "***REDACTED***",
		});

		redactedLogger.info("user login", {
			userId: 1,
			password: "secret",
			ssn: "123-45-6789",
		});

		const loggedArg = parentLogs[0].args[0] as Record<string, unknown>;
		expect(loggedArg.userId).toBe(1);
		expect(loggedArg.password).toBe("***REDACTED***");
		expect(loggedArg.ssn).toBe("***REDACTED***");
	});

	test("passes through message unchanged", () => {
		const parentLogs: { level: string; message: string; args: unknown[] }[] = [];
		const parentLogger: Logger = {
			debug: (msg, ...args) => parentLogs.push({ level: "debug", message: msg, args }),
			info: (msg, ...args) => parentLogs.push({ level: "info", message: msg, args }),
			warn: (msg, ...args) => parentLogs.push({ level: "warn", message: msg, args }),
			error: (msg, ...args) => parentLogs.push({ level: "error", message: msg, args }),
		};

		const redactedLogger = createRedactedLogger(parentLogger, {
			paths: ["password"],
		});

		redactedLogger.info("sensitive message with password word");

		expect(parentLogs[0].message).toBe("sensitive message with password word");
	});

	test("handles non-object args gracefully", () => {
		const parentLogs: { level: string; message: string; args: unknown[] }[] = [];
		const parentLogger: Logger = {
			debug: (msg, ...args) => parentLogs.push({ level: "debug", message: msg, args }),
			info: (msg, ...args) => parentLogs.push({ level: "info", message: msg, args }),
			warn: (msg, ...args) => parentLogs.push({ level: "warn", message: msg, args }),
			error: (msg, ...args) => parentLogs.push({ level: "error", message: msg, args }),
		};

		const redactedLogger = createRedactedLogger(parentLogger, {
			paths: ["password"],
		});

		redactedLogger.info("test", "string arg", 123, true);

		expect(parentLogs[0].args).toEqual(["string arg", 123, true]);
	});
});
