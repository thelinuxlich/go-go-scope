# @go-go-scope/persistence-sqlite-bun

Bun-native SQLite persistence adapter for go-go-scope using `bun:sqlite`. This adapter provides optimal performance when running under Bun by leveraging its native SQLite implementation.

## Installation

```bash
# For Bun projects
bun add @go-go-scope/persistence-sqlite-bun
```

## Usage

```typescript
import { Database } from 'bun:sqlite'
import { scope } from 'go-go-scope'
import { BunSQLiteAdapter } from '@go-go-scope/persistence-sqlite-bun'

// Create a database (in-memory or file-based)
const db = new Database(':memory:')
// or: const db = new Database('/path/to/app.db')

// Create the adapter
const persistence = new BunSQLiteAdapter(db, { 
  keyPrefix: 'myapp:' // optional prefix for keys
})

// Use with scope
await using s = scope({ persistence })

// Acquire distributed lock
const lock = await s.acquireLock('resource:123', 30000)
if (!lock) {
  throw new Error('Could not acquire lock')
}

// Lock automatically expires after TTL
// Optional: release early
await lock.release()
```

## Features

- **Distributed Locks**: In-memory with TTL support
- **Circuit Breaker State**: Persistent state storage
- **Native Performance**: Uses Bun's `bun:sqlite` for maximum speed
- **API Compatibility**: Same interface as other persistence adapters

## Why Use This Adapter?

| Feature | `sqlite3` | `bun:sqlite` (this adapter) |
|---------|-----------|----------------------------|
| Performance | Good | **Excellent** |
| Bun-native | No | **Yes** |
| Bundle size | Larger | **Smaller** |
| Dependencies | Native bindings | **Built-in** |

## API

### Constructor

```typescript
new BunSQLiteAdapter(db: Database, options?: { keyPrefix?: string })
```

- `db`: Bun SQLite Database instance
- `options.keyPrefix`: Optional prefix for all keys

### Methods

See the main [go-go-scope documentation](../../docs) for full persistence API details.

## Testing

```bash
# Run Bun compatibility tests
cd packages/go-go-scope
bun test tests/bun-compatibility.test.ts
```

## License

MIT
