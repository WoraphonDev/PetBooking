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

## Q-0077 · C-24 commission report: entry details have no data source
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat; a follow-up card extends CommissionReport `rows[].entries[]` to `{ id, at, receiptNo, serviceName, baseSatang, ruleLabel, amountSatang }` and C-24 renders them.
- Task: T-0254 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-C-24 "รายละเอียด" expands each staff row into วันที่, ใบเสร็จ, บริการ, ฐาน, กติกา, ยอด per entry, but 05#dto-CommissionReport returns only `entries[]` (commission_entry ids) and no endpoint reads commission entries by id. 06 also gives no default range for the required from/to.
- Evidence: 06#scr-C-24, 05#dto-CommissionReport, 05#ep-reports.commissions, Q-0030.
- Proposed decision: extend CommissionReport `rows[].entries[]` to objects `{ id, at (earned/reversed), receiptNo, serviceName, baseSatang, ruleLabel, amountSatang }` (a T-0240 follow-up), then C-24 renders the six columns. Until then (implemented) the expand shows the entry count and ids. No default range: the screen asks to pick from/to (and the export link appears) once both are valid; Export CSV = `exports.csv` type commissions with the same range, saved as commissions.csv.

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
- Status: answered (2026-10-04)
- Answer (2026-10-04): Option A: `render()` returns `{ text, subject?, title?, url? }`; dispatch passes `subject` to email and `title/url` to Web Push; LINE Flex moves to T-0149. Needs one card owning notify/dispatch.ts, notify/senders.ts and integrations/email. Subjects: staff.invite 'คำเชิญเข้าร่วมร้าน {shopName}', staff.password_reset 'ตั้งรหัสผ่านใหม่', owner.daily_summary 'สรุปประจำวัน {date}', owner.promptpay_changed '⚠️ บัญชีรับเงินของร้านถูกเปลี่ยน', owner.support_access 'ทีมงานเข้าดูข้อมูลร้านของคุณ', admin.feedback '[Feedback] {shopName}', admin.data_request '[PDPA] คำขอใหม่'. Unblocks the template cards' step 6.
- Task: T-0011 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 gives each email template (`staff.invite`, `staff.password_reset`, `owner.*`, `admin.*`) one 'ข้อความ' and no subject line; `EmailSender.send` (notify/senders.ts, outside T-0011 allowed paths) receives only `{ to, text }`, so the SMTP adapter cannot pick a per-template subject.
- Evidence: 07 §1 table, `packages/server/src/notify/senders.ts`, ADR-003.
- Proposed decision: add a subject column (Thai) to 07 for email-capable templates and pass `subject` through `EmailSender.send` in a follow-up card. Until then T-0011 sends the rendered text as both subject and body (no invented copy).


## Q-0033 · Support mode reads are refused by every service's `requireRole`
- Status: answered (2026-10-04)
- Answer (2026-10-04): Option A: `requireRole` also accepts a support actor (`ctx.actor.type === "admin"`, `ctx.supportAccessLogId` set, role in the allowed roles); writes stay blocked by SUPPORT_READ_ONLY. Needs a small card owning `packages/server/src/auth/permissions.ts` + test.
- Task: found in T-0125 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 01 §4 / Q-0007 say a support session (actor `{type:"admin", role:"owner"}`) reads every page like an owner. `withStaff` lets that actor through (`requireRoleOrSupport`), but each service then calls `requireRole(ctx, key)` (`packages/server/src/auth/permissions.ts`), which accepts only `actor.type === "staff"` and answers `FORBIDDEN`. Only `auth.me` handles the support actor itself. So support mode can open the console, but every other read (audit.list, customers.get, …) fails.
- Evidence: `packages/server/src/auth/permissions.ts` requireRole; `packages/server/src/http/wrap.ts` requireRoleOrSupport; `packages/server/src/services/auth/me.ts`; T-0125 test "lets the support session read like an owner…" (uses auth.me for that reason).
- Proposed fix (outside T-0125 allowed_paths): let `requireRole` also accept `ctx.actor.type === "admin" && ctx.supportAccessLogId && roles.includes(ctx.actor.role)`. Writes are already blocked earlier by `SUPPORT_READ_ONLY`. That needs a small card that owns permissions.ts and adds a test.
- Work: T-0125 implemented supportStart/End without touching permissions.ts.

## Q-0069 · T-0224 customers.timeline: item title, type mapping and amounts
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0224 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-customers.timeline lists the item fields `{at, type, title, petName, amountSatang, refId}` and the sources (booking_event, bill paid/void, report_card sent) but not how each source maps to `type`/`title`/`amountSatang`, nor where `note` items come from. Thai labels live only in apps/web (enum-labels copy).
- Evidence: 05#ep-customers.timeline, 06#scr-C-09 ("ไอคอนตามประเภท + จำนวนเงิน"), enum-labels.th.json.
- Proposed decision (implemented): booking_event → type by entity (booking/deposit → booking, groom_appointment → groom, stay, daycare_visit → daycare), at = created_at, title = "{bookingNo} · {to_status label}", petName from the child's pet, refId = entity id (booking id for deposit). Bill → one item at closed_at ("{receiptNo} · ชำระแล้ว") and, for a void bill, another at voided_at ("{receiptNo} · ยกเลิก"), amountSatang = total_satang. Report card sent → at sent_at, title = "ส่งแล้ว", petName. `note` has no source yet and is never returned. Status labels are copied from enum-labels.th.json into the service with a test that keeps them identical. Paging: 05 §0 `limit` + opaque cursor (at|key), newest first.

## Q-0034 · customers.blacklist: unblacklisting without a reason
- Status: answered (2026-10-04)
- Answer (2026-10-04): Option A: a reason (≥ 3 chars) is required both when blacklisting and when lifting it; update 05#ep-customers.blacklist (`reason` always required). No code change (writeAudit already enforces it).
- Task: T-0156 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 05#ep-customers.blacklist makes `reason` required only when `blacklisted = true`, but R-27's `writeAudit` (`packages/server/src/audit.ts`) requires a reason of ≥ 3 chars for every action matching /blacklist/, so every `customer.blacklist` entry needs one, including lifting the block. Which rule wins?
- Evidence: 05#ep-customers.blacklist validation column; `packages/server/src/audit.ts` writeAudit reason check.
- Work: T-0156 requires the reason in both directions (`REASON_REQUIRED`), so the audit trail always has a reason. If unblacklisting should be allowed without one, audit.ts (outside T-0156) needs an exception for `customer.blacklist` with `after.blacklisted = false`.

## Q-0065 · T-0287 care_task_overdue: "staff ทุกคนที่ active ในสาขา"
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0287 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 sends `staff.care_task_overdue` to "staff (ทุกคนที่ active ในสาขา)", but 02#tbl-staff_user has no branch column or staff↔branch table, so branch membership cannot be read.
- Evidence: 02#tbl-staff_user, `packages/db/src/schema/identity.ts`.
- Proposed decision (implemented): every `staff_user` with status `active` in the task's organization (all roles), one notification each (`care_overdue:{taskId}` dedupe). Revisit if multi-branch staff assignment is added.

## Q-0053 · T-0304 dashboard count definitions
- Status: answered
- Task: T-0304 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: 05#dto-DashboardToday does not fully define cancellation filtering, occupancy rounding, overdue boundary or skipped-message date.
- Answer (2026-10-03): user approved in chat. groom.byStatus excludes cancelled; hotel arrivals/departures and daycare.count exclude cancelled; occupancyPercent is a whole percent rounded to nearest integer, zero with no active room units; overdueCareTasks counts pending rows with dueAt < ctx.now; unsentMessages counts skipped rows by today's createdAt.

## Q-1028 · T-0202 C-09: what the บันทึกคืนเงิน dialog asks for
- Status: open
- Task: T-0202 · Asked by: agent (claude) · Date: 2026-10-06
- Question: 06#scr-C-09 says only "dialog" for บันทึกคืนเงิน (`refunds.create`). The request also takes an optional `bookingId` / `billId`, and C-09 does not load the customer's past bookings or bills, so there is nothing to pick them from.
- Proposed decision (implemented):
  - The dialog asks for ยอดที่คืน (> 0), วิธี (`refund_mode` labels), หลักฐานการโอน (optional photo, kind `proof`) and เหตุผล (≥ 3). It sends the refund for the customer without a booking or bill.
  - Refunds tied to a booking stay with the booking flow (R-07 cancel → refund).
  - The other dialogs: Blacklist / ยกเลิก Blacklist takes a reason (Q-0034). กำหนดระดับเอง takes ระดับ 1–4 or อัตโนมัติ plus a reason. ปรับเครดิต takes +/− and an amount (the new balance must be ≥ 0) plus a reason.

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

## Q-0070 · T-0270 quotes.create stays/daycare: item shapes, bundle groom, approval and cancel window
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0270 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-quotes.create types `stays[]` / `daycare[]` only as `object[]` (groom[] is "เหมือน bookings.create"), and 05#dto-Quote does not say where a stay's checkout-day `bundleGroom` appears, which `auto_confirm_*` decides `requiresApproval` for mixed quotes, or which free-cancel hours the Q-0036 `cancelSummary` uses.
- Evidence: 05#ep-quotes.create, 05#ep-bookings.create, 05#dto-Quote, R-03, R-07 step 2, R-08 step 2, Q-0036.
- Proposed decision (implemented): stays[] / daycare[] use the bookings.create item fields. Prices from the default rate plan: room_rate and daycare_rate for the pet's size tier, else the all-size row (as availability.hotel/daycare); hotel add-ons = active hotel-scope add-on services priced by R-02, per-day when `addon_per_day`. A `bundleGroom` is priced like a groom item for the stay's pet and appended to `groom[]` after the request's groom items. `requiresApproval` = any quoted module whose `auto_confirm_*` is false, or reliability 1 (R-08). `cancelSummary` keeps the Q-0036 wording with the largest free-cancel hours among the quoted modules (R-07 step 2). Eligibility errors (species/weight/in-heat) are left to bookings.create since quotes.create lists no errors.

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

## Q-1025 · T-0206 C-34: the full PromptPay id is never loaded, so which id the test QR uses
- Status: open
- Task: T-0206 · Asked by: agent (claude) · Date: 2026-10-06
- Question: 06#scr-C-34 shows หมายเลข PromptPay as "แสดง+แก้ (แสดงแบบปิดบัง)" and a QR ทดสอบ ฿1 (R-30 amount 100). `branch.get` returns only `promptpay.idMasked`, and `branch.setPromptpay` needs the full `id` on every save, so the screen cannot build a QR for the saved account. `shell-console/navigation/C-34.ts` is also outside the card's allowed paths (Q-0048).
- Proposed decision (implemented):
  - The current account shows as "บัญชีปัจจุบัน {idMasked}", and the id input starts empty: the owner types the id again whenever they save.
  - The test QR is built on the client with R-30 `promptPayPayload` from the typed type + id (shown once the id is valid). The same check flags a wrong id before the request; the server still answers INVALID_PROMPTPAY_ID / INVALID_CREDENTIALS.
  - The menu entry is left for a follow-up.

