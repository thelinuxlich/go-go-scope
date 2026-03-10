/**
 * CircuitBreaker class for go-go-scope - Fault tolerance
 */

import type { CircuitBreakerOptions, CircuitState } from "./types.js";

/**
 * Event handler type for circuit breaker events.
 *
 * @param args - Variable arguments depending on the event type
 */
export type EventHandler = (...args: unknown[]) => void;

/**
 * Circuit breaker event types.
 *
 * Available events:
 * - **'stateChange'**: Emitted when the circuit state changes (fromState, toState, failureCount)
 * - **'open'**: Emitted when the circuit opens (failureCount)
 * - **'close'**: Emitted when the circuit closes
 * - **'halfOpen'**: Emitted when the circuit enters half-open state
 * - **'success'**: Emitted when a protected call succeeds
 * - **'failure'**: Emitted when a protected call fails
 * - **'thresholdAdapt'**: Emitted when adaptive threshold changes (newThreshold, errorRate)
 */
export type CircuitBreakerEvent =
	| "stateChange"
	| "open"
	| "close"
	| "halfOpen"
	| "success"
	| "failure"
	| "thresholdAdapt";

/**
 * Internal record for tracking request history.
 *
 * @internal
 */
interface RequestRecord {
	success: boolean;
	timestamp: number;
}

