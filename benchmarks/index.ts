/**
 * Benchmark suite for go-go-scope
 * Compares performance with native Promise patterns and other libraries
 */

import { performance } from "perf_hooks";
import { scope, race, exponentialBackoff } from "../dist/index.mjs";

interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  avgTime: number;
  samples: number;
}

interface BenchmarkOptions {
  warmup?: number;
  samples?: number;
  minTime?: number;
}

async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { warmup = 100, samples = 1000, minTime = 1000 } = options;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Run samples
  const times: number[] = [];
  const startTime = performance.now();

  while (
    times.length < samples &&
    performance.now() - startTime < minTime * 10
  ) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    opsPerSecond,
    avgTime,
    samples: times.length,
  };
}

async function benchTaskCreation(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Task Creation Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Native Promise
  results.push(
    await runBenchmark("Native Promise", async () => {
      const promise = Promise.resolve(42);
      await promise;
    })
  );

  // go-go-scope task
  results.push(
    await runBenchmark("go-go-scope task", async () => {
      await using s = scope();
      const task = s.task(() => Promise.resolve(42));
      await task;
    })
  );

  // go-go-scope task with timeout
  results.push(
    await runBenchmark("go-go-scope task with timeout", async () => {
      await using s = scope();
      const task = s.task(() => Promise.resolve(42), { timeout: 5000 });
      await task;
    })
  );

  return results;
}

async function benchParallelExecution(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Parallel Execution Benchmarks\n");

  const results: BenchmarkResult[] = [];
  const taskCount = 10;

  // Native Promise.all
  results.push(
    await runBenchmark("Promise.all (10 tasks)", async () => {
      const promises = Array.from({ length: taskCount }, (_, i) =>
        Promise.resolve(i)
      );
      await Promise.all(promises);
    })
  );

  // go-go-scope parallel
  results.push(
    await runBenchmark("go-go-scope parallel (10 tasks)", async () => {
      await using s = scope();
      const factories = Array.from({ length: taskCount }, (_, i) => () =>
        Promise.resolve(i)
      );
      await s.parallel(factories);
    })
  );

  // go-go-scope parallel with concurrency limit
  results.push(
    await runBenchmark(
      "go-go-scope parallel with concurrency (10 tasks, limit 3)",
      async () => {
        await using s = scope({ concurrency: 3 });
        const factories = Array.from({ length: taskCount }, (_, i) => () =>
          Promise.resolve(i)
        );
        await s.parallel(factories);
      }
    )
  );

  return results;
}

async function benchRace(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Race Benchmarks\n");

  const results: BenchmarkResult[] = [];
  const taskCount = 5;

  // Native Promise.race
  results.push(
    await runBenchmark("Promise.race (5 tasks)", async () => {
      const promises = Array.from({ length: taskCount }, (_, i) =>
        Promise.resolve(i)
      );
      await Promise.race(promises);
    })
  );

  // go-go-scope race
  results.push(
    await runBenchmark("go-go-scope race (5 tasks)", async () => {
      const factories = Array.from({ length: taskCount }, (_, i) => () =>
        Promise.resolve(i)
      );
      await race(factories);
    })
  );

  return results;
}

async function benchCancellation(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Cancellation Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Native AbortController
  results.push(
    await runBenchmark("Native AbortController", async () => {
      const controller = new AbortController();
      const promise = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(controller.signal.reason);
        });
      });
      controller.abort();
      try {
        await promise;
      } catch {
        // Expected
      }
    })
  );

  // go-go-scope cancellation
  results.push(
    await runBenchmark("go-go-scope cancellation", async () => {
      await using s = scope();
      s.task(({ signal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason);
          });
        });
      });
      // Scope auto-cancels on exit
    })
  );

  return results;
}

async function benchChannels(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Channel Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Channel send/receive
  results.push(
    await runBenchmark("Channel send/receive", async () => {
      await using s = scope();
      const ch = s.channel<number>(10);

      s.task(async () => {
        await ch.send(42);
      });

      await ch.receive();
      ch.close();
    })
  );

  // Broadcast channel
  results.push(
    await runBenchmark("Broadcast send/receive", async () => {
      await using s = scope();
      const broadcast = s.broadcast<number>();

      const sub = broadcast.subscribe();
      const iter = sub[Symbol.asyncIterator]();

      await broadcast.send(42);
      await iter.next();
      broadcast.close();
    })
  );

  return results;
}

