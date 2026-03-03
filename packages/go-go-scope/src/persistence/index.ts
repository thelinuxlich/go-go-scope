/**
 * Persistence types for go-go-scope
 *
 * These interfaces allow features like distributed locks and circuit
 * breaker state to work across multiple processes/servers.
 *
 * Adapter packages:
 * - @go-go-scope/persistence-redis
 * - @go-go-scope/persistence-postgres
 * - @go-go-scope/persistence-mysql
 * - @go-go-scope/persistence-sqlite
 * - @go-go-scope/persistence-dynamodb
 *
 * @example
 * ```typescript
 * import { RedisAdapter } from '@go-go-scope/persistence-redis'
 * import { scope, Lock } from 'go-go-scope'
 *
 * const redis = new Redis(process.env.REDIS_URL)
 * const persistence = new RedisAdapter(redis)
 *
 * await using s = scope({ persistence })
 *
 * // Acquire a distributed lock with 30 second TTL
 * const lock = new Lock(s.signal, {
 *   provider: s.persistence?.lock,
 *   key: 'resource:123',
 *   ttl: 30000,
 * })
 * await using guard = await lock.acquire()
 * // Lock automatically released when guard is disposed
 * ```
 */

// Core types
export type {
	CacheProvider,
	CacheStats,
	Checkpoint,
	CheckpointProvider,
	CircuitBreakerPersistedState,
	CircuitBreakerStateProvider,
	IdempotencyProvider,
	LockHandle,
	LockProvider,
	PersistenceAdapter,
	PersistenceAdapterOptions,
	PersistenceProviders,
} from "./types.js";
