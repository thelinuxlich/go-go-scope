/**
 * Unified Lock API for go-go-scope
 *
 * A flexible lock that can operate as:
 * - Exclusive lock (mutex) - single holder
 * - Read-write lock - multiple readers OR one writer
 * - In-memory (fast, single-process) or distributed (multi-process with persistence)
 *
 * For distributed locking across multiple processes/servers, provide a persistence
 * provider (Redis, PostgreSQL, etc.) from @go-go-scope/persistence-* packages.
 *
 * @module lock
 *
 * @example
 * ```typescript
 * import { scope, Lock } from "go-go-scope";
 * import { RedisAdapter } from "@go-go-scope/persistence-redis";
 *
 * await using s = scope();
 *
 * // In-memory exclusive lock (mutex)
 * const mutex = new Lock(s.signal);
 * await using guard = await mutex.acquire();
 * // Critical section - only one holder at a time
 *
 * // In-memory read-write lock
 * const rwlock = new Lock(s.signal, { allowMultipleReaders: true });
 * await using readGuard = await rwlock.read();
 * // Multiple readers can hold this simultaneously
 * await using writeGuard = await rwlock.write();
 * // Exclusive write access - no other readers or writers
 *
 * // Distributed lock (requires persistence provider)
 * const distLock = new Lock(s.signal, {
 *   provider: new RedisAdapter(redis),
 *   key: "resource:123",
 *   ttl: 30000,
 * });
 * await using guard = await distLock.acquire();
 * // Lock is visible across all processes
 * ```
 */

import createDebug from "debug";
import type { LockProvider } from "./persistence/types.js";

const debugLock = createDebug("go-go-scope:lock");

/**
 * Configuration options for creating a {@link Lock} instance.
 *
 * These options determine whether the lock operates in exclusive mode,
 * read-write mode, or distributed mode.
 */
export interface LockOptions {
	/**
	 * Persistence provider for distributed locking.
	 *
	 * When provided, the lock operates in distributed mode and uses
	 * the persistence provider to coordinate across multiple processes.
	 *
	 * Requires: {@link key} must also be specified.
	 *
	 * @example
	 * ```typescript
	 * import { RedisAdapter } from "@go-go-scope/persistence-redis";
	 *
	 * const lock = new Lock(s.signal, {
	 *   provider: new RedisAdapter(redis),
	 *   key: "my-resource",
	 *   ttl: 30000
	 * });
	 * ```
	 */
	provider?: LockProvider;

	/**
	 * Unique key for distributed locks.
	 *
	 * Required when using a persistence provider. All processes using
	 * the same key will compete for the same lock.
	 *
	 * @example
	 * ```typescript
	 * // All instances using "payment:123" compete for same lock
	 * key: "payment:123"
	 * ```
	 */
	key?: string;

	/**
	 * Lock TTL (time-to-live) in milliseconds for distributed locks.
	 *
	 * The lock will automatically expire after this time if not released.
	 * The lock is automatically extended while held (at 60% of TTL).
	 *
	 * @default 30000 (30 seconds)
	 */
	ttl?: number;

	/**
	 * Owner identifier for distributed locks.
	 *
	 * Used to identify which process holds the lock. Should be unique
	 * across all processes. A random value is generated if not specified.
	 *
	 * @default Random string
	 */
	owner?: string;

	/**
	 * Allow multiple simultaneous readers (read-write lock mode).
	 *
	 * When `true`, the lock supports {@link Lock.read} and {@link Lock.write} methods.
	 * When `false` (default), only {@link Lock.acquire} is available (mutex mode).
	 *
	 * @default false
	 */
	allowMultipleReaders?: boolean;

	/**
	 * Name for debugging purposes.
	 *
	 * Used in debug logs to identify this lock instance.
	 *
	 * @default Random string
	 */
	name?: string;
}

/**
 * Options for acquiring a lock.
 */
export interface LockAcquireOptions {
	/**
	 * Timeout in milliseconds for lock acquisition.
	 *
	 * If the lock cannot be acquired within this time, an error is thrown.
	 *
	 * @default No timeout (wait indefinitely)
	 */
	timeout?: number;

	/**
	 * Priority for lock acquisition (higher =优先/priority).
	 *
	 * Higher priority requests are granted the lock before lower priority ones.
	 *
	 * @default 0
	 */
	priority?: number;

