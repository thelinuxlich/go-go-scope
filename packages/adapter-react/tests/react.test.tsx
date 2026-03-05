/**
 * Integration tests for @go-go-scope/adapter-react
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React, { useEffect, useState } from "react";
import {
	useScope,
	useTask,
	useParallel,
	useChannel,
	useBroadcast,
	usePolling,
} from "../src/index.js";

describe("React adapter integration", () => {
	describe("useScope", () => {
		test("creates scope that disposes on unmount", async () => {
			const onDispose = vi.fn();

			function TestComponent() {
				const scope = useScope({ name: "test" });
				scope.onDispose(onDispose);
				return <div data-testid="active">active</div>;
			}

			const { unmount } = render(<TestComponent />);
			expect(screen.getByTestId("active").textContent).toBe("active");

			unmount();
			await new Promise((r) => setTimeout(r, 50));
			expect(onDispose).toHaveBeenCalled();
		});

		test("scope executes tasks", async () => {
			function TestComponent() {
				const scope = useScope();
				const [result, setResult] = useState("");

				const runTask = async () => {
					const [, data] = await scope.task(() => Promise.resolve("hello"));
					setResult(data ?? "");
				};

				return (
					<div>
						<span data-testid="result">{result}</span>
						<button data-testid="run" onClick={runTask}>
							Run
						</button>
					</div>
				);
			}

			render(<TestComponent />);
			fireEvent.click(screen.getByTestId("run"));

			await waitFor(() => {
				expect(screen.getByTestId("result").textContent).toBe("hello");
			});
		});
	});

	describe("useTask", () => {
		test("executes task immediately when immediate is true", async () => {
			function TestComponent() {
				const { data, isLoading } = useTask(
					async () => "fetched-data",
					{ immediate: true },
				);

				return (
					<div>
						<span data-testid="loading">{isLoading ? "loading" : "done"}</span>
						<span data-testid="data">{data ?? "no-data"}</span>
					</div>
				);
			}

			render(<TestComponent />);

			expect(screen.getByTestId("loading").textContent).toBe("loading");

			await waitFor(() => {
				expect(screen.getByTestId("data").textContent).toBe("fetched-data");
			});

			expect(screen.getByTestId("loading").textContent).toBe("done");
		});

		test("manual execution with execute()", async () => {
			let callCount = 0;

			function TestComponent() {
				const { data, execute } = useTask(async () => {
					callCount++;
					return `result-${callCount}`;
				}, { immediate: false });

				return (
					<div>
						<span data-testid="data">{data ?? "no-data"}</span>
						<button data-testid="execute" onClick={execute}>
							Execute
						</button>
					</div>
				);
			}

			render(<TestComponent />);
			expect(screen.getByTestId("data").textContent).toBe("no-data");

			fireEvent.click(screen.getByTestId("execute"));

			await waitFor(() => {
				expect(screen.getByTestId("data").textContent).toBe("result-1");
			});
		});

		test("handles task errors", async () => {
			function TestComponent() {
				const { error, data, execute } = useTask(
					async () => {
						throw new Error("Task failed");
					},
					{ immediate: false },
				);

				return (
					<div>
						<span data-testid="error">{error?.message ?? "no-error"}</span>
						<span data-testid="data">{data ?? "no-data"}</span>
						<button data-testid="execute" onClick={execute}>
							Execute
						</button>
					</div>
				);
			}

			render(<TestComponent />);
			fireEvent.click(screen.getByTestId("execute"));

			await waitFor(() => {
				expect(screen.getByTestId("error").textContent).toBe("Task failed");
			});

			expect(screen.getByTestId("data").textContent).toBe("no-data");
		});
	});

	describe("useParallel", () => {
		test("executes tasks in parallel with progress", async () => {
			const delays = [50, 30, 70];
			const factories = delays.map((delay, i) => async () => {
				await new Promise((r) => setTimeout(r, delay));
				return `task-${i}`;
			});

			function TestComponent() {
				const { progress, results, isLoading } = useParallel(factories, {
					immediate: true,
				});

				return (
					<div>
						<span data-testid="progress">{progress}</span>
						<span data-testid="results">{JSON.stringify(results.filter(Boolean))}</span>
						<span data-testid="loading">{isLoading ? "loading" : "done"}</span>
					</div>
				);
			}

			render(<TestComponent />);

			await waitFor(() => {
				expect(screen.getByTestId("progress").textContent).toBe("100");
			}, { timeout: 5000 });

			await waitFor(() => {
				expect(screen.getByTestId("loading").textContent).toBe("done");
			});

			const results = JSON.parse(screen.getByTestId("results").textContent ?? "[]");
			expect(results).toContain("task-0");
			expect(results).toContain("task-1");
			expect(results).toContain("task-2");
		});
	});

	describe("useChannel", () => {
		test.skip("sends and receives messages", async () => {
			function TestComponent() {
				const { latest, history, send } = useChannel<string>();

				const sendMessages = async () => {
					await send("msg-1");
					await send("msg-2");
				};

				return (
					<div>
						<span data-testid="latest">{latest ?? "no-msg"}</span>
						<span data-testid="history">{JSON.stringify(history)}</span>
						<button data-testid="send" onClick={sendMessages}>
							Send
						</button>
					</div>
				);
			}

			render(<TestComponent />);
			fireEvent.click(screen.getByTestId("send"));

			await waitFor(() => {
				expect(screen.getByTestId("latest").textContent).toBe("msg-2");
			}, { timeout: 500 });

			const history = JSON.parse(screen.getByTestId("history").textContent ?? "[]");
			expect(history).toEqual(["msg-1", "msg-2"]);
		});

		test("closes channel properly", async () => {
			function TestComponent() {
				const { isClosed, close } = useChannel<string>();

				return (
					<div>
						<span data-testid="closed">{isClosed ? "yes" : "no"}</span>
						<button data-testid="close" onClick={close}>
							Close
						</button>
					</div>
				);
			}

			render(<TestComponent />);
			expect(screen.getByTestId("closed").textContent).toBe("no");

			fireEvent.click(screen.getByTestId("close"));

			await waitFor(() => {
				expect(screen.getByTestId("closed").textContent).toBe("yes");
			});
		});
	});

	describe("useBroadcast", () => {
		test("broadcasts to subscribers", async () => {
			const received: string[] = [];

			function Receiver() {
				const { subscribe } = useBroadcast<string>();

				useEffect(() => {
					const sub = subscribe((msg) => received.push(msg));
					return () => sub.unsubscribe();
				}, []);

				return <div data-testid="receiver">receiver</div>;
			}

			function Broadcaster() {
				const { broadcast, latest } = useBroadcast<string>();

				return (
					<div>
						<span data-testid="latest">{latest ?? "no-msg"}</span>
						<button data-testid="broadcast" onClick={() => {
							broadcast("hello");
							broadcast("world");
						}}>
							Broadcast
						</button>
					</div>
				);
			}

			function App() {
				return (
					<div>
						<Receiver />
						<Broadcaster />
					</div>
				);
			}

			render(<App />);

			// Wait for subscription to be set up
			await new Promise((r) => setTimeout(r, 50));

			fireEvent.click(screen.getByTestId("broadcast"));

			// Wait for broadcast to be processed
			await new Promise((r) => setTimeout(r, 50));

			await waitFor(() => {
				expect(screen.getByTestId("latest").textContent).toBe("world");
			});
		});
	});

	describe("usePolling", () => {
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
		});

		test("polls at specified interval", async () => {
			function TestComponent() {
				const { data, pollCount } = usePolling(
					async () => `data-${Date.now()}`,
					{ interval: 1000, immediate: true },
				);

				return (
					<div>
						<span data-testid="data">{data ?? "no-data"}</span>
						<span data-testid="count">{pollCount}</span>
					</div>
				);
			}

			render(<TestComponent />);

			// First poll
			await act(async () => {
				vi.advanceTimersByTime(10);
			});

			await waitFor(() => {
				expect(screen.getByTestId("count").textContent).toBe("1");
			});

			// Second poll
			await act(async () => {
				vi.advanceTimersByTime(1000);
			});

			await waitFor(() => {
				expect(screen.getByTestId("count").textContent).toBe("2");
			});

			vi.useRealTimers();
		});

		test("stops polling when stop() called", async () => {
			function TestComponent() {
				const { isPolling, stop, data } = usePolling(
					async () => `data-${Date.now()}`,
					{ interval: 1000, immediate: true },
				);

				return (
					<div>
						<span data-testid="data">{data ?? "no-data"}</span>
						<span data-testid="polling">{isPolling ? "yes" : "no"}</span>
						<button data-testid="stop" onClick={stop}>
							Stop
						</button>
					</div>
				);
			}

			render(<TestComponent />);

			await act(async () => {
				vi.advanceTimersByTime(50);
			});

			await waitFor(() => {
				expect(screen.getByTestId("polling").textContent).toBe("yes");
			});

			fireEvent.click(screen.getByTestId("stop"));

			await waitFor(() => {
				expect(screen.getByTestId("polling").textContent).toBe("no");
			});

			vi.useRealTimers();
		});
	});
});
