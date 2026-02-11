# go-go-scope - Agent Documentation

## Project Overview

go-go-scope is a TypeScript library that provides **structured concurrency** using the Explicit Resource Management proposal (TypeScript 5.2+). It enables developers to write concurrent code with automatic cleanup and cancellation propagation using the `using` and `await using` syntax.

### Key Features
- Native Resource Management via `using`/`await using`
- Structured concurrency with automatic parent-child cancellation
- Built-in timeout support with automatic cancellation
- Structured racing where losers are cancelled
- Go-style channels for concurrent communication
- Semaphores for rate limiting
- Circuit breaker pattern for preventing cascading failures
- Stream processing with automatic cancellation
- Polling utilities

## Technology Stack

- **Language**: TypeScript 5.8.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 18+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) - Zero-config TypeScript package bundler
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v1.9.4
- **Testing**: [Vitest](https://vitest.dev/) v3.2.3
- **Peer Dependency**: `go-go-try` ^6.0.0 (for Result tuple integration)

## Project Structure

```
├── src/
│   ├── index.ts           # Main library exports (~1300 lines)
│   ├── index.test.ts      # Core functionality tests (~810 lines)
│   └── advanced.test.ts   # Advanced features tests (~687 lines)
├── dist/                  # Compiled output (generated)
│   ├── index.mjs          # ESM build
│   ├── index.cjs          # CommonJS build
│   ├── index.d.mts        # ESM type definitions
│   └── index.d.cts        # CommonJS type definitions
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Vitest test configuration
├── LICENSE                # MIT License
└── README.md              # Comprehensive documentation with examples
```

## Build Commands

```bash
# Build the project (outputs to dist/)
npm run build

# Run all tests (builds first, then lints, then tests)
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Lint and auto-fix code
npm run lint
```

## Code Style Guidelines

### Linting
- Uses **Biome** for linting and formatting
- Configuration is inline in `package.json` (no separate biome.json)
- Run `npm run lint` to auto-fix issues

### TypeScript Configuration
- **Target**: ES2022
- **Module**: NodeNext
- **Strict mode**: Enabled
- **Unused locals/parameters**: Must be clean (noUnusedLocals, noUnusedParameters)
- **Unreachable code**: Not allowed
- **Unchecked indexed access**: Enabled (requires explicit undefined checks)

### Naming Conventions
- Classes use PascalCase (`Task`, `Scope`, `Channel`)
- Functions use camelCase (`scope()`, `race()`, `timeout()`)
- Interfaces use PascalCase with descriptive names
- Private class members use no underscore prefix (follows modern TS)
- Type aliases use PascalCase (`Result`, `Success`, `Failure`)

### Code Patterns

#### Explicit Resource Management
All disposable resources implement `Disposable` or `AsyncDisposable`:

```typescript
// Synchronous disposal
export class Task<T> implements PromiseLike<T>, Disposable {
    [Symbol.dispose](): void {
        // cleanup
    }
}

// Asynchronous disposal  
export class Scope implements AsyncDisposable {
    async [Symbol.asyncDispose](): Promise<void> {
        // async cleanup
    }
}
```

#### AbortSignal Propagation
All task functions receive an `AbortSignal` for cancellation:

```typescript
export type TaskFactory<T> = (signal: AbortSignal) => Promise<T>;
```

#### Result Tuples (go-go-try integration)
Functions that should not throw return Result tuples:

```typescript
export type Result<E, T> = readonly [E | undefined, T | undefined];
export type Success<T> = readonly [undefined, T];
export type Failure<E> = readonly [E, undefined];
```

## Testing Strategy

### Test Organization
- **index.test.ts**: Core functionality (Task, Scope, race, timeout, parallel, parallelResults)
- **advanced.test.ts**: Advanced features (Channel, Semaphore, CircuitBreaker, stream, poll)

### Test Patterns
- Uses Vitest with globals enabled
- Tests use `await using` and `using` syntax extensively
- Async cleanup is verified using event tracking
- Timeouts use actual timers (no fake timers)

### Running Tests
```bash
# Full test suite (builds first)
npm test

# Watch mode for development
npm run test:watch

# Run specific test file
npx vitest run src/index.test.ts
```

### Writing New Tests
- Use `describe` and `test` from vitest (globals enabled)
- Test both success and failure paths
- Verify cleanup happens correctly
- Test AbortSignal propagation
- Use small timeouts (10-100ms) to keep tests fast

Example test pattern:
```typescript
test("cancels when scope disposed", async () => {
    const s = scope();
    let aborted = false;
    
    using t = s.spawn(async (signal) => {
        return new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
            });
        });
    });
    
    await s[Symbol.asyncDispose]().catch(() => {});
    await new Promise((r) => setTimeout(r, 10)); // Allow propagation
    
    expect(aborted).toBe(true);
});
```

## Architecture Details

### Core Classes

1. **Task<T>** (lines 31-101): Promise-like disposable task
   - Implements `PromiseLike<T>` for await support
   - Implements `Disposable` for `using` keyword support
   - Links to parent AbortSignal for cancellation propagation

2. **Scope** (lines 165-317): Main structured concurrency primitive
   - Manages `AbortController` for cancellation
   - Tracks disposables for cleanup
   - Supports timeout and parent signal linking
   - Disposes resources in LIFO order

3. **AsyncDisposableResource<T>** (lines 106-149): Resource wrapper
   - Manages acquire/dispose lifecycle
   - Implements `AsyncDisposable`

4. **Channel<T>** (lines 666-846): Go-style buffered channel
   - Supports multiple producers/consumers
   - Implements backpressure via buffer limits
   - Implements `AsyncIterable` for `for await...of` support
   - Auto-closes on parent scope disposal

5. **Semaphore** (lines 864-969): Rate limiting primitive
   - Acquire/release pattern
   - Respects scope cancellation
   - Queue-based fairness

6. **CircuitBreaker** (lines 1001-1118): Fault tolerance
   - States: closed, open, half-open
   - Configurable failure threshold and reset timeout
   - Respects parent AbortSignal

### Utility Functions

- **scope(options?)**: Factory for Scope instances
- **race(factories, options?)**: Race with automatic cancellation of losers
- **timeout(ms, fn, options?)**: Timeout wrapper with signal
- **parallel(factories, options?)**: Parallel execution with concurrency limit
- **parallelResults(factories, options?)**: Parallel with Result tuples
- **stream(source, signal?)**: Async iterable wrapper with cancellation
- **poll(fn, onValue, options?)**: Interval polling with cleanup

### Scope Extension Pattern
Advanced features are added to Scope via prototype augmentation (lines 1237-1297):

```typescript
declare module "." {
    interface Scope {
        channel<T>(capacity?: number): Channel<T>;
        semaphore(permits: number): Semaphore;
        // ... etc
    }
}

Scope.prototype.channel = function <T>(capacity = 0): Channel<T> {
    // implementation
};
```

## Package Exports

The package supports both ESM and CommonJS:

```json
{
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    "require": {
      "types": "./dist/index.d.cts",
      "default": "./dist/index.cjs"
    },
    "import": {
      "types": "./dist/index.d.mts",
      "default": "./dist/index.mjs"
    }
  }
}
```

## Peer Dependency

The library has a peer dependency on `go-go-try` ^6.0.0 for Result type integration. Users should install both:

```bash
npm install go-go-scope go-go-try
```

## Development Workflow

1. **Make changes** to `src/index.ts` or test files
2. **Run tests**: `npm test` (this builds, lints, and tests)
3. **Check types**: TypeScript compilation happens during build
4. **Commit**: The dist/ folder should NOT be committed (it's in .gitignore)

## Security Considerations

- All async operations respect AbortSignal for cancellation
- Resources are always cleaned up in LIFO order
- The library does not execute untrusted code
- No external runtime dependencies (only devDependencies and peerDependencies)

## Common Tasks

### Adding a New Feature
1. Add the implementation to `src/index.ts`
2. Export it from the main module
3. Add comprehensive tests to appropriate test file
4. Run `npm test` to verify
5. Update README.md with documentation and examples

### Adding Scope Methods
1. Define the method in the `declare module "."` interface (around line 1239)
2. Implement on `Scope.prototype` (around line 1258)
3. Ensure the resource is registered via `this.acquire()` for cleanup
4. Add tests in `advanced.test.ts`

### Modifying Core Behavior
- Changes to `Task` or `Scope` affect the entire library
- Ensure AbortSignal propagation is maintained
- Verify LIFO disposal order is preserved
- Run full test suite before committing
