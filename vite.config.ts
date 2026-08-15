import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
