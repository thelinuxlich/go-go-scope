/**
 * Scope factory function
 */

import type { ScopeOptions } from "./scope.js";
import { Scope } from "./scope.js";

/**
 * Create a new Scope for structured concurrency.
 *
 * @param options - Optional configuration for the scope
 * @returns A new Scope instance
 *
 * @example
 * ```typescript
 * await using s = scope({ timeout: 5000 })
 * const t = s.spawn(() => fetchData())
 * const result = await t
 * ```
 *
 * @example With OpenTelemetry tracing
 * ```typescript
 * import { trace } from "@opentelemetry/api"
 *
 * await using s = scope({ tracer: trace.getTracer("my-app") })
 * const t = s.spawn(() => fetchData())  // Creates "scope.task" span
 * const result = await t
 * // Scope disposal creates "scope" span with task count
 * ```
 */
export function scope<
	TServices extends Record<string, unknown> = Record<string, unknown>,
>(options?: ScopeOptions<TServices>): Scope<TServices> {
	return new Scope(options) as Scope<TServices>;
}
