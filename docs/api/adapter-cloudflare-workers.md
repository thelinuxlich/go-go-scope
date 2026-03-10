# adapter-cloudflare-workers API Reference

> Auto-generated documentation for adapter-cloudflare-workers

## Table of Contents

- [Functions](#Functions)
  - [cloudflareWorkersGoGoScope](#cloudflareworkersgogoscope)
  - [getScope](#getscope)
  - [defineScopedHandler](#definescopedhandler)
  - [withDurableObjectScope](#withdurableobjectscope)

## Functions

### cloudflareWorkersGoGoScope

```typescript
function cloudflareWorkersGoGoScope(options: CloudflareWorkersGoGoScopeOptions = {}): <T>(
	request: Request,
	env: unknown,
	ctx: ExecutionContext,
	handler: (scope: Scope) => Promise<T>,
) => Promise<T>
```

Cloudflare Workers middleware for go-go-scope integration @example ```typescript // src/index.ts import { cloudflareWorkersGoGoScope, getScope } from '@go-go-scope/adapter-cloudflare-workers' const middleware = cloudflareWorkersGoGoScope({   name: 'my-worker',   timeout: 30000 }) export default {   async fetch(request: Request, env: Env, ctx: ExecutionContext) {     return middleware(request, env, ctx, async (scope) => {       const [err, data] = await scope.task(() => fetchData())       if (err) return new Response('Error', { status: 500 })       return new Response(JSON.stringify(data))     })   } } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `CloudflareWorkersGoGoScopeOptions` |  |

**Returns:** `<T>(
	request: Request,
	env: unknown,
	ctx: ExecutionContext,
	handler: (scope: Scope) => Promise<T>,
) => Promise<T>`

**Examples:**

```typescript
// src/index.ts
import { cloudflareWorkersGoGoScope, getScope } from '@go-go-scope/adapter-cloudflare-workers'

const middleware = cloudflareWorkersGoGoScope({
  name: 'my-worker',
  timeout: 30000
})

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return middleware(request, env, ctx, async (scope) => {
      const [err, data] = await scope.task(() => fetchData())
      if (err) return new Response('Error', { status: 500 })
      return new Response(JSON.stringify(data))
    })
  }
}
```

*Source: [index.ts:48](packages/adapter-cloudflare-workers/src/index.ts#L48)*

---

### getScope

```typescript
function getScope(event: { scope?: Scope }): Scope
```

Helper to get the current scope from the request context Note: In Cloudflare Workers, pass scope explicitly or use closure @example ```typescript export default {   async fetch(request: Request, env: Env, ctx: ExecutionContext) {     const middleware = cloudflareWorkersGoGoScope()     return middleware(request, env, ctx, async (scope) => {       // Use scope directly       const [err, data] = await scope.task(() => fetchData())       return new Response(JSON.stringify(data))     })   } } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `{ scope?: Scope }` |  |

**Returns:** `Scope`

**Examples:**

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const middleware = cloudflareWorkersGoGoScope()
    return middleware(request, env, ctx, async (scope) => {
      // Use scope directly
      const [err, data] = await scope.task(() => fetchData())
      return new Response(JSON.stringify(data))
    })
  }
}
```

*Source: [index.ts:114](packages/adapter-cloudflare-workers/src/index.ts#L114)*

---

### defineScopedHandler

```typescript
function defineScopedHandler<T>(handler: (
		request: Request,
		scope: Scope,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<T>): (
	request: Request,
	scope: Scope,
	env: unknown,
	ctx: ExecutionContext,
) => Promise<T>
```

Helper to create a handler with automatic scope integration @example ```typescript // src/handlers/api.ts import { defineScopedHandler } from '@go-go-scope/adapter-cloudflare-workers' export const handler = defineScopedHandler(async (request, scope, env, ctx) => {   const [err, data] = await scope.task(() => fetchData())   if (err) return new Response('Error', { status: 500 })   return new Response(JSON.stringify(data)) }) // src/index.ts import { cloudflareWorkersGoGoScope } from '@go-go-scope/adapter-cloudflare-workers' import { handler } from './handlers/api' const middleware = cloudflareWorkersGoGoScope() export default {   async fetch(request: Request, env: Env, ctx: ExecutionContext) {     return middleware(request, env, ctx, (scope) => handler(request, scope, env, ctx))   } } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `handler` | `(
		request: Request,
		scope: Scope,
		env: unknown,
		ctx: ExecutionContext,
	) => Promise<T>` |  |

**Returns:** `(
	request: Request,
	scope: Scope,
	env: unknown,
	ctx: ExecutionContext,
) => Promise<T>`

**Examples:**

```typescript
// src/handlers/api.ts
import { defineScopedHandler } from '@go-go-scope/adapter-cloudflare-workers'

export const handler = defineScopedHandler(async (request, scope, env, ctx) => {
  const [err, data] = await scope.task(() => fetchData())
  if (err) return new Response('Error', { status: 500 })
  return new Response(JSON.stringify(data))
})

// src/index.ts
import { cloudflareWorkersGoGoScope } from '@go-go-scope/adapter-cloudflare-workers'
import { handler } from './handlers/api'

const middleware = cloudflareWorkersGoGoScope()

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return middleware(request, env, ctx, (scope) => handler(request, scope, env, ctx))
  }
}
```

*Source: [index.ts:151](packages/adapter-cloudflare-workers/src/index.ts#L151)*

---

### withDurableObjectScope

```typescript
function withDurableObjectScope<T>(_request: Request, handler: (scope: Scope<any>) => Promise<T>, opts: { name?: string; timeout?: number; debug?: boolean } = {}): Promise<T>
```

Durable Objects integration helper Provides scoped execution within Durable Objects @example ```typescript // src/durable-object.ts import { DurableObject } from 'cloudflare:workers' import { withDurableObjectScope } from '@go-go-scope/adapter-cloudflare-workers' export class MyDurableObject extends DurableObject {   async fetch(request: Request) {     return withDurableObjectScope(request, async (scope) => {       const [err, data] = await scope.task(() => this.process(request))       return new Response(JSON.stringify(data))     })   } } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_request` | `Request` |  |
| `handler` | `(scope: Scope<any>) => Promise<T>` |  |
| `opts` (optional) | `{ name?: string; timeout?: number; debug?: boolean }` |  |

**Returns:** `Promise<T>`

**Examples:**

```typescript
// src/durable-object.ts
import { DurableObject } from 'cloudflare:workers'
import { withDurableObjectScope } from '@go-go-scope/adapter-cloudflare-workers'

export class MyDurableObject extends DurableObject {
  async fetch(request: Request) {
    return withDurableObjectScope(request, async (scope) => {
      const [err, data] = await scope.task(() => this.process(request))
      return new Response(JSON.stringify(data))
    })
  }
}
```

*Source: [index.ts:189](packages/adapter-cloudflare-workers/src/index.ts#L189)*

---

