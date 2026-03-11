/**
 * Graceful Shutdown Helper for go-go-scope
 *
 * @module go-go-scope/graceful-shutdown
 *
 * @description
 * Handles shutdown signals (SIGTERM, SIGINT) gracefully, allowing ongoing
 * operations to complete before exiting. Integrates with the scope lifecycle
 * to ensure proper cleanup of resources and tasks.
 *
 * Features:
 * - Signal handling for SIGTERM, SIGINT, and custom signals
 * - Configurable timeout before forceful exit
 * - Shutdown and completion callbacks
 * - Integration with scope cancellation
 * - Manual shutdown trigger capability
 * - Cleanup and resource removal
 * - Configurable exit behavior and codes
 *
 * @see {@link GracefulShutdownController} The controller class
 * @see {@link setupGracefulShutdown} Factory function
 * @see {@link GracefulShutdownOptions} Configuration options
 * @see {@link Scope.setupGracefulShutdown} Factory method on scope
 */

import type { Scope } from "./scope.js";

/**
 * Options for graceful shutdown configuration.
 *
 * @interface
 *
 * @see {@link GracefulShutdownController} Where these options are used
 * @see {@link setupGracefulShutdown} Factory function accepting these options
 *
 * @example
 * ```typescript
 * const options: GracefulShutdownOptions = {
 *   signals: ['SIGTERM', 'SIGINT'],
 *   timeout: 30000,
 *   onShutdown: async (signal) => {
 *     console.log(`Received ${signal}, starting shutdown...`);
 *   },
 *   onComplete: async () => {
 *     console.log('Shutdown complete');
 *   },
 *   exit: true,
 *   successExitCode: 0,
 *   timeoutExitCode: 1
 * };
 * ```
 */
export interface GracefulShutdownOptions {
	/** Signals to listen for (default: ['SIGTERM', 'SIGINT']) */
	signals?: NodeJS.Signals[];
	/** Timeout in milliseconds before forceful exit (default: 30000) */
	timeout?: number;
	/** Callback when shutdown is requested */
	onShutdown?: (signal: NodeJS.Signals) => void | Promise<void>;
	/** Callback when shutdown is complete */
	onComplete?: () => void | Promise<void>;
	/** Exit process after shutdown (default: true) */
	exit?: boolean;
	/** Exit code on success (default: 0) */
	successExitCode?: number;
	/** Exit code on timeout (default: 1) */
	timeoutExitCode?: number;
}

/**
 * Graceful shutdown controller.
 *
 * Automatically handles shutdown signals and coordinates cleanup
 * with the scope lifecycle. When a shutdown signal is received:
 *
 * 1. The onShutdown callback is invoked
 * 2. The scope is aborted (cancelling ongoing tasks)
 * 3. The scope is disposed (cleaning up resources)
 * 4. The onComplete callback is invoked
 * 5. The process exits (if configured)
 *
 * Tasks can check `scope.shutdownRequested` to cooperatively shut down.
 *
 * @see {@link setupGracefulShutdown} Factory function
 * @see {@link GracefulShutdownOptions} Configuration options
 *
 * @example
 * ```typescript
 * import { scope } from "go-go-scope";
 *
 * await using s = scope()
 *
 * const shutdown = setupGracefulShutdown(s, {
 *   timeout: 30000,
 *   onShutdown: async (signal) => {
 *     console.log(`Received ${signal}, shutting down...`)
 *   },
 *   onComplete: async () => {
 *     console.log('Cleanup complete');
 *   }
 * })
 *
 * // In your tasks, check for shutdown
 * s.task(async ({ signal }) => {
 *   while (!signal.aborted) {
 *     await process()
 *   }
 * })
 *
 * // Or check the controller directly
 * s.task(async () => {
 *   while (!shutdown.isShutdownRequested) {
 *     await process()
 *   }
 * })
 *
 * // Wait for shutdown to complete
 * await shutdown.shutdownComplete;
 * ```
 */
