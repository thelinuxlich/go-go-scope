# Rate Limiting

Control the rate of execution with debounce, throttle, and concurrency limits.

## Table of Contents

- [Debounce](#debounce)
- [Throttle](#throttle)
- [Concurrency Limits](#concurrency-limits)

---

## Debounce

Delays function execution until after `wait` milliseconds have elapsed since the last call.

### Basic Usage

```typescript
await using s = scope()

const search = s.debounce(async (query: string) => {
  const response = await fetch(`/api/search?q=${query}`)
  return response.json()
}, { wait: 300 })

// Only executes 300ms after typing stops
const [err, results] = await search("hello world")
```

**Options:**
- `wait`: Milliseconds to delay (default: 300)
- `leading`: Execute on the leading edge (default: false)
- `trailing`: Execute on the trailing edge (default: true)

### Use Case: Search Input

```typescript
const search = s.debounce(async (query: string) => {
  const results = await fetchSearchResults(query)
  updateSearchResults(results)
}, { wait: 300 })

// In your input handler
input.oninput = (e) => search(e.target.value)
```

---

## Throttle

Limits function execution to once per `interval` milliseconds.

### Basic Usage

```typescript
await using s = scope()

const save = s.throttle(async (data: string) => {
  await saveToServer(data)
}, { interval: 1000 })

// Executes at most once per second
await save("data1")
await save("data2") // Throttled
await save("data3") // Throttled
```

**Options:**
- `interval`: Milliseconds between executions (default: 300)
- `leading`: Execute on the leading edge (default: true)
- `trailing`: Execute on the trailing edge (default: false)

### Use Case: Auto-save

```typescript
const autoSave = s.throttle(async (content: string) => {
  await saveDocument(content)
  showSaveIndicator()
}, { interval: 5000, trailing: true })

// On every keystroke
editor.onchange = (e) => autoSave(e.target.value)
```

---

## Concurrency Limits

Limit the number of concurrent tasks within a scope.

### Basic Usage

```typescript
// All tasks in this scope are limited to 5 concurrent
await using s = scope({ concurrency: 5 })

await s.parallel(
  urls.map(url => () => fetch(url))
)
```

### Use Cases

1. **Rate limiting API calls:**

```typescript
await using s = scope({ concurrency: 10 })

const results = await s.parallel(
  apiEndpoints.map(endpoint => () => callApi(endpoint))
)
```

2. **Controlling database connections:**

```typescript
await using s = scope({ concurrency: 3 })
  .provide('db', () => createConnectionPool(3))

// Only 3 queries at a time
const results = await s.parallel(
  queries.map(q => ({ services }) => services.db.query(q))
)
```

3. **Preventing resource exhaustion:**

```typescript
await using s = scope({ concurrency: 5 })

for (const file of files) {
  // Even though we create many tasks, only 5 run concurrently
  s.task(() => processFile(file))
}
```

---

## Comparison: Debounce vs Throttle

| Feature | Debounce | Throttle |
|---------|----------|----------|
| When it runs | After pause in calls | At most once per interval |
| Use case | Search input | Auto-save, scroll handlers |
| Leading option | Rarely used | Often enabled |
| Trailing option | Usually enabled | Optional |

---

## Next Steps

- **[Testing](./08-testing.md)** - Testing utilities and patterns
- **[Advanced Patterns](./09-advanced-patterns.md)** - Resource pools, parent-child scopes