async function benchResourcePool(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Resource Pool Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Pool acquire/release
  results.push(
    await runBenchmark("ResourcePool acquire/release", async () => {
      await using s = scope();
      const pool = s.pool({
        create: async () => ({ id: Math.random() }),
        destroy: async () => {},
        max: 5,
      });

      const resource = await pool.acquire();
      await pool.release(resource);
    })
  );

  // Pool execute
  results.push(
    await runBenchmark("ResourcePool execute", async () => {
      await using s = scope();
      const pool = s.pool({
        create: async () => ({ id: Math.random() }),
        destroy: async () => {},
        max: 5,
      });

      await pool.execute(async (resource) => {
        return resource.id;
      });
    })
  );

  return results;
}

async function benchBatch(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Batch Processing Benchmarks\n");

  const results: BenchmarkResult[] = [];
  const items = Array.from({ length: 100 }, (_, i) => i);

  // Native Promise.all
  results.push(
    await runBenchmark("Promise.all (100 items)", async () => {
      await Promise.all(items.map((i) => Promise.resolve(i * 2)));
    })
  );

  // go-go-scope parallel
  results.push(
    await runBenchmark("go-go-scope parallel (100 items)", async () => {
      await using s = scope();
      await s.parallel(
        items.map((item) => () => Promise.resolve(item * 2))
      );
    })
  );

  // go-go-scope parallel with concurrency
  results.push(
    await runBenchmark("go-go-scope parallel with concurrency (100 items, limit 5)", async () => {
      await using s = scope();
      await s.parallel(
        items.map((item) => () => Promise.resolve(item * 2)),
        { concurrency: 5 }
      );
    })
  );

  return results;
}

async function benchRetry(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Retry Strategy Benchmarks\n");

  const results: BenchmarkResult[] = [];
  let attemptCount = 0;

  // Fixed delay retry
  results.push(
    await runBenchmark("Retry with fixed delay", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        {
          retry: {
            maxRetries: 3,
            delay: 0, // No delay for benchmark
          },
        }
      );
    })
  );

  // Exponential backoff
  results.push(
    await runBenchmark("Retry with exponential backoff", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        {
          retry: {
            maxRetries: 3,
            delay: exponentialBackoff({ initial: 1, max: 10 }),
          },
        }
      );
    })
  );

  return results;
}

async function benchChannelHelpers(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Channel Helper Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Channel map
  results.push(
    await runBenchmark("Channel.map()", async () => {
      const ch = new (await import("../dist/index.mjs")).Channel<number>(10);
      const mapped = ch.map((x) => x * 2);

      await ch.send(21);
      await mapped.receive();
      ch.close();
      await mapped[Symbol.asyncDispose]();
    })
  );

  // Channel filter
  results.push(
    await runBenchmark("Channel.filter()", async () => {
      const ch = new (await import("../dist/index.mjs")).Channel<number>(10);
      const filtered = ch.filter((x) => x % 2 === 0);

      await ch.send(2);
      await filtered.receive();
      ch.close();
      await filtered[Symbol.asyncDispose]();
    })
  );

  // Channel reduce
  results.push(
    await runBenchmark("Channel.reduce()", async () => {
      const ch = new (await import("../dist/index.mjs")).Channel<number>(10);

      const sumPromise = ch.reduce((a, b) => a + b, 0);

      await ch.send(1);
      await ch.send(2);
      await ch.send(3);
      ch.close();

      await sumPromise;
    })
  );

  return results;
}

