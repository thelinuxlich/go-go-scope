# go-go-scope Monorepo

> Structured concurrency for TypeScript using Explicit Resource Management

This is a monorepo containing the go-go-scope ecosystem of packages.

## Packages

### Core

| Package | Description | Version |
|---------|-------------|---------|
| [`go-go-scope`](./packages/go-go-scope) | Core library with structured concurrency primitives | ![npm](https://img.shields.io/npm/v/go-go-scope) |
| [`@go-go-scope/scheduler`](./packages/scheduler) | Distributed job scheduler with DLQ and metrics | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler) |
| [`@go-go-scope/scheduler-tui`](./packages/scheduler-tui) | Interactive TUI and CLI for managing schedules | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler-tui) |
| [`@go-go-scope/stream`](./packages/stream) | Lazy async streams with 50+ operations | ![npm](https://img.shields.io/npm/v/@go-go-scope/stream) |
| [`@go-go-scope/testing`](./packages/testing) | Mock scopes, spies, and test utilities | ![npm](https://img.shields.io/npm/v/@go-go-scope/testing) |

### Persistence Adapters

| Package | Description | Version |
|---------|-------------|---------|
| [`@go-go-scope/persistence-redis`](./packages/persistence-redis) | Redis adapter for locks, circuit breaker, and caching | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-redis) |
| [`@go-go-scope/persistence-postgres`](./packages/persistence-postgres) | PostgreSQL adapter for distributed locks | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-postgres) |
| [`@go-go-scope/persistence-mysql`](./packages/persistence-mysql) | MySQL adapter for distributed locks | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-mysql) |
| [`@go-go-scope/persistence-sqlite`](./packages/persistence-sqlite) | SQLite adapter for single-node deployments | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-sqlite) |
| [`@go-go-scope/persistence-sqlite-bun`](./packages/persistence-sqlite-bun) | Bun-native SQLite adapter | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-sqlite-bun) |
| [`@go-go-scope/persistence-mongodb`](./packages/persistence-mongodb) | MongoDB adapter for locks and caching | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-mongodb) |
| [`@go-go-scope/persistence-dynamodb`](./packages/persistence-dynamodb) | DynamoDB adapter for AWS deployments | ![npm](https://img.shields.io/npm/v/@go-go-scope/persistence-dynamodb) |

### Framework Adapters

| Package | Description | Version |
|---------|-------------|---------|
| [`@go-go-scope/adapter-fastify`](./packages/adapter-fastify) | Fastify plugin for request-scoped concurrency | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-fastify) |
| [`@go-go-scope/adapter-express`](./packages/adapter-express) | Express middleware for request scopes | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-express) |
| [`@go-go-scope/adapter-nestjs`](./packages/adapter-nestjs) | NestJS module with DI integration | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-nestjs) |
| [`@go-go-scope/adapter-hono`](./packages/adapter-hono) | Hono middleware for edge runtimes | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-hono) |
| [`@go-go-scope/adapter-elysia`](./packages/adapter-elysia) | Elysia plugin for Bun-first performance | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-elysia) |
| [`@go-go-scope/adapter-koa`](./packages/adapter-koa) | Koa middleware for modern async apps | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-koa) |
| [`@go-go-scope/adapter-hapi`](./packages/adapter-hapi) | Hapi plugin for enterprise apps | ![npm](https://img.shields.io/npm/v/@go-go-scope/adapter-hapi) |

## Quick Start

### Installation

```bash
# Core library only
npm install go-go-scope

# With scheduler
npm install go-go-scope @go-go-scope/scheduler

# With TUI tools
npm install -g @go-go-scope/scheduler-tui

# With persistence (choose your database)
npm install @go-go-scope/persistence-redis
npm install @go-go-scope/persistence-mongodb
npm install @go-go-scope/persistence-dynamodb

# With web framework (choose your framework)
npm install @go-go-scope/adapter-fastify
npm install @go-go-scope/adapter-express
npm install @go-go-scope/adapter-nestjs
```

### Basic Usage

```typescript
import { scope } from "go-go-scope";

await using s = scope({ timeout: 5000 });

const [err, data] = await s.task(async ({ signal }) => {
  const response = await fetch("/api/data", { signal });
  return response.json();
});

if (err) {
  console.error("Failed:", err.message);
} else {
  console.log("Data:", data);
}
```

## Documentation

Complete documentation is available in the [docs](./docs) directory:

- [Quick Start](./docs/01-quick-start.md) - Get started in 5 minutes
- [Core Concepts](./docs/02-concepts.md) - Why structured concurrency matters
- [API Reference](./docs/03-api-reference.md) - Complete API documentation
- [Streams](./docs/04-streams.md) - Lazy async streams with 50+ operations
- [Resilience Patterns](./docs/05-resilience-patterns.md) - Circuit breakers, retry, timeouts
- [Integrations](./docs/11-integrations.md) - Persistence adapters, framework adapters
- [Caching](./docs/17-caching-memoization.md) - Distributed caching and memoization
- [Performance](./docs/18-performance-optimizations.md) - Optimizations for high throughput

## Development

This monorepo uses pnpm workspaces.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm build:core
pnpm build:scheduler
pnpm build:tui

# Run tests
pnpm test

# Lint
pnpm lint
```

## Repository Structure

```
.
├── packages/
│   ├── go-go-scope/           # Core library
│   ├── scheduler/              # Job scheduler with DLQ
│   ├── scheduler-tui/          # CLI and TUI tools
│   ├── stream/                 # Stream API package
│   ├── testing/                # Test utilities
│   ├── persistence-redis/      # Redis adapter
│   ├── persistence-postgres/   # PostgreSQL adapter
│   ├── persistence-mysql/      # MySQL adapter
│   ├── persistence-sqlite/     # SQLite adapter
│   ├── persistence-sqlite-bun/ # Bun SQLite adapter
│   ├── persistence-mongodb/    # MongoDB adapter
│   ├── persistence-dynamodb/   # DynamoDB adapter
│   ├── adapter-fastify/        # Fastify adapter
│   ├── adapter-express/        # Express adapter
│   ├── adapter-nestjs/         # NestJS adapter
│   ├── adapter-hono/           # Hono adapter
│   ├── adapter-elysia/         # Elysia adapter
│   ├── adapter-koa/            # Koa adapter
│   └── adapter-hapi/           # Hapi adapter
├── docs/                       # Documentation
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
