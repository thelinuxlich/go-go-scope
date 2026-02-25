/**
 * Quick benchmark for performance optimizations
 * Tests ring buffer vs array buffer, lazy init, etc.
 */

import { performance } from "perf_hooks";

interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  avgTime: number;
}

async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  samples = 1000
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 100; i++) {
    await fn();
  }

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const opsPerSecond = 1000 / avgTime;

  return { name, opsPerSecond, avgTime };
}

// Ring buffer implementation
class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): boolean {
    if (this.size >= this.capacity) return false;
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
    return true;
  }

  shift(): T | undefined {
    if (this.size === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    return item;
  }

  length(): number {
    return this.size;
  }
}

// Array buffer implementation
class ArrayBuffer<T> {
  private buffer: T[] = [];

  constructor(private capacity: number) {}

  push(item: T): boolean {
    if (this.buffer.length >= this.capacity) return false;
    this.buffer.push(item);
    return true;
  }

  shift(): T | undefined {
    return this.buffer.shift();
  }

  length(): number {
    return this.buffer.length;
  }
}

async function benchRingBuffer(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Ring Buffer vs Array Buffer\n");

  const results: BenchmarkResult[] = [];

  // Ring buffer operations
  results.push(
    await runBenchmark("RingBuffer push/shift (1000 items)", async () => {
      const buf = new RingBuffer<number>(1000);
      for (let i = 0; i < 1000; i++) {
        buf.push(i);
      }
      for (let i = 0; i < 1000; i++) {
        buf.shift();
      }
    }, 1000)
  );

  // Array buffer operations
  results.push(
    await runBenchmark("ArrayBuffer push/shift (1000 items)", async () => {
      const buf = new ArrayBuffer<number>(1000);
      for (let i = 0; i < 1000; i++) {
        buf.push(i);
      }
      for (let i = 0; i < 1000; i++) {
        buf.shift();
      }
    }, 1000)
  );

  return results;
}

async function benchLazyInit(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Lazy Initialization\n");

  const results: BenchmarkResult[] = [];

  // Eager initialization
  results.push(
    await runBenchmark("Eager initialization", async () => {
      const obj = {
        data: new Array(1000).fill(0).map((_, i) => i),
        timestamp: Date.now(),
      };
      // Use it to prevent optimization
      if (obj.data.length === 0) throw new Error("fail");
    }, 1000)
  );

  // Lazy initialization
  results.push(
    await runBenchmark("Lazy initialization (not accessed)", async () => {
      let obj: { data: number[]; timestamp: number } | undefined;
      const getObj = () => {
        if (!obj) {
          obj = {
            data: new Array(1000).fill(0).map((_, i) => i),
            timestamp: Date.now(),
          };
        }
        return obj;
      };
      // Don't access it
      if (false) getObj();
    }, 1000)
  );

  return results;
}

function printResults(results: BenchmarkResult[]) {
  console.log("─".repeat(70));
  console.log(`${"Benchmark".padEnd(45)} ${"Ops/sec".padStart(12)} ${"Avg (ms)".padStart(12)}`);
  console.log("─".repeat(70));

  for (const result of results) {
    console.log(
      `${result.name.padEnd(45)} ${result.opsPerSecond.toFixed(2).padStart(12)} ${result.avgTime.toFixed(4).padStart(12)}`
    );
  }
  console.log("─".repeat(70));

  // Show improvement
  const ringResult = results.find((r) => r.name.includes("RingBuffer"));
  const arrayResult = results.find((r) => r.name.includes("ArrayBuffer"));
  if (ringResult && arrayResult) {
    const improvement = ((ringResult.opsPerSecond / arrayResult.opsPerSecond) - 1) * 100;
    console.log(`\n📈 RingBuffer is ${improvement.toFixed(1)}% faster than ArrayBuffer for queue operations`);
  }

  const eagerResult = results.find((r) => r.name.includes("Eager"));
  const lazyResult = results.find((r) => r.name.includes("Lazy"));
  if (eagerResult && lazyResult) {
    const improvement = ((lazyResult.opsPerSecond / eagerResult.opsPerSecond) - 1) * 100;
    console.log(`📈 Lazy initialization is ${improvement.toFixed(1)}% faster when not used`);
  }

  console.log();
}

async function main() {
  console.log("🚀 Performance Optimizations Benchmark\n");

  const allResults: BenchmarkResult[] = [];

  allResults.push(...(await benchRingBuffer()));
  allResults.push(...(await benchLazyInit()));

  console.log("\n📈 Overall Results\n");
  printResults(allResults);

  console.log("✅ Benchmarks complete!");
}

main().catch(console.error);
