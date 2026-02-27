/**
 * Scheduler with Worker Threads Example
 * 
 * Demonstrates running CPU-intensive scheduled jobs in worker threads
 * to avoid blocking the scheduler's event loop.
 * 
 * This example uses an in-memory adapter for demonstration.
 * In production, use Redis or PostgreSQL for persistence.
 * 
 * Run with: npx tsx examples/scheduler-worker-jobs.ts
 */

import { Scheduler, InMemoryAdapter } from "@go-go-scope/scheduler";

// Create scheduler with in-memory adapter (use Redis/PostgreSQL in production)
const adapter = new InMemoryAdapter();

const scheduler = new Scheduler({
  persistence: adapter,
  pollInterval: 1000,  // Check for jobs every second
});

// Track job executions
let mlJobsCompleted = 0;
let reportJobsCompleted = 0;

// Define a CPU-intensive ML analysis schedule
scheduler.createSchedule("ml-analysis", {
  // Run every minute for demo purposes
  // In production: cron: "0 2 * * *" (daily at 2 AM)
  interval: 60000,
  data: { 
    model: "recommendation-v2",
    dataset: "user-behavior"
  }
});

// Register handler to run in worker thread
scheduler.onSchedule("ml-analysis", async (job) => {
  console.log(`[${new Date().toISOString()}] Starting ML analysis...`);
  console.log(`  Model: ${job.data.model}`);
  console.log(`  Dataset: ${job.data.dataset}`);
  
  // Simulate CPU-intensive ML work
  // In a real scenario, this would train a model or run inference
  const start = Date.now();
  
  // Heavy computation
  function processData() {
    let result = 0;
    for (let i = 0; i < 10000000; i++) {
      result += Math.sin(i) * Math.cos(i);
    }
    return result;
  }
  
  const result = processData();
  const duration = Date.now() - start;
  
  mlJobsCompleted++;
  console.log(`[${new Date().toISOString()}] ML analysis complete in ${duration}ms`);
  console.log(`  Result: ${result.toFixed(4)}`);
  console.log(`  Total ML jobs completed: ${mlJobsCompleted}`);
  
  // Store results (in production, write to database)
  return { processed: 10000000, duration };
}, { worker: true });  // ← Run in worker thread!

// Define a data aggregation schedule (also CPU-intensive)
scheduler.createSchedule("daily-report", {
  interval: 45000,  // Every 45 seconds for demo
  data: {
    reportType: "analytics",
    metrics: ["views", "clicks", "conversions"]
  }
});

// This handler also runs in a worker
scheduler.onSchedule("daily-report", async (job) => {
  console.log(`[${new Date().toISOString()}] Generating ${job.data.reportType} report...`);
  
  const start = Date.now();
  
  // Simulate report generation
  function aggregateMetrics() {
    const metrics: Record<string, number> = {};
    for (const metric of ["views", "clicks", "conversions"]) {
      let sum = 0;
      for (let i = 0; i < 5000000; i++) {
        sum += Math.random();
      }
      metrics[metric] = sum;
    }
    return metrics;
  }
  
  const metrics = aggregateMetrics();
  const duration = Date.now() - start;
  
  reportJobsCompleted++;
  console.log(`[${new Date().toISOString()}] Report generated in ${duration}ms`);
  console.log(`  Metrics:`, metrics);
  console.log(`  Total report jobs completed: ${reportJobsCompleted}`);
  
  return { metrics, generatedAt: new Date().toISOString() };
}, { worker: true });

// Regular handler (no worker) for comparison
scheduler.createSchedule("heartbeat", {
  interval: 10000,  // Every 10 seconds
});

scheduler.onSchedule("heartbeat", async () => {
  // Lightweight task - doesn't need worker
  console.log(`[${new Date().toISOString()}] 💓 Scheduler heartbeat`);
  console.log(`  ML jobs: ${mlJobsCompleted}, Report jobs: ${reportJobsCompleted}`);
});

// Event listeners for monitoring
scheduler.on("job:started", (event) => {
  console.log(`  → Job ${event.jobId} started (${event.scheduleName})`);
});

scheduler.on("job:completed", (event) => {
  console.log(`  ✓ Job ${event.jobId} completed in ${event.duration}ms`);
});

scheduler.on("job:failed", (event) => {
  console.error(`  ✗ Job ${event.jobId} failed:`, event.error.message);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\nShutting down scheduler...");
  await scheduler.stop();
  console.log("Scheduler stopped.");
  console.log(`Final stats: ${mlJobsCompleted} ML jobs, ${reportJobsCompleted} report jobs`);
  process.exit(0);
});

// Start the scheduler
console.log("🚀 Starting Scheduler with Worker Threads");
console.log("=========================================");
console.log("Schedules:");
console.log("  • ml-analysis: Every 60 seconds (worker thread)");
console.log("  • daily-report: Every 45 seconds (worker thread)");
console.log("  • heartbeat: Every 10 seconds (main thread)");
console.log("\nPress Ctrl+C to stop\n");

scheduler.start();
