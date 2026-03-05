/**
 * Real-time scope visualization dashboard for go-go-scope
 *
 * Provides a WebSocket-based live visualization of scopes, tasks, and channels.
 * Open your browser to the configured port to see the dashboard.
 *
 * @example
 * ```typescript
 * import { visualizerPlugin } from "@go-go-scope/plugin-visualizer";
 *
 * await using s = scope({
 *   plugins: [visualizerPlugin({ port: 3333 })],
 * });
 *
 * // Open http://localhost:3333 to see live visualization
 * ```
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server } from "http";
import type { Scope, ScopePlugin } from "go-go-scope";

/**
 * Visualizer plugin options
 */
export interface VisualizerOptions {
	/** Port for the dashboard server (default: 3333) */
	port?: number;
	/** Host for the dashboard server (default: localhost) */
	host?: string;
	/** Update interval in ms (default: 100) */
	updateInterval?: number;
	/** Maximum history entries to keep (default: 1000) */
	maxHistory?: number;
}

/**
 * Event types for visualization
 */
type VisualizerEvent =
	| { type: "scope-created"; id: string; name: string; timestamp: number }
	| { type: "scope-disposed"; id: string; timestamp: number }
	| { type: "task-started"; id: string; scopeId: string; name: string; timestamp: number }
	| { type: "task-completed"; id: string; scopeId: string; duration: number; error?: string; timestamp: number }
	| { type: "snapshot"; scopes: ScopeSnapshot[]; timestamp: number };

/**
 * Scope snapshot for visualization
 */
interface ScopeSnapshot {
	id: string;
	name: string;
	status: "active" | "disposing" | "disposed";
	tasks: TaskSnapshot[];
	channels: ChannelSnapshot[];
	locks: string[];
	childScopes: string[];
}

/**
 * Task snapshot
 */
interface TaskSnapshot {
	id: string;
	name: string;
	status: "pending" | "running" | "completed" | "failed";
	duration?: number;
	error?: string;
}

/**
 * Channel snapshot
 */
interface ChannelSnapshot {
	id: string;
	bufferSize: number;
	itemsInBuffer: number;
	isClosed: boolean;
}

/**
 * Visualizer state
 */
class VisualizerState {
	private scopes = new Map<string, ScopeSnapshot>();
	private events: VisualizerEvent[] = [];
	private maxHistory: number;

	constructor(maxHistory: number) {
		this.maxHistory = maxHistory;
	}

	addEvent(event: VisualizerEvent): void {
		this.events.push(event);
		if (this.events.length > this.maxHistory) {
			this.events.shift();
		}

		// Update state based on event
		switch (event.type) {
			case "scope-created":
				this.scopes.set(event.id, {
					id: event.id,
					name: event.name,
					status: "active",
					tasks: [],
					channels: [],
					locks: [],
					childScopes: [],
				});
				break;

			case "scope-disposed":
				{
					const scope = this.scopes.get(event.id);
					if (scope) {
						scope.status = "disposed";
					}
				}
				break;

			case "task-started":
				{
					const scope = this.scopes.get(event.scopeId);
					if (scope) {
						scope.tasks.push({
							id: event.id,
							name: event.name,
							status: "running",
						});
					}
				}
				break;

			case "task-completed":
				{
					const scope = this.scopes.get(event.scopeId);
					if (scope) {
						const task = scope.tasks.find((t) => t.id === event.id);
						if (task) {
							task.status = event.error ? "failed" : "completed";
							task.duration = event.duration;
							task.error = event.error;
						}
					}
				}
				break;
		}
	}

	getSnapshot(): ScopeSnapshot[] {
		return Array.from(this.scopes.values());
	}

	getEvents(since?: number): VisualizerEvent[] {
		if (since === undefined) return this.events;
		return this.events.filter((e) => e.timestamp > since);
	}

