# @go-go-scope/scheduler

> Distributed job scheduler for go-go-scope with admin + workers architecture

## Features

- **Admin + Workers Pattern**: Enforced separation between schedule management and execution
- **Schedule Management**: Create, update, pause, resume, disable, and delete schedules
- **Schedule States**: Active, paused, or disabled states with automatic handling
- **Statistics**: Track job success rates, durations, and counts
- **Timezone Support**: Full IANA timezone support with DST handling
- **Distributed Locking**: Prevents duplicate execution across multiple workers
- **Persistent Storage**: Redis, PostgreSQL, MySQL, SQLite support

## Installation

```bash
npm install go-go-scope @go-go-scope/scheduler
```

## Architecture

The scheduler enforces a clear separation of concerns:

### Admin Instance
- **Creates and manages schedules** using `createSchedule()`
- Stores schedule metadata in persistent storage
- Typically only **one admin runs at a time**
- Handles schedule lifecycle (create, delete, update)

### Worker Instances
- **Load schedules** from storage using `loadSchedules()`
- Provide handler functions for each schedule
- Execute jobs with distributed locking
- Multiple workers can run for **high availability**

## Quick Start

### 1. Admin Instance

```typescript
import { scope } from "go-go-scope";
import { Scheduler, SchedulerRole, CronPresets } from "@go-go-scope/scheduler";
import { RedisJobStorage } from "@go-go-scope/scheduler";
import { RedisAdapter } from "go-go-scope/persistence/redis";
import Redis from "ioredis";

const redis = new Redis("redis://localhost:6379");
const redisAdapter = new RedisAdapter(redis);

await using s = scope({ persistence: redisAdapter });

const admin = new Scheduler({
  role: SchedulerRole.ADMIN,  // Required!
  scope: s,
  storage: new RedisJobStorage(redis, redisAdapter),
});

// Create schedules - no handler needed here
await admin.createSchedule("daily-report", {
  cron: CronPresets.DAILY,
  timezone: "America/New_York",
  maxRetries: 3,
  timeout: 30000,
});
```

### 2. Worker Instance

```typescript
const worker = new Scheduler({
  role: SchedulerRole.WORKER,  // Required!
  scope: s,
  storage: new RedisJobStorage(redis, redisAdapter),
});

// Load schedules from storage and provide handlers
await worker.loadSchedules({
  handlerFactory: (name, schedule) => {
    switch (name) {
      case "daily-report":
        return async (job, jobScope) => {
          const [err, data] = await jobScope.task(async () => {
            return fetchReportData();
          });
          if (err) throw err;
          await sendReport(data);
        };
      default:
        return null; // Skip unknown schedules
    }
  },
});

worker.start();
```

## API Reference

See the full [API documentation](../../docs/15-scheduler.md) for detailed usage.

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
