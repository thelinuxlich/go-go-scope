/**
 * Comprehensive Demo of go-go-scope Features
 * 
 * This example demonstrates:
 * - Type-safe DI with auto-wiring
 * - Distributed tracing with span linking
 * - Cache warming
 * - Enhanced graceful shutdown
 * - Async iterator helpers
 * - Web Streams integration
 * - Framework adapters
 */

import { 
  scope, 
  createContainer, 
  createToken,
  CacheWarmer,
  setupEnhancedGracefulShutdown,
  createShutdownCoordinator,
  asyncIteratorFrom,
  buffer,
  merge,
  parallel,
} from "go-go-scope";

import { opentelemetryPlugin, setupEnhancedTracing } from "@go-go-scope/plugin-opentelemetry";
import { metricsPlugin } from "@go-go-scope/plugin-metrics";
import { 
  channelToReadableStream, 
  readableStreamToChannel,
  createTransformStream 
} from "@go-go-scope/web-streams";

// =============================================================================
// 1. TYPE-SAFE DEPENDENCY INJECTION
// =============================================================================

// Define service tokens
const DatabaseToken = createToken<Database>("Database");
const CacheToken = createToken<Cache>("Cache");
const LoggerToken = createToken<Logger>("Logger");

interface Database {
  query<T>(sql: string): Promise<T[]>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
}

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error): void;
}

// Create DI container
const container = createContainer()
  .register(LoggerToken, {
    lifetime: "singleton",
    factory: () => ({
      info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
      error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
    }),
  })
  .register(DatabaseToken, {
    lifetime: "singleton",
    factory: () => ({
      query: async <T>(sql: string) => {
        console.log(`Query: ${sql}`);
        return [] as T[];
      },
      connect: async () => console.log("DB connected"),
      disconnect: async () => console.log("DB disconnected"),
    }),
    dispose: (db) => db.disconnect(),
  })
  .register(CacheToken, {
    lifetime: "scoped",
    dependencies: [LoggerToken],
    factory: ({ [LoggerToken.key]: logger }) => ({
      get: async <T>(key: string) => {
        logger.info(`Cache miss: ${key}`);
        return undefined as T | undefined;
      },
      set: async <T>(key: string, value: T, ttl?: number) => {
        logger.info(`Cache set: ${key}`, { ttl });
      },
    }),
  });

// =============================================================================
// 2. MAIN APPLICATION SCOPE
// =============================================================================

