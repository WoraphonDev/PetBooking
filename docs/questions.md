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
