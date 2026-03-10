/**
 * Logger utilities for go-go-scope - Structured logging integration
 *
 * Provides built-in logger implementations and factory functions for creating
 * loggers with different behaviors. Supports console logging, no-op logging for
 * performance-critical paths, and task-specific loggers with contextual prefixes.
 *
 * @example
 * ```typescript
 * import { scope, ConsoleLogger } from 'go-go-scope';
 *
 * // Create a scope with a custom logger
 * await using s = scope({
 *   name: 'my-service',
 *   logger: new ConsoleLogger('my-service', 'debug')
 * });
 *
 * // Use the logger in tasks
 * const [err, result] = await s.task(async ({ logger }) => {
 *   logger.info('Starting processing');
 *   logger.debug('Debug details', { extra: 'data' });
 *   return 'done';
 * });
 * ```
 */

import type { Logger } from "./types.js";

/**
 * Default console logger implementation.
 * Uses console methods with scope prefix and configurable log levels.
 *
 * Supports four log levels: debug, info, warn, error. Messages at or above
 * the configured level are output to the console.
 *
 * @example
 * ```typescript
 * import { ConsoleLogger } from 'go-go-scope';
 *
 * // Create a logger with info level (default)
 * const logger = new ConsoleLogger('api-server', 'info');
 *
 * logger.info('Server started'); // Output: [api-server] Server started
 * logger.debug('Debug info');    // Not output (below info level)
 *
 * // Create with debug level
 * const debugLogger = new ConsoleLogger('worker', 'debug');
 * debugLogger.debug('Processing item', { id: 123 }); // Output: [worker] Processing item { id: 123 }
 * ```
 */
/* #__PURE__ */
export class ConsoleLogger implements Logger {
	private prefix: string;
	private level: number;

	private static LEVELS = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	/**
	 * Creates a new ConsoleLogger instance.
	 *
	 * @param scopeName - The scope name to prefix all log messages with
	 * @param level - The minimum log level to output (default: 'info')
	 */
	constructor(
		scopeName: string,
		level: "debug" | "info" | "warn" | "error" = "info",
	) {
		this.prefix = `[${scopeName}]`;
		this.level = ConsoleLogger.LEVELS[level];
	}

