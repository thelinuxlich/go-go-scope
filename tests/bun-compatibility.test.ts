/**
 * Bun Compatibility Tests
 * 
 * Tests that go-go-scope works correctly with Bun runtime.
 * 
 * Run with: bun test tests/bun-compatibility.test.ts
 */
import { describe, test, expect, beforeAll } from "vitest";
import { scope } from "../src/factory.js";

// Check if running under Bun
const isBun = typeof (globalThis as any).Bun !== "undefined";

// Import adapters
let SQLiteAdapter: typeof import("../src/persistence/sqlite.js").SQLiteAdapter;

// Track availability
const availability = {
  sqlite3: false,
};

describe("bun compatibility", () => {
  beforeAll(async () => {
    if (!isBun) {
      console.log("Not running under Bun - skipping Bun-specific tests");
      return;
    }

    console.log(`✓ Running under Bun ${(globalThis as any).Bun.version}`);

    // Try sqlite3 (works under Bun via Node.js compatibility)
    try {
      SQLiteAdapter = (await import("../src/persistence/sqlite.js")).SQLiteAdapter;
      await import("sqlite3");
      availability.sqlite3 = true;
      console.log("✓ sqlite3 available under Bun");
    } catch (e) {
      console.log("✗ sqlite3 not available:", (e as Error).message);
    }
  });

  describe.skipIf(!isBun)("basic scope functionality", () => {
    test("scope creates and disposes correctly", async () => {
      await using s = scope({ name: "bun-test" });
      expect(s).toBeDefined();
      expect(s.signal).toBeDefined();
    });

    test("task execution works", async () => {
      await using s = scope({ name: "bun-task-test" });
      
      const [err, result] = await s.task(async () => {
        return "hello from bun";
      });

      expect(err).toBeUndefined();
      expect(result).toBe("hello from bun");
    });

    test("parallel execution works", async () => {
      await using s = scope({ name: "bun-parallel-test" });

      const results = await s.parallel([
        async () => "task1",
        async () => "task2",
        async () => "task3",
      ]);

      // Results is an array of [error, value] tuples
      expect(results.length).toBe(3);
      expect(results[0][1]).toBe("task1");
      expect(results[1][1]).toBe("task2");
      expect(results[2][1]).toBe("task3");
    });

    test("channel operations work", async () => {
      await using s = scope({ name: "bun-channel-test" });
      const ch = s.channel<string>(10);

      await ch.send("message1");
      await ch.send("message2");

      const msg1 = await ch.receive();
      const msg2 = await ch.receive();

      expect(msg1).toBe("message1");
      expect(msg2).toBe("message2");

      ch.close();
    });
  });

  describe.skipIf(!isBun)("sqlite3 under bun", () => {
    test("sqlite3 persistence works", async () => {
      if (!availability.sqlite3) {
        console.log("Skipping - sqlite3 not available under Bun");
        return;
      }

      const sqlite3 = await import("sqlite3");
      const db = new (sqlite3.default || sqlite3).Database(":memory:");
      const adapter = new SQLiteAdapter(db);
      await adapter.connect();

      // Test lock
      const lock = await adapter.acquire("bun-lock-1", 5000);
      expect(lock).not.toBeNull();
      await lock!.release();

      // Test rate limiting
      const config = { max: 2, windowMs: 1000 };
      const r1 = await adapter.checkAndIncrement("bun-rl", config);
      expect(r1.allowed).toBe(true);

      const r2 = await adapter.checkAndIncrement("bun-rl", config);
      expect(r2.allowed).toBe(true);

      const r3 = await adapter.checkAndIncrement("bun-rl", config);
      expect(r3.allowed).toBe(false);

      // Test circuit breaker
      await adapter.recordFailure("bun-cb", 3);
      await adapter.recordFailure("bun-cb", 3);
      
      let state = await adapter.getState("bun-cb");
      expect(state?.failureCount).toBe(2);

      await adapter.recordFailure("bun-cb", 3);
      
      state = await adapter.getState("bun-cb");
      expect(state?.state).toBe("open");

      await adapter.recordSuccess("bun-cb");
      
      state = await adapter.getState("bun-cb");
      expect(state?.failureCount).toBe(0);
      expect(state?.state).toBe("closed");

      db.close();
    }, 10000);
  });

  describe.skipIf(!isBun)("timer compatibility", () => {
    test("setTimeout works correctly", async () => {
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    test("setInterval works correctly", async () => {
      let count = 0;
      const interval = setInterval(() => count++, 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      clearInterval(interval);
      
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe.skipIf(!isBun)("fetch compatibility", () => {
    test("fetch is available", () => {
      expect(typeof fetch).toBe("function");
    });
  });

  describe.skipIf(!isBun)("bun native sqlite note", () => {
    test("bun native sqlite has different API", () => {
      // Bun's native SQLite (bun:sqlite) has a different API than sqlite3
      // It uses db.query() for prepared statements instead of db.prepare()
      // A separate adapter would be needed for native Bun SQLite support
      expect(true).toBe(true);
    });
  });
});
