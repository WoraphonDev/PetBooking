# 09 — Traceability (Story → หน้าจอ / API / Rules / Tables)

> ใช้ตอนแตก task: ทุก task ต้องอ้าง story และ artefact ในตารางนี้ · สร้างอัตโนมัติจาก 02–07

| Story | ชื่อ | MS | Screens | API | Rules | Notify/Jobs | Tables |
|---|---|---|---|---|---|---|---|
| US-13-01 | โครงระบบและการ deploy | M0 |  |  |  |  |  |
| US-13-02 | Data model หลัก (พร้อมรองรับ OTA) | M0 |  |  |  |  | organization, owner_profile, rate_plan, booking_event |
| US-01-02 | พนักงานเข้าระบบด้วยอีเมล | M0 | A-01, A-02, A-03 | `auth.staffLogin`, `auth.staffLogout`, `auth.me`, `auth.resetRequest`, `auth.resetConfirm` | R-24 | staff.password_reset | staff_user, password_reset, session |
| US-13-03 | ภาษาไทยและรูปแบบไทย | M0 | AD-07 | `closures.importHolidays`, `admin.holidays`, `admin.listHolidays` | R-20, R-31 |  | public_holiday |
| US-13-09 | Monitoring และแจ้งเตือนระบบล่ม | M0 |  | `health` |  |  |  |
| US-13-10 | ทีมสร้างและจัดการร้าน | M0 | AD-01, AD-02, AD-03 | `admin.login`, `admin.orgs`, `admin.createOrg`, `admin.updateOrg` |  |  | organization, platform_admin |
| US-01-04 | เชิญพนักงานและกำหนดสิทธิ์ | M1 | A-04, C-36 | `auth.inviteAccept`, `staffUsers.list`, `staffUsers.invite`, `staffUsers.update`, `staffUsers.resendInvite` |  | staff.invite | staff_user, staff_invite |
| US-01-05 | ใช้หลายเครื่องพร้อมกัน | M1 | C-45 | `staffMe.sessions`, `staffMe.revokeSession` |  |  |  |
| US-02-01 | ข้อมูลร้าน | M1 | C-30, C-31 | `branch.get`, `branch.update`, `branch.setHours` |  |  | branch, branch_hours |
| US-02-02 | เปิด/ปิดโมดูล | M1 | C-32 | `branch.setModules` |  |  | branch |
| US-02-04 | นโยบายร้าน | M1 | C-33 | `branch.updatePolicy` |  |  | branch_policy |
| US-02-05 | วันปิด / เวลาพิเศษ | M1 | C-31 | `closures.list`, `closures.create`, `closures.delete`, `closures.importHolidays` |  |  | branch_closure |
| US-03-01 | โปรไฟล์ลูกค้า | M1 | C-08, C-09, C-10 | `customers.list`, `customers.create`, `customers.get`, `customers.update` | R-22 |  | owner_profile, customer |
| US-13-04 | อัปโหลดรูปแบบประหยัด | M1 | S-02 | `staff.uploadUrl`, `customer.uploadUrl` | R-25 | cleanup_uncommitted_files | file_object |
| US-03-02 | โปรไฟล์น้อง | M1 | C-11 | `pets.create`, `pets.get`, `pets.update` |  |  | pet |
| US-04-01 | เมนูบริการกรูม | M1 | C-37 | `services.list`, `services.create`, `services.update` |  |  | service |
| US-02-08 | นำเข้าข้อมูลจาก CSV | M1 | C-44 | `imports.create`, `imports.get`, `imports.commit` |  |  | import_job |
| US-03-03 | ข้อมูลกรูม + น้ำหนัก | M1 | C-11 | `pets.get`, `pets.updateShopProfile`, `pets.addWeight` |  |  | pet_shop_profile, pet_weight |
| US-03-04 | สุขภาพ + ป้ายนิสัย | M1 | C-11 | `pets.get`, `pets.updateShopProfile`, `pets.setFlags` |  |  | pet_shop_profile, pet_temperament_flag |
| US-03-05 | วัคซีน | M1 | C-11 | `vaccinations.create`, `vaccinations.verify`, `vaccinations.reject` |  | customer.vaccine_rejected | vaccine_type, pet_vaccination |
| US-03-06 | คลังรูปก่อน-หลัง | M1 | C-11 | `photos.list`, `photos.add` | R-25 |  | pet_photo |
| US-03-07 | โน้ตภายใน vs โน้ตถึงลูกค้า | M1 | C-11 | `pets.updateShopProfile` |  |  | pet_shop_profile |
| US-03-10 | ค้นหาเร็ว | M1 | C-08 | `search.quick` | R-22 |  |  |
| US-04-02 | ราคาตามขนาดและประเภทขน | M1 | C-37, C-38 | `sizeTiers.list`, `sizeTiers.set`, `services.setPrices` | R-01, R-02 |  | size_tier, service_price |
| US-04-03 | ระยะเวลาตามขนาด | M1 | C-37 | `services.setPrices`, `groom.setItems` | R-02 |  | service_price |
| US-04-04 | Add-on | M1 | C-37 | `services.create`, `services.setAddonLinks` |  |  | service, service_addon_link |
| US-13-07 | Audit log เรื่องเงิน | M1 | C-26 | `audit.list` | R-27 |  | audit_log |
| US-13-08 | PDPA และเอกสารกฎหมาย | M1 | P-02, L-01, L-15, AD-05 | `liff.register`, `liff.dataRequest`, `admin.dataRequests`, `admin.resolveDataRequest` |  | admin.data_request | consent_record, data_request |
| US-09-01 | ตารางทำงานช่าง | M2 | C-36 | `staffUsers.list`, `staffUsers.update`, `workingHours.set`, `timeOff.list`, `timeOff.create`, `timeOff.delete` |  |  | staff_working_hours, staff_time_off |
| US-05-01 | Slot engine | M2 | C-43 | `stations.list`, `stations.upsert`, `availability.groomSlots` | R-04 |  | branch_policy, groom_station, groom_appointment |
| US-13-05 | บริการแจ้งเตือนร้าน/พนักงาน (Web Push + อีเมล) | M2 | C-45 | `staffMe.pushSubscribe`, `staffMe.pushUnsubscribe` | R-19 | staff.new_booking | web_push_subscription, notification |
| US-01-03 | ช่างเข้า Staff app ด้วย LINE | M2 | C-45, S-07 | `auth.staffLine`, `staffMe.linkLine` |  |  | staff_user |
| US-05-04 | ร้านลงนัดให้ลูกค้า | M2 | C-03, C-05 | `availability.groomSlots`, `quotes.create`, `bookings.create`, `bookings.get` | R-03, R-04, R-23 | customer.booking_confirmed | booking, groom_appointment, groom_appointment_item |
| US-05-06 | เช็คอินกรูม + ใบยินยอม | M2 | C-06 | `groom.setItems`, `groom.checkIn` |  |  | pet_weight, groom_appointment, consent_document |
| US-04-05 | ค่าบริการเพิ่มหน้างาน | M2 | C-02D, C-37 | `surchargeTypes.list`, `surchargeTypes.upsert`, `groom.addSurcharge`, `groom.removeSurcharge` |  |  | surcharge_type, appointment_surcharge |
| US-05-03 | ปฏิทินคิว | M2 | C-02, C-02D | `calendar.day`, `groom.reschedule` |  |  | groom_appointment |
| US-05-07 | Job card | M2 | S-02 | `groom.jobCard` |  |  |  |
| US-05-08 | ร้านยกเลิก/เลื่อนนัด | M2 | C-02D, C-05 | `availability.groomSlots`, `bookings.cancelPreview`, `bookings.cancel`, `groom.reschedule`, `groom.cancel`, `stays.cancel`, `daycare.cancel` | R-04, R-07 | customer.booking_cancelled, customer.booking_rescheduled |  |
| US-09-03 | Staff app (PWA) | M2 | S-01, S-02 | `photos.add`, `groom.start`, `groom.finish`, `groom.myQueue` |  |  | pet_photo |
| US-09-04 | แจ้งเตือนพนักงาน | M2 | S-07 | `staffMe.pushSubscribe` | R-19 | staff.groom_done, staff.care_task_overdue | web_push_subscription |
| US-13-11 | Support mode | M2 | AD-03 | `admin.supportStart`, `admin.supportEnd` | R-27 | owner.support_access | platform_admin, support_access_log |
| US-13-13 | ปุ่มแจ้งปัญหา / ขอ feature | M2 | C-46, AD-04 | `feedback.create`, `admin.feedback`, `admin.updateFeedback` |  | admin.feedback | feedback_report |
| US-13-14 | ชุด onboarding ร้านนำร่อง | M2 | AD-02 | `admin.createOrg` |  |  |  |
| US-05-02 | ล็อกคิว/ห้องระหว่างจ่ายมัดจำ | M3 | L-07 | `liff.createBooking`, `cron.tick` | R-08 | customer.hold_expired, expire_hold | scheduled_job |
| US-02-06 | เชื่อม LINE OA ของร้าน | M3 | C-35, AD-03 | `line.status`, `webhook.line`, `admin.setLineChannel`, `admin.verifyLine` | R-18 |  | line_channel |
| US-01-01 | ลูกค้าเข้าด้วย LINE Login | M3 | L-01 | `linkRequests.list`, `liff.session` |  |  | session, line_identity, customer_link_request |
| US-02-03 | บัญชีรับเงิน PromptPay | M3 | C-34 | `branch.setPromptpay` |  | owner.promptpay_changed | branch |
| US-02-07 | ลิงก์จอง + QR poster | M3 | P-01, C-35 | `public.branch` |  |  |  |
| US-07-01 | QR PromptPay ตามยอด | M3 | C-18, C-34, L-07 | `bills.promptpayQr` | R-30 |  |  |
| US-07-02 | ร้านยืนยันสลิป + จับสลิปซ้ำ | M3 | C-05, C-07 | `bookings.list`, `bookings.recordDeposit`, `slips.list`, `slips.verify`, `slips.reject`, `liff.uploadSlip` | R-05, R-25 | customer.deposit_confirmed, customer.slip_rejected, staff.slip_submitted | payment_slip, payment |
| US-07-03 | กติกามัดจำ | M3 | C-04, C-05, C-33 | `branch.updatePolicy`, `bookings.recordDeposit`, `bookings.waiveDeposit` | R-06 |  | branch_policy, booking |
| US-07-04 | นโยบายยกเลิก | M3 | C-05, C-33 | `branch.updatePolicy`, `bookings.cancelPreview`, `bookings.cancel` | R-07 | customer.booking_cancelled | branch_policy, booking |
| US-07-07 | กด No-show | M3 | C-02D | `groom.noShow`, `stays.noShow`, `daycare.no_show` | R-07, R-09 | customer.no_show |  |
| US-03-09 | คะแนนความน่าเชื่อถือลูกค้า | M3 | C-09 | `customers.blacklist`, `customers.reliabilityOverride` | R-06, R-09 | recompute_reliability | customer |
| US-03-11 | สถานะน้องจากไป / ย้ายบ้าน | M3 | C-11 | `pets.setStatus` | R-12 |  | pet |
| US-03-12 | Consent การใช้รูป | M3 | L-01, L-15 | `liff.register`, `liff.updateMe` |  |  | customer, consent_record |
| US-11-01 | ลงทะเบียน + PDPA | M3 | C-12, L-01, L-15 | `linkRequests.list`, `linkRequests.approve`, `linkRequests.reject`, `liff.register`, `liff.me`, `liff.updateMe` | R-22 | customer.link_approved, staff.link_request | customer, customer_link_request, consent_record, data_request |
| US-11-02 | น้องของฉัน | M3 | L-03 | `liff.pets`, `liff.createPet`, `liff.updatePet`, `liff.addVaccination` |  |  | pet, pet_vaccination |
| US-11-03 | จองกรูมใน LINE | M3 | L-02, L-04 | `liff.shop`, `liff.groomSlots`, `liff.quote`, `liff.createBooking` | R-01, R-03, R-04, R-06, R-12, R-23 | customer.booking_received, customer.booking_confirmed | booking, groom_appointment_item |
| US-05-05 | ยืนยันอัตโนมัติหรืออนุมัติเอง | M3 | C-04, C-33 | `branch.updatePolicy`, `bookings.list`, `bookings.approve`, `bookings.decline` | R-08 | customer.booking_confirmed, customer.booking_declined, staff.approval_overdue, approval_overdue |  |
| US-07-05 | บันทึกคืนเงิน / เครดิต | M3 | C-05, C-09 | `customers.credit`, `refunds.create` | R-07 |  | refund, credit_ledger |
| US-13-06 | ส่ง LINE ผ่าน OA ร้าน + คุมโควตา | M3 | C-22, C-33, C-35 | `branch.updatePolicy`, `line.status`, `line.skipped`, `webhook.line` | R-18, R-19 | owner.quota_warning | branch_policy, line_channel, notification |
| US-11-08 | นัดของฉัน | M3 | L-02, L-08, L-09 | `liff.bookings`, `liff.booking`, `liff.cancel`, `liff.reschedule` | R-07, R-21 | staff.booking_cancelled, staff.booking_rescheduled |  |
| US-07-06 | เตือนนัด 24 ชม. | M3 | C-33 | `cron.tick` |  | customer.reminder_24h, reminder_24h | scheduled_job |
| US-07-08 | ลิงก์จ่ายยอดคงเหลือ | M3 | C-05, L-14 | `bookings.balanceLink`, `liff.payPage`, `liff.payUploadSlip` | R-30 | customer.balance_link |  |
| US-11-07 | จ่ายมัดจำ | M3 | L-07 | `liff.uploadSlip` | R-05, R-08 | customer.booking_received, customer.deposit_confirmed | payment_slip |
| US-11-10 | เพิ่มลงปฏิทิน + เส้นทาง | M3 | L-09 | `liff.ics` |  |  |  |
| US-08-01 | เปิดบิล | M4 | C-18, C-19 | `groom.pickUp`, `bills.open`, `bills.list`, `bills.get`, `bills.addLine`, `bills.removeLine` | R-15 |  | bill, bill_line |
| US-03-08 | Timeline ประวัติ | M4 | C-09 | `customers.timeline` |  |  |  |
| US-10-01 | Report card | M4 | C-21, S-03, L-11 | `groom.finish`, `reportCards.list`, `reportCards.get`, `reportCards.update`, `reportCards.submit`, `reportCards.approve`, `liff.reportCard` |  | customer.report_card, staff.report_card_review | report_card |
| US-05-09 | แจ้งลูกค้ามารับ | M4 | C-02D | `groom.notifyPickup`, `groom.pickUp` |  | customer.ready_for_pickup, staff.groom_done |  |
| US-08-04 | รับชำระเงิน | M4 | C-18 | `bills.addPayment`, `bills.voidPayment`, `bills.promptpayQr`, `bills.close` | R-15, R-30 |  | payment, bill |
| US-09-02 | ตั้งค่ามือ | M4 | C-42 | `commissionRules.list`, `commissionRules.set`, `bills.close` | R-13 |  | commission_rule, commission_entry |
| US-09-05 | ช่างดูค่ามือตัวเอง | M4 | S-06 | `staffMe.commissions` | R-13 |  | commission_entry |
| US-08-02 | ส่วนลด | M4 | C-18 | `bills.updateLine`, `bills.setDiscount` | R-15 |  | bill |
| US-10-05 | แพ็กเกจ / คอร์สหลายครั้ง | M4 | C-09, C-18, C-41 | `customers.packages`, `packageTemplates.list`, `packageTemplates.upsert`, `bills.addLine` | R-14 | package_expiry | package_template, bill_line, customer_package, package_redemption |
| US-08-03 | หักมัดจำ / เครดิต / แพ็กเกจ | M4 | C-18 | `bills.addLine`, `bills.addPayment` | R-14, R-15 |  | credit_ledger, bill, bill_line |
| US-08-05 | ใบเสร็จ | M4 | C-20, L-13 | `bills.close`, `bills.receipt`, `bills.sendReceipt`, `liff.receipt` | R-16 | customer.receipt | bill |
| US-08-06 | Void บิล | M4 | C-19 | `bills.void` |  |  | bill, package_redemption |
| US-10-03 | ให้ดาว + ลิงก์รีวิว Google | M4 | L-11 | `liff.rate`, `liff.reviewClick` |  | staff.low_rating | report_card |
| US-10-04 | เตือนรอบกรูมถัดไป | M4 | C-33 | `cron.tick` | R-17 | customer.next_groom_reminder, next_groom_reminder | scheduled_job |
| US-10-06 | ลูกค้าดูแพ็กเกจคงเหลือ | M4 | L-12 | `liff.packages` | R-14 |  | customer_package |
| US-12-03 | รายงานค่ามือ | M4 | C-24 | `reports.commissions` | R-13 |  | commission_entry |
| US-06-01 | ห้องพักและเงื่อนไขรับเข้าพัก | M5 | C-39 | `roomTypes.list`, `roomTypes.create`, `roomTypes.update`, `roomUnits.list`, `roomUnits.upsert` | R-12 |  | room_type, room_unit |
| US-06-03 | Room inventory engine | M5 | C-03 | `availability.hotel`, `bookings.create`, `stays.changeDates` | R-10, R-28 |  | stay |
| US-06-05 | ตรวจวัคซีนก่อนรับฝาก | M5 | C-15, C-33, L-03 | `branch.updatePolicy`, `vaccinations.verify`, `stays.checkIn`, `liff.addVaccination` | R-11 | staff.vaccine_review | pet_vaccination |
| US-11-04 | จอง Hotel ใน LINE | M5 | L-05 | `liff.hotelAvailability`, `liff.quote`, `liff.createBooking` | R-03, R-10, R-11, R-12, R-28 |  | stay |
| US-06-13 | Daycare | M5 | C-03, C-17, C-40 | `daycareTypes.list`, `daycareTypes.upsert`, `availability.daycare`, `bookings.create`, `daycare.list`, `daycare.check_in`, `daycare.check_out` | R-29 |  | daycare_session_type, daycare_rate, daycare_visit |
| US-11-05 | จอง Daycare ใน LINE | M5 | L-06 | `liff.daycareAvailability`, `liff.quote`, `liff.createBooking` | R-03, R-11, R-29 |  | daycare_visit |
| US-06-07 | Stay + Groom bundle | M5 | C-03 | `bookings.create` |  |  |  |
| US-11-06 | เพิ่มอาบน้ำก่อนกลับตอนจอง Hotel | M5 | L-05 | `liff.createBooking` |  |  |  |
| US-06-02 | ราคาห้องและเวลาเช็คอิน/เอาท์ | M5 | C-39 | `roomTypes.setRates` |  |  | room_rate |
| US-06-04 | Room map | M5 | C-13 | `roomUnits.housekeeping`, `availability.hotel`, `stays.changeRoom`, `roomMap.get` | R-28 |  | room_unit, stay |
| US-06-06 | Add-on ระหว่างพัก | M5 | C-15, C-37 | `services.create`, `stays.addAddon`, `stays.removeAddon` | R-03 |  | service, stay_addon |
| US-06-08 | ฟอร์มรับฝาก + ลายเซ็น | M5 | C-15 | `stays.get`, `stays.saveIntake`, `stays.signAgreement`, `stays.checkIn` | R-26 |  | consent_document, stay_intake, stay_medication, stay_belonging |
| US-06-09 | งานดูแลรายวัน | M5 | C-15, C-16, S-04 | `stays.checkIn`, `careTasks.list`, `careTasks.done`, `careTasks.skip` | R-26 | staff.care_task_overdue, care_task_overdue_scan | stay_medication, care_task |
| US-06-10 | หน้าอัปเดตน้องใน LINE | M5 | S-05, L-10 | `stays.postUpdate`, `liff.stayUpdates` |  | customer.stay_checked_in, customer.stay_update | pet_photo |
| US-06-11 | Check-out | M5 | C-15 | `stays.checkOut` |  |  | stay, stay_belonging |
| US-06-12 | รายชื่อเข้า-ออกวันนี้ | M5 | C-14 | `stays.today` |  |  |  |
| US-10-02 | Stay report | M5 | S-03, L-11 | `reportCards.update`, `liff.reportCard` |  | customer.report_card | report_card |
| US-12-01 | Dashboard วันนี้ | M6 | C-01 | `dashboard.today` |  |  |  |
| US-12-02 | รายงานยอดขาย | M6 | C-23 | `reports.sales` |  |  |  |
| US-12-04 | Occupancy | M6 | C-25 | `reports.occupancy` |  |  |  |
| US-12-05 | สรุปรายวันถึงเจ้าของ | M6 | C-33 | `cron.tick` |  | owner.daily_summary, owner_daily_summary | scheduled_job |
| US-12-06 | Export CSV | M6 | C-23 | `exports.csv` |  |  |  |
| US-13-12 | Analytics วัดผลนำร่อง | M6 | AD-06 | `admin.analytics` |  |  |  |
