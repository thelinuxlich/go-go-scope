# benchmark API Reference

> Auto-generated documentation for benchmark

## Table of Contents

- [Functions](#Functions)
  - [getRuntimeInfo](#getruntimeinfo)
  - [now](#now)
  - [getMemory](#getmemory)
  - [median](#median)
  - [stdDev](#stddev)
  - [removeOutliers](#removeoutliers)
  - [runBenchmarkCase](#runbenchmarkcase)
  - [runBenchmarks](#runbenchmarks)
  - [formatResult](#formatresult)
  - [printResults](#printresults)
- [Interfaces](#Interfaces)
  - [BenchmarkResult](#benchmarkresult)

## Functions

### getRuntimeInfo

```typescript
function getRuntimeInfo(): { name: string; version: string }
```

Get current runtime name and version

**Returns:** `{ name: string; version: string }`

*Source: [benchmark.ts:17](packages/benchmark/src/benchmark.ts#L17)*

---

### now

```typescript
function now(): number
```

High-precision timer

**Returns:** `number`

*Source: [benchmark.ts:36](packages/benchmark/src/benchmark.ts#L36)*

---

### getMemory

```typescript
function getMemory(): number
```

Get memory usage

**Returns:** `number`

*Source: [benchmark.ts:48](packages/benchmark/src/benchmark.ts#L48)*

---

### median

```typescript
function median(arr: number[]): number
```

Calculate median of an array

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `arr` | `number[]` |  |

**Returns:** `number`

*Source: [benchmark.ts:66](packages/benchmark/src/benchmark.ts#L66)*

---

### stdDev

```typescript
function stdDev(arr: number[], mean: number): number
```

Calculate standard deviation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `arr` | `number[]` |  |
| `mean` | `number` |  |

**Returns:** `number`

*Source: [benchmark.ts:77](packages/benchmark/src/benchmark.ts#L77)*

---

### removeOutliers

```typescript
function removeOutliers(arr: number[]): number[]
```

Remove outliers using IQR method

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `arr` | `number[]` |  |

**Returns:** `number[]`

*Source: [benchmark.ts:85](packages/benchmark/src/benchmark.ts#L85)*

---

### runBenchmarkCase

```typescript
function runBenchmarkCase(benchmark: BenchmarkCase): Promise<BenchmarkResult>
```

Run a single benchmark case with proper isolation

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `benchmark` | `BenchmarkCase` |  |

**Returns:** `Promise<BenchmarkResult>`

*Source: [benchmark.ts:103](packages/benchmark/src/benchmark.ts#L103)*

---

### runBenchmarks

```typescript
function runBenchmarks(suiteName: string, benchmarks: BenchmarkCase[]): Promise<BenchmarkSuiteResult>
```

Run a suite of benchmarks

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `suiteName` | `string` |  |
| `benchmarks` | `BenchmarkCase[]` |  |

**Returns:** `Promise<BenchmarkSuiteResult>`

*Source: [benchmark.ts:171](packages/benchmark/src/benchmark.ts#L171)*

---

### formatResult

```typescript
function formatResult(result: BenchmarkResult): string
```

Format benchmark result for display

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `result` | `BenchmarkResult` |  |

**Returns:** `string`

*Source: [benchmark.ts:205](packages/benchmark/src/benchmark.ts#L205)*

---

### printResults

```typescript
function printResults(suite: BenchmarkSuiteResult): void
```

Print benchmark results table

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `suite` | `BenchmarkSuiteResult` |  |

**Returns:** `void`

*Source: [benchmark.ts:217](packages/benchmark/src/benchmark.ts#L217)*

---

## Interfaces

### BenchmarkResult

```typescript
interface BenchmarkResult
```

Benchmark types and interfaces

*Source: [types.ts:5](packages/benchmark/src/types.ts#L5)*

---

