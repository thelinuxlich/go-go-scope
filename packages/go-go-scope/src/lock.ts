/**
 * Unified Lock API for go-go-scope
 *
 * A flexible lock that can operate as:
 * - Exclusive lock (mutex) - single holder
 * - Read-write lock - multiple readers OR one writer
 * - In-memory (fast, single-process) or distributed (multi-process with persistence)
 *
 * @example
 * ```typescript
 * import { scope, Lock } from "go-go-scope";
 * import { RedisAdapter } from "@go-go-scope/persistence-redis";
 *
 * await using s = scope();
 *
 * // In-memory exclusive lock
 * const mutex = new Lock(s.signal);
 * await using guard = await mutex.acquire();
 *
 * // In-memory read-write lock
 * const rwlock = new Lock(s.signal, { allowMultipleReaders: true });
 * await using readGuard = await rwlock.read();
 *
 * // Distributed lock (uses persistence provider)
 * const distLock = new Lock(s.signal, {
 *   provider: new RedisAdapter(redis),
 *   key: "resource:123",
 *   ttl: 30000,
 * });
 * await using guard = await distLock.acquire();
 * ```
 */

import createDebug from "debug";
import type { LockProvider } from "./persistence/types.js";

const debugLock = createDebug("go-go-scope:lock");

/**
 * Options for creating a Lock
 */
export interface LockOptions {
	/**
	 * Persistence provider for distributed locking.
	 * If not provided, the lock is in-memory only.
	 */
	provider?: LockProvider;
	/**
	 * Unique key for distributed locks.
	 * Required when using a provider.
	 */
	key?: string;
	/**
	 * Lock TTL in milliseconds for distributed locks.
	 * Default: 30000 (30 seconds)
	 */
	ttl?: number;
	/**
	 * Owner identifier for distributed locks.
	 * Default: random string
	 */
	owner?: string;
	/**
	 * Allow multiple simultaneous readers (read-write lock mode).
	 * When true, the lock supports read() and write() methods.
	 * When false (default), only acquire() is available (mutex mode).
	 */
	allowMultipleReaders?: boolean;
	/**
	 * Name for debugging purposes.
	 */
	name?: string;
}

/**
 * Options for acquiring a lock
 */
export interface LockAcquireOptions {
	/**
	 * Timeout in milliseconds.
	 * Default: no timeout (wait indefinitely)
	 */
	timeout?: number;
	/**
	 * Priority for lock acquisition (higher =优先).
	 * Default: 0
	 */
	priority?: number;
	/**
	 * Polling interval for distributed locks.
	 * Default: 100ms
	 */
	pollInterval?: number;
}

/**
 * A lock guard that releases the lock when disposed
 */
export class LockGuard implements Disposable, AsyncDisposable {
	private released = false;
	private releaseFn: (() => void) | (() => Promise<void>);
	private isAsync: boolean;

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
	 * Release the lock manually
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

	[Symbol.dispose](): void {
		if (!this.released && !this.isAsync) {
			(this.releaseFn as () => void)();
			this.released = true;
		}
	}

	async [Symbol.asyncDispose](): Promise<void> {
		if (!this.released) {
			await this.release();
		}
	}
}

/**
 * Queue entry for pending lock requests
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
 * Unified Lock implementation
 *
 * Supports three modes:
 * 1. **Exclusive/Mutex** (default): Only one holder at a time
 * 2. **Read-Write**: Multiple readers OR one writer
 * 3. **Distributed**: Uses persistence provider for cross-process locking
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
	 * Acquire an exclusive lock.
	 * Only one holder can have the lock at a time.
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal);
	 * await using guard = await lock.acquire();
	 * // Critical section
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
	 * Acquire a read lock (read-write mode only).
	 * Multiple readers can hold the lock simultaneously.
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 * await using guard = await lock.read();
	 * // Read operation
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
	 * Acquire a write lock (read-write mode only).
	 * Exclusive access, no other readers or writers.
	 *
	 * @example
	 * ```typescript
	 * const lock = new Lock(s.signal, { allowMultipleReaders: true });
	 * await using guard = await lock.write();
	 * // Write operation
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
	 * Try to acquire the lock immediately without waiting.
	 * Returns null if the lock is not available.
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
	 * Try to acquire a read lock immediately (read-write mode only).
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
	 * Try to acquire a write lock immediately (read-write mode only).
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
	 * Check if the lock is currently held (in-memory only).
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
	 * Get statistics about the lock (in-memory only).
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

	private releaseExclusive(): void {
		this.exclusiveActive = false;
		this.processQueue();
	}

	private releaseRead(): void {
		this.readerCount--;
		this.processQueue();
	}

	private releaseWrite(): void {
		this.writerActive = false;
		this.processQueue();
	}

	// ============================================================================
	// Distributed Helpers
	// ============================================================================

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

	private clearDistributedExtend(): void {
		if (this.distributedExtendTimeout) {
			clearTimeout(this.distributedExtendTimeout);
			this.distributedExtendTimeout = undefined;
		}
	}

	// ============================================================================
	// Utility
	// ============================================================================

	private removeRequest(request: QueuedRequest): void {
		const index = this.requestQueue.indexOf(request);
		if (index > -1) {
			this.requestQueue.splice(index, 1);
		}
	}

	private clearTimeout(request: QueuedRequest): void {
		if (request.timeoutId) {
			clearTimeout(request.timeoutId);
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create a Lock instance
 *
 * @example
 * ```typescript
 * // Exclusive lock
 * const mutex = createLock(s.signal);
 * await using guard = await mutex.acquire();
 *
 * // Read-write lock
 * const rwlock = createLock(s.signal, { allowMultipleReaders: true });
 * await using guard = await rwlock.read();
 *
 * // Distributed lock
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
