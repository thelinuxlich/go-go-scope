# go-go-scope - Agent Documentation

## Project Overview

go-go-scope is a TypeScript library that provides **structured concurrency** using the Explicit Resource Management proposal (TypeScript 5.2+). It enables developers to write concurrent code with automatic cleanup and cancellation propagation using the `using` and `await using` syntax.

### Key Features
- Native Resource Management via `using`/`await using` (ES2022+ Disposable symbols)
- Structured concurrency with automatic parent-child cancellation
- Built-in timeout support with automatic cancellation
- Structured racing where losers are cancelled
- Go-style channels for concurrent communication
- Semaphores for rate limiting
- Circuit breaker pattern for preventing cascading failures
- Retry logic with configurable delays and conditions
- Dependency injection via `provide()`/`use()`
- Stream processing with automatic cancellation
- Polling utilities with start/stop control
- Optional OpenTelemetry tracing integration
- Built-in debug logging via the `debug` module

## Technology Stack

- **Language**: TypeScript 5.8.3+
- **Target**: ES2022 with NodeNext module resolution
- **Required Features**: `Symbol.dispose`, `Symbol.asyncDispose` (ES2022+ or Node.js 18+)
- **Build Tool**: [pkgroll](https://github.com/privatenumber/pkgroll) v2.12.2 - Zero-config TypeScript package bundler
- **Linter/Formatter**: [Biome](https://biomejs.dev/) v1.9.4
- **Testing**: [Vitest](https://vitest.dev/) v3.2.3
- **Runtime Dependencies**: `debug` ^4.4.3 (for debug logging)
- **Peer Dependency**: `go-go-try` ^6.0.0 (for Result tuple integration)
- **Optional Peer Dependency**: `@opentelemetry/api` (for tracing)

## Project Structure

```
├── src/
│   ├── index.ts           # Main library exports (~2140 lines)
│   ├── index.test.ts      # Core functionality tests (~810 lines)
│   └── advanced.test.ts   # Advanced features tests (~687 lines)
├── dist/                  # Compiled output (generated, NOT committed)
│   ├── index.mjs          # ESM build
│   ├── index.cjs          # CommonJS build
│   ├── index.d.mts        # ESM type definitions
│   └── index.d.cts        # CommonJS type definitions
├── package.json           # Package configuration with Biome inline config
├── tsconfig.json          # TypeScript configuration (ES2022, NodeNext, strict)
├── vitest.config.ts       # Vitest test configuration (globals enabled)
├── LICENSE                # MIT License
├── README.md              # Comprehensive documentation with examples
└── AGENTS.md              # This file
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
- **Module Resolution**: NodeNext
- **Strict mode**: Enabled
- **Unused locals/parameters**: Must be clean (`noUnusedLocals`, `noUnusedParameters`)
- **Unreachable code**: Not allowed (`allowUnreachableCode: false`)
- **Unchecked indexed access**: Enabled (`noUncheckedIndexedAccess: true`)
- **Switch fallthrough**: Not allowed (`noFallthroughCasesInSwitch: true`)
- **Libs**: ES2022, ES2022.Error, ESNext.Disposable

### Naming Conventions
- Classes use PascalCase (`Task`, `Scope`, `Channel`, `Semaphore`)
- Functions use camelCase (`scope()`, `race()`, `timeout()`)
- Interfaces use PascalCase with descriptive names (`TaskOptions`, `ScopeOptions`)
- Private class members use no underscore prefix (follows modern TS)
- Type aliases use PascalCase (`Result`, `Success`, `Failure`)
- Constants use SCREAMING_SNAKE_CASE for status codes (`SpanStatusCode`)

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

#### Context Pattern for Tasks
Tasks receive a context object with services and signal:

```typescript
task<T>(fn: (ctx: { services: Services; signal: AbortSignal }) => Promise<T>): Task<Result<unknown, T>>
```

## Testing Strategy

### Test Organization
- **index.test.ts**: Core functionality
  - Task (lines 11-176)
  - Scope (lines 178-340)
  - race (lines 342-425)
  - parallel (lines 427-520)
  - AsyncDisposableResource (lines 522-594)
  - OpenTelemetry integration (lines 596-683)
  - Retry functionality (lines 685-810)
  
- **advanced.test.ts**: Advanced features
  - Channel (lines 4-220)
  - Semaphore (lines 222-400)
  - CircuitBreaker (lines 402-580)
  - stream (lines 582-687)

### Test Patterns
- Uses Vitest with globals enabled (no need to import `describe`, `test`, `expect`)
- Tests use `await using` and `using` syntax extensively
- Async cleanup is verified using event tracking
- Timeouts use actual timers (no fake timers)
- Tests verify both success and failure paths

### Running Tests
```bash
# Full test suite (builds, lints, then tests)
npm test

# Watch mode for development
npm run test:watch

# Run specific test file
npx vitest run src/index.test.ts
npx vitest run src/advanced.test.ts
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
    
    using t = s.task(async ({ signal }) => {
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

1. **Task<T>** (lines 153-240): Promise-like disposable task
   - Implements `PromiseLike<T>` for await support
   - Implements `Disposable` for `using` keyword support
   - Links to parent AbortSignal for cancellation propagation
   - Each task has a unique ID for debugging

2. **Scope<Services>** (lines 306-1060): Main structured concurrency primitive
   - Manages `AbortController` for cancellation
   - Tracks disposables for cleanup
   - Supports timeout and parent signal linking
   - Supports parent scope inheritance (services, tracer, concurrency, circuit breaker)
   - Disposes resources in LIFO order
   - Creates OpenTelemetry spans when tracer is provided
   - Methods: `task()`, `provide()`, `use()`, `race()`, `parallel()`, `channel()`, `stream()`, `poll()`

3. **AsyncDisposableResource<T>** (lines 245-288): Resource wrapper
   - Manages acquire/dispose lifecycle
   - Implements `AsyncDisposable`

4. **Channel<T>** (lines 1395-1575): Go-style buffered channel
   - Supports multiple producers/consumers
   - Implements backpressure via buffer limits
   - Implements `AsyncIterable` for `for await...of` support
   - Auto-closes on parent scope disposal
   - Methods: `send()`, `receive()`, `close()`, `[Symbol.asyncIterator]`

5. **Semaphore** (lines 1597-1716): Rate limiting primitive
   - Acquire/release pattern
   - Respects scope cancellation
   - Queue-based fairness
   - Methods: `acquire()`, `execute()`, `[Symbol.asyncDispose]`
   - Properties: `available`, `waiting`, `totalPermits`

6. **CircuitBreaker** (lines 1740-1871): Fault tolerance (internal class)
   - States: closed, open, half-open
   - Configurable failure threshold and reset timeout
   - Respects parent AbortSignal
   - Methods: `execute()`, `reset()`, `[Symbol.asyncDispose]`
   - Properties: `currentState`, `failureCount`, `failureThreshold`, `resetTimeout`

### Utility Functions

- **scope(options?)**: Factory for Scope instances (lines 1085-1089)
- **race(factories, options?)**: Race with automatic cancellation of losers (lines 1121-1200)
- **parallel(factories, options?)**: Parallel execution with concurrency limit (lines 1220-1369)
- **stream(source, signal?)**: Async iterable wrapper with cancellation (lines 1887-1913)
- **poll(fn, onValue, options?)**: Interval polling with cleanup (lines 2131-2140, deprecated in favor of `createPoll` or `scope().poll()`)
- **createPoll(fn, onValue, options?)**: Internal implementation of polling (lines 1976-2123)

### Task Execution Pipeline

When a task is spawned, it goes through a pipeline of wrappers (from innermost to outermost):

1. **Circuit Breaker** (if scope has `circuitBreaker` option)
2. **Concurrency** (if scope has `concurrency` option)
3. **Retry** (if `retry` option specified in TaskOptions)
4. **Timeout** (if `timeout` option specified in TaskOptions)
5. **Result Wrapping** (always - converts to Result tuple)

### Scope Extension Pattern

Advanced features are added to Scope as methods (lines 995-1059):

```typescript
// Scope methods that create resources:
channel<T>(capacity?: number): Channel<T>
stream<T>(source: AsyncIterable<T>): AsyncGenerator<T>
poll<T>(fn, onValue, options?): PollController
race<T>(factories): Promise<Result<unknown, T>>
parallel<T>(factories, options?): Promise<Result<unknown, T>[]>
```

### Debug Logging

The library uses the `debug` module for logging:

```typescript
import createDebug from "debug";
const debugScope = createDebug("go-go-scope:scope");
const debugTask = createDebug("go-go-scope:task");
```

Namespaces:
- `go-go-scope:scope` - Scope lifecycle events
- `go-go-scope:task` - Task lifecycle events, retry, concurrency, circuit breaker
- `go-go-scope:parallel` - Parallel execution events
- `go-go-scope:race` - Race execution events
- `go-go-scope:poll` - Polling events

Enable with: `DEBUG=go-go-scope:* node your-app.js`

## Package Exports

The package supports both ESM and CommonJS:

```json
{
  "type": "module",
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

## Dependencies

### Runtime Dependencies
- `debug` ^4.4.3 - Debug logging utility

### Peer Dependencies
- `go-go-try` ^6.0.0 - For Result type integration

### Optional Peer Dependencies
- `@opentelemetry/api` - For OpenTelemetry tracing (not listed in package.json but documented)

### Dev Dependencies
- `@biomejs/biome` ^1.9.4 - Linter/formatter
- `@types/debug` ^4.1.12 - Type definitions for debug
- `@types/node` ^22.15.17 - Type definitions for Node.js
- `pkgroll` ^2.12.2 - Build tool
- `typescript` ^5.8.3 - TypeScript compiler
- `vitest` ^3.2.3 - Test framework

## Development Workflow

1. **Make changes** to `src/index.ts` or test files
2. **Run tests**: `npm test` (this builds, lints, and tests)
3. **Check types**: TypeScript compilation happens during build
4. **Commit**: The dist/ folder should NOT be committed (it's in .gitignore)

## Security Considerations

- All async operations respect AbortSignal for cancellation
- Resources are always cleaned up in LIFO order
- The library does not execute untrusted code
- No external runtime dependencies besides `debug` (well-maintained, widely used)
- Task functions receive AbortSignal to handle cancellation safely

## Common Tasks

### Adding a New Feature
1. Add the implementation to `src/index.ts`
2. Export it from the main module
3. Add comprehensive tests to appropriate test file
4. Run `npm test` to verify
5. Update README.md with documentation and examples

### Adding Scope Methods
1. Define the method in the `Scope` class
2. Ensure the resource is registered via `this.disposables.push()` for cleanup
3. Add tests in `advanced.test.ts`

### Modifying Core Behavior
- Changes to `Task` or `Scope` affect the entire library
- Ensure AbortSignal propagation is maintained
- Verify LIFO disposal order is preserved
- Run full test suite before committing

## License

MIT License - See LICENSE file for details