	/**
	 * Logs a debug message.
	 * Only outputs if the logger's level is set to 'debug'.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.debug) {
			console.debug(`${this.prefix} ${message}`, ...args);
		}
	}

	/**
	 * Logs an info message.
	 * Only outputs if the logger's level is 'debug' or 'info'.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	info(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.info) {
			console.info(`${this.prefix} ${message}`, ...args);
		}
	}

	/**
	 * Logs a warning message.
	 * Only outputs if the logger's level is 'debug', 'info', or 'warn'.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	warn(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.warn) {
			console.warn(`${this.prefix} ${message}`, ...args);
		}
	}

	/**
	 * Logs an error message.
	 * Always outputs regardless of log level (errors have highest priority).
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	error(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.error) {
			console.error(`${this.prefix} ${message}`, ...args);
		}
	}
}

/**
 * No-op logger for when logging is disabled.
 * All logging methods do nothing, providing zero-overhead logging
 * in performance-critical paths or production environments where
 * logging is not needed.
 *
 * @example
 * ```typescript
 * import { scope, NoOpLogger } from 'go-go-scope';
 *
 * // Disable logging entirely for maximum performance
 * await using s = scope({
 *   name: 'high-perf-worker',
 *   logger: new NoOpLogger()
 * });
 *
 * // All logger calls are no-ops
 * const [err, result] = await s.task(async ({ logger }) => {
 *   logger.info('This is not logged');
 *   logger.error('Neither is this');
 *   return computeIntensiveResult();
 * });
 * ```
 */
/* #__PURE__ */
export class NoOpLogger implements Logger {
	/** No-op debug method */
	debug(): void {}
	/** No-op info method */
	info(): void {}
	/** No-op warn method */
	warn(): void {}
	/** No-op error method */
	error(): void {}
}

/**
 * Create a logger instance based on options.
 * Returns the provided logger if given, otherwise creates a ConsoleLogger
 * with the specified level, or a NoOpLogger if no level is provided.
 *
 * This is a convenience factory function used internally by scopes to
 * determine which logger implementation to use based on configuration.
 *
 * @param scopeName - The scope name for the logger prefix
 * @param logger - Optional existing logger to use instead of creating a new one
 * @param level - Optional log level for creating a ConsoleLogger
 * @returns A Logger instance (the provided logger, a new ConsoleLogger, or NoOpLogger)
 *
 * @example
 * ```typescript
 * import { createLogger, ConsoleLogger } from 'go-go-scope';
 *
 * // Use existing logger
 * const existing = new ConsoleLogger('my-app', 'debug');
 * const logger1 = createLogger('scope1', existing);
 * // Returns: existing (same instance)
 *
 * // Create console logger with level
 * const logger2 = createLogger('scope2', undefined, 'warn');
 * // Returns: ConsoleLogger with warn level
 *
 * // Create no-op logger (default when no options provided)
 * const logger3 = createLogger('scope3');
 * // Returns: NoOpLogger
 * ```
 */
/* #__PURE__ */
export function createLogger(
	scopeName: string,
	logger?: Logger,
	level?: "debug" | "info" | "warn" | "error",
): Logger {
	if (logger) return logger;
	if (level) return new ConsoleLogger(scopeName, level);
	return new NoOpLogger();
}

/**
 * Create a child logger with task context.
 * Prepends scope name, task name, and task ID to all log messages,
 * making it easy to trace logs back to specific tasks.
 *
 * If the parent logger is a NoOpLogger, it is returned directly
 * without creating a wrapper (preserving the no-op behavior).
 *
 * @param parentLogger - The parent logger to wrap
 * @param scopeName - The scope name for the prefix
 * @param taskName - The task name for the prefix
 * @param taskId - The unique task ID for the prefix
 * @returns A Logger that prefixes all messages with task context
 *
 * @example
 * ```typescript
 * import { scope, ConsoleLogger, createTaskLogger } from 'go-go-scope';
 *
 * const parentLogger = new ConsoleLogger('api', 'info');
 *
 * // Create a task-specific logger
 * const taskLogger = createTaskLogger(parentLogger, 'api', 'fetchUser', 42);
 *
 * taskLogger.info('Fetching user data');
 * // Output: [api/fetchUser#42] Fetching user data
 *
 * taskLogger.warn('Retry attempt', { attempt: 2 });
 * // Output: [api/fetchUser#42] Retry attempt { attempt: 2 }
 *
 * // Used automatically within scope.task()
 * await using s = scope({ name: 'worker', logger: parentLogger });
 *
 * s.task(async ({ logger }) => {
 *   // logger is automatically a task logger with context
 *   logger.info('Processing'); // [worker/task#1] Processing
 * });
 * ```
 */
export function createTaskLogger(
	parentLogger: Logger,
	scopeName: string,
	taskName: string,
	taskId: number,
): Logger {
	// If parent is NoOpLogger, return it directly
	if (parentLogger instanceof NoOpLogger) {
		return parentLogger;
	}

	const prefix = `[${scopeName}/${taskName}#${taskId}]`;

	return {
		debug: (message: string, ...args: unknown[]) =>
			parentLogger.debug(`${prefix} ${message}`, ...args),
		info: (message: string, ...args: unknown[]) =>
			parentLogger.info(`${prefix} ${message}`, ...args),
		warn: (message: string, ...args: unknown[]) =>
			parentLogger.warn(`${prefix} ${message}`, ...args),
		error: (message: string, ...args: unknown[]) =>
			parentLogger.error(`${prefix} ${message}`, ...args),
	};
}
