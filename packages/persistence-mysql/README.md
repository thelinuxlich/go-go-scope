# @go-go-scope/persistence-mysql

MySQL/MariaDB persistence adapter for go-go-scope - provides distributed locks and circuit breaker state persistence.

## Installation

```bash
npm install @go-go-scope/persistence-mysql mysql2
```

## Usage

```typescript
import { createPool } from 'mysql2/promise'
import { MySQLAdapter } from '@go-go-scope/persistence-mysql'
import { scope } from 'go-go-scope'

const pool = createPool({ uri: process.env.DATABASE_URL })
const persistence = new MySQLAdapter(pool, { keyPrefix: 'myapp:' })

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
