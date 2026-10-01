# -*- coding: utf-8 -*-
"""REST endpoint catalog. Field tuple: (name, type, required, source, validation)."""
EP = []

def ep(key, method, path, auth, roles, stories, title, req=None, query=None, res="204", rules="", errors="", effects=None,
       audit="", notify="", transition=""):
    EP.append(dict(key=key, method=method, path=path, auth=auth, roles=roles, stories=stories, title=title, req=req or [],
                   query=query or [], res=res, rules=rules, errors=errors, effects=effects or [], audit=audit, notify=notify,
                   transition=transition))

def F(name, typ, required, source="", validation=""):
    return (name, typ, required, source, validation)

ALL = "OFS"; OF = "OF"; O = "O"
ST = "/api/v1/staff"
LF = "/api/v1/liff/{branchSlug}"
AD = "/api/v1/admin"

# =========================================================== AUTH (staff)
ep("auth.staffLogin", "POST", "/api/v1/auth/staff/login", "public", "", "US-01-02", "เข้าสู่ระบบด้วยอีเมล",
   [F("email", "string", True, "staff_user.email", "อีเมล, trim + lowercase"), F("password", "string", True, "", "1–128 ตัว")],
   res="StaffMe", rules="R-24", errors="INVALID_CREDENTIALS,ACCOUNT_LOCKED,RATE_LIMITED",
   effects=["สร้าง session (subject staff, อายุ 30 วัน sliding) ตั้ง cookie `sid` httpOnly Secure SameSite=Lax",
            "อัปเดต staff_user.failed_login_count/locked_until/last_login_at ตาม R-24",
            "rate limit 10 ครั้ง/นาที/IP"])
ep("auth.staffLogout", "POST", "/api/v1/auth/staff/logout", "staff", ALL, "US-01-02", "ออกจากระบบ", effects=["ลบ session ปัจจุบัน + ล้าง cookie"])
ep("auth.me", "GET", "/api/v1/auth/staff/me", "staff", ALL, "US-01-02", "ข้อมูล session", res="StaffMe")
ep("auth.resetRequest", "POST", "/api/v1/auth/staff/password-reset/request", "public", "", "US-01-02", "ขอลิงก์รีเซ็ตรหัสผ่าน",
   [F("email", "string", True, "staff_user.email", "อีเมล")], effects=["ตอบ 204 เสมอ (ไม่บอกว่ามีอีเมลไหม)", "มีจริง → สร้าง password_reset (30 นาที) ส่งอีเมลลิงก์"],
   errors="RATE_LIMITED", notify="staff.password_reset")
ep("auth.resetConfirm", "POST", "/api/v1/auth/staff/password-reset/confirm", "public", "", "US-01-02", "ตั้งรหัสผ่านใหม่",
   [F("token", "string", True, "password_reset.token_hash", "token จากลิงก์ (DB เก็บ sha256)"), F("newPassword", "string", True, "staff_user.password_hash", "R-24 policy")],
   rules="R-24", errors="TOKEN_INVALID,PASSWORD_POLICY", effects=["ตั้ง password_reset.used_at, ลบ session เดิมทั้งหมดของผู้ใช้"])
ep("auth.inviteAccept", "POST", "/api/v1/auth/staff/invite/accept", "public", "", "US-01-04", "รับคำเชิญ ตั้งชื่อและรหัสผ่าน",
   [F("token", "string", True, "staff_invite.token_hash", "token จากลิงก์"), F("displayName", "string", True, "staff_user.display_name", "1–40 ตัว"),
    F("email", "string", False, "staff_user.email", "ต้องมีถ้าคำเชิญไม่มีอีเมล"), F("password", "string", False, "staff_user.password_hash", "R-24; ไม่ส่ง = ใช้ LINE login อย่างเดียว")],
   res="StaffMe", rules="R-24", errors="TOKEN_INVALID,PASSWORD_POLICY,EMAIL_TAKEN",
   effects=["staff_invite.accepted_at = now, staff_user.status invited → active, สร้าง session"], transition="staff_user:invited→active")
ep("auth.staffLine", "POST", "/api/v1/auth/staff/line", "public", "", "US-01-03", "ช่างเข้า Staff app ด้วย LINE",
   [F("idToken", "string", True, "", "LINE ID token จาก LINE Login ของแพลตฟอร์ม")], res="StaffMe", errors="LINE_TOKEN_INVALID,INVALID_CREDENTIALS",
   effects=["verify ID token กับ PLATFORM_LINE_LOGIN_CHANNEL_ID → หา staff_user.line_user_id = sub ที่ status active", "ไม่พบ → INVALID_CREDENTIALS"])
ep("staffMe.linkLine", "POST", f"{ST}/me/line-link", "staff", ALL, "US-01-03", "ผูก LINE กับบัญชีพนักงาน",
   [F("idToken", "string", True, "staff_user.line_user_id", "LINE ID token")], res="StaffMe", errors="LINE_TOKEN_INVALID,EMAIL_TAKEN")
ep("staffMe.sessions", "GET", f"{ST}/me/sessions", "staff", ALL, "US-01-05", "อุปกรณ์ที่ล็อกอินอยู่",
   res="object[] {id: session.id, userAgent: session.user_agent, lastSeenAt: session.last_seen_at, current: bool}")
ep("staffMe.revokeSession", "DELETE", f"{ST}/me/sessions/{{sessionId}}", "staff", ALL, "US-01-05", "ออกจากระบบอุปกรณ์อื่น")
ep("staffMe.pushSubscribe", "POST", f"{ST}/me/push-subscriptions", "staff", ALL, "US-13-05, US-09-04", "ลงทะเบียน Web Push",
   [F("endpoint", "string", True, "web_push_subscription.endpoint", "https URL"), F("p256dh", "string", True, "web_push_subscription.p256dh", ""),
    F("auth", "string", True, "web_push_subscription.auth", "")], effects=["upsert ตาม endpoint, ล้าง disabled_at"])
ep("staffMe.pushUnsubscribe", "DELETE", f"{ST}/me/push-subscriptions", "staff", ALL, "US-13-05", "ยกเลิก Web Push",
   [F("endpoint", "string", True, "web_push_subscription.endpoint", "")])
ep("staffMe.commissions", "GET", f"{ST}/me/commissions", "staff", ALL, "US-09-05", "ค่ามือของฉัน",
   query=[F("from", "date", True, "", ""), F("to", "date", True, "", "≤ 93 วัน")], res="CommissionReport", rules="R-13",
   effects=["กรองเฉพาะ staff_user_id = ผู้ใช้ปัจจุบัน"])

# =========================================================== FILES
for aud, base, roles in (("staff", ST, ALL), ("customer", LF, "")):
    ep(f"{aud}.uploadUrl", "POST", f"{base}/files/upload-url", aud, roles, "US-13-04", "ขอ URL อัปโหลดไฟล์",
       [F("kind", "enum:file_kind", True, "file_object.kind", "R-25 (ลูกค้า: pet_profile, vaccine_proof, slip เท่านั้น)"),
        F("mimeType", "string", True, "file_object.mime_type", "R-25"), F("sizeBytes", "int", True, "file_object.size_bytes", "R-25"),
        F("width", "int", False, "file_object.width", ""), F("height", "int", False, "file_object.height", "")],
       res="UploadTicket", rules="R-25", errors="UPLOAD_KIND_NOT_ALLOWED,UPLOAD_TYPE_NOT_ALLOWED,UPLOAD_TOO_LARGE",
       effects=["สร้าง file_object (committed_at null) แล้วคืน presigned PUT", "ไฟล์ถูก commit เมื่อ endpoint อื่นอ้าง fileId (ตรวจว่ามี object จริงด้วย HEAD)"])

# =========================================================== BRANCH SETTINGS
ep("branch.get", "GET", f"{ST}/branch", "staff", ALL, "US-02-01", "ตั้งค่าสาขา", res="BranchSettings")
ep("branch.update", "PATCH", f"{ST}/branch", "staff", O, "US-02-01", "แก้ข้อมูลร้าน",
   [F("name", "string", False, "branch.name", "1–80"), F("phone", "string", False, "branch.phone", "R-22"),
    F("addressLine", "string", False, "branch.address_line", "≤ 200"), F("subdistrict", "string", False, "branch.subdistrict", ""),
    F("district", "string", False, "branch.district", ""), F("province", "string", False, "branch.province", "รายชื่อ 77 จังหวัด"),
    F("postalCode", "string", False, "branch.postal_code", "^\\d{5}$"), F("latitude", "number", False, "branch.latitude", "-90..90"),
    F("longitude", "number", False, "branch.longitude", "-180..180"), F("logoFileId", "uuid", False, "branch.logo_file_id", "file kind logo"),
    F("facebookUrl", "string", False, "branch.facebook_url", "URL"), F("instagramUrl", "string", False, "branch.instagram_url", "URL"),
    F("receiptPrefix", "string", False, "branch.receipt_prefix", "^[A-Z]{1,3}$")], res="BranchSettings")
ep("branch.setHours", "PUT", f"{ST}/branch/hours", "staff", O, "US-02-01", "ตั้งเวลาเปิด-ปิด 7 วัน",
   [F("hours[]", "object[]", True, "branch_hours.weekday", "ครบ 7 แถว weekday 0–6 ไม่ซ้ำ"), F("hours[].isClosed", "bool", True, "branch_hours.is_closed", ""),
    F("hours[].opensAt", "time", False, "branch_hours.opens_at", "HH:MM, บังคับเมื่อไม่ปิด"), F("hours[].closesAt", "time", False, "branch_hours.closes_at", "> opensAt")],
   res="BranchSettings", effects=["แทนที่ทั้ง 7 แถว", "ไม่ย้าย/ยกเลิกนัดเดิมที่อยู่นอกเวลาใหม่ — ตอบ warnings[] รายการนัดที่ได้รับผล"])
ep("branch.setModules", "PATCH", f"{ST}/branch/modules", "staff", O, "US-02-02", "เปิด/ปิดโมดูล",
   [F("grooming", "bool", False, "branch.module_grooming", ""), F("hotel", "bool", False, "branch.module_hotel", ""), F("daycare", "bool", False, "branch.module_daycare", "")],
   res="BranchSettings", effects=["ปิดโมดูลที่มีใบจองอนาคต → ได้ แต่ LIFF ซ่อนเมนู; ตอบ warnings[] จำนวนใบจองที่ค้าง"])
ep("branch.updatePolicy", "PATCH", f"{ST}/branch/policy", "staff", O, "US-02-04, US-07-03, US-07-04, US-05-05, US-06-05, US-13-06", "แก้นโยบายร้าน",
   [F("<field>", "any", False, "branch_policy.default_deposit_type", "ทุกฟิลด์ของ BranchPolicy แก้ได้บางส่วน; ตรวจ CHECK ใน 02 (percent 0–100, step 5/10/15/30)"),
    F("requiredVaccinesDog[]", "string[]", False, "branch_policy.required_vaccines_dog", "รหัสต้องอยู่ใน vaccine_type species dog"),
    F("requiredVaccinesCat[]", "string[]", False, "branch_policy.required_vaccines_cat", "รหัส vaccine_type species cat"),
    F("googleReviewUrl", "string", False, "branch_policy.google_review_url", "URL https")],
   res="BranchPolicy", audit="policy.update", effects=["ใบจองเดิมใช้ policy_snapshot เดิม (ไม่กระทบ)"])
ep("branch.setPromptpay", "PUT", f"{ST}/branch/promptpay", "staff", O, "US-02-03", "ตั้งบัญชี PromptPay",
   [F("type", "enum:promptpay_type", True, "branch.promptpay_type", ""), F("id", "string", True, "branch.promptpay_id", "R-30 รูปแบบตาม type"),
    F("accountName", "string", True, "branch.promptpay_account_name", "1–80"), F("password", "string", True, "", "ยืนยันรหัสผ่านเจ้าของซ้ำ (กันคนอื่นแก้บัญชีรับเงิน)")],
   res="BranchSettings", rules="R-30", errors="INVALID_PROMPTPAY_ID,INVALID_CREDENTIALS", audit="promptpay.update",
   notify="owner.promptpay_changed", effects=["แจ้งเจ้าของร้านทุกคนทาง web push + email"])
ep("closures.list", "GET", f"{ST}/branch/closures", "staff", ALL, "US-02-05", "วันปิด/ช่วงปิด",
   query=[F("from", "date", False, "", ""), F("to", "date", False, "", "")], res="object[] branch_closure.*")
ep("closures.create", "POST", f"{ST}/branch/closures", "staff", OF, "US-02-05", "เพิ่มวันปิด",
   [F("startsAt", "datetime", True, "branch_closure.starts_at", ""), F("endsAt", "datetime", True, "branch_closure.ends_at", "> startsAt"),
    F("scope", "enum:closure_scope", True, "branch_closure.scope", ""), F("reason", "string", False, "branch_closure.reason", "≤ 200")],
   effects=["ตอบ affected[] = นัด/การพักที่ทับช่วงปิด (ไม่ยกเลิกอัตโนมัติ — หน้าร้านจัดการเอง)"])
ep("closures.delete", "DELETE", f"{ST}/branch/closures/{{closureId}}", "staff", OF, "US-02-05", "ลบวันปิด")
ep("closures.importHolidays", "POST", f"{ST}/branch/closures/public-holidays", "staff", O, "US-02-05, US-13-03", "เพิ่มวันหยุดราชการเป็นวันปิด",
   [F("year", "int", True, "public_holiday.holiday_date", "ปี ค.ศ."), F("dates[]", "date[]", True, "public_holiday.holiday_date", "เลือกบางวัน"),
    F("scope", "enum:closure_scope", True, "branch_closure.scope", "")], effects=["สร้าง branch_closure source public_holiday ทั้งวันท้องถิ่น"])
ep("stations.list", "GET", f"{ST}/stations", "staff", ALL, "US-05-01", "โต๊ะกรูม", res="object[] groom_station.*")
ep("stations.upsert", "PUT", f"{ST}/stations", "staff", O, "US-05-01", "ตั้งค่าโต๊ะกรูม",
   [F("stations[].id", "uuid", False, "groom_station.id", "ไม่ส่ง = สร้างใหม่"), F("stations[].name", "string", True, "groom_station.name", "1–30"),
    F("stations[].sortOrder", "int", True, "groom_station.sort_order", ""), F("stations[].status", "enum:record_status", True, "groom_station.status", "")])
