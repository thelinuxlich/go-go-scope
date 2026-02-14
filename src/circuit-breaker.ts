/**
 * CircuitBreaker class for go-go-scope - Fault tolerance
 */

import type { CircuitBreakerOptions, CircuitState } from "./types.js";

/**
 * Circuit Breaker implementation.
 * Created automatically when `circuitBreaker` options are passed to `scope()`.
 * Can also be used standalone for custom circuit breaking logic.
 */
export class CircuitBreaker implements AsyncDisposable {
	private state: CircuitState = "closed";
	private failures = 0;
	private readonly _failureThreshold: number;
	private readonly _resetTimeout: number;
	private stateExpiryTime?: number; // Cache when open state should transition to half-open

	constructor(
		options: CircuitBreakerOptions = {},
		private parentSignal?: AbortSignal,
	) {
		this._failureThreshold = options.failureThreshold ?? 5;
		this._resetTimeout = options.resetTimeout ?? 30000;
	}

	/**
	 * Execute a function with circuit breaker protection.
	 * @throws Error if circuit is open
	 * @throws Error from the function if it fails
	 */
	async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
		if (this.parentSignal?.aborted) {
			throw this.parentSignal.reason;
		}

		// Check if we should transition from open to half-open (cached check)
		if (this.state === "open") {
			const now = Date.now();
			if (this.stateExpiryTime && now >= this.stateExpiryTime) {
				this.state = "half-open";
				this.stateExpiryTime = undefined;
			} else {
				throw new Error("Circuit breaker is open");
			}
		}

		try {
			const controller = new AbortController();

			// Link to parent signal
			if (this.parentSignal) {
				this.parentSignal.addEventListener(
					"abort",
					() => controller.abort(this.parentSignal?.reason),
					{ once: true },
				);
			}

			const result = await fn(controller.signal);

			// Success - reset circuit
			this.onSuccess();
			return result;
		} catch (error) {
			// Failure - record and possibly open circuit
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Get the current state of the circuit breaker.
	 */
	get currentState(): CircuitState {
		if (this.state === "open") {
			// Check if we should transition to half-open (cached check)
			const now = Date.now();
			if (this.stateExpiryTime && now >= this.stateExpiryTime) {
				return "half-open";
			}
		}
		return this.state;
	}

	/**
	 * Get the current failure count.
	 */
	get failureCount(): number {
		return this.failures;
	}

	/**
	 * Get the failure threshold.
	 */
	get failureThreshold(): number {
		return this._failureThreshold;
	}

	/**
	 * Get the reset timeout in milliseconds.
	 */
	get resetTimeout(): number {
		return this._resetTimeout;
	}

	/**
	 * Manually reset the circuit breaker to closed state.
	 */
	reset(): void {
		this.state = "closed";
		this.failures = 0;
		this.stateExpiryTime = undefined;
	}

	/**
	 * Dispose the circuit breaker.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.reset();
	}

	private onSuccess(): void {
		this.failures = 0;
		this.state = "closed";
		this.stateExpiryTime = undefined;
	}

	private onFailure(): void {
		this.failures++;
		const now = Date.now();

		if (this.failures >= this._failureThreshold || this.state === "half-open") {
			this.state = "open";
			// Cache the expiry time to avoid repeated Date.now() calls
			this.stateExpiryTime = now + this._resetTimeout;
		}
	}
}

export type { CircuitBreakerOptions, CircuitState };
