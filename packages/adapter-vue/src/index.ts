/**
 * Vue.js 3 composables for go-go-scope
 */

import { onScopeDispose, readonly, ref, shallowRef } from "vue";
import { scope, type Scope, type Result, BroadcastChannel } from "go-go-scope";

export interface UseScopeOptions {
	name?: string;
	timeout?: number;
}

export function useScope(options: UseScopeOptions = {}): Scope<Record<string, unknown>> {
	const isActive = ref(true);

	const s = scope({
		name: options.name,
		timeout: options.timeout,
	});

	onScopeDispose(() => {
		isActive.value = false;
		s[Symbol.asyncDispose]().catch(() => {});
	});

	return Object.assign(s, {
		isActive: readonly(isActive),
	});
}

export interface TaskState<T> {
	data: T | undefined;
	error: Error | undefined;
	isLoading: boolean;
	isReady: boolean;
	execute: () => Promise<Result<Error, T>>;
}

export interface UseTaskOptions<T> {
	name?: string;
	immediate?: boolean;
	timeout?: number;
	retry?: { max?: number; delay?: number };
	initialData?: T;
}

export function useTask<T>(
	factory: (signal: AbortSignal) => Promise<T>,
	options: UseTaskOptions<T> = {},
): TaskState<T> {
	const s = useScope({ name: options.name ?? "useTask" });

	const data = shallowRef<any>(options.initialData);
	const error = shallowRef<Error | undefined>(undefined);
	const isLoading = ref(false);
	const isReady = ref(false);

	const execute = async (): Promise<Result<Error, T>> => {
		isLoading.value = true;
		error.value = undefined;

		try {
			const [err, result] = await s.task(async ({ signal }) => await factory(signal), {
				timeout: options.timeout,
				retry: options.retry,
			});

			if (err) {
				error.value = err instanceof Error ? err : new Error(String(err));
				data.value = undefined;
				return [err as Error, undefined];
			}

			data.value = result;
			isReady.value = true;
			return [undefined, result];
		} finally {
			isLoading.value = false;
		}
	};

	if (options.immediate) {
		execute();
	}

	return {
		get data() {
			return data.value as T | undefined;
		},
		get error() {
			return error.value;
		},
		get isLoading() {
			return isLoading.value;
		},
		get isReady() {
			return isReady.value;
		},
		execute,
	};
}

export interface ParallelTaskState<T> {
	results: (T | undefined)[];
	errors: (Error | undefined)[];
	isLoading: boolean;
	progress: number;
	execute: () => Promise<any[]>;
}

export interface UseParallelOptions {
	concurrency?: number;
	immediate?: boolean;
}

export function useParallel<T>(
	factories: (() => Promise<T>)[],
	options: UseParallelOptions = {},
): ParallelTaskState<T> {
	const s = useScope({ name: "useParallel" });

	const results = ref<any[]>([]);
	const errors = ref<any[]>([]);
	const isLoading = ref(false);
	const progress = ref(0);

	const execute = async (): Promise<any[]> => {
		isLoading.value = true;
		progress.value = 0;
		results.value = new Array(factories.length).fill(undefined);
		errors.value = new Array(factories.length).fill(undefined);

		try {
			const taskFactories = factories.map((factory, index) => {
				return async () => {
					const [err, result] = await s.task(async () => await factory());

					if (err) {
						errors.value[index] = err instanceof Error ? err : new Error(String(err));
					} else {
						results.value[index] = result;
					}

					progress.value = Math.round(((index + 1) / factories.length) * 100);
					return [err, result];
				};
			});

			return await s.parallel(taskFactories, {
				concurrency: options.concurrency,
			});
		} finally {
			isLoading.value = false;
		}
	};

	if (options.immediate) {
		execute();
	}

	return {
		get results() {
			return results.value as (T | undefined)[];
		},
		get errors() {
			return errors.value as (Error | undefined)[];
		},
		get isLoading() {
			return isLoading.value;
		},
		get progress() {
			return progress.value;
		},
		execute,
	};
}

export interface ChannelState<T> {
	latest: T | undefined;
	history: any[];
	isClosed: boolean;
	send: (value: T) => Promise<void>;
	close: () => void;
}

export interface UseChannelOptions {
	bufferSize?: number;
	historySize?: number;
}

export function useChannel<T>(options: UseChannelOptions = {}): ChannelState<T> {
	const s = useScope({ name: "useChannel" });
	const ch = s.channel<T>(options.bufferSize ?? 0);

	const latest = shallowRef<T | undefined>(undefined);
	const history = ref<any[]>([]);
	const isClosed = ref(false);

	const receiveLoop = async () => {
		for await (const value of ch) {
			latest.value = value;
			history.value = [...history.value.slice(-(options.historySize ?? 100)), value];
		}
		isClosed.value = true;
	};

	receiveLoop();

	const send = async (value: T): Promise<void> => {
		await ch.send(value);
	};

	const close = (): void => {
		ch.close();
	};

	return {
		get latest() {
			return latest.value;
		},
		get history() {
			return history.value;
		},
		get isClosed() {
			return isClosed.value;
		},
		send,
		close,
	};
}

export interface BroadcastState<T> {
	latest: T | undefined;
	subscriberCount: number;
	send: (value: T) => Promise<boolean>;
	close: () => void;
}

export function useBroadcast<T>(): BroadcastState<T> {
	const bc = new BroadcastChannel<T>();

	const latest = shallowRef<T | undefined>(undefined);
	const subscriberCount = ref(0);

	// Start a background task to receive broadcasts
	const receiveLoop = async () => {
		for await (const value of bc.subscribe()) {
			latest.value = value;
			subscriberCount.value = bc.subscriberCount;
		}
	};
	receiveLoop();

	const send = async (value: T): Promise<boolean> => {
		const result = await bc.send(value);
		return result;
	};

	const close = (): void => {
		bc.close();
	};

	return {
		get latest() {
			return latest.value;
		},
		get subscriberCount() {
			return subscriberCount.value;
		},
		send,
		close,
	};
}

export interface UsePollingOptions {
	interval: number;
	immediate?: boolean;
	continueOnHidden?: boolean;
}

export interface PollingState<T> {
	data: T | undefined;
	error: Error | undefined;
	isPolling: boolean;
	pollCount: number;
	start: () => void;
	stop: () => void;
}

export function usePolling<T>(
	factory: () => Promise<T>,
	options: UsePollingOptions,
): PollingState<T> {
	const s = useScope({ name: "usePolling" });

	const data = shallowRef<T | undefined>(undefined);
	const error = shallowRef<Error | undefined>(undefined);
	const isPolling = ref(false);
	const pollCount = ref(0);

	let poller: ReturnType<typeof s.poll> | null = null;

	const start = (): void => {
		if (!isPolling.value && !poller) {
			poller = s.poll(
				async () => await factory(),
				(value: T) => {
					data.value = value;
					pollCount.value++;
				},
				{ interval: options.interval }
			);
			isPolling.value = true;
		}
	};

	const stop = (): void => {
		if (isPolling.value && poller) {
			poller.stop();
			isPolling.value = false;
			poller = null;
		}
	};

	if (options.immediate !== false) {
		start();
	}

	return {
		get data() {
			return data.value;
		},
		get error() {
			return error.value;
		},
		get isPolling() {
			return isPolling.value;
		},
		get pollCount() {
			return pollCount.value;
		},
		start,
		stop,
	};
}

export type { Result, Scope } from "go-go-scope";
