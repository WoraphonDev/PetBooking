# 05 — API Contract (REST, field-level)

## 0. ข้อตกลงร่วม

| เรื่อง | ข้อกำหนด |
|---|---|
| Base path | `/api/v1` — Next.js Route Handlers ใน `apps/web/app/api/v1/**/route.ts` (handler บาง: parse → เรียก service ใน `packages/server` → map error) |
| Namespace = การยืนยันตัวตน | `/api/v1/staff/*` (cookie `sid`, role owner/front_desk/staff), `/api/v1/liff/{branchSlug}/*` (cookie `cid` ลูกค้า), `/api/v1/admin/*` (cookie `aid`), `/api/v1/auth/*` + `/api/v1/public/*` (ไม่ต้องล็อกอิน), `/api/webhooks/*`, `/api/cron/*` |
| Tenant | `organizationId`/`branchId` มาจาก session เท่านั้น — **ห้ามรับจาก body/query**; ทุก query ผ่าน repository ที่บังคับ `where organization_id = ctx.orgId` |
| Validation | zod schema ใน `packages/contracts/src/endpoints/<key>.ts` (1 ไฟล์ต่อ endpoint) ชื่อ `<Key>Request` / `<Key>Query` / `<Key>Response`; DTO ที่ใช้ร่วมอยู่ `packages/contracts/src/dto/<kebab-name>.ts` (key = คอลัมน์ Key ด้านล่าง เช่น `bookings.create` → `BookingsCreateRequest`) ใช้ร่วม client/server |
| JSON | camelCase; เงิน = integer `*Satang`; instant = ISO-8601 UTC (`2026-10-05T03:00:00.000Z`); วันท้องถิ่น = `YYYY-MM-DD`; เวลาในวัน = `HH:MM`; id = uuid |
| Error | `{ "error": { "code": "SLOT_TAKEN", "message": "ข้อความไทย", "details": {…} } }` + HTTP status ตาม §1; field errors → `VALIDATION_FAILED` + `details.fields` |
| Pagination | `?limit=50&cursor=…` (limit ≤ 200) → `{ items: […], nextCursor: string \| null }` = `Paged<T>` |
| Concurrency | state transition ใช้ conditional UPDATE (03); เงินใช้ `expectedPaidSatang` (R-15) |
| Warnings | response อาจมี `warnings: [{ code, message, data }]` (ไม่ใช่ error) เช่น นัดที่ได้รับผลจากการปิดร้าน |
| Rate limit | auth 10/นาที/IP, LIFF slot search 30/นาที/ผู้ใช้, อื่น ๆ 120/นาที/session (in-memory/DB token bucket — ไม่ใช้บริการเสียเงิน) |
| Role staff | ข้อมูลติดต่อลูกค้า (phone/email/address/internalNote/credit) ถูกตัดจาก response ใน serializer |
| Support mode | session ที่มี `support_access_log_id` → ทุก method ที่ไม่ใช่ GET ตอบ `SUPPORT_READ_ONLY` |

## 1. Error codes

| code | HTTP | ข้อความ (th) | เมื่อไร |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | กรุณาเข้าสู่ระบบ | ไม่มี session หรือหมดอายุ |
| `FORBIDDEN` | 403 | คุณไม่มีสิทธิ์ทำรายการนี้ | role ไม่อยู่ใน permission matrix |
| `SUPPORT_READ_ONLY` | 403 | โหมดช่วยเหลือดูข้อมูลได้อย่างเดียว | support session พยายามเขียน |
| `NOT_FOUND` | 404 | ไม่พบข้อมูล | ไม่พบ หรืออยู่คนละ organization (ห้ามตอบ 403 เพื่อไม่เปิดเผยว่ามีอยู่) |
| `VALIDATION_FAILED` | 422 | ข้อมูลไม่ถูกต้อง | zod ไม่ผ่าน — details.fields = {path: message} |
| `INVALID_TRANSITION` | 409 | สถานะรายการเปลี่ยนไปแล้ว กรุณารีเฟรช | UPDATE … WHERE status = from ได้ 0 แถว |
| `STALE_BILL` | 409 | บิลถูกแก้ไขจากอีกเครื่อง กรุณารีเฟรช | expectedPaidSatang ไม่ตรง (R-15) |
| `RATE_LIMITED` | 429 | ทำรายการถี่เกินไป กรุณารอสักครู่ | เกิน rate limit |
| `INTERNAL` | 500 | ระบบขัดข้อง กรุณาลองใหม่ | exception ที่ไม่คาดไว้ (log + Sentry) |
| `INVALID_CREDENTIALS` | 401 | อีเมลหรือรหัสผ่านไม่ถูกต้อง | R-24 |
| `ACCOUNT_LOCKED` | 423 | บัญชีถูกล็อกชั่วคราว ลองใหม่ใน 15 นาที | R-24 |
| `PASSWORD_POLICY` | 422 | รหัสผ่านต้องยาว 8 ตัวขึ้นไป และไม่ใช่ตัวเลขล้วน | R-24 — details.reason |
| `TOKEN_INVALID` | 400 | ลิงก์ไม่ถูกต้องหรือหมดอายุ | invite/reset token ไม่พบ/หมดอายุ/ใช้แล้ว |
| `LINE_TOKEN_INVALID` | 401 | ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดใหม่จาก LINE | verify ID token ไม่ผ่าน |
| `NOT_REGISTERED` | 403 | กรุณาลงทะเบียนก่อนใช้งาน | LIFF session ที่ยังไม่มี customer |
| `LAST_OWNER` | 409 | ต้องมีเจ้าของร้านอย่างน้อย 1 คน | ลด role/ปิด owner คนสุดท้าย |
| `EMAIL_TAKEN` | 409 | อีเมลนี้ถูกใช้แล้ว | unique staff_user.email |
| `SLUG_TAKEN` | 409 | ชื่อลิงก์นี้ถูกใช้แล้ว | unique slug/booking_slug |
| `CODE_TAKEN` | 409 | รหัสนี้ถูกใช้แล้ว | unique code (room_unit, size_tier) |
| `IN_USE` | 409 | ใช้งานอยู่ ลบไม่ได้ — ให้ปิดใช้งานแทน | FK violation 23503 ตอนลบ หรือ service ตรวจเองเมื่อ FK เป็น cascade/set null (เช่น sizeTiers.set — Q-0029) |
| `SIZE_TIER_OVERLAP` | 422 | ช่วงน้ำหนักทับกัน | R-01 |
| `INVALID_PHONE` | 422 | เบอร์โทรไม่ถูกต้อง | R-22 |
| `LINK_REQUEST_PENDING` | 409 | มีคำขอจับคู่บัญชีรอร้านยืนยันอยู่ | customer_link_request pending |
| `MODULE_DISABLED` | 422 | ร้านยังไม่เปิดบริการนี้ | branch.module_* = false |
| `BRANCH_CLOSED` | 422 | ร้านปิดในวันที่เลือก | branch_hours / branch_closure |
| `OUTSIDE_BOOKING_WINDOW` | 422 | วันที่เลือกอยู่นอกช่วงที่จองได้ | R-04 lead/horizon |
| `SLOT_TAKEN` | 409 | คิวนี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่ | 23P01 groom_appt_*_no_overlap หรือ slot ไม่อยู่ในผล R-04 |
| `ROOM_TAKEN` | 409 | ห้องเต็มในช่วงวันที่เลือก | 23P01 stay_room_no_overlap / R-10 none_free |
| `PET_ALREADY_BOOKED` | 409 | น้องมีการจองที่ทับช่วงเวลานี้แล้ว | 23P01 stay_pet_no_overlap / นัดกรูมทับกัน |
| `DAYCARE_FULL` | 409 | รอบ Daycare นี้เต็มแล้ว | R-29 |
| `PRICE_NOT_FOUND` | 422 | บริการนี้ไม่มีราคาสำหรับขนาด/ขนของน้อง | R-02 |
| `WEIGHT_REQUIRED` | 422 | กรุณาระบุน้ำหนักหรือขนาดของน้อง | R-01 no_weight และไม่ได้เลือกขนาด |
| `DURATION_ZERO` | 422 | กรุณาเลือกบริการหลักอย่างน้อย 1 รายการ | R-03 |
| `INVALID_DATE_RANGE` | 422 | ช่วงวันที่ไม่ถูกต้อง | R-03 |
| `CUSTOMER_BLACKLISTED` | 403 | ไม่สามารถจองออนไลน์ได้ กรุณาติดต่อร้าน | R-12 |
| `PET_INACTIVE` | 422 | โปรไฟล์น้องไม่พร้อมใช้งาน | R-12 |
| `SPECIES_NOT_ALLOWED` | 422 | บริการนี้ไม่รองรับชนิดสัตว์ของน้อง | R-12 |
| `BREED_REJECTED` | 422 | ขออภัย ร้านยังไม่รับสายพันธุ์นี้ | R-12 |
| `PET_TOO_HEAVY` | 422 | น้ำหนักน้องเกินที่ร้านรับได้ | R-12 |
| `PET_TOO_YOUNG` | 422 | น้องอายุยังไม่ถึงเกณฑ์ของห้องนี้ | R-12 |
| `IN_HEAT_NOT_ALLOWED` | 422 | ห้องนี้ไม่รับน้องที่อยู่ในช่วงติดสัด | R-12 |
| `REACTIVE_NOT_ALLOWED` | 422 | ห้องนี้ไม่รับน้องที่มีนิสัยก้าวร้าว | R-12 |
| `VACCINE_REQUIRED` | 422 | วัคซีนของน้องไม่ครบหรือหมดอายุ | R-11 — details {missing, expired, pendingReview} |
| `STATUS_NOT_ALLOWED` | 409 | ทำรายการนี้ในสถานะปัจจุบันไม่ได้ | R-21 / guard ของ state machine |
| `TOO_LATE_TO_RESCHEDULE` | 422 | เลยเวลาที่เลื่อนนัดเองได้ กรุณาติดต่อร้าน | R-21 |
| `RESCHEDULE_LIMIT` | 422 | เลื่อนนัดครบจำนวนครั้งแล้ว กรุณาติดต่อร้าน | R-21 |
| `HOLD_EXPIRED` | 410 | หมดเวลาชำระมัดจำ คิวถูกปล่อยแล้ว | R-08 |
| `CONSENT_REQUIRED` | 422 | ต้องเซ็นใบยินยอมก่อน | เช็คอินกรูมที่เลือกเหตุผลเสี่ยง / เช็คอิน Hotel |
| `INTAKE_INCOMPLETE` | 422 | กรอกฟอร์มรับฝากให้ครบก่อนเช็คอิน | stay_intake.completed_at = null |
| `PROMPTPAY_NOT_CONFIGURED` | 422 | ร้านยังไม่ได้ตั้งค่าบัญชี PromptPay | branch.promptpay_id = null |
| `INVALID_PROMPTPAY_ID` | 422 | หมายเลข PromptPay ไม่ถูกต้อง | R-30 |
| `DUPLICATE_SLIP_CONFIRM_REQUIRED` | 409 | สลิปนี้เคยถูกใช้แล้ว ต้องยืนยันซ้ำอีกครั้ง | R-05 duplicate และไม่ได้ส่ง confirmDuplicate=true |
| `INVALID_AMOUNT` | 422 | จำนวนเงินไม่ถูกต้อง | R-15 |
| `AMOUNT_EXCEEDS_DUE` | 422 | ยอดเกินยอดค้างชำระ | R-15 |
| `INSUFFICIENT_CREDIT` | 422 | เครดิตคงเหลือไม่พอ | R-15 |
| `BILL_ALREADY_PAID` | 409 | บิลนี้ชำระครบแล้ว | R-15 |
| `BILL_HAS_DUE` | 409 | ยังมียอดค้างชำระ | ปิดบิลขณะ due > 0 |
| `BILL_NOT_OPEN` | 409 | บิลนี้ปิดหรือยกเลิกแล้ว | แก้ไขบิลที่ไม่ใช่ open |
| `LINE_DISCOUNT_TOO_LARGE` | 422 | ส่วนลดเกินราคาสินค้า | R-15 |
| `BILL_DISCOUNT_TOO_LARGE` | 422 | ส่วนลดเกินยอดบิล | R-15 |
| `DISCOUNT_LIMIT_EXCEEDED` | 403 | ส่วนลดเกิน 20% ต้องให้เจ้าของร้านอนุมัติ | R-15 |
| `REASON_REQUIRED` | 422 | กรุณาระบุเหตุผล | R-27 |
| `PACKAGE_NOT_ACTIVE` | 422 | แพ็กเกจนี้ใช้ไม่ได้แล้ว | R-14 |
| `PACKAGE_EXHAUSTED` | 422 | แพ็กเกจนี้ใช้ครบแล้ว | R-14 |
| `PACKAGE_EXPIRED` | 422 | แพ็กเกจหมดอายุแล้ว | R-14 |
| `PACKAGE_SERVICE_MISMATCH` | 422 | แพ็กเกจนี้ใช้กับบริการนี้ไม่ได้ | R-14 |
| `PACKAGE_SIZE_MISMATCH` | 422 | แพ็กเกจนี้ใช้กับขนาดนี้ไม่ได้ | R-14 |
| `PACKAGE_PET_MISMATCH` | 422 | แพ็กเกจนี้เป็นของน้องตัวอื่น | R-14 |
| `UPLOAD_KIND_NOT_ALLOWED` | 422 | ไม่รองรับไฟล์ประเภทนี้ | R-25 |
| `UPLOAD_TYPE_NOT_ALLOWED` | 422 | ไม่รองรับชนิดไฟล์นี้ | R-25 |
| `UPLOAD_TOO_LARGE` | 422 | ไฟล์ใหญ่เกินกำหนด | R-25 |
| `FILE_NOT_UPLOADED` | 422 | อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่ | commit ไฟล์ที่ไม่มีใน storage |
| `LINE_NOT_CONNECTED` | 422 | ร้านยังไม่ได้เชื่อม LINE OA | line_channel.status ≠ active |
| `LINE_API_ERROR` | 502 | เชื่อมต่อ LINE ไม่สำเร็จ | LINE API ตอบ error |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | invalid signature | x-line-signature ไม่ตรง |
| `IMPORT_HAS_ERRORS` | 422 | ไฟล์มีแถวที่ผิด กรุณาแก้แล้วอัปโหลดใหม่ | commit import ที่ error_rows > 0 |
| `CRON_FORBIDDEN` | 401 | forbidden | header x-cron-secret ไม่ตรง |

## 2. Response DTOs

แต่ละฟิลด์ระบุแหล่งข้อมูล — `table.column` = อ่านตรงจากคอลัมน์ (ชนิด/ความหมายตาม 02), `calc:` = คำนวณ, `dto:` = ซ้อน DTO อื่น · คอลัมน์ที่ 02 ระบุว่า null ได้ → ฟิลด์ใน DTO เป็น `T | null` (zod `.nullable()`) เสมอ


<a id="dto-StaffMe"></a>

### StaffMe

ข้อมูล session ของพนักงาน · `staff.email` เป็น `string | null` (staff ที่ใช้ LINE อย่างเดียว) · **Support mode** (session ของ platform admin, Q-0014): `staff.id` = platform_admin.id, `staff.displayName` = platform_admin.display_name, `staff.email` = platform_admin.email, `staff.role` = `owner`, `staff.isGroomer` = false, `staff.lineLinked` = false, `permissions` = ของ owner (การเขียนยังถูกกันด้วย SUPPORT_READ_ONLY), `supportMode` = true; organization/branch มาจาก session

| field | source |
|---|---|
| `staff.id` | staff_user.id |
| `staff.displayName` | staff_user.display_name |
| `staff.email` | staff_user.email |
| `staff.role` | staff_user.role |
| `staff.isGroomer` | staff_user.is_groomer |
| `staff.lineLinked` | calc: staff_user.line_user_id is not null |
| `organization.id` | organization.id |
| `organization.name` | organization.name |
| `organization.status` | organization.status |
| `branch.id` | branch.id |
| `branch.name` | branch.name |
| `branch.bookingSlug` | branch.booking_slug |
| `branch.timezone` | branch.timezone |
| `branch.modules.grooming` | branch.module_grooming |
| `branch.modules.hotel` | branch.module_hotel |
| `branch.modules.daycare` | branch.module_daycare |
| `permissions[]` | calc: 08-permissions — รายการ permission key ของ role |
| `supportMode` | calc: session.support_access_log_id is not null |

<a id="dto-BranchSettings"></a>

### BranchSettings

ตั้งค่าสาขาทั้งหมด

| field | source |
|---|---|
| `id` | branch.id |
| `name` | branch.name |
| `bookingSlug` | branch.booking_slug |
| `phone` | branch.phone |
| `addressLine` | branch.address_line |
| `subdistrict` | branch.subdistrict |
| `district` | branch.district |
| `province` | branch.province |
| `postalCode` | branch.postal_code |
| `latitude` | branch.latitude |
| `longitude` | branch.longitude |
| `logoUrl` | calc: signed URL ของ branch.logo_file_id |
| `facebookUrl` | branch.facebook_url |
| `instagramUrl` | branch.instagram_url |
| `receiptPrefix` | branch.receipt_prefix |
| `modules.grooming` | branch.module_grooming |
| `modules.hotel` | branch.module_hotel |
| `modules.daycare` | branch.module_daycare |
| `hours[].weekday` | branch_hours.weekday |
| `hours[].isClosed` | branch_hours.is_closed |
| `hours[].opensAt` | branch_hours.opens_at |
| `hours[].closesAt` | branch_hours.closes_at |
| `promptpay.type` | branch.promptpay_type |
| `promptpay.idMasked` | calc: branch.promptpay_id แสดง 3 ตัวท้าย เช่น ***-***-5678 |
| `promptpay.accountName` | branch.promptpay_account_name |
| `policy` | dto:BranchPolicy |

<a id="dto-BranchPolicy"></a>

### BranchPolicy

นโยบายสาขา

| field | source |
|---|---|
| `defaultDepositType` | branch_policy.default_deposit_type |
| `defaultDepositValue` | branch_policy.default_deposit_value |
| `groomingFreeCancelHours` | branch_policy.grooming_free_cancel_hours |
| `hotelFreeCancelHours` | branch_policy.hotel_free_cancel_hours |
| `daycareFreeCancelHours` | branch_policy.daycare_free_cancel_hours |
| `lateCancelForfeitPercent` | branch_policy.late_cancel_forfeit_percent |
| `cancelRefundMode` | branch_policy.cancel_refund_mode |
| `bookingLeadMinutes` | branch_policy.booking_lead_minutes |
| `bookingHorizonDays` | branch_policy.booking_horizon_days |
| `rescheduleCutoffHours` | branch_policy.reschedule_cutoff_hours |
| `noShowGraceMinutes` | branch_policy.no_show_grace_minutes |
| `slotStepMinutes` | branch_policy.slot_step_minutes |
| `bufferMinutes` | branch_policy.buffer_minutes |
| `maxAppointmentsPerDay` | branch_policy.max_appointments_per_day |
| `maxAppointmentsPerGroomerDay` | branch_policy.max_appointments_per_groomer_day |
| `holdMinutes` | branch_policy.hold_minutes |
| `approvalTimeoutMinutes` | branch_policy.approval_timeout_minutes |
| `autoConfirmGrooming` | branch_policy.auto_confirm_grooming |
| `autoConfirmHotel` | branch_policy.auto_confirm_hotel |
| `autoConfirmDaycare` | branch_policy.auto_confirm_daycare |
| `requiredVaccinesDog[]` | branch_policy.required_vaccines_dog |
| `requiredVaccinesCat[]` | branch_policy.required_vaccines_cat |
| `enforceVaccinesGrooming` | branch_policy.enforce_vaccines_grooming |
| `rejectedBreeds[]` | branch_policy.rejected_breeds |
| `maxPetWeightGrams` | branch_policy.max_pet_weight_grams |
| `groomingConsentText` | branch_policy.grooming_consent_text |
| `boardingAgreementText` | branch_policy.boarding_agreement_text |
| `policyText` | branch_policy.policy_text |
| `reminder24hEnabled` | branch_policy.reminder_24h_enabled |
| `economyMode` | branch_policy.economy_mode |
| `nextGroomDefaultDays` | branch_policy.next_groom_default_days |
| `googleReviewUrl` | branch_policy.google_review_url |
| `reportCardRequiresReview` | branch_policy.report_card_requires_review |
| `dailySummaryTime` | branch_policy.daily_summary_time |

<a id="dto-LineStatus"></a>

### LineStatus

สถานะ LINE OA ของสาขา + โควตา

| field | source |
|---|---|
| `status` | line_channel.status |
| `botBasicId` | line_channel.bot_basic_id |
| `addFriendUrl` | calc: https://line.me/R/ti/p/{bot_basic_id} |
| `liffUrl` | calc: https://liff.line.me/{line_channel.liff_id} |
| `monthlyPushQuota` | line_channel.monthly_push_quota |
| `usedThisMonth` | calc: count notification channel=line_push status=sent month_key=เดือนนี้ |
| `skippedThisMonth` | calc: count notification status=skipped month_key=เดือนนี้ |
| `webhookVerifiedAt` | line_channel.webhook_verified_at |

<a id="dto-StaffUserItem"></a>

### StaffUserItem

พนักงาน 1 คน

| field | source |
|---|---|
| `id` | staff_user.id |
| `displayName` | staff_user.display_name |
| `email` | staff_user.email |
| `phone` | staff_user.phone |
| `role` | staff_user.role |
| `isGroomer` | staff_user.is_groomer |
| `status` | staff_user.status |
| `sortOrder` | staff_user.sort_order |
| `photoUrl` | calc: signed URL staff_user.photo_file_id |
| `lineLinked` | calc: staff_user.line_user_id is not null |
| `lastLoginAt` | staff_user.last_login_at |
| `workingHours[]` | []dto:WorkingHours |

<a id="dto-WorkingHours"></a>

### WorkingHours

เวลาทำงาน 1 วัน

| field | source |
|---|---|
| `weekday` | staff_working_hours.weekday |
| `startsAt` | staff_working_hours.starts_at |
| `endsAt` | staff_working_hours.ends_at |
| `breakStartsAt` | staff_working_hours.break_starts_at |
| `breakEndsAt` | staff_working_hours.break_ends_at |

<a id="dto-CustomerListItem"></a>

### CustomerListItem

แถวในรายการลูกค้า/ผลค้นหา

| field | source |
|---|---|
| `id` | customer.id |
| `firstName` | owner_profile.first_name |
| `lastName` | owner_profile.last_name |
| `nickname` | owner_profile.nickname |
| `phone` | owner_profile.phone_e164 |
| `pets[].id` | pet.id |
| `pets[].name` | pet.name |
| `pets[].species` | pet.species |
| `reliabilityLevel` | calc: coalesce(customer.reliability_override, customer.reliability_level) |
| `blacklisted` | customer.blacklisted |
| `lastVisitAt` | customer.last_visit_at |
| `visitCount` | customer.visit_count |
| `creditBalanceSatang` | customer.credit_balance_satang |
| `lineLinked` | calc: มี line_identity ของ owner_profile |

<a id="dto-CustomerDetail"></a>

### CustomerDetail

รายละเอียดลูกค้า

| field | source |
|---|---|
| `id` | customer.id |
| `ownerProfileId` | owner_profile.id |
| `firstName` | owner_profile.first_name |
| `lastName` | owner_profile.last_name |
| `nickname` | owner_profile.nickname |
| `phone` | owner_profile.phone_e164 |
| `email` | owner_profile.email |
| `birthDate` | owner_profile.birth_date |
| `addressLine` | owner_profile.address_line |
| `subdistrict` | owner_profile.subdistrict |
| `district` | owner_profile.district |
| `province` | owner_profile.province |
| `postalCode` | owner_profile.postal_code |
| `sourceChannel` | customer.source_channel |
| `referralNote` | customer.referral_note |
| `emergencyContactName` | customer.emergency_contact_name |
| `emergencyContactPhone` | customer.emergency_contact_phone |
| `internalNote` | customer.internal_note |
| `reliabilityLevel` | customer.reliability_level |
| `reliabilityOverride` | customer.reliability_override |
| `lateCancelCount12m` | customer.late_cancel_count_12m |
| `noShowCount12m` | customer.no_show_count_12m |
| `blacklisted` | customer.blacklisted |
| `blacklistReason` | customer.blacklist_reason |
| `depositExempt` | customer.deposit_exempt |
| `photoConsent` | customer.photo_consent |
| `visitCount` | customer.visit_count |
| `firstVisitAt` | customer.first_visit_at |
| `lastVisitAt` | customer.last_visit_at |
| `creditBalanceSatang` | customer.credit_balance_satang |
| `line.displayName` | line_identity.display_name |
| `line.pictureUrl` | line_identity.picture_url |
| `line.isFriend` | line_identity.is_friend |
| `pets[]` | []dto:PetSummary |
| `activePackages[]` | []dto:CustomerPackageItem |
| `upcomingBookings[]` | []dto:BookingListItem |

<a id="dto-PetSummary"></a>

### PetSummary

น้องแบบย่อ

| field | source |
|---|---|
| `id` | pet.id |
| `name` | pet.name |
| `species` | pet.species |
| `breed` | pet.breed |
| `sex` | pet.sex |
| `coatType` | pet.coat_type |
| `latestWeightGrams` | pet.latest_weight_grams |
| `status` | pet.status |
| `photoUrl` | calc: signed URL pet.profile_file_id |
| `flags[]` | pet_temperament_flag.flag |
| `ageMonths` | calc: R-12 ageInMonths |
| `vaccineStatus` | calc: R-11 กับ required ของสาขา ณ วันนี้ → ok \| warning \| missing |

<a id="dto-PetDetail"></a>

### PetDetail

น้องแบบเต็ม (ข้อมูลกลาง + ข้อมูลของร้าน)

| field | source |
|---|---|
| `id` | pet.id |
| `ownerProfileId` | pet.owner_profile_id |
| `name` | pet.name |
| `species` | pet.species |
| `speciesOther` | pet.species_other |
| `breed` | pet.breed |
| `sex` | pet.sex |
| `birthDate` | pet.birth_date |
| `ageEstimateMonths` | pet.age_estimate_months |
| `neutered` | pet.neutered |
| `color` | pet.color |
| `microchipNo` | pet.microchip_no |
| `coatType` | pet.coat_type |
| `latestWeightGrams` | pet.latest_weight_grams |
| `status` | pet.status |
| `photoUrl` | calc: signed URL pet.profile_file_id |
| `shop.preferredStyle` | pet_shop_profile.preferred_style |
| `shop.bladeNo` | pet_shop_profile.blade_no |
| `shop.shampooOk` | pet_shop_profile.shampoo_ok |
| `shop.shampooAvoid` | pet_shop_profile.shampoo_avoid |
| `shop.allergies` | pet_shop_profile.allergies |
| `shop.conditions` | pet_shop_profile.conditions |
| `shop.medications` | pet_shop_profile.medications |
| `shop.vetClinicName` | pet_shop_profile.vet_clinic_name |
| `shop.vetClinicPhone` | pet_shop_profile.vet_clinic_phone |
| `shop.internalNote` | pet_shop_profile.internal_note |
| `shop.sharedNote` | pet_shop_profile.shared_note |
| `shop.favoriteStylePhotoUrl` | calc: signed URL ของ pet_shop_profile.favorite_style_photo_id |
| `shop.groomIntervalDays` | pet_shop_profile.groom_interval_days |
| `shop.lastGroomedAt` | pet_shop_profile.last_groomed_at |
| `flags[]` | []dto:TemperamentFlagItem |
| `weights[]` | []dto:WeightItem |
| `vaccinations[]` | []dto:VaccinationItem |
| `nextGroomDue` | calc: R-17 |

<a id="dto-TemperamentFlagItem"></a>

### TemperamentFlagItem

ป้ายนิสัย

| field | source |
|---|---|
| `flag` | pet_temperament_flag.flag |
| `note` | pet_temperament_flag.note |

<a id="dto-WeightItem"></a>

### WeightItem

น้ำหนัก 1 ครั้ง

| field | source |
|---|---|
| `weightGrams` | pet_weight.weight_grams |
| `measuredAt` | pet_weight.measured_at |
| `source` | pet_weight.source |

<a id="dto-VaccinationItem"></a>

### VaccinationItem

วัคซีน 1 รายการ

| field | source |
|---|---|
| `id` | pet_vaccination.id |
| `vaccineCode` | pet_vaccination.vaccine_code |
| `vaccineName` | vaccine_type.name_th |
| `administeredOn` | pet_vaccination.administered_on |
| `expiresOn` | pet_vaccination.expires_on |
| `status` | pet_vaccination.status |
| `source` | pet_vaccination.source |
| `proofUrl` | calc: signed URL pet_vaccination.proof_file_id |
| `rejectReason` | pet_vaccination.reject_reason |

<a id="dto-PhotoItem"></a>

### PhotoItem

รูปน้อง

| field | source |
|---|---|
| `id` | pet_photo.id |
| `kind` | pet_photo.kind |
| `url` | calc: signed URL file_object |
| `caption` | pet_photo.caption |
| `takenAt` | pet_photo.taken_at |
| `appointmentId` | pet_photo.appointment_id |
| `stayId` | pet_photo.stay_id |

<a id="dto-SizeTierItem"></a>

### SizeTierItem

ขนาด

| field | source |
|---|---|
| `id` | size_tier.id |
| `species` | size_tier.species |
| `code` | size_tier.code |
| `labelTh` | size_tier.label_th |
| `minWeightGrams` | size_tier.min_weight_grams |
| `maxWeightGrams` | size_tier.max_weight_grams |
| `sortOrder` | size_tier.sort_order |

<a id="dto-ServiceItem"></a>

### ServiceItem

บริการ + ตารางราคา

| field | source |
|---|---|
| `id` | service.id |
| `scope` | service.scope |
| `category` | service.category |
| `nameTh` | service.name_th |
| `description` | service.description |
| `photoUrl` | calc: signed URL service.photo_file_id |
| `speciesAllowed[]` | service.species_allowed |
| `isAddon` | service.is_addon |
| `addonPerDay` | service.addon_per_day |
| `onlineBookable` | service.online_bookable |
| `estCostSatang` | service.est_cost_satang |
| `sortOrder` | service.sort_order |
| `status` | service.status |
| `prices[].sizeTierId` | service_price.size_tier_id |
| `prices[].coatGroup` | service_price.coat_group |
| `prices[].priceSatang` | service_price.price_satang |
| `prices[].durationMinutes` | service_price.duration_minutes |
| `addonForServiceIds[]` | service_addon_link.base_service_id |
| `fromPriceSatang` | calc: min(service_price.price_satang) |

<a id="dto-SurchargeTypeItem"></a>

### SurchargeTypeItem

ค่าบริการเพิ่มที่ตั้งไว้

