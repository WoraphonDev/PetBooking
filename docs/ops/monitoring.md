# Monitoring

## Readiness

`GET /api/health` is public and checks PostgreSQL with `SELECT 1` through the
health service. Its HTTP adapter creates one request context and returns:

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
this task. JSON records contain only `requestId`, `orgId`, `key`, `ms`, and `status`.
Error records (status 500 or higher) and other records all go to stdout.
Never attach request bodies, query strings, headers, cookies, tokens, database
connection strings, raw exceptions or customer data to these records.

When health returns 503, check database reachability, server-side environment
configuration and deployment state. Use the request ID to correlate logs.

## MVP error reporting

MVP error reporting consists of the sanitized error records in stdout. No SDK,
dependency or outbound reporter is used. `ERROR_REPORT_DSN` (01 §6) is reserved
for a future integration and is not consumed in MVP (Q-0012, resolved by PR #31).

## Service validation

Service and HTTP-adapter integration tests are discovered by the default server
test configuration in `packages/server/test/services/health/`:

```bash
pnpm --filter @app/server exec vitest run test/services/health/health.test.ts
pnpm --filter @app/web test -- api/health
```

This covers real PGlite success, a closed connection, a missing database URL,
version fallback, log-field allowlisting and HTTP 200/503 payloads. Web route
tests verify service delegation and the response contract. `pnpm verify` runs
both suites; no separate Vitest configuration is required.
