# @go-go-scope/persistence-cloudflare-do

Cloudflare Durable Objects persistence adapter for go-go-scope.

## Installation

```bash
npm install @go-go-scope/persistence-cloudflare-do
```

## Usage

```typescript
import { DurableObjectAdapter } from '@go-go-scope/persistence-cloudflare-do';
import { scope } from 'go-go-scope';

// In your Durable Object
export class MyDurableObject extends DurableObject {
  private persistence: DurableObjectAdapter;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.persistence = new DurableObjectAdapter(state.storage);
  }

  async fetch(request: Request) {
    await using s = scope({ persistence: this.persistence });

    // Acquire a distributed lock
    const lock = await s.acquireLock("resource:123", 30000);
    if (!lock) {
      return new Response("Lock failed", { status: 423 });
    }

    // Process request
    return new Response("Success");
  }
}
```

## Features

- Distributed locks with TTL
- Circuit breaker state persistence
- Cache provider implementation
- Atomic operations via DurableObjectStorage
- Key prefixing for multi-tenant isolation

## License

MIT
