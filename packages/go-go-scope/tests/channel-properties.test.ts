/**
 * Property-based tests for Channel operations
 */

import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { scope } from "../src/index.js";

describe("Channel Property-Based Tests", () => {
	describe("send/receive properties", () => {
		test("sent values are received in FIFO order", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { minLength: 1, maxLength: 50 }),
					async (values) => {
						await using s = scope();
						const ch = s.channel<number>(values.length);

						// Send all values
						for (const v of values) {
							await ch.send(v);
						}
						ch.close();

						// Receive all values
						const received: number[] = [];
						for await (const v of ch) {
							received.push(v);
						}

						expect(received).toEqual(values);
					},
				),
				{ numRuns: 100 },
			);
		});

		test("channel size never exceeds capacity", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.integer({ min: 1, max: 20 }),
					fc.integer({ min: 1, max: 50 }),
					async (capacity, sendCount) => {
						await using s = scope();
						const ch = s.channel<number>(capacity);

						// Start sending without receiving
						const sendPromises: Promise<boolean>[] = [];
						for (let i = 0; i < sendCount; i++) {
							sendPromises.push(ch.send(i));
						}

						// Size should never exceed capacity
						expect(ch.size).toBeLessThanOrEqual(capacity);

						// Clean up
						ch.close();
						await Promise.allSettled(sendPromises);
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("broadcast channel properties", () => {
		test("all subscribers receive all messages", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
					fc.integer({ min: 1, max: 5 }),
					async (messages, subscriberCount) => {
						await using s = scope();
						const broadcast = s.broadcast<number>();

						// Create subscribers
						const subscribers: number[][] = Array.from(
							{ length: subscriberCount },
							() => [],
						);

						const subPromises = subscribers.map(async (received, idx) => {
							for await (const msg of broadcast.subscribe()) {
								received.push(msg);
							}
						});

						// Send all messages
						for (const msg of messages) {
							await broadcast.send(msg);
						}
						broadcast.close();

						// Wait for all subscribers
						await Promise.all(subPromises);

						// All subscribers should have received all messages
						for (const received of subscribers) {
							expect(received).toEqual(messages);
						}
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});