	/**
	 * Polling interval for distributed locks.
	 *
	 * How often to retry acquiring a distributed lock.
	 *
	 * @default 100ms
	 */
	pollInterval?: number;
}

/**
 * A lock guard that releases the lock when disposed.
 *
 * This class implements both `Disposable` and `AsyncDisposable` for use with
 * the `using` and `await using` statements. The lock is automatically released
 * when the guard goes out of scope.
 *
 * @implements {Disposable}
 * @implements {AsyncDisposable}
 *
 * @example
 * ```typescript
 * const lock = new Lock(s.signal);
 *
 * // Automatic release with await using
 * await using guard = await lock.acquire();
 * // Lock is held here
 * // ... critical section ...
 * // Lock automatically released when guard goes out of scope
 *
 * // Manual release
 * const guard = await lock.acquire();
 * try {
 *   // ... critical section ...
 * } finally {
 *   await guard.release();
 * }
 * ```
 */
export class LockGuard implements Disposable, AsyncDisposable {
	private released = false;
	private releaseFn: (() => void) | (() => Promise<void>);
	private isAsync: boolean;

	/**
	 * Creates a new LockGuard instance.
	 * @internal
	 */
	constructor(
		releaseFn: () => void | Promise<void>,
		isAsync: boolean,
		private readonly type: "read" | "write" | "exclusive",
		private readonly name: string,
	) {
		this.releaseFn = releaseFn;
		this.isAsync = isAsync;

		if (debugLock.enabled) {
			debugLock("[%s] Acquired %s lock", name, type);
		}
	}

	/**
	 * Releases the lock manually.
	 *
	 * This can be called explicitly to release the lock before the guard
	 * goes out of scope. Throws an error if the lock has already been released.
	 *
	 * @returns Promise that resolves when the lock is released
	 * @throws Error if the lock has already been released
	 *
	 * @example
	 * ```typescript
	 * const guard = await lock.acquire();
	 * await guard.release(); // Explicit release
	 * ```
	 */
	async release(): Promise<void> {
		if (this.released) {
			throw new Error(`${this.type} lock already released`);
		}
		this.released = true;

		if (this.isAsync) {
			await (this.releaseFn as () => Promise<void>)();
		} else {
			(this.releaseFn as () => void)();
		}

		if (debugLock.enabled) {
			debugLock("[%s] Released %s lock", this.name, this.type);
		}
	}

	/**
	 * Synchronously disposes the guard (releases the lock).
	 *
	 * Called automatically when using the `using` statement.
	 * Only works for in-memory locks. Distributed locks require async disposal.
	 *
	 * @example
	 * ```typescript
	 * using guard = lock.tryAcquire();
	 * if (guard) {
	 *   // Lock automatically released on scope exit
	 * }
	 * ```
	 */
	[Symbol.dispose](): void {
		if (!this.released && !this.isAsync) {
			(this.releaseFn as () => void)();
			this.released = true;
		}
	}

	/**
	 * Asynchronously disposes the guard (releases the lock).
	 *
	 * Called automatically when using the `await using` statement.
	 * Works for both in-memory and distributed locks.
	 *
	 * @example
	 * ```typescript
	 * await using guard = await lock.acquire();
	 * // Lock automatically released on scope exit
	 * ```
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (!this.released) {
			await this.release();
		}
	}
}

/**
 * Internal queue entry for pending lock requests.
 * @internal
 */
interface QueuedRequest {
	id: number;
	type: "read" | "write" | "exclusive";
	priority: number;
	resolve: (guard: LockGuard) => void;
	reject: (error: Error) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Unified Lock implementation supporting exclusive, read-write, and distributed modes.
 *
 * The Lock class provides a flexible locking mechanism that can operate in three modes:
 *
 * 1. **Exclusive/Mutex** (default): Only one holder at a time. Use {@link Lock.acquire}.
 * 2. **Read-Write**: Multiple readers OR one writer. Use {@link Lock.read} and {@link Lock.write}.
 * 3. **Distributed**: Uses persistence provider for cross-process locking.
 *
 * @implements {AsyncDisposable}
 *
 * @example
 * ```typescript
 * import { scope, Lock } from "go-go-scope";
 * import { RedisAdapter } from "@go-go-scope/persistence-redis";
 *
 * await using s = scope();
 *
 * // Exclusive lock (mutex)
 * const mutex = new Lock(s.signal);
 * await using guard = await mutex.acquire();
 *
 * // Read-write lock
 * const rwlock = new Lock(s.signal, { allowMultipleReaders: true });
 *
 * // Multiple readers allowed
 * await using readGuard1 = await rwlock.read();
 * await using readGuard2 = await rwlock.read();
 *
 * // Exclusive writer - waits for all readers
 * await using writeGuard = await rwlock.write();
 *
 * // Distributed lock with Redis
 * const distLock = new Lock(s.signal, {
 *   provider: new RedisAdapter(redis),
 *   key: "resource:123",
 *   ttl: 30000
 * });
 * await using guard = await distLock.acquire({ timeout: 5000 });
 * ```
 */
export class Lock implements AsyncDisposable {
	private readonly provider?: LockProvider;
	private readonly key?: string;
	private readonly ttl: number;
	private readonly owner: string;
	private readonly allowMultipleReaders: boolean;
	private readonly name: string;