ep("line.status", "GET", f"{ST}/branch/line", "staff", OF, "US-02-06, US-13-06", "สถานะ LINE และโควตา", res="LineStatus", rules="R-18")
ep("line.skipped", "GET", f"{ST}/notifications/skipped", "staff", OF, "US-13-06", "ข้อความที่ไม่ได้ส่ง",
   query=[F("days", "int", False, "", "1–30, default 7")], res="SkippedMessageItem[]")

# =========================================================== STAFF MANAGEMENT
ep("staffUsers.list", "GET", f"{ST}/staff-users", "staff", ALL, "US-01-04, US-09-01", "รายชื่อพนักงาน", res="StaffUserItem[]",
   effects=["role staff เห็นเฉพาะ id, displayName, isGroomer, photoUrl"])
ep("staffUsers.invite", "POST", f"{ST}/staff-users/invite", "staff", O, "US-01-04", "เชิญพนักงาน",
   [F("displayName", "string", True, "staff_user.display_name", "1–40"), F("email", "string", False, "staff_user.email", "อีเมล; ไม่ใส่ = เชิญผ่านลิงก์ LINE"),
    F("role", "enum:staff_role", True, "staff_user.role", ""), F("isGroomer", "bool", True, "staff_user.is_groomer", "")],
   res="object {staffUser: StaffUserItem, inviteUrl: string}", errors="EMAIL_TAKEN", audit="staff.invite", notify="staff.invite",
   effects=["สร้าง staff_user status invited + staff_invite (7 วัน)", "มีอีเมล → ส่งอีเมล; คืน inviteUrl ให้ส่งทาง LINE เองได้"])
ep("staffUsers.update", "PATCH", f"{ST}/staff-users/{{staffUserId}}", "staff", O, "US-01-04, US-09-01", "แก้ข้อมูล/สิทธิ์พนักงาน",
   [F("displayName", "string", False, "staff_user.display_name", ""), F("phone", "string", False, "staff_user.phone", "R-22"),
    F("role", "enum:staff_role", False, "staff_user.role", ""), F("isGroomer", "bool", False, "staff_user.is_groomer", ""),
    F("sortOrder", "int", False, "staff_user.sort_order", ""), F("photoFileId", "uuid", False, "staff_user.photo_file_id", ""),
    F("status", "enum:staff_status", False, "staff_user.status", "active ↔ disabled เท่านั้น")],
   res="StaffUserItem", errors="LAST_OWNER", audit="staff.role_change", transition="staff_user:active↔disabled",
   effects=["disabled → ลบ session ทั้งหมดของคนนั้น; นัดอนาคตของช่างที่ถูกปิดยังอยู่ — ตอบ warnings[]"])
ep("staffUsers.resendInvite", "POST", f"{ST}/staff-users/{{staffUserId}}/resend-invite", "staff", O, "US-01-04", "ส่งคำเชิญใหม่",
   res="object {inviteUrl: string}", effects=["สร้าง staff_invite ใหม่ (อันเก่ายังใช้ได้จนหมดอายุ)"])
ep("workingHours.set", "PUT", f"{ST}/staff-users/{{staffUserId}}/working-hours", "staff", OF, "US-09-01", "ตั้งเวลาทำงานรายสัปดาห์",
   [F("days[].weekday", "int", True, "staff_working_hours.weekday", "0–6 ไม่ซ้ำ; ไม่ส่งวันไหน = หยุดวันนั้น"),
    F("days[].startsAt", "time", True, "staff_working_hours.starts_at", ""), F("days[].endsAt", "time", True, "staff_working_hours.ends_at", "> startsAt"),
    F("days[].breakStartsAt", "time", False, "staff_working_hours.break_starts_at", ""), F("days[].breakEndsAt", "time", False, "staff_working_hours.break_ends_at", "")],
   res="StaffUserItem", effects=["แทนที่ทั้งชุด; ตอบ warnings[] นัดอนาคตที่อยู่นอกเวลาใหม่"])
ep("timeOff.list", "GET", f"{ST}/time-off", "staff", ALL, "US-09-01", "วันลา", query=[F("from", "date", True, "", ""), F("to", "date", True, "", "")],
   res="object[] staff_time_off.*")
ep("timeOff.create", "POST", f"{ST}/time-off", "staff", OF, "US-09-01", "เพิ่มวันลา",
   [F("staffUserId", "uuid", True, "staff_time_off.staff_user_id", ""), F("startsAt", "datetime", True, "staff_time_off.starts_at", ""),
    F("endsAt", "datetime", True, "staff_time_off.ends_at", "> startsAt"), F("reason", "string", False, "staff_time_off.reason", "")],
   effects=["ตอบ affected[] นัดที่ทับ (ต้องย้ายเอง)"])
ep("timeOff.delete", "DELETE", f"{ST}/time-off/{{timeOffId}}", "staff", OF, "US-09-01", "ลบวันลา")

# =========================================================== CUSTOMERS & PETS
ep("search.quick", "GET", f"{ST}/search", "staff", ALL, "US-03-10", "ค้นหาเร็ว (ชื่อ ชื่อเล่น เบอร์ ชื่อน้อง เลขใบจอง)",
   query=[F("q", "string", True, "", "≥ 2 ตัวอักษร; ถ้าเป็นเบอร์ normalize ด้วย R-22 แล้วค้น prefix ของ owner_profile.phone_e164")],
   res="object {customers: CustomerListItem[], bookings: BookingListItem[]}", rules="R-22",
   effects=["ค้นแบบ ILIKE บน owner_profile.first_name/last_name/nickname, pet.name; ตรงตัวบน booking.booking_no; จำกัด 20 ผล; ใช้ pg_trgm index (เพิ่มใน migration ของ US-03-10)"])
ep("customers.list", "GET", f"{ST}/customers", "staff", OF, "US-03-01", "รายการลูกค้า",
   query=[F("q", "string", False, "", ""), F("sort", "enum", False, "", "last_visit_desc | name_asc | created_desc"), F("cursor", "string", False, "", ""),
          F("limit", "int", False, "", "1–200")], res="Paged<CustomerListItem>")
ep("customers.create", "POST", f"{ST}/customers", "staff", OF, "US-03-01", "เพิ่มลูกค้า (หน้าร้าน)",
   [F("firstName", "string", True, "owner_profile.first_name", "1–60"), F("lastName", "string", False, "owner_profile.last_name", "≤ 60"),
    F("nickname", "string", False, "owner_profile.nickname", "≤ 30"), F("phone", "string", False, "owner_profile.phone_e164", "R-22 (แนะนำให้มี)"),
    F("email", "string", False, "owner_profile.email", ""), F("sourceChannel", "enum:booking_channel", False, "customer.source_channel", "default walk_in"),
    F("referralNote", "string", False, "customer.referral_note", ""), F("internalNote", "string", False, "customer.internal_note", "≤ 2000"),
    F("photoConsent", "enum:photo_consent", False, "customer.photo_consent", "default unknown")],
   res="CustomerDetail", rules="R-22", errors="INVALID_PHONE",
   effects=["สร้าง owner_profile (created_in_org_id = org) + customer ใน transaction", "เบอร์ซ้ำกับลูกค้าเดิมในร้าน → ไม่ error แต่ตอบ warnings[] {duplicateCustomerIds}"])
ep("customers.get", "GET", f"{ST}/customers/{{customerId}}", "staff", ALL, "US-03-01", "รายละเอียดลูกค้า", res="CustomerDetail",
   effects=["role staff: ไม่เห็น phone, email, address, internalNote, creditBalance (ตัดออกจาก response)"])
ep("customers.update", "PATCH", f"{ST}/customers/{{customerId}}", "staff", OF, "US-03-01", "แก้ข้อมูลลูกค้า",
   [F("<owner_profile fields>", "any", False, "owner_profile.first_name", "เหมือน create + birthDate, ที่อยู่"),
    F("emergencyContactName", "string", False, "customer.emergency_contact_name", ""), F("emergencyContactPhone", "string", False, "customer.emergency_contact_phone", "R-22"),
    F("internalNote", "string", False, "customer.internal_note", ""), F("depositExempt", "bool", False, "customer.deposit_exempt", "owner เท่านั้น"),
    F("photoConsent", "enum:photo_consent", False, "customer.photo_consent", "ตั้ง photo_consent_at = now")], res="CustomerDetail", rules="R-22")
ep("customers.blacklist", "POST", f"{ST}/customers/{{customerId}}/blacklist", "staff", O, "US-03-09", "ตั้ง/ยกเลิก blacklist",
   [F("blacklisted", "bool", True, "customer.blacklisted", ""), F("reason", "string", False, "customer.blacklist_reason", "บังคับเมื่อ true, ≥ 3 ตัว")],
   res="CustomerDetail", errors="REASON_REQUIRED", audit="customer.blacklist")
ep("customers.reliabilityOverride", "PUT", f"{ST}/customers/{{customerId}}/reliability-override", "staff", O, "US-03-09", "กำหนดระดับความน่าเชื่อถือเอง",
   [F("level", "int", False, "customer.reliability_override", "1–4 หรือ null = ใช้ค่าคำนวณ"), F("reason", "string", True, "", "≥ 3 ตัว")],
   res="CustomerDetail", rules="R-09", audit="customer.reliability_override")
ep("customers.timeline", "GET", f"{ST}/customers/{{customerId}}/timeline", "staff", OF, "US-03-08", "ประวัติทั้งหมด",
   query=[F("cursor", "string", False, "", "")],
   res="Paged<object {at, type: booking|groom|stay|daycare|bill|report_card|note, title, petName, amountSatang, refId}>",
   effects=["รวม booking_event, bill (paid/void), report_card sent เรียงใหม่→เก่า"])
ep("customers.credit", "POST", f"{ST}/customers/{{customerId}}/credit-adjustments", "staff", O, "US-07-05", "ปรับเครดิตลูกค้าเอง",
   [F("deltaSatang", "int", True, "credit_ledger.delta_satang", "≠ 0; ผลรวมใหม่ ≥ 0"), F("reason", "string", True, "", "≥ 3 ตัว")],
   res="CustomerDetail", errors="REASON_REQUIRED,INSUFFICIENT_CREDIT", audit="credit.adjust",
   effects=["insert credit_ledger reason adjustment + update customer.credit_balance_satang ใน transaction เดียว"])
ep("customers.packages", "GET", f"{ST}/customers/{{customerId}}/packages", "staff", OF, "US-10-05", "แพ็กเกจของลูกค้า", res="CustomerPackageItem[]")
ep("pets.create", "POST", f"{ST}/customers/{{customerId}}/pets", "staff", OF, "US-03-02", "เพิ่มน้อง",
   [F("name", "string", True, "pet.name", "1–40"), F("species", "enum:species", True, "pet.species", ""), F("speciesOther", "string", False, "pet.species_other", "บังคับเมื่อ other"),
    F("breed", "string", False, "pet.breed", "จากรายการ breed หรือพิมพ์เอง ≤ 60"), F("sex", "enum:pet_sex", False, "pet.sex", ""),
    F("birthDate", "date", False, "pet.birth_date", "≤ วันนี้"), F("ageEstimateMonths", "int", False, "pet.age_estimate_months", "0–360; ใช้เมื่อไม่รู้วันเกิด"),
    F("neutered", "bool", False, "pet.neutered", ""), F("color", "string", False, "pet.color", ""), F("microchipNo", "string", False, "pet.microchip_no", "15 หลัก"),
    F("coatType", "enum:coat_type", True, "pet.coat_type", ""), F("weightGrams", "int", False, "pet_weight.weight_grams", "100–150000; สร้าง pet_weight"),
    F("profileFileId", "uuid", False, "pet.profile_file_id", "kind pet_profile")],
   res="PetDetail", effects=["สร้าง pet (owner_profile ของลูกค้า) + pet_shop_profile ว่างของ org + pet_weight ถ้ามี"])
ep("pets.get", "GET", f"{ST}/pets/{{petId}}", "staff", ALL, "US-03-02, US-03-03, US-03-04", "รายละเอียดน้อง", res="PetDetail",
   effects=["ต้องมี pet_shop_profile ของ org นี้ ไม่งั้น NOT_FOUND"])
ep("pets.update", "PATCH", f"{ST}/pets/{{petId}}", "staff", OF, "US-03-02", "แก้ข้อมูลน้อง", [F("<pet fields>", "any", False, "pet.name", "เหมือน create ยกเว้น weightGrams")], res="PetDetail")
ep("pets.setStatus", "POST", f"{ST}/pets/{{petId}}/status", "staff", OF, "US-03-11", "น้องจากไป/ย้ายบ้าน",
   [F("status", "enum:pet_status", True, "pet.status", ""), F("note", "string", False, "", "")], res="PetDetail",
   effects=["ตั้ง pet.status_changed_at; deceased/rehomed → ยกเลิก scheduled_job ที่ payload.petId = นี้ (next_groom_reminder)", "ใบจองอนาคตไม่ยกเลิกอัตโนมัติ — ตอบ warnings[]"])
ep("pets.updateShopProfile", "PUT", f"{ST}/pets/{{petId}}/shop-profile", "staff", ALL, "US-03-03, US-03-04, US-03-07", "ข้อมูลกรูม/สุขภาพ/โน้ตของร้าน",
   [F("preferredStyle", "string", False, "pet_shop_profile.preferred_style", "≤ 200"), F("bladeNo", "string", False, "pet_shop_profile.blade_no", "≤ 20"),
    F("shampooOk", "string", False, "pet_shop_profile.shampoo_ok", ""), F("shampooAvoid", "string", False, "pet_shop_profile.shampoo_avoid", ""),
    F("allergies", "string", False, "pet_shop_profile.allergies", ""), F("conditions", "string", False, "pet_shop_profile.conditions", ""),
    F("medications", "string", False, "pet_shop_profile.medications", ""), F("vetClinicName", "string", False, "pet_shop_profile.vet_clinic_name", ""),
    F("vetClinicPhone", "string", False, "pet_shop_profile.vet_clinic_phone", "R-22"), F("internalNote", "string", False, "pet_shop_profile.internal_note", "≤ 2000"),
    F("sharedNote", "string", False, "pet_shop_profile.shared_note", "≤ 1000 ลูกค้าเห็น"), F("favoriteStylePhotoId", "uuid", False, "pet_shop_profile.favorite_style_photo_id", "pet_photo ของน้องตัวนี้"),
    F("groomIntervalDays", "int", False, "pet_shop_profile.groom_interval_days", "7–180 หรือ null")], res="PetDetail")
