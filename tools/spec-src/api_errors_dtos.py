# -*- coding: utf-8 -*-
"""Error catalog + response DTOs. Every DTO field maps to table.column, calc:<rule/expr>, dto:<Name> or []dto:<Name>."""

ERRORS = [
 # code, http, message (th), when
 ("UNAUTHENTICATED", 401, "กรุณาเข้าสู่ระบบ", "ไม่มี session หรือหมดอายุ"),
 ("FORBIDDEN", 403, "คุณไม่มีสิทธิ์ทำรายการนี้", "role ไม่อยู่ใน permission matrix"),
 ("SUPPORT_READ_ONLY", 403, "โหมดช่วยเหลือดูข้อมูลได้อย่างเดียว", "support session พยายามเขียน"),
 ("NOT_FOUND", 404, "ไม่พบข้อมูล", "ไม่พบ หรืออยู่คนละ organization (ห้ามตอบ 403 เพื่อไม่เปิดเผยว่ามีอยู่)"),
 ("VALIDATION_FAILED", 422, "ข้อมูลไม่ถูกต้อง", "zod ไม่ผ่าน — details.fields = {path: message}"),
 ("INVALID_TRANSITION", 409, "สถานะรายการเปลี่ยนไปแล้ว กรุณารีเฟรช", "UPDATE … WHERE status = from ได้ 0 แถว"),
 ("STALE_BILL", 409, "บิลถูกแก้ไขจากอีกเครื่อง กรุณารีเฟรช", "expectedPaidSatang ไม่ตรง (R-15)"),
 ("RATE_LIMITED", 429, "ทำรายการถี่เกินไป กรุณารอสักครู่", "เกิน rate limit"),
 ("INTERNAL", 500, "ระบบขัดข้อง กรุณาลองใหม่", "exception ที่ไม่คาดไว้ (log + Sentry)"),
 ("INVALID_CREDENTIALS", 401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง", "R-24"),
 ("ACCOUNT_LOCKED", 423, "บัญชีถูกล็อกชั่วคราว ลองใหม่ใน 15 นาที", "R-24"),
 ("PASSWORD_POLICY", 422, "รหัสผ่านต้องยาว 8 ตัวขึ้นไป และไม่ใช่ตัวเลขล้วน", "R-24 — details.reason"),
 ("TOKEN_INVALID", 400, "ลิงก์ไม่ถูกต้องหรือหมดอายุ", "invite/reset token ไม่พบ/หมดอายุ/ใช้แล้ว"),
 ("LINE_TOKEN_INVALID", 401, "ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดใหม่จาก LINE", "verify ID token ไม่ผ่าน"),
 ("NOT_REGISTERED", 403, "กรุณาลงทะเบียนก่อนใช้งาน", "LIFF session ที่ยังไม่มี customer"),
 ("LAST_OWNER", 409, "ต้องมีเจ้าของร้านอย่างน้อย 1 คน", "ลด role/ปิด owner คนสุดท้าย"),
 ("EMAIL_TAKEN", 409, "อีเมลนี้ถูกใช้แล้ว", "unique staff_user.email"),
 ("SLUG_TAKEN", 409, "ชื่อลิงก์นี้ถูกใช้แล้ว", "unique slug/booking_slug"),
 ("CODE_TAKEN", 409, "รหัสนี้ถูกใช้แล้ว", "unique code (room_unit, size_tier)"),
 ("IN_USE", 409, "ใช้งานอยู่ ลบไม่ได้ — ให้ปิดใช้งานแทน", "FK violation 23503 ตอนลบ หรือ service ตรวจเองเมื่อ FK เป็น cascade/set null (เช่น sizeTiers.set — Q-0029)"),
 ("SIZE_TIER_OVERLAP", 422, "ช่วงน้ำหนักทับกัน", "R-01"),
 ("INVALID_PHONE", 422, "เบอร์โทรไม่ถูกต้อง", "R-22"),
 ("LINK_REQUEST_PENDING", 409, "มีคำขอจับคู่บัญชีรอร้านยืนยันอยู่", "customer_link_request pending"),
 ("MODULE_DISABLED", 422, "ร้านยังไม่เปิดบริการนี้", "branch.module_* = false"),
 ("BRANCH_CLOSED", 422, "ร้านปิดในวันที่เลือก", "branch_hours / branch_closure"),
 ("OUTSIDE_BOOKING_WINDOW", 422, "วันที่เลือกอยู่นอกช่วงที่จองได้", "R-04 lead/horizon"),
 ("SLOT_TAKEN", 409, "คิวนี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่", "23P01 groom_appt_*_no_overlap หรือ slot ไม่อยู่ในผล R-04"),
 ("ROOM_TAKEN", 409, "ห้องเต็มในช่วงวันที่เลือก", "23P01 stay_room_no_overlap / R-10 none_free"),
 ("PET_ALREADY_BOOKED", 409, "น้องมีการจองที่ทับช่วงเวลานี้แล้ว", "23P01 stay_pet_no_overlap / นัดกรูมทับกัน"),
 ("DAYCARE_FULL", 409, "รอบ Daycare นี้เต็มแล้ว", "R-29"),
 ("PRICE_NOT_FOUND", 422, "บริการนี้ไม่มีราคาสำหรับขนาด/ขนของน้อง", "R-02"),
 ("WEIGHT_REQUIRED", 422, "กรุณาระบุน้ำหนักหรือขนาดของน้อง", "R-01 no_weight และไม่ได้เลือกขนาด"),
 ("DURATION_ZERO", 422, "กรุณาเลือกบริการหลักอย่างน้อย 1 รายการ", "R-03"),
 ("INVALID_DATE_RANGE", 422, "ช่วงวันที่ไม่ถูกต้อง", "R-03"),
 ("CUSTOMER_BLACKLISTED", 403, "ไม่สามารถจองออนไลน์ได้ กรุณาติดต่อร้าน", "R-12"),
 ("PET_INACTIVE", 422, "โปรไฟล์น้องไม่พร้อมใช้งาน", "R-12"),
 ("SPECIES_NOT_ALLOWED", 422, "บริการนี้ไม่รองรับชนิดสัตว์ของน้อง", "R-12"),
 ("BREED_REJECTED", 422, "ขออภัย ร้านยังไม่รับสายพันธุ์นี้", "R-12"),
 ("PET_TOO_HEAVY", 422, "น้ำหนักน้องเกินที่ร้านรับได้", "R-12"),
 ("PET_TOO_YOUNG", 422, "น้องอายุยังไม่ถึงเกณฑ์ของห้องนี้", "R-12"),
 ("IN_HEAT_NOT_ALLOWED", 422, "ห้องนี้ไม่รับน้องที่อยู่ในช่วงติดสัด", "R-12"),
 ("REACTIVE_NOT_ALLOWED", 422, "ห้องนี้ไม่รับน้องที่มีนิสัยก้าวร้าว", "R-12"),
 ("VACCINE_REQUIRED", 422, "วัคซีนของน้องไม่ครบหรือหมดอายุ", "R-11 — details {missing, expired, pendingReview}"),
 ("STATUS_NOT_ALLOWED", 409, "ทำรายการนี้ในสถานะปัจจุบันไม่ได้", "R-21 / guard ของ state machine"),
 ("TOO_LATE_TO_RESCHEDULE", 422, "เลยเวลาที่เลื่อนนัดเองได้ กรุณาติดต่อร้าน", "R-21"),
 ("RESCHEDULE_LIMIT", 422, "เลื่อนนัดครบจำนวนครั้งแล้ว กรุณาติดต่อร้าน", "R-21"),
 ("HOLD_EXPIRED", 410, "หมดเวลาชำระมัดจำ คิวถูกปล่อยแล้ว", "R-08"),
 ("CONSENT_REQUIRED", 422, "ต้องเซ็นใบยินยอมก่อน", "เช็คอินกรูมที่เลือกเหตุผลเสี่ยง / เช็คอิน Hotel"),
 ("INTAKE_INCOMPLETE", 422, "กรอกฟอร์มรับฝากให้ครบก่อนเช็คอิน", "stay_intake.completed_at = null"),
 ("PROMPTPAY_NOT_CONFIGURED", 422, "ร้านยังไม่ได้ตั้งค่าบัญชี PromptPay", "branch.promptpay_id = null"),
 ("INVALID_PROMPTPAY_ID", 422, "หมายเลข PromptPay ไม่ถูกต้อง", "R-30"),
 ("DUPLICATE_SLIP_CONFIRM_REQUIRED", 409, "สลิปนี้เคยถูกใช้แล้ว ต้องยืนยันซ้ำอีกครั้ง", "R-05 duplicate และไม่ได้ส่ง confirmDuplicate=true"),
 ("INVALID_AMOUNT", 422, "จำนวนเงินไม่ถูกต้อง", "R-15"),
 ("AMOUNT_EXCEEDS_DUE", 422, "ยอดเกินยอดค้างชำระ", "R-15"),
 ("INSUFFICIENT_CREDIT", 422, "เครดิตคงเหลือไม่พอ", "R-15"),
 ("BILL_ALREADY_PAID", 409, "บิลนี้ชำระครบแล้ว", "R-15"),
 ("BILL_HAS_DUE", 409, "ยังมียอดค้างชำระ", "ปิดบิลขณะ due > 0"),
 ("BILL_NOT_OPEN", 409, "บิลนี้ปิดหรือยกเลิกแล้ว", "แก้ไขบิลที่ไม่ใช่ open"),
 ("LINE_DISCOUNT_TOO_LARGE", 422, "ส่วนลดเกินราคาสินค้า", "R-15"),
 ("BILL_DISCOUNT_TOO_LARGE", 422, "ส่วนลดเกินยอดบิล", "R-15"),
 ("DISCOUNT_LIMIT_EXCEEDED", 403, "ส่วนลดเกิน 20% ต้องให้เจ้าของร้านอนุมัติ", "R-15"),
 ("REASON_REQUIRED", 422, "กรุณาระบุเหตุผล", "R-27"),
 ("PACKAGE_NOT_ACTIVE", 422, "แพ็กเกจนี้ใช้ไม่ได้แล้ว", "R-14"),
 ("PACKAGE_EXHAUSTED", 422, "แพ็กเกจนี้ใช้ครบแล้ว", "R-14"),
 ("PACKAGE_EXPIRED", 422, "แพ็กเกจหมดอายุแล้ว", "R-14"),
 ("PACKAGE_SERVICE_MISMATCH", 422, "แพ็กเกจนี้ใช้กับบริการนี้ไม่ได้", "R-14"),
 ("PACKAGE_SIZE_MISMATCH", 422, "แพ็กเกจนี้ใช้กับขนาดนี้ไม่ได้", "R-14"),
 ("PACKAGE_PET_MISMATCH", 422, "แพ็กเกจนี้เป็นของน้องตัวอื่น", "R-14"),
 ("UPLOAD_KIND_NOT_ALLOWED", 422, "ไม่รองรับไฟล์ประเภทนี้", "R-25"),
 ("UPLOAD_TYPE_NOT_ALLOWED", 422, "ไม่รองรับชนิดไฟล์นี้", "R-25"),
 ("UPLOAD_TOO_LARGE", 422, "ไฟล์ใหญ่เกินกำหนด", "R-25"),
 ("FILE_NOT_UPLOADED", 422, "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่", "commit ไฟล์ที่ไม่มีใน storage"),
 ("LINE_NOT_CONNECTED", 422, "ร้านยังไม่ได้เชื่อม LINE OA", "line_channel.status ≠ active"),
 ("LINE_API_ERROR", 502, "เชื่อมต่อ LINE ไม่สำเร็จ", "LINE API ตอบ error"),
 ("WEBHOOK_SIGNATURE_INVALID", 401, "invalid signature", "x-line-signature ไม่ตรง"),
 ("IMPORT_HAS_ERRORS", 422, "ไฟล์มีแถวที่ผิด กรุณาแก้แล้วอัปโหลดใหม่", "commit import ที่ error_rows > 0"),
 ("CRON_FORBIDDEN", 401, "forbidden", "header x-cron-secret ไม่ตรง"),
]

DTOS = {}
def dto(name, desc, fields):
    DTOS[name] = dict(desc=desc, fields=fields)

dto("StaffMe", "ข้อมูล session ของพนักงาน · `staff.email` เป็น `string | null` (staff ที่ใช้ LINE อย่างเดียว) · **Support mode** (session ของ platform admin, Q-0014): `staff.id` = platform_admin.id, `staff.displayName` = platform_admin.display_name, `staff.email` = platform_admin.email, `staff.role` = `owner`, `staff.isGroomer` = false, `staff.lineLinked` = false, `permissions` = ของ owner (การเขียนยังถูกกันด้วย SUPPORT_READ_ONLY), `supportMode` = true; organization/branch มาจาก session", [
 ("staff.id", "staff_user.id"), ("staff.displayName", "staff_user.display_name"), ("staff.email", "staff_user.email"),
 ("staff.role", "staff_user.role"), ("staff.isGroomer", "staff_user.is_groomer"), ("staff.lineLinked", "calc: staff_user.line_user_id is not null"),
 ("organization.id", "organization.id"), ("organization.name", "organization.name"), ("organization.status", "organization.status"),
 ("branch.id", "branch.id"), ("branch.name", "branch.name"), ("branch.bookingSlug", "branch.booking_slug"), ("branch.timezone", "branch.timezone"),
 ("branch.modules.grooming", "branch.module_grooming"), ("branch.modules.hotel", "branch.module_hotel"), ("branch.modules.daycare", "branch.module_daycare"),
 ("permissions[]", "calc: 08-permissions — รายการ permission key ของ role"), ("supportMode", "calc: session.support_access_log_id is not null"),
])
dto("BranchSettings", "ตั้งค่าสาขาทั้งหมด", [
 ("id", "branch.id"), ("name", "branch.name"), ("bookingSlug", "branch.booking_slug"), ("phone", "branch.phone"),
 ("addressLine", "branch.address_line"), ("subdistrict", "branch.subdistrict"), ("district", "branch.district"), ("province", "branch.province"),
 ("postalCode", "branch.postal_code"), ("latitude", "branch.latitude"), ("longitude", "branch.longitude"), ("logoUrl", "calc: signed URL ของ branch.logo_file_id"),
 ("facebookUrl", "branch.facebook_url"), ("instagramUrl", "branch.instagram_url"), ("receiptPrefix", "branch.receipt_prefix"),
 ("modules.grooming", "branch.module_grooming"), ("modules.hotel", "branch.module_hotel"), ("modules.daycare", "branch.module_daycare"),
 ("hours[].weekday", "branch_hours.weekday"), ("hours[].isClosed", "branch_hours.is_closed"), ("hours[].opensAt", "branch_hours.opens_at"), ("hours[].closesAt", "branch_hours.closes_at"),
 ("promptpay.type", "branch.promptpay_type"), ("promptpay.idMasked", "calc: branch.promptpay_id แสดง 3 ตัวท้าย เช่น ***-***-5678"), ("promptpay.accountName", "branch.promptpay_account_name"),
 ("policy", "dto:BranchPolicy"),
])
dto("BranchPolicy", "นโยบายสาขา", [
 ("defaultDepositType", "branch_policy.default_deposit_type"), ("defaultDepositValue", "branch_policy.default_deposit_value"),
 ("groomingFreeCancelHours", "branch_policy.grooming_free_cancel_hours"), ("hotelFreeCancelHours", "branch_policy.hotel_free_cancel_hours"),
 ("daycareFreeCancelHours", "branch_policy.daycare_free_cancel_hours"), ("lateCancelForfeitPercent", "branch_policy.late_cancel_forfeit_percent"),
 ("cancelRefundMode", "branch_policy.cancel_refund_mode"), ("bookingLeadMinutes", "branch_policy.booking_lead_minutes"),
 ("bookingHorizonDays", "branch_policy.booking_horizon_days"), ("rescheduleCutoffHours", "branch_policy.reschedule_cutoff_hours"),
 ("noShowGraceMinutes", "branch_policy.no_show_grace_minutes"), ("slotStepMinutes", "branch_policy.slot_step_minutes"),
 ("bufferMinutes", "branch_policy.buffer_minutes"), ("maxAppointmentsPerDay", "branch_policy.max_appointments_per_day"),
 ("maxAppointmentsPerGroomerDay", "branch_policy.max_appointments_per_groomer_day"), ("holdMinutes", "branch_policy.hold_minutes"),
 ("approvalTimeoutMinutes", "branch_policy.approval_timeout_minutes"), ("autoConfirmGrooming", "branch_policy.auto_confirm_grooming"),
 ("autoConfirmHotel", "branch_policy.auto_confirm_hotel"), ("autoConfirmDaycare", "branch_policy.auto_confirm_daycare"),
 ("requiredVaccinesDog[]", "branch_policy.required_vaccines_dog"), ("requiredVaccinesCat[]", "branch_policy.required_vaccines_cat"),
 ("enforceVaccinesGrooming", "branch_policy.enforce_vaccines_grooming"), ("rejectedBreeds[]", "branch_policy.rejected_breeds"),
 ("maxPetWeightGrams", "branch_policy.max_pet_weight_grams"), ("groomingConsentText", "branch_policy.grooming_consent_text"),
 ("boardingAgreementText", "branch_policy.boarding_agreement_text"), ("policyText", "branch_policy.policy_text"),
 ("reminder24hEnabled", "branch_policy.reminder_24h_enabled"), ("economyMode", "branch_policy.economy_mode"),
 ("nextGroomDefaultDays", "branch_policy.next_groom_default_days"), ("googleReviewUrl", "branch_policy.google_review_url"),
 ("reportCardRequiresReview", "branch_policy.report_card_requires_review"), ("dailySummaryTime", "branch_policy.daily_summary_time"),
])
dto("LineStatus", "สถานะ LINE OA ของสาขา + โควตา", [
 ("status", "line_channel.status"), ("botBasicId", "line_channel.bot_basic_id"), ("addFriendUrl", "calc: https://line.me/R/ti/p/{bot_basic_id}"),
 ("liffUrl", "calc: https://liff.line.me/{line_channel.liff_id}"), ("monthlyPushQuota", "line_channel.monthly_push_quota"),
 ("usedThisMonth", "calc: count notification channel=line_push status=sent month_key=เดือนนี้"), ("skippedThisMonth", "calc: count notification status=skipped month_key=เดือนนี้"),
 ("webhookVerifiedAt", "line_channel.webhook_verified_at"),
])
dto("StaffUserItem", "พนักงาน 1 คน", [
 ("id", "staff_user.id"), ("displayName", "staff_user.display_name"), ("email", "staff_user.email"), ("phone", "staff_user.phone"),
 ("role", "staff_user.role"), ("isGroomer", "staff_user.is_groomer"), ("status", "staff_user.status"), ("sortOrder", "staff_user.sort_order"),
 ("photoUrl", "calc: signed URL staff_user.photo_file_id"), ("lineLinked", "calc: staff_user.line_user_id is not null"), ("lastLoginAt", "staff_user.last_login_at"),
 ("workingHours[]", "[]dto:WorkingHours"),
])
dto("WorkingHours", "เวลาทำงาน 1 วัน", [
 ("weekday", "staff_working_hours.weekday"), ("startsAt", "staff_working_hours.starts_at"), ("endsAt", "staff_working_hours.ends_at"),
 ("breakStartsAt", "staff_working_hours.break_starts_at"), ("breakEndsAt", "staff_working_hours.break_ends_at"),
])
dto("CustomerListItem", "แถวในรายการลูกค้า/ผลค้นหา", [
 ("id", "customer.id"), ("firstName", "owner_profile.first_name"), ("lastName", "owner_profile.last_name"), ("nickname", "owner_profile.nickname"),
 ("phone", "owner_profile.phone_e164"), ("pets[].id", "pet.id"), ("pets[].name", "pet.name"), ("pets[].species", "pet.species"),
 ("reliabilityLevel", "calc: coalesce(customer.reliability_override, customer.reliability_level)"), ("blacklisted", "customer.blacklisted"),
 ("lastVisitAt", "customer.last_visit_at"), ("visitCount", "customer.visit_count"), ("creditBalanceSatang", "customer.credit_balance_satang"),
 ("lineLinked", "calc: มี line_identity ของ owner_profile"),
])
dto("CustomerDetail", "รายละเอียดลูกค้า", [
 ("id", "customer.id"), ("ownerProfileId", "owner_profile.id"), ("firstName", "owner_profile.first_name"), ("lastName", "owner_profile.last_name"),
 ("nickname", "owner_profile.nickname"), ("phone", "owner_profile.phone_e164"), ("email", "owner_profile.email"), ("birthDate", "owner_profile.birth_date"),
 ("addressLine", "owner_profile.address_line"), ("subdistrict", "owner_profile.subdistrict"), ("district", "owner_profile.district"),
 ("province", "owner_profile.province"), ("postalCode", "owner_profile.postal_code"), ("sourceChannel", "customer.source_channel"),
 ("referralNote", "customer.referral_note"), ("emergencyContactName", "customer.emergency_contact_name"), ("emergencyContactPhone", "customer.emergency_contact_phone"),
 ("internalNote", "customer.internal_note"), ("reliabilityLevel", "customer.reliability_level"), ("reliabilityOverride", "customer.reliability_override"),
 ("lateCancelCount12m", "customer.late_cancel_count_12m"), ("noShowCount12m", "customer.no_show_count_12m"),
 ("blacklisted", "customer.blacklisted"), ("blacklistReason", "customer.blacklist_reason"), ("depositExempt", "customer.deposit_exempt"),
 ("photoConsent", "customer.photo_consent"), ("visitCount", "customer.visit_count"), ("firstVisitAt", "customer.first_visit_at"),
 ("lastVisitAt", "customer.last_visit_at"), ("creditBalanceSatang", "customer.credit_balance_satang"),
 ("line.displayName", "line_identity.display_name"), ("line.pictureUrl", "line_identity.picture_url"), ("line.isFriend", "line_identity.is_friend"),
 ("pets[]", "[]dto:PetSummary"), ("activePackages[]", "[]dto:CustomerPackageItem"), ("upcomingBookings[]", "[]dto:BookingListItem"),
])
dto("PetSummary", "น้องแบบย่อ", [
 ("id", "pet.id"), ("name", "pet.name"), ("species", "pet.species"), ("breed", "pet.breed"), ("sex", "pet.sex"),
 ("coatType", "pet.coat_type"), ("latestWeightGrams", "pet.latest_weight_grams"), ("status", "pet.status"),
 ("photoUrl", "calc: signed URL pet.profile_file_id"), ("flags[]", "pet_temperament_flag.flag"),
 ("ageMonths", "calc: R-12 ageInMonths"), ("vaccineStatus", "calc: R-11 กับ required ของสาขา ณ วันนี้ → ok | warning | missing"),
])
dto("PetDetail", "น้องแบบเต็ม (ข้อมูลกลาง + ข้อมูลของร้าน)", [
 ("id", "pet.id"), ("ownerProfileId", "pet.owner_profile_id"), ("name", "pet.name"), ("species", "pet.species"), ("speciesOther", "pet.species_other"),
 ("breed", "pet.breed"), ("sex", "pet.sex"), ("birthDate", "pet.birth_date"), ("ageEstimateMonths", "pet.age_estimate_months"),
 ("neutered", "pet.neutered"), ("color", "pet.color"), ("microchipNo", "pet.microchip_no"), ("coatType", "pet.coat_type"),
 ("latestWeightGrams", "pet.latest_weight_grams"), ("status", "pet.status"), ("photoUrl", "calc: signed URL pet.profile_file_id"),
 ("shop.preferredStyle", "pet_shop_profile.preferred_style"), ("shop.bladeNo", "pet_shop_profile.blade_no"),
 ("shop.shampooOk", "pet_shop_profile.shampoo_ok"), ("shop.shampooAvoid", "pet_shop_profile.shampoo_avoid"),
 ("shop.allergies", "pet_shop_profile.allergies"), ("shop.conditions", "pet_shop_profile.conditions"), ("shop.medications", "pet_shop_profile.medications"),
 ("shop.vetClinicName", "pet_shop_profile.vet_clinic_name"), ("shop.vetClinicPhone", "pet_shop_profile.vet_clinic_phone"),
 ("shop.internalNote", "pet_shop_profile.internal_note"), ("shop.sharedNote", "pet_shop_profile.shared_note"),
 ("shop.favoriteStylePhotoUrl", "calc: signed URL ของ pet_shop_profile.favorite_style_photo_id"), ("shop.groomIntervalDays", "pet_shop_profile.groom_interval_days"),
 ("shop.lastGroomedAt", "pet_shop_profile.last_groomed_at"), ("flags[]", "[]dto:TemperamentFlagItem"), ("weights[]", "[]dto:WeightItem"),
 ("vaccinations[]", "[]dto:VaccinationItem"), ("nextGroomDue", "calc: R-17"),
])
dto("TemperamentFlagItem", "ป้ายนิสัย", [("flag", "pet_temperament_flag.flag"), ("note", "pet_temperament_flag.note")])
dto("WeightItem", "น้ำหนัก 1 ครั้ง", [("weightGrams", "pet_weight.weight_grams"), ("measuredAt", "pet_weight.measured_at"), ("source", "pet_weight.source")])
dto("VaccinationItem", "วัคซีน 1 รายการ", [
 ("id", "pet_vaccination.id"), ("vaccineCode", "pet_vaccination.vaccine_code"), ("vaccineName", "vaccine_type.name_th"),
 ("administeredOn", "pet_vaccination.administered_on"), ("expiresOn", "pet_vaccination.expires_on"), ("status", "pet_vaccination.status"),
 ("source", "pet_vaccination.source"), ("proofUrl", "calc: signed URL pet_vaccination.proof_file_id"), ("rejectReason", "pet_vaccination.reject_reason"),
])
dto("PhotoItem", "รูปน้อง", [
 ("id", "pet_photo.id"), ("kind", "pet_photo.kind"), ("url", "calc: signed URL file_object"), ("caption", "pet_photo.caption"),
 ("takenAt", "pet_photo.taken_at"), ("appointmentId", "pet_photo.appointment_id"), ("stayId", "pet_photo.stay_id"),
])
dto("SizeTierItem", "ขนาด", [("id", "size_tier.id"), ("species", "size_tier.species"), ("code", "size_tier.code"), ("labelTh", "size_tier.label_th"),
 ("minWeightGrams", "size_tier.min_weight_grams"), ("maxWeightGrams", "size_tier.max_weight_grams"), ("sortOrder", "size_tier.sort_order")])
dto("ServiceItem", "บริการ + ตารางราคา", [
 ("id", "service.id"), ("scope", "service.scope"), ("category", "service.category"), ("nameTh", "service.name_th"), ("description", "service.description"),
 ("photoUrl", "calc: signed URL service.photo_file_id"), ("speciesAllowed[]", "service.species_allowed"), ("isAddon", "service.is_addon"),
 ("addonPerDay", "service.addon_per_day"), ("onlineBookable", "service.online_bookable"), ("estCostSatang", "service.est_cost_satang"),
 ("sortOrder", "service.sort_order"), ("status", "service.status"),
 ("prices[].sizeTierId", "service_price.size_tier_id"), ("prices[].coatGroup", "service_price.coat_group"),
 ("prices[].priceSatang", "service_price.price_satang"), ("prices[].durationMinutes", "service_price.duration_minutes"),
 ("addonForServiceIds[]", "service_addon_link.base_service_id"), ("fromPriceSatang", "calc: min(service_price.price_satang)"),
])
dto("SurchargeTypeItem", "ค่าบริการเพิ่มที่ตั้งไว้", [("id", "surcharge_type.id"), ("nameTh", "surcharge_type.name_th"),
 ("defaultAmountSatang", "surcharge_type.default_amount_satang"), ("status", "surcharge_type.status")])
dto("RoomTypeItem", "ประเภทห้อง + ราคา", [
 ("id", "room_type.id"), ("nameTh", "room_type.name_th"), ("description", "room_type.description"), ("photoUrl", "calc: signed URL room_type.photo_file_id"),
 ("speciesAllowed[]", "room_type.species_allowed"), ("maxWeightGrams", "room_type.max_weight_grams"), ("minAgeMonths", "room_type.min_age_months"),
 ("allowInHeat", "room_type.allow_in_heat"), ("allowReactive", "room_type.allow_reactive"), ("amenities[]", "room_type.amenities"),
 ("includedText", "room_type.included_text"), ("onlineBookable", "room_type.online_bookable"), ("sortOrder", "room_type.sort_order"), ("status", "room_type.status"),
 ("rates[].sizeTierId", "room_rate.size_tier_id"), ("rates[].nightlyPriceSatang", "room_rate.nightly_price_satang"),
 ("unitCount", "calc: count room_unit active"),
])
dto("RoomUnitItem", "ห้อง", [("id", "room_unit.id"), ("roomTypeId", "room_unit.room_type_id"), ("code", "room_unit.code"), ("zone", "room_unit.zone"),
 ("status", "room_unit.status"), ("housekeeping", "room_unit.housekeeping"), ("sortOrder", "room_unit.sort_order")])
dto("DaycareSessionTypeItem", "รอบ Daycare + ราคา", [
 ("id", "daycare_session_type.id"), ("session", "daycare_session_type.session"), ("nameTh", "daycare_session_type.name_th"),
 ("startsAt", "daycare_session_type.starts_at"), ("endsAt", "daycare_session_type.ends_at"), ("capacity", "daycare_session_type.capacity"),
 ("status", "daycare_session_type.status"), ("rates[].sizeTierId", "daycare_rate.size_tier_id"), ("rates[].priceSatang", "daycare_rate.price_satang"),
])
dto("PackageTemplateItem", "แพ็กเกจที่ขาย", [
 ("id", "package_template.id"), ("nameTh", "package_template.name_th"), ("serviceId", "package_template.service_id"), ("serviceName", "service.name_th"),
 ("sizeTierId", "package_template.size_tier_id"), ("sessionsCount", "package_template.sessions_count"), ("priceSatang", "package_template.price_satang"),
 ("validityDays", "package_template.validity_days"), ("shareScope", "package_template.share_scope"), ("status", "package_template.status"),
 ("unitValueSatang", "calc: R-14"),
])
dto("CustomerPackageItem", "แพ็กเกจที่ลูกค้ามี", [
 ("id", "customer_package.id"), ("templateName", "package_template.name_th"), ("petId", "customer_package.pet_id"), ("petName", "pet.name"),
 ("sessionsTotal", "customer_package.sessions_total"), ("sessionsUsed", "customer_package.sessions_used"),
 ("sessionsLeft", "calc: sessions_total − sessions_used"), ("expiresAt", "customer_package.expires_at"), ("status", "customer_package.status"),
 ("redemptions[].redeemedAt", "package_redemption.redeemed_at"), ("redemptions[].petName", "pet.name"),
 ("redemptions[].performerName", "staff_user.display_name"), ("redemptions[].receiptNo", "bill.receipt_no"),
 ("redemptions[].reversedAt", "package_redemption.reversed_at"),
])
dto("CommissionRuleItem", "กติกาค่ามือ", [("id", "commission_rule.id"), ("serviceId", "commission_rule.service_id"), ("staffUserId", "commission_rule.staff_user_id"),
 ("type", "commission_rule.type"), ("value", "commission_rule.value")])
dto("SlotList", "ผล R-04", [("date", "calc: input"), ("reason", "calc: R-04"), ("slots[].startsAt", "calc: R-04"), ("slots[].endsAt", "calc: R-03"),
 ("slots[].groomerId", "calc: R-04"), ("slots[].groomerName", "staff_user.display_name"), ("slots[].stationId", "calc: R-04"),
 ("durationMinutes", "calc: R-03"), ("priceSatang", "calc: R-02/R-03")])
dto("HotelAvailability", "ผล R-28 ต่อประเภทห้อง", [("roomTypes[].roomTypeId", "room_type.id"), ("roomTypes[].nameTh", "room_type.name_th"),
 ("roomTypes[].availableUnits", "calc: R-28"), ("roomTypes[].nightlyPriceSatang", "calc: room_rate ตาม R-01 ของน้อง"), ("roomTypes[].eligible", "calc: R-12"),
 ("roomTypes[].ineligibleReasons[]", "calc: R-12"), ("nights", "calc: R-03")])
dto("DaycareAvailability", "ผล R-29", [("date", "calc: input"), ("sessions[].sessionTypeId", "daycare_session_type.id"), ("sessions[].session", "daycare_session_type.session"),
 ("sessions[].nameTh", "daycare_session_type.name_th"), ("sessions[].available", "calc: R-29"), ("sessions[].priceSatang", "calc: daycare_rate ตาม R-01")])
dto("Quote", "ใบเสนอราคา (R-03 + R-06)", [("groom[]", "calc: R-03"), ("stays[]", "calc: R-03"), ("daycareTotalSatang", "calc: R-03"),
 ("estimatedTotalSatang", "calc: R-03"), ("depositRequiredSatang", "calc: R-06"), ("depositReason", "calc: R-06"),
 ("requiresApproval", "calc: R-08"), ("policyText", "branch_policy.policy_text"), ("cancelSummary", "calc: ข้อความสรุปจาก branch_policy free_cancel_hours/forfeit")])
dto("BookingListItem", "แถวรายการใบจอง", [
 ("id", "booking.id"), ("bookingNo", "booking.booking_no"), ("status", "booking.status"), ("channel", "booking.channel"),
 ("customerId", "booking.customer_id"), ("customerName", "calc: owner_profile.first_name + nickname"), ("firstServiceAt", "booking.first_service_at"),
 ("modules[]", "calc: grooming/hotel/daycare ที่มีในใบจอง"), ("petNames[]", "pet.name"), ("estimatedTotalSatang", "booking.estimated_total_satang"),
 ("depositStatus", "booking.deposit_status"), ("depositRequiredSatang", "booking.deposit_required_satang"), ("holdExpiresAt", "booking.hold_expires_at"),
 ("approvalDueAt", "booking.approval_due_at"), ("createdAt", "booking.created_at"),
])
dto("AffectedServiceItem", "รายการบริการที่ได้รับผลจากวันปิด/วันลา (closures.create, timeOff.create — Q-0028) · 1 แถวต่อ groom_appointment / stay / daycare_visit", [
 ("module", "calc: service_scope ของรายการ — grooming (groom_appointment) | hotel (stay) | daycare (daycare_visit)"), ("bookingId", "booking.id"),
 ("bookingNo", "booking.booking_no"), ("itemId", "calc: groom_appointment.id | stay.id | daycare_visit.id ตาม module"), ("petName", "pet.name"),
 ("customerName", "calc: owner_profile.first_name + nickname"), ("startsAt", "calc: groom_appointment.starts_at (instant) เมื่อ module = grooming; อื่น ๆ = null"),
 ("date", "calc: วันท้องถิ่นของสาขา — วันของ groom_appointment.starts_at | stay.check_in_date | daycare_visit.visit_date"),
])
dto("BookingDetail", "ใบจองแบบเต็ม", [
 ("id", "booking.id"), ("bookingNo", "booking.booking_no"), ("status", "booking.status"), ("channel", "booking.channel"),
 ("customer", "dto:CustomerListItem"), ("createdByType", "booking.created_by_type"), ("createdAt", "booking.created_at"),
 ("holdExpiresAt", "booking.hold_expires_at"), ("approvalDueAt", "booking.approval_due_at"),
 ("estimatedTotalSatang", "booking.estimated_total_satang"), ("depositRequiredSatang", "booking.deposit_required_satang"),
 ("depositStatus", "booking.deposit_status"), ("depositVerifiedSatang", "booking.deposit_verified_satang"),
 ("policySnapshot", "booking.policy_snapshot"), ("customerNote", "booking.customer_note"), ("rescheduleCount", "booking.reschedule_count"),
 ("confirmedAt", "booking.confirmed_at"), ("cancelledAt", "booking.cancelled_at"), ("cancelledByType", "booking.cancelled_by_type"),
 ("cancelReason", "booking.cancel_reason"), ("firstServiceAt", "booking.first_service_at"), ("billId", "booking.bill_id"),
 ("groom[]", "[]dto:AppointmentCard"), ("stays[]", "[]dto:StayCard"), ("daycare[]", "[]dto:DaycareVisitItem"),
 ("slips[]", "[]dto:SlipItem"), ("payment", "dto:PaymentInstruction"), ("events[]", "[]dto:BookingEventItem"),
])
dto("BookingEventItem", "ประวัติสถานะ", [("entityType", "booking_event.entity_type"), ("fromStatus", "booking_event.from_status"),
 ("toStatus", "booking_event.to_status"), ("actorType", "booking_event.actor_type"), ("reason", "booking_event.reason"), ("at", "booking_event.created_at")])
dto("PaymentInstruction", "ข้อมูลให้ลูกค้าโอน (มัดจำ/ยอดค้าง)", [
 ("amountSatang", "calc: deposit_required − deposit_verified หรือ bill due"), ("promptpayPayload", "calc: R-30"),
 ("accountName", "branch.promptpay_account_name"), ("promptpayIdMasked", "calc: branch.promptpay_id 3 ตัวท้าย"), ("expiresAt", "booking.hold_expires_at"),
])
dto("AppointmentCard", "นัดกรูม (การ์ดในปฏิทิน/ใบจอง)", [
 ("id", "groom_appointment.id"), ("bookingId", "groom_appointment.booking_id"), ("bookingNo", "booking.booking_no"),
 ("status", "groom_appointment.status"), ("startsAt", "groom_appointment.starts_at"), ("endsAt", "groom_appointment.ends_at"),
 ("blockedUntil", "groom_appointment.blocked_until"), ("groomerId", "groom_appointment.groomer_id"), ("groomerName", "staff_user.display_name"),
 ("groomerPreference", "groom_appointment.groomer_preference"), ("stationId", "groom_appointment.station_id"), ("stationName", "groom_station.name"),
 ("pet", "dto:PetSummary"), ("customerName", "owner_profile.first_name"), ("customerPhone", "owner_profile.phone_e164"),
 ("items[].serviceId", "groom_appointment_item.service_id"), ("items[].name", "groom_appointment_item.name_snapshot"),
 ("items[].isAddon", "groom_appointment_item.is_addon"), ("items[].priceSatang", "groom_appointment_item.price_satang"),
 ("items[].durationMinutes", "groom_appointment_item.duration_minutes"), ("items[].customerPackageId", "groom_appointment_item.customer_package_id"),
 ("surcharges[].id", "appointment_surcharge.id"), ("surcharges[].name", "appointment_surcharge.name"),
 ("surcharges[].amountSatang", "appointment_surcharge.amount_satang"), ("surcharges[].reason", "appointment_surcharge.reason"),
 ("servicesTotalSatang", "groom_appointment.services_total_satang"), ("surchargeTotalSatang", "groom_appointment.surcharge_total_satang"),
 ("depositStatus", "booking.deposit_status"), ("reliabilityLevel", "customer.reliability_level"), ("fromStayId", "groom_appointment.from_stay_id"),
 ("checkedInAt", "groom_appointment.checked_in_at"), ("startedAt", "groom_appointment.started_at"), ("doneAt", "groom_appointment.done_at"),
 ("pickedUpAt", "groom_appointment.picked_up_at"), ("staffNote", "groom_appointment.staff_note"),
 ("customerId", "booking.customer_id"), ("sizeTierCode", "calc: size_tier.code ของ groom_appointment.size_tier_id (null = ไม่มี)"),
 ("billId", "calc: bill.id ล่าสุดที่ผูกกับ booking (ไม่นับ void) หรือ null"), ("billStatus", "calc: bill.status ของ billId หรือ null"),
])
dto("JobCard", "Job card สำหรับช่าง", [
 ("appointment", "dto:AppointmentCard"), ("preferredStyle", "pet_shop_profile.preferred_style"), ("bladeNo", "pet_shop_profile.blade_no"),
 ("shampooOk", "pet_shop_profile.shampoo_ok"), ("shampooAvoid", "pet_shop_profile.shampoo_avoid"), ("allergies", "pet_shop_profile.allergies"),
 ("conditions", "pet_shop_profile.conditions"), ("internalNote", "pet_shop_profile.internal_note"),
 ("favoriteStylePhotoUrl", "calc: signed URL pet_shop_profile.favorite_style_photo_id"), ("flags[]", "[]dto:TemperamentFlagItem"),
 ("weightGramsCheckin", "groom_appointment.weight_grams_checkin"), ("conditionFlags[]", "groom_appointment.condition_flags"),
 ("conditionNote", "groom_appointment.condition_note"), ("customerNote", "booking.customer_note"), ("lastVisit.photos[]", "[]dto:PhotoItem"),
 ("lastVisit.staffNote", "groom_appointment.staff_note"), ("photos[]", "[]dto:PhotoItem"), ("consentSigned", "calc: มี consent_document ของนัดนี้"),
])
dto("CalendarDay", "ข้อมูลปฏิทินวันเดียว", [
 ("date", "calc: input"), ("opensAt", "branch_hours.opens_at"), ("closesAt", "branch_hours.closes_at"),
 ("groomers[].id", "staff_user.id"), ("groomers[].displayName", "staff_user.display_name"), ("groomers[].workingHours", "dto:WorkingHours"),
 ("groomers[].timeOff[]", "staff_time_off.starts_at"), ("stations[].id", "groom_station.id"), ("stations[].name", "groom_station.name"),
 ("closures[]", "branch_closure.starts_at"), ("appointments[]", "[]dto:AppointmentCard"),
 ("hotel.arrivals", "calc: count stay check_in_date = date"), ("hotel.departures", "calc: count stay check_out_date = date"),
 ("hotel.inHouse", "calc: count stay checked_in"), ("daycare.count", "calc: count daycare_visit visit_date = date"),
 ("pendingApprovals", "calc: count booking awaiting_approval"), ("pendingSlips", "calc: count payment_slip submitted"),
])
dto("StayCard", "การพัก (การ์ด)", [
 ("id", "stay.id"), ("bookingId", "stay.booking_id"), ("bookingNo", "booking.booking_no"), ("status", "stay.status"), ("pet", "dto:PetSummary"),
 ("customerName", "owner_profile.first_name"), ("roomTypeName", "room_type.name_th"), ("roomUnitId", "stay.room_unit_id"), ("roomCode", "room_unit.code"),
 ("checkInDate", "stay.check_in_date"), ("checkOutDate", "stay.check_out_date"), ("expectedCheckInTime", "stay.expected_check_in_time"),
 ("expectedCheckOutTime", "stay.expected_check_out_time"), ("nights", "stay.nights"), ("roomTotalSatang", "stay.room_total_satang"),
 ("inHeat", "stay.in_heat"), ("bundleAppointmentId", "stay.bundle_appointment_id"), ("intakeCompleted", "calc: stay_intake.completed_at is not null"),
 ("agreementSigned", "calc: มี consent_document kind boarding_agreement"), ("vaccineGate", "calc: R-11"),
 ("addonNames[]", "calc: stay_addon.name_snapshot ของ stay"), ("bundleStatus", "calc: groom_appointment.status ของ bundleAppointmentId หรือ null"),
 ("pendingTaskCount", "calc: care_task ของ stay ที่ status pending และ due_at <= now"),
])
dto("StayDetail", "การพักแบบเต็ม", [
 ("stay", "dto:StayCard"), ("weightGramsIn", "stay.weight_grams_in"), ("weightGramsOut", "stay.weight_grams_out"),
 ("vaccineOverrideReason", "stay.vaccine_override_reason"), ("checkedInAt", "stay.checked_in_at"), ("checkedOutAt", "stay.checked_out_at"),
 ("intake.foodBrand", "stay_intake.food_brand"), ("intake.foodAmount", "stay_intake.food_amount"), ("intake.feedingTimes[]", "stay_intake.feeding_times"),
 ("intake.foodProvidedByOwner", "stay_intake.food_provided_by_owner"), ("intake.walksPerDay", "stay_intake.walks_per_day"),
 ("intake.conditionNote", "stay_intake.condition_note"), ("intake.conditionPhotoUrls[]", "calc: signed URL stay_intake.condition_photo_ids"),
 ("intake.emergencyContactName", "stay_intake.emergency_contact_name"), ("intake.emergencyContactPhone", "stay_intake.emergency_contact_phone"),
 ("intake.vetClinicName", "stay_intake.vet_clinic_name"), ("intake.vetClinicPhone", "stay_intake.vet_clinic_phone"),
 ("intake.completedAt", "stay_intake.completed_at"),
 ("medications[].id", "stay_medication.id"), ("medications[].name", "stay_medication.name"), ("medications[].dose", "stay_medication.dose"),
 ("medications[].times[]", "stay_medication.times"), ("medications[].instructions", "stay_medication.instructions"),
 ("belongings[].id", "stay_belonging.id"), ("belongings[].item", "stay_belonging.item"), ("belongings[].quantity", "stay_belonging.quantity"),
 ("belongings[].photoUrl", "calc: signed URL stay_belonging.photo_file_id"), ("belongings[].returnedAt", "stay_belonging.returned_at"),
 ("addons[].id", "stay_addon.id"), ("addons[].name", "stay_addon.name_snapshot"), ("addons[].quantity", "stay_addon.quantity"),
 ("addons[].totalSatang", "stay_addon.total_satang"), ("tasks[]", "[]dto:CareTaskItem"), ("updates[]", "[]dto:PhotoItem"),
 ("agreement.signerName", "consent_document.signer_name"), ("agreement.signedAt", "consent_document.signed_at"),
 ("agreement.emergencyVetLimitSatang", "consent_document.emergency_vet_limit_satang"),
])
dto("RoomMap", "แผนผังห้องรายวัน", [
 ("date", "calc: input"), ("units[].id", "room_unit.id"), ("units[].code", "room_unit.code"), ("units[].zone", "room_unit.zone"),
 ("units[].roomTypeName", "room_type.name_th"), ("units[].status", "room_unit.status"), ("units[].housekeeping", "room_unit.housekeeping"),
 ("units[].occupant", "dto:StayCard"), ("units[].arrivingToday", "calc: stay check_in_date = date"), ("units[].departingToday", "calc: stay check_out_date = date"),
 ("units[].nextArrivalDate", "calc: min stay.check_in_date > date"),
])
dto("CareTaskItem", "งานดูแล", [
 ("id", "care_task.id"), ("stayId", "care_task.stay_id"), ("petName", "pet.name"), ("roomCode", "room_unit.code"), ("taskType", "care_task.task_type"),
 ("title", "care_task.title"), ("dueAt", "care_task.due_at"), ("status", "care_task.status"), ("doneAt", "care_task.done_at"),
 ("doneByName", "staff_user.display_name"), ("note", "care_task.note"), ("photoUrl", "calc: signed URL care_task.photo_file_id"),
 ("medication", "calc: stay_medication.name + dose"), ("overdue", "calc: status pending และ now > due_at + 30 นาที"),
])
dto("DaycareVisitItem", "Daycare 1 รายการ", [
 ("id", "daycare_visit.id"), ("bookingId", "daycare_visit.booking_id"), ("pet", "dto:PetSummary"), ("sessionName", "daycare_session_type.name_th"),
 ("visitDate", "daycare_visit.visit_date"), ("priceSatang", "daycare_visit.price_satang"), ("status", "daycare_visit.status"),
 ("checkedInAt", "daycare_visit.checked_in_at"), ("checkedOutAt", "daycare_visit.checked_out_at"),
])
dto("SlipItem", "สลิป", [
 ("id", "payment_slip.id"), ("bookingId", "payment_slip.booking_id"), ("bookingNo", "booking.booking_no"), ("billId", "payment_slip.bill_id"),
 ("customerName", "owner_profile.first_name"), ("imageUrl", "calc: signed URL payment_slip.file_id"),
 ("amountExpectedSatang", "payment_slip.amount_expected_satang"), ("transRef", "payment_slip.trans_ref"),
 ("isDuplicate", "calc: payment_slip.duplicate_of_slip_id is not null"), ("duplicateOfSlipId", "payment_slip.duplicate_of_slip_id"),
 ("status", "payment_slip.status"), ("uploadedAt", "payment_slip.created_at"), ("reviewedAt", "payment_slip.reviewed_at"),
 ("rejectReason", "payment_slip.reject_reason"), ("holdExpiresAt", "booking.hold_expires_at"),
 ("needsApproval", "calc: booking.approval_due_at is not null"),
])
dto("BillListItem", "แถวบิล", [
 ("id", "bill.id"), ("receiptNo", "bill.receipt_no"), ("status", "bill.status"), ("customerName", "owner_profile.first_name"),
 ("totalSatang", "bill.total_satang"), ("paidSatang", "bill.paid_satang"), ("openedAt", "bill.opened_at"), ("closedAt", "bill.closed_at"),
 ("methods[]", "calc: distinct payment.method ที่ posted"),
])
dto("BillDetail", "บิลแบบเต็ม", [
 ("id", "bill.id"), ("receiptNo", "bill.receipt_no"), ("status", "bill.status"), ("customer", "dto:CustomerListItem"),
 ("bookingIds[]", "calc: booking ที่ bill_id = bill.id"), ("subtotalSatang", "bill.subtotal_satang"), ("billDiscountSatang", "bill.bill_discount_satang"),
 ("billDiscountReason", "bill.bill_discount_reason"), ("totalSatang", "bill.total_satang"), ("paidSatang", "bill.paid_satang"),
 ("dueSatang", "calc: total − paid"), ("changeSatang", "bill.change_satang"), ("note", "bill.note"),
 ("openedByName", "staff_user.display_name"), ("openedAt", "bill.opened_at"), ("closedAt", "bill.closed_at"), ("voidedAt", "bill.voided_at"),
 ("voidReason", "bill.void_reason"),
 ("lines[].id", "bill_line.id"), ("lines[].lineType", "bill_line.line_type"), ("lines[].description", "bill_line.description"),
 ("lines[].petName", "pet.name"), ("lines[].quantity", "bill_line.quantity"), ("lines[].unitPriceSatang", "bill_line.unit_price_satang"),
 ("lines[].lineDiscountSatang", "bill_line.line_discount_satang"), ("lines[].lineDiscountReason", "bill_line.line_discount_reason"),
 ("lines[].lineTotalSatang", "bill_line.line_total_satang"), ("lines[].performerId", "bill_line.performer_id"),
 ("payments[].id", "payment.id"), ("payments[].method", "payment.method"), ("payments[].amountSatang", "payment.amount_satang"),
 ("payments[].tenderedSatang", "payment.tendered_satang"), ("payments[].reference", "payment.reference"), ("payments[].status", "payment.status"),
 ("payments[].receivedAt", "payment.received_at"), ("customerCreditSatang", "customer.credit_balance_satang"),
 ("availablePackages[]", "[]dto:CustomerPackageItem"), ("depositAvailableSatang", "calc: Σ booking.deposit_verified_satang ที่ deposit_status = verified (ยังไม่ applied)"),
])
dto("Receipt", "ข้อมูลใบเสร็จ (พิมพ์/ส่ง LINE)", [
 ("shopName", "branch.name"), ("shopAddress", "calc: branch address"), ("shopPhone", "branch.phone"), ("logoUrl", "calc: signed URL branch.logo_file_id"),
 ("receiptNo", "bill.receipt_no"), ("closedAt", "bill.closed_at"), ("customerName", "calc: owner_profile ชื่อ-นามสกุล"),
 ("lines[].description", "bill_line.description"), ("lines[].quantity", "bill_line.quantity"), ("lines[].unitPriceSatang", "bill_line.unit_price_satang"),
 ("lines[].lineDiscountSatang", "bill_line.line_discount_satang"), ("lines[].lineTotalSatang", "bill_line.line_total_satang"),
 ("subtotalSatang", "bill.subtotal_satang"), ("billDiscountSatang", "bill.bill_discount_satang"), ("totalSatang", "bill.total_satang"),
 ("payments[].method", "payment.method"), ("payments[].amountSatang", "payment.amount_satang"), ("changeSatang", "bill.change_satang"),
 ("cashierName", "staff_user.display_name"), ("status", "bill.status"), ("packagesRemaining[]", "[]dto:CustomerPackageItem"),
])
dto("ReportCardDetail", "Report card / Stay report", [
 ("id", "report_card.id"), ("kind", "report_card.kind"), ("status", "report_card.status"), ("pet", "dto:PetSummary"),
 ("appointmentId", "report_card.appointment_id"), ("stayId", "report_card.stay_id"), ("skin", "report_card.skin"), ("ears", "report_card.ears"),
 ("nails", "report_card.nails"), ("teeth", "report_card.teeth"), ("parasites", "report_card.parasites"), ("cooperation", "report_card.cooperation"),
 ("staffNote", "report_card.staff_note"), ("recommendation", "report_card.recommendation"), ("groomerName", "staff_user.display_name"),
 ("beforePhotos[]", "[]dto:PhotoItem"), ("afterPhotos[]", "[]dto:PhotoItem"), ("services[]", "groom_appointment_item.name_snapshot"),
 ("nextGroomDue", "calc: R-17"), ("sentAt", "report_card.sent_at"), ("customerRating", "report_card.customer_rating"),
 ("customerFeedback", "report_card.customer_feedback"), ("googleReviewUrl", "branch_policy.google_review_url"),
])
dto("DashboardToday", "Dashboard วันนี้", [
 ("date", "calc: วันนี้ตาม branch.timezone"), ("groom.total", "calc: count groom_appointment วันนี้ ไม่รวม cancelled"),
 ("groom.byStatus", "calc: count group by groom_appointment.status"), ("hotel.arrivals", "calc: stay check_in_date = วันนี้"),
 ("hotel.departures", "calc: stay check_out_date = วันนี้"), ("hotel.inHouse", "calc: stay checked_in"), ("hotel.occupancyPercent", "calc: inHouse / room_unit active"),
 ("daycare.count", "calc: daycare_visit วันนี้"), ("sales.paidTotalSatang", "calc: Σ payment posted วันนี้ (ไม่รวม method deposit/credit)"),
 ("sales.billsClosed", "calc: count bill paid วันนี้"), ("todo.pendingSlips", "calc: payment_slip submitted"),
 ("todo.pendingApprovals", "calc: booking awaiting_approval"), ("todo.overdueCareTasks", "calc: care_task overdue"),
 ("todo.reportCardsToReview", "calc: report_card pending_review"), ("todo.unsentMessages", "calc: notification skipped วันนี้"),
 ("todo.pickupsWithoutBill", "calc: groom_appointment picked_up วันนี้ ที่ booking.bill_id null"), ("todo.linkRequests", "calc: customer_link_request pending"),
])
dto("InvitePreview", "ข้อมูลคำเชิญก่อนรับ (Q-0044)", [("orgName", "organization.name"), ("role", "staff_user.role"), ("hasEmail", "calc: staff_user.email is not null (record ของคำเชิญ)")])
dto("SalesReport", "รายงานยอดขาย (Q-0085): บิล paid ตามวันท้องถิ่นของ closed_at, void ไม่นับ · groupBy service/groomer กระจายส่วนลดท้ายบิลลงบรรทัดแบบ R-13 ข้อ 1 · groomer: บรรทัดไม่มีช่างรวมเป็นแถว key = null · method: 1 แถวต่อวิธีจ่าย (net = Σ payment posted, gross/discount = 0)", [("from", "calc: input"), ("to", "calc: input"), ("rows[].key", "calc: วัน (YYYY-MM-DD) / ชื่อบริการหรือสินค้า / ชื่อช่าง (null = ไม่ระบุช่าง) / payment.method ตาม groupBy"),
 ("rows[].billCount", "calc: จำนวนบิลที่มีบรรทัดในแถวนี้"), ("rows[].grossSatang", "calc: Σ bill_line.quantity × unit_price_satang"), ("rows[].discountSatang", "calc: Σ line_discount_satang + ส่วนลดท้ายบิล (กระจายตามแถว)"),
 ("rows[].netSatang", "calc: gross − discount (รวมทุกแถว = Σ bill.total_satang)"), ("totals", "calc: {billCount, grossSatang, discountSatang, netSatang} ของทั้งช่วง"), ("payments[].method", "payment.method"), ("payments[].amountSatang", "calc: Σ payment.amount_satang posted ของบิลในช่วง (รวม deposit/credit)")])
dto("CommissionReport", "รายงานค่ามือ · แบบบัญชี (Q-0030): รายการที่ earned_at อยู่ในช่วง from..to (วันท้องถิ่นของสาขา) นับ +1 งาน/+base/+amount; รายการ status reversed ที่ reversed_at อยู่ในช่วง นับ −1/−base/−amount (เกิดและยกเลิกในช่วงเดียวกัน = 0; void ทีหลังติดลบในช่วงที่ void) · ไม่มีรายการ → rows = []", [("from", "calc: input"), ("to", "calc: input"), ("rows[].staffUserId", "commission_entry.staff_user_id"),
 ("rows[].staffName", "staff_user.display_name"), ("rows[].jobs", "calc: count earned_at ในช่วง − count reversed_at ในช่วง"), ("rows[].baseSatang", "calc: Σ commission_entry.base_satang (earned_at ในช่วง) − Σ (reversed_at ในช่วง)"),
 ("rows[].amountSatang", "calc: Σ commission_entry.amount_satang (earned_at ในช่วง) − Σ (reversed_at ในช่วง)"), ("rows[].entries[].id", "commission_entry.id"), ("rows[].entries[].at", "calc: earned_at (บวก) หรือ reversed_at (ลบ)"), ("rows[].entries[].sign", "calc: 1 | -1"), ("rows[].entries[].receiptNo", "bill.receipt_no"), ("rows[].entries[].serviceName", "calc: bill_line.description"), ("rows[].entries[].baseSatang", "commission_entry.base_satang"), ("rows[].entries[].ruleLabel", "calc: กติกา percent x% / fixed ฿ (null = ไม่มีกติกา)"), ("rows[].entries[].amountSatang", "commission_entry.amount_satang")])
dto("OccupancyReport", "รายงาน occupancy", [("from", "calc: input"), ("to", "calc: input"), ("days[].date", "calc"), ("days[].occupiedUnits", "calc: stay checked_in/checked_out ครอบคืนนั้น"),
 ("days[].totalUnits", "calc: room_unit active"), ("days[].percent", "calc"), ("byRoomType[]", "calc")])
dto("SkippedMessageItem", "ข้อความที่ไม่ได้ส่ง (ให้ร้านส่งเอง)", [("id", "notification.id"), ("templateKey", "notification.template_key"),
 ("recipientName", "calc: owner_profile.first_name"), ("skipReason", "notification.skip_reason"), ("text", "calc: render template จาก notification.payload"),
 ("createdAt", "notification.created_at")])
dto("AuditLogItem", "บันทึก audit", [("id", "audit_log.id"), ("action", "audit_log.action"), ("actorType", "audit_log.actor_type"),
 ("actorName", "calc: staff_user.display_name / platform_admin.display_name"), ("entityType", "audit_log.entity_type"), ("entityId", "audit_log.entity_id"),
 ("before", "audit_log.before"), ("after", "audit_log.after"), ("reason", "audit_log.reason"), ("at", "audit_log.created_at"),
 ("viaSupport", "calc: audit_log.support_access_log_id is not null")])
dto("ImportJobItem", "งานนำเข้า", [("id", "import_job.id"), ("kind", "import_job.kind"), ("status", "import_job.status"), ("totalRows", "import_job.total_rows"),
 ("validRows", "import_job.valid_rows"), ("errorRows", "import_job.error_rows"), ("errors[]", "import_job.errors"), ("committedAt", "import_job.committed_at")])
dto("LinkRequestItem", "คำขอจับคู่บัญชี LINE", [("id", "customer_link_request.id"), ("lineDisplayName", "line_identity.display_name"),
 ("linePictureUrl", "line_identity.picture_url"), ("phoneEntered", "customer_link_request.phone_entered"),
 ("candidate", "dto:CustomerListItem"), ("status", "customer_link_request.status"), ("createdAt", "customer_link_request.created_at")])
dto("UploadTicket", "ตั๋วอัปโหลด", [("fileId", "file_object.id"), ("uploadUrl", "calc: presigned PUT URL (5 นาที)"), ("headers", "calc: Content-Type ที่ต้องส่ง"),
 ("storageKey", "file_object.storage_key")])
# ---- LIFF / customer
dto("LiffSession", "ผลเปิด LIFF", [("registered", "calc: มี customer ของ owner_profile ใน org นี้"), ("linkPending", "calc: มี customer_link_request pending"),
 ("profile.displayName", "line_identity.display_name"), ("profile.pictureUrl", "line_identity.picture_url"), ("customerId", "customer.id"),
 ("legalVersions.privacy", "calc: เวอร์ชันล่าสุดของ legal_doc privacy_notice"), ("legalVersions.terms", "calc: เวอร์ชันล่าสุด terms_of_service"),
 ("needsConsent", "calc: ยังไม่ยอมรับเวอร์ชันล่าสุด")])
dto("ShopPublic", "ข้อมูลร้านสาธารณะ", [("name", "branch.name"), ("logoUrl", "calc: signed URL branch.logo_file_id"), ("phone", "branch.phone"),
 ("address", "calc: branch address"), ("latitude", "branch.latitude"), ("longitude", "branch.longitude"), ("hours[]", "branch_hours.opens_at"),
 ("modules.grooming", "branch.module_grooming"), ("modules.hotel", "branch.module_hotel"), ("modules.daycare", "branch.module_daycare"),
 ("policyText", "branch_policy.policy_text"), ("services[]", "[]dto:ServiceItem"), ("roomTypes[]", "[]dto:RoomTypeItem"),
 ("addFriendUrl", "calc: line_channel.bot_basic_id"), ("liffUrl", "calc: line_channel.liff_id")])
dto("MyProfile", "โปรไฟล์ลูกค้า (LIFF)", [("firstName", "owner_profile.first_name"), ("lastName", "owner_profile.last_name"),
 ("nickname", "owner_profile.nickname"), ("phone", "owner_profile.phone_e164"), ("email", "owner_profile.email"),
 ("photoConsent", "customer.photo_consent"), ("creditBalanceSatang", "customer.credit_balance_satang")])
dto("MyPet", "น้องของฉัน (LIFF) — ไม่มี internal_note", [("id", "pet.id"), ("name", "pet.name"), ("species", "pet.species"), ("breed", "pet.breed"),
 ("sex", "pet.sex"), ("birthDate", "pet.birth_date"), ("neutered", "pet.neutered"), ("coatType", "pet.coat_type"),
 ("latestWeightGrams", "pet.latest_weight_grams"), ("photoUrl", "calc: signed URL pet.profile_file_id"), ("sharedNote", "pet_shop_profile.shared_note"),
 ("vaccinations[]", "[]dto:VaccinationItem"), ("photos[]", "[]dto:PhotoItem"), ("nextGroomDue", "calc: R-17")])
dto("MyBookingItem", "นัดของฉัน (LIFF)", [("id", "booking.id"), ("bookingNo", "booking.booking_no"), ("status", "booking.status"),
 ("firstServiceAt", "booking.first_service_at"), ("petNames[]", "pet.name"), ("summary", "calc: ชื่อบริการ/ประเภทห้อง"),
 ("depositStatus", "booking.deposit_status"), ("estimatedTotalSatang", "booking.estimated_total_satang"),
 ("canCancel", "calc: R-21"), ("canReschedule", "calc: R-21")])
dto("MyBookingDetail", "รายละเอียดนัด (LIFF)", [("booking", "dto:MyBookingItem"), ("groom[].startsAt", "groom_appointment.starts_at"),
 ("groom[].petName", "pet.name"), ("groom[].groomerName", "staff_user.display_name"), ("groom[].services[]", "groom_appointment_item.name_snapshot"),
 ("stays[].checkInDate", "stay.check_in_date"), ("stays[].checkOutDate", "stay.check_out_date"), ("stays[].roomTypeName", "room_type.name_th"),
 ("daycare[].visitDate", "daycare_visit.visit_date"), ("daycare[].sessionName", "daycare_session_type.name_th"),
 ("payment", "dto:PaymentInstruction"), ("policySnapshot", "booking.policy_snapshot"), ("cancelPreview", "calc: R-07"),
 ("rescheduleBlockedReason", "calc: R-21"), ("shopPhone", "branch.phone"), ("mapUrl", "calc: Google Maps URL จาก branch.latitude/longitude"),
 ("icsUrl", "calc: /api/v1/liff/{slug}/bookings/{id}/calendar.ics")])
dto("StayUpdates", "หน้าอัปเดตน้องระหว่างพัก (LIFF)", [("stayId", "stay.id"), ("petName", "pet.name"), ("checkInDate", "stay.check_in_date"),
 ("checkOutDate", "stay.check_out_date"), ("updates[]", "[]dto:PhotoItem"), ("doneTasks[].title", "care_task.title"),
 ("doneTasks[].doneAt", "care_task.done_at"), ("doneTasks[].note", "care_task.note")])
# ---- admin
dto("OrgListItem", "ร้านในระบบ · ownerEmail เป็น string | null: เลือก staff_user ที่ role = owner เรียง created_at ASC แล้ว id ASC และใช้ email ของแถวแรก · lineStatus เป็น enum:line_channel_status | null: ไม่มี line_channel ของสาขา → null · lastActivityAt เป็น ISO instant | null: max booking.created_at ของร้าน; ไม่มี booking → null · สาขาเดียวต่อธุรกิจตาม MVP", [("id", "organization.id"), ("name", "organization.name"), ("slug", "organization.slug"), ("status", "organization.status"),
 ("branchName", "branch.name"), ("bookingSlug", "branch.booking_slug"), ("ownerEmail", "staff_user.email"), ("lineStatus", "line_channel.status"),
 ("createdAt", "organization.created_at"), ("lastActivityAt", "calc: max booking.created_at")])
dto("FeedbackItem", "แจ้งปัญหา", [("id", "feedback_report.id"), ("orgName", "organization.name"), ("staffName", "staff_user.display_name"),
 ("pageUrl", "feedback_report.page_url"), ("message", "feedback_report.message"), ("screenshotUrl", "calc: signed URL feedback_report.screenshot_file_id"),
 ("appVersion", "feedback_report.app_version"), ("status", "feedback_report.status"), ("createdAt", "feedback_report.created_at")])
dto("DataRequestItem", "คำขอ PDPA", [("id", "data_request.id"), ("orgName", "organization.name"), ("ownerProfileId", "data_request.owner_profile_id"),
 ("type", "data_request.type"), ("status", "data_request.status"), ("note", "data_request.note"), ("createdAt", "data_request.created_at")])
dto("PilotAnalytics", "ตัวชี้วัดนำร่อง", [("orgs[].orgId", "organization.id"), ("orgs[].activeDays7", "calc: จำนวนวันที่มี booking/bill ใน 7 วัน"),
 ("orgs[].bookingsByChannel", "calc: count booking group by channel"), ("orgs[].onlineShare", "calc: line_liff+booking_link / ทั้งหมด"),
 ("orgs[].noShowRate", "calc: no_show / นัดที่ถึงเวลา"), ("orgs[].pushUsed", "calc: notification line_push sent"), ("orgs[].reportCardsSent", "calc"),
 ("orgs[].billsClosed", "calc")])

# Q-0038: exact editable rows returned by the annual holiday loader.
dto("PublicHoliday", "วันหยุดราชการ", [("date", "public_holiday.holiday_date"), ("nameTh", "public_holiday.name_th")])
