# adapter-elysia API Reference

> Auto-generated documentation for adapter-elysia

## Table of Contents

- [Functions](#Functions)
  - [goGoScope](#gogoscope)
  - [getScope](#getscope)
  - [getRootScope](#getrootscope)

## Functions

### goGoScope

```typescript
function goGoScope(options: ElysiaGoGoScopeOptions = {})
```

// Note: Elysia's Context is a type alias, not an interface, // so we cannot use module augmentation. The scope is injected // via the .derive() method in the plugin.  Elysia plugin for go-go-scope integration @example ```typescript import { Elysia } from 'elysia' import { goGoScope } from '@go-go-scope/adapter-elysia' const app = new Elysia()   .use(goGoScope({ metrics: true }))   .get('/users/:id', async ({ scope, params }) => {     const [err, user] = await scope.task(       () => fetchUser(params.id),       { retry: 'exponential' }     )     if (err) {       return { error: err.message }     }     return user   }) ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `ElysiaGoGoScopeOptions` |  |

**Examples:**

```typescript
import { Elysia } from 'elysia'
import { goGoScope } from '@go-go-scope/adapter-elysia'

const app = new Elysia()
  .use(goGoScope({ metrics: true }))
  .get('/users/:id', async ({ scope, params }) => {
    const [err, user] = await scope.task(
      () => fetchUser(params.id),
      { retry: 'exponential' }
    )

    if (err) {
      return { error: err.message }
    }
    return user
  })
```

*Source: [index.ts:54](packages/adapter-elysia/src/index.ts#L54)*

---

### getScope

```typescript
function getScope(context: {
	scope?: Scope<Record<string, unknown>>;
}): Scope<Record<string, unknown>>
```

Get scope from Elysia context (for use outside of handlers)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `context` | `{
	scope?: Scope<Record<string, unknown>>;
}` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:110](packages/adapter-elysia/src/index.ts#L110)*

---

### getRootScope

```typescript
function getRootScope(context: {
	rootScope?: Scope<Record<string, unknown>>;
}): Scope<Record<string, unknown>>
```

Get root scope from Elysia context

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `context` | `{
	rootScope?: Scope<Record<string, unknown>>;
}` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:124](packages/adapter-elysia/src/index.ts#L124)*

---

