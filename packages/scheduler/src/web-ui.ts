/**
 * Web UI for go-go-scope scheduler admin
 *
 * Provides a web interface and REST API for managing schedules.
 * Only available for admin instances.
 */

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type {
	CreateScheduleOptions,
	Job,
	JobStorage,
	Schedule,
	ScheduleStats,
	UpdateScheduleOptions,
} from "./types.js";

/**
 * Web UI server options
 */
export interface WebUIOptions {
	/** Port to listen on (e.g., 8080) */
	port: number;
	/** Host to bind to (e.g., '0.0.0.0' for all interfaces, 'localhost' for local only) */
	host: string;
	/** Optional API key for authentication (if provided, requires Bearer token) */
	apiKey?: string;
	/** Base path for the UI (e.g., '/' or '/scheduler') */
	path: string;
	/** Storage backend for retrieving schedules and jobs */
	storage: JobStorage;
	/** Get schedule stats function (receives schedule name, returns stats) */
	getScheduleStats: (name: string) => Promise<ScheduleStats>;
	/** Create schedule function (receives name and options, returns schedule) */
	createSchedule: (
		name: string,
		options: CreateScheduleOptions,
	) => Promise<Schedule>;
	/** Update schedule function (receives name and options, returns updated schedule) */
	updateSchedule: (
		name: string,
		options: UpdateScheduleOptions,
	) => Promise<Schedule>;
	/** Delete schedule function (receives schedule name) */
	deleteSchedule: (name: string) => Promise<void>;
	/** Pause schedule function (receives schedule name) */
	pauseSchedule: (name: string) => Promise<void>;
	/** Resume schedule function (receives schedule name) */
	resumeSchedule: (name: string) => Promise<void>;
	/** Get jobs for a schedule (receives schedule name and optional limit, returns jobs) */
	getScheduleJobs: (name: string, limit?: number) => Promise<Job[]>;
	/** Optional logger for web UI events */
	logger?: {
		/** Log info message with optional metadata */
		info: (msg: string, meta?: Record<string, unknown>) => void;
		/** Log error message with optional metadata */
		error: (msg: string, meta?: Record<string, unknown>) => void;
	};
}

/**
 * HTTP response helper
 */
function jsonResponse(
	res: ServerResponse,
	status: number,
	data: unknown,
): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

