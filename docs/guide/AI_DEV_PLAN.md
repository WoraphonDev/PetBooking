# 09 — แผนพัฒนาด้วย AI (Claude Code + Codex) ระดับ Field

> PJ-8 Pet Hotel & Grooming Cafe · เวอร์ชัน 1.0 · 2026-10-01
> ต่อจาก 07 (MVP & Phase Plan) และ 08 (User Stories 106 เรื่อง) · ส่งมอบเป็น **repo starter kit** (`pj8-ai-dev-kit-*.zip`) ที่ push ขึ้น GitHub แล้วสั่ง agent ทำงานได้ทันที

## 1. สรุปสำหรับผู้บริหาร

- โจทย์คือให้ AI เขียนโค้ดทั้งหมดโดยไม่ "มั่ว" วิธีที่ใช้คือ **AI ไม่ต้องตัดสินใจเรื่องธุรกิจเองเลย** การตัดสินใจทุกเรื่องเขียนไว้ใน spec ระดับ field แล้ว และงานถูกแตกเป็นการ์ดเล็ก ๆ 1 การ์ด = 1 PR ที่มีรายชื่อไฟล์ที่แก้ได้ และมีเทสต์ตัดสินว่าเสร็จจริงหรือยัง
- ขนาดงาน: **333 การ์ด** (agent 317 · มนุษย์ 16) แบ่ง 7 milestone (M0–M6) ปล่อยร้านนำร่องได้ 3 รอบ (Release A/B/C)
- spec ไม่ได้เป็นแค่เอกสาร แต่ **รันและตรวจได้จริง** schema ผ่าน migrate บน Postgres (PGlite), constraint กันจองซ้อนทำงานจริง, กฎธุรกิจถูกเขียนสองภาษาแยกกันแล้วได้ผลตรงกัน 57/57 เคส และ `pnpm verify` ผ่านทุกขั้นบน starter เปล่า
- ค่าใช้จ่าย MVP: ไม่มีบริการเสียเงินใน spec (LINE OA แพ็กฟรี, Web Push ฟรี, ไม่มี SMS/slip API/payment gateway) ที่ต้องจ่ายจริงมีแค่ hosting ตาม ADR-002 ซึ่งมนุษย์ตัดสินใจ

## 2. ทำไมแผนนี้กัน AI มั่วได้: ป้องกัน 7 ชั้น

| ชั้น | กันปัญหาอะไร | อยู่ที่ไหน |
|---|---|---|
| 1. Spec-as-code | AI เดา field/กฎ/ข้อความเอง | `tools/spec-src/*.py` → generate `docs/spec/02–10` และตรวจ cross-reference อัตโนมัติ (อ้าง `table.column` ผิดตัวเดียว build ล้ม) |
| 2. การ์ดเล็ก + `allowed_paths` | AI แก้ไฟล์เกินขอบเขต ชนกับงานอื่น | `docs/tasks/T-xxxx.md` · CI `check-task-scope.mjs` (พิสูจน์แล้วว่าจับได้) |
| 3. ชื่อไฟล์/ฟังก์ชันแบบกลไก | AI ตั้งชื่อ/วางไฟล์ไม่เหมือนกัน | 01 §2: endpoint key → route / contract / service / test path |
| 4. ข้อมูลอ้างอิงฝังในการ์ด | AI อ่าน spec ผิดส่วน | การ์ด API ฝังตาราง contract, การ์ดหน้าจอฝังตารางฟิลด์ทั้งหน้า |
| 5. Tests define done | "เสร็จ" แบบไม่จริง | vectors 227 เคส (กฎธุรกิจ), integration test บน Postgres จริง (PGlite), component test ตรวจทุกป้ายฟิลด์ |
| 6. CI guards | ทางลัด / ของเกิน spec | spec drift, schema ⇄ 02 (`check:doc`), route/page/contract เกิน spec = fail, ห้าม `.skip/.only` |
| 7. มนุษย์ที่จุดเสี่ยง | เงิน สิทธิ์ tenant | 45 การ์ด `human_review: true` + gate ท้าย milestone + CODEOWNERS |