ep("pets.addWeight", "POST", f"{ST}/pets/{{petId}}/weights", "staff", ALL, "US-03-03", "บันทึกน้ำหนัก",
   [F("weightGrams", "int", True, "pet_weight.weight_grams", "100–150000"), F("measuredAt", "datetime", False, "pet_weight.measured_at", "default now")],
   res="PetDetail", effects=["อัปเดต pet.latest_weight_grams ถ้าเป็นค่าล่าสุด"])
ep("pets.setFlags", "PUT", f"{ST}/pets/{{petId}}/temperament-flags", "staff", ALL, "US-03-04", "ตั้งป้ายนิสัย",
   [F("flags[].flag", "enum:temperament_flag", True, "pet_temperament_flag.flag", "ไม่ซ้ำ"), F("flags[].note", "string", False, "pet_temperament_flag.note", "บังคับเมื่อ other")],
   res="PetDetail", effects=["แทนที่ทั้งชุดของ org นี้"])
ep("vaccinations.create", "POST", f"{ST}/pets/{{petId}}/vaccinations", "staff", OF, "US-03-05", "เพิ่มวัคซีน (ร้านบันทึก = verified)",
   [F("vaccineCode", "string", True, "pet_vaccination.vaccine_code", "ต้องตรง species ของน้อง"), F("administeredOn", "date", False, "pet_vaccination.administered_on", "≤ วันนี้"),
    F("expiresOn", "date", False, "pet_vaccination.expires_on", "ไม่ส่ง = administeredOn + default_validity_months"),
    F("proofFileId", "uuid", False, "pet_vaccination.proof_file_id", "kind vaccine_proof")],
   res="VaccinationItem", effects=["status verified, source shop, verified_org_id/by/at"])
ep("vaccinations.verify", "POST", f"{ST}/vaccinations/{{vaccinationId}}/verify", "staff", OF, "US-03-05, US-06-05", "ยืนยันวัคซีนที่ลูกค้าส่ง",
   [F("expiresOn", "date", False, "pet_vaccination.expires_on", "แก้ได้ก่อนยืนยัน")], res="VaccinationItem", transition="pet_vaccination:pending_review→verified")
ep("vaccinations.reject", "POST", f"{ST}/vaccinations/{{vaccinationId}}/reject", "staff", OF, "US-03-05", "ปฏิเสธหลักฐานวัคซีน",
   [F("reason", "string", True, "pet_vaccination.reject_reason", "≥ 3")], res="VaccinationItem", transition="pet_vaccination:pending_review→rejected",
   notify="customer.vaccine_rejected")
ep("photos.list", "GET", f"{ST}/pets/{{petId}}/photos", "staff", ALL, "US-03-06", "คลังรูปน้อง",
   query=[F("kind", "enum:photo_kind", False, "", ""), F("cursor", "string", False, "", "")], res="Paged<PhotoItem>")
ep("photos.add", "POST", f"{ST}/pets/{{petId}}/photos", "staff", ALL, "US-03-06, US-09-03", "เพิ่มรูปน้อง",
   [F("fileId", "uuid", True, "pet_photo.file_id", "kind before/after/stay_update/pet_profile"), F("kind", "enum:photo_kind", True, "pet_photo.kind", ""),
    F("appointmentId", "uuid", False, "pet_photo.appointment_id", ""), F("stayId", "uuid", False, "pet_photo.stay_id", ""),
    F("caption", "string", False, "pet_photo.caption", "≤ 200")], res="PhotoItem")
ep("linkRequests.list", "GET", f"{ST}/link-requests", "staff", OF, "US-01-01, US-11-01", "คำขอจับคู่บัญชี LINE", res="LinkRequestItem[]")
ep("linkRequests.approve", "POST", f"{ST}/link-requests/{{requestId}}/approve", "staff", OF, "US-11-01", "ยืนยันว่าเป็นลูกค้าเดิม",
   res="LinkRequestItem", audit="customer.merge_link_approve", transition="customer_link_request:pending→approved", notify="customer.link_approved",
   effects=["ย้าย line_identity ไปผูก owner_profile ของ candidate", "ย้ายน้อง/ใบจองที่สร้างจาก profile ใหม่ (ถ้ามี) ไปยังลูกค้าเดิม", "ลบ owner_profile ใหม่ที่ว่างแล้ว"])
ep("linkRequests.reject", "POST", f"{ST}/link-requests/{{requestId}}/reject", "staff", OF, "US-11-01", "ไม่ใช่ลูกค้าเดิม",
   res="LinkRequestItem", transition="customer_link_request:pending→rejected", effects=["profile ใหม่กลายเป็นลูกค้าใหม่ของร้าน"])

# =========================================================== CATALOG
ep("sizeTiers.list", "GET", f"{ST}/size-tiers", "staff", ALL, "US-04-02", "ขนาด", res="SizeTierItem[]")
ep("sizeTiers.set", "PUT", f"{ST}/size-tiers", "staff", O, "US-04-02", "ตั้งช่วงขนาดของชนิดสัตว์",
   [F("species", "enum:species", True, "size_tier.species", "dog | cat"), F("tiers[].id", "uuid", False, "size_tier.id", ""),
    F("tiers[].code", "string", True, "size_tier.code", "^[A-Z]{1,4}$ ไม่ซ้ำ"), F("tiers[].labelTh", "string", True, "size_tier.label_th", "1–30"),
    F("tiers[].minWeightGrams", "int", True, "size_tier.min_weight_grams", ""), F("tiers[].maxWeightGrams", "int", False, "size_tier.max_weight_grams", "> min; แถวสุดท้าย null")],
   res="SizeTierItem[]", rules="R-01", errors="SIZE_TIER_OVERLAP,IN_USE", effects=["ต้องต่อเนื่องไม่ทับไม่เว้น เริ่มที่ 0"])
ep("services.list", "GET", f"{ST}/services", "staff", ALL, "US-04-01", "บริการ",
   query=[F("scope", "enum:service_scope", False, "", ""), F("includeArchived", "bool", False, "", "")], res="ServiceItem[]")
ep("services.create", "POST", f"{ST}/services", "staff", O, "US-04-01, US-04-04, US-06-06", "เพิ่มบริการ/add-on",
   [F("scope", "enum:service_scope", True, "service.scope", ""), F("category", "enum:service_category", True, "service.category", "hotel_addon/daycare_addon ต้องคู่ scope"),
    F("nameTh", "string", True, "service.name_th", "1–80"), F("description", "string", False, "service.description", "≤ 500"),
    F("photoFileId", "uuid", False, "service.photo_file_id", ""), F("speciesAllowed[]", "enum[]:species", False, "service.species_allowed", ""),
    F("isAddon", "bool", True, "service.is_addon", ""), F("addonPerDay", "bool", False, "service.addon_per_day", "เฉพาะ hotel add-on"),
    F("onlineBookable", "bool", False, "service.online_bookable", ""), F("estCostSatang", "int", False, "service.est_cost_satang", "≥ 0"),
    F("sortOrder", "int", False, "service.sort_order", "")], res="ServiceItem")
ep("services.update", "PATCH", f"{ST}/services/{{serviceId}}", "staff", O, "US-04-01", "แก้บริการ/ปิดใช้งาน",
   [F("<service fields>", "any", False, "service.name_th", "เหมือน create ยกเว้น scope"), F("status", "enum:record_status", False, "service.status", "")], res="ServiceItem")
ep("services.setPrices", "PUT", f"{ST}/services/{{serviceId}}/prices", "staff", O, "US-04-02, US-04-03", "ตารางราคา × ขนาด × ขน",
   [F("prices[].sizeTierId", "uuid", False, "service_price.size_tier_id", "null = ทุกขนาด"), F("prices[].coatGroup", "enum:coat_group", True, "service_price.coat_group", ""),
    F("prices[].priceSatang", "int", True, "service_price.price_satang", "0–10,000,000"), F("prices[].durationMinutes", "int", True, "service_price.duration_minutes", "0–600, หาร slot_step ลงตัวแนะนำ")],
   res="ServiceItem", rules="R-02", effects=["แทนที่ราคาของ rate plan default ทั้งชุด; ใบจองเดิมไม่กระทบ (snapshot)"])
ep("services.setAddonLinks", "PUT", f"{ST}/services/{{serviceId}}/addon-links", "staff", O, "US-04-04", "add-on ใช้กับบริการไหน",
   [F("baseServiceIds[]", "uuid[]", True, "service_addon_link.base_service_id", "[] = ใช้ได้ทุกบริการ scope เดียวกัน")], res="ServiceItem")
ep("surchargeTypes.list", "GET", f"{ST}/surcharge-types", "staff", ALL, "US-04-05", "ค่าบริการเพิ่ม", res="SurchargeTypeItem[]")
ep("surchargeTypes.upsert", "PUT", f"{ST}/surcharge-types", "staff", O, "US-04-05", "ตั้งค่าบริการเพิ่ม",
   [F("items[].id", "uuid", False, "surcharge_type.id", ""), F("items[].nameTh", "string", True, "surcharge_type.name_th", "1–60"),
    F("items[].defaultAmountSatang", "int", True, "surcharge_type.default_amount_satang", "≥ 0"), F("items[].status", "enum:record_status", True, "surcharge_type.status", "")],
   res="SurchargeTypeItem[]")
ep("roomTypes.list", "GET", f"{ST}/room-types", "staff", ALL, "US-06-01", "ประเภทห้อง", res="RoomTypeItem[]")
ep("roomTypes.create", "POST", f"{ST}/room-types", "staff", O, "US-06-01", "เพิ่มประเภทห้อง",
   [F("nameTh", "string", True, "room_type.name_th", "1–60"), F("description", "string", False, "room_type.description", ""),
    F("photoFileId", "uuid", False, "room_type.photo_file_id", ""), F("speciesAllowed[]", "enum[]:species", False, "room_type.species_allowed", ""),
    F("maxWeightGrams", "int", False, "room_type.max_weight_grams", ""), F("minAgeMonths", "int", False, "room_type.min_age_months", "0–60"),
    F("allowInHeat", "bool", False, "room_type.allow_in_heat", ""), F("allowReactive", "bool", False, "room_type.allow_reactive", ""),
    F("amenities[]", "string[]", False, "room_type.amenities", "aircon|camera|private|outdoor|bed|toys"), F("includedText", "string", False, "room_type.included_text", ""),
    F("onlineBookable", "bool", False, "room_type.online_bookable", ""), F("sortOrder", "int", False, "room_type.sort_order", "")], res="RoomTypeItem")
ep("roomTypes.update", "PATCH", f"{ST}/room-types/{{roomTypeId}}", "staff", O, "US-06-01", "แก้ประเภทห้อง",
   [F("<room_type fields>", "any", False, "room_type.name_th", ""), F("status", "enum:record_status", False, "room_type.status", "")], res="RoomTypeItem")
ep("roomTypes.setRates", "PUT", f"{ST}/room-types/{{roomTypeId}}/rates", "staff", O, "US-06-02", "ราคาห้องต่อคืน",
   [F("rates[].sizeTierId", "uuid", False, "room_rate.size_tier_id", "null = ทุกขนาด"), F("rates[].nightlyPriceSatang", "int", True, "room_rate.nightly_price_satang", "≥ 0")],
   res="RoomTypeItem")
ep("roomUnits.list", "GET", f"{ST}/room-units", "staff", ALL, "US-06-01", "ห้อง", res="RoomUnitItem[]")
ep("roomUnits.upsert", "PUT", f"{ST}/room-units", "staff", O, "US-06-01", "ตั้งค่าห้อง",
   [F("units[].id", "uuid", False, "room_unit.id", ""), F("units[].roomTypeId", "uuid", True, "room_unit.room_type_id", ""),
    F("units[].code", "string", True, "room_unit.code", "1–10 ไม่ซ้ำในสาขา"), F("units[].zone", "string", False, "room_unit.zone", ""),
    F("units[].status", "enum:room_unit_status", True, "room_unit.status", "maintenance/archived ห้ามถ้ามีการพักอนาคต (IN_USE)"),
    F("units[].sortOrder", "int", True, "room_unit.sort_order", "")], res="RoomUnitItem[]", errors="CODE_TAKEN,IN_USE")
ep("roomUnits.housekeeping", "PATCH", f"{ST}/room-units/{{roomUnitId}}/housekeeping", "staff", ALL, "US-06-04", "สถานะทำความสะอาด",
   [F("housekeeping", "enum:housekeeping_status", True, "room_unit.housekeeping", "")], res="RoomUnitItem")
ep("daycareTypes.list", "GET", f"{ST}/daycare-session-types", "staff", ALL, "US-06-13", "รอบ Daycare", res="DaycareSessionTypeItem[]")
ep("daycareTypes.upsert", "PUT", f"{ST}/daycare-session-types", "staff", O, "US-06-13", "ตั้งรอบและราคา Daycare",
   [F("items[].id", "uuid", False, "daycare_session_type.id", ""), F("items[].session", "enum:daycare_session", True, "daycare_session_type.session", "ไม่ซ้ำ"),
    F("items[].nameTh", "string", True, "daycare_session_type.name_th", ""), F("items[].startsAt", "time", True, "daycare_session_type.starts_at", ""),
    F("items[].endsAt", "time", True, "daycare_session_type.ends_at", ""), F("items[].capacity", "int", True, "daycare_session_type.capacity", "1–200"),
    F("items[].status", "enum:record_status", True, "daycare_session_type.status", ""),
    F("items[].rates[].sizeTierId", "uuid", False, "daycare_rate.size_tier_id", ""), F("items[].rates[].priceSatang", "int", True, "daycare_rate.price_satang", "")],
   res="DaycareSessionTypeItem[]")
ep("packageTemplates.list", "GET", f"{ST}/package-templates", "staff", ALL, "US-10-05", "แพ็กเกจที่ขาย", res="PackageTemplateItem[]")
ep("packageTemplates.upsert", "PUT", f"{ST}/package-templates", "staff", O, "US-10-05", "ตั้งแพ็กเกจ",
   [F("items[].id", "uuid", False, "package_template.id", ""), F("items[].nameTh", "string", True, "package_template.name_th", ""),
    F("items[].serviceId", "uuid", True, "package_template.service_id", "บริการหลัก grooming"), F("items[].sizeTierId", "uuid", False, "package_template.size_tier_id", ""),
    F("items[].sessionsCount", "int", True, "package_template.sessions_count", "2–50"), F("items[].priceSatang", "int", True, "package_template.price_satang", "> 0"),
    F("items[].validityDays", "int", True, "package_template.validity_days", "1–730"), F("items[].shareScope", "enum:package_share_scope", True, "package_template.share_scope", ""),
    F("items[].status", "enum:record_status", True, "package_template.status", "")], res="PackageTemplateItem[]", rules="R-14")
