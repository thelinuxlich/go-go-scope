/**
 * 🚀 go-go-scope Scheduler v2.1 - Simplified API Example
 * 
 * Before: Separate admin/worker roles, complex setup
 * After: One instance does it all!
 */

import { scope } from "go-go-scope";
import { Scheduler } from "@go-go-scope/scheduler";
import { PostgresAdapter } from "@go-go-scope/persistence/postgres";
import { SQLJobStorage } from "@go-go-scope/scheduler";

// Create scheduler with PostgreSQL persistence
await using s = scope();
const storage = new SQLJobStorage(
  "postgresql://localhost:5432/jobs",
  new PostgresAdapter()
);

const scheduler = new Scheduler({
  scope: s,
  storage,
  enableWebUI: true, // Optional: built-in management UI
});

// 1️⃣ Create schedules (any instance can do this!)
await scheduler.createSchedule("daily-report", {
  cron: "0 9 * * *",  // 9 AM daily
  timezone: "America/New_York",
  concurrent: false,  // Run one at a time
});

await scheduler.createSchedule("process-webhooks", {
  interval: 5000,     // Every 5 seconds
  concurrent: true,   // Process multiple in parallel
});

// 2️⃣ Register handlers (same instance or different!)
scheduler.onSchedule("daily-report", async (job, scope) => {
  const [err, users] = await scope.task(() => fetchActiveUsers());
  if (err) throw err;
  
  await Promise.all(users.map(user => 
    scope.task(() => sendReport(user))
  ));
});

scheduler.onSchedule("process-webhooks", async (job, scope) => {
  const [err] = await scope.task(() => 
    fetch(job.payload.url, { method: "POST", body: job.payload.data })
  );
  if (err) console.error(`Webhook failed: ${err.message}`);
});

// 3️⃣ Start processing jobs
await scheduler.start();

console.log("✅ Scheduler running!");
console.log("📊 Web UI:", scheduler.getWebUIUrl());

// Scale horizontally: just start more instances!
// All instances share the same database and coordinate automatically.
// No leader election, no role configuration needed.
