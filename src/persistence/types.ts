/**
 * Persistence provider interfaces for go-go-scope
 *
 * These interfaces allow features like distributed locks, rate limiting,
 * and circuit breakers to work across multiple processes/servers.
 */

/**
 * Distributed lock provider interface
 */
export interface LockProvider {
	/**
	 * Attempt to acquire a lock
	 * @param key - Unique lock identifier
	 * @param ttl - Time-to-live in milliseconds (lock expires after this)
	 * @param owner - Optional owner identifier (for lock extension)
	 * @returns Lock handle if acquired, null if lock is held by another owner
	 */
	acquire(key: string, ttl: number, owner?: string): Promise<LockHandle | null>;

	/**
	 * Extend an existing lock's TTL
	 * @param key - Lock identifier
	 * @param ttl - New TTL in milliseconds
	 * @param owner - Owner identifier (must match original owner)
	 * @returns true if extended, false if lock expired or owner mismatch
	 */
	extend(key: string, ttl: number, owner: string): Promise<boolean>;

	/**
	 * Force release a lock (use with caution - can release another owner's lock)
	 * @param key - Lock identifier
	 */
	forceRelease(key: string): Promise<void>;
}

/**
 * Handle to an acquired lock
 */
export interface LockHandle {
	/** Release the lock */
	release(): Promise<void>;

	/** Extend the lock TTL */
	extend(ttl: number): Promise<boolean>;

	/** Check if lock is still valid */
	isValid(): Promise<boolean>;
}

/**
 * Rate limit provider interface (sliding window algorithm)
 */
export interface RateLimitProvider {
	/**
	 * Check if request is allowed and increment counter
	 * @param key - Rate limit bucket key (e.g., "user:123" or "ip:1.2.3.4")
	 * @param config - Rate limit configuration
	 * @returns Result with allowed status and remaining quota
	 */
	checkAndIncrement(
		key: string,
		config: RateLimitConfig,
	): Promise<RateLimitResult>;

	/**
	 * Reset rate limit counter for a key
	 * @param key - Rate limit bucket key
	 */
	reset(key: string): Promise<void>;

	/**
	 * Get current count without incrementing
	 * @param key - Rate limit bucket key
	 * @param windowMs - Time window in milliseconds
	 */
	getCount(key: string, windowMs: number): Promise<number>;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
	/** Maximum requests allowed in the window */
	max: number;
	/** Time window in milliseconds */
	windowMs: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Remaining quota in current window */
	remaining: number;
	/** Total quota for the window */
	limit: number;
	/** Milliseconds until the window resets */
	resetTimeMs: number;
}

/**
 * Circuit breaker state provider interface
 */
export interface CircuitBreakerStateProvider {
	/**
	 * Get current state for a circuit breaker
	 * @param key - Circuit breaker identifier
	 */
	getState(key: string): Promise<CircuitBreakerPersistedState | null>;

	/**
	 * Update circuit breaker state
	 * @param key - Circuit breaker identifier
	 * @param state - New state
	 */
	setState(key: string, state: CircuitBreakerPersistedState): Promise<void>;

	/**
	 * Record a failure
	 * @param key - Circuit breaker identifier
	 * @param maxFailures - Maximum failures before opening circuit
	 * @returns New failure count
	 */
	recordFailure(key: string, maxFailures: number): Promise<number>;

	/**
	 * Record a success (reset failures)
	 * @param key - Circuit breaker identifier
	 */
	recordSuccess(key: string): Promise<void>;

	/**
	 * Subscribe to state changes (optional - for distributed notifications)
	 * @param key - Circuit breaker identifier
	 * @param callback - Called when state changes
	 */
	subscribe?(
		key: string,
		callback: (state: CircuitBreakerPersistedState) => void,
	): () => void;
}

/**
 * Circuit breaker persisted state
 */
export interface CircuitBreakerPersistedState {
	state: "closed" | "open" | "half-open";
	failureCount: number;
	lastFailureTime?: number;
	lastSuccessTime?: number;
}

/**
 * Combined persistence providers
 */
export interface PersistenceProviders {
	/** Distributed lock provider */
	lock?: LockProvider;
	/** Rate limit provider */
	rateLimit?: RateLimitProvider;
	/** Circuit breaker state provider */
	circuitBreaker?: CircuitBreakerStateProvider;
}

/**
 * Options for persistence adapter
 */
export interface PersistenceAdapterOptions {
	/** Key prefix for all operations (for namespacing) */
	keyPrefix?: string;
	/** Default TTL for locks in milliseconds */
	defaultLockTTL?: number;
}

/**
 * Base interface for all persistence adapters
 */
export interface PersistenceAdapter {
	/** Connect to the underlying database */
	connect?(): Promise<void>;
	/** Disconnect from the underlying database */
	disconnect?(): Promise<void>;
	/** Check if adapter is connected */
	isConnected?(): boolean;
}
