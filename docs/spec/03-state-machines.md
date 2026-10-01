# 03 — State Machines

> ทุกการเปลี่ยนสถานะต้องผ่านฟังก์ชัน `transition()` ของ entity นั้นใน `packages/domain/src/<entity>/state.ts` ซึ่งมีตาราง allowed transitions ตรงตามไฟล์นี้ (ทดสอบด้วย `docs/spec/vectors/state-machines.json`) — ห้าม `UPDATE status` ตรง ๆ จากที่อื่น

> ฝั่ง DB: `UPDATE … SET status = :to WHERE id = :id AND status IN (:from)` → 0 แถว = `INVALID_TRANSITION` (409) และ insert `booking_event` ใน transaction เดียวกันเสมอสำหรับ booking/groom/stay/daycare/deposit


<a id="sm-booking"></a>

## booking (`booking.status`)

ใบจอง (header) — สถานะรวมของทั้งใบ

| สถานะ | ความหมาย |
|---|---|
| `awaiting_deposit` | รอลูกค้าโอนมัดจำ (คิวถูกกันไว้ถึง hold_expires_at) |
| `deposit_review` | ลูกค้าส่งสลิปแล้ว รอร้านตรวจ (คิวยังถูกกัน) |
| `awaiting_approval` | รอร้านอนุมัติ (auto_confirm = false / reliability 1 / วัคซีนรอตรวจ) |
| `confirmed` | ยืนยันแล้ว |
| `cancelled` | ยกเลิก (ลูกค้าหรือร้าน) |
| `expired` | หมดเวลาจ่ายมัดจำ/อนุมัติ — คิวถูกปล่อย |
| `closed` | ทุกบริการจบและเคลียร์เงินแล้ว (บิลปิด หรือ no-show ทั้งหมด) |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `confirmed` | bookings.create | ร้านสร้าง (walk_in/phone/chat) | deposit_status = pending ถ้ามีมัดจำ ไม่งั้น not_required |
| `∅` | `confirmed` | liff.createBooking | online, มัดจำ = 0 และไม่ต้องอนุมัติ | แจ้งลูกค้า booking_confirmed |
| `∅` | `awaiting_deposit` | liff.createBooking | มัดจำ > 0 | hold_expires_at (R-08), job expire_hold |
| `∅` | `awaiting_approval` | liff.createBooking | มัดจำ = 0 และต้องอนุมัติ | approval_due_at, job approval_overdue, แจ้งร้าน |
| `awaiting_deposit` | `deposit_review` | liff.uploadSlip | now < hold_expires_at | deposit_status submitted, hold_expires_at = null |
| `awaiting_deposit` | `confirmed` | bookings.recordDeposit \| bookings.waiveDeposit | ไม่ต้องอนุมัติ | deposit_status verified / not_required |
| `awaiting_deposit` | `awaiting_approval` | bookings.recordDeposit \| bookings.waiveDeposit | ต้องอนุมัติ |  |
| `awaiting_deposit` | `expired` | job:expire_hold | now ≥ hold_expires_at | children → cancelled (ปล่อยคิว), แจ้งลูกค้า hold_expired |
| `deposit_review` | `confirmed` | slips.verify | ไม่ต้องอนุมัติ | payment + deposit_verified_satang, แจ้งลูกค้า deposit_confirmed |
| `deposit_review` | `awaiting_approval` | slips.verify | ต้องอนุมัติ (approveBooking = false) | แจ้งลูกค้า deposit_confirmed |
| `deposit_review` | `awaiting_deposit` | slips.reject | เป็นการปฏิเสธครั้งแรกของใบจองนี้ | hold ใหม่ = now + hold_minutes, แจ้งลูกค้า slip_rejected |
| `deposit_review` | `expired` | slips.reject | ปฏิเสธครั้งที่ 2 | children → cancelled, แจ้งลูกค้า |
| `awaiting_approval` | `confirmed` | bookings.approve |  | แจ้งลูกค้า booking_confirmed, ตั้ง reminder_24h |
| `awaiting_approval` | `cancelled` | bookings.decline |  | R-07 shop_cancel (คืนมัดจำเต็ม), แจ้งลูกค้า booking_declined |
| `awaiting_approval` | `expired` | job:approval_overdue | now ≥ first_service_at และยังไม่อนุมัติ | R-07 shop_cancel |
| `awaiting_deposit|deposit_review|awaiting_approval|confirmed` | `cancelled` | bookings.cancel \| liff.cancel | R-21 (ลูกค้า) / ร้านทำได้ทุกเวลาก่อนบริการเริ่ม | children → cancelled, เงินตาม R-07, late → R-09 |
| `confirmed` | `closed` | bills.close \| groom.noShow \| stays.noShow \| daycare.no_show | ทุก child อยู่ในสถานะจบ (picked_up/checked_out/no_show/cancelled) และ (บิลที่ผูกปิดแล้ว หรือไม่มีอะไรต้องเก็บเงิน) | deposit: applied (มีบิล) / forfeited (no-show) |
| `closed` | `confirmed` | bills.void | บิลที่ปิดใบจองถูก void | bill_id = null |

