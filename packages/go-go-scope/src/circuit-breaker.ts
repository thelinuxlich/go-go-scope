/**
 * CircuitBreaker class for go-go-scope - Fault tolerance
 */

import type { CircuitBreakerOptions, CircuitState } from "./types.js";

interface RequestRecord {
	success: boolean;
	timestamp: number;
}

/**
 * Circuit Breaker implementation.
 * Created automatically when `circuitBreaker` options are passed to `scope()`.
 * Can also be used standalone for custom circuit breaking logic.
 */
/* #__PURE__ */
export class CircuitBreaker implements AsyncDisposable {
	private state: CircuitState = "closed";
	private failures = 0;
	private successes = 0; // Consecutive successes in half-open state
	private readonly _failureThreshold: number;
	private readonly _resetTimeout: number;
	private readonly _successThreshold: number;
	private readonly _adaptiveThreshold: boolean;
	private readonly _minThreshold: number;
	private readonly _maxThreshold: number;
	private readonly _errorRateWindowMs: number;
	private readonly _slidingWindow: boolean;
	private readonly _slidingWindowSizeMs: number;
	private stateExpiryTime?: number;
	private readonly hooks: CircuitBreakerOptions;
	private requestHistory: RequestRecord[] = [];

	constructor(
		options: CircuitBreakerOptions = {},
		private parentSignal?: AbortSignal,
	) {
		this._failureThreshold = options.failureThreshold ?? 5;
		this._resetTimeout = options.resetTimeout ?? 30000;
		this._successThreshold = options.successThreshold ?? 1;
		this._adaptiveThreshold = options.adaptiveThreshold ?? false;
		this._minThreshold = options.minThreshold ?? 2;
		this._maxThreshold = options.maxThreshold ?? 10;
		this._errorRateWindowMs = options.errorRateWindowMs ?? 60000;
		this._slidingWindow = options.slidingWindow ?? false;
		this._slidingWindowSizeMs = options.slidingWindowSizeMs ?? 60000;
		this.hooks = options;
	}

	/**
	 * Get the current adaptive failure threshold based on error rate.
	 * Threshold decreases as error rate increases.
	 */
	private getAdaptiveThreshold(): number {
		if (!this._adaptiveThreshold) {
			return this._failureThreshold;
		}

		const now = Date.now();
		const windowStart = now - this._errorRateWindowMs;

		// Clean old records and count in-window
		this.requestHistory = this.requestHistory.filter(
			(r) => r.timestamp > windowStart,
		);

		if (this.requestHistory.length < 5) {
			// Not enough data, use default threshold
			return this._failureThreshold;
		}

		const failures = this.requestHistory.filter((r) => !r.success).length;
		const errorRate = failures / this.requestHistory.length;

		// Calculate adaptive threshold: higher error rate = lower threshold
		// Linear interpolation from maxThreshold at 0% error rate
		// to minThreshold at 50%+ error rate
		const clampedRate = Math.min(errorRate, 0.5);
		const normalizedRate = clampedRate / 0.5; // 0 to 1
		const adaptiveThreshold = Math.round(
			this._maxThreshold -
				normalizedRate * (this._maxThreshold - this._minThreshold),
		);

		// Notify about threshold change
		if (adaptiveThreshold !== this._failureThreshold) {
			this.hooks.onThresholdAdapt?.(adaptiveThreshold, errorRate);
		}

		return Math.max(this._minThreshold, adaptiveThreshold);
	}

