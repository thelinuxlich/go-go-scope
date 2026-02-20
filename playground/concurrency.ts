/**
 * Concurrency Patterns Playground Example
 *
 * Run with: npm run playground:concurrency
 */

import { scope } from "../src/index.js";

console.log("⚡ Concurrency Patterns Example\n");

// Example 1: Semaphore for rate limiting
console.log("1️⃣  Semaphore for rate limiting:");
{
	await using s = scope();

	const semaphore = s.semaphore(2); // Max 2 concurrent

	const tasks = Array.from({ length: 5 }, (_, i) => async () => {
		await semaphore.acquire();
		console.log(`   🏃 Task ${i + 1} started`);
		await new Promise((r) => setTimeout(r, 300));
		console.log(`   ✅ Task ${i + 1} completed`);
		semaphore.release();
	});

	await Promise.all(tasks.map((t) => t()));
}

// Example 2: Channel for producer-consumer
console.log("\n2️⃣  Channel for producer-consumer pattern:");
{
	await using s = scope();

	const channel = s.channel<string>(3); // Buffer of 3

	// Producer
	const producer = s.task(async () => {
		for (let i = 0; i < 5; i++) {
			await channel.send(`Item ${i}`);
			console.log(`   📤 Produced: Item ${i}`);
		}
		channel.close();
	});

	// Consumer
	const consumer = s.task(async () => {
		let count = 0;
		for await (const item of channel) {
			console.log(`   📥 Consumed: ${item}`);
			await new Promise((r) => setTimeout(r, 100));
			count++;
		}
		return `Consumed ${count} items`;
	});

	const [, result] = await consumer;
	console.log(`   ✅ ${result}`);
}

// Example 3: Select for multiple channels
console.log("\n3️⃣  Select for waiting on multiple channels:");
{
	await using s = scope();

	const ch1 = s.channel<string>();
	const ch2 = s.channel<number>();

	// Senders
	s.task(async () => {
		await new Promise((r) => setTimeout(r, 100));
		await ch1.send("fast");
	});

	s.task(async () => {
		await new Promise((r) => setTimeout(r, 200));
		await ch2.send(42);
	});

	// Select - wait for whichever is ready first
	const [err, result] = await s.select([
		{ case: ch1, fn: (val) => console.log(`   🎯 Received from ch1: ${val}`) },
		{ case: ch2, fn: (val) => console.log(`   🎯 Received from ch2: ${val}`) },
	]);

	if (!err) {
		console.log("   ✅ Select resolved successfully");
	}
}

// Example 4: Race for first completion
console.log("\n4️⃣  Race for first completion:");
{
	await using s = scope();

	const [err, winner] = await s.race([
		async () => {
			await new Promise((r) => setTimeout(r, 300));
			return "Slow response";
		},
		async () => {
			await new Promise((r) => setTimeout(r, 100));
			return "Fast response";
		},
		async () => {
			await new Promise((r) => setTimeout(r, 200));
			return "Medium response";
		},
	]);

	console.log(err ? `   ❌ Error: ${err.message}` : `   🏆 Winner: ${winner}`);
}

// Example 5: Parallel with progress tracking
console.log("\n5️⃣  Parallel with progress tracking:");
{
	await using s = scope();

	const items = Array.from({ length: 10 }, (_, i) => i + 1);

	const results = await s.parallel(
		items.map((i) => async () => {
			// Simulate work
			await new Promise((r) => setTimeout(r, Math.random() * 200));
			return `Processed ${i}`;
		}),
		{
			concurrency: 3,
			onProgress: (done, total) => {
				console.log(`   📊 Progress: ${done}/${total} (${Math.round((done / total) * 100)}%)`);
			},
		},
	);

	const successCount = results.filter(([err]) => !err).length;
	console.log(`   ✅ Completed: ${successCount}/${items.length}`);
}

// Example 6: Broadcast channel
console.log("\n6️⃣  Broadcast channel (pub/sub):");
{
	await using s = scope();

	const broadcast = s.broadcast<string>();

	// Multiple subscribers
	const subscriber1 = broadcast.subscribe((msg) => {
		console.log(`   📻 Subscriber 1 received: ${msg}`);
	});

	const subscriber2 = broadcast.subscribe((msg) => {
		console.log(`   📻 Subscriber 2 received: ${msg}`);
	});

	const subscriber3 = broadcast.subscribe((msg) => {
		console.log(`   📻 Subscriber 3 received: ${msg}`);
	});

	// Send messages
	await broadcast.send("Hello everyone!");
	await broadcast.send("Second message");

	console.log("   ✅ All subscribers received both messages");
}

// Example 7: Channel operations (map, filter, take)
console.log("\n7️⃣  Channel operations:");
{
	await using s = scope();

	const numbers = s.channel<number>();

	// Send some numbers
	s.task(async () => {
		for (let i = 1; i <= 10; i++) {
			await numbers.send(i);
		}
		numbers.close();
	});

	// Process with operations
	const evens = numbers
		.filter((n) => n % 2 === 0) // Only even numbers
		.map((n) => n * 2); // Double them

	// Take first 3 results
	const results: number[] = [];
	for await (const num of evens) {
		results.push(num);
		if (results.length >= 3) break;
	}

	console.log(`   📝 First 3 doubled evens: ${results.join(", ")}`);
}

console.log("\n✨ Concurrency examples completed!");
