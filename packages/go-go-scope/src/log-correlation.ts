/**
 * Log Correlation for go-go-scope
 *
 * Provides automatic correlation IDs for structured logging.
 * All logs from a scope and its tasks include traceId and spanId,
 * enabling distributed tracing and request correlation across
 * async operations and service boundaries.
 *
 * Correlation IDs help track a single request or operation as it
 * flows through multiple tasks, scopes, and services, making it
 * easier to debug issues in concurrent and distributed systems.
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope({
 *   name: "api-request",
 *   logCorrelation: true,
 * });
 *
 * s.task(async ({ logger, traceId, spanId }) => {
 *   logger.info("Processing request");
 *   // Output: {"level":"info","msg":"Processing request","traceId":"abc123","spanId":"xyz789"}
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Distributed tracing across nested scopes
 * import { scope, CorrelatedLogger } from "go-go-scope";
 *
 * await using parent = scope({
 *   name: "http-server",
 *   logCorrelation: true
 * });
 *
 * // Child scope inherits parent's traceId
 * await using child = scope({
 *   name: "request-handler",
 *   parent,
 *   logCorrelation: true
 * });
 *
 * // Both scopes share the same traceId but have different spanIds
 * console.log(parent.logger instanceof CorrelatedLogger); // true
 * console.log(child.logger instanceof CorrelatedLogger);  // true
 * ```
 */

import type { Logger } from "./types.js";

/**
 * Generate a random trace ID (16 bytes hex).
 * Trace IDs are used to correlate all operations within a single
 * request or workflow across multiple scopes and services.
 *
 * Format: 32-character hexadecimal string (16 bytes)
 * Example: "4f6a95367f5f4c6e9f3e2d8b1a0c5f7e"
 *
 * @returns A 32-character hex string representing the trace ID
 *
 * @example
 * ```typescript
 * import { generateTraceId } from "go-go-scope";
 *
 * const traceId = generateTraceId();
 * console.log(traceId); // "a1b2c3d4e5f6..." (32 chars)
 *
 * // Use for manual correlation
 * const requestId = generateTraceId();
 * logger.info("Request started", { traceId: requestId });
 * ```
 */
export function generateTraceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generate a random span ID (8 bytes hex).
 * Span IDs identify a single operation (scope) within a trace.
 * Each scope in a trace hierarchy has its own unique span ID.
 *
 * Format: 16-character hexadecimal string (8 bytes)
 * Example: "7f5f4c6e9f3e2d8b"
 *
 * @returns A 16-character hex string representing the span ID
 *
 * @example
 * ```typescript
 * import { generateSpanId } from "go-go-scope";
 *
 * const spanId = generateSpanId();
 * console.log(spanId); // "a1b2c3d4e5f6..." (16 chars)
 *
 * // Parent-child relationship in logs
 * const parentSpanId = generateSpanId();
 * const childSpanId = generateSpanId();
 *
 * logger.info("Parent operation", { spanId: parentSpanId });
 * logger.info("Child operation", {
 *   spanId: childSpanId,
 *   parentSpanId: parentSpanId
 * });
 * ```
 */
export function generateSpanId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Correlation context for logging.
 * Contains identifiers that link related operations together
 * across async boundaries and service calls.
 *
 * @example
 * ```typescript
 * import { CorrelationContext } from "go-go-scope";
 *
 * const context: CorrelationContext = {
 *   traceId: "abc123...",
 *   spanId: "xyz789...",
 *   parentSpanId: "parent456...",
 *   scopeName: "user-service"
 * };
 *
 * // Propagate context to child operations
 * async function childOperation(parentContext: CorrelationContext) {
 *   const childContext: CorrelationContext = {
 *     traceId: parentContext.traceId,  // Same trace
 *     spanId: generateSpanId(),         // New span
 *     parentSpanId: parentContext.spanId,
 *     scopeName: "database-query"
 *   };
 *   // ... use childContext for logging
 * }
 * ```
 */
export interface CorrelationContext {
	/** Trace ID for the entire request/operation */
	traceId: string;
	/** Span ID for this specific scope */
	spanId: string;
	/** Parent span ID (if this is a child scope) */
	parentSpanId?: string;
	/** Scope name */
	scopeName: string;
}

