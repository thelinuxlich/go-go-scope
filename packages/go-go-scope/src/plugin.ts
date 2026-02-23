/**
 * Plugin system for go-go-scope
 *
 * Allows extending Scope with additional functionality.
 *
 * @example
 * ```typescript
 * import { scope } from 'go-go-scope'
 * import { streamPlugin } from '@go-go-scope/stream'
 *
 * const s = scope({ plugins: [streamPlugin] })
 * const st = s.stream([1, 2, 3]) // Works!
 * ```
 */

import type { Scope, ScopeOptions } from "./scope.js";

/**
 * Plugin interface for extending Scope functionality
 */
export interface ScopePlugin {
	/** Unique plugin name */
	name: string;

	/**
	 * Called when the scope is created.
	 * Can add methods/properties to the scope.
	 */
	install<T extends Scope>(scope: T, options: ScopeOptions): void;

	/**
	 * Called when the scope is disposed.
	 * Cleanup any plugin-specific resources.
	 */
	cleanup?(scope: Scope): void;
}

/**
 * Plugin registry to store installed plugins per scope
 */
const pluginRegistry = new WeakMap<Scope, Set<string>>();

/**
 * Check if a plugin is installed on a scope
 */
export function hasPlugin(scope: Scope, pluginName: string): boolean {
	return pluginRegistry.get(scope)?.has(pluginName) ?? false;
}

/**
 * Register a plugin as installed on a scope
 */
export function registerPlugin(scope: Scope, plugin: ScopePlugin): void {
	if (!pluginRegistry.has(scope)) {
		pluginRegistry.set(scope, new Set());
	}
	pluginRegistry.get(scope)?.add(plugin.name);
}

/**
 * Install plugins on a scope
 * @internal
 */
export function installPlugins<T extends Scope>(
	scope: T,
	options: ScopeOptions,
): void {
	if (!options.plugins) return;

	for (const plugin of options.plugins) {
		if (hasPlugin(scope, plugin.name)) {
			continue; // Skip already installed plugins
		}

		plugin.install(scope, options);
		registerPlugin(scope, plugin);

		// Register cleanup hook if provided
		if (plugin.cleanup) {
			scope.onDispose(() => plugin.cleanup?.(scope));
		}
	}
}

/**
 * Type helper to extract plugin-added methods
 */
export type WithPlugins<T extends Scope, Plugins extends ScopePlugin[]> = T & {
	[K in Plugins[number] as K extends {
		name: infer N extends string;
	}
		? N extends `${infer First}${string}`
			? First extends string
				? K extends { methods: infer M }
					? keyof M extends never
						? never
						: N
					: never
				: never
			: never
		: never]: K extends { methods: infer M } ? M : never;
};

// Augment ScopeOptions to include plugins
declare module "./scope.js" {
	interface ScopeOptions<Services extends Record<string, unknown>> {
		/**
		 * Plugins to extend scope functionality
		 * @example
		 * ```typescript
		 * import { streamPlugin } from '@go-go-scope/stream'
		 * const s = scope({ plugins: [streamPlugin] })
		 * ```
		 */
		plugins?: ScopePlugin[];
	}
}

export type { Scope, ScopeOptions };
