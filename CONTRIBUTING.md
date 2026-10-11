# Contributing

## Workflow

`main` is always deployable. Work on a short-lived branch and open a pull request, even for small changes; CI must pass before merge. Reference the requirement the change implements (`FR-2.3`) in the PR description.

Commit messages are imperative and describe the change, not the activity: "Flag runs that repeat a tool call with the same arguments", not "update flags".

## Layout and boundaries

- `packages/core` has no I/O. Anything that needs the network, the database or the filesystem belongs elsewhere.
- `packages/db` owns every SQL query. Apps call repository functions; they do not build queries.
- The SDK must never throw into user code from its own machinery and must never block on the network. Anything that can fail (export, redaction, listeners) is caught and logged.
- Public SDK functions have TSDoc with an example.

## Checks

```bash
pnpm lint && pnpm format:check
pnpm build && pnpm typecheck
TEST_DATABASE_URL=postgres://localhost/popcorn_test pnpm test
scripts/demo-data.sh && pnpm test:e2e
```

Database tests truncate their database: never point `TEST_DATABASE_URL` at data you want to keep.

## Schema changes

Edit `packages/db/src/schema.ts`, then generate a migration and commit it:

```bash
pnpm db:generate --name describe_the_change
```

Never edit a migration that has been released.

## Releases

Versions follow semver; until 1.0.0 the SDK API may change, and breaking changes are listed under **Breaking** in the changelog with a migration note. To release, update `CHANGELOG.md` and package versions, then push a `vX.Y.Z` tag. The release workflow publishes `@popcorn-ai/core`, `sdk`, `cli` and `mcp` to npm and creates the GitHub release.
