import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    // 关掉内联动态 import，让 jsPDF 等库按需拆分独立 chunk，首屏只加载必要代码
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
