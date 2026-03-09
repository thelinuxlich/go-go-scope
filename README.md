<div align="center">

# 🔥 go-go-scope

### Structured Concurrency for TypeScript

> **Write concurrent code that cleans up after itself.**

[![npm version](https://img.shields.io/npm/v/go-go-scope?style=for-the-badge&color=blue)](https://www.npmjs.com/package/go-go-scope)
[![npm downloads](https://img.shields.io/npm/dm/go-go-scope?style=for-the-badge&color=green)](https://www.npmjs.com/package/go-go-scope)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-purple?style=for-the-badge)](LICENSE)

</div>

```typescript
// Structured concurrency with automatic cleanup
await using s = scope({ timeout: 5000 });

const [err, data] = await s.task(() => fetchUser(id));
if (err) console.error("Failed:", err);
else console.log("User:", data);
// ✨ Everything cleaned up automatically
```

<div align="center">

[📖 Documentation](./docs) • [🚀 Quick Start](./docs/01-quick-start.md) • [📦 Packages](#packages) • [💡 Examples](./examples)

</div>

---

## ✨ Why go-go-scope?

| Feature | Benefit |
|---------|---------|
| 🧹 **Automatic Cleanup** | Resources disposed in LIFO order via `using`/`await using` |
| 🚦 **Cancellation Propagation** | Parent scope cancels all child tasks automatically |
| 🔄 **Structured Concurrency** | No fire-and-forget, all tasks tracked and awaitable |
| 🛡️ **Resilience Built-in** | Circuit breakers, retries, timeouts, idempotency |
| 🧵 **Worker Thread Support** | Offload CPU-intensive tasks to worker threads (v2.4.0+) |
| ⏱️ **Cancellable Delays** | `scope.delay()` with automatic cancellation (v2.8.0+) |
| 🎯 **Per-Task Circuit Breaker** | Override scope CB settings per task (v2.8.0+) |
| 🔄 **Interval Execution** | `scope.every()` for recurring tasks (v2.8.0+) |
| 🏆 **First Success** | `scope.any()` returns first successful result (v2.8.0+) |
| 📦 **Batch Processing** | `scope.batch()` accumulates and processes in batches (v2.8.0+) |
| 📊 **Observable** | OpenTelemetry, Prometheus metrics, built-in profiling |
| 🔌 **Framework Agnostic** | Adapters for Fastify, Express, NestJS, Hono, Koa, Hapi, Elysia, Vue, Svelte |
| 💾 **Persistence Ready** | Redis, PostgreSQL, MySQL, MongoDB, DynamoDB, SQLite, Cloudflare DO adapters |
| 📊 **Real-time Visualization** | WebSocket dashboard for monitoring operations |

---

## 🚀 Quick Start

```bash
# Install core library
npm install go-go-scope

# Add scheduler for background jobs
npm install @go-go-scope/scheduler

# Add persistence adapter (choose one)
npm install @go-go-scope/persistence-redis
npm install @go-go-scope/persistence-postgres
npm install @go-go-scope/persistence-mongodb
```

```typescript
import { scope } from "go-go-scope";

// Create a scope with timeout
await using s = scope({ timeout: 5000 });

// Run tasks with automatic error handling
const [err1, user] = await s.task(() => fetchUser(id));
const [err2, posts] = await s.task(() => fetchPosts(id));

// Run tasks in parallel with concurrency limit
const [err3, results] = await s.parallel([
  () => fetchA(),
  () => fetchB(),
  () => fetchC(),
], { concurrency: 2 });

// Offload CPU-intensive work to worker threads (v2.4.0+)
const [err4, fib] = await s.task(
  () => computeFibonacci(1000),
  { worker: true }
);

// Use channels for Go-style concurrency
const ch = s.channel<number>({ capacity: 10 });
await ch.send(42);
const [err, value] = await ch.receive();
```

---

## 📦 Packages

### 🎯 Core

| Package | Description | Version |
|---------|-------------|---------|
| **[go-go-scope](./packages/go-go-scope)** | Core library with structured concurrency primitives | ![npm](https://img.shields.io/npm/v/go-go-scope) |
| **[@go-go-scope/scheduler](./packages/scheduler)** | Distributed job scheduler with DLQ, cron, and metrics | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler) |
| **[@go-go-scope/scheduler-tui](./packages/scheduler-tui)** | Interactive TUI and CLI for managing schedules | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler-tui) |
| **[@go-go-scope/stream](./packages/stream)** | Lazy async streams with 50+ operations | ![npm](https://img.shields.io/npm/v/@go-go-scope/stream) |
| **[@go-go-scope/testing](./packages/testing)** | Mock scopes, spies, and test utilities | ![npm](https://img.shields.io/npm/v/@go-go-scope/testing) |

### 💾 Persistence Adapters

Distributed locks, circuit breaker state, and caching for your database of choice:

| Package | Database | Features |
|---------|----------|----------|
| **[@go-go-scope/persistence-redis](./packages/persistence-redis)** | Redis | Locks, caching, circuit breaker |
| **[@go-go-scope/persistence-postgres](./packages/persistence-postgres)** | PostgreSQL | Advisory locks, table-based storage |
| **[@go-go-scope/persistence-mysql](./packages/persistence-mysql)** | MySQL | Named locks, table-based storage |
| **[@go-go-scope/persistence-mongodb](./packages/persistence-mongodb)** | MongoDB | Atomic operations, TTL indexes |
| **[@go-go-scope/persistence-dynamodb](./packages/persistence-dynamodb)** | DynamoDB | Conditional writes, single-table design |
| **[@go-go-scope/persistence-sqlite](./packages/persistence-sqlite)** | SQLite | Single-node deployments |
| **[@go-go-scope/persistence-sqlite-bun](./packages/persistence-sqlite-bun)** | SQLite (Bun) | Bun-native SQLite |
| **[@go-go-scope/persistence-cloudflare-do](./packages/persistence-cloudflare-do)** | Cloudflare Durable Objects | Edge-native distributed locks |

### 🔌 Framework Adapters

Request-scoped structured concurrency for your favorite framework:

| Package | Framework | Install |
|---------|-----------|---------|
| **[@go-go-scope/adapter-fastify](./packages/adapter-fastify)** | Fastify | `npm i @go-go-scope/adapter-fastify` |
| **[@go-go-scope/adapter-express](./packages/adapter-express)** | Express | `npm i @go-go-scope/adapter-express` |
| **[@go-go-scope/adapter-nestjs](./packages/adapter-nestjs)** | NestJS | `npm i @go-go-scope/adapter-nestjs` |
| **[@go-go-scope/adapter-hono](./packages/adapter-hono)** | Hono | `npm i @go-go-scope/adapter-hono` |
| **[@go-go-scope/adapter-elysia](./packages/adapter-elysia)** | Elysia | `npm i @go-go-scope/adapter-elysia` |
| **[@go-go-scope/adapter-koa](./packages/adapter-koa)** | Koa | `npm i @go-go-scope/adapter-koa` |
| **[@go-go-scope/adapter-hapi](./packages/adapter-hapi)** | Hapi | `npm i @go-go-scope/adapter-hapi` |
| **[@go-go-scope/adapter-react](./packages/adapter-react)** | React 18+ | `npm i @go-go-scope/adapter-react` |
| **[@go-go-scope/adapter-vue](./packages/adapter-vue)** | Vue 3 | `npm i @go-go-scope/adapter-vue` |
| **[@go-go-scope/adapter-svelte](./packages/adapter-svelte)** | Svelte 5 | `npm i @go-go-scope/adapter-svelte` |

### 🔌 Plugins

| Package | Description | Install |
|---------|-------------|---------|
| **[@go-go-scope/plugin-visualizer](./packages/plugin-visualizer)** | Real-time WebSocket dashboard | `npm i @go-go-scope/plugin-visualizer` |

---

## 📖 Documentation

| Guide | Description |
|-------|-------------|
| [📚 Quick Start](./docs/01-quick-start.md) | Get up and running in 5 minutes |
| [🧠 Core Concepts](./docs/02-concepts.md) | Why structured concurrency matters |
| [📘 API Reference](./docs/03-api-reference.md) | Complete API documentation |
| [🌊 Streams](./docs/04-streams.md) | Lazy async streams with 50+ operations |
| [🛡️ Resilience Patterns](./docs/05-resilience-patterns.md) | Circuit breakers, retry, timeouts |
| [🔧 Integrations](./docs/11-integrations.md) | Persistence and framework adapters |
| [💾 Caching](./docs/17-caching-memoization.md) | Distributed caching and memoization |
| [⚡ Performance](./docs/18-performance-optimizations.md) | Optimizations for high throughput |

---

## 🛠️ Development

This monorepo uses pnpm workspaces.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Publish all packages
pnpm publish:all
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

---

## 📄 License

MIT © [thelinuxlich](https://github.com/thelinuxlich)

---

<div align="center">

**⭐ Star us on GitHub if you find this useful!**

[🐛 Report Bug](https://github.com/thelinuxlich/go-go-scope/issues) • [💡 Request Feature](https://github.com/thelinuxlich/go-go-scope/issues)

</div>
