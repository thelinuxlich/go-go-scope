/**
 * Scope factory function
 *
 * Provides a factory for creating Scope instances for structured concurrency.
 * The factory pattern allows for clean, functional-style creation of scopes
 * with optional configuration.
 */

import type { ScopeOptions } from "./scope.js";
import { Scope } from "./scope.js";

/**
 * Creates a new Scope for structured concurrency.
 *
 * A Scope is a container for concurrent tasks that ensures proper cleanup
 * and cancellation propagation. When a scope is disposed, all tasks within
 * it are automatically cancelled. This enables safe, predictable concurrent
 * programming using the `using`/`await using` syntax.
 *
 * Scopes support:
 * - Automatic cancellation propagation to child tasks
 * - Timeout handling with automatic cleanup
 * - Parent-child scope relationships
 * - Concurrency limiting
 * - Circuit breaker patterns
 * - OpenTelemetry tracing integration
 * - Lifecycle hooks for monitoring
 * - Service dependency injection
 *
 * @typeParam TServices - Type of services injected into the scope (default: empty record)
 * @param options - Optional configuration for the scope including timeout,
 *   parent signal, concurrency limits, circuit breaker, tracing, and more
 * @param options.timeout - Optional timeout in milliseconds. If set, the scope will be aborted after this duration
 * @param options.signal - Optional parent AbortSignal to link cancellation. Child scopes inherit parent's signal
 * @param options.name - Optional name for the scope. Used for debugging and logging (default: "scope-{id}")
 * @param options.concurrency - Optional concurrency limit for tasks spawned within this scope. Tasks acquire permits before executing
 * @param options.circuitBreaker - Optional circuit breaker configuration with failureThreshold, resetTimeout, successThreshold, onStateChange, onOpen, onClose, onHalfOpen, and advanced options
 * @param options.parent - Optional parent scope to inherit signal and services from
 * @param options.hooks - Optional lifecycle hooks for scope events (beforeTask, afterTask, onCancel, onDispose, beforeDispose, afterDispose)
 * @param options.logger - Optional logger for structured logging
 * @param options.logLevel - Minimum log level for console logging when no custom logger provided (default: 'info')
 * @param options.persistence - Optional persistence providers for distributed features (checkpoint, idempotency, lock)
 * @param options.idempotency - Idempotency configuration with defaultTTL for caching task results
 * @param options.taskPooling - Task pooling configuration with maxSize and enabled to reduce GC pressure
 * @param options.workerPool - Worker pool configuration with size (number of workers) and idleTimeout (ms before termination)
 * @param options.context - Optional context object accessible in all tasks via task context
 * @param options.logCorrelation - Enable log correlation with traceId and spanId (default: false)
 * @param options.traceId - External trace ID for log correlation. Auto-generated if logCorrelation is enabled
 * @param options.gracefulShutdown - Graceful shutdown configuration for handling SIGTERM/SIGINT signals
 * @param options.tracing - Enhanced tracing configuration for distributed tracing features
 * @param options.memoryLimit - Memory limit configuration as number (bytes), string (e.g., '100mb'), or MemoryLimitConfig object
 * @param options.onMemoryPressure - Callback when memory pressure is detected
 * @returns A new Scope instance ready for task execution
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope';
 *
 * // Create a basic scope
 * await using s = scope();
 *
 * // Spawn a task within the scope
 * const [err, result] = await s.task(async ({ signal }) => {
 *   const response = await fetch('/api/data', { signal });
 *   return response.json();
 * });
 *
 * if (err) {
 *   console.error('Task failed:', err);
 * } else {
 *   console.log('Result:', result);
 * }
 * // Scope automatically disposed, cancelling any pending tasks
 * ```
 *
 * @example
 * ```typescript
 * // Create a scope with a timeout
 * await using s = scope({ timeout: 5000 });
 *
 * const [err, data] = await s.task(async ({ signal }) => {
 *   return await fetchSlowData({ signal });
 * });
 *
 * if (err) {
 *   console.log('Task timed out or failed:', err.message);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Nested scopes with parent-child cancellation
 * await using parent = scope({ name: 'parent' });
 *
 * {
 *   await using child = parent.createChild({ name: 'child' });
 *
 *   const task = child.task(async ({ signal }) => {
 *     return await longRunningOperation({ signal });
 *   });
 *
 *   // When child scope exits (due to block scope), task is cancelled
 * }
 *
 * // Parent scope continues unaffected
 * ```
 *
 * @example
 * ```typescript
 * // Scope with OpenTelemetry tracing
 * import { trace } from '@opentelemetry/api';
 *
 * const tracer = trace.getTracer('my-app');
 *
 * await using s = scope({ tracer });
 *
 * // Each task creates a span, scope disposal creates a summary span
 * const [err, result] = await s.task(async () => {
 *   return await processData();
 * }, { id: 'data-processing' });
 * ```
 *
 * @example
 * ```typescript
 * // Scope with concurrency limiting
 * await using s = scope({ concurrency: 3 });
 *
 * // Only 3 tasks will run concurrently, others are queued
 * const tasks = urls.map(url =>
 *   s.task(async ({ signal }) => {
 *     return await fetch(url, { signal });
 *   })
 * );
 *
 * const results = await Promise.all(tasks);
 * ```
 *
 * @example
 * ```typescript
 * // Scope with circuit breaker for fault tolerance
 * await using s = scope({
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     resetTimeout: 30000,
 *     onStateChange: (from, to) => console.log(`Circuit: ${from} -> ${to}`)
 *   }
 * });
 *
 * // Tasks automatically protected by circuit breaker
 * const [err, result] = await s.task(() => callUnreliableService());
 * ```
 *
 * @see {@link Scope} - The Scope class for the full API
 * @see {@link ScopeOptions} - Available scope configuration options
 */
/* #__PURE__ */
export function scope<
	TServices extends Record<string, unknown> = Record<string, unknown>,
>(options?: ScopeOptions<TServices>): Scope<TServices> {
	return /* #__PURE__ */ new Scope(options) as Scope<TServices>;
}