## Q-0061 · T-0186 expire_hold: bookAgainUrl
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0186 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 `customer.hold_expired` (and `customer.no_show`) needs `{bookAgainUrl}`, but neither 05 nor 07 says which URL that is.
- Evidence: 07 §1 rows hold_expired / no_show; Q-0040 built LIFF links as `APP_BASE_URL + /liff/{branch.booking_slug}/…`; 06 L-02 `/liff/[branchSlug]` is the LIFF home where booking starts.
- Proposed decision: `bookAgainUrl = APP_BASE_URL + /liff/{branch.booking_slug}` (L-02). T-0186 uses this; switch to a deeper booking route (L-04/L-05) or `https://liff.line.me/{liff_id}` if preferred.

## Q-1016 · T-0076 C-09: deferred tabs, pet photo crop, vaccine labels, booking prefill
- Status: open
- Task: T-0076 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. The ประวัติ tab and the credit history need `customers.timeline`, which the card's step 2 defers.
  2. รูปโปรไฟล์ is "image upload crop 1:1" (C-11 profile, used by the add-pet dialog), but there is no crop component.
  3. `PetSummary.vaccineStatus` (ok / warning / missing) has no Thai labels in enum-labels.th.json.
  4. "จองให้ลูกค้านี้ → C-03 พร้อมลูกค้า", but C-03 doesn't read a customer from the URL.
- Proposed decision (implemented):
  1. The timeline tab is hidden and the credit tab shows the balance only, until the timeline task. The packages tab uses `customers.get.activePackages` (which already carries redemptions).
  2. Photos are uploaded through the shared PhotoUploader (R-25 resize) without cropping; a crop step can be added to PhotoUploader later.
  3. Interim labels live in C-09.json (วัคซีนครบ / วัคซีนต้องตรวจ / ไม่มีข้อมูลวัคซีน).
  4. The button goes to `/console/bookings/new?customerId=`; a C-03 follow-up can preselect from it (together with Q-1012's date/time/groomer).

## Q-0087 · T-0189 recompute_reliability: which customers, which dates
- Status: open (T-0189 ships these choices)
- Task: T-0189 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 07 §2 says "นับ 12 เดือนใหม่ทุก customer ที่มีเหตุการณ์ใน 13 เดือน" without defining "เหตุการณ์", the date each no-show counts on, or "completed" for the job.
- Evidence: 07 §2 recompute_reliability, R-09, Q-0074 (completed in bills.close), Q-0084 (cancel_is_late).
- Proposed decision (implemented): customers with a booking created or cancelled in the last 13 months, plus any customer whose stored counts are non-zero (so old counts decay to 0). Window = now − 12 calendar months. No-show counts on the child's date (groom starts_at, stay check_in_date, daycare visit_date); late cancel = booking.cancel_is_late = true with cancelled_at in the window; completed = picked_up / checked_out children of the customer's bills paid in the window (as bills.close). Writes no_show_count_12m, late_cancel_count_12m and reliability_level only when one of them changes.

## Q-0063 · T-0187 reminder_24h: "active", dateTime, service and reschedules
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
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
- Status: answered (2026-10-04)
- Answer (2026-10-04): Option A: add public `auth.invitePreview` GET `/api/v1/auth/staff/invite?token=` → `{ orgName, role, hasEmail }`, TOKEN_INVALID for an unknown/expired token (spec change + own API card); A-04 loads it. The 'ใช้ LINE แทนรหัสผ่าน' button stays hidden until T-0149.
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

## Q-0074 · T-0234 bills.close: redemption count, package value, reliability, booking close
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0234 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.close says "package_redemption → sessions_used + 1", but bills.open (T-0229) and bills.addLine (T-0231) already count the session when the line is added; doing it again at close would double count. It also does not say which price a sold package's unit value uses, how "completed visits" for R-09 are counted, or which child states end a booking.
- Evidence: 05#ep-bills.close, R-09 note (recompute on bill close), R-13, R-14, R-16, 03 sm-booking/sm-bill, Q-0049, Q-0072.
- Proposed decision (implemented): close does not touch redemption counts (already consumed when the line was added; removeLine/void give them back). package_sale → customer_package with packageTerms(price = the line total actually charged, template sessions/validity, purchased now in the branch timezone), pet only for single_pet. Commissions per R-13 with service from the booking item or the package template, redemption base = package unit value. Deposits: verified − applied deposit payments → credit_ledger `deposit_credit` (ref booking) and deposit_status → applied. Bookings close when every child is picked_up/checked_out/no_show/cancelled. Customer: visit_count + 1, first/last visit = now, reliability_level recomputed with completed visits = picked_up/checked_out children of this customer's paid bills closed in the last 12 months. customer.receipt dedupe `receipt:{billId}:1` (bills.sendReceipt continues the count); walk-in bills notify nobody.

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

## Q-0071 · T-0283 bills.open hotel/daycare lines: descriptions and order
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0283 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.open says to create lines from stay (stay_night qty = nights), stay_addon and daycare_visit, but stay and daycare_visit have no name snapshot for `bill_line.description`, and the line order across modules is not given.
- Evidence: 05#ep-bills.open, 02#tbl-stay / #tbl-daycare_visit / #tbl-stay_addon, Q-0049.
- Proposed decision (implemented): stay_night = room type `name_th`, qty = `stay.nights`, unit = `stay.nightly_price_satang`; stay_addon = `stay_addon.name_snapshot`, its quantity × unit price; daycare = session type `name_th`, qty 1, `daycare_visit.price_satang`; pet = the child's pet; no performer. Order: grooming lines (Q-0049) first, then per stay (by check-in) its night line and add-ons, then daycare visits by date. Cancelled/no-show children are skipped.

## Q-0073 · T-0232 bills.removeLine / setDiscount / voidPayment details
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0232 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05 says booking lines cannot be removed but names no error; it does not say what removing a counter redemption does to the package, whether setDiscount/voidPayment need an open bill for codes other than those listed, how a payment voided twice or a deposit not on a bill is handled, or where the credit refund is linked.
- Evidence: 05#ep-bills.removeLine / #ep-bills.setDiscount / #ep-bills.voidPayment, R-14 #5, R-15, Q-0055, Q-0072.
- Proposed decision (implemented): removeLine works on bills.addLine lines only (quick_item, package_sale, counter package_redemption); a booking line → VALIDATION_FAILED. Removing a counter redemption deletes its package_redemption and gives the session back (sessions_used − 1, exhausted → active). All three need an open bill (BILL_NOT_OPEN) and recompute totals. setDiscount: reason ≥ 3 chars when > 0, front_desk limit as Q-0055 (line + bill discounts ≤ 20% of Σ qty × unit), audit `bill.discount` only when the discount/reason changes. voidPayment: reason ≥ 3 chars (REASON_REQUIRED, checked before lookup), only posted payments of a bill (a payment without a bill → NOT_FOUND; already voided → VALIDATION_FAILED), paid_satang reduced; a credit payment adds a `void_reversal` credit_ledger row (ref bill) and raises customer.credit_balance in the same transaction; audit `payment.void`.

## Q-0084 · T-0189 recompute_reliability: late cancels cannot be counted afterwards
- Status: answered (2026-10-04)
- Task: T-0189 · Asked by: agent (claude) · Date: 2026-10-04
- Question: R-09 recounts late cancels over 12 months, but bookings.cancel stores neither `kind` nor whether the cancel was late (only `cancelled_by_type`, which cannot tell a shop cancel from a cancel on the customer's behalf).
- Answer (2026-10-04): user chose option A in chat. Add `booking.cancel_is_late boolean` (null = not cancelled), written by bookings.cancel / liff.cancel from R-07 `isLate`; recompute_reliability counts bookings with `cancel_is_late = true` and `cancelled_at` in the last 12 months. Needs a spec change (02 + 05) and a migration in the card that owns it; T-0189 waits for it.

## Q-0117 · T-0089 AD-05: no Thai labels for data_request_status
- Status: open
- Task: T-0089 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 06#scr-AD-05 shows `data_request.status` as an enum, but enum-labels.th.json has only `data_request_type`, not `data_request_status` (open / done / rejected).
- Proposed decision: add `data_request_status: { open: "รอดำเนินการ", done: "ดำเนินการแล้ว", rejected: "ปฏิเสธ" }` to enum-labels.th.json (spec change), then AD-05 switches to enumLabel().
- Interim (implemented): the three labels live in AD-05.json (same approach as Q-0043 for feedback_status).

## Q-0088 · T-0193 staff templates: what `duplicateFlag` and `isLate` render as
- Status: answered (2026-10-05)
- Answer (2026-10-05): user chose option A in chat. The caller passes the ready text: `duplicateFlag` = "⚠️ สลิปนี้เคยใช้แล้ว" when R-05 finds a duplicate, otherwise ""; `isLate` = "(ยกเลิกกระชั้น)" when R-07 `isLate`, otherwise "". The template substitutes it and drops the trailing space when empty (T-0193). liff.uploadSlip / liff.payUploadSlip / liff.cancel pass these strings; 07 §1 to be updated by spec change.
- Task: T-0193 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 07 §1 `staff.slip_submitted` ends with `{duplicateFlag}` and `staff.booking_cancelled` ends with `{isLate}`, but 07 gives no wording; payload variables are `string | number` (no boolean), and 07 does not say what shows when the slip is not a duplicate / the cancel is not late.
- Evidence: 07 §1 rows `staff.slip_submitted`, `staff.booking_cancelled`; R-05 step 4 UI badge "สลิปนี้เคยใช้แล้ว"; R-07 `isLate`; 06 C-09 label "ยกเลิกกระชั้น".
- Options: A) caller passes the ready text — `duplicateFlag` = "⚠️ สลิปนี้เคยใช้แล้ว" or "", `isLate` = "(ยกเลิกกระชั้น)" or "" — and the template only substitutes; B) caller passes 1/0 and the template maps 1 → that wording, 0 → nothing.
- Implemented for now (T-0193): option A shape without fixing the wording — the template substitutes whatever text the caller sends and trims the trailing space when it is empty. The liff.uploadSlip / liff.payUploadSlip / liff.cancel cards need the wording to pass.

## Q-0114 · T-0143 C-46: mounting the feedback button and the app version
- Status: open
- Task: T-0143 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) 06#scr-C-46 is a floating button on every page (OFS), but T-0143 may only touch `components/c-46/**`; the console / staff shells (`shell-console/**`, `shell-staff/**`) that would mount it belong to other cards. (2) "เวอร์ชัน = feedback_report.app_version (git sha), auto" — no build-time source of the version is defined (no env var in 01 / next.config).
- Proposed decision: (1) a follow-up shell card (or widening T-0143 by a generator edit, as Q-1001) mounts `<FeedbackWidget appVersion={…} />` in the console and staff layouts. (2) expose the git sha at build time as `NEXT_PUBLIC_APP_VERSION` (set by CI / Vercel from the commit sha) and pass it in.
- Interim (implemented): `FeedbackWidget` / `FeedbackForm` are ready in `components/c-46` (message, optional screenshot upload via staff.uploadUrl kind feedback, current page, version shown as "—" when none is passed, send → feedback.create + thank-you toast) but are not mounted anywhere yet.

