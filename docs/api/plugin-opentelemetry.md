# plugin-opentelemetry API Reference

> Auto-generated documentation for plugin-opentelemetry

## Table of Contents

- [Functions](#Functions)
  - [opentelemetryPlugin](#opentelemetryplugin)
  - [exportTraceData](#exporttracedata)
- [Classes](#Classes)
  - [TraceVisualizer](#tracevisualizer)
  - [MessageFlowTracker](#messageflowtracker)
  - [DeadlockDetector](#deadlockdetector)
  - [ChannelTracer](#channeltracer)
  - [ScopeTracer](#scopetracer)
- [Interfaces](#Interfaces)
  - [TaskSpanOptions](#taskspanoptions)
  - [OpenTelemetryScopeOptions](#opentelemetryscopeoptions)
  - [OpenTelemetryState](#opentelemetrystate)
  - [TracingOptions](#tracingoptions)
  - [SpanLink](#spanlink)
  - [MessageFlow](#messageflow)
  - [DeadlockNode](#deadlocknode)
  - [DeadlockEdge](#deadlockedge)
  - [DeadlockGraph](#deadlockgraph)
  - [EnhancedTracingOptions](#enhancedtracingoptions)
- [Methods](#Methods)
  - [TraceVisualizer.toMermaidSequence](#tracevisualizer-tomermaidsequence)
  - [TraceVisualizer.deadlockToMermaid](#tracevisualizer-deadlocktomermaid)
  - [TraceVisualizer.deadlockToGraphviz](#tracevisualizer-deadlocktographviz)
  - [TraceVisualizer.toJaegerFormat](#tracevisualizer-tojaegerformat)
  - [MessageFlowTracker.startFlow](#messageflowtracker-startflow)
  - [MessageFlowTracker.recordStep](#messageflowtracker-recordstep)
  - [MessageFlowTracker.addDestination](#messageflowtracker-adddestination)
  - [MessageFlowTracker.completeFlow](#messageflowtracker-completeflow)
  - [MessageFlowTracker.getFlow](#messageflowtracker-getflow)
  - [MessageFlowTracker.getActiveFlows](#messageflowtracker-getactiveflows)
  - [MessageFlowTracker.exportAsMermaid](#messageflowtracker-exportasmermaid)
  - [MessageFlowTracker.cleanup](#messageflowtracker-cleanup)
  - [DeadlockDetector.registerNode](#deadlockdetector-registernode)
  - [DeadlockDetector.updateNode](#deadlockdetector-updatenode)
  - [DeadlockDetector.recordWait](#deadlockdetector-recordwait)
  - [DeadlockDetector.recordHold](#deadlockdetector-recordhold)
  - [DeadlockDetector.releaseWait](#deadlockdetector-releasewait)
  - [DeadlockDetector.releaseHold](#deadlockdetector-releasehold)
  - [DeadlockDetector.startDetection](#deadlockdetector-startdetection)
  - [DeadlockDetector.stopDetection](#deadlockdetector-stopdetection)
  - [DeadlockDetector.checkForDeadlock](#deadlockdetector-checkfordeadlock)
  - [DeadlockDetector.detectCycles](#deadlockdetector-detectcycles)
  - [DeadlockDetector.exportAsMermaid](#deadlockdetector-exportasmermaid)
  - [DeadlockDetector.exportAsGraphviz](#deadlockdetector-exportasgraphviz)
  - [DeadlockDetector.exportAsJson](#deadlockdetector-exportasjson)
  - [DeadlockDetector.clear](#deadlockdetector-clear)
  - [ChannelTracer.traceSend](#channeltracer-tracesend)
  - [ChannelTracer.traceReceive](#channeltracer-tracereceive)
  - [ChannelTracer.getFlowTracker](#channeltracer-getflowtracker)
  - [ScopeTracer.traceScope](#scopetracer-tracescope)
  - [ScopeTracer.traceChildTask](#scopetracer-tracechildtask)
  - [ScopeTracer.endScope](#scopetracer-endscope)

## Functions

### opentelemetryPlugin

```typescript
function opentelemetryPlugin(tracer: Tracer, options: { name?: string; attributes?: Record<string, unknown> } = {}): ScopePlugin
```

Create the OpenTelemetry plugin

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tracer` | `Tracer` |  |
| `options` (optional) | `{ name?: string; attributes?: Record<string, unknown> }` |  |

**Returns:** `ScopePlugin`

*Source: [index.ts:58](packages/plugin-opentelemetry/src/index.ts#L58)*

---

### exportTraceData

```typescript
function exportTraceData(flowTracker: MessageFlowTracker, deadlockDetector: DeadlockDetector, format: "mermaid" | "graphviz" | "json" = "json"): string | Record<string, unknown>
```

Export trace data for visualization

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `flowTracker` | `MessageFlowTracker` |  |
| `deadlockDetector` | `DeadlockDetector` |  |
| `format` (optional) | `"mermaid" | "graphviz" | "json"` |  |

**Returns:** `string | Record<string, unknown>`

*Source: [tracing-enhanced.ts:778](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L778)*

---

## Classes

### TraceVisualizer

```typescript
class TraceVisualizer
```

Trace visualizer for Mermaid/PlantUML export

*Source: [tracing-enhanced.ts:104](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L104)*

---

### MessageFlowTracker

```typescript
class MessageFlowTracker
```

Message flow tracker for distributed tracing

*Source: [tracing-enhanced.ts:258](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L258)*

---

### DeadlockDetector

```typescript
class DeadlockDetector
```

Deadlock detector with graph export

*Source: [tracing-enhanced.ts:381](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L381)*

---

### ChannelTracer

```typescript
class ChannelTracer<T>
```

Channel tracer with span linking

*Source: [tracing-enhanced.ts:613](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L613)*

---

### ScopeTracer

```typescript
class ScopeTracer
```

Scope tracer with enhanced span linking

*Source: [tracing-enhanced.ts:685](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L685)*

---

## Interfaces

### TaskSpanOptions

```typescript
interface TaskSpanOptions
```

OpenTelemetry options for tasks

*Source: [index.ts:12](packages/plugin-opentelemetry/src/index.ts#L12)*

---

### OpenTelemetryScopeOptions

```typescript
interface OpenTelemetryScopeOptions
```

Options with OpenTelemetry support

*Source: [index.ts:20](packages/plugin-opentelemetry/src/index.ts#L20)*

---

### OpenTelemetryState

```typescript
interface OpenTelemetryState
```

OpenTelemetry plugin state for a scope

*Source: [index.ts:30](packages/plugin-opentelemetry/src/index.ts#L30)*

---

### TracingOptions

```typescript
interface TracingOptions
```

Enhanced tracing options for go-go-scope

*Source: [index.ts:40](packages/plugin-opentelemetry/src/index.ts#L40)*

---

### SpanLink

```typescript
interface SpanLink
```

Span link for cross-operation tracing

*Source: [tracing-enhanced.ts:18](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L18)*

---

### MessageFlow

```typescript
interface MessageFlow
```

Message flow tracking

*Source: [tracing-enhanced.ts:28](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L28)*

---

### DeadlockNode

```typescript
interface DeadlockNode
```

Deadlock detection graph node

*Source: [tracing-enhanced.ts:54](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L54)*

---

### DeadlockEdge

```typescript
interface DeadlockEdge
```

Deadlock detection graph edge

*Source: [tracing-enhanced.ts:74](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L74)*

---

### DeadlockGraph

```typescript
interface DeadlockGraph
```

Deadlock graph for visualization

*Source: [tracing-enhanced.ts:88](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L88)*

---

### EnhancedTracingOptions

```typescript
interface EnhancedTracingOptions
```

Enhanced tracing options for scope

*Source: [tracing-enhanced.ts:760](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L760)*

---

## Methods

### TraceVisualizer.toMermaidSequence

```typescript
TraceVisualizer.toMermaidSequence(flow: MessageFlow): string
```

Export message flow as Mermaid sequence diagram

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `flow` | `MessageFlow` |  |

**Returns:** `string`

*Source: [tracing-enhanced.ts:108](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L108)*

---

### TraceVisualizer.deadlockToMermaid

```typescript
TraceVisualizer.deadlockToMermaid(graph: DeadlockGraph): string
```

Export deadlock graph as Mermaid flowchart

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `graph` | `DeadlockGraph` |  |

**Returns:** `string`

*Source: [tracing-enhanced.ts:134](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L134)*

---

### TraceVisualizer.deadlockToGraphviz

```typescript
TraceVisualizer.deadlockToGraphviz(graph: DeadlockGraph): string
```

Export deadlock graph as Graphviz DOT format

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `graph` | `DeadlockGraph` |  |

**Returns:** `string`

*Source: [tracing-enhanced.ts:173](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L173)*

---

### TraceVisualizer.toJaegerFormat

```typescript
TraceVisualizer.toJaegerFormat(flow: MessageFlow): Record<string, unknown>
```

Export trace as Jaeger JSON format

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `flow` | `MessageFlow` |  |

**Returns:** `Record<string, unknown>`

*Source: [tracing-enhanced.ts:223](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L223)*

---

### MessageFlowTracker.startFlow

```typescript
MessageFlowTracker.startFlow(messageId: string, messageType?: string): MessageFlow
```

Start tracking a new message flow

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | `string` |  |
| `messageType` (optional) | `string` |  |

**Returns:** `MessageFlow`

*Source: [tracing-enhanced.ts:269](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L269)*

---

### MessageFlowTracker.recordStep

```typescript
MessageFlowTracker.recordStep(messageId: string, operation: string, span?: Span): void
```

Record a step in the message flow

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | `string` |  |
| `operation` | `string` |  |
| `span` (optional) | `Span` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:299](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L299)*

---

### MessageFlowTracker.addDestination

```typescript
MessageFlowTracker.addDestination(messageId: string, spanContext: SpanContext): void
```

Add a destination to the flow

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | `string` |  |
| `spanContext` | `SpanContext` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:319](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L319)*

---

### MessageFlowTracker.completeFlow

```typescript
MessageFlowTracker.completeFlow(messageId: string): MessageFlow | undefined
```

Complete a message flow

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | `string` |  |

**Returns:** `MessageFlow | undefined`

*Source: [tracing-enhanced.ts:329](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L329)*

---

### MessageFlowTracker.getFlow

```typescript
MessageFlowTracker.getFlow(messageId: string): MessageFlow | undefined
```

Get a flow by ID

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | `string` |  |

**Returns:** `MessageFlow | undefined`

*Source: [tracing-enhanced.ts:340](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L340)*

---

### MessageFlowTracker.getActiveFlows

```typescript
MessageFlowTracker.getActiveFlows(): MessageFlow[]
```

Get all active flows

**Returns:** `MessageFlow[]`

*Source: [tracing-enhanced.ts:347](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L347)*

---

### MessageFlowTracker.exportAsMermaid

```typescript
MessageFlowTracker.exportAsMermaid(messageId?: string): string[]
```

Export flows as Mermaid diagrams

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `messageId` (optional) | `string` |  |

**Returns:** `string[]`

*Source: [tracing-enhanced.ts:354](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L354)*

---

### MessageFlowTracker.cleanup

```typescript
MessageFlowTracker.cleanup(maxAgeMs: number = 3600000): void
```

Clear completed flows older than maxAge

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `maxAgeMs` (optional) | `number` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:368](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L368)*

---

### DeadlockDetector.registerNode

```typescript
DeadlockDetector.registerNode(id: string, type: DeadlockNode["type"], state: string, spanContext?: SpanContext): void
```

Register a node (task, channel, lock, etc.)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `id` | `string` |  |
| `type` | `DeadlockNode["type"]` |  |
| `state` | `string` |  |
| `spanContext` (optional) | `SpanContext` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:394](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L394)*

---

### DeadlockDetector.updateNode

```typescript
DeadlockDetector.updateNode(id: string, state: string): void
```

Update node state

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `id` | `string` |  |
| `state` | `string` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:412](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L412)*

---

### DeadlockDetector.recordWait

```typescript
DeadlockDetector.recordWait(nodeId: string, waitingFor: string): void
```

Record a wait relationship (nodeA waits for nodeB)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `nodeId` | `string` |  |
| `waitingFor` | `string` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:423](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L423)*

---

### DeadlockDetector.recordHold

```typescript
DeadlockDetector.recordHold(holderId: string, resourceId: string): void
```

Record a hold relationship

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `holderId` | `string` |  |
| `resourceId` | `string` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:447](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L447)*

---

### DeadlockDetector.releaseWait

```typescript
DeadlockDetector.releaseWait(nodeId: string, waitingFor: string): void
```

Release a wait relationship

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `nodeId` | `string` |  |
| `waitingFor` | `string` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:467](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L467)*

---

### DeadlockDetector.releaseHold

```typescript
DeadlockDetector.releaseHold(holderId: string, resourceId: string): void
```

Release a hold relationship

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `holderId` | `string` |  |
| `resourceId` | `string` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:483](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L483)*

---

### DeadlockDetector.startDetection

```typescript
DeadlockDetector.startDetection(intervalMs: number = 5000, onDeadlock?: (graph: DeadlockGraph) => void): void
```

Start automatic deadlock detection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `intervalMs` (optional) | `number` |  |
| `onDeadlock` (optional) | `(graph: DeadlockGraph) => void` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:499](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L499)*

---

### DeadlockDetector.stopDetection

```typescript
DeadlockDetector.stopDetection(): void
```

Stop automatic detection

**Returns:** `void`

*Source: [tracing-enhanced.ts:515](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L515)*

---

### DeadlockDetector.checkForDeadlock

```typescript
DeadlockDetector.checkForDeadlock(): DeadlockGraph
```

Check for deadlocks and return graph

**Returns:** `DeadlockGraph`

*Source: [tracing-enhanced.ts:525](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L525)*

---

### DeadlockDetector.detectCycles

```typescript
DeadlockDetector.detectCycles(): string[][]
```

Detect cycles using DFS

**Returns:** `string[][]`

*Source: [tracing-enhanced.ts:539](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L539)*

---

### DeadlockDetector.exportAsMermaid

```typescript
DeadlockDetector.exportAsMermaid(): string
```

Export graph as Mermaid diagram

**Returns:** `string`

*Source: [tracing-enhanced.ts:581](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L581)*

---

### DeadlockDetector.exportAsGraphviz

```typescript
DeadlockDetector.exportAsGraphviz(): string
```

Export graph as Graphviz DOT

**Returns:** `string`

*Source: [tracing-enhanced.ts:589](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L589)*

---

### DeadlockDetector.exportAsJson

```typescript
DeadlockDetector.exportAsJson(): DeadlockGraph
```

Export graph as JSON

**Returns:** `DeadlockGraph`

*Source: [tracing-enhanced.ts:597](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L597)*

---

### DeadlockDetector.clear

```typescript
DeadlockDetector.clear(): void
```

Clear all nodes and edges

**Returns:** `void`

*Source: [tracing-enhanced.ts:604](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L604)*

---

### ChannelTracer.traceSend

```typescript
ChannelTracer.traceSend(_channel: Channel<T>, messageId: string, value: T): Span
```

Trace channel send operation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_channel` | `Channel<T>` |  |
| `messageId` | `string` |  |
| `value` | `T` |  |

**Returns:** `Span`

*Source: [tracing-enhanced.ts:625](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L625)*

---

### ChannelTracer.traceReceive

```typescript
ChannelTracer.traceReceive(_channel: Channel<T>, messageId: string): Span
```

Trace channel receive operation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_channel` | `Channel<T>` |  |
| `messageId` | `string` |  |

**Returns:** `Span`

*Source: [tracing-enhanced.ts:649](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L649)*

---

### ChannelTracer.getFlowTracker

```typescript
ChannelTracer.getFlowTracker(): MessageFlowTracker
```

Get flow tracker

**Returns:** `MessageFlowTracker`

*Source: [tracing-enhanced.ts:677](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L677)*

---

### ScopeTracer.traceScope

```typescript
ScopeTracer.traceScope(scope: Scope, name: string, parent?: Span): Span
```

Create a span for a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `name` | `string` |  |
| `parent` (optional) | `Span` |  |

**Returns:** `Span`

*Source: [tracing-enhanced.ts:696](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L696)*

---

### ScopeTracer.traceChildTask

```typescript
ScopeTracer.traceChildTask(scope: Scope, taskName: string): Span
```

Create a child span linked to parent scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `taskName` | `string` |  |

**Returns:** `Span`

*Source: [tracing-enhanced.ts:719](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L719)*

---

### ScopeTracer.endScope

```typescript
ScopeTracer.endScope(scope: Scope, error?: Error): void
```

End scope tracing

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `error` (optional) | `Error` |  |

**Returns:** `void`

*Source: [tracing-enhanced.ts:744](packages/plugin-opentelemetry/src/tracing-enhanced.ts#L744)*

---

