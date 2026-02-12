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
- go-go-scope simple task
- go-go-scope with timeout
- go-go-scope with retry
- go-go-scope parallel tasks

## Sample Output

```
Vanilla JS (simple promise)             0.69ms (0.0007ms/op)
Effect (simple)                        10.03ms (0.0100ms/op)
Effect (with retry)                    31.51ms (0.0315ms/op)
go-go-scope (simple task)              19.29ms (0.0193ms/op)
go-go-scope (with timeout)             14.77ms (0.0148ms/op)
go-go-scope (with retry)               14.71ms (0.0147ms/op)
go-go-scope (2 parallel tasks)         32.76ms (0.0328ms/op)
```

### Micro-Benchmarks (10,000 iterations)

```
Task creation (lazy, no execution):      3.4µs per task
Scope creation + disposal:               5.7µs per scope
Simple task execution overhead:         11.0µs per task
```

**Optimizations applied:**
- Lazy AbortController creation (only when signal accessed)
- Conditional debug logging (skip when disabled)
- Cached feature flags (circuit breaker, concurrency, retry, timeout)
- Removed placeholder `performance.now()` calls

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
- **Effect** has good performance but adds complexity
- **go-go-scope** adds ~0.01-0.02ms overhead per operation compared to vanilla JS
- The overhead is the cost of structured concurrency guarantees (cancellation propagation, automatic cleanup, Result tuples)

## When to Choose Each

- **Vanilla JS** - Simple scripts, when you don't need cancellation or resource management
- **Effect** - Complex functional pipelines, when you need advanced composition patterns
- **go-go-scope** - Most applications, when you want structured concurrency with minimal API surface and familiar syntax
