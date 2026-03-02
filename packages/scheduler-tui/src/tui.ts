#!/usr/bin/env node

/**
 * go-go-scope Scheduler Simple TUI
 *
 * Lightweight interactive TUI using ANSI escape codes (no React needed).
 * Provides real-time monitoring and control of the scheduler.
 *
 * Usage:
 *   npx go-go-scheduler-tui
 *   npx go-go-scheduler-tui --storage redis --url redis://localhost:6379
 *
 * Controls:
 *   ↑/↓            Navigate
 *   Enter          View details / Trigger
 *   p              Pause/Resume schedule
 *   d              Disable schedule
 *   t              Trigger schedule
 *   r              Refresh
 *   q or Ctrl+C    Quit
 */

import readline from "node:readline";
import { parseArgs } from "node:util";
import {
	InMemoryJobStorage,
	type JobStorage,
	Scheduler,
	ScheduleState,
	type ScheduleStats,
} from "@go-go-scope/scheduler";
import { scope } from "go-go-scope";

// ANSI escape codes
const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

// Colors
const colors = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	bgCyan: "\x1b[46m",
	bgBlack: "\x1b[40m",
};

function color(c: keyof typeof colors, text: string): string {
	return `${colors[c]}${text}${colors.reset}`;
}

// Create storage
async function createStorage(
	args: Record<string, string | boolean | undefined>,
) {
	const storageType = args.storage || args.s || "memory";

	switch (storageType) {
		case "memory":
			return new InMemoryJobStorage();

		case "redis": {
			const [{ RedisJobStorage }, { RedisAdapter }, RedisModule] =
				await Promise.all([
					import("@go-go-scope/scheduler"),
					import("@go-go-scope/persistence-redis"),
					import("ioredis"),
				]);

			const url = args.url || args.u || "redis://localhost:6379";
			// @ts-expect-error - ioredis ESM import
			const redis = new (RedisModule.default || RedisModule)(url);
			const adapter = new RedisAdapter(redis);
			return new RedisJobStorage(redis, adapter, { keyPrefix: "scheduler:" });
		}

		default:
			throw new Error(`Unknown storage type: ${storageType}`);
	}
}

// Draw UI
class TUI {
	private schedules: ScheduleStats[] = [];
	private selectedIndex = 0;
	private loading = true;
	private error: string | null = null;
	private lastRefresh = new Date();
	private view: "list" | "detail" = "list";
	private running = true;
	private scheduler: Scheduler | null = null;
	private refreshInterval: NodeJS.Timeout | null = null;

	constructor(private storage: JobStorage) {}

	async init() {
		const s = scope();
		this.scheduler = new Scheduler({
			scope: s,
			storage: this.storage,
			autoStart: false,
		});

		await this.refresh();
		this.startRefreshTimer();
		this.setupInput();
	}

	private async refresh() {
		if (!this.scheduler) return;

		this.loading = true;
		this.draw();

		try {
			this.schedules = await this.scheduler.getAllScheduleStats();
			this.error = null;
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
		} finally {
			this.loading = false;
			this.lastRefresh = new Date();
			this.draw();
		}
	}

	private startRefreshTimer() {
		this.refreshInterval = setInterval(() => {
			this.refresh();
		}, 5000);
	}

	private setupInput() {
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);

