import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'packages/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [
      'packages/cli/**',
      'examples/**',
      '**/bench/**',
      'packages/db/src/scripts/**',
      'apps/api/src/main.ts',
      'apps/api/src/worker.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['bench/*.k6.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  prettier,
);
