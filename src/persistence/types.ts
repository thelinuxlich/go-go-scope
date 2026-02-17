/**
 * Persistence provider interfaces for go-go-scope
 *
 * These interfaces allow features like distributed locks and circuit
 * breaker state to work across multiple processes/servers.
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
	/** Whether to create tables on connect (MySQL adapter only) */
	createTables?: boolean;
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
