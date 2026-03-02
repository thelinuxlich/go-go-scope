/**
 * Enhanced Distributed Tracing for go-go-scope
 *
 * Provides:
 * - Span linking for async operations (channels, tasks)
 * - Message flow tracking across services
 * - Deadlock detection with graph export
 * - Visual trace representation
 */

import type { Span, SpanContext, Tracer } from "@opentelemetry/api";
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Channel, Scope } from "go-go-scope";

/**
 * Span link for cross-operation tracing
 */
export interface SpanLink {
	/** Context of the linked span */
	context: SpanContext;
	/** Optional link attributes */
	attributes?: Record<string, unknown>;
}

/**
 * Message flow tracking
 */
export interface MessageFlow {
	/** Unique message ID */
	messageId: string;
	/** Trace ID */
	traceId: string;
	/** Source span */
	source: SpanContext;
	/** Destination spans */
	destinations: SpanContext[];
	/** Message path through the system */
	path: Array<{
		span: SpanContext;
		operation: string;
		timestamp: number;
	}>;
	/** Message payload type */
	messageType?: string;
	/** Start time */
	startTime: number;
	/** End time (if completed) */
	endTime?: number;
}

/**
 * Deadlock detection graph node
 */
export interface DeadlockNode {
	/** Node ID (task or resource ID) */
	id: string;
	/** Node type */
	type: "task" | "channel" | "lock" | "semaphore" | "resource";
	/** Current state */
	state: string;
	/** What this node is waiting for */
	waitingFor?: string[];
	/** What is holding this node */
	heldBy?: string[];
	/** Span context for trace correlation */
	spanContext?: SpanContext;
	/** Last activity timestamp */
	lastActivity: number;
}

/**
 * Deadlock detection graph edge
 */
export interface DeadlockEdge {
	/** Source node */
	from: string;
	/** Target node */
	to: string;
	/** Edge type */
	type: "waits-for" | "holds" | "sends-to" | "receives-from";
	/** Timestamp */
	timestamp: number;
}

/**
 * Deadlock graph for visualization
 */
export interface DeadlockGraph {
	/** Graph nodes */
	nodes: DeadlockNode[];
	/** Graph edges */
	edges: DeadlockEdge[];
	/** Detected cycles */
	cycles: string[][];
	/** Timestamp of graph generation */
	timestamp: number;
	/** Trace ID for correlation */
	traceId?: string;
}

/**
 * Trace visualizer for Mermaid/PlantUML export
 */
export class TraceVisualizer {
	/**
	 * Export message flow as Mermaid sequence diagram
	 */
	static toMermaidSequence(flow: MessageFlow): string {
		const lines: string[] = [
			"sequenceDiagram",
			`    participant Source as ${flow.source.spanId.slice(0, 8)}`,
		];

		// Add participants
		flow.destinations.forEach((dest, i) => {
			lines.push(`    participant Dest${i} as ${dest.spanId.slice(0, 8)}`);
		});

		// Add messages
		flow.path.forEach((step) => {
			const time = new Date(step.timestamp)
				.toISOString()
				.split("T")[1]!
				.slice(0, 8);
			lines.push(`    Source->>Dest0: ${step.operation} (${time})`);
		});

		return lines.join("\n");
	}

	/**
	 * Export deadlock graph as Mermaid flowchart
	 */
	static deadlockToMermaid(graph: DeadlockGraph): string {
		const lines: string[] = ["flowchart TD"];

		// Add nodes with styling
		for (const node of graph.nodes) {
			const shape = node.type === "task" ? "([" : "[[";
			const closeShape = node.type === "task" ? "])" : "]]";
			const style =
				node.waitingFor && node.waitingFor.length > 0 ? ":::waiting" : "";
			lines.push(
				`    ${node.id}${shape}"${node.type}:${node.state}"${closeShape}${style}`,
			);
		}

		// Add edges
		for (const edge of graph.edges) {
			const arrow = edge.type === "waits-for" ? "-.->" : "-->";
			lines.push(`    ${edge.from} ${arrow}|${edge.type}| ${edge.to}`);
		}

		// Highlight cycles
		if (graph.cycles.length > 0) {
			lines.push("");
			lines.push("    classDef waiting fill:#f9f,stroke:#333,stroke-width:2px");
			lines.push("    classDef cycle fill:#faa,stroke:#f00,stroke-width:3px");

			for (const cycle of graph.cycles) {
				for (const nodeId of cycle) {
					lines.push(`    class ${nodeId} cycle`);
				}
			}
		}

		return lines.join("\n");
	}

