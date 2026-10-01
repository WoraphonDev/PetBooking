# packages/domain — business rules (pure)

- 1 rule (R-xx) = 1 ไฟล์ตาม `docs/spec/vectors/rule-modules.json`; signature คัดลอกจาก 04 ตรงตัว (ชื่อ export, ชื่อฟิลด์ input/output)
- **Pure เท่านั้น:** ไม่มี I/O, ไม่ import จาก package อื่นในโปรเจกต์, ไม่เรียก `Date.now()`/`new Date()` ที่ไม่มี argument, ไม่ใช้ `Math.random()`
- เงิน/น้ำหนัก/เปอร์เซ็นต์เป็น integer เสมอ — ปัดเศษตามที่ 04 ระบุ (floor / ปัดครึ่งขึ้น) ด้วย integer math ห้ามใช้ `toFixed` กับเงิน
- Test: `test/vectors.test.ts` (มีมาแล้ว ห้ามแก้) โหลด vectors ทุกไฟล์อัตโนมัติ — export ที่ยังไม่มีจะเป็น todo; export ที่มีแล้วต้องผ่านทุกเคส
- `pnpm --filter @app/domain vectors:status [R-xx]` ดูว่า rule ไหนเสร็จ/ค้าง
- dependency ที่อนุญาต: `date-fns`, `@date-fns/tz` เท่านั้น
