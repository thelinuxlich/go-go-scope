# @go-go-scope/persistence-sqlite

SQLite persistence adapter for go-go-scope - provides distributed locks and circuit breaker state persistence.

## Installation

```bash
npm install @go-go-scope/persistence-sqlite sqlite3
```

## Usage

```typescript
import sqlite3 from 'sqlite3'
import { SQLiteAdapter } from '@go-go-scope/persistence-sqlite'
import { scope } from 'go-go-scope'

const db = new sqlite3.Database('/tmp/app.db')
const persistence = new SQLiteAdapter(db, { keyPrefix: 'myapp:' })

await using s = scope({ persistence })

// Acquire a lock with 30 second TTL
const lock = await s.acquireLock('resource:123', 30000)
if (!lock) {
  throw new Error('Could not acquire lock')
}

// Use the lock
await lock.release()
```

## License

MIT