	/**
	 * Export deadlock graph as Graphviz DOT format
	 */
	static deadlockToGraphviz(graph: DeadlockGraph): string {
		const lines: string[] = [
			"digraph DeadlockGraph {",
			"    rankdir=LR;",
			"    node [shape=box, style=rounded];",
		];

		// Add nodes
		for (const node of graph.nodes) {
			const color =
				node.waitingFor && node.waitingFor.length > 0
					? "lightcoral"
					: "lightblue";
			lines.push(
				`    "${node.id}" [label="${node.type}\\n${node.state}", fillcolor=${color}, style=filled];`,
			);
		}

		// Add edges
		for (const edge of graph.edges) {
			const color = edge.type === "waits-for" ? "red" : "black";
			const style = edge.type === "waits-for" ? "dashed" : "solid";
			lines.push(
				`    "${edge.from}" -> "${edge.to}" [label="${edge.type}", color=${color}, style=${style}];`,
			);
		}

		// Highlight cycles
		if (graph.cycles.length > 0) {
			for (let i = 0; i < graph.cycles.length; i++) {
				const cycle = graph.cycles[i];
				if (cycle && cycle.length > 0) {
					lines.push(`    subgraph cycle${i} {`);
					lines.push(`        label="Deadlock Cycle ${i + 1}";`);
					lines.push(`        color=red;`);
					for (const nodeId of cycle) {
						lines.push(`        "${nodeId}";`);
					}
					lines.push(`    }`);
				}
			}
		}

		lines.push("}");
		return lines.join("\n");
	}

	/**
	 * Export trace as Jaeger JSON format
	 */
	static toJaegerFormat(flow: MessageFlow): Record<string, unknown> {
		return {
			traceID: flow.traceId,
			spans: flow.path.map((step, index) => ({
				traceID: flow.traceId,
				spanID: step.span.spanId,
				parentSpanID: index > 0 ? flow.path[index - 1]?.span.spanId : undefined,
				operationName: step.operation,
				startTime: step.timestamp * 1000, // microseconds
				duration:
					index < flow.path.length - 1
						? (flow.path[index + 1]!.timestamp - step.timestamp) * 1000
						: 0,
				tags: [
					{ key: "span.kind", type: "string", value: "internal" },
					{ key: "message.id", type: "string", value: flow.messageId },
				],
				references:
					index === 0
						? []
						: [
								{
									refType: "CHILD_OF",
									traceID: flow.traceId,
									spanID: flow.path[index - 1]?.span.spanId,
								},
							],
			})),
		};
	}
}

/**
 * Message flow tracker for distributed tracing
 */
export class MessageFlowTracker {
	private flows = new Map<string, MessageFlow>();
	private tracer: Tracer;

	constructor(tracer?: Tracer) {
		this.tracer = tracer ?? trace.getTracer("go-go-scope");
	}

	/**
	 * Start tracking a new message flow
	 */
	startFlow(messageId: string, messageType?: string): MessageFlow {
		const span = this.tracer.startSpan("message-flow", {
			kind: SpanKind.PRODUCER,
		});

		const flow: MessageFlow = {
			messageId,
			traceId: span.spanContext().traceId,
			source: span.spanContext(),
			destinations: [],
			path: [
				{
					span: span.spanContext(),
					operation: "start",
					timestamp: Date.now(),
				},
			],
			messageType,
			startTime: Date.now(),
		};

		this.flows.set(messageId, flow);
		span.end();

		return flow;
	}

	/**
	 * Record a step in the message flow
	 */
	recordStep(messageId: string, operation: string, span?: Span): void {
		const flow = this.flows.get(messageId);
		if (!flow) return;

		const stepSpan = span ?? this.tracer.startSpan(operation);

		flow.path.push({
			span: stepSpan.spanContext(),
			operation,
			timestamp: Date.now(),
		});

		if (!span) {
			stepSpan.end();
		}
	}

