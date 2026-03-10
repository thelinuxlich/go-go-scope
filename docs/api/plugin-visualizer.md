# plugin-visualizer API Reference

> Auto-generated documentation for plugin-visualizer

## Table of Contents

- [Functions](#Functions)
  - [generateId](#generateid)
  - [visualizerPlugin](#visualizerplugin)
- [Classes](#Classes)
  - [VisualizerState](#visualizerstate)
  - [VisualizerDashboard](#visualizerdashboard)
- [Interfaces](#Interfaces)
  - [VisualizerOptions](#visualizeroptions)
  - [ScopeSnapshot](#scopesnapshot)
  - [TaskSnapshot](#tasksnapshot)
  - [ChannelSnapshot](#channelsnapshot)
- [Types](#Types)
  - [VisualizerEvent](#visualizerevent)

## Functions

### generateId

```typescript
function generateId(): string
```

Generate unique ID for visualization

**Returns:** `string`

*Source: [index.ts:278](packages/plugin-visualizer/src/index.ts#L278)*

---

### visualizerPlugin

```typescript
function visualizerPlugin(options: VisualizerOptions = {}): ScopePlugin & {
	getDashboard: () => VisualizerDashboard | null;
}
```

Create the visualizer plugin

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `VisualizerOptions` |  |

**Returns:** `ScopePlugin & {
	getDashboard: () => VisualizerDashboard | null;
}`

*Source: [index.ts:285](packages/plugin-visualizer/src/index.ts#L285)*

---

## Classes

### VisualizerState

```typescript
class VisualizerState
```

Visualizer state

*Source: [index.ts:84](packages/plugin-visualizer/src/index.ts#L84)*

---

### VisualizerDashboard

```typescript
class VisualizerDashboard
```

Visualizer dashboard server

*Source: [index.ts:179](packages/plugin-visualizer/src/index.ts#L179)*

---

## Interfaces

### VisualizerOptions

```typescript
interface VisualizerOptions
```

Visualizer plugin options

*Source: [index.ts:26](packages/plugin-visualizer/src/index.ts#L26)*

---

### ScopeSnapshot

```typescript
interface ScopeSnapshot
```

Scope snapshot for visualization

*Source: [index.ts:50](packages/plugin-visualizer/src/index.ts#L50)*

---

### TaskSnapshot

```typescript
interface TaskSnapshot
```

Task snapshot

*Source: [index.ts:63](packages/plugin-visualizer/src/index.ts#L63)*

---

### ChannelSnapshot

```typescript
interface ChannelSnapshot
```

Channel snapshot

*Source: [index.ts:74](packages/plugin-visualizer/src/index.ts#L74)*

---

## Types

### VisualizerEvent

```typescript
type VisualizerEvent = | { type: "scope-created"; id: string; name: string; timestamp: number }
	| { type: "scope-disposed"; id: string; timestamp: number }
	| { type: "task-started"; id: string; scopeId: string; name: string; timestamp: number }
	| { type: "task-completed"; id: string; scopeId: string; duration: number; error?: string; timestamp: number }
	| { type: "snapshot"; scopes: ScopeSnapshot[]; timestamp: number }
```

Event types for visualization

*Source: [index.ts:40](packages/plugin-visualizer/src/index.ts#L40)*

---

