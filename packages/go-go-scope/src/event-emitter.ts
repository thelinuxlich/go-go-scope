/**
 * Auto-cleanup EventEmitter for go-go-scope
 *
 * An EventEmitter that automatically removes all listeners when the scope is disposed.
 * Prevents memory leaks from forgotten event listeners.
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope();
 * const emitter = s.eventEmitter<{
 *   data: (chunk: string) => void;
 *   end: () => void;
 *   error: (err: Error) => void;
 * }>();
 *
 * // These listeners are auto-removed when scope disposes
 * emitter.on("data", (chunk) => console.log(chunk));
 * emitter.on("end", () => console.log("Done"));
 *
 * // Emit events
 * emitter.emit("data", "Hello");
 * emitter.emit("end");
 * ```
 */

import type { Scope } from "./scope.js";

/**
 * Type for event handler functions
 */
type EventHandler = (...args: unknown[]) => void;

/**
 * Event map with typed handlers
 */
type EventMap = Record<string, EventHandler>;

/**
 * Scoped EventEmitter with automatic cleanup
 *
 * All listeners are automatically removed when the parent scope is disposed.
 * This prevents memory leaks from forgotten event listeners in long-running
 * applications.
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Create a typed event emitter
 * const emitter = s.eventEmitter<{
 *   userLogin: (userId: string, timestamp: number) => void;
 *   userLogout: (userId: string) => void;
 *   dataReceived: (payload: { id: string; data: unknown }) => void;
 * }>();
 *
 * // Listen to events - automatically cleaned up when scope disposes
 * emitter.on("userLogin", (userId, timestamp) => {
 *   console.log(`User ${userId} logged in at ${new Date(timestamp)}`);
 * });
 *
 * emitter.on("userLogout", (userId) => {
 *   console.log(`User ${userId} logged out`);
 * });
 *
 * // Listen once - handler is removed after first emit
 * emitter.once("dataReceived", (payload) => {
 *   console.log(`First data received: ${payload.id}`);
 * });
 *
 * // Emit events within the scope
 * emitter.emit("userLogin", "user-123", Date.now());
 * emitter.emit("dataReceived", { id: "msg-1", data: "Hello" });
 * emitter.emit("dataReceived", { id: "msg-2", data: "World" }); // once handler not called
 * emitter.emit("userLogout", "user-123");
 *
 * // Check listener count
 * console.log(`Login listeners: ${emitter.listenerCount("userLogin")}`);
 *
 * // Manual cleanup of specific listeners
 * const unsubscribe = emitter.on("dataReceived", (payload) => {
 *   console.log(`Data: ${payload.id}`);
 * });
 * unsubscribe(); // Remove this specific listener
 *
 * // All listeners are automatically removed when scope exits
 * ```
 */
export class ScopedEventEmitter<Events extends EventMap = EventMap> {
	private listeners: Map<keyof Events, Set<EventHandler>> = new Map();
	private scope: Scope<Record<string, unknown>>;
	private disposed = false;

	constructor(scope: Scope<Record<string, unknown>>) {
		this.scope = scope;

		// Register with scope for cleanup
		this.scope.registerDisposable({
			[Symbol.dispose]: () => this.dispose(),
			[Symbol.asyncDispose]: async () => this.dispose(),
		});
	}

	/**
	 * Subscribe to an event.
	 *
	 * @param event - Event name
	 * @param handler - Event handler
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = emitter.on("data", (chunk) => {
	 *   console.log(chunk);
	 * });
	 *
	 * // Later: manually unsubscribe
	 * unsubscribe();
	 * ```
	 */
	on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
		if (this.disposed) {
			throw new Error("Cannot subscribe to disposed EventEmitter");
		}

		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(handler as EventHandler);

