# @go-go-scope/persistence-dynamodb

DynamoDB persistence adapter for go-go-scope - provides distributed locks, circuit breaker state persistence, and caching using AWS DynamoDB.

## Features

- **Single-table design** - Efficient use of DynamoDB with partition key (`pk`) and sort key (`sk`)
- **Native TTL support** - Automatic expiration using DynamoDB's built-in TTL feature
- **Conditional writes** - Atomic compare-and-swap for lock acquisition
- **Lock provider** - Distributed locking with acquire, extend, and release operations
- **Circuit breaker state** - Persistent circuit breaker state across processes
- **Cache provider** - Distributed caching with get, set, delete, and clear operations

## Table Schema

The adapter uses a single-table design:

| Attribute | Type | Description |
|-----------|------|-------------|
| `pk` | String | Partition key: `LOCK#<key>`, `CB#<key>`, or `CACHE#<key>` |
| `sk` | String | Sort key: Always `METADATA` |
| `data` | Map | JSON serialized data |
| `expiresAt` | Number | Unix timestamp for DynamoDB TTL |
| `owner` | String | Lock owner identifier |
| `version` | Number | Optimistic locking version |

### Required Table Configuration

```json
{
  "TableName": "your-table",
  "KeySchema": [
    { "AttributeName": "pk", "KeyType": "HASH" },
    { "AttributeName": "sk", "KeyType": "RANGE" }
  ],
  "AttributeDefinitions": [
    { "AttributeName": "pk", "AttributeType": "S" },
    { "AttributeName": "sk", "AttributeType": "S" }
  ],
  "TimeToLiveSpecification": {
    "AttributeName": "expiresAt",
    "Enabled": true
  }
}
```

## Installation

```bash
npm install @go-go-scope/persistence-dynamodb @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Usage

### Basic Setup

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoDBAdapter } from '@go-go-scope/persistence-dynamodb'
import { scope } from 'go-go-scope'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1'
}))

const persistence = new DynamoDBAdapter(client, 'my-table', {
  keyPrefix: 'myapp:'
})

await using s = scope({ persistence })

// Acquire a lock with 30 second TTL
const lock = await s.acquireLock('resource:123', 30000)
if (!lock) {
  throw new Error('Could not acquire lock')
}

// Use the lock
try {
  // Do work...
} finally {
  await lock.release()
}
```

### Caching

```typescript
const cache = new DynamoDBAdapter(client, 'my-table')

// Set a value with TTL
await cache.set('user:123', { name: 'John' }, 60000) // 60 seconds

// Get a value
const user = await cache.get('user:123')

// Check if key exists
const exists = await cache.has('user:123')

// Delete a key
await cache.delete('user:123')

// Clear all cached values
await cache.clear()

// Get all keys
const keys = await cache.keys()
const patternKeys = await cache.keys('user:*')
```

### Circuit Breaker

```typescript
await using s = scope({
  persistence,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000
  }
})

// Circuit breaker state is automatically persisted to DynamoDB
const [err, result] = await s.task(() => fetchData())
```

## API Reference

### Constructor

```typescript
new DynamoDBAdapter(
  client: DynamoDBDocumentClient,
  tableName: string,
  options?: PersistenceAdapterOptions
)
```

### LockProvider Methods

- `acquire(key: string, ttl: number, owner?: string): Promise<LockHandle | null>`
- `extend(key: string, ttl: number, owner: string): Promise<boolean>`
- `forceRelease(key: string): Promise<void>`

### CircuitBreakerStateProvider Methods

- `getState(key: string): Promise<CircuitBreakerPersistedState | null>`
- `setState(key: string, state: CircuitBreakerPersistedState): Promise<void>`
- `recordFailure(key: string, maxFailures: number): Promise<number>`
- `recordSuccess(key: string): Promise<void>`

### CacheProvider Methods

- `get<T>(key: string): Promise<T | null>`
- `set<T>(key: string, value: T, ttl?: number): Promise<void>`
- `delete(key: string): Promise<void>`
- `has(key: string): Promise<boolean>`
- `clear(): Promise<void>`
- `keys(pattern?: string): Promise<string[]>`

## License

MIT