	/**
	 * Add a destination to the flow
	 */
	addDestination(messageId: string, spanContext: SpanContext): void {
		const flow = this.flows.get(messageId);
		if (!flow) return;

		flow.destinations.push(spanContext);
	}

	/**
	 * Complete a message flow
	 */
	completeFlow(messageId: string): MessageFlow | undefined {
		const flow = this.flows.get(messageId);
		if (!flow) return;

		flow.endTime = Date.now();
		return flow;
	}

	/**
	 * Get a flow by ID
	 */
	getFlow(messageId: string): MessageFlow | undefined {
		return this.flows.get(messageId);
	}

	/**
	 * Get all active flows
	 */
	getActiveFlows(): MessageFlow[] {
		return Array.from(this.flows.values()).filter((f) => !f.endTime);
	}

	/**
	 * Export flows as Mermaid diagrams
	 */
	exportAsMermaid(messageId?: string): string[] {
		if (messageId) {
			const flow = this.flows.get(messageId);
			return flow ? [TraceVisualizer.toMermaidSequence(flow)] : [];
		}

		return Array.from(this.flows.values()).map((f) =>
			TraceVisualizer.toMermaidSequence(f),
		);
	}

	/**
	 * Clear completed flows older than maxAge
	 */
	cleanup(maxAgeMs: number = 3600000): void {
		const cutoff = Date.now() - maxAgeMs;
		for (const [id, flow] of this.flows) {
			if (flow.endTime && flow.endTime < cutoff) {
				this.flows.delete(id);
			}
		}
	}
}

/**
 * Deadlock detector with graph export
 */
export class DeadlockDetector {
	private nodes = new Map<string, DeadlockNode>();
	private edges: DeadlockEdge[] = [];
	private checkInterval?: ReturnType<typeof setInterval>;
	private onDeadlock?: (graph: DeadlockGraph) => void;

	constructor(_tracer?: Tracer) {
		// Tracer reserved for future use
	}

	/**
	 * Register a node (task, channel, lock, etc.)
	 */
	registerNode(
		id: string,
		type: DeadlockNode["type"],
		state: string,
		spanContext?: SpanContext,
	): void {
		this.nodes.set(id, {
			id,
			type,
			state,
			lastActivity: Date.now(),
			spanContext,
		});
	}

	/**
	 * Update node state
	 */
	updateNode(id: string, state: string): void {
		const node = this.nodes.get(id);
		if (node) {
			node.state = state;
			node.lastActivity = Date.now();
		}
	}

	/**
	 * Record a wait relationship (nodeA waits for nodeB)
	 */
	recordWait(nodeId: string, waitingFor: string): void {
		const node = this.nodes.get(nodeId);
		if (node) {
			if (!node.waitingFor) {
				node.waitingFor = [];
			}
			node.waitingFor.push(waitingFor);
			node.lastActivity = Date.now();
		}

		this.edges.push({
			from: nodeId,
			to: waitingFor,
			type: "waits-for",
			timestamp: Date.now(),
		});

		// Check for deadlock immediately
		this.checkForDeadlock();
	}

	/**
	 * Record a hold relationship
	 */
	recordHold(holderId: string, resourceId: string): void {
		const node = this.nodes.get(resourceId);
		if (node) {
			if (!node.heldBy) {
				node.heldBy = [];
			}
			node.heldBy.push(holderId);
		}

		this.edges.push({
			from: holderId,
			to: resourceId,
			type: "holds",
			timestamp: Date.now(),
		});
	}

	/**
	 * Release a wait relationship
	 */
	releaseWait(nodeId: string, waitingFor: string): void {
		const node = this.nodes.get(nodeId);
		if (node && node.waitingFor) {
			node.waitingFor = node.waitingFor.filter((id) => id !== waitingFor);
		}

		// Remove corresponding edge
		this.edges = this.edges.filter(
			(e) =>
				!(e.from === nodeId && e.to === waitingFor && e.type === "waits-for"),
		);
	}

	/**
	 * Release a hold relationship
	 */
	releaseHold(holderId: string, resourceId: string): void {
		const node = this.nodes.get(resourceId);
		if (node && node.heldBy) {
			node.heldBy = node.heldBy.filter((id) => id !== holderId);
		}

		// Remove corresponding edge
		this.edges = this.edges.filter(
			(e) =>
				!(e.from === holderId && e.to === resourceId && e.type === "holds"),
		);
	}

