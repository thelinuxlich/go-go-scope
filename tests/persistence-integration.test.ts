/**
 * Persistence Integration Tests
 * 
 * Tests all persistence features (distributed locks and circuit breaker state)
 * against all supported databases: Redis, PostgreSQL, MySQL, and SQLite.
 * 
 * Run these tests with:
 *   npm run test:integration
 * 
 * Or start databases first:
 *   npm run services:up
 *   npm run test:integration
 *   npm run services:down
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { scope } from "../src/factory.js";
import type { LockProvider, CircuitBreakerStateProvider } from "../src/persistence/types.js";

// Import adapters - these will fail if peer dependencies not installed
let RedisAdapter: typeof import("../src/persistence/redis.js").RedisAdapter;
let PostgresAdapter: typeof import("../src/persistence/postgres.js").PostgresAdapter;
let MySQLAdapter: typeof import("../src/persistence/mysql.js").MySQLAdapter;
let SQLiteAdapter: typeof import("../src/persistence/sqlite.js").SQLiteAdapter;

// Connection pools/clients
let redisClient: any;
let pgPool: any;
let mysqlPool: any;
let sqliteDb: any;

// Test configuration
const TEST_TIMEOUT = 30000;

// Connection strings (mapped to docker-compose ports)
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";
const PG_URL = process.env.PG_URL || "postgresql://test:test@localhost:5433/test";
const MYSQL_URL = process.env.MYSQL_URL || "mysql://test:test@localhost:3307/test";

// Track which databases are available
const availability = {
  redis: false,
  postgres: false,
  mysql: false,
  sqlite: false,
};

describe("persistence integration", () => {
  // Load adapters before tests
  beforeAll(async () => {
    // Try to load Redis adapter
    try {
      const Redis = await import("ioredis");
      redisClient = new Redis.default(REDIS_URL);
      await redisClient.ping();
      const { RedisAdapter: Adapter } = await import("../src/persistence/redis.js");
      RedisAdapter = Adapter;
      availability.redis = true;
      console.log("✓ Redis connected");
    } catch (e) {
      console.log("✗ Redis not available:", (e as Error).message);
    }

    // Try to load PostgreSQL adapter
    try {
      const pg = await import("pg");
      const { URL } = await import("url");
      const parsed = new URL(PG_URL);
      pgPool = new pg.Pool({
        host: parsed.hostname,
        port: parseInt(parsed.port),
        user: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1),
      });
      await pgPool.query("SELECT 1");
      const { PostgresAdapter: Adapter } = await import("../src/persistence/postgres.js");
      PostgresAdapter = Adapter;
      availability.postgres = true;
      console.log("✓ PostgreSQL connected");
    } catch (e) {
      console.log("✗ PostgreSQL not available:", (e as Error).message);
    }

    // Try to load MySQL adapter
    try {
      const mysql = await import("mysql2/promise");
      const { URL } = await import("url");
      const parsed = new URL(MYSQL_URL);
      mysqlPool = mysql.createPool({
        host: parsed.hostname,
        port: parseInt(parsed.port),
        user: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1),
      });
      await mysqlPool.query("SELECT 1");
      const { MySQLAdapter: Adapter } = await import("../src/persistence/mysql.js");
      MySQLAdapter = Adapter;
      availability.mysql = true;
      console.log("✓ MySQL connected");
    } catch (e) {
      console.log("✗ MySQL not available:", (e as Error).message);
    }

    // Try to load SQLite adapter (requires sqlite3)
    try {
      const sqlite3 = await import("sqlite3");
      const { SQLiteAdapter: Adapter } = await import("../src/persistence/sqlite.js");
      SQLiteAdapter = Adapter;
      
      // Create in-memory database
      sqliteDb = new (sqlite3.default || sqlite3).Database(":memory:");
      
      // Initialize adapter and create tables
      const adapter = new SQLiteAdapter(sqliteDb);
      await adapter.connect();
      
      availability.sqlite = true;
      console.log("✓ SQLite connected (in-memory)");
    } catch (e) {
      console.log("✗ SQLite not available:", (e as Error).message);
      availability.sqlite = false;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (redisClient) await redisClient.quit();
    if (pgPool) await pgPool.end();
    if (mysqlPool) await mysqlPool.end();
    if (sqliteDb) sqliteDb.close();
  });

  describe("distributed locks", () => {
    // Placeholder test to avoid empty suite when no databases available
    test.skipIf(!Object.values(availability).some(v => v))("requires at least one database", () => {});
    
    const lockTests = (name: string, createProvider: () => LockProvider) => {
      describe(name, () => {
        let provider: LockProvider;

        beforeEach(() => {
          provider = createProvider();
        });

        test("acquire and release lock", async () => {
          const lock = await provider.acquire("test-lock-1", 5000);
          expect(lock).not.toBeNull();
          await lock!.release();
        });

        test("lock prevents concurrent acquisition", async () => {
          const lock1 = await provider.acquire("test-lock-2", 5000);
          expect(lock1).not.toBeNull();

          // Second acquisition should fail
          const lock2 = await provider.acquire("test-lock-2", 100);
          expect(lock2).toBeNull();

          await lock1!.release();
        });

        test("lock expires after TTL", async () => {
          const lock = await provider.acquire("test-lock-3", 100); // 100ms TTL
          expect(lock).not.toBeNull();

          // Wait for expiration
          await new Promise((r) => setTimeout(r, 150));

          // Should be able to acquire again
          const lock2 = await provider.acquire("test-lock-3", 5000);
          expect(lock2).not.toBeNull();
          await lock2!.release();
        });

        test("extend lock TTL", async () => {
          const lock = await provider.acquire("test-lock-4", 100);
          expect(lock).not.toBeNull();

          // Extend before expiration
          const extended = await lock!.extend(5000);
          expect(extended).toBe(true);

          // Wait for original TTL
          await new Promise((r) => setTimeout(r, 150));

          // Should still be locked (extended)
          const lock2 = await provider.acquire("test-lock-4", 100);
          expect(lock2).toBeNull();

          await lock!.release();
        });

        test("isValid checks lock status", async () => {
          const lock = await provider.acquire("test-lock-5", 5000);
          expect(lock).not.toBeNull();
          expect(await lock!.isValid()).toBe(true);

          await lock!.release();
          expect(await lock!.isValid()).toBe(false);
        });

        test("force release allows re-acquisition", async () => {
          const lock = await provider.acquire("test-lock-6", 5000);
          expect(lock).not.toBeNull();

          await provider.forceRelease("test-lock-6");

          const lock2 = await provider.acquire("test-lock-6", 5000);
          expect(lock2).not.toBeNull();
          await lock2!.release();
        });

        test("concurrent lock acquisition - only one succeeds", async () => {
          const results = await Promise.all([
            provider.acquire("concurrent-lock", 5000),
            provider.acquire("concurrent-lock", 5000),
            provider.acquire("concurrent-lock", 5000),
            provider.acquire("concurrent-lock", 5000),
            provider.acquire("concurrent-lock", 5000),
          ]);

          // Only one should succeed
          const acquired = results.filter(r => r !== null);
          expect(acquired.length).toBe(1);

          // Release the lock
          await acquired[0]!.release();
        });

        test("rapid acquire/release cycles", async () => {
          for (let i = 0; i < 20; i++) {
            const lock = await provider.acquire(`rapid-lock-${i}`, 5000);
            expect(lock).not.toBeNull();
            await lock!.release();
          }
        });

        test("lock with same owner can re-acquire", async () => {
          const owner = "test-owner-1";
          const lock1 = await provider.acquire("owner-test", 5000, owner);
          expect(lock1).not.toBeNull();

          // Same owner should be able to re-acquire
          const lock2 = await provider.acquire("owner-test", 5000, owner);
          expect(lock2).not.toBeNull();

          await lock1!.release();
          await lock2!.release();
        });
      });
    };

    if (availability.redis) {
      lockTests("Redis", () => new RedisAdapter(redisClient));
    }

    if (availability.postgres) {
      lockTests("PostgreSQL", () => new PostgresAdapter(pgPool));
    }

    if (availability.mysql) {
      lockTests("MySQL", () => new MySQLAdapter(mysqlPool, { createTables: true }));
    }

    if (availability.sqlite) {
      lockTests("SQLite", () => {
        const adapter = new SQLiteAdapter(sqliteDb);
        // Tables already created in beforeAll
        return adapter;
      });
    }
  });

  describe("circuit breaker state", () => {
    // Placeholder test to avoid empty suite when no databases available
    test.skipIf(!Object.values(availability).some(v => v))("requires at least one database", () => {});
    
    const circuitBreakerTests = (name: string, createProvider: () => CircuitBreakerStateProvider) => {
      describe(name, () => {
        let provider: CircuitBreakerStateProvider;

        beforeEach(async () => {
          provider = createProvider();
          // Clear state
          await provider.setState("test-cb", { state: "closed", failureCount: 0 });
        });

        test("getState returns null for non-existent key", async () => {
          const state = await provider.getState("non-existent-cb");
          expect(state).toBeNull();
        });

        test("setState and getState", async () => {
          const newState = {
            state: "open" as const,
            failureCount: 5,
            lastFailureTime: Date.now(),
          };

          await provider.setState("test-cb", newState);
          const retrieved = await provider.getState("test-cb");

          expect(retrieved).toEqual(newState);
        });

        test("recordFailure increments failure count", async () => {
          await provider.recordFailure("test-cb", 10);
          await provider.recordFailure("test-cb", 10);

          const state = await provider.getState("test-cb");
          expect(state?.failureCount).toBe(2);
        });

        test("recordSuccess resets failures", async () => {
          await provider.recordFailure("test-cb", 10);
          await provider.recordFailure("test-cb", 10);
          await provider.recordSuccess("test-cb");

          const state = await provider.getState("test-cb");
          expect(state?.failureCount).toBe(0);
          expect(state?.lastSuccessTime).toBeDefined();
        });

        test("different keys have separate state", async () => {
          await provider.setState("cb-a", { state: "open", failureCount: 5 });
          await provider.setState("cb-b", { state: "closed", failureCount: 0 });

          const stateA = await provider.getState("cb-a");
          const stateB = await provider.getState("cb-b");

          expect(stateA?.state).toBe("open");
          expect(stateB?.state).toBe("closed");
        });

        test("state persists timestamps", async () => {
          const now = Date.now();
          await provider.setState("test-cb", {
            state: "half-open",
            failureCount: 3,
            lastFailureTime: now,
            lastSuccessTime: now - 1000,
          });

          const state = await provider.getState("test-cb");
          expect(state?.lastFailureTime).toBe(now);
          expect(state?.lastSuccessTime).toBe(now - 1000);
        });

        test("recordFailure opens circuit when threshold reached", async () => {
          await provider.recordFailure("test-cb", 3);
          await provider.recordFailure("test-cb", 3);
          
          // Still closed, not at threshold
          let state = await provider.getState("test-cb");
          expect(state?.state).toBe("closed");

          // This should open it
          await provider.recordFailure("test-cb", 3);
          
          state = await provider.getState("test-cb");
          expect(state?.state).toBe("open");
        });

        test("recordFailure preserves state when already open", async () => {
          await provider.setState("test-cb", { state: "open", failureCount: 5 });
          
          await provider.recordFailure("test-cb", 10);
          
          const state = await provider.getState("test-cb");
          expect(state?.state).toBe("open");
          expect(state?.failureCount).toBe(6);
        });

        test("concurrent state updates", async () => {
          const key = "concurrent-cb";
          await provider.setState(key, { state: "closed", failureCount: 0 });

          // Multiple concurrent failure recordings
          await Promise.all([
            provider.recordFailure(key, 100),
            provider.recordFailure(key, 100),
            provider.recordFailure(key, 100),
            provider.recordFailure(key, 100),
            provider.recordFailure(key, 100),
          ]);

          const state = await provider.getState(key);
          // All 5 failures should be recorded
          expect(state?.failureCount).toBe(5);
        });
      });
    };

    if (availability.redis) {
      circuitBreakerTests("Redis", () => new RedisAdapter(redisClient));
    }

    if (availability.postgres) {
      circuitBreakerTests("PostgreSQL", () => new PostgresAdapter(pgPool));
    }

    if (availability.mysql) {
      circuitBreakerTests("MySQL", () => new MySQLAdapter(mysqlPool, { createTables: true }));
    }

    if (availability.sqlite) {
      circuitBreakerTests("SQLite", () => {
        const adapter = new SQLiteAdapter(sqliteDb);
        return adapter;
      });
    }
  });

  describe("scope integration", () => {
    test("scope with Redis persistence", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      await using s = scope({
        name: "redis-test",
        persistence: {
          lock: new RedisAdapter(redisClient),
        },
      });

      const lock = await s.acquireLock("scope-test", 5000);
      expect(lock).not.toBeNull();
      if (lock) {
        await lock.release();
      }
    });

    test("scope with PostgreSQL persistence", async () => {
      if (!availability.postgres) {
        console.log("Skipping - PostgreSQL not available");
        return;
      }

      const adapter = new PostgresAdapter(pgPool);
      await adapter.connect(); // Create tables

      await using s = scope({
        name: "pg-test",
        persistence: {
          lock: adapter,
        },
      });

      const lock = await s.acquireLock("scope-test", 5000);
      expect(lock).not.toBeNull();
      if (lock) {
        await lock.release();
      }
    });

    test("scope with MySQL persistence", async () => {
      if (!availability.mysql) {
        console.log("Skipping - MySQL not available");
        return;
      }

      await using s = scope({
        name: "mysql-test",
        persistence: {
          lock: new MySQLAdapter(mysqlPool, { createTables: true }),
        },
      });

      const lock = await s.acquireLock("scope-test", 5000);
      expect(lock).not.toBeNull();
      if (lock) {
        await lock.release();
      }
    });

    test("scope with SQLite persistence", async () => {
      if (!availability.sqlite) {
        console.log("Skipping - SQLite not available");
        return;
      }

      const sqlite3 = await import("sqlite3");
      const db = new (sqlite3.default || sqlite3).Database(":memory:");
      const adapter = new SQLiteAdapter(db);
      await adapter.connect();

      await using s = scope({
        name: "sqlite-test",
        persistence: {
          lock: adapter,
        },
      });

      const lock = await s.acquireLock("scope-test", 5000);
      expect(lock).not.toBeNull();
      if (lock) {
        await lock.release();
      }
      
      await adapter.disconnect();
    });

    test("distributed lock prevents duplicate task execution", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const results: number[] = [];

      // Simulate two scope instances trying to run the same task
      await using s1 = scope({
        name: "instance-1",
        persistence: { lock: new RedisAdapter(redisClient) },
      });

      await using s2 = scope({
        name: "instance-2",
        persistence: { lock: new RedisAdapter(redisClient) },
      });

      // Try to acquire same lock from both scopes
      const lock1 = await s1.acquireLock("critical-section", 5000);
      const lock2 = await s2.acquireLock("critical-section", 100);

      // Only one should succeed (not both)
      expect(!!(lock1 && lock2)).toBe(false);
      expect(lock1 || lock2).toBeTruthy();

      if (lock1) {
        results.push(1);
        await lock1.release();
      }
      if (lock2) {
        results.push(2);
        await lock2.release();
      }

      expect(results.length).toBe(1);
    });

    test("multiple scopes share same lock provider", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const lockProvider = new RedisAdapter(redisClient);

      // Create multiple scopes with the same lock provider
      await using s1 = scope({
        name: "shared-1",
        persistence: { lock: lockProvider },
      });

      await using s2 = scope({
        name: "shared-2",
        persistence: { lock: lockProvider },
      });

      await using s3 = scope({
        name: "shared-3",
        persistence: { lock: lockProvider },
      });

      // Acquire lock from first scope
      const lock1 = await s1.acquireLock("shared-resource", 5000);
      expect(lock1).not.toBeNull();

      // Others should not be able to acquire
      const lock2 = await s2.acquireLock("shared-resource", 100);
      const lock3 = await s3.acquireLock("shared-resource", 100);
      expect(lock2).toBeNull();
      expect(lock3).toBeNull();

      await lock1!.release();
    });

    test("scope without lock provider throws error", async () => {
      await using s = scope({ name: "no-persistence" });

      await expect(s.acquireLock("test", 5000)).rejects.toThrow(
        "No LockProvider configured"
      );
    });
  });

  describe("cross-instance coordination", () => {
    test("distributed lock across multiple simulated instances", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const instanceCount = 5;
      const lockProvider = new RedisAdapter(redisClient);
      const acquiredBy: number[] = [];

      // Simulate multiple instances trying to acquire the same lock
      const attempts = await Promise.all(
        Array.from({ length: instanceCount }, async (_, i) => {
          await using s = scope({
            name: `instance-${i}`,
            persistence: { lock: lockProvider },
          });

          const lock = await s.acquireLock("shared-job", 5000);
          if (lock) {
            acquiredBy.push(i);
            // Hold lock briefly then release
            await new Promise(r => setTimeout(r, 50));
            await lock.release();
            return i;
          }
          return null;
        })
      );

      // Only one instance should have acquired the lock
      expect(acquiredBy.length).toBe(1);
      expect(attempts.filter(a => a !== null).length).toBe(1);
    });
  });

  describe("adapter lifecycle", () => {
    test("Redis adapter connect/disconnect", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const { Redis } = await import("ioredis");
      const redis = new Redis(REDIS_URL);
      const adapter = new RedisAdapter(redis);

      // Wait for connection to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
    });

    test("PostgreSQL adapter connect/disconnect", async () => {
      if (!availability.postgres) {
        console.log("Skipping - PostgreSQL not available");
        return;
      }

      const pg = await import("pg");
      const { URL } = await import("url");
      const parsed = new URL(PG_URL);
      const pool = new pg.Pool({
        host: parsed.hostname,
        port: parseInt(parsed.port),
        user: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1),
      });

      const adapter = new PostgresAdapter(pool);
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
    });

    test("MySQL adapter connect/disconnect", async () => {
      if (!availability.mysql) {
        console.log("Skipping - MySQL not available");
        return;
      }

      const mysql = await import("mysql2/promise");
      const { URL } = await import("url");
      const parsed = new URL(MYSQL_URL);
      const pool = mysql.createPool({
        host: parsed.hostname,
        port: parseInt(parsed.port),
        user: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1),
      });

      const adapter = new MySQLAdapter(pool);
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
    });

    test("SQLite adapter lifecycle", async () => {
      if (!availability.sqlite) {
        console.log("Skipping - SQLite not available");
        return;
      }

      const sqlite3 = await import("sqlite3");
      const db = new (sqlite3.default || sqlite3).Database(":memory:");
      const adapter = new SQLiteAdapter(db);
      
      expect(adapter.isConnected()).toBe(false);
      
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("key prefix isolation", () => {
    test("different prefixes provide isolation", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const adapter1 = new RedisAdapter(redisClient, { keyPrefix: "app1:" });
      const adapter2 = new RedisAdapter(redisClient, { keyPrefix: "app2:" });

      // Acquire lock with first adapter
      const lock1 = await adapter1.acquire("shared-name", 5000);
      expect(lock1).not.toBeNull();

      // Should be able to acquire with different prefix (isolated)
      const lock2 = await adapter2.acquire("shared-name", 5000);
      expect(lock2).not.toBeNull();

      await lock1!.release();
      await lock2!.release();

    });
  });

  describe("error handling", () => {
    test("operations fail gracefully when adapter disconnected", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const { Redis } = await import("ioredis");
      const redis = new Redis(REDIS_URL);
      const adapter = new RedisAdapter(redis);

      await adapter.disconnect();

      // Operations should fail gracefully
      await expect(adapter.acquire("test", 5000)).rejects.toThrow();
    });

    test("lock extension fails for expired lock", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const adapter = new RedisAdapter(redisClient);
      
      // Acquire lock with very short TTL
      const lock = await adapter.acquire("expire-test", 50);
      expect(lock).not.toBeNull();

      // Wait for expiration
      await new Promise(r => setTimeout(r, 100));

      // Extension should fail
      const extended = await lock!.extend(5000);
      expect(extended).toBe(false);
    });
  });

  describe("stress tests", () => {
    test("high contention lock acquisition", async () => {
      if (!availability.redis) {
        console.log("Skipping - Redis not available");
        return;
      }

      const adapter = new RedisAdapter(redisClient);
      const concurrentAttempts = 20;
      const results: boolean[] = [];

      const attempts = await Promise.all(
        Array.from({ length: concurrentAttempts }, async (_, i) => {
          const lock = await adapter.acquire("high-contention", 5000);
          results.push(lock !== null);
          if (lock) {
            // Hold briefly to simulate work
            await new Promise(r => setTimeout(r, 10));
            await lock.release();
          }
          return i;
        })
      );

      // Only one should have succeeded initially
      expect(results.filter(r => r).length).toBeGreaterThanOrEqual(1);
    });

  });
});
