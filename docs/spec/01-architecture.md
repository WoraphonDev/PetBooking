# 01 — Architecture (hand-written · อ่านก่อนเริ่ม task ใด ๆ)

> ไฟล์นี้เขียนมือ (ไม่ได้ generate) — แก้ได้เฉพาะ PR label `spec-change` ที่มนุษย์อนุมัติ
> ไฟล์ 02–10 ใน `docs/spec/` **generate จาก `tools/spec-src/*.py`** ห้ามแก้มือ (CI `spec-drift` ตรวจ)

## §1 Stack (ล็อกแล้ว — ห้ามเพิ่ม/เปลี่ยนโดยไม่มี ADR)

| ชั้น | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Runtime | Node.js 22 LTS, pnpm 10 (workspaces) | `.nvmrc`, `packageManager` ใน root package.json |
| Web | Next.js 16 (App Router, Route Handlers) + React 19 | `output: "standalone"` |
| UI | Tailwind CSS v4 + shadcn/ui (copy ลง `apps/web/src/components/ui`) | ฟอนต์ Noto Sans Thai · dependency ที่ shadcn ต้องใช้ (radix-ui, class-variance-authority, clsx/tailwind-merge, lucide-react, sonner, next-themes, react-day-picker, tw-animate-css) อนุญาต · ฟอร์มใช้ shadcn `field` + zod (ไม่ใช้ react-hook-form) |
| i18n | next-intl (locale เดียว `th`) | ข้อความทั้งหมดใน `apps/web/src/i18n/messages/th/*.json` |
| Data fetching | TanStack Query v5 | ผ่าน `apps/web/src/lib/api.ts` เท่านั้น |
| Validation | zod v4 | schema เดียวใช้ทั้ง client/server (`@app/contracts`) |
| DB | PostgreSQL 16+ (ต้องมี extension `btree_gist`) | ทดสอบด้วย PGlite (WASM Postgres) |
| ORM / migration | Drizzle ORM + drizzle-kit (`casing: "snake_case"`) | migration SQL commit ลง repo |
| Auth | session token ของเราเอง (cookie) + argon2id (`@node-rs/argon2`) | ไม่ใช้ NextAuth/บริการภายนอก |
| LINE | `@line/bot-sdk` (Messaging API), LIFF SDK `@line/liff` | ดู §7 |
| Push | `web-push` (VAPID) | ฟรี — แทน LINE Notify ที่ปิดบริการแล้ว |
| Email | `nodemailer` (SMTP ตาม ADR-003) | |
| Storage | S3-compatible (`@aws-sdk/client-s3` + presigner) ตาม ADR-004 | bucket private เสมอ |
| Date/time | `date-fns` + `@date-fns/tz` — logic วันเวลา/การจัดรูปแบบทำใน `@app/domain` เท่านั้น | `apps/web` มี date-fns ได้เฉพาะเป็น dependency ของ shadcn `calendar` — โค้ดแอปห้าม import date-fns เอง |
| Test | Vitest, PGlite, Testing Library + msw (UI), Playwright (E2E) | |
| Lint/format | Biome | `pnpm lint` |

**ห้ามใช้บริการที่ต้องจ่ายเงินใน MVP** (ดู 07_MVP_Phase_Plan) — ไม่มี SMS, ไม่มี slip-verification API, ไม่มี payment gateway, ไม่มี Google Maps API (ใช้ลิงก์ `https://maps.google.com/?q=lat,lng` แทน)

## §2 Repo layout + mechanical naming

