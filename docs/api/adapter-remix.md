# adapter-remix API Reference

> Auto-generated documentation for adapter-remix

## Table of Contents

- [Functions](#Functions)
  - [withScopeLoader](#withscopeloader)
  - [withScopeAction](#withscopeaction)
  - [createRemixScope](#createremixscope)
- [Interfaces](#Interfaces)
  - [RemixContext](#remixcontext)
  - [RemixScopeOptions](#remixscopeoptions)

## Functions

### withScopeLoader

```typescript
function withScopeLoader<T extends Record<string, unknown>, R>(loader: (args: LoaderFunctionArgs & RemixContext<T>) => Promise<R> | R, options: RemixScopeOptions<T> = {}): (args: LoaderFunctionArgs) => Promise<R>
```

Wrap a Remix loader with scope @example ```typescript // app/routes/users.tsx import { withScopeLoader } from '@go-go-scope/adapter-remix' import { json } from '@remix-run/node' export const loader = withScopeLoader(async ({ request, scope }) => {   const url = new URL(request.url)   const page = url.searchParams.get('page') || '1'   const [err, users] = await scope.task(() => fetchUsers(page))   if (err) throw new Response(err.message, { status: 500 })   return json({ users }) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `loader` | `(args: LoaderFunctionArgs & RemixContext<T>) => Promise<R> | R` |  |
| `options` (optional) | `RemixScopeOptions<T>` |  |

**Returns:** `(args: LoaderFunctionArgs) => Promise<R>`

**Examples:**

```typescript
// app/routes/users.tsx
import { withScopeLoader } from '@go-go-scope/adapter-remix'
import { json } from '@remix-run/node'

export const loader = withScopeLoader(async ({ request, scope }) => {
  const url = new URL(request.url)
  const page = url.searchParams.get('page') || '1'

  const [err, users] = await scope.task(() => fetchUsers(page))
  if (err) throw new Response(err.message, { status: 500 })

  return json({ users })
})
```

*Source: [index.ts:78](packages/adapter-remix/src/index.ts#L78)*

---

### withScopeAction

```typescript
function withScopeAction<T extends Record<string, unknown>, R>(action: (args: ActionFunctionArgs & RemixContext<T>) => Promise<R> | R, options: RemixScopeOptions<T> = {}): (args: ActionFunctionArgs) => Promise<R>
```

Wrap a Remix action with scope @example ```typescript // app/routes/users.tsx import { withScopeAction } from '@go-go-scope/adapter-remix' import { json } from '@remix-run/node' export const action = withScopeAction(async ({ request, scope }) => {   const formData = await request.formData()   const [err, result] = await scope.task(() => createUser(formData))   if (err) return json({ error: err.message }, { status: 400 })   return json({ result }) }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `action` | `(args: ActionFunctionArgs & RemixContext<T>) => Promise<R> | R` |  |
| `options` (optional) | `RemixScopeOptions<T>` |  |

**Returns:** `(args: ActionFunctionArgs) => Promise<R>`

**Examples:**

```typescript
// app/routes/users.tsx
import { withScopeAction } from '@go-go-scope/adapter-remix'
import { json } from '@remix-run/node'

export const action = withScopeAction(async ({ request, scope }) => {
  const formData = await request.formData()

  const [err, result] = await scope.task(() => createUser(formData))
  if (err) return json({ error: err.message }, { status: 400 })

  return json({ result })
})
```

*Source: [index.ts:124](packages/adapter-remix/src/index.ts#L124)*

---

### createRemixScope

```typescript
function createRemixScope<T extends Record<string, unknown>>(config: RemixScopeOptions<T>)
```

Create reusable scope configuration for loaders/actions @example ```typescript // app/lib/scope.ts import { createRemixScope } from '@go-go-scope/adapter-remix' import { db } from './db' export const remixScope = createRemixScope({   timeout: 10000,   services: { db } }) // app/routes/users.tsx import { remixScope } from '~/lib/scope' export const loader = remixScope.loader(async ({ request, scope }) => {   const db = scope.use('db')   // ... }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `RemixScopeOptions<T>` |  |

**Examples:**

```typescript
// app/lib/scope.ts
import { createRemixScope } from '@go-go-scope/adapter-remix'
import { db } from './db'

export const remixScope = createRemixScope({
  timeout: 10000,
  services: { db }
})

// app/routes/users.tsx
import { remixScope } from '~/lib/scope'

export const loader = remixScope.loader(async ({ request, scope }) => {
  const db = scope.use('db')
  // ...
})
```

*Source: [index.ts:174](packages/adapter-remix/src/index.ts#L174)*

---

## Interfaces

### RemixContext

```typescript
interface RemixContext
```

Remix context with scope

*Source: [index.ts:37](packages/adapter-remix/src/index.ts#L37)*

---

### RemixScopeOptions

```typescript
interface RemixScopeOptions
```

Options for scope configuration

*Source: [index.ts:49](packages/adapter-remix/src/index.ts#L49)*

---

