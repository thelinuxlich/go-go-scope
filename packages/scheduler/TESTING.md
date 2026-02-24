# Testing Guide for go-go-scope Scheduler

This guide covers all test suites for the scheduler, including unit tests, integration tests, stress tests, and memory benchmarks.

## Test Suites Overview

### 1. Unit Tests (`scheduler.test.ts`)
Core functionality tests for the scheduler class.

**Run:**
```bash
npm test
```

**Coverage:**
- Schedule creation/deletion
- Job execution lifecycle
- Cron parsing
- Error handling
- Event emission

### 2. Memory Leak Tests (`scheduler-memory.test.ts`)
Verifies proper cleanup of jobs, schedules, and event listeners.

**Run:**
```bash
npm test
```

### 3. Integration Tests (`scheduler-integration.test.ts`)
Tests scheduler with all storage adapters (InMemory, Redis, PostgreSQL, MySQL, SQLite).

**Run:**
```bash
# All adapters (skips unavailable ones)
npm run test:integration

# Specific adapter
npx vitest run scheduler-integration.test.ts --grep "SQLite"

# With external databases
docker-compose up -d redis postgres mysql
npm run test:integration
```

**Coverage:**
- Basic scheduling with each adapter
- Cron scheduling
- End date handling
- Memory leak detection per adapter
- High availability (multiple workers)
- Error recovery (retries)

### 4. Memory Benchmark (`scheduler-memory-benchmark.test.ts`)
Performance and memory usage comparison across adapters.

**Run:**
```bash
# Basic benchmark
npm run test:integration:memory

# With GC for accurate measurements
npm run test:memory
```

**Output:**
```
📊 Memory Benchmark Comparison:
═══════════════════════════════════════════════════════════════════
Adapter    │ Initial │ Final   │ Growth  │ Jobs  │ Throughput
───────────┼─────────┼─────────┼─────────┼───────┼───────────
InMemory   │  45.2MB │  47.8MB │   2.6MB │ 100   │  45/sec
SQLite     │  48.1MB │  51.3MB │   3.2MB │ 100   │  38/sec
═══════════════════════════════════════════════════════════════════
```

### 5. Stress Tests (`scheduler-stress.test.ts`)
Production workload simulation and edge cases.

**Run:**
```bash
# Quick stress test
npm run test:stress

# With GC measurements
npm run test:stress:memory

# Specific test
npx vitest run scheduler-stress.test.ts --grep "1000 jobs"
```

**Scenarios:**

#### High Throughput
- 1000 jobs in under 30 seconds
- Large payload handling (10KB+)

#### Many Concurrent Schedules
- 100 concurrent schedules
- Memory boundedness verification

#### Worker Failure Recovery
- Worker crashes during job execution
- Rapid worker restarts (5x in 10 seconds)

#### Clock Skew Handling
- Jobs scheduled in the past (clock jumped back)
- Stale job detection

#### Thundering Herd Protection
- 5 workers competing for same jobs
- Burst scheduling (20 schedules same interval)

#### Long-Running Stability
- 10-second continuous load test
- 10% error rate simulation

### 6. SQL Stress Tests (`scheduler-sql-stress.test.ts`)
Database-specific stress scenarios.

**Run:**
```bash
npm run test:sql
```

**Scenarios:**

#### Connection & Concurrency
- Concurrent schedule creation (50 at once)
- Rapid job state transitions
- Database size with cleanup

#### Locking & Consistency
- Multiple concurrent workers (SQLite locking)
- Lock timeout recovery

#### Real-World Scenarios
- Batch job processing
- Priority-based scheduling

## Running All Tests

```bash
# Complete test suite
npm run test:all

# Or step by step
npm test                              # Unit tests
npm run test:integration              # Integration tests
npm run test:stress:memory            # Stress tests with GC
npm run test:sql                      # SQL-specific tests
```

## Manual Testing

Use the provided example script for manual adapter testing:

