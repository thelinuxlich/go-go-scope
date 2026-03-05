/**
 * Core go-go-scope benchmarks
 */

import { scope } from "go-go-scope";
import { runBenchmarks } from "../benchmark.js";

export async function runCoreBenchmarks() {
	return runBenchmarks("Core Operations", [
		{
			name: "scope creation",
			fn: async () => {
				await using _s = scope();
			},
		},
		{
			name: "scope with name",
			fn: async () => {
				await using _s = scope({ name: "test-scope" });
			},
		},
		{
			name: "scope with timeout",
			fn: async () => {
				await using _s = scope({ timeout: 5000 });
			},
		},
		{
			name: "simple task",
			fn: async () => {
				await using s = scope();
				await s.task(() => Promise.resolve(42));
			},
		},
		{
			name: "task with error",
			fn: async () => {
				await using s = scope();
				await s.task(() => Promise.reject(new Error("test")));
			},
		},
		{
			name: "nested scopes",
			fn: async () => {
				await using parent = scope({ name: "parent" });
				await using child = scope({ name: "child", parent: parent as any });
				await child.task(() => Promise.resolve("nested"));
			},
		},
	]);
}