## Q-0091 · T-0112 bookings.create: booking_confirmed wording and package-paid items
- Status: open (T-0112 ships the interim choices below; human review)
- Task: T-0112 · Asked by: agent (claude) · Date: 2026-10-04
- Question: (1) 07 §1 `customer.booking_confirmed` needs `mapUrl`, but no table has a map link for the branch; `summary` / `dateTime` have no format. (2) A groom item paid by a customer package (`groom[].customerPackageId`, R-14): should its price snapshot still count in `estimated_total_satang` and the R-06 deposit?
- Evidence: 07 §1 row `customer.booking_confirmed`; 02 `branch` (no map column); 05#dto-MyBookingItem `summary` = "ชื่อบริการ/ประเภทห้อง"; R-03, R-06, R-14.
- Implemented for now: (1) `mapUrl` = "" (the line renders empty); `summary` = "{petName}: {service names joined ', '}" joined " / "; `dateTime` = R-31 date + time of the first appointment. (2) The item keeps its catalog price snapshot with `customer_package_id` set (the bill redeems it at 0 later), so it counts in the estimate and the deposit.
- Options: (1) A add `branch.map_url` (spec change + migration) / B drop the map line from the template. (2) A as implemented / B price 0 for package-paid items at booking time.

## Q-1009 · T-0136 C-03: data the grooming form needs beyond the 06 table
- Status: open
- Task: T-0136 · Asked by: agent (claude) · Date: 2026-10-05
- Question / gaps found while building C-03 (grooming tab):
  1. "เพิ่มลูกค้า" must open C-10 as a dialog, but C-10 (T-0077) is not merged, so there is nothing to open.
  2. "ใช้แพ็กเกจ" lists packages where R-14 canRedeem = ok, but `CustomerPackageItem` has no service id, size tier or share scope, so the client can't run canRedeemPackage.
  3. `availability.groomSlots.pendingAppointments` needs `blockedUntil`, but `SlotList` slots only carry `endsAt`.
  4. There are no Thai labels in the spec for `Quote.depositReason` (R-06 reasons) or `SlotList.reason`.
  5. 06 lists only search.quick / groomSlots / hotel / daycare / quotes.create under "โหลดข้อมูล", but the fields also need customers.get (pets, level, blacklist), customers.packages, services.list (prices, add-on links), sizeTiers.list and staffUsers.list (groomers).
- Proposed decision (implemented): (1) the button is shown but disabled until T-0077 lands; that card or a follow-up wires the dialog. (2) The client filters to active, unexpired packages with sessions left that belong to this pet or are shared; quotes.create / bookings.create enforce the rest of R-14 (PACKAGE_* errors). (3) The client sends the slot's endsAt; bookings.create re-checks overlaps and SLOT_TAKEN sends the user back to choose times. A spec change could add `blockedUntil` to SlotList. (4) Interim Thai labels live in C-03.json (same approach as Q-0117); a spec change could move them to enum-labels.th.json. (5) Those existing endpoints are read as-is; no new endpoint or field.

## Q-0113 · T-0279 stays.checkOut: where missingNote goes, and opening the bill
- Status: open
- Task: T-0279 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) 05 accepts `missingNote` when belongings are missing, but no column stores it (stay_belonging has only returned_at). (2) "เปิด/เติมบิลอัตโนมัติ (bills.openFromBooking)" names a function that 05 does not define; bills.open is the endpoint that builds stay lines.
- Proposed decision: (1) add `stay.checkout_note` (or `stay_belonging.missing_note`) by a spec change, or record it in booking_event.reason of the checked_out event. (2) "openFromBooking" = bills.open with the stay's booking, in the same transaction; an already open bill is kept as is (it already carries the stay lines).
- Interim (implemented): missingNote is required when an item is missing but not stored; after the check-out commits, a confirmed booking without a bill gets one through bills.open (a second transaction — if it fails, the stay is still checked out and the bill can be opened from C-17/C-18).

## Q-0092 · T-0112: bookings.create PR exceeds the small-PR budget
- Status: answered (user approved size exception in chat, 2026-10-04)
- Task: T-0112 · Asked by: agent (claude) · Date: 2026-10-04
- Question: T-0112 (size L) changes ~1,180 lines: service ~525, integration tests ~410, and the seven DTOs it owns + contract ~230. Ship as one PR or split?
- Answer (2026-10-04): user approved the exception, as for Q-0050 / Q-0090. Ship the card as one PR.

## Q-0085 · T-0305 reports.sales: gross/discount/net and grouping
- Status: answered (2026-10-04)
- Task: T-0305 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 05#dto-SalesReport sets gross = Σ line_total and discount = bill + line discounts, but line_total is already net of the line discount (double count), and grouping by service/groomer/method is not defined.
- Answer (2026-10-04): user chose option A in chat. gross = Σ qty × unit; discount = Σ line discounts + bill discount; net = gross − discount (= bill.total). Paid bills by branch-local closed_at day, void excluded. day = one row per day; service/groomer = per line with the bill discount spread like R-13 #1 (service = service or quick-item name; lines without performer → one "ไม่ระบุช่าง" row), billCount = distinct bills in the row; method = posted payments per method (net = amount, gross/discount 0). payments[] = Σ posted payments of those bills per method (deposit/credit included). totals = row shape without key. 05 text to be updated by spec change.

## Q-1015 · T-0137 C-05: cancel without R-07 preview, event actor, slip dialog
- Status: open
- Task: T-0137 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. "ยกเลิกใบจอง" is `bookings.cancelPreview → bookings.cancel` with the R-07 money shown before confirming, but the card's step 2 defers `bookings.cancelPreview`.
  2. The timeline needs "ผู้ทำ", but `BookingEventItem` only has `actorType` (no name), and enum-labels.th.json has no `actor_type`.
  3. A slip thumbnail opens "C-07 dialog", but C-07 is the `/console/slips` page.
- Proposed decision (implemented):
  1. The cancel dialog asks who cancels (ลูกค้าขอ / ร้าน), refund or credit when the snapshot's `cancelRefundMode` is customer_choice, and a reason, then calls bookings.cancel without a preview. The cancelPreview task adds the R-07 amounts to the same dialog.
  2. The timeline shows the actor type with interim Thai labels in C-05.json (ร้าน / ลูกค้า / ระบบ / ผู้ดูแลระบบ).
  3. The thumbnail links to `/console/slips`.

## Q-1023 · T-0200 C-05: "มีบิล open", deposit default, and hosting C-06
- Status: open
- Task: T-0200 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. ส่งลิงก์จ่ายยอดคงเหลือ shows when "มีบิล open", but `BookingDetail` has `billId` without the bill's status.
  2. The รับมัดจำ dialog gives no default amount.
  3. C-05 hosts C-02D, whose เช็คอิน opens C-06 (Q-1013 / Q-1020).
- Proposed decision (implemented):
  1. The button shows whenever `billId` is set. A paid / void bill gets `BILL_NOT_OPEN` from the server (Q-0040), shown as a toast. Alternative: add `billStatus` to BookingDetail (spec change).
  2. ยอด starts at `depositRequiredSatang − depositVerifiedSatang` and can be edited.
  3. C-05 passes `onCheckIn` to the drawer and mounts `CheckInDialog`. With this, Q-1015 item 1 is done: the cancel dialog now shows the `bookings.cancelPreview` result for the chosen ใครยกเลิก, and confirm waits for it.

## Q-1026 · T-0207 C-35: booking slug source, storefront origin, PDF export
- Status: open
- Task: T-0207 · Asked by: agent (claude) · Date: 2026-10-06
- Question:
  1. 06#scr-C-35 loads only `line.status`, but ลิงก์หน้าร้าน is `branch.booking_slug`, which `LineStatus` does not carry.
  2. The table gives the path `/b/{slug}` but no base URL.
  3. The poster needs "ดาวน์โหลด PNG/PDF (สร้างฝั่ง client)", but there is no PDF library among the allowed dependencies.
  4. `shell-console/navigation/C-35.ts` is outside the card's allowed paths (Q-0048).
- Proposed decision (implemented):
  1. The screen also loads `branch.get` (owner) for `bookingSlug` and the shop name printed on the poster.
  2. The link is `window.location.origin + /b/{slug}`.
  3. PNG: the poster SVG is drawn on a canvas at 150 dpi. PDF: the browser print dialog (save as PDF), with `@page` set to A4/A5.
  4. The menu entry is left for a follow-up.

## Q-0095 · T-0233 bills.addPayment: change_satang and a fully paid bill
- Status: open (T-0233 ships the interim choice; human review)
- Task: T-0233 · Asked by: agent (claude) · Date: 2026-10-04
- Question: (1) 05 says "bill.paid_satang/change_satang อัปเดต" but not whether change_satang is the last payment's change or the total over the bill's cash payments. (2) R-15 `applyPayment` returns `BILL_ALREADY_PAID` when due = 0, which is not in the endpoint's error list.
- Evidence: 05#ep-bills.addPayment, R-15 step 5, 02 bill.change_satang.
- Implemented for now: (1) change_satang accumulates (+ change of each cash payment); bills.voidPayment does not touch it. (2) due = 0 answers `BILL_ALREADY_PAID` (409, defined in 05 §1).

## Q-0055 · bills.list date/order and bills.updateLine rules
- Status: answered (implemented in T-0230)
- Task: T-0230 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.list says `date` is "closed_at หรือ opened_at ตามสถานะ" without the mapping or the order; 05#ep-bills.updateLine names DISCOUNT_LIMIT_EXCEEDED / REASON_REQUIRED without thresholds, limits quantity to quick_item without an error, and says "delete+insert" although package_redemption references bill_line.id.
- Answer (2026-10-03): user chose in chat. bills.list: a paid bill is dated by closed_at, open/void by opened_at (also without a status filter); `date` = that branch-local day; newest first (ms precision) with the 05 §0 keyset cursor and limit; customerName = owner_profile.first_name (null for walk-in). bills.updateLine: discount > 0 needs a reason ≥ 3 chars (REASON_REQUIRED); discount ≤ qty × unit (LINE_DISCOUNT_TOO_LARGE); front_desk: all discounts on the bill (lines + bill discount) ≤ 20% of the gross Σ qty × unit (DISCOUNT_LIMIT_EXCEEDED; owner unlimited); quantity on a non-quick_item line or a performer that is not an active staff of the org → VALIDATION_FAILED; a subtotal below the bill discount → BILL_DISCOUNT_TOO_LARGE; audit `bill.discount` only when the discount/reason changes; the row is updated in place.

## Q-0107 · T-0255 C-41: where the size options come from
- Status: answered (user chose in chat, 2026-10-05)
- Task: T-0255 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 06#scr-C-41 makes "ขนาด" a select (ทุกขนาด) but loads only packageTemplates.list and services.list, which carry size tier ids without names.
- Answer (2026-10-05): the screen also loads sizeTiers.list (owner already allowed). Options = "ทุกขนาด" (null) + the shop's tiers of the species the chosen service accepts, labelled "{species} {labelTh}" as in C-40. Related: `shell-console/navigation/C-41.ts` is outside the card's allowed paths, so the menu entry stays disabled (same follow-up as Q-0048).

