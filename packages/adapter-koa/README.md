# @go-go-scope/adapter-koa

Koa adapter for go-go-scope - request-scoped structured concurrency with automatic cleanup.

## Installation

```bash
npm install @go-go-scope/adapter-koa koa
```

## Usage

### Basic

```typescript
import Koa from 'koa'
import Router from '@koa/router'
import { koaGoGoScope, getScope, getRootScope } from '@go-go-scope/adapter-koa'

const app = new Koa()
const router = new Router()

// Apply middleware
app.use(koaGoGoScope({ name: 'my-api', metrics: true }))

// Use scope in routes
router.get('/users/:id', async (ctx) => {
  const scope = getScope(ctx)
  
  const [err, user] = await scope.task(
    () => fetchUser(ctx.params.id),
    { retry: 'exponential', timeout: 5000 }
  )
  
  if (err) {
    ctx.status = 500
    ctx.body = { error: err.message }
    return
  }
  
  ctx.body = user
})

app.use(router.routes())
app.listen(3000)
```

### Options

```typescript
app.use(koaGoGoScope({
  name: 'my-api',        // Root scope name
  metrics: true,          // Enable metrics collection
  timeout: 30000,        // Default request timeout
  onError: (err, ctx) => {  // Optional error handler
    console.error('Scope error:', err)
  }
}))
```

### Accessing Root Scope

```typescript
// Access root scope from any context
app.use(async (ctx, next) => {
  const rootScope = getRootScope(ctx)
  const metrics = rootScope.metrics()
  console.log('App metrics:', metrics)
  await next()
})
```

### Graceful Shutdown

```typescript
import { closeKoaScope } from '@go-go-scope/adapter-koa'

const server = app.listen(3000)

process.on('SIGTERM', async () => {
  await closeKoaScope()
  server.close(() => {
    process.exit(0)
  })
})
```

## API

### `koaGoGoScope(options?)`

Creates Koa middleware that provides request-scoped structured concurrency.

**Options:**
- `name`: Root scope name (default: 'koa-app')
- `metrics`: Enable metrics collection (default: false)
- `timeout`: Default request timeout in ms
- `onError`: Error handler callback

### `getScope(ctx)`

Get the request-scoped scope from Koa context.

### `getRootScope(ctx)`

Get the root application scope from Koa context.

### `closeKoaScope()`

Gracefully shutdown the root scope (for use in SIGTERM handlers).

## License

MIT
