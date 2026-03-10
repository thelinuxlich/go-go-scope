# adapter-fresh API Reference

> Auto-generated documentation for adapter-fresh

## Table of Contents

- [Functions](#Functions)
  - [freshGoGoScope](#freshgogoscope)
  - [defineRouteHandler](#defineroutehandler)
  - [getScope](#getscope)
  - [withIslandScope](#withislandscope)
  - [createSafeHandler](#createsafehandler)
  - [createJsonHandler](#createjsonhandler)

## Functions

### freshGoGoScope

```typescript
function freshGoGoScope(options: FreshGoGoScopeOptions = {}): (req: Request, ctx: FreshContext) => Promise<Response>
```

Fresh middleware for go-go-scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `FreshGoGoScopeOptions` |  |

**Returns:** `(req: Request, ctx: FreshContext) => Promise<Response>`

**Examples:**

```typescript
// routes/_middleware.ts
import { freshGoGoScope } from '@go-go-scope/adapter-fresh'

export const handler = freshGoGoScope({
  name: 'my-fresh-app',
  timeout: 30000
})
```

*Source: [index.ts:54](packages/adapter-fresh/src/index.ts#L54)*

---

### defineRouteHandler

```typescript
function defineRouteHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}): FreshHandlers
```

Helper to define a route handler with automatic scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handlers` | `{
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}` |  |

**Returns:** `FreshHandlers`

**Examples:**

```typescript
// routes/api/users.ts
import { defineRouteHandler } from '@go-go-scope/adapter-fresh'

export const handler = defineRouteHandler({
  async GET(req, ctx, scope) {
    const [err, users] = await scope.task(() => fetchUsers())
    if (err) return new Response('Error', { status: 500 })
    return Response.json(users)
  },
  async POST(req, ctx, scope) {
    const [err, user] = await scope.task(() => createUser(req))
    if (err) return new Response('Error', { status: 500 })
    return Response.json(user, { status: 201 })
  }
})
```

*Source: [index.ts:117](packages/adapter-fresh/src/index.ts#L117)*

---

### getScope

```typescript
function getScope(ctx: FreshContext | { scope?: Scope }): Scope
```

Helper to get the current scope from Fresh context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ctx` | `FreshContext | { scope?: Scope }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
// routes/api/data.ts
import { getScope } from '@go-go-scope/adapter-fresh'

export const handler = {
  async GET(req, ctx) {
    const scope = getScope(ctx)
    const [err, data] = await scope.task(() => fetchData())
    return Response.json(data)
  }
}
```

*Source: [index.ts:162](packages/adapter-fresh/src/index.ts#L162)*

---

### withIslandScope

```typescript
function withIslandScope<T>(handler: (req: Request, scope: Scope<any>) => Promise<T>, opts: { name?: string; timeout?: number } = {}): Promise<T>
```

Helper for Fresh Islands with scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(req: Request, scope: Scope<any>) => Promise<T>` |  |
| `opts` (optional) | `{ name?: string; timeout?: number }` |  |

**Returns:** `Promise<T>`

**Examples:**

```typescript
// islands/Counter.tsx
import { withIslandScope } from '@go-go-scope/adapter-fresh'

export const handler = withIslandScope(async (req, scope) => {
  const [err, count] = await scope.task(() => getCount())
  return { count: count || 0 }
})
```

*Source: [index.ts:186](packages/adapter-fresh/src/index.ts#L186)*

---

### createSafeHandler

```typescript
function createSafeHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}): FreshHandlers
```

Helper for Fresh handlers with automatic error handling

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handlers` | `{
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<Response> | Response;
}` |  |

**Returns:** `FreshHandlers`

**Examples:**

```typescript
// routes/api/users.ts
import { createSafeHandler } from '@go-go-scope/adapter-fresh'

export const handler = createSafeHandler({
  async GET(req, ctx, scope) {
    const users = await scope.task(() => fetchUsers())
    return Response.json(users[1]) // users[1] is the data
  }
})
```

*Source: [index.ts:216](packages/adapter-fresh/src/index.ts#L216)*

---

### createJsonHandler

```typescript
function createJsonHandler(handlers: {
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
}): FreshHandlers
```

Helper to create a JSON API response handler

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handlers` | `{
	GET?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	POST?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PUT?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	DELETE?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
	PATCH?: (req: Request, ctx: FreshContext, scope: Scope<any>) => Promise<unknown>;
}` |  |

**Returns:** `FreshHandlers`

**Examples:**

```typescript
// routes/api/users.ts
import { createJsonHandler } from '@go-go-scope/adapter-fresh'

export const handler = createJsonHandler({
  async GET(req, ctx, scope) {
    const [err, users] = await scope.task(() => fetchUsers())
    if (err) throw err
    return users
  },
  async POST(req, ctx, scope) {
    const body = await req.json()
    const [err, user] = await scope.task(() => createUser(body))
    if (err) throw err
    return { data: user, status: 201 }
  }
})
```

*Source: [index.ts:273](packages/adapter-fresh/src/index.ts#L273)*

---

