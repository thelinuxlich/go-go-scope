/**
 * HTTP Client Example
 * Demonstrates retry, timeout, and deduplication patterns
 */

import { scope, exponentialBackoff } from "go-go-scope";


interface User {
	id: number;
	name: string;
	email: string;
}

interface Post {
	id: number;
	userId: number;
	title: string;
	body: string;
}

/**
 * Create a resilient HTTP client with automatic retries and caching
 */
function createHttpClient(baseUrl: string) {
	return {
		async get<T>(path: string): Promise<T> {
			await using s = scope();

			const [err, data] = await s.task(
				async ({ signal }) => {
					const response = await fetch(`${baseUrl}${path}`, { signal });
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}
					return response.json() as Promise<T>;
				},
				{
					retry: {
						maxRetries: 3,
						delay: exponentialBackoff({ initial: 100, max: 5000 }),
					},
					timeout: 10000,
					// Memoize successful GET requests for 60 seconds
					memo: { key: `GET:${path}`, ttl: 60000 },
				},
			);

			if (err) throw err;
			return data!;
		},

		async getUserWithPosts(userId: number): Promise<{ user: User; posts: Post[] }> {
			await using s = scope({ concurrency: 2 });

			// Fetch user and posts in parallel
			const results = await s.parallel([
				async () => this.get<User>(`/users/${userId}`),
				async () => this.get<Post[]>(`/users/${userId}/posts`),
			]);
			const [userErr, userResult] = results[0] ?? [new Error("No result"), undefined];
			const [postsErr, postsResult] = results[1] ?? [new Error("No result"), undefined];

			if (userErr) throw userErr;
			if (postsErr) throw postsErr;

			return { user: userResult as User, posts: postsResult as Post[] };
		},

		async batchGetUsers(userIds: number[]): Promise<User[]> {
			await using s = scope({ concurrency: 5 });

			const results = await s.parallel(
				userIds.map((id) => () => this.get<User>(`/users/${id}`)),
				{
					continueOnError: true,
					onProgress: (done, total) => {
						console.log(`Progress: ${done}/${total} users fetched`);
					},
				},
			);

			// Return only successful results
			return results.filter(([err]) => !err).map(([, user]) => user!);
		},
	};
}

// Example usage
async function main() {
	const client = createHttpClient("https://jsonplaceholder.typicode.com");

	console.log("=== Fetching user with posts ===");
	const { user, posts } = await client.getUserWithPosts(1);
	console.log(`User: ${user.name}`);
	console.log(`Posts: ${posts.length}`);

	console.log("\n=== Batch fetching users ===");
	const users = await client.batchGetUsers([1, 2, 3, 4, 5]);
	console.log(`Successfully fetched ${users.length} users`);
	users.forEach((u) => console.log(`  - ${u.name}`));

	console.log("\n=== Demonstrating memoization ===");
	// This will use the cached result from the batch fetch
	const cachedUser = await client.get<User>("/users/1");
	console.log(`Cached user: ${cachedUser.name}`);

	console.log("\n=== Demonstrating deduplication ===");
	await using s = scope();

	// These two tasks will share the same execution
	const t1 = s.task(
		async () => {
			console.log("  Executing expensive operation...");
			await new Promise((r) => setTimeout(r, 100));
			return "result";
		},
		{ dedupe: "expensive-op" },
	);

	const t2 = s.task(
		async () => {
			console.log("  This should not print (deduplicated)");
			return "result2";
		},
		{ dedupe: "expensive-op" },
	);

	const [r1, r2] = await Promise.all([t1, t2]);
	console.log(`Both tasks got same result: ${r1[1] === r2[1]}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { createHttpClient };
