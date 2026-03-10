/**
 * Memory monitoring for go-go-scope
 *
 * Tracks heap usage and triggers callbacks when memory pressure is detected.
 * Used internally by Scope when memory limits are configured.
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope({
 *   memoryLimit: '100mb',
 *   onMemoryPressure: (usage) => {
 *     console.warn('High memory usage:', usage.percentageUsed + '%')
 *   }
 * });
 * ```
 */

import createDebug from "debug";

const debugMemory = createDebug("go-go-scope:memory");

/**
 * Memory usage information
 */
export interface MemoryUsage {
	/** Heap used in bytes */
	used: number;
	/** Total heap size in bytes */
	total: number;
	/** Heap limit in bytes */
	limit: number;
	/** Percentage of heap limit used (0-100) */
	percentageUsed: number;
	/** Whether the memory limit is exceeded */
	isOverLimit: boolean;
}

/**
 * Memory limit configuration
 */
export interface MemoryLimitConfig {
	/** Maximum memory in bytes (or string like '100mb', '1gb') */
	limit: number | string;
	/** Callback when memory pressure is detected */
	onPressure?: (usage: MemoryUsage) => void;
	/** Check interval in milliseconds (default: 5000) */
	checkInterval?: number;
	/** Pressure threshold percentage to trigger callback (default: 80) */
	pressureThreshold?: number;
}

/**
 * Parse memory limit string to bytes
 */
function parseMemoryLimit(limit: number | string): number {
	if (typeof limit === "number") return limit;

	const match = limit.match(/^([\d.]+)\s*(b|kb|mb|gb|tb)?$/i);
	if (!match || match[1] === undefined) {
		throw new Error(`Invalid memory limit format: ${limit}`);
	}

	const value = Number.parseFloat(match[1]);
	const unit = (match[2] ?? "b").toLowerCase();

	const multipliers: Record<string, number> = {
		b: 1,
		kb: 1024,
		mb: 1024 * 1024,
		gb: 1024 * 1024 * 1024,
		tb: 1024 * 1024 * 1024 * 1024,
	};

	return value * (multipliers[unit] || 1);
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): MemoryUsage {
	// Node.js / Bun memory usage
	if (typeof process !== "undefined" && "memoryUsage" in process) {
		const usage = process.memoryUsage();
		const limit = usage.heapTotal || usage.heapUsed;
		return {
			used: usage.heapUsed,
			total: usage.heapTotal,
			limit,
			percentageUsed: limit > 0 ? (usage.heapUsed / limit) * 100 : 0,
			isOverLimit: false,
		};
	}

	// Deno memory usage
	if (
		typeof (
			globalThis as {
				Deno?: { memoryUsage?: () => { heapUsed: number; heapTotal: number } };
			}
		).Deno?.memoryUsage === "function"
	) {
		// biome-ignore lint/suspicious/noExplicitAny: Deno is not always available
		const usage = (globalThis as any).Deno.memoryUsage();
		const limit = usage.heapTotal || usage.heapUsed;
		return {
			used: usage.heapUsed,
			total: usage.heapTotal,
			limit,
			percentageUsed: limit > 0 ? (usage.heapUsed / limit) * 100 : 0,
			isOverLimit: false,
		};
	}

	// Browser / fallback - use performance.memory if available
	// biome-ignore lint/suspicious/noExplicitAny: Performance memory is not in all TypeScript lib versions
	const perf = (globalThis as any).performance;
	if (perf?.memory) {
		const used = perf.memory.usedJSHeapSize;
		const total = perf.memory.totalJSHeapSize;
		const limit = perf.memory.jsHeapSizeLimit;
		return {
			used,
			total,
			limit,
			percentageUsed: limit > 0 ? (used / limit) * 100 : 0,
			isOverLimit: false,
		};
	}

	// Final fallback
	return {
		used: 0,
		total: 0,
		limit: 0,
		percentageUsed: 0,
		isOverLimit: false,
	};
}

