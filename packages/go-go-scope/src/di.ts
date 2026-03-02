/**
 * Type-safe Dependency Injection with Auto-wiring for go-go-scope
 *
 * Provides a powerful DI container that integrates with Scope,
 * supporting auto-wiring, lifecycle management, and circular dependency detection.
 */

import type { Scope } from "./scope.js";
import type { Result } from "./types.js";

/**
 * Service lifetime configuration
 */
export type ServiceLifetime = "singleton" | "scoped" | "transient";

/**
 * Service registration options
 */
export interface ServiceRegistration<
	T,
	Deps extends Record<string, unknown> = Record<string, never>,
> {
	/** Service lifetime */
	lifetime: ServiceLifetime;
	/** Factory function with auto-wired dependencies */
	factory: (deps: Deps) => T | Promise<T>;
	/** Optional cleanup function */
	dispose?: (instance: T) => void | Promise<void>;
	/** Dependencies to auto-wire (keys of parent services) */
	dependencies?: Array<keyof Deps>;
}

/**
 * Service token for type-safe registration and resolution
 */
export interface ServiceToken<T> {
	readonly _type: T;
	readonly key: symbol;
	readonly name: string;
}

/**
 * Create a type-safe service token
 *
 * @example
 * ```typescript
 * const DatabaseToken = createToken<Database>('Database')
 * const CacheToken = createToken<Cache>('Cache')
 * ```
 */
export function createToken<T>(name: string): ServiceToken<T> {
	return {
		_type: undefined as unknown as T,
		key: Symbol(name),
		name,
	};
}

/**
 * Service registry entry
 */
interface RegistryEntry<T> {
	registration: ServiceRegistration<T, Record<string, unknown>>;
	instance?: T;
	isCreating: boolean;
}

/**
 * Type-safe Dependency Injection Container
 *
 * Integrates with go-go-scope for automatic lifecycle management
 *
 * @example
 * ```typescript
 * // Define service tokens
 * const DatabaseToken = createToken<Database>('Database')
 * const UserServiceToken = createToken<UserService>('UserService')
 *
 * // Create container
 * const container = createContainer()
 *   .register(DatabaseToken, {
 *     lifetime: 'singleton',
 *     factory: () => new Database()
 *   })
 *   .register(UserServiceToken, {
 *     lifetime: 'scoped',
 *     dependencies: [DatabaseToken],
 *     factory: ({ [DatabaseToken]: db }) => new UserService(db)
 *   })
 *
 * // Use in scope
 * await using s = scope()
 * const userService = await container.resolve(s, UserServiceToken)
 * ```
 */
export class DIContainer<
	Services extends Record<symbol, unknown> = Record<never, never>,