/**
 * Logger that automatically includes correlation IDs.
 * Wraps a delegate logger and prepends correlation context
 * to all log messages, enabling distributed tracing.
 *
 * When no additional arguments are provided, the correlation
 * context is logged as a structured object. When arguments
 * are provided, they are passed through with the formatted message.
 *
 * @example
 * ```typescript
 * import { CorrelatedLogger, CorrelationContext, ConsoleLogger } from "go-go-scope";
 *
 * const delegate = new ConsoleLogger("my-service", "debug");
 *
 * const correlation: CorrelationContext = {
 *   traceId: "abc123def456...",
 *   spanId: "xyz789...",
 *   scopeName: "api-request"
 * };
 *
 * const logger = new CorrelatedLogger(delegate, correlation);
 *
 * // Simple message - correlation added as structured object
 * logger.info("Processing request");
 * // Output: [traceId=abc123...] [spanId=xyz789...] Processing request { traceId: "abc123...", spanId: "xyz789...", scopeName: "api-request" }
 *
 * // Message with arguments - correlation in message only
 * logger.info("User action", { userId: 123, action: "login" });
 * // Output: [traceId=abc123...] [spanId=xyz789...] User action { userId: 123, action: "login" }
 * ```
 *
 * @example
 * ```typescript
 * // Using with scope
 * import { scope } from "go-go-scope";
 *
 * await using s = scope({
 *   name: "payment-service",
 *   logCorrelation: true
 * });
 *
 * // Logger automatically includes correlation IDs
 * s.task(async ({ logger }) => {
 *   logger.info("Processing payment");
 *   // Logs include traceId and spanId automatically
 * });
 * ```
 */
export class CorrelatedLogger implements Logger {
	private correlation: CorrelationContext;
	private delegate: Logger;

	/**
	 * Creates a new CorrelatedLogger.
	 *
	 * @param delegate - The underlying logger to wrap
	 * @param correlation - The correlation context to include in all logs
	 */
	constructor(delegate: Logger, correlation: CorrelationContext) {
		this.delegate = delegate;
		this.correlation = correlation;
	}

	/**
	 * Formats a message with correlation ID prefixes.
	 *
	 * @param message - The original message
	 * @returns The formatted message with correlation prefixes
	 * @private
	 */
	private formatMessage(message: string): string {
		return `[traceId=${this.correlation.traceId}] [spanId=${this.correlation.spanId}] ${message}`;
	}

	/**
	 * Returns the correlation context as a structured object.
	 *
	 * @returns Object containing traceId, spanId, scopeName, and optionally parentSpanId
	 * @private
	 */
	private formatStructured(): Record<string, string> {
		return {
			traceId: this.correlation.traceId,
			spanId: this.correlation.spanId,
			scopeName: this.correlation.scopeName,
			...(this.correlation.parentSpanId && {
				parentSpanId: this.correlation.parentSpanId,
			}),
		};
	}

	/**
	 * Log a debug message with correlation context.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.debug(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.debug(this.formatMessage(message), ...args);
		}
	}

	/**
	 * Log an info message with correlation context.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	info(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.info(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.info(this.formatMessage(message), ...args);
		}
	}

	/**
	 * Log a warning message with correlation context.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	warn(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.warn(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.warn(this.formatMessage(message), ...args);
		}
	}

	/**
	 * Log an error message with correlation context.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	error(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.error(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.error(this.formatMessage(message), ...args);
		}
	}

	/**
	 * Get the correlation context.
	 * Returns a copy of the correlation data for inspection or propagation.
	 *
	 * @returns A copy of the correlation context
	 *
	 * @example
	 * ```typescript
	 * import { CorrelatedLogger } from "go-go-scope";
	 *
	 * const logger = new CorrelatedLogger(delegate, {
	 *   traceId: "abc123",
	 *   spanId: "xyz789",
	 *   scopeName: "my-service"
	 * });
	 *
	 * const context = logger.getCorrelationContext();
	 * console.log(context.traceId); // "abc123"
	 *
	 * // Modify the copy without affecting the logger
	 * context.traceId = "modified";
	 * console.log(logger.getCorrelationContext().traceId); // Still "abc123"
	 * ```
	 */
	getCorrelationContext(): CorrelationContext {
		return { ...this.correlation };
	}
}