	// In-memory state
	private readerCount = 0;
	private writerActive = false;
	private exclusiveActive = false;
	private requestQueue: QueuedRequest[] = [];
	private nextRequestId = 1;
	private disposed = false;

	// Distributed state
	private distributedExtendTimeout?: ReturnType<typeof setTimeout>;

	/**
	 * Creates a new Lock instance.
	 *
	 * @param signal - AbortSignal for cancellation (optional)
	 * @param options - Lock configuration options
	 * @param options.provider - Persistence provider for distributed locking
	 * @param options.key - Unique key for distributed locks
	 * @param options.ttl - Lock TTL in milliseconds for distributed locks (default: 30000)
	 * @param options.owner - Owner identifier for distributed locks (default: random string)
	 * @param options.allowMultipleReaders - Allow multiple simultaneous readers (default: false)
	 * @param options.name - Name for debugging purposes (default: random string)
	 * @throws Error if using a persistence provider without specifying a key
	 *
	 * @example
	 * ```typescript
	 * // Exclusive in-memory lock
	 * const lock = new Lock(s.signal);
	 *
	 * // Read-write lock
	 * const rwlock = new Lock(s.signal, { allowMultipleReaders: true });
	 *
	 * // Distributed lock
	 * const distLock = new Lock(s.signal, {
	 *   provider: redisAdapter,
	 *   key: "my-resource",
	 *   ttl: 30000,
	 *   owner: `process-${process.pid}`
	 * });
	 * ```
	 */
	constructor(signal?: AbortSignal, options: LockOptions = {}) {
		// signal stored for potential future use in cancellation
		const _signal = signal ?? new AbortController().signal;
		void _signal;
		this.provider = options.provider;
		this.key = options.key;
		this.ttl = options.ttl ?? 30000;
		this.owner =
			options.owner ?? `owner-${Math.random().toString(36).slice(2, 10)}`;
		this.allowMultipleReaders = options.allowMultipleReaders ?? false;
		this.name =
			options.name ?? `lock-${Math.random().toString(36).slice(2, 8)}`;

		// Validate options
		if (this.provider && !this.key) {
			throw new Error(
				"Lock 'key' is required when using a persistence provider",
			);
		}

		if (debugLock.enabled) {
			debugLock(
				"[%s] Created %s lock (distributed: %s, rw: %s)",
				this.name,
				this.provider ? "distributed" : "in-memory",
				this.provider ? "yes" : "no",
				this.allowMultipleReaders ? "yes" : "no",
			);
		}
	}

	/**
	 * Acquires an exclusive lock (mutex mode).
	 *
	 * Only one holder can have the lock at a time. Other acquire calls will
	 * wait until the lock is released or the timeout expires.
	 *
	 * Only available when `allowMultipleReaders` is `false` (default).
	 *
	 * @param options - Acquisition options
	 * @param options.timeout - Timeout in milliseconds for lock acquisition (default: no timeout)
	 * @param options.priority - Priority for lock acquisition, higher is prioritized (default: 0)
	 * @param options.pollInterval - Polling interval for distributed locks in milliseconds (default: 100)
	 * @returns A LockGuard that releases the lock when disposed
	 * @throws Error if lock is in read-write mode
	 * @throws Error if acquisition times out
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal);
	 *	 * // With timeout
	 * await using guard = await lock.acquire({ timeout: 5000 });
	 *
	 * // With priority (higher =优先)
	 * await using guard = await lock.acquire({ priority: 10 });
	 * ```
	 */
	async acquire(options: LockAcquireOptions = {}): Promise<LockGuard> {
		if (this.allowMultipleReaders) {
			throw new Error(
				"Lock is configured for read-write mode. Use read() or write() instead of acquire()",
			);
		}

		if (this.provider) {
			return this.acquireDistributedExclusive(options);
		}

		return this.acquireInMemoryExclusive(options);
	}

