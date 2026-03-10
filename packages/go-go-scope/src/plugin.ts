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
	install<T extends Scope>(
		scope: T,
		options: ScopeOptions<Record<string, never>>,
	): void;

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
 * Check if a plugin is installed on a scope.
 *
 * @example
 * ```typescript
 * import { scope, hasPlugin, registerPlugin } from 'go-go-scope';
 *
 * // Define a custom plugin
 * const metricsPlugin: ScopePlugin = {
 *   name: 'metrics',
 *   install(scope) {
 *     scope.provide('metrics', {
 *       counters: new Map<string, number>(),
 *       increment(name: string) {
 *         const current = this.counters.get(name) ?? 0;
 *         this.counters.set(name, current + 1);
 *       }
 *     });
 *   }
 * };
 *
 * await using s = scope({ plugins: [metricsPlugin] });
 *
 * // Check if plugin is installed
 * if (hasPlugin(s, 'metrics')) {
 *   console.log('Metrics plugin is active');
 * }
 * ```
 */
export function hasPlugin(scope: Scope, pluginName: string): boolean {
	return pluginRegistry.get(scope)?.has(pluginName) ?? false;
}

/**
 * Register a plugin as installed on a scope.
 * This is called automatically when plugins are passed to scope options,
 * but can also be called manually for dynamic plugin registration.
 *
 * @example
 * ```typescript
 * import { scope, registerPlugin } from 'go-go-scope';
 * import type { ScopePlugin } from 'go-go-scope';
 *
 * // Create a custom logging plugin
 * const loggingPlugin: ScopePlugin = {
 *   name: 'logging',
 *   install(scope) {
 *     // Add a method to the scope
 *     (scope as any).logTask = async (name: string, fn: () => Promise<void>) => {
 *       console.log(`Starting: ${name}`);
 *       await fn();
 *       console.log(`Completed: ${name}`);
 *     };
 *   },
 *   cleanup(scope) {
 *     console.log('Logging plugin cleanup');
 *   }
 * };
 *
 * await using s = scope();
 *
 * // Register plugin manually
 * registerPlugin(s, loggingPlugin);
 *
 * // The plugin is now active on this scope
 * // Plugin lifecycle: cleanup will be called when scope is disposed
 * ```
 */
export function registerPlugin(scope: Scope, plugin: ScopePlugin): void {
	if (!pluginRegistry.has(scope)) {
		pluginRegistry.set(scope, new Set());
	}
	pluginRegistry.get(scope)?.add(plugin.name);
}

/**
 * Install plugins on a scope.
 * This function handles the complete plugin lifecycle including installation
 * and automatic cleanup registration. Called internally when creating a scope.
 *
 * @internal
 *
 * @example
 * ```typescript
 * import { scope, installPlugins } from 'go-go-scope';
 * import type { ScopePlugin } from 'go-go-scope';
 *
 * // Define multiple plugins
 * const pluginA: ScopePlugin = {
 *   name: 'plugin-a',
 *   install(scope) {
 *     console.log('Plugin A installed');
 *   },
 *   cleanup(scope) {
 *     console.log('Plugin A cleanup');
 *   }
 * };
 *
 * const pluginB: ScopePlugin = {
 *   name: 'plugin-b',
 *   install(scope) {
 *     console.log('Plugin B installed');
 *   }
 * };
 *
 * await using s = scope({ plugins: [pluginA, pluginB] });
 *
 * // Plugin lifecycle:
 * // 1. Both plugins are installed in order
 * // 2. cleanup() is registered for plugin-a (has cleanup method)
 * // 3. When scope is disposed, plugin-a.cleanup() is called automatically
 * ```
 */
export function installPlugins<T extends Scope>(
	scope: T,
	options?: ScopeOptions<Record<string, never>>,
): void {
	if (!options?.plugins) return;

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
	interface ScopeOptions<
		ParentServices extends Record<string, unknown> = Record<string, never>,
	> {
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
