# Recipe Book

Common patterns and solutions using go-go-scope.

## Table of Contents

- [HTTP Client with Retry](#http-client-with-retry)
- [Database Connection Pool](#database-connection-pool)
- [WebSocket Manager](#websocket-manager)
- [Background Job Processor](#background-job-processor)
- [File Processor with Progress](#file-processor-with-progress)
- [Rate-Limited API Client](#rate-limited-api-client)
- [Cache with TTL](#cache-with-ttl)
- [Circuit Breaker Pattern](#circuit-breaker-pattern)

---

## Using `parallel()` for Batch Operations

The `parallel()` method supports progress tracking, concurrency control, and error handling. It returns a tuple of Results with individual type preservation:

```typescript
// Process URLs with progress tracking - each result is typed individually
const results = await s.parallel(
  urls.map(url => ({ signal }) => fetch(url, { signal })),
  {
    concurrency: 5,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    continueOnError: true
  }
)

// Check each result with full type safety
let succeeded = 0
let failed = 0
for (const [err, response] of results) {
  if (err) {
    failed++
    console.log('Failed:', err)
  } else {
    succeeded++
    // response is fully typed as Response
    console.log('Success:', response.status)
  }
}
```

---

## HTTP Client with Retry

A resilient HTTP client with automatic retries and exponential backoff.

```typescript
import { scope, exponentialBackoff } from 'go-go-scope'
import { assert } from 'go-go-try'

interface HttpClient {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body: unknown): Promise<T>
}

function createHttpClient(baseUrl: string): HttpClient {
  return {
    async get<T>(url: string): Promise<T> {
      await using s = scope()

      const [err, result] = await s.task(
        async ({ signal }) => {
          const response = await fetch(`${baseUrl}${url}`, { signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json() as Promise<T>
        },
        {
          retry: {
            maxRetries: 3,
            delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
          }
        }
      )

      return assert(result, err) // Returns result or throws
    },

    async post<T>(url: string, body: unknown): Promise<T> {
      await using s = scope()

      const [err, result] = await s.task(
        async ({ signal }) => {
          const response = await fetch(`${baseUrl}${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json() as Promise<T>
        },
        {
          retry: {
            maxRetries: 3,
            delay: exponentialBackoff({ initial: 100, max: 5000 })
          }
        }
      )

      return assert(result, err) // Returns result or throws
    }
  }
}

// Usage
const api = createHttpClient('https://api.example.com')
const user = await api.get('/users/123')
```

---

## Database Connection Pool

Manage a pool of database connections with automatic cleanup.

```typescript
import { scope } from 'go-go-scope'

interface DatabaseConnection {
  query(sql: string, params?: unknown[]): Promise<unknown[]>
  close(): Promise<void>
}

async function withDatabase<T>(
  connectionString: string,
  fn: (db: DatabaseConnection) => Promise<T>
): Promise<T> {
  await using s = scope()

  const pool = s.resourcePool<DatabaseConnection>({
    create: async () => {
      // Create connection
      const conn = await createConnection(connectionString)
      return conn
    },
    destroy: async (conn) => {
      await conn.close()
    },
    min: 2,
    max: 10,
    acquireTimeout: 5000
  })

  const conn = await pool.acquire()
  try {
    return await fn(conn)
  } finally {
    await pool.release(conn)
  }
}

// Usage
const users = await withDatabase('postgres://localhost', async (db) => {
  return db.query('SELECT * FROM users WHERE active = ?', [true])
})
```

---

## WebSocket Manager

Manage WebSocket connections with automatic reconnection.

```typescript
import { scope, exponentialBackoff } from 'go-go-scope'
import { assert } from 'go-go-try'

class WebSocketManager {
  private messageHandlers: Array<(msg: unknown) => void> = []

  async connect(url: string) {
    await using s = scope()

    const connectWebSocket = async () => {
      return new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url)

        ws.onopen = () => resolve(ws)
        ws.onerror = (err) => reject(err)

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data)
          this.messageHandlers.forEach((h) => h(msg))
        }
      })
    }

    // Connect with retry
    const [err, ws] = await s.task(
      () => connectWebSocket(),
      {
        retry: {
          maxRetries: 10,
          delay: exponentialBackoff({ initial: 1000, max: 30000 })
        }
      }
    )

    // Assert success - throws if connection failed
    const socket = assert(ws, err)

    // Keep alive with ping/pong
    s.poll(
      () => Promise.resolve(),
      () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      },
      { interval: 30000 }
    )

    // Auto-cleanup on disconnect
    s.onDispose(() => {
      socket.close()
    })
  }

  onMessage(handler: (msg: unknown) => void) {
    this.messageHandlers.push(handler)
  }
}
```

---

## Background Job Processor

Process jobs in the background with concurrency control.

```typescript
import { scope } from 'go-go-scope'

interface Job {
  id: string
  type: string
  payload: unknown
}

interface JobResult {
  jobId: string
  success: boolean
  result?: unknown
  error?: Error
}

