/**
 * Logger utilities for go-go-scope - Structured logging integration
 */

import type { Logger } from "./types.js";

/**
 * Default console logger implementation.
 * Uses console methods with scope prefix.
 */
export class ConsoleLogger implements Logger {
	private prefix: string;
	private level: number;

	private static LEVELS = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(
		scopeName: string,
		level: "debug" | "info" | "warn" | "error" = "info",
	) {
		this.prefix = `[${scopeName}]`;
		this.level = ConsoleLogger.LEVELS[level];
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.debug) {
			console.debug(`${this.prefix} ${message}`, ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.info) {
			console.info(`${this.prefix} ${message}`, ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.warn) {
			console.warn(`${this.prefix} ${message}`, ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		if (this.level <= ConsoleLogger.LEVELS.error) {
			console.error(`${this.prefix} ${message}`, ...args);
		}
	}
}

/**
 * No-op logger for when logging is disabled.
 */
export class NoOpLogger implements Logger {
	debug(): void {}
	info(): void {}
	warn(): void {}
	error(): void {}
}

/**
 * Create a logger instance based on options.
 */
export function createLogger(
	scopeName: string,
	logger?: Logger,
	level?: "debug" | "info" | "warn" | "error",
): Logger {
	if (logger) return logger;
	if (level) return new ConsoleLogger(scopeName, level);
	return new NoOpLogger();
}
