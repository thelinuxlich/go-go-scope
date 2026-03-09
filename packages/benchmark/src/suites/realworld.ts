/**
 * Real-world workload benchmarks
 */

import { scope } from "go-go-scope";
import { runBenchmarks } from "../benchmark.js";

// Simulate database query
async function dbQuery(id: number): Promise<{ id: number; data: string }> {
	await new Promise((resolve) => setTimeout(resolve, 1));
	return { id, data: `data-${id}` };
}

// Simulate HTTP request
async function httpRequest(url: string): Promise<{ status: number; body: string }> {
	await new Promise((resolve) => setTimeout(resolve, 2));
	return { status: 200, body: `Response from ${url}` };
}

export async function runRealWorldBenchmarks() {
	return runBenchmarks("Real-World Workloads", [
		{
			name: "API request handling",
			fn: async () => {
				await using _s = scope({ name: "api-request", timeout: 5000 });
				
				// Simulate middleware chain
				await _s.task(() => httpRequest("/auth"));
				
				// Fetch data in parallel
				await Promise.all([
					_s.task(() => dbQuery(1)),
					_s.task(() => dbQuery(2)),
				]);
			},
		},
		{
			name: "background job processing",
			fn: async () => {
				await using _s = scope({ name: "job-processor" });
				
				const jobs = Array.from({ length: 5 }, (_, i) => ({
					id: `job-${i}`,
					data: { payload: i },
				}));
				
				await _s.parallel(
					jobs.map((job) => () => 
						_s.task(async () => {
							await dbQuery(job.data.payload);
							return { processed: true, jobId: job.id };
						}) as any
					)
				);
			},
		},
		{
			name: "data pipeline",
			fn: async () => {
				await using _s = scope({ name: "data-pipeline" });
				
				// Step 1: Fetch raw data
				const raw = await _s.task(() => 
					Promise.all(Array.from({ length: 10 }, (_, i) => dbQuery(i)))
				) as unknown as ReturnType<typeof dbQuery>[];
				
				// Step 2: Transform in parallel
				const transformed = await _s.parallel(
					raw.map((item: any) => () => 
						Promise.resolve({ ...item, transformed: true })
					)
				);
				
				// Step 3: Save results
				await _s.task(() => 
					Promise.all(transformed.map((item: any) => dbQuery(item?.id || 0)))
				);
			},
		},
		{
			name: "circuit breaker pattern",
			fn: async () => {
				await using _s = scope({ name: "circuit-breaker-test" });
				
				// Simulate circuit breaker with retry
				let attempts = 0;
				await _s.task(async () => {
					attempts++;
					if (attempts < 3) {
						throw new Error("Service temporarily unavailable");
					}
					return { success: true };
				}, { retry: { max: 3, delay: 10 } });
			},
		},
		{
			name: "rate limited requests",
			fn: async () => {
				await using _s = scope({ name: "rate-limited" });
				const semaphore = _s.semaphore(3); // Max 3 concurrent
				
				await Promise.all(
					Array.from({ length: 10 }, () =>
						semaphore.acquire(async () => {
							await httpRequest("/api/data");
						})
					)
				);
			},
		},
	]);
}
