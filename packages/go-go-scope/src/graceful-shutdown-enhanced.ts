/**
 * Enhanced Graceful Shutdown with Configurable Strategies
 *
 * Provides multiple shutdown strategies:
 * - immediate: Stop accepting new work immediately
 * - drain: Wait for in-flight tasks to complete
 * - timeout: Wait up to a timeout, then force shutdown
 * - hybrid: Combination of drain + timeout
 */

import {
	GracefulShutdownController,
	type GracefulShutdownOptions,
} from "./graceful-shutdown.js";
import type { Scope } from "./scope.js";

/**
 * Shutdown strategy
 */
export type ShutdownStrategy = "immediate" | "drain" | "timeout" | "hybrid";

/**
 * Enhanced graceful shutdown options
 */
export interface EnhancedGracefulShutdownOptions
	extends GracefulShutdownOptions {
	/** Shutdown strategy */
	strategy?: ShutdownStrategy;
	/** Time to wait for in-flight tasks (drain/hybrid mode) */
	drainTimeout?: number;
	/** Time between health checks during drain */
	healthCheckInterval?: number;
	/** Custom health check function */
	healthCheck?: () => boolean | Promise<boolean>;
	/** Pre-shutdown hook - called before stopping new work */
	beforeShutdown?: () => void | Promise<void>;
	/** Post-shutdown hook - called after cleanup */
	afterShutdown?: () => void | Promise<void>;
	/** Rollback on shutdown failure */
	enableRollback?: boolean;
	/** Rollback function */
	rollback?: () => void | Promise<void>;
}

/**
 * Shutdown state
 */
export type ShutdownState =
	| "running"
	| "shutting-down"
	| "draining"
	| "cleaning-up"
	| "complete"
	| "failed";

/**
 * Enhanced graceful shutdown controller with strategies
 */
export class EnhancedGracefulShutdownController extends GracefulShutdownController {
	private state: ShutdownState = "running";
	private activeTasks = new Set<symbol>();
	private shutdownHooks: Array<() => void | Promise<void>> = [];
	private readonly enhancedOptions: EnhancedGracefulShutdownOptions;

	constructor(
		scope: Scope<Record<string, unknown>>,
		options: EnhancedGracefulShutdownOptions = {},
	) {
		super(scope, options);
		this.enhancedOptions = options;
		this.setupTaskTracking(scope);
	}

	/**
	 * Get current shutdown state
	 */
	get currentState(): ShutdownState {
		return this.state;
	}

	/**
	 * Check if system is in shutdown process
	 */
	get isShuttingDown(): boolean {
		return this.state !== "running";
	}

	/**
	 * Get count of active tasks
	 */
	get activeTaskCount(): number {
		return this.activeTasks.size;
	}

	/**
	 * Register a task to be tracked during shutdown
	 */
	trackTask(taskId: symbol): { complete: () => void } {
		if (this.isShuttingDown) {
			throw new Error("Cannot start new tasks during shutdown");
		}

		this.activeTasks.add(taskId);

		return {
			complete: () => {
				this.activeTasks.delete(taskId);
			},
		};
	}

	/**
	 * Register a shutdown hook
	 */
	onShutdownHook(hook: () => void | Promise<void>): void {
		this.shutdownHooks.push(hook);
	}

	/**
	 * Perform shutdown with configured strategy
	 */
	override async shutdown(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		this.state = "shutting-down";
		const strategy = this.enhancedOptions.strategy ?? "hybrid";

		try {
			// Pre-shutdown hook
			if (this.enhancedOptions.beforeShutdown) {
				await this.enhancedOptions.beforeShutdown();
			}

			// Execute strategy
			switch (strategy) {
				case "immediate":
					await this.immediateShutdown(signal);
					break;
				case "drain":
					await this.drainShutdown(signal);
					break;
				case "timeout":
					await this.timeoutShutdown(signal);
					break;
				case "hybrid":
					await this.hybridShutdown(signal);
					break;
			}

			// Run shutdown hooks
			for (const hook of this.shutdownHooks) {
				try {
					await hook();
				} catch (error) {
					console.error("Shutdown hook failed:", error);
				}
			}

			// Post-shutdown hook
			if (this.enhancedOptions.afterShutdown) {
				await this.enhancedOptions.afterShutdown();
			}

			this.state = "complete";
		} catch (error) {
			this.state = "failed";

			// Attempt rollback if enabled
			if (
				this.enhancedOptions.enableRollback &&
				this.enhancedOptions.rollback
			) {
				try {
					await this.enhancedOptions.rollback();
				} catch (rollbackError) {
					console.error("Rollback failed:", rollbackError);
				}
			}

			throw error;
		}
	}

