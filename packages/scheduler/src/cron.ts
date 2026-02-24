/**
 * Simple cron expression parser with timezone support
 * Supports: * (any), * / n (step), n (value), n-m (range), n,m (list)
 */

import type { CronExpression } from "./types.js";

/**
 * Get current date in a specific timezone
 * Returns a Date object that represents the time in that timezone
 */
function getDateInTimezone(date: Date, timezone?: string): Date {
	if (!timezone) return new Date(date);

	// Use Intl.DateTimeFormat to convert to target timezone
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	const parts = formatter.formatToParts(date);
	const parsed: Record<string, string> = {};

	for (const part of parts) {
		if (part.type !== "literal") {
			parsed[part.type] = part.value;
		}
	}

	// Create a date that represents the same local time components
	// but in the system's local timezone for calculation purposes
	const localDate = new Date(
		Number.parseInt(parsed.year!),
		Number.parseInt(parsed.month!) - 1,
		Number.parseInt(parsed.day!),
		Number.parseInt(parsed.hour!),
		Number.parseInt(parsed.minute!),
		Number.parseInt(parsed.second!),
	);

	return localDate;
}

/**
 * Convert a local date back to the target timezone's UTC equivalent
 */
function convertToTargetTimezone(localDate: Date, timezone: string): Date {
	// Get the timezone offset
	const utcDate = new Date(
		localDate.toLocaleString("en-US", { timeZone: "UTC" }),
	);
	const tzDate = new Date(
		localDate.toLocaleString("en-US", { timeZone: timezone }),
	);
	const offset = utcDate.getTime() - tzDate.getTime();

	return new Date(localDate.getTime() + offset);
}

/**
 * Parse a cron expression and return the next occurrence
 * @param expression - Cron expression (5 fields: minute hour day month dayOfWeek)
 * @param timezone - Optional IANA timezone (e.g., "America/New_York")
 * @returns CronExpression object for getting next occurrence
 */
export function parseCron(
	expression: string,
	timezone?: string,
): CronExpression {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(
			`Invalid cron expression: "${expression}". Expected 5 fields: minute hour day month dayOfWeek`,
		);
	}

	const [minuteExpr, hourExpr, dayExpr, monthExpr, dayOfWeekExpr] = parts;

	return {
		timezone,
		next(from: Date = new Date()): Date | null {
			// Convert "from" to the target timezone for calculation
			const baseDate = timezone
				? getDateInTimezone(from, timezone)
				: new Date(from);
			const date = new Date(baseDate);
			date.setMilliseconds(0);
			date.setSeconds(0);
			date.setMinutes(date.getMinutes() + 1); // Start from next minute

			// Limit search to prevent infinite loops
			const maxIterations = 366 * 24 * 60; // ~1 year in minutes
			let iterations = 0;

			while (iterations < maxIterations) {
				iterations++;

				const minute = date.getMinutes();
				const hour = date.getHours();
				const day = date.getDate();
				const month = date.getMonth() + 1; // 1-12
				const dayOfWeek = date.getDay(); // 0-6 (0 = Sunday)

				// Check if current time matches cron expression
				if (
					minuteExpr &&
					matchesField(minuteExpr, minute, 0, 59) &&
					hourExpr &&
					matchesField(hourExpr, hour, 0, 23) &&
					dayExpr &&
					matchesField(dayExpr, day, 1, 31) &&
					monthExpr &&
					matchesField(monthExpr, month, 1, 12) &&
					dayOfWeekExpr &&
					matchesDayOfWeek(dayOfWeekExpr, dayOfWeek)
				) {
					// Return the result converted back to the target timezone
					if (timezone) {
						return convertToTargetTimezone(date, timezone);
					}
					return new Date(date);
				}

				// Increment by one minute
				date.setMinutes(date.getMinutes() + 1);
			}

			return null; // No occurrence found within limit
		},
	};
}

/**
 * Check if a value matches a cron field expression
 */
