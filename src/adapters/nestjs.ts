/**
 * NestJS adapter for go-go-scope
 * Provides dependency injection integration for NestJS applications
 */

import {
	Inject,
	Injectable,
	Module,
	Scope as NestRequestScope,
	type OnModuleDestroy,
	Optional,
} from "@nestjs/common";
import { type Scope, scope } from "../index.js";

export const GOGO_ROOT_SCOPE = Symbol("GOGO_ROOT_SCOPE");
export const GOGO_REQUEST_SCOPE = Symbol("GOGO_REQUEST_SCOPE");
export const GOGO_MODULE_OPTIONS = Symbol("GOGO_MODULE_OPTIONS");

export interface GoGoScopeModuleOptions {
	/** Root scope name */
	name?: string;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Default timeout for all requests */
	timeout?: number;
}

/**
 * Service providing access to the root application scope
 */
@Injectable()
export class GoGoScopeService implements OnModuleDestroy {
	public readonly rootScope: Scope;

	constructor(
		@Optional()
		@Inject(GOGO_MODULE_OPTIONS)
		_options: GoGoScopeModuleOptions = {},
	) {
		this.rootScope = scope({
			name: _options.name ?? "nestjs-app",
			metrics: _options.metrics,
			timeout: _options.timeout,
		});
	}

	/**
	 * Create a new child scope from the root
	 */
	createScope(
		name: string,
		options?: Omit<Parameters<typeof scope>[0], "parent">,
	): Scope {
		return scope({
			parent: this.rootScope,
			name,
			...options,
		});
	}

	/**
	 * Get current metrics from the root scope
	 */
	getMetrics() {
		return this.rootScope.metrics();
	}

	async onModuleDestroy() {
		await this.rootScope[Symbol.asyncDispose]().catch(() => {});
	}
}

/**
 * Request-scoped service that provides a unique scope per HTTP request
 */
@Injectable({ scope: NestRequestScope.REQUEST })
export class GoGoRequestScopeService implements OnModuleDestroy {
	public readonly requestScope: Scope;

	constructor(
		_scopeService: GoGoScopeService,
		@Optional()
		@Inject(GOGO_MODULE_OPTIONS)
		_options: GoGoScopeModuleOptions = {},
	) {
		this.requestScope = scope({
			parent: _scopeService.rootScope,
			name: `request-${Date.now()}`,
			timeout: _options.timeout,
		});
	}

	/**
	 * Get the underlying scope for advanced operations
	 */
	getScope(): Scope {
		return this.requestScope;
	}

	async onModuleDestroy() {
		await this.requestScope[Symbol.asyncDispose]().catch(() => {});
	}
}

/**
 * Decorator to execute a method within a task
 *
 * @example
 * ```typescript
 * @Injectable()
 * class UserService {
 *   @Task({ retry: 'exponential', timeout: 5000 })
 *   async getUser(id: string) {
 *     return fetchUser(id)
 *   }
 * }
 * ```
 */
export function Task(options?: Parameters<Scope["task"]>[1]) {
	return (
		_target: any,
		_propertyKey: string,
		descriptor: PropertyDescriptor,
	) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (this: any, ...args: any[]) {
			// Try to get request scope if available, otherwise use root scope
			const scopeService: GoGoRequestScopeService | undefined = (
				this as { goGoRequestScopeService?: GoGoRequestScopeService }
			).goGoRequestScopeService;
			const rootScopeService: GoGoScopeService | undefined = (
				this as { goGoScopeService?: GoGoScopeService }
			).goGoScopeService;

			const taskScope = scopeService?.getScope() ?? rootScopeService?.rootScope;

			if (!taskScope) {
				throw new Error(
					"No scope available. Ensure GoGoScopeModule is imported.",
				);
			}

			const [err, result] = await taskScope.task(
				() => originalMethod.apply(this, args),
				options ?? {},
			);

			if (err) throw err;
			return result;
		};

		return descriptor;
	};
}

/**
 * NestJS module for go-go-scope integration
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [GoGoScopeModule.forRoot({ metrics: true })],
 *   providers: [UserService],
 * })
 * class AppModule {}
 * ```
 */
@Module({})
export class GoGoScopeModule {
	static forRoot(options: GoGoScopeModuleOptions = {}) {
		return {
			module: GoGoScopeModule,
			providers: [
				{
					provide: GOGO_MODULE_OPTIONS,
					useValue: options,
				},
				GoGoScopeService,
				GoGoRequestScopeService,
			],
			exports: [GoGoScopeService, GoGoRequestScopeService],
		};
	}
}
