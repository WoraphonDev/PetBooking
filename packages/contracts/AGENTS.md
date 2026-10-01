# packages/contracts — zod schemas (สัญญา API)

- 1 endpoint = 1 ไฟล์ `src/endpoints/<key>.ts` (เช่น `bookings.create.ts`) export `<Key>Request`, `<Key>Query` (ถ้ามี), `<Key>Response` — ชื่อฟิลด์/ชนิด/บังคับ ตามตารางใน 05 ทีละแถว
- DTO ที่ใช้ร่วม: `src/dto/<kebab>.ts` — task ที่เป็น "เจ้าของ DTO" ตามการ์ดเท่านั้นที่สร้าง/แก้ไฟล์นั้น
- ไม่มี barrel file (`index.ts` ที่ re-export ทุกอย่าง) — import ตรงจากไฟล์
- ชนิดร่วม: `Money` (int), `IsoInstant`, `LocalDate`, `LocalTime`, `Uuid`, `Paged(item)` จาก `src/common.ts` — ห้ามประกาศซ้ำ
- enum/error code มาจาก `docs/spec/vectors/*.json` เท่านั้น (test เทียบให้)
- ห้าม import จาก `@app/server`, `@app/db` (ยกเว้น devDependency ใน test เทียบ enum)