	/**
	 * Acquires a read lock (read-write mode only).
	 *
	 * Multiple readers can hold the lock simultaneously, but writers are blocked.
	 * If there's a waiting writer with higher priority, new readers will wait.
	 *
	 * Only available when `allowMultipleReaders` is `true`.
	 *
	 * @param options - Acquisition options
	 * @param options.timeout - Timeout in milliseconds for lock acquisition (default: no timeout)
	 * @param options.priority - Priority for lock acquisition, higher is prioritized (default: 0)
	 * @param options.pollInterval - Polling interval for distributed locks in milliseconds (default: 100)
	 * @returns A LockGuard that releases the read lock when disposed
	 * @throws Error if lock is not in read-write mode
	 * @throws Error if acquisition times out
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 *
	 * // Multiple readers can acquire simultaneously
	 * await using guard1 = await lock.read();
	 * await using guard2 = await lock.read();
	 *
	 * // Readers block writers
	 * // const writeGuard = await lock.write(); // Waits for readers
	 * ```
	 */
	async read(options: LockAcquireOptions = {}): Promise<LockGuard> {
		if (!this.allowMultipleReaders) {
			throw new Error(
				"Lock is not configured for read-write mode. Create with { allowMultipleReaders: true }",
			);
		}

		if (this.provider) {
			return this.acquireDistributedRead(options);
		}

		return this.acquireInMemoryRead(options);
	}

	/**
	 * Acquires a write lock (read-write mode only).
	 *
	 * Exclusive access - no other readers or writers can hold the lock.
	 * Writers have priority over new readers if they have higher priority.
	 *
	 * Only available when `allowMultipleReaders` is `true`.
	 *
	 * @param options - Acquisition options
	 * @param options.timeout - Timeout in milliseconds for lock acquisition (default: no timeout)
	 * @param options.priority - Priority for lock acquisition, higher is prioritized (default: 0)
	 * @param options.pollInterval - Polling interval for distributed locks in milliseconds (default: 100)
	 * @returns A LockGuard that releases the write lock when disposed
	 * @throws Error if lock is not in read-write mode
	 * @throws Error if acquisition times out
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 *
	 * // Writer has exclusive access
	 * await using guard = await lock.write();
	 * // No readers or other writers allowed here
	 * ```
	 */
	async write(options: LockAcquireOptions = {}): Promise<LockGuard> {
		if (!this.allowMultipleReaders) {
			throw new Error(
				"Lock is not configured for read-write mode. Create with { allowMultipleReaders: true }",
			);
		}

		if (this.provider) {
			return this.acquireDistributedWrite(options);
		}

		return this.acquireInMemoryWrite(options);
	}

	/**
	 * Tries to acquire the lock immediately without waiting.
	 *
	 * Returns `null` if the lock is not available. Only available for
	 * in-memory exclusive locks (not read-write or distributed).
	 *
	 * @returns A LockGuard if acquired, `null` if lock is not available
	 * @throws Error if lock is in read-write mode or distributed
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal);
	 *
	 * using guard = lock.tryAcquire();
	 * if (guard) {
	 *   // Lock acquired - do work
	 *   // Automatically released when guard goes out of scope
	 * } else {
	 *   // Lock not available - do something else
	 * }
	 * ```
	 */
	tryAcquire(): LockGuard | null {
		if (this.allowMultipleReaders) {
			throw new Error(
				"Lock is in read-write mode. Use tryRead() or tryWrite() instead.",
			);
		}

		if (this.provider) {
			// For distributed locks, we can't synchronously check
			throw new Error(
				"tryAcquire is not supported for distributed locks. Use acquire with timeout: 0",
			);
		}

		if (!this.exclusiveActive && this.requestQueue.length === 0) {
			this.exclusiveActive = true;
			return new LockGuard(
				() => this.releaseExclusive(),
				false,
				"exclusive",
				this.name,
			);
		}

		return null;
	}