		// Return unsubscribe function
		return () => {
			this.off(event, handler);
		};
	}

	/**
	 * Subscribe to an event once. The handler is automatically removed after first call.
	 *
	 * @param event - Event name
	 * @param handler - Event handler
	 *
	 * @example
	 * ```typescript
	 * emitter.once("ready", () => {
	 *   console.log("Ready! (only once)");
	 * });
	 * ```
	 */
	once<K extends keyof Events>(event: K, handler: Events[K]): void {
		const onceHandler = ((...args: Parameters<Events[K]>) => {
			this.off(event, onceHandler as Events[K]);
			(handler as EventHandler)(...args);
		}) as Events[K];

		this.on(event, onceHandler);
	}

	/**
	 * Unsubscribe from an event.
	 *
	 * @param event - Event name
	 * @param handler - Handler to remove
	 */
	off<K extends keyof Events>(event: K, handler: Events[K]): void {
		this.listeners.get(event)?.delete(handler as EventHandler);
	}

	/**
	 * Emit an event to all subscribers.
	 *
	 * @param event - Event name
	 * @param args - Arguments to pass to handlers
	 * @returns Number of handlers called
	 *
	 * @example
	 * ```typescript
	 * emitter.emit("data", "Hello", 123);
	 * ```
	 */
	emit<K extends keyof Events>(
		event: K,
		...args: Parameters<Events[K]>
	): number {
		if (this.disposed) {
			return 0;
		}

		const handlers = this.listeners.get(event);
		if (!handlers || handlers.size === 0) {
			return 0;
		}

		let count = 0;
		handlers.forEach((handler) => {
			try {
				handler(...args);
				count++;
			} catch {
				// Ignore errors in event handlers
			}
		});

		return count;
	}

	/**
	 * Emit an event asynchronously (await all handlers).
	 *
	 * @param event - Event name
	 * @param args - Arguments to pass to handlers
	 * @returns Number of handlers called
	 */
	async emitAsync<K extends keyof Events>(
		event: K,
		...args: Parameters<Events[K]>
	): Promise<number> {
		if (this.disposed) {
			return 0;
		}

		const handlers = this.listeners.get(event);
		if (!handlers || handlers.size === 0) {
			return 0;
		}

		let count = 0;
		const promises: Promise<unknown>[] = [];

		handlers.forEach((handler) => {
			try {
				const result = handler(...args);
				if (
					typeof result === "object" &&
					result !== null &&
					"then" in result &&
					typeof (result as { then?: unknown }).then === "function"
				) {
					promises.push(
						Promise.resolve(result as PromiseLike<unknown>).catch(() => {
							// Ignore errors in event handlers
						}),
					);
				}
				count++;
			} catch {
				// Ignore errors in event handlers
			}
		});

		await Promise.all(promises);
		return count;
	}

	/**
	 * Get the number of listeners for an event.
	 *
	 * @param event - Event name
	 */
	listenerCount<K extends keyof Events>(event: K): number {
		return this.listeners.get(event)?.size ?? 0;
	}

	/**
	 * Check if there are any listeners for an event.
	 *
	 * @param event - Event name
	 */
	hasListeners<K extends keyof Events>(event: K): boolean {
		return this.listenerCount(event) > 0;
	}

	/**
	 * Get all event names that have listeners.
	 */
	eventNames(): (keyof Events)[] {
		return Array.from(this.listeners.keys()).filter(
			(event) => (this.listeners.get(event)?.size ?? 0) > 0,
		);
	}

	/**
	 * Remove all listeners for an event.
	 *
	 * @param event - Event name (if not provided, removes all listeners)
	 */
	removeAllListeners<K extends keyof Events>(event?: K): void {
		if (event === undefined) {
			this.listeners.clear();
		} else {
			this.listeners.delete(event);
		}
	}

	/**
	 * Dispose the event emitter and remove all listeners.
	 */
	private dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.listeners.clear();
	}
}

/**
 * Create a scoped EventEmitter.
 *
 * @param scope - Parent scope for automatic cleanup
 * @returns ScopedEventEmitter instance
 *
 * @example
 * ```typescript
 * import { scope, createEventEmitter } from "go-go-scope";
 *
 * await using s = scope();
 * const emitter = createEventEmitter<{
 *   message: (text: string) => void;
 * }>(s);
 *
 * emitter.on("message", (text) => console.log(text));
 * emitter.emit("message", "Hello!");
 * ```
 */
export function createEventEmitter<Events extends EventMap>(
	scope: Scope<Record<string, unknown>>,
): ScopedEventEmitter<Events> {
	return new ScopedEventEmitter<Events>(scope);
}