## Q-0103 · T-0114 bookings.cancel: the customer.booking_cancelled money line
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0114 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 07 `customer.booking_cancelled` has `{moneyLine}` without wording.
- Answer (2026-10-04): from the R-07 result (R-31 money), parts joined with " · ": forfeit > 0 → "ริบมัดจำ ฿{forfeit} ตามนโยบายร้าน"; return as credit → "คืนเป็นเครดิต ฿{return} ใช้ได้ครั้งหน้า"; return as refund → "ร้านจะคืนเงิน ฿{return}"; no deposit → "".

## Q-0067 · T-0243 next_groom_reminder: bookUrl, recipient and visit branch
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0243 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §1 `customer.next_groom_reminder` needs `{bookUrl}` and a `dueDate` format, and the job payload `{petId, organizationId}` names neither the customer nor the branch (timezone, branch_policy.next_groom_default_days, booking slug).
- Evidence: 07 §1/§2 next_groom rows, R-17, Q-0040 (LIFF links = APP_BASE_URL + /liff/{booking_slug}/…), 06 L-04 `/liff/[branchSlug]/book/grooming`.
- Proposed decision (implemented): branch and customer come from the pet's latest done/picked_up appointment in the organization (its branch, its booking's customer); `bookUrl = APP_BASE_URL + /liff/{booking_slug}/book/grooming` (L-04); `dueDate` = formatThaiDate; future appointment = one starting after now that is not cancelled/no_show.

## Q-0072 · T-0231 bills.addLine: package lines without an appointment
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0231 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.addLine lists the fields and the R-14 error codes, but not how a package line is built when no appointment is involved: what a package_sale costs/says, who it belongs to, how many per line, and what a counter redemption checks (R-14 `canRedeemPackage` needs an appointment service/tier/pet). It also gives no code for a package that is not active for other reasons.
- Evidence: 05#ep-bills.addLine, R-14, 03 customer_package (`∅ → active` on bills.close), Q-0055 (performer rule).
- Proposed decision (implemented): quick_item = description + unit price (required), quantity 1–999 (default 1). package_sale = the branch's active package_template (price, `name_th`), quantity 1, ref = template; the bill must have a customer; single_pet needs `petId` of that customer; the customer_package is created by bills.close. package_redemption = a package of the bill's customer for one of its pets, checked with R-14 using the package's own service/tier (counter redemption), price 0, ref = customer_package, + package_redemption row, sessions_used + 1 (exhausted when full). A non-active package answers PACKAGE_EXHAUSTED / PACKAGE_EXPIRED by its status, other failures VALIDATION_FAILED. Fields that do not belong to the line type, or quantity ≠ 1 on package lines → VALIDATION_FAILED. performerId must be an active staff (as Q-0055). Totals are recomputed like bills.updateLine; no audit (none listed).

## Q-0045 · P-02 legal documents: content files missing and outside allowed paths
- Status: answered (2026-10-04)
- Answer (2026-10-04): Option A + C: a human (legal owner) supplies the three markdown files in a separate PR first; T-0317 then renders plain paragraphs with `LEGAL_DOCS` in `components/p-02/`. Claude drafts a Thai outline (PDPA headings) for human/legal review after the quota reset; the draft is not published as-is. Required before the pilot (L-01 consent).
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

## Q-0106 · T-0282 daycare.check_out: "เพิ่มเข้าบิล" and STATUS_NOT_ALLOWED
- Status: answered (user chose in chat, 2026-10-05)
- Task: T-0282 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 03 gives daycare check-out the side effect "เพิ่มเข้าบิล" and 05 lists `STATUS_NOT_ALLOWED` without a condition (a wrong source status is already INVALID_TRANSITION).
- Answer (2026-10-05): the booking's open bill without a line for the visit gets a `daycare` bill_line (as bills.open builds it) and recomputed totals (R-15); no bill yet → nothing (bills.open adds daycare visits later); a paid/void bill without the line → `STATUS_NOT_ALLOWED {billStatus}`.

## Q-0102 · T-0166 slips.reject: telling the customer on the second rejection
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0166 · Asked by: agent (claude) · Date: 2026-10-04
- Question: R-08 step 4 expires the booking on the second slip rejection, but 05 only lists customer.slip_rejected (with a new deadline and pay link) as the notification.
- Answer (2026-10-04): first rejection → awaiting_deposit with hold = now + hold_minutes, expire_hold job, customer.slip_rejected. Second rejection (≥ 2 rejected slips on the booking) → booking expired, children cancelled, customer.hold_expired (as the expire_hold job) instead of slip_rejected.

## Q-0043 · AD-04: `feedback_status` has no Thai labels in enum-labels.th.json
- Status: answered for T-0147; spec follow-up open
- Task: T-0147 · Asked by: agent (claude) · Date: 2026-10-02
- Question: 06#scr-AD-04 shows `feedback_report.status` as a select and screen cards say enum labels come from `enumLabel()`, but `docs/spec/enum-labels.th.json` has no `feedback_status` entry (02 lists `new`, `acknowledged`, `done`).
- Answer (2026-10-02): user chose in chat. AD-04 keeps screen-local labels in `messages/th/AD-04.json`: new = ใหม่, acknowledged = รับทราบแล้ว, done = เสร็จแล้ว. Follow-up for the spec owner: add `feedback_status` with these labels to enum-labels.th.json, then AD-04 switches to `enumLabel("feedback_status", …)`.

