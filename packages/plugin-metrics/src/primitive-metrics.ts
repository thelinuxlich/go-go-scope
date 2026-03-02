/**
 * Extended metrics for go-go-scope primitives
 *
 * Provides Prometheus/OpenTelemetry compatible metrics for:
 * - Channels
 * - Circuit Breakers
 * - Semaphores
 * - Resource Pools
 * - Locks
 */

import type { Scope } from "go-go-scope";

/**
 * Channel metrics
 */
export interface ChannelMetrics {
	/** Total messages sent */
	messagesSent: number;
	/** Total messages received */
	messagesReceived: number;
	/** Current buffer size */
	bufferSize: number;
	/** Buffer capacity */
	bufferCapacity: number;
	/** Total dropped messages (due to backpressure) */
	messagesDropped: number;
	/** Total send operations that blocked */
	blockedSends: number;
	/** Total receive operations that waited */
	blockedReceives: number;
	/** Channel state: open, closed, aborted */
	state: string;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
	/** Current state: closed, open, half-open */
	state: string;
	/** Current failure count */
	failureCount: number;
	/** Failure threshold */
	failureThreshold: number;
	/** Total failures recorded */
	totalFailures: number;
	/** Total successes recorded */
	totalSuccesses: number;
	/** State transition count */
	stateTransitions: number;
	/** Current error rate (if adaptive enabled) */
	errorRate?: number;
}

/**
 * Semaphore metrics
 */
export interface SemaphoreMetrics {
	/** Total permits */
	totalPermits: number;
	/** Available permits */
	availablePermits: number;
	/** Number of waiting acquirers */
	waitingCount: number;
	/** Total acquisitions */
	totalAcquisitions: number;
	/** Total acquisitions that timed out */
	timeoutCount: number;
}

/**
 * Resource pool metrics
 */
export interface ResourcePoolMetrics {
	/** Minimum pool size */
	minSize: number;
	/** Maximum pool size */
	maxSize: number;
	/** Current pool size */
	currentSize: number;
	/** Available resources */
	available: number;
	/** Resources in use */
	inUse: number;
	/** Total acquisitions */
	totalAcquisitions: number;
	/** Acquisitions that timed out */
	timeoutCount: number;
	/** Resources created */
	resourcesCreated: number;
	/** Resources destroyed */
	resourcesDestroyed: number;
	/** Failed health checks */
	healthCheckFailures: number;
}

/**
 * Lock metrics
 */
export interface LockMetrics {
	/** Total lock acquisitions attempted */
	acquisitionsAttempted: number;
	/** Successful acquisitions */
	acquisitionsSucceeded: number;
	/** Failed acquisitions (lock held) */
	acquisitionsFailed: number;
	/** Total releases */
	releases: number;
	/** Lock extensions */
	extensions: number;
	/** Average hold time in ms */
	avgHoldTimeMs: number;
}

/**
 * Comprehensive metrics registry for primitives
 */
