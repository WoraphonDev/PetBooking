# ADR-006 — ธีมหน้าตา (design tokens + สีสถานะ)

- สถานะ: proposed
- วันที่: 2026-10-02 · ผู้ตัดสินใจ: <ชื่อ>
- เกี่ยวข้อง: task UI-THEME, UI-C-TABLE (StatusBadge) · 01 §1 แถว UI · `apps/web/app/globals.css`
- พรีวิว: https://claude.ai/artifact/M8MFAiqV6FBxc5csGYm8yV (หน้า "ธีม · tokens + components")

## บริบท

T-0001 ติดตั้ง shadcn/ui (style `radix-nova`, baseColor `neutral`) ทำให้ token ใน `globals.css` ยังเป็นค่า default ขาว-ดำ-เทา (`--primary` เกือบดำ)
spec 06 กำหนดเฉพาะฟิลด์/ป้าย/รูปแบบ ไม่ได้กำหนดสี และ UI-C-TABLE ต้องทำ StatusBadge "enum → สี" โดยไม่มีที่มาของสี

## ทางเลือก (ข้อดี/ข้อเสีย/ค่าใช้จ่ายต่อเดือน)

| ทางเลือก | ข้อดี | ข้อเสีย | ค่าใช้จ่าย |
|---|---|---|---|
| A. คง default ของ shadcn | ไม่ต้องทำอะไร | ดูเป็นเครื่องมือภายใน ไม่มีสีสถานะ/ราคา | 0 |
| B. ธีมแนวเว็บจองที่พัก (น้ำเงินสด + การ์ดขาวบนพื้นเทาอ่อน + ราคาสีส้มแดง) — เปลี่ยนเฉพาะ token | ลูกค้าคุ้นกับรูปแบบเว็บจอง, เปลี่ยนที่เดียวมีผลทุก component, ไม่แตะ layout ใน 06 | ต้องเพิ่ม token ที่ shadcn ไม่มี 7 ตัว | 0 |

ใช้เป็นแรงบันดาลใจเท่านั้น — ไม่ใช้โลโก้ ชื่อ หรือรหัสสีแบรนด์ของบริษัทอื่น

## การตัดสินใจ

เลือก **B** — เปลี่ยนเฉพาะ design token และสีสถานะ **ไม่เปลี่ยน layout** (shell/sidebar/โครงหน้าตาม 06 และการ์ด UI-SHELL-* เดิม) · โหมดมืด (`.dark`) อยู่นอก MVP: คงค่าเดิมไว้

### 1. Token ใน `:root` (แทนค่า default)

| token | ค่า | | token | ค่า |
|---|---|---|---|---|
| `--background` | `#F3F5F8` | | `--muted` | `#EEF0F3` |
| `--foreground` | `#1A202C` | | `--muted-foreground` | `#5B6576` |
| `--card` | `#FFFFFF` | | `--accent` | `#E8F0FD` |
| `--card-foreground` | `#1A202C` | | `--accent-foreground` | `#154CB0` |
| `--popover` | `#FFFFFF` | | `--destructive` | `#C62828` |
| `--popover-foreground` | `#1A202C` | | `--border` | `#E3E7ED` |
| `--primary` | `#1B5FD9` | | `--input` | `#C9D1DC` |
| `--primary-foreground` | `#FFFFFF` | | `--ring` | `#1B5FD9` |
| `--secondary` | `#E8F0FD` | | `--radius` | `0.625rem` (10px) |
| `--secondary-foreground` | `#154CB0` | | `--chart-1..5` | `#1B5FD9` `#C2410C` `#157F3D` `#8A4B00` `#5B6576` |

`--sidebar` = `#FFFFFF`, `--sidebar-foreground` = `--foreground`, `--sidebar-primary(-foreground)` = `--primary(-foreground)`, `--sidebar-accent(-foreground)` = `--accent(-foreground)`, `--sidebar-border` = `--border`, `--sidebar-ring` = `--ring`

### 2. Token เพิ่มใหม่ (ประกาศใน `:root` + map ใน `@theme inline` เป็น `--color-<name>`)

| token | ค่า | ใช้กับ |
|---|---|---|
| `--success` / `--success-soft` | `#157F3D` / `#E5F5EA` | สำเร็จ ยืนยันแล้ว ยอดรับเงิน |
| `--warning` / `--warning-soft` | `#8A4B00` / `#FFF4DB` | กำลังทำ รอตรวจ |
| `--price` / `--price-soft` | `#C2410C` / `#FDECE4` | ตัวเลขราคา/มัดจำที่ลูกค้าต้องจ่าย, ค้างมัดจำ |
| `--destructive-soft` | `#FDECEC` | พื้นป้ายสถานะ danger |

ข้อความทุกคู่ (ตัวอักษรบนพื้น) มี contrast ≥ 4.5:1

### 3. StatusBadge — tone ต่อค่า enum

| tone | พื้น / ตัวอักษร |
|---|---|
| `info` | `--accent` / `--accent-foreground` |
| `progress` | `--warning-soft` / `--warning` |
| `success` | `--success-soft` / `--success` |
| `attention` | `--price-soft` / `--price` |
| `danger` | `--destructive-soft` / `--destructive` |
| `neutral` | `--muted` / `--muted-foreground` |

| enum | info | progress | success | attention | danger | neutral |
|---|---|---|---|---|---|---|
| `staff_status` | invited | | active | | | disabled |
| `pet_status` | | | active | | | deceased, rehomed |
| `vaccine_status` | | pending_review | verified | | rejected | |
| `line_channel_status` | | pending | active | | error | |
| `room_unit_status` | | maintenance | active | | | archived |
| `housekeeping_status` | | dirty | clean | | | |
| `booking_status` | | deposit_review, awaiting_approval | confirmed | awaiting_deposit | | cancelled, expired, closed |
| `deposit_status` | | submitted | verified | pending | rejected | not_required, refunded, credited, forfeited, applied |
| `groom_status` | scheduled, checked_in | in_progress | done | | no_show | picked_up, cancelled |
| `stay_status` | reserved | checked_in | | | no_show | checked_out, cancelled |
| `daycare_status` | reserved | checked_in | | | no_show | checked_out, cancelled |
| `care_task_status` | | pending | done | | | skipped |
| `slip_status` | | submitted | verified | | rejected | |
| `bill_status` | open | | paid | | | void |
| `customer_package_status` | | | active | | | exhausted, expired, void |
| `report_card_status` | | pending_review | sent | | | draft |
| `org_status` | pilot | | active | | suspended | |

ป้ายข้อความมาจาก `enumLabel()` (enum-labels.th.json) เสมอ — สีอย่างเดียวห้ามเป็นตัวบอกสถานะ

### 4. รูปทรง

มุมโค้งตาม `--radius` (ปุ่ม/ช่องกรอก 10px, การ์ด 12px = `rounded-xl`), การ์ดใช้เงา `shadow-sm` บนพื้น `--background` · ปุ่มหลักสูง ≥ 44px บนแท็บเล็ต (06)

## ผลที่ตามมา (สิ่งที่ต้องแก้ใน spec/env/tasks)

- task ใหม่ **UI-THEME** (allowed: `apps/web/app/globals.css`) ทำ §1–2
- **UI-C-TABLE** depends on UI-THEME และอ่าน ADR นี้ — StatusBadge ใช้ตาราง §3
- ไม่แก้ 06, ไม่แก้ layout/shell, ไม่เพิ่ม dependency