	/**
	 * Tries to acquire a read lock immediately (read-write mode only).
	 *
	 * Returns `null` if a writer is active or waiting with higher priority.
	 * Only available for in-memory locks.
	 *
	 * @returns A LockGuard if acquired, `null` if lock is not available
	 * @throws Error if lock is not in read-write mode or is distributed
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 *
	 * using guard = lock.tryRead();
	 * if (guard) {
	 *   // Read lock acquired
	 * }
	 * ```
	 */
	tryRead(): LockGuard | null {
		if (!this.allowMultipleReaders) {
			throw new Error("Lock is not in read-write mode.");
		}

		if (this.provider) {
			throw new Error(
				"tryRead is not supported for distributed locks. Use read with timeout: 0",
			);
		}

		// Can acquire read if no writer and no waiting writers
		const hasWaitingWriter = this.requestQueue.some((r) => r.type === "write");

		if (!this.writerActive && !hasWaitingWriter) {
			this.readerCount++;
			return new LockGuard(() => this.releaseRead(), false, "read", this.name);
		}

		return null;
	}

	/**
	 * Tries to acquire a write lock immediately (read-write mode only).
	 *
	 * Returns `null` if any readers or writers are active, or if there are pending requests.
	 * Only available for in-memory locks.
	 *
	 * @returns A LockGuard if acquired, `null` if lock is not available
	 * @throws Error if lock is not in read-write mode or is distributed
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 *
	 * using guard = lock.tryWrite();
	 * if (guard) {
	 *   // Write lock acquired exclusively
	 * }
	 * ```
	 */
	tryWrite(): LockGuard | null {
		if (!this.allowMultipleReaders) {
			throw new Error("Lock is not in read-write mode.");
		}

		if (this.provider) {
			throw new Error(
				"tryWrite is not supported for distributed locks. Use write with timeout: 0",
			);
		}

		// Can acquire write if no activity and no pending requests
		if (
			!this.writerActive &&
			this.readerCount === 0 &&
			this.requestQueue.length === 0
		) {
			this.writerActive = true;
			return new LockGuard(
				() => this.releaseWrite(),
				false,
				"write",
				this.name,
			);
		}

		return null;
	}

	/**
	 * Checks if the lock is currently held.
	 *
	 * For exclusive locks, returns `true` if acquired.
	 * For read-write locks, returns `true` if any readers or a writer is active.
	 *
	 * Only available for in-memory locks.
	 *
	 * @returns `true` if the lock is held
	 * @throws Error for distributed locks
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal);
	 * console.log(lock.isLocked); // false
	 *
	 * await using guard = await lock.acquire();
	 * console.log(lock.isLocked); // true
	 * ```
	 */
	get isLocked(): boolean {
		if (this.provider) {
			// For distributed locks, we can't know without checking the provider
			throw new Error("isLocked is not supported for distributed locks");
		}

		if (this.allowMultipleReaders) {
			return this.writerActive || this.readerCount > 0;
		}

		return this.exclusiveActive;
	}

	/**
	 * Gets statistics about the lock state.
	 *
	 * Returns reader count, writer state, and pending request count.
	 * Only available for in-memory locks.
	 *
	 * @returns Lock statistics object
	 * @throws Error for distributed locks
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 * const stats = lock.stats;
	 * console.log(`${stats.readerCount} active readers`);
	 * console.log(`${stats.pendingRequests} pending requests`);
	 * ```
	 */
	get stats(): {
		readerCount: number;
		writerActive: boolean;
		exclusiveActive: boolean;
		pendingRequests: number;
	} {
		if (this.provider) {
			throw new Error("stats is not supported for distributed locks");
		}

		return {
			readerCount: this.readerCount,
			writerActive: this.writerActive,
			exclusiveActive: this.exclusiveActive,
			pendingRequests: this.requestQueue.length,
		};
	}