- ทุกการเปลี่ยนสถานะ = `UPDATE booking SET status=:to WHERE id=:id AND status IN (:from)` แล้วตรวจจำนวนแถว (0 → INVALID_TRANSITION) + insert booking_event ใน transaction เดียวกัน

- children (groom_appointment/stay/daycare_visit) ถูกยกเลิกพร้อม booking เสมอ — การยกเลิกทีละ child ใช้ endpoint ของ child

<a id="sm-deposit"></a>

## deposit (`booking.deposit_status`)

สถานะมัดจำของใบจอง

| สถานะ | ความหมาย |
|---|---|
| `not_required` | ไม่ต้องมัดจำ / ยกเว้น |
| `pending` | ต้องจ่าย ยังไม่จ่าย |
| `submitted` | ส่งสลิปแล้ว รอตรวจ |
| `verified` | ร้านยืนยันยอดแล้ว |
| `rejected` | สลิปถูกปฏิเสธ (ส่งใหม่ได้) |
| `refunded` | คืนเงินแล้ว (ยกเลิก) |
| `credited` | คืนเป็นเครดิต |
| `forfeited` | ถูกริบ (ยกเลิกกระชั้น/no-show) |
| `applied` | หักในบิลแล้ว |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `not_required|pending` | bookings.create \| liff.createBooking | R-06 |  |
| `pending|rejected` | `submitted` | liff.uploadSlip |  | payment_slip submitted |
| `submitted` | `verified` | slips.verify |  | insert payment method promptpay |
| `submitted` | `rejected` | slips.reject |  |  |
| `pending|rejected` | `verified` | bookings.recordDeposit |  | insert payment |
| `pending|submitted|rejected` | `not_required` | bookings.waiveDeposit |  | audit deposit.waive |
| `verified` | `applied` | bills.close |  | payment method deposit อยู่ในบิล |
| `verified` | `refunded|credited|forfeited` | bookings.cancel \| liff.cancel \| bookings.decline \| groom.noShow | R-07 | return > 0 → refunded/credited; return = 0 → forfeited |
| `applied` | `verified` | bills.void |  |  |

<a id="sm-groom_appointment"></a>

## groom_appointment (`groom_appointment.status`)

นัดกรูมรายตัว

