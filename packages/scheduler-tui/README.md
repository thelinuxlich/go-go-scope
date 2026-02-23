# @go-go-scope/scheduler-tui

> Interactive TUI and CLI for go-go-scope scheduler

## Features

- **Interactive TUI**: Real-time monitoring with keyboard navigation
- **CLI Tool**: Scriptable command-line interface
- **Schedule Management**: List, create, update, pause, resume, disable, delete
- **Statistics**: View job success rates and execution times
- **Manual Trigger**: Run schedules on-demand

## Installation

```bash
# Global installation for CLI access
npm install -g @go-go-scope/scheduler-tui

# Or use with npx
npx @go-go-scope/scheduler-tui <command>
```

## CLI Usage

```bash
# List all schedules
npx go-go-scheduler list --storage redis --url redis://localhost:6379

# Create a schedule
npx go-go-scheduler create daily-report \
  --cron "0 9 * * *" \
  --timezone America/New_York

# Get schedule details
npx go-go-scheduler get daily-report

# Show statistics
npx go-go-scheduler stats daily-report
# or for all schedules
npx go-go-scheduler stats

# Update a schedule
npx go-go-scheduler update daily-report --cron "0 10 * * *"

# Pause/resume/disable
npx go-go-scheduler pause daily-report
npx go-go-scheduler resume daily-report
npx go-go-scheduler disable daily-report

# Trigger immediately
npx go-go-scheduler trigger daily-report

# Delete a schedule
npx go-go-scheduler delete daily-report

# List jobs for a schedule
npx go-go-scheduler jobs daily-report
```

## TUI Usage

```bash
# Start the interactive TUI
npx go-go-scheduler-tui

# With Redis storage
npx go-go-scheduler-tui -s redis -u redis://localhost:6379
```

### TUI Controls

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate schedules |
| `Enter` | View schedule details |
| `p` | Pause/Resume schedule |
| `d` | Disable schedule |
| `t` | Trigger schedule (run now) |
| `r` | Refresh data |
| `q` or `Ctrl+C` | Quit |

### TUI Features

- Real-time schedule list with color-coded states (green=active, yellow=paused, red=disabled)
- Job statistics (total, pending, running, completed, failed)
- Success rate percentage
- Auto-refresh every 5 seconds
- Schedule details view with all metadata

## License

MIT © [thelinuxlich](https://github.com/thelinuxlich)