async function benchDebugTree(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Debug Visualization Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Debug tree generation
  results.push(
    await runBenchmark("debugTree() with 10 tasks", async () => {
      await using s = scope({ name: "parent" });

      for (let i = 0; i < 10; i++) {
        s.task(() => Promise.resolve(i));
      }

      s.debugTree();
    })
  );

  // Debug tree with child scopes
  results.push(
    await runBenchmark("debugTree() with nested scopes", async () => {
      await using parent = scope({ name: "parent" });

      for (let i = 0; i < 5; i++) {
        await using child = scope({ parent, name: `child-${i}` });
        child.task(() => Promise.resolve(i));
      }

      parent.debugTree();
    })
  );

  // Mermaid format generation
  results.push(
    await runBenchmark("debugTree({ format: 'mermaid' })", async () => {
      await using s = scope({ name: "parent" });

      for (let i = 0; i < 10; i++) {
        s.task(() => Promise.resolve(i));
      }

      s.debugTree({ format: "mermaid" });
    })
  );

  return results;
}

async function benchExternalComparisons(): Promise<BenchmarkResult[]> {
  console.log("\n📊 External Library Comparisons\n");

  const results: BenchmarkResult[] = [];
  const items = Array.from({ length: 50 }, (_, i) => i);

  // Simulated p-queue pattern with scope concurrency
  results.push(
    await runBenchmark("scope concurrency (limit: 5)", async () => {
      await using s = scope({ concurrency: 5 });
      
      await Promise.all(
        items.map(async (i) => {
          const [err, result] = await s.task(async () => {
            return Promise.resolve(i * 2);
          });
          if (err) throw err;
          return result;
        })
      );
    })
  );

  // go-go-scope parallel equivalent
  results.push(
    await runBenchmark("go-go-scope parallel (concurrency: 5)", async () => {
      await using s = scope();
      await s.parallel(
        items.map((item) => () => Promise.resolve(item * 2)),
        { concurrency: 5 }
      );
    })
  );

  // Simulated RxJS pattern with channels
  results.push(
    await runBenchmark("RxJS-like pattern with channels", async () => {
      await using s = scope();
      const input = s.channel<number>(50);
      const output = s.channel<number>(50);

      // Producer
      s.task(async () => {
        for (const item of items) {
          await input.send(item);
        }
        input.close();
      });

      // Transform pipeline (map + filter)
      s.task(async () => {
        const mapped = input.map((x) => x * 2).filter((x) => x > 20);
        for await (const val of mapped) {
          await output.send(val);
        }
        output.close();
      });

      // Consumer
      const results: number[] = [];
      for await (const val of output) {
        results.push(val);
      }
    })
  );

  // Promise chain pattern
  results.push(
    await runBenchmark("Promise chain pattern", async () => {
      const results: number[] = [];
      for (const item of items) {
        const result = await Promise.resolve(item)
          .then((x) => x * 2)
          .then((x) => (x > 20 ? x : null));
        if (result !== null) {
          results.push(result);
        }
      }
    })
  );

  return results;
}

async function benchHistogramMetrics(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Histogram Metrics Benchmarks\n");

  const results: BenchmarkResult[] = [];

  // Histogram recording
  results.push(
    await runBenchmark("Histogram record (100 values)", async () => {
      await using s = scope({ metrics: true });
      const histogram = s.histogram("response_time")!;

      for (let i = 0; i < 100; i++) {
        histogram.record(Math.random() * 1000);
      }
    })
  );

  // Histogram snapshot
  results.push(
    await runBenchmark("Histogram snapshot (1000 values)", async () => {
      await using s = scope({ metrics: true });
      const histogram = s.histogram("response_time")!;

      for (let i = 0; i < 1000; i++) {
        histogram.record(Math.random() * 1000);
      }

      histogram.snapshot();
    })
  );

  // Metrics with histograms
  results.push(
    await runBenchmark("scope.metrics() with histograms", async () => {
      await using s = scope({ metrics: true });
      const histogram = s.histogram("response_time")!;

      for (let i = 0; i < 100; i++) {
        histogram.record(Math.random() * 1000);
      }

      s.metrics();
    })
  );

  return results;
}

