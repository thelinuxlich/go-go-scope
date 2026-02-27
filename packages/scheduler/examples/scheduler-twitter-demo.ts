/**
 * 🚀 NEW: go-go-scope Scheduler v2.1
 * 
 * Distributed job scheduling made simple.
 * No roles. No leader election. Just works.
 */

import { scope } from "go-go-scope";
import { Scheduler, CronPresets } from "@go-go-scope/scheduler";

await using s = scope();

// Create scheduler (no roles needed!)
const scheduler = new Scheduler({ scope: s });

// Define a schedule
await scheduler.createSchedule("cleanup", {
  cron: CronPresets.HOURLY,
  concurrent: false,  // One job at a time
});

// Register handler
scheduler.onSchedule("cleanup", async (job, scope) => {
  const [err, files] = await scope.task(() => getOldFiles());
  if (err) throw err;
  
  for (const file of files) {
    await scope.task(() => deleteFile(file));
  }
});

// Start processing
await scheduler.start();

// 🎯 That's it! 
// 
// Scale? Just start more instances - they coordinate automatically.
// Web UI? enableWebUI: true gives you a management dashboard.
// Persistence? Redis, PostgreSQL, MySQL, or SQLite.
