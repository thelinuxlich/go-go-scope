# adapter-nuxt API Reference

> Auto-generated documentation for adapter-nuxt

## Table of Contents

- [Functions](#Functions)
  - [nuxtGoGoScope](#nuxtgogoscope)
  - [getScope](#getscope)
  - [defineScopedHandler](#definescopedhandler)

## Functions

### nuxtGoGoScope

```typescript
function nuxtGoGoScope(options: NuxtGoGoScopeOptions = {}): NitroAppPlugin
```

Nuxt Nitro plugin for go-go-scope integration @example ```typescript // server/plugins/go-go-scope.ts import { nuxtGoGoScope } from '@go-go-scope/adapter-nuxt' export default defineNitroPlugin(nuxtGoGoScope({   name: 'my-nuxt-app',   timeout: 30000 })) ``` @example ```typescript // server/api/users/[id].get.ts import { scope } from 'go-go-scope' export default defineEventHandler(async (event) => {   const s = event.context.scope   const [err, user] = await s.task(     () => fetchUser(getRouterParam(event, 'id')!),     { retry: 'exponential', timeout: 5000 }   )   if (err) {     throw createError({ statusCode: 500, message: err.message })   }   return user }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `NuxtGoGoScopeOptions` |  |

**Returns:** `NitroAppPlugin`

**Examples:**

```typescript
// server/plugins/go-go-scope.ts
import { nuxtGoGoScope } from '@go-go-scope/adapter-nuxt'

export default defineNitroPlugin(nuxtGoGoScope({
  name: 'my-nuxt-app',
  timeout: 30000
}))
```

```typescript
// server/api/users/[id].get.ts
import { scope } from 'go-go-scope'

export default defineEventHandler(async (event) => {
  const s = event.context.scope

  const [err, user] = await s.task(
    () => fetchUser(getRouterParam(event, 'id')!),
    { retry: 'exponential', timeout: 5000 }
  )

  if (err) {
    throw createError({ statusCode: 500, message: err.message })
  }
  return user
})
```

*Source: [index.ts:69](packages/adapter-nuxt/src/index.ts#L69)*

---

### getScope

```typescript
function getScope(event: { context: { scope?: Scope } }): Scope
```

Helper to get the current scope from the event @example ```typescript export default defineEventHandler(async (event) => {   const s = getScope(event)   const [err, data] = await s.task(() => fetchData())   // ... }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `{ context: { scope?: Scope } }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
export default defineEventHandler(async (event) => {
  const s = getScope(event)
  const [err, data] = await s.task(() => fetchData())
  // ...
})
```

*Source: [index.ts:132](packages/adapter-nuxt/src/index.ts#L132)*

---

### defineScopedHandler

```typescript
function defineScopedHandler<T>(handler: (event: { context: { scope: Scope } }, scope: Scope) => Promise<T>): (event: { context: { scope?: Scope } }) => Promise<T>
```

Helper to create a server handler with automatic scope integration @example ```typescript // server/api/users.get.ts import { defineScopedHandler } from '@go-go-scope/adapter-nuxt' export default defineScopedHandler(async (event, scope) => {   const [err, users] = await scope.task(() => fetchUsers())   if (err) throw createError({ statusCode: 500 })   return users }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(event: { context: { scope: Scope } }, scope: Scope) => Promise<T>` |  |

**Returns:** `(event: { context: { scope?: Scope } }) => Promise<T>`

**Examples:**

```typescript
// server/api/users.get.ts
import { defineScopedHandler } from '@go-go-scope/adapter-nuxt'

export default defineScopedHandler(async (event, scope) => {
  const [err, users] = await scope.task(() => fetchUsers())
  if (err) throw createError({ statusCode: 500 })
  return users
})
```

*Source: [index.ts:157](packages/adapter-nuxt/src/index.ts#L157)*

---

