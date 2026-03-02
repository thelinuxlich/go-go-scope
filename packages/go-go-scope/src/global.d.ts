// Global type declarations for go-go-scope

declare global {
	interface SymbolConstructor {
		readonly asyncDispose: unique symbol;
	}

	interface AsyncDisposable {
		[Symbol.asyncDispose](): Promise<void>;
	}
}

export {};
