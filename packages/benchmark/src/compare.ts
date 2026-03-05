/**
 * Benchmark result comparison tool
 * Compare results from different runtimes
 */

import * as fs from "fs";
import type { BenchmarkSuiteResult, BenchmarkResult } from "./types.js";

interface ComparisonEntry {
	benchmark: string;
	nodeOps?: number;
	bunOps?: number;
	denoOps?: number;
	fastest: string;
}

function loadResults(pattern: string): BenchmarkSuiteResult[] {
	const files = fs.readdirSync(".").filter((f) => f.match(pattern));
	return files.map((f) => JSON.parse(fs.readFileSync(f, "utf-8"))).flat();
}

function compareResults(results: BenchmarkSuiteResult[]): void {
	// Group by benchmark name
	const benchmarks = new Map<string, Map<string, BenchmarkResult>>();
	
	for (const suite of results) {
		const runtime = suite.runtime.toLowerCase().replace(/[^a-z]/g, "");
		
		for (const result of suite.results) {
			if (!benchmarks.has(result.name)) {
				benchmarks.set(result.name, new Map());
			}
			benchmarks.get(result.name)!.set(runtime, result);
		}
	}
	
	// Build comparison table
	const comparisons: ComparisonEntry[] = [];
	
	for (const [name, runtimes] of benchmarks) {
		const entry: ComparisonEntry = {
			benchmark: name,
			nodeOps: runtimes.get("nodejs")?.opsPerSecond,
			bunOps: runtimes.get("bun")?.opsPerSecond,
			denoOps: runtimes.get("deno")?.opsPerSecond,
			fastest: "",
		};
		
		// Determine fastest
		let maxOps = 0;
		let fastest = "-";
		
		if (entry.nodeOps && entry.nodeOps > maxOps) {
			maxOps = entry.nodeOps;
			fastest = "Node.js";
		}
		if (entry.bunOps && entry.bunOps > maxOps) {
			maxOps = entry.bunOps;
			fastest = "Bun";
		}
		if (entry.denoOps && entry.denoOps > maxOps) {
			maxOps = entry.denoOps;
			fastest = "Deno";
		}
		
		entry.fastest = fastest;
		comparisons.push(entry);
	}
	
	// Print comparison table
	console.log("\n📊 Runtime Comparison\n");
	console.log("─".repeat(100));
	console.log(
		`${"Benchmark".padEnd(40)} ${"Node.js".padStart(12)} ${"Bun".padStart(12)} ${"Deno".padStart(12)} ${"Winner".padStart(12)}`
	);
	console.log("─".repeat(100));
	
	for (const comp of comparisons) {
		const nodeStr = comp.nodeOps ? formatOps(comp.nodeOps) : "-";
		const bunStr = comp.bunOps ? formatOps(comp.bunOps) : "-";
		const denoStr = comp.denoOps ? formatOps(comp.denoOps) : "-";
		
		console.log(
			`${comp.benchmark.padEnd(40)} ${nodeStr.padStart(12)} ${bunStr.padStart(12)} ${denoStr.padStart(12)} ${comp.fastest.padStart(12)}`
		);
	}
	
	console.log("─".repeat(100));
	
	// Calculate averages
	const avgNode = average(comparisons.map((c) => c.nodeOps).filter(Boolean) as number[]);
	const avgBun = average(comparisons.map((c) => c.bunOps).filter(Boolean) as number[]);
	const avgDeno = average(comparisons.map((c) => c.denoOps).filter(Boolean) as number[]);
	
	console.log("\n📈 Average Performance\n");
	console.log(`  Node.js: ${formatOps(avgNode)} ops/sec`);
	console.log(`  Bun:     ${formatOps(avgBun)} ops/sec`);
	console.log(`  Deno:    ${formatOps(avgDeno)} ops/sec`);
	
	const speedupBun = ((avgBun - avgNode) / avgNode * 100).toFixed(1);
	const speedupDeno = ((avgDeno - avgNode) / avgNode * 100).toFixed(1);
	
	console.log(`\n  Bun vs Node.js: ${speedupBun}% ${Number(speedupBun) > 0 ? "faster" : "slower"}`);
	console.log(`  Deno vs Node.js: ${speedupDeno}% ${Number(speedupDeno) > 0 ? "faster" : "slower"}`);
	console.log();
}

function formatOps(ops: number): string {
	if (ops >= 1_000_000) {
		return `${(ops / 1_000_000).toFixed(1)}M`;
	}
	if (ops >= 1_000) {
		return `${(ops / 1_000).toFixed(1)}k`;
	}
	return ops.toFixed(0);
}

function average(values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}

// Main
const args = process.argv.slice(2);
const pattern = args[0] || "benchmark-.*\\.json";

console.log(`🔍 Loading benchmark results matching: ${pattern}`);

const results = loadResults(pattern);
if (results.length === 0) {
	console.log("❌ No benchmark results found.");
	console.log("   Run benchmarks first with: --save flag");
	process.exit(1);
}

console.log(`   Found ${results.length} result files\n`);
compareResults(results);
