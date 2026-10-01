# packages/db — Drizzle schema + migrations

- `src/schema/*.ts` ต้องตรงกับ `docs/spec/02-data-model.md` ทุกตาราง/คอลัมน์/ชนิด/nullable/default — ตรวจด้วย `pnpm --filter @app/db check:doc`
- เปลี่ยน schema ได้เฉพาะการ์ดที่ระบุไว้ (หรือ PR `spec-change`): แก้ 02 ผ่าน `tools/spec-src/model.py` ก่อน → แก้ schema → `pnpm --filter @app/db generate` → commit SQL ที่ได้ **ห้ามแก้ SQL ที่ generate มือ**
- Constraint ที่ Drizzle เขียนไม่ได้ (exclusion, trigger, FK วนกัน) อยู่ใน custom migration (`pnpm --filter @app/db generate:custom <name>`) — ห้ามแก้ migration ที่ merge แล้ว ให้เพิ่มไฟล์ใหม่
- ห้าม `drizzle-kit push` ทุกกรณี · migrations ที่ merge แล้ว = read-only (CI ตรวจ)
- คอลัมน์ `date` ใช้ `mode: "string"`; เงินเป็น `integer` ชื่อ `*_satang`; ทุกตารางธุรกิจมี `organization_id`
- Test DB: `createTestDb()` = PGlite + btree_gist + migrations ทั้งหมดตามลำดับ (รวม custom) — ใช้ตัวเดียวกันทุก package