## Q-0076 · C-26 Audit log: Thai labels for actions/entities, links and the diff
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat; the proposed labels in C-26.json stay until `audit_action` labels are added to enum-labels.th.json.
- Task: T-0079 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-C-26 asks for a "select ป้ายภาษาไทย" of `audit_log.action` and an entity link, but enum-labels.th.json has no audit action or entity type labels (R-27 lists the action codes only), 06 does not map entity types to pages, and "diff (after)" has no format. The menu entry `shell-console/navigation/C-26.ts` is outside the card's allowed paths (same follow-up as Q-0048).
- Evidence: 06#scr-C-26, 04 R-27 action list, enum-labels.th.json, Q-0043 (screen-local labels precedent), Q-0048.
- Proposed decision (implemented, labels need approval): Thai labels for all 31 R-27 actions, the audited entity types and non-staff actors live in `messages/th/C-26.json` (keys use `__` for the action's dot because next-intl keys cannot contain dots; a test keeps the list equal to R-27). Links: bill → C-18, booking → C-05, customer → C-09, stay → C-15, pet → C-11; other entities show their name only. Diff = one line per changed key `key: before → after` (audit rows hold changed keys only). Time = formatThaiDate + formatTime in the branch timezone. Spec owner: add `audit_action` (and entity type) labels to enum-labels.th.json, then C-26 switches to `enumLabel()`; enable `navigation/C-26.ts` in a card that owns it.

## Q-1013 · T-0135 C-02D: check-in via C-06, owner link, "บิลยังไม่ปิด", and "requested"
- Status: open
- Task: T-0135 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. เช็คอิน "เปิด dialog C-06", but C-06 (T-0138) isn't merged, and C-02D can't own it.
  2. เจ้าของ links to C-09 (`/console/customers/[customerId]`), but `JobCard` / `AppointmentCard` carry no customer id.
  3. The surcharge buttons need "บิลยังไม่ปิด", but AppointmentCard carries no bill state.
  4. The "ลูกค้าเลือก" tag is for `groomer_preference = requested`, which isn't a value of the enum (`any` / `specific`).
- Proposed decision (implemented):
  1. The drawer takes an `onCheckIn(appointment)` prop from its host; the button shows per the state machine and is disabled until a host passes C-06.
  2. The owner name shows without a link until a `customerId` is added to AppointmentCard (spec change).
  3. The buttons follow the status rule only, and the server refuses when the bill is closed.
  4. `specific` is read as "requested".

## Q-1020 · T-0138 C-06: consent text and new size label are not in groom.jobCard; labels; hosts
- Status: open
- Task: T-0138 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. 06#scr-C-06 loads only `groom.jobCard`, but ข้อความใบยินยอม is `branch_policy.grooming_consent_text` (not in `JobCard`) and the SIZE_CHANGED dialog needs the new size name "X" (the warning carries only `newSizeTierId` and `newPriceSatang`).
  2. enum-labels.th.json has no labels for `condition_flags` or `consent_document.reasons`.
  3. C-06 is a dialog on C-02 / C-05, but those hosts are outside the card's allowed paths.
- Proposed decision (implemented):
  1. While open, C-06 also loads `branch.get` (OF can read it) for `policy.groomingConsentText`. After a SIZE_CHANGED check-in it loads `sizeTiers.list` for `labelTh`. A null `newPriceSatang` shows "ยังไม่มีราคา". Alternative: add both to JobCard and the warning data (spec change).
  2. The Thai labels in the 06 table go in `messages/th/C-06.json` (same precedent as Q-0043 / C-02D).
  3. `CheckInDialog({ appointmentId, onClose })` is exported. C-02 / C-05 render it from C-02D's `onCheckIn` (Q-1013) in a card that owns those files.

## Q-1022 · T-0198 C-02D: previewing the no-show effects (R-07 / R-09) before confirming
- Status: open
- Task: T-0198 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 06#scr-C-02D asks the ลูกค้าไม่มา dialog to show the deposit result (R-07) and the reliability effect (R-09) before confirming. The drawer has `AppointmentCard.depositStatus` and `reliabilityLevel` only. It has no deposit amount, no `booking.policy_snapshot`, no other items of the booking (forfeit happens only once all of them end), and no no-show / late-cancel counts or override. No endpoint previews `groom.noShow`.
- Proposed decision (implemented): the drawer also loads `branch.get` for `no_show_grace_minutes` (button rule). The dialog states the rule outcome:
  - Deposit: "ริบมัดจำทั้งหมด (เมื่อทุกบริการในใบจองจบแล้ว)" when the deposit is `verified`, else "ไม่มีมัดจำที่ต้องริบ".
  - Level: from the current level to "2 (or 1 with earlier no-shows / late cancels)", or "stays 1".
  - An override (R-09 step 1) is not visible here, so the text can be wrong for overridden customers.
  - Alternative: a preview field on AppointmentCard or a dry-run flag on groom.noShow (spec change).

## Q-0110 · T-0276 stays.changeRoom: moving to another room type
- Status: open
- Task: T-0276 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05#ep-stays.changeRoom lists only `roomUnitId` in the request, but its validation says another room type needs `keepPrice` and its effect says the price changes only when `repriceToType=true` — neither field is in the request table. Which field (one boolean or two), and how is the new price set (default-plan room_rate for the pet's tier × nights, estimate and open bill line updated)?
- Proposed decision: one optional `repriceToType: boolean` (default false = keep the booked price, which covers "keepPrice"); true → nightly price from the new type's default-plan rate (R-28 pickPrice), room_total = nights × nightly, booking estimate and an open bill's stay_night line follow.
- Interim (implemented): same-type moves only; another type → VALIDATION_FAILED `{ roomUnitId: "another room type is not supported yet (Q-0110)" }`.

## Q-0097 · T-0163 groom.noShow: too early, and the customer.no_show money line
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0163 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 05 says no-show is allowed once now ≥ starts_at + no_show_grace_minutes but names no error for earlier; 07 `customer.no_show` has `{moneyLine}` with no wording.
- Answer (2026-10-04): earlier → `STATUS_NOT_ALLOWED` with details `{ allowedFrom }` (ISO). moneyLine = "มัดจำ ฿{forfeit} ถูกริบตามนโยบายร้าน" (R-31 money) when the booking closes and R-07 forfeits a verified deposit > 0; otherwise "".

## Q-1004 · T-0044: affected-appointment warning is unspecified
- Status: answered — user-approved implementation; human spec corrections pending
- Task: T-0044 · Asked by: codex · Date: 2026-10-04
- Evidence: 05#ep-branch.setHours promises warnings[] listing affected appointments, while its response is BranchSettings, whose DTO contains no warnings. Section 0 defines only generic {code, message, data}; no warning code, data fields or affected-status/time criteria are specified. 06 C-12 requires a dialog showing the list, without defining its API data.
- Question: define the warning code/message/data and whether affected appointments include only future non-terminal appointments with startsAt >= ctx.now, using the branch timezone and the full startsAt..endsAt interval. No new warning identifier or payload is invented. The setHours implementation is paused; branch.get/update can proceed.

- Additional contradiction: 05#dto-BranchSettings says promptpay.idMasked reveals the last three characters, but its example ***-***-5678 reveals four. Please confirm the revealed suffix length; the masked-ID serializer is paused.

- Answer (2026-10-04): user chose to continue branch.get/update and defer setHours and PromptPay display. The partial implementation must remain a draft until the deferred response behavior is specified; no warning code or masking rule is invented.


- Proposed resolution (2026-10-04; pending user/spec-owner approval):
  1. PromptPay reveals exactly the final three characters, replacing every earlier character with `*` and adding no separators. Unconfigured values remain null. This follows the written suffix length; the contradictory four-character example needs human correction in the read-only spec.
  2. Only branch.setHours adds `warnings` alongside BranchSettings, always an array. When affected items exist, return one warning with proposed code `BRANCH_HOURS_AFFECTED`, message `มีรายการจองอยู่นอกเวลาเปิดทำการใหม่`, and data `{ items: AffectedServiceItem[] }`; otherwise return an empty array. Reuse the existing DTO and common Warning shape, without changing the shared common.ts file.
  3. Proposed affected-item criteria: tenant-checked items in the current branch, evaluated using ctx.now and branch.timezone. Grooming: scheduled/checked_in/in_progress with endsAt > ctx.now whose full startsAt..endsAt interval is outside the new opening window or crosses a closed local day. Daycare: reserved/checked_in on today or later where the new weekday is closed. Hotel: reserved/checked_in where any occupied local day from max(today, checkInDate) through the exclusive checkOutDate falls on a newly configured closed weekday. Date-only hotel/daycare records cannot be evaluated against clock times; this limitation must be explicitly accepted. No appointment, booking status, event or charge is changed automatically.
  4. Replace all seven weekday rows in one transaction after owner permission and tenant parent checks. Validate unique weekdays 0..6, actual HH:MM values, required times on open days, and closesAt > opensAt. Return the updated settings and affected items from that transaction. Tests cover these rules, all denied roles, foreign tenants, interval boundaries, local weekday/time conversion, unchanged bookings and rollback.
  5. Completing the existing card will exceed the 400-line target. Proposed split: keep get/update in T-0044 and ask a human to create a follow-up card for setHours plus its warning response; alternatively explicitly approve a larger PR #202 while retaining all tests. The agent will not edit read-only spec files or create an unapproved task identifier.
- Answer (2026-10-04): user explicitly approved the complete proposal above, including the larger PR with all tests retained. Implementing these approved decisions within T-0044 allowed paths; read-only spec files remain for human correction.

## Q-0054 · C-20: when to show "ส่ง LINE อีกครั้ง", and choosing the paper size
- Status: answered (implemented in T-0252); DTO follow-up open
- Task: T-0252 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-C-20 shows "ส่ง LINE อีกครั้ง" only when the customer has LINE, but 05#dto-Receipt has no LINE flag (bills.get is not implemented yet). The print button says "@page 58mm/80mm/A5 ตาม SP-05" without saying how the size is chosen (SP-05 = human printer test H-13).
- Answer (2026-10-03): user chose in chat. The button shows for a paid bill with a customer (customerName set); bills.sendReceipt refuses other bills and the dispatcher skips customers without LINE. Follow-up: add a customer LINE flag to Receipt so the button can follow 06 exactly. Paper size: a 58 มม. / 80 มม. / A5 select next to "พิมพ์" (print option, not a data field), default 80 มม., remembered per browser (localStorage), driving the @page CSS. Dates use Asia/Bangkok because Receipt carries no branch timezone.

## Q-1005 · T-0053 exceeds the small-PR target
- Status: answered (user approved in chat, 2026-10-04)
- Task: T-0053 · Asked by: codex · Date: 2026-10-04
- Evidence: the three endpoints, four owned DTOs and 13 passing PGlite tests add 512 code lines after formatting. Required scoped reads and transactional writes are present; signed-file/error/rollback and HTTP validation coverage must still be completed before claiming done.
- Proposed split: pets.get + four DTOs first, then pets.create/update depending on the merged read/DTO task. Humans must regenerate split cards/allowed_paths because those generators are read-only.
- Question: approve one larger PR preserving all tests for the existing card, or pause until split cards are available? Implementation is frozen pending the decision; current-snapshot verification can continue.
- Testing: explicit-file Vitest commands plus unchanged full pnpm verify were approved in chat (Q-1002).

- Answer (2026-10-04): user approved one larger original T-0053 PR with all tests retained. Complete signed-file/rollback/HTTP coverage before the final verification and PR.

## Q-0104 · T-0164 stays.noShow: when the server allows it
- Status: answered (user chose in chat, 2026-10-05)
- Task: T-0164 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05 says stays.noShow "ทำได้หลัง 23:59 ของ check_in_date หรือกดเองพร้อมยืนยัน" (03: "หลัง check_in_date"), but the request has no confirm field and 05 lists no error for pressing too early.
- Answer (2026-10-05): allowed once the branch-local date ≥ check_in_date; the screen asks for confirmation before 23:59 of that day. Earlier → `STATUS_NOT_ALLOWED` with details `{ allowedFrom: check_in_date }` (as Q-0097). Like groom.noShow, the booking closes and R-07 forfeits a verified deposit when every child is no-show/cancelled; customer.no_show uses the Q-0097 money line.

## Q-0066 · T-0309 owner.daily_summary: noShows and tomorrowCount
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
- Task: T-0309 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 07 §2 says the summary "รวมตัวเลข DashboardToday", but 05#dto-DashboardToday has no tomorrow count and only grooming no-shows (`groom.byStatus.no_show`); 07 §1 also gives no format for `date` / `salesTotal`.
- Evidence: 07 §1/§2 owner_daily_summary rows, 05#dto-DashboardToday, Q-0053.
- Proposed decision (implemented): numbers are for the job's `localDate` (not ctx.now, so a retry after midnight reports the right day) with the Q-0053 definitions: groomCount = groom.total, staysInHouse = hotel.inHouse, salesTotal = sales.paidTotalSatang via formatTHB auto, noShows = grooming no-shows of the day, tomorrowCount = next day's grooming appointments + hotel check-ins + daycare visits (cancelled excluded), date = formatThaiDate. Sent to every active owner.

## Q-1001 · T-0124: platform-admin notification pipeline is still unsupported
- Status: answered (user decision, 2026-10-05)
- Task: T-0124 · Asked by: agent (codex) · Date: 2026-10-04
- Evidence: Q-0009 and 07 §1.1 already specify platform_admin recipients. The merged recipient_type enum includes platform_admin, but packages/server/src/notify/enqueue.ts rejects every admin.feedback enqueue and Recipient only accepts customer/staff. packages/server/src/notify/dispatch.ts routes every non-customer recipient to deliverToStaff, which loads staff_user rather than platform_admin.
- Required prerequisite: a scoped follow-up owning notify/enqueue.ts, notify/dispatch.ts and their tests to support active platform admins and per-recipient dedupe/email delivery under the already approved Q-0009 contract. These files are outside T-0124 allowed_paths.
- Answer (2026-10-05): user chose to widen T-0124 itself. The user edited `tools/spec-src/build_tasks.py` (feedback.create also owns notify/enqueue.ts, notify/dispatch.ts and their two tests, and depends on INF-NOTIFY-RENDER / T-0320, which shares dispatch.ts); the card is regenerated in `spec-change-q1001-feedback-notify`. The reservation moves from Codex to Claude (issue #195). The same support unblocks `admin.data_request` (T-0067).

## Q-0094 · T-0168 refunds.create: credit reason and deposit status
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0168 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 05#ep-refunds.create says mode credit → credit_ledger + balance and booking.deposit_status refunded/credited, but names no credit_reason, and 03 lists no refunds.create transition for deposit_status.
- Answer (2026-10-04): credit_ledger reason `cancellation_credit` (as R-07), ref_type `refund`. With a bookingId, only a `verified` deposit moves (→ refunded for cash/bank_transfer, → credited for credit, booking_event entity `deposit`); any other deposit status is left as it is and the refund is still recorded.

## Q-0075 · T-0235 bills.void: open bills, earned credit, deposits and errors
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat; the credit balance may go negative after a void (shown on the customer page) rather than blocking the void.
- Task: T-0235 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 05#ep-bills.void covers paid → void only and lists no error codes, while 03 sm-bill also has open → void (no posted payment). It says "credit ที่ใช้/ได้ในบิล → ย้อน" but the deposit credit written at close references the booking, not the bill; it does not say what happens to an applied deposit or to customer.visit_count, nor which code answers an already-void bill.
- Evidence: 05#ep-bills.void, 03 sm-bill / sm-booking / sm-deposit (`applied → verified`), R-13 #6, R-14 #5, Q-0074.
- Proposed decision (implemented): owner only; reason trimmed ≥ 3 (VALIDATION_FAILED). Open bill with posted payments → VALIDATION_FAILED (void the payments first); already void → BILL_NOT_OPEN. Paid → void: commissions reversed (reversed_at), counter/booking redemptions reversed with sessions back (exhausted → active if not expired), packages sold on the bill → void, credit payments returned and `deposit_credit` rows of the bill's bookings taken back — both as credit_ledger `void_reversal` (ref bill), the balance may go below zero; every posted payment → voided with the reason; bookings closed → confirmed, applied deposit → verified (so the next bill can apply it again), bill_id = null; receipt_no kept; audit `bill.void`. visit_count is not decreased.

## Q-1017 · T-0078 C-11: missing labels, favourite photo id, clearing profile fields
- Status: open
- Task: T-0078 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. enum-labels.th.json has no `photo_kind` (profile / before / after / stay) or `record_source` (shop / customer / import), which the photo filter and the vaccine "ที่มา" column show.
  2. "รูปทรงโปรด: เลือกจากคลังรูป" saves `favoriteStylePhotoId`, but `PetDetail.shop` only carries `favoriteStylePhotoUrl`, so the current choice can't be preselected.
  3. `pets.update` = `PetFields.partial()` with non-nullable optional text, so a profile field (breed, colour, microchip…) can't be cleared once set.
- Proposed decision (implemented):
  1. Interim Thai labels in C-11.json (as Q-0117) until a spec change adds both enums to enum-labels.th.json.
  2. The current photo is shown, and the select defaults to "ไม่เปลี่ยน" (the key is left out); picking a photo sends its id. A spec change could add `favoriteStylePhotoId` to PetDetail.shop.
  3. Blank profile fields are left out (unchanged). A spec change could make them nullable in pets.update.

## Q-0112 · T-0292 C-14: departure / in-house card data missing from StayCard
- Status: open
- Task: T-0292 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 06#scr-C-14 loads only stays.today (StayCard[]), but the ออก card asks for the stay's add-ons and the bundle bath (อาบน้ำก่อนกลับ) status, and the พักอยู่ card for pending care tasks ("งานค้าง"). StayCard has only `bundleAppointmentId` and no add-ons or task counts.
- Proposed decision: extend 05#dto-StayCard (or a C-14-only item) with `addonNames: string[]`, `bundleStatus: groom_appointment_status | null` and `pendingTaskCount: int` (pending tasks due by now), filled by stays.today, in a card that owns the contract/service; then C-14 shows them.
- Interim (implemented): C-14 shows every field StayCard has (times, pet, room, intake/agreement/vaccine marks, night x/y) and leaves those three out. The menu entry navigation/C-14.ts is outside the card's paths (Q-0048).

## Q-0096 · T-0067 admin.resolveDataRequest: the access export
- Status: open (user chose in chat, 2026-10-04: T-0067 records the resolution only)
- Task: T-0067 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 05 says `access` → "สร้างไฟล์ JSON ข้อมูลของคนนั้นส่งทาง LINE/อีเมล", but no file_kind, notification template (07 §1) or storage/link rule exists for it, LINE text messages cannot carry a file, and customers have no email of record by default. What goes in the JSON (owner_profile only, or customers/pets/bookings/bills of every shop), where is it stored, and how is it delivered?
- Implemented for now (T-0067): access + done / rejected only sets status, note, resolved_by, resolved_at. delete + done erases owner_profile as 05 says (also last name and nickname as part of the name) + audit `pdpa.erase`; any resolved request → `INVALID_TRANSITION` (data_request has no state machine in 03).
- Needs: a spec change (file_kind / template / delivery) and a follow-up card for the export.

## Q-0105 · T-0157 pets.setStatus: the future-bookings warning and which reminders to cancel
- Status: answered (user chose in chat, 2026-10-05)
- Task: T-0157 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05 says future bookings are not cancelled and the response carries `warnings[]`, but names no warning code/message/data. pet has no organization_id, so "cancel scheduled_job where payload.petId = this" could mean every shop's next_groom_reminder.
- Answer (2026-10-05): when the status becomes deceased/rehomed and the pet has future bookings in this shop (a scheduled groom appointment after now, a reserved stay or daycare visit from today on) → `warnings: [{ code: "FUTURE_BOOKINGS", message: "น้องยังมีใบจองที่ยังไม่ถึงวัน กรุณาตรวจสอบ", data: { bookingIds } }]` on PetDetail; none → no `warnings` key (as Q-0032). Only this shop's pending next_groom_reminder jobs are cancelled (tenantDb); other shops' jobs recompute R-17 at run time and R-17 skips a pet that is not active.

## Q-0100 · T-0117 groom.setItems: which appointment statuses may change items
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0117 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 05#ep-groom.setItems does not say when items may still change.
- Answer (2026-10-04): scheduled, checked_in and in_progress (before the work is done, including after a check-in SIZE_CHANGED warning); done / picked_up / no_show / cancelled → STATUS_NOT_ALLOWED.

## Q-0046 · AD-06: shop name and date range for admin.analytics
- Status: answered (implemented in T-0315)
- Task: T-0315 · Asked by: agent (claude) · Date: 2026-10-03
- Question: 06#scr-AD-06 shows `organization.name` but 05#dto-PilotAnalytics returns only `orgId`; 05#ep-admin.analytics requires `from`/`to` but the 06 table has no date inputs.
- Answer (2026-10-03): user chose in chat. The screen also loads the existing `admin.orgs` list and maps orgId → name ("—" when missing); no API/DTO change. It requests the 7 Bangkok days ending today (to = today Asia/Bangkok, from = to − 6, inclusive per Q-0037) and shows that range under the title.

## Q-0109 · T-0199 C-04: customer level missing from BookingListItem; one status per query
- Status: partly answered (user chose in chat, 2026-10-05) — spec change pending
- Task: T-0199 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) 06#scr-C-04 shows "ลูกค้า: ชื่อ + ระดับ" but 05#dto-BookingListItem has no reliability level. (2) The รอมัดจำ tab needs status awaiting_deposit and deposit_review; bookings.list accepts repeated `status`, but `apps/web/src/lib/api.ts` sends one value per query key.
- Answer (2026-10-05): (1) show the name only for now; spec owner: add `customerReliabilityLevel` (customer.reliability_level) to BookingListItem with a card that changes the contract/service, then C-04 adds the R-09 badge. (2) implemented without touching api.ts: the deposit tab asks once per status (limit 200 each), merges by first_service_at, no paging on that tab. A follow-up could let api.ts send array query values.

## Q-0098 · T-0228 groom.notifyPickup: balance and allowed status
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0228 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 07 `customer.ready_for_pickup` shows "ยอดชำระ {balance}" without saying what it is; 03 has no transition for the pickup notice, so which appointment statuses may send it?
- Answer (2026-10-04): balance = the booking's open bill total − paid; without an open bill, estimated_total − deposit_verified (never below 0), R-31 money. Only a `done` appointment may notify (else STATUS_NOT_ALLOWED); repeats are absorbed by the dedupe `ready_for_pickup:{appointmentId}`.

## Q-0062 · T-0086: enabling the C-38 console menu entry
- Status: answered (2026-10-04)
- Answer (2026-10-04): user confirmed the implemented decision in chat.
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

## Q-0108 · T-0104 / T-0105 need LINE ID token verification from T-0149
- Status: open
- Task: T-0104, T-0105 · Asked by: agent (claude) · Date: 2026-10-05
- Question: auth.staffLine (T-0104) and staffMe.linkLine (T-0105) must verify a LINE ID token against PLATFORM_LINE_LOGIN_CHANNEL_ID, but the verifier (`integrations/line/idtoken.ts` + fake mode) belongs to T-0149, which is not merged (it waits on H-03) and is not in either card's depends_on. Both cards' allowed paths exclude `integrations/line/**`.
- Proposed decision: add T-0149 to the depends_on of T-0104 and T-0105 (task generator / spec owner) and leave both cards until T-0149 is merged. No agent work started on them.

## Q-1006 · T-0039: Playwright is not an allowed dependency of the card
- Status: open
- Task: T-0039 · Asked by: agent (claude) · Date: 2026-10-05
- Question: the card needs `@playwright/test` (playwright.config.ts, `pnpm --filter @app/web exec playwright test`), but it has no *Dependencies* section and its allowed_paths leave out `apps/web/package.json` and `pnpm-lock.yaml`. `@playwright/test` is not installed anywhere in the workspace today (the lockfile only lists it as an optional peer). Adding it would fail `check-task-scope` and golden rule 6.
- Evidence: `docs/tasks/T-0039.md` allowed_paths; 01 §1 names Playwright as the E2E tool. Chromium is already in `~/Library/Caches/ms-playwright`, so no browser download is needed.
- Proposed decision: regenerate T-0039 with `apps/web/package.json` + `pnpm-lock.yaml` in allowed_paths and `@playwright/test` (exact version) under Dependencies. No work started on the card.

## Q-1007 · T-0062 imports.create: storage cannot read the uploaded CSV
- Status: open
- Task: T-0062 · Asked by: agent (claude) · Date: 2026-10-05
- Question: imports.create must parse the uploaded CSV, but `ObjectStorage` (`packages/server/src/integrations/storage/index.ts`, outside the card's allowed_paths) only has presignPut / presignGet / head / delete — there is no way to read the object's bytes on the server. The row-error codes for `import_job.errors[].code` (`{row, column, code, message}`) are also not listed anywhere in 02/04/05.
- Proposed decision: (1) a scoped follow-up (or widening T-0062) adds `getText(key): Promise<string | null>` to ObjectStorage (S3 GetObject + the fake storage); (2) a spec-change lists the row codes, e.g. `REQUIRED`, `INVALID_PHONE` (R-22), `INVALID_ENUM`, `INVALID_DATE`, `INVALID_NUMBER`, `UNKNOWN_COLUMN`, with Thai messages. No work started on the card.

## Q-1012 · T-0134 C-02: size code, the C-02D drawer, and empty-slot prefill
- Status: open
- Task: T-0134 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. The appointment card shows "พันธุ์/ขนาด: pet.breed + size_tier.code", but `AppointmentCard` / `PetSummary` carry no size tier.
  2. "คลิกการ์ด → เปิด C-02D (drawer)", but C-02D (T-0135) only owns `components/c-02d/**`, so it can't mount itself in C-02, and C-02D isn't merged yet.
  3. "คลิกช่องว่าง → เปิด C-03 พร้อมวัน/เวลา/ช่าง", but C-03 doesn't read any query parameters.
  4. Drag-to-reschedule needs a `stationId` the drop target doesn't give.
- Proposed decision (implemented):
  1. Only the breed is shown until `sizeTierCode` is added to AppointmentCard (spec change).
  2. Clicking a card opens the booking (`/console/bookings/{bookingId}`, C-05) for now; T-0135's scope should include `components/c-02/**` so it can swap the link for the drawer.
  3. The click goes to `/console/bookings/new?date=&time=&groomerId=`; a follow-up on C-03 can prefill from those.
  4. The appointment keeps its station; groom.reschedule's R-04 check answers SLOT_TAKEN when it's busy, and the card stays where it was.

## Q-1008 · T-0115 calendar.day: week response, time off / closure shape, hotel counts
- Status: open
- Task: T-0115 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05 gives the response as `CalendarDay` but says "week คืน 7 CalendarDay"; `groomers[].timeOff[]` and `closures[]` only cite a column (`starts_at`); the card says hotel/daycare should return 0 until M5, but stay/daycare_visit are already merged and 05 defines them as counts.
- Proposed decision (implemented): `CalendarDayResponse = CalendarDay | CalendarDay[7]` (the 7 local days from `date`); `timeOff[]` = `TimeOffItem` and `closures[]` = `ClosureItem` (the same row DTOs timeOff.list / closures.list return, so C-02 gets end time and reason for the grey bar); closures limited to scope all/grooming; groomers = active `is_groomer` staff; appointments start in the local day, cancelled left out, no_show kept; `workingHours` = that weekday's row or null; hotel/daycare counted as in dashboard.today (arrivals/departures by date, inHouse = checked_in now, daycare visits not cancelled).

## Q-1024 · T-0201 C-07: "booking ต้องอนุมัติ", the original-slip link, and the menu entry
- Status: open
- Task: T-0201 · Asked by: agent (claude) · Date: 2026-10-06
- Question:
  1. ยืนยัน + อนุมัติจอง shows when the "booking ต้องอนุมัติ", but `SlipItem` carries no booking status or approval flag.
  2. สลิปซ้ำ links to "สลิปเดิม", but there is no slip detail route or endpoint. The original is usually already verified, so it is not in the submitted list.
  3. `shell-console/navigation/C-07.ts` stays `implemented: false` because it is outside the card's allowed paths (Q-0048).
- Proposed decision (implemented):
  1. The button shows for every submitted booking slip. The server applies `approveBooking` only when the booking waits for approval (`approvalDueAt` set), so otherwise it acts as a plain ยืนยัน. Alternative: add `needsApproval` to SlipItem (spec change).
  2. The link is an in-page anchor `#slip-{duplicateOfSlipId}`.
  3. Turn the menu entry on in a follow-up that owns the file. The page works at `/console/slips` and is linked from C-05.

## Q-0099 · T-0160 bookings.decline: the verified deposit and the refund line
- Status: answered (user chose in chat, 2026-10-04)
- Task: T-0160 · Asked by: agent (claude) · Date: 2026-10-04
- Question: 03 says decline → "R-07 shop_cancel (คืนมัดจำเต็ม)" — record the refund at decline time or leave it to refunds.create? 07 `customer.booking_declined` `{refundLine}` has no wording.
- Answer (2026-10-04): at decline, a verified deposit is returned in full: insert refund (mode bank_transfer, amount = R-07 return, reason = the decline reason, created_by = staff) and deposit_status → refunded in the same transaction (the shop transfers and may attach proof later). refundLine = "ร้านจะคืนมัดจำ ฿{amount} เต็มจำนวน" (R-31) when something is returned, else "".

## Q-0048 · Console menu entries: C-* screen cards cannot enable their own menu item
- Status: answered for T-0070; task-generator follow-up open
- Task: T-0070 · Asked by: agent (claude) · Date: 2026-10-03
- Question: T-0070 must show not-yet-built console screens as disabled. Admin screen cards own `shell-admin/navigation/AD-xx.ts` to switch their entry on, but no C-* screen card has a `shell-console/**` path, so a later screen task cannot enable its menu item.
- Answer (2026-10-03): user chose in chat. T-0070 adds one registry file per routed C-* screen, `apps/web/src/components/shell-console/navigation/C-xx.ts` (`implemented: false`), like the admin shell. Follow-up for the task owner: add `apps/web/src/components/shell-console/navigation/<SCREEN-ID>.ts` to every C-* screen card's allowed_paths (tools/spec-src/build_tasks.py) and a step "set implemented: true".
- Notes on T-0070 choices: the menu lists list pages only (detail/form routes with ids, `…/new`, `…/edit` are reached from their list page); C-02D, C-06 and C-46 are a drawer, a dialog and a floating button, not routes. The guard uses the existing `auth.me` pipeline (`withStaff`) because `resolveStaff` is not exported by `@app/server`; the 403 view shows the API's FORBIDDEN message.

## Q-0093 · T-0312: sales report menu enablement is outside card scope
- Status: open
- Task: T-0312 · Asked by: agent (claude) · Date: 2026-10-04
- Evidence: `apps/web/src/components/shell-console/navigation/C-23.ts` has `implemented: false` and leaves enablement to the screen task (Q-0048), but T-0312's allowed_paths do not include it (same situation as Q-0089 for C-25).
- Question: add C-23 to the generator's enable_menu screen set (human edit of `tools/spec-src/build_tasks.py` + regeneration, as in #192) so a follow-up can switch the menu on? The page works at `/console/reports/sales` meanwhile; the menu file is untouched.

## Q-1010 · T-0081 C-31: no staff endpoint to list public holidays; no labels for closure_source
- Status: open
- Task: T-0081 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) "เพิ่มวันหยุดราชการ" must open "dialog เลือกวันจาก public_holiday", but the only endpoint that lists public_holiday is `admin.listHolidays` (platform admin only), so the shop can't see the list. (2) The closures table shows "ที่มา (source)", but enum-labels.th.json has `closure_scope` and no `closure_source` (manual / public_holiday).
- Proposed decision (implemented): (1) for now the dialog takes a year, dates picked by the owner and a scope; `closures.importHolidays` already keeps only the dates that are public holidays of that year. A follow-up could add a staff read endpoint (e.g. `closures.publicHolidays?year=`) so the dialog can list them. (2) The interim labels "ตั้งเอง" / "วันหยุดราชการ" live in C-31.json (same approach as Q-0117) until a spec change adds `closure_source` to enum-labels.th.json.

## Q-0115 · T-0045 branch.setModules: the future-bookings warning
- Status: open
- Task: T-0045 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05 says switching off a module with future bookings is allowed and "ตอบ warnings[] จำนวนใบจองที่ค้าง", but defines no warning code/message/data, and BranchSettings has no warnings field (same gap as Q-1004 for setHours).
- Proposed decision (as Q-1004): BranchSettings + `warnings[]` (always an array); one warning per module switched from on to off that still has bookings with an unfinished item of that module ahead — `{ code: "MODULE_HAS_FUTURE_BOOKINGS", message: "ยังมีใบจองที่ค้างอยู่ {n} ใบ", data: { module, bookingCount } }`. Unfinished = grooming scheduled/checked_in/in_progress ending after now, stays reserved/checked_in checking out today or later, daycare reserved/checked_in from today.
- Interim (implemented): as proposed; nothing is cancelled.

## Q-0090 · T-0038: object storage PR exceeds the small-PR budget
- Status: answered (user approved size exception in chat, 2026-10-05)
- Task: T-0038 · Asked by: agent (claude) · Date: 2026-10-05
- Question: T-0038 changes ~1,030 lines: 318 generated `pnpm-lock.yaml` lines for the card's named `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, ~290 source lines (adapter, files.ts, two endpoints, cleanup job) and ~420 test lines. Ship as one PR or split?
- Answer (2026-10-05): user approved the exception, as for Q-0050. Ship the card as one PR.

## Q-1014 · T-0077 C-10: create/update field sets, address autocomplete
- Status: open
- Task: T-0077 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. C-10 edits every field in one form, but `customers.create` doesn't take birth date, address, emergency contact or deposit exempt, and `customers.update` doesn't take `sourceChannel` / `referralNote`.
  2. ตำบล/อำเภอ should autocomplete from the postal code, but the 10 reference data has only the 77 provinces and no postal-code dataset.
- Proposed decision (implemented):
  1. A new customer is saved with customers.create, then a customers.update right away for the remaining fields (only when any is filled). In edit mode "รู้จักร้านจาก" / "รายละเอียด" are shown read-only. A spec change could add the missing fields to each contract.
  2. ตำบล/แขวง and อำเภอ/เขต are free text and จังหวัด is a select of the 77 provinces until a postal-code dataset is added to 10.

## Q-0111 · T-0274 stays.saveIntake: prefill, and replacing medications / belongings
- Status: open
- Task: T-0274 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) 05 lists "prefill จาก pet_shop_profile + customer.emergency_contact_*" as an effect of the PUT, but every prefilled field is in the request and emergency name/phone are required — is prefill only the screen's job (StayDetail has no prefill data before an intake exists)? (2) medications[] / belongings[] are full lists; stay_medication deletes cascade to care_task (done history included), and belongings carry returned_at.
- Proposed decision: (1) prefill is the C-15 screen's job (it reads pets.get / customers.get); the PUT stores what it receives. (2) the PUT replaces both lists; an unchanged medication (same name, dose, times, instructions) keeps its row and task history, a changed one is replaced; belongings are replaced (intake happens before anything is returned).
- Interim (implemented): as proposed. Also: emergency phone normalised by R-22 (INVALID_PHONE), vet phone stored as typed (05 gives it no rule), complete=false leaves an earlier completed_at alone, photos must be stay_update files, reserved / checked_in only (else STATUS_NOT_ALLOWED).