| สถานะ | ความหมาย |
|---|---|
| `scheduled` | นัดไว้ |
| `checked_in` | มาถึงร้าน เช็คอินแล้ว |
| `in_progress` | ช่างกำลังทำ |
| `done` | ทำเสร็จ รอรับ |
| `picked_up` | ลูกค้ารับกลับแล้ว |
| `no_show` | ลูกค้าไม่มา |
| `cancelled` | ยกเลิก |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `scheduled` | bookings.create \| liff.createBooking | slot ผ่าน R-04 + exclusion constraint |  |
| `scheduled` | `scheduled` | groom.reschedule \| liff.reschedule | R-04 / R-21 | booking_event reason reschedule |
| `scheduled` | `checked_in` | groom.checkIn | วันนี้ และ booking.status = confirmed (หรือ awaiting_deposit ที่ร้านรับมัดจำหน้างาน) | consent ถ้าจำเป็น, pet_weight |
| `checked_in` | `in_progress` | groom.start | role staff = ช่างของนัด | started_at |
| `in_progress` | `done` | groom.finish |  | report_card draft, แจ้งหน้าร้าน |
| `done` | `picked_up` | groom.pickUp |  | next_groom_reminder (R-17) |
| `scheduled` | `no_show` | groom.noShow | now ≥ starts_at + no_show_grace_minutes | R-07/R-09 |
| `scheduled|checked_in` | `cancelled` | groom.cancel \| bookings.cancel \| liff.cancel \| job:expire_hold |  | ปล่อย slot (constraint ไม่นับ cancelled) |

- ช่างทำทีละนัด: start นัดใหม่ขณะมีนัด in_progress ของตัวเองอยู่ → STATUS_NOT_ALLOWED

<a id="sm-stay"></a>

## stay (`stay.status`)

การพักโรงแรม

| สถานะ | ความหมาย |
|---|---|
| `reserved` | จองแล้ว |
| `checked_in` | อยู่ในร้าน |
| `checked_out` | กลับบ้านแล้ว |
| `no_show` | ไม่มา |
| `cancelled` | ยกเลิก |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `reserved` | bookings.create \| liff.createBooking | R-10/R-28 + exclusion constraint |  |
| `reserved` | `checked_in` | stays.checkIn | intake complete + agreement + R-11 (หรือ override) + วันนี้ ≥ check_in_date | care_task (R-26) |
| `checked_in` | `checked_out` | stays.checkOut | ของคืนครบ (หรือ missingNote) | housekeeping dirty, report_card stay draft, เปิดบิล |
| `reserved` | `no_show` | stays.noShow | หลัง check_in_date | R-07/R-09 |
| `reserved` | `cancelled` | stays.cancel \| bookings.cancel \| liff.cancel \| job:expire_hold |  |  |

- ขยาย/ลดวันพักไม่เปลี่ยนสถานะ (stays.changeDates)

<a id="sm-daycare_visit"></a>

## daycare_visit (`daycare_visit.status`)

Daycare รายวัน

| สถานะ | ความหมาย |
|---|---|
| `reserved` | จองแล้ว |
| `checked_in` | อยู่ในร้าน |
| `checked_out` | กลับแล้ว |
| `no_show` | ไม่มา |
| `cancelled` | ยกเลิก |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `reserved` | bookings.create \| liff.createBooking | R-29 |  |
| `reserved` | `checked_in` | daycare.check_in | R-11, วันนี้ = visit_date |  |
| `checked_in` | `checked_out` | daycare.check_out |  | เพิ่มเข้าบิล |
| `reserved` | `no_show` | daycare.no_show | หลังเวลาเริ่มรอบ + grace | R-07/R-09 |
| `reserved` | `cancelled` | daycare.cancel \| bookings.cancel \| liff.cancel \| job:expire_hold |  |  |

<a id="sm-bill"></a>

## bill (`bill.status`)

บิล

| สถานะ | ความหมาย |
|---|---|
| `open` | กำลังคิดเงิน |
| `paid` | ปิดแล้ว มีเลขใบเสร็จ |
| `void` | ยกเลิก |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `open` | bills.open |  |  |
| `open` | `paid` | bills.close | due = 0 | R-16, R-13, R-14, booking closed |
| `open` | `void` | bills.void | ไม่มี payment posted | booking.bill_id = null |
| `paid` | `void` | bills.void | owner + reason | ย้อน commission/แพ็กเกจ/เครดิต/payment |