/**
 * Memory monitor that tracks heap usage and triggers callbacks on pressure
 */
export class MemoryMonitor {
	private limit: number;
	private onPressure?: (usage: MemoryUsage) => void;
	private checkInterval: number;
	private pressureThreshold: number;
	private intervalId?: ReturnType<typeof setInterval>;
	private disposed = false;
	private lastPressureTime = 0;
	private pressureCooldown = 1000; // Minimum ms between pressure callbacks

	constructor(config: MemoryLimitConfig) {
		this.limit = parseMemoryLimit(config.limit);
		this.onPressure = config.onPressure;
		this.checkInterval = config.checkInterval ?? 5000;
		this.pressureThreshold = config.pressureThreshold ?? 80;

		if (debugMemory.enabled) {
			debugMemory(
				"Memory monitor created with limit: %d bytes, threshold: %d%",
				this.limit,
				this.pressureThreshold,
			);
		}

		// Start monitoring
		this.start();
	}

	/**
	 * Start monitoring memory usage
	 */
	private start(): void {
		if (this.intervalId) return;

		this.intervalId = setInterval(() => {
			this.checkMemory();
		}, this.checkInterval);

		// Initial check
		this.checkMemory();
	}

	/**
	 * Check current memory usage and trigger callback if needed
	 */
	private checkMemory(): void {
		if (this.disposed) return;

		const baseUsage = getMemoryUsage();
		const usage: MemoryUsage = {
			...baseUsage,
			isOverLimit: baseUsage.used > this.limit,
		};

		// Calculate percentage against configured limit
		const percentageAgainstLimit = (usage.used / this.limit) * 100;

		if (debugMemory.enabled) {
			debugMemory(
				"Memory check: %d/%d bytes (%d% against limit, %d% of heap)",
				usage.used,
				this.limit,
				percentageAgainstLimit.toFixed(1),
				usage.percentageUsed.toFixed(1),
			);
		}

		// Trigger callback if over threshold or limit
		if (
			this.onPressure &&
			(percentageAgainstLimit >= this.pressureThreshold || usage.isOverLimit)
		) {
			const now = Date.now();
			if (now - this.lastPressureTime > this.pressureCooldown) {
				this.lastPressureTime = now;
				try {
					this.onPressure(usage);
				} catch (error) {
					if (debugMemory.enabled) {
						debugMemory("Error in onPressure callback: %s", error);
					}
				}
			}
		}
	}

	/**
	 * Get current memory usage
	 */
	getUsage(): MemoryUsage {
		const baseUsage = getMemoryUsage();
		return {
			...baseUsage,
			isOverLimit: baseUsage.used > this.limit,
		};
	}

	/**
	 * Get the configured memory limit in bytes
	 */
	getLimit(): number {
		return this.limit;
	}

	/**
	 * Update the memory limit
	 */
	setLimit(limit: number | string): void {
		this.limit = parseMemoryLimit(limit);
		if (debugMemory.enabled) {
			debugMemory("Memory limit updated to: %d bytes", this.limit);
		}
	}

	/**
	 * Stop monitoring and cleanup
	 */
	[Symbol.dispose](): void {
		if (this.disposed) return;
		this.disposed = true;

		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}

		if (debugMemory.enabled) {
			debugMemory("Memory monitor disposed");
		}
	}

	async [Symbol.asyncDispose](): Promise<void> {
		this[Symbol.dispose]();
	}
}

/**
 * Check if memory monitoring is available in the current environment
 */
export function isMemoryMonitoringAvailable(): boolean {
	if (typeof process !== "undefined" && "memoryUsage" in process) {
		return true;
	}
	if (
		typeof (globalThis as { Deno?: { memoryUsage?: () => unknown } }).Deno
			?.memoryUsage === "function"
	) {
		return true;
	}
	// biome-ignore lint/suspicious/noExplicitAny: Performance memory check
	if ((globalThis as any).performance?.memory) {
		return true;
	}
	return false;
}
