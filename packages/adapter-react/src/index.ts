/**
 * React hooks for go-go-scope
 *
 * Provides React hooks integration with go-go-scope's structured concurrency.
 * All hooks automatically clean up when components unmount.
 *
 * @example
 * ```tsx
 * import { useScope, useTask, useChannel } from "@go-go-scope/adapter-react";
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   // Auto-disposing scope
 *   const scope = useScope({ name: "UserProfile" });
 *
 *   // Reactive task with states
 *   const { data, error, isLoading, execute } = useTask(
 *     async () => fetchUser(userId),
 *     { immediate: true }
 *   );
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>Hello, {data?.name}</div>;
 * }
 * ```
 */

import {
	scope,
	BroadcastChannel,
	type Scope,
	type Channel,
	type Result,
} from "go-go-scope";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

// ============================================================================
// useScope Hook
// ============================================================================

/**
 * Options for useScope hook
 */
export interface UseScopeOptions {
	/** Scope name for debugging */
	name?: string;
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * React hook that creates a reactive scope.
 * The scope automatically disposes when the component unmounts.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const s = useScope({ name: "MyComponent" });
 *
 *   const handleClick = async () => {
 *     const [err, result] = await s.task(() => fetchData());
 *     // Handle result...
 *   };
 *
 *   return <button onClick={handleClick}>Fetch</button>;
 * }
 * ```
 */
export function useScope(options: UseScopeOptions = {}): Scope<Record<string, unknown>> {
	const scopeRef = useRef<Scope<Record<string, unknown>> | null>(null);

	if (!scopeRef.current) {
		scopeRef.current = scope({
			name: options.name,
			timeout: options.timeout,
		});
	}

	useEffect(() => {
		return () => {
			scopeRef.current?.[Symbol.asyncDispose]().catch(() => {});
		};
	}, []);

	return scopeRef.current;
}

// ============================================================================
// useTask Hook
// ============================================================================

/**
 * Options for useTask hook
 */
export interface UseTaskOptions<T> {
	/** Task name for debugging */
	name?: string;
	/** Whether to execute immediately */
	immediate?: boolean;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Retry options */
	retry?: { max?: number; delay?: number };
	/** Initial data value */
	initialData?: T;
}

/**
 * State returned by useTask hook
 */
export interface TaskState<T> {
	/** Current data (undefined if not loaded) */
	data: T | undefined;
	/** Error if task failed */
	error: Error | undefined;
	/** Whether task is currently running */
	isLoading: boolean;
	/** Whether task has been executed */
	isReady: boolean;
	/** Execute the task */
	execute: () => Promise<Result<Error, T>>;
}

/**
 * React hook for executing tasks with structured concurrency.
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const { data, error, isLoading } = useTask(
 *     async () => fetchUser(userId),
 *     { immediate: true }
 *   );
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>{data?.name}</div>;
 * }
 * ```
 */
export function useTask<T>(
	factory: (signal: AbortSignal) => Promise<T>,
	options: UseTaskOptions<T> = {},
): TaskState<T> {
	const s = useScope({ name: options.name ?? "useTask" });

	const [data, setData] = useState<T | undefined>(options.initialData);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(false);
	const [isReady, setIsReady] = useState(false);

	const execute = useCallback(async (): Promise<Result<Error, T>> => {
		setIsLoading(true);
		setError(undefined);

		try {
			const [err, result] = await s.task(
				async ({ signal }) => await factory(signal),
				{
					timeout: options.timeout,
					retry: options.retry,
				},
			);

			if (err) {
				setError(err instanceof Error ? err : new Error(String(err)));
				setData(undefined);
				return [err as Error, undefined];
			}

			setData(result);
			setIsReady(true);
			return [undefined, result];
		} finally {
			setIsLoading(false);
		}
	}, [s, factory, options.timeout, options.retry]);

	useEffect(() => {
		if (options.immediate) {
			execute();
		}
	}, []);

	return {
		data,
		error,
		isLoading,
		isReady,
		execute,
	};
}

// ============================================================================
// useParallel Hook
// ============================================================================

/**
 * Options for useParallel hook
 */
export interface UseParallelOptions {
	/** Concurrency limit */
	concurrency?: number;
	/** Whether to execute immediately */
	immediate?: boolean;
}

/**
 * State returned by useParallel hook
 */
export interface ParallelState<T> {
	/** Results from all tasks */
	results: (T | undefined)[];
	/** Errors from failed tasks */
	errors: (Error | undefined)[];
	/** Whether any task is running */
	isLoading: boolean;
	/** Progress percentage (0-100) */
	progress: number;
	/** Execute all tasks */
	execute: () => Promise<Result<Error, T>[]>;
}