async function main() {
  await using s = scope({
    name: "main-app",
    timeout: 30000,
    plugins: [
      // OpenTelemetry with enhanced tracing
      opentelemetryPlugin(tracer, { name: "main-scope" }),
      // Metrics collection
      metricsPlugin({
        metricsExport: {
          interval: 60000,
          format: "prometheus",
          destination: (data) => console.log("Metrics:", data.slice(0, 100)),
        },
      }),
    ],
  });

  // Setup enhanced graceful shutdown
  const shutdown = setupEnhancedGracefulShutdown(s, {
    strategy: "hybrid",
    drainTimeout: 10000,
    timeout: 30000,
    beforeShutdown: async () => {
      console.log("Starting graceful shutdown...");
    },
    afterShutdown: async () => {
      console.log("Shutdown complete");
    },
  });

  // Setup enhanced tracing
  const { channelTracer, deadlockDetector } = setupEnhancedTracing(s, {
    trackMessageFlows: true,
    enableDeadlockDetection: true,
    deadlockCheckInterval: 5000,
    onDeadlock: (graph) => {
      console.error("Deadlock detected!");
      console.log(TraceVisualizer.deadlockToMermaid(graph));
    },
  });

  // Resolve services from DI container
  const [dbErr, db] = await container.resolve(s, DatabaseToken);
  if (dbErr) throw dbErr;

  const [cacheErr, cache] = await container.resolve(s, CacheToken);
  if (cacheErr) throw cacheErr;

  // =============================================================================
  // 3. CACHE WARMING
  // =============================================================================

  const cacheWarmer = new CacheWarmer(s, cacheProvider, {
    defaultTTL: 60000,
    defaultRefreshThreshold: 0.2,
    checkInterval: 10000,
  });

  // Register warmed cache
  const userCache = cacheWarmer.register("user:123", {
    fetcher: async () => {
      const [err, users] = await s.task(() => db.query("SELECT * FROM users WHERE id = 123"));
      if (err) throw err;
      return users[0];
    },
    ttl: 60000,
    refreshThreshold: 0.2,
    backgroundRefresh: true,
    onRefresh: (user) => console.log("Cache refreshed:", user.id),
    onError: (err) => console.error("Cache error:", err),
  });

  // Get user (auto-refreshes if needed)
  const [userErr, user] = await userCache.get();
  if (userErr) console.error(userErr);

  // =============================================================================
  // 4. ASYNC ITERATOR HELPERS
  // =============================================================================

  // Create async iterator from EventTarget
  const button = document.getElementById("myButton");
  if (button) {
    const clicks = asyncIteratorFrom<MouseEvent>(button, "click");
    
    // Take first 5 clicks, buffer them, and process
    const bufferedClicks = buffer(take(clicks, 5), 2);
    
    for await (const clickBatch of bufferedClicks) {
      console.log("Processing click batch:", clickBatch.length);
    }
  }

  // Merge multiple async iterables
  const source1 = interval(1000); // Every second
  const source2 = interval(1500); // Every 1.5 seconds
  
  const merged = merge(source1, source2);
  
  for await (const value of take(merged, 10)) {
    console.log("Merged value:", value);
  }

  // =============================================================================
  // 5. WEB STREAMS INTEGRATION
  // =============================================================================

  // Convert channel to ReadableStream
  const dataChannel = s.channel<string>(100);
  
  // Producer
  s.task(async () => {
    for (let i = 0; i < 100; i++) {
      await dataChannel.send(`Message ${i}`);
    }
    dataChannel.close();
  });

  // Convert to Web Stream and pipe through transform
  const readableStream = channelToReadableStream(dataChannel);
  
  const transformedStream = readableStream.pipeThrough(
    createTransformStream<string, string>({
      transform: (chunk) => chunk.toUpperCase(),
    })
  );

  // Convert back to channel
  const outputChannel = readableStreamToChannel(s, transformedStream);

  // Consumer
  s.task(async () => {
    for await (const msg of outputChannel) {
      console.log("Received:", msg);
    }
  });

  // =============================================================================
  // 6. PARALLEL PROCESSING WITH PROGRESS
  // =============================================================================

  const items = Array.from({ length: 100 }, (_, i) => i);
  
  const results = await parallel(
    items.map((i) => async () => {
      // Simulate work
      await new Promise((r) => setTimeout(r, 100));
      return i * 2;
    }),
    {
      concurrency: 10,
      onProgress: (completed, total, result) => {
        console.log(`Progress: ${completed}/${total}`);
      },
    }
  );

  console.log("Parallel results:", results.length);

  // =============================================================================
  // 7. CHANNEL WITH BACKPRESSURE AND TRACING
  // =============================================================================

  const tracedChannel = s.channel<number>(10, {
    backpressure: "block",
  });

  // Producer with tracing
  s.task(async () => {
    for (let i = 0; i < 1000; i++) {
      const messageId = `msg-${i}`;
      const span = channelTracer.traceSend(tracedChannel, messageId, i);
      
      await tracedChannel.send(i);
      span.end();

      // Record flow step
      if (i % 100 === 0) {
        console.log(`Sent ${i} messages`);
      }
    }
    tracedChannel.close();
  });

  // Consumer with tracing
  s.task(async () => {
    let count = 0;
    for await (const value of tracedChannel) {
      const messageId = `msg-${value}`;
      const span = channelTracer.traceReceive(tracedChannel, messageId);
      span.end();

      count++;
      if (count % 100 === 0) {
        console.log(`Received ${count} messages`);
      }
    }
  });

  // =============================================================================
  // 8. MULTI-SCOPE COORDINATED SHUTDOWN
  // =============================================================================

  const coordinator = createShutdownCoordinator();

  // Create worker scope
  const workerScope = coordinator.register("worker", scope({ name: "worker" }), {
    strategy: "drain",
    drainTimeout: 5000,
  });

  // Create API scope that depends on worker
  const apiScope = coordinator.register("api", scope({ name: "api" }), {
    strategy: "drain",
    drainTimeout: 10000,
  });
  coordinator.addDependency("api", "worker"); // API depends on worker

  // Simulate shutdown
  setTimeout(() => {
    coordinator.shutdownAll("SIGTERM").then((results) => {
      for (const [name, error] of results) {
        console.log(`Shutdown ${name}:`, error ? "failed" : "success");
      }
    });
  }, 60000);

  // =============================================================================
  // 9. DEADLOCK DETECTION
  // =============================================================================

  // Register resources with deadlock detector
  deadlockDetector.registerNode("task-1", "task", "running");
  deadlockDetector.registerNode("task-2", "task", "running");
  deadlockDetector.registerNode("lock-A", "lock", "held");
  deadlockDetector.registerNode("lock-B", "lock", "held");

  // Record wait relationships
  deadlockDetector.recordHold("task-1", "lock-A");
  deadlockDetector.recordHold("task-2", "lock-B");
  deadlockDetector.recordWait("task-1", "lock-B"); // Task 1 waits for lock B
  deadlockDetector.recordWait("task-2", "lock-A"); // Task 2 waits for lock A (deadlock!)

  // Export deadlock graph
  const deadlockGraph = deadlockDetector.exportAsMermaid();
  console.log("Deadlock graph (Mermaid):");
  console.log(deadlockGraph);

  // =============================================================================
  // 10. EXPORT TRACE DATA
  // =============================================================================

  // Export as Mermaid diagram
  const flowTracker = channelTracer.getFlowTracker();
  const mermaidDiagrams = flowTracker.exportAsMermaid();
  console.log("Message flow diagrams:", mermaidDiagrams);

  // Export complete trace data
  const traceData = exportTraceData(
    flowTracker,
    deadlockDetector,
    "json"
  );
  console.log("Complete trace data:", JSON.stringify(traceData, null, 2));

  // Keep running until shutdown
  await shutdown.shutdownComplete;
}

// Mock tracer for demo
const tracer = {
  startSpan: (name: string, options?: unknown, ctx?: unknown) => ({
    spanContext: () => ({ traceId: "demo", spanId: Math.random().toString(36) }),
    setAttributes: () => undefined,
    addLink: () => undefined,
    recordException: () => undefined,
    setStatus: () => undefined,
    end: () => undefined,
  }),
} as unknown as import("@opentelemetry/api").Tracer;

const cacheProvider = {
  get: async <T>(key: string): Promise<T | null> => null,
  set: async <T>(key: string, value: T, ttl?: number) => undefined,
  delete: async (key: string) => undefined,
  has: async (key: string) => false,
  clear: async () => undefined,
  keys: async (pattern?: string) => [],
};

// Helper functions for demo
function take<T>(iterable: AsyncIterable<T>, n: number): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      let count = 0;
      for await (const item of iterable) {
        if (count >= n) break;
        yield item;
        count++;
      }
    },
  };
}

function interval(ms: number): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      let count = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, ms));
        yield count++;
      }
    },
  };
}

// Import TraceVisualizer
import { TraceVisualizer, exportTraceData } from "@go-go-scope/plugin-opentelemetry";

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