ep("commissionRules.list", "GET", f"{ST}/commission-rules", "staff", O, "US-09-02", "กติกาค่ามือ", res="CommissionRuleItem[]")
ep("commissionRules.set", "PUT", f"{ST}/commission-rules", "staff", O, "US-09-02", "ตั้งกติกาค่ามือ",
   [F("rules[].serviceId", "uuid", False, "commission_rule.service_id", ""), F("rules[].staffUserId", "uuid", False, "commission_rule.staff_user_id", ""),
    F("rules[].type", "enum:commission_type", True, "commission_rule.type", ""), F("rules[].value", "int", True, "commission_rule.value", "percent: 0–10000 bps")],
   res="CommissionRuleItem[]", rules="R-13", audit="commission_rule.update", effects=["แทนที่ทั้งชุด; ไม่กระทบ commission_entry เดิม"])
ep("imports.create", "POST", f"{ST}/imports", "staff", O, "US-02-08", "อัปโหลด CSV เพื่อตรวจ",
   [F("kind", "enum:import_kind", True, "import_job.kind", ""), F("fileId", "uuid", True, "import_job.file_id", "kind import_csv, UTF-8 (รองรับ BOM)")],
   res="ImportJobItem", effects=["parse + validate ทุกแถว (R-22 เบอร์, enum, วันที่ dd/mm/yyyy หรือ yyyy-mm-dd, ปี พ.ศ. แปลงอัตโนมัติ) → status ready",
                                 "คอลัมน์ CSV ลูกค้า-น้อง: customer_first_name*, customer_last_name, nickname, phone*, pet_name*, species*, breed, sex, birth_date, coat_type, weight_kg, note",
                                 "คอลัมน์ CSV บริการ: service_name*, category*, size_code, coat_group, price_baht*, duration_minutes*"])
ep("imports.get", "GET", f"{ST}/imports/{{importId}}", "staff", O, "US-02-08", "ผลตรวจ CSV", res="ImportJobItem")
ep("imports.commit", "POST", f"{ST}/imports/{{importId}}/commit", "staff", O, "US-02-08", "นำเข้าจริง", res="ImportJobItem",
   errors="IMPORT_HAS_ERRORS", audit="import.commit", effects=["transaction เดียว; เบอร์ซ้ำกับลูกค้าเดิม → เพิ่มน้องให้ลูกค้าเดิม", "source = import"])

# =========================================================== AVAILABILITY & QUOTES
ep("availability.groomSlots", "POST", f"{ST}/availability/groom-slots", "staff", OF, "US-05-01, US-05-04, US-05-08", "หาเวลาว่างกรูม (หน้าร้าน)",
   [F("date", "date", True, "", ""), F("petId", "uuid", True, "groom_appointment.pet_id", ""), F("serviceIds[]", "uuid[]", True, "groom_appointment_item.service_id", "≥ 1 บริการหลัก"),
    F("addonIds[]", "uuid[]", False, "groom_appointment_item.service_id", ""), F("groomerId", "uuid", False, "groom_appointment.groomer_id", "ไม่ส่ง = any"),
    F("sizeTierId", "uuid", False, "groom_appointment.size_tier_id", "override ขนาดเมื่อไม่รู้น้ำหนัก"),
    F("excludeAppointmentId", "uuid", False, "groom_appointment.id", "ตอนเลื่อนนัด ไม่นับนัดเดิม"),
    F("pendingAppointments[]", "object[]", False, "", "นัดของตัวก่อนหน้าในใบจองเดียวกัน {groomerId, stationId, startsAt, blockedUntil}")],
   res="SlotList", rules="R-01,R-02,R-03,R-04", errors="PRICE_NOT_FOUND,WEIGHT_REQUIRED,MODULE_DISABLED")
ep("availability.hotel", "GET", f"{ST}/availability/hotel", "staff", OF, "US-06-03, US-06-04", "ห้องว่าง",
   query=[F("checkInDate", "date", True, "stay.check_in_date", ""), F("checkOutDate", "date", True, "stay.check_out_date", "> checkIn, ≤ 30 คืน"),
          F("petId", "uuid", False, "stay.pet_id", "ส่งมาเพื่อคิดราคา/เงื่อนไข")], res="HotelAvailability", rules="R-01,R-12,R-28")
ep("availability.daycare", "GET", f"{ST}/availability/daycare", "staff", OF, "US-06-13", "ที่ว่าง Daycare",
   query=[F("date", "date", True, "daycare_visit.visit_date", ""), F("petId", "uuid", False, "", "")], res="DaycareAvailability", rules="R-29")
ep("quotes.create", "POST", f"{ST}/quotes", "staff", OF, "US-05-04", "คำนวณราคา+มัดจำก่อนบันทึก",
   [F("customerId", "uuid", True, "booking.customer_id", ""), F("groom[]", "object[]", False, "", "เหมือน bookings.create"),
    F("stays[]", "object[]", False, "", ""), F("daycare[]", "object[]", False, "", "")], res="Quote", rules="R-03,R-06,R-08,R-09")

# =========================================================== BOOKINGS (staff)
ep("bookings.create", "POST", f"{ST}/bookings", "staff", OF, "US-05-04, US-06-03, US-06-07, US-06-13", "ร้านสร้างใบจอง",
   [F("customerId", "uuid", True, "booking.customer_id", ""), F("channel", "enum:booking_channel", True, "booking.channel", "walk_in | phone | chat"),
    F("customerNote", "string", False, "booking.customer_note", "≤ 500"),
    F("groom[].petId", "uuid", True, "groom_appointment.pet_id", ""), F("groom[].serviceIds[]", "uuid[]", True, "groom_appointment_item.service_id", ""),
    F("groom[].addonIds[]", "uuid[]", False, "groom_appointment_item.service_id", ""), F("groom[].startsAt", "datetime", True, "groom_appointment.starts_at", "ต้องอยู่ในผล R-04"),
    F("groom[].groomerId", "uuid", True, "groom_appointment.groomer_id", "จาก slot"), F("groom[].stationId", "uuid", True, "groom_appointment.station_id", "จาก slot"),
    F("groom[].groomerPreference", "enum:groomer_preference", True, "groom_appointment.groomer_preference", ""),
    F("groom[].sizeTierId", "uuid", False, "groom_appointment.size_tier_id", ""), F("groom[].customerPackageId", "uuid", False, "groom_appointment_item.customer_package_id", "R-14"),
    F("stays[].petId", "uuid", True, "stay.pet_id", ""), F("stays[].roomTypeId", "uuid", True, "stay.room_type_id", ""),
    F("stays[].roomUnitId", "uuid", False, "stay.room_unit_id", "ไม่ส่ง = R-10"), F("stays[].checkInDate", "date", True, "stay.check_in_date", ""),
    F("stays[].checkOutDate", "date", True, "stay.check_out_date", ""), F("stays[].expectedCheckInTime", "time", False, "stay.expected_check_in_time", ""),
    F("stays[].expectedCheckOutTime", "time", False, "stay.expected_check_out_time", ""), F("stays[].inHeat", "bool", False, "stay.in_heat", ""),
    F("stays[].addonServiceIds[]", "uuid[]", False, "stay_addon.service_id", ""),
    F("stays[].bundleGroom", "object", False, "stay.bundle_appointment_id", "{serviceIds, addonIds, startsAt, groomerId, stationId} วันเช็คเอาท์ (US-06-07)"),
    F("daycare[].petId", "uuid", True, "daycare_visit.pet_id", ""), F("daycare[].sessionTypeId", "uuid", True, "daycare_visit.session_type_id", ""),
    F("daycare[].visitDate", "date", True, "daycare_visit.visit_date", ""),
    F("depositOverride.amountSatang", "int", False, "booking.deposit_required_satang", "0 = ยกเว้น"), F("depositOverride.reason", "string", False, "", "บังคับเมื่อ override")],
   res="BookingDetail", rules="R-01,R-02,R-03,R-04,R-06,R-10,R-11,R-12,R-23,R-28,R-29",
   errors="SLOT_TAKEN,ROOM_TAKEN,PET_ALREADY_BOOKED,DAYCARE_FULL,PRICE_NOT_FOUND,PET_INACTIVE,SPECIES_NOT_ALLOWED,BREED_REJECTED,PET_TOO_HEAVY,PET_TOO_YOUNG,IN_HEAT_NOT_ALLOWED,REACTIVE_NOT_ALLOWED,MODULE_DISABLED,BRANCH_CLOSED",
   audit="deposit.waive (เมื่อ override)", notify="customer.booking_confirmed", transition="booking:∅→confirmed",
   effects=["transaction เดียว: ล็อก branch row → R-23 เลขใบจอง → insert booking, children, items (snapshot ราคา) → booking_event",
            "สถานะ confirmed ทันที, deposit_status = pending ถ้า R-06 > 0 (หรือ override) ไม่งั้น not_required; policy_snapshot = สำเนา branch_policy",
            "first_service_at = เวลาเริ่มบริการแรก (stay ใช้ check_in_date + expected_check_in_time หรือเวลาเปิดร้าน)",
            "ตั้ง job reminder_24h ของแต่ละนัด/การพัก", "ร้านเลือก R-11 ไม่ผ่านได้ (แค่ warning) — gate จริงอยู่ตอนเช็คอิน"])
ep("bookings.list", "GET", f"{ST}/bookings", "staff", OF, "US-05-05, US-07-02", "รายการใบจอง",
   query=[F("status", "enum:booking_status", False, "booking.status", "หลายค่าได้"), F("from", "date", False, "", "ตาม first_service_at"),
          F("to", "date", False, "", ""), F("customerId", "uuid", False, "booking.customer_id", ""), F("cursor", "string", False, "", "")], res="Paged<BookingListItem>")
ep("bookings.get", "GET", f"{ST}/bookings/{{bookingId}}", "staff", ALL, "US-05-04", "รายละเอียดใบจอง", res="BookingDetail")
ep("bookings.approve", "POST", f"{ST}/bookings/{{bookingId}}/approve", "staff", OF, "US-05-05", "อนุมัติใบจอง", res="BookingDetail",
   transition="booking:awaiting_approval→confirmed", notify="customer.booking_confirmed", effects=["ยกเลิก job approval_overdue"])
ep("bookings.decline", "POST", f"{ST}/bookings/{{bookingId}}/decline", "staff", OF, "US-05-05", "ปฏิเสธใบจอง",
   [F("reason", "string", True, "booking.cancel_reason", "≥ 3 (ลูกค้าเห็น)")], res="BookingDetail", rules="R-07",
   transition="booking:awaiting_approval→cancelled", notify="customer.booking_declined", effects=["R-07 kind shop_cancel → คืนมัดจำเต็มถ้ามี"])
ep("bookings.cancelPreview", "GET", f"{ST}/bookings/{{bookingId}}/cancel-preview", "staff", OF, "US-07-04, US-05-08", "ดูผลเงินก่อนยกเลิก",
   query=[F("kind", "enum", True, "", "customer_cancel | shop_cancel")], res="object R-07 CancelResult", rules="R-07")
ep("bookings.cancel", "POST", f"{ST}/bookings/{{bookingId}}/cancel", "staff", OF, "US-05-08, US-07-04", "ยกเลิกทั้งใบจอง",
   [F("kind", "enum", True, "", "customer_cancel | shop_cancel"), F("reason", "string", True, "booking.cancel_reason", "≥ 3"),
    F("customerChoice", "enum", False, "", "refund | credit")], res="BookingDetail", rules="R-07,R-09", audit="booking.cancel",
   transition="booking:*→cancelled", notify="customer.booking_cancelled",
   effects=["children ทั้งหมด → cancelled", "เงินตาม R-07 (credit_ledger / refund pending / forfeited)", "late → customer.late_cancel_count_12m + 1 แล้ว R-09",
            "ยกเลิก scheduled_job ที่ dedupe_key อ้างใบจองนี้"])
ep("bookings.recordDeposit", "POST", f"{ST}/bookings/{{bookingId}}/deposit", "staff", OF, "US-07-02, US-07-03", "บันทึกรับมัดจำ (เงินสด/โอนที่ร้านเห็นแล้ว)",
   [F("method", "enum:payment_method", True, "payment.method", "cash | promptpay | bank_transfer | card_edc"),
    F("amountSatang", "int", True, "payment.amount_satang", "> 0"), F("reference", "string", False, "payment.reference", ""),
    F("proofFileId", "uuid", False, "payment.proof_file_id", "")], res="BookingDetail", audit="payment.create",
   transition="booking:awaiting_deposit→confirmed|awaiting_approval", effects=["insert payment (booking_id), booking.deposit_verified_satang += amount, deposit_status verified"])
ep("bookings.waiveDeposit", "POST", f"{ST}/bookings/{{bookingId}}/deposit/waive", "staff", OF, "US-07-03", "ยกเว้นมัดจำ",
   [F("reason", "string", True, "", "≥ 3")], res="BookingDetail", audit="deposit.waive", transition="booking:awaiting_deposit→confirmed|awaiting_approval",
   effects=["deposit_required_satang = 0, deposit_status not_required, ล้าง hold_expires_at"])
ep("bookings.balanceLink", "POST", f"{ST}/bookings/{{bookingId}}/balance-link", "staff", OF, "US-07-08", "สร้างลิงก์จ่ายยอดคงเหลือ",
   res="object {url: string, amountSatang: number}", notify="customer.balance_link", effects=["ต้องมี bill open; url = LIFF /pay/{billId}; ส่ง LINE ถ้าเลือก send=true"])
ep("calendar.day", "GET", f"{ST}/calendar", "staff", ALL, "US-05-03", "ปฏิทินคิว",
   query=[F("date", "date", True, "", ""), F("view", "enum", False, "", "day | week (week คืน 7 CalendarDay)"), F("groomerId", "uuid", False, "", "")],
   res="CalendarDay", effects=["role staff เห็นทุกนัดแต่ไม่เห็นเบอร์ลูกค้า"])

