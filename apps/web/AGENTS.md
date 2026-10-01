# apps/web — Next.js

- `page.tsx` มีได้เฉพาะ route ใน `docs/spec/06-screens.md`; `route.ts` มีได้เฉพาะ path ใน `05` — `scripts/check-spec-conformance.mjs` ตรวจ (เกิน = fail)
- route.ts = 1 บรรทัดต่อ method เรียก wrapper `withStaff|withCustomer|withAdmin|withPublic` จาก `@app/server/http` — ไม่มี logic
- หน้าจอ: ทุกฟิลด์ในตาราง 06 ต้องมีครบ (ป้ายไทย, แหล่งข้อมูล = ฟิลด์ใน DTO ที่โหลด, รูปแบบ money/date/time/phone/weight ผ่าน `src/lib/format.ts`), ปุ่มแสดงตามเงื่อนไขในตาราง
- ข้อความไทยทั้งหมดใน `src/i18n/messages/th/<SCREEN-ID>.json`; ป้าย enum ผ่าน `enumLabel()` — ห้าม hardcode ข้อความไทยใน .tsx
- ห้ามคำนวณยอดเงินฝั่ง client (แสดงค่าจาก server); เงินที่ผู้ใช้กรอกเป็นบาท → แปลงเป็นสตางค์ใน `MoneyInput`
- เรียก API ผ่าน `src/lib/api.ts` (`useApiQuery` / `useApiMutation`) เท่านั้น
- ความกว้างขั้นต่ำ: LIFF/Staff 360px, Console 1024px; ปุ่มบนแท็บเล็ต ≥ 44px