## 3. ของในชุด (starter kit)

```
AGENTS.md / CLAUDE.md          กติกาทองของ agent (Codex อ่าน AGENTS.md, Claude Code อ่าน CLAUDE.md → @AGENTS.md)
.claude/settings.json          ห้าม agent แก้ spec/CI/scripts, ห้าม drizzle push, force push, อ่าน .env
docs/spec/01-architecture.md   stack, layout, naming, data rules, request flow, env/secrets, LINE, security (เขียนมือ)
docs/spec/02…10                spec ระดับ field (generate — ห้ามแก้มือ)
docs/spec/vectors/*.json       test vectors 42 ไฟล์ + catalogs (errors, endpoints, screens, permissions, state machines, reference data)
docs/tasks/                    333 การ์ด + README (ลำดับ/wave) + tasks.csv/json
docs/decisions/ADR-001…005     เรื่องที่มนุษย์ต้องตัดสิน (LINE provider, hosting, email, storage, web push)
docs/questions.md              ช่องทางเดียวที่ agent ถามเมื่อ spec ไม่ชัด
packages/db                    Drizzle schema 72 ตาราง + migrations + test DB + check:doc (พร้อมใช้)
packages/domain                harness ตรวจ vectors อัตโนมัติ (42 exports รอ implement)
packages/contracts|server, apps/web   มีแค่ AGENTS.md — agent สร้างตามการ์ด M0
scripts/                       check-task-scope, check-spec-conformance
tools/spec-src/                ต้นฉบับ spec (Python) + check_drift + selftest
.github/                       CI, PR template, CODEOWNERS
```

## 4. Spec ที่ agent ใช้ (ระดับ field ทุกชั้น)

| เอกสาร | เนื้อหา | ขนาด |
|---|---|---|
| 02 Data model | ทุกตาราง/คอลัมน์: ชนิด, null, default, FK, index, check, enum | 72 ตาราง · 936 คอลัมน์ · 72 enum |
| 03 State machines | สถานะที่ถูกต้องและ transition ที่อนุญาตพร้อม trigger | 16 machines |
| 04 Business rules | signature TypeScript + อัลกอริทึม + vectors | 31 rules · 42 exports · 227 เคส |
| 05 API | ทุก endpoint: request field → `table.column`, response DTO, error codes, state, audit, notify, ผลที่ต้องเกิด | 214 endpoints · 64 DTOs · 77 error codes |
| 06 Screens | ทุกหน้า: ฟิลด์ (โหมด/ป้าย/แหล่งข้อมูล/UI/กติกา) + ปุ่ม → endpoint | 79 หน้า · 780 ฟิลด์ · 171 ปุ่ม (ดูเอกสาร 10) |
| 07 Notifications & jobs | ข้อความ ช่องทาง ตัวแปร dedupe + งานตั้งเวลา | 38 templates · 9 jobs |
| 08 Permissions | สิทธิ์ราย endpoint (owner / front desk / staff) | |
| 09 Traceability | story → หน้าจอ / API / rule / ตาราง | 106 stories |
| 10 Reference data | วัคซีน ขนาดมาตรฐาน ค่าเริ่มต้นร้าน แม่แบบข้อความ เอกสารกฎหมาย | |

## 5. หน้าตาของการ์ด 1 ใบ (ตัวอย่าง T-0118 · API groom.checkIn)

```yaml
id: T-0118 · key: API-groom.checkIn · milestone: M2 · lane: api · size: L · wave: 3
depends_on: [T-0007, T-0035, T-0038, T-0112, T-0051]
allowed_paths:
  - packages/contracts/src/endpoints/groom.checkIn.ts
  - packages/server/src/services/groom/checkIn.ts
  - packages/server/test/services/groom/checkIn.test.ts
  - apps/web/app/api/v1/staff/groom-appointments/[appointmentId]/check-in/route.ts
```

