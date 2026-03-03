/**
 * Log Correlation for go-go-scope
 *
 * Provides automatic correlation IDs for structured logging.
 * All logs from a scope and its tasks include traceId and spanId.
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
 */

import type { Logger } from "./types.js";

/**
 * Generate a random trace ID (16 bytes hex)
 */
export function generateTraceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generate a random span ID (8 bytes hex)
 */
export function generateSpanId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Correlation context for logging
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
 * Logger that automatically includes correlation IDs
 */
export class CorrelatedLogger implements Logger {
	private correlation: CorrelationContext;
	private delegate: Logger;

	constructor(delegate: Logger, correlation: CorrelationContext) {
		this.delegate = delegate;
		this.correlation = correlation;
	}

	private formatMessage(message: string): string {
		return `[traceId=${this.correlation.traceId}] [spanId=${this.correlation.spanId}] ${message}`;
	}

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

	debug(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.debug(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.debug(this.formatMessage(message), ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.info(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.info(this.formatMessage(message), ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.warn(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.warn(this.formatMessage(message), ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		if (args.length === 0) {
			this.delegate.error(this.formatMessage(message), this.formatStructured());
		} else {
			this.delegate.error(this.formatMessage(message), ...args);
		}
	}

	/**
	 * Get the correlation context
	 */
	getCorrelationContext(): CorrelationContext {
		return { ...this.correlation };
	}
}

/**
 * Create a correlated logger wrapper
 */
export function createCorrelatedLogger(
	delegate: Logger,
	correlation: CorrelationContext,
): CorrelatedLogger {
	return new CorrelatedLogger(delegate, correlation);
}

/**
 * Check if a logger is a CorrelatedLogger
 */
export function isCorrelatedLogger(logger: Logger): logger is CorrelatedLogger {
	return logger instanceof CorrelatedLogger;
}

/**
 * Extract correlation context from a logger if available
 */
export function getCorrelationContext(
	logger: Logger,
): CorrelationContext | undefined {
	if (isCorrelatedLogger(logger)) {
		return logger.getCorrelationContext();
	}
	return undefined;
}
