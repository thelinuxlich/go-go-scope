/**
 * OpenTelemetry plugin for go-go-scope
 */

import type { Context, Span, Tracer } from "@opentelemetry/api";
import { context as otelContext, trace } from "@opentelemetry/api";
import type { Scope, ScopePlugin, TaskOptions } from "go-go-scope";

/**
 * OpenTelemetry options for tasks
 */
export interface TaskSpanOptions {
	/** Span name (defaults to "scope.task") */
	name?: string;
	/** Additional span attributes */
	attributes?: Record<string, string | number | boolean>;
}

/**
 * Options with OpenTelemetry support
 */
export interface OpenTelemetryScopeOptions {
	/** OpenTelemetry tracer */
	tracer?: Tracer;
	/** Parent context */
	context?: Context;
}

/**
 * OpenTelemetry plugin state for a scope
 */
interface OpenTelemetryState {
	tracer?: Tracer;
	span?: Span;
	context?: Context;
	taskSpans: Map<number, Span>;
}

/**
 * Create the OpenTelemetry plugin
 */
export function opentelemetryPlugin(
	tracer: Tracer,
	options: { name?: string; attributes?: Record<string, unknown> } = {},
): ScopePlugin {
	return {
		name: "opentelemetry",

		install(scope: Scope, scopeOptions) {
			const state: OpenTelemetryState = {
				tracer,
				taskSpans: new Map(),
			};

			// Create scope span
			const parentContext =
				(scopeOptions as unknown as { parent?: { otelContext?: Context } }).parent
					?.otelContext ?? otelContext.active();

			state.span = tracer.startSpan(
				options.name ?? (scope as unknown as { name: string }).name ?? "scope",
				{
					attributes: {
						"scope.name": (scope as unknown as { name: string }).name,
						...options.attributes,
					},
				},
				parentContext,
			);

			state.context = trace.setSpan(parentContext, state.span);

			// Store state on scope
			(scope as unknown as { _otelState?: OpenTelemetryState })._otelState = state;

			// Add getters
			Object.defineProperty(scope, "otelSpan", {
				get: () => state.span,
				enumerable: true,
				configurable: true,
			});

			Object.defineProperty(scope, "otelContext", {
				get: () => state.context,
				enumerable: true,
				configurable: true,
			});

			Object.defineProperty(scope, "tracer", {
				get: () => state.tracer,
				enumerable: true,
				configurable: true,
			});

			// Hook into task lifecycle to create and end spans
			scope.onBeforeTask?.((_taskName: string, index: number, options?: unknown) => {
				const taskOptions = options as { otel?: TaskSpanOptions; retry?: unknown; timeout?: number } | undefined;
				const span = state.tracer?.startSpan(
					taskOptions?.otel?.name ?? _taskName ?? "scope.task",
					{
						attributes: {
							"task.index": index,
							"task.name": _taskName,
							"task.has_retry": !!taskOptions?.retry,
							"task.has_timeout": !!taskOptions?.timeout,
							...taskOptions?.otel?.attributes,
						},
					},
					state.context ?? otelContext.active(),
				);
				if (span) {
					state.taskSpans.set(index, span);
				}
			});

			scope.onAfterTask?.((_taskName: string, _duration: number, error?: unknown, index?: number) => {
				const span = state.taskSpans.get(index ?? 0);
				if (span) {
					if (error) {
						span.recordException(error as Error);
						span.setStatus({ code: 2 /* Error */ });
					}
					span.end();
					state.taskSpans.delete(index ?? 0);
				}
			});

			// Register cleanup
			scope.onDispose(() => {
				// End all task spans
				for (const span of state.taskSpans.values()) {
					span.end();
				}
				state.taskSpans.clear();

				// End scope span
				state.span?.end();
			});
		},

		cleanup(scope) {
			const state = (scope as unknown as { _otelState?: OpenTelemetryState })._otelState;
			if (state) {
				for (const span of state.taskSpans.values()) {
					span.end();
				}
				state.taskSpans.clear();
				state.span?.end();
			}
		},
	};
}

/**
 * Start a span for a task
 */
export function startTaskSpan(
	scope: Scope,
	options: TaskOptions | undefined,
	taskIndex: number,
	taskName: string,
): Span | undefined {
	const state = (scope as unknown as { _otelState?: OpenTelemetryState })._otelState;
	if (!state?.tracer) return undefined;

	// Cast to access optional retry/timeout properties
	const opts = options as { otel?: TaskSpanOptions; retry?: unknown; timeout?: number } | undefined;

	const span = state.tracer.startSpan(
		opts?.otel?.name ?? "scope.task",
		{
			attributes: {
				"task.index": taskIndex,
				"task.name": taskName,
				"task.has_retry": !!opts?.retry,
				"task.has_timeout": !!opts?.timeout,
				...opts?.otel?.attributes,
			},
		},
		state.context ?? otelContext.active(),
	);

	state.taskSpans.set(taskIndex, span);
	return span;
}

/**
 * End a task span
 */
export function endTaskSpan(
	scope: Scope,
	taskIndex: number,
	error?: Error,
): void {
	const state = (scope as unknown as { _otelState?: OpenTelemetryState })._otelState;
	if (!state) return;

	const span = state.taskSpans.get(taskIndex);
	if (span) {
		if (error) {
			span.recordException(error);
			span.setStatus({ code: 2 /* Error */ }); // SpanStatusCode.ERROR
		}
		span.end();
		state.taskSpans.delete(taskIndex);
	}
}

/**
 * Set span error status
 */
export function setSpanError(scope: Scope, error: unknown): void {
	const state = (scope as unknown as { _otelState?: OpenTelemetryState })._otelState;
	if (state?.span && error instanceof Error) {
		state.span.recordException(error);
		state.span.setStatus({ code: 2 /* Error */ });
	}
}

// Augment go-go-scope types
declare module "go-go-scope" {
	interface Scope {
		/** @internal OpenTelemetry state */
		_otelState?: OpenTelemetryState;
		/** OpenTelemetry span for this scope */
		otelSpan?: Span;
		/** OpenTelemetry context for this scope */
		otelContext?: Context;
		/** OpenTelemetry tracer */
		tracer?: Tracer;
	}

	interface ScopeOptions<ParentServices> {
		/** OpenTelemetry tracer for automatic tracing */
		tracer?: Tracer;
	}
}

// Re-export OpenTelemetry types
export type { Context, Span, SpanOptions, Tracer } from "@opentelemetry/api";

export type { ScopePlugin };