```
apps/web/                         Next.js (route groups ด้านล่าง) — handler บาง ไม่มี business logic
  app/(auth) (public) (console) (staff) (liff) (admin)/…/page.tsx   ← route จาก 06 เท่านั้น
  app/api/v1/**/route.ts           ← path จาก 05 เท่านั้น
  app/api/webhooks/line/[messagingChannelId]/route.ts, app/api/cron/tick/route.ts, app/api/health/route.ts
  src/components/<screen-id-lower>/**   ← component ของหน้าจอนั้น (เช่น c-02d/)
  src/components/shared/<name>/**       ← UI-C-* (ฟอร์ม, ตาราง, อัปโหลด, ลายเซ็น, slot, QR, กราฟ)
  src/i18n/messages/th/<SCREEN-ID>.json ← ข้อความไทยต่อหน้าจอ
packages/contracts/   zod: src/common.ts, src/enums.ts, src/errors.ts, src/dto/<kebab>.ts, src/endpoints/<key>.ts
packages/domain/      pure functions (R-xx) + state tables — ไม่มี I/O, ไม่มี Date.now()
packages/server/      services, repo (tenantDb), auth, http wrappers, notify, jobs, integrations
packages/db/          Drizzle schema (src/schema/*.ts), migrations/, test db helpers
tools/spec-src/       Python ต้นฉบับของ spec + ตัว generate docs/tasks (มนุษย์ดูแล)
scripts/              CI guard scripts (read-only สำหรับ agent)
docs/spec/ docs/tasks/ docs/decisions/ docs/questions.md
```

ทิศทาง dependency: `web → server → (db, domain, contracts)` · `contracts → (ไม่มี)` · `domain → date-fns เท่านั้น` · ห้าม import วน

**ชื่อไฟล์/ฟังก์ชันได้จาก endpoint key แบบกลไก** (`<group>.<action>` เช่น `bookings.create`):

| สิ่งที่ต้องสร้าง | รูปแบบ | ตัวอย่าง `groom.checkIn` |
|---|---|---|
| Route handler | `apps/web/app` + path (แทน `{x}` ด้วย `[x]`) + `/route.ts` | `apps/web/app/api/v1/staff/groom-appointments/[appointmentId]/check-in/route.ts` |
| Contract | `packages/contracts/src/endpoints/<key>.ts` exports `<Pascal(group)><Pascal(action)>Request` / `…Query` / `…Response` | `GroomCheckInRequest`, `GroomCheckInResponse` |
| Service | `packages/server/src/services/<group>/<action>.ts` export `async function <camel(group)><Pascal(action)>(ctx, input)` | `services/groom/checkIn.ts` → `groomCheckIn` |
| Service test | `packages/server/test/services/<group>/<action>.test.ts` | `test/services/groom/checkIn.test.ts` |
| DTO | `packages/contracts/src/dto/<kebab(Name)>.ts` export `const <Name> = z.object(…)` + `type <Name>` | `dto/appointment-card.ts` |
| Page | `apps/web/app/(<app>)<route>/page.tsx` (ตัด query string) | C-02 → `app/(console)/console/calendar/page.tsx` |

Route handler มีบรรทัดเดียวต่อ method: `export const POST = withStaff("groom.checkIn", { body: GroomCheckInRequest, params }, groomCheckIn);`

## §3 Data rules (ซ้ำกับ 02 §0 — ถ้าขัดกัน 02 ชนะ)

- เงิน = integer สตางค์ (`*_satang` / `*Satang`) ทุกที่ รวมถึง JSON และ form state; แปลงบาท↔สตางค์ที่ input component เท่านั้น
- เวลา = `timestamptz` UTC; ส่งเป็น ISO string; แปลงเป็นเวลาไทยด้วย `branch.timezone` ตอนแสดงผลเท่านั้น (R-20, R-31)
- วันท้องถิ่น `YYYY-MM-DD` เป็น string ตลอดทาง (Drizzle `mode: "string"`) — ห้าม `new Date("2026-10-05")`
- เวลาปัจจุบัน: server ใช้ `ctx.now` (ตั้งครั้งเดียวต่อ request/job), domain รับ `now` เป็น input — **ห้ามเรียก `Date.now()` / `new Date()` นอก `context.ts`**
- Tenant: ทุก query ผ่าน `tenantDb(ctx, tx)`; ตารางลูกที่ไม่มี `organization_id` เข้าถึงผ่าน join จากแม่ที่ตรวจ org แล้ว; ข้อมูล org อื่น → `NOT_FOUND` (ไม่ใช่ FORBIDDEN)
- ทุก state change = conditional UPDATE (03) + `booking_event` (ถ้าเป็นใบจอง/child) + `audit_log` (ถ้าอยู่ใน R-27) **ใน transaction เดียว**
- ข้อความแจ้งเตือน = แถว `notification` ใน transaction เดียวกับเหตุการณ์ (outbox) แล้วส่งหลัง commit
- Constraint ชน → แปลง error ผ่าน `mapPgError` (23P01 → SLOT_TAKEN / ROOM_TAKEN / PET_ALREADY_BOOKED) — อย่าเช็ค "ว่างไหม" ด้วย SELECT แล้วเชื่อผล

