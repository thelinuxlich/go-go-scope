# adapter-koa API Reference

> Auto-generated documentation for adapter-koa

## Table of Contents

- [Functions](#Functions)
  - [koaGoGoScope](#koagogoscope)
  - [getScope](#getscope)
  - [getRootScope](#getrootscope)
  - [closeKoaScope](#closekoascope)

## Functions

### koaGoGoScope

```typescript
function koaGoGoScope(options: KoaGoGoScopeOptions = {}): Middleware
```

Koa middleware for go-go-scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `KoaGoGoScopeOptions` |  |

**Returns:** `Middleware`

**Examples:**

```typescript
import Koa from 'koa'
import { koaGoGoScope } from '@go-go-scope/adapter-koa'

const app = new Koa()
app.use(koaGoGoScope({ name: 'my-api', metrics: true }))

app.use(async (ctx) => {
  const scope = ctx.state.scope
  const [err, user] = await scope.task(
    () => fetchUser(ctx.params.id),
    { retry: 'exponential' }
  )

  if (err) {
    ctx.status = 500
    ctx.body = { error: err.message }
    return
  }
  ctx.body = user
})
```

*Source: [index.ts:59](packages/adapter-koa/src/index.ts#L59)*

---

### getScope

```typescript
function getScope(ctx: Context): Scope<Record<string, unknown>>
```

Get the request-scoped scope from Koa context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ctx` | `Context` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:106](packages/adapter-koa/src/index.ts#L106)*

---

### getRootScope

```typescript
function getRootScope(ctx: Context): Scope<Record<string, unknown>>
```

Get the root application scope from Koa context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ctx` | `Context` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:113](packages/adapter-koa/src/index.ts#L113)*

---

### closeKoaScope

```typescript
function closeKoaScope(): Promise<void>
```

Graceful shutdown helper for Koa applications Disposes the root scope when the server is closing

**Returns:** `Promise<void>`

**Examples:**

```typescript
process.on('SIGTERM', async () => {
  await closeKoaScope()
  server.close()
})
```

*Source: [index.ts:129](packages/adapter-koa/src/index.ts#L129)*

---

