# @go-go-scope/adapter-express

Express adapter for go-go-scope - provides request-scoped structured concurrency for Express applications.

## Installation

```bash
npm install @go-go-scope/adapter-express express
```

## Usage

```typescript
import express from 'express'
import { goGoScope, closeScope } from '@go-go-scope/adapter-express'

const app = express()
app.use(goGoScope(app, { metrics: true }))

app.get('/users/:id', async (req, res) => {
  const [err, user] = await req.scope.task(
    () => fetchUser(req.params.id),
    { retry: 'exponential' }
  )

  if (err) {
    return res.status(500).json({ error: err.message })
  }
  res.json(user)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeScope(app)
  server.close()
})
```

## License

MIT
