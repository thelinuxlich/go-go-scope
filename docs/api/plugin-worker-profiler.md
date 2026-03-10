# plugin-worker-profiler API Reference

> Auto-generated documentation for plugin-worker-profiler

## Table of Contents

- [Functions](#Functions)
  - [workerProfilerPlugin](#workerprofilerplugin)
- [Classs](#Classs)
  - [WorkerProfiler](#workerprofiler)
- [Interfaces](#Interfaces)
  - [WorkerTaskProfile](#workertaskprofile)
  - [WorkerProfilerReport](#workerprofilerreport)
  - [WorkerProfilerOptions](#workerprofileroptions)
  - [ActiveWorkerTask](#activeworkertask)
- [Methods](#Methods)
  - [WorkerProfiler.startTask](#workerprofiler-starttask)
  - [WorkerProfiler.markTransferComplete](#workerprofiler-marktransfercomplete)
  - [WorkerProfiler.endTask](#workerprofiler-endtask)
  - [WorkerProfiler.getReport](#workerprofiler-getreport)
  - [WorkerProfiler.getModuleProfiles](#workerprofiler-getmoduleprofiles)
  - [WorkerProfiler.getExportProfiles](#workerprofiler-getexportprofiles)
  - [WorkerProfiler.clear](#workerprofiler-clear)
  - [WorkerProfiler.dispose](#workerprofiler-dispose)

## Functions

### workerProfilerPlugin

```typescript
function workerProfilerPlugin(options: WorkerProfilerOptions = {}): ScopePlugin
```

Create the worker profiler plugin @param options - Profiler configuration options @returns ScopePlugin for worker profiling @example ```typescript import { scope } from 'go-go-scope' import { workerProfilerPlugin } from '@go-go-scope/plugin-worker-profiler' await using s = scope({   plugins: [workerProfilerPlugin({ trackCpuTime: true, trackMemory: true })] }) // Run worker tasks... // Get profiling report const report = s.workerProfile?.() console.log(`Average duration: ${report?.statistics.avgDuration}ms`) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `WorkerProfilerOptions` | - Profiler configuration options |

**Returns:** `ScopePlugin`

ScopePlugin for worker profiling

**Examples:**

```typescript
import { scope } from 'go-go-scope'
import { workerProfilerPlugin } from '@go-go-scope/plugin-worker-profiler'

await using s = scope({
  plugins: [workerProfilerPlugin({ trackCpuTime: true, trackMemory: true })]
})

// Run worker tasks...

// Get profiling report
const report = s.workerProfile?.()
console.log(`Average duration: ${report?.statistics.avgDuration}ms`)
```

**@param:** - Profiler configuration options

**@returns:** ScopePlugin for worker profiling

*Source: [index.ts:336](packages/plugin-worker-profiler/src/index.ts#L336)*

---

## Classs

### WorkerProfiler

```typescript
class WorkerProfiler
```

Worker profiler for tracking worker task performance

*Source: [index.ts:113](packages/plugin-worker-profiler/src/index.ts#L113)*

---

## Interfaces

### WorkerTaskProfile

```typescript
interface WorkerTaskProfile
```

Worker task performance metrics

*Source: [index.ts:34](packages/plugin-worker-profiler/src/index.ts#L34)*

---

### WorkerProfilerReport

```typescript
interface WorkerProfilerReport
```

Worker profiler report

*Source: [index.ts:68](packages/plugin-worker-profiler/src/index.ts#L68)*

---

### WorkerProfilerOptions

```typescript
interface WorkerProfilerOptions
```

Options for worker profiler plugin

*Source: [index.ts:86](packages/plugin-worker-profiler/src/index.ts#L86)*

---

### ActiveWorkerTask

```typescript
interface ActiveWorkerTask
```

Internal tracking for active worker tasks

*Source: [index.ts:100](packages/plugin-worker-profiler/src/index.ts#L100)*

---

## Methods

### WorkerProfiler.startTask

```typescript
WorkerProfiler.startTask(taskId: string, module: string, exportName: string, transferSize?: number): void
```

Start profiling a worker task

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` |  |
| `module` | `string` |  |
| `exportName` | `string` |  |
| `transferSize` (optional) | `number` |  |

**Returns:** `void`

*Source: [index.ts:132](packages/plugin-worker-profiler/src/index.ts#L132)*

---

### WorkerProfiler.markTransferComplete

```typescript
WorkerProfiler.markTransferComplete(taskId: string): void
```

Mark data transfer complete (called when worker starts execution)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` |  |

**Returns:** `void`

*Source: [index.ts:156](packages/plugin-worker-profiler/src/index.ts#L156)*

---

### WorkerProfiler.endTask

```typescript
WorkerProfiler.endTask(taskId: string, succeeded: boolean, error?: Error): void
```

End profiling for a worker task

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` |  |
| `succeeded` | `boolean` |  |
| `error` (optional) | `Error` |  |

**Returns:** `void`

*Source: [index.ts:170](packages/plugin-worker-profiler/src/index.ts#L170)*

---

### WorkerProfiler.getReport

```typescript
WorkerProfiler.getReport(): WorkerProfilerReport
```

Get the profiler report

**Returns:** `WorkerProfilerReport`

*Source: [index.ts:227](packages/plugin-worker-profiler/src/index.ts#L227)*

---

### WorkerProfiler.getModuleProfiles

```typescript
WorkerProfiler.getModuleProfiles(modulePath: string): WorkerTaskProfile[]
```

Get profiles for a specific module

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `modulePath` | `string` |  |

**Returns:** `WorkerTaskProfile[]`

*Source: [index.ts:278](packages/plugin-worker-profiler/src/index.ts#L278)*

---

### WorkerProfiler.getExportProfiles

```typescript
WorkerProfiler.getExportProfiles(modulePath: string, exportName: string): WorkerTaskProfile[]
```

Get profiles for a specific export

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `modulePath` | `string` |  |
| `exportName` | `string` |  |

**Returns:** `WorkerTaskProfile[]`

*Source: [index.ts:285](packages/plugin-worker-profiler/src/index.ts#L285)*

---

### WorkerProfiler.clear

```typescript
WorkerProfiler.clear(): void
```

Clear all profiles

**Returns:** `void`

*Source: [index.ts:294](packages/plugin-worker-profiler/src/index.ts#L294)*

---

### WorkerProfiler.dispose

```typescript
WorkerProfiler.dispose(): void
```

Alias for Symbol.dispose

**Returns:** `void`

*Source: [index.ts:309](packages/plugin-worker-profiler/src/index.ts#L309)*

---

