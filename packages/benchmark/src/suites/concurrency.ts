/**
 * Concurrency benchmarks
 */

import { scope } from "go-go-scope";
import { runBenchmarks } from "../benchmark.js";

export async function runConcurrencyBenchmarks() {
	return runBenchmarks("Concurrency Operations", [
		{
			name: "parallel (10 tasks)",
			fn: async () => {
				await using s = scope();
				const factories = Array.from({ length: 10 }, (_, i) => 
					() => Promise.resolve(i)
				);
				await s.parallel(factories);
			},
		},
		{
			name: "parallel (100 tasks)",
			fn: async () => {
				await using s = scope();
				const factories = Array.from({ length: 100 }, (_, i) => 
					() => Promise.resolve(i)
				);
				await s.parallel(factories);
			},
		},
		{
			name: "race (5 tasks)",
			fn: async () => {
				await using s = scope();
				const factories = Array.from({ length: 5 }, (_, i) => 
					() => new Promise((resolve) => setTimeout(() => resolve(i), 10))
				);
				await s.race(factories);
			},
		},
		{
			name: "channel create",
			fn: async () => {
				await using s = scope();
				const ch = s.channel(100);
				ch.close();
			},
		},
		{
			name: "channel send/receive",
			fn: async () => {
				await using s = scope();
				const ch = s.channel<number>(100);
				await ch.send(1);
				await ch.receive();
				ch.close();
			},
		},
		{
			name: "semaphore acquire/release",
			fn: async () => {
				await using s = scope();
				const sem = s.semaphore(10);
				await sem.acquire(async () => {
					await Promise.resolve();
				});
			},
		},
	]);
}