## §4 Request flow, RequestContext, auth

```
Request → route.ts → with{Staff|Customer|Admin|Public}(key, schemas, serviceFn)
   1 อ่าน cookie (sid/cid/aid) → lookupSession → ctx      (ไม่มี/หมดอายุ → UNAUTHENTICATED)
   2 org.status = suspended → FORBIDDEN (ยกเว้น admin)
   3 requireRole(ctx, key) จาก permissions.json            (→ FORBIDDEN)
   4 support mode + method ≠ GET → SUPPORT_READ_ONLY
   5 CSRF: method ≠ GET ต้องมี Origin = APP_BASE_URL         (ไม่ตรง/ไม่มี → FORBIDDEN 403)
   6 rate limit (05 §0) → RATE_LIMITED
   7 zod parse params/query/body                              (→ VALIDATION_FAILED + details.fields)
   8 serviceFn(ctx, input) — เปิด transaction เอง (withTx)
   9 JSON response (200; 204 เมื่อ response ของ endpoint = 204 — ไม่มี 201) / error JSON {error:{code,message,details}}
```

```ts
type RequestContext = {
  now: Date;                       // เวลาเดียวทั้ง request
  requestId: string;
  actor: { type: "staff" | "customer" | "admin" | "system"; id: string | null; role?: "owner" | "front_desk" | "staff" };
  orgId: string | null;            // null เฉพาะ admin/public/system ข้าม org
  branchId: string | null;
  timezone: string;                // จาก branch.timezone (default Asia/Bangkok)
  supportAccessLogId: string | null;
  ip: string | null; userAgent: string | null;
};
```

- Cookie: `sid` staff (30 วัน sliding), `cid` customer (30 วัน), `aid` platform admin (12 ชม.) — HttpOnly, Secure, SameSite=Lax; token 32 bytes เก็บเป็น sha256 ใน `session.token_hash`
- Customer: LIFF ส่ง ID token → `liff.session` verify กับ LINE (client_id = `line_channel.login_channel_id`) → หา `line_identity` → ออก `cid` ผูก branchSlug
- Role staff เห็นข้อมูลลูกค้าแบบตัดข้อมูลติดต่อ (serializer ฝั่ง server — ไม่ใช่ซ่อนแค่ UI)
- **Support mode** (`admin.supportStart`): สร้างแถว `session` ใหม่ `subject_type = platform_admin`, `subject_id = platform_admin.id`, `organization_id` = ร้านที่ช่วย, `branch_id` = สาขาแรกของร้าน, `support_access_log_id` มีค่า, หมดอายุ 60 นาที, ออก cookie **`sid`** → `withStaff` รับ session นี้ได้: `ctx.actor = {type: "admin", id: adminId, role: "owner"}` (อ่านได้ทุกหน้าเท่า owner), `ctx.supportAccessLogId` มีค่า และขั้นที่ 4 ปฏิเสธทุก method ที่ไม่ใช่ GET ด้วย `SUPPORT_READ_ONLY` ก่อนตรวจ role · `admin.supportEnd` หรือหมดเวลา → ลบ session นี้ · audit/event ที่เกิดใน support mode ใช้ `actor_type = platform_admin`

## §5 Testing strategy (สิ่งที่ "เสร็จ" แปลว่าอะไร)

