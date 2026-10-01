# Monitoring

## Readiness

`GET /api/health` is public. The health service in this PR checks PostgreSQL
with `SELECT 1`, but route integration is blocked by Q-0012. The current route
still returns `db: unknown`; it must not be used as a database readiness monitor.
The following response contract applies after route integration:

- Healthy: HTTP 200, `{ "ok": true, "db": "ok", "version": "..." }`.
- Database unavailable or `DATABASE_URL` missing: HTTP 503,
  `{ "ok": false, "db": "error", "version": "..." }`.
- `version` is `NEXT_PUBLIC_APP_VERSION`, or `dev` when unset.

The response contains no database URL, credentials or exception details.

## Uptime monitor (after T-0017 deploy)

1. In the team's free uptime monitoring service, create an HTTPS GET monitor
   for `<APP_BASE_URL>/api/health` at a five-minute interval.
2. Require HTTP 200; where supported, also require JSON `ok = true` and `db = ok`.
3. Configure the team's email or LINE notification destination using the
   monitor's supported integration. Confirm delivery with a test notification.
4. Repeat for staging and production, labelling each environment separately.
5. Verify a controlled database outage produces HTTP 503 and an alert, then
   restore the database and confirm recovery. Do this in staging first.

Accounts, deployed URLs and notification destinations are supplied during H-02
and deployment; no monitor has been provisioned by this task.

## Request logs

The health service emits JSON records; other routes are not instrumented by
this partial task. JSON records contain only `requestId`, `orgId`, `key`, `ms`, and `status`.
Failures with status 500 or higher go to stderr; other records go to stdout.
Never attach request bodies, query strings, headers, cookies, tokens, database
connection strings, raw exceptions or customer data to these records.

When health returns 503, check database reachability, server-side environment
configuration and deployment state. Use the request ID to correlate logs.

## Optional external error reporting

External reporting is not enabled. T-0018 names `SENTRY_DSN`, while 01 §6 names
`ERROR_REPORT_DSN`, and no SDK dependency is approved in the card. Q-0012 records
this conflict. Resolve it before configuring an external reporter.

## Service validation

The new tests are inside the allowed health directory. The default server test
configuration only discovers `test/**/*.test.ts`, so run these explicitly:

```bash
pnpm --filter @app/server exec vitest run --config src/services/health/vitest.config.ts
```

This covers real PGlite success, a closed connection, a missing database URL,
version fallback and log-field allowlisting. Standard route tests continue to
cover the existing placeholder route until Q-0012 is resolved.
