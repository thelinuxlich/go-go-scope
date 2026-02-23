/**
 * Histogram implementation for tracking value distributions
 */

import type { Histogram, HistogramSnapshot } from "../types.js";

/**
 * Internal histogram implementation for tracking value distributions.
 */
export class HistogramImpl implements Histogram {
	private values: number[] = [];
	private sum = 0;
	private min = Infinity;
	private max = -Infinity;

	constructor(private readonly name: string) {}

	record(value: number): void {
		this.values.push(value);
		this.sum += value;
		this.min = Math.min(this.min, value);
		this.max = Math.max(this.max, value);
	}

	snapshot(): HistogramSnapshot {
		const count = this.values.length;
		if (count === 0) {
			return {
				name: this.name,
				count: 0,
				sum: 0,
				min: 0,
				max: 0,
				avg: 0,
				p50: 0,
				p90: 0,
				p95: 0,
				p99: 0,
			};
		}

		const sorted = [...this.values].sort((a, b) => a - b);
		const avg = this.sum / count;

		return {
			name: this.name,
			count,
			sum: this.sum,
			min: this.min,
			max: this.max,
			avg,
			p50: this.percentile(sorted, 0.5),
			p90: this.percentile(sorted, 0.9),
			p95: this.percentile(sorted, 0.95),
			p99: this.percentile(sorted, 0.99),
		};
	}

	private percentile(sorted: number[], p: number): number {
		const index = Math.floor(sorted.length * p);
		return sorted[index] ?? sorted.at(-1) ?? 0;
	}
}
