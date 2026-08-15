import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
