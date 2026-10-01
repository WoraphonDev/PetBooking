# PJ-8 AI-Dev Kit — PROGRESS / CHECKPOINT

> ไฟล์นี้คือจุดกลับมาทำต่อ (resume point) ของการสร้าง kit — อยู่ที่ `tools/KIT_PROGRESS.md` ใน zip และ `claude/ai-dev-kit/PROGRESS.md` ในโปรเจกต์. session ใหม่: อ่านไฟล์นี้ก่อน แล้วทำต่อจาก "งานที่เหลือ" ข้อแรกที่ยังไม่ ✅

## Checkpoint 1 — 2026-10-01 (Asia/Bangkok)

### วิธีกู้คืน (session ใหม่)
1. ถ้ามี zip `pj8-ai-dev-kit-checkpoint-N.zip` แนบมา → `unzip` ไปที่ `/home/claude/starter`
2. ถ้าไม่มี zip → อ่าน source จากโปรเจกต์ PJ-8 path `claude/ai-dev-kit/spec-src/*` (project_read) แล้วเขียนลง `/home/claude/starter/tools/spec-src/`
   + อ่าน `claude/ai-dev-kit/handwritten-bundle.md` → `python3 tools/kit_bundle.py unpack <ไฟล์> /home/claude/starter` (ไฟล์เขียนมือทั้งหมด เช่น 01-architecture, ADR, AGENTS/CLAUDE, scripts, CI, package skeleton)
   (kit_bundle.py อยู่ใน bundle เอง — ถ้ายังไม่มี ให้ตัดส่วน `===== FILE: tools/kit_bundle.py =====` ออกมาเขียนเองก่อน)
3. rebuild ทั้งหมด (ต้องผ่านทุกขั้น):
   ```bash
   cd /home/claude/starter/tools/spec-src
   python3 stories.py                       # → stories.json (106 stories, 7 milestones)
   python3 gen.py ../..                     # → packages/db/src/schema/*.ts + docs/spec/02-data-model.md + tools/_custom_constraints.sql
   python3 build_spec.py ../..              # validate + render docs/spec/03..09 + vectors  (ต้องจบด้วย VALIDATION OK)
   rm -rf ../../docs/tasks && python3 build_tasks.py ../..   # → docs/tasks/*.md + README/tasks.csv/tasks.json (ต้อง conflicts 0)
   cd ../.. && npm i -g pnpm@10.34.6 && pnpm install          # → pnpm-lock.yaml
   # ถ้ากู้จาก bundle (ไม่มี migrations): สร้างใหม่แล้วใส่ custom SQL
   cd packages/db && pnpm exec drizzle-kit generate --name init && pnpm exec drizzle-kit generate --custom --name constraints \
     && cp ../../tools/_custom_constraints.sql migrations/0001_constraints.sql && cd ../..
   pnpm format && pnpm verify && python3 tools/spec-src/check_drift.py   # ต้องเขียวทั้งหมด
   ```