export class GracefulShutdownController {
	private shutdownRequested = false;
	private shutdownPromise: Promise<void> | undefined;
	private resolveShutdown: (() => void) | undefined;
	private registeredSignals: NodeJS.Signals[] = [];

	/**
	 * Creates a new GracefulShutdownController.
	 *
	 * Automatically sets up signal handlers and scope integration.
	 *
	 * @param scope - The scope to coordinate shutdown with
	 * @param options - Configuration options for shutdown behavior
	 * @param options.signals - Signals to listen for (default: ['SIGTERM', 'SIGINT'])
	 * @param options.timeout - Timeout in milliseconds before forceful exit (default: 30000)
	 * @param options.onShutdown - Callback when shutdown is requested
	 * @param options.onComplete - Callback when shutdown is complete
	 * @param options.exit - Exit process after shutdown (default: true)
	 * @param options.successExitCode - Exit code on success (default: 0)
	 * @param options.timeoutExitCode - Exit code on timeout (default: 1)
	 *
	 * @internal Use {@link setupGracefulShutdown} or {@link Scope.setupGracefulShutdown} instead
	 */
	constructor(
		private readonly scope: Scope<Record<string, unknown>>,
		private readonly options: GracefulShutdownOptions = {},
	) {
		this.setupSignalHandlers();
		this.setupScopeIntegration();
	}

	/**
	 * Check if shutdown has been requested.
	 *
	 * Can be polled by tasks to check if they should stop processing.
	 *
	 * @returns {boolean} True if shutdown has been requested
	 *
	 * @see {@link GracefulShutdownOptions.onShutdown} For callback-based notification
	 *
	 * @example
	 * ```typescript
	 * // Poll for shutdown in a loop
	 * s.task(async () => {
	 *   const controller = setupGracefulShutdown(s, options);
	 *
	 *   while (true) {
	 *     if (controller.isShutdownRequested) {
	 *       console.log('Shutting down gracefully...');
	 *       break;
	 *     }
	 *     await processBatch();
	 *   }
	 * });
	 *
	 * // Check before starting expensive operation
	 * s.task(async () => {
	 *   if (controller.isShutdownRequested) {
	 *     return; // Skip processing
	 *   }
	 *   await expensiveOperation();
	 * });
	 * ```
	 */
	get isShutdownRequested(): boolean {
		return this.shutdownRequested;
	}

	/**
	 * Get a promise that resolves when shutdown is complete.
	 *
	 * Useful for waiting on shutdown completion in tests or
	 * when manually triggering shutdown.
	 *
	 * @returns {Promise<void>} Promise that resolves when shutdown completes
	 *
	 * @see {@link GracefulShutdownController.shutdown} For triggering shutdown
	 *
	 * @example
	 * ```typescript
	 * // Wait for shutdown in tests
	 * test('shutdown handling', async () => {
	 *   const controller = setupGracefulShutdown(s, { exit: false });
	 *
	 *   // Trigger shutdown
	 *   await controller.shutdown('SIGTERM');
	 *
	 *   // Wait for completion
	 *   await controller.shutdownComplete;
	 *	 *   expect(controller.isShutdownRequested).toBe(true);
	 * });
	 *
	 * // Coordinate multiple shutdown handlers
	 * await Promise.all([
	 *   controller.shutdownComplete,
	 *   httpServer.close(),
	 *   database.disconnect()
	 * ]);
	 * ```
	 */
	get shutdownComplete(): Promise<void> {
		if (!this.shutdownPromise) {
			this.shutdownPromise = new Promise((resolve) => {
				this.resolveShutdown = resolve;
			});
		}
		return this.shutdownPromise;
	}

