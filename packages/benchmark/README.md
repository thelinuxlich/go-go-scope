# @go-go-scope/benchmark

Performance benchmark suite for go-go-scope across Node.js, Bun, and Deno runtimes.

## Installation

```bash
npm install -g @go-go-scope/benchmark
# or
pnpm add -g @go-go-scope/benchmark
```

## Usage

### Run All Benchmarks

```bash
# Node.js
node dist/runner.mjs

# Bun
bun run dist/runner.mjs

# Deno
deno run --allow-all dist/runner.mjs
```

### Run Specific Suite

```bash
# Core operations only
node dist/runner.mjs core

# Concurrency operations
node dist/runner.mjs concurrency

# Stream operations
node dist/runner.mjs streams

# Real-world workloads
node dist/runner.mjs realworld
```

### Save Results

```bash
node dist/runner.mjs --save
```

This saves results to `benchmark-{runtime}-{timestamp}.json`.

### Compare Runtimes

After running benchmarks with `--save` in each runtime:

```bash
node dist/compare.mjs
```

This produces a comparison table like:

```
Benchmark                           Node.js          Bun         Deno       Winner
────────────────────────────────────────────────────────────────────────────────────
scope creation                          125k        180k        165k          Bun
simple task                              89k        142k        128k          Bun
parallel (10 tasks)                      45k         78k         72k          Bun
...

📈 Average Performance
  Node.js: 68.5k ops/sec
  Bun:     112.3k ops/sec
  Deno:    98.7k ops/sec

  Bun vs Node.js: +63.9% faster
  Deno vs Node.js: +44.1% faster
```

## Benchmark Suites

### Core Operations
- Scope creation
- Task execution
- Error handling
- Nested scopes

### Concurrency
- Parallel execution (10, 100 tasks)
- Race operations
- Channel send/receive
- Semaphore operations

### Streams
- Map/filter/take operations
- Batch processing
- Reduce operations

### Real-World Workloads
- API request handling
- Background job processing
- Data pipelines
- Circuit breaker patterns
- Rate limiting

## Programmatic Usage

```typescript
import { runCoreBenchmarks, printResults } from "@go-go-scope/benchmark";

const results = await runCoreBenchmarks();
printResults(results);
```

## CI/CD Integration

```yaml
name: Benchmark
on: [push]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
      
      - name: Run benchmarks
        run: |
          pnpm install
          pnpm --filter @go-go-scope/benchmark build
          node packages/benchmark/dist/runner.mjs --save
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-nodejs
          path: benchmark-nodejs-*.json
```

## License

MIT
