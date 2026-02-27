/**
 * Worker Thread Pool Limits Example
 * 
 * Demonstrates how worker thread pools handle many tasks and how to
 * configure the pool size for optimal performance.
 * 
 * Run with: npx tsx examples/worker-thread-limits.ts
 */

import { scope } from "go-go-scope";

// CPU-intensive task (calculates sum of square roots)
function cpuTask(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.sqrt(i);
  }
  return sum;
}

async function demonstrateDefaultBehavior() {
  console.log("\n=== Default Pool Behavior ===");
  console.log("Pool size defaults to: os.cpus().length - 1\n");

  await using s = scope();

  const taskCount = 20;
  const start = Date.now();

  // Create 20 tasks - they will queue and execute with limited concurrency
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    const task = s.task(
      ((index) => () => {
        const taskStart = Date.now();
        const result = cpuTask(5000000); // ~10-20ms of work
        const duration = Date.now() - taskStart;
        return { index, duration, result };
      })(i),
      { worker: true }
    );
    tasks.push(task);
  }

  console.log(`Spawned ${taskCount} tasks`);

  // Wait for all tasks to complete
  const results = await Promise.all(tasks);
  const elapsed = Date.now() - start;

  // Count successes
  const successes = results.filter(([err]) => !err).length;
  console.log(`✓ Completed: ${successes}/${taskCount} tasks`);
  console.log(`⏱ Total time: ${elapsed}ms`);
  console.log(`📊 Average per task: ${(elapsed / taskCount).toFixed(1)}ms`);

  // Show that tasks executed in batches
  const durations = results
    .filter(([err]) => !err)
    .map(([, r]) => r?.duration);
  console.log(`⚡ Average CPU time per task: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)}ms`);
  console.log(`📝 Note: Total time > sum of CPU time because tasks run in parallel with limited workers`);
}

async function demonstrateCustomPoolSize() {
  console.log("\n=== Custom Pool Size (2 workers) ===\n");

  // Create scope with custom worker pool size
  await using s = scope({
    workerPool: {
      size: 2,           // Only 2 workers
      idleTimeout: 5000, // Keep idle for 5 seconds
    },
  });

  const taskCount = 10;
  const start = Date.now();

  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    const task = s.task(
      ((index) => () => {
        const taskStart = Date.now();
        const result = cpuTask(5000000);
        const duration = Date.now() - taskStart;
        return { index, duration, result };
      })(i),
      { worker: true }
    );
    tasks.push(task);
  }

  console.log(`Spawned ${taskCount} tasks with pool size = 2`);

  const results = await Promise.all(tasks);
  const elapsed = Date.now() - start;

  const successes = results.filter(([err]) => !err).length;
  console.log(`✓ Completed: ${successes}/${taskCount} tasks`);
  console.log(`⏱ Total time: ${elapsed}ms`);
  console.log(`📊 With only 2 workers, tasks execute in ~${Math.ceil(taskCount / 2)} batches`);
}

async function demonstrateLargePool() {
  console.log("\n=== Large Pool Size (8 workers) ===\n");

  await using s = scope({
    workerPool: {
      size: 8, // More workers for higher parallelism
    },
  });

  const taskCount = 16;
  const start = Date.now();

  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    const task = s.task(
      ((index) => () => {
        const taskStart = Date.now();
        const result = cpuTask(5000000);
        const duration = Date.now() - taskStart;
        return { index, duration, result };
      })(i),
      { worker: true }
    );
    tasks.push(task);
  }

  console.log(`Spawned ${taskCount} tasks with pool size = 8`);

  const results = await Promise.all(tasks);
  const elapsed = Date.now() - start;

  const successes = results.filter(([err]) => !err).length;
  console.log(`✓ Completed: ${successes}/${taskCount} tasks`);
  console.log(`⏱ Total time: ${elapsed}ms`);
  console.log(`📊 With 8 workers, tasks execute in ~${Math.ceil(taskCount / 8)} batches (faster!)`);
}

async function demonstrateMemoryEfficiency() {
  console.log("\n=== Memory Efficiency with Queuing ===\n");

  await using s = scope({
    workerPool: {
      size: 2, // Small pool
    },
  });

  console.log("Creating 100 tasks with only 2 workers...");
  console.log("Tasks will queue in memory and execute as workers become available.");

  const taskCount = 100;
  const start = Date.now();

  // Create 100 tasks - they queue, not all run at once
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    const task = s.task(
      ((index) => () => {
        // Quick task
        let sum = 0;
        for (let j = 0; j < 100000; j++) sum += j;
        return { index, sum };
      })(i),
      { worker: true }
    );
    tasks.push(task);
  }

  console.log(`Spawned ${taskCount} tasks`);
  console.log("Memory usage remains low because only 2 workers run at a time");

  const results = await Promise.all(tasks);
  const elapsed = Date.now() - start;

  const successes = results.filter(([err]) => !err).length;
  console.log(`✓ Completed: ${successes}/${taskCount} tasks`);
  console.log(`⏱ Total time: ${elapsed}ms`);
  console.log(`📝 With only 2 workers, 100 tasks execute in 50 sequential batches`);
}

async function demonstratePoolInheritance() {
  console.log("\n=== Worker Pool Inheritance ===\n");

  // Parent scope with custom pool
  await using parent = scope({
    workerPool: { size: 4 },
  });

  // Child scope inherits parent's pool configuration
  await using child = scope({ parent });

  console.log("Parent scope has worker pool with size = 4");
  console.log("Child scope inherits the same pool configuration");

  // Both use the same pool settings
  const [parentResult] = await parent.task(
    () => ({ message: "Parent task" }),
    { worker: true }
  );

  const [childResult] = await child.task(
    () => ({ message: "Child task" }),
    { worker: true }
  );

  console.log("Parent task result:", parentResult?.message);
  console.log("Child task result:", childResult?.message);
  console.log("✓ Both scopes share the same worker pool configuration");
}

// Run all demonstrations
async function main() {
  console.log("🔥 Worker Thread Pool Limits Demo");
  console.log("==================================");
  console.log("\nThis demo shows how worker pools handle many tasks:");
  console.log("• Tasks queue when all workers are busy");
  console.log("• Pool size controls maximum parallelism");
  console.log("• Default size = CPU count - 1");

  try {
    await demonstrateDefaultBehavior();
    await demonstrateCustomPoolSize();
    await demonstrateLargePool();
    await demonstrateMemoryEfficiency();
    await demonstratePoolInheritance();

    console.log("\n✅ All demonstrations complete!");
    console.log("\nKey Takeaways:");
    console.log("• Use default pool size for most cases (CPU count - 1)");
    console.log("• Reduce pool size to limit resource usage");
    console.log("• Increase pool size for more parallelism (if you have CPU cores)");
    console.log("• Tasks automatically queue - no manual batching needed");
  } catch (error) {
    console.error("\n❌ Demo failed:", error);
    process.exit(1);
  }
}

main();