## Q-0101 · Multi-endpoint API cards exceed the small-PR budget
- Status: answered (user approved in chat, 2026-10-04)
- Tasks: T-0160 (merged, ~1,030 lines), T-0120 (~920) and the multi-endpoint cards of the same batch · Asked by: agent (claude) · Date: 2026-10-04
- Question: cards with two or three endpoints (contract + service + route + integration tests each, plus owned DTOs) land well above 400 changed lines. Split or ship as one PR?
- Answer (2026-10-04): ship each card as one PR, stating the size in the PR description (covers T-0160 retroactively).

## Q-0050 · T-0073: Recharts lockfile exceeds the small-PR budget
- Status: answered (user approved size exception in chat, 2026-10-04)
- Task: T-0073 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: the card explicitly names Recharts; installing it changes package/lockfile by 303 lines, before approximately 123 lines of chart components/tests.
- Proposed decision: approve a size exception for this card; alternatively split dependency installation into a separately authorized card.
- Answer (2026-10-04): user approved the approximately 437-line exception, including 302 generated dependency lockfile lines. Publish this single card with its named dependency.

## Q-0079 · T-0311: upcoming queue is absent from DashboardToday
- Status: answered (user approved in chat, 2026-10-03)
- Task: T-0311 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: 06#scr-C-01 requires upcoming time/pet/temperament/groomer/status; 05#dto-DashboardToday and the merged contract/service have no upcoming queue fields.
- Question: defer the upcoming queue to a follow-up after the API is specified, or expand the spec/API before implementing this section? No response fields are invented.

