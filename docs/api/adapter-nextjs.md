# adapter-nextjs API Reference

> Auto-generated documentation for adapter-nextjs

## Table of Contents

- [Functions](#Functions)
  - [withScope](#withscope)
  - [withScopeEdge](#withscopeedge)
  - [withScopeServer](#withscopeserver)
  - [withScopeMiddleware](#withscopemiddleware)
  - [withScopeAndServices](#withscopeandservices)
  - [createRouteConfig](#createrouteconfig)
  - [errorResponse](#errorresponse)
  - [jsonResponse](#jsonresponse)
- [Classs](#Classs)
  - [NextJSRouteError](#nextjsrouteerror)
- [Interfaces](#Interfaces)
  - [NextJSContext](#nextjscontext)
  - [WithScopeOptions](#withscopeoptions)
- [Types](#Types)
  - [APIRouteHandler](#apiroutehandler)
  - [EdgeRouteHandler](#edgeroutehandler)

## Functions

### withScope

```typescript
function withScope<T extends Record<string, unknown> = Record<string, never>>(handler: APIRouteHandler<T>, options: WithScopeOptions<T> = {}): (req: NextRequest) => Promise<Response>
```

Wrap a Next.js API route handler with a scope @example ```typescript // app/api/users/route.ts import { withScope } from '@go-go-scope/adapter-nextjs' export const GET = withScope(async (req, { scope }) => {   const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))   if (err) return Response.json({ error: err.message }, { status: 500 })   return Response.json(users) }) // With custom options export const POST = withScope(   async (req, { scope }) => {     const [err, result] = await scope.task(() => createUser(req))     if (err) return Response.json({ error: err.message }, { status: 400 })     return Response.json(result, { status: 201 })   },   { timeout: 5000 } ) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `APIRouteHandler<T>` |  |
| `options` (optional) | `WithScopeOptions<T>` |  |

**Returns:** `(req: NextRequest) => Promise<Response>`

**Examples:**

```typescript
// app/api/users/route.ts
import { withScope } from '@go-go-scope/adapter-nextjs'

export const GET = withScope(async (req, { scope }) => {
  const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))
  if (err) return Response.json({ error: err.message }, { status: 500 })
  return Response.json(users)
})

// With custom options
export const POST = withScope(
  async (req, { scope }) => {
    const [err, result] = await scope.task(() => createUser(req))
    if (err) return Response.json({ error: err.message }, { status: 400 })
    return Response.json(result, { status: 201 })
  },
  { timeout: 5000 }
)
```

*Source: [index.ts:119](packages/adapter-nextjs/src/index.ts#L119)*

---

### withScopeEdge

```typescript
function withScopeEdge<T extends Record<string, unknown> = Record<string, never>>(handler: EdgeRouteHandler<T>, options: WithScopeOptions<T> = {}): (req: Request) => Promise<Response>
```

Wrap a Next.js Edge route handler with a scope @example ```typescript // middleware.ts or edge route import { withScopeEdge } from '@go-go-scope/adapter-nextjs' export const config = {   runtime: 'edge', } export default withScopeEdge(async (req, { scope }) => {   const [err, result] = await scope.task(() => fetchEdgeData())   if (err) return new Response('Error', { status: 500 })   return new Response(JSON.stringify(result)) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `EdgeRouteHandler<T>` |  |
| `options` (optional) | `WithScopeOptions<T>` |  |

**Returns:** `(req: Request) => Promise<Response>`

**Examples:**

```typescript
// middleware.ts or edge route
import { withScopeEdge } from '@go-go-scope/adapter-nextjs'

export const config = {
  runtime: 'edge',
}

export default withScopeEdge(async (req, { scope }) => {
  const [err, result] = await scope.task(() => fetchEdgeData())
  if (err) return new Response('Error', { status: 500 })
  return new Response(JSON.stringify(result))
})
```

*Source: [index.ts:175](packages/adapter-nextjs/src/index.ts#L175)*

---

### withScopeServer

```typescript
function withScopeServer<T extends Record<string, unknown> = Record<string, never>, Props extends Record<string, unknown> = Record<string, never>>(component: (
		props: Props,
		context: NextJSContext<T>,
	) => Promise<JSX.Element> | JSX.Element, options: WithScopeOptions<T> = {}): (props: Props) => Promise<JSX.Element>
```

Server Component wrapper with scope @example ```typescript // app/users/page.tsx import { withScopeServer } from '@go-go-scope/adapter-nextjs' export default withScopeServer(async (searchParams, { scope }) => {   const [err, users] = await scope.task(() => fetchUsers())   if (err) return <Error message={err.message} />   return <UserList users={users} /> }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `component` | `(
		props: Props,
		context: NextJSContext<T>,
	) => Promise<JSX.Element> | JSX.Element` |  |
| `options` (optional) | `WithScopeOptions<T>` |  |

**Returns:** `(props: Props) => Promise<JSX.Element>`

**Examples:**

```typescript
// app/users/page.tsx
import { withScopeServer } from '@go-go-scope/adapter-nextjs'

export default withScopeServer(async (searchParams, { scope }) => {
  const [err, users] = await scope.task(() => fetchUsers())
  if (err) return <Error message={err.message} />
  return <UserList users={users} />
})
```

*Source: [index.ts:239](packages/adapter-nextjs/src/index.ts#L239)*

---

### withScopeMiddleware

```typescript
function withScopeMiddleware<T extends Record<string, unknown> = Record<string, never>>(handler: (
		req: NextRequest,
		context: NextJSContext<T>,
	) => Promise<Response> | Response, options: WithScopeOptions<T> = {}): (req: NextRequest) => Promise<Response>
```

Middleware wrapper with scope @example ```typescript // middleware.ts import { withScopeMiddleware } from '@go-go-scope/adapter-nextjs' import { NextResponse } from 'next/server' export default withScopeMiddleware(async (req, { scope }) => {   const [err, session] = await scope.task(() => validateSession(req))   if (err || !session) {     return NextResponse.redirect(new URL('/login', req.url))   }   return NextResponse.next() }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(
		req: NextRequest,
		context: NextJSContext<T>,
	) => Promise<Response> | Response` |  |
| `options` (optional) | `WithScopeOptions<T>` |  |

**Returns:** `(req: NextRequest) => Promise<Response>`

**Examples:**

```typescript
// middleware.ts
import { withScopeMiddleware } from '@go-go-scope/adapter-nextjs'
import { NextResponse } from 'next/server'

export default withScopeMiddleware(async (req, { scope }) => {
  const [err, session] = await scope.task(() => validateSession(req))
  if (err || !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
})
```

*Source: [index.ts:294](packages/adapter-nextjs/src/index.ts#L294)*

---

### withScopeAndServices

```typescript
function withScopeAndServices<T extends Record<string, unknown>>(services: T, handler: APIRouteHandler<T>, options: Omit<WithScopeOptions<T>, "services"> = {}): (req: NextRequest) => Promise<Response>
```

Higher-order function for route handlers with dependency injection @example ```typescript // With dependency injection const handler = withScopeAndServices(   { db: createDatabase() },   async (req, { scope }) => {     const db = scope.use('db')     const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))     return Response.json(users)   } ) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `services` | `T` |  |
| `handler` | `APIRouteHandler<T>` |  |
| `options` (optional) | `Omit<WithScopeOptions<T>, "services">` |  |

**Returns:** `(req: NextRequest) => Promise<Response>`

**Examples:**

```typescript
// With dependency injection
const handler = withScopeAndServices(
  { db: createDatabase() },
  async (req, { scope }) => {
    const db = scope.use('db')
    const [err, users] = await scope.task(() => db.query('SELECT * FROM users'))
    return Response.json(users)
  }
)
```

*Source: [index.ts:322](packages/adapter-nextjs/src/index.ts#L322)*

---

### createRouteConfig

```typescript
function createRouteConfig<T extends Record<string, unknown>>(config: WithScopeOptions<T>)
```

Create a reusable scope configuration for API routes @example ```typescript // lib/scope.ts import { createRouteConfig } from '@go-go-scope/adapter-nextjs' import { createDatabase } from './db' export const routeConfig = createRouteConfig({   timeout: 10000,   services: { db: createDatabase() },   onError: (err) => Response.json({ error: err.message }, { status: 500 }) }) // app/api/users/route.ts import { routeConfig } from '@/lib/scope' export const GET = routeConfig.wrap(async (req, { scope }) => {   const db = scope.use('db')   // ... }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `WithScopeOptions<T>` |  |

**Examples:**

```typescript
// lib/scope.ts
import { createRouteConfig } from '@go-go-scope/adapter-nextjs'
import { createDatabase } from './db'

export const routeConfig = createRouteConfig({
  timeout: 10000,
  services: { db: createDatabase() },
  onError: (err) => Response.json({ error: err.message }, { status: 500 })
})

// app/api/users/route.ts
import { routeConfig } from '@/lib/scope'

export const GET = routeConfig.wrap(async (req, { scope }) => {
  const db = scope.use('db')
  // ...
})
```

*Source: [index.ts:354](packages/adapter-nextjs/src/index.ts#L354)*

---

### errorResponse

```typescript
function errorResponse(error: unknown, statusCode = 500): Response
```

Helper to create typed error responses

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `error` | `unknown` |  |
| `statusCode` (optional) | `unknown` |  |

**Returns:** `Response`

*Source: [index.ts:386](packages/adapter-nextjs/src/index.ts#L386)*

---

### jsonResponse

```typescript
function jsonResponse<T>(data: T, statusCode = 200): Response
```

Helper to create success responses with proper typing

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `data` | `T` |  |
| `statusCode` (optional) | `unknown` |  |

**Returns:** `Response`

*Source: [index.ts:401](packages/adapter-nextjs/src/index.ts#L401)*

---

## Classs

### NextJSRouteError

```typescript
class NextJSRouteError
```

Error classes for Next.js adapter

*Source: [index.ts:372](packages/adapter-nextjs/src/index.ts#L372)*

---

## Interfaces

### NextJSContext

```typescript
interface NextJSContext
```

Context passed to Next.js route handlers

*Source: [index.ts:52](packages/adapter-nextjs/src/index.ts#L52)*

---

### WithScopeOptions

```typescript
interface WithScopeOptions
```

Options for withScope wrapper

*Source: [index.ts:81](packages/adapter-nextjs/src/index.ts#L81)*

---

## Types

### APIRouteHandler

```typescript
type APIRouteHandler = (
	req: NextRequest,
	context: NextJSContext<T>,
) => Promise<Response> | Response
```

API Route handler with scope

*Source: [index.ts:64](packages/adapter-nextjs/src/index.ts#L64)*

---

### EdgeRouteHandler

```typescript
type EdgeRouteHandler = (req: Request, context: NextJSContext<T>) => Promise<Response> | Response
```

Edge Route handler with scope

*Source: [index.ts:74](packages/adapter-nextjs/src/index.ts#L74)*

---