```bash
# InMemory (fastest)
npx tsx examples/adapter-test.ts memory

# SQLite (file-based)
npx tsx examples/adapter-test.ts sqlite

# Redis (requires server)
npx tsx examples/adapter-test.ts redis

# PostgreSQL (requires server)
DATABASE_URL=postgres://user:pass@localhost:5432/test npx tsx examples/adapter-test.ts postgres

# MySQL (requires server)
MYSQL_HOST=localhost MYSQL_USER=root npx tsx examples/adapter-test.ts mysql
```

## Environment Variables

### Redis
- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_URL`: Full connection URL

### PostgreSQL
- `POSTGRES_HOST`: Hostname (default: localhost)
- `POSTGRES_PORT`: Port (default: 5432)
- `POSTGRES_DB`: Database name (default: test)
- `POSTGRES_USER`: Username (default: postgres)
- `POSTGRES_PASSWORD`: Password (default: postgres)
- `DATABASE_URL`: Full connection string

### MySQL
- `MYSQL_HOST`: Hostname (default: localhost)
- `MYSQL_PORT`: Port (default: 3306)
- `MYSQL_DB`: Database name (default: test)
- `MYSQL_USER`: Username (default: root)
- `MYSQL_PASSWORD`: Password (default: empty)

## Test Matrix

| Test Type | InMemory | SQLite | Redis | PostgreSQL | MySQL |
|-----------|----------|--------|-------|------------|-------|
| Unit Tests | ✅ | N/A | N/A | N/A | N/A |
| Integration | ✅ | ✅ | ⚠️* | ⚠️* | ⚠️* |
| Memory Benchmark | ✅ | ✅ | ⚠️* | ⚠️* | ⚠️* |
| Stress Tests | ✅ | N/A | N/A | N/A | N/A |
| SQL Stress | N/A | ✅ | N/A | N/A | N/A |

\* Requires running database server

## Performance Expectations

### Throughput (jobs/second)
- **InMemory**: 100-500 jobs/sec
- **SQLite**: 50-200 jobs/sec
- **Redis**: 80-300 jobs/sec
- **PostgreSQL**: 60-250 jobs/sec
- **MySQL**: 50-200 jobs/sec

### Memory Growth (1000 jobs)
- **Expected**: < 50MB
- **Warning**: 50-100MB
- **Leak**: > 100MB

## CI/CD Integration

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    npm test
    npm run test:integration
    npm run test:stress

- name: Memory Benchmark
  run: npm run test:memory
  env:
    NODE_OPTIONS: --expose-gc
```

## Troubleshooting

### "Redis not available, skipping"
Start Redis: `docker run -d -p 6379:6379 redis:alpine`

### "PostgreSQL not available"
Start PostgreSQL:
```bash
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=test \
  postgres:alpine
```

### Timeout errors
Increase test timeout:
```bash
npx vitest run --testTimeout 60000
```

### Memory test failures
Run with GC exposed:
```bash
node --expose-gc node_modules/vitest/vitest.mjs run
```

### SQLite "database locked" errors
This is expected under extreme load. The SQL stress tests verify recovery.

## Adding New Tests

1. **Unit tests**: Add to `scheduler.test.ts`
2. **Integration tests**: Add to `scheduler-integration.test.ts`
3. **Stress tests**: Add to `scheduler-stress.test.ts`
4. **SQL-specific**: Add to `scheduler-sql-stress.test.ts`

Template:
```typescript
test("description", async () => {
  const { storage, cleanup } = await createStorage();
  await using s = scope();
  
  // Setup
  const admin = new Scheduler({ role: SchedulerRole.ADMIN, scope: s, storage });
  const worker = new Scheduler({ role: SchedulerRole.WORKER, scope: s, storage });
  
  // Test logic
  
  // Cleanup
  await worker[Symbol.asyncDispose]();
  await admin[Symbol.asyncDispose]();
  await cleanup();
});
```
