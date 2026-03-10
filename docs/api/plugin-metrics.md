# plugin-metrics API Reference

> Auto-generated documentation for plugin-metrics

## Table of Contents

- [Functions](#Functions)
  - [exportMetrics](#exportmetrics)
  - [metricsPlugin](#metricsplugin)
- [Classes](#Classes)
  - [CounterImpl](#counterimpl)
  - [GaugeImpl](#gaugeimpl)
  - [HistogramImpl](#histogramimpl)
  - [MetricsCollector](#metricscollector)
  - [MetricsReporter](#metricsreporter)
  - [PrimitiveMetricsRegistry](#primitivemetricsregistry)
- [Interfaces](#Interfaces)
  - [Counter](#counter)
  - [Gauge](#gauge)
  - [HistogramSnapshot](#histogramsnapshot)
  - [Histogram](#histogram)
  - [ScopeMetrics](#scopemetrics)
  - [MetricsExportOptions](#metricsexportoptions)
  - [MetricsReporterOptions](#metricsreporteroptions)
  - [MetricsPluginOptions](#metricspluginoptions)
  - [ChannelMetrics](#channelmetrics)
  - [CircuitBreakerMetrics](#circuitbreakermetrics)
  - [SemaphoreMetrics](#semaphoremetrics)
  - [ResourcePoolMetrics](#resourcepoolmetrics)
  - [LockMetrics](#lockmetrics)
- [Methods](#Methods)
  - [PrimitiveMetricsRegistry.registerChannel](#primitivemetricsregistry-registerchannel)
  - [PrimitiveMetricsRegistry.recordChannelSend](#primitivemetricsregistry-recordchannelsend)
  - [PrimitiveMetricsRegistry.recordChannelReceive](#primitivemetricsregistry-recordchannelreceive)
  - [PrimitiveMetricsRegistry.updateChannelBuffer](#primitivemetricsregistry-updatechannelbuffer)
  - [PrimitiveMetricsRegistry.registerCircuitBreaker](#primitivemetricsregistry-registercircuitbreaker)
  - [PrimitiveMetricsRegistry.recordCircuitBreakerResult](#primitivemetricsregistry-recordcircuitbreakerresult)
  - [PrimitiveMetricsRegistry.recordCircuitBreakerStateChange](#primitivemetricsregistry-recordcircuitbreakerstatechange)
  - [PrimitiveMetricsRegistry.registerSemaphore](#primitivemetricsregistry-registersemaphore)
  - [PrimitiveMetricsRegistry.recordSemaphoreAcquisition](#primitivemetricsregistry-recordsemaphoreacquisition)
  - [PrimitiveMetricsRegistry.updateSemaphoreState](#primitivemetricsregistry-updatesemaphorestate)
  - [PrimitiveMetricsRegistry.registerResourcePool](#primitivemetricsregistry-registerresourcepool)
  - [PrimitiveMetricsRegistry.recordPoolAcquisition](#primitivemetricsregistry-recordpoolacquisition)
  - [PrimitiveMetricsRegistry.updatePoolState](#primitivemetricsregistry-updatepoolstate)
  - [PrimitiveMetricsRegistry.recordPoolResourceChange](#primitivemetricsregistry-recordpoolresourcechange)
  - [PrimitiveMetricsRegistry.recordPoolHealthCheckFailure](#primitivemetricsregistry-recordpoolhealthcheckfailure)
  - [PrimitiveMetricsRegistry.registerLock](#primitivemetricsregistry-registerlock)
  - [PrimitiveMetricsRegistry.recordLockAcquisition](#primitivemetricsregistry-recordlockacquisition)
  - [PrimitiveMetricsRegistry.recordLockRelease](#primitivemetricsregistry-recordlockrelease)
  - [PrimitiveMetricsRegistry.recordLockExtension](#primitivemetricsregistry-recordlockextension)
  - [PrimitiveMetricsRegistry.exportAsPrometheus](#primitivemetricsregistry-exportasprometheus)
  - [PrimitiveMetricsRegistry.exportAsJson](#primitivemetricsregistry-exportasjson)
  - [PrimitiveMetricsRegistry.clear](#primitivemetricsregistry-clear)

## Functions

### exportMetrics

```typescript
function exportMetrics(metrics: ScopeMetrics, options: MetricsExportOptions): string
```

Export metrics in various formats

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `metrics` | `ScopeMetrics` |  |
| `options` | `MetricsExportOptions` |  |

**Returns:** `string`

*Source: [index.ts:297](packages/plugin-metrics/src/index.ts#L297)*

---

### metricsPlugin

```typescript
function metricsPlugin(options: MetricsPluginOptions = {}): ScopePlugin
```

Create the metrics plugin

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `MetricsPluginOptions` |  |

**Returns:** `ScopePlugin`

*Source: [index.ts:534](packages/plugin-metrics/src/index.ts#L534)*

---

## Classes

### CounterImpl

```typescript
class CounterImpl
```

Counter implementation

*Source: [index.ts:62](packages/plugin-metrics/src/index.ts#L62)*

---

### GaugeImpl

```typescript
class GaugeImpl
```

Gauge implementation

*Source: [index.ts:81](packages/plugin-metrics/src/index.ts#L81)*

---

### HistogramImpl

```typescript
class HistogramImpl
```

Histogram implementation

*Source: [index.ts:103](packages/plugin-metrics/src/index.ts#L103)*

---

### MetricsCollector

```typescript
class MetricsCollector
```

Metrics collector for a scope

*Source: [index.ts:185](packages/plugin-metrics/src/index.ts#L185)*

---

### MetricsReporter

```typescript
class MetricsReporter
```

Metrics reporter

*Source: [index.ts:467](packages/plugin-metrics/src/index.ts#L467)*

---

### PrimitiveMetricsRegistry

```typescript
class PrimitiveMetricsRegistry
```

Comprehensive metrics registry for primitives

*Source: [primitive-metrics.ts:119](packages/plugin-metrics/src/primitive-metrics.ts#L119)*

---

## Interfaces

### Counter

```typescript
interface Counter
```

Counter metric interface

*Source: [index.ts:10](packages/plugin-metrics/src/index.ts#L10)*

---

### Gauge

```typescript
interface Gauge
```

Gauge metric interface

*Source: [index.ts:22](packages/plugin-metrics/src/index.ts#L22)*

---

### HistogramSnapshot

```typescript
interface HistogramSnapshot
```

Histogram snapshot

*Source: [index.ts:36](packages/plugin-metrics/src/index.ts#L36)*

---

### Histogram

```typescript
interface Histogram
```

Histogram metric interface

*Source: [index.ts:52](packages/plugin-metrics/src/index.ts#L52)*

---

### ScopeMetrics

```typescript
interface ScopeMetrics
```

Scope metrics data

*Source: [index.ts:161](packages/plugin-metrics/src/index.ts#L161)*

---

### MetricsExportOptions

```typescript
interface MetricsExportOptions
```

Metrics export format options

*Source: [index.ts:176](packages/plugin-metrics/src/index.ts#L176)*

---

### MetricsReporterOptions

```typescript
interface MetricsReporterOptions
```

Metrics reporter options

*Source: [index.ts:459](packages/plugin-metrics/src/index.ts#L459)*

---

### MetricsPluginOptions

```typescript
interface MetricsPluginOptions
```

Metrics plugin options

*Source: [index.ts:521](packages/plugin-metrics/src/index.ts#L521)*

---

### ChannelMetrics

```typescript
interface ChannelMetrics
```

Channel metrics

*Source: [primitive-metrics.ts:17](packages/plugin-metrics/src/primitive-metrics.ts#L17)*

---

### CircuitBreakerMetrics

```typescript
interface CircuitBreakerMetrics
```

Circuit breaker metrics

*Source: [primitive-metrics.ts:39](packages/plugin-metrics/src/primitive-metrics.ts#L39)*

---

### SemaphoreMetrics

```typescript
interface SemaphoreMetrics
```

Semaphore metrics

*Source: [primitive-metrics.ts:59](packages/plugin-metrics/src/primitive-metrics.ts#L59)*

---

### ResourcePoolMetrics

```typescript
interface ResourcePoolMetrics
```

Resource pool metrics

*Source: [primitive-metrics.ts:75](packages/plugin-metrics/src/primitive-metrics.ts#L75)*

---

### LockMetrics

```typescript
interface LockMetrics
```

Lock metrics

*Source: [primitive-metrics.ts:101](packages/plugin-metrics/src/primitive-metrics.ts#L101)*

---

## Methods

### PrimitiveMetricsRegistry.registerChannel

```typescript
PrimitiveMetricsRegistry.registerChannel(name: string, channel: {
			size: number;
			cap: number;
			isClosed: boolean;
			strategy: string;
		}): void
```

Register a channel for metrics collection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `channel` | `{
			size: number;
			cap: number;
			isClosed: boolean;
			strategy: string;
		}` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:132](packages/plugin-metrics/src/primitive-metrics.ts#L132)*

---

### PrimitiveMetricsRegistry.recordChannelSend

```typescript
PrimitiveMetricsRegistry.recordChannelSend(name: string, blocked: boolean, dropped: boolean): void
```

Record channel send

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `blocked` | `boolean` |  |
| `dropped` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:156](packages/plugin-metrics/src/primitive-metrics.ts#L156)*

---

### PrimitiveMetricsRegistry.recordChannelReceive

```typescript
PrimitiveMetricsRegistry.recordChannelReceive(name: string, blocked: boolean): void
```

Record channel receive

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `blocked` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:168](packages/plugin-metrics/src/primitive-metrics.ts#L168)*

---

### PrimitiveMetricsRegistry.updateChannelBuffer

```typescript
PrimitiveMetricsRegistry.updateChannelBuffer(name: string, size: number, state: string): void
```

Update channel buffer state

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `size` | `number` |  |
| `state` | `string` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:179](packages/plugin-metrics/src/primitive-metrics.ts#L179)*

---

### PrimitiveMetricsRegistry.registerCircuitBreaker

```typescript
PrimitiveMetricsRegistry.registerCircuitBreaker(name: string, cb: {
			currentState: string;
			failureCount: number;
			failureThreshold: number;
			errorRate?: number;
		}): void
```

Register a circuit breaker for metrics collection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `cb` | `{
			currentState: string;
			failureCount: number;
			failureThreshold: number;
			errorRate?: number;
		}` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:190](packages/plugin-metrics/src/primitive-metrics.ts#L190)*

---

### PrimitiveMetricsRegistry.recordCircuitBreakerResult

```typescript
PrimitiveMetricsRegistry.recordCircuitBreakerResult(name: string, success: boolean): void
```

Record circuit breaker result

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `success` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:213](packages/plugin-metrics/src/primitive-metrics.ts#L213)*

---

### PrimitiveMetricsRegistry.recordCircuitBreakerStateChange

```typescript
PrimitiveMetricsRegistry.recordCircuitBreakerStateChange(name: string, newState: string, errorRate?: number): void
```

Record circuit breaker state change

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `newState` | `string` |  |
| `errorRate` (optional) | `number` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:227](packages/plugin-metrics/src/primitive-metrics.ts#L227)*

---

### PrimitiveMetricsRegistry.registerSemaphore

```typescript
PrimitiveMetricsRegistry.registerSemaphore(name: string, semaphore: {
			available: number;
			totalPermits: number;
			waiting: number;
		}): void
```

Register a semaphore for metrics collection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `semaphore` | `{
			available: number;
			totalPermits: number;
			waiting: number;
		}` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:245](packages/plugin-metrics/src/primitive-metrics.ts#L245)*

---

### PrimitiveMetricsRegistry.recordSemaphoreAcquisition

```typescript
PrimitiveMetricsRegistry.recordSemaphoreAcquisition(name: string, timeout: boolean): void
```

Record semaphore acquisition

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `timeout` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:265](packages/plugin-metrics/src/primitive-metrics.ts#L265)*

---

### PrimitiveMetricsRegistry.updateSemaphoreState

```typescript
PrimitiveMetricsRegistry.updateSemaphoreState(name: string, available: number, waiting: number): void
```

Update semaphore state

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `available` | `number` |  |
| `waiting` | `number` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:276](packages/plugin-metrics/src/primitive-metrics.ts#L276)*

---

### PrimitiveMetricsRegistry.registerResourcePool

```typescript
PrimitiveMetricsRegistry.registerResourcePool(name: string, pool: {
			min: number;
			max: number;
			size: number;
			available: number;
		}): void
```

Register a resource pool for metrics collection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `pool` | `{
			min: number;
			max: number;
			size: number;
			available: number;
		}` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:287](packages/plugin-metrics/src/primitive-metrics.ts#L287)*

---

### PrimitiveMetricsRegistry.recordPoolAcquisition

```typescript
PrimitiveMetricsRegistry.recordPoolAcquisition(name: string, timeout: boolean): void
```

Record pool acquisition

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `timeout` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:313](packages/plugin-metrics/src/primitive-metrics.ts#L313)*

---

### PrimitiveMetricsRegistry.updatePoolState

```typescript
PrimitiveMetricsRegistry.updatePoolState(name: string, size: number, available: number): void
```

Update pool state

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `size` | `number` |  |
| `available` | `number` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:324](packages/plugin-metrics/src/primitive-metrics.ts#L324)*

---

### PrimitiveMetricsRegistry.recordPoolResourceChange

```typescript
PrimitiveMetricsRegistry.recordPoolResourceChange(name: string, created: boolean): void
```

Record resource creation/destruction

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `created` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:336](packages/plugin-metrics/src/primitive-metrics.ts#L336)*

---

### PrimitiveMetricsRegistry.recordPoolHealthCheckFailure

```typescript
PrimitiveMetricsRegistry.recordPoolHealthCheckFailure(name: string): void
```

Record health check failure

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:350](packages/plugin-metrics/src/primitive-metrics.ts#L350)*

---

### PrimitiveMetricsRegistry.registerLock

```typescript
PrimitiveMetricsRegistry.registerLock(name: string): void
```

Register a lock for metrics collection

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:360](packages/plugin-metrics/src/primitive-metrics.ts#L360)*

---

### PrimitiveMetricsRegistry.recordLockAcquisition

```typescript
PrimitiveMetricsRegistry.recordLockAcquisition(name: string, succeeded: boolean): void
```

Record lock acquisition

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `succeeded` | `boolean` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:374](packages/plugin-metrics/src/primitive-metrics.ts#L374)*

---

### PrimitiveMetricsRegistry.recordLockRelease

```typescript
PrimitiveMetricsRegistry.recordLockRelease(name: string, holdTimeMs: number): void
```

Record lock release

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `holdTimeMs` | `number` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:389](packages/plugin-metrics/src/primitive-metrics.ts#L389)*

---

### PrimitiveMetricsRegistry.recordLockExtension

```typescript
PrimitiveMetricsRegistry.recordLockExtension(name: string): void
```

Record lock extension

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |

**Returns:** `void`

*Source: [primitive-metrics.ts:403](packages/plugin-metrics/src/primitive-metrics.ts#L403)*

---

### PrimitiveMetricsRegistry.exportAsPrometheus

```typescript
PrimitiveMetricsRegistry.exportAsPrometheus(prefix = "goscope"): string
```

Get all metrics as Prometheus format

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `prefix` (optional) | `unknown` |  |

**Returns:** `string`

*Source: [primitive-metrics.ts:413](packages/plugin-metrics/src/primitive-metrics.ts#L413)*

---

### PrimitiveMetricsRegistry.exportAsJson

```typescript
PrimitiveMetricsRegistry.exportAsJson(): Record<string, unknown>
```

Get all metrics as JSON

**Returns:** `Record<string, unknown>`

*Source: [primitive-metrics.ts:571](packages/plugin-metrics/src/primitive-metrics.ts#L571)*

---

### PrimitiveMetricsRegistry.clear

```typescript
PrimitiveMetricsRegistry.clear(): void
```

Clear all metrics

**Returns:** `void`

*Source: [primitive-metrics.ts:584](packages/plugin-metrics/src/primitive-metrics.ts#L584)*

---