	/**
	 * Get the current failure count within the sliding window.
	 * If sliding window is disabled, returns the cumulative failure count.
	 */
	private getFailureCount(): number {
		if (!this._slidingWindow) {
			return this.failures;
		}

		const now = Date.now();
		const windowStart = now - this._slidingWindowSizeMs;

		// Clean and count failures in window
		this.requestHistory = this.requestHistory.filter(
			(r) => r.timestamp > windowStart,
		);

		return this.requestHistory.filter((r) => !r.success).length;
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
				this.transitionToHalfOpen();
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
	 * Get the current failure count (within sliding window if enabled).
	 */
	get failureCount(): number {
		return this.getFailureCount();
	}

	/**
	 * Get the current consecutive success count (in half-open state).
	 */
	get successCount(): number {
		return this.successes;
	}

	/**
	 * Get the failure threshold.
	 */
	get failureThreshold(): number {
		if (this._adaptiveThreshold) {
			return this.getAdaptiveThreshold();
		}
		return this._failureThreshold;
	}

	/**
	 * Get the success threshold for closing from half-open state.
	 */
	get successThreshold(): number {
		return this._successThreshold;
	}

	/**
	 * Get the reset timeout in milliseconds.
	 */
	get resetTimeout(): number {
		return this._resetTimeout;
	}

	/**
	 * Check if adaptive threshold is enabled.
	 */
	get isAdaptiveEnabled(): boolean {
		return this._adaptiveThreshold;
	}

	/**
	 * Check if sliding window is enabled.
	 */
	get isSlidingWindowEnabled(): boolean {
		return this._slidingWindow;
	}

	/**
	 * Get the current error rate (for adaptive threshold mode).
	 */
	get errorRate(): number {
		const now = Date.now();
		const windowStart = now - this._errorRateWindowMs;
		const recentRequests = this.requestHistory.filter(
			(r) => r.timestamp > windowStart,
		);
		if (recentRequests.length === 0) return 0;
		const failures = recentRequests.filter((r) => !r.success).length;
		return failures / recentRequests.length;
	}

	/**
	 * Manually reset the circuit breaker to closed state.
	 */
	reset(): void {
		this.state = "closed";
		this.failures = 0;
		this.successes = 0;
		this.stateExpiryTime = undefined;
		this.requestHistory = [];
	}

	/**
	 * Dispose the circuit breaker.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.reset();
	}

	private onSuccess(): void {
		const previousState = this.state;
		const now = Date.now();

		// Record success for sliding window and adaptive threshold
		if (this._slidingWindow || this._adaptiveThreshold) {
			this.requestHistory.push({ success: true, timestamp: now });
			// Clean old records
			const windowSize = this._adaptiveThreshold
				? this._errorRateWindowMs
				: this._slidingWindowSizeMs;
			const windowStart = now - windowSize;
			this.requestHistory = this.requestHistory.filter(
				(r) => r.timestamp > windowStart,
			);
		}

		if (this.state === "half-open") {
			this.successes++;
			// Only close after successThreshold consecutive successes
			if (this.successes >= this._successThreshold) {
				this.state = "closed";
				this.failures = 0;
				this.successes = 0;
				this.hooks.onStateChange?.(previousState, "closed", 0);
				this.hooks.onClose?.();
			}
		} else if (this.state !== "closed") {
			this.state = "closed";
			this.failures = 0;
			this.successes = 0;
			this.hooks.onStateChange?.(previousState, "closed", 0);
			this.hooks.onClose?.();
		}

		this.stateExpiryTime = undefined;
	}

	private onFailure(): void {
		const previousState = this.state;
		const now = Date.now();

		// Record failure for sliding window and adaptive threshold
		if (this._slidingWindow || this._adaptiveThreshold) {
			this.requestHistory.push({ success: false, timestamp: now });
			// Clean old records
			const windowSize = this._adaptiveThreshold
				? this._errorRateWindowMs
				: this._slidingWindowSizeMs;
			const windowStart = now - windowSize;
			this.requestHistory = this.requestHistory.filter(
				(r) => r.timestamp > windowStart,
			);
		}

		if (!this._slidingWindow) {
			this.failures++;
		}
		this.successes = 0; // Reset consecutive successes on failure

		// Use sliding window failure count if enabled
		const currentFailures = this.getFailureCount();

		const threshold = this._adaptiveThreshold
			? this.getAdaptiveThreshold()
			: this._failureThreshold;

		if (currentFailures >= threshold || this.state === "half-open") {
			this.state = "open";
			// Cache the expiry time to avoid repeated Date.now() calls
			this.stateExpiryTime = now + this._resetTimeout;
			this.hooks.onStateChange?.(previousState, "open", currentFailures);
			this.hooks.onOpen?.(currentFailures);
		}
	}

	private transitionToHalfOpen(): void {
		const previousState = this.state;
		this.state = "half-open";
		this.successes = 0;
		this.stateExpiryTime = undefined;
		this.hooks.onStateChange?.(
			previousState,
			"half-open",
			this.getFailureCount(),
		);
		this.hooks.onHalfOpen?.();
	}
}

export type { CircuitBreakerOptions, CircuitState };
