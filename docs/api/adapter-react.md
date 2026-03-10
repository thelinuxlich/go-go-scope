# adapter-react API Reference

> Auto-generated documentation for adapter-react

## Table of Contents

- [Functions](#Functions)
  - [useScope](#usescope)
  - [useTask](#usetask)
  - [useParallel](#useparallel)
  - [useChannel](#usechannel)
  - [useBroadcast](#usebroadcast)
  - [usePolling](#usepolling)
- [Interfaces](#Interfaces)
  - [UseScopeOptions](#usescopeoptions)
  - [UseTaskOptions](#usetaskoptions)
  - [TaskState](#taskstate)
  - [UseParallelOptions](#useparalleloptions)
  - [ParallelState](#parallelstate)
  - [UseChannelOptions](#usechanneloptions)
  - [ChannelState](#channelstate)
  - [BroadcastState](#broadcaststate)
  - [UsePollingOptions](#usepollingoptions)
  - [PollingState](#pollingstate)

## Functions

### useScope

```typescript
function useScope(options: UseScopeOptions = {}): Scope<Record<string, unknown>>
```

React hook that creates a reactive scope. The scope automatically disposes when the component unmounts.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `UseScopeOptions` |  |

**Returns:** `Scope<Record<string, unknown>>`

**Examples:**

```tsx
function MyComponent() {
  const s = useScope({ name: "MyComponent" });

  const handleClick = async () => {
    const [err, result] = await s.task(() => fetchData());
    // Handle result...
  };

  return <button onClick={handleClick}>Fetch</button>;
}
```

*Source: [index.ts:74](packages/adapter-react/src/index.ts#L74)*

---

### useTask

```typescript
function useTask<T>(factory: (signal: AbortSignal) => Promise<T>, options: UseTaskOptions<T> = {}): TaskState<T>
```

React hook for executing tasks with structured concurrency.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `(signal: AbortSignal) => Promise<T>` |  |
| `options` (optional) | `UseTaskOptions<T>` |  |

**Returns:** `TaskState<T>`

**Examples:**

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useTask(
    async () => fetchUser(userId),
    { immediate: true }
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{data?.name}</div>;
}
```

*Source: [index.ts:146](packages/adapter-react/src/index.ts#L146)*

---

### useParallel

```typescript
function useParallel<T>(factories: (() => Promise<T>)[], options: UseParallelOptions = {}): ParallelState<T>
```

React hook for executing tasks in parallel.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `(() => Promise<T>)[]` |  |
| `options` (optional) | `UseParallelOptions` |  |

**Returns:** `ParallelState<T>`

**Examples:**

```tsx
function Dashboard() {
  const factories = [
    () => fetchUsers(),
    () => fetchPosts(),
    () => fetchComments(),
  ];

  const { results, isLoading, progress } = useParallel(factories, {
    concurrency: 2,
    immediate: true
  });

  if (isLoading) return <progress value={progress} max="100" />;

  const [users, posts, comments] = results;
  return <DashboardView {...{ users, posts, comments }} />;
}
```

*Source: [index.ts:253](packages/adapter-react/src/index.ts#L253)*

---

### useChannel

```typescript
function useChannel<T>(options: UseChannelOptions = {}): ChannelState<T>
```

React hook for Go-style channel communication.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `UseChannelOptions` |  |

**Returns:** `ChannelState<T>`

**Examples:**

```tsx
function Chat() {
  const ch = useChannel<string>();

  const handleSubmit = async (message: string) => {
    await ch.send(message);
  };

  return (
    <div>
      <p>Latest: {ch.latest}</p>
      <ul>
        {ch.history.map((msg, i) => <li key={i}>{msg}</li>)}
      </ul>
    </div>
  );
}
```

*Source: [index.ts:370](packages/adapter-react/src/index.ts#L370)*

---

### useBroadcast

```typescript
function useBroadcast<T>(): BroadcastState<T>
```

React hook for pub/sub broadcast channels.

**Returns:** `BroadcastState<T>`

**Examples:**

```tsx
function EventBus() {
  const bus = useBroadcast<string>();

  useEffect(() => {
    const sub = bus.subscribe((msg) => console.log(msg));
    return () => sub.unsubscribe();
  }, []);

  return <button onClick={() => bus.broadcast("Hello!")}>Send</button>;
}
```

*Source: [index.ts:453](packages/adapter-react/src/index.ts#L453)*

---

### usePolling

```typescript
function usePolling<T>(factory: () => Promise<T>, options: UsePollingOptions): PollingState<T>
```

React hook for polling data at intervals.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `() => Promise<T>` |  |
| `options` | `UsePollingOptions` |  |

**Returns:** `PollingState<T>`

**Examples:**

```tsx
function LiveData() {
  const { data, isPolling, stop } = usePolling(
    async () => fetchLatestData(),
    { interval: 5000, immediate: true }
  );

  return (
    <div>
      <p>{data}</p>
      {isPolling && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

*Source: [index.ts:554](packages/adapter-react/src/index.ts#L554)*

---

## Interfaces

### UseScopeOptions

```typescript
interface UseScopeOptions
```

// ============================================================================ // useScope Hook // ============================================================================ Options for useScope hook

*Source: [index.ts:49](packages/adapter-react/src/index.ts#L49)*

---

### UseTaskOptions

```typescript
interface UseTaskOptions
```

// ============================================================================ // useTask Hook // ============================================================================ Options for useTask hook

*Source: [index.ts:100](packages/adapter-react/src/index.ts#L100)*

---

### TaskState

```typescript
interface TaskState
```

State returned by useTask hook

*Source: [index.ts:116](packages/adapter-react/src/index.ts#L116)*

---

### UseParallelOptions

```typescript
interface UseParallelOptions
```

// ============================================================================ // useParallel Hook // ============================================================================ Options for useParallel hook

*Source: [index.ts:206](packages/adapter-react/src/index.ts#L206)*

---

### ParallelState

```typescript
interface ParallelState
```

State returned by useParallel hook

*Source: [index.ts:216](packages/adapter-react/src/index.ts#L216)*

---

### UseChannelOptions

```typescript
interface UseChannelOptions
```

// ============================================================================ // useChannel Hook // ============================================================================ Options for useChannel hook

*Source: [index.ts:324](packages/adapter-react/src/index.ts#L324)*

---

### ChannelState

```typescript
interface ChannelState
```

State returned by useChannel hook

*Source: [index.ts:334](packages/adapter-react/src/index.ts#L334)*

---

### BroadcastState

```typescript
interface BroadcastState
```

// ============================================================================ // useBroadcast Hook // ============================================================================ State returned by useBroadcast hook

*Source: [index.ts:427](packages/adapter-react/src/index.ts#L427)*

---

### UsePollingOptions

```typescript
interface UsePollingOptions
```

// ============================================================================ // usePolling Hook // ============================================================================ Options for usePolling hook

*Source: [index.ts:507](packages/adapter-react/src/index.ts#L507)*

---

### PollingState

```typescript
interface PollingState
```

State returned by usePolling hook

*Source: [index.ts:519](packages/adapter-react/src/index.ts#L519)*

---

