# @go-go-scope/adapter-elysia

Elysia adapter for go-go-scope - Bun-first native integration.

## Installation

```bash
npm install @go-go-scope/adapter-elysia elysia
```

## Usage

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

## License

MIT