| ชั้น | วิธี | ที่อยู่ |
|---|---|---|
| domain | vectors JSON (generate จาก reference impl Python) — harness โหลดทุกไฟล์อัตโนมัติ; export ที่ยังไม่มี = `todo` | `packages/domain/test/vectors.test.ts` (มีมาใน starter) |
| state | เทียบ `ALLOWED_TRANSITIONS` กับ `vectors/state-machines.json` ทุกคู่ | `packages/domain/test/state.test.ts` |
| server | integration test บน PGlite ต่อ endpoint: happy path, **ทุก error code ใน 05**, role ที่ไม่ได้รับอนุญาต, org อื่น → NOT_FOUND, transition ผิด → INVALID_TRANSITION, audit/event/outbox ถูกเขียน | `packages/server/test/services/<group>/<action>.test.ts` |
| contracts | enum/error/permission ตรงกับ JSON ใน `docs/spec/vectors/` | `packages/contracts/test/*` |
| ui | component test (Testing Library + msw): ทุกป้ายฟิลด์ในตาราง 06 ปรากฏ, ปุ่มเรียก endpoint ถูกตัว, ซ่อน/แสดงตามสถานะ | `apps/web/test/screens/<id>.test.tsx` |
| e2e | Playwright ต่อ milestone (LINE_FAKE=1, dev seed) | `apps/web/e2e/*.spec.ts` |

ห้าม mock database ใน server test — ใช้ PGlite จริงพร้อม migrations ทั้งหมด (รวม custom constraints)

## §6 Environments & secrets

| ตัวแปร | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | server, migrate | Postgres ที่มี btree_gist |
| `APP_BASE_URL` | server (CSRF, ลิงก์ในข้อความ) | เช่น `https://app.example.com` |
| `APP_ENCRYPTION_KEY` | server (`crypto.ts`) | 32 bytes base64 — `openssl rand -base64 32` — เข้ารหัส LINE secret/token |
| `CRON_SECRET` | `/api/cron/tick` | header `x-cron-secret` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push | `npx web-push generate-vapid-keys` |
| `SMTP_URL`, `MAIL_FROM` | email | ตาม ADR-003 |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | storage | ตาม ADR-004 |
| `PLATFORM_LINE_LOGIN_CHANNEL_ID` | server (`auth.staffLine`) | บังคับใน staging/production — channel ID ของ LINE Login ของแพลตฟอร์ม (พนักงานเข้าสู่ระบบด้วย LINE, Q-1039) |
| `LINE_FAKE` | dev/E2E เท่านั้น | `1` = ไม่เรียก LINE จริง — server ต้อง **ปฏิเสธการ start** ถ้า `NODE_ENV=production` และ `LINE_FAKE=1` |
| `ERROR_REPORT_DSN` (ไม่บังคับ) | monitoring | ตาม ADR-002 (ถ้าใช้ free tier) |
| `NEXT_PUBLIC_APP_VERSION` (ไม่บังคับ) | web (build time) | git sha ของ commit ที่ build — CI/hosting ตั้งให้; ใช้เป็น `feedback_report.app_version` (C-46, Q-0114); ไม่มี = แสดง '—' |

- secret ใส่โดยมนุษย์ใน hosting/GitHub Actions เท่านั้น — **ห้ามวาง secret ในแชทกับ agent, ห้าม commit `.env*`** (มีแค่ `.env.example`)
- LINE channel secret / access token ของร้านเก็บใน DB แบบเข้ารหัส (`*_enc`) ใส่ผ่านหน้า AD-03 — ไม่อยู่ใน env
- 3 environment: `dev` (local + PGlite/Docker Postgres, LINE_FAKE=1) · `staging` (OA ทดสอบ) · `production`

## §7 LINE integration (สรุป — รายละเอียดใน ADR-001 และ R-18/R-19)

- 1 สาขา = 1 LINE OA ของร้าน (Messaging API channel) + 1 LINE Login channel (LIFF) **ภายใต้ provider เดียวกัน** (ไม่งั้น userId ไม่ตรงกัน) — ค่าทั้งหมดอยู่ใน `line_channel`
- userId ของ LINE ต่างกันตาม provider → เก็บใน `line_identity(provider_id, line_user_id)` ห้ามถือว่า userId ใช้ข้ามร้านได้จนกว่า ADR-001 จะตัดสิน
- Webhook: `POST /api/webhooks/line/{messagingChannelId}` (endpoint `webhook.line`) ตรวจ `x-line-signature` (HMAC-SHA256 ด้วย channel secret) ก่อนทำอะไรทั้งสิ้น; ตอบ 200 เร็ว ประมวลผลหลังตอบได้
- ส่งข้อความ: reply (ฟรี ไม่นับโควตา) เมื่อมี reply token ที่ยังไม่หมดอายุ; ไม่งั้น push (นับโควตา R-18); ไม่มีทางส่ง → `skipped` + แสดงใน C-22
- 401 จาก LINE → `line_channel.status = error` + แจ้งเจ้าของทาง Web Push
- LINE Notify ปิดบริการแล้ว — ห้ามใช้

