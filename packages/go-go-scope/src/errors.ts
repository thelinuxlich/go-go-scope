/**
 * Built-in error classes for go-go-scope
 *
 * Provides specialized error types for different failure scenarios
 * in concurrent operations. Each error class has a `_tag` property
 * for type-safe error handling and discrimination.
 */

/**
 * UnknownError - A catch-all error class for system/infrastructure errors.
 *
 * Used as the default for `systemErrorClass` to wrap untagged (non-business)
 * errors. Has a `_tag` property for consistency with taggedError-style errors.
 *
 * This error is typically thrown when:
 * - Network requests fail
 * - Database connections timeout
 * - Unexpected exceptions occur in task execution
 * - Errors don't have a `_tag` property (indicating they're not business errors)
 *
 * @example
 * ```typescript
 * import { scope, UnknownError } from 'go-go-scope'
 *
 * await using s = scope()
 *
 * const [err, data] = await s.task(() => fetchData())
 * if (err instanceof UnknownError) {
 *   // System error (network, timeout, etc.)
 *   console.error('System failure:', err.message)
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using with custom error class for typed error handling
 * import { taggedError } from 'go-go-try'
 *
 * const DatabaseError = taggedError('DatabaseError')
 *
 * await using s = scope({
 *   systemErrorClass: DatabaseError  // Wraps unknown errors in DatabaseError
 * })
 *
 * const [err, user] = await s.task(() => db.query('SELECT * FROM users'))
 * if (err) {
 *   // err is DatabaseError (system error) or a tagged business error
 *   console.error(err._tag) // 'DatabaseError' for system failures
 * }
 * ```
 */
/* #__PURE__ */
export class UnknownError extends Error {
	/** Discriminator tag for type-safe error handling */
	readonly _tag = "UnknownError" as const;

	/**
	 * Creates a new UnknownError.
	 *
	 * @param message - The error message describing what went wrong
	 * @param options - Optional error options including the cause
	 * @param options.cause - The original error that caused this error (for error chaining)
	 */
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "UnknownError";
	}
}

/**
 * AbortError - Internal marker for abort signal reasons.
 *
 * Used to distinguish abort reasons from user-thrown errors.
 * The reason is preserved and re-thrown without wrapping.
 *
 * This error is thrown when:
 * - A task is cancelled via AbortSignal
 * - A scope is disposed while tasks are running
 * - A timeout is reached and the task is aborted
 * - A parent scope signals cancellation to child tasks
 *
 * @example
 * ```typescript
 * import { scope, AbortError } from 'go-go-scope'
 *
 * await using s = scope({ timeout: 5000 })
 *
 * const [err, result] = await s.task(async ({ signal }) => {
 *   await longRunningOperation(signal)
 *   return 'completed'
 * })
 *
 * if (err instanceof AbortError) {
 *   console.log('Task was aborted:', err.reason)
 *   // err.reason contains the original abort reason (e.g., timeout message)
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Handling cancellation in a task
 * await using s = scope()
 *
 * const [err, data] = await s.task(async ({ signal }) => {
 *   return new Promise((resolve, reject) => {
 *     const timeout = setTimeout(() => resolve('done'), 10000)
 *
 *     signal.addEventListener('abort', () => {
 *       clearTimeout(timeout)
 *       reject(new Error('Cancelled by user'))
 *     })
 *   })
 * })
 *
 * // Dispose the scope to trigger cancellation
 * await s[Symbol.asyncDispose]()
 * ```
 */
/* #__PURE__ */
export class AbortError extends Error {
	/** Discriminator tag for type-safe error handling */
	readonly _tag = "AbortError" as const;

	/** The original abort reason (can be any value passed to AbortController.abort()) */
	readonly reason: unknown;

	/**
	 * Creates a new AbortError.
	 *
	 * @param reason - The abort reason (typically a string or Error)
	 */
	constructor(reason: unknown) {
		super(typeof reason === "string" ? reason : "aborted");
		this.name = "AbortError";
		this.reason = reason;
	}
}

/**
 * ChannelFullError - Error thrown when channel buffer is full with 'error' backpressure strategy.
 *
 * This error is thrown by {@link Channel.send} when:
 * - The channel's buffer is at capacity
 * - The backpressure strategy is set to 'error'
 * - A new value cannot be buffered
 *
 * Use this error to implement load shedding - rejecting new work when
 * the system is at capacity rather than blocking or dropping data.
 *
 * @example
 * ```typescript
 * import { scope, ChannelFullError } from 'go-go-scope'
 *
 * await using s = scope()
 *
 * // Create a channel with error backpressure
 * const ch = s.channel<number>(1, { backpressure: 'error' })
 *
 * await ch.send(1) // succeeds, buffer now has 1 item
 *
 * try {
 *   await ch.send(2) // throws ChannelFullError (capacity exceeded)
 * } catch (err) {
 *   if (err instanceof ChannelFullError) {
 *     console.log('Channel buffer is full - implement load shedding')
 *     // Handle the backpressure (e.g., return 503 Service Unavailable)
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Implementing a load-shedding API endpoint
 * import { scope, ChannelFullError } from 'go-go-scope'
 *
 * const requestChannel = scope().channel<Request>(100, {
 *   backpressure: 'error'
 * })
 *
 * async function handleApiRequest(req: Request) {
 *   try {
 *     await requestChannel.send(req)
 *     return { status: 202, body: 'Accepted' }
 *   } catch (err) {
 *     if (err instanceof ChannelFullError) {
 *       return { status: 503, body: 'Service Unavailable - try again later' }
 *     }
 *     throw err
 *   }
 * }
 * ```
 */
/* #__PURE__ */
export class ChannelFullError extends Error {
	/** Discriminator tag for type-safe error handling */
	readonly _tag = "ChannelFullError" as const;

	/**
	 * Creates a new ChannelFullError.
	 *
	 * @param message - Optional custom error message (default: "Channel buffer is full")
	 */
	constructor(message = "Channel buffer is full") {
		super(message);
		this.name = "ChannelFullError";
	}
}