/**
 * Circuit Breaker implementation for fault tolerance.
 *
 * The circuit breaker pattern prevents cascading failures by stopping requests
 * to a failing service. It operates in three states:
 *
 * - **Closed**: Normal operation, requests pass through
 * - **Open**: Service is failing, requests fail fast without calling the service
 * - **Half-Open**: Testing if the service has recovered, limited requests allowed
 *
 * Features:
 * - Automatic state transitions based on failure thresholds
 * - Configurable reset timeout
 * - Sliding window for failure tracking
 * - Adaptive thresholds based on error rates
 * - Event subscriptions for monitoring
 * - Success threshold for recovery confirmation
 *
 * Created automatically when `circuitBreaker` options are passed to {@link scope}.
 * Can also be used standalone for custom circuit breaking logic.
 *
 * @example
 * ```typescript
 * await using s = scope({
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     resetTimeout: 10000
 *   }
 * });
 *
 * // All tasks in this scope are protected by the circuit breaker
 * const result = await s.task(async ({ signal }) => {
 *   return await fetchData(signal);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Standalone usage
 * const cb = new CircuitBreaker({
 *   failureThreshold: 3,
 *   resetTimeout: 5000,
 *   successThreshold: 2 // Need 2 successes to close from half-open
 * });
 *
 * try {
 *   const data = await cb.execute(async (signal) => {
 *     return await unreliableApi.call(signal);
 *   });
 * } catch (error) {
 *   if (error.message === 'Circuit breaker is open') {
 *     console.log('Service temporarily unavailable');
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Monitoring circuit state
 * cb.on('stateChange', (from, to, failures) => {
 *   console.log(`Circuit: ${from} -> ${to} (failures: ${failures})`);
 * });
 *
 * cb.on('open', (failures) => {
 *   alertEngineer(`Circuit opened after ${failures} failures`);
 * });
 *
 * cb.on('close', () => {
 *   console.log('Service recovered');
 * });
 * ```
 *
 * @see {@link CircuitBreakerOptions} for configuration options
 * @see {@link Scope} for automatic circuit breaker integration
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
	private eventListeners: Map<CircuitBreakerEvent, Set<EventHandler>> =
		new Map();

	/**
	 * Creates a new CircuitBreaker.
	 *
	 * @param options - Configuration options for the circuit breaker
	 * @param parentSignal - Optional AbortSignal from parent scope for cancellation support
	 *
	 * @example
	 * ```typescript
	 * // Basic configuration
	 * const cb = new CircuitBreaker({
	 *   failureThreshold: 5,    // Open after 5 failures
	 *   resetTimeout: 30000     // Try again after 30 seconds
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Advanced configuration with sliding window
	 * const cb = new CircuitBreaker({
	 *   failureThreshold: 5,
	 *   resetTimeout: 30000,
	 *   successThreshold: 3,    // Need 3 successes to close
	 *   advanced: {
	 *     slidingWindow: true,
	 *     slidingWindowSizeMs: 60000,  // Count failures in last 60s
	 *     adaptiveThreshold: true,      // Auto-adjust threshold
	 *     minThreshold: 2,
	 *     maxThreshold: 10
	 *   }
	 * });
	 * ```
	 */
	constructor(
		options: CircuitBreakerOptions = {},
		private parentSignal?: AbortSignal,
	) {
		this._failureThreshold = options.failureThreshold ?? 5;
		this._resetTimeout = options.resetTimeout ?? 30000;
		this._successThreshold = options.successThreshold ?? 1;

		// Advanced options are nested under the 'advanced' property
		this._adaptiveThreshold = options.advanced?.adaptiveThreshold ?? false;
		this._minThreshold = options.advanced?.minThreshold ?? 2;
		this._maxThreshold = options.advanced?.maxThreshold ?? 10;
		this._errorRateWindowMs = options.advanced?.errorRateWindowMs ?? 60000;
		this._slidingWindow = options.advanced?.slidingWindow ?? false;
		this._slidingWindowSizeMs = options.advanced?.slidingWindowSizeMs ?? 60000;

		// Store hooks for later use
		this.hooks = options;
	}

	/**
	 * Get the current adaptive failure threshold based on error rate.
	 *
	 * When adaptive threshold is enabled, the threshold decreases as the
	 * error rate increases, making the circuit more sensitive during
	 * periods of instability.
	 *
	 * @returns The adaptive failure threshold
	 * @internal
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
			this.hooks.advanced?.onThresholdAdapt?.(adaptiveThreshold, errorRate);
			this.emit("thresholdAdapt", adaptiveThreshold, errorRate);
		}

		return Math.max(this._minThreshold, adaptiveThreshold);
	}

	/**
	 * Get the current failure count within the sliding window.
	 *
	 * If sliding window is disabled, returns the cumulative failure count.
	 *
	 * @returns Number of failures in the current window
	 * @internal
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
	 *
	 * If the circuit is open, throws immediately without calling the function.
	 * If the circuit is half-open, allows the call but tracks success/failure.
	 * If the circuit is closed, calls the function normally.
	 *
	 * @typeParam T - Return type of the function
	 * @param fn - Function to execute with circuit breaker protection
	 * @returns Promise that resolves to the function's return value
	 * @throws {Error} If the circuit is open (message: 'Circuit breaker is open')
	 * @throws {unknown} Any error thrown by the function or parent signal abort
	 *
	 * @example
	 * ```typescript
	 * const cb = new CircuitBreaker({ failureThreshold: 3 });
	 *
	 * try {
	 *   const result = await cb.execute(async (signal) => {
	 *     const response = await fetch('/api/data', { signal });
	 *     if (!response.ok) throw new Error('API error');
	 *     return await response.json();
	 *   });
	 *   console.log('Data:', result);
	 * } catch (error) {
	 *   if (error.message === 'Circuit breaker is open') {
	 *     console.log('Service is down, using cached data');
	 *   } else {
	 *     console.log('Request failed:', error);
	 *   }
	 * }
	 * ```
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
	 *
	 * This is a computed property that checks if the circuit should
	 * transition from open to half-open based on the reset timeout.
	 *
	 * @returns The current circuit state: 'closed', 'open', or 'half-open'
	 *
	 * @example
	 * ```typescript
	 * const cb = new CircuitBreaker();
	 *
	 * console.log(cb.currentState); // 'closed'
	 *
	 * // After failures...
	 * console.log(cb.currentState); // 'open'
	 *
	 * // After reset timeout...
	 * console.log(cb.currentState); // 'half-open'
	 * ```
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
	 *
	 * If sliding window is enabled, returns failures within the window.
	 * Otherwise, returns the cumulative failure count.
	 *
	 * @returns Number of failures
	 */
	get failureCount(): number {
		return this.getFailureCount();
	}

	/**
	 * Get the current consecutive success count.
	 *
	 * This tracks successes in the half-open state. When this count
	 * reaches the success threshold, the circuit closes.
	 *
	 * @returns Number of consecutive successes in half-open state
	 */
	get successCount(): number {
		return this.successes;
	}

	/**
	 * Get the failure threshold.
	 *
	 * If adaptive threshold is enabled, returns the dynamically
	 * calculated threshold based on current error rates.
	 *
	 * @returns The failure threshold
	 */
	get failureThreshold(): number {
		if (this._adaptiveThreshold) {
			return this.getAdaptiveThreshold();
		}
		return this._failureThreshold;
	}

	/**
	 * Get the success threshold for closing from half-open state.
	 *
	 * @returns Number of consecutive successes needed to close the circuit
	 */
	get successThreshold(): number {
		return this._successThreshold;
	}

	/**
	 * Get the reset timeout in milliseconds.
	 *
	 * After this timeout, an open circuit transitions to half-open.
	 *
	 * @returns Reset timeout in milliseconds
	 */
	get resetTimeout(): number {
		return this._resetTimeout;
	}

	/**
	 * Check if adaptive threshold is enabled.
	 *
	 * @returns true if adaptive threshold is enabled
	 */
	get isAdaptiveEnabled(): boolean {
		return this._adaptiveThreshold;
	}

	/**
	 * Check if sliding window is enabled.
	 *
	 * @returns true if sliding window failure tracking is enabled
	 */
	get isSlidingWindowEnabled(): boolean {
		return this._slidingWindow;
	}

	/**
	 * Get the current error rate (for adaptive threshold mode).
	 *
	 * Returns the ratio of failures to total requests within the
	 * error rate window. Returns 0 if no requests in window.
	 *
	 * @returns Error rate between 0 and 1
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
	 *
	 * This clears all failure counts and transitions to the closed state.
	 * Use this when you know the underlying service has recovered.
	 *
	 * @example
	 * ```typescript
	 * const cb = new CircuitBreaker();
	 *
	 * // Circuit opens due to failures
	 * console.log(cb.currentState); // 'open'
	 *
	 * // Manually reset after confirming service is healthy
	 * cb.reset();
	 * console.log(cb.currentState); // 'closed'
	 * ```
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
	 *
	 * Resets the circuit and clears all event listeners.
	 *
	 * @returns Promise that resolves when disposal is complete
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		this.reset();
		this.eventListeners.clear();
	}

	/**
	 * Subscribe to a circuit breaker event.
	 *
	 * @param event - Event name to subscribe to:
	 *   - 'stateChange': Circuit state changed
	 *   - 'open': Circuit opened
	 *   - 'close': Circuit closed
	 *   - 'halfOpen': Circuit entered half-open state
	 *   - 'success': Protected call succeeded
	 *   - 'failure': Protected call failed
	 *   - 'thresholdAdapt': Adaptive threshold changed
	 * @param handler - Event handler function
	 * @returns Unsubscribe function - call this to remove the subscription
	 *
	 * @example
	 * ```typescript
	 * const cb = new CircuitBreaker();
	 *
	 * // Subscribe to state changes
	 * const unsubscribe = cb.on('stateChange', (from, to, failures) => {
	 *   console.log(`Circuit: ${from} -> ${to}`);
	 * });
	 *
	 * // Later: unsubscribe
	 * unsubscribe();
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Subscribe to open event to alert on-call
	 * cb.on('open', (failureCount) => {
	 *   pagerDuty.trigger({
	 *     severity: 'critical',
	 *     message: `Circuit opened after ${failureCount} failures`
	 *   });
	 * });
	 * ```
	 *
	 * @see {@link off} for unsubscribing without the returned function
	 * @see {@link once} for one-time subscriptions
	 */
	on(event: CircuitBreakerEvent, handler: EventHandler): () => void {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, new Set());
		}
		this.eventListeners.get(event)!.add(handler);

		// Return unsubscribe function
		return () => {
			this.eventListeners.get(event)?.delete(handler);
		};
	}

	/**
	 * Unsubscribe from a circuit breaker event.
	 *
	 * @param event - Event name to unsubscribe from
	 * @param handler - Handler function to remove (must be the same reference passed to on())
	 *
	 * @example
	 * ```typescript
	 * const handler = (failures) => console.log('Open!', failures);
	 *
	 * cb.on('open', handler);
	 * // ... later ...
	 * cb.off('open', handler);
	 * ```
	 *
	 * @see {@link on} for subscribing with automatic unsubscribe function
	 */
	off(event: CircuitBreakerEvent, handler: EventHandler): void {
		this.eventListeners.get(event)?.delete(handler);
	}

	/**
	 * Subscribe to an event once.
	 *
	 * The handler is automatically removed after the first occurrence.
	 *
	 * @param event - Event name to subscribe to
	 * @param handler - Event handler function
	 *
	 * @example
	 * ```typescript
	 * // Alert only on the first open
	 * cb.once('open', (failures) => {
	 *   console.log('Circuit opened for the first time!');
	 * });
	 * ```
	 */
	once(event: CircuitBreakerEvent, handler: EventHandler): void {
		const onceHandler = (...args: unknown[]) => {
			this.off(event, onceHandler);
			handler(...args);
		};
		this.on(event, onceHandler);
	}

	/**
	 * Emit an event to all subscribers.
	 *
	 * @param event - Event to emit
	 * @param args - Arguments to pass to handlers
	 * @internal
	 */
	private emit(event: CircuitBreakerEvent, ...args: unknown[]): void {
		// Call handlers
		this.eventListeners.get(event)?.forEach((handler) => {
			try {
				handler(...args);
			} catch {
				// Ignore errors in event handlers
			}
		});
	}

	/**
	 * Handle a successful execution.
	 *
	 * @internal
	 */
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
				this.emit("stateChange", previousState, "closed", 0);
				this.emit("close");
			}
		} else if (this.state !== "closed") {
			this.state = "closed";
			this.failures = 0;
			this.successes = 0;
			this.hooks.onStateChange?.(previousState, "closed", 0);
			this.hooks.onClose?.();
			this.emit("stateChange", previousState, "closed", 0);
			this.emit("close");
		}

		this.stateExpiryTime = undefined;
		this.emit("success");
	}

	/**
	 * Handle a failed execution.
	 *
	 * @internal
	 */
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
			this.emit("stateChange", previousState, "open", currentFailures);
			this.emit("open", currentFailures);
		}

		this.emit("failure");
	}

	/**
	 * Transition from open to half-open state.
	 *
	 * @internal
	 */
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
		this.emit(
			"stateChange",
			previousState,
			"half-open",
			this.getFailureCount(),
		);
		this.emit("halfOpen");
	}
}

export type { CircuitBreakerOptions, CircuitState };
