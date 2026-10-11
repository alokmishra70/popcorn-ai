import 'server-only';

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/popcorn',
  /** Public demo mode: no key management, no writes. */
  readOnly: process.env.POPCORN_READ_ONLY === 'true',
  apiUrl:
    process.env.POPCORN_PUBLIC_API_URL ?? process.env.POPCORN_ENDPOINT ?? 'http://localhost:4100',
};
