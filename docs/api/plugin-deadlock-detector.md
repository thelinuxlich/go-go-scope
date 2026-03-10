# plugin-deadlock-detector API Reference

> Auto-generated documentation for plugin-deadlock-detector

## Table of Contents

- [Functions](#Functions)
  - [deadlockDetectorPlugin](#deadlockdetectorplugin)
- [Classs](#Classs)
  - [DeadlockDetector](#deadlockdetector)
- [Interfaces](#Interfaces)
  - [DeadlockDetectionOptions](#deadlockdetectionoptions)
  - [DeadlockDetectorPluginOptions](#deadlockdetectorpluginoptions)
- [Methods](#Methods)
  - [DeadlockDetector.taskWaiting](#deadlockdetector-taskwaiting)
  - [DeadlockDetector.taskResumed](#deadlockdetector-taskresumed)
  - [DeadlockDetector.startMonitoring](#deadlockdetector-startmonitoring)
  - [DeadlockDetector.checkForDeadlocks](#deadlockdetector-checkfordeadlocks)
  - [DeadlockDetector.dispose](#deadlockdetector-dispose)

## Functions

### deadlockDetectorPlugin

```typescript
function deadlockDetectorPlugin(options: DeadlockDetectionOptions): ScopePlugin
```

Create the deadlock detector plugin

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `DeadlockDetectionOptions` |  |

**Returns:** `ScopePlugin`

*Source: [index.ts:130](packages/plugin-deadlock-detector/src/index.ts#L130)*

---

## Classs

### DeadlockDetector

```typescript
class DeadlockDetector
```

Tracks task waiting states to detect potential deadlocks. Automatically registered with scope for cleanup.  #__PURE__

*Source: [index.ts:22](packages/plugin-deadlock-detector/src/index.ts#L22)*

---

## Interfaces

### DeadlockDetectionOptions

```typescript
interface DeadlockDetectionOptions
```

Options for deadlock detection

*Source: [index.ts:10](packages/plugin-deadlock-detector/src/index.ts#L10)*

---

### DeadlockDetectorPluginOptions

```typescript
interface DeadlockDetectorPluginOptions
```

Deadlock detector plugin

*Source: [index.ts:123](packages/plugin-deadlock-detector/src/index.ts#L123)*

---

## Methods

### DeadlockDetector.taskWaiting

```typescript
DeadlockDetector.taskWaiting(taskIndex: number, taskName: string, waitingOn: string): void
```

Register that a task is waiting on a resource.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |
| `taskName` | `string` |  |
| `waitingOn` | `string` |  |

**Returns:** `void`

*Source: [index.ts:41](packages/plugin-deadlock-detector/src/index.ts#L41)*

---

### DeadlockDetector.taskResumed

```typescript
DeadlockDetector.taskResumed(taskIndex: number): void
```

Register that a task is no longer waiting.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskIndex` | `number` |  |

**Returns:** `void`

*Source: [index.ts:52](packages/plugin-deadlock-detector/src/index.ts#L52)*

---

### DeadlockDetector.startMonitoring

```typescript
DeadlockDetector.startMonitoring(): void
```

Start monitoring for deadlocks.

**Returns:** `void`

*Source: [index.ts:59](packages/plugin-deadlock-detector/src/index.ts#L59)*

---

### DeadlockDetector.checkForDeadlocks

```typescript
DeadlockDetector.checkForDeadlocks(): void
```

Check if any tasks have been waiting longer than the timeout.

**Returns:** `void`

*Source: [index.ts:70](packages/plugin-deadlock-detector/src/index.ts#L70)*

---

### DeadlockDetector.dispose

```typescript
DeadlockDetector.dispose(): void
```

Dispose the detector and stop monitoring.

**Returns:** `void`

*Source: [index.ts:97](packages/plugin-deadlock-detector/src/index.ts#L97)*

---