	/**
	 * Start automatic deadlock detection
	 */
	startDetection(
		intervalMs: number = 5000,
		onDeadlock?: (graph: DeadlockGraph) => void,
	): void {
		this.onDeadlock = onDeadlock;
		this.checkInterval = setInterval(() => {
			const graph = this.checkForDeadlock();
			if (graph.cycles.length > 0 && this.onDeadlock) {
				this.onDeadlock(graph);
			}
		}, intervalMs);
	}

	/**
	 * Stop automatic detection
	 */
	stopDetection(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = undefined;
		}
	}

	/**
	 * Check for deadlocks and return graph
	 */
	checkForDeadlock(): DeadlockGraph {
		const cycles = this.detectCycles();

		return {
			nodes: Array.from(this.nodes.values()),
			edges: this.edges,
			cycles,
			timestamp: Date.now(),
		};
	}

	/**
	 * Detect cycles using DFS
	 */
	private detectCycles(): string[][] {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const path: string[] = [];

		const dfs = (nodeId: string): void => {
			visited.add(nodeId);
			recursionStack.add(nodeId);
			path.push(nodeId);

			const node = this.nodes.get(nodeId);
			if (node?.waitingFor) {
				for (const waitingFor of node.waitingFor) {
					if (!visited.has(waitingFor)) {
						dfs(waitingFor);
					} else if (recursionStack.has(waitingFor)) {
						// Found a cycle
						const cycleStart = path.indexOf(waitingFor);
						if (cycleStart !== -1) {
							cycles.push(path.slice(cycleStart));
						}
					}
				}
			}

			path.pop();
			recursionStack.delete(nodeId);
		};

		for (const nodeId of this.nodes.keys()) {
			if (!visited.has(nodeId)) {
				dfs(nodeId);
			}
		}

		return cycles;
	}

	/**
	 * Export graph as Mermaid diagram
	 */
	exportAsMermaid(): string {
		const graph = this.checkForDeadlock();
		return TraceVisualizer.deadlockToMermaid(graph);
	}

	/**
	 * Export graph as Graphviz DOT
	 */
	exportAsGraphviz(): string {
		const graph = this.checkForDeadlock();
		return TraceVisualizer.deadlockToGraphviz(graph);
	}

	/**
	 * Export graph as JSON
	 */
	exportAsJson(): DeadlockGraph {
		return this.checkForDeadlock();
	}

	/**
	 * Clear all nodes and edges
	 */
	clear(): void {
		this.nodes.clear();
		this.edges = [];
	}
}

/**
 * Channel tracer with span linking
 */
export class ChannelTracer<T> {
	private tracer: Tracer;
	private flowTracker: MessageFlowTracker;

	constructor(tracer?: Tracer) {
		this.tracer = tracer ?? trace.getTracer("go-go-scope");
		this.flowTracker = new MessageFlowTracker(tracer);
	}

	/**
	 * Trace channel send operation
	 */
	traceSend(_channel: Channel<T>, messageId: string, value: T): Span {
		const span = this.tracer.startSpan("channel.send", {
			kind: SpanKind.PRODUCER,
			attributes: {
				"channel.operation": "send",
				"message.id": messageId,
				"message.type": typeof value,
			},
		});

		// Start or continue flow
		const flow = this.flowTracker.getFlow(messageId);
		if (!flow) {
			this.flowTracker.startFlow(messageId, typeof value);
		} else {
			this.flowTracker.recordStep(messageId, "send", span);
		}

		return span;
	}

	/**
	 * Trace channel receive operation
	 */
	traceReceive(_channel: Channel<T>, messageId: string): Span {
		const span = this.tracer.startSpan("channel.receive", {
			kind: SpanKind.CONSUMER,
			attributes: {
				"channel.operation": "receive",
				"message.id": messageId,
			},
		});

		// Link to source span if flow exists
		const flow = this.flowTracker.getFlow(messageId);
		if (flow) {
			// Add link to source
			span.addLink({
				context: flow.source,
				attributes: { "link.type": "message-source" },
			});

			this.flowTracker.addDestination(messageId, span.spanContext());
			this.flowTracker.recordStep(messageId, "receive", span);
		}

		return span;
	}

