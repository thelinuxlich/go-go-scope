/**
 * go-go-scope Benchmark Suite
 * 
 * Run with:
 *   Node.js: node dist/runner.mjs
 *   Bun:     bun run dist/runner.mjs  
 *   Deno:    deno run --allow-all dist/runner.mjs
 */

export { runBenchmarks, getRuntimeInfo, formatResult, printResults } from "./benchmark.js";
export type { BenchmarkResult, BenchmarkSuiteResult, BenchmarkCase, BenchmarkOptions } from "./types.js";
export { runCoreBenchmarks } from "./suites/core.js";
export { runConcurrencyBenchmarks } from "./suites/concurrency.js";
export { runStreamBenchmarks } from "./suites/streams.js";
export { runRealWorldBenchmarks } from "./suites/realworld.js";