# =========================================================== GROOM APPOINTMENTS
GA = f"{ST}/groom-appointments/{{appointmentId}}"
ep("groom.reschedule", "PATCH", f"{GA}/reschedule", "staff", OF, "US-05-08, US-05-03", "เลื่อนนัด/ย้ายช่าง (ลากบนปฏิทิน)",
   [F("startsAt", "datetime", True, "groom_appointment.starts_at", "ต้องอยู่ในผล R-04 (excludeAppointmentId = นัดนี้)"),
    F("groomerId", "uuid", True, "groom_appointment.groomer_id", ""), F("stationId", "uuid", True, "groom_appointment.station_id", ""),
    F("reason", "string", False, "booking_event.reason", ""), F("notifyCustomer", "bool", False, "", "default true")],
   res="AppointmentCard", rules="R-04", errors="SLOT_TAKEN,STATUS_NOT_ALLOWED", notify="customer.booking_rescheduled",
   effects=["เฉพาะ status scheduled", "คำนวณ ends_at/blocked_until ใหม่ (R-03), อัปเดต booking.first_service_at", "booking_event to_status 'scheduled' reason 'reschedule'", "ตั้ง reminder_24h ใหม่"])
ep("groom.setItems", "PUT", f"{GA}/items", "staff", OF, "US-05-06, US-04-03", "เปลี่ยนบริการ/ขนาด (เช่นตอนเช็คอินชั่งแล้วขนาดเปลี่ยน)",
   [F("serviceIds[]", "uuid[]", True, "groom_appointment_item.service_id", ""), F("addonIds[]", "uuid[]", False, "groom_appointment_item.service_id", ""),
    F("sizeTierId", "uuid", False, "groom_appointment.size_tier_id", ""), F("priceOverrides[]", "object[]", False, "groom_appointment_item.price_satang", "{serviceId, priceSatang, reason} owner/front_desk")],
   res="AppointmentCard", rules="R-02,R-03", errors="SLOT_TAKEN,PRICE_NOT_FOUND", audit="booking.price_override (เมื่อ override)",
   effects=["ราคา snapshot ใหม่; เวลายาวขึ้น → ตรวจ exclusion (SLOT_TAKEN ให้หน้าร้านย้าย)"])
ep("groom.checkIn", "POST", f"{GA}/check-in", "staff", OF, "US-05-06", "เช็คอินกรูม",
   [F("weightGrams", "int", False, "groom_appointment.weight_grams_checkin", "100–150000; สร้าง pet_weight ด้วย"),
    F("conditionFlags[]", "string[]", False, "groom_appointment.condition_flags", "ticks_fleas | wound | matted | skin_issue"),
    F("conditionNote", "string", False, "groom_appointment.condition_note", "≤ 500"),
    F("consent.reasons[]", "string[]", False, "consent_document.reasons", "matted_shave | senior | medical_condition | aggressive | other"),
    F("consent.signerName", "string", False, "consent_document.signer_name", "บังคับเมื่อมี reasons"),
    F("consent.signatureFileId", "uuid", False, "consent_document.signature_file_id", "kind signature PNG")],
   res="AppointmentCard", errors="CONSENT_REQUIRED,STATUS_NOT_ALLOWED", transition="groom_appointment:scheduled→checked_in",
   effects=["conditionFlags มี matted หรือ skin_issue → ต้องมี consent", "consent_document.body_snapshot = branch_policy.grooming_consent_text ณ ตอนนั้น",
            "ถ้าน้ำหนักทำให้ size tier เปลี่ยน → ตอบ warnings[{code:'SIZE_CHANGED', newPriceSatang}] ให้หน้าร้านกด groom.setItems"])
ep("groom.start", "POST", f"{GA}/start", "staff", ALL, "US-09-03", "เริ่มงาน", res="AppointmentCard", transition="groom_appointment:checked_in→in_progress",
   effects=["role staff ทำได้เฉพาะนัดของตัวเอง", "started_at = now"])
ep("groom.finish", "POST", f"{GA}/finish", "staff", ALL, "US-09-03, US-10-01", "เสร็จงาน",
   [F("staffNote", "string", False, "groom_appointment.staff_note", "≤ 1000 โน้ตถึงร้าน")], res="AppointmentCard",
   transition="groom_appointment:in_progress→done", notify="staff.groom_done",
   effects=["done_at = now; สร้าง report_card draft (ถ้ายังไม่มี) ให้ช่างกรอก", "แจ้งหน้าร้าน (web push) ว่าน้องเสร็จ"])
ep("groom.notifyPickup", "POST", f"{GA}/notify-pickup", "staff", OF, "US-05-09", "แจ้งลูกค้ามารับ", res="AppointmentCard",
   notify="customer.ready_for_pickup", effects=["ถ้ามี report card sent พร้อมกัน → รวมเป็นข้อความเดียว (R-18 งบข้อความ)"])
ep("groom.pickUp", "POST", f"{GA}/pick-up", "staff", OF, "US-05-09, US-08-01", "ลูกค้ารับน้องแล้ว", res="AppointmentCard",
   transition="groom_appointment:done→picked_up", rules="R-17",
   effects=["picked_up_at = now; pet_shop_profile.last_groomed_at = done_at", "ตั้ง job next_groom_reminder ตาม R-17", "บิลยังไม่ปิด → แสดงใน todo.pickupsWithoutBill"])
ep("groom.noShow", "POST", f"{GA}/no-show", "staff", OF, "US-07-07", "ลูกค้าไม่มา",
   [F("reason", "string", False, "booking_event.reason", "")], res="AppointmentCard", rules="R-07,R-09", audit="booking.no_show",
   transition="groom_appointment:scheduled→no_show", notify="customer.no_show",
   effects=["ทำได้เมื่อ now ≥ starts_at + no_show_grace_minutes", "ทุก child ของใบจองจบแล้ว → R-07 no_show กับมัดจำ, booking → closed",
            "customer.no_show_count_12m + 1 → R-09"])
ep("groom.cancel", "POST", f"{GA}/cancel", "staff", OF, "US-05-08", "ยกเลิกนัดตัวเดียวในใบจอง",
   [F("reason", "string", True, "booking_event.reason", "≥ 3")], res="BookingDetail", transition="groom_appointment:scheduled|checked_in→cancelled",
   effects=["เป็น child สุดท้ายที่ active → ใช้ flow bookings.cancel แทน (STATUS_NOT_ALLOWED พร้อม hint)", "ลด booking.estimated_total_satang"])
ep("groom.addSurcharge", "POST", f"{GA}/surcharges", "staff", OF, "US-04-05", "เพิ่มค่าบริการหน้างาน",
   [F("surchargeTypeId", "uuid", False, "appointment_surcharge.surcharge_type_id", ""), F("name", "string", True, "appointment_surcharge.name", "1–60"),
    F("amountSatang", "int", True, "appointment_surcharge.amount_satang", "> 0"), F("reason", "string", True, "appointment_surcharge.reason", "≥ 3 ลูกค้าเห็นในบิล")],
   res="AppointmentCard", effects=["อัปเดต groom_appointment.surcharge_total_satang; บิลที่ open อยู่ → เพิ่ม bill_line surcharge"])
ep("groom.removeSurcharge", "DELETE", f"{ST}/appointment-surcharges/{{surchargeId}}", "staff", OF, "US-04-05", "ลบค่าบริการเพิ่ม (ก่อนปิดบิล)", res="AppointmentCard")
ep("groom.jobCard", "GET", f"{GA}/job-card", "staff", ALL, "US-05-07", "Job card", res="JobCard")
ep("groom.myQueue", "GET", f"{ST}/me/queue", "staff", ALL, "US-09-03", "คิวของฉันวันนี้ (Staff app)",
   query=[F("date", "date", False, "", "default วันนี้")], res="AppointmentCard[]", effects=["groomer_id = ผู้ใช้ปัจจุบัน, เรียงตาม starts_at"])

# =========================================================== HOTEL
SY = f"{ST}/stays/{{stayId}}"
ep("stays.today", "GET", f"{ST}/stays", "staff", ALL, "US-06-12", "รายชื่อเข้า-ออก/อยู่ในร้าน",
   query=[F("date", "date", True, "", ""), F("type", "enum", False, "", "arrivals | departures | in_house")], res="StayCard[]")
ep("stays.get", "GET", SY, "staff", ALL, "US-06-08", "รายละเอียดการพัก", res="StayDetail")
ep("stays.saveIntake", "PUT", f"{SY}/intake", "staff", OF, "US-06-08", "ฟอร์มรับฝาก",
   [F("foodBrand", "string", False, "stay_intake.food_brand", ""), F("foodAmount", "string", False, "stay_intake.food_amount", ""),
    F("feedingTimes[]", "time[]", True, "stay_intake.feeding_times", "0–6 เวลา"), F("foodProvidedByOwner", "bool", True, "stay_intake.food_provided_by_owner", ""),
    F("walksPerDay", "int", True, "stay_intake.walks_per_day", "0–6"), F("conditionNote", "string", False, "stay_intake.condition_note", ""),
    F("conditionPhotoIds[]", "uuid[]", False, "stay_intake.condition_photo_ids", "≤ 6"), F("emergencyContactName", "string", True, "stay_intake.emergency_contact_name", ""),
    F("emergencyContactPhone", "string", True, "stay_intake.emergency_contact_phone", "R-22"), F("vetClinicName", "string", False, "stay_intake.vet_clinic_name", ""),
    F("vetClinicPhone", "string", False, "stay_intake.vet_clinic_phone", ""),
    F("medications[]", "object[]", False, "stay_medication.name", "{name, dose, times[] ≥1, instructions}"),
    F("belongings[]", "object[]", False, "stay_belonging.item", "{item, quantity, photoFileId}"), F("complete", "bool", True, "stay_intake.completed_at", "true = ตั้ง completed_at")],
   res="StayDetail", rules="R-22,R-26", effects=["prefill จาก pet_shop_profile + customer.emergency_contact_name + customer.emergency_contact_phone", "แก้ระหว่างพัก (checked_in) → R-26 สร้าง task ใหม่สำหรับอนาคต"])
ep("stays.signAgreement", "POST", f"{SY}/agreement", "staff", OF, "US-06-08", "เซ็นข้อตกลงรับฝาก",
   [F("signerName", "string", True, "consent_document.signer_name", ""), F("signatureFileId", "uuid", True, "consent_document.signature_file_id", "PNG"),
    F("emergencyVetLimitSatang", "int", False, "consent_document.emergency_vet_limit_satang", "≥ 0")], res="StayDetail",
   effects=["body_snapshot = branch_policy.boarding_agreement_text", "เก็บเป็น immutable — เซ็นใหม่ = record ใหม่"])
ep("stays.checkIn", "POST", f"{SY}/check-in", "staff", OF, "US-06-05, US-06-08, US-06-09", "เช็คอินโรงแรม",
   [F("weightGrams", "int", False, "stay.weight_grams_in", ""), F("vaccineOverrideReason", "string", False, "stay.vaccine_override_reason", "บังคับเมื่อ R-11 ไม่ผ่าน")],
   res="StayDetail", rules="R-11,R-26", errors="INTAKE_INCOMPLETE,CONSENT_REQUIRED,VACCINE_REQUIRED,STATUS_NOT_ALLOWED",
   audit="stay.vaccine_override (เมื่อ override)", transition="stay:reserved→checked_in", notify="customer.stay_checked_in",
   effects=["ต้องมี intake completed + agreement", "checked_in_at = now; สร้าง care_task ตาม R-26", "ทำได้ตั้งแต่วัน check_in_date (ก่อนหน้านั้น STATUS_NOT_ALLOWED)"])
ep("stays.changeRoom", "PATCH", f"{SY}/room", "staff", OF, "US-06-04", "ย้ายห้อง (Room map)",
   [F("roomUnitId", "uuid", True, "stay.room_unit_id", "ประเภทเดียวกัน หรือประเภทอื่นพร้อม keepPrice")], res="StayCard", errors="ROOM_TAKEN",
   effects=["ราคาไม่เปลี่ยน (snapshot) เว้นแต่ส่ง repriceToType=true"])
ep("stays.changeDates", "PATCH", f"{SY}/dates", "staff", OF, "US-06-03", "ขยาย/ลดวันพัก",
   [F("checkInDate", "date", False, "stay.check_in_date", "เฉพาะ reserved"), F("checkOutDate", "date", True, "stay.check_out_date", "> checkIn")],
   res="StayCard", rules="R-03,R-28", errors="ROOM_TAKEN,PET_ALREADY_BOOKED",
   effects=["nights/room_total ใหม่ (nightly เดิม); add-on per day ปรับ quantity", "checked_in → สร้าง/ลบ care_task ส่วนต่าง"])
ep("stays.addAddon", "POST", f"{SY}/addons", "staff", OF, "US-06-06", "เพิ่ม add-on ระหว่างพัก",
   [F("serviceId", "uuid", True, "stay_addon.service_id", "scope hotel, is_addon"), F("quantity", "int", False, "stay_addon.quantity", "default 1 / per_day = nights")],
   res="StayDetail")
ep("stays.removeAddon", "DELETE", f"{ST}/stay-addons/{{stayAddonId}}", "staff", OF, "US-06-06", "ลบ add-on (ก่อนปิดบิล)", res="StayDetail")
ep("stays.postUpdate", "POST", f"{SY}/updates", "staff", ALL, "US-06-10", "ส่งรูป/วิดีโออัปเดตน้อง",
   [F("fileIds[]", "uuid[]", True, "pet_photo.file_id", "1–6 ไฟล์ kind stay_update"), F("caption", "string", False, "pet_photo.caption", "≤ 200"),
    F("notifyCustomer", "bool", False, "", "default true")], res="StayDetail", rules="R-18", notify="customer.stay_update",
   effects=["insert pet_photo kind stay", "แจ้งลูกค้าไม่เกิน 1 ข้อความ/วัน/การพัก (dedupe stay_update:{stayId}:{date}) — ส่งลิงก์หน้าอัปเดต"])
ep("stays.checkOut", "POST", f"{SY}/check-out", "staff", OF, "US-06-11", "เช็คเอาท์",
   [F("weightGramsOut", "int", False, "stay.weight_grams_out", ""), F("returnedBelongingIds[]", "uuid[]", True, "stay_belonging.id", "ต้องครบทุกชิ้นหรือส่ง missingNote"),
    F("missingNote", "string", False, "", "")], res="StayDetail", transition="stay:checked_in→checked_out",
   effects=["checked_out_at = now; room_unit.housekeeping = dirty; care_task pending ที่เหลือ → skipped", "สร้าง report_card kind stay draft",
            "เปิด/เติมบิลอัตโนมัติ (bills.openFromBooking)"])
