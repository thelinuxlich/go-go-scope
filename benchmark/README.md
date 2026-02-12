# Structured Concurrency Benchmark

This benchmark compares three approaches to structured concurrency:

1. **Vanilla JS** - Using native `AbortController` and `Promise`
2. **Effect** - The popular `effect-ts` library
3. **go-go-scope** - This library

## Running the Benchmark

```bash
# Install dependencies (effect is included as a dev dependency)
npm install

# Run the benchmark
npx tsx benchmark/comparison.ts
```

## What's Compared

### Examples

1. **Basic Scoped Operations with Timeout** - Simple async operations with automatic cancellation
2. **Parallel Execution** - Running multiple operations concurrently with proper error handling
3. **Race Operations** - First-to-complete wins, losers cancelled
4. **Retry Logic** - Automatic retry with configurable delays
5. **Resource Management** - Dependency injection with automatic cleanup

### Performance

The benchmark runs 1000 iterations of each pattern to measure overhead:
- Simple promise resolution
- Effect simple operation
- Effect with retry
- Effect with timeout
- Effect parallel tasks
- Effect race
- go-go-scope simple task
- go-go-scope with timeout
- go-go-scope with retry
- go-go-scope parallel tasks
- go-go-scope race

## Sample Output

```
Vanilla JS (simple promise)             0.70ms (0.0007ms/op)
Effect (simple)                        10.00ms (0.0100ms/op)
Effect (with retry)                    30.90ms (0.0309ms/op)
Effect (with timeout)                  77.92ms (0.0779ms/op)
Effect (2 parallel tasks)              25.68ms (0.0257ms/op)
Effect (race)                          21.49ms (0.0215ms/op)
go-go-scope (simple task)              12.72ms (0.0127ms/op)
go-go-scope (with timeout)             16.99ms (0.0170ms/op)
go-go-scope (with retry)                8.22ms (0.0082ms/op)
go-go-scope (2 parallel tasks)         10.26ms (0.0103ms/op)
go-go-scope (race)                     47.97ms (0.0480ms/op)
```

### Micro-Benchmarks (10,000 iterations)

| Operation | go-go-scope | Effect | Winner |
|-----------|-------------|--------|--------|
| Task creation (lazy, no execution) | 2.6µs | 1.2µs | Effect |
| Scope creation + disposal | 7.4µs | 1.6µs | Effect |
| Simple task execution overhead | 10.2µs | 4.3µs | Effect |
| 3 parallel tasks (1000 iter) | 0.011ms | 0.009ms | Effect |
| Retry (1 retry, 1000 iter) | 0.007ms | 0.016ms | go-go-scope |
| Timeout (5000ms, 1000 iter) | 0.007ms | 0.041ms | go-go-scope |
| Race (2 tasks, 1000 iter) | 0.020ms | 0.014ms | Effect |

**Key findings:**
- Effect has lower overhead for simple operations and scope creation
- go-go-scope has lower overhead for retry and timeout operations
- Both libraries perform similarly for parallel and race operations

**Optimizations applied:**
- Lazy AbortController creation (only when signal accessed)
- Conditional debug logging (skip when disabled)
- Cached feature flags (circuit breaker, concurrency, retry, timeout)
- Removed placeholder `performance.now()` calls
- **Array copy elimination** in scope disposal (reversed iteration instead of spread)
- **Circuit breaker state caching** (avoids repeated `Date.now()` calls)
- **Channel O(n) → O(1)** (head/tail index pointers instead of `Array.shift()`)
- **const enum** for SpanStatusCode (compile-time inlining)

## Key Takeaways

| Approach | Verbose | Learning Curve | Structured Concurrency | Cancellation |
|----------|---------|----------------|----------------------|--------------|
| Vanilla JS | High | Low | ❌ Manual | ❌ Manual |
| Effect | Medium | High | ✅ Built-in | ✅ Built-in |
| go-go-scope | Low | Low | ✅ Built-in | ✅ Built-in |

### Code Size Comparison

**Vanilla JS** - 20+ lines for proper timeout + cancellation:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), 100);
try {
  const user = await fetchUser(1);
  clearTimeout(timeoutId);
} catch (err) {
  clearTimeout(timeoutId);
  throw err;
}
```

**Effect** - Functional, requires understanding of Effect's ecosystem:
```typescript
const program = Effect.gen(function* () {
  const user = yield* Effect.tryPromise({
    try: () => fetchUser(1),
    catch: (e) => new Error(String(e)),
  });
  return user;
});
const withTimeout = Effect.timeout(program, "100 millis");
const result = await Effect.runPromise(Effect.either(withTimeout));
```

**go-go-scope** - Minimal, uses familiar async/await:
```typescript
await using s = scope({ timeout: 100 });
const [err, user] = await s.task(() => fetchUser(1));
```

### Performance Notes

- **Vanilla JS** is fastest but lacks structured concurrency guarantees
- **Effect** has lower overhead for basic operations (~4µs per task vs ~10µs for go-go-scope)
- **go-go-scope** adds ~0.01ms overhead per operation compared to vanilla JS
- **Trade-off**: go-go-scope excels at retry/timeout operations (2-6x faster than Effect)
- The overhead is the cost of structured concurrency guarantees (cancellation propagation, automatic cleanup, Result tuples)
- Choose Effect for maximum performance in simple pipelines; choose go-go-scope for better ergonomics and faster retry/timeout handling

## When to Choose Each

- **Vanilla JS** - Simple scripts, when you don't need cancellation or resource management
- **Effect** - Complex functional pipelines, when you need advanced composition patterns
- **go-go-scope** - Most applications, when you want structured concurrency with minimal API surface and familiar syntax