	/**
	 * Get flow tracker
	 */
	getFlowTracker(): MessageFlowTracker {
		return this.flowTracker;
	}
}

/**
 * Scope tracer with enhanced span linking
 */
export class ScopeTracer {
	private tracer: Tracer;
	private parentSpans = new WeakMap<Scope, Span>();

	constructor(tracer?: Tracer) {
		this.tracer = tracer ?? trace.getTracer("go-go-scope");
	}

	/**
	 * Create a span for a scope
	 */
	traceScope(scope: Scope, name: string, parent?: Span): Span {
		const span = this.tracer.startSpan(
			name,
			{
				kind: SpanKind.INTERNAL,
			},
			parent ? trace.setSpan(context.active(), parent) : undefined,
		);

		this.parentSpans.set(scope, span);

		// Add scope attributes
		span.setAttributes({
			"scope.name": scope.scopeName,
			"scope.id": scope.signal.toString(),
		});

		return span;
	}

	/**
	 * Create a child span linked to parent scope
	 */
	traceChildTask(scope: Scope, taskName: string): Span {
		const parentSpan = this.parentSpans.get(scope);

		const span = this.tracer.startSpan(
			taskName,
			{
				kind: SpanKind.INTERNAL,
			},
			parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined,
		);

		// Add link to parent if exists
		if (parentSpan) {
			span.addLink({
				context: parentSpan.spanContext(),
				attributes: { "link.type": "parent-scope" },
			});
		}

		return span;
	}

	/**
	 * End scope tracing
	 */
	endScope(scope: Scope, error?: Error): void {
		const span = this.parentSpans.get(scope);
		if (span) {
			if (error) {
				span.recordException(error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
			}
			span.end();
			this.parentSpans.delete(scope);
		}
	}
}

/**
 * Enhanced tracing options for scope
 */
export interface EnhancedTracingOptions {
	/** Enable message flow tracking */
	trackMessageFlows?: boolean;
	/** Enable deadlock detection */
	enableDeadlockDetection?: boolean;
	/** Deadlock check interval in ms */
	deadlockCheckInterval?: number;
	/** Callback when deadlock detected */
	onDeadlock?: (graph: DeadlockGraph) => void;
	/** Enable channel span linking */
	linkChannelSpans?: boolean;
	/** Enable visual trace export */
	enableVisualExport?: boolean;
}

/**
 * Setup enhanced tracing on a scope
 */
export function setupEnhancedTracing(
	scope: Scope,
	options: EnhancedTracingOptions = {},
	tracer?: Tracer,
): {
	channelTracer: ChannelTracer<unknown>;
	deadlockDetector: DeadlockDetector;
} {
	const channelTracer = new ChannelTracer<unknown>(tracer);
	const deadlockDetector = new DeadlockDetector(tracer);

	// Start deadlock detection if enabled
	if (options.enableDeadlockDetection) {
		deadlockDetector.startDetection(
			options.deadlockCheckInterval ?? 5000,
			options.onDeadlock,
		);

		scope.onDispose(() => {
			deadlockDetector.stopDetection();
		});
	}

	// Register scope with deadlock detector
	deadlockDetector.registerNode(
		scope.scopeName,
		"task",
		"running",
		undefined, // span context
	);

	return { channelTracer, deadlockDetector };
}

/**
 * Export trace data for visualization
 */
export function exportTraceData(
	flowTracker: MessageFlowTracker,
	deadlockDetector: DeadlockDetector,
	format: "mermaid" | "graphviz" | "json" = "json",
): string | Record<string, unknown> {
	switch (format) {
		case "mermaid":
			return [
				"## Message Flows",
				...flowTracker.exportAsMermaid(),
				"",
				"## Deadlock Graph",
				deadlockDetector.exportAsMermaid(),
			].join("\n");

		case "graphviz":
			return deadlockDetector.exportAsGraphviz();

		case "json":
		default:
			return {
				flows: flowTracker.getActiveFlows(),
				deadlockGraph: deadlockDetector.exportAsJson(),
				timestamp: Date.now(),
			};
	}
}
