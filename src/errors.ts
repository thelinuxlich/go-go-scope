/**
 * Built-in error classes for go-go-scope
 */

/**
 * UnknownError - A catch-all error class for system/infrastructure errors.
 *
 * Used as the default for `systemErrorClass` to wrap untagged (non-business)
 * errors. Has a `_tag` property for consistency with taggedError-style errors.
 *
 * @example
 * ```typescript
 * import { scope, UnknownError } from 'go-go-scope'
 *
 * const [err, data] = await s.task(() => fetchData())
 * if (err instanceof UnknownError) {
 *   // System error (network, timeout, etc.)
 *   console.error('System failure:', err.message)
 * }
 * ```
 */
export class UnknownError extends Error {
	readonly _tag = "UnknownError" as const;

	constructor(
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "UnknownError";
	}
}
