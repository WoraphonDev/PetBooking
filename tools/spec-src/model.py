# -*- coding: utf-8 -*-
"""
Single source of truth for the MVP data model.
Generates: packages/db/src/schema.ts (Drizzle), migrations-custom SQL, and docs/spec/02-data-model.md
Column tuple: (name, type, nullable, default, ref, desc)
  type: uuid text int bool date time ts jsonb float text[] uuid[] time[] e:<enum> e[]:<enum>
  default: None | 'now' | 'random' | literal (bool/int/str) | '[]' | 'sql:<expr>'
  ref: 'table.col' or 'table.col|cascade' / '|setnull'
"""

ENUMS = {
 "org_status": ["pilot", "active", "suspended"],
 "admin_status": ["active", "disabled"],
 "staff_role": ["owner", "front_desk", "staff"],
 "staff_status": ["invited", "active", "disabled"],
 "session_subject": ["staff", "customer", "platform_admin"],
 "actor_type": ["staff", "customer", "system", "platform_admin"],
 "species": ["dog", "cat", "other"],
 "pet_sex": ["male", "female", "unknown"],
 "pet_status": ["active", "deceased", "rehomed"],
 "coat_type": ["short", "long", "double", "curly", "wire", "hairless", "unknown"],
 "coat_group": ["short", "long", "any"],
 "temperament_flag": ["bites", "needs_muzzle", "dryer_fear", "noise_sensitive", "same_groomer_only",
                      "dog_reactive", "cat_reactive", "anxious", "other"],
 "vaccine_status": ["pending_review", "verified", "rejected"],
 "record_source": ["shop", "customer", "import"],
 "photo_consent": ["unknown", "granted", "denied"],
 "link_request_status": ["pending", "approved", "rejected"],
 "file_kind": ["pet_profile", "before", "after", "stay_update", "vaccine_proof", "slip", "signature",
               "consent_pdf", "logo", "room_photo", "service_photo", "feedback", "import_csv", "proof", "staff_photo"],
 "photo_kind": ["profile", "before", "after", "stay"],
 "record_status": ["active", "archived"],
 "closure_scope": ["all", "grooming", "hotel", "daycare"],
 "closure_source": ["manual", "public_holiday"],
 "deposit_type": ["none", "fixed", "percent"],
 "cancel_refund_mode": ["refund", "credit", "customer_choice"],
 "promptpay_type": ["phone", "national_id", "tax_id", "ewallet"],
 "line_channel_status": ["pending", "active", "error"],
 "service_scope": ["grooming", "hotel", "daycare"],
 "service_category": ["bath", "haircut", "spa", "nail", "ear", "teeth", "deshed", "other",
                      "hotel_addon", "daycare_addon"],
 "rate_channel": ["all", "walk_in", "line", "ota"],
 "room_unit_status": ["active", "maintenance", "archived"],
 "housekeeping_status": ["clean", "dirty"],
 "daycare_session": ["full_day", "morning", "afternoon"],
 "package_share_scope": ["single_pet", "household"],
 "commission_type": ["percent", "fixed"],
 "booking_channel": ["walk_in", "phone", "chat", "line_liff", "booking_link", "ota", "import"],
 "booking_status": ["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed",
                    "cancelled", "expired", "closed"],
 "deposit_status": ["not_required", "pending", "submitted", "verified", "rejected", "refunded",
                    "credited", "forfeited", "applied"],
 "groomer_preference": ["any", "specific"],
 "groom_status": ["scheduled", "checked_in", "in_progress", "done", "picked_up", "no_show", "cancelled"],
 "stay_status": ["reserved", "checked_in", "checked_out", "no_show", "cancelled"],
 "daycare_status": ["reserved", "checked_in", "checked_out", "no_show", "cancelled"],
 "consent_doc_kind": ["grooming_consent", "boarding_agreement"],
 "care_task_type": ["feed", "medication", "walk", "clean", "other"],
 "care_task_status": ["pending", "done", "skipped"],
 "slip_status": ["submitted", "verified", "rejected"],
 "payment_method": ["cash", "promptpay", "bank_transfer", "card_edc", "deposit", "credit"],
 "payment_status": ["posted", "voided"],
 "refund_mode": ["bank_transfer", "cash", "credit"],
 "credit_reason": ["cancellation_credit", "deposit_credit", "bill_payment", "void_reversal", "adjustment"],
 "bill_status": ["open", "paid", "void"],
 "bill_line_type": ["groom_service", "groom_addon", "surcharge", "stay_night", "stay_addon", "daycare",
                    "quick_item", "package_sale", "package_redemption"],
 "customer_package_status": ["active", "exhausted", "expired", "void"],
 "commission_status": ["earned", "reversed"],
 "report_card_kind": ["grooming", "stay"],
 "report_card_status": ["draft", "pending_review", "sent"],
 "skin_condition": ["normal", "dry", "redness", "lesion"],
 "ear_condition": ["clean", "dirty", "suspected_infection"],
 "nail_condition": ["trimmed", "ok", "overgrown"],
 "teeth_condition": ["ok", "tartar", "bad_breath"],
 "parasite_finding": ["none", "fleas", "ticks", "both"],
 "notification_channel": ["line_reply", "line_push", "web_push", "email"],
 "notification_status": ["queued", "sent", "failed", "skipped"],
 "notification_skip_reason": ["quota_exhausted", "economy_mode", "pet_inactive", "no_recipient",
                              "opted_out", "duplicate"],
 "recipient_type": ["customer", "staff", "platform_admin"],
 "job_type": ["expire_hold", "reminder_24h", "next_groom_reminder", "owner_daily_summary",
              "approval_overdue", "care_task_overdue_scan", "recompute_reliability", "package_expiry",
              "cleanup_uncommitted_files"],
 "job_status": ["pending", "running", "done", "failed", "cancelled"],
 "legal_doc": ["privacy_notice", "terms_of_service", "dpa", "photo_consent"],
 "consent_subject": ["owner_profile", "organization"],
 "data_request_type": ["access", "delete"],
 "data_request_status": ["open", "done", "rejected"],
 "feedback_status": ["new", "acknowledged", "done"],
 "import_kind": ["customers_pets", "services"],
 "import_status": ["validating", "ready", "importing", "done", "failed"],
}

ENUM_DESC = {
 "booking_status": "สถานะใบจอง (ดู state machine ใน 03)",
 "groom_status": "สถานะนัดกรูมรายตัว (ดู 03)",
 "deposit_status": "สถานะมัดจำ (ดู 03)",
 "coat_type": "ประเภทขนในโปรไฟล์ → แปลงเป็น coat_group ตาม R-02",
}

ORG = ("organization_id", "uuid", False, None, "organization.id", "tenant key — ทุก query ต้องกรองด้วยค่านี้")
BR = ("branch_id", "uuid", False, None, "branch.id", "สาขา")

# Each table: dict(name, group, desc, stories, cols, idx, checks, updated, pk)
T = []
def tbl(name, group, desc, stories, cols, idx=None, checks=None, updated=True, pk="id"):
    T.append(dict(name=name, group=group, desc=desc, stories=stories, cols=cols,
                  idx=idx or [], checks=checks or [], updated=updated, pk=pk))

# ===================== A. Platform & tenancy =====================
G = "A. Platform & Tenancy"
tbl("organization", G, "ธุรกิจ (tenant) 1 รายต่อ 1 record", "US-13-02, US-13-10", [
 ("name", "text", False, None, None, "ชื่อธุรกิจ"),
 ("slug", "text", False, None, None, "a-z0-9- ยาว 3–40, unique ทั้งระบบ"),
 ("status", "e:org_status", False, "pilot", None, "pilot = นำร่องฟรี"),
 ("default_locale", "text", False, "th", None, "'th' ใน MVP"),
], idx=[("unique", ["slug"], None)])

