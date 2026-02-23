import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/performance.test.ts', // Requires 'effect' package
      '**/memory-leak.test.ts'  // Requires '@go-go-scope/scheduler' package
    ]
  },
})
