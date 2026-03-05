# @go-go-scope/persistence-deno-kv

Deno KV persistence adapter for go-go-scope. Provides distributed locks, circuit breaker state, and caching using Deno's native KV store.

## Installation

```bash
deno add @go-go-scope/persistence-deno-kv
```

## Usage

### Basic Setup

```typescript
import { scope } from "go-go-scope";
import { DenoKVAdapter } from "@go-go-scope/persistence-deno-kv";

// Open Deno KV
const kv = await Deno.openKv();

// Create adapter
const persistence = new DenoKVAdapter(kv, { 
  keyPrefix: "myapp:" 
});

// Use with scope
await using s = scope({ persistence });

// Acquire a lock
const lock = await s.acquireLock("resource:123", 30000);
if (!lock) {
  throw new Error("Could not acquire lock");
}

// Lock automatically expires after TTL
// Optional: release early with await lock.release()
```

### Distributed Locking

```typescript
const kv = await Deno.openKv();
const persistence = new DenoKVAdapter(kv);

await using s = scope({ persistence });

// Try to acquire lock
const lock = await s.acquireLock("payment:123", 10000);
if (lock) {
  try {
    // Process payment
    await processPayment(123);
  } finally {
    await lock.release();
  }
} else {
  console.log("Payment already being processed");
}
```

### Circuit Breaker State

```typescript
const kv = await Deno.openKv();
const persistence = new DenoKVAdapter(kv);

await using s = scope({ 
  persistence,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
  }
});

// Circuit breaker state is persisted to Deno KV
// and shared across all instances using the same KV
```

### Caching

```typescript
const kv = await Deno.openKv();
const persistence = new DenoKVAdapter(kv);

await using s = scope({ persistence });

// Cache with TTL
await s.setCache("user:123", userData, 60000);

// Retrieve from cache
const cached = await s.getCache("user:123");
```

## Features

- **Distributed Locks**: Atomic lock acquisition with TTL
- **Circuit Breaker State**: Persisted state across instances
- **Caching**: TTL-based caching with automatic expiration
- **Atomic Operations**: Uses Deno KV atomic operations for consistency
- **Key Namespacing**: Prefix support for multi-tenant applications

## Requirements

- Deno >= 1.40.0
- `--unstable-kv` flag (Deno KV is currently unstable)

## Testing

```bash
deno test --allow-all --unstable-kv tests/
```

## License

MIT
