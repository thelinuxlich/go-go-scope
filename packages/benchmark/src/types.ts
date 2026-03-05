/**
 * Benchmark types and interfaces
 */

export interface BenchmarkResult {
	name: string;
	opsPerSecond: number;
	avgTime: number;
	minTime: number;
	maxTime: number;
	totalTime: number;
	samples: number;
	memoryDelta: number;
	medianTime?: number;
	stdDevTime?: number;
}

export interface BenchmarkSuiteResult {
	suiteName: string;
	runtime: string;
	runtimeVersion: string;
	timestamp: string;
	results: BenchmarkResult[];
}

export interface BenchmarkOptions {
	warmupRuns?: number;
	minSamples?: number;
	maxTime?: number;
	cooldownMs?: number;
}

export type BenchmarkFunction = () => Promise<unknown> | unknown;

export interface BenchmarkCase {
	name: string;
	fn: BenchmarkFunction;
	options?: BenchmarkOptions;
}
