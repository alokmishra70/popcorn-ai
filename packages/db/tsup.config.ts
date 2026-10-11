import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/migrate.ts',
    'bin/migrate': 'src/scripts/migrate.ts',
    'bin/seed': 'src/scripts/seed.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', migrate: 'src/migrate.ts' } },
  clean: true,
  sourcemap: true,
  target: 'node20',
});
