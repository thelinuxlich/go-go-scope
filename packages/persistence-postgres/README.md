# @go-go-scope/persistence-postgres

PostgreSQL persistence adapter for go-go-scope - provides distributed locks and circuit breaker state persistence.

## Installation

```bash
npm install @go-go-scope/persistence-postgres pg
```

## Usage

```typescript
import { Pool } from 'pg'
import { PostgresAdapter } from '@go-go-scope/persistence-postgres'
import { scope } from 'go-go-scope'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const persistence = new PostgresAdapter(pool, { keyPrefix: 'myapp:' })

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