## §8 Jobs & cron

- ไม่มี worker แยก: cron ภายนอก (ฟรี) เรียก `POST /api/cron/tick` ทุก 1–5 นาที → seed งานประจำ (dedupe key) → claim `scheduled_job` ด้วย `FOR UPDATE SKIP LOCKED` → ส่ง notification ที่ค้าง
- handler ต้อง idempotent (รันซ้ำได้ไม่เกิดผลซ้ำ) — ตรวจสถานะปัจจุบันก่อนทำทุกครั้ง

## §9 Files

- อัปโหลด: client ขอ `*.uploadUrl` → PUT ตรงไป storage (presigned 5 นาที) → ส่ง `fileId` ใน request ถัดไป → server `commitFile` (ตรวจ org/kind/มีจริง) — ไฟล์ไม่ commit ใน 24 ชม. ถูกลบโดย job
- ย่อรูปฝั่ง client ก่อนอัปโหลด (ด้านยาว 1600px, ลบ EXIF) ตาม R-25; แสดงผลผ่าน signed GET URL (1 ชม.) เท่านั้น

## §10 Security checklist (ทุก PR ที่แตะ auth/เงิน/tenant ต้องมีคนตรวจ)

- ไม่ log: password, token, cookie, ID token, LINE secret/token, เลขบัญชีเต็ม, เบอร์โทรเต็ม (mask `08x-xxx-1234`)
- ไม่รับ `organizationId`/`branchId`/`role`/ราคา จาก client — คำนวณ/อ่านจาก DB ฝั่ง server เสมอ
- ยอดเงินในบิลคำนวณที่ server (R-15/R-16); client ส่งเฉพาะ intent + `expectedPaidSatang`
- Webhook ตรวจ signature, cron ตรวจ secret, ทุก POST ตรวจ Origin
- PDPA: ลบ/ปิดบังข้อมูลตามคำขอ `data_request` ผ่าน endpoint `admin.resolveDataRequest` เท่านั้น (ผลที่ต้องเกิดดู 05) — ห้าม hard delete นอกเส้นทางนี้

## §11 Guardrails สำหรับ AI agent (สรุปจาก AGENTS.md)

| Guard | ทำงานที่ | ตรวจอะไร |
|---|---|---|
| `scripts/check-task-scope.mjs` | CI ทุก PR จาก branch `t-xxxx-*` | ไฟล์ที่เปลี่ยน ⊆ `allowed_paths` ของการ์ด; ห้ามแตะ spec/AGENTS/CI/migration ที่ merge แล้ว |
| `scripts/check-spec-conformance.mjs` | `pnpm verify` + CI | route.ts / page.tsx / contracts ต้องมีใน 05/06 (เกิน = fail); method ตรง |
| `pnpm --filter @app/db check:doc` | `pnpm verify` + CI | Drizzle schema ⇄ 02 ทุกตาราง/คอลัมน์/ชนิด/nullable/default |
| `python3 tools/spec-src/check_drift.py` | CI | docs/spec + docs/tasks (ส่วนบนของการ์ด) ตรงกับที่ generate จาก tools/spec-src |
| vectors harness | `pnpm --filter @app/domain test` | rule ที่ implement แล้วต้องผ่านทุกเคส |
| `scripts/hooks/pre-push` (`git config core.hooksPath scripts/hooks`) | ทุก clone/worktree | ห้าม push ขึ้น `main` — ทำงานกับทั้ง Claude Code และ Codex แม้ใช้ GitHub Free |
| CODEOWNERS + branch protection | GitHub (private repo ต้องใช้ Pro/Team) | spec/CI/AGENTS/migration ต้องมีมนุษย์อนุมัติ; ถ้ายังใช้ Free มนุษย์ merge เองเฉพาะ PR ที่ CI เขียว |
