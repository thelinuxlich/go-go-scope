# @go-go-scope/adapter-svelte

Svelte 5 runes integration for go-go-scope. Provides reactive stores that work with Svelte's `$` prefix.

## Installation

```bash
npm install @go-go-scope/adapter-svelte
```

## Usage

```svelte
<script>
  import { createScope, createTask, createChannel } from '@go-go-scope/adapter-svelte';

  // Create a reactive scope
  const scope = createScope({ name: 'my-component' });

  // Execute tasks with reactive state
  const task = createTask(async () => {
    const response = await fetch('/api/data');
    return response.json();
  }, { immediate: true });

  // Use channels for communication
  const channel = createChannel<string>();

  async function sendMessage() {
    await channel.send('Hello!');
  }
</script>

<div>
  {#if $task.isLoading}
    <p>Loading...</p>
  {:else if $task.error}
    <p>Error: {$task.error.message}</p>
  {:else}
    <p>Data: {$task.data}</p>
  {/if}
  
  <button onclick={sendMessage}>Send Message</button>
  <p>Latest: {$channel.latest}</p>
</div>
```

## API

### `createScope(options?)`
Creates a reactive scope that auto-disposes on component destroy.

### `createTask(factory, options?)`
Creates a reactive task store with `data`, `error`, `isLoading`, `isReady`, and `execute()`.

### `createParallel(factories, options?)`
Executes tasks in parallel with reactive progress tracking.

### `createChannel(options?)`
Creates a reactive channel for Go-style communication.

### `createBroadcast()`
Creates a reactive broadcast channel for pub/sub patterns.

### `createPolling(factory, options)`
Creates a reactive polling mechanism.

### `createStore(initialValue)`
Creates a simple reactive store compatible with Svelte's `$` prefix.

## License

MIT
