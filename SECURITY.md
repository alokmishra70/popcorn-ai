# Security

Please report vulnerabilities privately through GitHub's "Report a vulnerability" on this repository rather than in a public issue. You will get a reply within a week.

Things worth knowing when you deploy Popcorn:

- The dashboard has no user accounts. Run it on a private network, behind your SSO proxy, or with `POPCORN_DASHBOARD_USER` and `POPCORN_DASHBOARD_PASSWORD` set.
- Traces contain whatever your agent sends to models and tools. Use the SDK's `redact` option for personal data; values under auth-like keys are stripped by default.
- API keys are stored as SHA-256 hashes and shown once at creation. Revoked keys stop working within 10 seconds.
- Change the seeded key in `docker-compose.yml` (`POPCORN_API_KEY`) before exposing the API.
