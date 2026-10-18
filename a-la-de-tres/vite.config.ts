import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  test: { include: ['tests/**/*.test.ts'] },
});
