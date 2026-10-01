@AGENTS.md

## Claude Code — เพิ่มเติม

- เริ่มทุก session ด้วย: อ่านการ์ด `docs/tasks/<ID>.md` ที่ได้รับมอบหมาย → อ่านเฉพาะ anchor ใน *Read first* (ค้นด้วย `grep -n 'id="ep-bookings.create"' docs/spec/05-api.md` แล้วอ่านช่วงนั้น) — อย่าโหลดไฟล์ spec ทั้งไฟล์
- การ์ดขนาด L: ใช้ plan mode เขียนแผน (ไฟล์ที่จะแตะต้องอยู่ใน `allowed_paths`) ก่อนลงมือ
- ห้ามใช้ subagent/เครื่องมือแก้ไฟล์นอก `allowed_paths` ของการ์ด แม้จะ "ช่วยแก้ให้" ก็ตาม — เขียนลง `docs/questions.md` แทน
- ก่อนบอกว่าเสร็จ: รันคำสั่งใน *Done when* ทุกบรรทัด + `pnpm verify` แล้วแปะผลสรุปใน PR
- ถ้า context ใกล้เต็ม: อัปเดต *Status log* ในการ์ดว่าทำถึงไหน (ไฟล์ที่เสร็จ/ที่เหลือ) ก่อน เพื่อให้ session ถัดไปทำต่อได้
