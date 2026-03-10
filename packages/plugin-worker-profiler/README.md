# @go-go-scope/plugin-worker-profiler

Worker performance profiling plugin for go-go-scope. Track detailed metrics for worker tasks including CPU time, memory usage, and data transfer overhead.

## Installation

```bash
npm install @go-go-scope/plugin-worker-profiler
```

## Usage

```typescript
import { scope } from 'go-go-scope'
import { workerProfilerPlugin } from '@go-go-scope/plugin-worker-profiler'

await using s = scope({
  plugins: [workerProfilerPlugin()]
})

// Run worker tasks
const [err, result] = await s.task(
  { module: './heavy-computation.js', export: 'compute' },
  { worker: true, data: { n: 1000000 } }
)

// Get profiling report
const report = s.workerProfile?.()
console.log(`Tasks: ${report?.statistics.totalTasks}`)
console.log(`Avg duration: ${report?.statistics.avgDuration.toFixed(2)}ms`)
console.log(`Avg CPU time: ${report?.statistics.avgCpuTime.toFixed(2)}ms`)
```

## Configuration

```typescript
workerProfilerPlugin({
  trackCpuTime: true,    // Track CPU usage (default: true)
  trackMemory: true,     // Track memory usage (default: true)
  trackTransfers: true,  // Track data transfer overhead (default: true)
  maxProfiles: 1000      // Max profiles to keep (default: 1000)
})
```

## Metrics Collected

Per task:
- **duration**: Total execution time in milliseconds
- **cpuTime**: CPU time (user + system) in milliseconds
- **memoryPeakRss**: Peak memory RSS in MB
- **memoryPeakHeap**: Peak heap used in MB
- **transferTime**: Data transfer overhead in milliseconds
- **transferSize**: Size of data transferred in bytes

## Report Structure

```typescript
interface WorkerProfilerReport {
  tasks: WorkerTaskProfile[]
  statistics: {
    totalTasks: number
    successfulTasks: number
    failedTasks: number
    avgDuration: number
    avgCpuTime: number
    avgMemoryPeakRss: number
    totalTransferSize: number
  }
}
```

## Filtering Profiles

```typescript
// Get profiles for specific module
const mathProfiles = profiler.getModuleProfiles('./math.js')

// Get profiles for specific export
const addProfiles = profiler.getExportProfiles('./math.js', 'add')
```

## License

MIT
