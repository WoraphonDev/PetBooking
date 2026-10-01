# ADR-001 — กลยุทธ์ LINE Provider (userId ข้ามร้าน)

- สถานะ: **proposed** — ตัดสินใน task H-03 (SP-01) ก่อนเริ่ม M3
- เกี่ยวข้อง: US-01-01, US-02-06, US-13-02, ตาราง `line_channel`, `line_identity`, 01 §7

## บริบท
- LINE userId ไม่ใช่ค่าสากล: **ต่างกันตาม provider** — OA (Messaging API channel) และ LINE Login channel (ที่มี LIFF) ต้องอยู่ provider เดียวกันจึงได้ userId เดียวกัน
- OA ที่ผูกกับ provider แล้วย้าย provider ไม่ได้ — การเลือกผิดแก้ทีหลังยาก
- Phase 3 (OTA/Marketplace) อยากรู้ว่าลูกค้าคนเดียวกันใช้หลายร้าน — ต้องใช้ provider เดียวกันหรือ LINE Login ของแพลตฟอร์มเอง

## ทางเลือก
| | A. ร้านละ provider (ร้านเป็นเจ้าของทุกอย่าง) | B. provider กลางของแพลตฟอร์ม (OA ของร้านผูกเข้ามา) |
|---|---|---|
| userId ข้ามร้าน | ต่างกัน → ลูกค้าคนเดียว = คนละ identity ต่อร้าน | เหมือนกันทุกร้าน |
| ความเป็นเจ้าของ OA | ร้านคุมเต็ม | ร้านต้องให้แพลตฟอร์มเป็น admin ของ provider/channel; ย้ายออกยาก |
| ความเสี่ยงทางกฎหมาย/ความไว้ใจ | ต่ำ | ต้องเขียน DPA/ข้อตกลงชัด |
| ค่าใช้จ่าย | ฿0 (OA แพ็กฟรี 300 ข้อความ/เดือน ต่อร้าน) | ฿0 เท่ากัน (โควตาเป็นของแต่ละ OA) |
| Data model | รองรับแล้ว (`line_identity.provider_id`) | รองรับแล้ว |

## ข้อเสนอ
MVP ใช้ **A** (ร้านเป็นเจ้าของ OA + provider ของร้าน) — data model เก็บ `provider_id` ทุกแถวจึงไม่ปิดทาง B; Phase 3 ใช้ LINE Login ของแพลตฟอร์มเองสำหรับเว็บ OTA แล้ว "ผูกบัญชี" กับ identity รายร้านโดยความยินยอมลูกค้า

## สิ่งที่ต้องทดลองก่อนเปลี่ยนสถานะเป็น accepted (H-03)
1. สร้าง OA ทดสอบ 2 ตัว (provider เดียวกัน 1 คู่, ต่าง provider 1 คู่) + LINE Login channel + LIFF
2. เปิด LIFF แล้วดู `sub` จาก ID token เทียบกับ `source.userId` ใน webhook — บันทึกผลในหัวข้อ "ผลทดลอง"
3. ยืนยันขั้นตอนที่ร้านต้องทำเองใน LINE Official Account Manager / LINE Developers (ทำเป็นคู่มือ onboarding)

## ผลทดลอง
(กรอกโดยมนุษย์)
