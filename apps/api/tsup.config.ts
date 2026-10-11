import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/worker.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node20',
});