function htmlResponse(res: ServerResponse, html: string): void {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

/**
 * Create the web UI HTML
 */
function createWebUIHTML(basePath: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>go-go-scheduler | Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    .btn-danger {
      background: #ef4444;
      color: white;
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .btn-secondary {
      background: #334155;
      color: #e2e8f0;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: #1e293b;
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid #334155;
      transition: all 0.2s;
    }
    .card:hover {
      border-color: #475569;
      transform: translateY(-2px);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #f8fafc;
    }
    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
    }
    .badge-active {
      background: #064e3b;
      color: #34d399;
    }
    .badge-paused {
      background: #78350f;
      color: #fbbf24;
    }
    .badge-disabled {
      background: #450a0a;
      color: #f87171;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat {
      text-align: center;
      padding: 0.75rem;
      background: #0f172a;
      border-radius: 0.5rem;
    }
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #60a5fa;
    }
    .stat-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .schedule-info {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 1rem 0;
      padding: 1rem;
      background: #0f172a;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    .schedule-info-row {
      display: flex;
      justify-content: space-between;
    }
    .schedule-info-label {
      color: #94a3b8;
    }
    .schedule-info-value {
      color: #e2e8f0;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .card-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .card-actions .btn {
      flex: 1;
      justify-content: center;
    }
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #64748b;
    }
    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal {
      background: #1e293b;
      border-radius: 1rem;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid #334155;
    }
    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
    }
    .modal-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
    }
    .modal-close:hover {
      color: #e2e8f0;
    }
    .modal-body {
      padding: 1.5rem;
    }
    .form-group {
      margin-bottom: 1.5rem;
    }
    .form-label {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #cbd5e1;
    }
    .form-input,
    .form-select,
    .form-textarea {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      color: #e2e8f0;
      font-size: 0.875rem;
      transition: border-color 0.2s;
    }
    .form-input:focus,
    .form-select:focus,
    .form-textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .form-textarea {
      min-height: 100px;
      resize: vertical;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .form-hint {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      display: none;
      align-items: center;
      gap: 0.75rem;
      animation: slideIn 0.3s ease;
    }
    .toast.active {
      display: flex;
    }
    .toast-success {
      border-color: #059669;
    }
    .toast-error {
      border-color: #dc2626;
    }
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    .loading {
      display: inline-block;
      width: 1rem;
      height: 1rem;
      border: 2px solid #334155;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .jobs-list {
      max-height: 300px;
      overflow-y: auto;
    }
    .job-item {
      padding: 0.75rem;
      background: #0f172a;
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .job-status {
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .job-status-pending { background: #78350f; color: #fbbf24; }
    .job-status-running { background: #1e3a8a; color: #60a5fa; }
    .job-status-completed { background: #064e3b; color: #34d399; }
    .job-status-failed { background: #450a0a; color: #f87171; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⚡ go-go-scheduler</h1>
      <button class="btn btn-primary" onclick="openModal()">
        <span>+</span> New Schedule
      </button>
    </header>

    <div id="schedules-grid" class="grid"></div>

    <div id="empty-state" class="empty-state" style="display: none;">
      <div class="empty-state-icon">📅</div>
      <h2>No schedules yet</h2>
      <p>Create your first schedule to get started</p>
    </div>
  </div>

  <!-- Create/Edit Modal -->
  <div id="modal" class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-title">New Schedule</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="schedule-form" onsubmit="saveSchedule(event)">
          <input type="hidden" id="edit-mode" value="false">
          
          <div class="form-group">
            <label class="form-label">Schedule Name</label>
            <input type="text" id="schedule-name" class="form-input" placeholder="e.g., daily-report" required
                   pattern="[a-z0-9-_]+" title="Lowercase letters, numbers, hyphens, and underscores only">
            <p class="form-hint">Unique identifier for this schedule</p>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Schedule Type</label>
              <select id="schedule-type" class="form-select" onchange="toggleScheduleType()">
                <option value="cron">Cron Expression</option>
                <option value="interval">Interval (ms)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Timezone</label>
              <select id="schedule-timezone" class="form-select">
                <option value="">System Default</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="Asia/Shanghai">Asia/Shanghai</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
              </select>
            </div>
          </div>

          <div class="form-group" id="cron-group">
            <label class="form-label">Cron Expression</label>
            <input type="text" id="schedule-cron" class="form-input" placeholder="0 0 * * *">
            <p class="form-hint">Format: minute hour day month weekday (e.g., "0 9 * * 1-5" for weekdays at 9am)</p>
          </div>

          <div class="form-group" id="interval-group" style="display: none;">
            <label class="form-label">Interval (milliseconds)</label>
            <input type="number" id="schedule-interval" class="form-input" placeholder="60000" min="1000">
            <p class="form-hint">Time between executions in milliseconds (e.g., 60000 = 1 minute)</p>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Max Retries</label>
              <input type="number" id="schedule-retries" class="form-input" value="3" min="0" max="10">
            </div>
            <div class="form-group">
              <label class="form-label">Timeout (ms)</label>
              <input type="number" id="schedule-timeout" class="form-input" value="30000" min="1000">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Default Payload (JSON)</label>
            <textarea id="schedule-payload" class="form-textarea" placeholder='{"key": "value"}'></textarea>
          </div>

          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Schedule</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Jobs Modal -->
  <div id="jobs-modal" class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Recent Jobs</h3>
        <button class="modal-close" onclick="closeJobsModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div id="jobs-list" class="jobs-list"></div>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="toast">
    <span id="toast-message"></span>
  </div>

  <script>
    const API_BASE = '${basePath}api';
    let schedules = [];
    let refreshInterval;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      loadSchedules();
      refreshInterval = setInterval(loadSchedules, 5000);
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) clearInterval(refreshInterval);
    });

    async function loadSchedules() {
      try {
        const res = await fetch(\`\${API_BASE}/schedules\`);
        if (!res.ok) throw new Error('Failed to load schedules');
        schedules = await res.json();
        renderSchedules();
      } catch (err) {
        showToast('Failed to load schedules', 'error');
      }
    }

    function renderSchedules() {
      const grid = document.getElementById('schedules-grid');
      const empty = document.getElementById('empty-state');

      if (schedules.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      grid.innerHTML = schedules.map(s => \`
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">\${escapeHtml(s.name)}</h3>
            <span class="badge badge-\${s.state.toLowerCase()}">\${s.state}</span>
          </div>
          
          <div class="schedule-info">
            <div class="schedule-info-row">
              <span class="schedule-info-label">Schedule</span>
              <span class="schedule-info-value">\${s.cron || s.interval + 'ms'}</span>
            </div>
            <div class="schedule-info-row">
              <span class="schedule-info-label">Timezone</span>
              <span class="schedule-info-value">\${s.timezone || 'System'}</span>
            </div>
            <div class="schedule-info-row">
              <span class="schedule-info-label">Next Run</span>
              <span class="schedule-info-value">\${s.nextRunAt ? formatDate(s.nextRunAt) : 'N/A'}</span>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <div class="stat-value">\${s.totalJobs}</div>
              <div class="stat-label">Total</div>
            </div>
            <div class="stat">
              <div class="stat-value" style="color: #34d399;">\${s.completedJobs}</div>
              <div class="stat-label">Success</div>
            </div>
            <div class="stat">
              <div class="stat-value" style="color: #f87171;">\${s.failedJobs}</div>
              <div class="stat-label">Failed</div>
            </div>
          </div>

          <div class="card-actions">
            <button class="btn btn-secondary" onclick="viewJobs('\${s.name}')">View Jobs</button>
            \${s.state === 'ACTIVE' 
              ? \`<button class="btn btn-secondary" onclick="toggleSchedule('\${s.name}', false)">Pause</button>\`
              : \`<button class="btn btn-secondary" onclick="toggleSchedule('\${s.name}', true)">Resume</button>\`
            }
            <button class="btn btn-danger" onclick="deleteSchedule('\${s.name}')">Delete</button>
          </div>
        </div>
      \`).join('');
    }

    function toggleScheduleType() {
      const type = document.getElementById('schedule-type').value;
      document.getElementById('cron-group').style.display = type === 'cron' ? 'block' : 'none';
      document.getElementById('interval-group').style.display = type === 'interval' ? 'block' : 'none';
    }

    function openModal(editName = null) {
      document.getElementById('modal').classList.add('active');
      document.getElementById('schedule-form').reset();
      document.getElementById('edit-mode').value = editName ? 'true' : 'false';
      document.getElementById('modal-title').textContent = editName ? 'Edit Schedule' : 'New Schedule';
      
      if (editName) {
        const s = schedules.find(x => x.name === editName);
        if (s) {
          document.getElementById('schedule-name').value = s.name;
          document.getElementById('schedule-name').disabled = true;
          document.getElementById('schedule-timezone').value = s.timezone || '';
          document.getElementById('schedule-retries').value = s.options?.max ?? 3;
          document.getElementById('schedule-timeout').value = s.options?.timeout ?? 30000;
          
          if (s.cron) {
            document.getElementById('schedule-type').value = 'cron';
            document.getElementById('schedule-cron').value = s.cron;
          } else if (s.interval) {
            document.getElementById('schedule-type').value = 'interval';
            document.getElementById('schedule-interval').value = s.interval;
          }
          toggleScheduleType();
        }
      } else {
        document.getElementById('schedule-name').disabled = false;
      }
    }

    function closeModal() {
      document.getElementById('modal').classList.remove('active');
    }

    async function saveSchedule(e) {
      e.preventDefault();
      
      const name = document.getElementById('schedule-name').value;
      const type = document.getElementById('schedule-type').value;
      const timezone = document.getElementById('schedule-timezone').value;
      const max = parseInt(document.getElementById('schedule-retries').value);
      const timeout = parseInt(document.getElementById('schedule-timeout').value);
      
      let payload = {};
      try {
        const payloadText = document.getElementById('schedule-payload').value.trim();
        if (payloadText) payload = JSON.parse(payloadText);
      } catch {
        showToast('Invalid JSON payload', 'error');
        return;
      }

      const options = {
        timezone: timezone || undefined,
        max,
        timeout,
        defaultPayload: payload
      };

      if (type === 'cron') {
        options.cron = document.getElementById('schedule-cron').value;
      } else {
        options.interval = parseInt(document.getElementById('schedule-interval').value);
      }

      try {
        const res = await fetch(\`\${API_BASE}/schedules\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ...options })
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create schedule');
        }
        
        showToast('Schedule created successfully');
        closeModal();
        loadSchedules();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function deleteSchedule(name) {
      if (!confirm(\`Delete schedule "\${name}"?\`)) return;
      
      try {
        const res = await fetch(\`\${API_BASE}/schedules/\${name}\`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        showToast('Schedule deleted');
        loadSchedules();
      } catch (err) {
        showToast('Failed to delete schedule', 'error');
      }
    }

    async function toggleSchedule(name, resume) {
      try {
        const res = await fetch(\`\${API_BASE}/schedules/\${name}/\${resume ? 'resume' : 'pause'}\`, {
          method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to update');
        showToast(resume ? 'Schedule resumed' : 'Schedule paused');
        loadSchedules();
      } catch (err) {
        showToast('Failed to update schedule', 'error');
      }
    }

    async function viewJobs(name) {
      try {
        const res = await fetch(\`\${API_BASE}/schedules/\${name}/jobs?limit=20\`);
        if (!res.ok) throw new Error('Failed to load jobs');
        const jobs = await res.json();
        
        const list = document.getElementById('jobs-list');
        if (jobs.length === 0) {
          list.innerHTML = '<p style="text-align: center; color: #64748b;">No jobs yet</p>';
        } else {
          list.innerHTML = jobs.map(j => \`
            <div class="job-item">
              <div>
                <div style="font-family: monospace; font-size: 0.875rem;">\${j.id.slice(0, 16)}...</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                  \${formatDate(j.createdAt)}
                </div>
              </div>
              <span class="job-status job-status-\${j.status}">\${j.status}</span>
            </div>
          \`).join('');
        }
        
        document.getElementById('jobs-modal').classList.add('active');
      } catch (err) {
        showToast('Failed to load jobs', 'error');
      }
    }

    function closeJobsModal() {
      document.getElementById('jobs-modal').classList.remove('active');
    }

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      document.getElementById('toast-message').textContent = message;
      toast.className = 'toast active toast-' + type;
      setTimeout(() => toast.classList.remove('active'), 3000);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatDate(dateStr) {
      const d = new Date(dateStr);
      return d.toLocaleString();
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('active');
      });
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Parse request body
 */
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => (body += chunk));
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

/**
 * Create web UI server.
 *
 * @param options - Web UI configuration options
 * @param options.port - Port to listen on (e.g., 8080)
 * @param options.host - Host to bind to (e.g., '0.0.0.0')
 * @param options.apiKey - Optional API key for authentication
 * @param options.path - Base path for the UI (default: '/')
 * @param options.storage - Storage backend for schedules and jobs
 * @param options.getScheduleStats - Function to get schedule statistics
 * @param options.createSchedule - Function to create a new schedule
 * @param options.updateSchedule - Function to update an existing schedule
 * @param options.deleteSchedule - Function to delete a schedule
 * @param options.pauseSchedule - Function to pause a schedule
 * @param options.resumeSchedule - Function to resume a schedule
 * @param options.getScheduleJobs - Function to get jobs for a schedule
 * @param options.logger - Optional logger for web UI events
 * @returns HTTP server instance
 */
export async function createWebUI(options: WebUIOptions): Promise<Server> {
	const { createServer } = await import("node:http");

	const server = createServer(async (req, res) => {
		// CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
		res.setHeader(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization",
		);

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		// API key authentication
		if (options.apiKey) {
			const authHeader = req.headers.authorization;
			if (!authHeader || authHeader !== `Bearer ${options.apiKey}`) {
				jsonResponse(res, 401, { error: "Unauthorized" });
				return;
			}
		}

		const url = new URL(req.url || "/", `http://${req.headers.host}`);
		const path = url.pathname;
		const basePath = options.path.replace(/\/$/, "");

		try {
			// Serve UI at root
			if (path === basePath || path === `${basePath}/`) {
				htmlResponse(res, createWebUIHTML(basePath));
				return;
			}

			// API routes
			const apiPath = `${basePath}/api`;

			// GET /api/schedules - List all schedules
			if (path === `${apiPath}/schedules` && req.method === "GET") {
				const schedules = await options.storage.getSchedules();
				const schedulesWithStats = await Promise.all(
					schedules.map(async (s) => {
						const stats = await options.getScheduleStats(s.name);
						return { ...s, ...stats };
					}),
				);
				jsonResponse(res, 200, schedulesWithStats);
				return;
			}

			// POST /api/schedules - Create schedule
			if (path === `${apiPath}/schedules` && req.method === "POST") {
				const body = await parseBody(req);
				const { name, ...scheduleOptions } = body;

				if (!name || typeof name !== "string") {
					jsonResponse(res, 400, { error: "Schedule name is required" });
					return;
				}

				// Validate cron or interval
				if (!scheduleOptions.cron && !scheduleOptions.interval) {
					jsonResponse(res, 400, {
						error: "Either cron or interval is required",
					});
					return;
				}

				const schedule = await options.createSchedule(
					name,
					scheduleOptions as CreateScheduleOptions,
				);
				jsonResponse(res, 201, schedule);
				return;
			}

			// DELETE /api/schedules/:name - Delete schedule
			if (
				path.match(new RegExp(`^${apiPath}/schedules/[^/]+$`)) &&
				req.method === "DELETE"
			) {
				const name = path.split("/").pop();
				if (!name) {
					jsonResponse(res, 400, { error: "Invalid schedule name" });
					return;
				}
				await options.deleteSchedule(name);
				jsonResponse(res, 204, null);
				return;
			}

			// POST /api/schedules/:name/pause - Pause schedule
			if (
				path.match(new RegExp(`^${apiPath}/schedules/[^/]+/pause$`)) &&
				req.method === "POST"
			) {
				const name = path.split("/")[path.split("/").length - 2];
				if (!name) {
					jsonResponse(res, 400, { error: "Schedule name is required" });
					return;
				}
				await options.pauseSchedule(name);
				jsonResponse(res, 200, { success: true });
				return;
			}

			// POST /api/schedules/:name/resume - Resume schedule
			if (
				path.match(new RegExp(`^${apiPath}/schedules/[^/]+/resume$`)) &&
				req.method === "POST"
			) {
				const name = path.split("/")[path.split("/").length - 2];
				if (!name) {
					jsonResponse(res, 400, { error: "Schedule name is required" });
					return;
				}
				await options.resumeSchedule(name);
				jsonResponse(res, 200, { success: true });
				return;
			}

			// GET /api/schedules/:name/jobs - Get jobs for schedule
			if (
				path.match(new RegExp(`^${apiPath}/schedules/[^/]+/jobs$`)) &&
				req.method === "GET"
			) {
				const name = path.split("/")[path.split("/").length - 2];
				if (!name) {
					jsonResponse(res, 400, { error: "Schedule name is required" });
					return;
				}
				const limit = parseInt(url.searchParams.get("limit") || "20", 10);
				const jobs = await options.getScheduleJobs(name, limit);
				jsonResponse(res, 200, jobs);
				return;
			}

			// 404
			jsonResponse(res, 404, { error: "Not found" });
		} catch (error) {
			options.logger?.error("Web UI request failed", {
				path,
				method: req.method,
				error: (error as Error).message,
			});
			jsonResponse(res, 500, { error: (error as Error).message });
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.listen(options.port, options.host, () => {
			options.logger?.info("Web UI started", {
				host: options.host,
				port: options.port,
				path: options.path,
			});
			resolve();
		});
		server.on("error", reject);
	});

	return server;
}

/**
 * Stop web UI server.
 *
 * @param server - HTTP server instance to stop
 * @returns Promise that resolves when server is closed
 */
export async function stopWebUI(server: Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}
