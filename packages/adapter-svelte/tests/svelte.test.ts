/**
 * Integration tests for @go-go-scope/adapter-svelte
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import Component from "./TestComponent.svelte";

describe("Svelte adapter integration", () => {
	describe("createScope", () => {
		test("creates and auto-disposes scope", async () => {
			const onDispose = vi.fn();

			const { unmount } = render(Component, {
				props: { testType: "scope", onDispose },
			});

			// Component should be active
			expect(screen.getByTestId("active").textContent).toBe("true");

			// Unmount
			unmount();
			await tick();

			// Give time for async disposal
			await new Promise((r) => setTimeout(r, 50));
			expect(onDispose).toHaveBeenCalled();
		});
	});

	describe("createTask", () => {
		test("executes task immediately when immediate is true", async () => {
			render(Component, {
				props: { testType: "task-immediate" },
			});

			// Should start loading
			expect(screen.getByTestId("loading").textContent).toBe("true");

			// Wait for completion
			await waitFor(() => {
				expect(screen.getByTestId("data").textContent).toBe("fetched-data");
			}, { timeout: 1000 });

			expect(screen.getByTestId("loading").textContent).toBe("false");
		});

		test("manual execution with execute()", async () => {
			const { component } = render(Component, {
				props: { testType: "task-manual" },
			});

			// Should not have data initially
			expect(screen.getByTestId("data").textContent).toBe("no-data");

			// Execute manually
			await fireEvent.click(screen.getByTestId("execute-btn"));

			await waitFor(() => {
				expect(screen.getByTestId("data").textContent).toBe("result-1");
			});
		});

		test("handles task errors", async () => {
			render(Component, {
				props: { testType: "task-error" },
			});

			// Execute failing task
			await fireEvent.click(screen.getByTestId("execute-btn"));

			await waitFor(() => {
				expect(screen.getByTestId("error").textContent).toBe("Task failed");
			});

			expect(screen.getByTestId("data").textContent).toBe("no-data");
		});
	});

	describe("createParallel", () => {
		test("executes tasks in parallel with progress", async () => {
			render(Component, {
				props: { testType: "parallel" },
			});

			// Should show progress
			await waitFor(() => {
				const progress = screen.getByTestId("progress").textContent;
				return progress === "100";
			}, { timeout: 5000 });

			// Wait a bit more for results to update
			await new Promise(r => setTimeout(r, 100));

			const results = JSON.parse(screen.getByTestId("results").textContent ?? "[]");
			expect(results).toContain("task-0");
			expect(results).toContain("task-1");
			expect(results).toContain("task-2");
		});
	});

	describe("createChannel", () => {
		test("sends and receives messages", async () => {
			render(Component, {
				props: { testType: "channel" },
			});

			// Send messages
			await fireEvent.click(screen.getByTestId("send-btn"));

			await waitFor(() => {
				expect(screen.getByTestId("latest").textContent).toBe("msg-2");
			});

			const history = JSON.parse(screen.getByTestId("history").textContent ?? "[]");
			expect(history).toEqual(["msg-1", "msg-2"]);
		});

		test("closes channel properly", async () => {
			render(Component, {
				props: { testType: "channel-close" },
			});

			expect(screen.getByTestId("closed").textContent).toBe("false");

			// Close channel
			await fireEvent.click(screen.getByTestId("close-btn"));

			await waitFor(() => {
				expect(screen.getByTestId("closed").textContent).toBe("true");
			});
		});
	});

	describe("createBroadcast", () => {
		test("broadcasts to subscribers", async () => {
			render(Component, {
				props: { 
					testType: "broadcast",
				},
			});

			// Initial state
			expect(screen.getByTestId("latest").textContent).toBe("no-msg");

			// Broadcast
			await fireEvent.click(screen.getByTestId("broadcast-btn"));

			await waitFor(() => {
				expect(screen.getByTestId("latest").textContent).toBe("world");
			});
		});
	});

	describe("createPolling", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test("polls at specified interval", async () => {
			render(Component, {
				props: { testType: "polling" },
			});

			// First poll
			await vi.advanceTimersByTimeAsync(10);
			await tick();

			expect(screen.getByTestId("data").textContent).toBe("poll-1");

			// Second poll
			await vi.advanceTimersByTimeAsync(1000);
			await tick();

			expect(screen.getByTestId("data").textContent).toBe("poll-2");
		});

		test("stops polling when stop() called", async () => {
			render(Component, {
				props: { testType: "polling-stop" },
			});

			await vi.advanceTimersByTimeAsync(10);
			await tick();

			expect(screen.getByTestId("polling").textContent).toBe("true");

			// Stop polling
			await fireEvent.click(screen.getByTestId("stop-btn"));
			await tick();

			expect(screen.getByTestId("polling").textContent).toBe("false");
		});
	});
});
