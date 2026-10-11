# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [semver](https://semver.org/).

## [Unreleased]

First public build, covering the v0.1 to v1.0 scope of the PRD.

### Record (v0.1)

- SDK: `init`, `trace`, `agent`, `tool`, context across `await` via AsyncLocalStorage (FR-1.1, FR-1.2, FR-1.4).
- Anthropic and OpenAI client wrappers, streaming included (FR-1.3).
- Batched export, 100 spans or 2 s, bounded buffer with drop-oldest, backoff on failure (FR-1.5).
- Ingest API with Zod validation and idempotent writes (FR-1.6); runs list and run detail (FR-1.7, FR-1.8).
- Cost from a JSON price table, cache tokens priced separately (FR-1.9).

### Inspect (v0.2)

- Scene by Scene waterfall with keyboard navigation (FR-2.1) and conversation view (FR-2.2).
- Filters and full-text search over span payloads (FR-2.3).
- Bloopers: error, loop, cost spike and max-steps flags (FR-2.4).
- Box Office overview (FR-2.5), live Watch over server-sent events (FR-2.6).
- OTLP/HTTP JSON ingest with GenAI semantic conventions (FR-2.7).

### Replay (v0.3)

- Tool outputs stored as fixtures keyed by normalized argument hash (FR-3.1).
- `popcorn.rewind` and `popcorn rewind` with `fromStep` and model/prompt overrides (FR-3.2).
- Fixture-miss handling: fail by default, or call live (FR-3.3).
- Step-aligned diff of original and replay (FR-3.4).
- Dashboard Rewind dialog that builds the CLI command (FR-3.5, partial: the dashboard does not execute agent code).
- Opt-in tool result cache with hit rate per tool (FR-3.6).

### Evaluate (v0.4)

- Datasets from runs or by hand (FR-4.1); ten deterministic check types (FR-4.2).
- LLM-as-judge with structured output, versioned judge prompt and a verdict cache (FR-4.3).
- `popcorn review` with concurrency, baseline comparison and regression exit code (FR-4.4, FR-4.5).
- GitHub Action that posts and updates a PR comment (FR-4.6).
- Judge calibration and agreement rate (FR-4.7); flaky case detection with `--repeat` (FR-4.8).

### Polish (v1.0)

- `docker compose up` for API, worker, dashboard, Postgres and Redis (FR-5.1).
- Read-only demo mode for a public dashboard (FR-5.2).
- Docs, served in the dashboard at `/docs` (FR-5.3).
- API keys per project, hashed at rest, created and revoked in the UI (FR-5.4).
- Redaction hook with email and phone redactors; auth-like keys always stripped (FR-5.5).
- Retention job (FR-5.6) and MCP server (FR-5.7).
