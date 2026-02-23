# @go-go-scope/adapter-fastify

Fastify adapter for go-go-scope - provides request-scoped structured concurrency for Fastify applications.

## Installation

```bash
npm install @go-go-scope/adapter-fastify fastify fastify-plugin
```

## Usage

```typescript
import fastify from 'fastify'
import { fastifyGoGoScope } from '@go-go-scope/adapter-fastify'

const app = fastify()
await app.register(fastifyGoGoScope, { metrics: true })

app.get('/users/:id', async (request, reply) => {
  const [err, user] = await request.scope.task(
    () => fetchUser(request.params.id),
    { retry: 'exponential', timeout: 5000 }
  )

  if (err) {
    return reply.code(500).send({ error: err.message })
  }
  return user
})
```

## License

MIT
