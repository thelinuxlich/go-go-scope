# plugin-profiler API Reference

> Auto-generated documentation for plugin-profiler

## Table of Contents

- [Functions](#Functions)
  - [profilerPlugin](#profilerplugin)
- [Classs](#Classs)
  - [Profiler](#profiler)
- [Interfaces](#Interfaces)
  - [TaskProfile](#taskprofile)
  - [ScopeProfileReport](#scopeprofilereport)
  - [TaskProfileData](#taskprofiledata)
  - [ProfilerPluginOptions](#profilerpluginoptions)
- [Methods](#Methods)
  - [Profiler.startTask](#profiler-starttask)
  - [Profiler.startStage](#profiler-startstage)
  - [Profiler.endStage](#profiler-endstage)
  - [Profiler.recordRetry](#profiler-recordretry)
  - [Profiler.endTask](#profiler-endtask)
  - [Profiler.getReport](#profiler-getreport)
  - [Profiler.clear](#profiler-clear)
  - [Profiler.dispose](#profiler-dispose)

## Functions

### profilerPlugin

```typescript
function profilerPlugin(enabled = true): ScopePlugin
```

Create the profiler plugin

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `enabled` (optional) | `unknown` |  |

**Returns:** `ScopePlugin`

*Source: [index.ts:228](packages/plugin-profiler/src/index.ts#L228)*

---

## Classs

### Profiler

```typescript
class Profiler
```

Profiler for tracking task execution performance. Measures time spent in each pipeline stage.  #__PURE__

*Source: [index.ts:57](packages/plugin-profiler/src/index.ts#L57)*

---

## Interfaces

### TaskProfile

```typescript
interface TaskProfile
```

Task profile data

*Source: [index.ts:10](packages/plugin-profiler/src/index.ts#L10)*

---

### ScopeProfileReport

```typescript
interface ScopeProfileReport
```

Profile report for a scope

*Source: [index.ts:27](packages/plugin-profiler/src/index.ts#L27)*

---

### TaskProfileData

```typescript
interface TaskProfileData
```

Internal tracking for task profiling

*Source: [index.ts:42](packages/plugin-profiler/src/index.ts#L42)*

---

### ProfilerPluginOptions

```typescript
interface ProfilerPluginOptions
```

Profiler plugin options

*Source: [index.ts:221](packages/plugin-profiler/src/index.ts#L221)*

---

## Methods

### Profiler.startTask

```typescript
Profiler.startTask(taskIndex: number, taskName: string): void
```

Start profiling a task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |
| `taskName` | `string` |  |

**Returns:** `void`

*Source: [index.ts:69](packages/plugin-profiler/src/index.ts#L69)*

---

### Profiler.startStage

```typescript
Profiler.startStage(taskIndex: number, _stageName: keyof TaskProfile["stages"]): void
```

Record the start of a pipeline stage.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |
| `_stageName` | `keyof TaskProfile["stages"]` |  |

**Returns:** `void`

*Source: [index.ts:86](packages/plugin-profiler/src/index.ts#L86)*

---

### Profiler.endStage

```typescript
Profiler.endStage(taskIndex: number, stageName: keyof TaskProfile["stages"]): void
```

Record the end of a pipeline stage.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |
| `stageName` | `keyof TaskProfile["stages"]` |  |

**Returns:** `void`

*Source: [index.ts:99](packages/plugin-profiler/src/index.ts#L99)*

---

### Profiler.recordRetry

```typescript
Profiler.recordRetry(taskIndex: number): void
```

Record a retry attempt.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |

**Returns:** `void`

*Source: [index.ts:114](packages/plugin-profiler/src/index.ts#L114)*

---

### Profiler.endTask

```typescript
Profiler.endTask(taskIndex: number, succeeded: boolean): void
```

End profiling for a task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |
| `succeeded` | `boolean` |  |

**Returns:** `void`

*Source: [index.ts:126](packages/plugin-profiler/src/index.ts#L126)*

---

### Profiler.getReport

```typescript
Profiler.getReport(): ScopeProfileReport
```

Get the profile report.

**Returns:** `ScopeProfileReport`

*Source: [index.ts:153](packages/plugin-profiler/src/index.ts#L153)*

---

### Profiler.clear

```typescript
Profiler.clear(): void
```

Clear all profiles.

**Returns:** `void`

*Source: [index.ts:198](packages/plugin-profiler/src/index.ts#L198)*

---

### Profiler.dispose

```typescript
Profiler.dispose(): void
```

Alias for Symbol.dispose for convenience.

**Returns:** `void`

*Source: [index.ts:213](packages/plugin-profiler/src/index.ts#L213)*

---