tbl("branch", G, "สาขา/หน้าร้าน (MVP มี 1 สาขาต่อธุรกิจ แต่ทุกตารางอ้างได้)", "US-02-01, US-02-02, US-02-03", [
 ORG,
 ("name", "text", False, None, None, "ชื่อร้านที่ลูกค้าเห็น"),
 ("booking_slug", "text", False, None, None, "ใช้ใน URL จอง /b/{booking_slug} unique ทั้งระบบ"),
 ("phone", "text", True, None, None, "E.164 เช่น +66812345678"),
 ("address_line", "text", True, None, None, "บ้านเลขที่/ถนน"),
 ("subdistrict", "text", True, None, None, "ตำบล/แขวง"),
 ("district", "text", True, None, None, "อำเภอ/เขต"),
 ("province", "text", True, None, None, "จังหวัด"),
 ("postal_code", "text", True, None, None, "5 หลัก"),
 ("latitude", "float", True, None, None, ""),
 ("longitude", "float", True, None, None, ""),
 ("logo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("facebook_url", "text", True, None, None, ""),
 ("instagram_url", "text", True, None, None, ""),
 ("timezone", "text", False, "Asia/Bangkok", None, "IANA tz ใช้คำนวณวันที่ท้องถิ่นทั้งหมด"),
 ("module_grooming", "bool", False, True, None, "เปิดโมดูลกรูม"),
 ("module_hotel", "bool", False, False, None, "เปิดโมดูลโรงแรม"),
 ("module_daycare", "bool", False, False, None, "เปิดโมดูล Daycare"),
 ("promptpay_type", "e:promptpay_type", True, None, None, "ประเภท PromptPay ID"),
 ("promptpay_id", "text", True, None, None, "เก็บแบบตัวเลขล้วน (เบอร์ 10 หลัก / 13 หลัก)"),
 ("promptpay_account_name", "text", True, None, None, "ชื่อบัญชีที่ลูกค้าเห็นก่อนโอน"),
 ("receipt_prefix", "text", False, "R", None, "คำนำหน้าเลขใบเสร็จ A-Z 1–3 ตัว"),
 ("receipt_year_be", "int", False, 0, None, "ปี พ.ศ. ของ counter ปัจจุบัน (รีเซ็ตเลขเมื่อขึ้นปีใหม่) — R-16"),
 ("receipt_next_seq", "int", False, 1, None, "เลขลำดับถัดไป — ล็อกแถวก่อนใช้ (R-16)"),
 ("booking_seq_month", "text", False, "", None, "YYMM ของ counter เลขใบจอง"),
 ("booking_next_seq", "int", False, 1, None, "เลขลำดับใบจองถัดไป (R-23)"),
 ("status", "e:record_status", False, "active", None, ""),
], idx=[("unique", ["booking_slug"], None), ("index", ["organization_id"], None)],
 checks=[("branch_receipt_prefix_chk", "receipt_prefix ~ '^[A-Z]{1,3}$'")])

tbl("branch_hours", G, "เวลาเปิด-ปิดรายวันของสาขา (1 ช่วงต่อวัน)", "US-02-01", [
 BR,
 ("weekday", "int", False, None, None, "0=อาทิตย์ … 6=เสาร์"),
 ("is_closed", "bool", False, False, None, "ปิดทั้งวัน"),
 ("opens_at", "time", True, None, None, "เวลาท้องถิ่น เช่น 09:00 (null ถ้า is_closed)"),
 ("closes_at", "time", True, None, None, "ต้องมากกว่า opens_at"),
], pk=["branch_id", "weekday"], updated=False,
 checks=[("branch_hours_weekday_chk", "weekday between 0 and 6"),
         ("branch_hours_range_chk", "is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at)")])

tbl("branch_closure", G, "ช่วงปิดร้าน/ปิดบางโมดูล", "US-02-05", [
 BR,
 ("starts_at", "ts", False, None, None, "UTC"),
 ("ends_at", "ts", False, None, None, "UTC (exclusive)"),
 ("scope", "e:closure_scope", False, "all", None, "ปิดทั้งร้านหรือเฉพาะโมดูล"),
 ("source", "e:closure_source", False, "manual", None, ""),
 ("reason", "text", True, None, None, ""),
 ("created_by", "uuid", True, None, "staff_user.id|setnull", ""),
], idx=[("index", ["branch_id", "starts_at"], None)],
 checks=[("branch_closure_range_chk", "ends_at > starts_at")])

tbl("branch_policy", G, "นโยบายและค่าตั้งต้นของสาขา (1:1 กับ branch)", "US-02-04, US-07-03, US-07-04, US-05-01, US-13-06", [
 ("branch_id", "uuid", False, None, "branch.id|cascade", "PK"),
 ("default_deposit_type", "e:deposit_type", False, "none", None, ""),
 ("default_deposit_value", "int", False, 0, None, "fixed = satang, percent = 0–100"),
 ("grooming_free_cancel_hours", "int", False, 24, None, "ยกเลิกก่อนนัด ≥ ค่านี้ = ไม่ริบ"),
 ("hotel_free_cancel_hours", "int", False, 72, None, ""),
 ("daycare_free_cancel_hours", "int", False, 24, None, ""),
 ("late_cancel_forfeit_percent", "int", False, 100, None, "ยกเลิกกระชั้น ริบกี่ % ของมัดจำ"),
 ("cancel_refund_mode", "e:cancel_refund_mode", False, "credit", None, "ส่วนที่ไม่ริบ คืนเงินหรือเครดิต"),
 ("booking_lead_minutes", "int", False, 120, None, "จองออนไลน์ล่วงหน้าขั้นต่ำ"),
 ("booking_horizon_days", "int", False, 60, None, "จองล่วงหน้าได้ไกลสุด"),
 ("reschedule_cutoff_hours", "int", False, 24, None, "ลูกค้าเลื่อน/ยกเลิกเองได้ถึงกี่ ชม. ก่อนนัด"),
 ("no_show_grace_minutes", "int", False, 30, None, "กด no-show ได้หลังเวลานัด + ค่านี้"),
 ("slot_step_minutes", "int", False, 15, None, "ความละเอียดเวลาเริ่ม 5/10/15/30"),
 ("buffer_minutes", "int", False, 10, None, "เวลาทำความสะอาดหลังแต่ละนัด"),
 ("max_appointments_per_day", "int", True, None, None, "null = ไม่จำกัด"),
 ("max_appointments_per_groomer_day", "int", True, None, None, ""),
 ("hold_minutes", "int", False, 15, None, "ล็อกคิวระหว่างจ่ายมัดจำ"),
 ("approval_timeout_minutes", "int", False, 120, None, "เตือนร้านซ้ำถ้ายังไม่อนุมัติ"),
 ("auto_confirm_grooming", "bool", False, True, None, ""),
 ("auto_confirm_hotel", "bool", False, False, None, ""),
 ("auto_confirm_daycare", "bool", False, True, None, ""),
 ("required_vaccines_dog", "text[]", False, "[]", None, "รหัสจาก vaccine_type"),
 ("required_vaccines_cat", "text[]", False, "[]", None, ""),
 ("enforce_vaccines_grooming", "bool", False, False, None, "บังคับวัคซีนกับกรูมด้วยหรือไม่"),
 ("rejected_breeds", "text[]", False, "[]", None, "สายพันธุ์ที่ไม่รับ (ข้อความตรงกับ pet.breed)"),
 ("max_pet_weight_grams", "int", True, None, None, ""),
 ("grooming_consent_text", "text", False, "", None, "แม่แบบใบยินยอมก่อนกรูม"),
 ("boarding_agreement_text", "text", False, "", None, "แม่แบบข้อตกลงรับฝาก"),
 ("policy_text", "text", False, "", None, "นโยบายที่แสดงให้ลูกค้าก่อนยืนยันจอง"),
 ("reminder_24h_enabled", "bool", False, True, None, ""),
 ("economy_mode", "bool", False, False, None, "โหมดประหยัดข้อความ LINE (R-18)"),
 ("next_groom_default_days", "int", False, 28, None, "รอบกรูมตั้งต้น"),
 ("google_review_url", "text", True, None, None, "ลิงก์รีวิว Google ของร้าน"),
 ("report_card_requires_review", "bool", False, False, None, "ต้องให้หน้าร้านตรวจก่อนส่ง"),
 ("daily_summary_time", "time", False, "20:00", None, "เวลาส่งสรุปรายวัน (ท้องถิ่น)"),
], pk="branch_id",
 checks=[("policy_percent_chk", "late_cancel_forfeit_percent between 0 and 100"),
         ("policy_step_chk", "slot_step_minutes in (5,10,15,30)"),
         ("policy_deposit_chk", "default_deposit_value >= 0 and (default_deposit_type <> 'percent' or default_deposit_value <= 100)")])

tbl("public_holiday", G, "วันหยุดราชการไทย (ข้อมูลกลาง seed ปีละครั้ง)", "US-13-03", [
 ("holiday_date", "date", False, None, None, "PK"),
 ("name_th", "text", False, None, None, ""),
], pk="holiday_date", updated=False)

tbl("groom_station", G, "โต๊ะกรูม (จำนวนนัดพร้อมกันสูงสุด = จำนวนโต๊ะ active)", "US-05-01", [
 ORG, BR,
 ("name", "text", False, None, None, "เช่น โต๊ะ 1"),
 ("sort_order", "int", False, 0, None, ""),
 ("status", "e:record_status", False, "active", None, ""),
], idx=[("index", ["branch_id"], None)])

# ===================== B. Identity & auth =====================
G = "B. Identity & Auth"
tbl("platform_admin", G, "ทีมแพลตฟอร์ม", "US-13-10, US-13-11", [
 ("email", "text", False, None, None, "lowercase"),
 ("password_hash", "text", False, None, None, "argon2id"),
 ("display_name", "text", False, None, None, ""),
 ("status", "e:admin_status", False, "active", None, ""),
 ("failed_login_count", "int", False, 0, None, "R-24"),
 ("locked_until", "ts", True, None, None, "R-24"),
], idx=[("unique", ["email"], None)])

tbl("staff_user", G, "ผู้ใช้ฝั่งร้าน (เจ้าของ/หน้าร้าน/ช่าง)", "US-01-02, US-01-03, US-01-04", [
 ORG,
 ("email", "text", True, None, None, "lowercase, unique ทั้งระบบ (null ได้ถ้าใช้ LINE อย่างเดียว)"),
 ("password_hash", "text", True, None, None, "argon2id; null ถ้ายังไม่ตั้งรหัส"),
 ("display_name", "text", False, None, None, "ชื่อเล่นที่ลูกค้าเห็น"),
 ("phone", "text", True, None, None, "E.164"),
 ("role", "e:staff_role", False, None, None, "owner / front_desk / staff — ดู permission matrix"),
 ("is_groomer", "bool", False, False, None, "แสดงในตัวเลือกช่างและ slot engine"),
 ("line_user_id", "text", True, None, None, "LINE userId จาก LINE Login ของแพลตฟอร์ม (provider ของแพลตฟอร์ม)"),
 ("photo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("sort_order", "int", False, 0, None, ""),
 ("status", "e:staff_status", False, "invited", None, ""),
 ("failed_login_count", "int", False, 0, None, "R-24"),
 ("locked_until", "ts", True, None, None, "R-24"),
 ("last_login_at", "ts", True, None, None, ""),
], idx=[("unique", ["email"], "email is not null"), ("unique", ["line_user_id"], "line_user_id is not null"),
        ("index", ["organization_id"], None)])

tbl("staff_invite", G, "คำเชิญพนักงาน", "US-01-04", [
 ORG,
 ("staff_user_id", "uuid", False, None, "staff_user.id|cascade", "record ที่สร้างไว้สถานะ invited"),
 ("token_hash", "text", False, None, None, "sha256 ของ token ในลิงก์"),
 ("expires_at", "ts", False, None, None, "สร้าง + 7 วัน"),
 ("accepted_at", "ts", True, None, None, ""),
 ("created_by", "uuid", False, None, "staff_user.id", ""),
], updated=False, idx=[("unique", ["token_hash"], None)])

tbl("password_reset", G, "ลิงก์รีเซ็ตรหัสผ่าน", "US-01-02", [
 ("staff_user_id", "uuid", False, None, "staff_user.id|cascade", ""),
 ("token_hash", "text", False, None, None, "sha256"),
 ("expires_at", "ts", False, None, None, "สร้าง + 30 นาที"),
 ("used_at", "ts", True, None, None, "ใช้ได้ครั้งเดียว"),
], updated=False, idx=[("unique", ["token_hash"], None)])

tbl("session", G, "session ของทุกประเภทผู้ใช้ (cookie httpOnly เก็บ token, DB เก็บ hash)", "US-01-01, US-01-02", [
 ("token_hash", "text", False, None, None, "sha256 ของ session token"),
 ("subject_type", "e:session_subject", False, None, None, ""),
 ("subject_id", "uuid", False, None, None, "staff_user.id / owner_profile.id / platform_admin.id"),
 ("organization_id", "uuid", True, None, "organization.id|cascade", "staff: org ของตัวเอง, customer: org ของร้านที่เปิด LIFF"),
 ("branch_id", "uuid", True, None, "branch.id|cascade", "customer session ผูกสาขาที่เปิด LIFF"),
 ("expires_at", "ts", False, None, None, "staff 30 วัน (sliding), customer 30 วัน, admin 12 ชม."),
 ("last_seen_at", "ts", False, "now", None, ""),
 ("user_agent", "text", True, None, None, ""),
 ("ip", "text", True, None, None, ""),
 ("support_access_log_id", "uuid", True, None, None, "มีค่า = session ของ support mode (อ่านอย่างเดียว)"),
], updated=False, idx=[("unique", ["token_hash"], None), ("index", ["subject_type", "subject_id"], None)])

tbl("web_push_subscription", G, "อุปกรณ์ที่รับ Web Push", "US-13-05, US-09-04", [
 ORG,
 ("staff_user_id", "uuid", False, None, "staff_user.id|cascade", ""),
 ("endpoint", "text", False, None, None, "unique"),
 ("p256dh", "text", False, None, None, ""),
 ("auth", "text", False, None, None, ""),
 ("user_agent", "text", True, None, None, ""),
 ("last_success_at", "ts", True, None, None, ""),
 ("disabled_at", "ts", True, None, None, "ตั้งเมื่อ push ได้ 404/410"),
], idx=[("unique", ["endpoint"], None), ("index", ["staff_user_id"], None)])

tbl("staff_working_hours", G, "เวลาทำงานรายสัปดาห์ของช่าง", "US-09-01", [
 ORG, BR,
 ("staff_user_id", "uuid", False, None, "staff_user.id|cascade", ""),
 ("weekday", "int", False, None, None, "0–6"),
 ("starts_at", "time", False, None, None, "เวลาท้องถิ่น"),
 ("ends_at", "time", False, None, None, ""),
 ("break_starts_at", "time", True, None, None, "ช่วงพัก (ถ้ามี)"),
 ("break_ends_at", "time", True, None, None, ""),
], idx=[("unique", ["staff_user_id", "branch_id", "weekday"], None)],
 checks=[("swh_weekday_chk", "weekday between 0 and 6"), ("swh_range_chk", "ends_at > starts_at"),
         ("swh_break_chk", "(break_starts_at is null and break_ends_at is null) or (break_ends_at > break_starts_at and break_starts_at >= starts_at and break_ends_at <= ends_at)")])

tbl("staff_time_off", G, "วันหยุด/ลาของช่าง", "US-09-01", [
 ORG,
 ("staff_user_id", "uuid", False, None, "staff_user.id|cascade", ""),
 ("starts_at", "ts", False, None, None, "UTC"),
 ("ends_at", "ts", False, None, None, "UTC exclusive"),
 ("reason", "text", True, None, None, ""),
 ("created_by", "uuid", True, None, "staff_user.id|setnull", ""),
], idx=[("index", ["staff_user_id", "starts_at"], None)],
 checks=[("sto_range_chk", "ends_at > starts_at")])

# ===================== C. LINE =====================
G = "C. LINE"
tbl("line_channel", G, "การเชื่อม LINE OA ของสาขา (ทีมแพลตฟอร์มกรอก — ตามผล SP-01)", "US-02-06, US-13-06", [
 ORG,
 ("branch_id", "uuid", False, None, "branch.id|cascade", "1 สาขา : 1 OA"),
 ("provider_id", "text", False, None, None, "LINE provider ที่ OA สังกัด (userId แยกตาม provider)"),
 ("messaging_channel_id", "text", False, None, None, ""),
 ("channel_secret_enc", "text", False, None, None, "เข้ารหัส AES-256-GCM ด้วย APP_ENCRYPTION_KEY"),
 ("channel_access_token_enc", "text", False, None, None, "long-lived token เข้ารหัส"),
 ("login_channel_id", "text", False, None, None, "LINE Login channel ที่มี LIFF (provider เดียวกับ OA)"),
 ("liff_id", "text", False, None, None, ""),
 ("bot_basic_id", "text", True, None, None, "@xxxx ใช้สร้างลิงก์เพิ่มเพื่อน"),
 ("monthly_push_quota", "int", False, 300, None, "โควตา push ของแพ็ก OA ที่ร้านใช้ (R-18)"),
 ("rich_menu_id", "text", True, None, None, ""),
 ("webhook_verified_at", "ts", True, None, None, ""),
 ("status", "e:line_channel_status", False, "pending", None, ""),
], idx=[("unique", ["branch_id"], None), ("unique", ["messaging_channel_id"], None)])

tbl("line_identity", G, "บัญชี LINE ของลูกค้า (unique ต่อ provider)", "US-01-01", [
 ("provider_id", "text", False, None, None, ""),
 ("line_user_id", "text", False, None, None, "จาก ID token ที่ verify แล้วเท่านั้น"),
 ("owner_profile_id", "uuid", False, None, "owner_profile.id|cascade", ""),
 ("display_name", "text", True, None, None, ""),
 ("picture_url", "text", True, None, None, ""),
 ("is_friend", "bool", False, False, None, "อัปเดตจาก follow/unfollow webhook"),
], idx=[("unique", ["provider_id", "line_user_id"], None), ("index", ["owner_profile_id"], None)])

# ===================== D. Customers & pets =====================
G = "D. Customers & Pets"
tbl("owner_profile", G, "ตัวตนเจ้าของสัตว์ระดับแพลตฟอร์ม (MVP: สร้างแยกต่อร้าน, P3 จึงรวมข้ามร้าน)", "US-13-02, US-03-01", [
 ("created_in_org_id", "uuid", False, None, "organization.id", "ร้านที่สร้าง record นี้"),
 ("first_name", "text", False, None, None, ""),
 ("last_name", "text", True, None, None, ""),
 ("nickname", "text", True, None, None, ""),
 ("phone_e164", "text", True, None, None, "R-22 normalize"),
 ("email", "text", True, None, None, ""),
 ("birth_date", "date", True, None, None, ""),
 ("address_line", "text", True, None, None, ""),
 ("subdistrict", "text", True, None, None, ""),
 ("district", "text", True, None, None, ""),
 ("province", "text", True, None, None, ""),
 ("postal_code", "text", True, None, None, ""),
 ("erased_at", "ts", True, None, None, "PDPA ลบข้อมูล: ล้างค่าส่วนตัวแล้วตั้งเวลา"),
], idx=[("index", ["created_in_org_id", "phone_e164"], None)])

tbl("customer", G, "ความสัมพันธ์ลูกค้า-ร้าน + ข้อมูลเฉพาะร้าน", "US-03-01, US-03-09, US-03-12, US-11-01", [
 ORG,
 ("owner_profile_id", "uuid", False, None, "owner_profile.id", ""),
 ("source_channel", "e:booking_channel", False, "walk_in", None, "ช่องทางที่รู้จักร้านครั้งแรก"),
 ("referral_note", "text", True, None, None, "รู้จักร้านจากไหน (ข้อความ)"),
 ("emergency_contact_name", "text", True, None, None, ""),
 ("emergency_contact_phone", "text", True, None, None, "E.164"),
 ("internal_note", "text", True, None, None, "ลูกค้าไม่เห็น"),
 ("reliability_level", "int", False, 3, None, "1–4 คำนวณโดย R-09"),
 ("reliability_override", "int", True, None, None, "ร้านกำหนดเอง 1–4 (ชนะค่าคำนวณ)"),
 ("late_cancel_count_12m", "int", False, 0, None, "cache สำหรับ R-09"),
 ("no_show_count_12m", "int", False, 0, None, "cache สำหรับ R-09"),
 ("blacklisted", "bool", False, False, None, "true = จองออนไลน์ไม่ได้"),
 ("blacklist_reason", "text", True, None, None, ""),
 ("deposit_exempt", "bool", False, False, None, "ยกเว้นมัดจำ"),
 ("photo_consent", "e:photo_consent", False, "unknown", None, ""),
 ("photo_consent_at", "ts", True, None, None, ""),
 ("visit_count", "int", False, 0, None, "นับเมื่อบิลจ่ายแล้ว"),
 ("first_visit_at", "ts", True, None, None, ""),
 ("last_visit_at", "ts", True, None, None, ""),
 ("credit_balance_satang", "int", False, 0, None, "cache = SUM(credit_ledger) — อัปเดตใน transaction เดียวกัน"),
 ("status", "e:record_status", False, "active", None, ""),
], idx=[("unique", ["organization_id", "owner_profile_id"], None), ("index", ["organization_id", "last_visit_at"], None)],
 checks=[("customer_rel_chk", "reliability_level between 1 and 4 and (reliability_override is null or reliability_override between 1 and 4)"),
         ("customer_credit_chk", "credit_balance_satang >= 0")])

tbl("customer_link_request", G, "คำขอจับคู่บัญชี LINE กับลูกค้าเดิมของร้าน (ไม่มี OTP จึงให้ร้านยืนยัน)", "US-01-01, US-11-01", [
 ORG,
 ("line_identity_id", "uuid", False, None, "line_identity.id|cascade", ""),
 ("new_owner_profile_id", "uuid", False, None, "owner_profile.id", "profile ที่สร้างจาก LINE"),
 ("candidate_customer_id", "uuid", False, None, "customer.id", "ลูกค้าเดิมที่เบอร์ตรงกัน"),
 ("phone_entered", "text", False, None, None, "E.164"),
 ("status", "e:link_request_status", False, "pending", None, ""),
 ("decided_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("decided_at", "ts", True, None, None, ""),
], idx=[("index", ["organization_id", "status"], None)])

tbl("pet", G, "สัตว์เลี้ยง (ผูกกับ owner_profile ไม่ผูกร้าน)", "US-03-02, US-03-11, US-11-02", [
 ("owner_profile_id", "uuid", False, None, "owner_profile.id", ""),
 ("created_in_org_id", "uuid", False, None, "organization.id", ""),
 ("name", "text", False, None, None, ""),
 ("species", "e:species", False, None, None, ""),
 ("species_other", "text", True, None, None, "ระบุเมื่อ species = other"),
 ("breed", "text", True, None, None, "เลือกจากรายการหรือพิมพ์เอง"),
 ("sex", "e:pet_sex", False, "unknown", None, ""),
 ("birth_date", "date", True, None, None, ""),
 ("age_estimate_months", "int", True, None, None, "ใช้เมื่อไม่รู้วันเกิด (อายุ ณ created_at)"),
 ("neutered", "bool", True, None, None, "null = ไม่ทราบ"),
 ("color", "text", True, None, None, ""),
 ("microchip_no", "text", True, None, None, ""),
 ("coat_type", "e:coat_type", False, "unknown", None, "แปลงเป็น coat_group ด้วย R-02"),
 ("latest_weight_grams", "int", True, None, None, "cache จาก pet_weight ล่าสุด"),
 ("profile_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("status", "e:pet_status", False, "active", None, "deceased/rehomed → หยุดแจ้งเตือนทั้งหมด"),
 ("status_changed_at", "ts", True, None, None, ""),
], idx=[("index", ["owner_profile_id"], None)],
 checks=[("pet_other_chk", "species <> 'other' or species_other is not null"),
         ("pet_weight_chk", "latest_weight_grams is null or latest_weight_grams > 0")])

tbl("pet_shop_profile", G, "ข้อมูลน้องที่เป็นของร้าน (กรูม/สุขภาพ/โน้ต) 1 แถวต่อ pet ต่อ org", "US-03-03, US-03-04, US-03-07", [
 ORG,
 ("pet_id", "uuid", False, None, "pet.id|cascade", ""),
 ("preferred_style", "text", True, None, None, "ทรงที่ชอบ"),
 ("blade_no", "text", True, None, None, "เบอร์ใบมีด"),
 ("shampoo_ok", "text", True, None, None, ""),
 ("shampoo_avoid", "text", True, None, None, ""),
 ("allergies", "text", True, None, None, ""),
 ("conditions", "text", True, None, None, "โรคประจำตัว"),
 ("medications", "text", True, None, None, ""),
 ("vet_clinic_name", "text", True, None, None, ""),
 ("vet_clinic_phone", "text", True, None, None, ""),
 ("internal_note", "text", True, None, None, "ลูกค้าไม่เห็น และไม่แชร์ข้ามร้าน"),
 ("shared_note", "text", True, None, None, "ลูกค้าเห็นใน LIFF"),
 ("favorite_style_photo_id", "uuid", True, None, "pet_photo.id|setnull", "รูปทรงโปรด แสดงบน job card"),
 ("groom_interval_days", "int", True, None, None, "ร้านตั้งเอง (ชนะค่าคำนวณใน R-17)"),
 ("last_groomed_at", "ts", True, None, None, "cache"),
], idx=[("unique", ["organization_id", "pet_id"], None)])

tbl("pet_temperament_flag", G, "ป้ายนิสัย", "US-03-04", [
 ORG,
 ("pet_id", "uuid", False, None, "pet.id|cascade", ""),
 ("flag", "e:temperament_flag", False, None, None, ""),
 ("note", "text", True, None, None, ""),
 ("created_by", "uuid", True, None, "staff_user.id|setnull", ""),
], updated=False, idx=[("unique", ["organization_id", "pet_id", "flag"], None)])

tbl("pet_weight", G, "ประวัติน้ำหนัก", "US-03-03, US-05-06", [
 ORG,
 ("pet_id", "uuid", False, None, "pet.id|cascade", ""),
 ("weight_grams", "int", False, None, None, "> 0"),
 ("measured_at", "ts", False, "now", None, ""),
 ("source", "e:record_source", False, "shop", None, ""),
 ("recorded_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("appointment_id", "uuid", True, None, "groom_appointment.id|setnull", "ถ้าชั่งตอนเช็คอิน"),
], updated=False, idx=[("index", ["pet_id", "measured_at"], None)],
 checks=[("pet_weight_pos_chk", "weight_grams > 0")])

tbl("vaccine_type", G, "ชนิดวัคซีน (ข้อมูลกลาง seed)", "US-03-05", [
 ("code", "text", False, None, None, "PK เช่น DOG_RABIES"),
 ("species", "e:species", False, None, None, ""),
 ("name_th", "text", False, None, None, ""),
 ("name_en", "text", False, None, None, ""),
 ("default_validity_months", "int", False, 12, None, "ใช้เติม expires_on อัตโนมัติ"),
 ("sort_order", "int", False, 0, None, ""),
], pk="code", updated=False)

tbl("pet_vaccination", G, "ประวัติวัคซีน", "US-03-05, US-06-05, US-11-02", [
 ("pet_id", "uuid", False, None, "pet.id|cascade", ""),
 ("vaccine_code", "text", False, None, "vaccine_type.code", ""),
 ("administered_on", "date", True, None, None, ""),
 ("expires_on", "date", False, None, None, "ใช้ตรวจ vaccine gate (R-11)"),
 ("proof_file_id", "uuid", True, None, "file_object.id|setnull", "รูปสมุดวัคซีน"),
 ("status", "e:vaccine_status", False, "pending_review", None, "ข้อมูลจากร้าน = verified ทันที"),
 ("source", "e:record_source", False, "shop", None, ""),
 ("verified_org_id", "uuid", True, None, "organization.id|setnull", ""),
 ("verified_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("verified_at", "ts", True, None, None, ""),
 ("reject_reason", "text", True, None, None, ""),
], idx=[("index", ["pet_id", "vaccine_code", "expires_on"], None)])

tbl("file_object", G, "ไฟล์ทุกชนิดใน object storage (ไม่เก็บไฟล์ใน DB)", "US-13-04", [
 ("organization_id", "uuid", True, None, "organization.id|cascade", "null = ไฟล์ระดับแพลตฟอร์ม"),
 ("kind", "e:file_kind", False, None, None, ""),
 ("storage_key", "text", False, None, None, "org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}"),
 ("mime_type", "text", False, None, None, "อนุญาต image/jpeg, image/png, image/webp, video/mp4, application/pdf, text/csv"),
 ("size_bytes", "int", False, None, None, "รูป ≤ 1.5MB หลังย่อ, วิดีโอ ≤ 20MB (R-25)"),
 ("width", "int", True, None, None, ""),
 ("height", "int", True, None, None, ""),
 ("uploaded_by_type", "e:actor_type", False, None, None, ""),
 ("uploaded_by_id", "uuid", True, None, None, ""),
 ("committed_at", "ts", True, None, None, "null = อัปโหลดแต่ยังไม่ผูกกับข้อมูล (ลบทิ้งหลัง 24 ชม.)"),
 ("deleted_at", "ts", True, None, None, ""),
], updated=False, idx=[("unique", ["storage_key"], None), ("index", ["organization_id", "kind"], None)],
 checks=[("file_size_chk", "size_bytes > 0")])

tbl("pet_photo", G, "คลังรูปน้อง (ก่อน-หลัง/ระหว่างพัก)", "US-03-06, US-09-03, US-06-10", [
 ORG,
 ("pet_id", "uuid", False, None, "pet.id|cascade", ""),
 ("file_id", "uuid", False, None, "file_object.id", ""),
 ("kind", "e:photo_kind", False, None, None, ""),
 ("appointment_id", "uuid", True, None, "groom_appointment.id|setnull", ""),
 ("stay_id", "uuid", True, None, "stay.id|setnull", ""),
 ("caption", "text", True, None, None, ""),
 ("taken_at", "ts", False, "now", None, ""),
 ("uploaded_by", "uuid", True, None, "staff_user.id|setnull", ""),
], updated=False, idx=[("index", ["pet_id", "taken_at"], None), ("index", ["stay_id"], None)])

# ===================== E. Catalog & pricing =====================
G = "E. Catalog & Pricing"
tbl("size_tier", G, "ช่วงขนาดตามน้ำหนัก แยกหมา/แมว (ไม่ทับซ้อน)", "US-04-02", [
 ORG, BR,
 ("species", "e:species", False, None, None, "dog หรือ cat"),
 ("code", "text", False, None, None, "XS S M L XL XXL"),
 ("label_th", "text", False, None, None, "เช่น 'เล็ก (≤5 กก.)'"),
 ("min_weight_grams", "int", False, None, None, "inclusive"),
 ("max_weight_grams", "int", True, None, None, "exclusive; null = ไม่มีเพดาน"),
 ("sort_order", "int", False, 0, None, ""),
], idx=[("unique", ["branch_id", "species", "code"], None)],
 checks=[("size_tier_range_chk", "min_weight_grams >= 0 and (max_weight_grams is null or max_weight_grams > min_weight_grams)"),
         ("size_tier_species_chk", "species in ('dog','cat')")])

tbl("rate_plan", G, "แผนราคา (MVP ใช้ 'standard' แผนเดียว; P3 เพิ่มราคา OTA)", "US-13-02", [
 ORG, BR,
 ("code", "text", False, "standard", None, ""),
 ("name", "text", False, None, None, ""),
 ("channel", "e:rate_channel", False, "all", None, ""),
 ("is_default", "bool", False, True, None, "1 สาขามี default 1 แผน"),
], idx=[("unique", ["branch_id", "code"], None), ("unique", ["branch_id"], "is_default")])

tbl("service", G, "บริการและ add-on ทุกโมดูล", "US-04-01, US-04-04, US-06-06", [
 ORG, BR,
 ("scope", "e:service_scope", False, "grooming", None, ""),
 ("category", "e:service_category", False, None, None, ""),
 ("name_th", "text", False, None, None, ""),
 ("description", "text", True, None, None, ""),
 ("photo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("species_allowed", "e[]:species", False, "[]", None, "ว่าง = ทุกชนิด"),
 ("is_addon", "bool", False, False, None, ""),
 ("addon_per_day", "bool", False, False, None, "add-on โรงแรมคิดต่อวัน"),
 ("online_bookable", "bool", False, True, None, "ลูกค้าเห็นใน LIFF"),
 ("est_cost_satang", "int", True, None, None, "ต้นทุนโดยประมาณ (รายงานกำไรใน P2)"),
 ("sort_order", "int", False, 0, None, ""),
 ("status", "e:record_status", False, "active", None, ""),
], idx=[("index", ["branch_id", "scope", "status"], None)])

tbl("service_price", G, "ราคาและเวลา = บริการ × ขนาด × กลุ่มขน (R-01..R-03)", "US-04-02, US-04-03", [
 ORG,
 ("service_id", "uuid", False, None, "service.id|cascade", ""),
 ("rate_plan_id", "uuid", False, None, "rate_plan.id", ""),
 ("size_tier_id", "uuid", True, None, "size_tier.id|cascade", "null = ราคาเดียวทุกขนาด (เช่น add-on)"),
 ("coat_group", "e:coat_group", False, "any", None, ""),
 ("price_satang", "int", False, None, None, ""),
 ("duration_minutes", "int", False, 0, None, "add-on อาจเป็น 0"),
], idx=[("unique", ["service_id", "rate_plan_id", "size_tier_id", "coat_group"], None)],
 checks=[("service_price_chk", "price_satang >= 0 and duration_minutes >= 0 and duration_minutes <= 600")])

tbl("service_addon_link", G, "add-on ใช้กับบริการหลักไหนได้ (ไม่มีแถว = ใช้ได้ทุกบริการใน scope เดียวกัน)", "US-04-04", [
 ORG,
 ("addon_service_id", "uuid", False, None, "service.id|cascade", ""),
 ("base_service_id", "uuid", False, None, "service.id|cascade", ""),
], pk=["addon_service_id", "base_service_id"], updated=False)

tbl("surcharge_type", G, "ค่าบริการเพิ่มหน้างานที่ตั้งไว้", "US-04-05", [
 ORG, BR,
 ("name_th", "text", False, None, None, "เช่น ขนพันกัน"),
 ("default_amount_satang", "int", False, 0, None, ""),
 ("status", "e:record_status", False, "active", None, ""),
])

tbl("room_type", G, "ประเภทห้องพัก", "US-06-01", [
 ORG, BR,
 ("name_th", "text", False, None, None, ""),
 ("description", "text", True, None, None, ""),
 ("photo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("species_allowed", "e[]:species", False, "[]", None, "ว่าง = ทุกชนิด"),
 ("max_weight_grams", "int", True, None, None, ""),
 ("min_age_months", "int", True, None, None, ""),
 ("allow_in_heat", "bool", False, False, None, "รับตัวเมียติดสัด"),
 ("allow_reactive", "bool", False, False, None, "รับน้องที่มีป้าย bites/dog_reactive/cat_reactive"),
 ("amenities", "text[]", False, "[]", None, "เช่น aircon, camera, private"),
 ("included_text", "text", True, None, None, "สิ่งที่รวมในราคา"),
 ("online_bookable", "bool", False, True, None, ""),
 ("sort_order", "int", False, 0, None, ""),
 ("status", "e:record_status", False, "active", None, ""),
])

tbl("room_unit", G, "ห้องรายยูนิต", "US-06-01, US-06-04", [
 ORG, BR,
 ("room_type_id", "uuid", False, None, "room_type.id", ""),
 ("code", "text", False, None, None, "เช่น A1"),
 ("zone", "text", True, None, None, ""),
 ("status", "e:room_unit_status", False, "active", None, ""),
 ("housekeeping", "e:housekeeping_status", False, "clean", None, "check-out → dirty"),
 ("sort_order", "int", False, 0, None, ""),
], idx=[("unique", ["branch_id", "code"], None)])

tbl("room_rate", G, "ราคาห้องต่อคืน (null size_tier = ทุกขนาด)", "US-06-02", [
 ORG,
 ("room_type_id", "uuid", False, None, "room_type.id|cascade", ""),
 ("rate_plan_id", "uuid", False, None, "rate_plan.id", ""),
 ("size_tier_id", "uuid", True, None, "size_tier.id|cascade", ""),
 ("nightly_price_satang", "int", False, None, None, ""),
], idx=[("unique", ["room_type_id", "rate_plan_id", "size_tier_id"], None)],
 checks=[("room_rate_chk", "nightly_price_satang >= 0")])

tbl("daycare_session_type", G, "รอบ Daycare", "US-06-13", [
 ORG, BR,
 ("session", "e:daycare_session", False, None, None, ""),
 ("name_th", "text", False, None, None, ""),
 ("starts_at", "time", False, None, None, ""),
 ("ends_at", "time", False, None, None, ""),
 ("capacity", "int", False, None, None, "จำนวนตัวสูงสุดต่อวันต่อรอบ"),
 ("status", "e:record_status", False, "active", None, ""),
], idx=[("unique", ["branch_id", "session"], None)],
 checks=[("dst_cap_chk", "capacity > 0"), ("dst_range_chk", "ends_at > starts_at")])

tbl("daycare_rate", G, "ราคา Daycare ต่อรอบ", "US-06-13", [
 ORG,
 ("session_type_id", "uuid", False, None, "daycare_session_type.id|cascade", ""),
 ("rate_plan_id", "uuid", False, None, "rate_plan.id", ""),
 ("size_tier_id", "uuid", True, None, "size_tier.id|cascade", ""),
 ("price_satang", "int", False, None, None, ""),
], idx=[("unique", ["session_type_id", "rate_plan_id", "size_tier_id"], None)])

tbl("package_template", G, "แพ็กเกจหลายครั้งที่ร้านขาย", "US-10-05", [
 ORG, BR,
 ("name_th", "text", False, None, None, ""),
 ("service_id", "uuid", False, None, "service.id", "บริการที่ใช้สิทธิ์ได้"),
 ("size_tier_id", "uuid", True, None, "size_tier.id|setnull", "null = ทุกขนาด"),
 ("sessions_count", "int", False, None, None, "≥ 2"),
 ("price_satang", "int", False, None, None, ""),
 ("validity_days", "int", False, 365, None, ""),
 ("share_scope", "e:package_share_scope", False, "single_pet", None, ""),
 ("status", "e:record_status", False, "active", None, ""),
], checks=[("pkg_tpl_chk", "sessions_count >= 2 and price_satang > 0 and validity_days > 0")])

tbl("commission_rule", G, "กติกาค่ามือ (ลำดับความสำคัญใน R-13)", "US-09-02", [
 ORG, BR,
 ("service_id", "uuid", True, None, "service.id|cascade", "null = ทุกบริการ"),
 ("staff_user_id", "uuid", True, None, "staff_user.id|cascade", "null = ทุกช่าง"),
 ("type", "e:commission_type", False, None, None, ""),
 ("value", "int", False, None, None, "percent = basis points (1500 = 15%), fixed = satang"),
], idx=[("unique", ["branch_id", "service_id", "staff_user_id"], None)],
 checks=[("commission_value_chk", "value >= 0 and (type <> 'percent' or value <= 10000)")])

# ===================== F. Bookings =====================
G = "F. Bookings"
tbl("booking", G, "ใบจอง (header) — 1 ใบมีได้หลายนัด/หลายการพัก", "US-05-04, US-11-03, US-07-03, US-07-04", [
 ORG, BR,
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("booking_no", "text", False, None, None, "R-23 เช่น B6910-0042 unique ต่อสาขา"),
 ("channel", "e:booking_channel", False, None, None, ""),
 ("created_by_type", "e:actor_type", False, None, None, ""),
 ("created_by_id", "uuid", True, None, None, ""),
 ("status", "e:booking_status", False, None, None, "ดู 03-state-machines"),
 ("hold_expires_at", "ts", True, None, None, "มีค่าเมื่อ status = awaiting_deposit"),
 ("approval_due_at", "ts", True, None, None, "มีค่าเมื่อ awaiting_approval"),
 ("estimated_total_satang", "int", False, 0, None, "ยอดประเมินตอนจอง"),
 ("deposit_required_satang", "int", False, 0, None, "R-06"),
 ("deposit_status", "e:deposit_status", False, "not_required", None, ""),
 ("deposit_verified_satang", "int", False, 0, None, "ยอดที่ร้านยืนยันแล้ว"),
 ("policy_snapshot", "jsonb", False, None, None, "สำเนานโยบายยกเลิก/มัดจำ ณ เวลาจอง (R-07 ใช้ค่านี้เสมอ)"),
 ("customer_note", "text", True, None, None, ""),
 ("reschedule_count", "int", False, 0, None, ""),
 ("confirmed_at", "ts", True, None, None, ""),
 ("cancelled_at", "ts", True, None, None, ""),
 ("cancelled_by_type", "e:actor_type", True, None, None, ""),
 ("cancel_reason", "text", True, None, None, ""),
 ("cancel_is_late", "bool", True, None, None, "R-07 isLate ตอนยกเลิก (Q-0084); null = ไม่ได้ยกเลิก — R-09 นับ late cancel จากคอลัมน์นี้"),
 ("first_service_at", "ts", True, None, None, "cache เวลาเริ่มบริการแรก (ใช้คำนวณยกเลิก)"),
 ("bill_id", "uuid", True, None, None, "บิลที่ปิดใบจองนี้ (FK ใส่ใน SQL custom)"),
], idx=[("unique", ["branch_id", "booking_no"], None), ("index", ["organization_id", "customer_id"], None),
        ("index", ["branch_id", "status"], None)],
 checks=[("booking_amount_chk", "estimated_total_satang >= 0 and deposit_required_satang >= 0 and deposit_verified_satang >= 0")])

tbl("booking_event", G, "บันทึกทุกการเปลี่ยนสถานะ (append-only) — ใช้ทำ analytics/OTA sync", "US-13-02", [
 ORG,
 ("booking_id", "uuid", False, None, "booking.id|cascade", ""),
 ("entity_type", "text", False, None, None, "booking | groom_appointment | stay | daycare_visit | deposit"),
 ("entity_id", "uuid", False, None, None, ""),
 ("from_status", "text", True, None, None, ""),
 ("to_status", "text", False, None, None, ""),
 ("actor_type", "e:actor_type", False, None, None, ""),
 ("actor_id", "uuid", True, None, None, ""),
 ("reason", "text", True, None, None, ""),
], updated=False, idx=[("index", ["booking_id", "created_at"], None), ("index", ["organization_id", "created_at"], None)])

tbl("groom_appointment", G, "นัดกรูม 1 ตัว 1 ช่าง 1 โต๊ะ (กันชนด้วย exclusion constraint)", "US-05-01, US-05-03, US-05-04, US-05-06", [
 ORG, BR,
 ("booking_id", "uuid", False, None, "booking.id|cascade", ""),
 ("pet_id", "uuid", False, None, "pet.id", ""),
 ("groomer_id", "uuid", False, None, "staff_user.id", "ระบบเลือกให้ถ้าลูกค้าเลือก any (R-04)"),
 ("groomer_preference", "e:groomer_preference", False, "any", None, ""),
 ("station_id", "uuid", False, None, "groom_station.id", ""),
 ("starts_at", "ts", False, None, None, "UTC"),
 ("ends_at", "ts", False, None, None, "= starts_at + Σduration"),
 ("blocked_until", "ts", False, None, None, "= ends_at + buffer (ใช้ใน exclusion constraint)"),
 ("status", "e:groom_status", False, "scheduled", None, ""),
 ("size_tier_id", "uuid", True, None, "size_tier.id|setnull", "snapshot ตอนจอง"),
 ("coat_group", "e:coat_group", False, "any", None, "snapshot"),
 ("weight_grams_at_booking", "int", True, None, None, ""),
 ("weight_grams_checkin", "int", True, None, None, ""),
 ("condition_flags", "text[]", False, "[]", None, "ticks_fleas | wound | matted | skin_issue"),
 ("condition_note", "text", True, None, None, ""),
 ("services_total_satang", "int", False, 0, None, "Σ groom_appointment_item"),
 ("surcharge_total_satang", "int", False, 0, None, "Σ appointment_surcharge"),
 ("from_stay_id", "uuid", True, None, "stay.id|setnull", "นัดที่เกิดจาก Stay + Groom bundle"),
 ("checked_in_at", "ts", True, None, None, ""),
 ("started_at", "ts", True, None, None, ""),
 ("done_at", "ts", True, None, None, ""),
 ("picked_up_at", "ts", True, None, None, ""),
 ("staff_note", "text", True, None, None, ""),
], idx=[("index", ["branch_id", "starts_at"], None), ("index", ["groomer_id", "starts_at"], None),
        ("index", ["pet_id", "starts_at"], None)],
 checks=[("ga_time_chk", "ends_at > starts_at and blocked_until >= ends_at")])

tbl("groom_appointment_item", G, "บริการ/add-on ในนัด (ราคา snapshot)", "US-05-04, US-11-03", [
 ORG,
 ("appointment_id", "uuid", False, None, "groom_appointment.id|cascade", ""),
 ("service_id", "uuid", False, None, "service.id", ""),
 ("is_addon", "bool", False, False, None, ""),
 ("name_snapshot", "text", False, None, None, ""),
 ("price_satang", "int", False, None, None, ""),
 ("duration_minutes", "int", False, None, None, ""),
 ("customer_package_id", "uuid", True, None, "customer_package.id|setnull", "ถ้าจะใช้สิทธิ์แพ็กเกจ"),
], updated=False, idx=[("index", ["appointment_id"], None)])

tbl("appointment_surcharge", G, "ค่าบริการเพิ่มหน้างาน", "US-04-05", [
 ORG,
 ("appointment_id", "uuid", False, None, "groom_appointment.id|cascade", ""),
 ("surcharge_type_id", "uuid", True, None, "surcharge_type.id|setnull", ""),
 ("name", "text", False, None, None, ""),
 ("amount_satang", "int", False, None, None, ""),
 ("reason", "text", False, None, None, "บังคับกรอก"),
 ("created_by", "uuid", False, None, "staff_user.id", ""),
], updated=False, checks=[("surcharge_amt_chk", "amount_satang > 0")])

tbl("consent_document", G, "ใบยินยอม/ข้อตกลงที่ลูกค้าเซ็น (immutable)", "US-05-06, US-06-08", [
 ORG,
 ("kind", "e:consent_doc_kind", False, None, None, ""),
 ("appointment_id", "uuid", True, None, "groom_appointment.id|setnull", ""),
 ("stay_id", "uuid", True, None, "stay.id|setnull", ""),
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("reasons", "text[]", False, "[]", None, "matted_shave | senior | medical_condition | aggressive | other"),
 ("body_snapshot", "text", False, None, None, "ข้อความที่ลูกค้าเห็นตอนเซ็น"),
 ("emergency_vet_limit_satang", "int", True, None, None, "วงเงินพาไปหาหมอ (ข้อตกลงรับฝาก)"),
 ("signer_name", "text", False, None, None, ""),
 ("signature_file_id", "uuid", False, None, "file_object.id", "PNG จาก canvas"),
 ("signed_at", "ts", False, "now", None, ""),
], updated=False, checks=[("consent_target_chk", "(appointment_id is not null) <> (stay_id is not null)")])

tbl("stay", G, "การพัก 1 ตัว 1 ช่วงวัน (กันห้องซ้อนด้วย exclusion constraint)", "US-06-03, US-06-04, US-06-11, US-11-04", [
 ORG, BR,
 ("booking_id", "uuid", False, None, "booking.id|cascade", ""),
 ("pet_id", "uuid", False, None, "pet.id", ""),
 ("room_type_id", "uuid", False, None, "room_type.id", ""),
 ("room_unit_id", "uuid", False, None, "room_unit.id", "ระบบจัดห้องให้ตอนจอง (R-10)"),
 ("check_in_date", "date", False, None, None, "วันท้องถิ่น"),
 ("check_out_date", "date", False, None, None, "> check_in_date"),
 ("expected_check_in_time", "time", True, None, None, ""),
 ("expected_check_out_time", "time", True, None, None, ""),
 ("nights", "int", False, None, None, "= check_out_date - check_in_date"),
 ("nightly_price_satang", "int", False, None, None, "snapshot"),
 ("room_total_satang", "int", False, None, None, "= nights × nightly"),
 ("status", "e:stay_status", False, "reserved", None, ""),
 ("in_heat", "bool", False, False, None, "ลูกค้า/ร้านแจ้ง"),
 ("bundle_appointment_id", "uuid", True, None, "groom_appointment.id|setnull", "Stay + Groom"),
 ("weight_grams_in", "int", True, None, None, ""),
 ("weight_grams_out", "int", True, None, None, ""),
 ("vaccine_override_reason", "text", True, None, None, "ร้านข้าม vaccine gate (เข้า audit log)"),
 ("checked_in_at", "ts", True, None, None, ""),
 ("checked_out_at", "ts", True, None, None, ""),
], idx=[("index", ["branch_id", "check_in_date"], None), ("index", ["branch_id", "check_out_date"], None)],
 checks=[("stay_dates_chk", "check_out_date > check_in_date and nights = (check_out_date - check_in_date)")])

tbl("stay_addon", G, "add-on ระหว่างพัก", "US-06-06", [
 ORG,
 ("stay_id", "uuid", False, None, "stay.id|cascade", ""),
 ("service_id", "uuid", False, None, "service.id", "scope = hotel, is_addon"),
 ("name_snapshot", "text", False, None, None, ""),
 ("unit_price_satang", "int", False, None, None, ""),
 ("quantity", "int", False, 1, None, "per_day → = nights"),
 ("total_satang", "int", False, None, None, ""),
 ("added_by_type", "e:actor_type", False, None, None, ""),
], updated=False, checks=[("stay_addon_chk", "quantity > 0 and total_satang = unit_price_satang * quantity")])

tbl("stay_intake", G, "ฟอร์มรับฝาก (1:1 กับ stay)", "US-06-08", [
 ("stay_id", "uuid", False, None, "stay.id|cascade", "PK"),
 ORG,
 ("food_brand", "text", True, None, None, ""),
 ("food_amount", "text", True, None, None, "เช่น 1 ถ้วย"),
 ("feeding_times", "time[]", False, "[]", None, "สร้าง care_task feed ตามเวลานี้"),
 ("food_provided_by_owner", "bool", False, True, None, ""),
 ("walks_per_day", "int", False, 0, None, "สร้าง care_task walk"),
 ("condition_note", "text", True, None, None, "สภาพร่างกายตอนรับ"),
 ("condition_photo_ids", "uuid[]", False, "[]", None, "file_object.id"),
 ("emergency_contact_name", "text", True, None, None, ""),
 ("emergency_contact_phone", "text", True, None, None, ""),
 ("vet_clinic_name", "text", True, None, None, ""),
 ("vet_clinic_phone", "text", True, None, None, ""),
 ("completed_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("completed_at", "ts", True, None, None, "ต้องมีค่าก่อนเปลี่ยน stay เป็น checked_in"),
], pk="stay_id")

tbl("stay_medication", G, "ยาที่ต้องให้ระหว่างพัก", "US-06-08, US-06-09", [
 ORG,
 ("stay_id", "uuid", False, None, "stay.id|cascade", ""),
 ("name", "text", False, None, None, ""),
 ("dose", "text", False, None, None, ""),
 ("times", "time[]", False, None, None, "เวลาให้ยาแต่ละวัน (≥1)"),
 ("instructions", "text", True, None, None, ""),
], updated=False)

tbl("stay_belonging", G, "ของที่ลูกค้านำมา", "US-06-08, US-06-11", [
 ORG,
 ("stay_id", "uuid", False, None, "stay.id|cascade", ""),
 ("item", "text", False, None, None, ""),
 ("quantity", "int", False, 1, None, ""),
 ("photo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("returned_at", "ts", True, None, None, "ติ๊กตอน check-out"),
])

tbl("care_task", G, "งานดูแลรายวัน (สร้างอัตโนมัติตอนเช็คอิน R-26)", "US-06-09", [
 ORG, BR,
 ("stay_id", "uuid", False, None, "stay.id|cascade", ""),
 ("task_type", "e:care_task_type", False, None, None, ""),
 ("title", "text", False, None, None, ""),
 ("due_at", "ts", False, None, None, "UTC"),
 ("medication_id", "uuid", True, None, "stay_medication.id|cascade", ""),
 ("status", "e:care_task_status", False, "pending", None, ""),
 ("done_at", "ts", True, None, None, ""),
 ("done_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("note", "text", True, None, None, "เช่น กินหมด/เหลือครึ่ง"),
 ("photo_file_id", "uuid", True, None, "file_object.id|setnull", ""),
], idx=[("index", ["branch_id", "due_at", "status"], None), ("index", ["stay_id", "due_at"], None)])

tbl("daycare_visit", G, "การฝาก Daycare 1 ตัว 1 วัน 1 รอบ", "US-06-13, US-11-05", [
 ORG, BR,
 ("booking_id", "uuid", False, None, "booking.id|cascade", ""),
 ("pet_id", "uuid", False, None, "pet.id", ""),
 ("session_type_id", "uuid", False, None, "daycare_session_type.id", ""),
 ("visit_date", "date", False, None, None, ""),
 ("price_satang", "int", False, None, None, "snapshot"),
 ("status", "e:daycare_status", False, "reserved", None, ""),
 ("checked_in_at", "ts", True, None, None, ""),
 ("checked_out_at", "ts", True, None, None, ""),
], idx=[("index", ["branch_id", "visit_date", "session_type_id"], None),
        ("unique", ["pet_id", "visit_date", "session_type_id"], "status not in ('cancelled','no_show')")])

# ===================== G. Payments & billing =====================
G = "G. Payments & Billing"
tbl("payment_slip", G, "สลิปที่อัปโหลด (ร้านยืนยันเอง + จับซ้ำจาก QR บนสลิป R-05)", "US-07-02, US-11-07", [
 ORG, BR,
 ("booking_id", "uuid", True, None, "booking.id|setnull", ""),
 ("bill_id", "uuid", True, None, "bill.id|setnull", ""),
 ("file_id", "uuid", False, None, "file_object.id", ""),
 ("uploaded_by_type", "e:actor_type", False, None, None, ""),
 ("amount_expected_satang", "int", False, None, None, "ยอดที่ระบบขอ"),
 ("qr_payload", "text", True, None, None, "ข้อความที่อ่านได้จาก QR บนสลิป"),
 ("trans_ref", "text", True, None, None, "เลขอ้างอิงที่แยกจาก qr_payload"),
 ("duplicate_of_slip_id", "uuid", True, None, None, "มีค่า = เคยมีสลิป trans_ref นี้แล้ว"),
 ("status", "e:slip_status", False, "submitted", None, ""),
 ("reviewed_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("reviewed_at", "ts", True, None, None, ""),
 ("reject_reason", "text", True, None, None, ""),
], idx=[("index", ["organization_id", "trans_ref"], "trans_ref is not null"), ("index", ["branch_id", "status"], None)])

tbl("payment", G, "เงินที่รับจริง (มัดจำและชำระบิล)", "US-07-02, US-08-04", [
 ORG, BR,
 ("booking_id", "uuid", True, None, "booking.id|setnull", "มัดจำ"),
 ("bill_id", "uuid", True, None, "bill.id|setnull", "ชำระบิล"),
 ("method", "e:payment_method", False, None, None, "deposit = โอนมัดจำมาใช้ในบิล, credit = ใช้เครดิต"),
 ("amount_satang", "int", False, None, None, "> 0"),
 ("tendered_satang", "int", True, None, None, "เงินสดที่ลูกค้าให้ (คำนวณเงินทอน)"),
 ("slip_id", "uuid", True, None, "payment_slip.id|setnull", ""),
 ("proof_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("reference", "text", True, None, None, "เช่น เลข EDC"),
 ("received_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("received_at", "ts", False, "now", None, ""),
 ("status", "e:payment_status", False, "posted", None, ""),
 ("voided_at", "ts", True, None, None, ""),
 ("voided_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("void_reason", "text", True, None, None, ""),
], updated=False, idx=[("index", ["bill_id"], None), ("index", ["booking_id"], None), ("index", ["branch_id", "received_at"], None)],
 checks=[("payment_amt_chk", "amount_satang > 0"), ("payment_target_chk", "booking_id is not null or bill_id is not null")])

tbl("refund", G, "การคืนเงิน/คืนเป็นเครดิต (ร้านโอนคืนเองแล้วบันทึก)", "US-07-05", [
 ORG,
 ("booking_id", "uuid", True, None, "booking.id|setnull", ""),
 ("bill_id", "uuid", True, None, "bill.id|setnull", ""),
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("amount_satang", "int", False, None, None, ""),
 ("mode", "e:refund_mode", False, None, None, ""),
 ("reason", "text", False, None, None, ""),
 ("proof_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("created_by", "uuid", False, None, "staff_user.id", ""),
], updated=False, checks=[("refund_amt_chk", "amount_satang > 0")])

tbl("credit_ledger", G, "สมุดเครดิตลูกค้า (append-only, ยอด = SUM)", "US-07-05, US-08-03", [
 ORG,
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("delta_satang", "int", False, None, None, "+ เพิ่ม / − ใช้"),
 ("reason", "e:credit_reason", False, None, None, ""),
 ("ref_type", "text", True, None, None, "booking | bill | refund"),
 ("ref_id", "uuid", True, None, None, ""),
 ("created_by", "uuid", True, None, "staff_user.id|setnull", ""),
], updated=False, idx=[("index", ["customer_id", "created_at"], None)],
 checks=[("credit_delta_chk", "delta_satang <> 0")])

tbl("bill", G, "บิล/ใบเสร็จ", "US-08-01..06", [
 ORG, BR,
 ("customer_id", "uuid", True, None, "customer.id", "null = ลูกค้าทั่วไป (ขาย quick item)"),
 ("receipt_no", "text", True, None, None, "ออกตอนปิดบิล R-16; unique ต่อสาขา"),
 ("status", "e:bill_status", False, "open", None, ""),
 ("subtotal_satang", "int", False, 0, None, "Σ line_total"),
 ("bill_discount_satang", "int", False, 0, None, ""),
 ("bill_discount_reason", "text", True, None, None, "บังคับเมื่อ > 0"),
 ("total_satang", "int", False, 0, None, "= subtotal − bill_discount"),
 ("paid_satang", "int", False, 0, None, "Σ payment posted"),
 ("change_satang", "int", False, 0, None, "เงินทอน"),
 ("opened_by", "uuid", False, None, "staff_user.id", ""),
 ("opened_at", "ts", False, "now", None, ""),
 ("closed_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("closed_at", "ts", True, None, None, ""),
 ("voided_by", "uuid", True, None, "staff_user.id|setnull", ""),
 ("voided_at", "ts", True, None, None, ""),
 ("void_reason", "text", True, None, None, ""),
 ("note", "text", True, None, None, ""),
], idx=[("unique", ["branch_id", "receipt_no"], "receipt_no is not null"), ("index", ["branch_id", "closed_at"], None),
        ("index", ["customer_id"], None)],
 checks=[("bill_total_chk", "total_satang = subtotal_satang - bill_discount_satang and total_satang >= 0"),
         ("bill_paid_chk", "status <> 'paid' or paid_satang = total_satang")])

tbl("bill_line", G, "รายการในบิล", "US-08-01, US-08-03, US-10-05", [
 ORG,
 ("bill_id", "uuid", False, None, "bill.id|cascade", ""),
 ("line_type", "e:bill_line_type", False, None, None, ""),
 ("ref_type", "text", True, None, None, "groom_appointment_item | appointment_surcharge | stay | stay_addon | daycare_visit | package_template | customer_package"),
 ("ref_id", "uuid", True, None, None, ""),
 ("description", "text", False, None, None, "ข้อความบนใบเสร็จ"),
 ("pet_id", "uuid", True, None, "pet.id|setnull", ""),
 ("quantity", "int", False, 1, None, ""),
 ("unit_price_satang", "int", False, None, None, "package_redemption = 0"),
 ("line_discount_satang", "int", False, 0, None, ""),
 ("line_discount_reason", "text", True, None, None, ""),
 ("line_total_satang", "int", False, None, None, "= qty × unit − discount"),
 ("performer_id", "uuid", True, None, "staff_user.id|setnull", "ช่างที่ทำ (ค่ามือ)"),
 ("commission_base_satang", "int", False, 0, None, "R-13"),
 ("sort_order", "int", False, 0, None, ""),
], updated=False, idx=[("index", ["bill_id"], None)],
 checks=[("bill_line_total_chk", "line_total_satang = quantity * unit_price_satang - line_discount_satang and line_total_satang >= 0 and quantity > 0")])

tbl("customer_package", G, "แพ็กเกจที่ลูกค้าซื้อแล้ว", "US-10-05, US-10-06", [
 ORG,
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("template_id", "uuid", False, None, "package_template.id", ""),
 ("pet_id", "uuid", True, None, "pet.id|setnull", "single_pet ต้องมีค่า"),
 ("sessions_total", "int", False, None, None, ""),
 ("sessions_used", "int", False, 0, None, ""),
 ("unit_value_satang", "int", False, None, None, "R-14 = floor(price/sessions)"),
 ("purchased_bill_id", "uuid", False, None, "bill.id", ""),
 ("purchased_at", "ts", False, "now", None, ""),
 ("expires_at", "ts", False, None, None, ""),
 ("status", "e:customer_package_status", False, "active", None, ""),
], idx=[("index", ["customer_id", "status"], None)],
 checks=[("cpkg_chk", "sessions_used >= 0 and sessions_used <= sessions_total")])

tbl("package_redemption", G, "การใช้สิทธิ์แพ็กเกจ", "US-10-05, US-08-06", [
 ORG,
 ("customer_package_id", "uuid", False, None, "customer_package.id", ""),
 ("bill_line_id", "uuid", False, None, "bill_line.id", ""),
 ("pet_id", "uuid", False, None, "pet.id", ""),
 ("performer_id", "uuid", True, None, "staff_user.id|setnull", ""),
 ("redeemed_at", "ts", False, "now", None, ""),
 ("reversed_at", "ts", True, None, None, "void บิล → คืนสิทธิ์"),
], updated=False)

tbl("commission_entry", G, "ค่ามือที่เกิดขึ้น (สร้างตอนปิดบิล)", "US-09-02, US-09-05, US-12-03", [
 ORG, BR,
 ("staff_user_id", "uuid", False, None, "staff_user.id", ""),
 ("bill_id", "uuid", False, None, "bill.id", ""),
 ("bill_line_id", "uuid", False, None, "bill_line.id", ""),
 ("base_satang", "int", False, None, None, ""),
 ("rule_id", "uuid", True, None, "commission_rule.id|setnull", "กติกาที่ใช้"),
 ("amount_satang", "int", False, None, None, "R-13"),
 ("status", "e:commission_status", False, "earned", None, ""),
 ("earned_at", "ts", False, "now", None, "= bill.closed_at"),
 ("reversed_at", "ts", True, None, None, ""),
], updated=False, idx=[("index", ["staff_user_id", "earned_at"], None), ("unique", ["bill_line_id"], None)])

# ===================== H. After-service =====================
G = "H. After-service"
tbl("report_card", G, "Report card กรูม / Stay report", "US-10-01, US-10-02, US-10-03", [
 ORG, BR,
 ("kind", "e:report_card_kind", False, None, None, ""),
 ("appointment_id", "uuid", True, None, "groom_appointment.id|cascade", ""),
 ("stay_id", "uuid", True, None, "stay.id|cascade", ""),
 ("pet_id", "uuid", False, None, "pet.id", ""),
 ("customer_id", "uuid", False, None, "customer.id", ""),
 ("skin", "e:skin_condition", True, None, None, "grooming บังคับ"),
 ("ears", "e:ear_condition", True, None, None, ""),
 ("nails", "e:nail_condition", True, None, None, ""),
 ("teeth", "e:teeth_condition", True, None, None, ""),
 ("parasites", "e:parasite_finding", True, None, None, ""),
 ("cooperation", "int", True, None, None, "1–5"),
 ("staff_note", "text", True, None, None, "ถึงลูกค้า"),
 ("recommendation", "text", True, None, None, ""),
 ("status", "e:report_card_status", False, "draft", None, ""),
 ("created_by", "uuid", False, None, "staff_user.id", ""),
 ("sent_at", "ts", True, None, None, ""),
 ("customer_rating", "int", True, None, None, "1–5"),
 ("customer_feedback", "text", True, None, None, "ส่วนตัวถึงร้าน"),
 ("rated_at", "ts", True, None, None, ""),
 ("google_review_clicked_at", "ts", True, None, None, ""),
], idx=[("unique", ["appointment_id"], "appointment_id is not null"), ("unique", ["stay_id"], "stay_id is not null"),
        ("index", ["customer_id"], None)],
 checks=[("rc_target_chk", "(appointment_id is not null) <> (stay_id is not null)"),
         ("rc_rating_chk", "(cooperation is null or cooperation between 1 and 5) and (customer_rating is null or customer_rating between 1 and 5)")])

# ===================== I. Notifications & jobs =====================
G = "I. Notifications & Jobs"
tbl("notification", G, "ทุกข้อความที่ส่ง/ข้าม (ใช้นับโควตา LINE ด้วย R-18)", "US-13-05, US-13-06", [
 ("organization_id", "uuid", False, None, "organization.id|cascade", ""),
 ("branch_id", "uuid", True, None, "branch.id|cascade", ""),
 ("channel", "e:notification_channel", False, None, None, ""),
 ("recipient_type", "e:recipient_type", False, None, None, ""),
 ("recipient_id", "uuid", False, None, None, "customer.id / staff_user.id / platform_admin.id ตาม recipient_type"),
 ("template_key", "text", False, None, None, "ดู notification catalog ใน 05"),
 ("payload", "jsonb", False, None, None, "ตัวแปรของ template"),
 ("dedupe_key", "text", False, None, None, "unique — กันส่งซ้ำ"),
 ("month_key", "text", False, None, None, "YYYY-MM ตามเวลาท้องถิ่น (นับโควตา)"),
 ("status", "e:notification_status", False, "queued", None, ""),
 ("skip_reason", "e:notification_skip_reason", True, None, None, ""),
 ("sent_at", "ts", True, None, None, ""),
 ("error", "text", True, None, None, ""),
], updated=False, idx=[("unique", ["dedupe_key"], None), ("index", ["branch_id", "month_key", "channel", "status"], None)])

tbl("scheduled_job", G, "งานตั้งเวลา (ประมวลผลโดย /api/cron/tick ทุก 1–5 นาที)", "US-05-02, US-07-06, US-10-04, US-12-05", [
 ("organization_id", "uuid", True, None, "organization.id|cascade", ""),
 ("job_type", "e:job_type", False, None, None, ""),
 ("run_at", "ts", False, None, None, ""),
 ("payload", "jsonb", False, None, None, ""),
 ("dedupe_key", "text", False, None, None, "unique — เช่น reminder_24h:{appointmentId}"),
 ("status", "e:job_status", False, "pending", None, ""),
 ("attempts", "int", False, 0, None, "สูงสุด 5 แล้ว failed"),
 ("locked_at", "ts", True, None, None, "ใช้ SELECT … FOR UPDATE SKIP LOCKED"),
 ("last_error", "text", True, None, None, ""),
 ("finished_at", "ts", True, None, None, ""),
], idx=[("unique", ["dedupe_key"], None), ("index", ["status", "run_at"], None)])

# ===================== J. Compliance & ops =====================
G = "J. Compliance & Ops"
tbl("audit_log", G, "บันทึกการกระทำสำคัญ (append-only, trigger ห้าม update/delete)", "US-13-07", [
 ("organization_id", "uuid", True, None, "organization.id|cascade", ""),
 ("actor_type", "e:actor_type", False, None, None, ""),
 ("actor_id", "uuid", True, None, None, ""),
 ("action", "text", False, None, None, "ดูรายการ action ใน 04-business-rules R-27"),
 ("entity_type", "text", False, None, None, ""),
 ("entity_id", "uuid", True, None, None, ""),
 ("before", "jsonb", True, None, None, ""),
 ("after", "jsonb", True, None, None, ""),
 ("reason", "text", True, None, None, ""),
 ("ip", "text", True, None, None, ""),
 ("support_access_log_id", "uuid", True, None, None, "ทำผ่าน support mode"),
], updated=False, idx=[("index", ["organization_id", "created_at"], None), ("index", ["entity_type", "entity_id"], None)])

tbl("consent_record", G, "การยอมรับเอกสารกฎหมาย (PDPA)", "US-13-08, US-11-01, US-03-12", [
 ("subject_type", "e:consent_subject", False, None, None, ""),
 ("subject_id", "uuid", False, None, None, "owner_profile.id หรือ organization.id"),
 ("organization_id", "uuid", True, None, "organization.id|cascade", "ร้านที่เกี่ยวข้อง"),
 ("document", "e:legal_doc", False, None, None, ""),
 ("version", "text", False, None, None, "เช่น 2026-10-01"),
 ("accepted", "bool", False, None, None, "photo_consent อาจเป็น false"),
 ("ip", "text", True, None, None, ""),
 ("user_agent", "text", True, None, None, ""),
], updated=False, idx=[("index", ["subject_type", "subject_id", "document"], None)])

tbl("data_request", G, "คำขอดู/ลบข้อมูลส่วนบุคคล", "US-13-08, US-11-01", [
 ORG,
 ("owner_profile_id", "uuid", False, None, "owner_profile.id", ""),
 ("type", "e:data_request_type", False, None, None, ""),
 ("status", "e:data_request_status", False, "open", None, ""),
 ("resolved_by", "uuid", True, None, None, "platform_admin.id"),
 ("resolved_at", "ts", True, None, None, ""),
 ("note", "text", True, None, None, ""),
])

tbl("feedback_report", G, "แจ้งปัญหา/ขอ feature จากร้าน", "US-13-13", [
 ORG,
 ("staff_user_id", "uuid", False, None, "staff_user.id", ""),
 ("page_url", "text", False, None, None, ""),
 ("message", "text", False, None, None, ""),
 ("screenshot_file_id", "uuid", True, None, "file_object.id|setnull", ""),
 ("app_version", "text", True, None, None, "git sha"),
 ("status", "e:feedback_status", False, "new", None, ""),
])

tbl("support_access_log", G, "การเข้าโหมดช่วยเหลือของทีมแพลตฟอร์ม", "US-13-11", [
 ORG,
 ("platform_admin_id", "uuid", False, None, "platform_admin.id", ""),
 ("reason", "text", False, None, None, ""),
 ("ticket_ref", "text", True, None, None, "เช่น feedback_report.id"),
 ("read_only", "bool", False, True, None, ""),
 ("started_at", "ts", False, "now", None, ""),
 ("ended_at", "ts", True, None, None, ""),
], updated=False)

tbl("import_job", G, "งานนำเข้า CSV (validate ก่อน commit)", "US-02-08", [
 ORG,
 ("kind", "e:import_kind", False, None, None, ""),
 ("file_id", "uuid", False, None, "file_object.id", ""),
 ("status", "e:import_status", False, "validating", None, ""),
 ("total_rows", "int", False, 0, None, ""),
 ("valid_rows", "int", False, 0, None, ""),
 ("error_rows", "int", False, 0, None, ""),
 ("errors", "jsonb", False, "sql:'[]'::jsonb", None, "[{row, column, code, message}]"),
 ("created_by", "uuid", False, None, "staff_user.id", ""),
 ("committed_at", "ts", True, None, None, ""),
])

# Custom SQL that Drizzle cannot express (applied as a custom migration)
CUSTOM_SQL = r"""
-- Custom migration: constraints Drizzle cannot express. NEVER edit after merge — add a new custom migration instead.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ห้ามนัดกรูมของช่างคนเดียวกันทับเวลา (รวม buffer)
ALTER TABLE groom_appointment ADD CONSTRAINT groom_appt_groomer_no_overlap
  EXCLUDE USING gist (groomer_id WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- ห้ามใช้โต๊ะเดียวกันทับเวลา
ALTER TABLE groom_appointment ADD CONSTRAINT groom_appt_station_no_overlap
  EXCLUDE USING gist (station_id WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- ห้ามจองห้องเดียวกันทับคืน
ALTER TABLE stay ADD CONSTRAINT stay_room_no_overlap
  EXCLUDE USING gist (room_unit_id WITH =, daterange(check_in_date, check_out_date) WITH &&)
  WHERE (status IN ('reserved', 'checked_in'));

-- ห้ามน้องตัวเดียวพักซ้อนกัน
ALTER TABLE stay ADD CONSTRAINT stay_pet_no_overlap
  EXCLUDE USING gist (pet_id WITH =, daterange(check_in_date, check_out_date) WITH &&)
  WHERE (status IN ('reserved', 'checked_in'));

-- booking.bill_id → bill (วนอ้างกันจึงเพิ่มทีหลัง)
ALTER TABLE booking ADD CONSTRAINT booking_bill_fk FOREIGN KEY (bill_id) REFERENCES bill(id) ON DELETE SET NULL;

-- append-only tables
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER booking_event_append_only BEFORE UPDATE OR DELETE ON booking_event
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER credit_ledger_append_only BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER consent_record_append_only BEFORE UPDATE OR DELETE ON consent_record
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
"""