| field | source |
|---|---|
| `id` | surcharge_type.id |
| `nameTh` | surcharge_type.name_th |
| `defaultAmountSatang` | surcharge_type.default_amount_satang |
| `status` | surcharge_type.status |

<a id="dto-RoomTypeItem"></a>

### RoomTypeItem

ประเภทห้อง + ราคา

| field | source |
|---|---|
| `id` | room_type.id |
| `nameTh` | room_type.name_th |
| `description` | room_type.description |
| `photoUrl` | calc: signed URL room_type.photo_file_id |
| `speciesAllowed[]` | room_type.species_allowed |
| `maxWeightGrams` | room_type.max_weight_grams |
| `minAgeMonths` | room_type.min_age_months |
| `allowInHeat` | room_type.allow_in_heat |
| `allowReactive` | room_type.allow_reactive |
| `amenities[]` | room_type.amenities |
| `includedText` | room_type.included_text |
| `onlineBookable` | room_type.online_bookable |
| `sortOrder` | room_type.sort_order |
| `status` | room_type.status |
| `rates[].sizeTierId` | room_rate.size_tier_id |
| `rates[].nightlyPriceSatang` | room_rate.nightly_price_satang |
| `unitCount` | calc: count room_unit active |

<a id="dto-RoomUnitItem"></a>

### RoomUnitItem

ห้อง

| field | source |
|---|---|
| `id` | room_unit.id |
| `roomTypeId` | room_unit.room_type_id |
| `code` | room_unit.code |
| `zone` | room_unit.zone |
| `status` | room_unit.status |
| `housekeeping` | room_unit.housekeeping |
| `sortOrder` | room_unit.sort_order |

<a id="dto-DaycareSessionTypeItem"></a>

### DaycareSessionTypeItem

รอบ Daycare + ราคา

| field | source |
|---|---|
| `id` | daycare_session_type.id |
| `session` | daycare_session_type.session |
| `nameTh` | daycare_session_type.name_th |
| `startsAt` | daycare_session_type.starts_at |
| `endsAt` | daycare_session_type.ends_at |
| `capacity` | daycare_session_type.capacity |
| `status` | daycare_session_type.status |
| `rates[].sizeTierId` | daycare_rate.size_tier_id |
| `rates[].priceSatang` | daycare_rate.price_satang |

<a id="dto-PackageTemplateItem"></a>

### PackageTemplateItem

แพ็กเกจที่ขาย

| field | source |
|---|---|
| `id` | package_template.id |
| `nameTh` | package_template.name_th |
| `serviceId` | package_template.service_id |
| `serviceName` | service.name_th |
| `sizeTierId` | package_template.size_tier_id |
| `sessionsCount` | package_template.sessions_count |
| `priceSatang` | package_template.price_satang |
| `validityDays` | package_template.validity_days |
| `shareScope` | package_template.share_scope |
| `status` | package_template.status |
| `unitValueSatang` | calc: R-14 |

<a id="dto-CustomerPackageItem"></a>

### CustomerPackageItem

แพ็กเกจที่ลูกค้ามี

| field | source |
|---|---|
| `id` | customer_package.id |
| `templateName` | package_template.name_th |
| `petId` | customer_package.pet_id |
| `petName` | pet.name |
| `sessionsTotal` | customer_package.sessions_total |
| `sessionsUsed` | customer_package.sessions_used |
| `sessionsLeft` | calc: sessions_total − sessions_used |
| `expiresAt` | customer_package.expires_at |
| `status` | customer_package.status |
| `redemptions[].redeemedAt` | package_redemption.redeemed_at |
| `redemptions[].petName` | pet.name |
| `redemptions[].performerName` | staff_user.display_name |
| `redemptions[].receiptNo` | bill.receipt_no |
| `redemptions[].reversedAt` | package_redemption.reversed_at |

<a id="dto-CommissionRuleItem"></a>

### CommissionRuleItem

กติกาค่ามือ

| field | source |
|---|---|
| `id` | commission_rule.id |
| `serviceId` | commission_rule.service_id |
| `staffUserId` | commission_rule.staff_user_id |
| `type` | commission_rule.type |
| `value` | commission_rule.value |

<a id="dto-SlotList"></a>

### SlotList

ผล R-04

| field | source |
|---|---|
| `date` | calc: input |
| `reason` | calc: R-04 |
| `slots[].startsAt` | calc: R-04 |
| `slots[].endsAt` | calc: R-03 |
| `slots[].groomerId` | calc: R-04 |
| `slots[].groomerName` | staff_user.display_name |
| `slots[].stationId` | calc: R-04 |
| `durationMinutes` | calc: R-03 |
| `priceSatang` | calc: R-02/R-03 |

<a id="dto-HotelAvailability"></a>

### HotelAvailability

ผล R-28 ต่อประเภทห้อง

| field | source |
|---|---|
| `roomTypes[].roomTypeId` | room_type.id |
| `roomTypes[].nameTh` | room_type.name_th |
| `roomTypes[].availableUnits` | calc: R-28 |
| `roomTypes[].nightlyPriceSatang` | calc: room_rate ตาม R-01 ของน้อง |
| `roomTypes[].eligible` | calc: R-12 |
| `roomTypes[].ineligibleReasons[]` | calc: R-12 |
| `nights` | calc: R-03 |

<a id="dto-DaycareAvailability"></a>

### DaycareAvailability

ผล R-29

| field | source |
|---|---|
| `date` | calc: input |
| `sessions[].sessionTypeId` | daycare_session_type.id |
| `sessions[].session` | daycare_session_type.session |
| `sessions[].nameTh` | daycare_session_type.name_th |
| `sessions[].available` | calc: R-29 |
| `sessions[].priceSatang` | calc: daycare_rate ตาม R-01 |

<a id="dto-Quote"></a>

### Quote

ใบเสนอราคา (R-03 + R-06)

| field | source |
|---|---|
| `groom[]` | calc: R-03 |
| `stays[]` | calc: R-03 |
| `daycareTotalSatang` | calc: R-03 |
| `estimatedTotalSatang` | calc: R-03 |
| `depositRequiredSatang` | calc: R-06 |
| `depositReason` | calc: R-06 |
| `requiresApproval` | calc: R-08 |
| `policyText` | branch_policy.policy_text |
| `cancelSummary` | calc: ข้อความสรุปจาก branch_policy free_cancel_hours/forfeit |

<a id="dto-BookingListItem"></a>

### BookingListItem

แถวรายการใบจอง

| field | source |
|---|---|
| `id` | booking.id |
| `bookingNo` | booking.booking_no |
| `status` | booking.status |
| `channel` | booking.channel |
| `customerId` | booking.customer_id |
| `customerName` | calc: owner_profile.first_name + nickname |
| `firstServiceAt` | booking.first_service_at |
| `modules[]` | calc: grooming/hotel/daycare ที่มีในใบจอง |
| `petNames[]` | pet.name |
| `estimatedTotalSatang` | booking.estimated_total_satang |
| `depositStatus` | booking.deposit_status |
| `depositRequiredSatang` | booking.deposit_required_satang |
| `holdExpiresAt` | booking.hold_expires_at |
| `approvalDueAt` | booking.approval_due_at |
| `createdAt` | booking.created_at |

<a id="dto-AffectedServiceItem"></a>

### AffectedServiceItem

รายการบริการที่ได้รับผลจากวันปิด/วันลา (closures.create, timeOff.create — Q-0028) · 1 แถวต่อ groom_appointment / stay / daycare_visit

| field | source |
|---|---|
| `module` | calc: service_scope ของรายการ — grooming (groom_appointment) \| hotel (stay) \| daycare (daycare_visit) |
| `bookingId` | booking.id |
| `bookingNo` | booking.booking_no |
| `itemId` | calc: groom_appointment.id \| stay.id \| daycare_visit.id ตาม module |
| `petName` | pet.name |
| `customerName` | calc: owner_profile.first_name + nickname |
| `startsAt` | calc: groom_appointment.starts_at (instant) เมื่อ module = grooming; อื่น ๆ = null |
| `date` | calc: วันท้องถิ่นของสาขา — วันของ groom_appointment.starts_at \| stay.check_in_date \| daycare_visit.visit_date |

<a id="dto-BookingDetail"></a>

### BookingDetail

ใบจองแบบเต็ม

| field | source |
|---|---|
| `id` | booking.id |
| `bookingNo` | booking.booking_no |
| `status` | booking.status |
| `channel` | booking.channel |
| `customer` | dto:CustomerListItem |
| `createdByType` | booking.created_by_type |
| `createdAt` | booking.created_at |
| `holdExpiresAt` | booking.hold_expires_at |
| `approvalDueAt` | booking.approval_due_at |
| `estimatedTotalSatang` | booking.estimated_total_satang |
| `depositRequiredSatang` | booking.deposit_required_satang |
| `depositStatus` | booking.deposit_status |
| `depositVerifiedSatang` | booking.deposit_verified_satang |
| `policySnapshot` | booking.policy_snapshot |
| `customerNote` | booking.customer_note |
| `rescheduleCount` | booking.reschedule_count |
| `confirmedAt` | booking.confirmed_at |
| `cancelledAt` | booking.cancelled_at |
| `cancelledByType` | booking.cancelled_by_type |
| `cancelReason` | booking.cancel_reason |
| `firstServiceAt` | booking.first_service_at |
| `billId` | booking.bill_id |
| `groom[]` | []dto:AppointmentCard |
| `stays[]` | []dto:StayCard |
| `daycare[]` | []dto:DaycareVisitItem |
| `slips[]` | []dto:SlipItem |
| `payment` | dto:PaymentInstruction |
| `events[]` | []dto:BookingEventItem |

<a id="dto-BookingEventItem"></a>

### BookingEventItem

ประวัติสถานะ

| field | source |
|---|---|
| `entityType` | booking_event.entity_type |
| `fromStatus` | booking_event.from_status |
| `toStatus` | booking_event.to_status |
| `actorType` | booking_event.actor_type |
| `reason` | booking_event.reason |
| `at` | booking_event.created_at |

<a id="dto-PaymentInstruction"></a>

### PaymentInstruction

ข้อมูลให้ลูกค้าโอน (มัดจำ/ยอดค้าง)

| field | source |
|---|---|
| `amountSatang` | calc: deposit_required − deposit_verified หรือ bill due |
| `promptpayPayload` | calc: R-30 |
| `accountName` | branch.promptpay_account_name |
| `promptpayIdMasked` | calc: branch.promptpay_id 3 ตัวท้าย |
| `expiresAt` | booking.hold_expires_at |

<a id="dto-AppointmentCard"></a>

### AppointmentCard

นัดกรูม (การ์ดในปฏิทิน/ใบจอง)

| field | source |
|---|---|
| `id` | groom_appointment.id |
| `bookingId` | groom_appointment.booking_id |
| `bookingNo` | booking.booking_no |
| `status` | groom_appointment.status |
| `startsAt` | groom_appointment.starts_at |
| `endsAt` | groom_appointment.ends_at |
| `blockedUntil` | groom_appointment.blocked_until |
| `groomerId` | groom_appointment.groomer_id |
| `groomerName` | staff_user.display_name |
| `groomerPreference` | groom_appointment.groomer_preference |
| `stationId` | groom_appointment.station_id |
| `stationName` | groom_station.name |
| `pet` | dto:PetSummary |
| `customerName` | owner_profile.first_name |
| `customerPhone` | owner_profile.phone_e164 |
| `items[].serviceId` | groom_appointment_item.service_id |
| `items[].name` | groom_appointment_item.name_snapshot |
| `items[].isAddon` | groom_appointment_item.is_addon |
| `items[].priceSatang` | groom_appointment_item.price_satang |
| `items[].durationMinutes` | groom_appointment_item.duration_minutes |
| `items[].customerPackageId` | groom_appointment_item.customer_package_id |
| `surcharges[].id` | appointment_surcharge.id |
| `surcharges[].name` | appointment_surcharge.name |
| `surcharges[].amountSatang` | appointment_surcharge.amount_satang |
| `surcharges[].reason` | appointment_surcharge.reason |
| `servicesTotalSatang` | groom_appointment.services_total_satang |
| `surchargeTotalSatang` | groom_appointment.surcharge_total_satang |
| `depositStatus` | booking.deposit_status |
| `reliabilityLevel` | customer.reliability_level |
| `fromStayId` | groom_appointment.from_stay_id |
| `checkedInAt` | groom_appointment.checked_in_at |
| `startedAt` | groom_appointment.started_at |
| `doneAt` | groom_appointment.done_at |
| `pickedUpAt` | groom_appointment.picked_up_at |
| `staffNote` | groom_appointment.staff_note |

<a id="dto-JobCard"></a>

### JobCard

Job card สำหรับช่าง

| field | source |
|---|---|
| `appointment` | dto:AppointmentCard |
| `preferredStyle` | pet_shop_profile.preferred_style |
| `bladeNo` | pet_shop_profile.blade_no |
| `shampooOk` | pet_shop_profile.shampoo_ok |
| `shampooAvoid` | pet_shop_profile.shampoo_avoid |
| `allergies` | pet_shop_profile.allergies |
| `conditions` | pet_shop_profile.conditions |
| `internalNote` | pet_shop_profile.internal_note |
| `favoriteStylePhotoUrl` | calc: signed URL pet_shop_profile.favorite_style_photo_id |
| `flags[]` | []dto:TemperamentFlagItem |
| `weightGramsCheckin` | groom_appointment.weight_grams_checkin |
| `conditionFlags[]` | groom_appointment.condition_flags |
| `conditionNote` | groom_appointment.condition_note |
| `customerNote` | booking.customer_note |
| `lastVisit.photos[]` | []dto:PhotoItem |
| `lastVisit.staffNote` | groom_appointment.staff_note |
| `photos[]` | []dto:PhotoItem |
| `consentSigned` | calc: มี consent_document ของนัดนี้ |

<a id="dto-CalendarDay"></a>

### CalendarDay

ข้อมูลปฏิทินวันเดียว

| field | source |
|---|---|
| `date` | calc: input |
| `opensAt` | branch_hours.opens_at |
| `closesAt` | branch_hours.closes_at |
| `groomers[].id` | staff_user.id |
| `groomers[].displayName` | staff_user.display_name |
| `groomers[].workingHours` | dto:WorkingHours |
| `groomers[].timeOff[]` | staff_time_off.starts_at |
| `stations[].id` | groom_station.id |
| `stations[].name` | groom_station.name |
| `closures[]` | branch_closure.starts_at |
| `appointments[]` | []dto:AppointmentCard |
| `hotel.arrivals` | calc: count stay check_in_date = date |
| `hotel.departures` | calc: count stay check_out_date = date |
| `hotel.inHouse` | calc: count stay checked_in |
| `daycare.count` | calc: count daycare_visit visit_date = date |
| `pendingApprovals` | calc: count booking awaiting_approval |
| `pendingSlips` | calc: count payment_slip submitted |

<a id="dto-StayCard"></a>

### StayCard

การพัก (การ์ด)

| field | source |
|---|---|
| `id` | stay.id |
| `bookingId` | stay.booking_id |
| `bookingNo` | booking.booking_no |
| `status` | stay.status |
| `pet` | dto:PetSummary |
| `customerName` | owner_profile.first_name |
| `roomTypeName` | room_type.name_th |
| `roomUnitId` | stay.room_unit_id |
| `roomCode` | room_unit.code |
| `checkInDate` | stay.check_in_date |
| `checkOutDate` | stay.check_out_date |
| `expectedCheckInTime` | stay.expected_check_in_time |
| `expectedCheckOutTime` | stay.expected_check_out_time |
| `nights` | stay.nights |
| `roomTotalSatang` | stay.room_total_satang |
| `inHeat` | stay.in_heat |
| `bundleAppointmentId` | stay.bundle_appointment_id |
| `intakeCompleted` | calc: stay_intake.completed_at is not null |
| `agreementSigned` | calc: มี consent_document kind boarding_agreement |
| `vaccineGate` | calc: R-11 |

<a id="dto-StayDetail"></a>

### StayDetail

การพักแบบเต็ม

| field | source |
|---|---|
| `stay` | dto:StayCard |
| `weightGramsIn` | stay.weight_grams_in |
| `weightGramsOut` | stay.weight_grams_out |
| `vaccineOverrideReason` | stay.vaccine_override_reason |
| `checkedInAt` | stay.checked_in_at |
| `checkedOutAt` | stay.checked_out_at |
| `intake.foodBrand` | stay_intake.food_brand |
| `intake.foodAmount` | stay_intake.food_amount |
| `intake.feedingTimes[]` | stay_intake.feeding_times |
| `intake.foodProvidedByOwner` | stay_intake.food_provided_by_owner |
| `intake.walksPerDay` | stay_intake.walks_per_day |
| `intake.conditionNote` | stay_intake.condition_note |
| `intake.conditionPhotoUrls[]` | calc: signed URL stay_intake.condition_photo_ids |
| `intake.emergencyContactName` | stay_intake.emergency_contact_name |
| `intake.emergencyContactPhone` | stay_intake.emergency_contact_phone |
| `intake.vetClinicName` | stay_intake.vet_clinic_name |
| `intake.vetClinicPhone` | stay_intake.vet_clinic_phone |
| `intake.completedAt` | stay_intake.completed_at |
| `medications[].id` | stay_medication.id |
| `medications[].name` | stay_medication.name |
| `medications[].dose` | stay_medication.dose |
| `medications[].times[]` | stay_medication.times |
| `medications[].instructions` | stay_medication.instructions |
| `belongings[].id` | stay_belonging.id |
| `belongings[].item` | stay_belonging.item |
| `belongings[].quantity` | stay_belonging.quantity |
| `belongings[].photoUrl` | calc: signed URL stay_belonging.photo_file_id |
| `belongings[].returnedAt` | stay_belonging.returned_at |
| `addons[].id` | stay_addon.id |
| `addons[].name` | stay_addon.name_snapshot |
| `addons[].quantity` | stay_addon.quantity |
| `addons[].totalSatang` | stay_addon.total_satang |
| `tasks[]` | []dto:CareTaskItem |
| `updates[]` | []dto:PhotoItem |
| `agreement.signerName` | consent_document.signer_name |
| `agreement.signedAt` | consent_document.signed_at |
| `agreement.emergencyVetLimitSatang` | consent_document.emergency_vet_limit_satang |

<a id="dto-RoomMap"></a>

### RoomMap

แผนผังห้องรายวัน

| field | source |
|---|---|
| `date` | calc: input |
| `units[].id` | room_unit.id |
| `units[].code` | room_unit.code |
| `units[].zone` | room_unit.zone |
| `units[].roomTypeName` | room_type.name_th |
| `units[].status` | room_unit.status |
| `units[].housekeeping` | room_unit.housekeeping |
| `units[].occupant` | dto:StayCard |
| `units[].arrivingToday` | calc: stay check_in_date = date |
| `units[].departingToday` | calc: stay check_out_date = date |
| `units[].nextArrivalDate` | calc: min stay.check_in_date > date |

<a id="dto-CareTaskItem"></a>

### CareTaskItem

งานดูแล

| field | source |
|---|---|
| `id` | care_task.id |
| `stayId` | care_task.stay_id |
| `petName` | pet.name |
| `roomCode` | room_unit.code |
| `taskType` | care_task.task_type |
| `title` | care_task.title |
| `dueAt` | care_task.due_at |
| `status` | care_task.status |
| `doneAt` | care_task.done_at |
| `doneByName` | staff_user.display_name |
| `note` | care_task.note |
| `photoUrl` | calc: signed URL care_task.photo_file_id |
| `medication` | calc: stay_medication.name + dose |
| `overdue` | calc: status pending และ now > due_at + 30 นาที |

<a id="dto-DaycareVisitItem"></a>

### DaycareVisitItem

Daycare 1 รายการ

| field | source |
|---|---|
| `id` | daycare_visit.id |
| `bookingId` | daycare_visit.booking_id |
| `pet` | dto:PetSummary |
| `sessionName` | daycare_session_type.name_th |
| `visitDate` | daycare_visit.visit_date |
| `priceSatang` | daycare_visit.price_satang |
| `status` | daycare_visit.status |
| `checkedInAt` | daycare_visit.checked_in_at |
| `checkedOutAt` | daycare_visit.checked_out_at |

<a id="dto-SlipItem"></a>

### SlipItem

สลิป

| field | source |
|---|---|
| `id` | payment_slip.id |
| `bookingId` | payment_slip.booking_id |
| `bookingNo` | booking.booking_no |
| `billId` | payment_slip.bill_id |
| `customerName` | owner_profile.first_name |
| `imageUrl` | calc: signed URL payment_slip.file_id |
| `amountExpectedSatang` | payment_slip.amount_expected_satang |
| `transRef` | payment_slip.trans_ref |
| `isDuplicate` | calc: payment_slip.duplicate_of_slip_id is not null |
| `duplicateOfSlipId` | payment_slip.duplicate_of_slip_id |
| `status` | payment_slip.status |
| `uploadedAt` | payment_slip.created_at |
| `reviewedAt` | payment_slip.reviewed_at |
| `rejectReason` | payment_slip.reject_reason |
| `holdExpiresAt` | booking.hold_expires_at |

<a id="dto-BillListItem"></a>

### BillListItem

แถวบิล

| field | source |
|---|---|
| `id` | bill.id |
| `receiptNo` | bill.receipt_no |
| `status` | bill.status |
| `customerName` | owner_profile.first_name |
| `totalSatang` | bill.total_satang |
| `paidSatang` | bill.paid_satang |
| `openedAt` | bill.opened_at |
| `closedAt` | bill.closed_at |
| `methods[]` | calc: distinct payment.method ที่ posted |

<a id="dto-BillDetail"></a>

### BillDetail

บิลแบบเต็ม

| field | source |
|---|---|
| `id` | bill.id |
| `receiptNo` | bill.receipt_no |
| `status` | bill.status |
| `customer` | dto:CustomerListItem |
| `bookingIds[]` | calc: booking ที่ bill_id = bill.id |
| `subtotalSatang` | bill.subtotal_satang |
| `billDiscountSatang` | bill.bill_discount_satang |
| `billDiscountReason` | bill.bill_discount_reason |
| `totalSatang` | bill.total_satang |
| `paidSatang` | bill.paid_satang |
| `dueSatang` | calc: total − paid |
| `changeSatang` | bill.change_satang |
| `note` | bill.note |
| `openedByName` | staff_user.display_name |
| `openedAt` | bill.opened_at |
| `closedAt` | bill.closed_at |
| `voidedAt` | bill.voided_at |
| `voidReason` | bill.void_reason |
| `lines[].id` | bill_line.id |
| `lines[].lineType` | bill_line.line_type |
| `lines[].description` | bill_line.description |
| `lines[].petName` | pet.name |
| `lines[].quantity` | bill_line.quantity |
| `lines[].unitPriceSatang` | bill_line.unit_price_satang |
| `lines[].lineDiscountSatang` | bill_line.line_discount_satang |
| `lines[].lineDiscountReason` | bill_line.line_discount_reason |
| `lines[].lineTotalSatang` | bill_line.line_total_satang |
| `lines[].performerId` | bill_line.performer_id |
| `payments[].id` | payment.id |
| `payments[].method` | payment.method |
| `payments[].amountSatang` | payment.amount_satang |
| `payments[].tenderedSatang` | payment.tendered_satang |
| `payments[].reference` | payment.reference |
| `payments[].status` | payment.status |
| `payments[].receivedAt` | payment.received_at |
| `customerCreditSatang` | customer.credit_balance_satang |
| `availablePackages[]` | []dto:CustomerPackageItem |
| `depositAvailableSatang` | calc: Σ booking.deposit_verified_satang ที่ deposit_status = verified (ยังไม่ applied) |

<a id="dto-Receipt"></a>

### Receipt

ข้อมูลใบเสร็จ (พิมพ์/ส่ง LINE)

| field | source |
|---|---|
| `shopName` | branch.name |
| `shopAddress` | calc: branch address |
| `shopPhone` | branch.phone |
| `logoUrl` | calc: signed URL branch.logo_file_id |
| `receiptNo` | bill.receipt_no |
| `closedAt` | bill.closed_at |
| `customerName` | calc: owner_profile ชื่อ-นามสกุล |
| `lines[].description` | bill_line.description |
| `lines[].quantity` | bill_line.quantity |
| `lines[].unitPriceSatang` | bill_line.unit_price_satang |
| `lines[].lineDiscountSatang` | bill_line.line_discount_satang |
| `lines[].lineTotalSatang` | bill_line.line_total_satang |
| `subtotalSatang` | bill.subtotal_satang |
| `billDiscountSatang` | bill.bill_discount_satang |
| `totalSatang` | bill.total_satang |
| `payments[].method` | payment.method |
| `payments[].amountSatang` | payment.amount_satang |
| `changeSatang` | bill.change_satang |
| `cashierName` | staff_user.display_name |
| `status` | bill.status |
| `packagesRemaining[]` | []dto:CustomerPackageItem |

<a id="dto-ReportCardDetail"></a>

### ReportCardDetail

Report card / Stay report

| field | source |
|---|---|
| `id` | report_card.id |
| `kind` | report_card.kind |
| `status` | report_card.status |
| `pet` | dto:PetSummary |
| `appointmentId` | report_card.appointment_id |
| `stayId` | report_card.stay_id |
| `skin` | report_card.skin |
| `ears` | report_card.ears |
| `nails` | report_card.nails |
| `teeth` | report_card.teeth |
| `parasites` | report_card.parasites |
| `cooperation` | report_card.cooperation |
| `staffNote` | report_card.staff_note |
| `recommendation` | report_card.recommendation |
| `groomerName` | staff_user.display_name |
| `beforePhotos[]` | []dto:PhotoItem |
| `afterPhotos[]` | []dto:PhotoItem |
| `services[]` | groom_appointment_item.name_snapshot |
| `nextGroomDue` | calc: R-17 |
| `sentAt` | report_card.sent_at |
| `customerRating` | report_card.customer_rating |
| `customerFeedback` | report_card.customer_feedback |
| `googleReviewUrl` | branch_policy.google_review_url |

<a id="dto-DashboardToday"></a>

### DashboardToday

Dashboard วันนี้

| field | source |
|---|---|
| `date` | calc: วันนี้ตาม branch.timezone |
| `groom.total` | calc: count groom_appointment วันนี้ ไม่รวม cancelled |
| `groom.byStatus` | calc: count group by groom_appointment.status |
| `hotel.arrivals` | calc: stay check_in_date = วันนี้ |
| `hotel.departures` | calc: stay check_out_date = วันนี้ |
| `hotel.inHouse` | calc: stay checked_in |
| `hotel.occupancyPercent` | calc: inHouse / room_unit active |
| `daycare.count` | calc: daycare_visit วันนี้ |
| `sales.paidTotalSatang` | calc: Σ payment posted วันนี้ (ไม่รวม method deposit/credit) |
| `sales.billsClosed` | calc: count bill paid วันนี้ |
| `todo.pendingSlips` | calc: payment_slip submitted |
| `todo.pendingApprovals` | calc: booking awaiting_approval |
| `todo.overdueCareTasks` | calc: care_task overdue |
| `todo.reportCardsToReview` | calc: report_card pending_review |
| `todo.unsentMessages` | calc: notification skipped วันนี้ |
| `todo.pickupsWithoutBill` | calc: groom_appointment picked_up วันนี้ ที่ booking.bill_id null |
| `todo.linkRequests` | calc: customer_link_request pending |

<a id="dto-InvitePreview"></a>

### InvitePreview

ข้อมูลคำเชิญก่อนรับ (Q-0044)

| field | source |
|---|---|
| `orgName` | organization.name |
| `role` | staff_user.role |
| `hasEmail` | calc: staff_user.email is not null (record ของคำเชิญ) |

<a id="dto-SalesReport"></a>

### SalesReport

รายงานยอดขาย (Q-0085): บิล paid ตามวันท้องถิ่นของ closed_at, void ไม่นับ · groupBy service/groomer กระจายส่วนลดท้ายบิลลงบรรทัดแบบ R-13 ข้อ 1 · groomer: บรรทัดไม่มีช่างรวมเป็นแถว key = null · method: 1 แถวต่อวิธีจ่าย (net = Σ payment posted, gross/discount = 0)

| field | source |
|---|---|
| `from` | calc: input |
| `to` | calc: input |
| `rows[].key` | calc: วัน (YYYY-MM-DD) / ชื่อบริการหรือสินค้า / ชื่อช่าง (null = ไม่ระบุช่าง) / payment.method ตาม groupBy |
| `rows[].billCount` | calc: จำนวนบิลที่มีบรรทัดในแถวนี้ |
| `rows[].grossSatang` | calc: Σ bill_line.quantity × unit_price_satang |
| `rows[].discountSatang` | calc: Σ line_discount_satang + ส่วนลดท้ายบิล (กระจายตามแถว) |
| `rows[].netSatang` | calc: gross − discount (รวมทุกแถว = Σ bill.total_satang) |
| `totals` | calc: {billCount, grossSatang, discountSatang, netSatang} ของทั้งช่วง |
| `payments[].method` | payment.method |
| `payments[].amountSatang` | calc: Σ payment.amount_satang posted ของบิลในช่วง (รวม deposit/credit) |

<a id="dto-CommissionReport"></a>

### CommissionReport

รายงานค่ามือ · แบบบัญชี (Q-0030): รายการที่ earned_at อยู่ในช่วง from..to (วันท้องถิ่นของสาขา) นับ +1 งาน/+base/+amount; รายการ status reversed ที่ reversed_at อยู่ในช่วง นับ −1/−base/−amount (เกิดและยกเลิกในช่วงเดียวกัน = 0; void ทีหลังติดลบในช่วงที่ void) · ไม่มีรายการ → rows = []

| field | source |
|---|---|
| `from` | calc: input |
| `to` | calc: input |
| `rows[].staffUserId` | commission_entry.staff_user_id |
| `rows[].staffName` | staff_user.display_name |
| `rows[].jobs` | calc: count earned_at ในช่วง − count reversed_at ในช่วง |
| `rows[].baseSatang` | calc: Σ commission_entry.base_satang (earned_at ในช่วง) − Σ (reversed_at ในช่วง) |
| `rows[].amountSatang` | calc: Σ commission_entry.amount_satang (earned_at ในช่วง) − Σ (reversed_at ในช่วง) |
| `rows[].entries[].id` | commission_entry.id |
| `rows[].entries[].at` | calc: earned_at (บวก) หรือ reversed_at (ลบ) |
| `rows[].entries[].sign` | calc: 1 \| -1 |
| `rows[].entries[].receiptNo` | bill.receipt_no |
| `rows[].entries[].serviceName` | calc: bill_line.description |
| `rows[].entries[].baseSatang` | commission_entry.base_satang |
| `rows[].entries[].ruleLabel` | calc: กติกา percent x% / fixed ฿ (null = ไม่มีกติกา) |
| `rows[].entries[].amountSatang` | commission_entry.amount_satang |

