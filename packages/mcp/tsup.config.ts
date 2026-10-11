import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/tools.ts'],
  format: ['esm'],
  dts: { entry: 'src/tools.ts' },
  clean: true,
  sourcemap: true,
  target: 'node20',
});
