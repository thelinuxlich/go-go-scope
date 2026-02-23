# go-go-scope Monorepo

> Structured concurrency for TypeScript using Explicit Resource Management

This is a monorepo containing the go-go-scope ecosystem of packages.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`go-go-scope`](./packages/go-go-scope) | Core library with structured concurrency primitives | ![npm](https://img.shields.io/npm/v/go-go-scope) |
| [`@go-go-scope/scheduler`](./packages/scheduler) | Distributed job scheduler with admin + workers architecture | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler) |
| [`@go-go-scope/scheduler-tui`](./packages/scheduler-tui) | Interactive TUI and CLI for managing schedules | ![npm](https://img.shields.io/npm/v/@go-go-scope/scheduler-tui) |

## Quick Start

### Installation

```bash
# Core library only
npm install go-go-scope

# With scheduler
npm install go-go-scope @go-go-scope/scheduler

# With TUI tools
npm install -g @go-go-scope/scheduler-tui
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
│   ├── go-go-scope/        # Core library
│   ├── scheduler/           # Job scheduler
│   └── scheduler-tui/       # CLI and TUI tools
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
