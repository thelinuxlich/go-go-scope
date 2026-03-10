/**
 * Shared Worker Module for go-go-scope
 * Allows sharing worker module imports across multiple scopes for better performance.
 */

import type { WorkerModuleSpec } from "./types.js";

/**
 * Options for creating a shared worker module
 */
export interface SharedWorkerOptions {
	/** Validate module exists and exports are callable on creation */
	validate?: boolean;
}

/**
 * A shared worker module that can be used across multiple scopes.
 * The module is imported once and cached, reducing overhead when used
 * frequently across different scopes.
 *
 * @example
 * ```typescript
 * // Create once at application startup
 * const mathWorker = await createSharedWorker('./math-lib.js', { validate: true });
 *
 * // Use in multiple scopes
 * await using s1 = scope();
 * const [err1, result1] = await s1.task(
 *   mathWorker.export('fibonacci'),
 *   { worker: true, data: { n: 40 } }
 * );
 *
 * await using s2 = scope();
 * const [err2, result2] = await s2.task(
 *   mathWorker.export('factorial'),
 *   { worker: true, data: { n: 100 } }
 * );
 * ```
 */
export class SharedWorkerModule {
	private modulePath: string;
	private moduleCache: unknown = null;
	private exportCache = new Map<string, WorkerModuleSpec>();

	constructor(modulePath: string) {
		this.modulePath = modulePath;
	}

	/**
	 * Initialize the shared worker by importing and validating the module.
	 * Called automatically by createSharedWorker, but can be called manually
	 * for lazy initialization.
	 */
	async initialize(options?: SharedWorkerOptions): Promise<void> {
		if (this.moduleCache) {
			return;
		}

		const mod = await import(this.modulePath);
		this.moduleCache = mod;

		if (options?.validate !== false) {
			// Validate that at least one export is a function
			const hasFunctionExport = Object.values(mod).some(
				(v) => typeof v === "function",
			);
			if (!hasFunctionExport) {
				throw new Error(
					`SharedWorkerModule '${this.modulePath}' has no function exports`,
				);
			}
		}
	}

	/**
	 * Get a WorkerModuleSpec for a specific export.
	 * The returned spec can be passed to scope.task() for worker execution.
	 *
	 * @param exportName - Name of the export to use (default: 'default')
	 * @returns WorkerModuleSpec configured for this shared module
	 */
	export(exportName = "default"): WorkerModuleSpec {
		// Return cached spec if available
		const cached = this.exportCache.get(exportName);
		if (cached) {
			return cached;
		}

		// Create and cache new spec
		const spec: WorkerModuleSpec = {
			module: this.modulePath,
			export: exportName,
			// Shared modules are already validated and cached
			validate: false,
			cache: true,
		};

		this.exportCache.set(exportName, spec);
		return spec;
	}

	/**
	 * Get all available function exports from the module.
	 * Requires initialize() to be called first.
	 */
	getAvailableExports(): string[] {
		if (!this.moduleCache) {
			throw new Error(
				"SharedWorkerModule not initialized. Call initialize() first.",
			);
		}

		return Object.entries(this.moduleCache as Record<string, unknown>)
			.filter(([, value]) => typeof value === "function")
			.map(([key]) => key);
	}

	/**
	 * Check if a specific export exists and is a function.
	 * Requires initialize() to be called first.
	 */
	hasExport(exportName: string): boolean {
		if (!this.moduleCache) {
			throw new Error(
				"SharedWorkerModule not initialized. Call initialize() first.",
			);
		}

		const mod = this.moduleCache as Record<string, unknown>;
		return typeof mod[exportName] === "function";
	}
}

/**
 * Create a shared worker module that can be used across multiple scopes.
 *
 * @param modulePath - Path to the worker module file
 * @param options - Options for module validation
 * @returns Initialized SharedWorkerModule
 *
 * @example
 * ```typescript
 * // Create shared worker for image processing
 * const imageWorker = await createSharedWorker('./image-processor.js');
 *
 * // Use across different scopes
 * await using scope1 = scope();
 * const [err1, thumb] = await scope1.task(
 *   imageWorker.export('createThumbnail'),
 *   { worker: true, data: { image: buffer, size: 256 } }
 * );
 *
 * await using scope2 = scope();
 * const [err2, compressed] = await scope2.task(
 *   imageWorker.export('compress'),
 *   { worker: true, data: { image: buffer, quality: 0.8 } }
 * );
 * ```
 */
export async function createSharedWorker(
	modulePath: string,
	options?: SharedWorkerOptions,
): Promise<SharedWorkerModule> {
	const worker = new SharedWorkerModule(modulePath);
	await worker.initialize(options);
	return worker;
}
