import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root serves every app in local development.
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  serverExternalPackages: ['postgres'],
  typedRoutes: false,
  poweredByHeader: false,
  devIndicators: false,
  // Linting runs once at the repo root (pnpm lint), not again inside next build.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
