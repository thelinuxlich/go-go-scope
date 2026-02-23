# Contributing to go-go-scope

## Development Setup

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0

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

### Running the TUI Locally

```bash
# From the monorepo root

# 1. Build all packages first
pnpm build

# 2. Run the TUI with tsx (for development)
npx tsx packages/scheduler-tui/src/tui.ts

# Or with Redis
npx tsx packages/scheduler-tui/src/tui.ts -s redis -u redis://localhost:6379
```

### Running the CLI Locally

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

### Package Scripts

```bash
# Root level
pnpm build          # Build all packages
pnpm build:core     # Build go-go-scope only
pnpm build:scheduler # Build @go-go-scope/scheduler only
pnpm build:tui      # Build @go-go-scope/scheduler-tui only
pnpm test           # Run all tests
pnpm lint           # Lint all packages

# Package level
cd packages/scheduler-tui
pnpm build          # Build the TUI package
pnpm test           # Run package tests
```

### Testing Changes

When making changes to multiple packages:

```bash
# 1. Make your changes
# 2. Rebuild
pnpm build

# 3. Test the TUI
npx tsx packages/scheduler-tui/src/tui.ts
```

### Package Structure

```
packages/
├── go-go-scope/       # Core library
│   ├── src/
│   └── tests/
├── scheduler/         # Job scheduler
│   └── src/
└── scheduler-tui/     # CLI & TUI tools
    ├── src/
    │   ├── cli.ts     # CLI entry
    │   └── tui.ts     # TUI entry
    └── package.json
```

### Publishing

```bash
# Create changeset
pnpm changeset

# Version packages
pnpm version-packages

# Publish
pnpm release
```

## License

MIT
