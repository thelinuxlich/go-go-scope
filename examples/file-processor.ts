/**
 * File Processor Example
 * Demonstrates batch processing with progress tracking
 */

import { scope } from "go-go-scope";
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface FileResult {
	filename: string;
	size: number;
	processed: boolean;
	lines?: number;
	error?: string;
}

/**
 * Process files with progress tracking and error handling
 */
async function processFiles(
	files: string[],
	options: {
		concurrency?: number;
		onProgress?: (completed: number, total: number, result: FileResult) => void;
		processor?: (content: string) => Promise<unknown>;
	} = {},
): Promise<FileResult[]> {
	const { concurrency = 3, onProgress, processor } = options;

	await using s = scope({ concurrency });

	const results = await s.parallel(
		files.map((file) => async () => {
			try {
				const content = await fs.readFile(file, "utf-8");
				const stats = await fs.stat(file);

				// Process the file
				if (processor) {
					await processor(content);
				}

				const result: FileResult = {
					filename: path.basename(file),
					size: stats.size,
					processed: true,
					lines: content.split("\n").length,
				};

				onProgress?.(0, files.length, result);
				return result;
			} catch (error) {
				const result: FileResult = {
					filename: path.basename(file),
					size: 0,
					processed: false,
					error: error instanceof Error ? error.message : String(error),
				};

				onProgress?.(0, files.length, result);
				throw result;
			}
		}),
		{
			continueOnError: true,
			onProgress: (completed, total) => {
				console.log(`Progress: ${completed}/${total} files`);
			},
		},
	);

	// Convert results to FileResult array
	return results.map(([err, value]) => {
		if (err) {
			return err as FileResult;
		}
		return value as FileResult;
	});
}

/**
 * Transform files with channel-based pipeline
 */
async function transformFiles(
	inputDir: string,
	outputDir: string,
	transform: (content: string) => string,
) {
	await using s = scope({ concurrency: 4 });

	// Create channels for the pipeline
	const filesToProcess = s.channel<string>(10);
	const processedFiles = s.channel<FileResult>(10);

	// Producer: Find files
	s.task(async () => {
		try {
			const entries = await fs.readdir(inputDir, { withFileTypes: true });
			const files = entries.filter((e) => e.isFile()).map((e) => e.name);

			for (const file of files) {
				await filesToProcess.send(path.join(inputDir, file));
			}
		} finally {
			filesToProcess.close();
		}
	});

	// Consumers: Process files
	const workers = Array(4)
		.fill(null)
		.map(() =>
			s.task(async () => {
				for await (const filepath of filesToProcess) {
					if (!filepath) continue;

					try {
						const content = await fs.readFile(filepath, "utf-8");
						const transformed = transform(content);
						const filename = path.basename(filepath);
						const outputPath = path.join(outputDir, filename);

						await fs.writeFile(outputPath, transformed);

						const stats = await fs.stat(filepath);
						await processedFiles.send({
							filename,
							size: stats.size,
							processed: true,
							lines: transformed.split("\n").length,
						});
					} catch (error) {
						await processedFiles.send({
							filename: path.basename(filepath),
							size: 0,
							processed: false,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
			}),
		);

	// Collector: Aggregate results
	const collector = s.task(async () => {
		const results: FileResult[] = [];

		for await (const result of processedFiles) {
			if (result) {
				results.push(result);
				console.log(`Processed: ${result.filename} (${result.lines} lines)`);
			}
		}

		return results;
	});

	// Wait for all workers to finish
	await Promise.all(workers);
	processedFiles.close();

	return await collector;
}

/**
 * Demo with mock file operations
 */
async function demoFileProcessor() {
	console.log("=== File Processor Demo ===\n");

	await using s = scope({ concurrency: 3 });

	// Simulate file processing
	const mockFiles = Array(10)
		.fill(null)
		.map((_, i) => `file-${i + 1}.txt`);

	let processed = 0;
	let failed = 0;

	const results = await s.parallel(
		mockFiles.map((filename) => async () => {
			// Simulate work
			await new Promise((r) => setTimeout(r, Math.random() * 500 + 100));

			// Randomly fail some files
			if (Math.random() < 0.2) {
				throw new Error(`Permission denied: ${filename}`);
			}

			const result: FileResult = {
				filename,
				size: Math.floor(Math.random() * 10000),
				processed: true,
				lines: Math.floor(Math.random() * 100) + 10,
			};

			return result;
		}),
		{
			continueOnError: true,
			onProgress: (completed, total, result) => {
				const [err, value] = result as [Error | undefined, FileResult | undefined];
				if (err) {
					failed++;
					console.log(`❌ Failed: ${(err as FileResult).filename}`);
				} else if (value) {
					processed++;
					console.log(
						`✓ Processed: ${value.filename} (${value.lines} lines)`,
					);
				}
			},
		},
	);

	console.log(`\n=== Summary ===`);
	console.log(`Total: ${mockFiles.length}`);
	console.log(`Successful: ${processed}`);
	console.log(`Failed: ${failed}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	demoFileProcessor().catch(console.error);
}

export { processFiles, transformFiles, type FileResult };
