# Graceful Shutdown

Handle process shutdown signals (SIGTERM, SIGINT) gracefully, allowing ongoing operations to complete before exiting.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Integration with Tasks](#integration-with-tasks)
- [HTTP Server Example](#http-server-example)
- [Worker Process Example](#worker-process-example)

---

## Basic Usage

```typescript
import { scope } from 'go-go-scope'

// Set up graceful shutdown via scope option
await using s = scope({
  gracefulShutdown: {
    timeout: 30000,  // 30 seconds before force exit
    onShutdown: async (signal) => {
      console.log(`Received ${signal}, starting cleanup...`)
    },
    onComplete: () => {
      console.log('Shutdown complete')
    }
  }
})

// Your application logic here
s.task(async () => {
  while (!s.isShutdownRequested) {
    await processWork()
  }
})
```

---

## Configuration

```typescript
interface GracefulShutdownOptions {
  /** Signals to listen for (default: ['SIGTERM', 'SIGINT']) */
  signals?: NodeJS.Signals[]
  /** Timeout in milliseconds before forceful exit (default: 30000) */
  timeout?: number
  /** Callback when shutdown is requested */
  onShutdown?: (signal: NodeJS.Signals) => void | Promise<void>
  /** Callback when shutdown is complete */
  onComplete?: () => void | Promise<void>
  /** Exit process after shutdown (default: true) */
  exit?: boolean
  /** Exit code on success (default: 0) */
  successExitCode?: number
  /** Exit code on timeout (default: 1) */
  timeoutExitCode?: number
}
```

### Custom Signals

```typescript
await using s = scope({
  gracefulShutdown: {
    // Handle additional signals
    signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],  // Also handle SIGUSR2 (nodemon)
    timeout: 60000
  }
})
```

### Without Process Exit

```typescript
await using s = scope({
  gracefulShutdown: {
    // Don't exit process (useful for testing or embedded scenarios)
    exit: false,
    onComplete: async () => {
      console.log('Cleanup done, but process continues')
    }
  }
})

// Wait for shutdown in your code
await s._shutdownController?.shutdownComplete
console.log('Shutdown complete, can proceed')
```

---

## Integration with Tasks

Tasks can check if shutdown has been requested and exit cleanly:

```typescript
import { scope } from 'go-go-scope'

await using s = scope({
  gracefulShutdown: { timeout: 30000 }
})

// Long-running task that checks for shutdown
s.task(async ({ signal }) => {
  while (!s.isShutdownRequested && !signal.aborted) {
    const work = await getNextWorkItem()
    if (!work) {
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    
    await processWork(work)
  }
  
  console.log('Worker shutting down gracefully')
})

// Task that completes current work before stopping
s.task(async () => {
  try {
    while (true) {
      // Check shutdown before starting new work
      if (s.isShutdownRequested) {
        console.log('Stopping after current batch')
        break
      }
      
      await processBatch()
    }
  } finally {
    // Always clean up
    await saveProgress()
  }
})
```

---

## HTTP Server Example

Graceful shutdown for an HTTP server:

```typescript
import { createServer } from 'http'
import { scope } from 'go-go-scope'

async function startServer() {
  await using s = scope({
    gracefulShutdown: {
      timeout: 30000,
      onShutdown: async () => {
        console.log('Shutting down HTTP server...')
        
        // Stop accepting new connections
        server.close(() => {
          console.log('HTTP server closed')
        })
      }
    }
  })
  
  const server = createServer((req, res) => {
    if (s.isShutdownRequested) {
      // Reject new requests during shutdown
      res.statusCode = 503
      res.end('Server shutting down')
      return
    }
    
    // Process request
    res.end('Hello World')
  })
  
  server.listen(3000, () => {
    console.log('Server listening on port 3000')
  })
  
  // Keep scope alive
  await new Promise(() => {})  // Run forever
}

startServer().catch(console.error)
```

### With Express/Fastify

```typescript
import { scope } from 'go-go-scope'
import { fastifyGoGoScope } from '@go-go-scope/adapter-fastify'
import Fastify from 'fastify'

async function startApp() {
  await using s = scope({
    gracefulShutdown: {
      timeout: 30000,
      onShutdown: async () => {
        await app.close()
      }
    }
  })
  
  const app = Fastify()
  
  // Register go-go-scope plugin
  await app.register(fastifyGoGoScope)
  
  // Your routes...
  app.get('/', async () => 'Hello World')
  
  await app.listen({ port: 3000 })
  
  // Keep alive
  await new Promise(() => {})
}
```

---

## Worker Process Example

Background worker with graceful shutdown:

```typescript
import { scope } from 'go-go-scope'

async function runWorker() {
  await using s = scope({
    gracefulShutdown: {
      timeout: 60000,  // Give workers more time
      onShutdown: async (signal) => {
        console.log(`Worker received ${signal}, finishing current jobs...`)
      }
    }
  })
  
  // Poll for jobs
  const controller = s.poll(
    async () => fetchNextJob(),
    async (job) => {
      // Check shutdown before processing
      if (s.isShutdownRequested) {
        console.log('Skipping job, shutdown in progress')
        return
      }
      
      await processJob(job)
    },
    { interval: 1000 }
  )
  
  // Poll will automatically stop when scope is disposed
  await new Promise(() => {})  // Keep alive
}

runWorker().catch(console.error)
```

---

## Manual Shutdown

You can also trigger shutdown programmatically:

```typescript
await using s = scope({
  gracefulShutdown: { exit: false }
})

// Trigger shutdown manually (e.g., from admin endpoint)
app.post('/admin/shutdown', async (req, res) => {
  res.json({ message: 'Shutting down...' })
  
  // Trigger graceful shutdown
  await s._shutdownController?.shutdown('SIGTERM')
})

// Check status
console.log('Shutdown requested?', s.isShutdownRequested)

// Wait for shutdown to complete
await s._shutdownController?.shutdownComplete
console.log('Shutdown finished')
```

---

## Next Steps

- **[Observability](./06-observability.md)** - Metrics and monitoring for production
- **[Resilience Patterns](./05-resilience-patterns.md)** - Circuit breakers and retry
- **[Recipes](./13-recipes.md)** - Common patterns and solutions
