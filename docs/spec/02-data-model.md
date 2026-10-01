# 02 — Data Model (field-level)

> **สถานะ:** สัญญาข้อมูลของ MVP — `packages/db/src/schema/*.ts` ต้องตรงกับไฟล์นี้ทุกตาราง/ทุกคอลัมน์ (CI ตรวจด้วย `pnpm --filter @app/db check:doc`)
> **ลำดับการแก้:** แก้ไฟล์นี้ก่อน (spec-first) → แก้ schema → `pnpm --filter @app/db generate` → commit migration ที่ได้ → เปิด PR พร้อม label `schema`

## 0. กติกาที่ใช้ทุกตาราง

| เรื่อง | กติกา |
|---|---|
| Primary key | `id uuid default gen_random_uuid()` ยกเว้นตารางที่ระบุ PK เอง |
| Tenant | ตารางธุรกิจทุกตารางมี `organization_id` — **ทุก query ต้องกรองด้วย organization_id ของ session** ผ่าน repository helper เท่านั้น (ห้ามเขียน query ตรงจาก route) |
| เงิน | `*_satang` เป็น integer หน่วยสตางค์ (฿1 = 100) ห้ามใช้ float/decimal ใน JS; แสดงผลด้วย `formatTHB()` |
| เวลา | `timestamptz` เก็บ UTC เสมอ; แปลงเป็นเวลาไทยตอนแสดงผลด้วย `branch.timezone` |
| วันที่ท้องถิ่น | คอลัมน์ `date` (เช่น `check_in_date`) เป็นวันตามเวลาไทย อ่าน/เขียนเป็น string `YYYY-MM-DD` (Drizzle `mode: "string"`) ห้ามแปลงเป็น `Date` |
| เวลาในวัน | คอลัมน์ `time` เป็นเวลาท้องถิ่น `HH:MM` |
| น้ำหนัก | `*_grams` integer กรัม (5.2 กก. = 5200) |
| เปอร์เซ็นต์ค่ามือ | basis points (1500 = 15.00%) |
| ลบข้อมูล | ไม่ hard delete ข้อมูลธุรกิจ — ใช้ `status = archived` หรือสถานะ cancelled; hard delete ได้เฉพาะ PDPA (`owner_profile.erased_at`) |
| Snapshot | ราคา/ชื่อบริการ/นโยบาย ณ เวลาจอง ถูกคัดลอกลง `*_snapshot`, `price_satang` ของรายการ — ห้ามคำนวณย้อนจาก catalog ปัจจุบัน |
| Append-only | `audit_log`, `booking_event`, `credit_ledger`, `consent_record` — DB trigger ห้าม UPDATE/DELETE |
| updated_at | อัปเดตโดย Drizzle `$onUpdate` (ไม่มี DB trigger) — ถ้าใช้ raw SQL ต้องตั้งเอง |
| ชื่อ | snake_case ใน DB, camelCase ใน TypeScript (Drizzle map ให้) |


## 1. สารบัญตาราง

