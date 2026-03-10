# adapter-hono API Reference

> Auto-generated documentation for adapter-hono

## Table of Contents

- [Functions](#Functions)
  - [goGoScope](#gogoscope)
  - [getScope](#getscope)
  - [getRootScope](#getrootscope)

## Functions

### goGoScope

```typescript
function goGoScope(options: HonoGoGoScopeOptions = {}): MiddlewareHandler
```

Hono middleware for go-go-scope integration @example ```typescript import { Hono } from 'hono' import { goGoScope, getScope } from '@go-go-scope/adapter-hono' const app = new Hono() app.use(goGoScope({ metrics: true })) app.get('/users/:id', async (c) => {   const scope = getScope(c)   const [err, user] = await scope.task(     () => fetchUser(c.req.param('id')),     { retry: 'exponential' }   )   if (err) {     return c.json({ error: err.message }, 500)   }   return c.json(user) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `HonoGoGoScopeOptions` |  |

**Returns:** `MiddlewareHandler`

**Examples:**

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

*Source: [index.ts:54](packages/adapter-hono/src/index.ts#L54)*

---

### getScope

```typescript
function getScope(c: Context): Scope<Record<string, unknown>>
```

Get the request-scoped scope from Hono context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `c` | `Context` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:94](packages/adapter-hono/src/index.ts#L94)*

---

### getRootScope

```typescript
function getRootScope(c: Context): Scope<Record<string, unknown>>
```

Get the root application scope from Hono context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `c` | `Context` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:101](packages/adapter-hono/src/index.ts#L101)*

---