	/**
	 * Immediate shutdown - stop accepting new work immediately
	 */
	private async immediateShutdown(signal: NodeJS.Signals): Promise<void> {
		// Cancel all tasks immediately
		await super.shutdown(signal);
	}

	/**
	 * Drain shutdown - wait for in-flight tasks to complete
	 */
	private async drainShutdown(signal: NodeJS.Signals): Promise<void> {
		this.state = "draining";

		const drainTimeout = this.enhancedOptions.drainTimeout ?? 30000;
		const healthCheckInterval =
			this.enhancedOptions.healthCheckInterval ?? 1000;
		const startTime = Date.now();

		// Signal that shutdown is requested (stop accepting new work)
		await super.shutdown(signal);

		// Wait for tasks to complete
		while (this.activeTasks.size > 0) {
			// Check timeout
			if (Date.now() - startTime > drainTimeout) {
				throw new Error(
					`Drain timeout exceeded with ${this.activeTasks.size} tasks remaining`,
				);
			}

			// Run health check if provided
			if (this.enhancedOptions.healthCheck) {
				const healthy = await this.enhancedOptions.healthCheck();
				if (!healthy) {
					console.warn("Health check failed during drain");
				}
			}

			// Wait before checking again
			await new Promise((resolve) => setTimeout(resolve, healthCheckInterval));
		}

		this.state = "cleaning-up";
	}

	/**
	 * Timeout shutdown - wait up to timeout, then force
	 */
	private async timeoutShutdown(signal: NodeJS.Signals): Promise<void> {
		const timeout = this.enhancedOptions.timeout ?? 30000;

		await Promise.race([
			super.shutdown(signal),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("Shutdown timeout")), timeout),
			),
		]);
	}

	/**
	 * Hybrid shutdown - drain with timeout fallback
	 */
	private async hybridShutdown(signal: NodeJS.Signals): Promise<void> {
		const drainTimeout = this.enhancedOptions.drainTimeout ?? 30000;
		const totalTimeout = this.enhancedOptions.timeout ?? 60000;
		const healthCheckInterval =
			this.enhancedOptions.healthCheckInterval ?? 1000;
		const startTime = Date.now();

		// Signal shutdown
		this.state = "draining";
		await super.shutdown(signal);

		// Wait for tasks with timeouts
		try {
			while (this.activeTasks.size > 0) {
				const elapsed = Date.now() - startTime;

				// Check total timeout
				if (elapsed > totalTimeout) {
					throw new Error("Total shutdown timeout exceeded");
				}

				// Check drain timeout (warning only)
				if (elapsed > drainTimeout) {
					console.warn(
						`Drain timeout exceeded, ${this.activeTasks.size} tasks remaining`,
					);
				}

				// Health check
				if (this.enhancedOptions.healthCheck) {
					const healthy = await this.enhancedOptions.healthCheck();
					if (!healthy) {
						console.warn("Health check failed during drain");
					}
				}

				// Wait
				await new Promise((resolve) =>
					setTimeout(resolve, healthCheckInterval),
				);
			}
		} catch (error) {
			// Force cleanup on error
			console.error("Drain failed, forcing shutdown:", error);
		}

		this.state = "cleaning-up";
	}

	/**
	 * Setup automatic task tracking
	 */
	private setupTaskTracking(scope: Scope<Record<string, unknown>>): void {
		// Override task method to track tasks
		const originalTask = scope.task.bind(scope);

		scope.task = (<T, E extends Error = Error>(
			fn: (ctx: {
				services: Record<string, unknown>;
				signal: AbortSignal;
				logger: import("./types.js").Logger;
				context: Record<string, unknown>;
			}) => Promise<T>,
			options?: import("./types.js").TaskOptions<E>,
		) => {
			if (
				(scope as unknown as EnhancedGracefulShutdownController).isShuttingDown
			) {
				throw new Error("Cannot spawn tasks during shutdown");
			}

			const taskId = Symbol("tracked-task");
			const tracker = (
				scope as unknown as EnhancedGracefulShutdownController
			).trackTask(taskId);

			const wrappedFn = async (ctx: {
				services: Record<string, unknown>;
				signal: AbortSignal;
				logger: import("./types.js").Logger;
				context: Record<string, unknown>;
			}): Promise<T> => {
				try {
					return await fn(ctx);
				} finally {
					tracker.complete();
				}
			};

			return originalTask(wrappedFn, options);
		}) as typeof scope.task;
	}
}

/**
 * Setup enhanced graceful shutdown
 */
export function setupEnhancedGracefulShutdown(
	scope: Scope<Record<string, unknown>>,
	options: EnhancedGracefulShutdownOptions = {},
): EnhancedGracefulShutdownController {
	const controller = new EnhancedGracefulShutdownController(scope, options);

	// Store reference on scope
	(
		scope as unknown as {
			_shutdownController?: EnhancedGracefulShutdownController;
		}
	)._shutdownController = controller;

	return controller;
}