ep("stays.noShow", "POST", f"{SY}/no-show", "staff", OF, "US-07-07", "ไม่มาเช็คอิน", res="StayCard", rules="R-07,R-09", audit="booking.no_show",
   transition="stay:reserved→no_show", effects=["ทำได้หลัง 23:59 ของ check_in_date หรือกดเองพร้อมยืนยัน"])
ep("stays.cancel", "POST", f"{SY}/cancel", "staff", OF, "US-05-08", "ยกเลิกการพักตัวเดียว", [F("reason", "string", True, "booking_event.reason", "")],
   res="BookingDetail", transition="stay:reserved→cancelled")
ep("roomMap.get", "GET", f"{ST}/room-map", "staff", ALL, "US-06-04", "Room map", query=[F("date", "date", True, "", "")], res="RoomMap", rules="R-28")
ep("careTasks.list", "GET", f"{ST}/care-tasks", "staff", ALL, "US-06-09", "งานดูแลวันนี้",
   query=[F("date", "date", True, "", ""), F("status", "enum:care_task_status", False, "care_task.status", ""), F("stayId", "uuid", False, "", "")], res="CareTaskItem[]")
ep("careTasks.done", "POST", f"{ST}/care-tasks/{{taskId}}/done", "staff", ALL, "US-06-09", "ทำงานดูแลแล้ว",
   [F("note", "string", False, "care_task.note", "≤ 200 เช่น กินหมด"), F("photoFileId", "uuid", False, "care_task.photo_file_id", "")],
   res="CareTaskItem", transition="care_task:pending→done", effects=["done_at = now, done_by = ผู้ใช้"])
ep("careTasks.skip", "POST", f"{ST}/care-tasks/{{taskId}}/skip", "staff", ALL, "US-06-09", "ข้ามงาน", [F("note", "string", True, "care_task.note", "≥ 3")],
   res="CareTaskItem", transition="care_task:pending→skipped")

# =========================================================== DAYCARE
ep("daycare.list", "GET", f"{ST}/daycare-visits", "staff", ALL, "US-06-13", "Daycare วันนี้", query=[F("date", "date", True, "", "")], res="DaycareVisitItem[]")
for act, frm, to, st in (("check-in", "reserved", "checked_in", "US-06-13"), ("check-out", "checked_in", "checked_out", "US-06-13"),
                         ("no-show", "reserved", "no_show", "US-07-07"), ("cancel", "reserved", "cancelled", "US-05-08")):
    ep(f"daycare.{act.replace('-', '_')}", "POST", f"{ST}/daycare-visits/{{visitId}}/{act}", "staff", OF, st, f"Daycare {act}",
       [F("reason", "string", act in ("cancel",), "booking_event.reason", "")] if act in ("cancel", "no-show") else [],
       res="DaycareVisitItem", transition=f"daycare_visit:{frm}→{to}", rules="R-11" if act == "check-in" else ("R-07,R-09" if act == "no-show" else ""),
       errors="VACCINE_REQUIRED,STATUS_NOT_ALLOWED" if act == "check-in" else "STATUS_NOT_ALLOWED")

# =========================================================== SLIPS / REFUNDS
ep("slips.list", "GET", f"{ST}/slips", "staff", OF, "US-07-02", "สลิปรอตรวจ", query=[F("status", "enum:slip_status", False, "payment_slip.status", "default submitted")], res="SlipItem[]")
ep("slips.verify", "POST", f"{ST}/slips/{{slipId}}/verify", "staff", OF, "US-07-02", "ยืนยันสลิป (ร้านเช็คเงินเข้าบัญชีแล้ว)",
   [F("amountSatang", "int", True, "payment.amount_satang", "ยอดที่เข้าจริง > 0"), F("confirmDuplicate", "bool", False, "", "ต้อง true ถ้าสลิปซ้ำ"),
    F("approveBooking", "bool", False, "", "true = อนุมัติใบจองต่อในคำสั่งเดียว (ถ้าต้องอนุมัติ)")],
   res="SlipItem", rules="R-05,R-15", errors="DUPLICATE_SLIP_CONFIRM_REQUIRED,STATUS_NOT_ALLOWED", audit="slip.verify",
   transition="payment_slip:submitted→verified; booking:deposit_review→confirmed|awaiting_approval", notify="customer.deposit_confirmed",
   effects=["insert payment (method promptpay, slip_id) → booking.deposit_verified_satang += amount; deposit_status verified",
            "สลิปของบิล (bill_id) → payment ของบิลแทน", "ยอดน้อยกว่าที่ต้องจ่าย → deposit_status คง submitted? ไม่: verified บางส่วน + แสดงยอดค้างในใบจอง"])
ep("slips.reject", "POST", f"{ST}/slips/{{slipId}}/reject", "staff", OF, "US-07-02", "ปฏิเสธสลิป",
   [F("reason", "string", True, "payment_slip.reject_reason", "≥ 3 ลูกค้าเห็น")], res="SlipItem", rules="R-08", audit="slip.reject",
   transition="payment_slip:submitted→rejected; booking:deposit_review→awaiting_deposit|expired", notify="customer.slip_rejected")
ep("refunds.create", "POST", f"{ST}/refunds", "staff", OF, "US-07-05", "บันทึกการคืนเงิน (หลังโอนคืนแล้ว)",
   [F("customerId", "uuid", True, "refund.customer_id", ""), F("bookingId", "uuid", False, "refund.booking_id", ""), F("billId", "uuid", False, "refund.bill_id", ""),
    F("amountSatang", "int", True, "refund.amount_satang", "> 0"), F("mode", "enum:refund_mode", True, "refund.mode", ""),
    F("reason", "string", True, "refund.reason", "≥ 3"), F("proofFileId", "uuid", False, "refund.proof_file_id", "แนะนำเมื่อโอน")],
   rules="R-07", audit="refund.create", res="object refund.*", effects=["mode credit → credit_ledger + balance; booking.deposit_status refunded/credited"])

# =========================================================== BILLS
BL = f"{ST}/bills/{{billId}}"
ep("bills.open", "POST", f"{ST}/bills", "staff", OF, "US-08-01", "เปิดบิล",
   [F("bookingIds[]", "uuid[]", False, "booking.bill_id", "รวมหลายใบจองของลูกค้าเดียวกันได้"), F("customerId", "uuid", False, "bill.customer_id", "บิลขายของไม่มีใบจอง")],
   res="BillDetail", rules="R-15",
   effects=["มีบิล open ของใบจองนั้นอยู่แล้ว → คืนบิลเดิม (idempotent)",
            "สร้าง bill_line จาก: groom_appointment_item (groom_service/groom_addon, performer = groomer_id), appointment_surcharge, stay (stay_night qty = nights), stay_addon, daycare_visit — เฉพาะ child ที่ไม่ใช่ cancelled/no_show",
            "item ที่ผูก customer_package_id → bill_line package_redemption ราคา 0 + package_redemption", "มัดจำ verified → payment method deposit อัตโนมัติ (R-15)",
            "booking.bill_id = bill.id"])
ep("bills.list", "GET", f"{ST}/bills", "staff", OF, "US-08-01", "รายการบิล",
   query=[F("status", "enum:bill_status", False, "bill.status", ""), F("date", "date", False, "", "closed_at หรือ opened_at ตามสถานะ"), F("cursor", "string", False, "", "")],
   res="Paged<BillListItem>")
ep("bills.get", "GET", BL, "staff", OF, "US-08-01", "รายละเอียดบิล", res="BillDetail")
ep("bills.addLine", "POST", f"{BL}/lines", "staff", OF, "US-08-01, US-10-05, US-08-03", "เพิ่มรายการ (สินค้า/ขายแพ็กเกจ/ใช้แพ็กเกจ)",
   [F("lineType", "enum:bill_line_type", True, "bill_line.line_type", "quick_item | package_sale | package_redemption"),
    F("description", "string", False, "bill_line.description", "quick_item บังคับ 1–80"), F("quantity", "int", False, "bill_line.quantity", "1–999"),
    F("unitPriceSatang", "int", False, "bill_line.unit_price_satang", "quick_item บังคับ ≥ 0"), F("packageTemplateId", "uuid", False, "bill_line.ref_id", "package_sale"),
    F("customerPackageId", "uuid", False, "bill_line.ref_id", "package_redemption"), F("petId", "uuid", False, "bill_line.pet_id", "package_sale single_pet / redemption"),
    F("performerId", "uuid", False, "bill_line.performer_id", "")], res="BillDetail", rules="R-14,R-15", errors="BILL_NOT_OPEN,PACKAGE_EXHAUSTED,PACKAGE_EXPIRED,PACKAGE_PET_MISMATCH")
ep("bills.updateLine", "PATCH", f"{ST}/bill-lines/{{lineId}}", "staff", OF, "US-08-02", "ส่วนลดรายบรรทัด/เปลี่ยนช่าง",
   [F("lineDiscountSatang", "int", False, "bill_line.line_discount_satang", "≤ qty × unit"), F("lineDiscountReason", "string", False, "bill_line.line_discount_reason", "บังคับเมื่อ > 0"),
    F("performerId", "uuid", False, "bill_line.performer_id", ""), F("quantity", "int", False, "bill_line.quantity", "quick_item เท่านั้น")],
   res="BillDetail", rules="R-15", errors="BILL_NOT_OPEN,LINE_DISCOUNT_TOO_LARGE,DISCOUNT_LIMIT_EXCEEDED,REASON_REQUIRED", audit="bill.discount",
   effects=["bill_line เป็น append-only ใน ORM? ไม่ — แก้ได้ขณะบิล open โดย delete+insert ใน transaction"])
ep("bills.removeLine", "DELETE", f"{ST}/bill-lines/{{lineId}}", "staff", OF, "US-08-01", "ลบรายการ (quick_item/package)", res="BillDetail", errors="BILL_NOT_OPEN",
   effects=["บรรทัดที่มาจากใบจองลบไม่ได้ (ให้ยกเลิก child แทน)"])
ep("bills.setDiscount", "PATCH", f"{BL}/discount", "staff", OF, "US-08-02", "ส่วนลดท้ายบิล",
   [F("billDiscountSatang", "int", True, "bill.bill_discount_satang", "≤ subtotal"), F("reason", "string", False, "bill.bill_discount_reason", "บังคับเมื่อ > 0")],
   res="BillDetail", rules="R-15", errors="BILL_DISCOUNT_TOO_LARGE,DISCOUNT_LIMIT_EXCEEDED,REASON_REQUIRED", audit="bill.discount")
ep("bills.addPayment", "POST", f"{BL}/payments", "staff", OF, "US-08-04, US-08-03", "รับชำระ",
   [F("method", "enum:payment_method", True, "payment.method", "cash | promptpay | bank_transfer | card_edc | credit"),
    F("tenderedSatang", "int", False, "payment.tendered_satang", "cash บังคับ"), F("amountSatang", "int", False, "payment.amount_satang", "วิธีอื่นบังคับ ≤ due"),
    F("reference", "string", False, "payment.reference", "เลข EDC / เลขอ้างอิงโอน"), F("slipId", "uuid", False, "payment.slip_id", ""),
    F("proofFileId", "uuid", False, "payment.proof_file_id", ""), F("expectedPaidSatang", "int", True, "bill.paid_satang", "ค่าที่หน้าจอเห็น (R-15)")],
   res="BillDetail", rules="R-15,R-30", errors="STALE_BILL,BILL_NOT_OPEN,AMOUNT_EXCEEDS_DUE,INSUFFICIENT_CREDIT,INVALID_AMOUNT", audit="payment.create",
   effects=["credit → credit_ledger (−) reason bill_payment + balance", "ล็อก bill row FOR UPDATE ก่อนตรวจ expectedPaidSatang", "bill.paid_satang/change_satang อัปเดต"])
ep("bills.voidPayment", "POST", f"{ST}/payments/{{paymentId}}/void", "staff", OF, "US-08-04", "ยกเลิกรายการรับเงิน (บิลยัง open)",
   [F("reason", "string", True, "payment.void_reason", "≥ 3")], res="BillDetail", audit="payment.void", errors="BILL_NOT_OPEN,REASON_REQUIRED",
   effects=["credit → คืน credit_ledger reason void_reversal"])
ep("bills.promptpayQr", "GET", f"{BL}/promptpay-qr", "staff", OF, "US-07-01, US-08-04", "QR PromptPay ยอดค้าง", res="PaymentInstruction", rules="R-30",
   errors="PROMPTPAY_NOT_CONFIGURED")
ep("bills.close", "POST", f"{BL}/close", "staff", OF, "US-08-04, US-08-05, US-09-02", "ปิดบิล",
   [F("expectedPaidSatang", "int", True, "bill.paid_satang", "")], res="BillDetail", rules="R-13,R-14,R-15,R-16,R-09",
   errors="BILL_HAS_DUE,STALE_BILL,BILL_NOT_OPEN", audit="bill.close", transition="bill:open→paid; booking:confirmed→closed",
   notify="customer.receipt",
   effects=["ล็อก branch → R-16 receipt_no", "commission_entry ตาม R-13", "package_sale → สร้าง customer_package (R-14)", "package_redemption → sessions_used + 1",
            "มัดจำเกิน → credit (deposit_credit); booking.deposit_status applied", "customer.visit_count + 1, first/last_visit_at",
            "booking ที่ทุก child จบ → closed", "ส่งใบเสร็จทาง LINE ถ้าลูกค้ามี LINE (helpful, economy: skip)"])
ep("bills.void", "POST", f"{BL}/void", "staff", O, "US-08-06", "Void บิลที่ปิดแล้ว",
   [F("reason", "string", True, "bill.void_reason", "≥ 3")], res="BillDetail", rules="R-13,R-14", audit="bill.void", transition="bill:paid→void",
   effects=["commission_entry → reversed", "package_redemption.reversed_at + sessions_used − 1; customer_package ที่ขายในบิลนี้ → void",
            "credit ที่ใช้/ได้ในบิล → ย้อนด้วย credit_ledger void_reversal", "payment ทั้งหมด → voided (เงินจริงคืนผ่าน refunds.create)",
            "receipt_no คงเดิม; booking กลับเป็น confirmed และ bill_id = null"])