	/**
	 * Manually trigger shutdown.
	 *
	 * Can be called programmatically to initiate shutdown without
	 * receiving a signal. If shutdown is already in progress,
	 * returns the existing shutdown promise.
	 *
	 * @param signal - The signal that triggered shutdown (default: 'SIGTERM')
	 * @returns {Promise<void>} Resolves when shutdown is complete
	 *
	 * @see {@link GracefulShutdownController.isShutdownRequested} Check if shutdown started
	 * @see {@link GracefulShutdownController.shutdownComplete} Wait for completion
	 *
	 * @example
	 * ```typescript
	 * // Manual shutdown trigger
	 * app.post('/admin/shutdown', async (req, res) => {
	 *   res.json({ status: 'shutting down' });
	 *   await controller.shutdown('SIGTERM');
	 * });
	 *
	 * // Shutdown on specific condition
	 * s.task(async () => {
	 *   if (await checkFatalCondition()) {
	 *     console.error('Fatal condition detected, shutting down');
	 *     await controller.shutdown('SIGTERM');
	 *   }
	 * });
	 *
	 * // Graceful restart
	 * process.on('SIGUSR2', () => {
	 *   controller.shutdown('SIGUSR2').then(() => {
	 *     // Restart logic
	 *     spawn(process.argv0, process.argv.slice(1), { detached: true });
	 *   });
	 * });
	 * ```
	 */
	async shutdown(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
		if (this.shutdownRequested) {
			return this.shutdownComplete;
		}

		this.shutdownRequested = true;

		const timeout = this.options.timeout ?? 30000;
		const startTime = Date.now();

		// Call onShutdown callback
		if (this.options.onShutdown) {
			try {
				await this.options.onShutdown(signal);
			} catch (error) {
				console.error("Error in onShutdown callback:", error);
			}
		}

		// Abort the scope to cancel ongoing tasks
		if (!this.scope.signal.aborted) {
			(
				this.scope as unknown as { abortController: AbortController }
			).abortController.abort(new Error(`Shutdown requested: ${signal}`));
		}

		// Dispose the scope and wait for cleanup or timeout
		const remainingTime = Math.max(0, timeout - (Date.now() - startTime));
		try {
			await Promise.race([
				(this.scope as unknown as AsyncDisposable)[Symbol.asyncDispose](),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Shutdown timeout")),
						remainingTime,
					),
				),
			]);
		} catch (error) {
			// Scope disposal error is expected if already disposed
			if ((error as Error).message !== "Shutdown timeout") {
				// Already disposed or other error, ignore
			}
		}

		// Call onComplete callback
		if (this.options.onComplete) {
			try {
				await this.options.onComplete();
			} catch (error) {
				console.error("Error in onComplete callback:", error);
			}
		}

		// Resolve shutdown promise
		this.resolveShutdown?.();

		// Exit process if configured
		if (this.options.exit !== false) {
			const exitCode =
				Date.now() - startTime >= timeout
					? (this.options.timeoutExitCode ?? 1)
					: (this.options.successExitCode ?? 0);
			process.exit(exitCode);
		}
	}

	/**
	 * Remove signal handlers.
	 *
	 * Stops listening for shutdown signals. Useful for cleanup in tests
	 * or when you want to disable the controller without shutting down.
	 *
	 * @see {@link GracefulShutdownController.shutdown} For triggering shutdown
	 *
	 * @example
	 * ```typescript
	 * // Cleanup in tests
	 * afterEach(() => {
	 *   controller.cleanup();
	 * });
	 *
	 * // Disable graceful shutdown temporarily
	 * controller.cleanup();
	 * // ... do work without signal handling ...
	 * // Re-enable if needed by creating new controller
	 *
	 * // Clean shutdown sequence
	 * async function cleanExit() {
	 *   controller.cleanup();  // Stop listening for signals
	 *   await controller.shutdown('SIGTERM');  // Manual shutdown
	 * }
	 * ```
	 */
	cleanup(): void {
		for (const signal of this.registeredSignals) {
			process.removeListener(
				signal,
				this.handleSignal as NodeJS.SignalsListener,
			);
		}
		this.registeredSignals = [];
	}

	/**
	 * Setup signal handlers for configured signals.
	 *
	 * @internal
	 */
	private setupSignalHandlers(): void {
		const signals = this.options.signals ?? ["SIGTERM", "SIGINT"];

		for (const signal of signals) {
			process.on(signal, this.handleSignal as NodeJS.SignalsListener);
			this.registeredSignals.push(signal);
		}
	}

	/**
	 * Handle incoming signals by triggering shutdown.
	 *
	 * @internal
	 */
	private handleSignal = (signal: NodeJS.Signals): void => {
		void this.shutdown(signal);
	};

	/**
	 * Add shutdownRequested property to scope for easy access.
	 *
	 * @internal
	 */
	private setupScopeIntegration(): void {
		// Add shutdownRequested property to scope
		Object.defineProperty(this.scope, "shutdownRequested", {
			get: () => this.shutdownRequested,
			enumerable: true,
			configurable: true,
		});
	}
}

