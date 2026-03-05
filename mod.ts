/**
 * go-go-scope for Deno
 * Structured concurrency using Explicit Resource Management
 *
 * @example
 * ```typescript
 * import { scope } from "https://deno.land/x/go_go_scope/mod.ts";
 *
 * await using s = scope({ timeout: 5000 });
 * const [err, data] = await s.task(() => fetchData());
 * ```
 */

// Re-export everything from the core package
export * from "./packages/go-go-scope/src/index.ts";

// Deno-specific utilities

/**
 * Check if running in Deno
 */
export const isDeno = typeof Deno !== "undefined";

/**
 * Deno version info
 */
export function getDenoVersion(): string | undefined {
	if (isDeno) {
		return Deno.version.deno;
	}
	return undefined;
}

/**
 * Check Deno permissions
 */
export async function checkPermissions(): Promise<{
	network: boolean;
	read: boolean;
	write: boolean;
}> {
	if (!isDeno) {
		return { network: true, read: true, write: true };
	}

	const results = {
		network: false,
		read: false,
		write: false,
	};

	try {
		const status = await Deno.permissions.query({ name: "net" });
		results.network = status.state === "granted";
	} catch {
		// Permission query failed
	}

	try {
		const status = await Deno.permissions.query({ name: "read" });
		results.read = status.state === "granted";
	} catch {
		// Permission query failed
	}

	try {
		const status = await Deno.permissions.query({ name: "write" });
		results.write = status.state === "granted";
	} catch {
		// Permission query failed
	}

	return results;
}
