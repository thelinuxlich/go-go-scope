# Benchmark Results Summary

## Overview

This benchmark suite compares go-go-scope performance across different JavaScript runtimes:
- **Node.js** (v24+)
- **Bun** (v1.2+)
- **Deno** (v2+)

## Running Benchmarks

### Single Runtime

```bash
# Node.js (default)
node packages/benchmark/dist/runner.mjs

# Bun
bun run packages/benchmark/dist/runner.mjs

# Deno
deno run --allow-all packages/benchmark/dist/runner.mjs
```

### Save Results for Comparison

```bash
# Run with --save flag on each runtime
node packages/benchmark/dist/runner.mjs --save
bun run packages/benchmark/dist/runner.mjs --save
deno run --allow-all packages/benchmark/dist/runner.mjs --save

# Compare results
node packages/benchmark/dist/compare.mjs
```

## Benchmark Suites

### 1. Core Operations
- Scope creation
- Named scopes
- Timeout configuration
- Task execution
- Error handling
- Nested scopes

### 2. Concurrency Operations
- Parallel execution (10, 100 tasks)
- Race operations
- Channel operations
- Semaphore operations

### 3. Stream Operations
- Map/filter operations
- Take/limit operations
- Buffer operations
- Reduce operations

### 4. Real-World Workloads
- API request handling
- Background job processing
- Data pipelines
- Circuit breaker patterns
- Rate limiting

## Sample Results (Node.js v24.14.0)

| Benchmark | ops/sec | avg (ms) |
|-----------|---------|----------|
| scope with timeout | 599,830 | 0.017 |
| semaphore acquire/release | 606,230 | 0.016 |
| channel send/receive | 487,033 | 0.021 |
| stream buffer | 213,917 | 0.047 |
| parallel (10 tasks) | 49,301 | 0.203 |
| background job processing | 8,338 | 1.199 |
| API request handling | 3,016 | 3.316 |
| circuit breaker pattern | 490 | 20.396 |

## Interpreting Results

- **ops/sec**: Higher is better - more operations completed per second
- **avg (ms)**: Lower is better - average time per operation
- **Fastest**: The benchmark with highest ops/sec in each suite

## Known Variations

### Node.js
- Best compatibility
- Stable performance
- Good for production workloads

### Bun
- Typically faster startup
- Better raw performance on simple operations
- May vary on complex concurrency patterns

### Deno
- Good TypeScript support
- Performance comparable to Node.js
- Native permission system

## CI Integration

See README.md for GitHub Actions integration examples.