function matchesField(
	expr: string,
	value: number,
	min: number,
	max: number,
): boolean {
	// Handle list: "1,2,5"
	if (expr.includes(",")) {
		const parts = expr.split(",");
		return parts.some((part) => matchesField(part.trim(), value, min, max));
	}

	// Handle range: "1-5"
	if (expr.includes("-")) {
		const [startStr, endStr] = expr.split("-");
		const start = Number(startStr);
		const end = Number(endStr);
		return value >= start && value <= end;
	}

	// Handle step: "*/5" or "1-10/2"
	if (expr.includes("/")) {
		const [base, stepStr] = expr.split("/");
		const step = Number(stepStr);

		let start = min;
		let end = max;

		if (base && base !== "*") {
			if (base.includes("-")) {
				const [sStr, eStr] = base.split("-");
				start = Number(sStr);
				end = Number(eStr);
			} else {
				start = Number(base);
			}
		}

		if (value < start || value > end) return false;
		return (value - start) % step === 0;
	}

	// Handle wildcard
	if (expr === "*") {
		return true;
	}

	// Handle specific value
	return Number(expr) === value;
}

/**
 * Check if day of week matches
 * Supports both 0-6 (Sun-Sat) and names
 */
function matchesDayOfWeek(expr: string, value: number): boolean {
	// Convert day names to numbers
	const dayNames: Record<string, number> = {
		sun: 0,
		sunday: 0,
		mon: 1,
		monday: 1,
		tue: 2,
		tuesday: 2,
		wed: 3,
		wednesday: 3,
		thu: 4,
		thursday: 4,
		fri: 5,
		friday: 5,
		sat: 6,
		saturday: 6,
	};

	// Handle list
	if (expr.includes(",")) {
		const parts = expr.split(",");
		return parts.some((part) => matchesDayOfWeek(part.trim(), value));
	}

	// Handle range with names
	if (expr.includes("-")) {
		const parts = expr.split("-").map((p) => {
			const lower = p.trim().toLowerCase();
			return dayNames[lower] ?? Number(lower);
		});
		const start = parts[0];
		const end = parts[1];

		if (start === undefined || end === undefined) return false;

		if (start <= end) {
			return value >= start && value <= end;
		} else {
			// Wrap around (e.g., fri-mon)
			return value >= start || value <= end;
		}
	}

	// Handle step
	if (expr.includes("/")) {
		return matchesField(expr, value, 0, 6);
	}

	// Handle wildcard
	if (expr === "*") {
		return true;
	}

	// Handle name or number
	const lower = expr.toLowerCase();
	const expected = dayNames[lower] ?? Number(expr);
	return expected === value;
}

/**
 * Common cron presets
 */
export const CronPresets = {
	/** Every minute */
	EVERY_MINUTE: "* * * * *",
	/** Every 5 minutes */
	EVERY_5_MINUTES: "*/5 * * * *",
	/** Every 15 minutes */
	EVERY_15_MINUTES: "*/15 * * * *",
	/** Every hour */
	EVERY_HOUR: "0 * * * *",
	/** Every 6 hours */
	EVERY_6_HOURS: "0 */6 * * *",
	/** Daily at midnight */
	DAILY: "0 0 * * *",
	/** Daily at 6 AM */
	DAILY_6AM: "0 6 * * *",
	/** Weekly on Sunday at midnight */
	WEEKLY: "0 0 * * 0",
	/** Monthly on the 1st at midnight */
	MONTHLY: "0 0 1 * *",
	/** Monday to Friday at 9 AM */
	WEEKDAYS_9AM: "0 9 * * 1-5",
} as const;

/**
 * Human-readable description of a cron expression
 */
export function describeCron(expression: string): string {
	const presets = Object.entries(CronPresets).find(([, v]) => v === expression);
	if (presets) {
		return presets[0].toLowerCase().replace(/_/g, " ");
	}
	return `cron: ${expression}`;
}
