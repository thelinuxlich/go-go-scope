/**
 * Distributed Scheduler Example
 * 
 * This example demonstrates the mandatory Admin + Workers pattern.
 * 
 * Architecture:
 * - Admin Instance: Creates and manages schedules
 * - Worker Instances: Load schedules and execute jobs
 * 
 * Usage:
 * ```bash
 * # Terminal 1 - Admin instance
 * INSTANCE_ROLE=admin node examples/scheduler-distributed.ts
 * 
 * # Terminal 2, 3 - Worker instances
 * INSTANCE_ROLE=worker node examples/scheduler-distributed.ts
 * ```
 */

import { scope } from "go-go-scope";
import { Scheduler, SchedulerRole, CronPresets } from "go-go-scope/scheduler";
import { RedisJobStorage } from "go-go-scope/scheduler";
import { RedisAdapter } from "go-go-scope/persistence/redis";
import Redis from "ioredis";

async function main() {
  const role = (process.env.INSTANCE_ROLE as "admin" | "worker") || "admin";
  
  // Connect to Redis (shared storage)
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  const redisAdapter = new RedisAdapter(redis, { keyPrefix: "myapp:" });
  
  await using s = scope({ persistence: redisAdapter });
  
  const storage = new RedisJobStorage(redis, redisAdapter, {
    keyPrefix: "myapp:scheduler:",
  });

  if (role === "admin") {
    console.log("[Admin] Starting admin instance...\n");
    
    const admin = new Scheduler({
      role: SchedulerRole.ADMIN,
      scope: s,
      storage,
      autoStart: false,
    });

    console.log("[Admin] Creating global schedules...\n");
    
    await admin.createSchedule("daily-report", {
      cron: CronPresets.DAILY,
      timezone: "America/New_York",
      maxRetries: 3,
      timeout: 30000,
    });
    console.log("[Admin] ✓ Created: daily-report (9:00 AM ET)");
    
    await admin.createSchedule("hourly-cleanup", {
      cron: CronPresets.EVERY_HOUR,
      maxRetries: 2,
    });
    console.log("[Admin] ✓ Created: hourly-cleanup (every hour)");
    
    await admin.createSchedule("weekly-aggregate", {
      cron: "0 2 * * 0",  // Sunday 2 AM UTC
      timezone: "UTC",
      maxRetries: 5,
      timeout: 60000,
    });
    console.log("[Admin] ✓ Created: weekly-aggregate (Sunday 2 AM UTC)");
    
    console.log("\n[Admin] Schedules created. Workers can now load them.");
    console.log("[Admin] Keeping alive to maintain schedule definitions...\n");
    
    // Keep admin running
    await new Promise(() => {});
    
  } else {
    const instanceId = `worker-${Date.now().toString(36).slice(-4)}`;
    console.log(`[${instanceId}] Starting worker instance...\n`);
    
    const worker = new Scheduler({
      role: SchedulerRole.WORKER,
      scope: s,
      storage,
      autoStart: false,
      checkInterval: 5000,
    });

    console.log(`[${instanceId}] Loading schedules from storage...`);
    
    const loaded = await worker.loadSchedules({
      handlerFactory: (name, schedule) => {
        console.log(`[${instanceId}] Loading: ${name} (${schedule.cron || schedule.interval + 'ms'})`);
        
        switch (name) {
          case "daily-report":
            return async (job, jobScope) => {
              console.log(`[${instanceId}] 📊 Generating daily report...`);
              await jobScope.task(async () => {
                await new Promise(r => setTimeout(r, 2000));
              });
              console.log(`[${instanceId}] ✅ Daily report complete`);
            };

          case "hourly-cleanup":
            return async (job, jobScope) => {
              console.log(`[${instanceId}] 🧹 Running cleanup...`);
              await jobScope.parallel([
                async () => { console.log(`[${instanceId}]   - Temp files`); },
                async () => { console.log(`[${instanceId}]   - Old sessions`); },
                async () => { console.log(`[${instanceId}]   - Expired cache`); },
              ]);
              console.log(`[${instanceId}] ✅ Cleanup complete`);
            };

          case "weekly-aggregate":
            return async (job, jobScope) => {
              console.log(`[${instanceId}] 📈 Weekly aggregation...`);
              await new Promise(r => setTimeout(r, 5000));
              console.log(`[${instanceId}] ✅ Aggregation complete`);
            };

          default:
            return null;
        }
      },
    });

    console.log(`[${instanceId}] Loaded ${loaded.length} schedules\n`);

    worker.on("jobStarted", ({ job }) => {
      console.log(`[${instanceId}] ▶️  ${job.scheduleName}`);
    });

    worker.on("jobCompleted", ({ job, duration }) => {
      console.log(`[${instanceId}] ✓ ${job.scheduleName} (${duration}ms)`);
    });

    worker.start();
    console.log(`[${instanceId}] 🚀 Worker ready\n`);
    
    await new Promise(() => {});
  }
}

main().catch(console.error);