## Q-0080 · New console screen menu scope
- Status: answered (user approved in chat, 2026-10-03)
- Tasks: T-0311, T-0079, T-0205, T-0254 · Asked by: agent (codex) · Date: 2026-10-03
- Question: approve the same Q-0048 scope expansion for navigation/C-01.ts, C-26.ts, C-22.ts and C-24.ts? These files are absent from each card's allowed_paths. Scope changes must be generated in a separate spec-change PR, as in #148.

## Q-0081 · T-0311: service worker does not relay push to the dashboard
- Status: answered (user approved in chat, 2026-10-03)
- Task: T-0311 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: 06#scr-C-01 requires refreshing on web push; apps/web/public/sw.js currently only shows notifications and opens their URL on click.
- Question: approve extending scope to relay received push events to existing client windows, or defer push refresh to a follow-up? Polling every 60 seconds proceeds within the original card scope.

- Answer (2026-10-03): user approved the proposed choices: defer the absent queue to a specified API follow-up, expand the selected menu scope and relay web push. Claude has merged T-0079 in #162 and T-0254 in #163. Their completed C-26/C-24 pages receive the approved menu scope and enabled entries here; Codex does not redo those cards. T-0311 depends on the already-merged T-0091 so its sw.js follow-up is ordered after the original owner.

