#!/usr/bin/env node
/**
 * go-go-scope Scheduler CLI
 * 
 * Management tool for the scheduler. Requires a running admin instance
 * or direct access to the storage backend.
 * 
 * Usage:
 *   npx go-go-scope-scheduler <command> [options]
 * 
 * Commands:
 *   list              List all schedules
 *   get <name>        Get schedule details
 *   create <name>     Create a new schedule
 *   update <name>     Update an existing schedule
 *   delete <name>     Delete a schedule
 *   pause <name>      Pause a schedule
 *   resume <name>     Resume a paused schedule
 *   disable <name>    Disable a schedule
 *   stats [name]      Show statistics for all schedules or specific schedule
 *   trigger <name>    Trigger a schedule to run immediately
 *   jobs <name>       List jobs for a schedule
 * 
 * Options:
 *   --storage, -s     Storage type (redis, postgres, mysql, sqlite)
 *   --url, -u         Connection URL
 *   --cron            Cron expression
 *   --interval        Interval in milliseconds
 *   --timezone, -tz   Timezone (e.g., America/New_York)
 *   --help, -h        Show help
 * 
 * Examples:
 *   npx go-go-scope-scheduler list --storage redis --url redis://localhost:6379
 *   npx go-go-scope-scheduler create daily-report --cron "0 9 * * *" -tz America/New_York
 *   npx go-go-scope-scheduler stats daily-report
 *   npx go-go-scope-scheduler trigger daily-report
 */

import { Scheduler } from "@go-go-scope/scheduler";
import { scope } from "go-go-scope";
import { InMemoryJobStorage } from "@go-go-scope/scheduler";
import { parseArgs } from "node:util";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function print(...args: unknown[]) {
  console.log(...args);
}

function printError(...args: unknown[]) {
  console.error(colors.red + "Error:" + colors.reset, ...args);
}