ep("bills.receipt", "GET", f"{BL}/receipt", "staff", OF, "US-08-05", "ข้อมูลใบเสร็จสำหรับพิมพ์", res="Receipt", rules="R-31")
ep("bills.sendReceipt", "POST", f"{BL}/send-receipt", "staff", OF, "US-08-05", "ส่งใบเสร็จทาง LINE อีกครั้ง", notify="customer.receipt", rules="R-18,R-19")

# =========================================================== REPORT CARDS
RC = f"{ST}/report-cards/{{reportCardId}}"
ep("reportCards.list", "GET", f"{ST}/report-cards", "staff", ALL, "US-10-01", "Report card", query=[F("status", "enum:report_card_status", False, "report_card.status", "")],
   res="ReportCardDetail[]", effects=["role staff เห็นเฉพาะที่ตัวเองสร้าง"])
ep("reportCards.get", "GET", RC, "staff", ALL, "US-10-01", "รายละเอียด Report card", res="ReportCardDetail")
ep("reportCards.update", "PUT", RC, "staff", ALL, "US-10-01, US-10-02", "กรอก Report card",
   [F("skin", "enum:skin_condition", False, "report_card.skin", "grooming บังคับก่อน submit"), F("ears", "enum:ear_condition", False, "report_card.ears", ""),
    F("nails", "enum:nail_condition", False, "report_card.nails", ""), F("teeth", "enum:teeth_condition", False, "report_card.teeth", ""),
    F("parasites", "enum:parasite_finding", False, "report_card.parasites", ""), F("cooperation", "int", False, "report_card.cooperation", "1–5"),
    F("staffNote", "string", False, "report_card.staff_note", "≤ 500 ลูกค้าเห็น"), F("recommendation", "string", False, "report_card.recommendation", "≤ 300")],
   res="ReportCardDetail", errors="STATUS_NOT_ALLOWED", effects=["แก้ได้เมื่อ draft/pending_review"])
ep("reportCards.submit", "POST", f"{RC}/submit", "staff", ALL, "US-10-01", "ส่ง Report card",
   res="ReportCardDetail", rules="R-18,R-19", transition="report_card:draft→pending_review|sent", notify="customer.report_card",
   effects=["policy report_card_requires_review → pending_review (แจ้งหน้าร้าน) ไม่งั้น sent", "sent: แนบรูป after ≤ 4 รูป (ถ้า photo_consent ≠ denied), ลิงก์หน้า report card ใน LIFF"])
ep("reportCards.approve", "POST", f"{RC}/approve", "staff", OF, "US-10-01", "หน้าร้านตรวจแล้วส่ง", res="ReportCardDetail", transition="report_card:pending_review→sent",
   notify="customer.report_card")

# =========================================================== DASHBOARD / REPORTS / AUDIT / FEEDBACK
ep("dashboard.today", "GET", f"{ST}/dashboard/today", "staff", OF, "US-12-01", "Dashboard วันนี้", res="DashboardToday", rules="R-20",
   effects=["front_desk ไม่เห็น sales.*"])
ep("reports.sales", "GET", f"{ST}/reports/sales", "staff", O, "US-12-02", "รายงานยอดขาย",
   query=[F("from", "date", True, "", ""), F("to", "date", True, "", "≤ 366 วัน"), F("groupBy", "enum", True, "", "day | service | groomer | method")],
   res="SalesReport", rules="R-20", effects=["นับบิล status paid ตาม closed_at (วันท้องถิ่น); void ไม่นับ"])
ep("reports.commissions", "GET", f"{ST}/reports/commissions", "staff", O, "US-12-03", "รายงานค่ามือ",
   query=[F("from", "date", True, "", ""), F("to", "date", True, "", "")], res="CommissionReport", rules="R-13")
ep("reports.occupancy", "GET", f"{ST}/reports/occupancy", "staff", O, "US-12-04", "Occupancy", query=[F("from", "date", True, "", ""), F("to", "date", True, "", "")],
   res="OccupancyReport")
ep("exports.csv", "GET", f"{ST}/exports/{{type}}.csv", "staff", O, "US-12-06", "Export CSV (customers | pets | bills | bill_lines | commissions | bookings)",
   query=[F("from", "date", False, "", ""), F("to", "date", False, "", "")], res="text/csv (UTF-8 BOM, คอลัมน์ภาษาอังกฤษ snake_case, เงินเป็นบาท 2 ตำแหน่ง)",
   audit="data.export")
ep("audit.list", "GET", f"{ST}/audit-logs", "staff", O, "US-13-07", "Audit log",
   query=[F("action", "string", False, "audit_log.action", ""), F("from", "date", False, "", ""), F("to", "date", False, "", ""), F("cursor", "string", False, "", "")],
   res="Paged<AuditLogItem>")
ep("feedback.create", "POST", f"{ST}/feedback", "staff", ALL, "US-13-13", "แจ้งปัญหา/ขอ feature",
   [F("pageUrl", "string", True, "feedback_report.page_url", ""), F("message", "string", True, "feedback_report.message", "5–2000"),
    F("screenshotFileId", "uuid", False, "feedback_report.screenshot_file_id", "kind feedback"), F("appVersion", "string", False, "feedback_report.app_version", "")],
   notify="admin.feedback")

# =========================================================== LIFF (customer)
ep("liff.session", "POST", f"{LF}/session", "public", "", "US-01-01", "เปิด LIFF: แลก ID token เป็น session",
   [F("idToken", "string", True, "line_identity.line_user_id", "liff.getIDToken() — verify กับ line_channel.login_channel_id ของสาขา")],
   res="LiffSession", errors="LINE_TOKEN_INVALID,LINE_NOT_CONNECTED",
   effects=["upsert line_identity (provider_id ของ line_channel, sub) + display_name/picture", "มี customer → session subject customer (cookie `cid` 30 วัน)",
            "ไม่มี → session แบบยังไม่ลงทะเบียน (registered=false)"])
ep("liff.register", "POST", f"{LF}/register", "customer", "", "US-11-01, US-13-08, US-03-12", "ลงทะเบียน + ยอมรับ PDPA",
   [F("firstName", "string", True, "owner_profile.first_name", "1–60"), F("lastName", "string", False, "owner_profile.last_name", ""),
    F("nickname", "string", False, "owner_profile.nickname", ""), F("phone", "string", True, "owner_profile.phone_e164", "R-22"),
    F("privacyVersion", "string", True, "consent_record.version", "ต้องเท่าเวอร์ชันล่าสุด"), F("termsVersion", "string", True, "consent_record.version", ""),
    F("photoConsent", "bool", True, "customer.photo_consent", "true → granted, false → denied")],
   res="LiffSession", rules="R-22", errors="INVALID_PHONE,LINK_REQUEST_PENDING",
   effects=["insert consent_record ×3 (privacy_notice, terms_of_service, photo_consent)", "เบอร์ตรงกับลูกค้าเดิมของร้าน → สร้าง customer_link_request (ไม่ผูกเอง) แจ้งหน้าร้าน",
            "ไม่ตรง → owner_profile + customer (source_channel line_liff)"], notify="staff.link_request")
ep("liff.me", "GET", f"{LF}/me", "customer", "", "US-11-01", "โปรไฟล์ของฉัน", res="MyProfile")
ep("liff.updateMe", "PATCH", f"{LF}/me", "customer", "", "US-11-01, US-03-12", "แก้โปรไฟล์",
   [F("firstName", "string", False, "owner_profile.first_name", ""), F("lastName", "string", False, "owner_profile.last_name", ""),
    F("nickname", "string", False, "owner_profile.nickname", ""), F("phone", "string", False, "owner_profile.phone_e164", "R-22"),
    F("photoConsent", "bool", False, "customer.photo_consent", "insert consent_record ใหม่")], res="MyProfile")
ep("liff.shop", "GET", f"{LF}/shop", "customer", "", "US-11-03", "ข้อมูลร้าน", res="ShopPublic")
ep("liff.pets", "GET", f"{LF}/pets", "customer", "", "US-11-02", "น้องของฉัน", res="MyPet[]")
ep("liff.createPet", "POST", f"{LF}/pets", "customer", "", "US-11-02", "เพิ่มน้อง",
   [F("name", "string", True, "pet.name", ""), F("species", "enum:species", True, "pet.species", ""), F("breed", "string", False, "pet.breed", ""),
    F("sex", "enum:pet_sex", True, "pet.sex", ""), F("birthDate", "date", False, "pet.birth_date", ""), F("ageEstimateMonths", "int", False, "pet.age_estimate_months", ""),
    F("neutered", "bool", False, "pet.neutered", ""), F("coatType", "enum:coat_type", True, "pet.coat_type", "LIFF บังคับเลือก (มีรูปตัวอย่าง)"),
    F("weightGrams", "int", False, "pet_weight.weight_grams", "source customer"), F("profileFileId", "uuid", False, "pet.profile_file_id", "")], res="MyPet")
ep("liff.updatePet", "PATCH", f"{LF}/pets/{{petId}}", "customer", "", "US-11-02", "แก้ข้อมูลน้อง", [F("<same as create>", "any", False, "pet.name", "")], res="MyPet")
ep("liff.addVaccination", "POST", f"{LF}/pets/{{petId}}/vaccinations", "customer", "", "US-11-02, US-06-05", "ส่งหลักฐานวัคซีน",
   [F("vaccineCode", "string", True, "pet_vaccination.vaccine_code", ""), F("administeredOn", "date", False, "pet_vaccination.administered_on", ""),
    F("expiresOn", "date", True, "pet_vaccination.expires_on", ""), F("proofFileId", "uuid", True, "pet_vaccination.proof_file_id", "kind vaccine_proof")],
   res="VaccinationItem", notify="staff.vaccine_review", effects=["status pending_review, source customer"])
ep("liff.groomSlots", "POST", f"{LF}/availability/groom-slots", "customer", "", "US-11-03", "เวลาว่างกรูม (ลูกค้า)",
   [F("date", "date", True, "", ""), F("petId", "uuid", True, "", "ต้องเป็นน้องของลูกค้า"), F("serviceIds[]", "uuid[]", True, "", "online_bookable"),
    F("addonIds[]", "uuid[]", False, "", ""), F("groomerId", "uuid", False, "", ""), F("sizeTierId", "uuid", False, "", "ลูกค้าเลือกเองเมื่อไม่มีน้ำหนัก")],
   res="SlotList", rules="R-01,R-02,R-03,R-04,R-12", errors="PRICE_NOT_FOUND,WEIGHT_REQUIRED,CUSTOMER_BLACKLISTED,MODULE_DISABLED",
   effects=["ไม่ส่ง groomerName ของช่างที่ลูกค้าเลือก any? ส่ง (แสดงชื่อเล่นช่าง)", "rate limit 30/นาที/ผู้ใช้"])
ep("liff.hotelAvailability", "GET", f"{LF}/availability/hotel", "customer", "", "US-11-04", "ห้องว่าง (ลูกค้า)",
   query=[F("checkInDate", "date", True, "", ""), F("checkOutDate", "date", True, "", ""), F("petId", "uuid", True, "", "")], res="HotelAvailability", rules="R-12,R-28")
ep("liff.daycareAvailability", "GET", f"{LF}/availability/daycare", "customer", "", "US-11-05", "ที่ว่าง Daycare (ลูกค้า)",
   query=[F("date", "date", True, "", ""), F("petId", "uuid", True, "", "")], res="DaycareAvailability", rules="R-29")
ep("liff.quote", "POST", f"{LF}/quotes", "customer", "", "US-11-03, US-11-04, US-11-05", "สรุปราคา/มัดจำก่อนยืนยัน",
   [F("groom[]", "object[]", False, "", ""), F("stays[]", "object[]", False, "", ""), F("daycare[]", "object[]", False, "", "")], res="Quote", rules="R-03,R-06,R-08,R-11")
ep("liff.createBooking", "POST", f"{LF}/bookings", "customer", "", "US-11-03, US-11-04, US-11-05, US-11-06, US-05-02", "ลูกค้ายืนยันการจอง",
   [F("groom[].petId", "uuid", True, "groom_appointment.pet_id", ""), F("groom[].serviceIds[]", "uuid[]", True, "groom_appointment_item.service_id", ""),
    F("groom[].addonIds[]", "uuid[]", False, "groom_appointment_item.service_id", ""), F("groom[].startsAt", "datetime", True, "groom_appointment.starts_at", "ตรวจกับ R-04 ใหม่ฝั่ง server"),
    F("groom[].groomerId", "uuid", False, "groom_appointment.groomer_id", "ไม่ส่ง = any"), F("groom[].sizeTierId", "uuid", False, "groom_appointment.size_tier_id", ""),
    F("stays[].petId", "uuid", True, "stay.pet_id", ""), F("stays[].roomTypeId", "uuid", True, "stay.room_type_id", ""),
    F("stays[].checkInDate", "date", True, "stay.check_in_date", ""), F("stays[].checkOutDate", "date", True, "stay.check_out_date", ""),
    F("stays[].expectedCheckInTime", "time", False, "stay.expected_check_in_time", ""), F("stays[].expectedCheckOutTime", "time", False, "stay.expected_check_out_time", ""),
    F("stays[].inHeat", "bool", True, "stay.in_heat", ""), F("stays[].addonServiceIds[]", "uuid[]", False, "stay_addon.service_id", ""),
    F("stays[].bathBeforeCheckout", "object", False, "stay.bundle_appointment_id", "{serviceIds, startsAt} US-11-06"),
    F("daycare[].petId", "uuid", True, "daycare_visit.pet_id", ""), F("daycare[].sessionTypeId", "uuid", True, "daycare_visit.session_type_id", ""),
    F("daycare[].visitDate", "date", True, "daycare_visit.visit_date", ""), F("customerNote", "string", False, "booking.customer_note", "≤ 300"),
    F("acceptedPolicy", "bool", True, "", "ต้อง true (ลูกค้ากดยอมรับนโยบายยกเลิก)")],
   res="MyBookingDetail", rules="R-03,R-04,R-06,R-08,R-09,R-10,R-11,R-12,R-23,R-28,R-29",
   errors="SLOT_TAKEN,ROOM_TAKEN,PET_ALREADY_BOOKED,DAYCARE_FULL,CUSTOMER_BLACKLISTED,VACCINE_REQUIRED,OUTSIDE_BOOKING_WINDOW,PRICE_NOT_FOUND,MODULE_DISABLED",
   transition="booking:∅→awaiting_deposit|awaiting_approval|confirmed", notify="customer.booking_received|customer.booking_confirmed, staff.new_booking",
   effects=["channel = line_liff (หรือ booking_link ถ้ามาจากลิงก์จอง), created_by_type customer",
            "R-11 ไม่ผ่านแต่มี pendingReview/อัปโหลดแล้ว → requiresApproval = true; missing/expired → VACCINE_REQUIRED",
            "deposit > 0 → awaiting_deposit + hold (R-08) + คืน PaymentInstruction (R-30)", "ใช้ reply ยืนยันถ้าทำได้ (SP-03) ไม่งั้น push essential"])