		process.stdin.on("keypress", (_str, key) => {
			if (key.ctrl && key.name === "c") {
				this.quit();
				return;
			}

			if (this.view === "detail") {
				this.view = "list";
				this.draw();
				return;
			}

			switch (key.name) {
				case "up":
					this.selectedIndex = Math.max(0, this.selectedIndex - 1);
					this.draw();
					break;
				case "down":
					this.selectedIndex = Math.min(
						this.schedules.length - 1,
						this.selectedIndex + 1,
					);
					this.draw();
					break;
				case "return":
					if (this.schedules[this.selectedIndex]) {
						this.view = "detail";
						this.draw();
					}
					break;
				case "r":
					this.refresh();
					break;
				case "p":
					this.togglePause();
					break;
				case "d":
					this.disableSchedule();
					break;
				case "t":
					this.triggerSchedule();
					break;
				case "q":
					this.quit();
					break;
			}
		});
	}

	private async togglePause() {
		const schedule = this.schedules[this.selectedIndex];
		if (!schedule || !this.scheduler) return;

		try {
			if (schedule.state === ScheduleState.ACTIVE) {
				await this.scheduler.pauseSchedule(schedule.name);
			} else if (schedule.state === ScheduleState.PAUSED) {
				await this.scheduler.resumeSchedule(schedule.name);
			}
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			this.draw();
		}
	}

	private async disableSchedule() {
		const schedule = this.schedules[this.selectedIndex];
		if (!schedule || !this.scheduler) return;

		try {
			await this.scheduler.disableSchedule(schedule.name);
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			this.draw();
		}
	}

	private async triggerSchedule() {
		const schedule = this.schedules[this.selectedIndex];
		if (!schedule || !this.scheduler) return;

		try {
			await this.scheduler.triggerSchedule(schedule.name);
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
			this.draw();
		}
	}

	private quit() {
		this.running = false;
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
		process.stdout.write(SHOW_CURSOR + CLEAR);
		process.exit(0);
	}

	private draw() {
		if (!this.running) return;

		let output = CLEAR + HIDE_CURSOR;

		// Header
		output += color(
			"cyan",
			"╔══════════════════════════════════════════════════════════════════════════════╗\n",
		);
		output +=
			color("cyan", "║") +
			color(
				"bold",
				" 🚀 go-go-scope Scheduler TUI                                                  ",
			) +
			color("cyan", "║\n");
		output += color(
			"cyan",
			"╚══════════════════════════════════════════════════════════════════════════════╝\n",
		);

		if (this.view === "list") {
			output += this.drawList();
		} else {
			output += this.drawDetail();
		}

		// Footer
		output += `\n${color("dim", "─".repeat(80))}\n`;
		if (this.loading) {
			output += color("yellow", "⟳ Loading...");
		} else if (this.error) {
			output += color("red", `✗ Error: ${this.error}`);
		} else {
			output +=
				color("green", "●") +
				` ${this.schedules.length} schedules | Last refresh: ${this.lastRefresh.toLocaleTimeString()}`;
		}
		output += color(
			"dim",
			" | ↑↓ Navigate | Enter: Details | p: Pause | t: Trigger | r: Refresh | q: Quit",
		);

		process.stdout.write(output);
	}

	private drawList(): string {
		let output = "\n";

		// Column headers
		output += ` ${color("bold", "Name".padEnd(20))} `;
		output += `${color("bold", "State".padEnd(10))} `;
		output += `${color("bold", "Schedule".padEnd(20))} `;
		output += `${color("bold", "Total".padEnd(6))} `;
		output += `${color("bold", "Pend".padEnd(6))} `;
		output += `${color("bold", "Run".padEnd(6))} `;
		output += `${color("bold", "OK".padEnd(6))} `;
		output += `${color("bold", "Fail".padEnd(6))} `;
		output += `${color("bold", "Success")}\n`;
		output += `${color("dim", "─".repeat(80))}\n`;

		if (this.schedules.length === 0) {
			output += color("dim", "\n  No schedules found.\n");
			output += color(
				"dim",
				'  Create one with: npx go-go-scheduler create my-schedule --cron "0 * * * *"\n',
			);
			return output;
		}

		for (let i = 0; i < this.schedules.length; i++) {
			const s = this.schedules[i]!;
			const isSelected = i === this.selectedIndex;

			const stateColor =
				s.state === ScheduleState.ACTIVE
					? "green"
					: s.state === ScheduleState.PAUSED
						? "yellow"
						: "red";

			if (isSelected) {
				output += `${color("bgCyan", `▶ ${s.name.padEnd(18)}`)} `;
			} else {
				output += `  ${s.name.padEnd(18)} `;
			}

			output += `${color(stateColor, s.state.padEnd(10))} `;
			output +=
				color("dim", ((s.cron || `${s.interval}ms`) as string).padEnd(20)) +
				" ";
			output += `${String(s.totalJobs).padEnd(6)} `;
			output += `${color("yellow", String(s.pendingJobs).padEnd(6))} `;
			output += `${color("blue", String(s.runningJobs).padEnd(6))} `;
			output += `${color("green", String(s.completedJobs).padEnd(6))} `;
			output += `${color("red", String(s.failedJobs).padEnd(6))} `;
			output += `${String(s.successRate).padStart(3)}%\n`;
		}

		return output;
	}

	private drawDetail(): string {
		const s = this.schedules[this.selectedIndex];
		if (!s) return "No schedule selected";

		let output = "\n";
		output += color(
			"cyan",
			"┌─────────────────────────────────────────────────────────────────────────────┐\n",
		);
		output +=
			color("cyan", "│ ") +
			color("bold", `Schedule: ${s.name}`.padEnd(75)) +
			color("cyan", "│\n");
		output += color(
			"cyan",
			"├─────────────────────────────────────────────────────────────────────────────┤\n",
		);

		const stateColor =
			s.state === ScheduleState.ACTIVE
				? "green"
				: s.state === ScheduleState.PAUSED
					? "yellow"
					: "red";

		output +=
			color("cyan", "│ ") +
			"State:      " +
			color(stateColor, s.state.padEnd(65)) +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`Schedule:   ${(s.cron || `${s.interval}ms`).padEnd(65)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`Timezone:   ${(s.timezone || "default").padEnd(65)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`Total Jobs: ${String(s.totalJobs).padEnd(65)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			"Success:    " +
			color(
				s.successRate >= 95 ? "green" : "yellow",
				`${s.successRate}%`.padEnd(65),
			) +
			color("cyan", "│\n");

		if (s.averageDuration) {
			output +=
				color("cyan", "│ ") +
				`Avg Time:   ${`${Math.round(s.averageDuration)}ms`.padEnd(65)}` +
				color("cyan", "│\n");
		}

		output +=
			color("cyan", "│ ") +
			`Last Run:   ${(s.lastRunAt?.toISOString() || "-").padEnd(65)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`Next Run:   ${(s.nextRunAt?.toISOString() || "-").padEnd(65)}` +
			color("cyan", "│\n");
		output += color(
			"cyan",
			"├─────────────────────────────────────────────────────────────────────────────┤\n",
		);
		output +=
			color("cyan", "│ ") + "Job Counts:".padEnd(75) + color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`  Pending:   ${String(s.pendingJobs).padEnd(63)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`  Running:   ${String(s.runningJobs).padEnd(63)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`  Completed: ${String(s.completedJobs).padEnd(63)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`  Failed:    ${String(s.failedJobs).padEnd(63)}` +
			color("cyan", "│\n");
		output +=
			color("cyan", "│ ") +
			`  Cancelled: ${String(s.cancelledJobs).padEnd(63)}` +
			color("cyan", "│\n");
		output += color(
			"cyan",
			"└─────────────────────────────────────────────────────────────────────────────┘\n",
		);
		output += `\n${color("dim", "Press any key to return to list view")}`;

		return output;
	}
}

// Main
async function main() {
	const { values } = parseArgs({
		options: {
			storage: { type: "string", short: "s" },
			url: { type: "string", short: "u" },
			help: { type: "boolean", short: "h" },
		},
	});

	if (values.help) {
		console.log(`
go-go-scope Scheduler TUI

Usage:
  npx go-go-scheduler-tui [options]

Options:
  -s, --storage   Storage type (redis, memory) [default: memory]
  -u, --url       Connection URL for storage
  -h, --help      Show this help

Controls:
  ↑/↓            Navigate schedules
  Enter          View schedule details
  p              Pause/Resume schedule
  d              Disable schedule
  t              Trigger schedule (run now)
  r              Refresh data
  q or Ctrl+C    Quit

Examples:
  npx go-go-scheduler-tui
  npx go-go-scheduler-tui -s redis -u redis://localhost:6379
`);
		process.exit(0);
	}

	const storage = await createStorage(values);
	const tui = new TUI(storage);
	await tui.init();
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
