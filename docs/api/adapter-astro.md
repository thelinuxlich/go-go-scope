# adapter-astro API Reference

> Auto-generated documentation for adapter-astro

## Table of Contents

- [Functions](#Functions)
  - [astroGoGoScope](#astrogogoscope)
  - [getScope](#getscope)
  - [defineScopedRoute](#definescopedroute)
  - [getServerScope](#getserverscope)

## Functions

### astroGoGoScope

```typescript
function astroGoGoScope(options: AstroGoGoScopeOptions = {}): MiddlewareHandler
```

Astro middleware for go-go-scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `AstroGoGoScopeOptions` |  |

**Returns:** `MiddlewareHandler`

**Examples:**

```typescript
// src/middleware.ts
import { astroGoGoScope } from '@go-go-scope/adapter-astro'

export const onRequest = astroGoGoScope({
  name: 'my-astro-app',
  timeout: 30000
})
```

```typescript
// src/pages/api/users/[id].ts
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const s = locals.scope!

  const [err, user] = await s.task(
    () => fetchUser(params.id!),
    { retry: 'exponential', timeout: 5000 }
  )

  if (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

*Source: [index.ts:68](packages/adapter-astro/src/index.ts#L68)*

---

### getScope

```typescript
function getScope(context: APIContext | { locals: { scope?: Scope } }): Scope
```

Helper to get the current scope from the API context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `context` | `APIContext | { locals: { scope?: Scope } }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
export const GET: APIRoute = async (context) => {
  const s = getScope(context)
  const [err, data] = await s.task(() => fetchData())
  // ...
}
```

*Source: [index.ts:120](packages/adapter-astro/src/index.ts#L120)*

---

### defineScopedRoute

```typescript
function defineScopedRoute<T>(handler: (context: APIContext, scope: Scope) => Promise<T>): (context: APIContext) => Promise<T>
```

Helper to create an API route with automatic scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(context: APIContext, scope: Scope) => Promise<T>` |  |

**Returns:** `(context: APIContext) => Promise<T>`

**Examples:**

```typescript
// src/pages/api/users.ts
import { defineScopedRoute } from '@go-go-scope/adapter-astro'
import type { APIRoute } from 'astro'

export const GET: APIRoute = defineScopedRoute(async (context, scope) => {
  const [err, users] = await scope.task(() => fetchUsers())
  if (err) return new Response(null, { status: 500 })
  return Response.json(users)
})
```

*Source: [index.ts:146](packages/adapter-astro/src/index.ts#L146)*

---

### getServerScope

```typescript
function getServerScope(astro: { locals?: { scope?: Scope } }): Scope
```

Server-side rendering helper for Astro pages Provides scope access during SSR

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `astro` | `{ locals?: { scope?: Scope } }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
// src/pages/users.astro
---
import { getServerScope } from '@go-go-scope/adapter-astro'

const s = getServerScope(Astro)
const [err, users] = await s.task(() => fetchUsers())
---
```

*Source: [index.ts:170](packages/adapter-astro/src/index.ts#L170)*

---

