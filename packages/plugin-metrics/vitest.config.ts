import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
	},
	resolve: {
		alias: {
			"go-go-scope": path.resolve(__dirname, "../go-go-scope/dist/index.mjs"),
		},
	},
});
