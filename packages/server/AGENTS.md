# packages/server — services, repo, auth, http, notify, jobs, integrations

- Service 1 ไฟล์ต่อ endpoint: `src/services/<group>/<action>.ts` export `<camelGroup><PascalAction>(ctx, input)` — รับ input ที่ zod parse แล้ว คืน object ตาม `<Key>Response`
- ทุก service ที่เขียนข้อมูล: `withTx(ctx, async (tx) => …)` ครั้งเดียว — state transition (`state.ts`), `booking_event`, `audit_log` (R-27), `enqueueNotification`, `scheduleJob` อยู่ใน tx เดียวกัน
- เข้าถึงข้อมูลผ่าน `tenantDb(ctx, tx)` เท่านั้น — ห้าม `db.select().from(x)` ตรง ๆ กับตารางที่มี `organization_id`
- โยน `new AppError("CODE", details?)` ด้วยรหัสจาก 05 §1 เท่านั้น; constraint error → `mapPgError`
- เวลา: `ctx.now` · กฎธุรกิจ: เรียก `@app/domain` (ห้ามเขียน logic ซ้ำใน service)
- Integration (LINE/S3/SMTP/WebPush) ผ่าน interface + fake ใน test — ห้ามเรียกเครือข่ายจริงใน test
- Test: PGlite จริง (`setupTestDb()`), ครอบคลุมทุก error code ของ endpoint, role ที่ห้าม, org อื่น → NOT_FOUND
- ห้าม log ค่า secret/token/รหัสผ่าน/ID token/เบอร์เต็ม
