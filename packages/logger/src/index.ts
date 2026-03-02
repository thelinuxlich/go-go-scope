/**
 * Structured logging adapters for go-go-scope
 *
 * Provides adapters for popular logging libraries with redaction support.
 */

import type { Logger } from "go-go-scope";

/**
 * Options for redacting sensitive fields from log output
 */
export interface RedactOptions {
	/** Field paths to redact (e.g., ['password', 'user.token', 'headers.authorization']) */
	paths: string[];
	/** Replacement string for redacted values (default: '[REDACTED]') */
	censor?: string;
}

/**
 * Options for logger adapters
 */
export interface AdapterOptions {
	/** Redaction configuration for sensitive fields */
	redact?: RedactOptions;
	/** Additional context to include with every log */
	context?: Record<string, unknown>;
}

/**
 * Deep clone and redact sensitive fields from an object
 */
function redactObject(obj: unknown, paths: string[], censor: string): unknown {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (obj instanceof Error) {
		return {
			name: obj.name,
			message: obj.message,
			stack: obj.stack,
		};
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => redactObject(item, paths, censor));
	}

	const result: Record<string, unknown> = {};
	const normalizedPaths = paths.map((p) => p.toLowerCase());

	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		// Check if this key should be redacted
		if (normalizedPaths.includes(key.toLowerCase())) {
			result[key] = censor;
		} else if (typeof value === "object" && value !== null) {
			result[key] = redactObject(value, paths, censor);
		} else {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Redact sensitive fields from log arguments
 */
function redactArgs(
	args: unknown[],
	redactOptions: RedactOptions | undefined,
): unknown[] {
	return args.map((arg) => {
		if (arg instanceof Error) {
			// Always serialize Error objects to capture name, message, stack
			return redactObject(arg, redactOptions?.paths ?? [], redactOptions?.censor ?? "[REDACTED]");
		}
		if (typeof arg === "object" && arg !== null) {
			if (!redactOptions || redactOptions.paths.length === 0) {
				return arg;
			}
			return redactObject(arg, redactOptions.paths, redactOptions.censor ?? "[REDACTED]");
		}
		return arg;
	});
}

/**
 * Pino logger interface (subset for compatibility)
 */
interface PinoLogger {
	debug: (obj: unknown, msg?: string) => void;
	info: (obj: unknown, msg?: string) => void;
	warn: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
	child: (bindings: Record<string, unknown>) => PinoLogger;
}

/**
 * Winston logger interface (subset for compatibility)
 */
interface WinstonLogger {
	debug: (message: string, ...meta: unknown[]) => void;
	info: (message: string, ...meta: unknown[]) => void;
	warn: (message: string, ...meta: unknown[]) => void;
	error: (message: string, ...meta: unknown[]) => void;
	child?: (options: Record<string, unknown>) => WinstonLogger;
}

/**
 * Adapter for Pino logger
 *
 * @example
 * ```typescript
 * import pino from 'pino'
 * import { adaptPino } from '@go-go-scope/logger'
 *
 * const pinoLogger = pino()
 * const logger = adaptPino(pinoLogger, {
 *   redact: { paths: ['password', 'token'] }
 * })
 *
 * await using s = scope({ logger })
 * ```
 */
export function adaptPino(
	pinoLogger: PinoLogger,
	options: AdapterOptions = {},
): Logger {
	const { redact, context = {} } = options;

	const logWithLevel = (
		level: "debug" | "info" | "warn" | "error",
		message: string,
		args: unknown[],
	) => {
		const redactedArgs = redactArgs(args, redact);

		// Merge context with first arg if it's an object, otherwise create new object
		const firstArg = redactedArgs[0];
		const logObject =
			typeof firstArg === "object" &&
			firstArg !== null &&
			!Array.isArray(firstArg)
				? { ...context, ...firstArg, msg: message }
				: { ...context, msg: message, args: redactedArgs };

		pinoLogger[level](logObject);
	};

	return {
		debug: (message: string, ...args: unknown[]) =>
			logWithLevel("debug", message, args),
		info: (message: string, ...args: unknown[]) =>
			logWithLevel("info", message, args),
		warn: (message: string, ...args: unknown[]) =>
			logWithLevel("warn", message, args),
		error: (message: string, ...args: unknown[]) =>
			logWithLevel("error", message, args),
	};
}

/**
 * Adapter for Winston logger
 *
 * @example
 * ```typescript
 * import winston from 'winston'
 * import { adaptWinston } from '@go-go-scope/logger'
 *
 * const winstonLogger = winston.createLogger({...})
 * const logger = adaptWinston(winstonLogger, {
 *   redact: { paths: ['password', 'token'] }
 * })
 *
 * await using s = scope({ logger })
 * ```
 */
export function adaptWinston(
	winstonLogger: WinstonLogger,
	options: AdapterOptions = {},
): Logger {
	const { redact, context = {} } = options;

	const hasContext = Object.keys(context).length > 0;
	let logger = winstonLogger;

	// Create child logger if context is provided
	if (hasContext && winstonLogger.child) {
		logger = winstonLogger.child(context);
	}

	return {
		debug: (message: string, ...args: unknown[]) => {
			logger.debug(message, ...redactArgs(args, redact));
		},
		info: (message: string, ...args: unknown[]) => {
			logger.info(message, ...redactArgs(args, redact));
		},
		warn: (message: string, ...args: unknown[]) => {
			logger.warn(message, ...redactArgs(args, redact));
		},
		error: (message: string, ...args: unknown[]) => {
			logger.error(message, ...redactArgs(args, redact));
		},
	};
}

/**
 * Create a child logger with additional context
 *
 * @example
 * ```typescript
 * const childLogger = createChildLogger(parentLogger, {
 *   scope: 'user-service',
 *   requestId: 'abc-123'
 * })
 * ```
 */
export function createChildLogger(
	parentLogger: Logger,
	context: Record<string, unknown>,
): Logger {
	return {
		debug: (message: string, ...args: unknown[]) =>
			parentLogger.debug(message, context, ...args),
		info: (message: string, ...args: unknown[]) =>
			parentLogger.info(message, context, ...args),
		warn: (message: string, ...args: unknown[]) =>
			parentLogger.warn(message, context, ...args),
		error: (message: string, ...args: unknown[]) =>
			parentLogger.error(message, context, ...args),
	};
}

/**
 * Create a logger with redaction support
 *
 * Wraps any logger to automatically redact sensitive fields.
 *
 * @example
 * ```typescript
 * import { createRedactedLogger } from '@go-go-scope/logger'
 *
 * const logger = createRedactedLogger(consoleLogger, {
 *   paths: ['password', 'creditCard', 'ssn'],
 *   censor: '***REDACTED***'
 * })
 *
 * logger.info('User login', { userId: 1, password: 'secret' })
 * // Output: User login { userId: 1, password: '***REDACTED***' }
 * ```
 */
export function createRedactedLogger(
	baseLogger: Logger,
	options: RedactOptions,
): Logger {
	return {
		debug: (message: string, ...args: unknown[]) => {
			baseLogger.debug(message, ...redactArgs(args, options));
		},
		info: (message: string, ...args: unknown[]) => {
			baseLogger.info(message, ...redactArgs(args, options));
		},
		warn: (message: string, ...args: unknown[]) => {
			baseLogger.warn(message, ...redactArgs(args, options));
		},
		error: (message: string, ...args: unknown[]) => {
			baseLogger.error(message, ...redactArgs(args, options));
		},
	};
}

// Re-export Logger type for convenience
export type { Logger } from "go-go-scope";
