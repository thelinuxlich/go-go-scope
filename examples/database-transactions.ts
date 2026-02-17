/**
 * Database Transaction Example
 * Demonstrates resource management and transaction patterns
 */

import { scope } from "go-go-scope";

// Mock database types
interface DatabaseConnection {
	query(sql: string, params?: unknown[]): Promise<unknown[]>;
	beginTransaction(): Promise<void>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
	close(): Promise<void>;
}

interface User {
	id: number;
	email: string;
	name: string;
}

interface Order {
	id: number;
	userId: number;
	total: number;
	items: string[];
}

// Mock database implementation
class MockDatabase implements DatabaseConnection {
	private inTransaction = false;
	private data = new Map<string, unknown[]>();

	async query(sql: string, params?: unknown[]): Promise<unknown[]> {
		console.log(`  [DB] ${sql}`, params ? JSON.stringify(params) : "");

		// Simulate latency
		await new Promise((r) => setTimeout(r, 10));

		if (sql.includes("SELECT * FROM users")) {
			return [
				{ id: 1, email: "user1@example.com", name: "User 1" },
				{ id: 2, email: "user2@example.com", name: "User 2" },
			];
		}

		if (sql.includes("SELECT * FROM orders")) {
			return [{ id: 1, userId: 1, total: 100, items: ["item1", "item2"] }];
		}

		return [];
	}

	async beginTransaction(): Promise<void> {
		console.log("  [DB] BEGIN TRANSACTION");
		this.inTransaction = true;
	}

	async commit(): Promise<void> {
		console.log("  [DB] COMMIT");
		this.inTransaction = false;
	}

	async rollback(): Promise<void> {
		console.log("  [DB] ROLLBACK");
		this.inTransaction = false;
	}

	async close(): Promise<void> {
		console.log("  [DB] Connection closed");
	}
}

/**
 * Create a database service with connection pooling and transaction support
 */
function createDatabaseService() {
	return {
		async connect(): Promise<DatabaseConnection> {
			console.log("  [DB] Opening connection...");
			await new Promise((r) => setTimeout(r, 50));
			return new MockDatabase();
		},

		async withTransaction<T>(
			callback: (db: DatabaseConnection) => Promise<T>,
		): Promise<T> {
			await using s = scope();

			// Acquire connection
			const db = await s
				.provide("db", () => this.connect(), (db) => db.close())
				.acquire();

			// Begin transaction
			await db.beginTransaction();

			// Rollback on scope disposal if not committed
			let committed = false;
			s.onDispose(async () => {
				if (!committed) {
					console.log("  [DB] Auto-rollback on scope exit");
					await db.rollback();
				}
			});

			try {
				const result = await callback(db);
				await db.commit();
				committed = true;
				return result;
			} catch (error) {
				await db.rollback();
				throw error;
			}
		},
	};
}

/**
 * Repository pattern with structured concurrency
 */
function createUserRepository(db: DatabaseConnection) {
	return {
		async findById(id: number): Promise<User | null> {
			await using s = scope({ timeout: 5000 });

			const [err, users] = await s.task(
				() =>
					db
						.query("SELECT * FROM users WHERE id = ?", [id])
						.then((rows) => rows as User[]),
				{
					memo: { key: `user:${id}`, ttl: 30000 },
				},
			);

			if (err || !users || users.length === 0) {
				return null;
			}

			return users[0]!;
		},

		async findAll(): Promise<User[]> {
			await using s = scope({ timeout: 10000 });

			const [err, users] = await s.task(() =>
				db.query("SELECT * FROM users").then((rows) => rows as User[]),
			);

			if (err) throw err;
			return users || [];
		},

		async create(user: Omit<User, "id">): Promise<User> {
			await using s = scope({ timeout: 5000 });

			const [err, result] = await s.task(async () => {
				await db.query("INSERT INTO users (email, name) VALUES (?, ?)", [
					user.email,
					user.name,
				]);
				return { ...user, id: Math.floor(Math.random() * 1000) };
			});

			if (err) throw err;
			return result!;
		},
	};
}

/**
 * Complex operation: Transfer with transaction
 */
async function transferWithTransaction(
	fromUserId: number,
	toUserId: number,
	amount: number,
) {
	const dbService = createDatabaseService();

	return await dbService.withTransaction(async (db) => {
		await using s = scope();

		// Verify sender has sufficient balance
		const [[senderErr, senderBalance], [receiverErr, receiverBalance]] = await s.parallel([
			async () => {
				const rows = await db.query("SELECT balance FROM accounts WHERE user_id = ?", [
					fromUserId,
				]);
				return (rows[0] as { balance: number })?.balance ?? 0;
			},
			async () => {
				const rows = await db.query("SELECT balance FROM accounts WHERE user_id = ?", [
					toUserId,
				]);
				return (rows[0] as { balance: number })?.balance ?? 0;
			},
		]);

		if (senderErr) throw senderErr;
		if (receiverErr) throw receiverErr;

		if ((senderBalance || 0) < amount) {
			throw new Error("Insufficient balance");
		}

		// Perform transfer
		await s.task(() =>
			db.query("UPDATE accounts SET balance = balance - ? WHERE user_id = ?", [
				amount,
				fromUserId,
			]),
		);

		await s.task(() =>
			db.query("UPDATE accounts SET balance = balance + ? WHERE user_id = ?", [
				amount,
				toUserId,
			]),
		);

		// Log transaction
		await s.task(() =>
			db.query(
				"INSERT INTO transactions (from_user, to_user, amount) VALUES (?, ?, ?)",
				[fromUserId, toUserId, amount],
			),
		);

		return { success: true, fromBalance: (senderBalance || 0) - amount };
	});
}

/**
 * Demo: Database operations
 */
async function demoDatabaseOperations() {
	console.log("=== Database Transaction Demo ===\n");

	const dbService = createDatabaseService();

	// Example 1: Simple query with caching
	console.log("1. Querying users (first time - hits DB):");
	await using s1 = scope();
	const db1 = await s1.provide("db", () => dbService.connect(), (db) => db.close()).acquire();
	const userRepo1 = createUserRepository(db1);

	const user1 = await userRepo1.findById(1);
	console.log(`   Found: ${user1?.name}\n`);

	// Example 2: Same query with memoization
	console.log("2. Querying same user (cached - no DB hit):");
	const user2 = await userRepo1.findById(1);
	console.log(`   Found: ${user2?.name}\n`);

	// Example 3: Transaction with automatic rollback on error
	console.log("3. Transaction with error (auto-rollback):");
	try {
		await dbService.withTransaction(async (db) => {
			await db.query("INSERT INTO logs (message) VALUES (?)", ["Starting operation"]);
			throw new Error("Simulated error!");
		});
	} catch (e) {
		console.log(`   Caught error: ${(e as Error).message}`);
		console.log("   Transaction automatically rolled back\n");
	}

	// Example 4: Successful transaction
	console.log("4. Successful transaction:");
	const result = await dbService.withTransaction(async (db) => {
		await db.query("INSERT INTO logs (message) VALUES (?)", ["Operation completed"]);
		return { id: 123, status: "success" };
	});
	console.log(`   Result: ${JSON.stringify(result)}\n`);

	console.log("=== Demo Complete ===");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	demoDatabaseOperations().catch(console.error);
}

export {
	createDatabaseService,
	createUserRepository,
	transferWithTransaction,
	type DatabaseConnection,
	type User,
	type Order,
};