## Q-0082 · T-0311: shell test assumes C-01 stays disabled
- Status: answered (user approved in chat, 2026-10-04)
- Task: T-0311 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: console-shell.test.tsx asserts C-01 is disabled, conflicting with the approved implemented menu. The card web suite reports 236 passed and that one failed assertion.
- Proposed decision: use explicit enabled C-01 and disabled C-02 fixtures, retain disabled-menu assertions, and verify the dashboard link/current-page behavior. Approve the shared test file in the separate scope PR; no business assertions are removed.

## Q-0083 · T-0205: economy mode has no merged read API
- Status: answered (user approved in chat, 2026-10-04)
- Task: T-0205 · Asked by: agent (codex) · Date: 2026-10-03
- Evidence: 06#scr-C-22 requires branch_policy.economy_mode, but the LineStatus contract lacks it and no merged read policy endpoint supplies it.
- Question: implement quota/list/copy first and defer economy-mode status until the read API is specified, or expand the spec/API first? No status or response field is invented.

- Answer (2026-10-04): user approved the explicit shared menu fixtures and dashboard current-page coverage (Q-0082), and deferred economy-mode status until the read API exists while retaining quota/list/copy and the policy settings link (Q-0083).

## Q-0116 · T-0048 staffUsers.update: staff photo file kind, the disabled-groomer warning, invited → active
- Status: open
- Task: T-0048 · Asked by: agent (claude) · Date: 2026-10-05
- Question: (1) `photoFileId` → staff_user.photo_file_id, but `file_kind` (02) has no staff/profile kind for people (only pet_profile, logo, …), so the upload cannot be checked/committed. (2) "นัดอนาคตของช่างที่ถูกปิดยังอยู่ — ตอบ warnings[]" names no code/message/data. (3) status allows only active ↔ disabled; may an invited person be disabled (cancel an invite) here?
- Proposed decision: (1) add `staff_photo` to `file_kind` (migration + spec) and commit with it. (2) `{ code: "GROOMER_HAS_FUTURE_APPOINTMENTS", message: "ช่างยังมีนัดที่ค้างอยู่ {n} นัด", data: { appointmentIds } }` for scheduled/checked_in/in_progress appointments ending after now. (3) invited stays invited until staff.inviteAccept; changing an invited person's status → STATUS_NOT_ALLOWED.
- Interim (implemented): (1) photoFileId → VALIDATION_FAILED until answered; (2) and (3) as proposed. role staff in staffUsers.list gets only id/displayName/isGroomer/photoUrl (keys left out, as Q-0032).

## Q-1011 · T-0107 workingHours.set: the warning shape and break rules
- Status: open
- Task: T-0107 · Asked by: agent (claude) · Date: 2026-10-05
- Question: 05 says "ตอบ warnings[] นัดอนาคตที่อยู่นอกเวลาใหม่" but defines no code/message/data (same gap as Q-1004 / Q-0116), and the request table gives no rule for the optional break times.
- Proposed decision (implemented): the response is `StaffUserItem` + optional `warnings[]` (as staffUsers.update, Q-0116), with one warning `{ code: "WORKING_HOURS_AFFECTED", message: "มีนัดของช่างอยู่นอกเวลาทำงานใหม่ {n} นัด", data: { appointmentIds } }`. It covers the staff member's scheduled / checked_in / in_progress appointments at the session branch that end after now and either fall on a day off, start before / end after the new hours, or overlap the break; nothing is moved. Only the session branch's rows are replaced. A break must have both ends and lie inside the working time (`breakStartsAt ≥ startsAt`, `breakEndsAt > breakStartsAt`, `breakEndsAt ≤ endsAt`), otherwise VALIDATION_FAILED.

## Q-1021 · T-0139 C-36: time-off list range, which staff member, and how warnings show
- Status: open
- Task: T-0139 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. `timeOff.list` needs `from` / `to`, but 06#scr-C-36 gives no range.
  2. The วันลา form lists only ช่วงลา and เหตุผล, but `timeOff.create` requires `staffUserId`.
  3. บันทึกตารางงาน → "warnings" has no defined UI.
- Proposed decision (implemented):
  1. The list runs from today (branch-local) to +365 days.
  2. The form adds a พนักงาน select of the non-disabled staff.
  3. Each warning message shows as a toast (same as staffUsers.update on this screen), with the Q-1011 message "มีนัดของช่างอยู่นอกเวลาทำงานใหม่ {n} นัด". timeOff.create's `affected` opens a dialog listing the bookings (or "ไม่มีนัดที่ทับวันลา").
  - The weekly hours are edited per person in a dialog (แก้ตารางงาน) with the same จ.–อา. rows.

## Q-0089 · T-0314: occupancy menu enablement is outside card scope
- Status: answered (scope merged in #192; implemented in T-0314)
- Task: T-0314 · Asked by: agent (codex) · Date: 2026-10-04
- Evidence: `apps/web/src/components/shell-console/navigation/C-25.ts` has `implemented: false` and assigns enablement to the screen task (Q-0048), but T-0314 does not allow this file. Q-0080 authorized other screens, not C-25.
- Question: authorize `navigation/C-25.ts` in a separate spec-change PR, or defer menu enablement to a follow-up? The occupancy page proceeds at its specified URL; the menu file remains untouched pending approval.
- Answer (2026-10-04): user selected option 1, authorize the screen-specific menu path in a separate spec-change PR before enabling the menu in T-0314. The task generator `tools/spec-src/build_tasks.py` is read-only for agents under the repository scope guard; a human must add C-25 to its existing enable_menu screen set and regenerate task outputs, preserving status logs. T-0314 remains draft until that scope PR is merged; no menu or generator file is modified here.
- Follow-up (2026-10-04): the user supplied the one-line C-25 generator edit personally. Its exact patch was packaged on isolated `spec-change-q0089-occupancy-menu`, with only T-0314 and its CSV path count regenerated; drift check passed. The original user edit remains untouched in the implementation worktree. Awaiting full verification and human merge of the separate scope PR before changing navigation.
- Resolution (2026-10-04): human merged #192. T-0314 inherited the generated scope from main, enabled C-25 for owners and added menu/route denial assertions for front_desk and staff. The original user-authored generator edit is retained in a named stash and the merged scope commit; no agent-authored generator edits are included in the implementation PR.

## Q-1002 · Card test commands select the entire server suite under Vitest 5
- Status: answered (user approved in chat, 2026-10-04)
- Task: T-0056 (also affects subsequent service cards) · Asked by: agent (codex) · Date: 2026-10-04
- Evidence: `pnpm --filter @app/server test -- services/photos/list` invokes `vitest run -- services/photos/list` and runs 135 files / 913 tests, rather than the requested endpoint file. Focused `pnpm --filter @app/server exec vitest run test/services/photos` runs exactly the two intended files / 13 tests. Full pnpm verify has already passed all 1,826 tests.
- Proposed execution-only exception: for subsequent cards run each listed endpoint via `pnpm --filter @app/server exec vitest run test/services/<group>/<action>.test.ts`, plus unchanged full `pnpm verify`, conformance and scope checks. No assertions, tests, task definitions, scripts or dependencies are changed.
- Work: T-0056 continues running both literal card commands; ask the user before applying this exception to subsequent cards.

- Answer (2026-10-04): user approved explicit-file Vitest commands plus unchanged full pnpm verify for T-0059, T-0044 and T-0053. Renumbered from Q-0092 to Q-1002 after Claude independently merged Q-0092; the earlier chat references this same test-runner question.

## Q-1019 · Admin service tests fail after 15:00 UTC (real clock vs 12 h admin session)
- Status: open
- Task: none (maintenance; files belong to T-0319 and other admin API cards) · Asked by: agent (claude) · Date: 2026-10-05
- Evidence: 21 tests in `packages/server/test/services/admin/{createOrg,feedback,orgs,supportEnd,supportStart,updateFeedback,updateOrg}.test.ts` get 401 from 15:00 UTC every day, so `pnpm verify` fails. They create the platform_admin session with `createSession(env.db, …, TEST_NOW)` (TEST_NOW = 2026-10-05T03:00:00Z, `test/helpers/setup.ts`); admin sessions last 12 h (`src/auth/session.ts`), but `withAdmin` reads the real clock because these files do not fake `Date`. Reproduced at 15:23 UTC: 7 files / 21 tests failed.
- Proposed fix (test-only, no src or TTL change): pin the clock like `test/services/dashboard/today.test.ts` — `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(TEST_NOW);` at the start of each file's `beforeEach`, `vi.useRealTimers()` in `afterEach`. Verified after 15:00 UTC: `vitest run test/services/admin` 13 files / 69 tests pass; `pnpm verify` passes.
- Question: no card lists all seven files in `allowed_paths` — accept this as one maintenance PR on a non-task branch (CODEOWNERS review), or create a maintenance card for it?

## Q-1018 · T-0085 C-37: drag ordering, status labels, existing service photo
- Status: open
- Task: T-0085 · Asked by: agent (claude) · Date: 2026-10-05
- Question:
  1. ลำดับ is a "drag handle", but there is no drag-and-drop list component and services.update takes one sortOrder at a time.
  2. `service.status` (record_status: active / archived) has no Thai labels in enum-labels.th.json.
  3. `ServiceItem` carries `photoUrl` but not `photoFileId`, so the form can show the current photo but can't resend it.
- Proposed decision (implemented):
  1. ↑ / ↓ buttons swap a service with its neighbour (two services.update calls); a drag handle can replace them later.
  2. Interim labels in C-37.json (ใช้งาน / เก็บแล้ว).
  3. The current photo is shown; `photoFileId` is sent only when a new photo is uploaded.

## Q-1003 · T-0059 exceeds the small-PR target
- Status: answered (user approved in chat, 2026-10-04)
- Task: T-0059 · Asked by: codex · Date: 2026-10-04
- Evidence: the three endpoints, owned DTO/contracts/routes and 16 passing integration tests currently add 436 code lines, before the status log and remaining signed-photo/transaction checks. No unrelated files are included.
- Proposed split: first services.list + ServiceItem, then services.create/update depending on the merged read/DTO task. A human must create/regenerate the split cards and allowed_paths because task/spec generators are read-only.
- Question: approve one larger PR for the existing three-endpoint card, preserving all tests, or pause T-0059 until split cards are available? Implementation is frozen pending that decision; independent reserved tasks can continue.
- Execution decision: the user approved explicit-file Vitest commands plus unchanged full pnpm verify for T-0059/T-0044/T-0053 (Q-1002), 2026-10-04.

- Answer (2026-10-04): user approved one larger T-0059 PR with all tests retained. The earlier chat called this question Q-0093; it was renumbered Q-1003 to avoid the independently merged Claude record.

- Coordination correction (2026-10-04): reserve Codex Q-1001 through Q-1005 in #195; restore Claude T-0112 size question to Q-0092 and leave Claude T-0067 Q-0096 intact. User decisions remain unchanged.
