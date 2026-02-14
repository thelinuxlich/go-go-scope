/**
 * Benchmark suite for go-go-scope
 * Compares performance with native Promise patterns and other libraries
 */

import { performance } from "perf_hooks";
import { scope, parallel, race } from "../dist/index.mjs";

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
  console.log("🚀 go-go-scope Benchmark Suite\n");
  console.log("Comparing performance with native Promise patterns\n");

  const allResults: BenchmarkResult[] = [];

  allResults.push(...(await benchTaskCreation()));
  allResults.push(...(await benchParallelExecution()));
  allResults.push(...(await benchRace()));
  allResults.push(...(await benchCancellation()));
  allResults.push(...(await benchChannels()));
  allResults.push(...(await benchResourcePool()));

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

  console.log("\n✅ Benchmarks complete!");
}

main().catch(console.error);
