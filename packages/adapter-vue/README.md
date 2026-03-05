# @go-go-scope/adapter-vue

Vue 3 composables for go-go-scope. Provides reactive integration with Vue's composition API.

## Installation

```bash
npm install @go-go-scope/adapter-vue
```

## Usage

```vue
<script setup>
import { useScope, useTask, useChannel } from '@go-go-scope/adapter-vue';

// Create a reactive scope
const scope = useScope({ name: 'my-component' });

// Execute tasks with reactive state
const { data, error, isLoading, execute } = useTask(async () => {
  const response = await fetch('/api/data');
  return response.json();
}, { immediate: true });

// Use channels for communication
const channel = useChannel<string>();

async function sendMessage() {
  await channel.send('Hello!');
}
</script>

<template>
  <div>
    <p v-if="isLoading">Loading...</p>
    <p v-else-if="error">Error: {{ error.message }}</p>
    <p v-else>Data: {{ data }}</p>
    
    <button @click="sendMessage">Send Message</button>
    <p>Latest: {{ channel.latest }}</p>
  </div>
</template>
```

## API

### `useScope(options?)`
Creates a reactive scope that auto-disposes on component unmount.

### `useTask(factory, options?)`
Creates a reactive task with `data`, `error`, `isLoading`, `isReady`, and `execute()`.

### `useParallel(factories, options?)`
Executes tasks in parallel with progress tracking.

### `useChannel(options?)`
Creates a reactive channel for Go-style communication.

### `useBroadcast()`
Creates a reactive broadcast channel for pub/sub patterns.

### `usePolling(factory, options)`
Creates a reactive polling mechanism.

## License

MIT
