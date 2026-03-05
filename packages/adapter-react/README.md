# @go-go-scope/adapter-react

React hooks for go-go-scope. Provides reactive integration with React's hooks API.

## Installation

```bash
npm install @go-go-scope/adapter-react
```

## Usage

```tsx
import { useScope, useTask, useChannel } from '@go-go-scope/adapter-react';

function UserProfile({ userId }: { userId: string }) {
  // Create a reactive scope
  const scope = useScope({ name: "UserProfile" });

  // Execute tasks with reactive state
  const { data, error, isLoading, execute } = useTask(
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      return response.json();
    },
    { immediate: true }
  );

  // Use channels for communication
  const channel = useChannel<string>();

  const sendMessage = async () => {
    await channel.send("Hello!");
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{data?.name}</h1>
      <p>Latest message: {channel.latest}</p>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
}
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
