# @go-go-scope/plugin-visualizer

Real-time WebSocket-based dashboard for visualizing go-go-scope operations.

## Installation

```bash
npm install @go-go-scope/plugin-visualizer
```

## Usage

```typescript
import { scope } from 'go-go-scope';
import { visualizerPlugin, VisualizerDashboard } from '@go-go-scope/plugin-visualizer';

// Create a scope with the visualizer plugin
const s = scope({
  plugins: [visualizerPlugin()]
});

// Or run a standalone dashboard
const dashboard = new VisualizerDashboard({
  port: 3333,
  updateInterval: 100,
  maxHistory: 1000
});

await dashboard.start();

// Open http://localhost:3333 in your browser
// to see real-time scope, task, and channel visualization
```

## Features

- Real-time WebSocket updates
- Visualize scope hierarchy and lifecycle
- Track task execution and performance
- Monitor channel operations
- HTML dashboard with live charts

## Options

```typescript
interface VisualizerOptions {
  port?: number;           // Default: 3333
  host?: string;           // Default: localhost
  updateInterval?: number; // Default: 100ms
  maxHistory?: number;     // Default: 1000 events
}
```

## License

MIT
