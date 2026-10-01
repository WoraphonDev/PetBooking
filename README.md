# PJ-8 Platform — Pet Grooming · Hotel · Daycare (MVP)

ระบบ SaaS สำหรับร้านกรูมมิ่ง/โรงแรมสัตว์เลี้ยงในไทย: console หน้าร้าน + staff app (PWA) + ลูกค้าจองผ่าน LINE OA ของร้าน (LIFF)
Repo นี้ออกแบบให้ **AI coding agent (Claude Code / Codex) เขียนโค้ดตามการ์ดงาน** โดยมีมนุษย์คุม spec, review และ gate

## เริ่มต้น (มนุษย์)
1. อ่าน `docs/guide/AI_DEV_PLAN.md` (แผนทั้งหมด) และ `docs/tasks/README.md` (ลำดับการ์ด)
2. ทำการ์ดมนุษย์ H-01…H-03 ก่อน (repo, ADR hosting/email/storage, LINE provider)
   - copy kit เข้า repo ด้วย `cp -R <kit>/. <repo>/` เพื่อให้ไฟล์ซ่อน (`.github/`, `.gitignore`, `.claude/`, `.nvmrc`) ไปด้วย — Finder ไม่แสดงไฟล์เหล่านี้
   - เปิด hook กัน push ขึ้น main: `git config core.hooksPath scripts/hooks`
3. แจกการ์ด `T-xxxx` ให้ agent ทีละ wave — prompt ตัวอย่างอยู่ใน AI_DEV_PLAN §7

## สำหรับ agent
อ่าน `AGENTS.md` (Claude Code: `CLAUDE.md`) ก่อนทำอะไรทั้งสิ้น แล้วทำเฉพาะการ์ดที่ได้รับ

## โครงสร้าง
| path | คืออะไร | ใครแก้ |
|---|---|---|
| `docs/guide/AI_DEV_PLAN.md` | แผนพัฒนาด้วย AI (ภาษาไทย, ฉบับ 2026-10-01) | มนุษย์ |
| `docs/spec/01-architecture.md` | สถาปัตยกรรม กติกาข้อมูล naming | มนุษย์ (spec-change) |
| `docs/spec/02…10`, `docs/spec/vectors/` | spec ระดับ field + test vectors (generate) | generate จาก `tools/spec-src` เท่านั้น |
| `docs/tasks/` | 333 การ์ดงาน (generate) — agent เขียนได้เฉพาะ *Status log* | generate |
| `docs/decisions/` | ADR | มนุษย์ |
| `docs/questions.md` | คำถามจาก agent | agent เพิ่ม · มนุษย์ตอบ |
| `packages/*`, `apps/web` | โค้ด | agent ตามการ์ด |
| `scripts/`, `.github/`, `.claude/`, `tools/` | guardrails / CI / ต้นฉบับ spec | มนุษย์ |

## คำสั่ง
```bash
pnpm install                     # Node 22 · pnpm 10
pnpm verify                      # lint · typecheck · check:doc · tests · spec conformance
python3 tools/spec-src/check_drift.py                 # docs ตรงกับต้นฉบับ spec
TASK_ID=T-0001 node scripts/check-task-scope.mjs      # ไฟล์ที่แก้อยู่ใน allowed_paths
pnpm --filter @app/domain vectors:status              # rule ไหนเสร็จแล้ว
```

## แก้ spec
แก้ `tools/spec-src/*.py` → `python3 gen.py ../.. && python3 build_spec.py ../.. && python3 build_tasks.py ../..` (ใน `tools/spec-src`) → PR label `spec-change` (รายละเอียด AI_DEV_PLAN §9)
