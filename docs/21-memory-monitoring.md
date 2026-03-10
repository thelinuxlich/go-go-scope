# Memory Monitoring

> **v2.9.0+** - Automatic heap usage monitoring with configurable limits and pressure callbacks.

## Overview

Memory monitoring allows you to track heap usage within a scope and receive callbacks when memory pressure is detected. This is useful for:

- Preventing out-of-memory errors in long-running processes
- Triggering garbage collection or cache eviction
- Monitoring resource-intensive operations
- Graceful degradation under memory pressure

## Basic Usage

```typescript
import { scope } from "go-go-scope";

await using s = scope({
  memoryLimit: "100mb",
  onMemoryPressure: (usage) => {
    console.warn(`High memory usage: ${usage.percentageUsed.toFixed(1)}%`);
  }
});

// Your tasks here...
```

## Memory Limit Formats

The `memoryLimit` option accepts multiple formats:

```typescript
// Numeric bytes
scope({ memoryLimit: 100 * 1024 * 1024 })  // 100MB

// String with unit
scope({ memoryLimit: "100mb" })
scope({ memoryLimit: "1gb" })
scope({ memoryLimit: "512kb" })

// Full configuration object
scope({
  memoryLimit: {
    limit: "100mb",
    onPressure: (usage) => console.warn("Pressure!", usage),
    checkInterval: 5000,      // Check every 5 seconds
    pressureThreshold: 80     // Trigger at 80% of limit
  }
})
```

## MemoryUsage Interface

```typescript
interface MemoryUsage {
  used: number;           // Heap used in bytes
  total: number;          // Total heap size
  limit: number;          // Configured limit
  percentageUsed: number; // 0-100 percentage
  isOverLimit: boolean;   // Exceeded limit?
}
```

## Accessing Memory Usage

```typescript
await using s = scope({ memoryLimit: "100mb" });

// Get current usage
const usage = s.memoryUsage();
if (usage) {
  console.log(`Using ${usage.used} of ${usage.limit} bytes`);
  console.log(`${usage.percentageUsed.toFixed(1)}% of limit`);
}

// Check if monitoring is enabled
console.log(s.isMemoryMonitoringEnabled); // true

// Get the configured limit
console.log(s.memoryLimit); // 104857600 (100MB in bytes)
```

## Dynamic Limit Updates

```typescript
await using s = scope({ memoryLimit: "100mb" });

// Increase limit dynamically
s.setMemoryLimit("200mb");

// Also accepts numbers (bytes)
s.setMemoryLimit(209715200); // 200MB
```

## Integration Example

```typescript
import { scope } from "go-go-scope";

await using s = scope({
  memoryLimit: "500mb",
  onMemoryPressure: async (usage) => {
    console.warn(`Memory pressure: ${usage.percentageUsed.toFixed(1)}%`);
    
    if (usage.isOverLimit) {
      // Trigger emergency cleanup
      await emergencyCleanup();
    }
  }
});

// Process large dataset with monitoring
const batcher = s.batch({
  size: 1000,
  process: async (items) => {
    // Check memory before processing
    const usage = s.memoryUsage();
    if (usage && usage.percentageUsed > 90) {
      // Reduce batch size or pause
      await s.delay(1000);
    }
    return await db.insert(items);
  }
});

for (const item of largeDataset) {
  await batcher.add(item);
}
```

## Environment Support

Memory monitoring works in:
- Node.js (via `process.memoryUsage()`)
- Bun (via `process.memoryUsage()`)
- Deno (via `Deno.memoryUsage()`)
- Browsers (via `performance.memory`)

Use `isMemoryMonitoringAvailable()` to check at runtime:

```typescript
import { isMemoryMonitoringAvailable } from "go-go-scope";

if (!isMemoryMonitoringAvailable()) {
  console.warn("Memory monitoring not available in this environment");
}
```

## Best Practices

1. **Set realistic limits**: Leave headroom for GC and spikes
2. **Use pressure callbacks for warnings, limits for errors**: React to pressure before hitting the hard limit
3. **Combine with batch processing**: Check memory in batch processors
4. **Don't rely solely on heap limits**: Also monitor event loop lag and active handles