	cleanupDisposed(): void {
		// Remove scopes that have been disposed for more than 30 seconds
		const cutoff = Date.now() - 30000;
		for (const [id, scope] of this.scopes.entries()) {
			if (scope.status === "disposed") {
				const lastEvent = this.events
					.filter((e) => ("id" in e && e.id === id) || ("scopeId" in e && e.scopeId === id))
					.pop();
				if (lastEvent && lastEvent.timestamp < cutoff) {
					this.scopes.delete(id);
				}
			}
		}
	}
}

/**
 * Visualizer dashboard server
 */
class VisualizerDashboard {
	private server: Server;
	private wss: WebSocketServer;
	private state: VisualizerState;
	private clients = new Set<WebSocket>();
	private updateInterval: NodeJS.Timeout | null = null;

	constructor(private options: Required<VisualizerOptions>) {
		this.state = new VisualizerState(options.maxHistory);
		this.server = createServer((req, res) => {
			this.handleHttpRequest(req, res);
		});
		this.wss = new WebSocketServer({ server: this.server });

		this.wss.on("connection", (ws) => {
			this.clients.add(ws);

			// Send initial snapshot
			ws.send(
				JSON.stringify({
					type: "snapshot",
					scopes: this.state.getSnapshot(),
					timestamp: Date.now(),
				}),
			);

			ws.on("close", () => {
				this.clients.delete(ws);
			});
		});
	}

	start(): void {
		this.server.listen(this.options.port, this.options.host, () => {
			console.log(
				`🔍 go-go-scope visualizer running at http://${this.options.host}:${this.options.port}`,
			);
		});

		// Start update loop
		this.updateInterval = setInterval(() => {
			this.broadcastUpdate();
			this.state.cleanupDisposed();
		}, this.options.updateInterval);
	}

	stop(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
		this.wss.close();
		this.server.close();
	}

	addEvent(event: VisualizerEvent): void {
		this.state.addEvent(event);

		// Broadcast immediately for real-time feel
		this.broadcastEvent(event);
	}

	private broadcastEvent(event: VisualizerEvent): void {
		const message = JSON.stringify(event);
		for (const client of this.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message);
			}
		}
	}

	private broadcastUpdate(): void {
		const snapshot = {
			type: "snapshot" as const,
			scopes: this.state.getSnapshot(),
			timestamp: Date.now(),
		};
		this.broadcastEvent(snapshot);
	}

	private handleHttpRequest(
		req: import("http").IncomingMessage,
		res: import("http").ServerResponse,
	): void {
		if (req.url === "/") {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(DASHBOARD_HTML);
		} else if (req.url === "/events") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(this.state.getEvents()));
		} else {
			res.writeHead(404);
			res.end("Not found");
		}
	}
}

/**
 * Generate unique ID for visualization
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create the visualizer plugin
 */
export function visualizerPlugin(options: VisualizerOptions = {}): ScopePlugin & {
	getDashboard: () => VisualizerDashboard | null;
} {
	const opts: Required<VisualizerOptions> = {
		port: options.port ?? 3333,
		host: options.host ?? "localhost",
		updateInterval: options.updateInterval ?? 100,
		maxHistory: options.maxHistory ?? 1000,
	};

	let dashboard: VisualizerDashboard | null = null;
	let isDashboardStarted = false;

	const plugin: ScopePlugin & {
		getDashboard: () => VisualizerDashboard | null;
	} = {
		name: "visualizer",

		getDashboard() {
			return dashboard;
		},

		install(scope: Scope) {
			// Start dashboard on first scope
			if (!isDashboardStarted) {
				dashboard = new VisualizerDashboard(opts);
				dashboard.start();
				isDashboardStarted = true;
			}

			const scopeId = generateId();
			const scopeName = (scope as unknown as { name: string }).name ?? "unnamed";

			dashboard?.addEvent({
				type: "scope-created",
				id: scopeId,
				name: scopeName,
				timestamp: Date.now(),
			});

			// Track disposal
			scope.onDispose(() => {
				dashboard?.addEvent({
					type: "scope-disposed",
					id: scopeId,
					timestamp: Date.now(),
				});
			});
		},

		cleanup() {
			// Don't stop dashboard on individual scope cleanup
		},
	};

	return plugin;
}

