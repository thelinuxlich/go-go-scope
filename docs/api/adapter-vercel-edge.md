# adapter-vercel-edge API Reference

> Auto-generated documentation for adapter-vercel-edge

## Table of Contents

- [Functions](#Functions)
  - [vercelEdgeGoGoScope](#verceledgegogoscope)
  - [nextEdgeHandler](#nextedgehandler)
  - [getScope](#getscope)
  - [getEdgeConfig](#getedgeconfig)
  - [kvGet](#kvget)
- [Interfaces](#Interfaces)
  - [RateLimitOptions](#ratelimitoptions)

## Functions

### vercelEdgeGoGoScope

```typescript
function vercelEdgeGoGoScope(options: VercelEdgeGoGoScopeOptions = {}): <T>(
	request: VercelEdgeRequest,
	handler: (scope: Scope, request: VercelEdgeRequest) => Promise<T>,
) => Promise<T>
```

Vercel Edge middleware for go-go-scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `VercelEdgeGoGoScopeOptions` |  |

**Returns:** `<T>(
	request: VercelEdgeRequest,
	handler: (scope: Scope, request: VercelEdgeRequest) => Promise<T>,
) => Promise<T>`

**Examples:**

```typescript
// middleware.ts
import { vercelEdgeGoGoScope } from '@go-go-scope/adapter-vercel-edge'
import { NextResponse } from 'next/server'

const middleware = vercelEdgeGoGoScope({
  name: 'my-edge-app',
  timeout: 30000
})

export default async function edgeMiddleware(request: Request) {
  return middleware(request, async (scope) => {
    const [err, data] = await scope.task(() => fetchData())
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export const config = {
  runtime: 'edge',
}
```

*Source: [index.ts:60](packages/adapter-vercel-edge/src/index.ts#L60)*

---

### nextEdgeHandler

```typescript
function nextEdgeHandler<T>(handler: (request: Request, scope: Scope) => Promise<T>, opts: VercelEdgeGoGoScopeOptions = {}): (request: Request) => Promise<T>
```

Helper for Next.js Edge API Routes

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(request: Request, scope: Scope) => Promise<T>` |  |
| `opts` (optional) | `VercelEdgeGoGoScopeOptions` |  |

**Returns:** `(request: Request) => Promise<T>`

**Examples:**

```typescript
// app/api/users/route.ts
import { nextEdgeHandler } from '@go-go-scope/adapter-vercel-edge'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export const GET = nextEdgeHandler(async (request, scope) => {
  const [err, users] = await scope.task(() => fetchUsers())
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json(users)
})
```

*Source: [index.ts:120](packages/adapter-vercel-edge/src/index.ts#L120)*

---

### getScope

```typescript
function getScope(event: { scope?: Scope }): Scope
```

Helper to get the current scope from the request context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `{ scope?: Scope }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
import { getScope } from '@go-go-scope/adapter-vercel-edge'

export const handler = async (request: Request) => {
  const scope = getScope(request as any)
  const [err, data] = await scope.task(() => fetchData())
  return new Response(JSON.stringify(data))
}
```

*Source: [index.ts:146](packages/adapter-vercel-edge/src/index.ts#L146)*

---

### getEdgeConfig

```typescript
function getEdgeConfig<T = unknown>(scope: Scope<any>, _key: string): Promise<[Error | undefined, T | undefined]>
```

Edge Config integration helper Fetches config with automatic retry and caching

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<any>` |  |
| `_key` | `string` |  |

**Returns:** `Promise<[Error | undefined, T | undefined]>`

**Examples:**

```typescript
import { getEdgeConfig } from '@go-go-scope/adapter-vercel-edge'

export const GET = nextEdgeHandler(async (request, scope) => {
  const [err, config] = await getEdgeConfig(scope, 'my-feature-flag')
  if (err) return new Response('Config error', { status: 500 })
  return new Response(JSON.stringify(config))
})
```

*Source: [index.ts:171](packages/adapter-vercel-edge/src/index.ts#L171)*

---

### kvGet

```typescript
function kvGet<T = unknown>(scope: Scope<any>, _key: string): Promise<[Error | undefined, T | undefined]>
```

KV integration helper for Vercel KV

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<any>` |  |
| `_key` | `string` |  |

**Returns:** `Promise<[Error | undefined, T | undefined]>`

**Examples:**

```typescript
import { kvGet, kvSet } from '@go-go-scope/adapter-vercel-edge'

export const GET = nextEdgeHandler(async (request, scope) => {
  const [err, data] = await kvGet(scope, 'user:123')
  return new Response(JSON.stringify(data))
})
```

*Source: [index.ts:196](packages/adapter-vercel-edge/src/index.ts#L196)*

---

## Interfaces

### RateLimitOptions

```typescript
interface RateLimitOptions
```

Rate limiting helper for Edge functions

**Examples:**

```typescript
import { rateLimit } from '@go-go-scope/adapter-vercel-edge'

export const GET = nextEdgeHandler(async (request, scope) => {
  const [err, allowed] = await rateLimit(scope, request.ip || 'anonymous', {
    maxRequests: 100,
    windowMs: 60000
  })

  if (!allowed) {
    return new Response('Rate limited', { status: 429 })
  }

  return new Response('Success')
})
```

*Source: [index.ts:241](packages/adapter-vercel-edge/src/index.ts#L241)*

---

