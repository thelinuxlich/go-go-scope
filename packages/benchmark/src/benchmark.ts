/**
 * High-precision benchmark runner
 */

import type { BenchmarkCase, BenchmarkResult, BenchmarkOptions, BenchmarkSuiteResult } from "./types.js";

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
	warmupRuns: 100,      // Increased for JIT warmup
	minSamples: 50,       // More samples for statistical significance
	maxTime: 10000,       // 10 seconds max per benchmark
	cooldownMs: 100,      // Cooldown between benchmarks
};

/**
 * Get current runtime name and version
 */
export function getRuntimeInfo(): { name: string; version: string } {
	// @ts-ignore - Deno
	if (typeof Deno !== "undefined") {
		// @ts-ignore - Deno
		return { name: "Deno", version: Deno.version.deno };
	}
	
	// @ts-ignore - Bun
	if (typeof Bun !== "undefined") {
		// @ts-ignore - Bun
		return { name: "Bun", version: Bun.version };
	}
	
	return { name: "Node.js", version: process.version };
}

/**
 * High-precision timer
 */
function now(): number {
	// @ts-ignore - performance API
	if (typeof performance !== "undefined") {
		// @ts-ignore
		return performance.now();
	}
	return Date.now();
}

/**
 * Get memory usage
 */
function getMemory(): number {
	// @ts-ignore - Deno
	if (typeof Deno !== "undefined") {
		// @ts-ignore
		return Deno.memoryUsage().heapUsed;
	}
	
	// @ts-ignore - Bun
	if (typeof process !== "undefined" && process.memoryUsage) {
		return process.memoryUsage().heapUsed;
	}
	
	return 0;
}

/**
 * Calculate median of an array
 */
function median(arr: number[]): number {
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0
		? sorted[mid]!
		: (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr: number[], mean: number): number {
	const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
	return Math.sqrt(variance);
}

/**
 * Remove outliers using IQR method
 */
function removeOutliers(arr: number[]): number[] {
	if (arr.length < 10) return arr;
	
	const sorted = [...arr].sort((a, b) => a - b);
	const q1Index = Math.floor(sorted.length * 0.25);
	const q3Index = Math.floor(sorted.length * 0.75);
	const q1 = sorted[q1Index]!;
	const q3 = sorted[q3Index]!;
	const iqr = q3 - q1;
	const lowerBound = q1 - 1.5 * iqr;
	const upperBound = q3 + 1.5 * iqr;
	
	return arr.filter(x => x >= lowerBound && x <= upperBound);
}

/**
 * Run a single benchmark case with proper isolation
 */
async function runBenchmarkCase(
	benchmark: BenchmarkCase,
): Promise<BenchmarkResult> {
	const opts = { ...DEFAULT_OPTIONS, ...benchmark.options };
	const times: number[] = [];
	
	// Extended warmup for JIT optimization
	console.log(`  🔄  Warmup (${opts.warmupRuns} runs)...`);
	for (let i = 0; i < opts.warmupRuns; i++) {
		await benchmark.fn();
	}
	
	// Cooldown after warmup
	await new Promise(resolve => setTimeout(resolve, opts.cooldownMs));
	
	const startMemory = getMemory();
	const startTime = now();
	
	// Run benchmark
	console.log(`  ⏱️  Measuring (${opts.minSamples} samples)...`);
	while (times.length < opts.minSamples && now() - startTime < opts.maxTime) {
		const caseStart = now();
		await benchmark.fn();
		const caseEnd = now();
		times.push(caseEnd - caseStart);
		
		// Small cooldown between iterations to prevent thermal throttling
		if (times.length % 10 === 0) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}
	}
	
	const endTime = now();
	const endMemory = getMemory();
	
	// Statistical filtering
	const filteredTimes = removeOutliers(times);
	const filteredCount = times.length - filteredTimes.length;
	if (filteredCount > 0) {
		console.log(`     Filtered ${filteredCount} outliers`);
	}
	
	// Calculate statistics
	const totalTime = endTime - startTime;
	const avgTime = filteredTimes.reduce((a, b) => a + b, 0) / filteredTimes.length;
	const minTime = Math.min(...filteredTimes);
	const maxTime = Math.max(...filteredTimes);
	const medianTime = median(filteredTimes);
	const stdDevTime = stdDev(filteredTimes, avgTime);
	const opsPerSecond = (1000 / avgTime);
	
	return {
		name: benchmark.name,
		opsPerSecond,
		avgTime,
		minTime,
		maxTime,
		totalTime,
		samples: filteredTimes.length,
		memoryDelta: endMemory - startMemory,
		medianTime,
		stdDevTime,
	};
}

/**
 * Run a suite of benchmarks
 */
export async function runBenchmarks(
	suiteName: string,
	benchmarks: BenchmarkCase[],
): Promise<BenchmarkSuiteResult> {
	const runtime = getRuntimeInfo();
	const results: BenchmarkResult[] = [];
	
	console.log(`\n🚀 Running benchmark suite: ${suiteName}`);
	console.log(`   Runtime: ${runtime.name} ${runtime.version}\n`);
	
	for (const benchmark of benchmarks) {
		const label = `  ⏱️  ${benchmark.name}... `;
		if (typeof process !== "undefined" && process.stdout?.write) {
			process.stdout.write(label);
		} else {
			console.log(label);
		}
		const result = await runBenchmarkCase(benchmark);
		results.push(result);
		console.log(`${result.opsPerSecond.toFixed(0)} ops/sec`);
	}
	
	return {
		suiteName,
		runtime: runtime.name,
		runtimeVersion: runtime.version,
		timestamp: new Date().toISOString(),
		results,
	};
}

/**
 * Format benchmark result for display
 */
export function formatResult(result: BenchmarkResult): string {
	const ops = result.opsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 });
	const avg = result.avgTime.toFixed(3);
	const median = result.medianTime?.toFixed(3) ?? avg;
	const cv = ((result.stdDevTime || 0) / result.avgTime * 100).toFixed(1);
	
	return `${result.name.padEnd(35)} ${ops.padStart(10)} ops/sec  avg: ${avg.padStart(6)}ms  median: ${median.padStart(6)}ms  ±${cv.padStart(4)}%`;
}

/**
 * Print benchmark results table
 */
export function printResults(suite: BenchmarkSuiteResult): void {
	console.log(`\n📊 Results for ${suite.suiteName}`);
	console.log(`   ${suite.runtime} ${suite.runtimeVersion}`);
	console.log(`   ${new Date(suite.timestamp).toLocaleString()}\n`);
	
	console.log("─".repeat(100));
	for (const result of suite.results) {
		console.log(formatResult(result));
	}
	console.log("─".repeat(100));
	
	// Find fastest
	const fastest = suite.results.reduce((a, b) => 
		a.opsPerSecond > b.opsPerSecond ? a : b
	);
	console.log(`\n🏆 Fastest: ${fastest.name} (${fastest.opsPerSecond.toFixed(0)} ops/sec)\n`);
}
