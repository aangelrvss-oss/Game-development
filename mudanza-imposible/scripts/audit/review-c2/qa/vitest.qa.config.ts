// Revisión QA del ciclo 2: la misma configuración de Vitest del proyecto, con la caché de Vite fuera de node_modules
// (node_modules es un enlace al worktree principal, que no se debe tocar). Uso desde la raíz del árbol medido:
//   npx vitest run --config scripts/audit/review-c2/qa/vitest.qa.config.ts --root .
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  cacheDir: '/tmp/claude-0/review-c2/qa/vite-cache',
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
