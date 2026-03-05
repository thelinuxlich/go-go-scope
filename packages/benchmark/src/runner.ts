/**
 * Main benchmark runner CLI
 */

import { runCoreBenchmarks } from "./suites/core.js";
import { runConcurrencyBenchmarks } from "./suites/concurrency.js";
import { runStreamBenchmarks } from "./suites/streams.js";
import { runRealWorldBenchmarks } from "./suites/realworld.js";
import { printResults } from "./index.js";

async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
	const args = process.argv.slice(2);
	const filter = args.find((arg) => !arg.startsWith("--"));
	const saveResults = args.includes("--save");
	const isolated = args.includes("--isolated");
	
	console.log("╔════════════════════════════════════════════════════════════╗");
	console.log("║       go-go-scope Performance Benchmark Suite              ║");
	console.log("╚════════════════════════════════════════════════════════════╝");
	
	if (isolated) {
		console.log("\n🔒 Isolated mode: 2s cooldown between suites\n");
	}
	
	const results = [];
	
	// Run all or filtered benchmarks
	if (!filter || filter === "core") {
		results.push(await runCoreBenchmarks());
		if (isolated) await sleep(2000);
	}
	
	if (!filter || filter === "concurrency") {
		results.push(await runConcurrencyBenchmarks());
		if (isolated) await sleep(2000);
	}
	
	if (!filter || filter === "streams") {
		results.push(await runStreamBenchmarks());
		if (isolated) await sleep(2000);
	}
	
	if (!filter || filter === "realworld") {
		results.push(await runRealWorldBenchmarks());
	}
	
	// Print all results
	for (const result of results) {
		printResults(result);
	}
	
	// Save results if requested
	if (saveResults) {
		const fs = await import("fs");
		const runtime = results[0]?.runtime.toLowerCase().replace(/[^a-z]/g, "") || "unknown";
		const filename = `benchmark-${runtime}-${Date.now()}.json`;
		fs.writeFileSync(filename, JSON.stringify(results, null, 2));
		console.log(`💾 Results saved to ${filename}`);
	}
	
	console.log("\n✅ Benchmark complete!\n");
}

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
