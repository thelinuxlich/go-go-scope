/**
 * Persistence adapters for go-go-scope
 *
 * Provides distributed locks and circuit breaker state
 * persistence across multiple database backends.
 *
 * @example
 * ```typescript
 * import { RedisAdapter } from 'go-go-scope/persistence/redis'
 * import { scope } from 'go-go-scope'
 *
 * const redis = new Redis(process.env.REDIS_URL)
 * const persistence = new RedisAdapter(redis)
 *
 * await using s = scope({ persistence })
 * using lock = await s.acquireLock('resource:123', 30000)
 * ```
 */

// Core types
export type {
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
	PersistenceProviders,
} from "./types.js";

// Note: Adapters are exported from their respective modules to avoid
// forcing users to install dependencies for adapters they don't use.

// Usage:
// import { RedisAdapter } from 'go-go-scope/persistence/redis'
// import { SQLiteAdapter } from 'go-go-scope/persistence/sqlite'
// import { PostgresAdapter } from 'go-go-scope/persistence/postgres'
// import { MySQLAdapter } from 'go-go-scope/persistence/mysql'
