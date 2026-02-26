# Plugin System

Extend go-go-scope with custom functionality using the plugin system.

## Table of Contents

- [Overview](#overview)
- [Using Plugins](#using-plugins)
- [Creating Plugins](#creating-plugins)
- [Official Plugins](#official-plugins)
- [Plugin Best Practices](#plugin-best-practices)

---

## Overview

The plugin system allows you to extend the `Scope` class with custom methods and functionality. This is useful for:

- Adding domain-specific utilities to scopes
- Integrating with external systems
- Providing syntactic sugar for common patterns
- Extending core functionality without modifying it

---

## Using Plugins

Plugins are installed when creating a scope using the `plugins` option:

```typescript
import { scope } from 'go-go-scope'
import { myPlugin } from './plugins/my-plugin'

await using s = scope({
  plugins: [myPlugin]
})

// Now you can use plugin methods
const result = await s.myCustomMethod()
```

### Multiple Plugins

You can install multiple plugins at once:

```typescript
await using s = scope({
  plugins: [
    streamPlugin,      // From @go-go-scope/stream
    metricsPlugin,     // Custom metrics plugin
    tracingPlugin      // Custom tracing plugin
  ]
})
```

---

## Creating Plugins

A plugin is a function that receives the `Scope` prototype and can add methods or properties to it.

### Basic Plugin Structure

```typescript
import type { Scope } from 'go-go-scope'

export function myPlugin() {
  return {
    name: 'my-plugin',
    install(scope: Scope) {
      // Add methods to scope
      (scope as any).myMethod = function() {
        // 'this' refers to the scope instance
        return this.task(() => doSomething())
      }
    }
  }
}
```

### TypeScript Support

For TypeScript support, declare your plugin methods:

```typescript
// types.d.ts
declare module 'go-go-scope' {
  interface Scope<Services> {
    myCustomMethod<T>(fn: () => Promise<T>): Promise<[Error | undefined, T | undefined]>
  }
}
```

### Plugin with Options

Plugins can accept configuration options:

```typescript
interface MyPluginOptions {
  prefix: string
  enabled: boolean
}

export function myPlugin(options: MyPluginOptions) {
  return {
    name: 'my-plugin',
    install(scope: Scope) {
      if (!options.enabled) return
      
      (scope as any).logWithPrefix = function(msg: string) {
        console.log(`[${options.prefix}] ${msg}`)
      }
    }
  }
}

// Usage
await using s = scope({
  plugins: [myPlugin({ prefix: 'APP', enabled: true })]
})
```

### Plugin with Cleanup

Plugins can register cleanup logic:

```typescript
export function connectionPoolPlugin() {
  return {
    name: 'connection-pool',
    install(scope: Scope) {
      const pools = new Map()
      
      (scope as any).getPool = function(name: string) {
        if (!pools.has(name)) {
          pools.set(name, createPool())
        }
        return pools.get(name)
      }
      
      // Register cleanup
      this.onDispose(async () => {
        for (const [name, pool] of pools) {
          await pool.close()
        }
        pools.clear()
      })
    }
  }
}
```

---

## Official Plugins

### Stream Plugin

The `@go-go-scope/stream` package provides a plugin for the Stream API:

```typescript
import { scope } from 'go-go-scope'
import { streamPlugin } from '@go-go-scope/stream'

await using s = scope({
  plugins: [streamPlugin]
})

// Now you can use s.stream()
const results = await s.stream(source)
  .map(x => x * 2)
  .filter(x => x > 10)
  .toArray()
```

See [Streams](./04-streams.md) for complete documentation.

---

## Plugin Best Practices

### 1. Namespace Your Methods

Prevent conflicts by namespacing plugin methods:

```typescript
// Good
(scope as any).myCompanyFetch = fetchWrapper
(scope as any).myCompanyCache = cacheWrapper

// Avoid
(scope as any).fetch = fetchWrapper  // Might conflict
```

### 2. Check for Conflicts

Check if a method already exists before adding:

```typescript
install(scope: Scope) {
  if ('myMethod' in scope) {
    console.warn('myMethod already exists, skipping')
    return
  }
  (scope as any).myMethod = ...
}
```

### 3. Document Your Plugin

Provide clear documentation:

```typescript
/**
 * Metrics collection plugin for go-go-scope
 * 
 * @example
 * ```typescript
 * await using s = scope({
 *   plugins: [metricsPlugin({ endpoint: '/metrics' })]
 * })
 * 
 * s.collectMetrics()  // Send metrics to endpoint
 * ```
 */
export function metricsPlugin(options: MetricsOptions) {
  // ...
}
```

### 4. Test with Other Plugins

Ensure your plugin works well with others:

```typescript
test('plugin works with stream plugin', async () => {
  await using s = scope({
    plugins: [streamPlugin, myPlugin]
  })
  
  // Both plugins should work
  await s.stream([1, 2, 3]).toArray()
  await s.myCustomMethod()
})
```

### 5. Handle Scope Disposal

Always clean up resources when the scope is disposed:

```typescript
export function websocketPlugin() {
  return {
    name: 'websocket',
    install(scope: Scope) {
      const connections: WebSocket[] = []
      
      (scope as any).createWebSocket = function(url: string) {
        const ws = new WebSocket(url)
        connections.push(ws)
        return ws
      }
      
      // Important: Clean up on scope disposal
      scope.onDispose(() => {
        for (const ws of connections) {
          ws.close()
        }
      })
    }
  }
}
```

---

## Example: Metrics Plugin

Here's a complete example of a metrics collection plugin:

```typescript
import type { Scope } from 'go-go-scope'

interface MetricsPluginOptions {
  endpoint: string
  interval?: number
}

export function metricsPlugin(options: MetricsPluginOptions) {
  return {
    name: 'metrics',
    install(scope: Scope) {
      const metrics: any[] = []
      
      // Add method to scope
      (scope as any).recordMetric = function(name: string, value: number) {
        metrics.push({
          name,
          value,
          timestamp: Date.now()
        })
      }
      
      (scope as any).flushMetrics = async function() {
        if (metrics.length === 0) return
        
        await fetch(options.endpoint, {
          method: 'POST',
          body: JSON.stringify(metrics)
        })
        
        metrics.length = 0
      }
      
      // Auto-flush on dispose
      scope.onDispose(async () => {
        await (scope as any).flushMetrics()
      })
    }
  }
}

// Usage
await using s = scope({
  plugins: [metricsPlugin({ endpoint: '/api/metrics' })]
})

await s.task(async () => {
  const start = Date.now()
  await processData()
  s.recordMetric('process.duration', Date.now() - start)
})

// Metrics automatically flushed when scope disposes
```

---

## Next Steps

- **[Advanced Patterns](./09-advanced-patterns.md)** - Resource pools, parent-child scopes
- **[Streams](./04-streams.md)** - Stream API with plugin integration
- **[Recipes](./13-recipes.md)** - Common patterns and solutions