ep("liff.bookings", "GET", f"{LF}/bookings", "customer", "", "US-11-08", "นัดของฉัน", query=[F("scope", "enum", False, "", "upcoming | past")], res="MyBookingItem[]", rules="R-21")
ep("liff.booking", "GET", f"{LF}/bookings/{{bookingId}}", "customer", "", "US-11-08", "รายละเอียดนัด", res="MyBookingDetail", rules="R-07,R-21")
ep("liff.uploadSlip", "POST", f"{LF}/bookings/{{bookingId}}/slips", "customer", "", "US-11-07, US-07-02", "ส่งสลิปมัดจำ",
   [F("fileId", "uuid", True, "payment_slip.file_id", "kind slip"), F("qrPayload", "string", False, "payment_slip.qr_payload", "ข้อความจาก QR บนสลิป (client decode)")],
   res="MyBookingDetail", rules="R-05,R-08", errors="HOLD_EXPIRED,STATUS_NOT_ALLOWED", transition="booking:awaiting_deposit→deposit_review",
   notify="staff.slip_submitted", effects=["parse R-05 → trans_ref, duplicate_of_slip_id", "deposit_status submitted; ล้าง hold_expires_at"])
ep("liff.cancel", "POST", f"{LF}/bookings/{{bookingId}}/cancel", "customer", "", "US-11-08", "ลูกค้ายกเลิกเอง",
   [F("customerChoice", "enum", False, "", "refund | credit (เมื่อ policy customer_choice)"), F("reason", "string", False, "booking.cancel_reason", "")],
   res="MyBookingDetail", rules="R-07,R-21,R-09", errors="STATUS_NOT_ALLOWED", transition="booking:*→cancelled", notify="staff.booking_cancelled")
ep("liff.reschedule", "POST", f"{LF}/bookings/{{bookingId}}/reschedule", "customer", "", "US-11-08", "ลูกค้าเลื่อนนัดกรูมเอง",
   [F("appointmentId", "uuid", True, "groom_appointment.id", ""), F("startsAt", "datetime", True, "groom_appointment.starts_at", "R-04"),
    F("groomerId", "uuid", False, "groom_appointment.groomer_id", "")], res="MyBookingDetail", rules="R-04,R-21",
   errors="TOO_LATE_TO_RESCHEDULE,RESCHEDULE_LIMIT,SLOT_TAKEN", notify="staff.booking_rescheduled", effects=["booking.reschedule_count + 1"])
ep("liff.ics", "GET", f"{LF}/bookings/{{bookingId}}/calendar.ics", "customer", "", "US-11-10", "ไฟล์เพิ่มลงปฏิทิน", res="text/calendar",
   effects=["1 VEVENT ต่อนัด/การพัก, LOCATION = ที่อยู่ร้าน, URL = Google Maps"])
ep("liff.stayUpdates", "GET", f"{LF}/stays/{{stayId}}/updates", "customer", "", "US-06-10", "หน้าอัปเดตน้องระหว่างพัก", res="StayUpdates")
ep("liff.reportCard", "GET", f"{LF}/report-cards/{{reportCardId}}", "customer", "", "US-10-01, US-10-02", "ดู Report card", res="ReportCardDetail",
   effects=["เฉพาะ status sent ของลูกค้าคนนี้; ไม่ส่ง internal fields"])
ep("liff.rate", "POST", f"{LF}/report-cards/{{reportCardId}}/rating", "customer", "", "US-10-03", "ให้ดาว",
   [F("rating", "int", True, "report_card.customer_rating", "1–5"), F("feedback", "string", False, "report_card.customer_feedback", "≤ 1000 ถึงร้านเท่านั้น")],
   res="ReportCardDetail", notify="staff.low_rating (rating ≤ 3)", effects=["แสดงปุ่มรีวิว Google ให้ทุกคนเท่ากัน ไม่ขึ้นกับดาว (นโยบาย Google)"])
ep("liff.reviewClick", "POST", f"{LF}/report-cards/{{reportCardId}}/review-click", "customer", "", "US-10-03", "บันทึกการกดลิงก์รีวิว",
   effects=["report_card.google_review_clicked_at = now (ครั้งแรก)"])
ep("liff.packages", "GET", f"{LF}/packages", "customer", "", "US-10-06", "แพ็กเกจคงเหลือ", res="CustomerPackageItem[]")
ep("liff.receipt", "GET", f"{LF}/receipts/{{billId}}", "customer", "", "US-08-05", "ใบเสร็จ", res="Receipt")
ep("liff.payPage", "GET", f"{LF}/pay/{{billId}}", "customer", "", "US-07-08", "หน้าจ่ายยอดคงเหลือ", res="PaymentInstruction", rules="R-30")
ep("liff.payUploadSlip", "POST", f"{LF}/pay/{{billId}}/slips", "customer", "", "US-07-08", "ส่งสลิปยอดคงเหลือ",
   [F("fileId", "uuid", True, "payment_slip.file_id", ""), F("qrPayload", "string", False, "payment_slip.qr_payload", "")], res="PaymentInstruction", rules="R-05",
   notify="staff.slip_submitted")
ep("liff.dataRequest", "POST", f"{LF}/data-requests", "customer", "", "US-13-08", "ขอดู/ลบข้อมูลส่วนบุคคล",
   [F("type", "enum:data_request_type", True, "data_request.type", "")], notify="admin.data_request")

# =========================================================== PUBLIC / WEBHOOK / CRON
ep("public.branch", "GET", "/api/v1/public/branches/{bookingSlug}", "public", "", "US-02-07", "หน้า landing ลิงก์จอง",
   res="ShopPublic", effects=["cache 60 วินาที; ปุ่ม 'จองผ่าน LINE' → liffUrl, ไม่มี LINE → แสดงเบอร์โทร"])
ep("webhook.line", "POST", "/api/webhooks/line/{messagingChannelId}", "line", "", "US-02-06, US-13-06", "LINE webhook",
   [F("x-line-signature", "header", True, "line_channel.channel_secret_enc", "HMAC-SHA256(body, channel secret) base64 — เทียบแบบ constant-time")],
   errors="WEBHOOK_SIGNATURE_INVALID", rules="R-19",
   effects=["follow/unfollow → line_identity.is_friend", "message → เก็บ reply token ใน memory/DB 50 วินาที (SP-03) และตอบด้วยข้อความคำสั่ง ('นัดของฉัน', 'จองคิว')",
            "ตอบ 200 ภายใน 1 วินาที — งานหนักใส่ scheduled_job"])
ep("cron.tick", "POST", "/api/cron/tick", "cron", "", "US-05-02, US-07-06, US-10-04, US-12-05", "ประมวลผล scheduled_job",
   [F("x-cron-secret", "header", True, "", "= env CRON_SECRET")], res="object {processed: number, failed: number}", errors="CRON_FORBIDDEN",
   effects=["SELECT … WHERE status='pending' AND run_at <= now ORDER BY run_at LIMIT 50 FOR UPDATE SKIP LOCKED", "แต่ละงานใน transaction ของตัวเอง; error → attempts+1, run_at + 2^attempts นาที, ครบ 5 → failed",
            "ถูกเรียกโดย cron ภายนอกฟรี (เช่น GitHub Actions schedule / cron-job.org) ทุก 1–5 นาที"])
ep("health", "GET", "/api/health", "public", "", "US-13-09", "health check", res="object {ok: true, db: 'ok', version: string}")

# =========================================================== ADMIN
ep("admin.login", "POST", "/api/v1/auth/admin/login", "public", "", "US-13-10", "ทีมแพลตฟอร์มเข้าสู่ระบบ",
   [F("email", "string", True, "platform_admin.email", ""), F("password", "string", True, "platform_admin.password_hash", "")], res="object {admin}",
   rules="R-24", errors="INVALID_CREDENTIALS,ACCOUNT_LOCKED", effects=["session 12 ชม. cookie `aid`"])
ep("admin.orgs", "GET", f"{AD}/organizations", "admin", "", "US-13-10", "รายชื่อร้าน", res="OrgListItem[]")
ep("admin.createOrg", "POST", f"{AD}/organizations", "admin", "", "US-13-10, US-13-14", "สร้างร้านใหม่",
   [F("name", "string", True, "organization.name", ""), F("slug", "string", True, "organization.slug", "^[a-z0-9-]{3,40}$"),
    F("branchName", "string", True, "branch.name", ""), F("bookingSlug", "string", True, "branch.booking_slug", "^[a-z0-9-]{3,40}$"),
    F("ownerEmail", "string", True, "staff_user.email", ""), F("ownerName", "string", True, "staff_user.display_name", ""),
    F("modules.grooming", "bool", True, "branch.module_grooming", ""), F("modules.hotel", "bool", True, "branch.module_hotel", ""),
    F("modules.daycare", "bool", True, "branch.module_daycare", "")],
   res="object {organization: OrgListItem, ownerInviteUrl: string}", errors="SLUG_TAKEN,EMAIL_TAKEN",
   effects=["transaction: organization(pilot) + branch + branch_policy default + branch_hours 7 วัน (09:00–18:00) + rate_plan default + size_tier มาตรฐาน (หมา XS–XL, แมว S/L) + groom_station 1 โต๊ะ + owner invite",
            "consent_record ฝั่งร้าน (dpa, terms_of_service) ทำตอน owner รับคำเชิญ"])
ep("admin.updateOrg", "PATCH", f"{AD}/organizations/{{orgId}}", "admin", "", "US-13-10", "เปลี่ยนสถานะร้าน",
   [F("status", "enum:org_status", True, "organization.status", "")], res="OrgListItem", effects=["suspended → ทุก session ของร้านถูกปฏิเสธ (403) ยกเว้น admin"])
ep("admin.setLineChannel", "PUT", f"{AD}/branches/{{branchId}}/line-channel", "admin", "", "US-02-06", "ใส่ค่าการเชื่อม LINE OA ของร้าน",
   [F("providerId", "string", True, "line_channel.provider_id", "ตาม ADR-001"), F("messagingChannelId", "string", True, "line_channel.messaging_channel_id", ""),
    F("channelSecret", "string", True, "line_channel.channel_secret_enc", "เข้ารหัสก่อนเก็บ — ห้าม log"), F("channelAccessToken", "string", True, "line_channel.channel_access_token_enc", "เข้ารหัส"),
    F("loginChannelId", "string", True, "line_channel.login_channel_id", ""), F("liffId", "string", True, "line_channel.liff_id", ""),
    F("botBasicId", "string", False, "line_channel.bot_basic_id", "@xxxx"), F("monthlyPushQuota", "int", True, "line_channel.monthly_push_quota", "ตามแพ็ก OA")],
   res="LineStatus", audit="line_channel.update")
ep("admin.verifyLine", "POST", f"{AD}/branches/{{branchId}}/line-channel/verify", "admin", "", "US-02-06", "ทดสอบการเชื่อม + ตั้ง webhook + rich menu",
   res="LineStatus", errors="LINE_API_ERROR", transition="line_channel:pending|error→active",
   effects=["GET bot info, PUT webhook endpoint, test webhook, สร้าง rich menu มาตรฐาน (จองคิว/นัดของฉัน/น้องของฉัน/ติดต่อร้าน)"])
ep("admin.supportStart", "POST", f"{AD}/support-sessions", "admin", "", "US-13-11", "เข้าโหมดช่วยเหลือ (อ่านอย่างเดียว)",
   [F("organizationId", "uuid", True, "support_access_log.organization_id", ""), F("reason", "string", True, "support_access_log.reason", "≥ 10"),
    F("ticketRef", "string", False, "support_access_log.ticket_ref", "")], res="object {redirectUrl}", audit="support.session_start",
   effects=["สร้าง session staff-like ที่ support_access_log_id มีค่า (60 นาที) — ทุก request เขียนถูกปฏิเสธ SUPPORT_READ_ONLY", "แจ้งเจ้าของร้าน"], notify="owner.support_access")
ep("admin.supportEnd", "POST", f"{AD}/support-sessions/{{supportId}}/end", "admin", "", "US-13-11", "จบโหมดช่วยเหลือ", audit="support.session_end")
ep("admin.feedback", "GET", f"{AD}/feedback", "admin", "", "US-13-13", "รายการแจ้งปัญหา", res="FeedbackItem[]")
ep("admin.updateFeedback", "PATCH", f"{AD}/feedback/{{feedbackId}}", "admin", "", "US-13-13", "อัปเดตสถานะแจ้งปัญหา",
   [F("status", "enum:feedback_status", True, "feedback_report.status", "")], res="FeedbackItem")
ep("admin.dataRequests", "GET", f"{AD}/data-requests", "admin", "", "US-13-08", "คำขอ PDPA", res="DataRequestItem[]")
ep("admin.resolveDataRequest", "POST", f"{AD}/data-requests/{{requestId}}/resolve", "admin", "", "US-13-08", "ดำเนินการคำขอ PDPA",
   [F("status", "enum:data_request_status", True, "data_request.status", "done | rejected"), F("note", "string", False, "data_request.note", "")],
   res="DataRequestItem", audit="pdpa.erase (type delete)",
   effects=["access → สร้างไฟล์ JSON ข้อมูลของคนนั้นส่งทาง LINE/อีเมล", "delete → ล้างค่าส่วนตัวใน owner_profile (ชื่อ = 'ลบแล้ว', เบอร์/อีเมล/ที่อยู่ null), erased_at = now; บิลยังเก็บตามกฎหมายบัญชี"])
ep("admin.analytics", "GET", f"{AD}/analytics/pilot", "admin", "", "US-13-12", "ตัวชี้วัดนำร่อง", query=[F("from", "date", True, "", ""), F("to", "date", True, "", "")],
   res="PilotAnalytics")
ep("admin.holidays", "PUT", f"{AD}/public-holidays/{{year}}", "admin", "", "US-13-03", "ตั้งวันหยุดราชการประจำปี",
   [F("days[].date", "date", True, "public_holiday.holiday_date", ""), F("days[].nameTh", "string", True, "public_holiday.name_th", "")])
