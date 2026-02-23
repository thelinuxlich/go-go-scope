# @go-go-scope/adapter-hono

Hono adapter for go-go-scope - lightweight middleware for edge runtimes.

## Installation

```bash
npm install @go-go-scope/adapter-hono hono
```

## Usage

```typescript
import { Hono } from 'hono'
import { goGoScope, getScope } from '@go-go-scope/adapter-hono'

const app = new Hono()
app.use(goGoScope({ metrics: true }))

app.get('/users/:id', async (c) => {
  const scope = getScope(c)
  const [err, user] = await scope.task(
    () => fetchUser(c.req.param('id')),
    { retry: 'exponential' }
  )

  if (err) {
    return c.json({ error: err.message }, 500)
  }
  return c.json(user)
})
```

## License

MIT