- บิล paid แก้ไม่ได้ทุกกรณี — แก้ผิด = void แล้วเปิดบิลใหม่

<a id="sm-payment_slip"></a>

## payment_slip (`payment_slip.status`)

สลิป

| สถานะ | ความหมาย |
|---|---|
| `submitted` | รอตรวจ |
| `verified` | ยืนยันแล้ว |
| `rejected` | ปฏิเสธ |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `submitted` | liff.uploadSlip \| liff.payUploadSlip |  | R-05 |
| `submitted` | `verified` | slips.verify | สลิปซ้ำต้อง confirmDuplicate | payment |
| `submitted` | `rejected` | slips.reject |  |  |

<a id="sm-report_card"></a>

## report_card (`report_card.status`)

Report card

| สถานะ | ความหมาย |
|---|---|
| `draft` | ช่างกำลังกรอก |
| `pending_review` | รอหน้าร้านตรวจ |
| `sent` | ส่งลูกค้าแล้ว |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `draft` | groom.finish \| stays.checkOut |  |  |
| `draft` | `pending_review` | reportCards.submit | branch_policy.report_card_requires_review | แจ้งหน้าร้าน |
| `draft` | `sent` | reportCards.submit | ไม่ต้องตรวจ | ส่ง LINE (R-18/R-19) |
| `pending_review` | `sent` | reportCards.approve |  | ส่ง LINE |

<a id="sm-customer_link_request"></a>

## customer_link_request (`customer_link_request.status`)

คำขอจับคู่บัญชี LINE กับลูกค้าเดิม

| สถานะ | ความหมาย |
|---|---|
| `pending` | รอร้าน |
| `approved` | ผูกแล้ว |
| `rejected` | ไม่ใช่คนเดียวกัน |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `pending` | liff.register | เบอร์ตรงกับ customer เดิม | แจ้งหน้าร้าน |
| `pending` | `approved` | linkRequests.approve |  | ย้าย line_identity → profile เดิม |
| `pending` | `rejected` | linkRequests.reject |  | สร้างลูกค้าใหม่ |

<a id="sm-pet_vaccination"></a>

## pet_vaccination (`pet_vaccination.status`)

บันทึกวัคซีน

| สถานะ | ความหมาย |
|---|---|
| `pending_review` | ลูกค้าส่ง รอร้านตรวจ |
| `verified` | ยืนยันแล้ว |
| `rejected` | หลักฐานไม่ผ่าน |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `verified` | vaccinations.create | ร้านบันทึก |  |
| `∅` | `pending_review` | liff.addVaccination | ลูกค้าส่ง | แจ้งร้าน |
| `pending_review` | `verified` | vaccinations.verify |  |  |
| `pending_review` | `rejected` | vaccinations.reject |  | แจ้งลูกค้า |

<a id="sm-care_task"></a>

## care_task (`care_task.status`)

งานดูแลรายวัน

| สถานะ | ความหมาย |
|---|---|
| `pending` | รอทำ |
| `done` | ทำแล้ว |
| `skipped` | ข้าม |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `pending` | stays.checkIn \| stays.saveIntake \| stays.changeDates | R-26 |  |
| `pending` | `done` | careTasks.done |  |  |
| `pending` | `skipped` | careTasks.skip \| stays.checkOut |  |  |

<a id="sm-customer_package"></a>

## customer_package (`customer_package.status`)

แพ็กเกจของลูกค้า

| สถานะ | ความหมาย |
|---|---|
| `active` | ใช้ได้ |
| `exhausted` | ใช้ครบ |
| `expired` | หมดอายุ |
| `void` | ยกเลิก (บิลขายถูก void) |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `active` | bills.close | บิลมี package_sale | R-14 |
| `active` | `exhausted` | bills.close | sessions_used = sessions_total |  |
| `active` | `expired` | job:package_expiry | now > expires_at |  |
| `exhausted` | `active` | bills.void | คืนสิทธิ์จากการ void |  |
| `active|exhausted|expired` | `void` | bills.void | บิลที่ขายแพ็กเกจถูก void |  |