/**
 * React hook for executing tasks in parallel.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const factories = [
 *     () => fetchUsers(),
 *     () => fetchPosts(),
 *     () => fetchComments(),
 *   ];
 *
 *   const { results, isLoading, progress } = useParallel(factories, {
 *     concurrency: 2,
 *     immediate: true
 *   });
 *
 *   if (isLoading) return <progress value={progress} max="100" />;
 *
 *   const [users, posts, comments] = results;
 *   return <DashboardView {...{ users, posts, comments }} />;
 * }
 * ```
 */
export function useParallel<T>(
	factories: (() => Promise<T>)[],
	options: UseParallelOptions = {},
): ParallelState<T> {
	const s = useScope({ name: "useParallel" });

	const [results, setResults] = useState<(T | undefined)[]>([]);
	const [errors, setErrors] = useState<(Error | undefined)[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [progress, setProgress] = useState(0);

	const execute = useCallback(async (): Promise<Result<Error, T>[]> => {
		setIsLoading(true);
		setProgress(0);
		setResults(new Array(factories.length).fill(undefined));
		setErrors(new Array(factories.length).fill(undefined));

		try {
			const taskFactories = factories.map((factory, index) => {
				return async () => {
					const [err, result] = await s.task(async () => await factory());

					if (err) {
						setErrors((prev) => {
							const next = [...prev];
							next[index] = err instanceof Error ? err : new Error(String(err));
							return next;
						});
					} else {
						setResults((prev) => {
							const next = [...prev];
							next[index] = result;
							return next;
						});
					}

					setProgress(Math.round(((index + 1) / factories.length) * 100));
					return [err, result] as Result<Error, T>;
				};
			});

			return (await s.parallel(taskFactories, {
				concurrency: options.concurrency,
			})) as Result<Error, T>[];
		} finally {
			setIsLoading(false);
		}
	}, [s, factories, options.concurrency]);

	useEffect(() => {
		if (options.immediate) {
			execute();
		}
	}, []);

	return {
		results,
		errors,
		isLoading,
		progress,
		execute,
	};
}

// ============================================================================
// useChannel Hook
// ============================================================================

/**
 * Options for useChannel hook
 */
export interface UseChannelOptions {
	/** Buffer size */
	bufferSize?: number;
	/** Maximum history to keep */
	historySize?: number;
}

/**
 * State returned by useChannel hook
 */
export interface ChannelState<T> {
	/** Latest received value */
	latest: T | undefined;
	/** History of values */
	history: readonly T[];
	/** Whether channel is closed */
	isClosed: boolean;
	/** Send a value */
	send: (value: T) => Promise<void>;
	/** Close the channel */
	close: () => void;
}

/**
 * React hook for Go-style channel communication.
 *
 * @example
 * ```tsx
 * function Chat() {
 *   const ch = useChannel<string>();
 *
 *   const handleSubmit = async (message: string) => {
 *     await ch.send(message);
 *   };
 *
 *   return (
 *     <div>
 *       <p>Latest: {ch.latest}</p>
 *       <ul>
 *         {ch.history.map((msg, i) => <li key={i}>{msg}</li>)}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function useChannel<T>(options: UseChannelOptions = {}): ChannelState<T> {
	const s = useScope({ name: "useChannel" });
	const chRef = useRef<Channel<T> | null>(null);

	if (!chRef.current) {
		chRef.current = s.channel<T>(options.bufferSize ?? 0);
	}

	const [latest, setLatest] = useState<T | undefined>(undefined);
	const [history, setHistory] = useState<T[]>([]);
	const [isClosed, setIsClosed] = useState(false);

	useEffect(() => {
		const ch = chRef.current!;

		const receiveLoop = async () => {
			for await (const value of ch) {
				setLatest(value);
				setHistory((prev) => [...prev.slice(-(options.historySize ?? 100)), value]);
			}
			setIsClosed(true);
		};

		receiveLoop();

		return () => {
			ch.close();
		};
	}, [options.historySize]);

	const send = useCallback(
		async (value: T): Promise<void> => {
			await chRef.current!.send(value);
		},
		[],
	);

	const close = useCallback((): void => {
		chRef.current!.close();
	}, []);

	return {
		latest,
		history,
		isClosed,
		send,
		close,
	};
}

// ============================================================================
// useBroadcast Hook
// ============================================================================

/**
 * State returned by useBroadcast hook
 */
export interface BroadcastState<T> {
	/** Latest broadcasted value */
	latest: T | undefined;
	/** Subscribe to broadcasts */
	subscribe: (callback: (value: T) => void) => { unsubscribe: () => void };
	/** Broadcast a value */
	broadcast: (value: T) => void;
}

/**
 * React hook for pub/sub broadcast channels.
 *
 * @example
 * ```tsx
 * function EventBus() {
 *   const bus = useBroadcast<string>();
 *
 *   useEffect(() => {
 *     const sub = bus.subscribe((msg) => console.log(msg));
 *     return () => sub.unsubscribe();
 *   }, []);
 *
 *   return <button onClick={() => bus.broadcast("Hello!")}>Send</button>;
 * }
 * ```
 */
export function useBroadcast<T>(): BroadcastState<T> {
	const [latest, setLatest] = useState<T | undefined>(undefined);
	const bcRef = useRef<BroadcastChannel<T> | null>(null);
	const listenersRef = useRef<Set<(value: T) => void>>(new Set());

	if (!bcRef.current) {
		bcRef.current = new BroadcastChannel<T>();
	}

	useEffect(() => {
		const bc = bcRef.current!;

		const receiveLoop = async () => {
			for await (const value of bc.subscribe()) {
				setLatest(value);
				listenersRef.current.forEach((listener) => listener(value));
			}
		};

		receiveLoop();

		return () => {
			bc.close();
		};
	}, []);

	const subscribe = useCallback((callback: (value: T) => void) => {
		listenersRef.current.add(callback);
		return {
			unsubscribe: () => {
				listenersRef.current.delete(callback);
			},
		};
	}, []);

	const broadcastFn = useCallback((value: T): void => {
		bcRef.current!.send(value).catch(() => {});
		setLatest(value);
	}, []);

	return {
		latest,
		subscribe,
		broadcast: broadcastFn,
	};
}

// ============================================================================
// usePolling Hook
// ============================================================================

/**
 * Options for usePolling hook
 */
export interface UsePollingOptions {
	/** Interval in milliseconds */
	interval: number;
	/** Whether to start immediately */
	immediate?: boolean;
	/** Continue when tab is hidden */
	continueOnHidden?: boolean;
}

/**
 * State returned by usePolling hook
 */
export interface PollingState<T> {
	/** Latest data */
	data: T | undefined;
	/** Error if polling failed */
	error: Error | undefined;
	/** Whether currently polling */
	isPolling: boolean;
	/** Number of polls completed */
	pollCount: number;
	/** Start polling */
	start: () => void;
	/** Stop polling */
	stop: () => void;
}

/**
 * React hook for polling data at intervals.
 *
 * @example
 * ```tsx
 * function LiveData() {
 *   const { data, isPolling, stop } = usePolling(
 *     async () => fetchLatestData(),
 *     { interval: 5000, immediate: true }
 *   );
 *
 *   return (
 *     <div>
 *       <p>{data}</p>
 *       {isPolling && <button onClick={stop}>Stop</button>}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePolling<T>(
	factory: () => Promise<T>,
	options: UsePollingOptions,
): PollingState<T> {
	const s = useScope({ name: "usePolling" });

	const [data, setData] = useState<T | undefined>(undefined);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [isPolling, setIsPolling] = useState(false);
	const [pollCount, setPollCount] = useState(0);
	const pollerRef = useRef<ReturnType<typeof s.poll> | null>(null);

	const start = useCallback((): void => {
		if (!isPolling && !pollerRef.current) {
			pollerRef.current = s.poll(
				async () => {
					try {
						const value = await factory();
						return { success: true, value } as { success: true; value: T };
					} catch (e) {
						return { success: false, error: e } as { success: false; error: unknown };
					}
				},
				(result) => {
					if (result.success) {
						setData(result.value);
						setPollCount((c) => c + 1);
					} else {
						setError(result.error instanceof Error ? result.error : new Error(String(result.error)));
					}
				},
				{ interval: options.interval },
			);
			setIsPolling(true);
		}
	}, [s, factory, options.interval, isPolling]);

	const stop = useCallback((): void => {
		if (isPolling && pollerRef.current) {
			pollerRef.current.stop();
			setIsPolling(false);
			pollerRef.current = null;
		}
	}, [isPolling]);

	useEffect(() => {
		if (options.immediate !== false) {
			start();
		}

		return () => {
			stop();
		};
	}, []);

	// Handle visibility change
	useEffect(() => {
		if (!options.continueOnHidden && typeof document !== "undefined") {
			const handler = () => {
				if (document.hidden) {
					stop();
				} else if (options.immediate !== false) {
					start();
				}
			};

			document.addEventListener("visibilitychange", handler);
			return () => document.removeEventListener("visibilitychange", handler);
		}
	}, [options.continueOnHidden, options.immediate, start, stop]);

	return {
		data,
		error,
		isPolling,
		pollCount,
		start,
		stop,
	};
}

// Re-export types
export type { Result, Scope, Channel, BroadcastChannel } from "go-go-scope";
