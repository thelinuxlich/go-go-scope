/**
 * Stream benchmarks
 */

import { Stream } from "@go-go-scope/stream";
import { scope } from "go-go-scope";
import { runBenchmarks } from "../benchmark.js";

async function* generateNumbers(count: number) {
	for (let i = 0; i < count; i++) {
		yield i;
	}
}

export async function runStreamBenchmarks() {
	return runBenchmarks("Stream Operations", [
		{
			name: "stream map (100 items)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(100), s as any)
					.map((x) => x * 2);
				await stream.toArray();
			},
		},
		{
			name: "stream filter (100 items)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(100), s as any)
					.filter((x) => x % 2 === 0);
				await stream.toArray();
			},
		},
		{
			name: "stream map + filter (100 items)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(100), s as any)
					.map((x) => x * 2)
					.filter((x) => x > 50);
				await stream.toArray();
			},
		},
		{
			name: "stream take (100 items)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(1000), s as any)
					.take(100);
				await stream.toArray();
			},
		},
		{
			name: "stream buffer (100 items, size 10)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(100), s as any)
					.buffer(10);
				await stream.toArray();
			},
		},
		{
			name: "stream reduce (100 items)",
			fn: async () => {
				await using s = scope();
				const stream = new Stream(generateNumbers(100), s as any);
				await stream.fold(0, (a, b) => a + b);
			},
		},
	]);
}