<a id="dto-OccupancyReport"></a>

### OccupancyReport

รายงาน occupancy

| field | source |
|---|---|
| `from` | calc: input |
| `to` | calc: input |
| `days[].date` | calc |
| `days[].occupiedUnits` | calc: stay checked_in/checked_out ครอบคืนนั้น |
| `days[].totalUnits` | calc: room_unit active |
| `days[].percent` | calc |
| `byRoomType[]` | calc |

<a id="dto-SkippedMessageItem"></a>

### SkippedMessageItem

ข้อความที่ไม่ได้ส่ง (ให้ร้านส่งเอง)

| field | source |
|---|---|
| `id` | notification.id |
| `templateKey` | notification.template_key |
| `recipientName` | calc: owner_profile.first_name |
| `skipReason` | notification.skip_reason |
| `text` | calc: render template จาก notification.payload |
| `createdAt` | notification.created_at |

<a id="dto-AuditLogItem"></a>

### AuditLogItem

บันทึก audit

| field | source |
|---|---|
| `id` | audit_log.id |
| `action` | audit_log.action |
| `actorType` | audit_log.actor_type |
| `actorName` | calc: staff_user.display_name / platform_admin.display_name |
| `entityType` | audit_log.entity_type |
| `entityId` | audit_log.entity_id |
| `before` | audit_log.before |
| `after` | audit_log.after |
| `reason` | audit_log.reason |
| `at` | audit_log.created_at |
| `viaSupport` | calc: audit_log.support_access_log_id is not null |

<a id="dto-ImportJobItem"></a>

### ImportJobItem

งานนำเข้า

| field | source |
|---|---|
| `id` | import_job.id |
| `kind` | import_job.kind |
| `status` | import_job.status |
| `totalRows` | import_job.total_rows |
| `validRows` | import_job.valid_rows |
| `errorRows` | import_job.error_rows |
| `errors[]` | import_job.errors |
| `committedAt` | import_job.committed_at |

<a id="dto-LinkRequestItem"></a>

### LinkRequestItem

คำขอจับคู่บัญชี LINE

| field | source |
|---|---|
| `id` | customer_link_request.id |
| `lineDisplayName` | line_identity.display_name |
| `linePictureUrl` | line_identity.picture_url |
| `phoneEntered` | customer_link_request.phone_entered |
| `candidate` | dto:CustomerListItem |
| `status` | customer_link_request.status |
| `createdAt` | customer_link_request.created_at |

<a id="dto-UploadTicket"></a>

### UploadTicket

ตั๋วอัปโหลด

| field | source |
|---|---|
| `fileId` | file_object.id |
| `uploadUrl` | calc: presigned PUT URL (5 นาที) |
| `headers` | calc: Content-Type ที่ต้องส่ง |
| `storageKey` | file_object.storage_key |

<a id="dto-LiffSession"></a>

### LiffSession

ผลเปิด LIFF

| field | source |
|---|---|
| `registered` | calc: มี customer ของ owner_profile ใน org นี้ |
| `linkPending` | calc: มี customer_link_request pending |
| `profile.displayName` | line_identity.display_name |
| `profile.pictureUrl` | line_identity.picture_url |
| `customerId` | customer.id |
| `legalVersions.privacy` | calc: เวอร์ชันล่าสุดของ legal_doc privacy_notice |
| `legalVersions.terms` | calc: เวอร์ชันล่าสุด terms_of_service |
| `needsConsent` | calc: ยังไม่ยอมรับเวอร์ชันล่าสุด |

<a id="dto-ShopPublic"></a>

### ShopPublic

ข้อมูลร้านสาธารณะ

| field | source |
|---|---|
| `name` | branch.name |
| `logoUrl` | calc: signed URL branch.logo_file_id |
| `phone` | branch.phone |
| `address` | calc: branch address |
| `latitude` | branch.latitude |
| `longitude` | branch.longitude |
| `hours[]` | branch_hours.opens_at |
| `modules.grooming` | branch.module_grooming |
| `modules.hotel` | branch.module_hotel |
| `modules.daycare` | branch.module_daycare |
| `policyText` | branch_policy.policy_text |
| `services[]` | []dto:ServiceItem |
| `roomTypes[]` | []dto:RoomTypeItem |
| `addFriendUrl` | calc: line_channel.bot_basic_id |
| `liffUrl` | calc: line_channel.liff_id |

<a id="dto-MyProfile"></a>

### MyProfile

โปรไฟล์ลูกค้า (LIFF)

| field | source |
|---|---|
| `firstName` | owner_profile.first_name |
| `lastName` | owner_profile.last_name |
| `nickname` | owner_profile.nickname |
| `phone` | owner_profile.phone_e164 |
| `email` | owner_profile.email |
| `photoConsent` | customer.photo_consent |
| `creditBalanceSatang` | customer.credit_balance_satang |

<a id="dto-MyPet"></a>

### MyPet

น้องของฉัน (LIFF) — ไม่มี internal_note

| field | source |
|---|---|
| `id` | pet.id |
| `name` | pet.name |
| `species` | pet.species |
| `breed` | pet.breed |
| `sex` | pet.sex |
| `birthDate` | pet.birth_date |
| `neutered` | pet.neutered |
| `coatType` | pet.coat_type |
| `latestWeightGrams` | pet.latest_weight_grams |
| `photoUrl` | calc: signed URL pet.profile_file_id |
| `sharedNote` | pet_shop_profile.shared_note |
| `vaccinations[]` | []dto:VaccinationItem |
| `photos[]` | []dto:PhotoItem |
| `nextGroomDue` | calc: R-17 |

<a id="dto-MyBookingItem"></a>

### MyBookingItem

นัดของฉัน (LIFF)

| field | source |
|---|---|
| `id` | booking.id |
| `bookingNo` | booking.booking_no |
| `status` | booking.status |
| `firstServiceAt` | booking.first_service_at |
| `petNames[]` | pet.name |
| `summary` | calc: ชื่อบริการ/ประเภทห้อง |
| `depositStatus` | booking.deposit_status |
| `estimatedTotalSatang` | booking.estimated_total_satang |
| `canCancel` | calc: R-21 |
| `canReschedule` | calc: R-21 |

<a id="dto-MyBookingDetail"></a>

### MyBookingDetail

รายละเอียดนัด (LIFF)

| field | source |
|---|---|
| `booking` | dto:MyBookingItem |
| `groom[].startsAt` | groom_appointment.starts_at |
| `groom[].petName` | pet.name |
| `groom[].groomerName` | staff_user.display_name |
| `groom[].services[]` | groom_appointment_item.name_snapshot |
| `stays[].checkInDate` | stay.check_in_date |
| `stays[].checkOutDate` | stay.check_out_date |
| `stays[].roomTypeName` | room_type.name_th |
| `daycare[].visitDate` | daycare_visit.visit_date |
| `daycare[].sessionName` | daycare_session_type.name_th |
| `payment` | dto:PaymentInstruction |
| `policySnapshot` | booking.policy_snapshot |
| `cancelPreview` | calc: R-07 |
| `rescheduleBlockedReason` | calc: R-21 |
| `shopPhone` | branch.phone |
| `mapUrl` | calc: Google Maps URL จาก branch.latitude/longitude |
| `icsUrl` | calc: /api/v1/liff/{slug}/bookings/{id}/calendar.ics |

<a id="dto-StayUpdates"></a>

### StayUpdates

หน้าอัปเดตน้องระหว่างพัก (LIFF)

| field | source |
|---|---|
| `stayId` | stay.id |
| `petName` | pet.name |
| `checkInDate` | stay.check_in_date |
| `checkOutDate` | stay.check_out_date |
| `updates[]` | []dto:PhotoItem |
| `doneTasks[].title` | care_task.title |
| `doneTasks[].doneAt` | care_task.done_at |
| `doneTasks[].note` | care_task.note |

<a id="dto-OrgListItem"></a>

### OrgListItem

ร้านในระบบ · ownerEmail เป็น string | null: เลือก staff_user ที่ role = owner เรียง created_at ASC แล้ว id ASC และใช้ email ของแถวแรก · lineStatus เป็น enum:line_channel_status | null: ไม่มี line_channel ของสาขา → null · lastActivityAt เป็น ISO instant | null: max booking.created_at ของร้าน; ไม่มี booking → null · สาขาเดียวต่อธุรกิจตาม MVP

| field | source |
|---|---|
| `id` | organization.id |
| `name` | organization.name |
| `slug` | organization.slug |
| `status` | organization.status |
| `branchName` | branch.name |
| `bookingSlug` | branch.booking_slug |
| `ownerEmail` | staff_user.email |
| `lineStatus` | line_channel.status |
| `createdAt` | organization.created_at |
| `lastActivityAt` | calc: max booking.created_at |

<a id="dto-FeedbackItem"></a>

### FeedbackItem

แจ้งปัญหา

| field | source |
|---|---|
| `id` | feedback_report.id |
| `orgName` | organization.name |
| `staffName` | staff_user.display_name |
| `pageUrl` | feedback_report.page_url |
| `message` | feedback_report.message |
| `screenshotUrl` | calc: signed URL feedback_report.screenshot_file_id |
| `appVersion` | feedback_report.app_version |
| `status` | feedback_report.status |
| `createdAt` | feedback_report.created_at |

<a id="dto-DataRequestItem"></a>

### DataRequestItem

คำขอ PDPA

| field | source |
|---|---|
| `id` | data_request.id |
| `orgName` | organization.name |
| `ownerProfileId` | data_request.owner_profile_id |
| `type` | data_request.type |
| `status` | data_request.status |
| `note` | data_request.note |
| `createdAt` | data_request.created_at |

<a id="dto-PilotAnalytics"></a>

### PilotAnalytics

ตัวชี้วัดนำร่อง

| field | source |
|---|---|
| `orgs[].orgId` | organization.id |
| `orgs[].activeDays7` | calc: จำนวนวันที่มี booking/bill ใน 7 วัน |
| `orgs[].bookingsByChannel` | calc: count booking group by channel |
| `orgs[].onlineShare` | calc: line_liff+booking_link / ทั้งหมด |
| `orgs[].noShowRate` | calc: no_show / นัดที่ถึงเวลา |
| `orgs[].pushUsed` | calc: notification line_push sent |
| `orgs[].reportCardsSent` | calc |
| `orgs[].billsClosed` | calc |

<a id="dto-PublicHoliday"></a>

### PublicHoliday

วันหยุดราชการ

| field | source |
|---|---|
| `date` | public_holiday.holiday_date |
| `nameTh` | public_holiday.name_th |

## 3. Endpoints

