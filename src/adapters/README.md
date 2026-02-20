# go-go-scope Framework Adapters

Official adapters for integrating go-go-scope with popular web frameworks.

## Installation

Install the peer dependencies for your framework:

```bash
# Fastify
npm install go-go-scope fastify fastify-plugin

# Express
npm install go-go-scope express

# NestJS
npm install go-go-scope @nestjs/common

# Hono
npm install go-go-scope hono

# Elysia
npm install go-go-scope elysia
```

## Fastify

```typescript
import fastify from 'fastify'
import { fastifyGoGoScope } from 'go-go-scope/adapters/fastify'

const app = fastify()
await app.register(fastifyGoGoScope, { metrics: true })

app.get('/users/:id', async (request, reply) => {
  const [err, user] = await request.scope.task(
    () => fetchUser(request.params.id),
    { retry: 'exponential', timeout: 5000 }
  )
  
  if (err) return reply.code(500).send({ error: err.message })
  return user
})
```

## Express

```typescript
import express from 'express'
import { goGoScope, closeScope } from 'go-go-scope/adapters/express'

const app = express()
app.use(goGoScope(app, { metrics: true }))

app.get('/users/:id', async (req, res) => {
  const [err, user] = await req.scope.task(
    () => fetchUser(req.params.id),
    { retry: 'exponential' }
  )
  
  if (err) return res.status(500).json({ error: err.message })
  res.json(user)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeScope(app)
  server.close()
})
```

## NestJS

```typescript
import { Module, Controller, Get, Param, Injectable } from '@nestjs/common'
import { GoGoScopeModule, Task, GoGoRequestScopeService } from 'go-go-scope/adapters/nestjs'

@Module({
  imports: [GoGoScopeModule.forRoot({ metrics: true })],
  providers: [UserService],
  controllers: [UserController],
})
class AppModule {}

@Injectable()
class UserService {
  constructor(private scopeService: GoGoRequestScopeService) {}
  
  async getUser(id: string) {
    const scope = this.scopeService.getScope()
    const [err, user] = await scope.task(
      () => fetchUser(id),
      { retry: 'exponential', timeout: 5000 }
    )
    if (err) throw err
    return user
  }
}

@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
  
  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.getUser(id)
  }
}
```

## Hono

```typescript
import { Hono } from 'hono'
import { goGoScope, getScope } from 'go-go-scope/adapters/hono'

const app = new Hono()
app.use(goGoScope({ metrics: true }))

app.get('/users/:id', async (c) => {
  const scope = getScope(c)
  const [err, user] = await scope.task(
    () => fetchUser(c.req.param('id')),
    { retry: 'exponential' }
  )
  
  if (err) return c.json({ error: err.message }, 500)
  return c.json(user)
})
```

## Elysia

```typescript
import { Elysia } from 'elysia'
import { goGoScope } from 'go-go-scope/adapters/elysia'

const app = new Elysia()
  .use(goGoScope({ metrics: true }))
  .get('/users/:id', async ({ scope, params }) => {
    const [err, user] = await scope.task(
      () => fetchUser(params.id),
      { retry: 'exponential' }
    )
    
    if (err) return { error: err.message }
    return user
  })
```

## Common Patterns

### Request-Scoped Tasks
All adapters follow the same pattern:
1. Create a root scope for the application
2. Create child scopes for each request
3. Dispose request scopes after response

### Accessing the Scope

Each framework makes the request scope available differently:

| Framework | Access Pattern |
|-----------|---------------|
| Fastify | `request.scope` |
| Express | `req.scope` |
| NestJS | `GoGoRequestScopeService.getScope()` |
| Hono | `getScope(c)` or `c.get('scope')` |
| Elysia | `scope` (from context) |

### Error Handling
```typescript
const [err, result] = await request.scope.task(() => fetchData())
if (err) {
  return response.status(500).json({ error: err.message })
}
return response.json(result)
```

### Retry Strategies
```typescript
await request.scope.task(
  () => fetchData(),
  { retry: 'exponential', timeout: 5000 }
)
```

### Parallel Execution
```typescript
const results = await request.scope.parallel([
  () => fetchUser(1),
  () => fetchUser(2),
  () => fetchUser(3),
], { concurrency: 2 })

// Results are [error, value] tuples
for (const [err, user] of results) {
  if (err) console.error('Failed:', err)
  else console.log('User:', user)
}
```

### Batch Endpoints
```typescript
app.post('/batch', async (request, reply) => {
  const items = request.body as string[]
  
  const results = await request.scope.parallel(
    items.map(id => () => fetchUser(id)),
    { concurrency: 5, continueOnError: true }
  )
  
  return results.map(([err, user]) => 
    err ? { error: err.message } : user
  )
})
```