> {
	private registry = new Map<symbol, RegistryEntry<unknown>>();
	private singletonInstances = new Map<symbol, unknown>();

	/**
	 * Register a service with the container
	 */
	register<T, Deps extends Record<string, unknown> = Record<string, never>>(
		token: ServiceToken<T>,
		registration: ServiceRegistration<T, Deps>,
	): DIContainer<Services & Record<ServiceToken<T>["key"], T>> {
		this.registry.set(token.key, {
			registration: registration as unknown as ServiceRegistration<
				unknown,
				Record<string, unknown>
			>,
			isCreating: false,
		});
		return this as DIContainer<Services & Record<ServiceToken<T>["key"], T>>;
	}

	/**
	 * Check if a service is registered
	 */
	isRegistered<T>(token: ServiceToken<T>): boolean {
		return this.registry.has(token.key);
	}

	/**
	 * Resolve a service from the container
	 */
	async resolve<T>(
		scope: Scope,
		token: ServiceToken<T>,
	): Promise<Result<Error, T>> {
		const entry = this.registry.get(token.key);

		if (!entry) {
			return [new Error(`Service '${token.name}' not registered`), undefined];
		}

		try {
			const instance = await this.createInstance(scope, token.key, entry);
			return [undefined, instance as T];
		} catch (error) {
			return [
				error instanceof Error ? error : new Error(String(error)),
				undefined,
			];
		}
	}

	/**
	 * Resolve a service synchronously (only for existing singletons)
	 */
	resolveSync<T>(token: ServiceToken<T>): Result<Error, T> {
		const entry = this.registry.get(token.key);

		if (!entry) {
			return [new Error(`Service '${token.name}' not registered`), undefined];
		}

		if (entry.registration.lifetime !== "singleton") {
			return [
				new Error(
					`Cannot resolve '${token.name}' synchronously - not a singleton`,
				),
				undefined,
			];
		}

		const instance = this.singletonInstances.get(token.key);
		if (!instance) {
			return [
				new Error(`Singleton '${token.name}' not yet created`),
				undefined,
			];
		}

		return [undefined, instance as T];
	}

	/**
	 * Create an instance with dependency injection
	 */
	private async createInstance<T>(
		scope: Scope,
		key: symbol,
		entry: RegistryEntry<T>,
	): Promise<T> {
		const { registration } = entry;

		// Check for circular dependency
		if (entry.isCreating) {
			throw new Error(`Circular dependency detected for service`);
		}

		// Return existing singleton
		if (registration.lifetime === "singleton") {
			const existing = this.singletonInstances.get(key);
			if (existing) {
				return existing as T;
			}
		}

		// Check scoped instances from scope's service map
		if (registration.lifetime === "scoped") {
			const services = (
				scope as unknown as { servicesMap: Map<symbol, unknown> }
			).servicesMap;
			const existing = services.get(key);
			if (existing) {
				return existing as T;
			}
		}

		// Mark as creating (circular dependency detection)
		entry.isCreating = true;

		try {
			// Resolve dependencies
			const deps = await this.resolveDependencies(
				scope,
				registration.dependencies || [],
			);

			// Create instance
			const instance = await registration.factory(deps);

			// Store based on lifetime
			if (registration.lifetime === "singleton") {
				this.singletonInstances.set(key, instance);
			} else if (registration.lifetime === "scoped") {
				const services = (
					scope as unknown as { servicesMap: Map<symbol, unknown> }
				).servicesMap;
				services.set(key, instance);

				// Register cleanup if dispose function provided
				if (registration.dispose) {
					scope.onDispose(() => registration.dispose!(instance));
				}
			}

			return instance;
		} finally {
			entry.isCreating = false;
		}
	}

	/**
	 * Resolve dependencies for auto-wiring
	 */
	private async resolveDependencies(
		scope: Scope,
		dependencyTokens: Array<ServiceToken<unknown> | string>,
	): Promise<Record<string, unknown>> {
		const deps: Record<string, unknown> = {};

		for (const token of dependencyTokens) {
			if (typeof token === "string") {
				// Try to get from scope's service map by string key
				const scopeServices = (
					scope as unknown as { servicesMap: Record<string, unknown> }
				).servicesMap;
				deps[token] = scopeServices[token];
			} else {
				// Resolve from container
				const [err, instance] = await this.resolve(scope, token);
				if (err) {
					throw new Error(
						`Failed to resolve dependency '${token.name}': ${err.message}`,
					);
				}
				deps[token.key as unknown as string] = instance;
			}
		}

		return deps;
	}

	/**
	 * Create a child container with inherited registrations
	 */
	createChild(): DIContainer<Services> {
		const child = new DIContainer<Services>();

		// Copy registrations
		for (const [key, entry] of this.registry) {
			child.registry.set(key, { ...entry });
		}

		// Copy singleton instances
		for (const [key, instance] of this.singletonInstances) {
			child.singletonInstances.set(key, instance);
		}

		return child;
	}

	/**
	 * Dispose all singleton instances
	 */
	async dispose(): Promise<void> {
		for (const [key, entry] of this.registry) {
			if (entry.registration.lifetime === "singleton") {
				const instance = this.singletonInstances.get(key);
				if (instance && entry.registration.dispose) {
					try {
						await entry.registration.dispose(instance);
					} catch {
						// Ignore cleanup errors
					}
				}
			}
		}

		this.singletonInstances.clear();
	}
}

/**
 * Create a new DI container
 */
export function createContainer(): DIContainer {
	return new DIContainer();
}

/**
 * Decorator for injecting services into classes
 *
 * @example
 * ```typescript
 * @injectable()
 * class UserService {
 *   constructor(
 *     @inject(DatabaseToken) private db: Database,
 *     @inject(CacheToken) private cache: Cache
 *   ) {}
 * }
 * ```
 */
export function injectable<T extends new (...args: unknown[]) => unknown>(
	target: T,
): T {
	return target;
}

/**
 * Property decorator for lazy service injection
 *
 * @example
 * ```typescript
 * class MyClass {
 *   @inject(DatabaseToken)
 *   private db!: Database
 * }
 * ```
 */
