# adapter-sveltekit API Reference

> Auto-generated documentation for adapter-sveltekit

## Table of Contents

- [Functions](#Functions)
  - [createScopeHandle](#createscopehandle)
  - [withScopeLoad](#withscopeload)
  - [withScopeAction](#withscopeaction)
- [Interfaces](#Interfaces)
  - [SvelteKitContext](#sveltekitcontext)
  - [SvelteKitScopeOptions](#sveltekitscopeoptions)

## Functions

### createScopeHandle

```typescript
function createScopeHandle<T extends Record<string, unknown>>(options: SvelteKitScopeOptions<T> = {}): Handle
```

Create a SvelteKit handle with scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `SvelteKitScopeOptions<T>` |  |

**Returns:** `Handle`

**Examples:**

```typescript
// src/hooks.server.ts
import { createScopeHandle } from '@go-go-scope/adapter-sveltekit'
import { sequence } from '@sveltejs/kit/hooks'

export const handle = sequence(
  createScopeHandle({ timeout: 30000 }),
  async ({ event, resolve }) => resolve(event)
)
```

*Source: [index.ts:66](packages/adapter-sveltekit/src/index.ts#L66)*

---

### withScopeLoad

```typescript
function withScopeLoad<T extends Record<string, unknown>, R extends Record<string, unknown>>(loader: (event: ServerLoadEvent & { scope: Scope<T> }) => Promise<R> | R, options: Omit<SvelteKitScopeOptions<T>, "services"> = {}): (event: ServerLoadEvent) => Promise<R>
```

Wrap a server load function with a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `loader` | `(event: ServerLoadEvent & { scope: Scope<T> }) => Promise<R> | R` |  |
| `options` (optional) | `Omit<SvelteKitScopeOptions<T>, "services">` |  |

**Returns:** `(event: ServerLoadEvent) => Promise<R>`

**Examples:**

```typescript
// src/routes/+page.server.ts
import { withScopeLoad } from '@go-go-scope/adapter-sveltekit'

export const load = withScopeLoad(async (event) => {
  const { scope } = event.locals as { scope: Scope }
  const [err, data] = await scope.task(() => fetchData())
  if (err) throw error(500, err.message)
  return { data }
})
```

*Source: [index.ts:120](packages/adapter-sveltekit/src/index.ts#L120)*

---

### withScopeAction

```typescript
function withScopeAction<T extends Record<string, unknown>, R extends Record<string, unknown>>(action: (event: RequestEvent & { scope: Scope<T> }) => Promise<R> | R, options: Omit<SvelteKitScopeOptions<T>, "services"> = {}): (event: RequestEvent) => Promise<R>
```

Wrap a form action with a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `action` | `(event: RequestEvent & { scope: Scope<T> }) => Promise<R> | R` |  |
| `options` (optional) | `Omit<SvelteKitScopeOptions<T>, "services">` |  |

**Returns:** `(event: RequestEvent) => Promise<R>`

**Examples:**

```typescript
// src/routes/+page.server.ts
import { withScopeAction } from '@go-go-scope/adapter-sveltekit'
import { fail } from '@sveltejs/kit'

export const actions = {
  create: withScopeAction(async (event) => {
    const { scope } = event.locals as { scope: Scope }
    const data = await event.request.formData()

    const [err, result] = await scope.task(() => createItem(data))
    if (err) return fail(400, { error: err.message })
    return { success: true, result }
  })
}
```

*Source: [index.ts:167](packages/adapter-sveltekit/src/index.ts#L167)*

---

## Interfaces

### SvelteKitContext

```typescript
interface SvelteKitContext
```

SvelteKit context with scope

*Source: [index.ts:25](packages/adapter-sveltekit/src/index.ts#L25)*

---

### SvelteKitScopeOptions

```typescript
interface SvelteKitScopeOptions
```

Options for scope configuration

*Source: [index.ts:37](packages/adapter-sveltekit/src/index.ts#L37)*

---