/**
 * Setup graceful shutdown handling for a scope.
 *
 * Factory function that creates a {@link GracefulShutdownController} for the
 * given scope. The controller will automatically handle shutdown signals and
 * coordinate cleanup with the scope lifecycle.
 *
 * @param scope - The scope to coordinate shutdown with
 * @param options - Configuration options for shutdown behavior
 * @param options.signals - Signals to listen for (default: ['SIGTERM', 'SIGINT'])
 * @param options.timeout - Timeout in milliseconds before forceful exit (default: 30000)
 * @param options.onShutdown - Callback when shutdown is requested
 * @param options.onComplete - Callback when shutdown is complete
 * @param options.exit - Exit process after shutdown (default: true)
 * @param options.successExitCode - Exit code on success (default: 0)
 * @param options.timeoutExitCode - Exit code on timeout (default: 1)
 * @returns {GracefulShutdownController} The shutdown controller
 *
 * @internal Use {@link Scope.setupGracefulShutdown} instead
 *
 * @see {@link GracefulShutdownController} The controller class
 * @see {@link GracefulShutdownOptions} Configuration options
 * @see {@link Scope.setupGracefulShutdown} Factory method on scope
 *
 * @example
 * ```typescript
 * import { scope, setupGracefulShutdown } from "go-go-scope";
 *
 * await using s = scope();
 *
 * // Setup with default options
 * const shutdown = setupGracefulShutdown(s);
 *
 * // Setup with custom options
 * const shutdown = setupGracefulShutdown(s, {
 *   signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
 *   timeout: 60000,
 *   onShutdown: async (signal) => {
 *     console.log(`Shutting down due to ${signal}...`);
 *     await notifyMonitoringSystem();
 *   },
 *   onComplete: async () => {
 *     console.log('Shutdown complete');
 *     await flushLogs();
 *   },
 *   exit: true,
 *   successExitCode: 0,
 *   timeoutExitCode: 1
 * });
 *
 * // Tasks can check for shutdown
 * s.task(async ({ signal }) => {
 *   while (!signal.aborted) {
 *     await processWork();
 *   }
 * });
 *
 * // Or use the controller
 * s.task(async () => {
 *   while (!shutdown.isShutdownRequested) {
 *     await processWork();
 *   }
 * });
 *
 * // Manual shutdown
 * app.post('/shutdown', async (req, res) => {
 *   res.json({ status: 'shutting down' });
 *   await shutdown.shutdown('SIGTERM');
 * });
 *
 * // Cleanup signal handlers if needed
 * process.on('message', (msg) => {
 *   if (msg === 'disconnect') {
 *     shutdown.cleanup();
 *   }
 * });
 * ```
 */
export function setupGracefulShutdown(
	scope: Scope<Record<string, unknown>>,
	options?: GracefulShutdownOptions,
): GracefulShutdownController {
	return new GracefulShutdownController(scope, options);
}