export function inject<T>(token: ServiceToken<T>) {
	return (target: unknown, propertyKey: string | symbol) => {
		// Store injection metadata
		const injections =
			(
				target as unknown as {
					__injections?: Map<string | symbol, ServiceToken<T>>;
				}
			).__injections || new Map();
		injections.set(propertyKey, token);
		(
			target as unknown as {
				__injections: Map<string | symbol, ServiceToken<T>>;
			}
		).__injections = injections;
	};
}

/**
 * Service provider interface for integration with Scope
 */
export interface ServiceProvider<Services extends Record<string, unknown>> {
	/** Get a service by key */
	get<K extends keyof Services>(key: K): Services[K] | undefined;
	/** Check if service exists */
	has<K extends keyof Services>(key: K): boolean;
	/** Register a service */
	provide<K extends string, T>(
		key: K,
		factory: (provider: ServiceProvider<Services>) => T | Promise<T>,
		dispose?: (value: T) => void | Promise<void>,
	): ServiceProvider<Services & Record<K, T>>;
}

/**
 * Create a type-safe service provider
 *
 * @example
 * ```typescript
 * const provider = createServiceProvider()
 *   .provide('db', () => new Database())
 *   .provide('cache', ({ db }) => new Cache(db))
 *   .provide('service', ({ db, cache }) => new UserService(db, cache))
 *
 * const service = provider.get('service') // Fully typed!
 * ```
 */
export function createServiceProvider<
	Services extends Record<string, unknown> = Record<never, never>,
>(scope?: Scope): ServiceProvider<Services> {
	const services = new Map<string, unknown>();
	const disposers: { key: string; dispose: () => void | Promise<void> }[] = [];

	const provider: ServiceProvider<Services> = {
		get<K extends keyof Services>(key: K): Services[K] | undefined {
			return services.get(key as string) as Services[K] | undefined;
		},

		has<K extends keyof Services>(key: K): boolean {
			return services.has(key as string);
		},

		provide<K extends string, T>(
			key: K,
			factory: (provider: ServiceProvider<Services>) => T | Promise<T>,
			dispose?: (value: T) => void | Promise<void>,
		): ServiceProvider<Services & Record<K, T>> {
			// Create proxy provider for dependency resolution
			const proxyProvider = new Proxy(provider, {
				get(target, prop) {
					if (prop === "get" || prop === "has" || prop === "provide") {
						return target[prop as keyof typeof target];
					}
					return undefined;
				},
			}) as ServiceProvider<Services>;

			// Create instance with auto-wiring
			Promise.resolve(factory(proxyProvider)).then((instance) => {
				services.set(key, instance);

				if (dispose) {
					disposers.push({ key, dispose: () => dispose(instance) });

					// Register with scope if provided
					scope?.onDispose(() => dispose(instance));
				}
			});

			return provider as ServiceProvider<Services & Record<K, T>>;
		},
	};

	return provider;
}

/**
 * Module definition for organizing services
 */
export interface DIModule<Exports extends Record<string, unknown>> {
	/** Module name */
	name: string;
	/** Module setup function */
	setup(container: DIContainer): void;
	/** Exported tokens */
	exports: { [K in keyof Exports]: ServiceToken<Exports[K]> };
}

/**
 * Create a DI module
 *
 * @example
 * ```typescript
 * const DatabaseModule = createModule({
 *   name: 'Database',
 *   setup: (container) => {
 *     container.register(DatabaseToken, {
 *       lifetime: 'singleton',
 *       factory: () => new Database()
 *     })
 *   },
 *   exports: { database: DatabaseToken }
 * })
 *
 * // Use module
 * container.load(DatabaseModule)
 * const db = await container.resolve(scope, DatabaseModule.exports.database)
 * ```
 */
export function createModule<Exports extends Record<string, unknown>>(
	config: DIModule<Exports>,
): DIModule<Exports> {
	return config;
}

// Augment DIContainer with module loading
declare module "./di.js" {
	interface DIContainer<Services extends Record<symbol, unknown>> {
		load<Exports extends Record<string, unknown>>(
			module: DIModule<Exports>,
		): DIContainer<
			Services & {
				[K in keyof Exports as ServiceToken<Exports[K]>["key"]]: Exports[K];
			}
		>;
	}
}

DIContainer.prototype.load = function <Exports extends Record<string, unknown>>(
	this: DIContainer,
	module: DIModule<Exports>,
): DIContainer {
	module.setup(this);
	return this;
};