ในการ์ดมี: Read first (anchor ที่ต้องอ่าน) · Deliverables (ชื่อ export ตรงตัว) · **Contract** (ตาราง request field, maps to, validation, errors, state, effects) · **Test cases ที่ต้องมี** (happy path, `CONSENT_REQUIRED`, `STATUS_NOT_ALLOWED`, `VALIDATION_FAILED`, role staff → FORBIDDEN, org อื่น → NOT_FOUND, transition ผิด → INVALID_TRANSITION, effect ทีละข้อ) · Done when (คำสั่งที่ต้องเขียว) · Status log (agent บันทึกความคืบหน้า กลับมาทำต่อได้)

## 6. แผนตาม milestone

| Milestone | เป้าหมาย | การ์ด agent | มนุษย์ | waves | ทำขนานได้สูงสุด/wave | ต้องมีคน review | ปล่อย |
|---|---|---|---|---|---|---|---|
| M0 | รากฐาน (walking skeleton) | 33 | 4 | 7 | 8 | 7 | |
| M1 | ร้านใส่ข้อมูลได้ | 58 | 2 | 5 | 20 | 3 | |
| M2 | ลงคิวกรูมแทนสมุด | 58 | 5 | 5 | 23 | 5 | **Release A** |
| M3 | ลูกค้าจองกรูมเองใน LINE + มัดจำ | 70 | 1 | 5 | 25 | 16 | |
| M4 | ปิดบิล ค่ามือ หลังบริการ | 45 | 2 | 5 | 17 | 10 | **Release B** |
| M5 | Pet Hotel & Daycare | 40 | 1 | 4 | 19 | 4 | |
| M6 | รายงาน + พร้อมนำร่องเต็มรูปแบบ | 13 | 1 | 3 | 7 | 0 | **Release C** |
| **รวม** | | **317** | **16** | 34 | | **45** | |

- **wave** = ระดับที่ทำพร้อมกันได้ภายใน milestone (การ์ด wave เดียวกันไม่แตะไฟล์เดียวกัน ระบบตรวจแล้วว่าการชนกันของไฟล์ = 0)
- ขนาดการ์ด agent: S 105 · M 138 · L 73 (เป้า < 400 บรรทัดต่อ PR)
- milestone ถัดไปเริ่มได้เมื่อ gate ของ milestone ก่อนหน้าผ่าน (H-GATE-Mx: demo + ตรวจคุณภาพ / UAT ร้านนำร่องสำหรับ Release)

### งานของมนุษย์ 16 ใบ (ทำให้ทันก่อนการ์ดที่รออยู่)

| ID | งาน | ก่อน |
|---|---|---|
| H-01 | ตั้ง GitHub repo (รวมไฟล์ซ่อน) + pre-push hook + labels + (ถ้ามี Pro) branch protection + ติดตั้ง Claude Code/Codex | ทุกอย่าง |
| H-02 | ตัดสิน ADR-002/003/004 (hosting, email, storage) + สร้างบัญชี + ใส่ secrets | deploy, email, upload |
| H-03 | SP-01 ทดลอง LINE provider → ADR-001 | งาน LINE ใน M3 |
| H-05 | ร่าง Privacy Notice / Terms / DPA / ข้อความยินยอม (ให้ที่ปรึกษากฎหมายตรวจ) | M1 |
| H-07 | LINE Login channel ของแพลตฟอร์ม (สำหรับพนักงาน) | Staff app M2 |
| H-08 / H-09 / H-13 | SP-02 สลิปจริง ≥ 6 ธนาคาร · SP-04 Web Push บนเครื่องจริง · SP-05 พิมพ์ใบเสร็จ 58/80 มม. | M2–M4 |
| H-10 | ชุด onboarding ร้านนำร่อง | Release A |
| H-04, H-06, H-11, H-12, H-14, H-15, H-16 | gate ท้าย milestone / UAT | milestone ถัดไป |

## 7. วิธีสั่งงาน agent (ทำซ้ำทุกการ์ด)