	/**
	 * Disposes the lock and rejects all pending requests.
	 *
	 * Called automatically when using the `await using` statement.
	 *
	 * @example
	 * ```typescript
	 * await using lock = new Lock(s.signal);
	 * // ... use lock
	 * // All pending requests rejected on disposal
	 * ```
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		// Reject all pending requests
		for (const request of this.requestQueue) {
			if (request.timeoutId) {
				clearTimeout(request.timeoutId);
			}
			request.reject(new Error("Lock disposed"));
		}
		this.requestQueue = [];

		// Clear distributed extension timeout
		if (this.distributedExtendTimeout) {
			clearTimeout(this.distributedExtendTimeout);
		}

		if (debugLock.enabled) {
			debugLock("[%s] Lock disposed", this.name);
		}
	}

	// ============================================================================
	// In-Memory Implementation
	// ============================================================================

	/**
	 * Acquires an exclusive lock using in-memory coordination.
	 * @internal
	 */
	private acquireInMemoryExclusive(
		options: LockAcquireOptions,
	): Promise<LockGuard> {
		const { timeout, priority = 0 } = options;

		return new Promise((resolve, reject) => {
			const requestId = this.nextRequestId++;

			const request: QueuedRequest = {
				id: requestId,
				type: "exclusive",
				priority,
				resolve: (guard) => {
					this.clearTimeout(request);
					resolve(guard);
				},
				reject: (error) => {
					this.clearTimeout(request);
					reject(error);
				},
			};

			if (timeout !== undefined && timeout > 0) {
				request.timeoutId = setTimeout(() => {
					this.removeRequest(request);
					request.reject(
						new Error(`Lock acquisition timed out after ${timeout}ms`),
					);
				}, timeout);
			}

			this.requestQueue.push(request);
			this.processQueue();
		});
	}

	/**
	 * Acquires a read lock using in-memory coordination.
	 * @internal
	 */
	private acquireInMemoryRead(options: LockAcquireOptions): Promise<LockGuard> {
		const { timeout, priority = 0 } = options;

		return new Promise((resolve, reject) => {
			const requestId = this.nextRequestId++;

			const request: QueuedRequest = {
				id: requestId,
				type: "read",
				priority,
				resolve: (guard) => {
					this.clearTimeout(request);
					resolve(guard);
				},
				reject: (error) => {
					this.clearTimeout(request);
					reject(error);
				},
			};

			if (timeout !== undefined && timeout > 0) {
				request.timeoutId = setTimeout(() => {
					this.removeRequest(request);
					request.reject(
						new Error(`Read lock acquisition timed out after ${timeout}ms`),
					);
				}, timeout);
			}

			this.requestQueue.push(request);
			this.processQueue();
		});
	}

	/**
	 * Acquires a write lock using in-memory coordination.
	 * @internal
	 */
	private acquireInMemoryWrite(
		options: LockAcquireOptions,
	): Promise<LockGuard> {
		const { timeout, priority = 0 } = options;

		return new Promise((resolve, reject) => {
			const requestId = this.nextRequestId++;

			const request: QueuedRequest = {
				id: requestId,
				type: "write",
				priority,
				resolve: (guard) => {
					this.clearTimeout(request);
					resolve(guard);
				},
				reject: (error) => {
					this.clearTimeout(request);
					reject(error);
				},
			};

			if (timeout !== undefined && timeout > 0) {
				request.timeoutId = setTimeout(() => {
					this.removeRequest(request);
					request.reject(
						new Error(`Write lock acquisition timed out after ${timeout}ms`),
					);
				}, timeout);
			}

			this.requestQueue.push(request);
			this.processQueue();
		});
	}

	// ============================================================================
	// Distributed Implementation
	// ============================================================================

	/**
	 * Acquires an exclusive distributed lock.
	 * @internal
	 */
	private async acquireDistributedExclusive(
		options: LockAcquireOptions,
	): Promise<LockGuard> {
		const { timeout, pollInterval = 100 } = options;
		const startTime = Date.now();

		while (true) {
			const handle = await this.tryAcquireDistributedExclusive();
			if (handle) return handle;

			if (timeout !== undefined) {
				const elapsed = Date.now() - startTime;
				if (elapsed >= timeout) {
					throw new Error(`Lock acquisition timed out after ${timeout}ms`);
				}
			}

			await this.sleep(pollInterval);
		}
	}

