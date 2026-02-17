/**
 * Distributed Lock TTL Analysis Tests
 * 
 * This test demonstrates how TTL expiration works when a node goes down
 * and comes back up across different databases.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { LockProvider } from "../src/persistence/types.js";

// Connection strings
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";
const PG_URL = process.env.PG_URL || "postgresql://test:test@localhost:5433/test";
const MYSQL_URL = process.env.MYSQL_URL || "mysql://test:test@localhost:3307/test";

// Track availability and adapters
const availability = {
  redis: false,
  postgres: false,
  mysql: false,
};

// Connection pools/clients
let redisClient: any;
let pgPool: any;
let mysqlPool: any;

// Import adapters
let RedisAdapter: typeof import("../src/persistence/redis.js").RedisAdapter;
let PostgresAdapter: typeof import("../src/persistence/postgres.js").PostgresAdapter;
let MySQLAdapter: typeof import("../src/persistence/mysql.js").MySQLAdapter;

describe("distributed lock TTL analysis", () => {
  // Connect to databases in beforeAll
  beforeAll(async () => {
    // Redis
    try {
      const Redis = await import("ioredis");
      redisClient = new Redis.default(REDIS_URL);
      await redisClient.ping();
      RedisAdapter = (await import("../src/persistence/redis.js")).RedisAdapter;
      availability.redis = true;
    } catch (e) {
      console.log("Redis not available:", (e as Error).message);
    }

    // PostgreSQL
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
      PostgresAdapter = (await import("../src/persistence/postgres.js")).PostgresAdapter;
      availability.postgres = true;
    } catch (e) {
      console.log("PostgreSQL not available:", (e as Error).message);
    }

    // MySQL
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
      MySQLAdapter = (await import("../src/persistence/mysql.js")).MySQLAdapter;
      availability.mysql = true;
    } catch (e) {
      console.log("MySQL not available:", (e as Error).message);
    }
    
    console.log("Database availability:", availability);
  });

  afterAll(async () => {
    // Close connections with individual timeouts
    const closeRedis = redisClient 
      ? Promise.race([redisClient.quit(), new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 5000))])
      : Promise.resolve();
    
    const closePg = pgPool 
      ? Promise.race([pgPool.end(), new Promise((_, reject) => setTimeout(() => reject(new Error('PG timeout')), 5000))])
      : Promise.resolve();
    
    const closeMysql = mysqlPool 
      ? Promise.race([mysqlPool.end(), new Promise((_, reject) => setTimeout(() => reject(new Error('MySQL timeout')), 5000))])
      : Promise.resolve();
    
    await Promise.allSettled([closeRedis, closePg, closeMysql]);
  }, 20000);

  /**
   * TTL Expiration Test
   * Simulates: Node acquires lock -> crashes -> lock expires -> another node acquires
   */
  test("Redis: lock expires after TTL and can be reacquired", async () => {
    if (!availability.redis) {
      console.log("Skipping - Redis not available");
      return;
    }
    
    const provider = new RedisAdapter(redisClient);
    const lockKey = `ttl-test-redis-${Date.now()}`;
    const ttlMs = 500;

    // Step 1: "Node A" acquires the lock
    const lockA = await provider.acquire(lockKey, ttlMs);
    expect(lockA).not.toBeNull();

    // Step 2: Immediately try to acquire from "Node B" - should fail
    const lockBImmediate = await provider.acquire(lockKey, ttlMs);
    expect(lockBImmediate).toBeNull();

    // Step 3: Wait for TTL to expire
    await new Promise(r => setTimeout(r, ttlMs + 100));

    // Step 4: "Node B" tries again - should succeed now
    const lockB = await provider.acquire(lockKey, ttlMs);
    expect(lockB).not.toBeNull();

    // Cleanup
    await lockB!.release();
  }, 10000);

  test("PostgreSQL: lock expires after TTL and can be reacquired", async () => {
    if (!availability.postgres) {
      console.log("Skipping - PostgreSQL not available");
      return;
    }
    
    const adapter = new PostgresAdapter(pgPool);
    await adapter.connect();
    
    const lockKey = `ttl-test-pg-${Date.now()}`;
    const ttlMs = 500;

    const lockA = await adapter.acquire(lockKey, ttlMs);
    expect(lockA).not.toBeNull();

    const lockBImmediate = await adapter.acquire(lockKey, ttlMs);
    expect(lockBImmediate).toBeNull();

    await new Promise(r => setTimeout(r, ttlMs + 100));

    const lockB = await adapter.acquire(lockKey, ttlMs);
    expect(lockB).not.toBeNull();

    await lockB!.release();
  }, 10000);

  test("MySQL: lock expires after TTL and can be reacquired", async () => {
    if (!availability.mysql) {
      console.log("Skipping - MySQL not available");
      return;
    }
    
    // Create a new pool with UTC timezone for consistent testing
    const mysql = await import("mysql2/promise");
    const { URL } = await import("url");
    const parsed = new URL(MYSQL_URL);
    const utcPool = mysql.createPool({
      host: parsed.hostname,
      port: parseInt(parsed.port),
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      timezone: "+00:00", // Force UTC
    });
    const adapter = new MySQLAdapter(utcPool);
    await adapter.connect();
    
    const lockKey = `ttl-test-mysql-${Date.now()}`;
    const ttlMs = 2000; // Use 2 second TTL for MySQL to account for timing issues

    const lockA = await adapter.acquire(lockKey, ttlMs);
    expect(lockA).not.toBeNull();

    const lockBImmediate = await adapter.acquire(lockKey, ttlMs);
    expect(lockBImmediate).toBeNull();

    await new Promise(r => setTimeout(r, ttlMs + 500));

    const lockB = await adapter.acquire(lockKey, ttlMs);
    expect(lockB).not.toBeNull();

    await lockB!.release();
    await utcPool.end();
  }, 20000);

  /**
   * isValid() behavior test
   */
  test("Redis: isValid() correctly tracks expiration", async () => {
    if (!availability.redis) {
      console.log("Skipping - Redis not available");
      return;
    }
    
    const provider = new RedisAdapter(redisClient);
    const lockKey = `validity-test-redis-${Date.now()}`;
    const ttlMs = 500;

    const lock = await provider.acquire(lockKey, ttlMs);
    expect(lock).not.toBeNull();
    expect(await lock!.isValid()).toBe(true);

    await new Promise(r => setTimeout(r, ttlMs + 100));

    expect(await lock!.isValid()).toBe(false);
  }, 5000);

  test("PostgreSQL: isValid() correctly tracks expiration", async () => {
    if (!availability.postgres) {
      console.log("Skipping - PostgreSQL not available");
      return;
    }
    
    const adapter = new PostgresAdapter(pgPool);
    await adapter.connect();
    
    const lockKey = `validity-test-pg-${Date.now()}`;
    const ttlMs = 500;

    const lock = await adapter.acquire(lockKey, ttlMs);
    expect(lock).not.toBeNull();
    expect(await lock!.isValid()).toBe(true);

    await new Promise(r => setTimeout(r, ttlMs + 100));

    expect(await lock!.isValid()).toBe(false);
  }, 5000);

  test("MySQL: isValid() correctly tracks expiration", async () => {
    if (!availability.mysql) {
      console.log("Skipping - MySQL not available");
      return;
    }
    
    // Create a new pool with UTC timezone for consistent testing
    const mysql = await import("mysql2/promise");
    const { URL } = await import("url");
    const parsed = new URL(MYSQL_URL);
    const utcPool = mysql.createPool({
      host: parsed.hostname,
      port: parseInt(parsed.port),
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      timezone: "+00:00", // Force UTC
    });
    const adapter = new MySQLAdapter(utcPool);
    await adapter.connect();
    
    const lockKey = `validity-test-mysql-${Date.now()}`;
    // Use a shorter TTL with generous buffer for more reliable testing
    const ttlMs = 800;

    const lock = await adapter.acquire(lockKey, ttlMs);
    expect(lock).not.toBeNull();
    expect(await lock!.isValid()).toBe(true);

    // Wait for the lock to expire with a generous buffer
    await new Promise(r => setTimeout(r, ttlMs + 600));

    expect(await lock!.isValid()).toBe(false);
    await utcPool.end();
  }, 10000);
});
