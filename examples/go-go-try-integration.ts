/**
 * Example: go-go-try + go-go-scope integration
 *
 * Demonstrates automatic union inference of typed errors when combining
 * go-go-try with go-go-scope for structured concurrency.
 *
 * Install dependencies:
 *   npm install go-go-scope go-go-try
 */

import { scope } from "go-go-scope";
import { taggedError, success, failure, type TaggedUnion } from "go-go-try";

// ==========================================
// Define Tagged Error Classes using taggedError helper
// ==========================================

const DatabaseError = taggedError("DatabaseError");
const NetworkError = taggedError("NetworkError");
const ValidationError = taggedError("ValidationError");
const CacheError = taggedError("CacheError");

// Types for the errors
const AppErrors = [DatabaseError, NetworkError, ValidationError, CacheError] as const;
type AppError = TaggedUnion<typeof AppErrors>;

// ==========================================
// Simulated External Services
// ==========================================

async function queryDatabase(id: string): Promise<{ id: string; name: string }> {
	// Simulate occasional DB failures
	if (Math.random() < 0.1) {
		throw new Error("Connection refused");
	}
	return { id, name: `User ${id}` };
}

async function enrichUserData(
	user: { id: string; name: string },
): Promise<{ id: string; name: string; email: string }> {
	// Simulate occasional network failures
	if (Math.random() < 0.1) {
		throw new Error("ETIMEDOUT");
	}
	return { ...user, email: `${user.name.toLowerCase().replace(/ /g, ".")}@example.com` };
}

async function validateUser(
	user: { id: string; name: string; email: string },
): Promise<{ id: string; name: string; email: string }> {
	if (!user.email.includes("@")) {
		throw new Error("Invalid email format");
	}
	return user;
}

async function updateCache<T>(data: T): Promise<T> {
	// Simulate occasional cache failures
	if (Math.random() < 0.05) {
		throw new Error("Cache unavailable");
	}
	return data;
}

// ==========================================
// Automatic Union Inference Example with errorClass
// ==========================================

/**
 * Fetches a user with typed error handling.
 *
 * NO explicit return type needed! TypeScript automatically infers:
 * Promise<Result<DatabaseError | NetworkError | ValidationError, User>>
 */
async function fetchUser(id: string) {
	await using s = scope({
		timeout: 5000,
		circuitBreaker: { failureThreshold: 3 },
	});

	// Database operation - errors wrapped in DatabaseError via errorClass option
	const [dbErr, user] = await s.task(() => queryDatabase(id), {
		errorClass: DatabaseError,
	});
	if (dbErr) return failure(dbErr);

	// Network operation - errors wrapped in NetworkError via errorClass option
	const [netErr, enriched] = await s.task(() => enrichUserData(user!), {
		errorClass: NetworkError,
	});
	if (netErr) return failure(netErr);

	// Validation - errors wrapped in ValidationError via errorClass option
	const [valErr, validated] = await s.task(() => validateUser(enriched!), {
		errorClass: ValidationError,
	});
	if (valErr) return failure(valErr);

	return success(validated);
}

/**
 * Fetches and caches a user.
 *
 * TypeScript infers:
 * Promise<Result<DatabaseError | NetworkError | ValidationError | CacheError, User>>
 */
async function fetchAndCacheUser(id: string) {
	// Reuse fetchUser - errors are automatically unioned
	const [fetchErr, user] = await fetchUser(id);
	if (fetchErr) return failure(fetchErr);

	await using s = scope();

	// Cache operation - errors wrapped in CacheError via errorClass option
	const [cacheErr, cached] = await s.task(() => updateCache(user), {
		errorClass: CacheError,
	});
	if (cacheErr) return failure(cacheErr);

	return success(cached!);
}

// ==========================================
// Exhaustive Pattern Matching
// ==========================================

function handleError(err: AppError): string {
	switch (err._tag) {
		case "DatabaseError":
			return `Database error: ${err.message}`;
		case "NetworkError":
			return `Network error: ${err.message}`;
		case "ValidationError":
			return `Validation error: ${err.message}`;
		case "CacheError":
			return `Cache error: ${err.message}`;
		default:
			// Compile-time safety: TypeScript ensures all cases are handled
			const _exhaustive: never = err;
			return `Unknown error: ${_exhaustive}`;
	}
}

// ==========================================
// Alternative: Using goTryRaw with raw operations (no scope.task)
// ==========================================

import { goTryRaw } from "go-go-try";

/**
 * Alternative approach: Use goTryRaw directly with raw operations.
 * This gives you automatic union inference but loses some scope features
 * like automatic cancellation signal propagation.
 */
// @ts-expect-error function defined for demonstration
async function _fetchUserRaw(id: string) {
	await using _s = scope({ timeout: 5000 });

	// Use goTryRaw directly on raw operations
	const [dbErr, user] = await goTryRaw(
		() => queryDatabase(id),
		DatabaseError,
	);
	if (dbErr) return failure(dbErr);

	const [netErr, enriched] = await goTryRaw(
		() => enrichUserData(user!), // Raw operation
		NetworkError,
	);
	if (netErr) return failure(netErr);

	return success(enriched!);
}

// ==========================================
// Main
// ==========================================

async function main() {
	console.log("=== go-go-try + go-go-scope Integration Example ===\n");

	// Fetch a user with automatic error union inference
	const [err, user] = await fetchAndCacheUser("123");

	if (err) {
		console.error("Failed to fetch user:");
		console.error(handleError(err));
	} else {
		console.log("Successfully fetched user:");
		console.log(user);
	}

	// Demonstrate multiple operations with typed errors
	console.log("\n=== Fetching multiple users ===");

	await using _s = scope({ concurrency: 3 });

	const ids = ["1", "2", "3", "4", "5"];
	const results = await Promise.all(ids.map((id) => fetchUser(id)));
	let i = 0
	for (const result of results) {
		const [err, user] = result
		if (err !== undefined) {
			console.log(`User ${ids[i]}: ${handleError(err)}`);
		} else {
			console.log(`User ${ids[i]}: ${user.name} (${user.email})`);
		}
		i++
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { fetchUser, fetchAndCacheUser, handleError };
