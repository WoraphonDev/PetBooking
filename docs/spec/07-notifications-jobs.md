# 07 — Notifications & Scheduled Jobs

> ข้อความทุกชิ้นถูกสร้างเป็นแถว `notification` (status queued) **ใน transaction เดียวกับเหตุการณ์** (outbox) แล้ว dispatcher ส่งหลัง commit + `cron.tick` เก็บตกแถว queued ที่ค้าง > 1 นาที
> ลูกค้า: ผ่าน LINE OA ของร้านเท่านั้น (R-19) และนับโควตาตาม R-18 · พนักงาน: Web Push (VAPID, ฟรี) · อีเมล: เฉพาะ invite/reset/สรุปเจ้าของ (ใช้ SMTP ฟรีโควตา เช่น Gmail SMTP / Resend free tier — ตัดสินใจใน ADR-003)
> ข้อความใช้ Flex Message แบบเรียบ (ข้อความ + ปุ่มลิงก์ LIFF) — text ด้านล่างคือเนื้อหาหลัก ตัวแปรในวงเล็บปีกกา

## 1. Templates

| key | ผู้รับ | ช่องทาง | class (R-18) | economy mode | trigger | dedupe key | ตัวแปร | ข้อความ | Stories |
|---|---|---|---|---|---|---|---|---|---|
| `customer.booking_received` | customer | line_reply|line_push | essential | send | liff.createBooking (awaiting_deposit/awaiting_approval) | `booking_received:{bookingId}` | shopName, bookingNo, summary, depositAmount, holdExpiresTime, bookingUrl | ได้รับการจอง {bookingNo} แล้ว 🐾<br>{summary}<br>{depositLine}<br>ดูรายละเอียด: {bookingUrl} | US-11-03, US-11-07 |
| `customer.booking_confirmed` | customer | line_reply|line_push | essential | send | booking → confirmed | `booking_confirmed:{bookingId}` | bookingNo, summary, dateTime, shopName, mapUrl, bookingUrl | ยืนยันการจอง {bookingNo} ✅<br>{summary}<br>📅 {dateTime}<br>แผนที่: {mapUrl} | US-11-03, US-05-05, US-05-04 |
| `customer.booking_declined` | customer | line_push | essential | send | bookings.decline | `booking_declined:{bookingId}` | bookingNo, reason, refundLine | ขออภัย ร้านไม่สามารถรับการจอง {bookingNo} ได้<br>เหตุผล: {reason}<br>{refundLine} | US-05-05 |
| `customer.booking_cancelled` | customer | line_push | essential | send | bookings.cancel (โดยร้าน) | `booking_cancelled:{bookingId}` | bookingNo, reason, moneyLine | การจอง {bookingNo} ถูกยกเลิก<br>{reason}<br>{moneyLine} | US-05-08, US-07-04 |
| `customer.booking_rescheduled` | customer | line_push | essential | send | groom.reschedule (notifyCustomer) | `booking_rescheduled:{appointmentId}:{startsAt}` | petName, oldDateTime, newDateTime | นัดของ{petName}ถูกเลื่อน<br>จาก {oldDateTime}<br>เป็น {newDateTime} | US-05-08 |
| `customer.deposit_confirmed` | customer | line_push | essential | send | slips.verify / bookings.recordDeposit | `deposit_confirmed:{bookingId}` | bookingNo, amount | ได้รับมัดจำ {amount} สำหรับ {bookingNo} แล้ว ขอบคุณค่ะ | US-07-02, US-11-07 |
| `customer.slip_rejected` | customer | line_push | essential | send | slips.reject | `slip_rejected:{slipId}` | bookingNo, reason, newDeadline, payUrl | สลิปของ {bookingNo} ยังไม่ผ่านการตรวจ: {reason}<br>กรุณาส่งใหม่ภายใน {newDeadline}<br>{payUrl} | US-07-02 |
| `customer.hold_expired` | customer | line_push | helpful | send | job expire_hold | `hold_expired:{bookingId}` | bookingNo, bookAgainUrl | หมดเวลาชำระมัดจำ {bookingNo} คิวถูกปล่อยแล้ว<br>จองใหม่: {bookAgainUrl} | US-05-02 |
| `customer.reminder_24h` | customer | line_push | helpful | skip | job reminder_24h | `reminder_24h:{entityId}` | petName, dateTime, service, bookingUrl | พรุ่งนี้ {dateTime} มีนัด{service}ของ{petName} 🐶<br>เลื่อน/ยกเลิก: {bookingUrl} | US-07-06 |
| `customer.no_show` | customer | line_push | helpful | skip | groom.noShow / stays.noShow | `no_show:{entityId}` | petName, moneyLine, bookAgainUrl | วันนี้ไม่พบ{petName}ตามนัด {moneyLine}<br>นัดใหม่ได้ที่ {bookAgainUrl} | US-07-07 |
| `customer.ready_for_pickup` | customer | line_push | helpful | send | groom.notifyPickup | `ready_for_pickup:{appointmentId}` | petName, reportCardUrl, balance | {petName}อาบน้ำตัดขนเสร็จแล้ว มารับได้เลยค่ะ ✨<br>{reportCardLine}<br>ยอดชำระ {balance} | US-05-09 |
| `customer.report_card` | customer | line_push | helpful | send | report_card → sent (ถ้ายังไม่ได้ส่ง ready_for_pickup จะรวมข้อความ) | `report_card:{reportCardId}` | petName, reportCardUrl | Report card ของ{petName} 📋<br>{reportCardUrl} | US-10-01, US-10-02 |
| `customer.stay_checked_in` | customer | line_push | helpful | skip | stays.checkIn | `stay_checked_in:{stayId}` | petName, roomCode, updatesUrl | {petName}เช็คอินเรียบร้อย ห้อง {roomCode}<br>ติดตามรูปน้องได้ที่ {updatesUrl} | US-06-10 |
| `customer.stay_update` | customer | line_push | helpful | skip | stays.postUpdate | `stay_update:{stayId}:{localDate}` | petName, updatesUrl | อัปเดตวันนี้ของ{petName} 📸 {updatesUrl} | US-06-10 |
| `customer.receipt` | customer | line_push | helpful | skip | bills.close / bills.sendReceipt | `receipt:{billId}:{n}` | receiptNo, total, receiptUrl | ใบเสร็จ {receiptNo} ยอด {total}<br>{receiptUrl} | US-08-05 |
| `customer.balance_link` | customer | line_push | essential | send | bookings.balanceLink | `balance_link:{billId}:{amount}` | amount, payUrl | ยอดคงเหลือ {amount} ชำระผ่าน PromptPay: {payUrl} | US-07-08 |
| `customer.vaccine_rejected` | customer | line_push | helpful | send | vaccinations.reject | `vaccine_rejected:{vaccinationId}` | petName, vaccineName, reason, petUrl | หลักฐานวัคซีน {vaccineName} ของ{petName}ยังไม่ผ่าน: {reason}<br>ส่งใหม่: {petUrl} | US-03-05 |
| `customer.link_approved` | customer | line_push | helpful | send | linkRequests.approve | `link_approved:{requestId}` | shopName | ร้าน{shopName}เชื่อมบัญชี LINE กับประวัติเดิมของคุณแล้ว ✅ | US-11-01 |
| `customer.next_groom_reminder` | customer | line_push | marketing | skip | job next_groom_reminder | `next_groom:{petId}:{dueDate}` | petName, dueDate, bookUrl | ครบรอบอาบน้ำตัดขนของ{petName}แล้ว ({dueDate}) 🛁<br>จองคิว: {bookUrl} | US-10-04 |
| `staff.new_booking` | front_desk+owner | web_push | - | - | liff.createBooking | `new_booking:{bookingId}` | bookingNo, customerName, summary | จองใหม่ {bookingNo} — {customerName}: {summary} | US-13-05 |
| `staff.slip_submitted` | front_desk+owner | web_push | - | - | liff.uploadSlip / liff.payUploadSlip | `slip_submitted:{slipId}` | bookingNo, amount, duplicateFlag | สลิปใหม่ {bookingNo} {amount} {duplicateFlag} | US-07-02 |
| `staff.approval_overdue` | front_desk+owner | web_push | - | - | job approval_overdue | `approval_overdue:{bookingId}:{n}` | bookingNo, waitedMinutes | ⏰ {bookingNo} รออนุมัติมา {waitedMinutes} นาที | US-05-05 |
| `staff.booking_cancelled` | front_desk+owner | web_push | - | - | liff.cancel | `staff_booking_cancelled:{bookingId}` | bookingNo, customerName, isLate | ลูกค้ายกเลิก {bookingNo} ({customerName}) {isLate} | US-11-08 |
| `staff.booking_rescheduled` | front_desk+owner+groomer | web_push | - | - | liff.reschedule | `staff_rescheduled:{appointmentId}:{startsAt}` | petName, newDateTime | ลูกค้าเลื่อนนัด {petName} เป็น {newDateTime} | US-11-08 |
| `staff.groom_done` | front_desk | web_push | - | - | groom.finish | `groom_done:{appointmentId}` | petName, groomerName | {petName} เสร็จแล้ว ({groomerName}) — กดแจ้งลูกค้ามารับ | US-09-04, US-05-09 |
| `staff.report_card_review` | front_desk | web_push | - | - | reportCards.submit (pending_review) | `rc_review:{reportCardId}` | petName | Report card ของ {petName} รอตรวจ | US-10-01 |
| `staff.link_request` | front_desk+owner | web_push | - | - | liff.register (เบอร์ซ้ำ) | `link_request:{requestId}` | lineName, phone | {lineName} ขอเชื่อม LINE กับลูกค้าเบอร์ {phone} — ตรวจสอบ | US-11-01 |
| `staff.vaccine_review` | front_desk | web_push | - | - | liff.addVaccination | `vaccine_review:{vaccinationId}` | petName | มีหลักฐานวัคซีนของ {petName} รอตรวจ | US-06-05 |
| `staff.care_task_overdue` | staff (ทุกคนที่ active ในสาขา) | web_push | - | - | job care_task_overdue_scan | `care_overdue:{taskId}` | title, petName, roomCode | ⚠️ เลยเวลา: {title} — {petName} ห้อง {roomCode} | US-06-09, US-09-04 |
| `staff.low_rating` | owner | web_push | - | - | liff.rate (≤ 3 ดาว) | `low_rating:{reportCardId}` | petName, rating, feedback | ลูกค้าให้ {rating} ดาว ({petName}): {feedback} | US-10-03 |
| `staff.invite` | ผู้ถูกเชิญ | email | - | - | staffUsers.invite | `invite:{inviteId}` | shopName, inviteUrl | คุณได้รับเชิญเข้าร่วมร้าน {shopName} — {inviteUrl} (หมดอายุใน 7 วัน) | US-01-04 |
| `staff.password_reset` | พนักงาน | email | - | - | auth.resetRequest | `pwreset:{resetId}` | resetUrl | ตั้งรหัสผ่านใหม่: {resetUrl} (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้ | US-01-02 |
| `owner.daily_summary` | owner | web_push|email | - | - | job owner_daily_summary | `daily_summary:{branchId}:{localDate}` | date, groomCount, staysInHouse, salesTotal, noShows, tomorrowCount | สรุป {date}: กรูม {groomCount} ตัว, พัก {staysInHouse}, ยอดขาย {salesTotal}, no-show {noShows} \| พรุ่งนี้ {tomorrowCount} นัด | US-12-05 |
| `owner.quota_warning` | owner | web_push | - | - | ส่ง push แล้ว used ≥ 80% (R-18) | `quota_warning:{branchId}:{monthKey}` | used, quota | ข้อความ LINE ใช้ไป {used}/{quota} แล้ว ระบบจะสงวนโควตาให้ข้อความสำคัญ | US-13-06 |
| `owner.promptpay_changed` | owner (ทุกคน) | web_push|email | - | - | branch.setPromptpay | `promptpay_changed:{auditId}` | byName, idMasked | ⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น {idMasked} โดย {byName} — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที | US-02-03 |
| `owner.support_access` | owner | web_push|email | - | - | admin.supportStart | `support_access:{supportId}` | reason | ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: {reason} | US-13-11 |
| `admin.feedback` | platform admin | email | - | - | feedback.create | `feedback:{feedbackId}` | shopName, message | [Feedback] {shopName}: {message} | US-13-13 |
| `admin.data_request` | platform admin | email | - | - | liff.dataRequest | `data_request:{requestId}` | type | [PDPA] คำขอ {type} ใหม่ | US-13-08 |

### 1.1 ผู้รับ ช่องทาง และ dedupe (Q-0009)

- **1 แถวต่อผู้รับ 1 คน** — template ที่ผู้รับเป็นกลุ่ม (เช่น `owner (ทุกคน)`, `staff (ทุกคนที่ active ในสาขา)`, `platform admin`) สร้างแถวแยกต่อคน; `dedupe_key` = `<dedupe key ในตาราง>:<recipientId>`
- ช่องทาง: ลูกค้า/พนักงานเลือกด้วย R-19 แล้ว **ช่องทางที่ได้ต้องอยู่ในคอลัมน์ 'ช่องทาง' ของ template** ไม่งั้นข้ามด้วย `no_recipient`
- template ที่ช่องทางเป็น `email` อย่างเดียว (`staff.invite`, `staff.password_reset`, `admin.*`) ส่งอีเมลเสมอ ไม่ผ่าน R-19; ผู้รับไม่มีอีเมล → ข้าม `no_recipient`
- ผู้รับ `platform admin`: `recipient_type = platform_admin`, `recipient_id = platform_admin.id` (ทุกคนที่ active), `organization_id` = ร้านต้นเรื่อง (ร้านที่ส่ง feedback / ร้านของลูกค้าที่ขอข้อมูล), `branch_id` = สาขาต้นเรื่องหรือ null; ไม่นับโควตา R-18

### 1.2 บรรทัดที่ template ประกอบเอง (Q-0010)

`{…Line}` ไม่ใช่ตัวแปร payload — ผู้เรียกส่งเฉพาะตัวแปรในคอลัมน์ 'ตัวแปร' แล้ว `render()` ของ template ประกอบบรรทัดเองตามนี้ · `depositAmount` = integer satang, `holdExpiresTime` = ISO instant (UTC) — render แปลงเป็นเวลาท้องถิ่นของสาขาด้วย R-20 และ format เงินตามหลักแสดงผลใน 06:

| template | บรรทัด | เงื่อนไข → ข้อความ |
|---|---|---|
| `customer.booking_received` | `{depositLine}` | `depositAmount` > 0 → `กรุณาชำระมัดจำ ฿{depositAmount} ภายใน {holdExpiresTime} น. เพื่อยืนยันคิว` (เงินแบบ auto ซ่อน .00, เวลา `HH:mm` เวลาท้องถิ่นสาขา) · ไม่งั้น → `ร้านจะยืนยันคิวให้เร็ว ๆ นี้ค่ะ` |
| `customer.ready_for_pickup` | `{reportCardLine}` | มี `reportCardUrl` → `ดูสมุดพกวันนี้: {reportCardUrl}` · ไม่มี (null/ว่าง) → ตัดบรรทัดนี้ทิ้งทั้งบรรทัด (ไม่เหลือบรรทัดว่าง) |


## 2. Scheduled jobs (`scheduled_job.job_type`)

| job_type | ตั้งเมื่อ | payload | handler | dedupe key | Stories |
|---|---|---|---|---|---|
| `expire_hold` | liff.createBooking / slips.reject (เวลา hold_expires_at) | `{bookingId}` | ถ้า booking ยัง awaiting_deposit และ hold_expires_at ≤ now → expired + children cancelled + customer.hold_expired | `expire_hold:{bookingId}:{holdExpiresAt}` | US-05-02 |
| `reminder_24h` | สร้าง/เลื่อน/อนุมัตินัด — run_at = starts_at − 24 ชม. (ถ้าสร้างภายใน 24 ชม. ไม่ตั้ง) | `{bookingId, entityType, entityId}` | ตรวจว่ายัง active และ branch_policy.reminder_24h_enabled → customer.reminder_24h | `reminder_24h:{entityId}:{startsAt}` | US-07-06 |
| `next_groom_reminder` | groom.pickUp — run_at = remindOn 10:00 ท้องถิ่น (R-17) | `{petId, organizationId}` | คำนวณ R-17 ใหม่ ณ ตอนรัน; remindOn ยังเป็นวันนี้ → customer.next_groom_reminder | `next_groom:{petId}:{dueDate}` | US-10-04 |
| `owner_daily_summary` | cron.tick seed ทุกวันต่อสาขา ที่ daily_summary_time | `{branchId, localDate}` | รวมตัวเลข DashboardToday → owner.daily_summary | `owner_daily_summary:{branchId}:{localDate}` | US-12-05 |
| `approval_overdue` | liff.createBooking (awaiting_approval) — run_at = approval_due_at; รันซ้ำทุก approval_timeout_minutes | `{bookingId, n}` | ยัง awaiting_approval: ถ้าเลย first_service_at → expired (R-07 shop_cancel) ไม่งั้น staff.approval_overdue แล้วตั้งรอบถัดไป | `approval_overdue:{bookingId}:{n}` | US-05-05 |
| `care_task_overdue_scan` | cron.tick seed ทุก 15 นาที | `{}` | care_task pending ที่ due_at + 30 นาที < now และยังไม่เคยแจ้ง → staff.care_task_overdue | `care_task_overdue_scan:{yyyyMMddHHmm/15}` | US-06-09 |
| `recompute_reliability` | cron.tick seed ทุกวัน 03:00 Asia/Bangkok | `{}` | นับ 12 เดือนใหม่ทุก customer ที่มีเหตุการณ์ใน 13 เดือน → R-09 (late cancel = booking.cancel_is_late = true ที่ cancelled_at ในช่วง, Q-0084) | `recompute_reliability:{localDate}` | US-03-09 |
| `package_expiry` | cron.tick seed ทุกวัน 00:10 | `{}` | customer_package active ที่ expires_at < now → expired | `package_expiry:{localDate}` | US-10-05 |
| `cleanup_uncommitted_files` | cron.tick seed ทุกวัน 04:00 | `{}` | file_object committed_at null และ created_at < now − 24 ชม. → ลบ object + deleted_at | `cleanup_files:{localDate}` | US-13-04 |

## 3. Cron

- `POST /api/cron/tick` ทุก 1–5 นาที (cron ภายนอกฟรี) → (1) seed งานรายวัน/ราย 15 นาที ด้วย dedupe key (2) ประมวลผล scheduled_job ที่ถึงเวลา (3) ส่ง notification queued ที่ค้าง
- handler ทุกตัวต้อง idempotent: อ่านสถานะล่าสุดจาก DB ก่อนทำ และจบเงียบ ๆ ถ้าไม่ต้องทำแล้ว