1. เลือกการ์ดจาก `docs/tasks/README.md` ที่ `depends_on` merge ครบแล้ว (เริ่ม wave เล็กสุดก่อน)
2. สร้าง branch `t-0118-groom-checkin` (ใช้ git worktree แยกโฟลเดอร์ถ้าจะรันหลาย agent พร้อมกัน)
3. วาง prompt นี้ให้ Claude Code หรือ Codex:

```text
ทำการ์ด docs/tasks/T-0118.md ให้เสร็จตาม AGENTS.md
- อ่านการ์ดทั้งใบ และอ่านเฉพาะ anchor ใน "Read first"
- แก้ได้เฉพาะไฟล์ใน allowed_paths; ถ้าต้องแตะไฟล์อื่นหรือ spec ไม่ชัด ให้เขียน docs/questions.md แล้วหยุดส่วนนั้น
- เขียนเทสต์ตาม "Test cases ที่ต้องมี" ก่อน แล้วค่อย implement
- รันทุกคำสั่งใน "Done when" + pnpm verify จนเขียว แล้วบันทึก Status log ในการ์ด
- เปิด PR ด้วย .github/pull_request_template.md
```

4. CI ตรวจ scope → drift → verify; ถ้าการ์ด `human_review: true` ต้องมีคนอ่านตาม checklist ใน PR template ก่อน merge
5. ถ้า agent ถามใน `docs/questions.md` ให้มนุษย์ตอบ ถ้าคำตอบเปลี่ยน spec ให้ทำตามข้อ 9

**ใช้ Claude Code กับ Codex คู่กัน:** ทั้งคู่อ่าน `AGENTS.md` (Claude Code ผ่าน `CLAUDE.md` ที่ import `@AGENTS.md`) จึงทำตามกติกาเดียวกัน แนะนำให้แบ่งตาม lane เช่น Claude Code ทำ api/ui ที่ต้องอ่านหลายไฟล์ ส่วน Codex ทำ domain rules (มี vectors เป็นกรรมการ) แล้วให้อีกตัว review PR ของอีกตัวได้ (label `agent:claude` / `agent:codex`)

## 8. ทำงานขนานเท่าไรดี

- เริ่มที่ **3–5 agent พร้อมกัน** ต่อคนคุม 1 คน (คอขวดจริงคือคน review ไม่ใช่ agent)
- ต่อ wave: แจกการ์ดที่ไม่มี `depends_on` ค้าง → รอ merge ให้ครบ wave → wave ถัดไป
- หลีกเลี่ยงการรันการ์ด L หลายใบที่แตะ service เดียวกันพร้อมกันแม้ไม่ชนไฟล์ เพราะ review ยากกว่า
- ทุก PR rebase บน main ก่อน merge; `pnpm-lock.yaml` อนุญาตเฉพาะการ์ดที่ระบุไว้ ชนแล้วให้ regenerate ด้วย `pnpm install`

## 9. เมื่อ spec ต้องเปลี่ยน (เกิดแน่นอน)

1. แก้ `tools/spec-src/*.py` เท่านั้น (ไม่แก้ `docs/spec` มือ) → รัน `gen.py` / `build_spec.py` / `build_tasks.py`
2. build ตรวจ reference ทั้งหมดอีกรอบ (ตาราง/คอลัมน์/rule/DTO/endpoint/หน้าจอ/route param ชนกัน)
3. **ID การ์ดคงที่** (`task_ids.json`): การ์ดเดิมได้ ID เดิม การ์ดใหม่ได้เลขถัดไป การ์ดที่ถูกลบจะ retired ไม่ reuse
4. ถ้ากระทบ schema: แก้ schema TS ให้ตรง 02 (`check:doc`) → `pnpm --filter @app/db generate` → commit migration ใหม่ (migration เก่าห้ามแก้)
5. เปิด PR label `spec-change` ให้ CODEOWNERS อนุมัติ; CI `check_drift.py` ยืนยันว่า docs ตรงกับ source

## 10. ผลการตรวจก่อนส่งมอบ