export class PrimitiveMetricsRegistry {
	private channelMetrics = new Map<string, ChannelMetrics>();
	private circuitBreakerMetrics = new Map<string, CircuitBreakerMetrics>();
	private semaphoreMetrics = new Map<string, SemaphoreMetrics>();
	private poolMetrics = new Map<string, ResourcePoolMetrics>();
	private lockMetrics = new Map<string, LockMetrics>();

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_scope: Scope) {}

	/**
	 * Register a channel for metrics collection
	 */
	registerChannel(
		name: string,
		channel: {
			size: number;
			cap: number;
			isClosed: boolean;
			strategy: string;
		},
	): void {
		this.channelMetrics.set(name, {
			messagesSent: 0,
			messagesReceived: 0,
			bufferSize: channel.size,
			bufferCapacity: channel.cap,
			messagesDropped: 0,
			blockedSends: 0,
			blockedReceives: 0,
			state: channel.isClosed ? "closed" : "open",
		});
	}

	/**
	 * Record channel send
	 */
	recordChannelSend(name: string, blocked: boolean, dropped: boolean): void {
		const metrics = this.channelMetrics.get(name);
		if (metrics) {
			metrics.messagesSent++;
			if (blocked) metrics.blockedSends++;
			if (dropped) metrics.messagesDropped++;
		}
	}

	/**
	 * Record channel receive
	 */
	recordChannelReceive(name: string, blocked: boolean): void {
		const metrics = this.channelMetrics.get(name);
		if (metrics) {
			metrics.messagesReceived++;
			if (blocked) metrics.blockedReceives++;
		}
	}

	/**
	 * Update channel buffer state
	 */
	updateChannelBuffer(name: string, size: number, state: string): void {
		const metrics = this.channelMetrics.get(name);
		if (metrics) {
			metrics.bufferSize = size;
			metrics.state = state;
		}
	}

	/**
	 * Register a circuit breaker for metrics collection
	 */
	registerCircuitBreaker(
		name: string,
		cb: {
			currentState: string;
			failureCount: number;
			failureThreshold: number;
			errorRate?: number;
		},
	): void {
		this.circuitBreakerMetrics.set(name, {
			state: cb.currentState,
			failureCount: cb.failureCount,
			failureThreshold: cb.failureThreshold,
			totalFailures: 0,
			totalSuccesses: 0,
			stateTransitions: 0,
			errorRate: cb.errorRate,
		});
	}

	/**
	 * Record circuit breaker result
	 */
	recordCircuitBreakerResult(name: string, success: boolean): void {
		const metrics = this.circuitBreakerMetrics.get(name);
		if (metrics) {
			if (success) {
				metrics.totalSuccesses++;
			} else {
				metrics.totalFailures++;
			}
		}
	}

	/**
	 * Record circuit breaker state change
	 */
	recordCircuitBreakerStateChange(
		name: string,
		newState: string,
		errorRate?: number,
	): void {
		const metrics = this.circuitBreakerMetrics.get(name);
		if (metrics) {
			metrics.state = newState;
			metrics.stateTransitions++;
			if (errorRate !== undefined) {
				metrics.errorRate = errorRate;
			}
		}
	}

	/**
	 * Register a semaphore for metrics collection
	 */
	registerSemaphore(
		name: string,
		semaphore: {
			available: number;
			totalPermits: number;
			waiting: number;
		},
	): void {
		this.semaphoreMetrics.set(name, {
			totalPermits: semaphore.totalPermits,
			availablePermits: semaphore.available,
			waitingCount: semaphore.waiting,
			totalAcquisitions: 0,
			timeoutCount: 0,
		});
	}

	/**
	 * Record semaphore acquisition
	 */
	recordSemaphoreAcquisition(name: string, timeout: boolean): void {
		const metrics = this.semaphoreMetrics.get(name);
		if (metrics) {
			metrics.totalAcquisitions++;
			if (timeout) metrics.timeoutCount++;
		}
	}

	/**
	 * Update semaphore state
	 */
	updateSemaphoreState(name: string, available: number, waiting: number): void {
		const metrics = this.semaphoreMetrics.get(name);
		if (metrics) {
			metrics.availablePermits = available;
			metrics.waitingCount = waiting;
		}
	}

	/**
	 * Register a resource pool for metrics collection
	 */
	registerResourcePool(
		name: string,
		pool: {
			min: number;
			max: number;
			size: number;
			available: number;
		},
	): void {
		this.poolMetrics.set(name, {
			minSize: pool.min,
			maxSize: pool.max,
			currentSize: pool.size,
			available: pool.available,
			inUse: pool.size - pool.available,
			totalAcquisitions: 0,
			timeoutCount: 0,
			resourcesCreated: 0,
			resourcesDestroyed: 0,
			healthCheckFailures: 0,
		});
	}

	/**
	 * Record pool acquisition
	 */
	recordPoolAcquisition(name: string, timeout: boolean): void {
		const metrics = this.poolMetrics.get(name);
		if (metrics) {
			metrics.totalAcquisitions++;
			if (timeout) metrics.timeoutCount++;
		}
	}

	/**
	 * Update pool state
	 */
	updatePoolState(name: string, size: number, available: number): void {
		const metrics = this.poolMetrics.get(name);
		if (metrics) {
			metrics.currentSize = size;
			metrics.available = available;
			metrics.inUse = size - available;
		}
	}

	/**
	 * Record resource creation/destruction
	 */
	recordPoolResourceChange(name: string, created: boolean): void {
		const metrics = this.poolMetrics.get(name);
		if (metrics) {
			if (created) {
				metrics.resourcesCreated++;
			} else {
				metrics.resourcesDestroyed++;
			}
		}
	}

	/**
	 * Record health check failure
	 */
	recordPoolHealthCheckFailure(name: string): void {
		const metrics = this.poolMetrics.get(name);
		if (metrics) {
			metrics.healthCheckFailures++;
		}
	}

	/**
	 * Register a lock for metrics collection
	 */
	registerLock(name: string): void {
		this.lockMetrics.set(name, {
			acquisitionsAttempted: 0,
			acquisitionsSucceeded: 0,
			acquisitionsFailed: 0,
			releases: 0,
			extensions: 0,
			avgHoldTimeMs: 0,
		});
	}

	/**
	 * Record lock acquisition
	 */
	recordLockAcquisition(name: string, succeeded: boolean): void {
		const metrics = this.lockMetrics.get(name);
		if (metrics) {
			metrics.acquisitionsAttempted++;
			if (succeeded) {
				metrics.acquisitionsSucceeded++;
			} else {
				metrics.acquisitionsFailed++;
			}
		}
	}

	/**
	 * Record lock release
	 */
	recordLockRelease(name: string, holdTimeMs: number): void {
		const metrics = this.lockMetrics.get(name);
		if (metrics) {
			metrics.releases++;
			// Update running average
			const n = metrics.releases;
			metrics.avgHoldTimeMs =
				(metrics.avgHoldTimeMs * (n - 1) + holdTimeMs) / n;
		}
	}

	/**
	 * Record lock extension
	 */
	recordLockExtension(name: string): void {
		const metrics = this.lockMetrics.get(name);
		if (metrics) {
			metrics.extensions++;
		}
	}

	/**
	 * Get all metrics as Prometheus format
	 */
	exportAsPrometheus(prefix = "goscope"): string {
		const lines: string[] = [];

		// Channel metrics
		for (const [name, metrics] of this.channelMetrics) {
			lines.push(
				`# HELP ${prefix}_channel_messages_sent_total Messages sent to channel`,
			);
			lines.push(`# TYPE ${prefix}_channel_messages_sent_total counter`);
			lines.push(
				`${prefix}_channel_messages_sent_total{channel="${name}"} ${metrics.messagesSent}`,
			);

			lines.push(
				`# HELP ${prefix}_channel_messages_received_total Messages received from channel`,
			);
			lines.push(`# TYPE ${prefix}_channel_messages_received_total counter`);
			lines.push(
				`${prefix}_channel_messages_received_total{channel="${name}"} ${metrics.messagesReceived}`,
			);

			lines.push(`# HELP ${prefix}_channel_buffer_size Current buffer size`);
			lines.push(`# TYPE ${prefix}_channel_buffer_size gauge`);
			lines.push(
				`${prefix}_channel_buffer_size{channel="${name}"} ${metrics.bufferSize}`,
			);

			lines.push(`# HELP ${prefix}_channel_buffer_capacity Buffer capacity`);
			lines.push(`# TYPE ${prefix}_channel_buffer_capacity gauge`);
			lines.push(
				`${prefix}_channel_buffer_capacity{channel="${name}"} ${metrics.bufferCapacity}`,
			);

			lines.push(
				`# HELP ${prefix}_channel_messages_dropped_total Messages dropped due to backpressure`,
			);
			lines.push(`# TYPE ${prefix}_channel_messages_dropped_total counter`);
			lines.push(
				`${prefix}_channel_messages_dropped_total{channel="${name}"} ${metrics.messagesDropped}`,
			);
		}

		// Circuit breaker metrics
		for (const [name, metrics] of this.circuitBreakerMetrics) {
			lines.push(
				`# HELP ${prefix}_circuit_breaker_state Current state (0=closed, 1=open, 2=half-open)`,
			);
			lines.push(`# TYPE ${prefix}_circuit_breaker_state gauge`);
			const stateValue =
				metrics.state === "closed" ? 0 : metrics.state === "open" ? 1 : 2;
			lines.push(
				`${prefix}_circuit_breaker_state{breaker="${name}"} ${stateValue}`,
			);

			lines.push(
				`# HELP ${prefix}_circuit_breaker_failure_count Current failure count`,
			);
			lines.push(`# TYPE ${prefix}_circuit_breaker_failure_count gauge`);
			lines.push(
				`${prefix}_circuit_breaker_failure_count{breaker="${name}"} ${metrics.failureCount}`,
			);

			lines.push(
				`# HELP ${prefix}_circuit_breaker_failures_total Total failures`,
			);
			lines.push(`# TYPE ${prefix}_circuit_breaker_failures_total counter`);
			lines.push(
				`${prefix}_circuit_breaker_failures_total{breaker="${name}"} ${metrics.totalFailures}`,
			);

			lines.push(
				`# HELP ${prefix}_circuit_breaker_successes_total Total successes`,
			);
			lines.push(`# TYPE ${prefix}_circuit_breaker_successes_total counter`);
			lines.push(
				`${prefix}_circuit_breaker_successes_total{breaker="${name}"} ${metrics.totalSuccesses}`,
			);
		}

		// Semaphore metrics
		for (const [name, metrics] of this.semaphoreMetrics) {
			lines.push(
				`# HELP ${prefix}_semaphore_available_permits Available permits`,
			);
			lines.push(`# TYPE ${prefix}_semaphore_available_permits gauge`);
			lines.push(
				`${prefix}_semaphore_available_permits{semaphore="${name}"} ${metrics.availablePermits}`,
			);

			lines.push(`# HELP ${prefix}_semaphore_waiting_count Waiting acquirers`);
			lines.push(`# TYPE ${prefix}_semaphore_waiting_count gauge`);
			lines.push(
				`${prefix}_semaphore_waiting_count{semaphore="${name}"} ${metrics.waitingCount}`,
			);

			lines.push(
				`# HELP ${prefix}_semaphore_acquisitions_total Total acquisitions`,
			);
			lines.push(`# TYPE ${prefix}_semaphore_acquisitions_total counter`);
			lines.push(
				`${prefix}_semaphore_acquisitions_total{semaphore="${name}"} ${metrics.totalAcquisitions}`,
			);
		}

		// Pool metrics
		for (const [name, metrics] of this.poolMetrics) {
			lines.push(`# HELP ${prefix}_pool_size Current pool size`);
			lines.push(`# TYPE ${prefix}_pool_size gauge`);
			lines.push(`${prefix}_pool_size{pool="${name}"} ${metrics.currentSize}`);

			lines.push(`# HELP ${prefix}_pool_available Available resources`);
			lines.push(`# TYPE ${prefix}_pool_available gauge`);
			lines.push(
				`${prefix}_pool_available{pool="${name}"} ${metrics.available}`,
			);

			lines.push(`# HELP ${prefix}_pool_in_use Resources in use`);
			lines.push(`# TYPE ${prefix}_pool_in_use gauge`);
			lines.push(`${prefix}_pool_in_use{pool="${name}"} ${metrics.inUse}`);

			lines.push(`# HELP ${prefix}_pool_acquisitions_total Total acquisitions`);
			lines.push(`# TYPE ${prefix}_pool_acquisitions_total counter`);
			lines.push(
				`${prefix}_pool_acquisitions_total{pool="${name}"} ${metrics.totalAcquisitions}`,
			);
		}

		// Lock metrics
		for (const [name, metrics] of this.lockMetrics) {
			lines.push(
				`# HELP ${prefix}_lock_acquisitions_attempted_total Lock acquisitions attempted`,
			);
			lines.push(`# TYPE ${prefix}_lock_acquisitions_attempted_total counter`);
			lines.push(
				`${prefix}_lock_acquisitions_attempted_total{lock="${name}"} ${metrics.acquisitionsAttempted}`,
			);

			lines.push(
				`# HELP ${prefix}_lock_acquisitions_succeeded_total Successful acquisitions`,
			);
			lines.push(`# TYPE ${prefix}_lock_acquisitions_succeeded_total counter`);
			lines.push(
				`${prefix}_lock_acquisitions_succeeded_total{lock="${name}"} ${metrics.acquisitionsSucceeded}`,
			);

			lines.push(`# HELP ${prefix}_lock_avg_hold_time_ms Average hold time`);
			lines.push(`# TYPE ${prefix}_lock_avg_hold_time_ms gauge`);
			lines.push(
				`${prefix}_lock_avg_hold_time_ms{lock="${name}"} ${metrics.avgHoldTimeMs.toFixed(2)}`,
			);
		}

		return lines.join("\n") + "\n";
	}

	/**
	 * Get all metrics as JSON
	 */
	exportAsJson(): Record<string, unknown> {
		return {
			channels: Object.fromEntries(this.channelMetrics),
			circuitBreakers: Object.fromEntries(this.circuitBreakerMetrics),
			semaphores: Object.fromEntries(this.semaphoreMetrics),
			pools: Object.fromEntries(this.poolMetrics),
			locks: Object.fromEntries(this.lockMetrics),
		};
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.channelMetrics.clear();
		this.circuitBreakerMetrics.clear();
		this.semaphoreMetrics.clear();
		this.poolMetrics.clear();
		this.lockMetrics.clear();
	}
}
