/**
 * OpenTelemetry plugin for go-go-scope
 */

import type { Context, Span, Tracer } from "@opentelemetry/api";
import { context as otelContext, trace } from "@opentelemetry/api";
import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * OpenTelemetry options for tasks
 */
export interface TaskSpanOptions {
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
 * Enhanced tracing options for go-go-scope
 */
export interface TracingOptions {
	/** Enable message flow tracking between channels */
	trackMessageFlows?: boolean;
	/** Enable deadlock detection for async operations */
	enableDeadlockDetection?: boolean;
	/** Interval in ms for deadlock checks (default: 5000) */
	deadlockCheckInterval?: number;
	/** Callback when deadlock is detected */
	onDeadlock?: (deadlockInfo: unknown) => void;
	/** Link channel operation spans together */
	linkChannelSpans?: boolean;
	/** Enable visual trace data export */
	enableVisualExport?: boolean;
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
				(scopeOptions as unknown as { parent?: { otelContext?: Context } })
					.parent?.otelContext ?? otelContext.active();

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
			(scope as unknown as { _otelState?: OpenTelemetryState })._otelState =
				state;

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

			// Setup enhanced tracing if tracing option is provided
			const tracingOptions = scopeOptions.tracing as TracingOptions | undefined;
			if (tracingOptions) {
				// Import and setup enhanced tracing
				import("./tracing-enhanced.js").then(({ ChannelTracer, DeadlockDetector }) => {
					const channelTracer = new ChannelTracer<unknown>(tracer);
					const deadlockDetector = new DeadlockDetector(tracer);

					// Store enhanced tracing state
					(scope as unknown as { _enhancedTracing?: {
						channelTracer: InstanceType<typeof ChannelTracer<unknown>>;
						deadlockDetector: InstanceType<typeof DeadlockDetector>;
					} })._enhancedTracing = { channelTracer, deadlockDetector };

					// Start deadlock detection if enabled
					if (tracingOptions.enableDeadlockDetection) {
						deadlockDetector.startDetection(
							tracingOptions.deadlockCheckInterval ?? 5000,
							tracingOptions.onDeadlock as (graph: unknown) => void,
						);
						scope.onDispose(() => deadlockDetector.stopDetection());
					}

					deadlockDetector.registerNode(
						(scope as unknown as { name: string }).name,
						"task",
						"running",
					);
				});
			}

			// Hook into task lifecycle to create and end spans
			scope.onBeforeTask?.(
				(_taskName: string, index: number, options?: unknown) => {
					const taskOptions = options as
						| { otel?: TaskSpanOptions; retry?: unknown; timeout?: number }
						| undefined;
					const span = state.tracer?.startSpan(
						_taskName ?? "scope.task",
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
				},
			);

			scope.onAfterTask?.(
				(
					_taskName: string,
					_duration: number,
					error?: unknown,
					index?: number,
				) => {
					const span = state.taskSpans.get(index ?? 0);
					if (span) {
						if (error) {
							span.recordException(error as Error);
							span.setStatus({ code: 2 /* Error */ });
						}
						span.end();
						state.taskSpans.delete(index ?? 0);
					}
				},
			);

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
			const state = (scope as unknown as { _otelState?: OpenTelemetryState })
				._otelState;
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
		/** @internal Enhanced tracing state */
		_enhancedTracing?: {
			channelTracer: import("./tracing-enhanced.js").ChannelTracer<unknown>;
			deadlockDetector: import("./tracing-enhanced.js").DeadlockDetector;
		};
	}

	interface ScopeOptions<ParentServices> {
		/** OpenTelemetry tracer for automatic tracing */
		tracer?: Tracer;
		/** Enhanced tracing configuration for distributed tracing */
		tracing?: Record<string, unknown>;
	}
}

// Re-export OpenTelemetry types
export type { Context, Span, SpanOptions, Tracer } from "@opentelemetry/api";

export type { ScopePlugin };
