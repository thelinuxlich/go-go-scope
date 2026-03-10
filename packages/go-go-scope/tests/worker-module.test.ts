import { describe, expect, test } from "vitest";
import { scope, createSharedWorker } from "../src/index.js";
import { WorkerPool } from "../src/worker-pool.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Tests for worker module loading feature (v2.9.0)
 * 
 * This allows loading worker functions from actual files instead of
 * serializing inline functions via toString() + eval().
 */
describe("worker module loading", () => {
	const testDir = join(__dirname, "test-modules");

	test("executeModule loads and executes function from module", async () => {
		// Create test module
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "calc.js");
		
		writeFileSync(modulePath, `
export function add(data) {
  return data.a + data.b;
}

export function multiply(data) {
  return data.a * data.b;
}

export default function(data) {
  return data.x * 2;
}
`);

		try {
			await using pool = new WorkerPool({ size: 2 });

			// Test named export
			const result1 = await pool.executeModule<number>(
				modulePath,
				"add",
				{ a: 10, b: 5 }
			);
			expect(result1).toBe(15);

			// Test another named export
			const result2 = await pool.executeModule<number>(
				modulePath,
				"multiply",
				{ a: 6, b: 7 }
			);
			expect(result2).toBe(42);

			// Test default export
			const result3 = await pool.executeModule<number>(
				modulePath,
				"default",
				{ x: 21 }
			);
			expect(result3).toBe(42);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("module functions can use closures and imports", async () => {
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "utils.js");

		writeFileSync(modulePath, `
// Test that module loading supports imports and module-level state
const MULTIPLIER = 100;

export function process(data) {
  // Use closure-like behavior with module-level constants
  return data.value * MULTIPLIER;
}

export async function asyncProcess(data) {
  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, 10));
  return data.items.reduce((sum, item) => sum + item, 0);
}
`);

		try {
			await using pool = new WorkerPool({ size: 1 });

			const result1 = await pool.executeModule<number>(
				modulePath,
				"process",
				{ value: 5 }
			);
			expect(result1).toBe(500);

			const result2 = await pool.executeModule<number>(
				modulePath,
				"asyncProcess",
				{ items: [1, 2, 3, 4, 5] }
			);
			expect(result2).toBe(15);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("module loading reports errors for missing exports", async () => {
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "minimal.js");

		writeFileSync(modulePath, `
export function exists(data) {
  return "ok";
}
`);

		try {
			await using pool = new WorkerPool({ size: 1 });

			await expect(
				pool.executeModule(modulePath, "nonExistent", {})
			).rejects.toThrow("not found");
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("module loading reports errors for module not found", async () => {
		await using pool = new WorkerPool({ size: 1 });

		await expect(
			pool.executeModule("/nonexistent/path.js", "fn", {})
		).rejects.toThrow();
	});

	test("executeModule with data option for zero-copy transfer", async () => {
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "buffer.js");

		writeFileSync(modulePath, `
export function sumBytes(data) {
  const view = new Uint8Array(data.buffer);
  let sum = 0;
  for (let i = 0; i < view.length; i++) {
    sum += view[i];
  }
  return sum;
}

export function doubleBuffer(data) {
  const view = new Uint8Array(data.buffer);
  for (let i = 0; i < view.length; i++) {
    view[i] *= 2;
  }
  return view.buffer;
}
`);

		try {
			await using pool = new WorkerPool({ size: 1 });

			// Create buffer with values [1, 2, 3, 4, 5]
			const buffer = new ArrayBuffer(5);
			const view = new Uint8Array(buffer);
			view.set([1, 2, 3, 4, 5]);

			const result = await pool.executeModule<number>(
				modulePath,
				"sumBytes",
				{ buffer },
				[buffer] // Transfer for zero-copy
			);
			expect(result).toBe(15);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("scope.task with module spec uses module loading", async () => {
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "math.js");

		writeFileSync(modulePath, `
export function heavyComputation(data) {
  // Simulate CPU-intensive work
  let sum = 0;
  for (let i = 1; i <= data.n; i++) {
    sum += i;
  }
  return sum;
}
`);

		try {
			await using s = scope({ workerPool: { size: 2 } });

			// Use module spec syntax with worker: true
			using task = s.task(
				{ module: modulePath, export: "heavyComputation" },
				{ worker: true, data: { n: 100 } }
			);

			const result = await task;
			expect(result).toEqual([undefined, 5050]); // Sum of 1..100
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("module functions can throw errors properly", async () => {
		mkdirSync(testDir, { recursive: true });
		const modulePath = join(testDir, "errors.js");

		writeFileSync(modulePath, `
export function willThrow(data) {
  throw new Error(data.message);
}

export function willReject(data) {
  return Promise.reject(new Error(data.reason));
}
`);

		try {
			await using pool = new WorkerPool({ size: 1 });

			await expect(
				pool.executeModule(modulePath, "willThrow", { message: "sync error" })
			).rejects.toThrow("sync error");

			await expect(
				pool.executeModule(modulePath, "willReject", { reason: "async error" })
			).rejects.toThrow("async error");
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe("module validation", () => {
		test("validation disabled allows lazy loading", async () => {
			await using pool = new WorkerPool({ size: 1 });

			// With validate: false, no error is thrown until execution
			// This allows passing specs around without immediate validation
			const promise = pool.executeModule(
				"/nonexistent/file.js",
				"fn",
				{},
				undefined,
				{ validate: false }
			);

			// Error happens when worker tries to execute
			await expect(promise).rejects.toThrow();
		});

		test("validation enabled by default", async () => {
			await using pool = new WorkerPool({ size: 1 });

			await expect(
				pool.executeModule("/nonexistent/file.js", "fn", {})
			).rejects.toThrow("not found");
		});

		test("shows available exports in error message", async () => {
			mkdirSync(testDir, { recursive: true });
			const modulePath = join(testDir, "api.js");

			writeFileSync(modulePath, `
export function processA(data) { return 'A'; }
export function processB(data) { return 'B'; }
export const notAFunction = 42;
`);

			try {
				await using pool = new WorkerPool({ size: 1 });

				await expect(
					pool.executeModule(modulePath, "processC", {})
				).rejects.toThrow("Available function exports: processA, processB");
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});
	});

	describe("shared worker modules", () => {
		test("createSharedWorker creates reusable module", async () => {
			mkdirSync(testDir, { recursive: true });
			const modulePath = join(testDir, "shared.js");

			writeFileSync(modulePath, `
export function compute(data) {
  return data.value * 2;
}

export function transform(data) {
  return data.text.toUpperCase();
}
`);

			try {
				// Create shared worker once
				const shared = await createSharedWorker(modulePath);

				// Use across multiple scopes
				await using s1 = scope({ workerPool: { size: 1 } });
				await using s2 = scope({ workerPool: { size: 1 } });

				const [err1, result1] = await s1.task(
					shared.export("compute"),
					{ worker: true, data: { value: 21 } }
				);
				expect(result1).toBe(42);

				const [err2, result2] = await s2.task(
					shared.export("transform"),
					{ worker: true, data: { text: "hello" } }
				);
				expect(result2).toBe("HELLO");
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});

		test("shared worker provides available exports", async () => {
			mkdirSync(testDir, { recursive: true });
			const modulePath = join(testDir, "exports.js");

			writeFileSync(modulePath, `
export function fn1() {}
export function fn2() {}
export const value = 42;
export default function defaultFn() {}
`);

			try {
				const shared = await createSharedWorker(modulePath);

				const exports = shared.getAvailableExports();
				expect(exports).toContain("fn1");
				expect(exports).toContain("fn2");
				expect(exports).toContain("default");
				expect(exports).not.toContain("value"); // Not a function
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});

		test("shared worker hasExport checks", async () => {
			mkdirSync(testDir, { recursive: true });
			const modulePath = join(testDir, "check.js");

			writeFileSync(modulePath, `
export function exists() {}
export const notAFunction = 42;
`);

			try {
				const shared = await createSharedWorker(modulePath);

				expect(shared.hasExport("exists")).toBe(true);
				expect(shared.hasExport("notAFunction")).toBe(false);
				expect(shared.hasExport("missing")).toBe(false);
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});

		test("shared worker export uses default by default", async () => {
			mkdirSync(testDir, { recursive: true });
			const modulePath = join(testDir, "default.js");

			writeFileSync(modulePath, `
export default function(data) {
  return data.n * 10;
}
`);

			try {
				const shared = await createSharedWorker(modulePath);

				await using s = scope({ workerPool: { size: 1 } });

				const [err, result] = await s.task(
					shared.export(), // No argument = default export
					{ worker: true, data: { n: 5 } }
				);
				expect(result).toBe(50);
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});
	});
});