| Key | Method | Path | สิทธิ์ | Stories |
|---|---|---|---|---|
| [`auth.staffLogin`](#ep-auth.staffLogin) | POST | `/api/v1/auth/staff/login` | ไม่ต้องล็อกอิน | US-01-02 |
| [`auth.staffLogout`](#ep-auth.staffLogout) | POST | `/api/v1/auth/staff/logout` | owner, front_desk, staff | US-01-02 |
| [`auth.me`](#ep-auth.me) | GET | `/api/v1/auth/staff/me` | owner, front_desk, staff | US-01-02 |
| [`auth.resetRequest`](#ep-auth.resetRequest) | POST | `/api/v1/auth/staff/password-reset/request` | ไม่ต้องล็อกอิน | US-01-02 |
| [`auth.resetConfirm`](#ep-auth.resetConfirm) | POST | `/api/v1/auth/staff/password-reset/confirm` | ไม่ต้องล็อกอิน | US-01-02 |
| [`auth.invitePreview`](#ep-auth.invitePreview) | GET | `/api/v1/auth/staff/invite` | ไม่ต้องล็อกอิน | US-01-04 |
| [`auth.inviteAccept`](#ep-auth.inviteAccept) | POST | `/api/v1/auth/staff/invite/accept` | ไม่ต้องล็อกอิน | US-01-04 |
| [`auth.staffLine`](#ep-auth.staffLine) | POST | `/api/v1/auth/staff/line` | ไม่ต้องล็อกอิน | US-01-03 |
| [`staffMe.linkLine`](#ep-staffMe.linkLine) | POST | `/api/v1/staff/me/line-link` | owner, front_desk, staff | US-01-03 |
| [`staffMe.sessions`](#ep-staffMe.sessions) | GET | `/api/v1/staff/me/sessions` | owner, front_desk, staff | US-01-05 |
| [`staffMe.revokeSession`](#ep-staffMe.revokeSession) | DELETE | `/api/v1/staff/me/sessions/{sessionId}` | owner, front_desk, staff | US-01-05 |
| [`staffMe.pushSubscribe`](#ep-staffMe.pushSubscribe) | POST | `/api/v1/staff/me/push-subscriptions` | owner, front_desk, staff | US-13-05, US-09-04 |
| [`staffMe.pushUnsubscribe`](#ep-staffMe.pushUnsubscribe) | DELETE | `/api/v1/staff/me/push-subscriptions` | owner, front_desk, staff | US-13-05 |
| [`staffMe.commissions`](#ep-staffMe.commissions) | GET | `/api/v1/staff/me/commissions` | owner, front_desk, staff | US-09-05 |
| [`staff.uploadUrl`](#ep-staff.uploadUrl) | POST | `/api/v1/staff/files/upload-url` | owner, front_desk, staff | US-13-04 |
| [`customer.uploadUrl`](#ep-customer.uploadUrl) | POST | `/api/v1/liff/{branchSlug}/files/upload-url` | ลูกค้า (LIFF) | US-13-04 |
| [`branch.get`](#ep-branch.get) | GET | `/api/v1/staff/branch` | owner, front_desk, staff | US-02-01 |
| [`branch.update`](#ep-branch.update) | PATCH | `/api/v1/staff/branch` | owner | US-02-01 |
| [`branch.setHours`](#ep-branch.setHours) | PUT | `/api/v1/staff/branch/hours` | owner | US-02-01 |
| [`branch.setModules`](#ep-branch.setModules) | PATCH | `/api/v1/staff/branch/modules` | owner | US-02-02 |
| [`branch.updatePolicy`](#ep-branch.updatePolicy) | PATCH | `/api/v1/staff/branch/policy` | owner | US-02-04, US-07-03, US-07-04, US-05-05, US-06-05, US-13-06 |
| [`branch.setPromptpay`](#ep-branch.setPromptpay) | PUT | `/api/v1/staff/branch/promptpay` | owner | US-02-03 |
| [`closures.list`](#ep-closures.list) | GET | `/api/v1/staff/branch/closures` | owner, front_desk, staff | US-02-05 |
| [`closures.create`](#ep-closures.create) | POST | `/api/v1/staff/branch/closures` | owner, front_desk | US-02-05 |
| [`closures.delete`](#ep-closures.delete) | DELETE | `/api/v1/staff/branch/closures/{closureId}` | owner, front_desk | US-02-05 |
| [`closures.importHolidays`](#ep-closures.importHolidays) | POST | `/api/v1/staff/branch/closures/public-holidays` | owner | US-02-05, US-13-03 |
| [`stations.list`](#ep-stations.list) | GET | `/api/v1/staff/stations` | owner, front_desk, staff | US-05-01 |
| [`stations.upsert`](#ep-stations.upsert) | PUT | `/api/v1/staff/stations` | owner | US-05-01 |
| [`line.status`](#ep-line.status) | GET | `/api/v1/staff/branch/line` | owner, front_desk | US-02-06, US-13-06 |
| [`line.skipped`](#ep-line.skipped) | GET | `/api/v1/staff/notifications/skipped` | owner, front_desk | US-13-06 |
| [`staffUsers.list`](#ep-staffUsers.list) | GET | `/api/v1/staff/staff-users` | owner, front_desk, staff | US-01-04, US-09-01 |
| [`staffUsers.invite`](#ep-staffUsers.invite) | POST | `/api/v1/staff/staff-users/invite` | owner | US-01-04 |
| [`staffUsers.update`](#ep-staffUsers.update) | PATCH | `/api/v1/staff/staff-users/{staffUserId}` | owner | US-01-04, US-09-01 |
| [`staffUsers.resendInvite`](#ep-staffUsers.resendInvite) | POST | `/api/v1/staff/staff-users/{staffUserId}/resend-invite` | owner | US-01-04 |
| [`workingHours.set`](#ep-workingHours.set) | PUT | `/api/v1/staff/staff-users/{staffUserId}/working-hours` | owner, front_desk | US-09-01 |
| [`timeOff.list`](#ep-timeOff.list) | GET | `/api/v1/staff/time-off` | owner, front_desk, staff | US-09-01 |
| [`timeOff.create`](#ep-timeOff.create) | POST | `/api/v1/staff/time-off` | owner, front_desk | US-09-01 |
| [`timeOff.delete`](#ep-timeOff.delete) | DELETE | `/api/v1/staff/time-off/{timeOffId}` | owner, front_desk | US-09-01 |
| [`search.quick`](#ep-search.quick) | GET | `/api/v1/staff/search` | owner, front_desk, staff | US-03-10 |
| [`customers.list`](#ep-customers.list) | GET | `/api/v1/staff/customers` | owner, front_desk | US-03-01 |
| [`customers.create`](#ep-customers.create) | POST | `/api/v1/staff/customers` | owner, front_desk | US-03-01 |
| [`customers.get`](#ep-customers.get) | GET | `/api/v1/staff/customers/{customerId}` | owner, front_desk, staff | US-03-01 |
| [`customers.update`](#ep-customers.update) | PATCH | `/api/v1/staff/customers/{customerId}` | owner, front_desk | US-03-01 |
| [`customers.blacklist`](#ep-customers.blacklist) | POST | `/api/v1/staff/customers/{customerId}/blacklist` | owner | US-03-09 |
| [`customers.reliabilityOverride`](#ep-customers.reliabilityOverride) | PUT | `/api/v1/staff/customers/{customerId}/reliability-override` | owner | US-03-09 |
| [`customers.timeline`](#ep-customers.timeline) | GET | `/api/v1/staff/customers/{customerId}/timeline` | owner, front_desk | US-03-08 |
| [`customers.credit`](#ep-customers.credit) | POST | `/api/v1/staff/customers/{customerId}/credit-adjustments` | owner | US-07-05 |
| [`customers.packages`](#ep-customers.packages) | GET | `/api/v1/staff/customers/{customerId}/packages` | owner, front_desk | US-10-05 |
| [`pets.create`](#ep-pets.create) | POST | `/api/v1/staff/customers/{customerId}/pets` | owner, front_desk | US-03-02 |
| [`pets.get`](#ep-pets.get) | GET | `/api/v1/staff/pets/{petId}` | owner, front_desk, staff | US-03-02, US-03-03, US-03-04 |
| [`pets.update`](#ep-pets.update) | PATCH | `/api/v1/staff/pets/{petId}` | owner, front_desk | US-03-02 |
| [`pets.setStatus`](#ep-pets.setStatus) | POST | `/api/v1/staff/pets/{petId}/status` | owner, front_desk | US-03-11 |
| [`pets.updateShopProfile`](#ep-pets.updateShopProfile) | PUT | `/api/v1/staff/pets/{petId}/shop-profile` | owner, front_desk, staff | US-03-03, US-03-04, US-03-07 |
| [`pets.addWeight`](#ep-pets.addWeight) | POST | `/api/v1/staff/pets/{petId}/weights` | owner, front_desk, staff | US-03-03 |
| [`pets.setFlags`](#ep-pets.setFlags) | PUT | `/api/v1/staff/pets/{petId}/temperament-flags` | owner, front_desk, staff | US-03-04 |
| [`vaccinations.create`](#ep-vaccinations.create) | POST | `/api/v1/staff/pets/{petId}/vaccinations` | owner, front_desk | US-03-05 |
| [`vaccinations.verify`](#ep-vaccinations.verify) | POST | `/api/v1/staff/vaccinations/{vaccinationId}/verify` | owner, front_desk | US-03-05, US-06-05 |
| [`vaccinations.reject`](#ep-vaccinations.reject) | POST | `/api/v1/staff/vaccinations/{vaccinationId}/reject` | owner, front_desk | US-03-05 |
| [`photos.list`](#ep-photos.list) | GET | `/api/v1/staff/pets/{petId}/photos` | owner, front_desk, staff | US-03-06 |
| [`photos.add`](#ep-photos.add) | POST | `/api/v1/staff/pets/{petId}/photos` | owner, front_desk, staff | US-03-06, US-09-03 |
| [`linkRequests.list`](#ep-linkRequests.list) | GET | `/api/v1/staff/link-requests` | owner, front_desk | US-01-01, US-11-01 |
| [`linkRequests.approve`](#ep-linkRequests.approve) | POST | `/api/v1/staff/link-requests/{requestId}/approve` | owner, front_desk | US-11-01 |
| [`linkRequests.reject`](#ep-linkRequests.reject) | POST | `/api/v1/staff/link-requests/{requestId}/reject` | owner, front_desk | US-11-01 |
| [`sizeTiers.list`](#ep-sizeTiers.list) | GET | `/api/v1/staff/size-tiers` | owner, front_desk, staff | US-04-02 |
| [`sizeTiers.set`](#ep-sizeTiers.set) | PUT | `/api/v1/staff/size-tiers` | owner | US-04-02 |
| [`services.list`](#ep-services.list) | GET | `/api/v1/staff/services` | owner, front_desk, staff | US-04-01 |
| [`services.create`](#ep-services.create) | POST | `/api/v1/staff/services` | owner | US-04-01, US-04-04, US-06-06 |
| [`services.update`](#ep-services.update) | PATCH | `/api/v1/staff/services/{serviceId}` | owner | US-04-01 |
| [`services.setPrices`](#ep-services.setPrices) | PUT | `/api/v1/staff/services/{serviceId}/prices` | owner | US-04-02, US-04-03 |
| [`services.setAddonLinks`](#ep-services.setAddonLinks) | PUT | `/api/v1/staff/services/{serviceId}/addon-links` | owner | US-04-04 |
| [`surchargeTypes.list`](#ep-surchargeTypes.list) | GET | `/api/v1/staff/surcharge-types` | owner, front_desk, staff | US-04-05 |
| [`surchargeTypes.upsert`](#ep-surchargeTypes.upsert) | PUT | `/api/v1/staff/surcharge-types` | owner | US-04-05 |
| [`roomTypes.list`](#ep-roomTypes.list) | GET | `/api/v1/staff/room-types` | owner, front_desk, staff | US-06-01 |
| [`roomTypes.create`](#ep-roomTypes.create) | POST | `/api/v1/staff/room-types` | owner | US-06-01 |
| [`roomTypes.update`](#ep-roomTypes.update) | PATCH | `/api/v1/staff/room-types/{roomTypeId}` | owner | US-06-01 |
| [`roomTypes.setRates`](#ep-roomTypes.setRates) | PUT | `/api/v1/staff/room-types/{roomTypeId}/rates` | owner | US-06-02 |
| [`roomUnits.list`](#ep-roomUnits.list) | GET | `/api/v1/staff/room-units` | owner, front_desk, staff | US-06-01 |
| [`roomUnits.upsert`](#ep-roomUnits.upsert) | PUT | `/api/v1/staff/room-units` | owner | US-06-01 |
| [`roomUnits.housekeeping`](#ep-roomUnits.housekeeping) | PATCH | `/api/v1/staff/room-units/{roomUnitId}/housekeeping` | owner, front_desk, staff | US-06-04 |
| [`daycareTypes.list`](#ep-daycareTypes.list) | GET | `/api/v1/staff/daycare-session-types` | owner, front_desk, staff | US-06-13 |
| [`daycareTypes.upsert`](#ep-daycareTypes.upsert) | PUT | `/api/v1/staff/daycare-session-types` | owner | US-06-13 |
| [`packageTemplates.list`](#ep-packageTemplates.list) | GET | `/api/v1/staff/package-templates` | owner, front_desk, staff | US-10-05 |
| [`packageTemplates.upsert`](#ep-packageTemplates.upsert) | PUT | `/api/v1/staff/package-templates` | owner | US-10-05 |
| [`commissionRules.list`](#ep-commissionRules.list) | GET | `/api/v1/staff/commission-rules` | owner | US-09-02 |
| [`commissionRules.set`](#ep-commissionRules.set) | PUT | `/api/v1/staff/commission-rules` | owner | US-09-02 |
| [`imports.create`](#ep-imports.create) | POST | `/api/v1/staff/imports` | owner | US-02-08 |
| [`imports.get`](#ep-imports.get) | GET | `/api/v1/staff/imports/{importId}` | owner | US-02-08 |
| [`imports.commit`](#ep-imports.commit) | POST | `/api/v1/staff/imports/{importId}/commit` | owner | US-02-08 |
| [`availability.groomSlots`](#ep-availability.groomSlots) | POST | `/api/v1/staff/availability/groom-slots` | owner, front_desk | US-05-01, US-05-04, US-05-08 |
| [`availability.hotel`](#ep-availability.hotel) | GET | `/api/v1/staff/availability/hotel` | owner, front_desk | US-06-03, US-06-04 |
| [`availability.daycare`](#ep-availability.daycare) | GET | `/api/v1/staff/availability/daycare` | owner, front_desk | US-06-13 |
| [`quotes.create`](#ep-quotes.create) | POST | `/api/v1/staff/quotes` | owner, front_desk | US-05-04 |
| [`bookings.create`](#ep-bookings.create) | POST | `/api/v1/staff/bookings` | owner, front_desk | US-05-04, US-06-03, US-06-07, US-06-13 |
| [`bookings.list`](#ep-bookings.list) | GET | `/api/v1/staff/bookings` | owner, front_desk | US-05-05, US-07-02 |
| [`bookings.get`](#ep-bookings.get) | GET | `/api/v1/staff/bookings/{bookingId}` | owner, front_desk, staff | US-05-04 |
| [`bookings.approve`](#ep-bookings.approve) | POST | `/api/v1/staff/bookings/{bookingId}/approve` | owner, front_desk | US-05-05 |
| [`bookings.decline`](#ep-bookings.decline) | POST | `/api/v1/staff/bookings/{bookingId}/decline` | owner, front_desk | US-05-05 |
| [`bookings.cancelPreview`](#ep-bookings.cancelPreview) | GET | `/api/v1/staff/bookings/{bookingId}/cancel-preview` | owner, front_desk | US-07-04, US-05-08 |
| [`bookings.cancel`](#ep-bookings.cancel) | POST | `/api/v1/staff/bookings/{bookingId}/cancel` | owner, front_desk | US-05-08, US-07-04 |
| [`bookings.recordDeposit`](#ep-bookings.recordDeposit) | POST | `/api/v1/staff/bookings/{bookingId}/deposit` | owner, front_desk | US-07-02, US-07-03 |
| [`bookings.waiveDeposit`](#ep-bookings.waiveDeposit) | POST | `/api/v1/staff/bookings/{bookingId}/deposit/waive` | owner, front_desk | US-07-03 |
| [`bookings.balanceLink`](#ep-bookings.balanceLink) | POST | `/api/v1/staff/bookings/{bookingId}/balance-link` | owner, front_desk | US-07-08 |
| [`calendar.day`](#ep-calendar.day) | GET | `/api/v1/staff/calendar` | owner, front_desk, staff | US-05-03 |
| [`groom.reschedule`](#ep-groom.reschedule) | PATCH | `/api/v1/staff/groom-appointments/{appointmentId}/reschedule` | owner, front_desk | US-05-08, US-05-03 |
| [`groom.setItems`](#ep-groom.setItems) | PUT | `/api/v1/staff/groom-appointments/{appointmentId}/items` | owner, front_desk | US-05-06, US-04-03 |
| [`groom.checkIn`](#ep-groom.checkIn) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/check-in` | owner, front_desk | US-05-06 |
| [`groom.start`](#ep-groom.start) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/start` | owner, front_desk, staff | US-09-03 |
| [`groom.finish`](#ep-groom.finish) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/finish` | owner, front_desk, staff | US-09-03, US-10-01 |
| [`groom.notifyPickup`](#ep-groom.notifyPickup) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/notify-pickup` | owner, front_desk | US-05-09 |
| [`groom.pickUp`](#ep-groom.pickUp) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/pick-up` | owner, front_desk | US-05-09, US-08-01 |
| [`groom.noShow`](#ep-groom.noShow) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/no-show` | owner, front_desk | US-07-07 |
| [`groom.cancel`](#ep-groom.cancel) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/cancel` | owner, front_desk | US-05-08 |
| [`groom.addSurcharge`](#ep-groom.addSurcharge) | POST | `/api/v1/staff/groom-appointments/{appointmentId}/surcharges` | owner, front_desk | US-04-05 |
| [`groom.removeSurcharge`](#ep-groom.removeSurcharge) | DELETE | `/api/v1/staff/appointment-surcharges/{surchargeId}` | owner, front_desk | US-04-05 |
| [`groom.jobCard`](#ep-groom.jobCard) | GET | `/api/v1/staff/groom-appointments/{appointmentId}/job-card` | owner, front_desk, staff | US-05-07 |
| [`groom.myQueue`](#ep-groom.myQueue) | GET | `/api/v1/staff/me/queue` | owner, front_desk, staff | US-09-03 |
| [`stays.today`](#ep-stays.today) | GET | `/api/v1/staff/stays` | owner, front_desk, staff | US-06-12 |
| [`stays.get`](#ep-stays.get) | GET | `/api/v1/staff/stays/{stayId}` | owner, front_desk, staff | US-06-08 |
| [`stays.saveIntake`](#ep-stays.saveIntake) | PUT | `/api/v1/staff/stays/{stayId}/intake` | owner, front_desk | US-06-08 |
| [`stays.signAgreement`](#ep-stays.signAgreement) | POST | `/api/v1/staff/stays/{stayId}/agreement` | owner, front_desk | US-06-08 |
| [`stays.checkIn`](#ep-stays.checkIn) | POST | `/api/v1/staff/stays/{stayId}/check-in` | owner, front_desk | US-06-05, US-06-08, US-06-09 |
| [`stays.changeRoom`](#ep-stays.changeRoom) | PATCH | `/api/v1/staff/stays/{stayId}/room` | owner, front_desk | US-06-04 |
| [`stays.changeDates`](#ep-stays.changeDates) | PATCH | `/api/v1/staff/stays/{stayId}/dates` | owner, front_desk | US-06-03 |
| [`stays.addAddon`](#ep-stays.addAddon) | POST | `/api/v1/staff/stays/{stayId}/addons` | owner, front_desk | US-06-06 |
| [`stays.removeAddon`](#ep-stays.removeAddon) | DELETE | `/api/v1/staff/stay-addons/{stayAddonId}` | owner, front_desk | US-06-06 |
| [`stays.postUpdate`](#ep-stays.postUpdate) | POST | `/api/v1/staff/stays/{stayId}/updates` | owner, front_desk, staff | US-06-10 |
| [`stays.checkOut`](#ep-stays.checkOut) | POST | `/api/v1/staff/stays/{stayId}/check-out` | owner, front_desk | US-06-11 |
| [`stays.noShow`](#ep-stays.noShow) | POST | `/api/v1/staff/stays/{stayId}/no-show` | owner, front_desk | US-07-07 |
| [`stays.cancel`](#ep-stays.cancel) | POST | `/api/v1/staff/stays/{stayId}/cancel` | owner, front_desk | US-05-08 |
| [`roomMap.get`](#ep-roomMap.get) | GET | `/api/v1/staff/room-map` | owner, front_desk, staff | US-06-04 |
| [`careTasks.list`](#ep-careTasks.list) | GET | `/api/v1/staff/care-tasks` | owner, front_desk, staff | US-06-09 |
| [`careTasks.done`](#ep-careTasks.done) | POST | `/api/v1/staff/care-tasks/{taskId}/done` | owner, front_desk, staff | US-06-09 |
| [`careTasks.skip`](#ep-careTasks.skip) | POST | `/api/v1/staff/care-tasks/{taskId}/skip` | owner, front_desk, staff | US-06-09 |
| [`daycare.list`](#ep-daycare.list) | GET | `/api/v1/staff/daycare-visits` | owner, front_desk, staff | US-06-13 |
| [`daycare.check_in`](#ep-daycare.check_in) | POST | `/api/v1/staff/daycare-visits/{visitId}/check-in` | owner, front_desk | US-06-13 |
| [`daycare.check_out`](#ep-daycare.check_out) | POST | `/api/v1/staff/daycare-visits/{visitId}/check-out` | owner, front_desk | US-06-13 |
| [`daycare.no_show`](#ep-daycare.no_show) | POST | `/api/v1/staff/daycare-visits/{visitId}/no-show` | owner, front_desk | US-07-07 |
| [`daycare.cancel`](#ep-daycare.cancel) | POST | `/api/v1/staff/daycare-visits/{visitId}/cancel` | owner, front_desk | US-05-08 |
| [`slips.list`](#ep-slips.list) | GET | `/api/v1/staff/slips` | owner, front_desk | US-07-02 |
| [`slips.verify`](#ep-slips.verify) | POST | `/api/v1/staff/slips/{slipId}/verify` | owner, front_desk | US-07-02 |
| [`slips.reject`](#ep-slips.reject) | POST | `/api/v1/staff/slips/{slipId}/reject` | owner, front_desk | US-07-02 |
| [`refunds.create`](#ep-refunds.create) | POST | `/api/v1/staff/refunds` | owner, front_desk | US-07-05 |
| [`bills.open`](#ep-bills.open) | POST | `/api/v1/staff/bills` | owner, front_desk | US-08-01 |
| [`bills.list`](#ep-bills.list) | GET | `/api/v1/staff/bills` | owner, front_desk | US-08-01 |
| [`bills.get`](#ep-bills.get) | GET | `/api/v1/staff/bills/{billId}` | owner, front_desk | US-08-01 |
| [`bills.addLine`](#ep-bills.addLine) | POST | `/api/v1/staff/bills/{billId}/lines` | owner, front_desk | US-08-01, US-10-05, US-08-03 |
| [`bills.updateLine`](#ep-bills.updateLine) | PATCH | `/api/v1/staff/bill-lines/{lineId}` | owner, front_desk | US-08-02 |
| [`bills.removeLine`](#ep-bills.removeLine) | DELETE | `/api/v1/staff/bill-lines/{lineId}` | owner, front_desk | US-08-01 |
| [`bills.setDiscount`](#ep-bills.setDiscount) | PATCH | `/api/v1/staff/bills/{billId}/discount` | owner, front_desk | US-08-02 |
| [`bills.addPayment`](#ep-bills.addPayment) | POST | `/api/v1/staff/bills/{billId}/payments` | owner, front_desk | US-08-04, US-08-03 |
| [`bills.voidPayment`](#ep-bills.voidPayment) | POST | `/api/v1/staff/payments/{paymentId}/void` | owner, front_desk | US-08-04 |
| [`bills.promptpayQr`](#ep-bills.promptpayQr) | GET | `/api/v1/staff/bills/{billId}/promptpay-qr` | owner, front_desk | US-07-01, US-08-04 |
| [`bills.close`](#ep-bills.close) | POST | `/api/v1/staff/bills/{billId}/close` | owner, front_desk | US-08-04, US-08-05, US-09-02 |
| [`bills.void`](#ep-bills.void) | POST | `/api/v1/staff/bills/{billId}/void` | owner | US-08-06 |
| [`bills.receipt`](#ep-bills.receipt) | GET | `/api/v1/staff/bills/{billId}/receipt` | owner, front_desk | US-08-05 |
| [`bills.sendReceipt`](#ep-bills.sendReceipt) | POST | `/api/v1/staff/bills/{billId}/send-receipt` | owner, front_desk | US-08-05 |
| [`reportCards.list`](#ep-reportCards.list) | GET | `/api/v1/staff/report-cards` | owner, front_desk, staff | US-10-01 |
| [`reportCards.get`](#ep-reportCards.get) | GET | `/api/v1/staff/report-cards/{reportCardId}` | owner, front_desk, staff | US-10-01 |
| [`reportCards.update`](#ep-reportCards.update) | PUT | `/api/v1/staff/report-cards/{reportCardId}` | owner, front_desk, staff | US-10-01, US-10-02 |
| [`reportCards.submit`](#ep-reportCards.submit) | POST | `/api/v1/staff/report-cards/{reportCardId}/submit` | owner, front_desk, staff | US-10-01 |
| [`reportCards.approve`](#ep-reportCards.approve) | POST | `/api/v1/staff/report-cards/{reportCardId}/approve` | owner, front_desk | US-10-01 |
| [`dashboard.today`](#ep-dashboard.today) | GET | `/api/v1/staff/dashboard/today` | owner, front_desk | US-12-01 |
| [`reports.sales`](#ep-reports.sales) | GET | `/api/v1/staff/reports/sales` | owner | US-12-02 |
| [`reports.commissions`](#ep-reports.commissions) | GET | `/api/v1/staff/reports/commissions` | owner | US-12-03 |
| [`reports.occupancy`](#ep-reports.occupancy) | GET | `/api/v1/staff/reports/occupancy` | owner | US-12-04 |
| [`exports.csv`](#ep-exports.csv) | GET | `/api/v1/staff/exports/{type}.csv` | owner | US-12-06 |
| [`audit.list`](#ep-audit.list) | GET | `/api/v1/staff/audit-logs` | owner | US-13-07 |
| [`feedback.create`](#ep-feedback.create) | POST | `/api/v1/staff/feedback` | owner, front_desk, staff | US-13-13 |
| [`liff.session`](#ep-liff.session) | POST | `/api/v1/liff/{branchSlug}/session` | ไม่ต้องล็อกอิน | US-01-01 |
| [`liff.register`](#ep-liff.register) | POST | `/api/v1/liff/{branchSlug}/register` | ลูกค้า (LIFF) | US-11-01, US-13-08, US-03-12 |
| [`liff.me`](#ep-liff.me) | GET | `/api/v1/liff/{branchSlug}/me` | ลูกค้า (LIFF) | US-11-01 |
| [`liff.updateMe`](#ep-liff.updateMe) | PATCH | `/api/v1/liff/{branchSlug}/me` | ลูกค้า (LIFF) | US-11-01, US-03-12 |
| [`liff.shop`](#ep-liff.shop) | GET | `/api/v1/liff/{branchSlug}/shop` | ลูกค้า (LIFF) | US-11-03 |
| [`liff.pets`](#ep-liff.pets) | GET | `/api/v1/liff/{branchSlug}/pets` | ลูกค้า (LIFF) | US-11-02 |
| [`liff.createPet`](#ep-liff.createPet) | POST | `/api/v1/liff/{branchSlug}/pets` | ลูกค้า (LIFF) | US-11-02 |
| [`liff.updatePet`](#ep-liff.updatePet) | PATCH | `/api/v1/liff/{branchSlug}/pets/{petId}` | ลูกค้า (LIFF) | US-11-02 |
| [`liff.addVaccination`](#ep-liff.addVaccination) | POST | `/api/v1/liff/{branchSlug}/pets/{petId}/vaccinations` | ลูกค้า (LIFF) | US-11-02, US-06-05 |
| [`liff.groomSlots`](#ep-liff.groomSlots) | POST | `/api/v1/liff/{branchSlug}/availability/groom-slots` | ลูกค้า (LIFF) | US-11-03 |
| [`liff.hotelAvailability`](#ep-liff.hotelAvailability) | GET | `/api/v1/liff/{branchSlug}/availability/hotel` | ลูกค้า (LIFF) | US-11-04 |
| [`liff.daycareAvailability`](#ep-liff.daycareAvailability) | GET | `/api/v1/liff/{branchSlug}/availability/daycare` | ลูกค้า (LIFF) | US-11-05 |
| [`liff.quote`](#ep-liff.quote) | POST | `/api/v1/liff/{branchSlug}/quotes` | ลูกค้า (LIFF) | US-11-03, US-11-04, US-11-05 |
| [`liff.createBooking`](#ep-liff.createBooking) | POST | `/api/v1/liff/{branchSlug}/bookings` | ลูกค้า (LIFF) | US-11-03, US-11-04, US-11-05, US-11-06, US-05-02 |
| [`liff.bookings`](#ep-liff.bookings) | GET | `/api/v1/liff/{branchSlug}/bookings` | ลูกค้า (LIFF) | US-11-08 |
| [`liff.booking`](#ep-liff.booking) | GET | `/api/v1/liff/{branchSlug}/bookings/{bookingId}` | ลูกค้า (LIFF) | US-11-08 |
| [`liff.uploadSlip`](#ep-liff.uploadSlip) | POST | `/api/v1/liff/{branchSlug}/bookings/{bookingId}/slips` | ลูกค้า (LIFF) | US-11-07, US-07-02 |
| [`liff.cancel`](#ep-liff.cancel) | POST | `/api/v1/liff/{branchSlug}/bookings/{bookingId}/cancel` | ลูกค้า (LIFF) | US-11-08 |
| [`liff.reschedule`](#ep-liff.reschedule) | POST | `/api/v1/liff/{branchSlug}/bookings/{bookingId}/reschedule` | ลูกค้า (LIFF) | US-11-08 |
| [`liff.ics`](#ep-liff.ics) | GET | `/api/v1/liff/{branchSlug}/bookings/{bookingId}/calendar.ics` | ลูกค้า (LIFF) | US-11-10 |
| [`liff.stayUpdates`](#ep-liff.stayUpdates) | GET | `/api/v1/liff/{branchSlug}/stays/{stayId}/updates` | ลูกค้า (LIFF) | US-06-10 |
| [`liff.reportCard`](#ep-liff.reportCard) | GET | `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}` | ลูกค้า (LIFF) | US-10-01, US-10-02 |
| [`liff.rate`](#ep-liff.rate) | POST | `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/rating` | ลูกค้า (LIFF) | US-10-03 |
| [`liff.reviewClick`](#ep-liff.reviewClick) | POST | `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/review-click` | ลูกค้า (LIFF) | US-10-03 |
| [`liff.packages`](#ep-liff.packages) | GET | `/api/v1/liff/{branchSlug}/packages` | ลูกค้า (LIFF) | US-10-06 |
| [`liff.receipt`](#ep-liff.receipt) | GET | `/api/v1/liff/{branchSlug}/receipts/{billId}` | ลูกค้า (LIFF) | US-08-05 |
| [`liff.payPage`](#ep-liff.payPage) | GET | `/api/v1/liff/{branchSlug}/pay/{billId}` | ลูกค้า (LIFF) | US-07-08 |
| [`liff.payUploadSlip`](#ep-liff.payUploadSlip) | POST | `/api/v1/liff/{branchSlug}/pay/{billId}/slips` | ลูกค้า (LIFF) | US-07-08 |
| [`liff.dataRequest`](#ep-liff.dataRequest) | POST | `/api/v1/liff/{branchSlug}/data-requests` | ลูกค้า (LIFF) | US-13-08 |
| [`public.branch`](#ep-public.branch) | GET | `/api/v1/public/branches/{bookingSlug}` | ไม่ต้องล็อกอิน | US-02-07 |
| [`webhook.line`](#ep-webhook.line) | POST | `/api/webhooks/line/{messagingChannelId}` | LINE signature | US-02-06, US-13-06 |
| [`cron.tick`](#ep-cron.tick) | POST | `/api/cron/tick` | cron secret | US-05-02, US-07-06, US-10-04, US-12-05 |
| [`health`](#ep-health) | GET | `/api/health` | ไม่ต้องล็อกอิน | US-13-09 |
| [`admin.login`](#ep-admin.login) | POST | `/api/v1/auth/admin/login` | ไม่ต้องล็อกอิน | US-13-10 |
| [`admin.orgs`](#ep-admin.orgs) | GET | `/api/v1/admin/organizations` | platform admin | US-13-10 |
| [`admin.createOrg`](#ep-admin.createOrg) | POST | `/api/v1/admin/organizations` | platform admin | US-13-10, US-13-14 |
| [`admin.updateOrg`](#ep-admin.updateOrg) | PATCH | `/api/v1/admin/organizations/{orgId}` | platform admin | US-13-10 |
| [`admin.setLineChannel`](#ep-admin.setLineChannel) | PUT | `/api/v1/admin/branches/{branchId}/line-channel` | platform admin | US-02-06 |
| [`admin.verifyLine`](#ep-admin.verifyLine) | POST | `/api/v1/admin/branches/{branchId}/line-channel/verify` | platform admin | US-02-06 |
| [`admin.supportStart`](#ep-admin.supportStart) | POST | `/api/v1/admin/support-sessions` | platform admin | US-13-11 |
| [`admin.supportEnd`](#ep-admin.supportEnd) | POST | `/api/v1/admin/support-sessions/{supportId}/end` | platform admin | US-13-11 |
| [`admin.feedback`](#ep-admin.feedback) | GET | `/api/v1/admin/feedback` | platform admin | US-13-13 |
| [`admin.updateFeedback`](#ep-admin.updateFeedback) | PATCH | `/api/v1/admin/feedback/{feedbackId}` | platform admin | US-13-13 |
| [`admin.dataRequests`](#ep-admin.dataRequests) | GET | `/api/v1/admin/data-requests` | platform admin | US-13-08 |
| [`admin.resolveDataRequest`](#ep-admin.resolveDataRequest) | POST | `/api/v1/admin/data-requests/{requestId}/resolve` | platform admin | US-13-08 |
| [`admin.analytics`](#ep-admin.analytics) | GET | `/api/v1/admin/analytics/pilot` | platform admin | US-13-12 |
| [`admin.holidays`](#ep-admin.holidays) | PUT | `/api/v1/admin/public-holidays/{year}` | platform admin | US-13-03 |
| [`admin.listHolidays`](#ep-admin.listHolidays) | GET | `/api/v1/admin/public-holidays/{year}` | platform admin | US-13-03 |

### กลุ่ม `auth`


<a id="ep-auth.staffLogin"></a>

#### auth.staffLogin

**POST `/api/v1/auth/staff/login`** — เข้าสู่ระบบด้วยอีเมล  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-02 · Rules: R-24

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `email` | string | ✓ | staff_user.email | อีเมล, trim + lowercase |
| `password` | string | ✓ |  | 1–128 ตัว |

Response: `StaffMe`
  
Errors: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `RATE_LIMITED`


ผลที่ต้องเกิด:
- สร้าง session (subject staff, อายุ 30 วัน sliding) ตั้ง cookie `sid` httpOnly Secure SameSite=Lax
- อัปเดต staff_user.failed_login_count/locked_until/last_login_at ตาม R-24
- rate limit 10 ครั้ง/นาที/IP


<a id="ep-auth.staffLogout"></a>

#### auth.staffLogout

**POST `/api/v1/auth/staff/logout`** — ออกจากระบบ  
สิทธิ์: owner, front_desk, staff · Stories: US-01-02

Response: `204` (No Content)


ผลที่ต้องเกิด:
- ลบ session ปัจจุบัน + ล้าง cookie


<a id="ep-auth.me"></a>

#### auth.me

**GET `/api/v1/auth/staff/me`** — ข้อมูล session  
สิทธิ์: owner, front_desk, staff · Stories: US-01-02

Response: `StaffMe`


<a id="ep-auth.resetRequest"></a>

#### auth.resetRequest

**POST `/api/v1/auth/staff/password-reset/request`** — ขอลิงก์รีเซ็ตรหัสผ่าน  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `email` | string | ✓ | staff_user.email | อีเมล |

Response: `204` (No Content)
  
Errors: `RATE_LIMITED`
  
Notify: `staff.password_reset`


ผลที่ต้องเกิด:
- ตอบ 204 เสมอ (ไม่บอกว่ามีอีเมลไหม)
- มีจริง → สร้าง password_reset (30 นาที) ส่งอีเมลลิงก์


<a id="ep-auth.resetConfirm"></a>

#### auth.resetConfirm

**POST `/api/v1/auth/staff/password-reset/confirm`** — ตั้งรหัสผ่านใหม่  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-02 · Rules: R-24

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `token` | string | ✓ | password_reset.token_hash | token จากลิงก์ (DB เก็บ sha256) |
| `newPassword` | string | ✓ | staff_user.password_hash | R-24 policy |

Response: `204` (No Content)
  
Errors: `TOKEN_INVALID`, `PASSWORD_POLICY`


ผลที่ต้องเกิด:
- ตั้ง password_reset.used_at, ลบ session เดิมทั้งหมดของผู้ใช้


<a id="ep-auth.invitePreview"></a>

#### auth.invitePreview

**GET `/api/v1/auth/staff/invite`** — ดูคำเชิญก่อนรับ (Q-0044)  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-04

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `token` | string | ✓ | staff_invite.token_hash | token จากลิงก์ |

Response: `InvitePreview`
  
Errors: `TOKEN_INVALID`


ผลที่ต้องเกิด:
- token ไม่พบ/หมดอายุ/ใช้แล้ว → TOKEN_INVALID; ไม่สร้าง session


<a id="ep-auth.inviteAccept"></a>

#### auth.inviteAccept

**POST `/api/v1/auth/staff/invite/accept`** — รับคำเชิญ ตั้งชื่อและรหัสผ่าน  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-04 · Rules: R-24

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `token` | string | ✓ | staff_invite.token_hash | token จากลิงก์ |
| `displayName` | string | ✓ | staff_user.display_name | 1–40 ตัว |
| `email` | string |  | staff_user.email | ต้องมีถ้าคำเชิญไม่มีอีเมล |
| `password` | string |  | staff_user.password_hash | R-24; ไม่ส่ง = ใช้ LINE login อย่างเดียว |

Response: `StaffMe`
  
Errors: `TOKEN_INVALID`, `PASSWORD_POLICY`, `EMAIL_TAKEN`
  
State: `staff_user:invited→active`


ผลที่ต้องเกิด:
- staff_invite.accepted_at = now, staff_user.status invited → active, สร้าง session


<a id="ep-auth.staffLine"></a>

#### auth.staffLine

**POST `/api/v1/auth/staff/line`** — ช่างเข้า Staff app ด้วย LINE  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `idToken` | string | ✓ |  | LINE ID token จาก LINE Login ของแพลตฟอร์ม |

Response: `StaffMe`
  
Errors: `LINE_TOKEN_INVALID`, `INVALID_CREDENTIALS`


ผลที่ต้องเกิด:
- verify ID token กับ PLATFORM_LINE_LOGIN_CHANNEL_ID → หา staff_user.line_user_id = sub ที่ status active
- ไม่พบ → INVALID_CREDENTIALS


### กลุ่ม `staffMe`


<a id="ep-staffMe.linkLine"></a>

#### staffMe.linkLine

**POST `/api/v1/staff/me/line-link`** — ผูก LINE กับบัญชีพนักงาน  
สิทธิ์: owner, front_desk, staff · Stories: US-01-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `idToken` | string | ✓ | staff_user.line_user_id | LINE ID token |

Response: `StaffMe`
  
Errors: `LINE_TOKEN_INVALID`, `EMAIL_TAKEN`


<a id="ep-staffMe.sessions"></a>

#### staffMe.sessions

**GET `/api/v1/staff/me/sessions`** — อุปกรณ์ที่ล็อกอินอยู่  
สิทธิ์: owner, front_desk, staff · Stories: US-01-05

Response: `object[] {id: session.id, userAgent: session.user_agent, lastSeenAt: session.last_seen_at, current: bool}`


<a id="ep-staffMe.revokeSession"></a>

#### staffMe.revokeSession

**DELETE `/api/v1/staff/me/sessions/{sessionId}`** — ออกจากระบบอุปกรณ์อื่น  
สิทธิ์: owner, front_desk, staff · Stories: US-01-05

Response: `204` (No Content)


<a id="ep-staffMe.pushSubscribe"></a>

#### staffMe.pushSubscribe

**POST `/api/v1/staff/me/push-subscriptions`** — ลงทะเบียน Web Push  
สิทธิ์: owner, front_desk, staff · Stories: US-13-05, US-09-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `endpoint` | string | ✓ | web_push_subscription.endpoint | https URL |
| `p256dh` | string | ✓ | web_push_subscription.p256dh |  |
| `auth` | string | ✓ | web_push_subscription.auth |  |

Response: `204` (No Content)


ผลที่ต้องเกิด:
- upsert ตาม endpoint, ล้าง disabled_at


<a id="ep-staffMe.pushUnsubscribe"></a>

#### staffMe.pushUnsubscribe

**DELETE `/api/v1/staff/me/push-subscriptions`** — ยกเลิก Web Push  
สิทธิ์: owner, front_desk, staff · Stories: US-13-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `endpoint` | string | ✓ | web_push_subscription.endpoint |  |

Response: `204` (No Content)


<a id="ep-staffMe.commissions"></a>

#### staffMe.commissions

**GET `/api/v1/staff/me/commissions`** — ค่ามือของฉัน  
สิทธิ์: owner, front_desk, staff · Stories: US-09-05 · Rules: R-13

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  | ≤ 93 วัน |

Response: `CommissionReport`


ผลที่ต้องเกิด:
- กรองเฉพาะ staff_user_id = ผู้ใช้ปัจจุบัน และสาขาของ session
- from..to = วันท้องถิ่นของสาขา (รวมทั้งสองวัน); ยอดคิดตาม CommissionReport (Q-0030)


### กลุ่ม `staff`


<a id="ep-staff.uploadUrl"></a>

#### staff.uploadUrl

**POST `/api/v1/staff/files/upload-url`** — ขอ URL อัปโหลดไฟล์  
สิทธิ์: owner, front_desk, staff · Stories: US-13-04 · Rules: R-25

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `kind` | enum:file_kind | ✓ | file_object.kind | R-25 (ลูกค้า: pet_profile, vaccine_proof, slip เท่านั้น) |
| `mimeType` | string | ✓ | file_object.mime_type | R-25 |
| `sizeBytes` | int | ✓ | file_object.size_bytes | R-25 |
| `width` | int |  | file_object.width |  |
| `height` | int |  | file_object.height |  |

Response: `UploadTicket`
  
Errors: `UPLOAD_KIND_NOT_ALLOWED`, `UPLOAD_TYPE_NOT_ALLOWED`, `UPLOAD_TOO_LARGE`


ผลที่ต้องเกิด:
- สร้าง file_object (committed_at null) แล้วคืน presigned PUT
- ไฟล์ถูก commit เมื่อ endpoint อื่นอ้าง fileId (ตรวจว่ามี object จริงด้วย HEAD)


### กลุ่ม `customer`


<a id="ep-customer.uploadUrl"></a>

#### customer.uploadUrl

**POST `/api/v1/liff/{branchSlug}/files/upload-url`** — ขอ URL อัปโหลดไฟล์  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-13-04 · Rules: R-25

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `kind` | enum:file_kind | ✓ | file_object.kind | R-25 (ลูกค้า: pet_profile, vaccine_proof, slip เท่านั้น) |
| `mimeType` | string | ✓ | file_object.mime_type | R-25 |
| `sizeBytes` | int | ✓ | file_object.size_bytes | R-25 |
| `width` | int |  | file_object.width |  |
| `height` | int |  | file_object.height |  |

Response: `UploadTicket`
  
Errors: `UPLOAD_KIND_NOT_ALLOWED`, `UPLOAD_TYPE_NOT_ALLOWED`, `UPLOAD_TOO_LARGE`


ผลที่ต้องเกิด:
- สร้าง file_object (committed_at null) แล้วคืน presigned PUT
- ไฟล์ถูก commit เมื่อ endpoint อื่นอ้าง fileId (ตรวจว่ามี object จริงด้วย HEAD)


### กลุ่ม `branch`


<a id="ep-branch.get"></a>

#### branch.get

**GET `/api/v1/staff/branch`** — ตั้งค่าสาขา  
สิทธิ์: owner, front_desk, staff · Stories: US-02-01

Response: `BranchSettings`


<a id="ep-branch.update"></a>

#### branch.update

**PATCH `/api/v1/staff/branch`** — แก้ข้อมูลร้าน  
สิทธิ์: owner · Stories: US-02-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `name` | string |  | branch.name | 1–80 |
| `phone` | string |  | branch.phone | R-22 |
| `addressLine` | string |  | branch.address_line | ≤ 200 |
| `subdistrict` | string |  | branch.subdistrict |  |
| `district` | string |  | branch.district |  |
| `province` | string |  | branch.province | รายชื่อ 77 จังหวัด |
| `postalCode` | string |  | branch.postal_code | ^\d{5}$ |
| `latitude` | number |  | branch.latitude | -90..90 |
| `longitude` | number |  | branch.longitude | -180..180 |
| `logoFileId` | uuid |  | branch.logo_file_id | file kind logo |
| `facebookUrl` | string |  | branch.facebook_url | URL |
| `instagramUrl` | string |  | branch.instagram_url | URL |
| `receiptPrefix` | string |  | branch.receipt_prefix | ^[A-Z]{1,3}$ |

Response: `BranchSettings`


<a id="ep-branch.setHours"></a>

#### branch.setHours

**PUT `/api/v1/staff/branch/hours`** — ตั้งเวลาเปิด-ปิด 7 วัน  
สิทธิ์: owner · Stories: US-02-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `hours[]` | object[] | ✓ | branch_hours.weekday | ครบ 7 แถว weekday 0–6 ไม่ซ้ำ |
| `hours[].isClosed` | bool | ✓ | branch_hours.is_closed |  |
| `hours[].opensAt` | time |  | branch_hours.opens_at | HH:MM, บังคับเมื่อไม่ปิด |
| `hours[].closesAt` | time |  | branch_hours.closes_at | > opensAt |

Response: `BranchSettings`


ผลที่ต้องเกิด:
- แทนที่ทั้ง 7 แถว
- ไม่ย้าย/ยกเลิกนัดเดิมที่อยู่นอกเวลาใหม่ — ตอบ warnings[] รายการนัดที่ได้รับผล


<a id="ep-branch.setModules"></a>

#### branch.setModules

**PATCH `/api/v1/staff/branch/modules`** — เปิด/ปิดโมดูล  
สิทธิ์: owner · Stories: US-02-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `grooming` | bool |  | branch.module_grooming |  |
| `hotel` | bool |  | branch.module_hotel |  |
| `daycare` | bool |  | branch.module_daycare |  |

Response: `BranchSettings`


ผลที่ต้องเกิด:
- ปิดโมดูลที่มีใบจองอนาคต → ได้ แต่ LIFF ซ่อนเมนู; ตอบ warnings[] จำนวนใบจองที่ค้าง


<a id="ep-branch.updatePolicy"></a>

#### branch.updatePolicy

**PATCH `/api/v1/staff/branch/policy`** — แก้นโยบายร้าน  
สิทธิ์: owner · Stories: US-02-04, US-07-03, US-07-04, US-05-05, US-06-05, US-13-06

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<field>` | any |  | branch_policy.default_deposit_type | ทุกฟิลด์ของ BranchPolicy แก้ได้บางส่วน; ตรวจ CHECK ใน 02 (percent 0–100, step 5/10/15/30) |
| `requiredVaccinesDog[]` | string[] |  | branch_policy.required_vaccines_dog | รหัสต้องอยู่ใน vaccine_type species dog |
| `requiredVaccinesCat[]` | string[] |  | branch_policy.required_vaccines_cat | รหัส vaccine_type species cat |
| `googleReviewUrl` | string |  | branch_policy.google_review_url | URL https |

Response: `BranchPolicy`
  
Audit: `policy.update`


ผลที่ต้องเกิด:
- ใบจองเดิมใช้ policy_snapshot เดิม (ไม่กระทบ)


<a id="ep-branch.setPromptpay"></a>

#### branch.setPromptpay

**PUT `/api/v1/staff/branch/promptpay`** — ตั้งบัญชี PromptPay  
สิทธิ์: owner · Stories: US-02-03 · Rules: R-30

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `type` | enum:promptpay_type | ✓ | branch.promptpay_type |  |
| `id` | string | ✓ | branch.promptpay_id | R-30 รูปแบบตาม type |
| `accountName` | string | ✓ | branch.promptpay_account_name | 1–80 |
| `password` | string | ✓ |  | ยืนยันรหัสผ่านเจ้าของซ้ำ (กันคนอื่นแก้บัญชีรับเงิน) |

Response: `BranchSettings`
  
Errors: `INVALID_PROMPTPAY_ID`, `INVALID_CREDENTIALS`
  
Audit: `promptpay.update`
  
Notify: `owner.promptpay_changed`


ผลที่ต้องเกิด:
- แจ้งเจ้าของร้านทุกคนทาง web push + email


### กลุ่ม `closures`


<a id="ep-closures.list"></a>

#### closures.list

**GET `/api/v1/staff/branch/closures`** — วันปิด/ช่วงปิด  
สิทธิ์: owner, front_desk, staff · Stories: US-02-05

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date |  |  |  |
| `to` | date |  |  |  |

Response: `object[] branch_closure.*`


<a id="ep-closures.create"></a>

#### closures.create

**POST `/api/v1/staff/branch/closures`** — เพิ่มวันปิด  
สิทธิ์: owner, front_desk · Stories: US-02-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `startsAt` | datetime | ✓ | branch_closure.starts_at |  |
| `endsAt` | datetime | ✓ | branch_closure.ends_at | > startsAt |
| `scope` | enum:closure_scope | ✓ | branch_closure.scope |  |
| `reason` | string |  | branch_closure.reason | ≤ 200 |

Response: `object {affected: AffectedServiceItem[]}`


ผลที่ต้องเกิด:
- ไม่ยกเลิก/ย้ายอัตโนมัติ — หน้าร้านจัดการเอง; ตอบ 200 เสมอ, ไม่มีรายการทับ → affected = [] (Q-0028)
- affected[] = รายการที่ยังไม่จบในสาขานี้ที่ทับช่วงปิด (ใช้ scope แบบเดียวกับการหาเวลาว่างกรูม/ห้องว่าง): grooming (scope all/grooming) — groom_appointment status scheduled/checked_in/in_progress และ [starts_at, ends_at) ทับ [startsAt, endsAt) · hotel (scope all/hotel) — stay status reserved/checked_in ที่มีคืนพัก d (check_in_date ≤ d < check_out_date) ซึ่งวันท้องถิ่น d ทับช่วงปิด · daycare (scope all/daycare) — daycare_visit status reserved/checked_in ที่วันท้องถิ่น visit_date ทับช่วงปิด
- เรียง affected[] ตาม date, startsAt (null ท้าย), bookingNo


<a id="ep-closures.delete"></a>

#### closures.delete

**DELETE `/api/v1/staff/branch/closures/{closureId}`** — ลบวันปิด  
สิทธิ์: owner, front_desk · Stories: US-02-05

Response: `204` (No Content)


<a id="ep-closures.importHolidays"></a>

#### closures.importHolidays

**POST `/api/v1/staff/branch/closures/public-holidays`** — เพิ่มวันหยุดราชการเป็นวันปิด  
สิทธิ์: owner · Stories: US-02-05, US-13-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `year` | int | ✓ | public_holiday.holiday_date | ปี ค.ศ. |
| `dates[]` | date[] | ✓ | public_holiday.holiday_date | เลือกบางวัน |
| `scope` | enum:closure_scope | ✓ | branch_closure.scope |  |

Response: `204` (No Content)


ผลที่ต้องเกิด:
- สร้าง branch_closure source public_holiday ทั้งวันท้องถิ่น


### กลุ่ม `stations`


<a id="ep-stations.list"></a>

#### stations.list

**GET `/api/v1/staff/stations`** — โต๊ะกรูม  
สิทธิ์: owner, front_desk, staff · Stories: US-05-01

Response: `object[] groom_station.*`


<a id="ep-stations.upsert"></a>

#### stations.upsert

**PUT `/api/v1/staff/stations`** — ตั้งค่าโต๊ะกรูม  
สิทธิ์: owner · Stories: US-05-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `stations[].id` | uuid |  | groom_station.id | ไม่ส่ง = สร้างใหม่ |
| `stations[].name` | string | ✓ | groom_station.name | 1–30 |
| `stations[].sortOrder` | int | ✓ | groom_station.sort_order |  |
| `stations[].status` | enum:record_status | ✓ | groom_station.status |  |

Response: `204` (No Content)


### กลุ่ม `line`


<a id="ep-line.status"></a>

#### line.status

**GET `/api/v1/staff/branch/line`** — สถานะ LINE และโควตา  
สิทธิ์: owner, front_desk · Stories: US-02-06, US-13-06 · Rules: R-18

Response: `LineStatus`


<a id="ep-line.skipped"></a>

#### line.skipped

**GET `/api/v1/staff/notifications/skipped`** — ข้อความที่ไม่ได้ส่ง  
สิทธิ์: owner, front_desk · Stories: US-13-06

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `days` | int |  |  | 1–30, default 7 |

Response: `SkippedMessageItem[]`


### กลุ่ม `staffUsers`


<a id="ep-staffUsers.list"></a>

#### staffUsers.list

**GET `/api/v1/staff/staff-users`** — รายชื่อพนักงาน  
สิทธิ์: owner, front_desk, staff · Stories: US-01-04, US-09-01

Response: `StaffUserItem[]`


ผลที่ต้องเกิด:
- role staff เห็นเฉพาะ id, displayName, isGroomer, photoUrl


<a id="ep-staffUsers.invite"></a>

#### staffUsers.invite

**POST `/api/v1/staff/staff-users/invite`** — เชิญพนักงาน  
สิทธิ์: owner · Stories: US-01-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `displayName` | string | ✓ | staff_user.display_name | 1–40 |
| `email` | string |  | staff_user.email | อีเมล; ไม่ใส่ = เชิญผ่านลิงก์ LINE |
| `role` | enum:staff_role | ✓ | staff_user.role |  |
| `isGroomer` | bool | ✓ | staff_user.is_groomer |  |

Response: `object {staffUser: StaffUserItem, inviteUrl: string}`
  
Errors: `EMAIL_TAKEN`
  
Audit: `staff.invite`
  
Notify: `staff.invite`


ผลที่ต้องเกิด:
- สร้าง staff_user status invited + staff_invite (7 วัน)
- มีอีเมล → ส่งอีเมล; คืน inviteUrl ให้ส่งทาง LINE เองได้


<a id="ep-staffUsers.update"></a>

#### staffUsers.update

**PATCH `/api/v1/staff/staff-users/{staffUserId}`** — แก้ข้อมูล/สิทธิ์พนักงาน  
สิทธิ์: owner · Stories: US-01-04, US-09-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `displayName` | string |  | staff_user.display_name |  |
| `phone` | string |  | staff_user.phone | R-22 |
| `role` | enum:staff_role |  | staff_user.role |  |
| `isGroomer` | bool |  | staff_user.is_groomer |  |
| `sortOrder` | int |  | staff_user.sort_order |  |
| `photoFileId` | uuid |  | staff_user.photo_file_id |  |
| `status` | enum:staff_status |  | staff_user.status | active ↔ disabled เท่านั้น |

Response: `StaffUserItem`
  
Errors: `LAST_OWNER`
  
State: `staff_user:active↔disabled`
  
Audit: `staff.role_change`


ผลที่ต้องเกิด:
- disabled → ลบ session ทั้งหมดของคนนั้น; นัดอนาคตของช่างที่ถูกปิดยังอยู่ — ตอบ warnings[]


<a id="ep-staffUsers.resendInvite"></a>

#### staffUsers.resendInvite

**POST `/api/v1/staff/staff-users/{staffUserId}/resend-invite`** — ส่งคำเชิญใหม่  
สิทธิ์: owner · Stories: US-01-04

Response: `object {inviteUrl: string}`


ผลที่ต้องเกิด:
- สร้าง staff_invite ใหม่ (อันเก่ายังใช้ได้จนหมดอายุ)


### กลุ่ม `workingHours`


<a id="ep-workingHours.set"></a>

#### workingHours.set

**PUT `/api/v1/staff/staff-users/{staffUserId}/working-hours`** — ตั้งเวลาทำงานรายสัปดาห์  
สิทธิ์: owner, front_desk · Stories: US-09-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `days[].weekday` | int | ✓ | staff_working_hours.weekday | 0–6 ไม่ซ้ำ; ไม่ส่งวันไหน = หยุดวันนั้น |
| `days[].startsAt` | time | ✓ | staff_working_hours.starts_at |  |
| `days[].endsAt` | time | ✓ | staff_working_hours.ends_at | > startsAt |
| `days[].breakStartsAt` | time |  | staff_working_hours.break_starts_at |  |
| `days[].breakEndsAt` | time |  | staff_working_hours.break_ends_at |  |

Response: `StaffUserItem`


ผลที่ต้องเกิด:
- แทนที่ทั้งชุด; ตอบ warnings[] นัดอนาคตที่อยู่นอกเวลาใหม่


### กลุ่ม `timeOff`


<a id="ep-timeOff.list"></a>

#### timeOff.list

**GET `/api/v1/staff/time-off`** — วันลา  
สิทธิ์: owner, front_desk, staff · Stories: US-09-01

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  |  |

Response: `object[] staff_time_off.*`


<a id="ep-timeOff.create"></a>

#### timeOff.create

**POST `/api/v1/staff/time-off`** — เพิ่มวันลา  
สิทธิ์: owner, front_desk · Stories: US-09-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `staffUserId` | uuid | ✓ | staff_time_off.staff_user_id |  |
| `startsAt` | datetime | ✓ | staff_time_off.starts_at |  |
| `endsAt` | datetime | ✓ | staff_time_off.ends_at | > startsAt |
| `reason` | string |  | staff_time_off.reason |  |

Response: `object {affected: AffectedServiceItem[]}`


ผลที่ต้องเกิด:
- ไม่ย้ายนัดอัตโนมัติ — หน้าร้านย้ายเอง; ตอบ 200 เสมอ, ไม่มีนัดทับ → affected = [] (Q-0028)
- affected[] = groom_appointment ของ groomer_id = staffUserId ในสาขานี้ status scheduled/checked_in/in_progress ที่ [starts_at, ends_at) ทับ [startsAt, endsAt) (module = grooming) เรียงตาม startsAt


<a id="ep-timeOff.delete"></a>

#### timeOff.delete

**DELETE `/api/v1/staff/time-off/{timeOffId}`** — ลบวันลา  
สิทธิ์: owner, front_desk · Stories: US-09-01

Response: `204` (No Content)


### กลุ่ม `search`


<a id="ep-search.quick"></a>

#### search.quick

**GET `/api/v1/staff/search`** — ค้นหาเร็ว (ชื่อ ชื่อเล่น เบอร์ ชื่อน้อง เลขใบจอง)  
สิทธิ์: owner, front_desk, staff · Stories: US-03-10 · Rules: R-22

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `q` | string | ✓ |  | ≥ 2 ตัวอักษร; ถ้าเป็นเบอร์ normalize ด้วย R-22 แล้วค้น prefix ของ owner_profile.phone_e164 |

Response: `object {customers: CustomerListItem[], bookings: BookingListItem[]}`


ผลที่ต้องเกิด:
- ค้นแบบ ILIKE บน owner_profile.first_name/last_name/nickname, pet.name; ตรงตัวบน booking.booking_no; จำกัด 20 ผล; ใช้ pg_trgm index (เพิ่มใน migration ของ US-03-10)


### กลุ่ม `customers`


<a id="ep-customers.list"></a>

#### customers.list

**GET `/api/v1/staff/customers`** — รายการลูกค้า  
สิทธิ์: owner, front_desk · Stories: US-03-01

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `q` | string |  |  |  |
| `sort` | enum |  |  | last_visit_desc \| name_asc \| created_desc |
| `cursor` | string |  |  |  |
| `limit` | int |  |  | 1–200 |

Response: `Paged<CustomerListItem>`


<a id="ep-customers.create"></a>

#### customers.create

**POST `/api/v1/staff/customers`** — เพิ่มลูกค้า (หน้าร้าน)  
สิทธิ์: owner, front_desk · Stories: US-03-01 · Rules: R-22

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `firstName` | string | ✓ | owner_profile.first_name | 1–60 |
| `lastName` | string |  | owner_profile.last_name | ≤ 60 |
| `nickname` | string |  | owner_profile.nickname | ≤ 30 |
| `phone` | string |  | owner_profile.phone_e164 | R-22 (แนะนำให้มี) |
| `email` | string |  | owner_profile.email |  |
| `sourceChannel` | enum:booking_channel |  | customer.source_channel | default walk_in |
| `referralNote` | string |  | customer.referral_note |  |
| `internalNote` | string |  | customer.internal_note | ≤ 2000 |
| `photoConsent` | enum:photo_consent |  | customer.photo_consent | default unknown |

Response: `CustomerDetail`
  
Errors: `INVALID_PHONE`


ผลที่ต้องเกิด:
- สร้าง owner_profile (created_in_org_id = org) + customer ใน transaction
- เบอร์ซ้ำกับลูกค้าเดิมในร้าน → ไม่ error แต่ตอบ warnings[] {duplicateCustomerIds}


<a id="ep-customers.get"></a>

#### customers.get

**GET `/api/v1/staff/customers/{customerId}`** — รายละเอียดลูกค้า  
สิทธิ์: owner, front_desk, staff · Stories: US-03-01

Response: `CustomerDetail`


ผลที่ต้องเกิด:
- role staff: ไม่เห็น phone, email, address, internalNote, creditBalance (ตัดออกจาก response)


<a id="ep-customers.update"></a>

#### customers.update

**PATCH `/api/v1/staff/customers/{customerId}`** — แก้ข้อมูลลูกค้า  
สิทธิ์: owner, front_desk · Stories: US-03-01 · Rules: R-22

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<owner_profile fields>` | any |  | owner_profile.first_name | เหมือน create + birthDate, ที่อยู่ |
| `emergencyContactName` | string |  | customer.emergency_contact_name |  |
| `emergencyContactPhone` | string |  | customer.emergency_contact_phone | R-22 |
| `internalNote` | string |  | customer.internal_note |  |
| `depositExempt` | bool |  | customer.deposit_exempt | owner เท่านั้น |
| `photoConsent` | enum:photo_consent |  | customer.photo_consent | ตั้ง photo_consent_at = now |

Response: `CustomerDetail`


<a id="ep-customers.blacklist"></a>

#### customers.blacklist

**POST `/api/v1/staff/customers/{customerId}/blacklist`** — ตั้ง/ยกเลิก blacklist  
สิทธิ์: owner · Stories: US-03-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `blacklisted` | bool | ✓ | customer.blacklisted |  |
| `reason` | string | ✓ | customer.blacklist_reason | ≥ 3 ตัว ทั้งตอนตั้งและยกเลิก (Q-0034) |

Response: `CustomerDetail`
  
Errors: `REASON_REQUIRED`
  
Audit: `customer.blacklist`


<a id="ep-customers.reliabilityOverride"></a>

#### customers.reliabilityOverride

**PUT `/api/v1/staff/customers/{customerId}/reliability-override`** — กำหนดระดับความน่าเชื่อถือเอง  
สิทธิ์: owner · Stories: US-03-09 · Rules: R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `level` | int |  | customer.reliability_override | 1–4 หรือ null = ใช้ค่าคำนวณ |
| `reason` | string | ✓ |  | ≥ 3 ตัว |

Response: `CustomerDetail`
  
Audit: `customer.reliability_override`


<a id="ep-customers.timeline"></a>

#### customers.timeline

**GET `/api/v1/staff/customers/{customerId}/timeline`** — ประวัติทั้งหมด  
สิทธิ์: owner, front_desk · Stories: US-03-08

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `cursor` | string |  |  |  |

Response: `Paged<object {at, type: booking\|groom\|stay\|daycare\|bill\|report_card\|note, title, petName, amountSatang, refId}>`


ผลที่ต้องเกิด:
- รวม booking_event, bill (paid/void), report_card sent เรียงใหม่→เก่า


<a id="ep-customers.credit"></a>

#### customers.credit

**POST `/api/v1/staff/customers/{customerId}/credit-adjustments`** — ปรับเครดิตลูกค้าเอง  
สิทธิ์: owner · Stories: US-07-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `deltaSatang` | int | ✓ | credit_ledger.delta_satang | ≠ 0; ผลรวมใหม่ ≥ 0 |
| `reason` | string | ✓ |  | ≥ 3 ตัว |

Response: `CustomerDetail`
  
Errors: `REASON_REQUIRED`, `INSUFFICIENT_CREDIT`
  
Audit: `credit.adjust`


ผลที่ต้องเกิด:
- insert credit_ledger reason adjustment + update customer.credit_balance_satang ใน transaction เดียว


<a id="ep-customers.packages"></a>

#### customers.packages

**GET `/api/v1/staff/customers/{customerId}/packages`** — แพ็กเกจของลูกค้า  
สิทธิ์: owner, front_desk · Stories: US-10-05

Response: `CustomerPackageItem[]`


### กลุ่ม `pets`


<a id="ep-pets.create"></a>

#### pets.create

**POST `/api/v1/staff/customers/{customerId}/pets`** — เพิ่มน้อง  
สิทธิ์: owner, front_desk · Stories: US-03-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `name` | string | ✓ | pet.name | 1–40 |
| `species` | enum:species | ✓ | pet.species |  |
| `speciesOther` | string |  | pet.species_other | บังคับเมื่อ other |
| `breed` | string |  | pet.breed | จากรายการ breed หรือพิมพ์เอง ≤ 60 |
| `sex` | enum:pet_sex |  | pet.sex |  |
| `birthDate` | date |  | pet.birth_date | ≤ วันนี้ |
| `ageEstimateMonths` | int |  | pet.age_estimate_months | 0–360; ใช้เมื่อไม่รู้วันเกิด |
| `neutered` | bool |  | pet.neutered |  |
| `color` | string |  | pet.color |  |
| `microchipNo` | string |  | pet.microchip_no | 15 หลัก |
| `coatType` | enum:coat_type | ✓ | pet.coat_type |  |
| `weightGrams` | int |  | pet_weight.weight_grams | 100–150000; สร้าง pet_weight |
| `profileFileId` | uuid |  | pet.profile_file_id | kind pet_profile |

Response: `PetDetail`


ผลที่ต้องเกิด:
- สร้าง pet (owner_profile ของลูกค้า) + pet_shop_profile ว่างของ org + pet_weight ถ้ามี


<a id="ep-pets.get"></a>

#### pets.get

**GET `/api/v1/staff/pets/{petId}`** — รายละเอียดน้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-03-02, US-03-03, US-03-04

Response: `PetDetail`


ผลที่ต้องเกิด:
- ต้องมี pet_shop_profile ของ org นี้ ไม่งั้น NOT_FOUND


<a id="ep-pets.update"></a>

#### pets.update

**PATCH `/api/v1/staff/pets/{petId}`** — แก้ข้อมูลน้อง  
สิทธิ์: owner, front_desk · Stories: US-03-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<pet fields>` | any |  | pet.name | เหมือน create ยกเว้น weightGrams |

Response: `PetDetail`


<a id="ep-pets.setStatus"></a>

#### pets.setStatus

**POST `/api/v1/staff/pets/{petId}/status`** — น้องจากไป/ย้ายบ้าน  
สิทธิ์: owner, front_desk · Stories: US-03-11

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `status` | enum:pet_status | ✓ | pet.status |  |
| `note` | string |  |  |  |

Response: `PetDetail`


ผลที่ต้องเกิด:
- ตั้ง pet.status_changed_at; deceased/rehomed → ยกเลิก scheduled_job ที่ payload.petId = นี้ (next_groom_reminder)
- ใบจองอนาคตไม่ยกเลิกอัตโนมัติ — ตอบ warnings[]


<a id="ep-pets.updateShopProfile"></a>

#### pets.updateShopProfile

**PUT `/api/v1/staff/pets/{petId}/shop-profile`** — ข้อมูลกรูม/สุขภาพ/โน้ตของร้าน  
สิทธิ์: owner, front_desk, staff · Stories: US-03-03, US-03-04, US-03-07

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `preferredStyle` | string |  | pet_shop_profile.preferred_style | ≤ 200 |
| `bladeNo` | string |  | pet_shop_profile.blade_no | ≤ 20 |
| `shampooOk` | string |  | pet_shop_profile.shampoo_ok |  |
| `shampooAvoid` | string |  | pet_shop_profile.shampoo_avoid |  |
| `allergies` | string |  | pet_shop_profile.allergies |  |
| `conditions` | string |  | pet_shop_profile.conditions |  |
| `medications` | string |  | pet_shop_profile.medications |  |
| `vetClinicName` | string |  | pet_shop_profile.vet_clinic_name |  |
| `vetClinicPhone` | string |  | pet_shop_profile.vet_clinic_phone | R-22 |
| `internalNote` | string |  | pet_shop_profile.internal_note | ≤ 2000 |
| `sharedNote` | string |  | pet_shop_profile.shared_note | ≤ 1000 ลูกค้าเห็น |
| `favoriteStylePhotoId` | uuid |  | pet_shop_profile.favorite_style_photo_id | pet_photo ของน้องตัวนี้ |
| `groomIntervalDays` | int |  | pet_shop_profile.groom_interval_days | 7–180 หรือ null |

Response: `PetDetail`


<a id="ep-pets.addWeight"></a>

#### pets.addWeight

**POST `/api/v1/staff/pets/{petId}/weights`** — บันทึกน้ำหนัก  
สิทธิ์: owner, front_desk, staff · Stories: US-03-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `weightGrams` | int | ✓ | pet_weight.weight_grams | 100–150000 |
| `measuredAt` | datetime |  | pet_weight.measured_at | default now |

Response: `PetDetail`


ผลที่ต้องเกิด:
- อัปเดต pet.latest_weight_grams ถ้าเป็นค่าล่าสุด


<a id="ep-pets.setFlags"></a>

#### pets.setFlags

**PUT `/api/v1/staff/pets/{petId}/temperament-flags`** — ตั้งป้ายนิสัย  
สิทธิ์: owner, front_desk, staff · Stories: US-03-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `flags[].flag` | enum:temperament_flag | ✓ | pet_temperament_flag.flag | ไม่ซ้ำ |
| `flags[].note` | string |  | pet_temperament_flag.note | บังคับเมื่อ other |

Response: `PetDetail`


ผลที่ต้องเกิด:
- แทนที่ทั้งชุดของ org นี้


### กลุ่ม `vaccinations`


<a id="ep-vaccinations.create"></a>

#### vaccinations.create

**POST `/api/v1/staff/pets/{petId}/vaccinations`** — เพิ่มวัคซีน (ร้านบันทึก = verified)  
สิทธิ์: owner, front_desk · Stories: US-03-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `vaccineCode` | string | ✓ | pet_vaccination.vaccine_code | ต้องตรง species ของน้อง |
| `administeredOn` | date |  | pet_vaccination.administered_on | ≤ วันนี้ |
| `expiresOn` | date |  | pet_vaccination.expires_on | ไม่ส่ง = administeredOn + default_validity_months |
| `proofFileId` | uuid |  | pet_vaccination.proof_file_id | kind vaccine_proof |

Response: `VaccinationItem`


ผลที่ต้องเกิด:
- status verified, source shop, verified_org_id/by/at


<a id="ep-vaccinations.verify"></a>

#### vaccinations.verify

**POST `/api/v1/staff/vaccinations/{vaccinationId}/verify`** — ยืนยันวัคซีนที่ลูกค้าส่ง  
สิทธิ์: owner, front_desk · Stories: US-03-05, US-06-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `expiresOn` | date |  | pet_vaccination.expires_on | แก้ได้ก่อนยืนยัน |

Response: `VaccinationItem`
  
State: `pet_vaccination:pending_review→verified`


<a id="ep-vaccinations.reject"></a>

#### vaccinations.reject

**POST `/api/v1/staff/vaccinations/{vaccinationId}/reject`** — ปฏิเสธหลักฐานวัคซีน  
สิทธิ์: owner, front_desk · Stories: US-03-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | pet_vaccination.reject_reason | ≥ 3 |

Response: `VaccinationItem`
  
State: `pet_vaccination:pending_review→rejected`
  
Notify: `customer.vaccine_rejected`


### กลุ่ม `photos`


<a id="ep-photos.list"></a>

#### photos.list

**GET `/api/v1/staff/pets/{petId}/photos`** — คลังรูปน้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-03-06

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `kind` | enum:photo_kind |  |  |  |
| `cursor` | string |  |  |  |

Response: `Paged<PhotoItem>`


<a id="ep-photos.add"></a>

#### photos.add

**POST `/api/v1/staff/pets/{petId}/photos`** — เพิ่มรูปน้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-03-06, US-09-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `fileId` | uuid | ✓ | pet_photo.file_id | kind before/after/stay_update/pet_profile |
| `kind` | enum:photo_kind | ✓ | pet_photo.kind |  |
| `appointmentId` | uuid |  | pet_photo.appointment_id |  |
| `stayId` | uuid |  | pet_photo.stay_id |  |
| `caption` | string |  | pet_photo.caption | ≤ 200 |

Response: `PhotoItem`


### กลุ่ม `linkRequests`


<a id="ep-linkRequests.list"></a>

#### linkRequests.list

**GET `/api/v1/staff/link-requests`** — คำขอจับคู่บัญชี LINE  
สิทธิ์: owner, front_desk · Stories: US-01-01, US-11-01

Response: `LinkRequestItem[]`


<a id="ep-linkRequests.approve"></a>

#### linkRequests.approve

**POST `/api/v1/staff/link-requests/{requestId}/approve`** — ยืนยันว่าเป็นลูกค้าเดิม  
สิทธิ์: owner, front_desk · Stories: US-11-01

Response: `LinkRequestItem`
  
State: `customer_link_request:pending→approved`
  
Audit: `customer.merge_link_approve`
  
Notify: `customer.link_approved`


ผลที่ต้องเกิด:
- ย้าย line_identity ไปผูก owner_profile ของ candidate
- ย้ายน้อง/ใบจองที่สร้างจาก profile ใหม่ (ถ้ามี) ไปยังลูกค้าเดิม
- ลบ owner_profile ใหม่ที่ว่างแล้ว


<a id="ep-linkRequests.reject"></a>

#### linkRequests.reject

**POST `/api/v1/staff/link-requests/{requestId}/reject`** — ไม่ใช่ลูกค้าเดิม  
สิทธิ์: owner, front_desk · Stories: US-11-01

Response: `LinkRequestItem`
  
State: `customer_link_request:pending→rejected`


ผลที่ต้องเกิด:
- profile ใหม่กลายเป็นลูกค้าใหม่ของร้าน


### กลุ่ม `sizeTiers`


<a id="ep-sizeTiers.list"></a>

#### sizeTiers.list

**GET `/api/v1/staff/size-tiers`** — ขนาด  
สิทธิ์: owner, front_desk, staff · Stories: US-04-02

Response: `SizeTierItem[]`


<a id="ep-sizeTiers.set"></a>

#### sizeTiers.set

**PUT `/api/v1/staff/size-tiers`** — ตั้งช่วงขนาดของชนิดสัตว์  
สิทธิ์: owner · Stories: US-04-02 · Rules: R-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `species` | enum:species | ✓ | size_tier.species | dog \| cat |
| `tiers[].id` | uuid |  | size_tier.id |  |
| `tiers[].code` | string | ✓ | size_tier.code | ^[A-Z]{1,4}$ ไม่ซ้ำ |
| `tiers[].labelTh` | string | ✓ | size_tier.label_th | 1–30 |
| `tiers[].minWeightGrams` | int | ✓ | size_tier.min_weight_grams |  |
| `tiers[].maxWeightGrams` | int |  | size_tier.max_weight_grams | > min; แถวสุดท้าย null |

Response: `SizeTierItem[]`
  
Errors: `SIZE_TIER_OVERLAP`, `IN_USE`


ผลที่ต้องเกิด:
- ต้องต่อเนื่องไม่ทับไม่เว้น เริ่มที่ 0
- แทนที่ทั้งชุดของ species นี้: tiers[].id = แก้แถวเดิม, ไม่มี id = สร้างใหม่, แถวเดิมที่ไม่ส่งมา = ลบ; tiers[] ว่าง = ล้าง tier ของ species นี้ (Q-0029)
- ไม่ต่อเนื่อง → SIZE_TIER_OVERLAP details.rows = index ใน tiers[] ที่ส่งมา: แถว min น้อยสุดที่ไม่เริ่ม 0, แถวที่ min ≠ max ของแถวก่อน (เว้น/ทับ/แถวก่อนไม่มีเพดาน), แถวสุดท้ายที่มีเพดาน (Q-0029)
- ลบ tier ที่ groom_appointment (ทุกสถานะ) หรือ package_template อ้างอิง → IN_USE ไม่เปลี่ยนอะไร; ราคา service_price/room_rate/daycare_rate ของ tier ที่ลบได้ถูกลบตาม cascade (Q-0029)
- sort_order = ลำดับตามน้ำหนัก; ตอบเฉพาะ tier ของ species นี้ เรียงตาม sort_order


### กลุ่ม `services`


<a id="ep-services.list"></a>

#### services.list

**GET `/api/v1/staff/services`** — บริการ  
สิทธิ์: owner, front_desk, staff · Stories: US-04-01

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `scope` | enum:service_scope |  |  |  |
| `includeArchived` | bool |  |  |  |

Response: `ServiceItem[]`


<a id="ep-services.create"></a>

#### services.create

**POST `/api/v1/staff/services`** — เพิ่มบริการ/add-on  
สิทธิ์: owner · Stories: US-04-01, US-04-04, US-06-06

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `scope` | enum:service_scope | ✓ | service.scope |  |
| `category` | enum:service_category | ✓ | service.category | hotel_addon/daycare_addon ต้องคู่ scope |
| `nameTh` | string | ✓ | service.name_th | 1–80 |
| `description` | string |  | service.description | ≤ 500 |
| `photoFileId` | uuid |  | service.photo_file_id |  |
| `speciesAllowed[]` | enum[]:species |  | service.species_allowed |  |
| `isAddon` | bool | ✓ | service.is_addon |  |
| `addonPerDay` | bool |  | service.addon_per_day | เฉพาะ hotel add-on |
| `onlineBookable` | bool |  | service.online_bookable |  |
| `estCostSatang` | int |  | service.est_cost_satang | ≥ 0 |
| `sortOrder` | int |  | service.sort_order |  |

Response: `ServiceItem`


<a id="ep-services.update"></a>

#### services.update

**PATCH `/api/v1/staff/services/{serviceId}`** — แก้บริการ/ปิดใช้งาน  
สิทธิ์: owner · Stories: US-04-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<service fields>` | any |  | service.name_th | เหมือน create ยกเว้น scope |
| `status` | enum:record_status |  | service.status |  |

Response: `ServiceItem`


<a id="ep-services.setPrices"></a>

#### services.setPrices

**PUT `/api/v1/staff/services/{serviceId}/prices`** — ตารางราคา × ขนาด × ขน  
สิทธิ์: owner · Stories: US-04-02, US-04-03 · Rules: R-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `prices[].sizeTierId` | uuid |  | service_price.size_tier_id | null = ทุกขนาด |
| `prices[].coatGroup` | enum:coat_group | ✓ | service_price.coat_group |  |
| `prices[].priceSatang` | int | ✓ | service_price.price_satang | 0–10,000,000 |
| `prices[].durationMinutes` | int | ✓ | service_price.duration_minutes | 0–600, หาร slot_step ลงตัวแนะนำ |

Response: `ServiceItem`


ผลที่ต้องเกิด:
- แทนที่ราคาของ rate plan default ทั้งชุด; ใบจองเดิมไม่กระทบ (snapshot)


<a id="ep-services.setAddonLinks"></a>

#### services.setAddonLinks

**PUT `/api/v1/staff/services/{serviceId}/addon-links`** — add-on ใช้กับบริการไหน  
สิทธิ์: owner · Stories: US-04-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `baseServiceIds[]` | uuid[] | ✓ | service_addon_link.base_service_id | [] = ใช้ได้ทุกบริการ scope เดียวกัน |

Response: `ServiceItem`


### กลุ่ม `surchargeTypes`


<a id="ep-surchargeTypes.list"></a>

#### surchargeTypes.list

**GET `/api/v1/staff/surcharge-types`** — ค่าบริการเพิ่ม  
สิทธิ์: owner, front_desk, staff · Stories: US-04-05

Response: `SurchargeTypeItem[]`


<a id="ep-surchargeTypes.upsert"></a>

#### surchargeTypes.upsert

**PUT `/api/v1/staff/surcharge-types`** — ตั้งค่าบริการเพิ่ม  
สิทธิ์: owner · Stories: US-04-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `items[].id` | uuid |  | surcharge_type.id |  |
| `items[].nameTh` | string | ✓ | surcharge_type.name_th | 1–60 |
| `items[].defaultAmountSatang` | int | ✓ | surcharge_type.default_amount_satang | ≥ 0 |
| `items[].status` | enum:record_status | ✓ | surcharge_type.status |  |

Response: `SurchargeTypeItem[]`


### กลุ่ม `roomTypes`


<a id="ep-roomTypes.list"></a>

#### roomTypes.list

**GET `/api/v1/staff/room-types`** — ประเภทห้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-06-01

Response: `RoomTypeItem[]`


<a id="ep-roomTypes.create"></a>

#### roomTypes.create

**POST `/api/v1/staff/room-types`** — เพิ่มประเภทห้อง  
สิทธิ์: owner · Stories: US-06-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `nameTh` | string | ✓ | room_type.name_th | 1–60 |
| `description` | string |  | room_type.description |  |
| `photoFileId` | uuid |  | room_type.photo_file_id |  |
| `speciesAllowed[]` | enum[]:species |  | room_type.species_allowed |  |
| `maxWeightGrams` | int |  | room_type.max_weight_grams |  |
| `minAgeMonths` | int |  | room_type.min_age_months | 0–60 |
| `allowInHeat` | bool |  | room_type.allow_in_heat |  |
| `allowReactive` | bool |  | room_type.allow_reactive |  |
| `amenities[]` | string[] |  | room_type.amenities | aircon\|camera\|private\|outdoor\|bed\|toys |
| `includedText` | string |  | room_type.included_text |  |
| `onlineBookable` | bool |  | room_type.online_bookable |  |
| `sortOrder` | int |  | room_type.sort_order |  |

Response: `RoomTypeItem`


<a id="ep-roomTypes.update"></a>

#### roomTypes.update

**PATCH `/api/v1/staff/room-types/{roomTypeId}`** — แก้ประเภทห้อง  
สิทธิ์: owner · Stories: US-06-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<room_type fields>` | any |  | room_type.name_th |  |
| `status` | enum:record_status |  | room_type.status |  |

Response: `RoomTypeItem`


<a id="ep-roomTypes.setRates"></a>

#### roomTypes.setRates

**PUT `/api/v1/staff/room-types/{roomTypeId}/rates`** — ราคาห้องต่อคืน  
สิทธิ์: owner · Stories: US-06-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `rates[].sizeTierId` | uuid |  | room_rate.size_tier_id | null = ทุกขนาด |
| `rates[].nightlyPriceSatang` | int | ✓ | room_rate.nightly_price_satang | ≥ 0 |

Response: `RoomTypeItem`


### กลุ่ม `roomUnits`


<a id="ep-roomUnits.list"></a>

#### roomUnits.list

**GET `/api/v1/staff/room-units`** — ห้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-06-01

Response: `RoomUnitItem[]`


<a id="ep-roomUnits.upsert"></a>

#### roomUnits.upsert

**PUT `/api/v1/staff/room-units`** — ตั้งค่าห้อง  
สิทธิ์: owner · Stories: US-06-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `units[].id` | uuid |  | room_unit.id |  |
| `units[].roomTypeId` | uuid | ✓ | room_unit.room_type_id |  |
| `units[].code` | string | ✓ | room_unit.code | 1–10 ไม่ซ้ำในสาขา |
| `units[].zone` | string |  | room_unit.zone |  |
| `units[].status` | enum:room_unit_status | ✓ | room_unit.status | maintenance/archived ห้ามถ้ามีการพักอนาคต (IN_USE) |
| `units[].sortOrder` | int | ✓ | room_unit.sort_order |  |

Response: `RoomUnitItem[]`
  
Errors: `CODE_TAKEN`, `IN_USE`


<a id="ep-roomUnits.housekeeping"></a>

#### roomUnits.housekeeping

**PATCH `/api/v1/staff/room-units/{roomUnitId}/housekeeping`** — สถานะทำความสะอาด  
สิทธิ์: owner, front_desk, staff · Stories: US-06-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `housekeeping` | enum:housekeeping_status | ✓ | room_unit.housekeeping |  |

Response: `RoomUnitItem`


### กลุ่ม `daycareTypes`


<a id="ep-daycareTypes.list"></a>

#### daycareTypes.list

**GET `/api/v1/staff/daycare-session-types`** — รอบ Daycare  
สิทธิ์: owner, front_desk, staff · Stories: US-06-13

Response: `DaycareSessionTypeItem[]`


<a id="ep-daycareTypes.upsert"></a>

#### daycareTypes.upsert

**PUT `/api/v1/staff/daycare-session-types`** — ตั้งรอบและราคา Daycare  
สิทธิ์: owner · Stories: US-06-13

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `items[].id` | uuid |  | daycare_session_type.id |  |
| `items[].session` | enum:daycare_session | ✓ | daycare_session_type.session | ไม่ซ้ำ |
| `items[].nameTh` | string | ✓ | daycare_session_type.name_th |  |
| `items[].startsAt` | time | ✓ | daycare_session_type.starts_at |  |
| `items[].endsAt` | time | ✓ | daycare_session_type.ends_at |  |
| `items[].capacity` | int | ✓ | daycare_session_type.capacity | 1–200 |
| `items[].status` | enum:record_status | ✓ | daycare_session_type.status |  |
| `items[].rates[].sizeTierId` | uuid |  | daycare_rate.size_tier_id |  |
| `items[].rates[].priceSatang` | int | ✓ | daycare_rate.price_satang |  |

Response: `DaycareSessionTypeItem[]`


### กลุ่ม `packageTemplates`


<a id="ep-packageTemplates.list"></a>

#### packageTemplates.list

**GET `/api/v1/staff/package-templates`** — แพ็กเกจที่ขาย  
สิทธิ์: owner, front_desk, staff · Stories: US-10-05

Response: `PackageTemplateItem[]`


<a id="ep-packageTemplates.upsert"></a>

#### packageTemplates.upsert

**PUT `/api/v1/staff/package-templates`** — ตั้งแพ็กเกจ  
สิทธิ์: owner · Stories: US-10-05 · Rules: R-14

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `items[].id` | uuid |  | package_template.id |  |
| `items[].nameTh` | string | ✓ | package_template.name_th |  |
| `items[].serviceId` | uuid | ✓ | package_template.service_id | บริการหลัก grooming |
| `items[].sizeTierId` | uuid |  | package_template.size_tier_id |  |
| `items[].sessionsCount` | int | ✓ | package_template.sessions_count | 2–50 |
| `items[].priceSatang` | int | ✓ | package_template.price_satang | > 0 |
| `items[].validityDays` | int | ✓ | package_template.validity_days | 1–730 |
| `items[].shareScope` | enum:package_share_scope | ✓ | package_template.share_scope |  |
| `items[].status` | enum:record_status | ✓ | package_template.status |  |

Response: `PackageTemplateItem[]`


### กลุ่ม `commissionRules`


<a id="ep-commissionRules.list"></a>

#### commissionRules.list

**GET `/api/v1/staff/commission-rules`** — กติกาค่ามือ  
สิทธิ์: owner · Stories: US-09-02

Response: `CommissionRuleItem[]`


<a id="ep-commissionRules.set"></a>

#### commissionRules.set

**PUT `/api/v1/staff/commission-rules`** — ตั้งกติกาค่ามือ  
สิทธิ์: owner · Stories: US-09-02 · Rules: R-13

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `rules[].serviceId` | uuid |  | commission_rule.service_id |  |
| `rules[].staffUserId` | uuid |  | commission_rule.staff_user_id |  |
| `rules[].type` | enum:commission_type | ✓ | commission_rule.type |  |
| `rules[].value` | int | ✓ | commission_rule.value | percent: 0–10000 bps |

Response: `CommissionRuleItem[]`
  
Audit: `commission_rule.update`


ผลที่ต้องเกิด:
- แทนที่ทั้งชุด; ไม่กระทบ commission_entry เดิม


### กลุ่ม `imports`


<a id="ep-imports.create"></a>

#### imports.create

**POST `/api/v1/staff/imports`** — อัปโหลด CSV เพื่อตรวจ  
สิทธิ์: owner · Stories: US-02-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `kind` | enum:import_kind | ✓ | import_job.kind |  |
| `fileId` | uuid | ✓ | import_job.file_id | kind import_csv, UTF-8 (รองรับ BOM) |

Response: `ImportJobItem`


ผลที่ต้องเกิด:
- parse + validate ทุกแถว (R-22 เบอร์, enum, วันที่ dd/mm/yyyy หรือ yyyy-mm-dd, ปี พ.ศ. แปลงอัตโนมัติ) → status ready
- คอลัมน์ CSV ลูกค้า-น้อง: customer_first_name*, customer_last_name, nickname, phone*, pet_name*, species*, breed, sex, birth_date, coat_type, weight_kg, note
- คอลัมน์ CSV บริการ: service_name*, category*, size_code, coat_group, price_baht*, duration_minutes*


<a id="ep-imports.get"></a>

#### imports.get

**GET `/api/v1/staff/imports/{importId}`** — ผลตรวจ CSV  
สิทธิ์: owner · Stories: US-02-08

Response: `ImportJobItem`


<a id="ep-imports.commit"></a>

#### imports.commit

**POST `/api/v1/staff/imports/{importId}/commit`** — นำเข้าจริง  
สิทธิ์: owner · Stories: US-02-08

Response: `ImportJobItem`
  
Errors: `IMPORT_HAS_ERRORS`
  
Audit: `import.commit`


ผลที่ต้องเกิด:
- transaction เดียว; เบอร์ซ้ำกับลูกค้าเดิม → เพิ่มน้องให้ลูกค้าเดิม
- source = import


### กลุ่ม `availability`


<a id="ep-availability.groomSlots"></a>

#### availability.groomSlots

**POST `/api/v1/staff/availability/groom-slots`** — หาเวลาว่างกรูม (หน้าร้าน)  
สิทธิ์: owner, front_desk · Stories: US-05-01, US-05-04, US-05-08 · Rules: R-01,R-02,R-03,R-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `petId` | uuid | ✓ | groom_appointment.pet_id |  |
| `serviceIds[]` | uuid[] | ✓ | groom_appointment_item.service_id | ≥ 1 บริการหลัก |
| `addonIds[]` | uuid[] |  | groom_appointment_item.service_id |  |
| `groomerId` | uuid |  | groom_appointment.groomer_id | ไม่ส่ง = any |
| `sizeTierId` | uuid |  | groom_appointment.size_tier_id | override ขนาดเมื่อไม่รู้น้ำหนัก |
| `excludeAppointmentId` | uuid |  | groom_appointment.id | ตอนเลื่อนนัด ไม่นับนัดเดิม |
| `pendingAppointments[]` | object[] |  |  | นัดของตัวก่อนหน้าในใบจองเดียวกัน {groomerId, stationId, startsAt, blockedUntil} |

Response: `SlotList`
  
Errors: `PRICE_NOT_FOUND`, `WEIGHT_REQUIRED`, `MODULE_DISABLED`


<a id="ep-availability.hotel"></a>

#### availability.hotel

**GET `/api/v1/staff/availability/hotel`** — ห้องว่าง  
สิทธิ์: owner, front_desk · Stories: US-06-03, US-06-04 · Rules: R-01,R-12,R-28

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `checkInDate` | date | ✓ | stay.check_in_date |  |
| `checkOutDate` | date | ✓ | stay.check_out_date | > checkIn, ≤ 30 คืน |
| `petId` | uuid |  | stay.pet_id | ส่งมาเพื่อคิดราคา/เงื่อนไข |

Response: `HotelAvailability`


<a id="ep-availability.daycare"></a>

#### availability.daycare

**GET `/api/v1/staff/availability/daycare`** — ที่ว่าง Daycare  
สิทธิ์: owner, front_desk · Stories: US-06-13 · Rules: R-29

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ | daycare_visit.visit_date |  |
| `petId` | uuid |  |  |  |

Response: `DaycareAvailability`


### กลุ่ม `quotes`


<a id="ep-quotes.create"></a>

#### quotes.create

**POST `/api/v1/staff/quotes`** — คำนวณราคา+มัดจำก่อนบันทึก  
สิทธิ์: owner, front_desk · Stories: US-05-04 · Rules: R-03,R-06,R-08,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `customerId` | uuid | ✓ | booking.customer_id |  |
| `groom[]` | object[] |  |  | เหมือน bookings.create |
| `stays[]` | object[] |  |  |  |
| `daycare[]` | object[] |  |  |  |

Response: `Quote`


### กลุ่ม `bookings`


<a id="ep-bookings.create"></a>

#### bookings.create

**POST `/api/v1/staff/bookings`** — ร้านสร้างใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-04, US-06-03, US-06-07, US-06-13 · Rules: R-01,R-02,R-03,R-04,R-06,R-10,R-11,R-12,R-23,R-28,R-29

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `customerId` | uuid | ✓ | booking.customer_id |  |
| `channel` | enum:booking_channel | ✓ | booking.channel | walk_in \| phone \| chat |
| `customerNote` | string |  | booking.customer_note | ≤ 500 |
| `groom[].petId` | uuid | ✓ | groom_appointment.pet_id |  |
| `groom[].serviceIds[]` | uuid[] | ✓ | groom_appointment_item.service_id |  |
| `groom[].addonIds[]` | uuid[] |  | groom_appointment_item.service_id |  |
| `groom[].startsAt` | datetime | ✓ | groom_appointment.starts_at | ต้องอยู่ในผล R-04 |
| `groom[].groomerId` | uuid | ✓ | groom_appointment.groomer_id | จาก slot |
| `groom[].stationId` | uuid | ✓ | groom_appointment.station_id | จาก slot |
| `groom[].groomerPreference` | enum:groomer_preference | ✓ | groom_appointment.groomer_preference |  |
| `groom[].sizeTierId` | uuid |  | groom_appointment.size_tier_id |  |
| `groom[].customerPackageId` | uuid |  | groom_appointment_item.customer_package_id | R-14 |
| `stays[].petId` | uuid | ✓ | stay.pet_id |  |
| `stays[].roomTypeId` | uuid | ✓ | stay.room_type_id |  |
| `stays[].roomUnitId` | uuid |  | stay.room_unit_id | ไม่ส่ง = R-10 |
| `stays[].checkInDate` | date | ✓ | stay.check_in_date |  |
| `stays[].checkOutDate` | date | ✓ | stay.check_out_date |  |
| `stays[].expectedCheckInTime` | time |  | stay.expected_check_in_time |  |
| `stays[].expectedCheckOutTime` | time |  | stay.expected_check_out_time |  |
| `stays[].inHeat` | bool |  | stay.in_heat |  |
| `stays[].addonServiceIds[]` | uuid[] |  | stay_addon.service_id |  |
| `stays[].bundleGroom` | object |  | stay.bundle_appointment_id | {serviceIds, addonIds, startsAt, groomerId, stationId} วันเช็คเอาท์ (US-06-07) |
| `daycare[].petId` | uuid | ✓ | daycare_visit.pet_id |  |
| `daycare[].sessionTypeId` | uuid | ✓ | daycare_visit.session_type_id |  |
| `daycare[].visitDate` | date | ✓ | daycare_visit.visit_date |  |
| `depositOverride.amountSatang` | int |  | booking.deposit_required_satang | 0 = ยกเว้น |
| `depositOverride.reason` | string |  |  | บังคับเมื่อ override |

Response: `BookingDetail`
  
Errors: `SLOT_TAKEN`, `ROOM_TAKEN`, `PET_ALREADY_BOOKED`, `DAYCARE_FULL`, `PRICE_NOT_FOUND`, `PET_INACTIVE`, `SPECIES_NOT_ALLOWED`, `BREED_REJECTED`, `PET_TOO_HEAVY`, `PET_TOO_YOUNG`, `IN_HEAT_NOT_ALLOWED`, `REACTIVE_NOT_ALLOWED`, `MODULE_DISABLED`, `BRANCH_CLOSED`
  
State: `booking:∅→confirmed`
  
Audit: `deposit.waive (เมื่อ override)`
  
Notify: `customer.booking_confirmed`


ผลที่ต้องเกิด:
- transaction เดียว: ล็อก branch row → R-23 เลขใบจอง → insert booking, children, items (snapshot ราคา) → booking_event
- สถานะ confirmed ทันที, deposit_status = pending ถ้า R-06 > 0 (หรือ override) ไม่งั้น not_required; policy_snapshot = สำเนา branch_policy
- first_service_at = เวลาเริ่มบริการแรก (stay ใช้ check_in_date + expected_check_in_time หรือเวลาเปิดร้าน)
- ตั้ง job reminder_24h ของแต่ละนัด/การพัก
- ร้านเลือก R-11 ไม่ผ่านได้ (แค่ warning) — gate จริงอยู่ตอนเช็คอิน


<a id="ep-bookings.list"></a>

#### bookings.list

**GET `/api/v1/staff/bookings`** — รายการใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-05, US-07-02

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `status` | enum:booking_status |  | booking.status | หลายค่าได้ |
| `from` | date |  |  | ตาม first_service_at |
| `to` | date |  |  |  |
| `customerId` | uuid |  | booking.customer_id |  |
| `cursor` | string |  |  |  |

Response: `Paged<BookingListItem>`


<a id="ep-bookings.get"></a>

#### bookings.get

**GET `/api/v1/staff/bookings/{bookingId}`** — รายละเอียดใบจอง  
สิทธิ์: owner, front_desk, staff · Stories: US-05-04

Response: `BookingDetail`


<a id="ep-bookings.approve"></a>

#### bookings.approve

**POST `/api/v1/staff/bookings/{bookingId}/approve`** — อนุมัติใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-05

Response: `BookingDetail`
  
State: `booking:awaiting_approval→confirmed`
  
Notify: `customer.booking_confirmed`


ผลที่ต้องเกิด:
- ยกเลิก job approval_overdue


<a id="ep-bookings.decline"></a>

#### bookings.decline

**POST `/api/v1/staff/bookings/{bookingId}/decline`** — ปฏิเสธใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-05 · Rules: R-07

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | booking.cancel_reason | ≥ 3 (ลูกค้าเห็น) |

Response: `BookingDetail`
  
State: `booking:awaiting_approval→cancelled`
  
Notify: `customer.booking_declined`


ผลที่ต้องเกิด:
- R-07 kind shop_cancel → คืนมัดจำเต็มถ้ามี


<a id="ep-bookings.cancelPreview"></a>

#### bookings.cancelPreview

**GET `/api/v1/staff/bookings/{bookingId}/cancel-preview`** — ดูผลเงินก่อนยกเลิก  
สิทธิ์: owner, front_desk · Stories: US-07-04, US-05-08 · Rules: R-07

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `kind` | enum | ✓ |  | customer_cancel \| shop_cancel |

Response: `object R-07 CancelResult`


<a id="ep-bookings.cancel"></a>

#### bookings.cancel

**POST `/api/v1/staff/bookings/{bookingId}/cancel`** — ยกเลิกทั้งใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-08, US-07-04 · Rules: R-07,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `kind` | enum | ✓ |  | customer_cancel \| shop_cancel |
| `reason` | string | ✓ | booking.cancel_reason | ≥ 3 |
| `customerChoice` | enum |  |  | refund \| credit |

Response: `BookingDetail`
  
State: `booking:*→cancelled`
  
Audit: `booking.cancel`
  
Notify: `customer.booking_cancelled`


ผลที่ต้องเกิด:
- children ทั้งหมด → cancelled
- เงินตาม R-07 (credit_ledger / refund pending / forfeited)
- booking.cancel_is_late = R-07 isLate (Q-0084)
- late → customer.late_cancel_count_12m + 1 แล้ว R-09
- ยกเลิก scheduled_job ที่ dedupe_key อ้างใบจองนี้


<a id="ep-bookings.recordDeposit"></a>

#### bookings.recordDeposit

**POST `/api/v1/staff/bookings/{bookingId}/deposit`** — บันทึกรับมัดจำ (เงินสด/โอนที่ร้านเห็นแล้ว)  
สิทธิ์: owner, front_desk · Stories: US-07-02, US-07-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `method` | enum:payment_method | ✓ | payment.method | cash \| promptpay \| bank_transfer \| card_edc |
| `amountSatang` | int | ✓ | payment.amount_satang | > 0 |
| `reference` | string |  | payment.reference |  |
| `proofFileId` | uuid |  | payment.proof_file_id |  |

Response: `BookingDetail`
  
State: `booking:awaiting_deposit→confirmed|awaiting_approval`
  
Audit: `payment.create`


ผลที่ต้องเกิด:
- insert payment (booking_id), booking.deposit_verified_satang += amount, deposit_status verified


<a id="ep-bookings.waiveDeposit"></a>

#### bookings.waiveDeposit

**POST `/api/v1/staff/bookings/{bookingId}/deposit/waive`** — ยกเว้นมัดจำ  
สิทธิ์: owner, front_desk · Stories: US-07-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ |  | ≥ 3 |

Response: `BookingDetail`
  
State: `booking:awaiting_deposit→confirmed|awaiting_approval`
  
Audit: `deposit.waive`


ผลที่ต้องเกิด:
- deposit_required_satang = 0, deposit_status not_required, ล้าง hold_expires_at


<a id="ep-bookings.balanceLink"></a>

#### bookings.balanceLink

**POST `/api/v1/staff/bookings/{bookingId}/balance-link`** — สร้างลิงก์จ่ายยอดคงเหลือ  
สิทธิ์: owner, front_desk · Stories: US-07-08

Response: `object {url: string, amountSatang: number}`
  
Notify: `customer.balance_link`


ผลที่ต้องเกิด:
- ต้องมี bill open; url = LIFF /pay/{billId}; ส่ง LINE ถ้าเลือก send=true


### กลุ่ม `calendar`


<a id="ep-calendar.day"></a>

#### calendar.day

**GET `/api/v1/staff/calendar`** — ปฏิทินคิว  
สิทธิ์: owner, front_desk, staff · Stories: US-05-03

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `view` | enum |  |  | day \| week (week คืน 7 CalendarDay) |
| `groomerId` | uuid |  |  |  |

Response: `CalendarDay`


ผลที่ต้องเกิด:
- role staff เห็นทุกนัดแต่ไม่เห็นเบอร์ลูกค้า


### กลุ่ม `groom`


<a id="ep-groom.reschedule"></a>

#### groom.reschedule

**PATCH `/api/v1/staff/groom-appointments/{appointmentId}/reschedule`** — เลื่อนนัด/ย้ายช่าง (ลากบนปฏิทิน)  
สิทธิ์: owner, front_desk · Stories: US-05-08, US-05-03 · Rules: R-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `startsAt` | datetime | ✓ | groom_appointment.starts_at | ต้องอยู่ในผล R-04 (excludeAppointmentId = นัดนี้) |
| `groomerId` | uuid | ✓ | groom_appointment.groomer_id |  |
| `stationId` | uuid | ✓ | groom_appointment.station_id |  |
| `reason` | string |  | booking_event.reason |  |
| `notifyCustomer` | bool |  |  | default true |

Response: `AppointmentCard`
  
Errors: `SLOT_TAKEN`, `STATUS_NOT_ALLOWED`
  
Notify: `customer.booking_rescheduled`


ผลที่ต้องเกิด:
- เฉพาะ status scheduled
- คำนวณ ends_at/blocked_until ใหม่ (R-03), อัปเดต booking.first_service_at
- booking_event to_status 'scheduled' reason 'reschedule'
- ตั้ง reminder_24h ใหม่


<a id="ep-groom.setItems"></a>

#### groom.setItems

**PUT `/api/v1/staff/groom-appointments/{appointmentId}/items`** — เปลี่ยนบริการ/ขนาด (เช่นตอนเช็คอินชั่งแล้วขนาดเปลี่ยน)  
สิทธิ์: owner, front_desk · Stories: US-05-06, US-04-03 · Rules: R-02,R-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `serviceIds[]` | uuid[] | ✓ | groom_appointment_item.service_id |  |
| `addonIds[]` | uuid[] |  | groom_appointment_item.service_id |  |
| `sizeTierId` | uuid |  | groom_appointment.size_tier_id |  |
| `priceOverrides[]` | object[] |  | groom_appointment_item.price_satang | {serviceId, priceSatang, reason} owner/front_desk |

Response: `AppointmentCard`
  
Errors: `SLOT_TAKEN`, `PRICE_NOT_FOUND`
  
Audit: `booking.price_override (เมื่อ override)`


ผลที่ต้องเกิด:
- ราคา snapshot ใหม่; เวลายาวขึ้น → ตรวจ exclusion (SLOT_TAKEN ให้หน้าร้านย้าย)


<a id="ep-groom.checkIn"></a>

#### groom.checkIn

**POST `/api/v1/staff/groom-appointments/{appointmentId}/check-in`** — เช็คอินกรูม  
สิทธิ์: owner, front_desk · Stories: US-05-06

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `weightGrams` | int |  | groom_appointment.weight_grams_checkin | 100–150000; สร้าง pet_weight ด้วย |
| `conditionFlags[]` | string[] |  | groom_appointment.condition_flags | ticks_fleas \| wound \| matted \| skin_issue |
| `conditionNote` | string |  | groom_appointment.condition_note | ≤ 500 |
| `consent.reasons[]` | string[] |  | consent_document.reasons | matted_shave \| senior \| medical_condition \| aggressive \| other |
| `consent.signerName` | string |  | consent_document.signer_name | บังคับเมื่อมี reasons |
| `consent.signatureFileId` | uuid |  | consent_document.signature_file_id | kind signature PNG |

Response: `AppointmentCard`
  
Errors: `CONSENT_REQUIRED`, `STATUS_NOT_ALLOWED`
  
State: `groom_appointment:scheduled→checked_in`


ผลที่ต้องเกิด:
- conditionFlags มี matted หรือ skin_issue → ต้องมี consent
- consent_document.body_snapshot = branch_policy.grooming_consent_text ณ ตอนนั้น
- ถ้าน้ำหนักทำให้ size tier เปลี่ยน → ตอบ warnings[{code:'SIZE_CHANGED', newPriceSatang}] ให้หน้าร้านกด groom.setItems


<a id="ep-groom.start"></a>

#### groom.start

**POST `/api/v1/staff/groom-appointments/{appointmentId}/start`** — เริ่มงาน  
สิทธิ์: owner, front_desk, staff · Stories: US-09-03

Response: `AppointmentCard`
  
State: `groom_appointment:checked_in→in_progress`


ผลที่ต้องเกิด:
- role staff ทำได้เฉพาะนัดของตัวเอง
- started_at = now


<a id="ep-groom.finish"></a>

#### groom.finish

**POST `/api/v1/staff/groom-appointments/{appointmentId}/finish`** — เสร็จงาน  
สิทธิ์: owner, front_desk, staff · Stories: US-09-03, US-10-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `staffNote` | string |  | groom_appointment.staff_note | ≤ 1000 โน้ตถึงร้าน |

Response: `AppointmentCard`
  
State: `groom_appointment:in_progress→done`
  
Notify: `staff.groom_done`


ผลที่ต้องเกิด:
- done_at = now; สร้าง report_card draft (ถ้ายังไม่มี) ให้ช่างกรอก
- แจ้งหน้าร้าน (web push) ว่าน้องเสร็จ


<a id="ep-groom.notifyPickup"></a>

#### groom.notifyPickup

**POST `/api/v1/staff/groom-appointments/{appointmentId}/notify-pickup`** — แจ้งลูกค้ามารับ  
สิทธิ์: owner, front_desk · Stories: US-05-09

Response: `AppointmentCard`
  
Notify: `customer.ready_for_pickup`


ผลที่ต้องเกิด:
- ถ้ามี report card sent พร้อมกัน → รวมเป็นข้อความเดียว (R-18 งบข้อความ)


<a id="ep-groom.pickUp"></a>

#### groom.pickUp

**POST `/api/v1/staff/groom-appointments/{appointmentId}/pick-up`** — ลูกค้ารับน้องแล้ว  
สิทธิ์: owner, front_desk · Stories: US-05-09, US-08-01 · Rules: R-17

Response: `AppointmentCard`
  
State: `groom_appointment:done→picked_up`


ผลที่ต้องเกิด:
- picked_up_at = now; pet_shop_profile.last_groomed_at = done_at
- ตั้ง job next_groom_reminder ตาม R-17
- บิลยังไม่ปิด → แสดงใน todo.pickupsWithoutBill


<a id="ep-groom.noShow"></a>

#### groom.noShow

**POST `/api/v1/staff/groom-appointments/{appointmentId}/no-show`** — ลูกค้าไม่มา  
สิทธิ์: owner, front_desk · Stories: US-07-07 · Rules: R-07,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string |  | booking_event.reason |  |

Response: `AppointmentCard`
  
State: `groom_appointment:scheduled→no_show`
  
Audit: `booking.no_show`
  
Notify: `customer.no_show`


ผลที่ต้องเกิด:
- ทำได้เมื่อ now ≥ starts_at + no_show_grace_minutes
- ทุก child ของใบจองจบแล้ว → R-07 no_show กับมัดจำ, booking → closed
- customer.no_show_count_12m + 1 → R-09


<a id="ep-groom.cancel"></a>

#### groom.cancel

**POST `/api/v1/staff/groom-appointments/{appointmentId}/cancel`** — ยกเลิกนัดตัวเดียวในใบจอง  
สิทธิ์: owner, front_desk · Stories: US-05-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | booking_event.reason | ≥ 3 |

Response: `BookingDetail`
  
State: `groom_appointment:scheduled|checked_in→cancelled`


ผลที่ต้องเกิด:
- เป็น child สุดท้ายที่ active → ใช้ flow bookings.cancel แทน (STATUS_NOT_ALLOWED พร้อม hint)
- ลด booking.estimated_total_satang


<a id="ep-groom.addSurcharge"></a>

#### groom.addSurcharge

**POST `/api/v1/staff/groom-appointments/{appointmentId}/surcharges`** — เพิ่มค่าบริการหน้างาน  
สิทธิ์: owner, front_desk · Stories: US-04-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `surchargeTypeId` | uuid |  | appointment_surcharge.surcharge_type_id |  |
| `name` | string | ✓ | appointment_surcharge.name | 1–60 |
| `amountSatang` | int | ✓ | appointment_surcharge.amount_satang | > 0 |
| `reason` | string | ✓ | appointment_surcharge.reason | ≥ 3 ลูกค้าเห็นในบิล |

Response: `AppointmentCard`


ผลที่ต้องเกิด:
- อัปเดต groom_appointment.surcharge_total_satang; บิลที่ open อยู่ → เพิ่ม bill_line surcharge


<a id="ep-groom.removeSurcharge"></a>

#### groom.removeSurcharge

**DELETE `/api/v1/staff/appointment-surcharges/{surchargeId}`** — ลบค่าบริการเพิ่ม (ก่อนปิดบิล)  
สิทธิ์: owner, front_desk · Stories: US-04-05

Response: `AppointmentCard`


<a id="ep-groom.jobCard"></a>

#### groom.jobCard

**GET `/api/v1/staff/groom-appointments/{appointmentId}/job-card`** — Job card  
สิทธิ์: owner, front_desk, staff · Stories: US-05-07

Response: `JobCard`


<a id="ep-groom.myQueue"></a>

#### groom.myQueue

**GET `/api/v1/staff/me/queue`** — คิวของฉันวันนี้ (Staff app)  
สิทธิ์: owner, front_desk, staff · Stories: US-09-03

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date |  |  | default วันนี้ |

Response: `AppointmentCard[]`


ผลที่ต้องเกิด:
- groomer_id = ผู้ใช้ปัจจุบัน, เรียงตาม starts_at


### กลุ่ม `stays`


<a id="ep-stays.today"></a>

#### stays.today

**GET `/api/v1/staff/stays`** — รายชื่อเข้า-ออก/อยู่ในร้าน  
สิทธิ์: owner, front_desk, staff · Stories: US-06-12

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `type` | enum |  |  | arrivals \| departures \| in_house |

Response: `StayCard[]`


<a id="ep-stays.get"></a>

#### stays.get

**GET `/api/v1/staff/stays/{stayId}`** — รายละเอียดการพัก  
สิทธิ์: owner, front_desk, staff · Stories: US-06-08

Response: `StayDetail`


<a id="ep-stays.saveIntake"></a>

#### stays.saveIntake

**PUT `/api/v1/staff/stays/{stayId}/intake`** — ฟอร์มรับฝาก  
สิทธิ์: owner, front_desk · Stories: US-06-08 · Rules: R-22,R-26

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `foodBrand` | string |  | stay_intake.food_brand |  |
| `foodAmount` | string |  | stay_intake.food_amount |  |
| `feedingTimes[]` | time[] | ✓ | stay_intake.feeding_times | 0–6 เวลา |
| `foodProvidedByOwner` | bool | ✓ | stay_intake.food_provided_by_owner |  |
| `walksPerDay` | int | ✓ | stay_intake.walks_per_day | 0–6 |
| `conditionNote` | string |  | stay_intake.condition_note |  |
| `conditionPhotoIds[]` | uuid[] |  | stay_intake.condition_photo_ids | ≤ 6 |
| `emergencyContactName` | string | ✓ | stay_intake.emergency_contact_name |  |
| `emergencyContactPhone` | string | ✓ | stay_intake.emergency_contact_phone | R-22 |
| `vetClinicName` | string |  | stay_intake.vet_clinic_name |  |
| `vetClinicPhone` | string |  | stay_intake.vet_clinic_phone |  |
| `medications[]` | object[] |  | stay_medication.name | {name, dose, times[] ≥1, instructions} |
| `belongings[]` | object[] |  | stay_belonging.item | {item, quantity, photoFileId} |
| `complete` | bool | ✓ | stay_intake.completed_at | true = ตั้ง completed_at |

Response: `StayDetail`


ผลที่ต้องเกิด:
- prefill จาก pet_shop_profile + customer.emergency_contact_name + customer.emergency_contact_phone
- แก้ระหว่างพัก (checked_in) → R-26 สร้าง task ใหม่สำหรับอนาคต


<a id="ep-stays.signAgreement"></a>

#### stays.signAgreement

**POST `/api/v1/staff/stays/{stayId}/agreement`** — เซ็นข้อตกลงรับฝาก  
สิทธิ์: owner, front_desk · Stories: US-06-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `signerName` | string | ✓ | consent_document.signer_name |  |
| `signatureFileId` | uuid | ✓ | consent_document.signature_file_id | PNG |
| `emergencyVetLimitSatang` | int |  | consent_document.emergency_vet_limit_satang | ≥ 0 |

Response: `StayDetail`


ผลที่ต้องเกิด:
- body_snapshot = branch_policy.boarding_agreement_text
- เก็บเป็น immutable — เซ็นใหม่ = record ใหม่


<a id="ep-stays.checkIn"></a>

#### stays.checkIn

**POST `/api/v1/staff/stays/{stayId}/check-in`** — เช็คอินโรงแรม  
สิทธิ์: owner, front_desk · Stories: US-06-05, US-06-08, US-06-09 · Rules: R-11,R-26

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `weightGrams` | int |  | stay.weight_grams_in |  |
| `vaccineOverrideReason` | string |  | stay.vaccine_override_reason | บังคับเมื่อ R-11 ไม่ผ่าน |

Response: `StayDetail`
  
Errors: `INTAKE_INCOMPLETE`, `CONSENT_REQUIRED`, `VACCINE_REQUIRED`, `STATUS_NOT_ALLOWED`
  
State: `stay:reserved→checked_in`
  
Audit: `stay.vaccine_override (เมื่อ override)`
  
Notify: `customer.stay_checked_in`


ผลที่ต้องเกิด:
- ต้องมี intake completed + agreement
- checked_in_at = now; สร้าง care_task ตาม R-26
- ทำได้ตั้งแต่วัน check_in_date (ก่อนหน้านั้น STATUS_NOT_ALLOWED)


<a id="ep-stays.changeRoom"></a>

#### stays.changeRoom

**PATCH `/api/v1/staff/stays/{stayId}/room`** — ย้ายห้อง (Room map)  
สิทธิ์: owner, front_desk · Stories: US-06-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `roomUnitId` | uuid | ✓ | stay.room_unit_id | ประเภทเดียวกัน หรือประเภทอื่นพร้อม keepPrice |

Response: `StayCard`
  
Errors: `ROOM_TAKEN`


ผลที่ต้องเกิด:
- ราคาไม่เปลี่ยน (snapshot) เว้นแต่ส่ง repriceToType=true


<a id="ep-stays.changeDates"></a>

#### stays.changeDates

**PATCH `/api/v1/staff/stays/{stayId}/dates`** — ขยาย/ลดวันพัก  
สิทธิ์: owner, front_desk · Stories: US-06-03 · Rules: R-03,R-28

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `checkInDate` | date |  | stay.check_in_date | เฉพาะ reserved |
| `checkOutDate` | date | ✓ | stay.check_out_date | > checkIn |

Response: `StayCard`
  
Errors: `ROOM_TAKEN`, `PET_ALREADY_BOOKED`


ผลที่ต้องเกิด:
- nights/room_total ใหม่ (nightly เดิม); add-on per day ปรับ quantity
- checked_in → สร้าง/ลบ care_task ส่วนต่าง


<a id="ep-stays.addAddon"></a>

#### stays.addAddon

**POST `/api/v1/staff/stays/{stayId}/addons`** — เพิ่ม add-on ระหว่างพัก  
สิทธิ์: owner, front_desk · Stories: US-06-06

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `serviceId` | uuid | ✓ | stay_addon.service_id | scope hotel, is_addon |
| `quantity` | int |  | stay_addon.quantity | default 1 / per_day = nights |

Response: `StayDetail`


<a id="ep-stays.removeAddon"></a>

#### stays.removeAddon

**DELETE `/api/v1/staff/stay-addons/{stayAddonId}`** — ลบ add-on (ก่อนปิดบิล)  
สิทธิ์: owner, front_desk · Stories: US-06-06

Response: `StayDetail`


<a id="ep-stays.postUpdate"></a>

#### stays.postUpdate

**POST `/api/v1/staff/stays/{stayId}/updates`** — ส่งรูป/วิดีโออัปเดตน้อง  
สิทธิ์: owner, front_desk, staff · Stories: US-06-10 · Rules: R-18

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `fileIds[]` | uuid[] | ✓ | pet_photo.file_id | 1–6 ไฟล์ kind stay_update |
| `caption` | string |  | pet_photo.caption | ≤ 200 |
| `notifyCustomer` | bool |  |  | default true |

Response: `StayDetail`
  
Notify: `customer.stay_update`


ผลที่ต้องเกิด:
- insert pet_photo kind stay
- แจ้งลูกค้าไม่เกิน 1 ข้อความ/วัน/การพัก (dedupe stay_update:{stayId}:{date}) — ส่งลิงก์หน้าอัปเดต


<a id="ep-stays.checkOut"></a>

#### stays.checkOut

**POST `/api/v1/staff/stays/{stayId}/check-out`** — เช็คเอาท์  
สิทธิ์: owner, front_desk · Stories: US-06-11

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `weightGramsOut` | int |  | stay.weight_grams_out |  |
| `returnedBelongingIds[]` | uuid[] | ✓ | stay_belonging.id | ต้องครบทุกชิ้นหรือส่ง missingNote |
| `missingNote` | string |  |  |  |

Response: `StayDetail`
  
State: `stay:checked_in→checked_out`


ผลที่ต้องเกิด:
- checked_out_at = now; room_unit.housekeeping = dirty; care_task pending ที่เหลือ → skipped
- สร้าง report_card kind stay draft
- เปิด/เติมบิลอัตโนมัติ (bills.openFromBooking)


<a id="ep-stays.noShow"></a>

#### stays.noShow

**POST `/api/v1/staff/stays/{stayId}/no-show`** — ไม่มาเช็คอิน  
สิทธิ์: owner, front_desk · Stories: US-07-07 · Rules: R-07,R-09

Response: `StayCard`
  
State: `stay:reserved→no_show`
  
Audit: `booking.no_show`


ผลที่ต้องเกิด:
- ทำได้หลัง 23:59 ของ check_in_date หรือกดเองพร้อมยืนยัน


<a id="ep-stays.cancel"></a>

#### stays.cancel

**POST `/api/v1/staff/stays/{stayId}/cancel`** — ยกเลิกการพักตัวเดียว  
สิทธิ์: owner, front_desk · Stories: US-05-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | booking_event.reason |  |

Response: `BookingDetail`
  
State: `stay:reserved→cancelled`


### กลุ่ม `roomMap`


<a id="ep-roomMap.get"></a>

#### roomMap.get

**GET `/api/v1/staff/room-map`** — Room map  
สิทธิ์: owner, front_desk, staff · Stories: US-06-04 · Rules: R-28

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |

Response: `RoomMap`


### กลุ่ม `careTasks`


<a id="ep-careTasks.list"></a>

#### careTasks.list

**GET `/api/v1/staff/care-tasks`** — งานดูแลวันนี้  
สิทธิ์: owner, front_desk, staff · Stories: US-06-09

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `status` | enum:care_task_status |  | care_task.status |  |
| `stayId` | uuid |  |  |  |

Response: `CareTaskItem[]`


<a id="ep-careTasks.done"></a>

#### careTasks.done

**POST `/api/v1/staff/care-tasks/{taskId}/done`** — ทำงานดูแลแล้ว  
สิทธิ์: owner, front_desk, staff · Stories: US-06-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `note` | string |  | care_task.note | ≤ 200 เช่น กินหมด |
| `photoFileId` | uuid |  | care_task.photo_file_id |  |

Response: `CareTaskItem`
  
State: `care_task:pending→done`


ผลที่ต้องเกิด:
- done_at = now, done_by = ผู้ใช้


<a id="ep-careTasks.skip"></a>

#### careTasks.skip

**POST `/api/v1/staff/care-tasks/{taskId}/skip`** — ข้ามงาน  
สิทธิ์: owner, front_desk, staff · Stories: US-06-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `note` | string | ✓ | care_task.note | ≥ 3 |

Response: `CareTaskItem`
  
State: `care_task:pending→skipped`


### กลุ่ม `daycare`


<a id="ep-daycare.list"></a>

#### daycare.list

**GET `/api/v1/staff/daycare-visits`** — Daycare วันนี้  
สิทธิ์: owner, front_desk, staff · Stories: US-06-13

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |

Response: `DaycareVisitItem[]`


<a id="ep-daycare.check_in"></a>

#### daycare.check_in

**POST `/api/v1/staff/daycare-visits/{visitId}/check-in`** — Daycare check-in  
สิทธิ์: owner, front_desk · Stories: US-06-13 · Rules: R-11

Response: `DaycareVisitItem`
  
Errors: `VACCINE_REQUIRED`, `STATUS_NOT_ALLOWED`
  
State: `daycare_visit:reserved→checked_in`


<a id="ep-daycare.check_out"></a>

#### daycare.check_out

**POST `/api/v1/staff/daycare-visits/{visitId}/check-out`** — Daycare check-out  
สิทธิ์: owner, front_desk · Stories: US-06-13

Response: `DaycareVisitItem`
  
Errors: `STATUS_NOT_ALLOWED`
  
State: `daycare_visit:checked_in→checked_out`


<a id="ep-daycare.no_show"></a>

#### daycare.no_show

**POST `/api/v1/staff/daycare-visits/{visitId}/no-show`** — Daycare no-show  
สิทธิ์: owner, front_desk · Stories: US-07-07 · Rules: R-07,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string |  | booking_event.reason |  |

Response: `DaycareVisitItem`
  
Errors: `STATUS_NOT_ALLOWED`
  
State: `daycare_visit:reserved→no_show`


<a id="ep-daycare.cancel"></a>

#### daycare.cancel

**POST `/api/v1/staff/daycare-visits/{visitId}/cancel`** — Daycare cancel  
สิทธิ์: owner, front_desk · Stories: US-05-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | booking_event.reason |  |

Response: `DaycareVisitItem`
  
Errors: `STATUS_NOT_ALLOWED`
  
State: `daycare_visit:reserved→cancelled`


### กลุ่ม `slips`


<a id="ep-slips.list"></a>

#### slips.list

**GET `/api/v1/staff/slips`** — สลิปรอตรวจ  
สิทธิ์: owner, front_desk · Stories: US-07-02

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `status` | enum:slip_status |  | payment_slip.status | default submitted |

Response: `SlipItem[]`


<a id="ep-slips.verify"></a>

#### slips.verify

**POST `/api/v1/staff/slips/{slipId}/verify`** — ยืนยันสลิป (ร้านเช็คเงินเข้าบัญชีแล้ว)  
สิทธิ์: owner, front_desk · Stories: US-07-02 · Rules: R-05,R-15

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `amountSatang` | int | ✓ | payment.amount_satang | ยอดที่เข้าจริง > 0 |
| `confirmDuplicate` | bool |  |  | ต้อง true ถ้าสลิปซ้ำ |
| `approveBooking` | bool |  |  | true = อนุมัติใบจองต่อในคำสั่งเดียว (ถ้าต้องอนุมัติ) |

Response: `SlipItem`
  
Errors: `DUPLICATE_SLIP_CONFIRM_REQUIRED`, `STATUS_NOT_ALLOWED`
  
State: `payment_slip:submitted→verified; booking:deposit_review→confirmed|awaiting_approval`
  
Audit: `slip.verify`
  
Notify: `customer.deposit_confirmed`


ผลที่ต้องเกิด:
- insert payment (method promptpay, slip_id) → booking.deposit_verified_satang += amount; deposit_status verified
- สลิปของบิล (bill_id) → payment ของบิลแทน
- ยอดน้อยกว่าที่ต้องจ่าย → deposit_status คง submitted? ไม่: verified บางส่วน + แสดงยอดค้างในใบจอง


<a id="ep-slips.reject"></a>

#### slips.reject

**POST `/api/v1/staff/slips/{slipId}/reject`** — ปฏิเสธสลิป  
สิทธิ์: owner, front_desk · Stories: US-07-02 · Rules: R-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | payment_slip.reject_reason | ≥ 3 ลูกค้าเห็น |

Response: `SlipItem`
  
State: `payment_slip:submitted→rejected; booking:deposit_review→awaiting_deposit|expired`
  
Audit: `slip.reject`
  
Notify: `customer.slip_rejected`


### กลุ่ม `refunds`


<a id="ep-refunds.create"></a>

#### refunds.create

**POST `/api/v1/staff/refunds`** — บันทึกการคืนเงิน (หลังโอนคืนแล้ว)  
สิทธิ์: owner, front_desk · Stories: US-07-05 · Rules: R-07

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `customerId` | uuid | ✓ | refund.customer_id |  |
| `bookingId` | uuid |  | refund.booking_id |  |
| `billId` | uuid |  | refund.bill_id |  |
| `amountSatang` | int | ✓ | refund.amount_satang | > 0 |
| `mode` | enum:refund_mode | ✓ | refund.mode |  |
| `reason` | string | ✓ | refund.reason | ≥ 3 |
| `proofFileId` | uuid |  | refund.proof_file_id | แนะนำเมื่อโอน |

Response: `object refund.*`
  
Audit: `refund.create`


ผลที่ต้องเกิด:
- mode credit → credit_ledger + balance; booking.deposit_status refunded/credited


### กลุ่ม `bills`


<a id="ep-bills.open"></a>

#### bills.open

**POST `/api/v1/staff/bills`** — เปิดบิล  
สิทธิ์: owner, front_desk · Stories: US-08-01 · Rules: R-15

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `bookingIds[]` | uuid[] |  | booking.bill_id | รวมหลายใบจองของลูกค้าเดียวกันได้ |
| `customerId` | uuid |  | bill.customer_id | บิลขายของไม่มีใบจอง |

Response: `BillDetail`


ผลที่ต้องเกิด:
- มีบิล open ของใบจองนั้นอยู่แล้ว → คืนบิลเดิม (idempotent)
- สร้าง bill_line จาก: groom_appointment_item (groom_service/groom_addon, performer = groomer_id), appointment_surcharge, stay (stay_night qty = nights), stay_addon, daycare_visit — เฉพาะ child ที่ไม่ใช่ cancelled/no_show
- item ที่ผูก customer_package_id → bill_line package_redemption ราคา 0 + package_redemption
- มัดจำ verified → payment method deposit อัตโนมัติ (R-15)
- booking.bill_id = bill.id


<a id="ep-bills.list"></a>

#### bills.list

**GET `/api/v1/staff/bills`** — รายการบิล  
สิทธิ์: owner, front_desk · Stories: US-08-01

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `status` | enum:bill_status |  | bill.status |  |
| `date` | date |  |  | closed_at หรือ opened_at ตามสถานะ |
| `cursor` | string |  |  |  |

Response: `Paged<BillListItem>`


<a id="ep-bills.get"></a>

#### bills.get

**GET `/api/v1/staff/bills/{billId}`** — รายละเอียดบิล  
สิทธิ์: owner, front_desk · Stories: US-08-01

Response: `BillDetail`


<a id="ep-bills.addLine"></a>

#### bills.addLine

**POST `/api/v1/staff/bills/{billId}/lines`** — เพิ่มรายการ (สินค้า/ขายแพ็กเกจ/ใช้แพ็กเกจ)  
สิทธิ์: owner, front_desk · Stories: US-08-01, US-10-05, US-08-03 · Rules: R-14,R-15

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `lineType` | enum:bill_line_type | ✓ | bill_line.line_type | quick_item \| package_sale \| package_redemption |
| `description` | string |  | bill_line.description | quick_item บังคับ 1–80 |
| `quantity` | int |  | bill_line.quantity | 1–999 |
| `unitPriceSatang` | int |  | bill_line.unit_price_satang | quick_item บังคับ ≥ 0 |
| `packageTemplateId` | uuid |  | bill_line.ref_id | package_sale |
| `customerPackageId` | uuid |  | bill_line.ref_id | package_redemption |
| `petId` | uuid |  | bill_line.pet_id | package_sale single_pet / redemption |
| `performerId` | uuid |  | bill_line.performer_id |  |

Response: `BillDetail`
  
Errors: `BILL_NOT_OPEN`, `PACKAGE_EXHAUSTED`, `PACKAGE_EXPIRED`, `PACKAGE_PET_MISMATCH`


<a id="ep-bills.updateLine"></a>

#### bills.updateLine

**PATCH `/api/v1/staff/bill-lines/{lineId}`** — ส่วนลดรายบรรทัด/เปลี่ยนช่าง  
สิทธิ์: owner, front_desk · Stories: US-08-02 · Rules: R-15

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `lineDiscountSatang` | int |  | bill_line.line_discount_satang | ≤ qty × unit |
| `lineDiscountReason` | string |  | bill_line.line_discount_reason | บังคับเมื่อ > 0 |
| `performerId` | uuid |  | bill_line.performer_id |  |
| `quantity` | int |  | bill_line.quantity | quick_item เท่านั้น |

Response: `BillDetail`
  
Errors: `BILL_NOT_OPEN`, `LINE_DISCOUNT_TOO_LARGE`, `DISCOUNT_LIMIT_EXCEEDED`, `REASON_REQUIRED`
  
Audit: `bill.discount`


ผลที่ต้องเกิด:
- bill_line เป็น append-only ใน ORM? ไม่ — แก้ได้ขณะบิล open โดย delete+insert ใน transaction


<a id="ep-bills.removeLine"></a>

#### bills.removeLine

**DELETE `/api/v1/staff/bill-lines/{lineId}`** — ลบรายการ (quick_item/package)  
สิทธิ์: owner, front_desk · Stories: US-08-01

Response: `BillDetail`
  
Errors: `BILL_NOT_OPEN`


ผลที่ต้องเกิด:
- บรรทัดที่มาจากใบจองลบไม่ได้ (ให้ยกเลิก child แทน)


<a id="ep-bills.setDiscount"></a>

#### bills.setDiscount

**PATCH `/api/v1/staff/bills/{billId}/discount`** — ส่วนลดท้ายบิล  
สิทธิ์: owner, front_desk · Stories: US-08-02 · Rules: R-15

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `billDiscountSatang` | int | ✓ | bill.bill_discount_satang | ≤ subtotal |
| `reason` | string |  | bill.bill_discount_reason | บังคับเมื่อ > 0 |

Response: `BillDetail`
  
Errors: `BILL_DISCOUNT_TOO_LARGE`, `DISCOUNT_LIMIT_EXCEEDED`, `REASON_REQUIRED`
  
Audit: `bill.discount`


<a id="ep-bills.addPayment"></a>

#### bills.addPayment

**POST `/api/v1/staff/bills/{billId}/payments`** — รับชำระ  
สิทธิ์: owner, front_desk · Stories: US-08-04, US-08-03 · Rules: R-15,R-30

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `method` | enum:payment_method | ✓ | payment.method | cash \| promptpay \| bank_transfer \| card_edc \| credit |
| `tenderedSatang` | int |  | payment.tendered_satang | cash บังคับ |
| `amountSatang` | int |  | payment.amount_satang | วิธีอื่นบังคับ ≤ due |
| `reference` | string |  | payment.reference | เลข EDC / เลขอ้างอิงโอน |
| `slipId` | uuid |  | payment.slip_id |  |
| `proofFileId` | uuid |  | payment.proof_file_id |  |
| `expectedPaidSatang` | int | ✓ | bill.paid_satang | ค่าที่หน้าจอเห็น (R-15) |

Response: `BillDetail`
  
Errors: `STALE_BILL`, `BILL_NOT_OPEN`, `AMOUNT_EXCEEDS_DUE`, `INSUFFICIENT_CREDIT`, `INVALID_AMOUNT`
  
Audit: `payment.create`


ผลที่ต้องเกิด:
- credit → credit_ledger (−) reason bill_payment + balance
- ล็อก bill row FOR UPDATE ก่อนตรวจ expectedPaidSatang
- bill.paid_satang/change_satang อัปเดต


<a id="ep-bills.voidPayment"></a>

#### bills.voidPayment

**POST `/api/v1/staff/payments/{paymentId}/void`** — ยกเลิกรายการรับเงิน (บิลยัง open)  
สิทธิ์: owner, front_desk · Stories: US-08-04

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | payment.void_reason | ≥ 3 |

Response: `BillDetail`
  
Errors: `BILL_NOT_OPEN`, `REASON_REQUIRED`
  
Audit: `payment.void`


ผลที่ต้องเกิด:
- credit → คืน credit_ledger reason void_reversal


<a id="ep-bills.promptpayQr"></a>

#### bills.promptpayQr

**GET `/api/v1/staff/bills/{billId}/promptpay-qr`** — QR PromptPay ยอดค้าง  
สิทธิ์: owner, front_desk · Stories: US-07-01, US-08-04 · Rules: R-30

Response: `PaymentInstruction`
  
Errors: `PROMPTPAY_NOT_CONFIGURED`


<a id="ep-bills.close"></a>

#### bills.close

**POST `/api/v1/staff/bills/{billId}/close`** — ปิดบิล  
สิทธิ์: owner, front_desk · Stories: US-08-04, US-08-05, US-09-02 · Rules: R-13,R-14,R-15,R-16,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `expectedPaidSatang` | int | ✓ | bill.paid_satang |  |

Response: `BillDetail`
  
Errors: `BILL_HAS_DUE`, `STALE_BILL`, `BILL_NOT_OPEN`
  
State: `bill:open→paid; booking:confirmed→closed`
  
Audit: `bill.close`
  
Notify: `customer.receipt`


ผลที่ต้องเกิด:
- ล็อก branch → R-16 receipt_no
- commission_entry ตาม R-13
- package_sale → สร้าง customer_package (R-14)
- package_redemption → sessions_used + 1
- มัดจำเกิน → credit (deposit_credit); booking.deposit_status applied
- customer.visit_count + 1, first/last_visit_at
- booking ที่ทุก child จบ → closed
- ส่งใบเสร็จทาง LINE ถ้าลูกค้ามี LINE (helpful, economy: skip)


<a id="ep-bills.void"></a>

#### bills.void

**POST `/api/v1/staff/bills/{billId}/void`** — Void บิลที่ปิดแล้ว  
สิทธิ์: owner · Stories: US-08-06 · Rules: R-13,R-14

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `reason` | string | ✓ | bill.void_reason | ≥ 3 |

Response: `BillDetail`
  
State: `bill:paid→void`
  
Audit: `bill.void`


ผลที่ต้องเกิด:
- commission_entry → reversed
- package_redemption.reversed_at + sessions_used − 1; customer_package ที่ขายในบิลนี้ → void
- credit ที่ใช้/ได้ในบิล → ย้อนด้วย credit_ledger void_reversal
- payment ทั้งหมด → voided (เงินจริงคืนผ่าน refunds.create)
- receipt_no คงเดิม; booking กลับเป็น confirmed และ bill_id = null


<a id="ep-bills.receipt"></a>

#### bills.receipt

**GET `/api/v1/staff/bills/{billId}/receipt`** — ข้อมูลใบเสร็จสำหรับพิมพ์  
สิทธิ์: owner, front_desk · Stories: US-08-05 · Rules: R-31

Response: `Receipt`


<a id="ep-bills.sendReceipt"></a>

#### bills.sendReceipt

**POST `/api/v1/staff/bills/{billId}/send-receipt`** — ส่งใบเสร็จทาง LINE อีกครั้ง  
สิทธิ์: owner, front_desk · Stories: US-08-05 · Rules: R-18,R-19

Response: `204` (No Content)
  
Notify: `customer.receipt`


### กลุ่ม `reportCards`


<a id="ep-reportCards.list"></a>

#### reportCards.list

**GET `/api/v1/staff/report-cards`** — Report card  
สิทธิ์: owner, front_desk, staff · Stories: US-10-01

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `status` | enum:report_card_status |  | report_card.status |  |

Response: `ReportCardDetail[]`


ผลที่ต้องเกิด:
- role staff เห็นเฉพาะที่ตัวเองสร้าง


<a id="ep-reportCards.get"></a>

#### reportCards.get

**GET `/api/v1/staff/report-cards/{reportCardId}`** — รายละเอียด Report card  
สิทธิ์: owner, front_desk, staff · Stories: US-10-01

Response: `ReportCardDetail`


<a id="ep-reportCards.update"></a>

#### reportCards.update

**PUT `/api/v1/staff/report-cards/{reportCardId}`** — กรอก Report card  
สิทธิ์: owner, front_desk, staff · Stories: US-10-01, US-10-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `skin` | enum:skin_condition |  | report_card.skin | grooming บังคับก่อน submit |
| `ears` | enum:ear_condition |  | report_card.ears |  |
| `nails` | enum:nail_condition |  | report_card.nails |  |
| `teeth` | enum:teeth_condition |  | report_card.teeth |  |
| `parasites` | enum:parasite_finding |  | report_card.parasites |  |
| `cooperation` | int |  | report_card.cooperation | 1–5 |
| `staffNote` | string |  | report_card.staff_note | ≤ 500 ลูกค้าเห็น |
| `recommendation` | string |  | report_card.recommendation | ≤ 300 |

Response: `ReportCardDetail`
  
Errors: `STATUS_NOT_ALLOWED`


ผลที่ต้องเกิด:
- แก้ได้เมื่อ draft/pending_review


<a id="ep-reportCards.submit"></a>

#### reportCards.submit

**POST `/api/v1/staff/report-cards/{reportCardId}/submit`** — ส่ง Report card  
สิทธิ์: owner, front_desk, staff · Stories: US-10-01 · Rules: R-18,R-19

Response: `ReportCardDetail`
  
State: `report_card:draft→pending_review|sent`
  
Notify: `customer.report_card`


ผลที่ต้องเกิด:
- policy report_card_requires_review → pending_review (แจ้งหน้าร้าน) ไม่งั้น sent
- sent: แนบรูป after ≤ 4 รูป (ถ้า photo_consent ≠ denied), ลิงก์หน้า report card ใน LIFF


<a id="ep-reportCards.approve"></a>

#### reportCards.approve

**POST `/api/v1/staff/report-cards/{reportCardId}/approve`** — หน้าร้านตรวจแล้วส่ง  
สิทธิ์: owner, front_desk · Stories: US-10-01

Response: `ReportCardDetail`
  
State: `report_card:pending_review→sent`
  
Notify: `customer.report_card`


### กลุ่ม `dashboard`


<a id="ep-dashboard.today"></a>

#### dashboard.today

**GET `/api/v1/staff/dashboard/today`** — Dashboard วันนี้  
สิทธิ์: owner, front_desk · Stories: US-12-01 · Rules: R-20

Response: `DashboardToday`


ผลที่ต้องเกิด:
- front_desk ไม่เห็น sales.*


### กลุ่ม `reports`


<a id="ep-reports.sales"></a>

#### reports.sales

**GET `/api/v1/staff/reports/sales`** — รายงานยอดขาย  
สิทธิ์: owner · Stories: US-12-02 · Rules: R-20

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  | ≤ 366 วัน |
| `groupBy` | enum | ✓ |  | day \| service \| groomer \| method |

Response: `SalesReport`


ผลที่ต้องเกิด:
- นับบิล status paid ตาม closed_at (วันท้องถิ่น); void ไม่นับ


<a id="ep-reports.commissions"></a>

#### reports.commissions

**GET `/api/v1/staff/reports/commissions`** — รายงานค่ามือ  
สิทธิ์: owner · Stories: US-12-03 · Rules: R-13

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  |  |

Response: `CommissionReport`


<a id="ep-reports.occupancy"></a>

#### reports.occupancy

**GET `/api/v1/staff/reports/occupancy`** — Occupancy  
สิทธิ์: owner · Stories: US-12-04

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  |  |

Response: `OccupancyReport`


### กลุ่ม `exports`


<a id="ep-exports.csv"></a>

#### exports.csv

**GET `/api/v1/staff/exports/{type}.csv`** — Export CSV (customers | pets | bills | bill_lines | commissions | bookings)  
สิทธิ์: owner · Stories: US-12-06

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date |  |  |  |
| `to` | date |  |  |  |

Response: `text/csv (UTF-8 BOM, คอลัมน์ภาษาอังกฤษ snake_case, เงินเป็นบาท 2 ตำแหน่ง)`
  
Audit: `data.export`


### กลุ่ม `audit`


<a id="ep-audit.list"></a>

#### audit.list

**GET `/api/v1/staff/audit-logs`** — Audit log  
สิทธิ์: owner · Stories: US-13-07

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `action` | string |  | audit_log.action |  |
| `from` | date |  |  |  |
| `to` | date |  |  |  |
| `cursor` | string |  |  |  |

Response: `Paged<AuditLogItem>`


### กลุ่ม `feedback`


<a id="ep-feedback.create"></a>

#### feedback.create

**POST `/api/v1/staff/feedback`** — แจ้งปัญหา/ขอ feature  
สิทธิ์: owner, front_desk, staff · Stories: US-13-13

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `pageUrl` | string | ✓ | feedback_report.page_url |  |
| `message` | string | ✓ | feedback_report.message | 5–2000 |
| `screenshotFileId` | uuid |  | feedback_report.screenshot_file_id | kind feedback |
| `appVersion` | string |  | feedback_report.app_version |  |

Response: `204` (No Content)
  
Notify: `admin.feedback`


### กลุ่ม `liff`


<a id="ep-liff.session"></a>

#### liff.session

**POST `/api/v1/liff/{branchSlug}/session`** — เปิด LIFF: แลก ID token เป็น session  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-01-01

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `idToken` | string | ✓ | line_identity.line_user_id | liff.getIDToken() — verify กับ line_channel.login_channel_id ของสาขา |

Response: `LiffSession`
  
Errors: `LINE_TOKEN_INVALID`, `LINE_NOT_CONNECTED`


ผลที่ต้องเกิด:
- upsert line_identity (provider_id ของ line_channel, sub) + display_name/picture
- มี customer → session subject customer (cookie `cid` 30 วัน)
- ไม่มี → session แบบยังไม่ลงทะเบียน (registered=false)


<a id="ep-liff.register"></a>

#### liff.register

**POST `/api/v1/liff/{branchSlug}/register`** — ลงทะเบียน + ยอมรับ PDPA  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-01, US-13-08, US-03-12 · Rules: R-22

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `firstName` | string | ✓ | owner_profile.first_name | 1–60 |
| `lastName` | string |  | owner_profile.last_name |  |
| `nickname` | string |  | owner_profile.nickname |  |
| `phone` | string | ✓ | owner_profile.phone_e164 | R-22 |
| `privacyVersion` | string | ✓ | consent_record.version | ต้องเท่าเวอร์ชันล่าสุด |
| `termsVersion` | string | ✓ | consent_record.version |  |
| `photoConsent` | bool | ✓ | customer.photo_consent | true → granted, false → denied |

Response: `LiffSession`
  
Errors: `INVALID_PHONE`, `LINK_REQUEST_PENDING`
  
Notify: `staff.link_request`


ผลที่ต้องเกิด:
- insert consent_record ×3 (privacy_notice, terms_of_service, photo_consent)
- เบอร์ตรงกับลูกค้าเดิมของร้าน → สร้าง customer_link_request (ไม่ผูกเอง) แจ้งหน้าร้าน
- ไม่ตรง → owner_profile + customer (source_channel line_liff)


<a id="ep-liff.me"></a>

#### liff.me

**GET `/api/v1/liff/{branchSlug}/me`** — โปรไฟล์ของฉัน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-01

Response: `MyProfile`


<a id="ep-liff.updateMe"></a>

#### liff.updateMe

**PATCH `/api/v1/liff/{branchSlug}/me`** — แก้โปรไฟล์  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-01, US-03-12

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `firstName` | string |  | owner_profile.first_name |  |
| `lastName` | string |  | owner_profile.last_name |  |
| `nickname` | string |  | owner_profile.nickname |  |
| `phone` | string |  | owner_profile.phone_e164 | R-22 |
| `photoConsent` | bool |  | customer.photo_consent | insert consent_record ใหม่ |

Response: `MyProfile`


<a id="ep-liff.shop"></a>

#### liff.shop

**GET `/api/v1/liff/{branchSlug}/shop`** — ข้อมูลร้าน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-03

Response: `ShopPublic`


<a id="ep-liff.pets"></a>

#### liff.pets

**GET `/api/v1/liff/{branchSlug}/pets`** — น้องของฉัน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-02

Response: `MyPet[]`


<a id="ep-liff.createPet"></a>

#### liff.createPet

**POST `/api/v1/liff/{branchSlug}/pets`** — เพิ่มน้อง  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `name` | string | ✓ | pet.name |  |
| `species` | enum:species | ✓ | pet.species |  |
| `breed` | string |  | pet.breed |  |
| `sex` | enum:pet_sex | ✓ | pet.sex |  |
| `birthDate` | date |  | pet.birth_date |  |
| `ageEstimateMonths` | int |  | pet.age_estimate_months |  |
| `neutered` | bool |  | pet.neutered |  |
| `coatType` | enum:coat_type | ✓ | pet.coat_type | LIFF บังคับเลือก (มีรูปตัวอย่าง) |
| `weightGrams` | int |  | pet_weight.weight_grams | source customer |
| `profileFileId` | uuid |  | pet.profile_file_id |  |

Response: `MyPet`


<a id="ep-liff.updatePet"></a>

#### liff.updatePet

**PATCH `/api/v1/liff/{branchSlug}/pets/{petId}`** — แก้ข้อมูลน้อง  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-02

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `<same as create>` | any |  | pet.name |  |

Response: `MyPet`


<a id="ep-liff.addVaccination"></a>

#### liff.addVaccination

**POST `/api/v1/liff/{branchSlug}/pets/{petId}/vaccinations`** — ส่งหลักฐานวัคซีน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-02, US-06-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `vaccineCode` | string | ✓ | pet_vaccination.vaccine_code |  |
| `administeredOn` | date |  | pet_vaccination.administered_on |  |
| `expiresOn` | date | ✓ | pet_vaccination.expires_on |  |
| `proofFileId` | uuid | ✓ | pet_vaccination.proof_file_id | kind vaccine_proof |

Response: `VaccinationItem`
  
Notify: `staff.vaccine_review`


ผลที่ต้องเกิด:
- status pending_review, source customer


<a id="ep-liff.groomSlots"></a>

#### liff.groomSlots

**POST `/api/v1/liff/{branchSlug}/availability/groom-slots`** — เวลาว่างกรูม (ลูกค้า)  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-03 · Rules: R-01,R-02,R-03,R-04,R-12

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `petId` | uuid | ✓ |  | ต้องเป็นน้องของลูกค้า |
| `serviceIds[]` | uuid[] | ✓ |  | online_bookable |
| `addonIds[]` | uuid[] |  |  |  |
| `groomerId` | uuid |  |  |  |
| `sizeTierId` | uuid |  |  | ลูกค้าเลือกเองเมื่อไม่มีน้ำหนัก |

Response: `SlotList`
  
Errors: `PRICE_NOT_FOUND`, `WEIGHT_REQUIRED`, `CUSTOMER_BLACKLISTED`, `MODULE_DISABLED`


ผลที่ต้องเกิด:
- ไม่ส่ง groomerName ของช่างที่ลูกค้าเลือก any? ส่ง (แสดงชื่อเล่นช่าง)
- rate limit 30/นาที/ผู้ใช้


<a id="ep-liff.hotelAvailability"></a>

#### liff.hotelAvailability

**GET `/api/v1/liff/{branchSlug}/availability/hotel`** — ห้องว่าง (ลูกค้า)  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-04 · Rules: R-12,R-28

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `checkInDate` | date | ✓ |  |  |
| `checkOutDate` | date | ✓ |  |  |
| `petId` | uuid | ✓ |  |  |

Response: `HotelAvailability`


<a id="ep-liff.daycareAvailability"></a>

#### liff.daycareAvailability

**GET `/api/v1/liff/{branchSlug}/availability/daycare`** — ที่ว่าง Daycare (ลูกค้า)  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-05 · Rules: R-29

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `date` | date | ✓ |  |  |
| `petId` | uuid | ✓ |  |  |

Response: `DaycareAvailability`


<a id="ep-liff.quote"></a>

#### liff.quote

**POST `/api/v1/liff/{branchSlug}/quotes`** — สรุปราคา/มัดจำก่อนยืนยัน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-03, US-11-04, US-11-05 · Rules: R-03,R-06,R-08,R-11

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `groom[]` | object[] |  |  |  |
| `stays[]` | object[] |  |  |  |
| `daycare[]` | object[] |  |  |  |

Response: `Quote`


<a id="ep-liff.createBooking"></a>

#### liff.createBooking

**POST `/api/v1/liff/{branchSlug}/bookings`** — ลูกค้ายืนยันการจอง  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-03, US-11-04, US-11-05, US-11-06, US-05-02 · Rules: R-03,R-04,R-06,R-08,R-09,R-10,R-11,R-12,R-23,R-28,R-29

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `groom[].petId` | uuid | ✓ | groom_appointment.pet_id |  |
| `groom[].serviceIds[]` | uuid[] | ✓ | groom_appointment_item.service_id |  |
| `groom[].addonIds[]` | uuid[] |  | groom_appointment_item.service_id |  |
| `groom[].startsAt` | datetime | ✓ | groom_appointment.starts_at | ตรวจกับ R-04 ใหม่ฝั่ง server |
| `groom[].groomerId` | uuid |  | groom_appointment.groomer_id | ไม่ส่ง = any |
| `groom[].sizeTierId` | uuid |  | groom_appointment.size_tier_id |  |
| `stays[].petId` | uuid | ✓ | stay.pet_id |  |
| `stays[].roomTypeId` | uuid | ✓ | stay.room_type_id |  |
| `stays[].checkInDate` | date | ✓ | stay.check_in_date |  |
| `stays[].checkOutDate` | date | ✓ | stay.check_out_date |  |
| `stays[].expectedCheckInTime` | time |  | stay.expected_check_in_time |  |
| `stays[].expectedCheckOutTime` | time |  | stay.expected_check_out_time |  |
| `stays[].inHeat` | bool | ✓ | stay.in_heat |  |
| `stays[].addonServiceIds[]` | uuid[] |  | stay_addon.service_id |  |
| `stays[].bathBeforeCheckout` | object |  | stay.bundle_appointment_id | {serviceIds, startsAt} US-11-06 |
| `daycare[].petId` | uuid | ✓ | daycare_visit.pet_id |  |
| `daycare[].sessionTypeId` | uuid | ✓ | daycare_visit.session_type_id |  |
| `daycare[].visitDate` | date | ✓ | daycare_visit.visit_date |  |
| `customerNote` | string |  | booking.customer_note | ≤ 300 |
| `acceptedPolicy` | bool | ✓ |  | ต้อง true (ลูกค้ากดยอมรับนโยบายยกเลิก) |

Response: `MyBookingDetail`
  
Errors: `SLOT_TAKEN`, `ROOM_TAKEN`, `PET_ALREADY_BOOKED`, `DAYCARE_FULL`, `CUSTOMER_BLACKLISTED`, `VACCINE_REQUIRED`, `OUTSIDE_BOOKING_WINDOW`, `PRICE_NOT_FOUND`, `MODULE_DISABLED`
  
State: `booking:∅→awaiting_deposit|awaiting_approval|confirmed`
  
Notify: `customer.booking_received|customer.booking_confirmed, staff.new_booking`


ผลที่ต้องเกิด:
- channel = line_liff (หรือ booking_link ถ้ามาจากลิงก์จอง), created_by_type customer
- R-11 ไม่ผ่านแต่มี pendingReview/อัปโหลดแล้ว → requiresApproval = true; missing/expired → VACCINE_REQUIRED
- deposit > 0 → awaiting_deposit + hold (R-08) + คืน PaymentInstruction (R-30)
- ใช้ reply ยืนยันถ้าทำได้ (SP-03) ไม่งั้น push essential


<a id="ep-liff.bookings"></a>

#### liff.bookings

**GET `/api/v1/liff/{branchSlug}/bookings`** — นัดของฉัน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-08 · Rules: R-21

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `scope` | enum |  |  | upcoming \| past |

Response: `MyBookingItem[]`


<a id="ep-liff.booking"></a>

#### liff.booking

**GET `/api/v1/liff/{branchSlug}/bookings/{bookingId}`** — รายละเอียดนัด  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-08 · Rules: R-07,R-21

Response: `MyBookingDetail`


<a id="ep-liff.uploadSlip"></a>

#### liff.uploadSlip

**POST `/api/v1/liff/{branchSlug}/bookings/{bookingId}/slips`** — ส่งสลิปมัดจำ  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-07, US-07-02 · Rules: R-05,R-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `fileId` | uuid | ✓ | payment_slip.file_id | kind slip |
| `qrPayload` | string |  | payment_slip.qr_payload | ข้อความจาก QR บนสลิป (client decode) |

Response: `MyBookingDetail`
  
Errors: `HOLD_EXPIRED`, `STATUS_NOT_ALLOWED`
  
State: `booking:awaiting_deposit→deposit_review`
  
Notify: `staff.slip_submitted`


ผลที่ต้องเกิด:
- parse R-05 → trans_ref, duplicate_of_slip_id
- deposit_status submitted; ล้าง hold_expires_at


<a id="ep-liff.cancel"></a>

#### liff.cancel

**POST `/api/v1/liff/{branchSlug}/bookings/{bookingId}/cancel`** — ลูกค้ายกเลิกเอง  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-08 · Rules: R-07,R-21,R-09

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `customerChoice` | enum |  |  | refund \| credit (เมื่อ policy customer_choice) |
| `reason` | string |  | booking.cancel_reason |  |

Response: `MyBookingDetail`
  
Errors: `STATUS_NOT_ALLOWED`
  
State: `booking:*→cancelled`
  
Notify: `staff.booking_cancelled`


ผลที่ต้องเกิด:
- booking.cancel_is_late = R-07 isLate (Q-0084)


<a id="ep-liff.reschedule"></a>

#### liff.reschedule

**POST `/api/v1/liff/{branchSlug}/bookings/{bookingId}/reschedule`** — ลูกค้าเลื่อนนัดกรูมเอง  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-08 · Rules: R-04,R-21

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `appointmentId` | uuid | ✓ | groom_appointment.id |  |
| `startsAt` | datetime | ✓ | groom_appointment.starts_at | R-04 |
| `groomerId` | uuid |  | groom_appointment.groomer_id |  |

Response: `MyBookingDetail`
  
Errors: `TOO_LATE_TO_RESCHEDULE`, `RESCHEDULE_LIMIT`, `SLOT_TAKEN`
  
Notify: `staff.booking_rescheduled`


ผลที่ต้องเกิด:
- booking.reschedule_count + 1


<a id="ep-liff.ics"></a>

#### liff.ics

**GET `/api/v1/liff/{branchSlug}/bookings/{bookingId}/calendar.ics`** — ไฟล์เพิ่มลงปฏิทิน  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-11-10

Response: `text/calendar`


ผลที่ต้องเกิด:
- 1 VEVENT ต่อนัด/การพัก, LOCATION = ที่อยู่ร้าน, URL = Google Maps


<a id="ep-liff.stayUpdates"></a>

#### liff.stayUpdates

**GET `/api/v1/liff/{branchSlug}/stays/{stayId}/updates`** — หน้าอัปเดตน้องระหว่างพัก  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-06-10

Response: `StayUpdates`


<a id="ep-liff.reportCard"></a>

#### liff.reportCard

**GET `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}`** — ดู Report card  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-10-01, US-10-02

Response: `ReportCardDetail`


ผลที่ต้องเกิด:
- เฉพาะ status sent ของลูกค้าคนนี้; ไม่ส่ง internal fields


<a id="ep-liff.rate"></a>

#### liff.rate

**POST `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/rating`** — ให้ดาว  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-10-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `rating` | int | ✓ | report_card.customer_rating | 1–5 |
| `feedback` | string |  | report_card.customer_feedback | ≤ 1000 ถึงร้านเท่านั้น |

Response: `ReportCardDetail`
  
Notify: `staff.low_rating (rating ≤ 3)`


ผลที่ต้องเกิด:
- แสดงปุ่มรีวิว Google ให้ทุกคนเท่ากัน ไม่ขึ้นกับดาว (นโยบาย Google)


<a id="ep-liff.reviewClick"></a>

#### liff.reviewClick

**POST `/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/review-click`** — บันทึกการกดลิงก์รีวิว  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-10-03

Response: `204` (No Content)


ผลที่ต้องเกิด:
- report_card.google_review_clicked_at = now (ครั้งแรก)


<a id="ep-liff.packages"></a>

#### liff.packages

**GET `/api/v1/liff/{branchSlug}/packages`** — แพ็กเกจคงเหลือ  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-10-06

Response: `CustomerPackageItem[]`


<a id="ep-liff.receipt"></a>

#### liff.receipt

**GET `/api/v1/liff/{branchSlug}/receipts/{billId}`** — ใบเสร็จ  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-08-05

Response: `Receipt`


<a id="ep-liff.payPage"></a>

#### liff.payPage

**GET `/api/v1/liff/{branchSlug}/pay/{billId}`** — หน้าจ่ายยอดคงเหลือ  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-07-08 · Rules: R-30

Response: `PaymentInstruction`


<a id="ep-liff.payUploadSlip"></a>

#### liff.payUploadSlip

**POST `/api/v1/liff/{branchSlug}/pay/{billId}/slips`** — ส่งสลิปยอดคงเหลือ  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-07-08 · Rules: R-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `fileId` | uuid | ✓ | payment_slip.file_id |  |
| `qrPayload` | string |  | payment_slip.qr_payload |  |

Response: `PaymentInstruction`
  
Notify: `staff.slip_submitted`


<a id="ep-liff.dataRequest"></a>

#### liff.dataRequest

**POST `/api/v1/liff/{branchSlug}/data-requests`** — ขอดู/ลบข้อมูลส่วนบุคคล  
สิทธิ์: ลูกค้า (LIFF) · Stories: US-13-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `type` | enum:data_request_type | ✓ | data_request.type |  |

Response: `204` (No Content)
  
Notify: `admin.data_request`


### กลุ่ม `public`


<a id="ep-public.branch"></a>

#### public.branch

**GET `/api/v1/public/branches/{bookingSlug}`** — หน้า landing ลิงก์จอง  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-02-07

Response: `ShopPublic`


ผลที่ต้องเกิด:
- cache 60 วินาที; ปุ่ม 'จองผ่าน LINE' → liffUrl, ไม่มี LINE → แสดงเบอร์โทร


### กลุ่ม `webhook`


<a id="ep-webhook.line"></a>

#### webhook.line

**POST `/api/webhooks/line/{messagingChannelId}`** — LINE webhook  
สิทธิ์: LINE signature · Stories: US-02-06, US-13-06 · Rules: R-19

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `x-line-signature` | header | ✓ | line_channel.channel_secret_enc | HMAC-SHA256(body, channel secret) base64 — เทียบแบบ constant-time |

Response: `204` (No Content)
  
Errors: `WEBHOOK_SIGNATURE_INVALID`


ผลที่ต้องเกิด:
- follow/unfollow → line_identity.is_friend
- message → เก็บ reply token ใน memory/DB 50 วินาที (SP-03) และตอบด้วยข้อความคำสั่ง ('นัดของฉัน', 'จองคิว')
- ตอบ 200 ภายใน 1 วินาที — งานหนักใส่ scheduled_job


### กลุ่ม `cron`


<a id="ep-cron.tick"></a>

#### cron.tick

**POST `/api/cron/tick`** — ประมวลผล scheduled_job  
สิทธิ์: cron secret · Stories: US-05-02, US-07-06, US-10-04, US-12-05

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `x-cron-secret` | header | ✓ |  | = env CRON_SECRET |

Response: `object {processed: number, failed: number}`
  
Errors: `CRON_FORBIDDEN`


ผลที่ต้องเกิด:
- SELECT … WHERE status='pending' AND run_at <= now ORDER BY run_at LIMIT 50 FOR UPDATE SKIP LOCKED
- แต่ละงานใน transaction ของตัวเอง; error → attempts+1, run_at + 2^attempts นาที, ครบ 5 → failed
- ถูกเรียกโดย cron ภายนอกฟรี (เช่น GitHub Actions schedule / cron-job.org) ทุก 1–5 นาที


### กลุ่ม `health`


<a id="ep-health"></a>

#### health

**GET `/api/health`** — health check  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-13-09

Response: `object {ok: boolean, db: 'ok' \| 'error' \| 'unknown', version: string}`


ผลที่ต้องเกิด:
- version = NEXT_PUBLIC_APP_VERSION หรือ 'dev' ถ้าไม่ได้ตั้ง (ต้องมี key เสมอ)
- db = 'unknown' จนกว่า INF-MON จะเพิ่ม db ping; หลังจากนั้น 'ok' | 'error' (error → HTTP 503, ok: false)


### กลุ่ม `admin`


<a id="ep-admin.login"></a>

#### admin.login

**POST `/api/v1/auth/admin/login`** — ทีมแพลตฟอร์มเข้าสู่ระบบ  
สิทธิ์: ไม่ต้องล็อกอิน · Stories: US-13-10 · Rules: R-24

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `email` | string | ✓ | platform_admin.email |  |
| `password` | string | ✓ | platform_admin.password_hash |  |

Response: `object {admin: {id: uuid, email: string, displayName: string}}`
  
Errors: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`


ผลที่ต้องเกิด:
- session 12 ชม. cookie `aid`
- admin.id/email/displayName มาจาก platform_admin.id/email/display_name เท่านั้น
- R-24: บันทึก failed_login_count และ locked_until ใน platform_admin; ผิดครั้งที่ 5 ล็อก 15 นาทีและ reset count; สำเร็จ reset count และ locked_until


<a id="ep-admin.orgs"></a>

#### admin.orgs

**GET `/api/v1/admin/organizations`** — รายชื่อร้าน  
สิทธิ์: platform admin · Stories: US-13-10

Response: `OrgListItem[]`


<a id="ep-admin.createOrg"></a>

#### admin.createOrg

**POST `/api/v1/admin/organizations`** — สร้างร้านใหม่  
สิทธิ์: platform admin · Stories: US-13-10, US-13-14

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `name` | string | ✓ | organization.name |  |
| `slug` | string | ✓ | organization.slug | ^[a-z0-9-]{3,40}$ |
| `branchName` | string | ✓ | branch.name |  |
| `bookingSlug` | string | ✓ | branch.booking_slug | ^[a-z0-9-]{3,40}$ |
| `ownerEmail` | string | ✓ | staff_user.email |  |
| `ownerName` | string | ✓ | staff_user.display_name |  |
| `modules.grooming` | bool | ✓ | branch.module_grooming |  |
| `modules.hotel` | bool | ✓ | branch.module_hotel |  |
| `modules.daycare` | bool | ✓ | branch.module_daycare |  |

Response: `object {organization: OrgListItem, ownerInviteUrl: string}`
  
Errors: `SLUG_TAKEN`, `EMAIL_TAKEN`


ผลที่ต้องเกิด:
- transaction: organization(pilot) + branch + branch_policy default + branch_hours 7 วัน (09:00–18:00) + rate_plan default + size_tier มาตรฐาน (หมา XS–XL, แมว S/L) + groom_station 1 โต๊ะ + owner invite
- consent_record ฝั่งร้าน (dpa, terms_of_service) ทำตอน owner รับคำเชิญ


<a id="ep-admin.updateOrg"></a>

#### admin.updateOrg

**PATCH `/api/v1/admin/organizations/{orgId}`** — เปลี่ยนสถานะร้าน  
สิทธิ์: platform admin · Stories: US-13-10 · Rules: R-27

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `status` | enum:org_status | ✓ | organization.status |  |

Response: `OrgListItem`
  
Audit: `organization.status_change`


ผลที่ต้องเกิด:
- suspended → ทุก session ของร้านถูกปฏิเสธ (403) ยกเว้น admin
- บันทึก audit ใน transaction เดียวกับ status: organization_id = ร้านที่แก้, actor_type = platform_admin, entity_type = organization, entity_id = orgId, before/after = {status} เฉพาะเมื่อ status เปลี่ยน


<a id="ep-admin.setLineChannel"></a>

#### admin.setLineChannel

**PUT `/api/v1/admin/branches/{branchId}/line-channel`** — ใส่ค่าการเชื่อม LINE OA ของร้าน  
สิทธิ์: platform admin · Stories: US-02-06

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `providerId` | string | ✓ | line_channel.provider_id | ตาม ADR-001 |
| `messagingChannelId` | string | ✓ | line_channel.messaging_channel_id |  |
| `channelSecret` | string | ✓ | line_channel.channel_secret_enc | เข้ารหัสก่อนเก็บ — ห้าม log |
| `channelAccessToken` | string | ✓ | line_channel.channel_access_token_enc | เข้ารหัส |
| `loginChannelId` | string | ✓ | line_channel.login_channel_id |  |
| `liffId` | string | ✓ | line_channel.liff_id |  |
| `botBasicId` | string |  | line_channel.bot_basic_id | @xxxx |
| `monthlyPushQuota` | int | ✓ | line_channel.monthly_push_quota | ตามแพ็ก OA |

Response: `LineStatus`
  
Audit: `line_channel.update`


<a id="ep-admin.verifyLine"></a>

#### admin.verifyLine

**POST `/api/v1/admin/branches/{branchId}/line-channel/verify`** — ทดสอบการเชื่อม + ตั้ง webhook + rich menu  
สิทธิ์: platform admin · Stories: US-02-06

Response: `LineStatus`
  
Errors: `LINE_API_ERROR`
  
State: `line_channel:pending|error→active`


ผลที่ต้องเกิด:
- GET bot info, PUT webhook endpoint, test webhook, สร้าง rich menu มาตรฐาน (จองคิว/นัดของฉัน/น้องของฉัน/ติดต่อร้าน)


<a id="ep-admin.supportStart"></a>

#### admin.supportStart

**POST `/api/v1/admin/support-sessions`** — เข้าโหมดช่วยเหลือ (อ่านอย่างเดียว)  
สิทธิ์: platform admin · Stories: US-13-11

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `organizationId` | uuid | ✓ | support_access_log.organization_id |  |
| `reason` | string | ✓ | support_access_log.reason | ≥ 10 |
| `ticketRef` | string |  | support_access_log.ticket_ref |  |

Response: `object {redirectUrl}`
  
Audit: `support.session_start`
  
Notify: `owner.support_access`


ผลที่ต้องเกิด:
- สร้าง session staff-like ที่ support_access_log_id มีค่า (60 นาที) — ทุก request เขียนถูกปฏิเสธ SUPPORT_READ_ONLY
- แจ้งเจ้าของร้าน


<a id="ep-admin.supportEnd"></a>

#### admin.supportEnd

**POST `/api/v1/admin/support-sessions/{supportId}/end`** — จบโหมดช่วยเหลือ  
สิทธิ์: platform admin · Stories: US-13-11

Response: `204` (No Content)
  
Audit: `support.session_end`


<a id="ep-admin.feedback"></a>

#### admin.feedback

**GET `/api/v1/admin/feedback`** — รายการแจ้งปัญหา  
สิทธิ์: platform admin · Stories: US-13-13

Response: `FeedbackItem[]`


<a id="ep-admin.updateFeedback"></a>

#### admin.updateFeedback

**PATCH `/api/v1/admin/feedback/{feedbackId}`** — อัปเดตสถานะแจ้งปัญหา  
สิทธิ์: platform admin · Stories: US-13-13

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `status` | enum:feedback_status | ✓ | feedback_report.status |  |

Response: `FeedbackItem`


<a id="ep-admin.dataRequests"></a>

#### admin.dataRequests

**GET `/api/v1/admin/data-requests`** — คำขอ PDPA  
สิทธิ์: platform admin · Stories: US-13-08

Response: `DataRequestItem[]`


<a id="ep-admin.resolveDataRequest"></a>

#### admin.resolveDataRequest

**POST `/api/v1/admin/data-requests/{requestId}/resolve`** — ดำเนินการคำขอ PDPA  
สิทธิ์: platform admin · Stories: US-13-08

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `status` | enum:data_request_status | ✓ | data_request.status | done \| rejected |
| `note` | string |  | data_request.note |  |

Response: `DataRequestItem`
  
Audit: `pdpa.erase (type delete)`


ผลที่ต้องเกิด:
- access → สร้างไฟล์ JSON ข้อมูลของคนนั้นส่งทาง LINE/อีเมล
- delete → ล้างค่าส่วนตัวใน owner_profile (ชื่อ = 'ลบแล้ว', เบอร์/อีเมล/ที่อยู่ null), erased_at = now; บิลยังเก็บตามกฎหมายบัญชี


<a id="ep-admin.analytics"></a>

#### admin.analytics

**GET `/api/v1/admin/analytics/pilot`** — ตัวชี้วัดนำร่อง  
สิทธิ์: platform admin · Stories: US-13-12

Query:

| param | type | req | maps to | validation |
|---|---|---|---|---|
| `from` | date | ✓ |  |  |
| `to` | date | ✓ |  |  |

Response: `PilotAnalytics`


<a id="ep-admin.holidays"></a>

#### admin.holidays

**PUT `/api/v1/admin/public-holidays/{year}`** — ตั้งวันหยุดราชการประจำปี  
สิทธิ์: platform admin · Stories: US-13-03

Request body:

| field | type | req | maps to (table.column) | validation |
|---|---|---|---|---|
| `days[].date` | date | ✓ | public_holiday.holiday_date |  |
| `days[].nameTh` | string | ✓ | public_holiday.name_th |  |

Response: `204` (No Content)


<a id="ep-admin.listHolidays"></a>

#### admin.listHolidays

**GET `/api/v1/admin/public-holidays/{year}`** — โหลดวันหยุดราชการทั้งปี  
สิทธิ์: platform admin · Stories: US-13-03

Response: `PublicHoliday[]`


ผลที่ต้องเกิด:
- year เป็น ค.ศ. 1000–9999; อ่านเฉพาะปีนั้น เรียงตาม date; ไม่มีข้อมูลตอบ []

