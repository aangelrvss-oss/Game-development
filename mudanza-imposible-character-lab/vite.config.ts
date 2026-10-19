import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
