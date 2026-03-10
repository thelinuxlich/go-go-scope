# adapter-express API Reference

> Auto-generated documentation for adapter-express

## Table of Contents

- [Functions](#Functions)
  - [goGoScope](#gogoscope)
  - [closeScope](#closescope)

## Functions

### goGoScope

```typescript
function goGoScope(app: Application, options: ExpressGoGoScopeOptions = {}): RequestHandler
```

Express middleware for go-go-scope integration @example ```typescript import express from 'express' import { goGoScope } from '@go-go-scope/adapter-express' const app = express() app.use(goGoScope(app, { metrics: true })) app.get('/users/:id', async (req, res) => {   const [err, user] = await req.scope.task(     () => fetchUser(req.params.id),     { retry: 'exponential' }   )   if (err) {     return res.status(500).json({ error: err.message })   }   res.json(user) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `app` | `Application` |  |
| `options` (optional) | `ExpressGoGoScopeOptions` |  |

**Returns:** `RequestHandler`

**Examples:**

```typescript
import express from 'express'
import { goGoScope } from '@go-go-scope/adapter-express'

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
```

*Source: [index.ts:58](packages/adapter-express/src/index.ts#L58)*

---

### closeScope

```typescript
function closeScope(app: Application): Promise<void>
```

Graceful shutdown helper for Express applications Disposes the root scope when the server is closing @example ```typescript process.on('SIGTERM', async () => {   await closeScope(app)   server.close() }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `app` | `Application` |  |

**Returns:** `Promise<void>`

**Examples:**

```typescript
process.on('SIGTERM', async () => {
  await closeScope(app)
  server.close()
})
```

*Source: [index.ts:104](packages/adapter-express/src/index.ts#L104)*

---

