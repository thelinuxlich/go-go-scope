/**
 * WebSocket Playground Example
 *
 * Run with: npm run playground:websocket
 */

import { scope, exponentialBackoff } from "../src/index.js";

console.log("🔌 WebSocket Example\n");

// Mock WebSocket for demonstration
class MockWebSocket extends EventTarget {
	readyState = 0;
	private messageInterval?: ReturnType<typeof setInterval>;

	constructor(public url: string) {
		super();
		setTimeout(() => {
			this.readyState = 1;
			this.dispatchEvent(new Event("open"));
			this.startSendingMessages();
		}, 100);
	}

	send(data: string) {
		console.log(`   📤 Sent: ${data}`);
	}

	close() {
		this.readyState = 3;
		if (this.messageInterval) clearInterval(this.messageInterval);
		this.dispatchEvent(new Event("close"));
	}

	private startSendingMessages() {
		let counter = 0;
		this.messageInterval = setInterval(() => {
			counter++;
			const message = JSON.stringify({
				type: "update",
				data: { timestamp: Date.now(), value: counter },
			});
			this.dispatchEvent(new MessageEvent("message", { data: message }));
		}, 500);
	}
}

// Example 1: Basic WebSocket connection
console.log("1️⃣  Basic WebSocket connection:");
{
	await using s = scope();

	const connectWebSocket = async (): Promise<MockWebSocket> => {
		return new Promise((resolve, reject) => {
			const ws = new MockWebSocket("wss://api.example.com/live");

			ws.addEventListener("open", () => {
				console.log("   ✅ WebSocket connected");
				resolve(ws);
			});

			ws.addEventListener("error", () => {
				reject(new Error("WebSocket connection failed"));
			});
		});
	});

	const [err, ws] = await s.task(async () => connectWebSocket());

	if (!err && ws) {
		// Listen for messages
		ws.addEventListener("message", (event: MessageEvent) => {
			const msg = JSON.parse(event.data);
			console.log(`   📥 Received: ${JSON.stringify(msg)}`);
		});

		// Send a message
		ws.send(JSON.stringify({ type: "subscribe", channel: "updates" }));

		// Keep connection alive for a bit
		await new Promise((r) => setTimeout(r, 1200));

		console.log("   🔒 Closing connection...");
		ws.close();
	}
}

// Example 2: WebSocket with auto-reconnect
console.log("\n2️⃣  WebSocket with auto-reconnect:");
{
	await using s = scope();

	let reconnectAttempts = 0;
	const maxReconnects = 3;

	const connectWithRetry = async (): Promise<MockWebSocket> => {
		return new Promise((resolve, reject) => {
			const attempt = ++reconnectAttempts;
			console.log(`   🔄 Connection attempt ${attempt}/${maxReconnects}`);

			const ws = new MockWebSocket("wss://api.example.com/live");

			ws.addEventListener("open", () => {
				console.log("   ✅ Connected successfully");
				resolve(ws);
			});

			ws.addEventListener("error", () => {
				if (attempt >= maxReconnects) {
					reject(new Error("Max reconnection attempts reached"));
				}
			});
		});
	};

	const [err, ws] = await s.task(
		async () => connectWithRetry(),
		{ retry: { maxRetries: 2, delay: 500 } },
	);

	if (err) {
		console.log(`   ❌ Failed to connect: ${err.message}`);
	} else {
		console.log("   🎉 WebSocket ready for use!");
	}
}

// Example 3: WebSocket with heartbeat/ping
console.log("\n3️⃣  WebSocket with heartbeat:");
{
	await using s = scope();

	const [err, ws] = await s.task(async () => {
		return new Promise<MockWebSocket>((resolve) => {
			const ws = new MockWebSocket("wss://api.example.com/live");
			ws.addEventListener("open", () => resolve(ws));
		});
	});

	if (!err && ws) {
		// Set up heartbeat using poll
		s.poll(
			() => Promise.resolve({ ts: Date.now() }),
			() => {
				if (ws.readyState === 1) {
					ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
				}
			},
			{ interval: 600 },
		);

		console.log("   💓 Heartbeat started (every 600ms)");

		// Keep alive for demonstration
		await new Promise((r) => setTimeout(r, 1500));
		console.log("   ✅ Heartbeat working correctly");
	}
}

// Example 4: Message buffering during reconnection
console.log("\n4️⃣  Message buffering during reconnection:");
{
	await using s = scope();

	const messageQueue: string[] = [];
	let isConnected = false;

	// Simulate buffering messages while disconnected
	console.log("   📤 Queuing 3 messages while disconnected...");
	messageQueue.push(JSON.stringify({ type: "msg1", data: "A" }));
	messageQueue.push(JSON.stringify({ type: "msg2", data: "B" }));
	messageQueue.push(JSON.stringify({ type: "msg3", data: "C" }));

	// Connect
	const [err, ws] = await s.task(async () => {
		return new Promise<MockWebSocket>((resolve) => {
			const ws = new MockWebSocket("wss://api.example.com/live");
			ws.addEventListener("open", () => {
				isConnected = true;
				resolve(ws);
			});
		});
	});

	if (!err && ws) {
		console.log("   ✅ Connected, flushing buffer...");

		// Flush queued messages
		while (messageQueue.length > 0) {
			const msg = messageQueue.shift();
			if (msg) ws.send(msg);
		}

		console.log("   📭 Buffer flushed successfully");
	}
}

console.log("\n✨ WebSocket examples completed!");