// HTML Dashboard
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>go-go-scope Visualizer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            line-height: 1.6;
        }
        
        .header {
            background: #1e293b;
            padding: 1rem 2rem;
            border-bottom: 1px solid #334155;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .header h1 {
            font-size: 1.5rem;
            color: #38bdf8;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
            color: #94a3b8;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .container {
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: #1e293b;
            padding: 1.5rem;
            border-radius: 0.5rem;
            border: 1px solid #334155;
        }
        
        .stat-card h3 {
            font-size: 0.875rem;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }
        
        .stat-card .value {
            font-size: 2rem;
            font-weight: 700;
            color: #38bdf8;
        }
        
        .scopes {
            display: grid;
            gap: 1rem;
        }
        
        .scope-card {
            background: #1e293b;
            border-radius: 0.5rem;
            border: 1px solid #334155;
            overflow: hidden;
        }
        
        .scope-header {
            padding: 1rem 1.5rem;
            background: #252f47;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .scope-name {
            font-weight: 600;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .scope-id {
            font-size: 0.75rem;
            color: #64748b;
            font-family: monospace;
        }
        
        .scope-status {
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .status-active { background: #064e3b; color: #34d399; }
        .status-disposed { background: #7f1d1d; color: #f87171; }
        
        .scope-body {
            padding: 1rem 1.5rem;
        }
        
        .section {
            margin-bottom: 1rem;
        }
        
        .section h4 {
            font-size: 0.75rem;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }
        
        .task-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .task-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            background: #0f172a;
            border-radius: 0.25rem;
            font-size: 0.875rem;
        }
        
        .task-status {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .task-pending { background: #94a3b8; }
        .task-running { background: #38bdf8; animation: pulse 1s infinite; }
        .task-completed { background: #22c55e; }
        .task-failed { background: #ef4444; }
        
        .task-name {
            flex: 1;
            color: #e2e8f0;
        }
        
        .task-duration {
            color: #64748b;
            font-size: 0.75rem;
        }
        
        .empty {
            color: #64748b;
            font-size: 0.875rem;
            font-style: italic;
        }
        
        .event-log {
            position: fixed;
            bottom: 1rem;
            right: 1rem;
            width: 400px;
            max-height: 300px;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 0.5rem;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .event-log h3 {
            padding: 0.75rem 1rem;
            background: #252f47;
            font-size: 0.875rem;
            color: #94a3b8;
            border-bottom: 1px solid #334155;
        }
        
        .event-list {
            overflow-y: auto;
            padding: 0.5rem;
            flex: 1;
        }
        
        .event-item {
            padding: 0.5rem;
            font-size: 0.75rem;
            border-bottom: 1px solid #334155;
            font-family: monospace;
        }
        
        .event-time {
            color: #64748b;
        }
        
        .event-type {
            color: #38bdf8;
        }
        
        .event-scope {
            color: #a78bfa;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 go-go-scope Visualizer</h1>
        <div class="status">
            <span class="status-dot"></span>
            <span id="connection-status">Connected</span>
        </div>
    </div>
    
    <div class="container">
        <div class="stats">
            <div class="stat-card">
                <h3>Active Scopes</h3>
                <div class="value" id="active-scopes">0</div>
            </div>
            <div class="stat-card">
                <h3>Total Tasks</h3>
                <div class="value" id="total-tasks">0</div>
            </div>
            <div class="stat-card">
                <h3>Running Tasks</h3>
                <div class="value" id="running-tasks">0</div>
            </div>
            <div class="stat-card">
                <h3>Events/sec</h3>
                <div class="value" id="events-rate">0</div>
            </div>
        </div>
        
        <div class="scopes" id="scopes">
            <div class="empty">No active scopes</div>
        </div>
    </div>
    
    <div class="event-log">
        <h3>Event Log</h3>
        <div class="event-list" id="event-log"></div>
    </div>
    
    <script>
        const ws = new WebSocket('ws://' + window.location.host);
        const scopes = new Map();
        const eventLog = document.getElementById('event-list');
        let eventCount = 0;
        let lastEventTime = Date.now();
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            eventCount++;
            
            if (data.type === 'snapshot') {
                updateScopes(data.scopes);
            } else {
                addEventToLog(data);
                updateStats();
            }
        };
        
        ws.onclose = () => {
            document.getElementById('connection-status').textContent = 'Disconnected';
            document.querySelector('.status-dot').style.background = '#ef4444';
        };
        
        function updateScopes(scopesData) {
            const container = document.getElementById('scopes');
            
            if (scopesData.length === 0) {
                container.innerHTML = '<div class="empty">No active scopes</div>';
                return;
            }
            
            container.innerHTML = scopesData.map(scope => \`
                <div class="scope-card">
                    <div class="scope-header">
                        <div>
                            <div class="scope-name">
                                <span>📦</span>
                                \${scope.name}
                            </div>
                            <div class="scope-id">\${scope.id.slice(0, 8)}</div>
                        </div>
                        <span class="scope-status status-\${scope.status}">\${scope.status}</span>
                    </div>
                    <div class="scope-body">
                        <div class="section">
                            <h4>Tasks (\${scope.tasks.length})</h4>
                            <div class="task-list">
                                \${scope.tasks.length === 0 
                                    ? '<div class="empty">No tasks</div>'
                                    : scope.tasks.map(task => \`
                                        <div class="task-item">
                                            <span class="task-status task-\${task.status}"></span>
                                            <span class="task-name">\${task.name}</span>
                                            \${task.duration 
                                                ? \`<span class="task-duration">\${task.duration.toFixed(1)}ms</span>\`
                                                : ''}
                                        </div>
                                    \`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            \`).join('');
            
            updateStats();
        }
        
        function addEventToLog(event) {
            const log = document.getElementById('event-log');
            const item = document.createElement('div');
            item.className = 'event-item';
            
            const time = new Date(event.timestamp).toLocaleTimeString();
            const scopeInfo = event.scopeId ? \`<span class="event-scope">[\${event.scopeId.slice(0, 6)}]</span>\` : '';
            
            item.innerHTML = \`
                <span class="event-time">\${time}</span>
                <span class="event-type">\${event.type}</span>
                \${scopeInfo}
            \`;
            
            log.insertBefore(item, log.firstChild);
            
            // Keep only last 50 events
            while (log.children.length > 50) {
                log.removeChild(log.lastChild);
            }
        }
        
        function updateStats() {
            const activeScopes = scopes.size;
            let totalTasks = 0;
            let runningTasks = 0;
            
            for (const scope of scopes.values()) {
                totalTasks += scope.tasks?.length || 0;
                runningTasks += scope.tasks?.filter(t => t.status === 'running').length || 0;
            }
            
            document.getElementById('active-scopes').textContent = activeScopes;
            document.getElementById('total-tasks').textContent = totalTasks;
            document.getElementById('running-tasks').textContent = runningTasks;
            
            // Calculate events per second
            const now = Date.now();
            const elapsed = (now - lastEventTime) / 1000;
            if (elapsed > 1) {
                const rate = (eventCount / elapsed).toFixed(1);
                document.getElementById('events-rate').textContent = rate;
                eventCount = 0;
                lastEventTime = now;
            }
        }
        
        // Update stats every second
        setInterval(updateStats, 1000);
    </script>
</body>
</html>`;

export type { VisualizerEvent };
