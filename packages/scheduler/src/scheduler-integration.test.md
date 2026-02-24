# Scheduler Integration Tests

This test suite verifies the scheduler works correctly with all persistence adapters and doesn't leak memory.

## Test Coverage

### Scenarios Tested

1. **Basic Scheduling**: Creates schedules and verifies jobs execute
2. **Cron Scheduling**: Tests cron expressions with timezone support
3. **End Date Handling**: Verifies schedules stop after end date
4. **Memory Leak Detection**: Runs many jobs and verifies memory stays bounded
5. **High Availability**: Multiple workers process jobs without duplicates
6. **Error Recovery**: Failed jobs are retried correctly

### Storage Adapters Tested

- ✅ **InMemory**: Fast, for development/testing (always runs)
- ✅ **SQLite**: File-based, for embedded deployments (always runs)
- ⚠️ **Redis**: Requires Redis server (skips if unavailable)
- ⚠️ **PostgreSQL**: Requires PostgreSQL server (skips if unavailable)
- ⚠️ **MySQL**: Requires MySQL server (skips if unavailable)

## Running Tests

### All Tests

```bash
npm test
```

### Specific Storage Adapter

```bash
# InMemory and SQLite only (no external dependencies)
npx vitest run scheduler-integration.test.ts --grep "InMemory\|SQLite"

# Redis only
REDIS_HOST=localhost REDIS_PORT=6379 npx vitest run scheduler-integration.test.ts --grep "Redis"

# PostgreSQL only
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=test POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres npx vitest run scheduler-integration.test.ts --grep "PostgreSQL"

# MySQL only
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_DB=test MYSQL_USER=root MYSQL_PASSWORD= npx vitest run scheduler-integration.test.ts --grep "MySQL"
```

### With Docker

```bash
# Start all databases
docker-compose up -d redis postgres mysql

# Run all integration tests
npm test

# Stop databases
docker-compose down
```

## Environment Variables

### Redis
- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)

### PostgreSQL
- `POSTGRES_HOST`: PostgreSQL hostname (default: localhost)
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)
- `POSTGRES_DB`: Database name (default: test)
- `POSTGRES_USER`: Username (default: postgres)
- `POSTGRES_PASSWORD`: Password (default: postgres)

### MySQL
- `MYSQL_HOST`: MySQL hostname (default: localhost)
- `MYSQL_PORT`: MySQL port (default: 3306)
- `MYSQL_DB`: Database name (default: test)
- `MYSQL_USER`: Username (default: root)
- `MYSQL_PASSWORD`: Password (default: empty)

## Memory Leak Testing

The memory leak tests:
1. Record initial memory usage (after forced GC)
2. Run 50+ jobs with multiple schedules
3. Clean up old jobs (keep only recent)
4. Force GC and measure final memory
5. Assert memory growth is less than 50MB

### Expected Results

Typical memory growth per adapter:
- InMemory: ~0-5MB
- SQLite: ~0-5MB
- Redis: ~0-10MB (network overhead)
- PostgreSQL: ~0-10MB (connection overhead)
- MySQL: ~0-10MB (connection overhead)

If memory growth exceeds 50MB, the test fails, indicating a potential leak.

## Troubleshooting

### "Redis not available, skipping Redis tests"
- Ensure Redis is running: `redis-cli ping`
- Check environment variables are correct

### "PostgreSQL not available, skipping PostgreSQL tests"
- Ensure PostgreSQL is running
- Verify database exists: `createdb test`
- Check credentials

### Timeout errors
- Increase test timeout: `--testTimeout 30000`
- Check database is responsive

### Memory test failures
- Run with `--expose-gc` flag: `node --expose-gc node_modules/vitest/vitest.mjs run`
- Ensure no other processes are consuming memory
- Check for hanging connections in storage adapters
