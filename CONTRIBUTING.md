# Contributing to go-go-scope

Thank you for your interest in contributing! This document will help you get started.

## Development Setup

### Prerequisites

- **Node.js >= 24.0.0** (we recommend using nvm)
- **pnpm >= 8.0.0**

### Installation

```bash
# Clone the repository
git clone https://github.com/thelinuxlich/go-go-scope.git
cd go-go-scope

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Monorepo Structure

```
packages/
├── go-go-scope/              # Core library
│   ├── src/
│   └── tests/
├── scheduler/                # Job scheduler with DLQ, cron, metrics
│   └── src/
├── scheduler-tui/            # CLI & TUI tools
│   ├── src/
│   │   ├── cli.ts           # CLI entry
│   │   └── tui.ts           # TUI entry
│   └── package.json
├── stream/                   # Lazy async streams
├── testing/                  # Test utilities (mock scopes, spies)
├── persistence-redis/        # Redis adapter
├── persistence-postgres/     # PostgreSQL adapter
├── persistence-mysql/        # MySQL adapter
├── persistence-mongodb/      # MongoDB adapter
├── persistence-dynamodb/     # DynamoDB adapter
├── persistence-sqlite/       # SQLite adapter
├── persistence-sqlite-bun/   # Bun SQLite adapter
├── adapter-fastify/          # Fastify plugin
├── adapter-express/          # Express middleware
├── adapter-nestjs/           # NestJS module
├── adapter-hono/             # Hono middleware
├── adapter-elysia/           # Elysia plugin
├── adapter-koa/              # Koa middleware
└── adapter-hapi/             # Hapi plugin
```

## Available Scripts

### Root Level (Monorepo-wide)

```bash
# Building
pnpm build                 # Build all packages
pnpm build:core           # Build go-go-scope only
pnpm build:scheduler      # Build @go-go-scope/scheduler only
pnpm build:tui            # Build @go-go-scope/scheduler-tui only
pnpm build:adapters       # Build all framework adapters
pnpm build:persistence    # Build all persistence adapters

# Testing & Quality
pnpm test                 # Run all tests
pnpm test:core            # Run core package tests
pnpm test:scheduler       # Run scheduler tests
pnpm typecheck            # Type check all packages
pnpm lint                 # Lint all packages

# Publishing
pnpm changeset            # Create a changeset
pnpm version-packages     # Version packages based on changesets
pnpm release              # Build and publish (uses changesets)
pnpm publish:all          # Build and publish all packages
pnpm publish:core         # Publish core only
pnpm publish:scheduler    # Publish scheduler only
pnpm publish:tui          # Publish TUI only
pnpm publish:adapters     # Publish all adapters
pnpm publish:persistence  # Publish all persistence adapters
```

### Package Level

```bash
cd packages/go-go-scope
pnpm build     # Build the package
pnpm test      # Run package tests
pnpm typecheck # Type check the package
pnpm lint      # Lint the package
```

## Running the TUI Locally

```bash
# 1. Build all packages first
pnpm build

# 2. Run the TUI with tsx (for development)
npx tsx packages/scheduler-tui/src/tui.ts

# Or with Redis
npx tsx packages/scheduler-tui/src/tui.ts -s redis -u redis://localhost:6379
```

Or use the npm script:
```bash
pnpm tui
pnpm tui:redis
```

## Running the CLI Locally

```bash
# List schedules
npx tsx packages/scheduler-tui/src/cli.ts list

# Create a schedule
npx tsx packages/scheduler-tui/src/cli.ts create daily-report \
  --cron "0 9 * * *" \
  --timezone America/New_York

# With Redis
npx tsx packages/scheduler-tui/src/cli.ts list -s redis -u redis://localhost:6379
```

Or use the npm script:
```bash
pnpm cli list
```

## Testing Changes

When making changes to multiple packages:

```bash
# 1. Make your changes
# 2. Type check to catch errors early
pnpm typecheck

# 3. Rebuild affected packages
pnpm build

# 4. Run tests
pnpm test

# 5. Test the TUI (if scheduler changes)
npx tsx packages/scheduler-tui/src/tui.ts
```

## Adding a New Package

1. Create a new directory in `packages/`
2. Add a `package.json` with the name `@go-go-scope/your-package`
3. Add a `tsconfig.json` extending `../../tsconfig.base.json`
4. Create a `src/index.ts` as the entry point
5. Add the package to the root README.md

Example `package.json`:
```json
{
  "name": "@go-go-scope/your-package",
  "version": "2.2.0",
  "type": "module",
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "scripts": {
    "build": "pkgroll --clean-dist",
    "test": "vitest run --passWithNoTests",
    "lint": "biome check --write src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "go-go-scope": "workspace:*"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.4",
    "pkgroll": "^2.26.3",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

## Code Style

We use **Biome** for linting and formatting. Run `pnpm lint` to auto-fix issues.

## Publishing (Maintainers Only)

We use [changesets](https://github.com/changesets/changesets) for versioning:

```bash
# 1. Create a changeset for your changes
pnpm changeset

# 2. Version packages (updates package.json files)
pnpm version-packages

# 3. Build and publish
pnpm release
```

Or publish all packages directly:
```bash
pnpm publish:all
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