/**
 * Shutdown coordinator for multi-scope applications
 */
export class ShutdownCoordinator {
	private controllers = new Map<string, EnhancedGracefulShutdownController>();
	private dependencies = new Map<string, Set<string>>();

	/**
	 * Register a scope with the coordinator
	 */
	register(
		name: string,
		scope: Scope,
		options: EnhancedGracefulShutdownOptions = {},
	): EnhancedGracefulShutdownController {
		const controller = new EnhancedGracefulShutdownController(scope, options);
		this.controllers.set(name, controller);
		return controller;
	}

	/**
	 * Register a dependency between scopes (dependency must shutdown first)
	 */
	addDependency(scope: string, dependsOn: string): void {
		if (!this.dependencies.has(scope)) {
			this.dependencies.set(scope, new Set());
		}
		this.dependencies.get(scope)!.add(dependsOn);
	}

	/**
	 * Shutdown all scopes in dependency order
	 */
	async shutdownAll(
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<Map<string, Error | undefined>> {
		const results = new Map<string, Error | undefined>();
		const shutdownOrder = this.calculateShutdownOrder();

		for (const name of shutdownOrder) {
			const controller = this.controllers.get(name);
			if (!controller) continue;

			try {
				await controller.shutdown(signal);
				results.set(name, undefined);
			} catch (error) {
				results.set(
					name,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}

		return results;
	}

	/**
	 * Calculate shutdown order based on dependencies
	 */
	private calculateShutdownOrder(): string[] {
		const visited = new Set<string>();
		const visiting = new Set<string>();
		const order: string[] = [];

		const visit = (name: string): void => {
			if (visited.has(name)) return;
			if (visiting.has(name)) {
				throw new Error(`Circular dependency detected: ${name}`);
			}

			visiting.add(name);

			// Visit dependencies first
			const deps = this.dependencies.get(name);
			if (deps) {
				for (const dep of deps) {
					visit(dep);
				}
			}

			visiting.delete(name);
			visited.add(name);
			order.push(name);
		};

		for (const name of this.controllers.keys()) {
			visit(name);
		}

		return order;
	}

	/**
	 * Get overall shutdown status
	 */
	getStatus(): Map<string, { state: ShutdownState; activeTasks: number }> {
		const status = new Map<
			string,
			{ state: ShutdownState; activeTasks: number }
		>();

		for (const [name, controller] of this.controllers) {
			status.set(name, {
				state: controller.currentState,
				activeTasks: controller.activeTaskCount,
			});
		}

		return status;
	}
}

/**
 * Create a shutdown coordinator
 */
export function createShutdownCoordinator(): ShutdownCoordinator {
	return new ShutdownCoordinator();
}

/**
 * Process lifecycle manager with graceful shutdown
 */
export class ProcessLifecycle {
	private controller?: EnhancedGracefulShutdownController;
	private coordinator?: ShutdownCoordinator;
	private isInitialized = false;

	/**
	 * Initialize process lifecycle
	 */
	init(
		scope: Scope,
		options: EnhancedGracefulShutdownOptions = {},
	): EnhancedGracefulShutdownController {
		if (this.isInitialized) {
			throw new Error("Process lifecycle already initialized");
		}

		this.controller = new EnhancedGracefulShutdownController(scope, options);
		this.isInitialized = true;

		// Handle uncaught errors
		process.on("uncaughtException", (error) => {
			console.error("Uncaught exception:", error);
			void this.controller?.shutdown("SIGTERM");
		});

		process.on("unhandledRejection", (reason) => {
			console.error("Unhandled rejection:", reason);
		});

		return this.controller;
	}

	/**
	 * Initialize with coordinator for multi-scope apps
	 */
	initWithCoordinator(): ShutdownCoordinator {
		if (this.isInitialized) {
			throw new Error("Process lifecycle already initialized");
		}

		this.coordinator = new ShutdownCoordinator();
		this.isInitialized = true;

		// Handle errors
		process.on("uncaughtException", (error) => {
			console.error("Uncaught exception:", error);
			void this.coordinator?.shutdownAll("SIGTERM");
		});

		return this.coordinator;
	}

	/**
	 * Check if initialized
	 */
	get initialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get controller (throws if not initialized)
	 */
	getController(): EnhancedGracefulShutdownController {
		if (!this.controller) {
			throw new Error("Process lifecycle not initialized");
		}
		return this.controller;
	}

	/**
	 * Get coordinator (throws if not initialized)
	 */
	getCoordinator(): ShutdownCoordinator {
		if (!this.coordinator) {
			throw new Error("Process lifecycle not initialized with coordinator");
		}
		return this.coordinator;
	}
}

/**
 * Global process lifecycle instance
 */
export const processLifecycle = new ProcessLifecycle();
