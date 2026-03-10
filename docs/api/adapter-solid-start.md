# adapter-solid-start API Reference

> Auto-generated documentation for adapter-solid-start

## Table of Contents

- [Functions](#Functions)
  - [solidStartGoGoScope](#solidstartgogoscope)
  - [getScope](#getscope)
  - [defineScopedHandler](#definescopedhandler)
  - [withScope](#withscope)

## Functions

### solidStartGoGoScope

```typescript
function solidStartGoGoScope(options: SolidStartGoGoScopeOptions = {})
```

SolidStart middleware for go-go-scope integration @example ```typescript // src/middleware.ts import { createMiddleware } from '@solidjs/start/middleware' import { solidStartGoGoScope } from '@go-go-scope/adapter-solid-start' export default createMiddleware({   onRequest: [     solidStartGoGoScope({       name: 'my-solid-app',       timeout: 30000     })   ] }) ``` @example ```typescript // src/routes/api/users/[id].ts import { json } from '@solidjs/router' import { getScope } from '@go-go-scope/adapter-solid-start' import type { APIEvent } from '@solidjs/start/server' export const GET = async (event: APIEvent) => {   const s = getScope(event)   const id = event.params.id   const [err, user] = await s.task(     () => fetchUser(id),     { retry: 'exponential', timeout: 5000 }   )   if (err) {     return json({ error: err.message }, { status: 500 })   }   return json(user) } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `SolidStartGoGoScopeOptions` |  |

**Examples:**

```typescript
// src/middleware.ts
import { createMiddleware } from '@solidjs/start/middleware'
import { solidStartGoGoScope } from '@go-go-scope/adapter-solid-start'

export default createMiddleware({
  onRequest: [
    solidStartGoGoScope({
      name: 'my-solid-app',
      timeout: 30000
    })
  ]
})
```

```typescript
// src/routes/api/users/[id].ts
import { json } from '@solidjs/router'
import { getScope } from '@go-go-scope/adapter-solid-start'
import type { APIEvent } from '@solidjs/start/server'

export const GET = async (event: APIEvent) => {
  const s = getScope(event)
  const id = event.params.id

  const [err, user] = await s.task(
    () => fetchUser(id),
    { retry: 'exponential', timeout: 5000 }
  )

  if (err) {
    return json({ error: err.message }, { status: 500 })
  }
  return json(user)
}
```

*Source: [index.ts:69](packages/adapter-solid-start/src/index.ts#L69)*

---

### getScope

```typescript
function getScope(event: { scope?: Scope<any> }): Scope<any>
```

Helper to get the current scope from the fetch event @example ```typescript const GET = async (event: APIEvent) => {   const s = getScope(event)   const [err, data] = await s.task(() => fetchData())   // ... } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `{ scope?: Scope<any> }` |  |

**Returns:** `Scope<any>`

**Examples:**

```typescript
const GET = async (event: APIEvent) => {
  const s = getScope(event)
  const [err, data] = await s.task(() => fetchData())
  // ...
}
```

*Source: [index.ts:124](packages/adapter-solid-start/src/index.ts#L124)*

---

### defineScopedHandler

```typescript
function defineScopedHandler<T>(handler: (event: FetchEvent, scope: Scope<any>) => Promise<T>): (event: FetchEvent) => Promise<T>
```

Helper to create an API handler with automatic scope integration @example ```typescript import { defineScopedHandler } from '@go-go-scope/adapter-solid-start' import type { APIEvent } from '@solidjs/start/server' export const GET = defineScopedHandler(async (event, scope) => {   const [err, users] = await scope.task(() => fetchUsers())   if (err) return json({ error: err.message }, { status: 500 })   return json(users) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(event: FetchEvent, scope: Scope<any>) => Promise<T>` |  |

**Returns:** `(event: FetchEvent) => Promise<T>`

**Examples:**

```typescript
import { defineScopedHandler } from '@go-go-scope/adapter-solid-start'
import type { APIEvent } from '@solidjs/start/server'

export const GET = defineScopedHandler(async (event, scope) => {
  const [err, users] = await scope.task(() => fetchUsers())
  if (err) return json({ error: err.message }, { status: 500 })
  return json(users)
})
```

*Source: [index.ts:149](packages/adapter-solid-start/src/index.ts#L149)*

---

### withScope

```typescript
function withScope<TArgs extends unknown[], TReturn>(fn: (scope: Scope<any>, ...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn>
```

Server function wrapper with scope access For use with SolidStart's createServerData$, createServerAction$, etc. @example ```typescript // src/lib/users.ts import { createServerAction$ } from '@solidjs/router' import { withScope } from '@go-go-scope/adapter-solid-start' export const createUser = withScope(async (scope, formData: FormData) => {   const name = formData.get('name') as string   const [err, user] = await scope.task(() => db.insert('users', { name }))   if (err) throw err   return user }) // Usage in component const [, createUserAction] = createServerAction$(createUser) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(scope: Scope<any>, ...args: TArgs) => Promise<TReturn>` |  |

**Returns:** `(...args: TArgs) => Promise<TReturn>`

**Examples:**

```typescript
// src/lib/users.ts
import { createServerAction$ } from '@solidjs/router'
import { withScope } from '@go-go-scope/adapter-solid-start'

export const createUser = withScope(async (scope, formData: FormData) => {
  const name = formData.get('name') as string
  const [err, user] = await scope.task(() => db.insert('users', { name }))
  if (err) throw err
  return user
})

// Usage in component
const [, createUserAction] = createServerAction$(createUser)
```

*Source: [index.ts:179](packages/adapter-solid-start/src/index.ts#L179)*

---

