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
