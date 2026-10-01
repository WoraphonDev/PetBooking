# AGENTS.md — PJ-8 Pet Grooming · Hotel · Daycare platform (MVP)

Thai SaaS for pet grooming shops / pet hotels: shop console + staff PWA + customer booking inside the shop's LINE OA (LIFF).
All product decisions are already written in `docs/spec/` (Thai prose, English identifiers). Your job is to implement **exactly** that spec, one task card at a time.

## Golden rules (never break)

1. **One task = one branch = one PR.** Branch `t-<id>-<slug>` (e.g. `t-0123-bookings-create`). Change only files matching the card's `allowed_paths`. CI (`scripts/check-task-scope.mjs`) fails otherwise.
2. **The spec is the contract and is read-only for you:** `docs/spec/**`, `docs/spec/vectors/**`, merged migrations in `packages/db/migrations/`, every `AGENTS.md`/`CLAUDE.md`, `.claude/**`, `.github/**`, `scripts/**`. If the spec looks wrong, incomplete or contradictory: add an entry to `docs/questions.md`, stop that part of the work, and say so in the PR.
3. **Never invent** a table, column, enum value, endpoint, request/response field, error code, screen, route, permission or business rule. Everything you need is in 02–08. If it is not there, it is a question, not a guess.
4. **Tests define done.** Run every command in the card's *Done when* section plus `pnpm verify`. All green, no `.skip`/`.only`/`todo` added by you, no weakened assertions, no edited vectors.
5. **Data rules:** money = integer satang (`*_satang`, `*Satang`), never floats · instants = UTC `timestamptz` / ISO strings · local dates = `YYYY-MM-DD` strings (Drizzle `mode: "string"`) · current time only from `ctx.now` (server) or the `now` input (domain) · tenant queries only through `tenantDb(ctx)`.
6. **No new dependencies** unless the card lists them under *Dependencies*. No paid services, no SaaS SDKs not listed in `docs/spec/01-architecture.md`.
7. **Never:** run `drizzle-kit push`, edit a merged migration, commit `.env*`, log secrets/tokens/ID tokens, disable TLS checks, force-push, use `--no-verify`, bypass a failing check, push to `main`, merge a PR, or change git hooks (`core.hooksPath`) — humans merge after CI is green.
8. **Small PRs:** aim for < 400 changed lines (excluding generated migrations/snapshots). If the card turns out bigger, stop and propose a split in `docs/questions.md`.

## Commands

```bash
pnpm install                                   # Node 22, pnpm 10
pnpm verify                                    # lint + typecheck + check:doc + all tests (run before every PR)
pnpm --filter @app/db generate                 # after schema change → new SQL migration (commit it)
pnpm --filter @app/db generate:custom <name>   # empty custom SQL migration (constraints Drizzle can't express)
pnpm --filter @app/db check:doc                # schema ⇄ docs/spec/02-data-model.md
pnpm --filter @app/domain vectors:status R-04  # which rule exports exist / are still todo
node scripts/check-spec-conformance.mjs        # route.ts / page.tsx ⇄ 05 / 06 catalogs (extras fail)
TASK_ID=T-0123 node scripts/check-task-scope.mjs   # changed files ⇄ card allowed_paths
```

## Workflow for every task

1. Read the whole card `docs/tasks/T-xxxx.md`. Confirm every `depends_on` task is merged (`git log --oneline | grep T-xxxx`). If not → stop.
2. Read only the spec sections listed under *Read first* (anchors). Don't load whole spec files.
3. Write a short plan: files to create/change (must match `allowed_paths`), functions with signatures, tests to add. For size L cards put the plan in the PR description before coding.
4. Tests first: domain → vectors already exist; services → integration tests on PGlite (`createTestDb`, `seedBase`) covering: happy path, **each error code listed for the endpoint**, permission/role denial, and **other-organization access → NOT_FOUND**.
5. Implement using the mechanical naming in `docs/spec/01-architecture.md` §2 (route file, contract name, service file/function name are derived from the endpoint key).
6. Run *Done when* + `pnpm verify`. Fix until green.
7. Append to the card's *Status log*: date, what was done, any questions raised. Open the PR with `.github/pull_request_template.md` filled in.

## Where things go (details: `docs/spec/01-architecture.md`)

- `packages/domain` pure rules R-xx + state tables · `packages/contracts` zod schemas · `packages/server` services/repos/integrations/jobs · `packages/db` Drizzle schema + migrations · `apps/web` Next.js pages + thin route handlers.
- Dependency direction: web → server → (db, domain, contracts). Domain imports nothing internal.

## Definition of Done

- Behaviour matches the spec sections cited by the card, field by field (names, types, nullability, error codes, Thai labels).
- Card *Done when* commands pass; `pnpm verify` passes; `check-spec-conformance` reports no extras.
- Every state change writes `booking_event` (when applicable) and every money/permission-sensitive action writes `audit_log` (R-27) in the **same transaction**.
- UI: every field in the 06 screen spec is present with the specified source/format; Thai strings come from `apps/web/src/i18n/messages/th.json`.
- No TODO/FIXME left without a matching `docs/questions.md` entry.

## Stop and ask (write `docs/questions.md`, don't guess) when

the spec is silent/contradictory · a needed file is outside `allowed_paths` · a vector or existing test seems wrong · a dependency task is missing · the change needs a schema/migration not in the card · you would have to touch auth, money or tenant logic in a way the card doesn't describe.

## Language

Code, identifiers, commits, PR text: English. User-facing strings: Thai via i18n messages (copy labels from 06 and `docs/spec/enum-labels.th.json`).