/**
 * Create a correlated logger wrapper.
 * Factory function to create a CorrelatedLogger instance.
 *
 * @param delegate - The underlying logger to wrap
 * @param correlation - The correlation context to include in all logs
 * @returns A new CorrelatedLogger instance
 *
 * @example
 * ```typescript
 * import { createCorrelatedLogger, ConsoleLogger } from "go-go-scope";
 *
 * const delegate = new ConsoleLogger("payment-service", "info");
 *
 * const logger = createCorrelatedLogger(delegate, {
 *   traceId: "pay_abc123",
 *   spanId: "span_xyz789",
 *   scopeName: "process-payment"
 * });
 *
 * logger.info("Payment received");
 * // Output includes traceId and spanId
 * ```
 */
export function createCorrelatedLogger(
	delegate: Logger,
	correlation: CorrelationContext,
): CorrelatedLogger {
	return new CorrelatedLogger(delegate, correlation);
}

/**
 * Check if a logger is a CorrelatedLogger.
 * Type guard function to check the logger type at runtime.
 *
 * @param logger - The logger to check
 * @returns True if the logger is a CorrelatedLogger, false otherwise
 *
 * @example
 * ```typescript
 * import { isCorrelatedLogger, CorrelatedLogger, ConsoleLogger } from "go-go-scope";
 *
 * const correlated = new CorrelatedLogger(delegate, context);
 * const console = new ConsoleLogger("test");
 *
 * console.log(isCorrelatedLogger(correlated)); // true
 * console.log(isCorrelatedLogger(console));    // false
 *
 * // Use as type guard
 * function processLogger(logger: Logger) {
 *   if (isCorrelatedLogger(logger)) {
 *     // TypeScript knows logger is CorrelatedLogger here
 *     const context = logger.getCorrelationContext();
 *     console.log(context.traceId);
 *   }
 * }
 * ```
 */
export function isCorrelatedLogger(logger: Logger): logger is CorrelatedLogger {
	return logger instanceof CorrelatedLogger;
}

/**
 * Extract correlation context from a logger if available.
 * Safely retrieves the correlation context from any logger.
 *
 * @param logger - The logger to extract context from
 * @returns The correlation context if the logger is correlated, undefined otherwise
 *
 * @example
 * ```typescript
 * import { getCorrelationContext, scope } from "go-go-scope";
 *
 * await using s = scope({
 *   name: "my-service",
 *   logCorrelation: true
 * });
 *
 * s.task(async ({ logger }) => {
 *   const context = getCorrelationContext(logger);
 *
 *   if (context) {
 *     console.log(`Trace: ${context.traceId}`);
 *     console.log(`Span: ${context.spanId}`);
 *
 *     // Propagate to external service
 *     await callExternalAPI({
 *       headers: {
 *         "X-Trace-Id": context.traceId,
 *         "X-Span-Id": context.spanId
 *       }
 *     });
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Handling both correlated and non-correlated loggers
 * import { getCorrelationContext, ConsoleLogger } from "go-go-scope";
 *
 * function getTraceId(logger: Logger): string | undefined {
 *   return getCorrelationContext(logger)?.traceId;
 * }
 *
 * const correlatedLogger = createCorrelatedLogger(delegate, {
 *   traceId: "abc123",
 *   spanId: "xyz789",
 *   scopeName: "test"
 * });
 *
 * const plainLogger = new ConsoleLogger("test");
 *
 * console.log(getTraceId(correlatedLogger)); // "abc123"
 * console.log(getTraceId(plainLogger));      // undefined
 * ```
 */
export function getCorrelationContext(
	logger: Logger,
): CorrelationContext | undefined {
	if (isCorrelatedLogger(logger)) {
		return logger.getCorrelationContext();
	}
	return undefined;
}