<a id="sm-staff_user"></a>

## staff_user (`staff_user.status`)

บัญชีพนักงาน

| สถานะ | ความหมาย |
|---|---|
| `invited` | ส่งคำเชิญแล้ว |
| `active` | ใช้งาน |
| `disabled` | ปิดใช้งาน |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `invited` | staffUsers.invite \| admin.createOrg |  |  |
| `invited` | `active` | auth.inviteAccept | token ไม่หมดอายุ |  |
| `active` | `disabled` | staffUsers.update | ไม่ใช่ owner คนสุดท้าย | ลบ session |
| `disabled` | `active` | staffUsers.update |  |  |

<a id="sm-scheduled_job"></a>

## scheduled_job (`scheduled_job.status`)

งานตั้งเวลา

| สถานะ | ความหมาย |
|---|---|
| `pending` | รอถึงเวลา |
| `running` | กำลังทำ |
| `done` | เสร็จ |
| `failed` | ล้มเหลวครบ 5 ครั้ง |
| `cancelled` | ยกเลิก |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `pending` | system:schedule | dedupe_key unique (ON CONFLICT DO NOTHING) |  |
| `pending` | `running` | cron.tick | run_at ≤ now, FOR UPDATE SKIP LOCKED | locked_at |
| `running` | `done` | cron.tick | handler สำเร็จ | finished_at |
| `running` | `pending` | cron.tick | error และ attempts < 5 | attempts+1, run_at backoff |
| `running` | `failed` | cron.tick | attempts = 5 | แจ้ง Sentry |
| `pending` | `cancelled` | system:cancel | เหตุการณ์ทำให้งานไม่จำเป็น (ยกเลิกใบจอง ฯลฯ) |  |
| `running` | `pending` | cron.tick | locked_at เก่ากว่า 10 นาที (worker ตาย) | ปลดล็อก |

<a id="sm-notification"></a>

## notification (`notification.status`)

ข้อความ

| สถานะ | ความหมาย |
|---|---|
| `queued` | รอส่ง |
| `sent` | ส่งแล้ว |
| `failed` | ส่งไม่สำเร็จ |
| `skipped` | ไม่ส่ง (ดู skip_reason) |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `queued` | system:notify | dedupe_key unique |  |
| `queued` | `sent` | system:dispatch |  | sent_at |
| `queued` | `failed` | system:dispatch | API error หลัง retry 3 ครั้ง | error |
| `queued|∅` | `skipped` | system:dispatch | R-18/R-19 | skip_reason |

<a id="sm-line_channel"></a>

## line_channel (`line_channel.status`)

การเชื่อม LINE OA ของสาขา

| สถานะ | ความหมาย |
|---|---|
| `pending` | ใส่ค่าแล้ว ยังไม่ทดสอบ |
| `active` | ทดสอบผ่าน ส่งข้อความได้ |
| `error` | ทดสอบไม่ผ่าน / token ใช้ไม่ได้ |

| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |
|---|---|---|---|---|
| `∅` | `pending` | admin.setLineChannel | ยังไม่มีแถวของสาขานี้ | เข้ารหัส secret/token ก่อนเก็บ |
| `pending|active|error` | `pending` | admin.setLineChannel | แก้ค่าการเชื่อม | webhook_verified_at = null |
| `pending|error` | `active` | admin.verifyLine | GET bot info + test webhook สำเร็จ | webhook_verified_at = now, สร้าง rich menu |
| `pending|error` | `error` | admin.verifyLine | LINE API ตอบ error | ตอบ LINE_API_ERROR |
| `active` | `error` | system:dispatch | LINE ตอบ 401 (token ถูกเพิกถอน) | notification ของสาขาถูก skip จนกว่าจะ verify ใหม่ + แจ้ง owner ทาง Web Push |
