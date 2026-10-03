# Questions (agent → มนุษย์)

> agent เขียนที่นี่เมื่อ spec เงียบ/ขัดกัน/ต้องแตะไฟล์นอก allowed_paths — **ห้ามเดา**
> รูปแบบ: เพิ่มหัวข้อใหม่ท้ายไฟล์ · มนุษย์ตอบใต้หัวข้อแล้วเปลี่ยนสถานะ · ถ้าคำตอบเปลี่ยน spec → PR `spec-change` แก้ `tools/spec-src` แล้ว regenerate

## Q-0000 · ตัวอย่าง
- สถานะ: open | answered | spec-changed
- Task: T-xxxx · ผู้ถาม: agent (claude/codex) · วันที่: YYYY-MM-DD
- คำถาม: …
- สิ่งที่พบใน spec: (อ้าง anchor เช่น `05-api.md#ep-bookings.create`)
- ทางเลือกที่เป็นไปได้: A … / B …
- คำตอบ: …

## Q-0001 · `/api/health` คืน `db: 'unknown'` ระหว่างรอ INF-MON
- สถานะ: spec-changed
- Task: T-0001 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: การ์ด T-0001 ข้อ 6 สั่งให้คืน `db: 'unknown'` แต่ spec กำหนด response เป็น `db: 'ok'` (literal) — ยืนยันว่าค่า `'unknown'` เป็นค่าชั่วคราวที่ยอมรับได้จนกว่า INF-MON จะเพิ่ม db check
- สิ่งที่พบใน spec: `05-api.md#ep-health` → `object {ok: true, db: 'ok', version: string}`; `version` อาจเป็น `undefined` (ไม่ถูกส่งใน JSON) ถ้าไม่ได้ตั้ง `NEXT_PUBLIC_APP_VERSION`
- ทางเลือกที่เป็นไปได้: A ใช้ `'unknown'` ตามการ์ด (ที่ทำไว้) / B คืน `'ok'` ตาม spec ตั้งแต่ตอนนี้
- คำตอบ: A (spec-change PR #4) — 05#ep-health = `{ok: boolean, db: 'ok'|'error'|'unknown', version: string}`; T-0001 คืน `db: 'unknown'`, `version = NEXT_PUBLIC_APP_VERSION ?? 'dev'`

## Q-0002 · shadcn `form` ไม่มีใน registry ปัจจุบัน + dependency ของ shadcn ไม่อยู่ในการ์ด
- สถานะ: spec-changed
- Task: T-0001 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: (1) `shadcn@4.21.1` style `radix-nova` คืน item `form` ว่าง (ไม่มีไฟล์ — ถูกแทนด้วย `field` + ต้องใช้ `react-hook-form`) จึงยังไม่ได้ติดตั้ง `form` — จะใช้ `field` แทน หรือเพิ่ม `react-hook-form` + `@hookform/resolvers`? (2) component ที่ติดตั้งต้องใช้ dependency ที่การ์ดไม่ได้ระบุ: `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`, `sonner`, `next-themes`, `react-day-picker`, `date-fns`, `tw-animate-css`, `shadcn` (CSS `shadcn/tailwind.css`) — ยืนยันว่ายอมรับได้ (01 §1 ระบุ `date-fns` ให้ใช้เฉพาะใน `@app/domain`, แต่ `calendar` ของ shadcn ต้องใช้)
- สิ่งที่พบใน spec: `01-architecture.md` §1 (UI = Tailwind v4 + shadcn/ui; Date/time = date-fns เฉพาะใน domain)
- ทางเลือกที่เป็นไปได้: A คง deps ตามที่ shadcn ต้องการ + ใช้ `field` แทน `form` / B เพิ่ม `react-hook-form` แล้วเขียน `form.tsx` แบบเดิม
- คำตอบ: A (spec-change PR #4) — ใช้ shadcn `field` แทน `form`, ไม่ใช้ react-hook-form; deps ของ shadcn ยอมรับได้ (01 §1); `date-fns` ใน apps/web เป็นได้แค่ dependency ของ `calendar` — โค้ดแอปห้าม import เอง ใช้ formatter จาก `@app/domain`

## Q-0003 · ตำแหน่งข้อความ i18n ไม่ตรงกันระหว่าง AGENTS.md กับ 01
- สถานะ: spec-changed
- Task: T-0001 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: root `AGENTS.md` ระบุ `apps/web/src/i18n/messages/th.json` แต่ `01-architecture.md` §1/§2 และ `apps/web/AGENTS.md` ระบุ `src/i18n/messages/th/<SCREEN-ID>.json` — ใช้แบบไหน (T-0001 ยังไม่ได้สร้างไฟล์ i18n)
- สิ่งที่พบใน spec: `01-architecture.md` §2
- ทางเลือกที่เป็นไปได้: A ไฟล์ต่อหน้าจอตาม 01 (01 เป็น spec) / B ไฟล์เดียว
- คำตอบ: A (spec-change PR #4) — ไฟล์ต่อหน้าจอ `src/i18n/messages/th/<SCREEN-ID>.json` ตาม 01 §2 (แก้ AGENTS.md แล้ว)

## Q-0004 · `check-task-scope` ห้ามแก้ `migrations/meta/_journal.json` ทำให้เพิ่ม migration ใหม่ไม่ได้เลย
- สถานะ: spec-changed
- Task: T-0003 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: การ์ด T-0003 ข้อ 3 สั่ง `pnpm --filter @app/db generate:custom seed_vaccine_types` — drizzle-kit สร้าง `0002_seed_vaccine_types.sql` + `meta/0002_snapshot.json` (ไฟล์ใหม่, ผ่าน) และ **ต่อท้าย entry ใน `meta/_journal.json`** (แก้ไฟล์เดิม) แต่ `scripts/check-task-scope.mjs:78` ถือว่าทุกไฟล์ใต้ `packages/db/migrations/` ที่ไม่ใช่สถานะ `A` = "merged migrations are immutable" → CI fail. ถ้าไม่แก้ journal ทั้ง drizzle migrator (`db:migrate`) และ `createTestDb()` (`src/test-db.ts` อ่านลำดับจาก journal) จะไม่เห็น migration ใหม่ — ทุก task ที่เพิ่ม migration จะติดปัญหาเดียวกัน
- สิ่งที่พบใน spec: `packages/db/AGENTS.md` (generate → commit SQL; ห้ามแก้ migration ที่ merge แล้ว), `scripts/check-task-scope.mjs:78`
- ทางเลือกที่เป็นไปได้: A ให้ script ยกเว้น `migrations/meta/_journal.json` เมื่อ diff เป็นการ append entry อย่างเดียว (entry เดิมไม่เปลี่ยน) / B ยกเว้น `_journal.json` ทั้งไฟล์ แล้วพึ่ง review ของมนุษย์
- คำตอบ: A (PR spec-change-q0004) — `check-task-scope` ยอมให้แก้ `_journal.json` ได้เฉพาะการต่อท้าย entry ใหม่; header และ entry เดิมต้องเหมือนเดิมทุกตัวอักษร (ไฟล์ migration อื่นยังห้ามแก้เหมือนเดิม)

## Q-0005 · R-24 ไม่มีรหัส error สำหรับรหัสผ่านยาวเกิน 128 ตัว
- สถานะ: answered (รอ spec-change แก้ 04)
- Task: T-0005 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: R-24 ข้อ 5 กำหนดรหัสผ่าน 8–128 ตัว แต่ 04 / vectors มีแค่ `PASSWORD_TOO_SHORT`, `PASSWORD_ALL_DIGITS`, `PASSWORD_SAME_AS_EMAIL` — รหัสที่ยาวเกิน 128 ตัวให้ `checkPasswordPolicy` คืน error อะไร
- สิ่งที่พบใน spec: `04-business-rules.md#R-24` (อัลกอริทึมข้อ 5 + ตาราง vectors), `docs/spec/vectors/R-24.checkPasswordPolicy.json` (4 cases ไม่มีกรณียาวเกิน)
- ทางเลือกที่เป็นไปได้: A `PASSWORD_TOO_LONG` / B ใช้ `PASSWORD_TOO_SHORT` ซ้ำ / C ยังไม่ตรวจ >128
- คำตอบ: A (มนุษย์ตอบใน session T-0005) — `PASSWORD_TOO_LONG`; T-0005 implement แล้วพร้อม unit test · ต้องมี PR `spec-change` เพิ่มลงใน 04#R-24 (และ vector ถ้าต้องการ)

## Q-0006 · CSRF (Origin ไม่ตรง APP_BASE_URL) ตอบ error code อะไร
- สถานะ: answered (spec-change PR `spec-change-q0006-0008`)
- Task: T-0007 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: 01 §4 ข้อ 5 กำหนดว่า method ≠ GET ต้องมี `Origin = APP_BASE_URL` แต่ไม่ระบุรหัส error เมื่อไม่ผ่าน และ 05 §1 ไม่มีรหัสเฉพาะ
- สิ่งที่พบใน spec: `01-architecture.md` §4, §10 · `05-api.md` §1
- ทางเลือกที่เป็นไปได้: A `FORBIDDEN` (403) — ที่ทำไว้ใน `packages/server/src/http/request.ts` / B เพิ่มรหัสใหม่ (เช่น `CSRF_FAILED`) ผ่าน spec-change
- คำตอบ: A — Origin ไม่ตรง/ไม่มี → `FORBIDDEN` (403) ไม่เพิ่มรหัสใหม่ (01 §4 ข้อ 5) · T-0007 ทำตามนี้แล้ว

## Q-0007 · support session ("staff-like") ยืนยันตัวตนผ่าน withStaff อย่างไร
- สถานะ: answered (spec-change PR `spec-change-q0006-0008`)
- Task: T-0007 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: `admin.supportStart` สร้าง "session staff-like ที่ support_access_log_id มีค่า (60 นาที)" แต่ไม่ระบุ `session.subject_type`/`subject_id` (platform_admin ไม่ใช่ staff_user) และ role ที่ใช้กับ `requireRole` (ต้องอ่านหน้า owner-only ได้หรือไม่) — T-0007 รองรับเฉพาะ session `subject_type = staff` ที่มี `support_access_log_id` (→ `ctx.supportAccessLogId` + non-GET → `SUPPORT_READ_ONLY`)
- สิ่งที่พบใน spec: `05-api.md#ep-admin.supportStart`, 05 §0 Support mode, `08-permissions.md` (platform admin ดูผ่าน support mode)
- ทางเลือกที่เป็นไปได้: A session `subject_type = platform_admin` + `organization_id` + `support_access_log_id` ผ่าน cookie `sid` → withStaff ให้ actor `{type:"admin"}` + ถือเป็นสิทธิ์ owner แบบอ่านอย่างเดียว / B อื่น ๆ ตามที่ตัดสิน
- คำตอบ: A (01 §4 หัวข้อ Support mode) — `admin.supportStart` สร้าง session `subject_type = platform_admin`, `subject_id` = admin id, `organization_id` = ร้าน, `branch_id` = สาขาแรก, `support_access_log_id` มีค่า, 60 นาที, cookie `sid` · withStaff รับ session นี้ → `ctx.actor = {type:"admin", id, role:"owner"}` + `ctx.supportAccessLogId`; non-GET → `SUPPORT_READ_ONLY` (ตรวจก่อน requireRole) · supportEnd/หมดเวลา → ลบ session; audit ใช้ actor_type = platform_admin · T-0007 รองรับทั้ง staff และ platform_admin(+support_access_log_id) ผ่าน `sid` แล้ว

## Q-0008 · ไม่มี endpoint ไหนระบุ HTTP 201
- สถานะ: answered (spec-change PR `spec-change-q0006-0008`)
- Task: T-0007 · ผู้ถาม: agent (claude) · วันที่: 2026-10-01
- คำถาม: การ์ด T-0007 ข้อ 1 ระบุ status 200/201/204 แต่ 05 ไม่มี endpoint ใดระบุ 201 — wrappers ตอบ 204 เมื่อ service คืน `undefined` (endpoint ที่ response = `204`) และ 200 อย่างอื่นทั้งหมด; ต้องการ 201 สำหรับ POST ที่สร้างข้อมูลหรือไม่ (ถ้าใช่ endpoint ไหน)
- สิ่งที่พบใน spec: `05-api.md` §0, §3 (`docs/spec/vectors/endpoints.json` response = DTO หรือ `"204"`)
- ทางเลือกที่เป็นไปได้: A 200/204 ตามที่ทำไว้ / B เพิ่ม 201 ใน catalog แล้วให้ wrapper รับ option `status`
- คำตอบ: A — 200 ทั้งหมด, 204 เมื่อ response ของ endpoint = `"204"` ไม่ใช้ 201 (แก้การ์ด T-0007 + 01 §4 แล้ว)

## Q-0009 · notification ถึง platform admin (admin.feedback / admin.data_request) — `recipient_type` ไม่มี platform_admin
- สถานะ: spec-changed
- Task: T-0010 · ผู้ถาม: agent (claude) · วันที่: 2026-10-02
- คำถาม: 07 §1 กำหนด `admin.feedback` และ `admin.data_request` ส่งอีเมลถึง platform admin แต่ `notification.recipient_type` มีแค่ `customer|staff` และ `recipient_id` = customer.id หรือ staff_user.id — จะเก็บแถวของ platform admin อย่างไร · T-0010 สร้าง key/payload type/stub template ครบ แต่ `enqueueNotification` โยน error สำหรับ 2 key นี้จนกว่าจะตัดสิน
- สิ่งที่พบใน spec: `07-notifications-jobs.md` §1 · `02-data-model.md#tbl-notification` · enum `recipient_type`
- ทางเลือกที่เป็นไปได้: A เพิ่มค่า `platform_admin` ใน enum `recipient_type` (migration) + `organization_id` ของร้านที่เกี่ยวข้อง / B ส่งอีเมลตรงไม่ผ่าน outbox / C อื่น ๆ
- บันทึกการตัดสินใจใน session T-0010 (มนุษย์ตอบแล้ว — ควรเขียนลง 07 ด้วย spec-change): (1) แถว notification 1 แถวต่อผู้รับ, `dedupe_key` ที่เก็บ = `<dedupe key ใน 07>:<recipientId>` (2) ช่องทางที่ R-19 เลือกต้องอยู่ในคอลัมน์ 'ช่องทาง' ของ template ไม่งั้น skipped `no_recipient`; template ที่เป็น email อย่างเดียว (staff.invite, staff.password_reset) ส่งอีเมลเสมอ (ไม่มีอีเมล → `no_recipient`)
- คำตอบ: PR #19 (`spec-change-q0009-0010`) merged. Follow `07-notifications-jobs.md` §1.1: platform_admin recipients, one row per recipient, per-recipient dedupe keys, allowed channels and email-only templates.

## Q-0010 · placeholder `{depositLine}` / `{reportCardLine}` ไม่อยู่ในคอลัมน์ 'ตัวแปร'
- สถานะ: spec-changed
- Task: T-0010 · ผู้ถาม: agent (claude) · วันที่: 2026-10-02
- คำถาม: ข้อความ `customer.booking_received` ใช้ `{depositLine}` (ตัวแปรที่ระบุ: depositAmount, holdExpiresTime) และ `customer.ready_for_pickup` ใช้ `{reportCardLine}` (ตัวแปร: reportCardUrl) — บรรทัดเหล่านี้ประกอบจากตัวแปรอย่างไร (เช่น ไม่มีมัดจำ → ไม่แสดงบรรทัด?) · T-0010 stub แสดงเป็นค่าว่าง, payload type ตามคอลัมน์ 'ตัวแปร' ตรงตัว
- สิ่งที่พบใน spec: `07-notifications-jobs.md` §1 แถว `customer.booking_received`, `customer.ready_for_pickup`
- ทางเลือกที่เป็นไปได้: A template ของ key นั้นประกอบบรรทัดเองจาก depositAmount/holdExpiresTime และ reportCardUrl (ระบุรูปแบบข้อความใน 07) / B เพิ่ม depositLine/reportCardLine เป็นตัวแปรที่ผู้เรียกจัดรูปแบบมาให้
- คำตอบ: PR #19 (`spec-change-q0009-0010`) merged. Follow `07-notifications-jobs.md` §1.2: templates compose depositLine/reportCardLine from the documented payload variables, with the documented omission and formatting rules.

## Q-0011 · T-0015 ต้องแก้ `pnpm-lock.yaml` แต่ไม่อยู่ใน allowed_paths ของการ์ด
- สถานะ: spec-changed
- Task: T-0015 · ผู้ถาม: agent (claude) · วันที่: 2026-10-02
- คำถาม: ขั้นที่ 3 ของการ์ด (และคำตอบ Q-0002) ให้ `apps/web/src/lib/format.ts` re-export formatter จาก `@app/domain` แต่ `apps/web` ยังไม่มี dependency `@app/domain` — การเพิ่ม `"@app/domain": "workspace:*"` ใน `apps/web/package.json` ทำให้ `pnpm-lock.yaml` เปลี่ยน (importers ของ apps/web +3 บรรทัด) ซึ่งไม่อยู่ใน allowed_paths → `check-task-scope` จะ fail
- สิ่งที่พบใน spec: `docs/tasks/T-0015.md` allowed_paths · `01-architecture.md` §2 (ทิศทาง dependency web → domain ผ่าน server แต่ Q-0002 ให้ web import formatter จาก domain ตรง)
- ทางเลือกที่เป็นไปได้: A เพิ่ม `pnpm-lock.yaml` ใน allowed_paths ของ T-0015 (และการ์ด UI ที่จะเพิ่ม dependency) / B import ด้วย relative path ข้าม package (ไม่แนะนำ)
- คำตอบ: มนุษย์เลือก A ในแชท session T-0015 (2026-10-02) — PR T-0015 commit การเปลี่ยน lockfile ไปแล้ว; การ์ดแก้แล้วใน spec-change PR #23 (INF-I18N allowed_paths += `pnpm-lock.yaml`)

## Q-0012 · T-0018 monitoring scope and error-reporting configuration
- Status: spec-changed (PR #31 merged)
- Task: T-0018 · Asked by: agent (codex) · Date: 2026-10-02
- Question: T-0018 needs `apps/web/package.json` and `pnpm-lock.yaml` to link `@app/server`, `packages/server/package.json` to export entry points, and `apps/web/test/api/health.test.ts` to replace the old synchronous `db: unknown` assertions. Integration tests need `packages/server/test/services/health/**`, which the server's existing Vitest config discovers. These paths are missing from allowed_paths.
- Evidence: T-0018 allowed_paths; apps/web health tests; server Vitest include `test/**/*.test.ts`; 05#ep-health requires HTTP 503 on database failure.
- Configuration conflict: the card names `SENTRY_DSN`, while 01 §6 names optional `ERROR_REPORT_DSN`; the card lists no approved reporting SDK dependency.
- Options: expand task scope through spec-change and use `ERROR_REPORT_DSN`, or leave the affected work blocked until that change is merged. Optional external reporting requires an approved implementation/dependency decision.
- Answer (2026-10-02, supersedes the original-scope decision): user reports PR `spec-change-q0012-0014` expands T-0018 allowed_paths. Complete the remaining work in a new T-0018 PR: connect `apps/web/app/api/health/route.ts` to the health service (database error -> HTTP 503, ok: false); update `apps/web/test/api/health.test.ts` to 05#ep-health; move service tests to `packages/server/test/services/health/**` and remove the separate Vitest config. Changes to `packages/server/package.json` are limited to adding the export entry required by the route.
- Error reporting decision: MVP emits log.ts level error to stdout only; no SDK or dependency, and no external reporting implementation. Use `ERROR_REPORT_DSN` (01 §6), not `SENTRY_DSN`.
- Verification: PR #31 merged on 2026-10-02; main includes the expanded T-0018 scope and MVP reporting decision. The separate T-0018 implementation follow-up can proceed.

## Q-0013 · T-0019 needs workspace package wiring outside its allowed paths
- Status: spec-changed
- Task: T-0019 · Asked by: agent (codex) · Date: 2026-10-02
- Question: The required route imports `@app/server/http` and the `auth.staffLogin` service, but `apps/web` does not depend on `@app/server` and `packages/server` has no export map. Implementing the card requires `apps/web/package.json`, `packages/server/package.json`, and the corresponding `pnpm-lock.yaml` importer update, which are absent from `allowed_paths`.
- Evidence: T-0019 deliverables; workspace package manifests; `packages/server` currently has no `exports` field.
- Answer: PR #28 merged. T-0019 allowed_paths now include the web/server package manifests and pnpm-lock.yaml for workspace dependency and package-export wiring.

## Q-0014 · T-0020 StaffMe nullable email and support identity
- Status: spec-changed (PR #31 merged)
- Task: T-0020 · Asked by: agent (codex) · Date: 2026-10-02
- Question: What should `auth.me` return for a LINE-only staff member with null email, and whose `staff` fields should it return for a platform-admin support session?
- Evidence: `02-data-model.md#tbl-staff_user` permits null email; `05-api.md#dto-StaffMe` maps email to that column, while the existing `packages/contracts/src/dto/staff-me.ts` requires a string email. Support sessions resolve to a platform-admin actor (Q-0007), but StaffMe maps every staff field to staff_user and gives no identity-selection rule.
- Scope: PR #31 added the shared StaffMe DTO and contract tests to T-0020 allowed_paths and specified support identity.
- Options: clarify the support-session DTO and allow nullable staff email through a spec-change that includes the shared DTO in scope.
- Answer (2026-10-02, supersedes the partial-draft decision): user reports PR `spec-change-q0012-0014` updates 05#dto-StaffMe and permits the shared DTO in T-0020. Set staff.email to string | null using `z.string().email().nullable()`. General rule (05 §2): columns nullable in 02 always produce DTO fields T | null.
- Support mode decision: staff.id/displayName/email come from platform_admin; role = owner, isGroomer = false, lineLinked = false, permissions are the owner's, supportMode = true. Organization/branch come from the session. Continue auth.me once the updated task scope is available.
- Verification: PR #31 merged on 2026-10-02. T-0020 follow-up implements auth.me with nullable email, platform-admin support identity, session-derived organization/branch, role permissions and tenant isolation tests. The earlier logout/resetRequest implementation is merged in PR #30.

## Q-0015 · T-0018 test relocation conflicts with the task-scope rename guard
- Status: spec-changed (PR #33 merged)
- Task: T-0018 · Asked by: agent (codex) · Date: 2026-10-02
- Question: The updated card explicitly requires moving the health service tests into the standard suite, but `scripts/check-task-scope.mjs:74` rejects all renames. Git recognizes the moved and updated test as a 62% similar rename from `packages/server/src/services/health/health.test.ts` to `packages/server/test/services/health/health.test.ts`; both paths are allowed by the card.
- Evidence: T-0018 step 3 and allowed_paths after merged spec-change #31; scope guard unconditionally reports "renames are not allowed in task PRs" when git diff includes a source path.
- Proposed resolution: a separate human-approved spec-change allowing only this exact source/destination rename for T-0018, preserving all other forbidden-path and scope checks. The task must not modify scripts or disguise the rename to evade the guard.
- Work: health route/service integration, HTTP 200/503 tests, stdout error logging, removal of the separate config and runbook updates are implemented. PR #33 merged and permits the exact relocation; T-0018 can pass task-scope validation and proceed to publication.
- Answer: user explicitly authorized a separate spec-change PR on 2026-10-02 to allow only this exact T-0018 health-test relocation. All other renames remain forbidden, and source/destination must still match the card scope. PR #33 merged on 2026-10-02. T-0018 implementation on t-0018-health-completion incorporates the merged guard change.

## Q-0016 · T-0022 admin login lockout storage and response contract
- Status: spec-changed (PR #37 merged)
- Task: T-0022 · Asked by: agent (codex) · Date: 2026-10-02
- Question: How should admin.login persist R-24 failed attempts and lock expiry, and which fields belong inside its `{ admin }` response?
- Evidence: 05#ep-admin.login requires INVALID_CREDENTIALS and ACCOUNT_LOCKED under R-24. R-24 uses staff_user.failed_login_count/locked_until; 02#tbl-platform_admin and the merged identity schema have neither column. The endpoint says only `object {admin}`, with no admin DTO or field list.
- Scope: T-0022 permits endpoint contracts/services/tests/routes, but no DB schema or migration. An in-memory lockout or an invented admin response would introduce unspecified auth behavior.
- Proposed decision (approved in the answer below): add platform_admin.failed_login_count (integer, not null, default 0) and locked_until (nullable timestamptz); apply the same R-24 attempt/reset/15-minute lockout rules to admins; define the response as `{ admin: { id, email, displayName } }` using platform_admin columns. Publish a prerequisite spec-change and explicitly authorize identity schema/new migration paths in a task before implementation. Alternatively, explicitly revise the endpoint's lockout requirement. Implementation follows the generated spec after the spec-change merges.
- Initial blocker: admin.login was paused under AGENTS.md golden rules 2–3 and the stop-and-ask rule. The approved schema/migration is now included in the prerequisite spec-change; endpoint implementation remains pending.
- Answer (2026-10-02): user approved the proposed decision in this chat. Add the two persistent platform_admin lockout columns and apply R-24 unchanged; login response is `{ admin: { id, email, displayName } }`. The approved spec-change includes the additive schema migration so check:doc remains consistent, and expands T-0022 schema/new-migration paths. Service implementation waits for the spec-change to merge.

## Q-0017 · T-0022 organization summary selection, empty relations and status audit
- Status: spec-changed (PR #37 merged)
- Task: T-0022 · Asked by: agent (codex) · Date: 2026-10-02
- Question: Which owner's email should OrgListItem return when a shop has multiple owners; what should lineStatus return before any line_channel exists; what is lastActivityAt when there are no bookings; and which audit action records admin.updateOrg?
- Evidence: 05#dto-OrgListItem specifies staff_user.email, line_channel.status and max booking.created_at without selection/empty-result rules. 05 §2 already makes ownerEmail nullable because staff_user.email is nullable; that rule does not select one of multiple owners or specify the absence of a non-null line_channel.status row. 02 allows multiple staff with owner role, and admin.createOrg does not create a line_channel. AGENTS.md requires audit for permission-sensitive actions, while R-27's action list has no organization status action and 05#ep-admin.updateOrg gives none.
- Proposed decision (approved in the answer below): select the owner with the earliest created_at (id ascending as tie-breaker); return lineStatus = null when no line_channel exists and lastActivityAt = null when there are no bookings; add audit action `organization.status_change` with before/after status in the same transaction. Publish these decisions through spec-change and authorize any required audit contract/schema changes or a prerequisite task. Implementation follows the generated spec after the spec-change merges.
- Initial blocker: admin.orgs and admin.updateOrg shared the unresolved DTO. The approved spec-change now defines the selection, nullability and audit action; endpoint implementation remains pending.
- Answer (2026-10-02): user approved the proposed decision in this chat. Select owner by created_at ASC, id ASC; ownerEmail remains nullable; lineStatus and lastActivityAt are nullable for absent data. Audit action is `organization.status_change` with before/after status in the same transaction. Generated dependencies require the existing T-0035 audit writer (and its T-0034 state-table prerequisite) before T-0022. The endpoint records an audit only when status changes.

## Q-0018 · T-0022 exceeds the small-PR task boundary
- Status: spec-changed (PR #41 merged)
- Task: T-0022 · Asked by: agent (codex) · Date: 2026-10-02
- Question: May the generated task be split into admin.login and a separate card for admin.orgs/admin.updateOrg before implementation?
- Evidence: PR #37 and prerequisites T-0005/T-0007/T-0035 are merged. Tests-first planning produced 290 formatted lines across the three PGlite integration test files, covering persisted lockout, safe login fields/cookie/session lifetime, organization DTO selection/nullability, authorization, suspension and transactional audit rollback. Contracts, services and routes would add approximately 150–200 lines, taking the combined implementation above the 400-line boundary in AGENTS.md golden rule 8.
- Proposed split: keep T-0022 for admin.login (contract, service, route and integration test), retaining its approved identity-schema scope; assign a new task ID to admin.orgs/admin.updateOrg and the shared OrgListItem DTO, with T-0035 as a dependency. Both task cards must retain their endpoint-specific acceptance checks and pnpm verify. No product behavior or specification changes are proposed.
- Work: implementation paused before adding production code. The tests-first drafts are preserved locally outside the PR; they intentionally fail because the contracts/services do not exist yet. This PR changes only this question and T-0022's Status log. Human approval is required before editing the task generator/card scope; no failing tests are included in the PR.
- Answer (2026-10-02): user approved this split in the current chat. Keep T-0022 for admin.login, retaining identity-schema/new-migration scope and human review; create a separate generated card for admin.orgs/admin.updateOrg and OrgListItem with T-0035 as a dependency. Update the task generator, stable ID registry, generated cards and indexes in a prerequisite spec-change PR; endpoint implementation follows after it merges.

## Q-0019 · T-0023 owner invite `staff_invite.created_by` when the inviter is a platform admin
- Status: answered
- Task: T-0023 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 02#tbl-staff_invite requires `created_by` (NOT NULL, FK staff_user.id), but admin.createOrg's owner invite is created by a platform admin, who has no staff_user row. What should `created_by` reference?
- Evidence: 05#ep-admin.createOrg requires an owner invite in the creation transaction; 02#tbl-staff_invite.created_by is NOT NULL → staff_user.id; platform_admin is a separate table.
- Options: (a) reference the new owner's own staff_user.id; (b) spec-change making created_by nullable via a new migration.
- Answer (2026-10-02): user approved option (a) in chat. The owner invite sets `created_by` = the new owner's staff_user.id. No schema change.

## Q-0020 · apps/web Vitest cannot transform .tsx (screen component tests)
- Status: spec-changed (pending merge of `spec-change-q0020-web-vitest-jsx`)
- Task: T-0028 (affects every ui card that requires `apps/web/test/screens/*.test.tsx`) · Asked by: agent (claude) · Date: 2026-10-02
- Question: Screen cards require component tests in `apps/web/test/screens/<id>.test.tsx`, but `apps/web` has no Vitest config and its tsconfig uses `jsx: "preserve"` (required by Next.js). Vite refuses to parse any .tsx test or imported component ("make sure to not set jsx to preserve"). The fix is outside every ui card's allowed_paths.
- Evidence: `pnpm --filter @app/web test -- screens/a-01` fails at import analysis; a `@jsxRuntime` pragma does not help. `apps/web/src/components/ui/*` also import via the `@/` alias, which Vitest does not resolve without config.
- Options: (a) prerequisite spec-change adding `apps/web/vitest.config.ts` (oxc JSX automatic runtime, `@/` → `src` alias, same default include plus .tsx) with no new dependency; (b) add the config inside each ui task PR (fails check-task-scope).
- Answer (2026-10-02): user approved option (a) in chat. Screen tests render with `react-dom/server` and mocks (no DOM library is in the dependency list).

## Q-0021 · No mounted `<Toaster />` for success/error toasts
- Status: spec-changed (pending merge of `spec-change-q0021-root-toaster`)
- Task: T-0030 (affects every screen with a toast, and the error toasts of `src/lib/query.ts`) · Asked by: agent (claude) · Date: 2026-10-02
- Question: 06#scr-A-03 requires "→ /login พร้อม toast 'ตั้งรหัสผ่านแล้ว'", and `src/lib/query.ts` (T-0016) reports failed queries/mutations with `toast.error`, but no layout renders sonner's `<Toaster />`, so no toast is ever visible. A toast that must survive navigation to another route also needs a Toaster above both routes. No task card owns the root or `(auth)` layout.
- Options: (a) spec-change mounting the existing shadcn `<Toaster />` once in `apps/web/app/layout.tsx`; (b) mount it per route-group layout in later shell tasks.
- Answer (2026-10-02): user approved option (a) in chat. Screens call `toast.success(...)` from `sonner` before navigating.

## Q-0022 · R-25 per-kind MIME/size table for all `file_kind` values
- Status: answered
- Task: T-0037 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 04#R-25 step 2 names categories only (slips/general photos 2 MB, vaccine documents 5 MB, stay_update video 20 MB ≤ 30 s, signature PNG 500 KB, CSV 2 MB), while `file_kind` has 14 values. Which MIME types and limits apply to consent_pdf, proof, feedback, logo, room_photo, service_photo, and to stay_update photos? Is 1 MB 10^6 or 2^20 bytes?
- Evidence: 02#tbl-file_object allows image/jpeg, image/png, image/webp, video/mp4, application/pdf, text/csv; R-25 vectors cover after/stay_update/slip/vaccine_proof only.
- Answer (2026-10-02): user approved the proposed table in chat. Images (jpeg/png/webp) ≤ 2 MB: pet_profile, before, after, slip, logo, room_photo, service_photo, feedback, proof · stay_update: images ≤ 2 MB or video/mp4 ≤ 20 MB · vaccine_proof: images or application/pdf ≤ 5 MB · signature: image/png ≤ 500 KB · import_csv: text/csv ≤ 2 MB · consent_pdf: application/pdf ≤ 5 MB · 1 MB = 1,000,000 bytes, 1 KB = 1,000 bytes · the 30-second video limit is not checkable from validateUpload's input and is enforced client-side. A human may later copy this table into 04#R-25 via spec-change.

## Q-0023 · Shop consent records when the owner accepts the invite
- Status: answered
- Task: T-0042 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-admin.createOrg says "consent_record ฝั่งร้าน (dpa, terms_of_service) ทำตอน owner รับคำเชิญ", but 05#ep-auth.inviteAccept lists no consent effect and 06#scr-A-04 has no document acceptance UI. Should auth.inviteAccept write those records?
- Evidence: 02#tbl-consent_record (subject_type organization, subject_id organization.id); legal document versions in 10 §5 / reference-data.json legalDocs.
- Answer (2026-10-02): user approved in chat. When the accepted invite's staff_user.role is owner, auth.inviteAccept inserts consent_record ×2 (dpa, terms_of_service) in the same transaction: subject_type organization, subject_id = organization_id = the shop, version from reference-data legalDocs, accepted true, ip/user_agent from the request. A-04 should later show the document links (separate spec-change for the screen).

## Q-0024 · T-0025 server guard scope and admin login boundary
- Status: spec-changed (PR #56 merged)
- Task: T-0025 · Asked by: agent (codex) · Date: 2026-10-02
- Question: How should the Admin shell validate its aid session while keeping /admin/login reachable without a session, and how should insufficient privilege produce the required 403 page?
- Evidence: T-0025 allows only the group layout, admin/layout.tsx, shell components and translations. Both allowed layouts also wrap /admin/login. Applying the required unauthenticated redirect there causes a login redirect loop; server layouts have no supported pathname argument to exempt only the login child. 06#scr-AD-01 marks this login screen admin even though 05#ep-admin.login is public. The existing resolveAdmin in packages/server/src/http/auth.ts validates hashed tokens, expiry and active platform-admin identity, but @app/server/http does not export it and the server export map exposes only HTTP wrappers/services. No 403 route is defined in 06; inventing one is forbidden.
- Proposed decision (approved by user): mark AD-01 public; keep the parent layout for providers only and place guard + shell in layouts for the five protected route roots (organizations covers AD-02/AD-03, feedback, data-requests, analytics, holidays). Expand T-0025 allowed_paths for these layouts and packages/server/src/http.ts to re-export the existing resolveAdmin. Apply its existing behavior unchanged: missing/expired/disabled/wrong-subject aid sessions are unauthenticated and redirect to /admin/login; active platform admins have no subordinate role hierarchy, so the generic insufficient-role/403 requirement is not applicable to this admin shell. No new 403 route or experimental authInterrupts setting. Add a shell-owned navigation registry to the allowed_paths of AD-* screen tasks so each screen enables its entry when implemented; AD-03 stays disabled without a concrete current orgId and uses that orgId only when available. Publish these task/screen clarifications via a prerequisite spec-change, retaining the existing screen paths and authentication behavior.
- Initial work: guard implementation was paused under AGENTS.md. The independent shell layout/providers and all seven translated AD-* menu labels are prepared; all screen entries are disabled because no admin page exists yet. No protected page, authentication shortcut, new endpoint or route was added. This draft is incomplete until the approved spec/scope change is merged.
- Technical references: [Next.js layout pathname limitations](https://nextjs.org/docs/app/api-reference/file-conventions/layout#pathname); [Next.js forbidden()](https://nextjs.org/docs/app/api-reference/functions/forbidden) requires experimental authInterrupts, which would require authorized next.config.ts scope if selected.
- Answer (2026-10-02): user approved the recommended decision in this chat. Publish the clarified public login/protected layout boundary, existing aid validation/redirect behavior, no subordinate admin-role/403 requirement, resolver re-export scope and screen-owned navigation activation in the prerequisite spec-change. Resume T-0025 after it merges.
- Implementation detail: use per-screen entries in shell-admin/navigation/<SCREEN-ID>.ts behind the shell-owned navigation registry. Each AD-* task edits only its own entry, preserving parallel-safety rather than granting every screen the same shared file. No auth or menu behavior differs from the approved decision.

- Implementation (2026-10-02): PR #56 merged; resumed T-0025 in #44 with provider-only public parent, five guarded roots, unchanged resolveAdmin re-export and per-screen navigation entries.

## Q-0025 · T-0031 activation conflicts with the Admin shell's unimplemented-menu tests
- Status: spec-changed (PR #73 merged)
- Task: T-0031 · Asked by: agent (codex) · Date: 2026-10-02
- Question: May a prerequisite spec-change add apps/web/src/components/shell-admin/admin-shell.test.tsx to T-0031's allowed_paths so the shell tests use explicit unimplemented-screen fixtures while T-0031 enables its AD-01 entry?
- Evidence: merged Q-0024 requires each screen to enable its navigation entry when implemented. The T-0025 shell tests currently consume production entries and assert seven disabled controls/no links and all entries disabled. Enabling AD-01 correctly therefore breaks those tests. T-0031 cannot edit that shell-owned test under its current allowed_paths.
- Proposed fix: add only the shell test file to T-0031 scope through the task generator/generated card; isolate all seven navigation entries as explicit unimplemented fixtures in the shell suite, retaining every existing assertion. T-0031's screen suite separately verifies the real AD-01 entry is enabled. No product/spec/authentication behavior or dependency changes. The approved fixture patch is applied in T-0031 after PR #73 merged.
- Work (2026-10-02): PR #73 merged; resumed the approved shell fixture repair and real AD-01 navigation activation in T-0031.

- Answer (2026-10-02): user approved the proposed prerequisite scope change and explicit unimplemented-screen fixtures, retaining all existing assertions. Apply the test repair and enable AD-01 in T-0031 after the prerequisite merges.

## Q-0026 · R-05 parseSlipQr: CRC mismatch — flag or reject?
- Status: spec-changed (pending merge of `spec-change-q0026-slip-crc`)
- Task: T-0150 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 04#R-05 declares `SlipQr = { bankCode; transRef; crcValid } | null` and step 3 says a CRC mismatch is still parsed with `crcValid = false`, but the reference implementation (`tools/spec-src/rules_impl.py` r05_parse_slip_qr) returns `null` on a CRC mismatch and never emits `crcValid`; vector 3 ("tampered CRC is flagged, still parsed") expects `null`. The vector runner uses `toStrictEqual`, so no implementation satisfies both.
- Evidence: 04#R-05 signature + step 3; docs/spec/vectors/R-05.parseSlipQr.json cases 1–3; rules_impl.py.
- Answer (2026-10-02): user approved following the 04 text in chat. The reference implementation now returns `{ bankCode, transRef, crcValid }` and parses a CRC mismatch with `crcValid = false` (bank CRC formats are only confirmed in SP-02; rejecting would lose duplicate detection for a whole bank). Regenerated R-05.parseSlipQr vectors and the 04 vector table; non-slip and garbage payloads still return `null`.

## Q-0027 · T-0050 search.quick requires a migration outside its allowed paths

Status: partially answered (endpoint implemented in T-0050; pg_trgm index still needs its own task)
- Task selection (2026-10-02): T-0050 dependencies T-0007 and T-0014 are merged, but implementation has not started.
- Evidence: `docs/spec/05-api.md#ep-search.quick` requires pg_trgm indexes in a US-03-10 migration. No pg_trgm extension or trigram index exists in the merged schema/migrations; T-0050 allows only its endpoint/service/tests/route and two DTO files, not schema or migration files.
- Question: assign a prerequisite task for the specified pg_trgm indexes, or approve a spec change expanding T-0050's dependencies and migration/schema scope. Clarify the indexed columns and migration handling for PGlite.
- Work: search implementation paused under AGENTS.md; selected independent T-0106 instead. No merged migration or read-only spec changed.
- Answer (2026-10-02): user chose in chat to implement the endpoint now with plain ILIKE / exact match / E.164 prefix (the index changes performance, not behaviour). The pg_trgm extension + GIN trigram indexes on owner_profile.first_name/last_name/nickname and pet.name remain open: they need a separate card with schema + custom migration scope (and a check that PGlite supports the extension).

## Q-0028 · closures.create / timeOff.create: `204` response vs "ตอบ affected[]"
- Status: spec-changed (pending merge of `spec-change-q0028-closure-affected`)
- Task: T-0046 (also T-0108) · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-closures.create and 05#ep-timeOff.create declared `Response: 204 (No Content)` while their effects said "ตอบ affected[]" and 06 shows "affected → dialog". A 204 cannot carry a body. Which is the contract, what is the item shape and which rows count as affected?
- Evidence: 05#ep-closures.create, 05#ep-timeOff.create; 06 actions `closures.create` "affected → dialog", `timeOff.create` "affected"; T-0046 test list includes the affected[] effect.
- Answer (2026-10-02): user approved in chat. Both endpoints respond `200 { affected: AffectedServiceItem[] }` (empty array when nothing overlaps; nothing is cancelled or moved automatically). New DTO 05#dto-AffectedServiceItem: `module` (service_scope), `bookingId`, `bookingNo`, `itemId` (groom_appointment/stay/daycare_visit id), `petName`, `customerName`, `startsAt` (grooming instant, else null), `date` (branch-local date). Only unfinished items count: grooming scheduled/checked_in/in_progress overlapping `[starts_at, ends_at)` for scope all/grooming; stays reserved/checked_in with a night whose local day overlaps for scope all/hotel; daycare reserved/checked_in whose local visit day overlaps for scope all/daycare. timeOff.create returns only that groomer's unfinished grooming appointments. T-0046 owns the DTO file; T-0108 now depends on T-0046.

## Q-0029 · sizeTiers.set: when is `IN_USE`, and what does `SIZE_TIER_OVERLAP` return for row highlighting?
- Status: spec-changed (pending merge of `spec-change-q0029-q0030`; implemented in T-0058)
- Task: T-0058 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-sizeTiers.set lists `IN_USE`, whose 05 §1 source is "FK violation 23503 ตอนลบ", but every FK to size_tier is `on delete cascade` (service_price, room_rate, daycare_rate) or `set null` (package_template, groom_appointment), so the database never raises it. Which references block removing a tier? Also 06#scr-C-38 says "SIZE_TIER_OVERLAP ไฮไลต์แถว" but no `details` shape is defined.
- Evidence: 05#ep-sizeTiers.set; 05 §1 `IN_USE`; 02 FKs to size_tier; 06#scr-C-38 action table.
- Answer (2026-10-02): user approved in chat. Removing (omitting) a tier referenced by any groom_appointment (any status, to keep history) or package_template → `IN_USE`; prices/rates of a removed tier cascade as designed. `SIZE_TIER_OVERLAP` carries `details: { rows: number[] }` = indexes into the submitted `tiers[]`: the lowest-min row when it does not start at 0, a row whose min ≠ the previous row's max (gap/overlap, or previous row open-ended), and the last row when it has a ceiling. An empty `tiers[]` is allowed (clears the species).

## Q-0030 · CommissionReport: which entries fall in from..to, and how is "earned − reversed" applied?
- Status: spec-changed (pending merge of `spec-change-q0029-q0030`; implemented in T-0223; T-0240 uses the same DTO)
- Task: T-0223 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#dto-CommissionReport defines `jobs` = count earned, `baseSatang` = Σ base, `amountSatang` = Σ amount "(earned − reversed)", but not which timestamp places an entry in from..to (earned_at vs reversed_at) nor how a reversal of an entry earned in an earlier period is reported.
- Evidence: 05#dto-CommissionReport, 05#ep-staffMe.commissions, 02#tbl-commission_entry (earned_at, reversed_at, status), R-13 step 6.
- Answer (2026-10-02): user approved the accounting interpretation in chat. from..to are branch-local days. An entry whose earned_at is in range adds +1 job, +base, +amount; an entry with status reversed whose reversed_at is in range adds −1 job, −base, −amount (so earned and reversed in the same range nets to 0, and a later void shows as a deduction in the period of the void). `entries[]` lists every entry that contributed. No entries → `rows: []`.

## Q-0031 · OccupancyReport: shape of `byRoomType[]`, percent rounding and range
- Status: answered (implemented in T-0306; spec text update pending a spec-change PR)
- Task: T-0306 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#dto-OccupancyReport lists `byRoomType[]` as `calc` with no item fields, and does not say how `percent` is rounded, which stays count, or how long from..to may be. 06#scr-C-25 only shows it as a table.
- Evidence: 05#dto-OccupancyReport, 05#ep-reports.occupancy, 06#scr-C-25.
- Answer (2026-10-02): user approved the proposal in chat. `byRoomType[]` = `{ roomTypeId, roomTypeName (room_type.name_th), occupiedNights, totalNights, percent }` for room types of the branch with an active unit or an occupied night, ordered by sort_order, name. A night d is occupied by a checked_in/checked_out stay with check_in_date ≤ d < check_out_date; `occupiedUnits` counts distinct room units. `totalUnits` = active room units of the session branch; `totalNights` = active units of the type × number of days. `percent` = whole number round(occupied × 100 / total), 0 when total = 0. from..to is inclusive, at most 93 days (same cap as staffMe.commissions).

## Q-0032 · T-0051 customers: photoUrl without storage, duplicate-phone warning code, staff-hidden keys
- Status: answered (implemented in T-0051; photoUrl follow-up open until T-0038 merges)
- Task: T-0051 · Asked by: agent (claude) · Date: 2026-10-02
- Question: (1) 05#dto-PetSummary `photoUrl` is a signed URL of pet.profile_file_id, but object storage (T-0038) is not merged and is not a T-0051 dependency. (2) 05#ep-customers.create says a duplicate phone answers `warnings[] {duplicateCustomerIds}` but names no warning code. (3) 05#ep-customers.get says role staff "ไม่เห็น … (ตัดออกจาก response)" — leave the keys out or send null?
- Evidence: 05#dto-PetSummary, 05#ep-customers.create, 05#ep-customers.get, 05 §0 Warnings.
- Answer (2026-10-02): user chose in chat. (1) `photoUrl` is nullable and returns null until T-0038 lands; wiring the signed URL is a follow-up for whoever owns pets/photos after T-0038. (2) `warnings: [{ code: "DUPLICATE_PHONE", message: "เบอร์นี้ซ้ำกับลูกค้าเดิมในร้าน", data: { duplicateCustomerIds } }]` appended to CustomerDetail; no duplicate → no `warnings` key. (3) Keys are left out of the JSON: phone, email, addressLine, subdistrict, district, province, postalCode, internalNote, creditBalanceSatang (optional in the schema).

## Q-0051 · T-0036: stale notification cutoff and production adapter wiring
- Status: answered (T-0036 ships the runner; dispatch deferred)
- Task: T-0036 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: notify/dispatch.ts claims all queued rows; NotifyDeps has interfaces but no runtime adapter factory. The card owns jobs/cron, not notify/** or integrations/**.
- Proposed decision: expand scope for dispatcher cutoff and adapter wiring; absent integration adapters leave their rows queued. Alternatively implement the independent scheduled-job runner and defer cron notification dispatch. No dependent code written before approval.
- Answer (2026-10-03): user chose in chat (asked by claude while finishing T-0036). Ship the scheduled-job runner now: cron.tick = secret check → seed recurring jobs → run due jobs → `{processed, failed}`. Dispatching queued notifications from the tick (stale cutoff in notify/dispatch.ts + runtime adapter factory for LINE/SMTP/push) is deferred to a separate follow-up card; T-0036 does not touch notify/** or integrations/**.

## Q-0060 · T-0011 email subject line
- Status: open (T-0011 ships a fallback)
- Task: T-0011 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 gives each email template (`staff.invite`, `staff.password_reset`, `owner.*`, `admin.*`) one 'ข้อความ' and no subject line; `EmailSender.send` (notify/senders.ts, outside T-0011 allowed paths) receives only `{ to, text }`, so the SMTP adapter cannot pick a per-template subject.
- Evidence: 07 §1 table, `packages/server/src/notify/senders.ts`, ADR-003.
- Proposed decision: add a subject column (Thai) to 07 for email-capable templates and pass `subject` through `EmailSender.send` in a follow-up card. Until then T-0011 sends the rendered text as both subject and body (no invented copy).


## Q-0033 · Support mode reads are refused by every service's `requireRole`
- Status: open
- Task: found in T-0125 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 01 §4 / Q-0007 say a support session (actor `{type:"admin", role:"owner"}`) reads every page like an owner. `withStaff` lets that actor through (`requireRoleOrSupport`), but each service then calls `requireRole(ctx, key)` (`packages/server/src/auth/permissions.ts`), which accepts only `actor.type === "staff"` and answers `FORBIDDEN`. Only `auth.me` handles the support actor itself. So support mode can open the console, but every other read (audit.list, customers.get, …) fails.
- Evidence: `packages/server/src/auth/permissions.ts` requireRole; `packages/server/src/http/wrap.ts` requireRoleOrSupport; `packages/server/src/services/auth/me.ts`; T-0125 test "lets the support session read like an owner…" (uses auth.me for that reason).
- Proposed fix (outside T-0125 allowed_paths): let `requireRole` also accept `ctx.actor.type === "admin" && ctx.supportAccessLogId && roles.includes(ctx.actor.role)`. Writes are already blocked earlier by `SUPPORT_READ_ONLY`. That needs a small card that owns permissions.ts and adds a test.
- Work: T-0125 implemented supportStart/End without touching permissions.ts.

## Q-0034 · customers.blacklist: unblacklisting without a reason
- Status: open
- Task: T-0156 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-customers.blacklist makes `reason` required only when `blacklisted = true`, but R-27's `writeAudit` (`packages/server/src/audit.ts`) requires a reason of ≥ 3 chars for every action matching /blacklist/, so every `customer.blacklist` entry needs one, including lifting the block. Which rule wins?
- Evidence: 05#ep-customers.blacklist validation column; `packages/server/src/audit.ts` writeAudit reason check.
- Work: T-0156 requires the reason in both directions (`REASON_REQUIRED`), so the audit trail always has a reason. If unblacklisting should be allowed without one, audit.ts (outside T-0156) needs an exception for `customer.blacklist` with `after.blacklisted = false`.

## Q-0065 · T-0287 care_task_overdue: "staff ทุกคนที่ active ในสาขา"
- Status: open (T-0287 ships the fallback)
- Task: T-0287 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 sends `staff.care_task_overdue` to "staff (ทุกคนที่ active ในสาขา)", but 02#tbl-staff_user has no branch column or staff↔branch table, so branch membership cannot be read.
- Evidence: 02#tbl-staff_user, `packages/db/src/schema/identity.ts`.
- Proposed decision (implemented): every `staff_user` with status `active` in the task's organization (all roles), one notification each (`care_overdue:{taskId}` dedupe). Revisit if multi-branch staff assignment is added.

## Q-0053 · T-0304 dashboard count definitions
- Status: answered
- Task: T-0304 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: 05#dto-DashboardToday does not fully define cancellation filtering, occupancy rounding, overdue boundary or skipped-message date.
- Answer (2026-10-03): user approved in chat. groom.byStatus excludes cancelled; hotel arrivals/departures and daycare.count exclude cancelled; occupancyPercent is a whole percent rounded to nearest integer, zero with no active room units; overdueCareTasks counts pending rows with dueAt < ctx.now; unsentMessages counts skipped rows by today's createdAt.

## Q-0035 · T-0155: missing LINE channel and non-customer skipped recipients
- Status: answered
- Task: T-0155 · Asked by: agent (codex) · Date: 2026-10-02
- Question: May line.status return NOT_FOUND when the tenant-checked branch has no line_channel? Should line.skipped include every skipped notification, with recipientName nullable for a non-customer recipient or unavailable owner_profile, or only customer messages?
- Evidence: 05#ep-line.status/#dto-LineStatus require line_channel fields but do not define the unconnected branch case. 05#dto-SkippedMessageItem defines recipientName from owner_profile.first_name, while notification supports staff/platform_admin recipients as well. 04#R-18 defines customer push quota skips.
- Proposed decision: NOT_FOUND for a missing channel; include all skipped rows of the branch and return nullable recipientName for rows without a customer owner. No new endpoint, error code, table or permission. Asked in the user chat; no dependent behavior implemented before the answer.
- Answer (2026-10-02): user approved the proposed decision in chat. Missing channel returns NOT_FOUND; include all branch-scoped skipped rows and return null recipientName when no tenant customer owner can be resolved.

## Q-0036 · T-0111 cancelSummary wording
- Status: answered
- Task: T-0111 · Asked by: agent (codex) · Date: 2026-10-02
- Evidence: 05#dto-Quote defines cancelSummary only as a summary calculated from branch_policy free_cancel_hours/forfeit, without exact text.
- Answer (2026-10-02): user approved this text in chat: ยกเลิกก่อนเริ่มบริการอย่างน้อย {hours} ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ {percent}% . Substitute freeCancelHours and lateCancelForfeitPercent respectively.

## Q-0037 · T-0308 pilot analytics definitions
- Status: answered
- Task: T-0308 · Asked by: agent (codex) · Date: 2026-10-02
- Evidence: 05#dto-PilotAnalytics lists counts and ratios without a concrete channel object shape, rate units/empty denominators, date boundaries or the seven-day anchor.
- Answer (2026-10-02): user approved in chat: from/to are inclusive Thai local dates; activeDays7 uses seven days ending on to; bookingsByChannel contains every booking channel; onlineShare/noShowRate are whole percentages, zero with an empty denominator; noShowRate covers due grooming/stay/daycare items excluding cancelled items; reportCardsSent and billsClosed use sentAt/closedAt. Booking activity uses booking/bill creation dates; push usage uses sentAt. Scheduled starts use grooming.startsAt, stay expected check-in time (branch opening when absent, as bookings.create defines first service time), and daycare session start. These details preserve the existing 02 columns and 05 scheduling semantics.

## Q-0040 · bookings.balanceLink: request body, missing-bill error and URL
- Status: answered (implemented in T-0162)
- Task: T-0162 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-bookings.balanceLink mentions "send=true" but has no request table, names no error for "ต้องมี bill open", and says only "url = LIFF /pay/{billId}".
- Answer (2026-10-02): user chose in chat. Body `{ send?: boolean }` (default false = only return the link). No bill on the booking, or the bill is paid/void → `BILL_NOT_OPEN` (409). `amountSatang = bill.total_satang − bill.paid_satang`. `url = APP_BASE_URL + /liff/{branch.booking_slug}/pay/{billId}` (route of L-14; 01 §6 APP_BASE_URL is the base for links in messages). send=true enqueues `customer.balance_link` to booking.customer_id with `amount` formatted by R-31 formatTHB(always).

## Q-0061 · T-0186 expire_hold: bookAgainUrl
- Status: open (T-0186 ships a fallback)
- Task: T-0186 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 `customer.hold_expired` (and `customer.no_show`) needs `{bookAgainUrl}`, but neither 05 nor 07 says which URL that is.
- Evidence: 07 §1 rows hold_expired / no_show; Q-0040 built LIFF links as `APP_BASE_URL + /liff/{branch.booking_slug}/…`; 06 L-02 `/liff/[branchSlug]` is the LIFF home where booking starts.
- Proposed decision: `bookAgainUrl = APP_BASE_URL + /liff/{branch.booking_slug}` (L-02). T-0186 uses this; switch to a deeper booking route (L-04/L-05) or `https://liff.line.me/{liff_id}` if preferred.

## Q-0063 · T-0187 reminder_24h: "active", dateTime, service and reschedules
- Status: open (T-0187 ships these choices)
- Task: T-0187 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §2 says "ตรวจว่ายัง active" without defining it, and 07 §1 `customer.reminder_24h` names `dateTime`, `service`, `bookingUrl` without formats. Its notification dedupe `reminder_24h:{entityId}` also means a visit rescheduled after its reminder was sent never gets a second reminder, although the job dedupe includes `{startsAt}`.
- Evidence: 07 §1/§2 reminder_24h rows; 03 booking/groom/stay/daycare states; enum-labels `service_scope`; R-31 formatThaiDate/formatTime.
- Proposed decision (implemented): active = booking `confirmed` and the visit still `scheduled` (groom) / `reserved` (stay, daycare), and its start still equals job `run_at` + 24 h (otherwise the reschedule's own job sends). Start = groom `starts_at`; stay `check_in_date` + `expected_check_in_time` (date only when null); daycare `visit_date` + session `starts_at`. `dateTime` = `formatThaiDate` + " " + `formatTime` in the branch timezone ("6 ต.ค. 2569 10:00 น."), date only for a stay without a time. `service` = service_scope label (กรูม / โรงแรม / Daycare). `bookingUrl` = `APP_BASE_URL + /liff/{booking_slug}/bookings/{bookingId}` (L-09). A missing branch_policy row counts as enabled (column default). Spec owner: decide whether the notification dedupe should include `{startsAt}`.

## Q-0038 · T-0090 annual holidays editor and loader
- Status: answered
- Task: T-0090 · Asked by: agent (codex) · Date: 2026-10-02
- Evidence: admin.holidays replaces the entire year, while AD-07 had one editable day and no read API. Saving that single row could remove existing holidays.
- Answer: user approved expanding the spec to edit the full annual list and load existing rows before saving. Add admin.listHolidays GET on the same year path, returning date/nameTh rows sorted by date, and a year selector plus add/remove controls. T-0090 owns the loader, DTO and client mapping; existing merged dependencies are unchanged. Save is disabled until loading succeeds. Spec and implementation are separate small PRs; merge the spec prerequisite first.

## Q-0044 · A-04 shows shop name and role but no endpoint loads them
- Status: open (T-0074 blocked)
- Task: T-0074 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 06#scr-A-04 shows `organization.name` and `staff_user.role` and hides the email field unless the invite has none, but its "โหลดข้อมูล" is "—" and 05 has no public endpoint that reads an invite by token (only `auth.inviteAccept`, POST). The "ใช้ LINE แทนรหัสผ่าน" button also needs `staffMe.linkLine` (T-0105), which needs the LINE ID-token verifier (T-0149, blocked on H-03).
- Evidence: 06#scr-A-04, 05#ep-auth.inviteAccept, 05 catalogue (no invite preview).
- Proposed decision: add a public endpoint, e.g. `auth.invitePreview` GET `/api/v1/auth/staff/invite?token=` → `{orgName, role, hasEmail}` with `TOKEN_INVALID`, as a spec change + its own API card; A-04 then loads it. Alternatively drop the two display rows and always show the optional email field.
- Work: none on T-0074 until answered.

## Q-0041 · exports.csv: columns per type, date filter, CSV response through withStaff
- Status: answered (implemented in T-0307)
- Task: T-0307 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-exports.csv lists the types and the CSV format but no columns, no column for from/to, and the route `[type].csv` cannot be a Next.js dynamic segment while `withStaff` always answers JSON (`packages/server/src/http/respond.ts`, outside the card).
- Answer (2026-10-02): user chose in chat. Each type exports its 02 table (customers→customer, pets→pet, bills→bill, bill_lines→bill_line, commissions→commission_entry, bookings→booking) with every column in schema order except organization_id; `*_satang` columns are output in baht with 2 decimals and named without the `_satang` suffix. Pets are the pets of the organization's customers' owner profiles. from/to are inclusive branch-local days on created_at (bills: closed_at, commissions: earned_at, bookings: first_service_at). The route reads `{type}` from the URL path, calls the `withStaff` handler and re-sends its JSON string as `text/csv; charset=utf-8` with `Content-Disposition: attachment`. A shared non-JSON response option in respond.ts would remove this adapter (follow-up, not in T-0307).

## Q-0042 · bills.receipt / bills.sendReceipt: receiptUrl, logoUrl, bill status and resend number
- Status: answered (implemented in T-0236)
- Task: T-0236 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 07 `customer.receipt` needs `receiptUrl` and dedupe `receipt:{billId}:{n}` without defining either; 05#dto-Receipt `logoUrl` is a signed URL but object storage (T-0038) is not merged; 05 does not say which bill statuses bills.receipt / bills.sendReceipt accept.
- Answer (2026-10-02): user chose in chat. `receiptUrl = APP_BASE_URL + /liff/{branch.booking_slug}/receipts/{billId}` (route of L-13). `logoUrl` is null until T-0038 lands (same approach as Q-0032). bills.receipt works for any status (receiptNo/closedAt null while open). bills.sendReceipt needs a paid bill: open → `BILL_HAS_DUE`; void → `BILL_NOT_OPEN`; a bill without customer → `NOT_FOUND`. `n` = number of `customer.receipt` rows already queued for the bill + 1. Implementation details: payments list posted rows only; cashierName = closed_by (else opened_by) display_name; packagesRemaining = the customer's active packages (CustomerPackageItem).

## Q-0049 · bills.open: request combinations, idempotency, eligible bookings, unusable packages
- Status: answered (implemented in T-0229)
- Task: T-0229 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.open marks both `bookingIds[]` and `customerId` optional and lists no error codes; it does not say what happens with mixed bookings, which booking statuses may be billed, or when a package item can no longer be redeemed (R-14).
- Answer (2026-10-03): user chose in chat. bookingIds must belong to one customer (and one branch); a sent customerId must match → else VALIDATION_FAILED. customerId only → empty bill for that customer; neither → empty walk-in bill (customer null). Only `confirmed` bookings may be billed (else VALIDATION_FAILED). Idempotency: every booking already on the same open bill → that bill; a booking on a paid/void bill → BILL_NOT_OPEN; bookings spread over bills → VALIDATION_FAILED. A package item that fails R-14 canRedeemPackage (or belongs to another customer) is billed at its booked price. Lines per appointment: main services, add-ons, then surcharges (performer = groomer); stay/daycare lines are T-0270.

## Q-0055 · bills.list date/order and bills.updateLine rules
- Status: answered (implemented in T-0230)
- Task: T-0230 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.list says `date` is "closed_at หรือ opened_at ตามสถานะ" without the mapping or the order; 05#ep-bills.updateLine names DISCOUNT_LIMIT_EXCEEDED / REASON_REQUIRED without thresholds, limits quantity to quick_item without an error, and says "delete+insert" although package_redemption references bill_line.id.
- Answer (2026-10-03): user chose in chat. bills.list: a paid bill is dated by closed_at, open/void by opened_at (also without a status filter); `date` = that branch-local day; newest first (ms precision) with the 05 §0 keyset cursor and limit; customerName = owner_profile.first_name (null for walk-in). bills.updateLine: discount > 0 needs a reason ≥ 3 chars (REASON_REQUIRED); discount ≤ qty × unit (LINE_DISCOUNT_TOO_LARGE); front_desk: all discounts on the bill (lines + bill discount) ≤ 20% of the gross Σ qty × unit (DISCOUNT_LIMIT_EXCEEDED; owner unlimited); quantity on a non-quick_item line or a performer that is not an active staff of the org → VALIDATION_FAILED; a subtotal below the bill discount → BILL_DISCOUNT_TOO_LARGE; audit `bill.discount` only when the discount/reason changes; the row is updated in place.

## Q-0067 · T-0243 next_groom_reminder: bookUrl, recipient and visit branch
- Status: open (T-0243 ships these choices)
- Task: T-0243 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 `customer.next_groom_reminder` needs `{bookUrl}` and a `dueDate` format, and the job payload `{petId, organizationId}` names neither the customer nor the branch (timezone, branch_policy.next_groom_default_days, booking slug).
- Evidence: 07 §1/§2 next_groom rows, R-17, Q-0040 (LIFF links = APP_BASE_URL + /liff/{booking_slug}/…), 06 L-04 `/liff/[branchSlug]/book/grooming`.
- Proposed decision (implemented): branch and customer come from the pet's latest done/picked_up appointment in the organization (its branch, its booking's customer); `bookUrl = APP_BASE_URL + /liff/{booking_slug}/book/grooming` (L-04); `dueDate` = formatThaiDate; future appointment = one starting after now that is not cancelled/no_show.

## Q-0045 · P-02 legal documents: content files missing and outside allowed paths
- Status: open (T-0317 blocked)
- Task: T-0317 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 06#scr-P-02 renders `LEGAL_DOCS[doc].file` markdown at build time and 10#legal-docs points to `apps/web/content/legal/{privacy_notice,terms_of_service,dpa}.2026-10-01.md`, but those files do not exist, no `LEGAL_DOCS` constant exists, and no markdown renderer is a dependency. The card's allowed_paths cover only the page, `components/p-02/**`, the messages file and the test.
- Evidence: 06#scr-P-02, 10-reference-data.md#legal-docs, `ls apps/web/content` → missing.
- Proposed decision: a human (legal owner) supplies the three markdown files; the card gains `apps/web/content/legal/**` (or the files land first in a separate PR) and lists the markdown dependency (or the page renders plain paragraphs without one). `LEGAL_DOCS` can live in `components/p-02/`.
- Work: none on T-0317 until the content exists.

## Q-0068 · T-0188 approval_overdue: refund by a system job, waitedMinutes
- Status: answered (implemented in T-0188); spec follow-up open
- Task: T-0188 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 03 says awaiting_approval → expired by job:approval_overdue applies R-07 shop_cancel (full refund of a verified deposit), but `refund.created_by` is NOT NULL → staff_user and a job has no staff actor. 07 also gives no basis for `waitedMinutes`, and `refund.mode` is cash/bank_transfer/credit while R-07 says "refund".
- Answer (2026-10-03): user chose in chat: `created_by` = the organization's first active owner. Implemented with: refund `mode = bank_transfer` (R-07 "ร้านโอนคืนเอง"), `amount` = computeCancellation(shop_cancel).returnSatang, `reason = "job:approval_overdue"`, deposit_status verified → refunded, audit `refund.create` (actor system) — all in the job transaction; children → cancelled; no customer notification (03 names none). waitedMinutes = now − (approval_due_at − branch_policy.approval_timeout_minutes); the next round runs after approval_timeout_minutes but no later than first_service_at. Spec follow-up: allow a system creator on refund (nullable created_by or actor columns).

## Q-0043 · AD-04: `feedback_status` has no Thai labels in enum-labels.th.json
- Status: answered for T-0147; spec follow-up open
- Task: T-0147 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 06#scr-AD-04 shows `feedback_report.status` as a select and screen cards say enum labels come from `enumLabel()`, but `docs/spec/enum-labels.th.json` has no `feedback_status` entry (02 lists `new`, `acknowledged`, `done`).
- Answer (2026-10-02): user chose in chat. AD-04 keeps screen-local labels in `messages/th/AD-04.json`: new = ใหม่, acknowledged = รับทราบแล้ว, done = เสร็จแล้ว. Follow-up for the spec owner: add `feedback_status` with these labels to enum-labels.th.json, then AD-04 switches to `enumLabel("feedback_status", …)`.

## Q-0054 · C-20: when to show "ส่ง LINE อีกครั้ง", and choosing the paper size
- Status: answered (implemented in T-0252); DTO follow-up open
- Task: T-0252 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-C-20 shows "ส่ง LINE อีกครั้ง" only when the customer has LINE, but 05#dto-Receipt has no LINE flag (bills.get is not implemented yet). The print button says "@page 58mm/80mm/A5 ตาม SP-05" without saying how the size is chosen (SP-05 = human printer test H-13).
- Answer (2026-10-03): user chose in chat. The button shows for a paid bill with a customer (customerName set); bills.sendReceipt refuses other bills and the dispatcher skips customers without LINE. Follow-up: add a customer LINE flag to Receipt so the button can follow 06 exactly. Paper size: a 58 มม. / 80 มม. / A5 select next to "พิมพ์" (print option, not a data field), default 80 มม., remembered per browser (localStorage), driving the @page CSS. Dates use Asia/Bangkok because Receipt carries no branch timezone.

## Q-0066 · T-0309 owner.daily_summary: noShows and tomorrowCount
- Status: open (T-0309 ships these choices)
- Task: T-0309 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §2 says the summary "รวมตัวเลข DashboardToday", but 05#dto-DashboardToday has no tomorrow count and only grooming no-shows (`groom.byStatus.no_show`); 07 §1 also gives no format for `date` / `salesTotal`.
- Evidence: 07 §1/§2 owner_daily_summary rows, 05#dto-DashboardToday, Q-0053.
- Proposed decision (implemented): numbers are for the job's `localDate` (not ctx.now, so a retry after midnight reports the right day) with the Q-0053 definitions: groomCount = groom.total, staysInHouse = hotel.inHouse, salesTotal = sales.paidTotalSatang via formatTHB auto, noShows = grooming no-shows of the day, tomorrowCount = next day's grooming appointments + hotel check-ins + daycare visits (cancelled excluded), date = formatThaiDate. Sent to every active owner.

## Q-0046 · AD-06: shop name and date range for admin.analytics
- Status: answered (implemented in T-0315)
- Task: T-0315 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-AD-06 shows `organization.name` but 05#dto-PilotAnalytics returns only `orgId`; 05#ep-admin.analytics requires `from`/`to` but the 06 table has no date inputs.
- Answer (2026-10-03): user chose in chat. The screen also loads the existing `admin.orgs` list and maps orgId → name ("—" when missing); no API/DTO change. It requests the 7 Bangkok days ending today (to = today Asia/Bangkok, from = to − 6, inclusive per Q-0037) and shows that range under the title.

## Q-0062 · T-0086: enabling the C-38 console menu entry
- Status: open (screen implementation proceeds within the card scope)
- Task: T-0086 · Asked by: agent (codex) · Date: 2026-10-03
- Question: may this card also change `apps/web/src/components/shell-console/navigation/C-38.ts` to set `implemented: true`? It is absent from allowed_paths. Q-0048 calls for a task-generator follow-up, which has not been applied to T-0086.
- Pending user choice: expand the card scope for that single entry, or ship only the catalogued screen route. The navigation entry remains untouched until answered.

## Q-0064 · Console navigation tests assume every screen is unimplemented
- Status: answered (user approved the shared test scope, 2026-10-03)
- Task: T-0141 (also T-0297, T-0075, T-0088, T-0251) · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: `shell-console/navigation.test.ts` asserts every registry entry is disabled and every owner-menu href is null. Enabling C-43 as the user authorized fails both assertions.
- Question: add this test file to scope and exercise those existing assertions against an explicit unimplemented fixture, plus verify enabled and disabled entries and role filtering in a mixed fixture? Answer: user approved in chat; keep the baseline assertions on the unimplemented fixture and add mixed-menu coverage.
- Related: Q-0048; user approved enabling each of the five screen-specific navigation entries in chat, 2026-10-03.

- Implementation: scope changes must be generated in a separate spec-change PR; the shared fixture correction is included there. Screen task PRs inherit that base and change only their own page/component/messages/tests/navigation entry and Status log.

## Q-0048 · Console menu entries: C-* screen cards cannot enable their own menu item
- Status: answered for T-0070; task-generator follow-up open
- Task: T-0070 · Asked by: agent (claude) · Date: 2026-10-03
- Question: T-0070 must show not-yet-built console screens as disabled. Admin screen cards own `shell-admin/navigation/AD-xx.ts` to switch their entry on, but no C-* screen card has a `shell-console/**` path, so a later screen task cannot enable its menu item.
- Answer (2026-10-03): user chose in chat. T-0070 adds one registry file per routed C-* screen, `apps/web/src/components/shell-console/navigation/C-xx.ts` (`implemented: false`), like the admin shell. Follow-up for the task owner: add `apps/web/src/components/shell-console/navigation/<SCREEN-ID>.ts` to every C-* screen card's allowed_paths (tools/spec-src/build_tasks.py) and a step "set implemented: true".
- Notes on T-0070 choices: the menu lists list pages only (detail/form routes with ids, `…/new`, `…/edit` are reached from their list page); C-02D, C-06 and C-46 are a drawer, a dialog and a floating button, not routes. The guard uses the existing `auth.me` pipeline (`withStaff`) because `resolveStaff` is not exported by `@app/server`; the 403 view shows the API's FORBIDDEN message.