	/**
	 * Attempts to acquire an exclusive distributed lock.
	 * @internal
	 */
	private async tryAcquireDistributedExclusive(): Promise<LockGuard | null> {
		if (!this.provider || !this.key) return null;

		const lockKey = `lock:exclusive:${this.key}`;
		const handle = await this.provider.acquire(lockKey, this.ttl, this.owner);

		if (handle) {
			this.scheduleDistributedExtend(lockKey);

			return new LockGuard(
				async () => {
					this.clearDistributedExtend();
					await handle.release();
				},
				true,
				"exclusive",
				this.name,
			);
		}

		return null;
	}

	/**
	 * Acquires a distributed read lock.
	 * @internal
	 */
	private async acquireDistributedRead(
		options: LockAcquireOptions,
	): Promise<LockGuard> {
		const { timeout, pollInterval = 100 } = options;
		const startTime = Date.now();

		while (true) {
			const handle = await this.tryAcquireDistributedRead();
			if (handle) return handle;

			if (timeout !== undefined) {
				const elapsed = Date.now() - startTime;
				if (elapsed >= timeout) {
					throw new Error(`Read lock acquisition timed out after ${timeout}ms`);
				}
			}

			await this.sleep(pollInterval);
		}
	}

	/**
	 * Attempts to acquire a distributed read lock.
	 * @internal
	 */
	private async tryAcquireDistributedRead(): Promise<LockGuard | null> {
		if (!this.provider || !this.key) return null;

		// Check if there's a write lock
		const writeLockKey = `lock:write:${this.key}`;
		const tempLock = await this.provider.acquire(writeLockKey, 100, this.owner);

		if (tempLock) {
			// No write lock, we can acquire read lock
			await tempLock.release();

			const readLockKey = `lock:read:${this.key}:${this.owner}`;
			const handle = await this.provider.acquire(
				readLockKey,
				this.ttl,
				this.owner,
			);

			if (handle) {
				this.scheduleDistributedExtend(readLockKey);

				return new LockGuard(
					async () => {
						this.clearDistributedExtend();
						await handle.release();
					},
					true,
					"read",
					this.name,
				);
			}
		}

		return null;
	}

	/**
	 * Acquires a distributed write lock.
	 * @internal
	 */
	private async acquireDistributedWrite(
		options: LockAcquireOptions,
	): Promise<LockGuard> {
		const { timeout, pollInterval = 100 } = options;
		const startTime = Date.now();

		while (true) {
			const handle = await this.tryAcquireDistributedWrite();
			if (handle) return handle;

			if (timeout !== undefined) {
				const elapsed = Date.now() - startTime;
				if (elapsed >= timeout) {
					throw new Error(
						`Write lock acquisition timed out after ${timeout}ms`,
					);
				}
			}

			await this.sleep(pollInterval);
		}
	}

	/**
	 * Attempts to acquire a distributed write lock.
	 * @internal
	 */
	private async tryAcquireDistributedWrite(): Promise<LockGuard | null> {
		if (!this.provider || !this.key) return null;

		const writeLockKey = `lock:write:${this.key}`;
		const handle = await this.provider.acquire(
			writeLockKey,
			this.ttl,
			this.owner,
		);

		if (handle) {
			this.scheduleDistributedExtend(writeLockKey);

			return new LockGuard(
				async () => {
					this.clearDistributedExtend();
					await handle.release();
				},
				true,
				"write",
				this.name,
			);
		}

		return null;
	}

	// ============================================================================
	// Queue Processing
	// ============================================================================

	/**
	 * Processes the lock request queue, granting locks when possible.
	 * @internal
	 */
	private processQueue(): void {
		if (this.disposed) return;

		// Sort by priority (higher first), then by insertion order
		this.requestQueue.sort((a, b) => {
			if (a.priority !== b.priority) {
				return b.priority - a.priority;
			}
			return a.id - b.id;
		});

		while (this.requestQueue.length > 0) {
			const request = this.requestQueue[0]!;

			switch (request.type) {
				case "exclusive": {
					if (!this.exclusiveActive && this.requestQueue.length === 1) {
						this.requestQueue.shift();
						this.exclusiveActive = true;
						const guard = new LockGuard(
							() => this.releaseExclusive(),
							false,
							"exclusive",
							this.name,
						);
						request.resolve(guard);
					} else {
						return;
					}
					break;
				}

				case "read": {
					const hasWaitingWriter = this.requestQueue
						.slice(1)
						.some((r) => r.type === "write" && r.priority > request.priority);

					if (!this.writerActive && !hasWaitingWriter) {
						this.requestQueue.shift();
						this.readerCount++;
						const guard = new LockGuard(
							() => this.releaseRead(),
							false,
							"read",
							this.name,
						);
						request.resolve(guard);
					} else {
						return;
					}
					break;
				}

				case "write": {
					if (!this.writerActive && this.readerCount === 0) {
						this.requestQueue.shift();
						this.writerActive = true;
						const guard = new LockGuard(
							() => this.releaseWrite(),
							false,
							"write",
							this.name,
						);
						request.resolve(guard);
					} else {
						return;
					}
					break;
				}
			}
		}
	}