### ✅ เสร็จแล้ว
- [x] Data model ระดับ field: 72 ตาราง · 936 คอลัมน์ · 72 enum (`model.py` → Drizzle schema + 02-data-model.md, มี anchor `tbl-<table>`)
- [x] Business rules 31 ข้อ + reference impl + test vectors 227 เคส (`rules_spec.py`, `rules_impl.py` → 04 + vectors/*.json, anchor `R-xx`)
- [x] State machines 16 ตัว (เพิ่ม `line_channel`; ตัด `booking_status.held` ที่ไม่ได้ใช้) → 03 (anchor `sm-<name>`)
- [x] API contract 214 endpoints · 64 DTOs · 77 error codes (`api_endpoints.py`, `api_errors_dtos.py` → 05, anchor `ep-<key>`, `dto-<Name>`)
- [x] Notifications 38 templates + 9 jobs (เพิ่ม job_type `cleanup_uncommitted_files`) → 07
- [x] **Screen spec ระดับ field 78 หน้า** (`screens_spec.py` → 06, anchor `scr-<id>`) — ทุกหน้ามี route, สิทธิ์, API ที่โหลด, ทุกฟิลด์ (โหมด แสดง/กรอก/แก้/ตัวกรอง · ป้าย · แหล่งข้อมูล table.column · UI/รูปแบบ · กติกา) และปุ่ม → endpoint
  - เพิ่ม C-02D drawer รายละเอียดนัดกรูม (เช็คอิน/เริ่ม/เสร็จ/แจ้งรับ/รับแล้ว/no-show/ยกเลิก/ค่าเพิ่มหน้างาน)
  - ทุก endpoint ถูกใช้โดยอย่างน้อย 1 หน้าจอ (ยกเว้น infra) · ทุก story มีหน้าจอ ยกเว้น US-13-01/02/09 (infra)
- [x] Permissions (08), traceability (09), enum-labels.th.json
- [x] Task cards 332 ใบ (agent 316 / human 16) แบ่ง M0–M6, ไม่มี path ชนกันระหว่าง task ที่ทำขนานกัน
  - การ์ด API ฝังตาราง contract (request/query/response/errors/state/audit/notify/effects) ในตัว
  - การ์ด Screen ฝังตาราง field ทั้งหมด + ปุ่ม (รอบต่อยอด ext-Mx ฝังเฉพาะปุ่มใหม่)
  - milestone ของ endpoint/screen = story แรกที่ระบุ · งานฐาน (domain/infra/UI-C/shell) ถูกดึงมาทำก่อนเมื่อมีงานต้องใช้ · LIFF ไม่เริ่มก่อน M3

## Checkpoint 2 — 2026-10-01
- [x] ตรวจ schema ด้วยการรันจริง (`tools/spec-src/selftest/`): tsc strict ผ่าน · drizzle-kit 0.31 generate 452 statements · PGlite migrate + custom SQL · 72 ตาราง / 43 check / 4 exclusion · db-proof 21/21 ok
- [x] cross-check rule ด้วย TS อิสระ (vectors-proof) 57/57 — เจอและแก้ reference impl ที่ไม่ตรง spec 3 จุด:
  R-07 ส่ง `minutesBefore` (ไม่ใช่ hoursBefore) · R-31 น้ำหนักปัดครึ่งขึ้นด้วย integer math (Python round เป็น banker's) · R-04 staff walk-in ตัด slot เมื่อ `t + step ≤ now`
- [x] C-03 ช่องห้อง: ไม่เลือก = ระบบจัดห้องให้ (R-10) — `stay.room_unit_id` NOT NULL ถูกต้อง

## Checkpoint 3 — 2026-10-01
- [x] build_spec ออก JSON catalogs: errors / endpoints / screens / rule-modules / reference-data + `10-reference-data.md`; TOC ทุกไฟล์ลิงก์ anchor จริง
- [x] เพิ่มหน้าจอ P-02 `/legal/[doc]` (เอกสารกฎหมาย) → 79 หน้าจอ · 333 การ์ด
- [x] Task ID คงที่: `tools/spec-src/task_ids.json` (key → ID ถาวร, ลบแล้ว = retired ไม่ reuse)
- [x] เขียนมือ: `docs/spec/01-architecture.md` (§1–§11), ADR-000..005, `CLAUDE.md` (+ `@AGENTS.md`), `.claude/settings.json` (deny rules), AGENTS.md/CLAUDE.md ราย package (db/domain/contracts/server/web), `docs/questions.md`, `tools/kit_bundle.py`

## Checkpoint 4 — 2026-10-01
- [x] Root workspace: package.json (pnpm 10.34.6, `pnpm verify`), pnpm-workspace.yaml, tsconfig.base.json, biome.json (Biome 2.5), .nvmrc 22, .gitignore, .editorconfig, .env.example
- [x] `@app/db`: drizzle.config.ts, migrations `0000_init` + `0001_constraints` (+ meta), `src/test-db.ts` (PGlite + btree_gist, migrate ครั้งเดียวแล้ว clone), `scripts/check-doc.ts` (schema ⇄ 02 — พิสูจน์แล้วว่าจับความต่างได้), `test/migrations.test.ts` 5/5
- [x] `@app/domain`: vectors harness (`test/vectors.test.ts` — 42 exports todo; พิสูจน์แล้ว impl ถูกผ่าน/ผิดตก), `vectors:status`
- [x] Guards: `scripts/check-task-scope.mjs` (พิสูจน์ใน git จำลอง), `scripts/check-spec-conformance.mjs` (route/page/contract เกิน = fail), `tools/spec-src/check_drift.py` (docs ⇄ spec-src, การ์ดแก้ได้เฉพาะ Status log)
- [x] spec: แก้ route ชนกันของ Next.js (`[id]` → `[customerId]` ใน C-10), L-03 ใช้ path เต็ม, build_spec ตรวจ route param conflict อัตโนมัติ; endpoints.json มีรายชื่อ DTO
- [x] `.github/workflows/ci.yml` (scope → drift → verify → ห้าม .skip/.only), PR template, CODEOWNERS
- [x] **`pnpm verify` เขียวทั้งเส้น** บน starter เปล่า (lint · typecheck · check:doc · tests · conformance)

### ⏳ งานที่เหลือ (ทำตามลำดับ)
1. [x] (ย้ายไป checkpoint 2)
2. [x] (เสร็จใน checkpoint 3–4) ไฟล์ repo ที่เขียนมือ: CLAUDE.md (`@AGENTS.md`), `.claude/rules/*`, `docs/spec/01-architecture.md`, `docs/decisions/ADR-001..005`, `docs/questions.md`, `scripts/check-task-scope.mjs`, `scripts/check-spec-conformance.mjs`, `.github/workflows/ci.yml`, PR template, CODEOWNERS, package skeleton (package.json/tsconfig/AGENTS.md ต่อ package), `packages/db` check:doc script (ต้อง ignore บรรทัด `<a id=…>`)
3. [ ] เอกสารสรุปภาษาไทยสำหรับผู้ใช้: `09_AI_Dev_Plan.md` (วิธีใช้ Claude Code/Codex กับ kit, ลำดับ milestone, gate) + `10_Screen_Field_Spec_Summary.md`
4. [ ] zip kit สุดท้าย + ส่งไฟล์ + project_write เอกสารสรุป

### การตัดสินใจที่ทำใน checkpoint นี้ (อย่าย้อน)
- `booking_status` ไม่มี `held` — ใบจองออนไลน์ที่ต้องมัดจำเริ่มที่ `awaiting_deposit` + `hold_expires_at`
- regex อ้าง rule ใช้ `\bR-\d\d\b` (กัน `ADR-001` ถูกอ่านเป็น R-00)
- API ที่แตกเป็น 2 รอบ (เช่น bookings.create grooming → hotel+daycare): รอบ 2 ไม่แตะ route.ts
- chunk endpoint ง่าย ๆ ≤ 3 ตัว/การ์ด, ชื่อ chunk ไม่ซ้ำข้าม milestone