function printSuccess(...args: unknown[]) {
  console.log(colors.green + "✓" + colors.reset, ...args);
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) => 
    Math.max(h.length, ...rows.map(r => r[i]?.length ?? 0))
  );
  
  const line = "+" + widths.map(w => "-".repeat(w + 2)).join("+") + "+";
  
  print(line);
  print("| " + headers.map((h, i) => h.padEnd(widths[i])).join(" | ") + " |");
  print(line);
  
  for (const row of rows) {
    print("| " + row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join(" | ") + " |");
  }
  
  print(line);
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(date: Date | undefined): string {
  if (!date) return "-";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

// Create storage based on arguments
async function createStorage(args: Record<string, string | undefined>) {
  const storageType = args.storage || args.s || "memory";
  
  switch (storageType) {
    case "memory":
      return new InMemoryJobStorage();
    
    case "redis": {
      // Dynamic import to avoid dependency issues
      const [{ RedisJobStorage }, { RedisAdapter }, { default: Redis }] = await Promise.all([
        import("@go-go-scope/scheduler"),
        import("go-go-scope/persistence/redis"),
        import("ioredis"),
      ]);
      
      const url = args.url || args.u || "redis://localhost:6379";
      const redis = new Redis(url);
      const adapter = new RedisAdapter(redis);
      return new RedisJobStorage(redis, adapter, { keyPrefix: "scheduler:" });
    }
    
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
}

// Commands
async function listCommand(scheduler: Scheduler) {
  const schedules = await scheduler.listSchedules();
  
  if (schedules.length === 0) {
    print("No schedules found.");
    return;
  }
  
  const rows = schedules.map(s => [
    s.name,
    s.state,
    s.cron || `${s.interval}ms`,
    s.timezone || "default",
    formatDate(s.lastRunAt),
    formatDate(s.nextRunAt),
  ]);
  
  printTable(
    ["Name", "State", "Schedule", "Timezone", "Last Run", "Next Run"],
    rows
  );
}

async function getCommand(scheduler: Scheduler, name: string) {
  const schedule = await scheduler.getSchedule(name);
  
  if (!schedule) {
    printError(`Schedule '${name}' not found`);
    process.exit(1);
  }
  
  print(`${colors.bright}${schedule.name}${colors.reset}`);
  print(`  State:     ${schedule.state}`);
  print(`  ID:        ${schedule.id}`);
  if (schedule.cron) print(`  Cron:      ${schedule.cron}`);
  if (schedule.interval) print(`  Interval:  ${schedule.interval}ms`);
  print(`  Timezone:  ${schedule.timezone || "system default"}`);
  print(`  Created:   ${formatDate(schedule.createdAt)}`);
  print(`  Updated:   ${formatDate(schedule.updatedAt)}`);
  print(`  Last Run:  ${formatDate(schedule.lastRunAt)}`);
  print(`  Next Run:  ${formatDate(schedule.nextRunAt)}`);
  print(`  Total Jobs: ${schedule.totalJobs || 0}`);
  print(`  Options:`);
  print(`    Max Retries:  ${schedule.options?.maxRetries ?? 3}`);
  print(`    Retry Delay:  ${schedule.options?.retryDelay ?? 1000}ms`);
  print(`    Timeout:      ${schedule.options?.timeout ?? 30000}ms`);
  print(`    Concurrent:   ${schedule.options?.concurrent ?? false}`);
  print(`    Jitter:       ${schedule.options?.jitter ?? 0}ms`);
}

async function statsCommand(scheduler: Scheduler, name?: string) {
  if (name) {
    const stats = await scheduler.getScheduleStats(name);
    
    print(`${colors.bright}${stats.name}${colors.reset} Statistics`);
    print(`  State:           ${stats.state}`);
    print(`  Total Jobs:      ${stats.totalJobs}`);
    print(`  Pending:         ${stats.pendingJobs}`);
    print(`  Running:         ${stats.runningJobs}`);
    print(`  Completed:       ${stats.completedJobs}`);
    print(`  Failed:          ${stats.failedJobs}`);
    print(`  Cancelled:       ${stats.cancelledJobs}`);
    print(`  Success Rate:    ${stats.successRate}%`);
    print(`  Avg Duration:    ${formatDuration(stats.averageDuration)}`);
    print(`  Last Run:        ${formatDate(stats.lastRunAt)}`);
    print(`  Next Run:        ${formatDate(stats.nextRunAt)}`);
  } else {
    const allStats = await scheduler.getAllScheduleStats();
    
    if (allStats.length === 0) {
      print("No schedules found.");
      return;
    }
    
    const rows = allStats.map(s => [
      s.name,
      s.state,
      s.totalJobs.toString(),
      s.pendingJobs.toString(),
      s.runningJobs.toString(),
      s.completedJobs.toString(),
      s.failedJobs.toString(),
      `${s.successRate}%`,
      formatDuration(s.averageDuration),
    ]);
    
    printTable(
      ["Name", "State", "Total", "Pending", "Running", "Completed", "Failed", "Success", "Avg Time"],
      rows
    );
  }
}

async function createCommand(scheduler: Scheduler, name: string, args: Record<string, string | undefined>) {
  const cron = args.cron;
  const interval = args.interval ? parseInt(args.interval) : undefined;
  const timezone = args.timezone || args.tz;
  
  if (!cron && !interval) {
    printError("Either --cron or --interval must be specified");
    process.exit(1);
  }
  
  await scheduler.createSchedule(name, {
    cron,
    interval,
    timezone,
    maxRetries: args.maxRetries ? parseInt(args.maxRetries) : undefined,
    retryDelay: args.retryDelay ? parseInt(args.retryDelay) : undefined,
    timeout: args.timeout ? parseInt(args.timeout) : undefined,
    concurrent: args.concurrent === "true",
    jitter: args.jitter ? parseInt(args.jitter) : undefined,
  });
  
  printSuccess(`Schedule '${name}' created`);
}

async function updateCommand(scheduler: Scheduler, name: string, args: Record<string, string | undefined>) {
  await scheduler.updateSchedule(name, {
    cron: args.cron,
    interval: args.interval ? parseInt(args.interval) : undefined,
    timezone: args.timezone || args.tz,
    maxRetries: args.maxRetries ? parseInt(args.maxRetries) : undefined,
    retryDelay: args.retryDelay ? parseInt(args.retryDelay) : undefined,
    timeout: args.timeout ? parseInt(args.timeout) : undefined,
    concurrent: args.concurrent ? args.concurrent === "true" : undefined,
    jitter: args.jitter ? parseInt(args.jitter) : undefined,
  });
  
  printSuccess(`Schedule '${name}' updated`);
}

async function deleteCommand(scheduler: Scheduler, name: string) {
  const deleted = await scheduler.deleteSchedule(name);
  
  if (deleted) {
    printSuccess(`Schedule '${name}' deleted`);
  } else {
    printError(`Schedule '${name}' not found`);
    process.exit(1);
  }
}

async function pauseCommand(scheduler: Scheduler, name: string) {
  await scheduler.pauseSchedule(name);
  printSuccess(`Schedule '${name}' paused`);
}

async function resumeCommand(scheduler: Scheduler, name: string) {
  await scheduler.resumeSchedule(name);
  printSuccess(`Schedule '${name}' resumed`);
}

async function disableCommand(scheduler: Scheduler, name: string) {
  await scheduler.disableSchedule(name);
  printSuccess(`Schedule '${name}' disabled`);
}

async function triggerCommand(scheduler: Scheduler, name: string) {
  const [err, result] = await scheduler.triggerSchedule(name);
  
  if (err) {
    printError(err.message);
    process.exit(1);
  }
  
  printSuccess(`Triggered '${name}' (job: ${result?.jobId})`);
}

async function jobsCommand(scheduler: Scheduler, name: string) {
  const allJobs = [
    ...await scheduler.getJobsByStatus("pending"),
    ...await scheduler.getJobsByStatus("running"),
    ...await scheduler.getJobsByStatus("completed"),
    ...await scheduler.getJobsByStatus("failed"),
  ].filter(j => j.scheduleName === name);
  
  if (allJobs.length === 0) {
    print("No jobs found for this schedule.");
    return;
  }
  
  const rows = allJobs.slice(0, 20).map(j => [
    j.id.slice(-8),
    j.status,
    formatDate(j.runAt),
    formatDate(j.completedAt),
    j.retryCount.toString(),
    j.error ? j.error.slice(0, 30) + "..." : "-",
  ]);
  
  printTable(
    ["ID", "Status", "Run At", "Completed", "Retries", "Error"],
    rows
  );
  
  if (allJobs.length > 20) {
    print(`... and ${allJobs.length - 20} more jobs`);
  }
}

// Main
async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      storage: { type: "string", short: "s" },
      url: { type: "string", short: "u" },
      cron: { type: "string" },
      interval: { type: "string" },
      timezone: { type: "string" },
      tz: { type: "string" },
      maxRetries: { type: "string" },
      retryDelay: { type: "string" },
      timeout: { type: "string" },
      concurrent: { type: "string" },
      jitter: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  
  if (values.help || positionals.length === 0) {
    print(`
${colors.bright}go-go-scope Scheduler CLI${colors.reset}

${colors.bright}Usage:${colors.reset} npx go-go-scope-scheduler <command> [options]

${colors.bright}Commands:${colors.reset}
  list              List all schedules
  get <name>        Get schedule details
  create <name>     Create a new schedule
  update <name>     Update an existing schedule
  delete <name>     Delete a schedule
  pause <name>      Pause a schedule
  resume <name>     Resume a paused schedule
  disable <name>    Disable a schedule
  stats [name]      Show statistics (all or specific)
  trigger <name>    Trigger a schedule immediately
  jobs <name>       List jobs for a schedule

${colors.bright}Options:${colors.reset}
  -s, --storage     Storage type (redis, memory) [default: memory]
  -u, --url         Connection URL
  --cron            Cron expression (e.g., "0 9 * * *")
  --interval        Interval in milliseconds
  -tz, --timezone   Timezone (e.g., America/New_York)
  --maxRetries      Maximum retry attempts
  --retryDelay      Delay between retries (ms)
  --timeout         Job timeout (ms)
  --concurrent      Allow concurrent execution (true/false)
  --jitter          Random jitter (ms)
  -h, --help        Show this help

${colors.bright}Examples:${colors.reset}
  npx go-go-scope-scheduler list -s redis -u redis://localhost:6379
  npx go-go-scope-scheduler create daily-report --cron "0 9 * * *" -tz America/New_York
  npx go-go-scope-scheduler stats
  npx go-go-scope-scheduler trigger daily-report
  npx go-go-scope-scheduler pause daily-report
`);
    process.exit(0);
  }
  
  const [command, ...args] = positionals;
  const name = args[0];
  
  await using s = scope();
  const storage = await createStorage(values);
  const scheduler = new Scheduler({
    
    scope: s,
    storage,
    autoStart: false,
  });
  
  try {
    switch (command) {
      case "list":
        await listCommand(scheduler);
        break;
      case "get":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await getCommand(scheduler, name);
        break;
      case "stats":
        await statsCommand(scheduler, name);
        break;
      case "create":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await createCommand(scheduler, name, values);
        break;
      case "update":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await updateCommand(scheduler, name, values);
        break;
      case "delete":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await deleteCommand(scheduler, name);
        break;
      case "pause":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await pauseCommand(scheduler, name);
        break;
      case "resume":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await resumeCommand(scheduler, name);
        break;
      case "disable":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await disableCommand(scheduler, name);
        break;
      case "trigger":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await triggerCommand(scheduler, name);
        break;
      case "jobs":
        if (!name) { printError("Schedule name required"); process.exit(1); }
        await jobsCommand(scheduler, name);
        break;
      default:
        printError(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
