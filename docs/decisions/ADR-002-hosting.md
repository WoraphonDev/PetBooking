# ADR-002 — Hosting, database, cron, monitoring

- สถานะ: **proposed** — ตัดสินใน task H-02 (M0)
- เงื่อนไข: ค่าใช้จ่ายต่ำที่สุดใน MVP, Postgres ต้องมี `btree_gist`, ต้องรัน Next.js standalone, ต้องมี cron เรียก `/api/cron/tick`
- ⚠️ ราคา/เงื่อนไขฟรีของผู้ให้บริการเปลี่ยนบ่อย — ตรวจหน้าราคาจริงก่อนตัดสินใจ

## ทางเลือก
| | A. VPS เล็ก 1 เครื่อง + Docker Compose | B. PaaS ฟรี/ถูก + Managed Postgres ฟรี |
|---|---|---|
| ส่วนประกอบ | Next.js standalone + Postgres 16 + Caddy (HTTPS) ในเครื่องเดียว | Web บน PaaS, DB บนบริการ Postgres free tier |
| ค่าใช้จ่ายโดยประมาณ | ค่า VPS รายเดือนคงที่ (ระดับเครื่องเล็กสุด) | ฿0 ในช่วงแรก แต่มีเพดาน (sleep/ชั่วโมง/ขนาด DB) |
| ข้อดี | ราคาคงที่ คุมได้เอง ไม่มี cold start | ไม่ต้องดูแลเครื่อง |
| ข้อเสีย | ต้องดูแล OS/backup เอง | ข้อจำกัด free tier, บาง PaaS ฟรีห้ามใช้เชิงพาณิชย์, cold start |

ข้อควรระวัง: แพ็กฟรีของบาง PaaS (เช่น Vercel Hobby) ห้ามใช้เชิงพาณิชย์ — ร้านนำร่องที่ใช้จริงถือเป็นเชิงพาณิชย์

## ข้อเสนอ
**A** สำหรับ staging+production (2 compose project บนเครื่องเดียวได้ในช่วงนำร่อง) · cron ใช้บริการ cron ภายนอกแบบฟรีเรียก `POST /api/cron/tick` ทุก 2 นาที พร้อม `x-cron-secret` · backup `pg_dump` รายวันขึ้น object storage (ADR-004) เก็บ 14 วัน · uptime monitor ฟรีเรียก `/api/health` ทุก 5 นาที · error reporting: log JSON + (ถ้าต้องการ) บริการ free tier ผ่าน `ERROR_REPORT_DSN`

## ผลที่ตามมา
- task INF-DEPLOY ทำ Dockerfile + compose + runbook ตามที่ตัดสิน
- secrets ตาม 01 §6 ใส่ใน server/GitHub Actions โดยมนุษย์
