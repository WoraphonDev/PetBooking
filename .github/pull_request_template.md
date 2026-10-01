## Task
- Card: `docs/tasks/T-____.md` · Branch: `t-____-<slug>` · Agent: claude / codex / human
- Depends on (merged): T-____, T-____

## What changed (ต่อไฟล์ — ต้องอยู่ใน allowed_paths ทั้งหมด)
-

## Spec sections implemented (anchor)
- `docs/spec/05-api.md#ep-…` / `06-screens.md#scr-…` / `04-business-rules.md#R-…`

## Tests
- [ ] ทุกคำสั่งใน *Done when* ของการ์ดผ่าน (แปะผลสรุป)
- [ ] `pnpm verify` ผ่าน
- [ ] server: happy path + ทุก error code ของ endpoint + role ที่ห้าม + org อื่น → NOT_FOUND
- [ ] ui: ทุกฟิลด์/ปุ่มในตาราง 06 ของหน้าจอนี้มีครบ
- [ ] ไม่มี `.skip` / `.only` / `todo` ใหม่, ไม่ได้แก้ vectors

## Questions raised
- Q-____ (docs/questions.md) หรือ "ไม่มี"

## Reviewer checklist (มนุษย์ — บังคับเมื่อการ์ด human_review: true)
- [ ] เงิน/สิทธิ์/tenant ถูกต้องตาม 01 §10
- [ ] transaction เดียวครอบ state + event + audit + outbox
- [ ] ไม่มี secret/PII ใน log
