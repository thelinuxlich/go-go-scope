// Minimal type declarations for Next.js adapter
// Full Next.js types are available when the package is used in a Next.js project

declare module "next/server" {
	export interface NextRequest extends Request {
		cookies: {
			get(name: string): { name: string; value: string } | undefined;
			getAll(): { name: string; value: string }[];
			has(name: string): boolean;
		};
		nextUrl: {
			pathname: string;
			search: string;
		};
		ip?: string;
		geo?: {
			city?: string;
			country?: string;
			region?: string;
		};
	}
}

// JSX namespace for server components
declare global {
	namespace JSX {
		interface Element {}
		interface IntrinsicElements {
			[elemName: string]: unknown;
		}
	}
}

export {};