async function benchRetryStrategies(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Retry Strategy Shorthand Benchmarks\n");

  const results: BenchmarkResult[] = [];
  let attemptCount = 0;

  // Shorthand exponential
  results.push(
    await runBenchmark("Retry 'exponential' shorthand", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        { retry: "exponential" }
      );
    })
  );

  // Shorthand linear
  results.push(
    await runBenchmark("Retry 'linear' shorthand", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        { retry: "linear" }
      );
    })
  );

  // Shorthand fixed
  results.push(
    await runBenchmark("Retry 'fixed' shorthand", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        { retry: "fixed" }
      );
    })
  );

  // Full options (for comparison)
  results.push(
    await runBenchmark("Retry with full options", async () => {
      attemptCount = 0;
      await using s = scope();
      await s.task(
        () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error("fail");
          return Promise.resolve("success");
        },
        {
          retry: {
            maxRetries: 3,
            delay: exponentialBackoff({ initial: 100, max: 1000 }),
          },
        }
      );
    })
  );

  return results;
}

function printResults(results: BenchmarkResult[]) {
  console.log("─".repeat(70));
  console.log(
    `${"Benchmark".padEnd(40)} ${"Ops/sec".padStart(12)} ${"Avg (ms)".padStart(12)}`
  );
  console.log("─".repeat(70));

  for (const result of results) {
    console.log(
      `${result.name.padEnd(40)} ${result.opsPerSecond.toFixed(2).padStart(12)} ${result.avgTime.toFixed(4).padStart(12)}`
    );
  }
  console.log("─".repeat(70));
  console.log();
}

async function main() {
  console.log("🚀 go-go-scope Benchmark Suite v1.3.0\n");
  console.log("Comparing performance with native Promise patterns\n");

  const allResults: BenchmarkResult[] = [];

  allResults.push(...(await benchTaskCreation()));
  allResults.push(...(await benchParallelExecution()));
  allResults.push(...(await benchRace()));
  allResults.push(...(await benchCancellation()));
  allResults.push(...(await benchChannels()));
  allResults.push(...(await benchResourcePool()));
  allResults.push(...(await benchBatch()));
  allResults.push(...(await benchRetry()));
  allResults.push(...(await benchChannelHelpers()));
  allResults.push(...(await benchDebugTree()));
  allResults.push(...(await benchExternalComparisons()));
  allResults.push(...(await benchHistogramMetrics()));
  allResults.push(...(await benchRetryStrategies()));

  console.log("\n\n📈 Overall Results\n");
  printResults(allResults);

  // Summary
  console.log("💡 Summary\n");

  const nativePromise = allResults.find((r) => r.name === "Native Promise");
  const scopeTask = allResults.find((r) => r.name === "go-go-scope task");

  if (nativePromise && scopeTask) {
    const overhead = scopeTask.avgTime / nativePromise.avgTime;
    console.log(`Task creation overhead: ${overhead.toFixed(2)}x`);
  }

  const nativeAll = allResults.find((r) => r.name === "Promise.all (10 tasks)");
  const scopeParallel = allResults.find(
    (r) => r.name === "go-go-scope parallel (10 tasks)"
  );

  if (nativeAll && scopeParallel) {
    const overhead = scopeParallel.avgTime / nativeAll.avgTime;
    console.log(`Parallel execution overhead: ${overhead.toFixed(2)}x`);
  }

  // New v1.3.0 features summary
  console.log("\n🆕 v1.3.0 Features\n");

  const batchResult = allResults.find(
    (r) => r.name === "go-go-scope parallel (100 items)"
  );
  if (batchResult) {
    console.log(`Parallel: ${batchResult.opsPerSecond.toFixed(0)} ops/sec`);
  }

  const retryResult = allResults.find(
    (r) => r.name === "Retry with exponential backoff"
  );
  if (retryResult) {
    console.log(`Retry with backoff: ${retryResult.opsPerSecond.toFixed(0)} ops/sec`);
  }

  const debugTreeResult = allResults.find(
    (r) => r.name === "debugTree() with 10 tasks"
  );
  if (debugTreeResult) {
    console.log(`Debug tree generation: ${debugTreeResult.opsPerSecond.toFixed(0)} ops/sec`);
  }

  console.log("\n✅ Benchmarks complete!");
}

main().catch(console.error);
