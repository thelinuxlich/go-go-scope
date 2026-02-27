/**
 * Worker Threads Example
 * 
 * Demonstrates CPU-intensive task execution using worker threads
 * for true parallelism without blocking the event loop.
 * 
 * Run with: npx tsx examples/worker-threads.ts
 */

import { scope, parallel, WorkerPool } from "go-go-scope";

// CPU-intensive Fibonacci calculation
function fibonacci(n: number): number {
  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
}

// Example 1: Using scope.task() with workers
async function example1_ScopeTask() {
  console.log("\n=== Example 1: scope.task() with workers ===");
  
  await using s = scope();
  
  // Run CPU-intensive task in worker thread
  const [err, result] = await s.task(
    () => {
      // This runs in a worker thread - function must be self-contained
      function fib(n: number): number {
        return n < 2 ? n : fib(n - 1) + fib(n - 2);
      }
      return fib(35);
    },
    { worker: true, timeout: 30000 }
  );
  
  if (err) {
    console.error("Failed:", err.message);
  } else {
    console.log(`Fibonacci(35) = ${result}`);
  }
}

// Example 2: Using parallel() with workers
async function example2_ParallelWorkers() {
  console.log("\n=== Example 2: parallel() with workers ===");
  
  const start = Date.now();
  
  const results = await parallel(
    [
      () => {
        function fib(n: number): number {
          return n < 2 ? n : fib(n - 1) + fib(n - 2);
        }
        return fib(33);
      },
      () => {
        function fib(n: number): number {
          return n < 2 ? n : fib(n - 1) + fib(n - 2);
        }
        return fib(34);
      },
      () => {
        function fib(n: number): number {
          return n < 2 ? n : fib(n - 1) + fib(n - 2);
        }
        return fib(35);
      },
    ],
    { workers: { threads: 3 } }  // Use 3 worker threads
  );
  
  const duration = Date.now() - start;
  
  console.log(`Completed in ${duration}ms:`);
  results.forEach(([err, result], i) => {
    if (err) console.error(`  Task ${i + 1} failed:`, err.message);
    else console.log(`  Task ${i + 1} result: ${result}`);
  });
}

// Example 3: Using WorkerPool directly
async function example3_WorkerPool() {
  console.log("\n=== Example 3: WorkerPool directly ===");
  
  // Create a worker pool with 2 workers
  await using pool = new WorkerPool({
    size: 2,
    idleTimeout: 10000,  // Keep workers alive for 10 seconds
  });
  
  // Execute single task
  const [err1, result1] = await pool.execute(
    (n: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += Math.sqrt(i);
      }
      return sum;
    },
    10000000
  );
  
  if (err1) console.error("Single task failed:", err1.message);
  else console.log(`Sum of square roots: ${result1.toFixed(2)}`);
  
  // Execute batch of tasks
  const batchResults = await pool.executeBatch(
    [1000000, 2000000, 3000000, 4000000],
    (n: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += Math.cbrt(i);  // Cube root
      }
      return sum;
    },
    { ordered: true }  // Results in same order as input
  );
  
  console.log("Batch results:");
  batchResults.forEach(([err, result], i) => {
    if (err) console.error(`  Batch ${i + 1} failed:`, err.message);
    else console.log(`  Batch ${i + 1}: ${result.toFixed(2)}`);
  });
}

// Example 4: Passing data to workers (IIFE pattern)
async function example4_DataPassing() {
  console.log("\n=== Example 4: Passing data to workers ===");
  
  await using s = scope();
  
  // Values to pass to worker
  const base = 10;
  const exponent = 5;
  
  // Use IIFE to capture values
  const [err, result] = await s.task(
    ((base, exp) => () => {
      // Self-contained function with captured values
      let result = 1;
      for (let i = 0; i < exp; i++) {
        result *= base;
      }
      return result;
    })(base, exponent),
    { worker: true }
  );
  
  if (err) console.error("Failed:", err.message);
  else console.log(`${base}^${exponent} = ${result}`);
}

// Example 5: Error handling in workers
async function example5_ErrorHandling() {
  console.log("\n=== Example 5: Error handling in workers ===");
  
  await using s = scope();
  
  const [err, result] = await s.task(
    () => {
      function calculate(n: number): number {
        if (n < 0) {
          throw new Error(`Invalid input: ${n} (must be non-negative)`);
        }
        return n * n;
      }
      return calculate(-5);  // This will throw
    },
    { worker: true }
  );
  
  if (err) {
    console.log("Caught error from worker:", err.message);
  } else {
    console.log("Result:", result);
  }
}

// Example 6: Performance comparison
async function example6_PerformanceComparison() {
  console.log("\n=== Example 6: Performance comparison ===");
  
  const iterations = 10000000;
  const workerCount = 4;
  
  // Without workers (sequential in main thread)
  console.log("Running without workers...");
  const start1 = Date.now();
  await using s1 = scope();
  for (let i = 0; i < workerCount; i++) {
    await s1.task(() => {
      let sum = 0;
      for (let j = 0; j < iterations; j++) {
        sum += Math.sqrt(j);
      }
      return sum;
    });
  }
  const duration1 = Date.now() - start1;
  console.log(`Without workers: ${duration1}ms`);
  
  // With workers (parallel execution)
  console.log("Running with workers...");
  const start2 = Date.now();
  await using s2 = scope();
  await s2.parallel(
    Array(workerCount).fill(() => {
      let sum = 0;
      for (let j = 0; j < iterations; j++) {
        sum += Math.sqrt(j);
      }
      return sum;
    }),
    { workers: workerCount }
  );
  const duration2 = Date.now() - start2;
  console.log(`With workers: ${duration2}ms`);
  
  const speedup = (duration1 / duration2).toFixed(2);
  console.log(`Speedup: ${speedup}x`);
}

// Run all examples
async function main() {
  console.log("🔥 go-go-scope Worker Threads Examples");
  console.log("======================================");
  
  try {
    await example1_ScopeTask();
    await example2_ParallelWorkers();
    await example3_WorkerPool();
    await example4_DataPassing();
    await example5_ErrorHandling();
    await example6_PerformanceComparison();
    
    console.log("\n✅ All examples completed!");
  } catch (error) {
    console.error("\n❌ Example failed:", error);
    process.exit(1);
  }
}

main();
