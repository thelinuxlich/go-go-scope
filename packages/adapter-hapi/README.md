# @go-go-scope/adapter-hapi

Hapi adapter for go-go-scope - request-scoped structured concurrency with automatic cleanup.

## Installation

```bash
npm install @go-go-scope/adapter-hapi @hapi/hapi
```

## Usage

### Basic

```typescript
import Hapi from '@hapi/hapi'
import { hapiGoGoScope, getScope, getRootScope, closeHapiScope } from '@go-go-scope/adapter-hapi'

const server = Hapi.server({ port: 3000 })

// Register plugin
await server.register({
  plugin: hapiGoGoScope,
  options: { name: 'my-api', metrics: true }
})

// Use scope in routes
server.route({
  method: 'GET',
  path: '/users/{id}',
  handler: async (request) => {
    const [err, user] = await request.scope.task(
      () => fetchUser(request.params.id),
      { retry: 'exponential', timeout: 5000 }
    )
    
    if (err) {
      return { error: err.message }
    }
    
    return user
  }
})

await server.start()
console.log('Server running at:', server.info.uri)
```

### Options

```typescript
await server.register({
  plugin: hapiGoGoScope,
  options: {
    name: 'my-api',      // Root scope name
    metrics: true,        // Enable metrics collection
    timeout: 30000      // Default request timeout
  }
})
```

### Accessing Root Scope

```typescript
// From server instance
const rootScope = getRootScope(server)
const metrics = rootScope.metrics()
console.log('App metrics:', metrics)

// Or directly from request
server.route({
  method: 'GET',
  path: '/health',
  handler: async (request) => {
    const rootScope = request.rootScope
    return { status: 'ok', metrics: rootScope.metrics() }
  }
})
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  await closeHapiScope(server)
  await server.stop()
})
```

## API

### `hapiGoGoScope`

Hapi plugin that provides request-scoped structured concurrency.

**Options:**
- `name`: Root scope name (default: 'hapi-app')
- `metrics`: Enable metrics collection (default: false)
- `timeout`: Default request timeout in ms

### `getScope(request)`

Get the request-scoped scope from Hapi request.

### `getRootScope(server)`

Get the root application scope from Hapi server.

### `closeHapiScope(server)`

Gracefully shutdown the root scope (for use in SIGTERM handlers).

## License

MIT
