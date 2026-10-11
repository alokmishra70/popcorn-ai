import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every file truncates the same database; run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
