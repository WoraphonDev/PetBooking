# ADR-004 — Object storage (รูปน้อง, สลิป, ลายเซ็น, backup)

- สถานะ: **proposed** — ตัดสินใน task H-02
- ปริมาณประมาณการนำร่อง: รูปย่อ ~200–400 KB × ~50 รูป/วัน/ร้าน → < 1 GB/เดือน/ร้าน

## ทางเลือก
| | ข้อดี | ข้อเสีย |
|---|---|---|
| A. S3-compatible ที่ไม่คิดค่า egress และมี free tier (เช่น Cloudflare R2) | presigned URL มาตรฐาน S3, ไม่มีค่า egress | ต้องมีบัญชี/บัตร |
| B. ดิสก์บน VPS + endpoint ของเราเอง | ฟรี | ต้องเขียน presign เอง, backup ยาก, ไม่ตรงกับ adapter S3 |

## ข้อเสนอ
**A** — bucket **private** เท่านั้น, CORS อนุญาต PUT จาก `APP_BASE_URL`, lifecycle ลบ `tmp/` > 2 วัน · โค้ดใช้ `@aws-sdk/client-s3` (endpoint/credentials จาก env ตาม 01 §6)
