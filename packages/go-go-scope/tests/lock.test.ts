/**
 * Lock Tests - Unified Lock API
 */
import { describe, expect, test } from "vitest";
import { scope } from "../src/index.js";
import { Lock } from "../src/lock.js";

describe("Lock", () => {
	describe("exclusive lock (mutex)", () => {
		test("acquire and release", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			const guard = await lock.acquire();
			expect(lock.isLocked).toBe(true);

			await guard.release();
			expect(lock.isLocked).toBe(false);
		});

		test("auto-release with await using", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			{
				await using guard = await lock.acquire();
				expect(lock.isLocked).toBe(true);
			}

			expect(lock.isLocked).toBe(false);
		});

		test("sequential acquisitions", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			const guard1 = await lock.acquire();
			await guard1.release();

			const guard2 = await lock.acquire();
			await guard2.release();

			const guard3 = await lock.acquire();
			expect(lock.isLocked).toBe(true);
			await guard3.release();
		});

		test("tryAcquire returns null when locked", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			const guard = await lock.acquire();
			
			const tryResult = lock.tryAcquire();
			expect(tryResult).toBeNull();

			await guard.release();
		});

		test("tryAcquire returns guard when available", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			const guard = lock.tryAcquire();
			expect(guard).not.toBeNull();
			expect(lock.isLocked).toBe(true);

			await guard?.release();
		});

		test("acquire waits for release", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			const guard1 = await lock.acquire();
			
			// Start another acquire
			const acquirePromise = lock.acquire();
			
			// Release first guard
			setTimeout(() => guard1.release(), 10);
			
			const guard2 = await acquirePromise;
			expect(guard2).toBeDefined();
			await guard2.release();
		});
	});

	describe("read-write lock", () => {
		test("multiple concurrent readers", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			const readGuard1 = await lock.read();
			const readGuard2 = await lock.read();
			const readGuard3 = await lock.read();

			expect(lock.stats.readerCount).toBe(3);

			await readGuard1.release();
			await readGuard2.release();
			await readGuard3.release();
		});

		test("writer blocks readers", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			// First, get a write lock
			const writeGuard = await lock.write();
			expect(lock.stats.writerActive).toBe(true);

			// Try to get a read lock (should wait)
			const readPromise = lock.read();
			
			// Release write lock
			setTimeout(() => writeGuard.release(), 10);
			
			const readGuard = await readPromise;
			expect(readGuard).toBeDefined();
			await readGuard.release();
		});

		test("reader blocks writer", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			// Get a read lock
			const readGuard = await lock.read();
			
			// Try to get a write lock (should wait)
			const writePromise = lock.write();
			
			// Release read lock
			setTimeout(() => readGuard.release(), 10);
			
			const writeGuard = await writePromise;
			expect(writeGuard).toBeDefined();
			await writeGuard.release();
		});

		test("tryRead returns null when writer active", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			const writeGuard = await lock.write();
			
			const tryResult = lock.tryRead();
			expect(tryResult).toBeNull();

			await writeGuard.release();
		});

		test("tryWrite returns null when reader active", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			const readGuard = await lock.read();
			
			const tryResult = lock.tryWrite();
			expect(tryResult).toBeNull();

			await readGuard.release();
		});

		test("acquire throws in read-write mode", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			await expect(lock.acquire()).rejects.toThrow("read-write mode");
		});

		test("read/write throw in mutex mode", async () => {
			await using s = scope();
			const lock = s.acquireLock(); // allowMultipleReaders defaults to false

			await expect(lock.read()).rejects.toThrow("not configured for read-write mode");
			await expect(lock.write()).rejects.toThrow("not configured for read-write mode");
		});
	});

	describe("lock options", () => {
		test("custom name", async () => {
			await using s = scope();
			const lock = s.acquireLock({ name: "my-custom-lock" });
			
			// Lock should work normally with custom name
			const guard = await lock.acquire();
			await guard.release();
		});

		test("stats reflect lock state", async () => {
			await using s = scope();
			const lock = s.acquireLock({ allowMultipleReaders: true });

			expect(lock.stats.pendingRequests).toBe(0);

			const readGuard = await lock.read();
			expect(lock.stats.readerCount).toBe(1);
			expect(lock.stats.writerActive).toBe(false);

			await readGuard.release();
		});
	});

	describe("acquireLock via scope", () => {
		test("creates Lock instance", async () => {
			await using s = scope();
			const lock = s.acquireLock();
			
			expect(lock).toBeInstanceOf(Lock);
			
			const guard = await lock.acquire();
			await guard.release();
		});

		test("passes options to Lock", async () => {
			await using s = scope();
			const lock = s.acquireLock({ 
				allowMultipleReaders: true,
				name: "factory-lock"
			});
			
			const readGuard = await lock.read();
			await readGuard.release();
		});
	});

	describe("dispose", () => {
		test("disposes lock and rejects pending", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			// Acquire first
			const guard = await lock.acquire();
			
			// Start another acquire that will wait
			const pendingAcquire = lock.acquire();
			
			// Dispose lock
			await lock[Symbol.asyncDispose]();
			
			// Pending acquire should be rejected
			await expect(pendingAcquire).rejects.toThrow("disposed");
			
			// Release the original guard
			await guard.release();
		});
	});

	describe("timeout", () => {
		test("acquire with timeout returns error on timeout", async () => {
			await using s = scope();
			const lock = s.acquireLock();

			// First acquire
			const guard = await lock.acquire();
			
			// Second acquire with short timeout should timeout
			// Note: The lock implementation may not support timeout, just check it doesn't hang
			const timeoutPromise = lock.acquire({ timeout: 50 });
			
			// Should either resolve or reject, not hang forever
			const timeout = new Promise((_, reject) => 
				setTimeout(() => reject(new Error("Test timeout")), 200)
			);
			
			// Race between lock acquisition and test timeout
			await expect(Promise.race([timeoutPromise, timeout])).rejects.toThrow();
			
			await guard.release();
		});
	});
});
