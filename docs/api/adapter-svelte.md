# adapter-svelte API Reference

> Auto-generated documentation for adapter-svelte

## Table of Contents

- [Functions](#Functions)
  - [createScope](#createscope)
  - [createTask](#createtask)
  - [createParallel](#createparallel)
  - [createChannel](#createchannel)
  - [createBroadcast](#createbroadcast)
  - [createPolling](#createpolling)
  - [createStore](#createstore)
- [Interfaces](#Interfaces)
  - [CreateScopeOptions](#createscopeoptions)
  - [ReactiveScope](#reactivescope)
  - [CreateTaskOptions](#createtaskoptions)
  - [TaskState](#taskstate)
  - [CreateParallelOptions](#createparalleloptions)
  - [ParallelState](#parallelstate)
  - [CreateChannelOptions](#createchanneloptions)
  - [ChannelState](#channelstate)
  - [BroadcastState](#broadcaststate)
  - [CreatePollingOptions](#createpollingoptions)
  - [PollingState](#pollingstate)

## Functions

### createScope

```typescript
function createScope(options: CreateScopeOptions = {}): ReactiveScope
```

Create a reactive scope that automatically disposes on component destroy. @example ```svelte <script>   const s = createScope({ name: "my-component" });   // Scope is automatically disposed when component is destroyed   const [err, result] = await s.task(() => fetchData()); </script> ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `CreateScopeOptions` |  |

**Returns:** `ReactiveScope`

**Examples:**

```svelte
<script>
  const s = createScope({ name: "my-component" });

  // Scope is automatically disposed when component is destroyed
  const [err, result] = await s.task(() => fetchData());
</script>
```

*Source: [index.ts:74](packages/adapter-svelte/src/index.ts#L74)*

---

### createTask

```typescript
function createTask<T>(factory: () => Promise<T>, options: CreateTaskOptions<T> = {}): TaskState<T>
```

Create a reactive task that integrates with Svelte's store system. Returns a store-like object that can be used with `$` prefix. @example ```svelte <script>   const task = createTask(     async () => fetchUser(userId),     { immediate: true }   ); </script> {#if $task.isLoading}   <p>Loading...</p> {:else if $task.error}   <p>Error: {$task.error.message}</p> {:else}   <p>{$task.data.name}</p> {/if} ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `() => Promise<T>` |  |
| `options` (optional) | `CreateTaskOptions<T>` |  |

**Returns:** `TaskState<T>`

**Examples:**

```svelte
<script>
  const task = createTask(
    async () => fetchUser(userId),
    { immediate: true }
  );
</script>

{#if $task.isLoading}
  <p>Loading...</p>
{:else if $task.error}
  <p>Error: {$task.error.message}</p>
{:else}
  <p>{$task.data.name}</p>
{/if}
```

*Source: [index.ts:153](packages/adapter-svelte/src/index.ts#L153)*

---

### createParallel

```typescript
function createParallel<T>(factories: (() => Promise<T>)[], options: CreateParallelOptions = {}): ParallelState<T>
```

Create reactive parallel task execution. @example ```svelte <script>   const parallel = createParallel(     urls.map(url => () => fetch(url).then(r => r.json())),     { concurrency: 3, immediate: true }   ); </script> <progress value={$parallel.progress} max="100" /> ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `(() => Promise<T>)[]` |  |
| `options` (optional) | `CreateParallelOptions` |  |

**Returns:** `ParallelState<T>`

**Examples:**

```svelte
<script>
  const parallel = createParallel(
    urls.map(url => () => fetch(url).then(r => r.json())),
    { concurrency: 3, immediate: true }
  );
</script>

<progress value={$parallel.progress} max="100" />
```

*Source: [index.ts:250](packages/adapter-svelte/src/index.ts#L250)*

---

### createChannel

```typescript
function createChannel<T>(options: CreateChannelOptions = {}): ChannelState<T>
```

Create a reactive channel for Go-style communication. @example ```svelte <script>   const ch = createChannel<string>();   async function sendMessage() {     await ch.send("Hello!");   } </script> <p>Latest: {$ch.latest}</p> <button onclick={sendMessage}>Send</button> ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `CreateChannelOptions` |  |

**Returns:** `ChannelState<T>`

**Examples:**

```svelte
<script>
  const ch = createChannel<string>();

  async function sendMessage() {
    await ch.send("Hello!");
  }
</script>

<p>Latest: {$ch.latest}</p>
<button onclick={sendMessage}>Send</button>
```

*Source: [index.ts:357](packages/adapter-svelte/src/index.ts#L357)*

---

### createBroadcast

```typescript
function createBroadcast<T>(): BroadcastState<T>
```

Create a reactive broadcast channel. @example ```svelte <script>   const bus = createBroadcast<string>();   // Subscribe   bus.subscribe(msg => console.log(msg));   function send() {     bus.broadcast("Hello!");   } </script> <p>Latest: {$bus.latest}</p> ```

**Returns:** `BroadcastState<T>`

**Examples:**

```svelte
<script>
  const bus = createBroadcast<string>();

  // Subscribe
  bus.subscribe(msg => console.log(msg));

  function send() {
    bus.broadcast("Hello!");
  }
</script>

<p>Latest: {$bus.latest}</p>
```

*Source: [index.ts:424](packages/adapter-svelte/src/index.ts#L424)*

---

### createPolling

```typescript
function createPolling<T>(factory: () => Promise<T>, options: CreatePollingOptions): PollingState<T>
```

Create a reactive polling mechanism. @example ```svelte <script>   const poller = createPolling(     async () => fetchLatestData(),     { interval: 5000, immediate: true }   ); </script> {#if $poller.data}   <p>{$poller.data}</p> {/if} <button onclick={() => $poller.stop()}>Stop</button> ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `() => Promise<T>` |  |
| `options` | `CreatePollingOptions` |  |

**Returns:** `PollingState<T>`

**Examples:**

```svelte
<script>
  const poller = createPolling(
    async () => fetchLatestData(),
    { interval: 5000, immediate: true }
  );
</script>

{#if $poller.data}
  <p>{$poller.data}</p>
{/if}
<button onclick={() => $poller.stop()}>Stop</button>
```

*Source: [index.ts:503](packages/adapter-svelte/src/index.ts#L503)*

---

### createStore

```typescript
function createStore<T>(initialValue: T)
```

// ============================================================================ // Store-like Interface (Svelte 5 compatible) // ============================================================================  Create a reactive value that can be subscribed to (Svelte store contract). Compatible with Svelte 5's `$` prefix. @example ```svelte <script>   const count = createStore(0);   function increment() {     $count++;   } </script> <button onclick={increment}>   Count: {$count} </button> ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `initialValue` | `T` |  |

**Examples:**

```svelte
<script>
  const count = createStore(0);

  function increment() {
    $count++;
  }
</script>

<button onclick={increment}>
  Count: {$count}
</button>
```

*Source: [index.ts:598](packages/adapter-svelte/src/index.ts#L598)*

---

## Interfaces

### CreateScopeOptions

```typescript
interface CreateScopeOptions
```

// ============================================================================ // Core - Scope // ============================================================================  Options for creating a scope

*Source: [index.ts:46](packages/adapter-svelte/src/index.ts#L46)*

---

### ReactiveScope

```typescript
interface ReactiveScope
```

Reactive scope with automatic cleanup

*Source: [index.ts:56](packages/adapter-svelte/src/index.ts#L56)*

---

### CreateTaskOptions

```typescript
interface CreateTaskOptions
```

// ============================================================================ // Task Store // ============================================================================  Options for creating a task

*Source: [index.ts:102](packages/adapter-svelte/src/index.ts#L102)*

---

### TaskState

```typescript
interface TaskState
```

Reactive task state

*Source: [index.ts:118](packages/adapter-svelte/src/index.ts#L118)*

---

### CreateParallelOptions

```typescript
interface CreateParallelOptions
```

// ============================================================================ // Parallel Tasks Store // ============================================================================  Options for parallel execution

*Source: [index.ts:212](packages/adapter-svelte/src/index.ts#L212)*

---

### ParallelState

```typescript
interface ParallelState
```

Reactive parallel task state

*Source: [index.ts:222](packages/adapter-svelte/src/index.ts#L222)*

---

### CreateChannelOptions

```typescript
interface CreateChannelOptions
```

// ============================================================================ // Channel Store // ============================================================================  Options for creating a channel

*Source: [index.ts:317](packages/adapter-svelte/src/index.ts#L317)*

---

### ChannelState

```typescript
interface ChannelState
```

Reactive channel state

*Source: [index.ts:327](packages/adapter-svelte/src/index.ts#L327)*

---

### BroadcastState

```typescript
interface BroadcastState
```

// ============================================================================ // Broadcast Store // ============================================================================  Reactive broadcast state

*Source: [index.ts:396](packages/adapter-svelte/src/index.ts#L396)*

---

### CreatePollingOptions

```typescript
interface CreatePollingOptions
```

// ============================================================================ // Polling Store // ============================================================================  Options for polling

*Source: [index.ts:458](packages/adapter-svelte/src/index.ts#L458)*

---

### PollingState

```typescript
interface PollingState
```

Reactive polling state

*Source: [index.ts:470](packages/adapter-svelte/src/index.ts#L470)*

---

