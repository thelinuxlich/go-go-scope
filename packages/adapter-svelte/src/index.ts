/**
 * Svelte 5 runes integration for go-go-scope
 *
 * Provides native Svelte 5 runes ($state, $effect, $derived) integration.
 * Scopes automatically clean up when components are destroyed.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createScope, createTask } from "@go-go-scope/adapter-svelte";
 *
 *   // Auto-disposing scope
 *   const scope = createScope({ name: "my-component" });
 *
 *   // Reactive task
 *   const { data, isLoading } = createTask(
 *     async () => fetchUser(userId),
 *     { immediate: true }
 *   );
 * </script>
 *
 * {#if $isLoading}
 *   <p>Loading...</p>
 * {:else}
 *   <p>{$data.name}</p>
 * {/if}
 * ```
 */

import {
	scope,
	BroadcastChannel,
	type Scope,
	type Result,
} from "go-go-scope";
import { onDestroy } from "svelte";
import { writable, type Readable } from "svelte/store";

// ============================================================================
// Core - Scope
// ============================================================================

/**
 * Options for creating a scope
 */
export interface CreateScopeOptions {
	/** Scope name for debugging */
	name?: string;
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Reactive scope with automatic cleanup
 */
export interface ReactiveScope extends Scope {
	/** Whether the scope is currently active */
	readonly isActive: Readable<boolean>;
}

/**
 * Create a reactive scope that automatically disposes on component destroy.
 *
 * @example
 * ```svelte
 * <script>
 *   const s = createScope({ name: "my-component" });
 *
 *   // Scope is automatically disposed when component is destroyed
 *   const [err, result] = await s.task(() => fetchData());
 * </script>
 * ```
 */
export function createScope(options: CreateScopeOptions = {}): ReactiveScope {
	const isActive = writable(true);

	const s = scope({
		name: options.name,
		timeout: options.timeout,
	});

	// Auto-dispose on component destroy
	onDestroy(() => {
		isActive.set(false);
		s[Symbol.asyncDispose]().catch(() => {
			// Ignore disposal errors
		});
	});

	return Object.assign(s as unknown as ReactiveScope, {
		isActive: { subscribe: isActive.subscribe },
	});
}

// ============================================================================
// Task Store
// ============================================================================

/**
 * Options for creating a task
 */
export interface CreateTaskOptions<T> {
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
 * Reactive task state
 */
export interface TaskState<T> {
	/** Current data (undefined if not loaded) */
	readonly data: Readable<T | undefined>;
	/** Error if task failed */
	readonly error: Readable<Error | undefined>;
	/** Whether task is currently running */
	readonly isLoading: Readable<boolean>;
	/** Whether task has been executed */
	readonly isReady: Readable<boolean>;
	/** Execute the task */
	readonly execute: () => Promise<Result<Error, T>>;
}

/**
 * Create a reactive task that integrates with Svelte's store system.
 * Returns a store-like object that can be used with `$` prefix.
 *
 * @example
 * ```svelte
 * <script>
 *   const task = createTask(
 *     async () => fetchUser(userId),
 *     { immediate: true }
 *   );
 * </script>
 *
 * {#if $task.isLoading}
 *   <p>Loading...</p>
 * {:else if $task.error}
 *   <p>Error: {$task.error.message}</p>
 * {:else}
 *   <p>{$task.data.name}</p>
 * {/if}
 * ```
 */
export function createTask<T>(
	factory: () => Promise<T>,
	options: CreateTaskOptions<T> = {},
): TaskState<T> {
	const s = createScope({ name: options.name ?? "createTask" });

	const data = writable<T | undefined>(options.initialData);
	const error = writable<Error | undefined>(undefined);
	const isLoading = writable(false);
	const isReady = writable(false);

	const execute = async (): Promise<Result<Error, T>> => {
		isLoading.set(true);
		error.set(undefined);

		try {
			const [err, result] = await s.task(
				async () => await factory(),
				{
					timeout: options.timeout,
					retry: options.retry,
				},
			);

			if (err) {
				error.set(err instanceof Error ? err : new Error(String(err)));
				data.set(undefined);
				return [err as Error, undefined];
			}

			data.set(result);
			isReady.set(true);
			return [undefined, result];
		} finally {
			isLoading.set(false);
		}
	};

	// Auto-execute if immediate
	if (options.immediate) {
		execute();
	}

	return {
		data: { subscribe: data.subscribe },
		error: { subscribe: error.subscribe },
		isLoading: { subscribe: isLoading.subscribe },
		isReady: { subscribe: isReady.subscribe },
		execute,
	};
}

// ============================================================================
// Parallel Tasks Store
// ============================================================================

/**
 * Options for parallel execution
 */
export interface CreateParallelOptions {
	/** Concurrency limit */
	concurrency?: number;
	/** Whether to execute immediately */
	immediate?: boolean;
}

/**
 * Reactive parallel task state
 */
export interface ParallelState<T> {
	/** Results from all tasks */
	readonly results: Readable<(T | undefined)[]>;
	/** Errors from failed tasks */
	readonly errors: Readable<(Error | undefined)[]>;
	/** Whether any task is running */
	readonly isLoading: Readable<boolean>;
	/** Progress percentage (0-100) */
	readonly progress: Readable<number>;
	/** Execute all tasks */
	readonly execute: () => Promise<Result<Error, T>[]>;
}

/**
 * Create reactive parallel task execution.
 *
 * @example
 * ```svelte
 * <script>
 *   const parallel = createParallel(
 *     urls.map(url => () => fetch(url).then(r => r.json())),
 *     { concurrency: 3, immediate: true }
 *   );
 * </script>
 *
 * <progress value={$parallel.progress} max="100" />
 * ```
 */
export function createParallel<T>(
	factories: (() => Promise<T>)[],
	options: CreateParallelOptions = {},
): ParallelState<T> {
	const s = createScope({ name: "createParallel" });

	const results = writable<(T | undefined)[]>([]);
	const errors = writable<(Error | undefined)[]>([]);
	const isLoading = writable(false);
	const progress = writable(0);

	const execute = async (): Promise<Result<Error, T>[]> => {
		isLoading.set(true);
		progress.set(0);
		results.set(new Array(factories.length).fill(undefined));
		errors.set(new Array(factories.length).fill(undefined));

		try {
			const taskFactories = factories.map((factory, index) => {
				return async () => {
					const [err, result] = await s.task(async () => await factory());

					if (err) {
						errors.update(e => {
							e[index] = err instanceof Error ? err : new Error(String(err));
							return e;
						});
					} else {
						results.update(r => {
							r[index] = result;
							return r;
						});
					}

					progress.set(Math.round(((index + 1) / factories.length) * 100));
					return [err, result] as Result<Error, T>;
				};
			});

			return (await s.parallel(taskFactories, {
				concurrency: options.concurrency,
			})) as Result<Error, T>[];
		} finally {
			isLoading.set(false);
		}
	};

	if (options.immediate) {
		execute();
	}

	return {
		results: { subscribe: results.subscribe },
		errors: { subscribe: errors.subscribe },
		isLoading: { subscribe: isLoading.subscribe },
		progress: { subscribe: progress.subscribe },
		execute,
	};
}

// ============================================================================
// Channel Store
// ============================================================================

/**
 * Options for creating a channel
 */
export interface CreateChannelOptions {
	/** Buffer size */
	bufferSize?: number;
	/** Maximum history to keep */
	historySize?: number;
}

/**
 * Reactive channel state
 */
export interface ChannelState<T> {
	/** Latest received value */
	readonly latest: Readable<T | undefined>;
	/** History of values */
	readonly history: Readable<readonly T[]>;
	/** Whether channel is closed */
	readonly isClosed: Readable<boolean>;
	/** Send a value */
	readonly send: (value: T) => Promise<void>;
	/** Close the channel */
	readonly close: () => void;
}

/**
 * Create a reactive channel for Go-style communication.
 *
 * @example
 * ```svelte
 * <script>
 *   const ch = createChannel<string>();
 * 
 *   async function sendMessage() {
 *     await ch.send("Hello!");
 *   }
 * </script>
 *
 * <p>Latest: {$ch.latest}</p>
 * <button onclick={sendMessage}>Send</button>
 * ```
 */
export function createChannel<T>(options: CreateChannelOptions = {}): ChannelState<T> {
	const s = createScope({ name: "createChannel" });
	const ch = s.channel<T>(options.bufferSize ?? 0);

	const latest = writable<T | undefined>(undefined);
	const history = writable<T[]>([]);
	const isClosed = writable(false);

	// Start receiving in background
	const receiveLoop = async () => {
		for await (const value of ch) {
			latest.set(value);
			history.update(h => [...h.slice(-(options.historySize ?? 100)), value]);
		}
		isClosed.set(true);
	};

	receiveLoop();

	return {
		latest: { subscribe: latest.subscribe },
		history: { subscribe: history.subscribe },
		isClosed: { subscribe: isClosed.subscribe },
		send: async (value: T) => {
			await ch.send(value);
		},
		close: () => {
			ch.close();
		},
	};
}

// ============================================================================
// Broadcast Store
// ============================================================================

/**
 * Reactive broadcast state
 */
export interface BroadcastState<T> {
	/** Latest broadcasted value */
	readonly latest: Readable<T | undefined>;
	/** Subscribe to broadcasts */
	readonly subscribe: (callback: (value: T) => void) => { unsubscribe: () => void };
	/** Broadcast a value */
	readonly broadcast: (value: T) => void;
}

/**
 * Create a reactive broadcast channel.
 *
 * @example
 * ```svelte
 * <script>
 *   const bus = createBroadcast<string>();
 * 
 *   // Subscribe
 *   bus.subscribe(msg => console.log(msg));
 * 
 *   function send() {
 *     bus.broadcast("Hello!");
 *   }
 * </script>
 *
 * <p>Latest: {$bus.latest}</p>
 * ```
 */
export function createBroadcast<T>(): BroadcastState<T> {
	const bc = new BroadcastChannel<T>();

	const latest = writable<T | undefined>(undefined);

	return {
		latest: { subscribe: latest.subscribe },
		subscribe: (callback: (value: T) => void) => {
			// Start async iterator to receive broadcasts
			(async () => {
				for await (const value of bc.subscribe()) {
					latest.set(value);
					callback(value);
				}
			})();

			return {
				unsubscribe: () => bc.close(),
			};
		},
		broadcast: async (value: T) => {
			await bc.send(value);
			latest.set(value);
		},
	};
}

// ============================================================================
// Polling Store
// ============================================================================

/**
 * Options for polling
 */
export interface CreatePollingOptions {
	/** Interval in milliseconds */
	interval: number;
	/** Whether to start immediately */
	immediate?: boolean;
	/** Continue when tab is hidden */
	continueOnHidden?: boolean;
}

/**
 * Reactive polling state
 */
export interface PollingState<T> {
	/** Latest data */
	readonly data: Readable<T | undefined>;
	/** Error if polling failed */
	readonly error: Readable<Error | undefined>;
	/** Whether currently polling */
	readonly isPolling: Readable<boolean>;
	/** Number of polls completed */
	readonly pollCount: Readable<number>;
	/** Start polling */
	readonly start: () => void;
	/** Stop polling */
	readonly stop: () => void;
}

/**
 * Create a reactive polling mechanism.
 *
 * @example
 * ```svelte
 * <script>
 *   const poller = createPolling(
 *     async () => fetchLatestData(),
 *     { interval: 5000, immediate: true }
 *   );
 * </script>
 *
 * {#if $poller.data}
 *   <p>{$poller.data}</p>
 * {/if}
 * <button onclick={() => $poller.stop()}>Stop</button>
 * ```
 */
export function createPolling<T>(
	factory: () => Promise<T>,
	options: CreatePollingOptions,
): PollingState<T> {
	const s = createScope({ name: "createPolling" });

	const data = writable<T | undefined>(undefined);
	const error = writable<Error | undefined>(undefined);
	const isPolling = writable(false);
	const pollCount = writable(0);

	// Create the poller with onValue callback
	const poller = s.poll(
		async () => {
			try {
				const result = await factory();
				return { success: true, value: result } as const;
			} catch (e) {
				return { success: false, error: e } as const;
			}
		},
		(result) => {
			pollCount.update(c => c + 1);
			if (result.success) {
				data.set(result.value);
			} else {
				error.set(result.error instanceof Error ? result.error : new Error(String(result.error)));
			}
		},
		{ interval: options.interval, immediate: options.immediate }
	);

	// Sync isPolling with poller status
	const updateStatus = () => {
		const status = poller.status();
		isPolling.set(status.running);
	};

	// Handle visibility change
	if (!options.continueOnHidden && typeof document !== "undefined") {
		const handler = () => {
			if (document.hidden) {
				poller.stop();
				updateStatus();
			} else if (options.immediate !== false) {
				poller.start();
				updateStatus();
			}
		};

		document.addEventListener("visibilitychange", handler);
	}

	// Set initial polling state
	updateStatus();

	return {
		data: { subscribe: data.subscribe },
		error: { subscribe: error.subscribe },
		isPolling: { subscribe: isPolling.subscribe },
		pollCount: { subscribe: pollCount.subscribe },
		start: () => {
			poller.start();
			updateStatus();
		},
		stop: () => {
			poller.stop();
			updateStatus();
		},
	};
}

// ============================================================================
// Store-like Interface (Svelte 5 compatible)
// ============================================================================

/**
 * Create a reactive value that can be subscribed to (Svelte store contract).
 * Compatible with Svelte 5's `$` prefix.
 *
 * @example
 * ```svelte
 * <script>
 *   const count = createStore(0);
 * 
 *   function increment() {
 *     $count++;
 *   }
 * </script>
 *
 * <button onclick={increment}>
 *   Count: {$count}
 * </button>
 * ```
 */
export function createStore<T>(initialValue: T) {
	const { subscribe, set, update } = writable(initialValue);

	return {
		subscribe,
		set,
		update,
	};
}

// Re-export types
export type { Result, Scope, Channel, BroadcastChannel } from "go-go-scope";
