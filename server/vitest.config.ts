import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    reporters: ['default'],
    passWithNoTests: true,
  },
  resolve: { alias: { '@shared': new URL('../shared', import.meta.url).pathname } },
});