| ตรวจ | ผล |
|---|---|
| cross-reference spec ทั้งชุด (build_spec) | ผ่าน — แก้ไป 9 จุด เช่น คอลัมน์อ้างผิด, enum `booking_status.held` ที่ไม่มีใครใช้, state machine `line_channel` ที่ขาด, job `cleanup_uncommitted_files` ที่ไม่อยู่ใน enum |
| ความครอบคลุม | ทุก endpoint มีหน้าจอเรียก, ทุก story มีหน้าจอ ยกเว้น 3 เรื่องที่เป็น infra (deploy, data model, monitoring) |
| Drizzle schema | `tsc --strict` ผ่าน · drizzle-kit generate 452 statements · migrate บน PGlite + custom SQL สำเร็จ |
| DB constraints (21 เคส) | กันช่าง/โต๊ะ/ห้อง/น้องจองซ้อนได้จริง (`23P01`), check วันพัก, ตาราง append-only แก้/ลบไม่ได้, FK บิล |
| กฎธุรกิจเขียนแยก 2 ภาษา | TypeScript ตรงกับ Python reference 57/57 — **จับได้ 3 จุดที่ reference ไม่ตรง spec แล้วแก้แล้ว**: R-07 ใช้นาที (`minutesBefore`), R-31 ปัดน้ำหนักครึ่งขึ้น (Python ปัดแบบ banker's), R-04 walk-in จองช่วงเวลาปัจจุบันได้ |
| Guard scripts | task scope / spec conformance / drift / check:doc — ลองทำผิดแล้วทุกตัวจับได้ |
| `pnpm verify` บน starter เปล่า | เขียวทั้งเส้น (lint · typecheck · check:doc · tests 5 ผ่าน + 42 todo · conformance) |
| Next.js route | แก้ dynamic segment ชื่อชนกัน (`[id]` vs `[customerId]`) ที่จะทำให้ build ล้ม และเพิ่มการตรวจอัตโนมัติ |

## 11. ความเสี่ยงที่ยังเหลือและวิธีรับมือ

| ความเสี่ยง | รับมือ |
|---|---|
| ADR-001 (LINE provider) ยังไม่ตัดสิน | data model เก็บ `provider_id` ไว้ทุกแถวจึงไม่ปิดทางเลือก · H-03 ต้องเสร็จก่อน M3 |
| เวอร์ชันไลบรารีใหม่กว่าที่ agent รู้จัก (Next 16, zod 4, Vitest 5) | การ์ด scaffold ให้ pin เวอร์ชัน · agent ต้องอ่านเอกสารของเวอร์ชันนั้นเมื่อไม่แน่ใจ · CI ตัดสิน |
| Node 22 หมดอายุ 30 เม.ย. 2027 | วางแผนอัปเกรด Node 24 LTS ก่อน Release C (ADR ใหม่) |
| หน้าตา UI ยังไม่มี mockup | field spec ครบแล้ว หน้าตาใช้ shadcn เริ่มต้น · ทำ design แยกได้ภายหลังโดยไม่แตะ logic |
| agent ทำ "ผ่านเทสต์แต่ผิดเจตนา" | การ์ดเงิน/สิทธิ์/tenant บังคับคน review · E2E ต่อ milestone · gate UAT ก่อนปล่อยร้าน |
| คนเป็นคอขวด review | จำกัด agent ขนาน 3–5 ตัว · PR เล็ก · review checklist ใน template |

## 12. เริ่มพรุ่งนี้ได้เลย

1. แตก zip → copy ด้วย `cp -R <kit>/. <repo>/` (รวมไฟล์ซ่อน `.github/` `.gitignore`) → `git config core.hooksPath scripts/hooks` → push เป็น private repo (H-01) → ถ้ามี GitHub Pro ตั้ง branch protection ให้ต้องผ่าน `ci / verify`
2. ทำ H-02 และ H-03 คู่ขนาน
3. เปิด `docs/tasks/README.md` → แจก M0 wave 2 (T-0001 web, T-0002 contracts, T-0003 db client, T-0005/T-0008/T-0009/T-0012/T-0014 domain rules) ให้ agent 3–5 ตัว
4. ทุกเย็น: merge PR ที่เขียว + ตอบ `docs/questions.md`