	// ============================================================================
	// Release Methods
	// ============================================================================

	/**
	 * Releases an exclusive lock and processes the queue.
	 * @internal
	 */
	private releaseExclusive(): void {
		this.exclusiveActive = false;
		this.processQueue();
	}

	/**
	 * Releases a read lock and processes the queue.
	 * @internal
	 */
	private releaseRead(): void {
		this.readerCount--;
		this.processQueue();
	}

	/**
	 * Releases a write lock and processes the queue.
	 * @internal
	 */
	private releaseWrite(): void {
		this.writerActive = false;
		this.processQueue();
	}

	// ============================================================================
	// Distributed Helpers
	// ============================================================================

	/**
	 * Schedules automatic extension of a distributed lock.
	 * @internal
	 */
	private scheduleDistributedExtend(key: string): void {
		const extendInterval = Math.floor(this.ttl * 0.6);
		this.distributedExtendTimeout = setTimeout(async () => {
			if (!this.disposed && this.provider) {
				const extended = await this.provider.extend(key, this.ttl, this.owner);
				if (extended) {
					this.scheduleDistributedExtend(key);
				}
			}
		}, extendInterval);
	}

	/**
	 * Clears the distributed lock extension timeout.
	 * @internal
	 */
	private clearDistributedExtend(): void {
		if (this.distributedExtendTimeout) {
			clearTimeout(this.distributedExtendTimeout);
			this.distributedExtendTimeout = undefined;
		}
	}

	// ============================================================================
	// Utility
	// ============================================================================

	/**
	 * Removes a request from the queue.
	 * @internal
	 */
	private removeRequest(request: QueuedRequest): void {
		const index = this.requestQueue.indexOf(request);
		if (index > -1) {
			this.requestQueue.splice(index, 1);
		}
	}

	/**
	 * Clears the timeout for a request.
	 * @internal
	 */
	private clearTimeout(request: QueuedRequest): void {
		if (request.timeoutId) {
			clearTimeout(request.timeoutId);
		}
	}

	/**
	 * Sleeps for the specified duration.
	 * @internal
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Creates a new {@link Lock} instance.
 *
 * This is a convenience factory function. See {@link Lock} for detailed usage.
 *
 * @param signal - AbortSignal for cancellation (optional)
 * @param options - Lock configuration options
 * @param options.provider - Persistence provider for distributed locking
 * @param options.key - Unique key for distributed locks
 * @param options.ttl - Lock TTL in milliseconds for distributed locks (default: 30000)
 * @param options.owner - Owner identifier for distributed locks (default: random string)
 * @param options.allowMultipleReaders - Allow multiple simultaneous readers (default: false)
 * @param options.name - Name for debugging purposes (default: random string)
 * @returns A new Lock instance
 *
 * @example
 * ```typescript
 * import { createLock } from "go-go-scope";
 * import { RedisAdapter } from "@go-go-scope/persistence-redis";
 *
 * // Exclusive lock
 * const mutex = createLock(s.signal);
 * await using guard = await mutex.acquire();
 *
 * // Read-write lock
 * const rwlock = createLock(s.signal, { allowMultipleReaders: true });
 * await using readGuard = await rwlock.read();
 * await using writeGuard = await rwlock.write();
 *
 * // Distributed lock with Redis
 * const distLock = createLock(s.signal, {
 *   provider: new RedisAdapter(redis),
 *   key: "my-resource",
 *   ttl: 30000,
 * });
 * await using guard = await distLock.acquire();
 * ```
 */
export function createLock(signal?: AbortSignal, options?: LockOptions): Lock {
	return new Lock(signal, options);
}