async function startJobProcessor(
  jobQueue: AsyncIterable<Job>,
  handlers: Record<string, (payload: unknown) => Promise<unknown>>
) {
  await using s = scope({ concurrency: 5, metrics: true })

  for await (const job of jobQueue) {
    throwIfAborted(s.signal)

    s.task(async () => {
      const handler = handlers[job.type]
      if (!handler) throw new Error(`Unknown job type: ${job.type}`)

      const result = await handler(job.payload)
      return { jobId: job.id, success: true, result }
    })
  }

  // Log metrics periodically
  s.poll(
    () => Promise.resolve(s.aggregateMetrics()),
    (metrics) => {
      if (metrics) {
        console.log(`Processed: ${metrics.tasksCompleted}, Failed: ${metrics.tasksFailed}`)
      }
    },
    { interval: 60000 }
  )
}

// Usage
const jobQueue = createJobQueue() // Your job queue implementation
await startJobProcessor(jobQueue, {
  'send-email': async (payload) => {
    // Send email logic
  },
  'generate-report': async (payload) => {
    // Report generation logic
  }
})
```

---

## File Processor with Progress

Process files with progress tracking and batch operations.

```typescript
import { scope } from 'go-go-scope'

async function processFiles(
  files: File[],
  processor: (file: File) => Promise<unknown>,
  onProgress: (completed: number, total: number) => void
) {
  await using s = scope({ concurrency: 3 })

  const results = await s.parallel(
    files.map((file, i) => async () => {
      console.log(`Processing ${file.name} (${i + 1}/${files.length})`)
      return processor(file)
    }),
    {
      concurrency: 3,
      onProgress: (completed, total) => {
        onProgress(completed, total)
        console.log(`Progress: ${((completed / total) * 100).toFixed(1)}%`)
      },
      continueOnError: true
    }
  )

  // Count successes and failures
  const completed = results.filter(([err]) => !err).length
  const failed = results.filter(([err]) => err).length

  console.log(`Completed: ${completed}/${files.length}`)
  console.log(`Failed: ${failed}`)

  return results
}

// Usage with UI progress bar
const files = await selectFiles()
await processFiles(
  files,
  async (file) => {
    // Process each file
    return uploadFile(file)
  },
  (completed, total) => {
    updateProgressBar((completed / total) * 100)
  }
)
```

---

## Rate-Limited API Client

API client with rate limiting and request deduplication.

```typescript
import { scope, throttle } from 'go-go-scope'

function createRateLimitedClient(
  baseUrl: string,
  requestsPerSecond: number
) {
  const cache = new Map<string, unknown>()

  return scope().provide('cache', () => cache)
    .provide('throttle', (ctx) => {
      return throttle(ctx.services.scope, async (url: string) => {
        const response = await fetch(`${baseUrl}${url}`)
        return response.json()
      }, { interval: 1000 / requestsPerSecond })
    })
}

// Alternative using semaphore
async function withRateLimit<T>(
  fn: () => Promise<T>,
  maxRequests: number,
  windowMs: number
): Promise<T> {
  await using s = scope()

  const semaphore = s.semaphore(maxRequests)

  await semaphore.acquire()
  try {
    const result = await fn()

    // Release after window
    setTimeout(() => semaphore.release(), windowMs)

    return result
  } catch (error) {
    semaphore.release()
    throw error
  }
}
```

---

## Cache with TTL

In-memory cache with automatic expiration.

```typescript
import { scope, poll } from 'go-go-scope'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

function createTTLCache<T>(defaultTTL: number) {
  const cache = new Map<string, CacheEntry<T>>()

  return {
    get(key: string): T | undefined {
      const entry = cache.get(key)
      if (!entry) return undefined

      if (Date.now() > entry.expiresAt) {
        cache.delete(key)
        return undefined
      }

      return entry.value
    },

    set(key: string, value: T, ttl = defaultTTL) {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttl
      })
    },

    async startCleanup() {
      await using s = scope()

      // Clean up expired entries every minute
      s.poll(
        () => Promise.resolve(),
        () => {
          const now = Date.now()
          for (const [key, entry] of cache) {
            if (now > entry.expiresAt) {
              cache.delete(key)
            }
          }
        },
        { interval: 60000 }
      )
    }
  }
}

// Usage
const userCache = createTTLCache<User>(300000) // 5 minute TTL
userCache.set('user-123', user)
const cached = userCache.get('user-123')
```

---

## Circuit Breaker Pattern

Protect services with circuit breaker pattern.

```typescript
import { scope } from 'go-go-scope'

async function callExternalService() {
  await using s = scope({
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000,
      onStateChange: (from, to, count) => {
        console.log(`Circuit: ${from} -> ${to} (failures: ${count})`)
      },
      onOpen: (count) => {
        alertService.notify(`Circuit opened after ${count} failures`)
      },
      onClose: () => {
        console.log('Circuit closed - service recovered')
      }
    }
  })

  const [err, result] = await s.task(() => fetchExternalData())

  if (err) {
    if (err.message === 'Circuit breaker is open') {
      // Use fallback
      return getCachedData()
    }
    throw err
  }

  return result
}
```

---

## More Recipes

See the [examples](../examples/) directory for more complete examples:

- `examples/jaeger-tracing.ts` - Distributed tracing with Jaeger
- `examples/prometheus-metrics.ts` - Metrics export to Prometheus
- `examples/testing-utilities.ts` - Testing patterns

---

## Next Steps

- [API Reference](./03-api-reference.md) - Complete API documentation
- [Advanced Patterns](./09-advanced-patterns.md) - More complex patterns
- [Testing Guide](./08-testing.md) - Testing your code
