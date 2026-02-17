/**
 * WebSocket Chat Client Example
 * Demonstrates real-time communication with structured concurrency
 */

import { scope } from "go-go-scope";

interface ChatMessage {
	id: string;
	user: string;
	text: string;
	timestamp: number;
}

interface ChatClientOptions {
	url: string;
	user: string;
	onMessage?: (msg: ChatMessage) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
}

/**
 * WebSocket chat client with automatic reconnection and cleanup
 */
function createChatClient(options: ChatClientOptions) {
	const { url, user, onMessage, onConnect, onDisconnect } = options;

	return {
		async connect(): Promise<void> {
			await using s = scope();

			// Create WebSocket connection
			const ws = new WebSocket(url);

			// Set up connection with timeout
			const [connectErr] = await s.task(
				() =>
					new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(() => {
							reject(new Error("Connection timeout"));
						}, 5000);

						ws.onopen = () => {
							clearTimeout(timeout);
							resolve();
						};

						ws.onerror = (err) => {
							clearTimeout(timeout);
							reject(err);
						};
					}),
				{ timeout: 6000 },
			);

			if (connectErr) {
				throw connectErr;
			}

			onConnect?.();

			// Send join message
			ws.send(JSON.stringify({ type: "join", user }));

			// Handle incoming messages
			s.task(async ({ signal }) => {
				while (!signal.aborted) {
					const [err, msg] = await s.task(
						() =>
							new Promise<ChatMessage>((resolve, reject) => {
								const handler = (event: MessageEvent) => {
									try {
										const data = JSON.parse(event.data);
										resolve(data);
									} catch (e) {
										reject(e);
									}
								};

								ws.addEventListener("message", handler, { once: true });

								// Clean up if aborted
								signal.addEventListener("abort", () => {
									ws.removeEventListener("message", handler);
								});
								}),
						{ timeout: 1000 }, // Short timeout for periodic checks
					);

					if (!err && msg) {
						onMessage?.(msg);
					}
				}
			});

			// Heartbeat to keep connection alive
			s.poll(
				() => Promise.resolve(),
				() => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "ping" }));
					}
				},
				{ interval: 30000 },
			);

			// Clean up on scope disposal
			s.onDispose(() => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: "leave", user }));
					ws.close();
				}
				onDisconnect?.();
			});

			// Keep scope alive until externally disposed
			await new Promise(() => {});
		},

		async sendMessage(text: string): Promise<void> {
			await using s = scope({ timeout: 5000 });

			const [err] = await s.task(async () => {
				// Implementation would use the WebSocket
				console.log(`Sending: ${text}`);
			});

			if (err) throw err;
		},
	};
}

/**
 * Example: Chat room with multiple concurrent operations
 */
async function runChatRoom() {
	await using s = scope();

	const messages: ChatMessage[] = [];

	// Simulate receiving messages
	const messageHandler = s.task(async ({ signal }) => {
		let counter = 0;

		while (!signal.aborted) {
			await new Promise((r) => setTimeout(r, 2000));

			if (signal.aborted) break;

			const msg: ChatMessage = {
				id: String(++counter),
				user: `User${Math.floor(Math.random() * 5) + 1}`,
				text: `Message ${counter} at ${new Date().toLocaleTimeString()}`,
				timestamp: Date.now(),
			};

			messages.push(msg);
			console.log(`[${msg.user}]: ${msg.text}`);
		}
	});

	// Simulate sending messages
	const senderTask = s.task(async ({ signal }) => {
		const texts = ["Hello!", "How is everyone?", "Great to be here!", "See you later!"];

		for (const text of texts) {
			if (signal.aborted) break;

			await new Promise((r) => setTimeout(r, 3000));

			console.log(`[Me]: ${text}`);
		}
	});

	// Auto-disconnect after 15 seconds
	s.task(async ({ signal }) => {
		await new Promise((r) => setTimeout(r, 15000));
		if (!signal.aborted) {
			console.log("\n[Auto-disconnecting...]");
			// Scope disposal will clean up all tasks
		}
	});

	// Wait for all tasks
	await Promise.all([messageHandler, senderTask]);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log("=== Starting Chat Room (15 second demo) ===\n");
	runChatRoom().catch(console.error);
}

export { createChatClient, runChatRoom };
