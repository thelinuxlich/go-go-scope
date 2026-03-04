/**
 * Graceful Shutdown Helper for go-go-scope
 *
 * Handles shutdown signals (SIGTERM, SIGINT) gracefully,
 * allowing ongoing operations to complete before exiting.
 */

import type { Scope } from "./scope.js";

/**
 * Options for graceful shutdown
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
 * with the scope lifecycle.
 *
 * @example
 * ```typescript
 * await using s = scope()
 *
 * const shutdown = setupGracefulShutdown(s, {
 *   timeout: 30000,
 *   onShutdown: async (signal) => {
 *     console.log(`Received ${signal}, shutting down...`)
 *   }
 * })
 *
 * // In your tasks, check for shutdown
 * s.task(async () => {
 *   while (!s.shutdownRequested) {
 *     await process()
 *   }
 * })
 * ```
 */
export class GracefulShutdownController {
	private shutdownRequested = false;
	private shutdownPromise: Promise<void> | undefined;
	private resolveShutdown: (() => void) | undefined;
	private registeredSignals: NodeJS.Signals[] = [];

	constructor(
		private readonly scope: Scope<Record<string, unknown>>,
		private readonly options: GracefulShutdownOptions = {},
	) {
		this.setupSignalHandlers();
		this.setupScopeIntegration();
	}

	/**
	 * Check if shutdown has been requested.
	 */
	get isShutdownRequested(): boolean {
		return this.shutdownRequested;
	}

	/**
	 * Get a promise that resolves when shutdown is complete.
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

	private setupSignalHandlers(): void {
		const signals = this.options.signals ?? ["SIGTERM", "SIGINT"];

		for (const signal of signals) {
			process.on(signal, this.handleSignal as NodeJS.SignalsListener);
			this.registeredSignals.push(signal);
		}
	}

	private handleSignal = (signal: NodeJS.Signals): void => {
		void this.shutdown(signal);
	};

	private setupScopeIntegration(): void {
		// Add shutdownRequested property to scope
		Object.defineProperty(this.scope, "shutdownRequested", {
			get: () => this.shutdownRequested,
			enumerable: true,
			configurable: true,
		});
	}
}