| กลุ่ม | ตาราง | คำอธิบาย | ไฟล์ schema | Stories |
|---|---|---|---|---|
| A | [`organization`](#tbl-organization) | ธุรกิจ (tenant) 1 รายต่อ 1 record | `platform.ts` | US-13-02, US-13-10 |
| A | [`branch`](#tbl-branch) | สาขา/หน้าร้าน (MVP มี 1 สาขาต่อธุรกิจ แต่ทุกตารางอ้างได้) | `platform.ts` | US-02-01, US-02-02, US-02-03 |
| A | [`branch_hours`](#tbl-branch_hours) | เวลาเปิด-ปิดรายวันของสาขา (1 ช่วงต่อวัน) | `platform.ts` | US-02-01 |
| A | [`branch_closure`](#tbl-branch_closure) | ช่วงปิดร้าน/ปิดบางโมดูล | `platform.ts` | US-02-05 |
| A | [`branch_policy`](#tbl-branch_policy) | นโยบายและค่าตั้งต้นของสาขา (1:1 กับ branch) | `platform.ts` | US-02-04, US-07-03, US-07-04, US-05-01, US-13-06 |
| A | [`public_holiday`](#tbl-public_holiday) | วันหยุดราชการไทย (ข้อมูลกลาง seed ปีละครั้ง) | `platform.ts` | US-13-03 |
| A | [`groom_station`](#tbl-groom_station) | โต๊ะกรูม (จำนวนนัดพร้อมกันสูงสุด = จำนวนโต๊ะ active) | `platform.ts` | US-05-01 |
| B | [`platform_admin`](#tbl-platform_admin) | ทีมแพลตฟอร์ม | `identity.ts` | US-13-10, US-13-11 |
| B | [`staff_user`](#tbl-staff_user) | ผู้ใช้ฝั่งร้าน (เจ้าของ/หน้าร้าน/ช่าง) | `identity.ts` | US-01-02, US-01-03, US-01-04 |
| B | [`staff_invite`](#tbl-staff_invite) | คำเชิญพนักงาน | `identity.ts` | US-01-04 |
| B | [`password_reset`](#tbl-password_reset) | ลิงก์รีเซ็ตรหัสผ่าน | `identity.ts` | US-01-02 |
| B | [`session`](#tbl-session) | session ของทุกประเภทผู้ใช้ (cookie httpOnly เก็บ token, DB เก็บ hash) | `identity.ts` | US-01-01, US-01-02 |
| B | [`web_push_subscription`](#tbl-web_push_subscription) | อุปกรณ์ที่รับ Web Push | `identity.ts` | US-13-05, US-09-04 |
| B | [`staff_working_hours`](#tbl-staff_working_hours) | เวลาทำงานรายสัปดาห์ของช่าง | `identity.ts` | US-09-01 |
| B | [`staff_time_off`](#tbl-staff_time_off) | วันหยุด/ลาของช่าง | `identity.ts` | US-09-01 |
| C | [`line_channel`](#tbl-line_channel) | การเชื่อม LINE OA ของสาขา (ทีมแพลตฟอร์มกรอก — ตามผล SP-01) | `line.ts` | US-02-06, US-13-06 |
| C | [`line_identity`](#tbl-line_identity) | บัญชี LINE ของลูกค้า (unique ต่อ provider) | `line.ts` | US-01-01 |
| D | [`owner_profile`](#tbl-owner_profile) | ตัวตนเจ้าของสัตว์ระดับแพลตฟอร์ม (MVP: สร้างแยกต่อร้าน, P3 จึงรวมข้ามร้าน) | `customers.ts` | US-13-02, US-03-01 |
| D | [`customer`](#tbl-customer) | ความสัมพันธ์ลูกค้า-ร้าน + ข้อมูลเฉพาะร้าน | `customers.ts` | US-03-01, US-03-09, US-03-12, US-11-01 |
| D | [`customer_link_request`](#tbl-customer_link_request) | คำขอจับคู่บัญชี LINE กับลูกค้าเดิมของร้าน (ไม่มี OTP จึงให้ร้านยืนยัน) | `customers.ts` | US-01-01, US-11-01 |
| D | [`pet`](#tbl-pet) | สัตว์เลี้ยง (ผูกกับ owner_profile ไม่ผูกร้าน) | `customers.ts` | US-03-02, US-03-11, US-11-02 |
| D | [`pet_shop_profile`](#tbl-pet_shop_profile) | ข้อมูลน้องที่เป็นของร้าน (กรูม/สุขภาพ/โน้ต) 1 แถวต่อ pet ต่อ org | `customers.ts` | US-03-03, US-03-04, US-03-07 |
| D | [`pet_temperament_flag`](#tbl-pet_temperament_flag) | ป้ายนิสัย | `customers.ts` | US-03-04 |
| D | [`pet_weight`](#tbl-pet_weight) | ประวัติน้ำหนัก | `customers.ts` | US-03-03, US-05-06 |
| D | [`vaccine_type`](#tbl-vaccine_type) | ชนิดวัคซีน (ข้อมูลกลาง seed) | `customers.ts` | US-03-05 |
| D | [`pet_vaccination`](#tbl-pet_vaccination) | ประวัติวัคซีน | `customers.ts` | US-03-05, US-06-05, US-11-02 |
| D | [`file_object`](#tbl-file_object) | ไฟล์ทุกชนิดใน object storage (ไม่เก็บไฟล์ใน DB) | `customers.ts` | US-13-04 |
| D | [`pet_photo`](#tbl-pet_photo) | คลังรูปน้อง (ก่อน-หลัง/ระหว่างพัก) | `customers.ts` | US-03-06, US-09-03, US-06-10 |
| E | [`size_tier`](#tbl-size_tier) | ช่วงขนาดตามน้ำหนัก แยกหมา/แมว (ไม่ทับซ้อน) | `catalog.ts` | US-04-02 |
| E | [`rate_plan`](#tbl-rate_plan) | แผนราคา (MVP ใช้ 'standard' แผนเดียว; P3 เพิ่มราคา OTA) | `catalog.ts` | US-13-02 |
| E | [`service`](#tbl-service) | บริการและ add-on ทุกโมดูล | `catalog.ts` | US-04-01, US-04-04, US-06-06 |
| E | [`service_price`](#tbl-service_price) | ราคาและเวลา = บริการ × ขนาด × กลุ่มขน (R-01..R-03) | `catalog.ts` | US-04-02, US-04-03 |
| E | [`service_addon_link`](#tbl-service_addon_link) | add-on ใช้กับบริการหลักไหนได้ (ไม่มีแถว = ใช้ได้ทุกบริการใน scope เดียวกัน) | `catalog.ts` | US-04-04 |
| E | [`surcharge_type`](#tbl-surcharge_type) | ค่าบริการเพิ่มหน้างานที่ตั้งไว้ | `catalog.ts` | US-04-05 |
| E | [`room_type`](#tbl-room_type) | ประเภทห้องพัก | `catalog.ts` | US-06-01 |
| E | [`room_unit`](#tbl-room_unit) | ห้องรายยูนิต | `catalog.ts` | US-06-01, US-06-04 |
| E | [`room_rate`](#tbl-room_rate) | ราคาห้องต่อคืน (null size_tier = ทุกขนาด) | `catalog.ts` | US-06-02 |
| E | [`daycare_session_type`](#tbl-daycare_session_type) | รอบ Daycare | `catalog.ts` | US-06-13 |
| E | [`daycare_rate`](#tbl-daycare_rate) | ราคา Daycare ต่อรอบ | `catalog.ts` | US-06-13 |
| E | [`package_template`](#tbl-package_template) | แพ็กเกจหลายครั้งที่ร้านขาย | `catalog.ts` | US-10-05 |
| E | [`commission_rule`](#tbl-commission_rule) | กติกาค่ามือ (ลำดับความสำคัญใน R-13) | `catalog.ts` | US-09-02 |
| F | [`booking`](#tbl-booking) | ใบจอง (header) — 1 ใบมีได้หลายนัด/หลายการพัก | `bookings.ts` | US-05-04, US-11-03, US-07-03, US-07-04 |
| F | [`booking_event`](#tbl-booking_event) | บันทึกทุกการเปลี่ยนสถานะ (append-only) — ใช้ทำ analytics/OTA sync | `bookings.ts` | US-13-02 |
| F | [`groom_appointment`](#tbl-groom_appointment) | นัดกรูม 1 ตัว 1 ช่าง 1 โต๊ะ (กันชนด้วย exclusion constraint) | `bookings.ts` | US-05-01, US-05-03, US-05-04, US-05-06 |
| F | [`groom_appointment_item`](#tbl-groom_appointment_item) | บริการ/add-on ในนัด (ราคา snapshot) | `bookings.ts` | US-05-04, US-11-03 |
| F | [`appointment_surcharge`](#tbl-appointment_surcharge) | ค่าบริการเพิ่มหน้างาน | `bookings.ts` | US-04-05 |
| F | [`consent_document`](#tbl-consent_document) | ใบยินยอม/ข้อตกลงที่ลูกค้าเซ็น (immutable) | `bookings.ts` | US-05-06, US-06-08 |
| F | [`stay`](#tbl-stay) | การพัก 1 ตัว 1 ช่วงวัน (กันห้องซ้อนด้วย exclusion constraint) | `bookings.ts` | US-06-03, US-06-04, US-06-11, US-11-04 |
| F | [`stay_addon`](#tbl-stay_addon) | add-on ระหว่างพัก | `bookings.ts` | US-06-06 |
| F | [`stay_intake`](#tbl-stay_intake) | ฟอร์มรับฝาก (1:1 กับ stay) | `bookings.ts` | US-06-08 |
| F | [`stay_medication`](#tbl-stay_medication) | ยาที่ต้องให้ระหว่างพัก | `bookings.ts` | US-06-08, US-06-09 |
| F | [`stay_belonging`](#tbl-stay_belonging) | ของที่ลูกค้านำมา | `bookings.ts` | US-06-08, US-06-11 |
| F | [`care_task`](#tbl-care_task) | งานดูแลรายวัน (สร้างอัตโนมัติตอนเช็คอิน R-26) | `bookings.ts` | US-06-09 |
| F | [`daycare_visit`](#tbl-daycare_visit) | การฝาก Daycare 1 ตัว 1 วัน 1 รอบ | `bookings.ts` | US-06-13, US-11-05 |
| G | [`payment_slip`](#tbl-payment_slip) | สลิปที่อัปโหลด (ร้านยืนยันเอง + จับซ้ำจาก QR บนสลิป R-05) | `billing.ts` | US-07-02, US-11-07 |
| G | [`payment`](#tbl-payment) | เงินที่รับจริง (มัดจำและชำระบิล) | `billing.ts` | US-07-02, US-08-04 |
| G | [`refund`](#tbl-refund) | การคืนเงิน/คืนเป็นเครดิต (ร้านโอนคืนเองแล้วบันทึก) | `billing.ts` | US-07-05 |
| G | [`credit_ledger`](#tbl-credit_ledger) | สมุดเครดิตลูกค้า (append-only, ยอด = SUM) | `billing.ts` | US-07-05, US-08-03 |
| G | [`bill`](#tbl-bill) | บิล/ใบเสร็จ | `billing.ts` | US-08-01..06 |
| G | [`bill_line`](#tbl-bill_line) | รายการในบิล | `billing.ts` | US-08-01, US-08-03, US-10-05 |
| G | [`customer_package`](#tbl-customer_package) | แพ็กเกจที่ลูกค้าซื้อแล้ว | `billing.ts` | US-10-05, US-10-06 |
| G | [`package_redemption`](#tbl-package_redemption) | การใช้สิทธิ์แพ็กเกจ | `billing.ts` | US-10-05, US-08-06 |
| G | [`commission_entry`](#tbl-commission_entry) | ค่ามือที่เกิดขึ้น (สร้างตอนปิดบิล) | `billing.ts` | US-09-02, US-09-05, US-12-03 |
| H | [`report_card`](#tbl-report_card) | Report card กรูม / Stay report | `aftercare.ts` | US-10-01, US-10-02, US-10-03 |
| I | [`notification`](#tbl-notification) | ทุกข้อความที่ส่ง/ข้าม (ใช้นับโควตา LINE ด้วย R-18) | `messaging.ts` | US-13-05, US-13-06 |
| I | [`scheduled_job`](#tbl-scheduled_job) | งานตั้งเวลา (ประมวลผลโดย /api/cron/tick ทุก 1–5 นาที) | `messaging.ts` | US-05-02, US-07-06, US-10-04, US-12-05 |
| J | [`audit_log`](#tbl-audit_log) | บันทึกการกระทำสำคัญ (append-only, trigger ห้าม update/delete) | `compliance.ts` | US-13-07 |
| J | [`consent_record`](#tbl-consent_record) | การยอมรับเอกสารกฎหมาย (PDPA) | `compliance.ts` | US-13-08, US-11-01, US-03-12 |
| J | [`data_request`](#tbl-data_request) | คำขอดู/ลบข้อมูลส่วนบุคคล | `compliance.ts` | US-13-08, US-11-01 |
| J | [`feedback_report`](#tbl-feedback_report) | แจ้งปัญหา/ขอ feature จากร้าน | `compliance.ts` | US-13-13 |
| J | [`support_access_log`](#tbl-support_access_log) | การเข้าโหมดช่วยเหลือของทีมแพลตฟอร์ม | `compliance.ts` | US-13-11 |
| J | [`import_job`](#tbl-import_job) | งานนำเข้า CSV (validate ก่อน commit) | `compliance.ts` | US-02-08 |

รวม **72 ตาราง**, **936 คอลัมน์**, **72 enum**


## 2. A. Platform & Tenancy


<a id="tbl-organization"></a>

### organization

ธุรกิจ (tenant) 1 รายต่อ 1 record  
Stories: US-13-02, US-13-10 · PK: `id` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| name | `text` | NO |  |  | ชื่อธุรกิจ |
| slug | `text` | NO |  |  | a-z0-9- ยาว 3–40, unique ทั้งระบบ |
| status | `org_status` | NO | 'pilot' |  | pilot = นำร่องฟรี |
| default_locale | `text` | NO | 'th' |  | 'th' ใน MVP |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `organization_slug_uq` (slug)


<a id="tbl-branch"></a>

### branch

สาขา/หน้าร้าน (MVP มี 1 สาขาต่อธุรกิจ แต่ทุกตารางอ้างได้)  
Stories: US-02-01, US-02-02, US-02-03 · PK: `id` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| name | `text` | NO |  |  | ชื่อร้านที่ลูกค้าเห็น |
| booking_slug | `text` | NO |  |  | ใช้ใน URL จอง /b/{booking_slug} unique ทั้งระบบ |
| phone | `text` | YES |  |  | E.164 เช่น +66812345678 |
| address_line | `text` | YES |  |  | บ้านเลขที่/ถนน |
| subdistrict | `text` | YES |  |  | ตำบล/แขวง |
| district | `text` | YES |  |  | อำเภอ/เขต |
| province | `text` | YES |  |  | จังหวัด |
| postal_code | `text` | YES |  |  | 5 หลัก |
| latitude | `double precision` | YES |  |  |  |
| longitude | `double precision` | YES |  |  |  |
| logo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| facebook_url | `text` | YES |  |  |  |
| instagram_url | `text` | YES |  |  |  |
| timezone | `text` | NO | 'Asia/Bangkok' |  | IANA tz ใช้คำนวณวันที่ท้องถิ่นทั้งหมด |
| module_grooming | `boolean` | NO | true |  | เปิดโมดูลกรูม |
| module_hotel | `boolean` | NO | false |  | เปิดโมดูลโรงแรม |
| module_daycare | `boolean` | NO | false |  | เปิดโมดูล Daycare |
| promptpay_type | `promptpay_type` | YES |  |  | ประเภท PromptPay ID |
| promptpay_id | `text` | YES |  |  | เก็บแบบตัวเลขล้วน (เบอร์ 10 หลัก / 13 หลัก) |
| promptpay_account_name | `text` | YES |  |  | ชื่อบัญชีที่ลูกค้าเห็นก่อนโอน |
| receipt_prefix | `text` | NO | 'R' |  | คำนำหน้าเลขใบเสร็จ A-Z 1–3 ตัว |
| receipt_year_be | `integer` | NO | 0 |  | ปี พ.ศ. ของ counter ปัจจุบัน (รีเซ็ตเลขเมื่อขึ้นปีใหม่) — R-16 |
| receipt_next_seq | `integer` | NO | 1 |  | เลขลำดับถัดไป — ล็อกแถวก่อนใช้ (R-16) |
| booking_seq_month | `text` | NO | '' |  | YYMM ของ counter เลขใบจอง |
| booking_next_seq | `integer` | NO | 1 |  | เลขลำดับใบจองถัดไป (R-23) |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `branch_booking_slug_uq` (booking_slug)
- INDEX `branch_organization_id_idx` (organization_id)
- CHECK `branch_receipt_prefix_chk`: `receipt_prefix ~ '^[A-Z]{1,3}$'`


<a id="tbl-branch_hours"></a>

### branch_hours

เวลาเปิด-ปิดรายวันของสาขา (1 ช่วงต่อวัน)  
Stories: US-02-01 · PK: `(branch_id, weekday)` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| weekday | `integer` | NO |  |  | 0=อาทิตย์ … 6=เสาร์ |
| is_closed | `boolean` | NO | false |  | ปิดทั้งวัน |
| opens_at | `time` | YES |  |  | เวลาท้องถิ่น เช่น 09:00 (null ถ้า is_closed) |
| closes_at | `time` | YES |  |  | ต้องมากกว่า opens_at |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- CHECK `branch_hours_weekday_chk`: `weekday between 0 and 6`
- CHECK `branch_hours_range_chk`: `is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at)`


<a id="tbl-branch_closure"></a>

### branch_closure

ช่วงปิดร้าน/ปิดบางโมดูล  
Stories: US-02-05 · PK: `id` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| starts_at | `timestamptz` | NO |  |  | UTC |
| ends_at | `timestamptz` | NO |  |  | UTC (exclusive) |
| scope | `closure_scope` | NO | 'all' |  | ปิดทั้งร้านหรือเฉพาะโมดูล |
| source | `closure_source` | NO | 'manual' |  |  |
| reason | `text` | YES |  |  |  |
| created_by | `uuid` | YES |  | staff_user.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `branch_closure_branch_id_starts_at_idx` (branch_id, starts_at)
- CHECK `branch_closure_range_chk`: `ends_at > starts_at`


<a id="tbl-branch_policy"></a>

### branch_policy

นโยบายและค่าตั้งต้นของสาขา (1:1 กับ branch)  
Stories: US-02-04, US-07-03, US-07-04, US-05-01, US-13-06 · PK: `branch_id` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| branch_id | `uuid` | NO |  | branch.id (cascade) | PK |
| default_deposit_type | `deposit_type` | NO | 'none' |  |  |
| default_deposit_value | `integer` | NO | 0 |  | fixed = satang, percent = 0–100 |
| grooming_free_cancel_hours | `integer` | NO | 24 |  | ยกเลิกก่อนนัด ≥ ค่านี้ = ไม่ริบ |
| hotel_free_cancel_hours | `integer` | NO | 72 |  |  |
| daycare_free_cancel_hours | `integer` | NO | 24 |  |  |
| late_cancel_forfeit_percent | `integer` | NO | 100 |  | ยกเลิกกระชั้น ริบกี่ % ของมัดจำ |
| cancel_refund_mode | `cancel_refund_mode` | NO | 'credit' |  | ส่วนที่ไม่ริบ คืนเงินหรือเครดิต |
| booking_lead_minutes | `integer` | NO | 120 |  | จองออนไลน์ล่วงหน้าขั้นต่ำ |
| booking_horizon_days | `integer` | NO | 60 |  | จองล่วงหน้าได้ไกลสุด |
| reschedule_cutoff_hours | `integer` | NO | 24 |  | ลูกค้าเลื่อน/ยกเลิกเองได้ถึงกี่ ชม. ก่อนนัด |
| no_show_grace_minutes | `integer` | NO | 30 |  | กด no-show ได้หลังเวลานัด + ค่านี้ |
| slot_step_minutes | `integer` | NO | 15 |  | ความละเอียดเวลาเริ่ม 5/10/15/30 |
| buffer_minutes | `integer` | NO | 10 |  | เวลาทำความสะอาดหลังแต่ละนัด |
| max_appointments_per_day | `integer` | YES |  |  | null = ไม่จำกัด |
| max_appointments_per_groomer_day | `integer` | YES |  |  |  |
| hold_minutes | `integer` | NO | 15 |  | ล็อกคิวระหว่างจ่ายมัดจำ |
| approval_timeout_minutes | `integer` | NO | 120 |  | เตือนร้านซ้ำถ้ายังไม่อนุมัติ |
| auto_confirm_grooming | `boolean` | NO | true |  |  |
| auto_confirm_hotel | `boolean` | NO | false |  |  |
| auto_confirm_daycare | `boolean` | NO | true |  |  |
| required_vaccines_dog | `text[]` | NO | '{}' |  | รหัสจาก vaccine_type |
| required_vaccines_cat | `text[]` | NO | '{}' |  |  |
| enforce_vaccines_grooming | `boolean` | NO | false |  | บังคับวัคซีนกับกรูมด้วยหรือไม่ |
| rejected_breeds | `text[]` | NO | '{}' |  | สายพันธุ์ที่ไม่รับ (ข้อความตรงกับ pet.breed) |
| max_pet_weight_grams | `integer` | YES |  |  |  |
| grooming_consent_text | `text` | NO | '' |  | แม่แบบใบยินยอมก่อนกรูม |
| boarding_agreement_text | `text` | NO | '' |  | แม่แบบข้อตกลงรับฝาก |
| policy_text | `text` | NO | '' |  | นโยบายที่แสดงให้ลูกค้าก่อนยืนยันจอง |
| reminder_24h_enabled | `boolean` | NO | true |  |  |
| economy_mode | `boolean` | NO | false |  | โหมดประหยัดข้อความ LINE (R-18) |
| next_groom_default_days | `integer` | NO | 28 |  | รอบกรูมตั้งต้น |
| google_review_url | `text` | YES |  |  | ลิงก์รีวิว Google ของร้าน |
| report_card_requires_review | `boolean` | NO | false |  | ต้องให้หน้าร้านตรวจก่อนส่ง |
| daily_summary_time | `time` | NO | '20:00' |  | เวลาส่งสรุปรายวัน (ท้องถิ่น) |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- CHECK `policy_percent_chk`: `late_cancel_forfeit_percent between 0 and 100`
- CHECK `policy_step_chk`: `slot_step_minutes in (5,10,15,30)`
- CHECK `policy_deposit_chk`: `default_deposit_value >= 0 and (default_deposit_type <> 'percent' or default_deposit_value <= 100)`


<a id="tbl-public_holiday"></a>

### public_holiday

วันหยุดราชการไทย (ข้อมูลกลาง seed ปีละครั้ง)  
Stories: US-13-03 · PK: `holiday_date` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| holiday_date | `date` | NO |  |  | PK |
| name_th | `text` | NO |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-groom_station"></a>

### groom_station

โต๊ะกรูม (จำนวนนัดพร้อมกันสูงสุด = จำนวนโต๊ะ active)  
Stories: US-05-01 · PK: `id` · schema: `packages/db/src/schema/platform.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| name | `text` | NO |  |  | เช่น โต๊ะ 1 |
| sort_order | `integer` | NO | 0 |  |  |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `groom_station_branch_id_idx` (branch_id)


## 3. B. Identity & Auth


<a id="tbl-platform_admin"></a>

### platform_admin

ทีมแพลตฟอร์ม  
Stories: US-13-10, US-13-11 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| email | `text` | NO |  |  | lowercase |
| password_hash | `text` | NO |  |  | argon2id |
| display_name | `text` | NO |  |  |  |
| status | `admin_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `platform_admin_email_uq` (email)


<a id="tbl-staff_user"></a>

### staff_user

ผู้ใช้ฝั่งร้าน (เจ้าของ/หน้าร้าน/ช่าง)  
Stories: US-01-02, US-01-03, US-01-04 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| email | `text` | YES |  |  | lowercase, unique ทั้งระบบ (null ได้ถ้าใช้ LINE อย่างเดียว) |
| password_hash | `text` | YES |  |  | argon2id; null ถ้ายังไม่ตั้งรหัส |
| display_name | `text` | NO |  |  | ชื่อเล่นที่ลูกค้าเห็น |
| phone | `text` | YES |  |  | E.164 |
| role | `staff_role` | NO |  |  | owner / front_desk / staff — ดู permission matrix |
| is_groomer | `boolean` | NO | false |  | แสดงในตัวเลือกช่างและ slot engine |
| line_user_id | `text` | YES |  |  | LINE userId จาก LINE Login ของแพลตฟอร์ม (provider ของแพลตฟอร์ม) |
| photo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| sort_order | `integer` | NO | 0 |  |  |
| status | `staff_status` | NO | 'invited' |  |  |
| failed_login_count | `integer` | NO | 0 |  | R-24 |
| locked_until | `timestamptz` | YES |  |  | R-24 |
| last_login_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `staff_user_email_uq` (email) WHERE `email is not null`
- UNIQUE `staff_user_line_user_id_uq` (line_user_id) WHERE `line_user_id is not null`
- INDEX `staff_user_organization_id_idx` (organization_id)


<a id="tbl-staff_invite"></a>

### staff_invite

คำเชิญพนักงาน  
Stories: US-01-04 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| staff_user_id | `uuid` | NO |  | staff_user.id (cascade) | record ที่สร้างไว้สถานะ invited |
| token_hash | `text` | NO |  |  | sha256 ของ token ในลิงก์ |
| expires_at | `timestamptz` | NO |  |  | สร้าง + 7 วัน |
| accepted_at | `timestamptz` | YES |  |  |  |
| created_by | `uuid` | NO |  | staff_user.id |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `staff_invite_token_hash_uq` (token_hash)


<a id="tbl-password_reset"></a>

### password_reset

ลิงก์รีเซ็ตรหัสผ่าน  
Stories: US-01-02 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| staff_user_id | `uuid` | NO |  | staff_user.id (cascade) |  |
| token_hash | `text` | NO |  |  | sha256 |
| expires_at | `timestamptz` | NO |  |  | สร้าง + 30 นาที |
| used_at | `timestamptz` | YES |  |  | ใช้ได้ครั้งเดียว |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `password_reset_token_hash_uq` (token_hash)


<a id="tbl-session"></a>

### session

session ของทุกประเภทผู้ใช้ (cookie httpOnly เก็บ token, DB เก็บ hash)  
Stories: US-01-01, US-01-02 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| token_hash | `text` | NO |  |  | sha256 ของ session token |
| subject_type | `session_subject` | NO |  |  |  |
| subject_id | `uuid` | NO |  |  | staff_user.id / owner_profile.id / platform_admin.id |
| organization_id | `uuid` | YES |  | organization.id (cascade) | staff: org ของตัวเอง, customer: org ของร้านที่เปิด LIFF |
| branch_id | `uuid` | YES |  | branch.id (cascade) | customer session ผูกสาขาที่เปิด LIFF |
| expires_at | `timestamptz` | NO |  |  | staff 30 วัน (sliding), customer 30 วัน, admin 12 ชม. |
| last_seen_at | `timestamptz` | NO | now() |  |  |
| user_agent | `text` | YES |  |  |  |
| ip | `text` | YES |  |  |  |
| support_access_log_id | `uuid` | YES |  |  | มีค่า = session ของ support mode (อ่านอย่างเดียว) |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `session_token_hash_uq` (token_hash)
- INDEX `session_subject_type_subject_id_idx` (subject_type, subject_id)


<a id="tbl-web_push_subscription"></a>

### web_push_subscription

อุปกรณ์ที่รับ Web Push  
Stories: US-13-05, US-09-04 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| staff_user_id | `uuid` | NO |  | staff_user.id (cascade) |  |
| endpoint | `text` | NO |  |  | unique |
| p256dh | `text` | NO |  |  |  |
| auth | `text` | NO |  |  |  |
| user_agent | `text` | YES |  |  |  |
| last_success_at | `timestamptz` | YES |  |  |  |
| disabled_at | `timestamptz` | YES |  |  | ตั้งเมื่อ push ได้ 404/410 |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `web_push_subscription_endpoint_uq` (endpoint)
- INDEX `web_push_subscription_staff_user_id_idx` (staff_user_id)


<a id="tbl-staff_working_hours"></a>

### staff_working_hours

เวลาทำงานรายสัปดาห์ของช่าง  
Stories: US-09-01 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| staff_user_id | `uuid` | NO |  | staff_user.id (cascade) |  |
| weekday | `integer` | NO |  |  | 0–6 |
| starts_at | `time` | NO |  |  | เวลาท้องถิ่น |
| ends_at | `time` | NO |  |  |  |
| break_starts_at | `time` | YES |  |  | ช่วงพัก (ถ้ามี) |
| break_ends_at | `time` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `staff_working_hours_staff_user_id_branch_id_weekday_uq` (staff_user_id, branch_id, weekday)
- CHECK `swh_weekday_chk`: `weekday between 0 and 6`
- CHECK `swh_range_chk`: `ends_at > starts_at`
- CHECK `swh_break_chk`: `(break_starts_at is null and break_ends_at is null) or (break_ends_at > break_starts_at and break_starts_at >= starts_at and break_ends_at <= ends_at)`


<a id="tbl-staff_time_off"></a>

### staff_time_off

วันหยุด/ลาของช่าง  
Stories: US-09-01 · PK: `id` · schema: `packages/db/src/schema/identity.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| staff_user_id | `uuid` | NO |  | staff_user.id (cascade) |  |
| starts_at | `timestamptz` | NO |  |  | UTC |
| ends_at | `timestamptz` | NO |  |  | UTC exclusive |
| reason | `text` | YES |  |  |  |
| created_by | `uuid` | YES |  | staff_user.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `staff_time_off_staff_user_id_starts_at_idx` (staff_user_id, starts_at)
- CHECK `sto_range_chk`: `ends_at > starts_at`


## 4. C. LINE


<a id="tbl-line_channel"></a>

### line_channel

การเชื่อม LINE OA ของสาขา (ทีมแพลตฟอร์มกรอก — ตามผล SP-01)  
Stories: US-02-06, US-13-06 · PK: `id` · schema: `packages/db/src/schema/line.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id (cascade) | 1 สาขา : 1 OA |
| provider_id | `text` | NO |  |  | LINE provider ที่ OA สังกัด (userId แยกตาม provider) |
| messaging_channel_id | `text` | NO |  |  |  |
| channel_secret_enc | `text` | NO |  |  | เข้ารหัส AES-256-GCM ด้วย APP_ENCRYPTION_KEY |
| channel_access_token_enc | `text` | NO |  |  | long-lived token เข้ารหัส |
| login_channel_id | `text` | NO |  |  | LINE Login channel ที่มี LIFF (provider เดียวกับ OA) |
| liff_id | `text` | NO |  |  |  |
| bot_basic_id | `text` | YES |  |  | @xxxx ใช้สร้างลิงก์เพิ่มเพื่อน |
| monthly_push_quota | `integer` | NO | 300 |  | โควตา push ของแพ็ก OA ที่ร้านใช้ (R-18) |
| rich_menu_id | `text` | YES |  |  |  |
| webhook_verified_at | `timestamptz` | YES |  |  |  |
| status | `line_channel_status` | NO | 'pending' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `line_channel_branch_id_uq` (branch_id)
- UNIQUE `line_channel_messaging_channel_id_uq` (messaging_channel_id)


<a id="tbl-line_identity"></a>

### line_identity

บัญชี LINE ของลูกค้า (unique ต่อ provider)  
Stories: US-01-01 · PK: `id` · schema: `packages/db/src/schema/line.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| provider_id | `text` | NO |  |  |  |
| line_user_id | `text` | NO |  |  | จาก ID token ที่ verify แล้วเท่านั้น |
| owner_profile_id | `uuid` | NO |  | owner_profile.id (cascade) |  |
| display_name | `text` | YES |  |  |  |
| picture_url | `text` | YES |  |  |  |
| is_friend | `boolean` | NO | false |  | อัปเดตจาก follow/unfollow webhook |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `line_identity_provider_id_line_user_id_uq` (provider_id, line_user_id)
- INDEX `line_identity_owner_profile_id_idx` (owner_profile_id)


## 5. D. Customers & Pets


<a id="tbl-owner_profile"></a>

### owner_profile

ตัวตนเจ้าของสัตว์ระดับแพลตฟอร์ม (MVP: สร้างแยกต่อร้าน, P3 จึงรวมข้ามร้าน)  
Stories: US-13-02, US-03-01 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| created_in_org_id | `uuid` | NO |  | organization.id | ร้านที่สร้าง record นี้ |
| first_name | `text` | NO |  |  |  |
| last_name | `text` | YES |  |  |  |
| nickname | `text` | YES |  |  |  |
| phone_e164 | `text` | YES |  |  | R-22 normalize |
| email | `text` | YES |  |  |  |
| birth_date | `date` | YES |  |  |  |
| address_line | `text` | YES |  |  |  |
| subdistrict | `text` | YES |  |  |  |
| district | `text` | YES |  |  |  |
| province | `text` | YES |  |  |  |
| postal_code | `text` | YES |  |  |  |
| erased_at | `timestamptz` | YES |  |  | PDPA ลบข้อมูล: ล้างค่าส่วนตัวแล้วตั้งเวลา |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `owner_profile_created_in_org_id_phone_e164_idx` (created_in_org_id, phone_e164)


<a id="tbl-customer"></a>

### customer

ความสัมพันธ์ลูกค้า-ร้าน + ข้อมูลเฉพาะร้าน  
Stories: US-03-01, US-03-09, US-03-12, US-11-01 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| owner_profile_id | `uuid` | NO |  | owner_profile.id |  |
| source_channel | `booking_channel` | NO | 'walk_in' |  | ช่องทางที่รู้จักร้านครั้งแรก |
| referral_note | `text` | YES |  |  | รู้จักร้านจากไหน (ข้อความ) |
| emergency_contact_name | `text` | YES |  |  |  |
| emergency_contact_phone | `text` | YES |  |  | E.164 |
| internal_note | `text` | YES |  |  | ลูกค้าไม่เห็น |
| reliability_level | `integer` | NO | 3 |  | 1–4 คำนวณโดย R-09 |
| reliability_override | `integer` | YES |  |  | ร้านกำหนดเอง 1–4 (ชนะค่าคำนวณ) |
| late_cancel_count_12m | `integer` | NO | 0 |  | cache สำหรับ R-09 |
| no_show_count_12m | `integer` | NO | 0 |  | cache สำหรับ R-09 |
| blacklisted | `boolean` | NO | false |  | true = จองออนไลน์ไม่ได้ |
| blacklist_reason | `text` | YES |  |  |  |
| deposit_exempt | `boolean` | NO | false |  | ยกเว้นมัดจำ |
| photo_consent | `photo_consent` | NO | 'unknown' |  |  |
| photo_consent_at | `timestamptz` | YES |  |  |  |
| visit_count | `integer` | NO | 0 |  | นับเมื่อบิลจ่ายแล้ว |
| first_visit_at | `timestamptz` | YES |  |  |  |
| last_visit_at | `timestamptz` | YES |  |  |  |
| credit_balance_satang | `integer` | NO | 0 |  | cache = SUM(credit_ledger) — อัปเดตใน transaction เดียวกัน |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `customer_organization_id_owner_profile_id_uq` (organization_id, owner_profile_id)
- INDEX `customer_organization_id_last_visit_at_idx` (organization_id, last_visit_at)
- CHECK `customer_rel_chk`: `reliability_level between 1 and 4 and (reliability_override is null or reliability_override between 1 and 4)`
- CHECK `customer_credit_chk`: `credit_balance_satang >= 0`


<a id="tbl-customer_link_request"></a>

### customer_link_request

คำขอจับคู่บัญชี LINE กับลูกค้าเดิมของร้าน (ไม่มี OTP จึงให้ร้านยืนยัน)  
Stories: US-01-01, US-11-01 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| line_identity_id | `uuid` | NO |  | line_identity.id (cascade) |  |
| new_owner_profile_id | `uuid` | NO |  | owner_profile.id | profile ที่สร้างจาก LINE |
| candidate_customer_id | `uuid` | NO |  | customer.id | ลูกค้าเดิมที่เบอร์ตรงกัน |
| phone_entered | `text` | NO |  |  | E.164 |
| status | `link_request_status` | NO | 'pending' |  |  |
| decided_by | `uuid` | YES |  | staff_user.id (set null) |  |
| decided_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `customer_link_request_organization_id_status_idx` (organization_id, status)


<a id="tbl-pet"></a>

### pet

สัตว์เลี้ยง (ผูกกับ owner_profile ไม่ผูกร้าน)  
Stories: US-03-02, US-03-11, US-11-02 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| owner_profile_id | `uuid` | NO |  | owner_profile.id |  |
| created_in_org_id | `uuid` | NO |  | organization.id |  |
| name | `text` | NO |  |  |  |
| species | `species` | NO |  |  |  |
| species_other | `text` | YES |  |  | ระบุเมื่อ species = other |
| breed | `text` | YES |  |  | เลือกจากรายการหรือพิมพ์เอง |
| sex | `pet_sex` | NO | 'unknown' |  |  |
| birth_date | `date` | YES |  |  |  |
| age_estimate_months | `integer` | YES |  |  | ใช้เมื่อไม่รู้วันเกิด (อายุ ณ created_at) |
| neutered | `boolean` | YES |  |  | null = ไม่ทราบ |
| color | `text` | YES |  |  |  |
| microchip_no | `text` | YES |  |  |  |
| coat_type | `coat_type` | NO | 'unknown' |  | แปลงเป็น coat_group ด้วย R-02 |
| latest_weight_grams | `integer` | YES |  |  | cache จาก pet_weight ล่าสุด |
| profile_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| status | `pet_status` | NO | 'active' |  | deceased/rehomed → หยุดแจ้งเตือนทั้งหมด |
| status_changed_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `pet_owner_profile_id_idx` (owner_profile_id)
- CHECK `pet_other_chk`: `species <> 'other' or species_other is not null`
- CHECK `pet_weight_chk`: `latest_weight_grams is null or latest_weight_grams > 0`


<a id="tbl-pet_shop_profile"></a>

### pet_shop_profile

ข้อมูลน้องที่เป็นของร้าน (กรูม/สุขภาพ/โน้ต) 1 แถวต่อ pet ต่อ org  
Stories: US-03-03, US-03-04, US-03-07 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| pet_id | `uuid` | NO |  | pet.id (cascade) |  |
| preferred_style | `text` | YES |  |  | ทรงที่ชอบ |
| blade_no | `text` | YES |  |  | เบอร์ใบมีด |
| shampoo_ok | `text` | YES |  |  |  |
| shampoo_avoid | `text` | YES |  |  |  |
| allergies | `text` | YES |  |  |  |
| conditions | `text` | YES |  |  | โรคประจำตัว |
| medications | `text` | YES |  |  |  |
| vet_clinic_name | `text` | YES |  |  |  |
| vet_clinic_phone | `text` | YES |  |  |  |
| internal_note | `text` | YES |  |  | ลูกค้าไม่เห็น และไม่แชร์ข้ามร้าน |
| shared_note | `text` | YES |  |  | ลูกค้าเห็นใน LIFF |
| favorite_style_photo_id | `uuid` | YES |  | pet_photo.id (set null) | รูปทรงโปรด แสดงบน job card |
| groom_interval_days | `integer` | YES |  |  | ร้านตั้งเอง (ชนะค่าคำนวณใน R-17) |
| last_groomed_at | `timestamptz` | YES |  |  | cache |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `pet_shop_profile_organization_id_pet_id_uq` (organization_id, pet_id)


<a id="tbl-pet_temperament_flag"></a>

### pet_temperament_flag

ป้ายนิสัย  
Stories: US-03-04 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| pet_id | `uuid` | NO |  | pet.id (cascade) |  |
| flag | `temperament_flag` | NO |  |  |  |
| note | `text` | YES |  |  |  |
| created_by | `uuid` | YES |  | staff_user.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `pet_temperament_flag_organization_id_pet_id_flag_uq` (organization_id, pet_id, flag)


<a id="tbl-pet_weight"></a>

### pet_weight

ประวัติน้ำหนัก  
Stories: US-03-03, US-05-06 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| pet_id | `uuid` | NO |  | pet.id (cascade) |  |
| weight_grams | `integer` | NO |  |  | > 0 |
| measured_at | `timestamptz` | NO | now() |  |  |
| source | `record_source` | NO | 'shop' |  |  |
| recorded_by | `uuid` | YES |  | staff_user.id (set null) |  |
| appointment_id | `uuid` | YES |  | groom_appointment.id (set null) | ถ้าชั่งตอนเช็คอิน |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `pet_weight_pet_id_measured_at_idx` (pet_id, measured_at)
- CHECK `pet_weight_pos_chk`: `weight_grams > 0`


<a id="tbl-vaccine_type"></a>

### vaccine_type

ชนิดวัคซีน (ข้อมูลกลาง seed)  
Stories: US-03-05 · PK: `code` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| code | `text` | NO |  |  | PK เช่น DOG_RABIES |
| species | `species` | NO |  |  |  |
| name_th | `text` | NO |  |  |  |
| name_en | `text` | NO |  |  |  |
| default_validity_months | `integer` | NO | 12 |  | ใช้เติม expires_on อัตโนมัติ |
| sort_order | `integer` | NO | 0 |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-pet_vaccination"></a>

### pet_vaccination

ประวัติวัคซีน  
Stories: US-03-05, US-06-05, US-11-02 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| pet_id | `uuid` | NO |  | pet.id (cascade) |  |
| vaccine_code | `text` | NO |  | vaccine_type.code |  |
| administered_on | `date` | YES |  |  |  |
| expires_on | `date` | NO |  |  | ใช้ตรวจ vaccine gate (R-11) |
| proof_file_id | `uuid` | YES |  | file_object.id (set null) | รูปสมุดวัคซีน |
| status | `vaccine_status` | NO | 'pending_review' |  | ข้อมูลจากร้าน = verified ทันที |
| source | `record_source` | NO | 'shop' |  |  |
| verified_org_id | `uuid` | YES |  | organization.id (set null) |  |
| verified_by | `uuid` | YES |  | staff_user.id (set null) |  |
| verified_at | `timestamptz` | YES |  |  |  |
| reject_reason | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `pet_vaccination_pet_id_vaccine_code_expires_on_idx` (pet_id, vaccine_code, expires_on)


<a id="tbl-file_object"></a>

### file_object

ไฟล์ทุกชนิดใน object storage (ไม่เก็บไฟล์ใน DB)  
Stories: US-13-04 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | YES |  | organization.id (cascade) | null = ไฟล์ระดับแพลตฟอร์ม |
| kind | `file_kind` | NO |  |  |  |
| storage_key | `text` | NO |  |  | org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext} |
| mime_type | `text` | NO |  |  | อนุญาต image/jpeg, image/png, image/webp, video/mp4, application/pdf, text/csv |
| size_bytes | `integer` | NO |  |  | รูป ≤ 1.5MB หลังย่อ, วิดีโอ ≤ 20MB (R-25) |
| width | `integer` | YES |  |  |  |
| height | `integer` | YES |  |  |  |
| uploaded_by_type | `actor_type` | NO |  |  |  |
| uploaded_by_id | `uuid` | YES |  |  |  |
| committed_at | `timestamptz` | YES |  |  | null = อัปโหลดแต่ยังไม่ผูกกับข้อมูล (ลบทิ้งหลัง 24 ชม.) |
| deleted_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `file_object_storage_key_uq` (storage_key)
- INDEX `file_object_organization_id_kind_idx` (organization_id, kind)
- CHECK `file_size_chk`: `size_bytes > 0`


<a id="tbl-pet_photo"></a>

### pet_photo

คลังรูปน้อง (ก่อน-หลัง/ระหว่างพัก)  
Stories: US-03-06, US-09-03, US-06-10 · PK: `id` · schema: `packages/db/src/schema/customers.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| pet_id | `uuid` | NO |  | pet.id (cascade) |  |
| file_id | `uuid` | NO |  | file_object.id |  |
| kind | `photo_kind` | NO |  |  |  |
| appointment_id | `uuid` | YES |  | groom_appointment.id (set null) |  |
| stay_id | `uuid` | YES |  | stay.id (set null) |  |
| caption | `text` | YES |  |  |  |
| taken_at | `timestamptz` | NO | now() |  |  |
| uploaded_by | `uuid` | YES |  | staff_user.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `pet_photo_pet_id_taken_at_idx` (pet_id, taken_at)
- INDEX `pet_photo_stay_id_idx` (stay_id)


## 6. E. Catalog & Pricing


<a id="tbl-size_tier"></a>

### size_tier

ช่วงขนาดตามน้ำหนัก แยกหมา/แมว (ไม่ทับซ้อน)  
Stories: US-04-02 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| species | `species` | NO |  |  | dog หรือ cat |
| code | `text` | NO |  |  | XS S M L XL XXL |
| label_th | `text` | NO |  |  | เช่น 'เล็ก (≤5 กก.)' |
| min_weight_grams | `integer` | NO |  |  | inclusive |
| max_weight_grams | `integer` | YES |  |  | exclusive; null = ไม่มีเพดาน |
| sort_order | `integer` | NO | 0 |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `size_tier_branch_id_species_code_uq` (branch_id, species, code)
- CHECK `size_tier_range_chk`: `min_weight_grams >= 0 and (max_weight_grams is null or max_weight_grams > min_weight_grams)`
- CHECK `size_tier_species_chk`: `species in ('dog','cat')`


<a id="tbl-rate_plan"></a>

### rate_plan

แผนราคา (MVP ใช้ 'standard' แผนเดียว; P3 เพิ่มราคา OTA)  
Stories: US-13-02 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| code | `text` | NO | 'standard' |  |  |
| name | `text` | NO |  |  |  |
| channel | `rate_channel` | NO | 'all' |  |  |
| is_default | `boolean` | NO | true |  | 1 สาขามี default 1 แผน |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `rate_plan_branch_id_code_uq` (branch_id, code)
- UNIQUE `rate_plan_branch_id_uq` (branch_id) WHERE `is_default`


<a id="tbl-service"></a>

### service

บริการและ add-on ทุกโมดูล  
Stories: US-04-01, US-04-04, US-06-06 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| scope | `service_scope` | NO | 'grooming' |  |  |
| category | `service_category` | NO |  |  |  |
| name_th | `text` | NO |  |  |  |
| description | `text` | YES |  |  |  |
| photo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| species_allowed | `species[]` | NO | '{}' |  | ว่าง = ทุกชนิด |
| is_addon | `boolean` | NO | false |  |  |
| addon_per_day | `boolean` | NO | false |  | add-on โรงแรมคิดต่อวัน |
| online_bookable | `boolean` | NO | true |  | ลูกค้าเห็นใน LIFF |
| est_cost_satang | `integer` | YES |  |  | ต้นทุนโดยประมาณ (รายงานกำไรใน P2) |
| sort_order | `integer` | NO | 0 |  |  |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `service_branch_id_scope_status_idx` (branch_id, scope, status)


<a id="tbl-service_price"></a>

### service_price

ราคาและเวลา = บริการ × ขนาด × กลุ่มขน (R-01..R-03)  
Stories: US-04-02, US-04-03 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| service_id | `uuid` | NO |  | service.id (cascade) |  |
| rate_plan_id | `uuid` | NO |  | rate_plan.id |  |
| size_tier_id | `uuid` | YES |  | size_tier.id (cascade) | null = ราคาเดียวทุกขนาด (เช่น add-on) |
| coat_group | `coat_group` | NO | 'any' |  |  |
| price_satang | `integer` | NO |  |  |  |
| duration_minutes | `integer` | NO | 0 |  | add-on อาจเป็น 0 |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `service_price_service_id_rate_plan_id_size_tier_id_coat__91868e` (service_id, rate_plan_id, size_tier_id, coat_group)
- CHECK `service_price_chk`: `price_satang >= 0 and duration_minutes >= 0 and duration_minutes <= 600`


<a id="tbl-service_addon_link"></a>

### service_addon_link

add-on ใช้กับบริการหลักไหนได้ (ไม่มีแถว = ใช้ได้ทุกบริการใน scope เดียวกัน)  
Stories: US-04-04 · PK: `(addon_service_id, base_service_id)` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| addon_service_id | `uuid` | NO |  | service.id (cascade) |  |
| base_service_id | `uuid` | NO |  | service.id (cascade) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-surcharge_type"></a>

### surcharge_type

ค่าบริการเพิ่มหน้างานที่ตั้งไว้  
Stories: US-04-05 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| name_th | `text` | NO |  |  | เช่น ขนพันกัน |
| default_amount_satang | `integer` | NO | 0 |  |  |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-room_type"></a>

### room_type

ประเภทห้องพัก  
Stories: US-06-01 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| name_th | `text` | NO |  |  |  |
| description | `text` | YES |  |  |  |
| photo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| species_allowed | `species[]` | NO | '{}' |  | ว่าง = ทุกชนิด |
| max_weight_grams | `integer` | YES |  |  |  |
| min_age_months | `integer` | YES |  |  |  |
| allow_in_heat | `boolean` | NO | false |  | รับตัวเมียติดสัด |
| allow_reactive | `boolean` | NO | false |  | รับน้องที่มีป้าย bites/dog_reactive/cat_reactive |
| amenities | `text[]` | NO | '{}' |  | เช่น aircon, camera, private |
| included_text | `text` | YES |  |  | สิ่งที่รวมในราคา |
| online_bookable | `boolean` | NO | true |  |  |
| sort_order | `integer` | NO | 0 |  |  |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-room_unit"></a>

### room_unit

ห้องรายยูนิต  
Stories: US-06-01, US-06-04 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| room_type_id | `uuid` | NO |  | room_type.id |  |
| code | `text` | NO |  |  | เช่น A1 |
| zone | `text` | YES |  |  |  |
| status | `room_unit_status` | NO | 'active' |  |  |
| housekeeping | `housekeeping_status` | NO | 'clean' |  | check-out → dirty |
| sort_order | `integer` | NO | 0 |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `room_unit_branch_id_code_uq` (branch_id, code)


<a id="tbl-room_rate"></a>

### room_rate

ราคาห้องต่อคืน (null size_tier = ทุกขนาด)  
Stories: US-06-02 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| room_type_id | `uuid` | NO |  | room_type.id (cascade) |  |
| rate_plan_id | `uuid` | NO |  | rate_plan.id |  |
| size_tier_id | `uuid` | YES |  | size_tier.id (cascade) |  |
| nightly_price_satang | `integer` | NO |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `room_rate_room_type_id_rate_plan_id_size_tier_id_uq` (room_type_id, rate_plan_id, size_tier_id)
- CHECK `room_rate_chk`: `nightly_price_satang >= 0`


<a id="tbl-daycare_session_type"></a>

### daycare_session_type

รอบ Daycare  
Stories: US-06-13 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| session | `daycare_session` | NO |  |  |  |
| name_th | `text` | NO |  |  |  |
| starts_at | `time` | NO |  |  |  |
| ends_at | `time` | NO |  |  |  |
| capacity | `integer` | NO |  |  | จำนวนตัวสูงสุดต่อวันต่อรอบ |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `daycare_session_type_branch_id_session_uq` (branch_id, session)
- CHECK `dst_cap_chk`: `capacity > 0`
- CHECK `dst_range_chk`: `ends_at > starts_at`


<a id="tbl-daycare_rate"></a>

### daycare_rate

ราคา Daycare ต่อรอบ  
Stories: US-06-13 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| session_type_id | `uuid` | NO |  | daycare_session_type.id (cascade) |  |
| rate_plan_id | `uuid` | NO |  | rate_plan.id |  |
| size_tier_id | `uuid` | YES |  | size_tier.id (cascade) |  |
| price_satang | `integer` | NO |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `daycare_rate_session_type_id_rate_plan_id_size_tier_id_uq` (session_type_id, rate_plan_id, size_tier_id)


<a id="tbl-package_template"></a>

### package_template

แพ็กเกจหลายครั้งที่ร้านขาย  
Stories: US-10-05 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| name_th | `text` | NO |  |  |  |
| service_id | `uuid` | NO |  | service.id | บริการที่ใช้สิทธิ์ได้ |
| size_tier_id | `uuid` | YES |  | size_tier.id (set null) | null = ทุกขนาด |
| sessions_count | `integer` | NO |  |  | ≥ 2 |
| price_satang | `integer` | NO |  |  |  |
| validity_days | `integer` | NO | 365 |  |  |
| share_scope | `package_share_scope` | NO | 'single_pet' |  |  |
| status | `record_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- CHECK `pkg_tpl_chk`: `sessions_count >= 2 and price_satang > 0 and validity_days > 0`


<a id="tbl-commission_rule"></a>

### commission_rule

กติกาค่ามือ (ลำดับความสำคัญใน R-13)  
Stories: US-09-02 · PK: `id` · schema: `packages/db/src/schema/catalog.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| service_id | `uuid` | YES |  | service.id (cascade) | null = ทุกบริการ |
| staff_user_id | `uuid` | YES |  | staff_user.id (cascade) | null = ทุกช่าง |
| type | `commission_type` | NO |  |  |  |
| value | `integer` | NO |  |  | percent = basis points (1500 = 15%), fixed = satang |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `commission_rule_branch_id_service_id_staff_user_id_uq` (branch_id, service_id, staff_user_id)
- CHECK `commission_value_chk`: `value >= 0 and (type <> 'percent' or value <= 10000)`


## 7. F. Bookings


<a id="tbl-booking"></a>

### booking

ใบจอง (header) — 1 ใบมีได้หลายนัด/หลายการพัก  
Stories: US-05-04, US-11-03, US-07-03, US-07-04 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| customer_id | `uuid` | NO |  | customer.id |  |
| booking_no | `text` | NO |  |  | R-23 เช่น B6910-0042 unique ต่อสาขา |
| channel | `booking_channel` | NO |  |  |  |
| created_by_type | `actor_type` | NO |  |  |  |
| created_by_id | `uuid` | YES |  |  |  |
| status | `booking_status` | NO |  |  | ดู 03-state-machines |
| hold_expires_at | `timestamptz` | YES |  |  | มีค่าเมื่อ status = awaiting_deposit |
| approval_due_at | `timestamptz` | YES |  |  | มีค่าเมื่อ awaiting_approval |
| estimated_total_satang | `integer` | NO | 0 |  | ยอดประเมินตอนจอง |
| deposit_required_satang | `integer` | NO | 0 |  | R-06 |
| deposit_status | `deposit_status` | NO | 'not_required' |  |  |
| deposit_verified_satang | `integer` | NO | 0 |  | ยอดที่ร้านยืนยันแล้ว |
| policy_snapshot | `jsonb` | NO |  |  | สำเนานโยบายยกเลิก/มัดจำ ณ เวลาจอง (R-07 ใช้ค่านี้เสมอ) |
| customer_note | `text` | YES |  |  |  |
| reschedule_count | `integer` | NO | 0 |  |  |
| confirmed_at | `timestamptz` | YES |  |  |  |
| cancelled_at | `timestamptz` | YES |  |  |  |
| cancelled_by_type | `actor_type` | YES |  |  |  |
| cancel_reason | `text` | YES |  |  |  |
| first_service_at | `timestamptz` | YES |  |  | cache เวลาเริ่มบริการแรก (ใช้คำนวณยกเลิก) |
| bill_id | `uuid` | YES |  | bill.id (set null) — ใน 0001_constraints.sql | บิลที่ปิดใบจองนี้ (FK ใส่ใน SQL custom) |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `booking_branch_id_booking_no_uq` (branch_id, booking_no)
- INDEX `booking_organization_id_customer_id_idx` (organization_id, customer_id)
- INDEX `booking_branch_id_status_idx` (branch_id, status)
- CHECK `booking_amount_chk`: `estimated_total_satang >= 0 and deposit_required_satang >= 0 and deposit_verified_satang >= 0`


<a id="tbl-booking_event"></a>

### booking_event

บันทึกทุกการเปลี่ยนสถานะ (append-only) — ใช้ทำ analytics/OTA sync  
Stories: US-13-02 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| booking_id | `uuid` | NO |  | booking.id (cascade) |  |
| entity_type | `text` | NO |  |  | booking \| groom_appointment \| stay \| daycare_visit \| deposit |
| entity_id | `uuid` | NO |  |  |  |
| from_status | `text` | YES |  |  |  |
| to_status | `text` | NO |  |  |  |
| actor_type | `actor_type` | NO |  |  |  |
| actor_id | `uuid` | YES |  |  |  |
| reason | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `booking_event_booking_id_created_at_idx` (booking_id, created_at)
- INDEX `booking_event_organization_id_created_at_idx` (organization_id, created_at)


<a id="tbl-groom_appointment"></a>

### groom_appointment

นัดกรูม 1 ตัว 1 ช่าง 1 โต๊ะ (กันชนด้วย exclusion constraint)  
Stories: US-05-01, US-05-03, US-05-04, US-05-06 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| booking_id | `uuid` | NO |  | booking.id (cascade) |  |
| pet_id | `uuid` | NO |  | pet.id |  |
| groomer_id | `uuid` | NO |  | staff_user.id | ระบบเลือกให้ถ้าลูกค้าเลือก any (R-04) |
| groomer_preference | `groomer_preference` | NO | 'any' |  |  |
| station_id | `uuid` | NO |  | groom_station.id |  |
| starts_at | `timestamptz` | NO |  |  | UTC |
| ends_at | `timestamptz` | NO |  |  | = starts_at + Σduration |
| blocked_until | `timestamptz` | NO |  |  | = ends_at + buffer (ใช้ใน exclusion constraint) |
| status | `groom_status` | NO | 'scheduled' |  |  |
| size_tier_id | `uuid` | YES |  | size_tier.id (set null) | snapshot ตอนจอง |
| coat_group | `coat_group` | NO | 'any' |  | snapshot |
| weight_grams_at_booking | `integer` | YES |  |  |  |
| weight_grams_checkin | `integer` | YES |  |  |  |
| condition_flags | `text[]` | NO | '{}' |  | ticks_fleas \| wound \| matted \| skin_issue |
| condition_note | `text` | YES |  |  |  |
| services_total_satang | `integer` | NO | 0 |  | Σ groom_appointment_item |
| surcharge_total_satang | `integer` | NO | 0 |  | Σ appointment_surcharge |
| from_stay_id | `uuid` | YES |  | stay.id (set null) | นัดที่เกิดจาก Stay + Groom bundle |
| checked_in_at | `timestamptz` | YES |  |  |  |
| started_at | `timestamptz` | YES |  |  |  |
| done_at | `timestamptz` | YES |  |  |  |
| picked_up_at | `timestamptz` | YES |  |  |  |
| staff_note | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `groom_appointment_branch_id_starts_at_idx` (branch_id, starts_at)
- INDEX `groom_appointment_groomer_id_starts_at_idx` (groomer_id, starts_at)
- INDEX `groom_appointment_pet_id_starts_at_idx` (pet_id, starts_at)
- CHECK `ga_time_chk`: `ends_at > starts_at and blocked_until >= ends_at`


<a id="tbl-groom_appointment_item"></a>

### groom_appointment_item

บริการ/add-on ในนัด (ราคา snapshot)  
Stories: US-05-04, US-11-03 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| appointment_id | `uuid` | NO |  | groom_appointment.id (cascade) |  |
| service_id | `uuid` | NO |  | service.id |  |
| is_addon | `boolean` | NO | false |  |  |
| name_snapshot | `text` | NO |  |  |  |
| price_satang | `integer` | NO |  |  |  |
| duration_minutes | `integer` | NO |  |  |  |
| customer_package_id | `uuid` | YES |  | customer_package.id (set null) | ถ้าจะใช้สิทธิ์แพ็กเกจ |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `groom_appointment_item_appointment_id_idx` (appointment_id)


<a id="tbl-appointment_surcharge"></a>

### appointment_surcharge

ค่าบริการเพิ่มหน้างาน  
Stories: US-04-05 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| appointment_id | `uuid` | NO |  | groom_appointment.id (cascade) |  |
| surcharge_type_id | `uuid` | YES |  | surcharge_type.id (set null) |  |
| name | `text` | NO |  |  |  |
| amount_satang | `integer` | NO |  |  |  |
| reason | `text` | NO |  |  | บังคับกรอก |
| created_by | `uuid` | NO |  | staff_user.id |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- CHECK `surcharge_amt_chk`: `amount_satang > 0`


<a id="tbl-consent_document"></a>

### consent_document

ใบยินยอม/ข้อตกลงที่ลูกค้าเซ็น (immutable)  
Stories: US-05-06, US-06-08 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| kind | `consent_doc_kind` | NO |  |  |  |
| appointment_id | `uuid` | YES |  | groom_appointment.id (set null) |  |
| stay_id | `uuid` | YES |  | stay.id (set null) |  |
| customer_id | `uuid` | NO |  | customer.id |  |
| reasons | `text[]` | NO | '{}' |  | matted_shave \| senior \| medical_condition \| aggressive \| other |
| body_snapshot | `text` | NO |  |  | ข้อความที่ลูกค้าเห็นตอนเซ็น |
| emergency_vet_limit_satang | `integer` | YES |  |  | วงเงินพาไปหาหมอ (ข้อตกลงรับฝาก) |
| signer_name | `text` | NO |  |  |  |
| signature_file_id | `uuid` | NO |  | file_object.id | PNG จาก canvas |
| signed_at | `timestamptz` | NO | now() |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- CHECK `consent_target_chk`: `(appointment_id is not null) <> (stay_id is not null)`


<a id="tbl-stay"></a>

### stay

การพัก 1 ตัว 1 ช่วงวัน (กันห้องซ้อนด้วย exclusion constraint)  
Stories: US-06-03, US-06-04, US-06-11, US-11-04 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| booking_id | `uuid` | NO |  | booking.id (cascade) |  |
| pet_id | `uuid` | NO |  | pet.id |  |
| room_type_id | `uuid` | NO |  | room_type.id |  |
| room_unit_id | `uuid` | NO |  | room_unit.id | ระบบจัดห้องให้ตอนจอง (R-10) |
| check_in_date | `date` | NO |  |  | วันท้องถิ่น |
| check_out_date | `date` | NO |  |  | > check_in_date |
| expected_check_in_time | `time` | YES |  |  |  |
| expected_check_out_time | `time` | YES |  |  |  |
| nights | `integer` | NO |  |  | = check_out_date - check_in_date |
| nightly_price_satang | `integer` | NO |  |  | snapshot |
| room_total_satang | `integer` | NO |  |  | = nights × nightly |
| status | `stay_status` | NO | 'reserved' |  |  |
| in_heat | `boolean` | NO | false |  | ลูกค้า/ร้านแจ้ง |
| bundle_appointment_id | `uuid` | YES |  | groom_appointment.id (set null) | Stay + Groom |
| weight_grams_in | `integer` | YES |  |  |  |
| weight_grams_out | `integer` | YES |  |  |  |
| vaccine_override_reason | `text` | YES |  |  | ร้านข้าม vaccine gate (เข้า audit log) |
| checked_in_at | `timestamptz` | YES |  |  |  |
| checked_out_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `stay_branch_id_check_in_date_idx` (branch_id, check_in_date)
- INDEX `stay_branch_id_check_out_date_idx` (branch_id, check_out_date)
- CHECK `stay_dates_chk`: `check_out_date > check_in_date and nights = (check_out_date - check_in_date)`


<a id="tbl-stay_addon"></a>

### stay_addon

add-on ระหว่างพัก  
Stories: US-06-06 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| stay_id | `uuid` | NO |  | stay.id (cascade) |  |
| service_id | `uuid` | NO |  | service.id | scope = hotel, is_addon |
| name_snapshot | `text` | NO |  |  |  |
| unit_price_satang | `integer` | NO |  |  |  |
| quantity | `integer` | NO | 1 |  | per_day → = nights |
| total_satang | `integer` | NO |  |  |  |
| added_by_type | `actor_type` | NO |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- CHECK `stay_addon_chk`: `quantity > 0 and total_satang = unit_price_satang * quantity`


<a id="tbl-stay_intake"></a>

### stay_intake

ฟอร์มรับฝาก (1:1 กับ stay)  
Stories: US-06-08 · PK: `stay_id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| stay_id | `uuid` | NO |  | stay.id (cascade) | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| food_brand | `text` | YES |  |  |  |
| food_amount | `text` | YES |  |  | เช่น 1 ถ้วย |
| feeding_times | `time[]` | NO | '{}' |  | สร้าง care_task feed ตามเวลานี้ |
| food_provided_by_owner | `boolean` | NO | true |  |  |
| walks_per_day | `integer` | NO | 0 |  | สร้าง care_task walk |
| condition_note | `text` | YES |  |  | สภาพร่างกายตอนรับ |
| condition_photo_ids | `uuid[]` | NO | '{}' |  | file_object.id |
| emergency_contact_name | `text` | YES |  |  |  |
| emergency_contact_phone | `text` | YES |  |  |  |
| vet_clinic_name | `text` | YES |  |  |  |
| vet_clinic_phone | `text` | YES |  |  |  |
| completed_by | `uuid` | YES |  | staff_user.id (set null) |  |
| completed_at | `timestamptz` | YES |  |  | ต้องมีค่าก่อนเปลี่ยน stay เป็น checked_in |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-stay_medication"></a>

### stay_medication

ยาที่ต้องให้ระหว่างพัก  
Stories: US-06-08, US-06-09 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| stay_id | `uuid` | NO |  | stay.id (cascade) |  |
| name | `text` | NO |  |  |  |
| dose | `text` | NO |  |  |  |
| times | `time[]` | NO |  |  | เวลาให้ยาแต่ละวัน (≥1) |
| instructions | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-stay_belonging"></a>

### stay_belonging

ของที่ลูกค้านำมา  
Stories: US-06-08, US-06-11 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| stay_id | `uuid` | NO |  | stay.id (cascade) |  |
| item | `text` | NO |  |  |  |
| quantity | `integer` | NO | 1 |  |  |
| photo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| returned_at | `timestamptz` | YES |  |  | ติ๊กตอน check-out |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-care_task"></a>

### care_task

งานดูแลรายวัน (สร้างอัตโนมัติตอนเช็คอิน R-26)  
Stories: US-06-09 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| stay_id | `uuid` | NO |  | stay.id (cascade) |  |
| task_type | `care_task_type` | NO |  |  |  |
| title | `text` | NO |  |  |  |
| due_at | `timestamptz` | NO |  |  | UTC |
| medication_id | `uuid` | YES |  | stay_medication.id (cascade) |  |
| status | `care_task_status` | NO | 'pending' |  |  |
| done_at | `timestamptz` | YES |  |  |  |
| done_by | `uuid` | YES |  | staff_user.id (set null) |  |
| note | `text` | YES |  |  | เช่น กินหมด/เหลือครึ่ง |
| photo_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `care_task_branch_id_due_at_status_idx` (branch_id, due_at, status)
- INDEX `care_task_stay_id_due_at_idx` (stay_id, due_at)


<a id="tbl-daycare_visit"></a>

### daycare_visit

การฝาก Daycare 1 ตัว 1 วัน 1 รอบ  
Stories: US-06-13, US-11-05 · PK: `id` · schema: `packages/db/src/schema/bookings.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| booking_id | `uuid` | NO |  | booking.id (cascade) |  |
| pet_id | `uuid` | NO |  | pet.id |  |
| session_type_id | `uuid` | NO |  | daycare_session_type.id |  |
| visit_date | `date` | NO |  |  |  |
| price_satang | `integer` | NO |  |  | snapshot |
| status | `daycare_status` | NO | 'reserved' |  |  |
| checked_in_at | `timestamptz` | YES |  |  |  |
| checked_out_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `daycare_visit_branch_id_visit_date_session_type_id_idx` (branch_id, visit_date, session_type_id)
- UNIQUE `daycare_visit_pet_id_visit_date_session_type_id_uq` (pet_id, visit_date, session_type_id) WHERE `status not in ('cancelled','no_show')`


## 8. G. Payments & Billing


<a id="tbl-payment_slip"></a>

### payment_slip

สลิปที่อัปโหลด (ร้านยืนยันเอง + จับซ้ำจาก QR บนสลิป R-05)  
Stories: US-07-02, US-11-07 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| booking_id | `uuid` | YES |  | booking.id (set null) |  |
| bill_id | `uuid` | YES |  | bill.id (set null) |  |
| file_id | `uuid` | NO |  | file_object.id |  |
| uploaded_by_type | `actor_type` | NO |  |  |  |
| amount_expected_satang | `integer` | NO |  |  | ยอดที่ระบบขอ |
| qr_payload | `text` | YES |  |  | ข้อความที่อ่านได้จาก QR บนสลิป |
| trans_ref | `text` | YES |  |  | เลขอ้างอิงที่แยกจาก qr_payload |
| duplicate_of_slip_id | `uuid` | YES |  |  | มีค่า = เคยมีสลิป trans_ref นี้แล้ว |
| status | `slip_status` | NO | 'submitted' |  |  |
| reviewed_by | `uuid` | YES |  | staff_user.id (set null) |  |
| reviewed_at | `timestamptz` | YES |  |  |  |
| reject_reason | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `payment_slip_organization_id_trans_ref_idx` (organization_id, trans_ref) WHERE `trans_ref is not null`
- INDEX `payment_slip_branch_id_status_idx` (branch_id, status)


<a id="tbl-payment"></a>

### payment

เงินที่รับจริง (มัดจำและชำระบิล)  
Stories: US-07-02, US-08-04 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| booking_id | `uuid` | YES |  | booking.id (set null) | มัดจำ |
| bill_id | `uuid` | YES |  | bill.id (set null) | ชำระบิล |
| method | `payment_method` | NO |  |  | deposit = โอนมัดจำมาใช้ในบิล, credit = ใช้เครดิต |
| amount_satang | `integer` | NO |  |  | > 0 |
| tendered_satang | `integer` | YES |  |  | เงินสดที่ลูกค้าให้ (คำนวณเงินทอน) |
| slip_id | `uuid` | YES |  | payment_slip.id (set null) |  |
| proof_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| reference | `text` | YES |  |  | เช่น เลข EDC |
| received_by | `uuid` | YES |  | staff_user.id (set null) |  |
| received_at | `timestamptz` | NO | now() |  |  |
| status | `payment_status` | NO | 'posted' |  |  |
| voided_at | `timestamptz` | YES |  |  |  |
| voided_by | `uuid` | YES |  | staff_user.id (set null) |  |
| void_reason | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `payment_bill_id_idx` (bill_id)
- INDEX `payment_booking_id_idx` (booking_id)
- INDEX `payment_branch_id_received_at_idx` (branch_id, received_at)
- CHECK `payment_amt_chk`: `amount_satang > 0`
- CHECK `payment_target_chk`: `booking_id is not null or bill_id is not null`


<a id="tbl-refund"></a>

### refund

การคืนเงิน/คืนเป็นเครดิต (ร้านโอนคืนเองแล้วบันทึก)  
Stories: US-07-05 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| booking_id | `uuid` | YES |  | booking.id (set null) |  |
| bill_id | `uuid` | YES |  | bill.id (set null) |  |
| customer_id | `uuid` | NO |  | customer.id |  |
| amount_satang | `integer` | NO |  |  |  |
| mode | `refund_mode` | NO |  |  |  |
| reason | `text` | NO |  |  |  |
| proof_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| created_by | `uuid` | NO |  | staff_user.id |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- CHECK `refund_amt_chk`: `amount_satang > 0`


<a id="tbl-credit_ledger"></a>

### credit_ledger

สมุดเครดิตลูกค้า (append-only, ยอด = SUM)  
Stories: US-07-05, US-08-03 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| customer_id | `uuid` | NO |  | customer.id |  |
| delta_satang | `integer` | NO |  |  | + เพิ่ม / − ใช้ |
| reason | `credit_reason` | NO |  |  |  |
| ref_type | `text` | YES |  |  | booking \| bill \| refund |
| ref_id | `uuid` | YES |  |  |  |
| created_by | `uuid` | YES |  | staff_user.id (set null) |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `credit_ledger_customer_id_created_at_idx` (customer_id, created_at)
- CHECK `credit_delta_chk`: `delta_satang <> 0`


<a id="tbl-bill"></a>

### bill

บิล/ใบเสร็จ  
Stories: US-08-01..06 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| customer_id | `uuid` | YES |  | customer.id | null = ลูกค้าทั่วไป (ขาย quick item) |
| receipt_no | `text` | YES |  |  | ออกตอนปิดบิล R-16; unique ต่อสาขา |
| status | `bill_status` | NO | 'open' |  |  |
| subtotal_satang | `integer` | NO | 0 |  | Σ line_total |
| bill_discount_satang | `integer` | NO | 0 |  |  |
| bill_discount_reason | `text` | YES |  |  | บังคับเมื่อ > 0 |
| total_satang | `integer` | NO | 0 |  | = subtotal − bill_discount |
| paid_satang | `integer` | NO | 0 |  | Σ payment posted |
| change_satang | `integer` | NO | 0 |  | เงินทอน |
| opened_by | `uuid` | NO |  | staff_user.id |  |
| opened_at | `timestamptz` | NO | now() |  |  |
| closed_by | `uuid` | YES |  | staff_user.id (set null) |  |
| closed_at | `timestamptz` | YES |  |  |  |
| voided_by | `uuid` | YES |  | staff_user.id (set null) |  |
| voided_at | `timestamptz` | YES |  |  |  |
| void_reason | `text` | YES |  |  |  |
| note | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `bill_branch_id_receipt_no_uq` (branch_id, receipt_no) WHERE `receipt_no is not null`
- INDEX `bill_branch_id_closed_at_idx` (branch_id, closed_at)
- INDEX `bill_customer_id_idx` (customer_id)
- CHECK `bill_total_chk`: `total_satang = subtotal_satang - bill_discount_satang and total_satang >= 0`
- CHECK `bill_paid_chk`: `status <> 'paid' or paid_satang = total_satang`


<a id="tbl-bill_line"></a>

### bill_line

รายการในบิล  
Stories: US-08-01, US-08-03, US-10-05 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| bill_id | `uuid` | NO |  | bill.id (cascade) |  |
| line_type | `bill_line_type` | NO |  |  |  |
| ref_type | `text` | YES |  |  | groom_appointment_item \| appointment_surcharge \| stay \| stay_addon \| daycare_visit \| package_template \| customer_package |
| ref_id | `uuid` | YES |  |  |  |
| description | `text` | NO |  |  | ข้อความบนใบเสร็จ |
| pet_id | `uuid` | YES |  | pet.id (set null) |  |
| quantity | `integer` | NO | 1 |  |  |
| unit_price_satang | `integer` | NO |  |  | package_redemption = 0 |
| line_discount_satang | `integer` | NO | 0 |  |  |
| line_discount_reason | `text` | YES |  |  |  |
| line_total_satang | `integer` | NO |  |  | = qty × unit − discount |
| performer_id | `uuid` | YES |  | staff_user.id (set null) | ช่างที่ทำ (ค่ามือ) |
| commission_base_satang | `integer` | NO | 0 |  | R-13 |
| sort_order | `integer` | NO | 0 |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `bill_line_bill_id_idx` (bill_id)
- CHECK `bill_line_total_chk`: `line_total_satang = quantity * unit_price_satang - line_discount_satang and line_total_satang >= 0 and quantity > 0`


<a id="tbl-customer_package"></a>

### customer_package

แพ็กเกจที่ลูกค้าซื้อแล้ว  
Stories: US-10-05, US-10-06 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| customer_id | `uuid` | NO |  | customer.id |  |
| template_id | `uuid` | NO |  | package_template.id |  |
| pet_id | `uuid` | YES |  | pet.id (set null) | single_pet ต้องมีค่า |
| sessions_total | `integer` | NO |  |  |  |
| sessions_used | `integer` | NO | 0 |  |  |
| unit_value_satang | `integer` | NO |  |  | R-14 = floor(price/sessions) |
| purchased_bill_id | `uuid` | NO |  | bill.id |  |
| purchased_at | `timestamptz` | NO | now() |  |  |
| expires_at | `timestamptz` | NO |  |  |  |
| status | `customer_package_status` | NO | 'active' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- INDEX `customer_package_customer_id_status_idx` (customer_id, status)
- CHECK `cpkg_chk`: `sessions_used >= 0 and sessions_used <= sessions_total`


<a id="tbl-package_redemption"></a>

### package_redemption

การใช้สิทธิ์แพ็กเกจ  
Stories: US-10-05, US-08-06 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| customer_package_id | `uuid` | NO |  | customer_package.id |  |
| bill_line_id | `uuid` | NO |  | bill_line.id |  |
| pet_id | `uuid` | NO |  | pet.id |  |
| performer_id | `uuid` | YES |  | staff_user.id (set null) |  |
| redeemed_at | `timestamptz` | NO | now() |  |  |
| reversed_at | `timestamptz` | YES |  |  | void บิล → คืนสิทธิ์ |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-commission_entry"></a>

### commission_entry

ค่ามือที่เกิดขึ้น (สร้างตอนปิดบิล)  
Stories: US-09-02, US-09-05, US-12-03 · PK: `id` · schema: `packages/db/src/schema/billing.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| staff_user_id | `uuid` | NO |  | staff_user.id |  |
| bill_id | `uuid` | NO |  | bill.id |  |
| bill_line_id | `uuid` | NO |  | bill_line.id |  |
| base_satang | `integer` | NO |  |  |  |
| rule_id | `uuid` | YES |  | commission_rule.id (set null) | กติกาที่ใช้ |
| amount_satang | `integer` | NO |  |  | R-13 |
| status | `commission_status` | NO | 'earned' |  |  |
| earned_at | `timestamptz` | NO | now() |  | = bill.closed_at |
| reversed_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `commission_entry_staff_user_id_earned_at_idx` (staff_user_id, earned_at)
- UNIQUE `commission_entry_bill_line_id_uq` (bill_line_id)


## 9. H. After-service


<a id="tbl-report_card"></a>

### report_card

Report card กรูม / Stay report  
Stories: US-10-01, US-10-02, US-10-03 · PK: `id` · schema: `packages/db/src/schema/aftercare.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| branch_id | `uuid` | NO |  | branch.id | สาขา |
| kind | `report_card_kind` | NO |  |  |  |
| appointment_id | `uuid` | YES |  | groom_appointment.id (cascade) |  |
| stay_id | `uuid` | YES |  | stay.id (cascade) |  |
| pet_id | `uuid` | NO |  | pet.id |  |
| customer_id | `uuid` | NO |  | customer.id |  |
| skin | `skin_condition` | YES |  |  | grooming บังคับ |
| ears | `ear_condition` | YES |  |  |  |
| nails | `nail_condition` | YES |  |  |  |
| teeth | `teeth_condition` | YES |  |  |  |
| parasites | `parasite_finding` | YES |  |  |  |
| cooperation | `integer` | YES |  |  | 1–5 |
| staff_note | `text` | YES |  |  | ถึงลูกค้า |
| recommendation | `text` | YES |  |  |  |
| status | `report_card_status` | NO | 'draft' |  |  |
| created_by | `uuid` | NO |  | staff_user.id |  |
| sent_at | `timestamptz` | YES |  |  |  |
| customer_rating | `integer` | YES |  |  | 1–5 |
| customer_feedback | `text` | YES |  |  | ส่วนตัวถึงร้าน |
| rated_at | `timestamptz` | YES |  |  |  |
| google_review_clicked_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `report_card_appointment_id_uq` (appointment_id) WHERE `appointment_id is not null`
- UNIQUE `report_card_stay_id_uq` (stay_id) WHERE `stay_id is not null`
- INDEX `report_card_customer_id_idx` (customer_id)
- CHECK `rc_target_chk`: `(appointment_id is not null) <> (stay_id is not null)`
- CHECK `rc_rating_chk`: `(cooperation is null or cooperation between 1 and 5) and (customer_rating is null or customer_rating between 1 and 5)`


## 10. I. Notifications & Jobs


<a id="tbl-notification"></a>

### notification

ทุกข้อความที่ส่ง/ข้าม (ใช้นับโควตา LINE ด้วย R-18)  
Stories: US-13-05, US-13-06 · PK: `id` · schema: `packages/db/src/schema/messaging.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id (cascade) |  |
| branch_id | `uuid` | YES |  | branch.id (cascade) |  |
| channel | `notification_channel` | NO |  |  |  |
| recipient_type | `recipient_type` | NO |  |  |  |
| recipient_id | `uuid` | NO |  |  | customer.id หรือ staff_user.id |
| template_key | `text` | NO |  |  | ดู notification catalog ใน 05 |
| payload | `jsonb` | NO |  |  | ตัวแปรของ template |
| dedupe_key | `text` | NO |  |  | unique — กันส่งซ้ำ |
| month_key | `text` | NO |  |  | YYYY-MM ตามเวลาท้องถิ่น (นับโควตา) |
| status | `notification_status` | NO | 'queued' |  |  |
| skip_reason | `notification_skip_reason` | YES |  |  |  |
| sent_at | `timestamptz` | YES |  |  |  |
| error | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- UNIQUE `notification_dedupe_key_uq` (dedupe_key)
- INDEX `notification_branch_id_month_key_channel_status_idx` (branch_id, month_key, channel, status)


<a id="tbl-scheduled_job"></a>

### scheduled_job

งานตั้งเวลา (ประมวลผลโดย /api/cron/tick ทุก 1–5 นาที)  
Stories: US-05-02, US-07-06, US-10-04, US-12-05 · PK: `id` · schema: `packages/db/src/schema/messaging.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | YES |  | organization.id (cascade) |  |
| job_type | `job_type` | NO |  |  |  |
| run_at | `timestamptz` | NO |  |  |  |
| payload | `jsonb` | NO |  |  |  |
| dedupe_key | `text` | NO |  |  | unique — เช่น reminder_24h:{appointmentId} |
| status | `job_status` | NO | 'pending' |  |  |
| attempts | `integer` | NO | 0 |  | สูงสุด 5 แล้ว failed |
| locked_at | `timestamptz` | YES |  |  | ใช้ SELECT … FOR UPDATE SKIP LOCKED |
| last_error | `text` | YES |  |  |  |
| finished_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |

- UNIQUE `scheduled_job_dedupe_key_uq` (dedupe_key)
- INDEX `scheduled_job_status_run_at_idx` (status, run_at)


## 11. J. Compliance & Ops


<a id="tbl-audit_log"></a>

### audit_log

บันทึกการกระทำสำคัญ (append-only, trigger ห้าม update/delete)  
Stories: US-13-07 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | YES |  | organization.id (cascade) |  |
| actor_type | `actor_type` | NO |  |  |  |
| actor_id | `uuid` | YES |  |  |  |
| action | `text` | NO |  |  | ดูรายการ action ใน 04-business-rules R-27 |
| entity_type | `text` | NO |  |  |  |
| entity_id | `uuid` | YES |  |  |  |
| before | `jsonb` | YES |  |  |  |
| after | `jsonb` | YES |  |  |  |
| reason | `text` | YES |  |  |  |
| ip | `text` | YES |  |  |  |
| support_access_log_id | `uuid` | YES |  |  | ทำผ่าน support mode |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `audit_log_organization_id_created_at_idx` (organization_id, created_at)
- INDEX `audit_log_entity_type_entity_id_idx` (entity_type, entity_id)


<a id="tbl-consent_record"></a>

### consent_record

การยอมรับเอกสารกฎหมาย (PDPA)  
Stories: US-13-08, US-11-01, US-03-12 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| subject_type | `consent_subject` | NO |  |  |  |
| subject_id | `uuid` | NO |  |  | owner_profile.id หรือ organization.id |
| organization_id | `uuid` | YES |  | organization.id (cascade) | ร้านที่เกี่ยวข้อง |
| document | `legal_doc` | NO |  |  |  |
| version | `text` | NO |  |  | เช่น 2026-10-01 |
| accepted | `boolean` | NO |  |  | photo_consent อาจเป็น false |
| ip | `text` | YES |  |  |  |
| user_agent | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |

- INDEX `consent_record_subject_type_subject_id_document_idx` (subject_type, subject_id, document)


<a id="tbl-data_request"></a>

### data_request

คำขอดู/ลบข้อมูลส่วนบุคคล  
Stories: US-13-08, US-11-01 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| owner_profile_id | `uuid` | NO |  | owner_profile.id |  |
| type | `data_request_type` | NO |  |  |  |
| status | `data_request_status` | NO | 'open' |  |  |
| resolved_by | `uuid` | YES |  |  | platform_admin.id |
| resolved_at | `timestamptz` | YES |  |  |  |
| note | `text` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-feedback_report"></a>

### feedback_report

แจ้งปัญหา/ขอ feature จากร้าน  
Stories: US-13-13 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| staff_user_id | `uuid` | NO |  | staff_user.id |  |
| page_url | `text` | NO |  |  |  |
| message | `text` | NO |  |  |  |
| screenshot_file_id | `uuid` | YES |  | file_object.id (set null) |  |
| app_version | `text` | YES |  |  | git sha |
| status | `feedback_status` | NO | 'new' |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


<a id="tbl-support_access_log"></a>

### support_access_log

การเข้าโหมดช่วยเหลือของทีมแพลตฟอร์ม  
Stories: US-13-11 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| platform_admin_id | `uuid` | NO |  | platform_admin.id |  |
| reason | `text` | NO |  |  |  |
| ticket_ref | `text` | YES |  |  | เช่น feedback_report.id |
| read_only | `boolean` | NO | true |  |  |
| started_at | `timestamptz` | NO | now() |  |  |
| ended_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |


<a id="tbl-import_job"></a>

### import_job

งานนำเข้า CSV (validate ก่อน commit)  
Stories: US-02-08 · PK: `id` · schema: `packages/db/src/schema/compliance.ts`

| Column | Type | Nullable | Default | FK | Description |
|---|---|---|---|---|---|
| id | `uuid` | NO | gen_random_uuid() |  | PK |
| organization_id | `uuid` | NO |  | organization.id | tenant key — ทุก query ต้องกรองด้วยค่านี้ |
| kind | `import_kind` | NO |  |  |  |
| file_id | `uuid` | NO |  | file_object.id |  |
| status | `import_status` | NO | 'validating' |  |  |
| total_rows | `integer` | NO | 0 |  |  |
| valid_rows | `integer` | NO | 0 |  |  |
| error_rows | `integer` | NO | 0 |  |  |
| errors | `jsonb` | NO | '[]'::jsonb |  | [{row, column, code, message}] |
| created_by | `uuid` | NO |  | staff_user.id |  |
| committed_at | `timestamptz` | YES |  |  |  |
| created_at | `timestamptz` | NO | now() |  | เวลาสร้าง (UTC) |
| updated_at | `timestamptz` | NO | now() |  | เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate |


## 12. Enums

| Enum | ค่า | หมายเหตุ |
|---|---|---|
| `org_status` | `pilot`, `active`, `suspended` |  |
| `admin_status` | `active`, `disabled` |  |
| `staff_role` | `owner`, `front_desk`, `staff` |  |
| `staff_status` | `invited`, `active`, `disabled` |  |
| `session_subject` | `staff`, `customer`, `platform_admin` |  |
| `actor_type` | `staff`, `customer`, `system`, `platform_admin` |  |
| `species` | `dog`, `cat`, `other` |  |
| `pet_sex` | `male`, `female`, `unknown` |  |
| `pet_status` | `active`, `deceased`, `rehomed` |  |
| `coat_type` | `short`, `long`, `double`, `curly`, `wire`, `hairless`, `unknown` | ประเภทขนในโปรไฟล์ → แปลงเป็น coat_group ตาม R-02 |
| `coat_group` | `short`, `long`, `any` |  |
| `temperament_flag` | `bites`, `needs_muzzle`, `dryer_fear`, `noise_sensitive`, `same_groomer_only`, `dog_reactive`, `cat_reactive`, `anxious`, `other` |  |
| `vaccine_status` | `pending_review`, `verified`, `rejected` |  |
| `record_source` | `shop`, `customer`, `import` |  |
| `photo_consent` | `unknown`, `granted`, `denied` |  |
| `link_request_status` | `pending`, `approved`, `rejected` |  |
| `file_kind` | `pet_profile`, `before`, `after`, `stay_update`, `vaccine_proof`, `slip`, `signature`, `consent_pdf`, `logo`, `room_photo`, `service_photo`, `feedback`, `import_csv`, `proof` |  |
| `photo_kind` | `profile`, `before`, `after`, `stay` |  |
| `record_status` | `active`, `archived` |  |
| `closure_scope` | `all`, `grooming`, `hotel`, `daycare` |  |
| `closure_source` | `manual`, `public_holiday` |  |
| `deposit_type` | `none`, `fixed`, `percent` |  |
| `cancel_refund_mode` | `refund`, `credit`, `customer_choice` |  |
| `promptpay_type` | `phone`, `national_id`, `tax_id`, `ewallet` |  |
| `line_channel_status` | `pending`, `active`, `error` |  |
| `service_scope` | `grooming`, `hotel`, `daycare` |  |
| `service_category` | `bath`, `haircut`, `spa`, `nail`, `ear`, `teeth`, `deshed`, `other`, `hotel_addon`, `daycare_addon` |  |
| `rate_channel` | `all`, `walk_in`, `line`, `ota` |  |
| `room_unit_status` | `active`, `maintenance`, `archived` |  |
| `housekeeping_status` | `clean`, `dirty` |  |
| `daycare_session` | `full_day`, `morning`, `afternoon` |  |
| `package_share_scope` | `single_pet`, `household` |  |
| `commission_type` | `percent`, `fixed` |  |
| `booking_channel` | `walk_in`, `phone`, `chat`, `line_liff`, `booking_link`, `ota`, `import` |  |
| `booking_status` | `awaiting_deposit`, `deposit_review`, `awaiting_approval`, `confirmed`, `cancelled`, `expired`, `closed` | สถานะใบจอง (ดู state machine ใน 03) |
| `deposit_status` | `not_required`, `pending`, `submitted`, `verified`, `rejected`, `refunded`, `credited`, `forfeited`, `applied` | สถานะมัดจำ (ดู 03) |
| `groomer_preference` | `any`, `specific` |  |
| `groom_status` | `scheduled`, `checked_in`, `in_progress`, `done`, `picked_up`, `no_show`, `cancelled` | สถานะนัดกรูมรายตัว (ดู 03) |
| `stay_status` | `reserved`, `checked_in`, `checked_out`, `no_show`, `cancelled` |  |
| `daycare_status` | `reserved`, `checked_in`, `checked_out`, `no_show`, `cancelled` |  |
| `consent_doc_kind` | `grooming_consent`, `boarding_agreement` |  |
| `care_task_type` | `feed`, `medication`, `walk`, `clean`, `other` |  |
| `care_task_status` | `pending`, `done`, `skipped` |  |
| `slip_status` | `submitted`, `verified`, `rejected` |  |
| `payment_method` | `cash`, `promptpay`, `bank_transfer`, `card_edc`, `deposit`, `credit` |  |
| `payment_status` | `posted`, `voided` |  |
| `refund_mode` | `bank_transfer`, `cash`, `credit` |  |
| `credit_reason` | `cancellation_credit`, `deposit_credit`, `bill_payment`, `void_reversal`, `adjustment` |  |
| `bill_status` | `open`, `paid`, `void` |  |
| `bill_line_type` | `groom_service`, `groom_addon`, `surcharge`, `stay_night`, `stay_addon`, `daycare`, `quick_item`, `package_sale`, `package_redemption` |  |
| `customer_package_status` | `active`, `exhausted`, `expired`, `void` |  |
| `commission_status` | `earned`, `reversed` |  |
| `report_card_kind` | `grooming`, `stay` |  |
| `report_card_status` | `draft`, `pending_review`, `sent` |  |
| `skin_condition` | `normal`, `dry`, `redness`, `lesion` |  |
| `ear_condition` | `clean`, `dirty`, `suspected_infection` |  |
| `nail_condition` | `trimmed`, `ok`, `overgrown` |  |
| `teeth_condition` | `ok`, `tartar`, `bad_breath` |  |
| `parasite_finding` | `none`, `fleas`, `ticks`, `both` |  |
| `notification_channel` | `line_reply`, `line_push`, `web_push`, `email` |  |
| `notification_status` | `queued`, `sent`, `failed`, `skipped` |  |
| `notification_skip_reason` | `quota_exhausted`, `economy_mode`, `pet_inactive`, `no_recipient`, `opted_out`, `duplicate` |  |
| `recipient_type` | `customer`, `staff` |  |
| `job_type` | `expire_hold`, `reminder_24h`, `next_groom_reminder`, `owner_daily_summary`, `approval_overdue`, `care_task_overdue_scan`, `recompute_reliability`, `package_expiry`, `cleanup_uncommitted_files` |  |
| `job_status` | `pending`, `running`, `done`, `failed`, `cancelled` |  |
| `legal_doc` | `privacy_notice`, `terms_of_service`, `dpa`, `photo_consent` |  |
| `consent_subject` | `owner_profile`, `organization` |  |
| `data_request_type` | `access`, `delete` |  |
| `data_request_status` | `open`, `done`, `rejected` |  |
| `feedback_status` | `new`, `acknowledged`, `done` |  |
| `import_kind` | `customers_pets`, `services` |  |
| `import_status` | `validating`, `ready`, `importing`, `done`, `failed` |  |

## 13. Constraints ที่ Drizzle เขียนไม่ได้ (migration `0001_constraints.sql`)

ไฟล์นี้เป็น custom migration — **ห้ามลบหรือแก้ย้อนหลัง** ถ้าต้องเปลี่ยนให้สร้าง custom migration ใหม่ด้วย `pnpm --filter @app/db generate:custom <name>`

| Constraint | ตาราง | ป้องกันอะไร | error code ที่แอปต้องจับ |
|---|---|---|---|
| `groom_appt_groomer_no_overlap` | groom_appointment | ช่างคนเดียวมีนัดทับเวลา (นับรวม buffer: `starts_at`–`blocked_until`) ยกเว้นนัด cancelled/no_show | `23P01` → แปลงเป็น `SLOT_TAKEN` (409) |
| `groom_appt_station_no_overlap` | groom_appointment | โต๊ะเดียวมีนัดทับเวลา | `23P01` → `SLOT_TAKEN` (409) |
| `stay_room_no_overlap` | stay | ห้องเดียวมีการพักทับคืน (reserved/checked_in) — วันเช็คเอาท์ของคนหนึ่งเป็นวันเช็คอินของอีกคนได้ | `23P01` → `ROOM_TAKEN` (409) |
| `stay_pet_no_overlap` | stay | น้องตัวเดียวถูกจองพักซ้อนกัน | `23P01` → `PET_ALREADY_BOOKED` (409) |
| `booking_bill_fk` | booking | FK วนกับ bill | `23503` |
| trigger `*_append_only` | audit_log, booking_event, credit_ledger, consent_record | ห้าม UPDATE/DELETE | `P0001` (bug — ต้องไม่เกิด) |

```sql
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
```
