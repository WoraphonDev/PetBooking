# Task Index (generated — ห้ามแก้มือ)

> สร้างจาก `tools/spec-src/build_tasks.py` · การ์ดแต่ละใบ: `docs/tasks/<ID>.md` · **ห้ามเริ่ม task ที่ depends_on ยังไม่ merge**

## M0 — รากฐาน (Walking skeleton) (41 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [H-01](H-01.md) | 1 | human | - |  | ตั้ง GitHub repo จาก starter kit + กฎ branch |  |
| [H-02](H-02.md) | 1 | human | - |  | ตัดสินใจ ADR-002 hosting · ADR-003 email · ADR-004 storage + สร้างบัญชี/secret |  |
| [H-03](H-03.md) | 1 | human | - |  | SP-01 กลยุทธ์ LINE Provider → ADR-001 |  |
| [T-0001](T-0001.md) | 2 | infra | M |  | Scaffold apps/web (Next.js 16 + Tailwind + shadcn) + /api/health | H-01 |
| [T-0002](T-0002.md) | 2 | infra | M |  | Scaffold packages/contracts: common types, enums, errors | H-01 |
| [T-0003](T-0003.md) | 2 | infra | M | ⚠️ | DB client (postgres-js) + migrate script + vaccine_type seed migration | H-01 |
| [T-0004](T-0004.md) | 3 | infra | L | ⚠️ | Scaffold packages/server: RequestContext, AppError, tenantDb, withTx, test helpers | T-0002 T-0003 |
| [T-0005](T-0005.md) | 2 | domain | M |  | Rule R-24 ล็อกบัญชีเมื่อใส่รหัสผิด + นโยบายรหัสผ่าน | H-01 |
| [T-0006](T-0006.md) | 4 | infra | L | ⚠️ | Auth core: sessions, argon2, cookies, permissions table | T-0004 T-0005 |
| [T-0007](T-0007.md) | 5 | infra | L | ⚠️ | Route wrappers: withStaff/withCustomer/withAdmin/withPublic + error JSON + CSRF + rate limit | T-0006 |
| [T-0034](T-0034.md) | 2 | domain | M |  | State tables ทุก entity (03) + canTransition | H-01 |
| [T-0035](T-0035.md) | 4 | infra | M | ⚠️ | Audit log writer (R-27) + booking_event writer + state transition helper | T-0004 T-0034 |
| [T-0008](T-0008.md) | 2 | domain | S |  | Rule R-18 โควตาข้อความ LINE (push) และโหมดประหยัด | H-01 |
| [T-0009](T-0009.md) | 2 | domain | S |  | Rule R-19 เลือกช่องทางส่งข้อความ | H-01 |
| [T-0010](T-0010.md) | 4 | infra | L |  | Notification outbox + dispatcher + stub templates ทุก key | T-0004 T-0008 T-0009 |
| [T-0011](T-0011.md) | 5 | infra | S |  | Email adapter (SMTP/nodemailer) + templates invite/reset | T-0010 H-02 |
| [T-0012](T-0012.md) | 2 | domain | M |  | Rule R-20 เวลาและวันที่ท้องถิ่น | H-01 |
| [T-0013](T-0013.md) | 3 | domain | M |  | Rule R-31 รูปแบบการแสดงผลไทย (เงิน วันที่ เวลา น้ำหนัก) | H-01 T-0012 |
| [T-0014](T-0014.md) | 2 | domain | M |  | Rule R-22 เบอร์โทร: normalize และแสดงผล | H-01 |
| [T-0015](T-0015.md) | 4 | infra | M |  | i18n: next-intl (th), message namespaces per screen + enum labels + format helpers | T-0001 T-0013 T-0014 |
| [T-0016](T-0016.md) | 3 | infra | S |  | Typed API client + query hooks + error toast | T-0001 T-0002 |
| [T-0017](T-0017.md) | 3 | infra | M | ⚠️ | Deploy pipeline ตาม ADR-002 (staging + production) + migrate on deploy | T-0001 T-0003 H-02 |
| [T-0018](T-0018.md) | 6 | infra | S |  | Monitoring: health (db ping), structured logs, error reporting, uptime check | T-0007 |
| [T-0019](T-0019.md) | 6 | api | L | ⚠️ | API auth.staffLogin | T-0007 T-0005 |
| [T-0020](T-0020.md) | 7 | api | M |  | API auth.staffLogout, auth.me, auth.resetRequest | T-0007 T-0019 T-0010 |
| [T-0021](T-0021.md) | 6 | api | S |  | API auth.resetConfirm | T-0007 T-0005 |
| [T-0022](T-0022.md) | 6 | api | M | ⚠️ | API admin.login | T-0007 T-0005 |
| [T-0319](T-0319.md) | 6 | api | M | ⚠️ | API admin.orgs, admin.updateOrg | T-0007 T-0035 |
| [T-0023](T-0023.md) | 7 | api | L | ⚠️ | API admin.createOrg | T-0007 T-0319 |
| [T-0024](T-0024.md) | 6 | notify | M |  | Notification templates (staff, M0): password_reset | T-0010 T-0011 |
| [T-0318](T-0318.md) | 3 | ui | S |  | ธีมหน้าตา: design tokens ใน globals.css ตาม ADR-006 | T-0001 |
| [T-0025](T-0025.md) | 6 | ui | M |  | Admin shell: layout + guard | T-0015 T-0016 T-0007 |
| [T-0026](T-0026.md) | 5 | ui | M |  | Shared component: ฟอร์มพื้นฐาน: MoneyInput (บาท→สตางค์), PhoneInput (R-22), WeightInput (กก.→กรัม), ThaiDatePicker (พ.ศ.), TimeSelect, EnumSelect, zod form helper | T-0015 T-0014 T-0013 |
| [T-0027](T-0027.md) | 5 | ui | M |  | Shared component: DataTable (cursor pagination, ค้นหา, ตัวกรอง), EmptyState, StatusBadge (enum → สี tone ตาม ADR-006 §3 + ป้ายไทย) | T-0015 T-0318 |
| [T-0028](T-0028.md) | 7 | ui | S |  | Screen A-01 เข้าสู่ระบบ (ร้าน) | T-0015 T-0019 |
| [T-0029](T-0029.md) | 8 | ui | S |  | Screen A-02 ลืมรหัสผ่าน | T-0015 T-0020 |
| [T-0030](T-0030.md) | 7 | ui | S |  | Screen A-03 ตั้งรหัสผ่านใหม่ | T-0015 T-0021 |
| [T-0031](T-0031.md) | 7 | ui | S |  | Screen AD-01 Admin login | T-0025 T-0022 |
| [T-0032](T-0032.md) | 8 | ui | M |  | Screen AD-02 ร้านทั้งหมด | T-0025 T-0026 T-0027 T-0319 T-0023 |
| [T-0033](T-0033.md) | 7 | ui | S |  | Screen AD-07 วันหยุดราชการ | T-0025 T-0026 |
| [H-04](H-04.md) | 9 | human | - |  | Milestone review M0: demo + ตรวจคุณภาพ | T-0001 T-0002 T-0003 T-0004 T-0006 T-0007 T-0318 T-0025 … |

## M1 — ร้านใส่ข้อมูลได้ (58 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [H-05](H-05.md) | 1 | human | - |  | ร่าง Privacy Notice / Terms / DPA / ข้อความยินยอมรูป + ตรวจแม่แบบใบยินยอม |  |
| [T-0036](T-0036.md) | 1 | infra | L |  | Job runner + POST /api/cron/tick + stub handlers ทุก job_type | T-0007 T-0010 |
| [T-0037](T-0037.md) | 1 | domain | S |  | Rule R-25 ข้อจำกัดการอัปโหลดไฟล์ | H-01 |
| [T-0038](T-0038.md) | 2 | infra | M | ⚠️ | Object storage (presign) + upload-url endpoints + file commit + cleanup job | T-0007 T-0037 T-0036 |
| [T-0039](T-0039.md) | 1 | infra | M |  | Playwright setup + dev seed (ร้านตัวอย่างครบ) + smoke test | T-0001 T-0004 |
| [T-0040](T-0040.md) | 1 | domain | S |  | Rule R-01 หาขนาด (size tier) จากน้ำหนัก | H-01 |
| [T-0041](T-0041.md) | 1 | domain | M |  | Rule R-02 กลุ่มขนและการหาราคา/เวลาของบริการ | H-01 |
| [T-0042](T-0042.md) | 1 | api | S |  | API auth.inviteAccept | T-0007 T-0035 T-0005 T-0019 |
| [T-0043](T-0043.md) | 1 | api | M |  | API staffMe.sessions, staffMe.revokeSession | T-0007 |
| [T-0044](T-0044.md) | 3 | api | M |  | API branch.get, branch.update, branch.setHours | T-0007 T-0038 |
| [T-0045](T-0045.md) | 4 | api | M |  | API branch.setModules, branch.updatePolicy | T-0007 T-0044 T-0035 |
| [T-0046](T-0046.md) | 1 | api | M |  | API closures.list, closures.create, closures.delete | T-0007 |
| [T-0047](T-0047.md) | 1 | api | S |  | API closures.importHolidays | T-0007 |
| [T-0048](T-0048.md) | 3 | api | M |  | API staffUsers.list, staffUsers.invite, staffUsers.update | T-0007 T-0035 T-0010 T-0038 |
| [T-0049](T-0049.md) | 1 | api | S |  | API staffUsers.resendInvite | T-0007 |
| [T-0050](T-0050.md) | 1 | api | S |  | API search.quick | T-0007 T-0014 |
| [T-0051](T-0051.md) | 2 | api | M |  | API customers.list, customers.create, customers.get | T-0007 T-0050 T-0014 |
| [T-0052](T-0052.md) | 3 | api | S |  | API customers.update | T-0007 T-0014 T-0051 T-0050 |
| [T-0053](T-0053.md) | 3 | api | M |  | API pets.create, pets.get, pets.update | T-0007 T-0038 |
| [T-0054](T-0054.md) | 4 | api | M |  | API pets.updateShopProfile, pets.addWeight, pets.setFlags | T-0007 T-0053 |
| [T-0055](T-0055.md) | 4 | api | M |  | API vaccinations.create, vaccinations.verify, vaccinations.reject | T-0007 T-0038 T-0053 T-0035 T-0010 |
| [T-0056](T-0056.md) | 3 | api | M |  | API photos.list, photos.add | T-0007 T-0038 |
| [T-0057](T-0057.md) | 1 | api | S |  | API sizeTiers.list | T-0007 |
| [T-0058](T-0058.md) | 2 | api | L |  | API sizeTiers.set | T-0007 T-0040 T-0057 |
| [T-0059](T-0059.md) | 3 | api | M |  | API services.list, services.create, services.update | T-0007 T-0038 |
| [T-0060](T-0060.md) | 4 | api | L |  | API services.setPrices | T-0007 T-0041 T-0059 |
| [T-0061](T-0061.md) | 4 | api | S |  | API services.setAddonLinks | T-0007 T-0059 |
| [T-0062](T-0062.md) | 3 | api | L |  | API imports.create | T-0007 T-0014 T-0038 |
| [T-0063](T-0063.md) | 4 | api | S |  | API imports.get | T-0007 T-0062 |
| [T-0064](T-0064.md) | 4 | api | L |  | API imports.commit | T-0007 T-0035 T-0062 |
| [T-0065](T-0065.md) | 1 | api | S |  | API audit.list | T-0007 |
| [T-0066](T-0066.md) | 1 | api | M |  | API admin.dataRequests, admin.holidays | T-0007 |
| [T-0067](T-0067.md) | 2 | api | L | ⚠️ | API admin.resolveDataRequest | T-0007 T-0035 T-0066 |
| [T-0068](T-0068.md) | 1 | notify | M |  | Notification templates (staff, M1): invite | T-0010 T-0011 |
| [T-0069](T-0069.md) | 1 | notify | M |  | Notification templates (admin, M1): data_request | T-0010 T-0011 |
| [T-0070](T-0070.md) | 1 | ui | M |  | Console shell: layout + sidebar (ครบทุกเมนูใน 06) + auth guard | T-0015 T-0016 |
| [T-0071](T-0071.md) | 3 | ui | M |  | Shared component: PhotoUploader: กล้อง/อัลบั้ม, ย่อรูป 1600px + ลบ EXIF (R-25), presigned PUT, progress, หลายไฟล์ | T-0015 T-0038 |
| [T-0072](T-0072.md) | 1 | ui | M |  | Shared component: SlotPicker: แถบวัน + grid เวลา จาก SlotList (R-04) + แสดงชื่อช่าง + สถานะว่าง/เต็ม | T-0015 |
| [T-0073](T-0073.md) | 1 | ui | M |  | Shared component: BarChart/LineChart เบา ๆ (recharts) สำหรับรายงาน | T-0015 |
| [T-0074](T-0074.md) | 2 | ui | S |  | Screen A-04 รับคำเชิญเข้าร้าน | T-0015 T-0042 |
| [T-0317](T-0317.md) | 1 | ui | S |  | Screen P-02 เอกสารกฎหมาย | T-0015 |
| [T-0075](T-0075.md) | 3 | ui | M |  | Screen C-08 ลูกค้า | T-0070 T-0026 T-0027 T-0051 |
| [T-0076](T-0076.md) | 4 | ui | L |  | Screen C-09 ลูกค้า | T-0070 T-0026 T-0027 T-0071 T-0051 T-0053 |
| [T-0077](T-0077.md) | 4 | ui | M |  | Screen C-10 ฟอร์มลูกค้า | T-0070 T-0026 T-0071 T-0051 T-0052 |
| [T-0078](T-0078.md) | 5 | ui | L |  | Screen C-11 น้อง | T-0070 T-0073 T-0026 T-0027 T-0071 T-0053 T-0056 T-0054 … |
| [T-0079](T-0079.md) | 2 | ui | S |  | Screen C-26 Audit log | T-0070 T-0026 T-0027 T-0065 |
| [T-0080](T-0080.md) | 4 | ui | M |  | Screen C-30 ข้อมูลร้าน | T-0070 T-0026 T-0071 T-0044 |
| [T-0081](T-0081.md) | 4 | ui | M |  | Screen C-31 เวลาเปิด-ปิดและวันหยุด | T-0070 T-0026 T-0027 T-0044 T-0046 T-0047 |
| [T-0082](T-0082.md) | 5 | ui | S |  | Screen C-32 บริการที่เปิด | T-0070 T-0026 T-0044 T-0045 |
| [T-0083](T-0083.md) | 5 | ui | L |  | Screen C-33 นโยบายร้าน | T-0070 T-0026 T-0072 T-0044 T-0045 |
| [T-0084](T-0084.md) | 4 | ui | M |  | Screen C-36 พนักงานและตารางงาน | T-0070 T-0026 T-0027 T-0071 T-0048 T-0049 |
| [T-0085](T-0085.md) | 5 | ui | M |  | Screen C-37 บริการและราคา | T-0070 T-0026 T-0027 T-0071 T-0059 T-0057 T-0060 T-0061 |
| [T-0086](T-0086.md) | 3 | ui | S |  | Screen C-38 ขนาดตามน้ำหนัก | T-0070 T-0057 T-0058 |
| [T-0087](T-0087.md) | 5 | ui | S |  | Screen C-44 นำเข้าข้อมูล CSV | T-0070 T-0027 T-0071 T-0063 T-0062 T-0064 |
| [T-0088](T-0088.md) | 2 | ui | M |  | Screen C-45 บัญชีของฉัน | T-0070 T-0020 T-0043 |
| [T-0089](T-0089.md) | 3 | ui | S |  | Screen AD-05 คำขอ PDPA | T-0025 T-0026 T-0027 T-0066 T-0067 |
| [T-0090](T-0090.md) | 2 | ui | S |  | Screen AD-07 วันหยุดราชการ (ext-M1) | T-0025 T-0026 T-0066 T-0033 |
| [H-06](H-06.md) | 6 | human | - |  | Milestone review M1: demo + ตรวจคุณภาพ | T-0035 T-0010 T-0036 T-0038 T-0011 T-0015 T-0016 T-0070 … |

## M2 — ลงคิวกรูมแทนสมุด (63 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [H-07](H-07.md) | 1 | human | - |  | สร้าง LINE Login channel ของแพลตฟอร์ม (สำหรับพนักงาน) + OA/LIFF ทดสอบ | H-03 |
| [H-08](H-08.md) | 1 | human | - |  | SP-02 เก็บสลิปจริง ≥ 6 ธนาคาร → เพิ่ม vectors R-05 | H-01 |
| [H-09](H-09.md) | 1 | human | - |  | SP-04 ทดสอบ Web Push บนอุปกรณ์ร้านนำร่อง |  |
| [H-10](H-10.md) | 1 | human | - |  | ชุด onboarding ร้านนำร่อง (US-13-14) |  |
| [T-0091](T-0091.md) | 1 | infra | M |  | Web Push adapter + service worker + staff PWA manifest | T-0010 T-0001 |
| [T-0092](T-0092.md) | 1 | domain | S |  | Rule R-03 ราคาประเมินและเวลาของใบจอง | H-01 |
| [T-0093](T-0093.md) | 1 | domain | L |  | Rule R-04 Slot engine กรูม (เวลาว่าง + เลือกช่าง/โต๊ะอัตโนมัติ) | H-01 T-0012 |
| [T-0094](T-0094.md) | 1 | domain | M | ⚠️ | Rule R-06 คำนวณมัดจำ | H-01 |
| [T-0095](T-0095.md) | 1 | domain | M | ⚠️ | Rule R-07 ผลของการยกเลิก / no-show (ริบ-คืน-เครดิต) | H-01 |
| [T-0096](T-0096.md) | 1 | domain | S |  | Rule R-08 เวลาหมดอายุของการล็อกคิวและการรออนุมัติ | H-01 |
| [T-0097](T-0097.md) | 1 | domain | S |  | Rule R-09 ระดับความน่าเชื่อถือลูกค้า (1–4) | H-01 |
| [T-0098](T-0098.md) | 1 | domain | S |  | Rule R-10 จัดห้องอัตโนมัติ (room unit allocation) | H-01 |
| [T-0099](T-0099.md) | 1 | domain | S |  | Rule R-11 ตรวจวัคซีนก่อนรับฝาก (vaccine gate) | H-01 |
| [T-0100](T-0100.md) | 1 | domain | M |  | Rule R-12 เงื่อนไขรับจอง (ลูกค้า/น้อง/ประเภทห้อง) | H-01 |
| [T-0101](T-0101.md) | 1 | domain | S |  | Rule R-23 เลขที่ใบจอง | H-01 T-0012 |
| [T-0102](T-0102.md) | 1 | domain | S |  | Rule R-28 ห้องว่างของประเภทห้อง (hotel availability) | H-01 |
| [T-0103](T-0103.md) | 1 | domain | S |  | Rule R-29 ที่ว่าง Daycare | H-01 |
| [T-0104](T-0104.md) | 1 | api | S |  | API auth.staffLine | T-0007 T-0019 |
| [T-0105](T-0105.md) | 1 | api | M |  | API staffMe.linkLine, staffMe.pushSubscribe, staffMe.pushUnsubscribe | T-0007 T-0019 |
| [T-0106](T-0106.md) | 1 | api | M |  | API stations.list, stations.upsert | T-0007 |
| [T-0107](T-0107.md) | 1 | api | S |  | API workingHours.set | T-0007 T-0048 |
| [T-0108](T-0108.md) | 1 | api | M |  | API timeOff.list, timeOff.create, timeOff.delete | T-0007 T-0046 |
| [T-0109](T-0109.md) | 1 | api | M |  | API surchargeTypes.list, surchargeTypes.upsert | T-0007 |
| [T-0110](T-0110.md) | 2 | api | L |  | API availability.groomSlots | T-0007 T-0040 T-0041 T-0092 T-0093 |
| [T-0111](T-0111.md) | 2 | api | L |  | API quotes.create (grooming) | T-0007 T-0092 T-0094 T-0096 T-0097 |
| [T-0112](T-0112.md) | 2 | api | L | ⚠️ | API bookings.create (grooming) | T-0007 T-0035 T-0010 T-0040 T-0041 T-0092 T-0093 T-0094 … |
| [T-0113](T-0113.md) | 3 | api | S |  | API bookings.get | T-0007 T-0112 T-0051 T-0050 |
| [T-0114](T-0114.md) | 3 | api | L | ⚠️ | API bookings.cancel | T-0007 T-0035 T-0010 T-0095 T-0097 T-0036 T-0112 T-0051 … |
| [T-0115](T-0115.md) | 3 | api | L |  | API calendar.day (grooming) | T-0007 T-0112 T-0051 T-0048 |
| [T-0116](T-0116.md) | 3 | api | L |  | API groom.reschedule | T-0007 T-0010 T-0092 T-0093 T-0036 T-0112 T-0051 |
| [T-0117](T-0117.md) | 3 | api | L |  | API groom.setItems | T-0007 T-0035 T-0041 T-0092 T-0112 T-0051 |
| [T-0118](T-0118.md) | 3 | api | L |  | API groom.checkIn | T-0007 T-0035 T-0038 T-0112 T-0051 |
| [T-0119](T-0119.md) | 3 | api | M |  | API groom.start, groom.finish, groom.cancel | T-0007 T-0035 T-0112 T-0051 T-0010 T-0050 |
| [T-0120](T-0120.md) | 3 | api | M |  | API groom.addSurcharge, groom.removeSurcharge, groom.jobCard | T-0007 T-0112 T-0051 T-0056 T-0053 |
| [T-0121](T-0121.md) | 3 | api | S |  | API groom.myQueue | T-0007 T-0112 T-0051 |
| [T-0122](T-0122.md) | 3 | api | S |  | API stays.cancel | T-0007 T-0035 T-0112 T-0051 T-0050 |
| [T-0123](T-0123.md) | 3 | api | S |  | API daycare.cancel | T-0007 T-0035 T-0112 T-0051 |
| [T-0124](T-0124.md) | 1 | api | S |  | API feedback.create | T-0007 T-0010 T-0038 |
| [T-0125](T-0125.md) | 1 | api | M | ⚠️ | API admin.supportStart, admin.supportEnd, admin.feedback | T-0007 T-0035 T-0010 |
| [T-0126](T-0126.md) | 2 | api | S |  | API admin.updateFeedback | T-0007 T-0125 |
| [T-0127](T-0127.md) | 2 | notify | M |  | Notification templates (staff, M2): new_booking, groom_done, care_task_overdue | T-0010 T-0091 |
| [T-0128](T-0128.md) | 2 | notify | M |  | Notification templates (owner, M2): support_access | T-0010 T-0091 T-0011 |
| [T-0129](T-0129.md) | 1 | notify | M |  | Notification templates (admin, M2): feedback | T-0010 T-0011 |
| [T-0130](T-0130.md) | 2 | ui | M |  | Staff PWA shell: bottom nav + auth guard (role ใดก็ได้) | T-0015 T-0016 H-07 |
| [T-0131](T-0131.md) | 1 | ui | M |  | Shared component: SignaturePad → PNG → อัปโหลด kind signature | T-0015 T-0071 |
| [T-0132](T-0132.md) | 2 | ui | S |  | Screen A-01 เข้าสู่ระบบ (ร้าน) (ext-M2) | T-0015 T-0104 T-0028 |
| [T-0133](T-0133.md) | 2 | ui | S |  | Screen A-04 รับคำเชิญเข้าร้าน (ext-M2) | T-0015 T-0105 T-0074 |
| [T-0134](T-0134.md) | 4 | ui | M |  | Screen C-02 ปฏิทินคิว | T-0070 T-0026 T-0072 T-0027 T-0115 T-0116 |
| [T-0135](T-0135.md) | 4 | ui | L |  | Screen C-02D รายละเอียดนัดกรูม (drawer) | T-0070 T-0026 T-0027 T-0071 T-0120 T-0118 T-0119 |
| [T-0136](T-0136.md) | 3 | ui | M |  | Screen C-03 สร้างใบจอง (หน้าร้าน) (grooming) | T-0070 T-0026 T-0072 T-0027 T-0050 T-0110 T-0111 T-0112 |
| [T-0137](T-0137.md) | 4 | ui | L |  | Screen C-05 รายละเอียดใบจอง | T-0070 T-0026 T-0071 T-0113 T-0114 T-0122 T-0123 |
| [T-0138](T-0138.md) | 4 | ui | M |  | Screen C-06 เช็คอินกรูม | T-0070 T-0131 T-0120 T-0118 T-0117 |
| [T-0139](T-0139.md) | 2 | ui | M |  | Screen C-36 พนักงานและตารางงาน (ext-M2) | T-0070 T-0026 T-0027 T-0071 T-0108 T-0107 T-0084 |
| [T-0140](T-0140.md) | 2 | ui | M |  | Screen C-37 บริการและราคา (ext-M2) | T-0070 T-0026 T-0027 T-0071 T-0109 T-0085 |
| [T-0141](T-0141.md) | 2 | ui | S |  | Screen C-43 โต๊ะกรูม | T-0070 T-0106 |
| [T-0142](T-0142.md) | 2 | ui | M |  | Screen C-45 บัญชีของฉัน (ext-M2) | T-0070 T-0105 T-0088 |
| [T-0143](T-0143.md) | 2 | ui | S |  | Screen C-46 แจ้งปัญหา / ขอ feature | T-0070 T-0124 |
| [T-0144](T-0144.md) | 4 | ui | S |  | Screen S-01 คิวของฉันวันนี้ | T-0130 T-0071 T-0121 |
| [T-0145](T-0145.md) | 4 | ui | M |  | Screen S-02 Job card | T-0130 T-0071 T-0120 T-0119 T-0038 T-0056 |
| [T-0146](T-0146.md) | 3 | ui | S |  | Screen S-07 ฉัน | T-0130 T-0020 T-0105 |
| [T-0147](T-0147.md) | 3 | ui | S |  | Screen AD-04 Feedback | T-0025 T-0026 T-0027 T-0125 T-0126 |
| [T-0148](T-0148.md) | 5 | e2e | L |  | E2E M2: หน้าร้านลงนัด … | T-0039 T-0136 T-0134 T-0135 T-0138 T-0145 T-0144 |
| [H-11](H-11.md) | 6 | human | - |  | Release A: UAT + ตัดสินใจปล่อยร้านนำร่อง (M2) | T-0091 T-0130 T-0131 T-0072 T-0092 T-0093 T-0094 T-0095 … |

## M3 — ลูกค้าจองกรูมเองใน LINE + มัดจำ (71 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [T-0149](T-0149.md) | 1 | infra | L | ⚠️ | LINE integration: messaging client, ID token verify, webhook signature, secret encryption, fake mode | T-0010 H-03 |
| [T-0150](T-0150.md) | 1 | domain | M |  | Rule R-05 อ่าน QR บนสลิป + จับสลิปซ้ำ | H-01 |
| [T-0151](T-0151.md) | 1 | domain | M | ⚠️ | Rule R-15 ยอดบิล ส่วนลด และการรับชำระ | H-01 |
| [T-0152](T-0152.md) | 1 | domain | S |  | Rule R-21 สิทธิ์ลูกค้าเลื่อน/ยกเลิกเอง | H-01 |
| [T-0153](T-0153.md) | 1 | domain | S |  | Rule R-30 PromptPay QR (EMVCo payload) | H-01 |
| [T-0154](T-0154.md) | 2 | api | S |  | API branch.setPromptpay | T-0007 T-0035 T-0010 T-0153 T-0044 |
| [T-0155](T-0155.md) | 1 | api | M |  | API line.status, line.skipped | T-0007 T-0008 |
| [T-0156](T-0156.md) | 1 | api | M | ⚠️ | API customers.blacklist, customers.reliabilityOverride, customers.credit | T-0007 T-0035 T-0051 T-0050 T-0097 |
| [T-0157](T-0157.md) | 1 | api | S |  | API pets.setStatus | T-0007 T-0036 T-0053 |
| [T-0158](T-0158.md) | 1 | api | M |  | API linkRequests.list, linkRequests.reject | T-0007 T-0050 T-0035 |
| [T-0159](T-0159.md) | 2 | api | L |  | API linkRequests.approve | T-0007 T-0035 T-0010 T-0149 T-0158 T-0050 |
| [T-0160](T-0160.md) | 1 | api | M |  | API bookings.list, bookings.approve, bookings.decline | T-0007 T-0112 T-0050 T-0010 T-0035 T-0036 T-0051 T-0095 |
| [T-0161](T-0161.md) | 1 | api | M |  | API bookings.cancelPreview, bookings.recordDeposit, bookings.waiveDeposit | T-0007 T-0095 T-0035 T-0038 T-0112 T-0051 T-0050 |
| [T-0162](T-0162.md) | 1 | api | S |  | API bookings.balanceLink | T-0007 T-0010 |
| [T-0163](T-0163.md) | 1 | api | S |  | API groom.noShow | T-0007 T-0035 T-0010 T-0095 T-0097 T-0112 T-0051 |
| [T-0164](T-0164.md) | 1 | api | S |  | API stays.noShow | T-0007 T-0035 T-0095 T-0097 T-0112 T-0051 |
| [T-0165](T-0165.md) | 1 | api | S |  | API daycare.no_show | T-0007 T-0035 T-0095 T-0097 T-0112 T-0051 |
| [T-0166](T-0166.md) | 1 | api | M | ⚠️ | API slips.list, slips.reject | T-0007 T-0112 T-0035 T-0010 T-0096 |
| [T-0167](T-0167.md) | 2 | api | L | ⚠️ | API slips.verify | T-0007 T-0035 T-0010 T-0150 T-0151 T-0112 |
| [T-0168](T-0168.md) | 1 | api | S | ⚠️ | API refunds.create | T-0007 T-0035 T-0095 T-0038 |
| [T-0169](T-0169.md) | 2 | api | S |  | API bills.promptpayQr | T-0007 T-0153 T-0112 |
| [T-0170](T-0170.md) | 2 | api | L | ⚠️ | API liff.session | T-0007 T-0149 |
| [T-0171](T-0171.md) | 3 | api | L | ⚠️ | API liff.register | T-0007 T-0010 T-0014 T-0149 T-0170 |
| [T-0172](T-0172.md) | 2 | api | M |  | API liff.me, liff.updateMe, liff.shop | T-0007 T-0149 T-0059 |
| [T-0173](T-0173.md) | 2 | api | M |  | API liff.pets, liff.createPet, liff.updatePet | T-0007 T-0149 T-0056 T-0053 T-0038 |
| [T-0174](T-0174.md) | 2 | api | M |  | API liff.addVaccination, liff.bookings, liff.booking | T-0007 T-0010 T-0038 T-0149 T-0053 T-0152 T-0095 T-0112 |
| [T-0175](T-0175.md) | 2 | api | L | ⚠️ | API liff.groomSlots | T-0007 T-0040 T-0041 T-0092 T-0093 T-0100 T-0149 T-0110 |
| [T-0176](T-0176.md) | 2 | api | L | ⚠️ | API liff.quote (grooming) | T-0007 T-0092 T-0094 T-0096 T-0099 T-0149 T-0111 |
| [T-0177](T-0177.md) | 3 | api | L | ⚠️ | API liff.createBooking (grooming) | T-0007 T-0010 T-0035 T-0092 T-0093 T-0094 T-0096 T-0097 … |
| [T-0178](T-0178.md) | 3 | api | M |  | API liff.uploadSlip, liff.ics, liff.payPage | T-0007 T-0010 T-0035 T-0150 T-0096 T-0038 T-0149 T-0174 … |
| [T-0179](T-0179.md) | 3 | api | L | ⚠️ | API liff.cancel | T-0007 T-0010 T-0035 T-0095 T-0097 T-0152 T-0149 T-0174 … |
| [T-0180](T-0180.md) | 3 | api | L | ⚠️ | API liff.reschedule | T-0007 T-0010 T-0093 T-0152 T-0149 T-0174 T-0112 |
| [T-0181](T-0181.md) | 2 | api | M |  | API liff.payUploadSlip, liff.dataRequest | T-0007 T-0010 T-0150 T-0038 T-0149 T-0112 |
| [T-0182](T-0182.md) | 3 | api | S |  | API public.branch | T-0007 T-0172 T-0059 |
| [T-0183](T-0183.md) | 2 | api | L | ⚠️ | API webhook.line | T-0007 T-0009 T-0149 T-0036 |
| [T-0184](T-0184.md) | 2 | api | S | ⚠️ | API admin.setLineChannel | T-0007 T-0035 T-0149 T-0155 |
| [T-0185](T-0185.md) | 2 | api | L | ⚠️ | API admin.verifyLine | T-0007 T-0035 T-0149 T-0155 |
| [T-0186](T-0186.md) | 1 | job | M |  | Job handler expire_hold | T-0036 T-0010 |
| [T-0187](T-0187.md) | 1 | job | M |  | Job handler reminder_24h | T-0036 T-0010 |
| [T-0188](T-0188.md) | 1 | job | M |  | Job handler approval_overdue | T-0036 T-0010 T-0095 |
| [T-0189](T-0189.md) | 1 | job | M |  | Job handler recompute_reliability | T-0036 T-0010 |
| [T-0190](T-0190.md) | 2 | notify | M |  | Notification templates (customer, M3): booking_received, booking_confirmed, booking_declined, booking_cancelled, booking_rescheduled, deposit_confirmed | T-0010 T-0149 |
| [T-0191](T-0191.md) | 2 | notify | M |  | Notification templates (customer, M3): slip_rejected, hold_expired, reminder_24h, no_show, balance_link, vaccine_rejected | T-0010 T-0149 |
| [T-0192](T-0192.md) | 2 | notify | M |  | Notification templates (customer, M3): link_approved | T-0010 T-0149 |
| [T-0193](T-0193.md) | 1 | notify | M |  | Notification templates (staff, M3): slip_submitted, approval_overdue, booking_cancelled, booking_rescheduled, link_request | T-0010 T-0091 |
| [T-0194](T-0194.md) | 1 | notify | M |  | Notification templates (owner, M3): quota_warning, promptpay_changed | T-0010 T-0091 T-0011 |
| [T-0195](T-0195.md) | 2 | ui | M |  | LIFF shell: liff.init + session + header ร้าน | T-0015 T-0016 T-0149 |
| [T-0196](T-0196.md) | 2 | ui | M |  | Shared component: PromptPayQR (R-30) + Countdown + SlipUploader (jsQR อ่าน QR บนสลิป → qrPayload) | T-0015 T-0071 T-0153 |
| [T-0197](T-0197.md) | 4 | ui | M |  | Screen P-01 หน้าลิงก์จองของร้าน | T-0015 T-0026 T-0196 T-0027 T-0182 |
| [T-0198](T-0198.md) | 2 | ui | L |  | Screen C-02D รายละเอียดนัดกรูม (drawer) (ext-M3) | T-0070 T-0026 T-0027 T-0071 T-0163 T-0135 |
| [T-0199](T-0199.md) | 2 | ui | M |  | Screen C-04 ใบจอง | T-0070 T-0026 T-0027 T-0160 |
| [T-0200](T-0200.md) | 2 | ui | L |  | Screen C-05 รายละเอียดใบจอง (ext-M3) | T-0070 T-0026 T-0071 T-0160 T-0161 T-0162 T-0137 |
| [T-0201](T-0201.md) | 3 | ui | M |  | Screen C-07 สลิปรอตรวจ | T-0070 T-0026 T-0196 T-0071 T-0166 T-0167 |
| [T-0202](T-0202.md) | 2 | ui | L |  | Screen C-09 ลูกค้า (ext-M3) | T-0070 T-0026 T-0027 T-0071 T-0156 T-0168 T-0076 |
| [T-0203](T-0203.md) | 2 | ui | L |  | Screen C-11 น้อง (ext-M3) | T-0070 T-0073 T-0026 T-0027 T-0071 T-0157 T-0078 |
| [T-0204](T-0204.md) | 3 | ui | S |  | Screen C-12 คำขอจับคู่บัญชี LINE | T-0070 T-0026 T-0071 T-0158 T-0159 |
| [T-0205](T-0205.md) | 2 | ui | S |  | Screen C-22 ข้อความที่ไม่ได้ส่ง | T-0070 T-0155 |
| [T-0206](T-0206.md) | 3 | ui | S |  | Screen C-34 บัญชีรับเงิน PromptPay | T-0070 T-0196 T-0044 T-0154 |
| [T-0207](T-0207.md) | 3 | ui | S |  | Screen C-35 LINE OA และลิงก์จอง | T-0070 T-0196 T-0155 |
| [T-0208](T-0208.md) | 4 | ui | S |  | Screen L-01 ลงทะเบียน | T-0195 T-0026 T-0071 T-0170 T-0172 T-0171 |
| [T-0209](T-0209.md) | 3 | ui | S |  | Screen L-02 หน้าแรก | T-0195 T-0026 T-0172 T-0174 |
| [T-0210](T-0210.md) | 3 | ui | M |  | Screen L-03 น้องของฉัน | T-0195 T-0026 T-0071 T-0173 T-0038 T-0174 |
| [T-0211](T-0211.md) | 4 | ui | M |  | Screen L-04 จองกรูม | T-0195 T-0026 T-0072 T-0071 T-0172 T-0173 T-0175 T-0176 … |
| [T-0212](T-0212.md) | 4 | ui | S |  | Screen L-07 จ่ายมัดจำ | T-0195 T-0026 T-0196 T-0071 T-0174 T-0038 T-0178 |
| [T-0213](T-0213.md) | 3 | ui | S |  | Screen L-08 นัดของฉัน | T-0195 T-0026 T-0174 |
| [T-0214](T-0214.md) | 4 | ui | M |  | Screen L-09 รายละเอียดนัด | T-0195 T-0026 T-0174 T-0178 T-0175 T-0180 T-0179 |
| [T-0215](T-0215.md) | 4 | ui | S |  | Screen L-14 จ่ายยอดคงเหลือ | T-0195 T-0026 T-0196 T-0071 T-0178 T-0181 |
| [T-0216](T-0216.md) | 3 | ui | S |  | Screen L-15 โปรไฟล์ของฉัน | T-0195 T-0026 T-0071 T-0172 T-0181 |
| [T-0217](T-0217.md) | 3 | ui | M |  | Screen AD-03 ร้าน (admin) | T-0025 T-0026 T-0319 T-0184 T-0185 T-0125 |
| [T-0218](T-0218.md) | 5 | e2e | L |  | E2E M3: ลูกค้าเปิด LIFF (fake LINE) … | T-0039 T-0208 T-0211 T-0212 T-0214 T-0201 T-0187 T-0186 |
| [H-12](H-12.md) | 6 | human | - |  | Milestone review M3: demo + ตรวจคุณภาพ | T-0149 T-0195 T-0196 T-0150 T-0151 T-0008 T-0152 T-0153 … |

## M4 — ปิดบิล ค่ามือ หลังบริการ (47 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [H-13](H-13.md) | 1 | human | - |  | SP-05 ทดสอบพิมพ์ใบเสร็จ 58/80 มม. จาก browser |  |
| [T-0219](T-0219.md) | 1 | domain | L | ⚠️ | Rule R-13 ค่ามือ (commission) | H-01 |
| [T-0220](T-0220.md) | 1 | domain | M |  | Rule R-14 แพ็กเกจ: มูลค่าต่อครั้ง วันหมดอายุ และสิทธิ์ใช้ | H-01 T-0012 |
| [T-0221](T-0221.md) | 1 | domain | S | ⚠️ | Rule R-16 เลขที่ใบเสร็จ | H-01 T-0012 |
| [T-0222](T-0222.md) | 1 | domain | S |  | Rule R-17 วันครบรอบกรูมถัดไป | H-01 |
| [T-0223](T-0223.md) | 2 | api | S |  | API staffMe.commissions | T-0007 T-0219 |
| [T-0224](T-0224.md) | 1 | api | L | ⚠️ | API customers.timeline | T-0007 |
| [T-0225](T-0225.md) | 1 | api | S |  | API customers.packages | T-0007 T-0051 |
| [T-0226](T-0226.md) | 2 | api | M |  | API packageTemplates.list, packageTemplates.upsert | T-0007 T-0220 |
| [T-0227](T-0227.md) | 2 | api | M |  | API commissionRules.list, commissionRules.set | T-0007 T-0035 T-0219 |
| [T-0228](T-0228.md) | 2 | api | M |  | API groom.notifyPickup, groom.pickUp | T-0007 T-0010 T-0008 T-0112 T-0051 T-0035 T-0222 T-0036 |
| [T-0229](T-0229.md) | 1 | api | L | ⚠️ | API bills.open (grooming) | T-0007 T-0151 T-0051 T-0050 |
| [T-0230](T-0230.md) | 2 | api | M | ⚠️ | API bills.list, bills.get, bills.updateLine | T-0007 T-0229 T-0051 T-0050 T-0035 T-0151 |
| [T-0231](T-0231.md) | 2 | api | L | ⚠️ | API bills.addLine | T-0007 T-0220 T-0151 T-0229 T-0051 T-0050 |
| [T-0232](T-0232.md) | 3 | api | M | ⚠️ | API bills.removeLine, bills.setDiscount, bills.voidPayment | T-0007 T-0230 T-0229 T-0051 T-0050 T-0035 T-0151 |
| [T-0233](T-0233.md) | 2 | api | L | ⚠️ | API bills.addPayment | T-0007 T-0035 T-0151 T-0153 T-0038 T-0229 T-0051 T-0050 |
| [T-0234](T-0234.md) | 2 | api | L | ⚠️ | API bills.close | T-0007 T-0035 T-0010 T-0097 T-0219 T-0220 T-0151 T-0221 … |
| [T-0235](T-0235.md) | 2 | api | L | ⚠️ | API bills.void | T-0007 T-0035 T-0219 T-0220 T-0229 T-0051 T-0050 |
| [T-0236](T-0236.md) | 1 | api | M |  | API bills.receipt, bills.sendReceipt | T-0007 T-0013 T-0051 T-0010 T-0008 T-0009 |
| [T-0237](T-0237.md) | 1 | api | M |  | API reportCards.list, reportCards.get, reportCards.update | T-0007 T-0056 T-0051 |
| [T-0238](T-0238.md) | 2 | api | L |  | API reportCards.submit | T-0007 T-0010 T-0035 T-0008 T-0009 T-0237 T-0056 T-0051 |
| [T-0239](T-0239.md) | 2 | api | S |  | API reportCards.approve | T-0007 T-0010 T-0035 T-0237 T-0056 T-0051 |
| [T-0240](T-0240.md) | 3 | api | S |  | API reports.commissions | T-0007 T-0219 T-0223 |
| [T-0241](T-0241.md) | 2 | api | M |  | API liff.reportCard, liff.rate, liff.reviewClick | T-0007 T-0149 T-0237 T-0056 T-0051 T-0010 |
| [T-0242](T-0242.md) | 2 | api | M |  | API liff.packages, liff.receipt | T-0007 T-0149 T-0051 T-0236 |
| [T-0243](T-0243.md) | 2 | job | M |  | Job handler next_groom_reminder | T-0036 T-0010 T-0222 T-0222 |
| [T-0244](T-0244.md) | 1 | job | M |  | Job handler package_expiry | T-0036 T-0010 |
| [T-0245](T-0245.md) | 1 | notify | M |  | Notification templates (customer, M4): ready_for_pickup, report_card, receipt, next_groom_reminder | T-0010 T-0149 |
| [T-0246](T-0246.md) | 1 | notify | M |  | Notification templates (staff, M4): report_card_review, low_rating | T-0010 T-0091 |
| [T-0247](T-0247.md) | 3 | ui | L |  | Screen C-02D รายละเอียดนัดกรูม (drawer) (ext-M4) | T-0070 T-0026 T-0027 T-0071 T-0228 T-0198 |
| [T-0248](T-0248.md) | 2 | ui | L |  | Screen C-05 รายละเอียดใบจอง (ext-M4) | T-0070 T-0026 T-0071 T-0229 T-0200 |
| [T-0249](T-0249.md) | 2 | ui | L |  | Screen C-09 ลูกค้า (ext-M4) | T-0070 T-0026 T-0027 T-0071 T-0224 T-0225 T-0202 |
| [T-0250](T-0250.md) | 4 | ui | L |  | Screen C-18 บิล (คิดเงิน) | T-0070 T-0026 T-0196 T-0230 T-0231 T-0232 T-0169 T-0233 … |
| [T-0251](T-0251.md) | 3 | ui | S |  | Screen C-19 รายการบิล | T-0070 T-0026 T-0027 T-0230 T-0229 |
| [T-0252](T-0252.md) | 2 | ui | M |  | Screen C-20 ใบเสร็จ (พิมพ์) | T-0070 T-0026 T-0236 |
| [T-0253](T-0253.md) | 3 | ui | S |  | Screen C-21 Report card รอตรวจ | T-0070 T-0026 T-0071 T-0237 T-0239 |
| [T-0254](T-0254.md) | 4 | ui | S |  | Screen C-24 รายงานค่ามือ | T-0070 T-0026 T-0027 T-0240 |
| [T-0255](T-0255.md) | 3 | ui | S |  | Screen C-41 แพ็กเกจ | T-0070 T-0026 T-0226 T-0059 |
| [T-0256](T-0256.md) | 3 | ui | S |  | Screen C-42 ค่ามือ | T-0070 T-0026 T-0027 T-0227 T-0059 T-0048 |
| [T-0257](T-0257.md) | 3 | ui | M |  | Screen S-02 Job card (ext-M4) | T-0130 T-0071 T-0228 T-0145 |
| [T-0258](T-0258.md) | 3 | ui | M |  | Screen S-03 Report card | T-0130 T-0026 T-0071 T-0237 T-0238 |
| [T-0259](T-0259.md) | 3 | ui | S |  | Screen S-06 ค่ามือของฉัน | T-0130 T-0026 T-0223 |
| [T-0260](T-0260.md) | 3 | ui | M |  | Screen L-11 Report card | T-0195 T-0026 T-0071 T-0241 |
| [T-0261](T-0261.md) | 3 | ui | S |  | Screen L-12 แพ็กเกจของฉัน | T-0195 T-0026 T-0242 |
| [T-0262](T-0262.md) | 3 | ui | S |  | Screen L-13 ใบเสร็จ | T-0195 T-0026 T-0071 T-0242 |
| [T-0263](T-0263.md) | 5 | e2e | L |  | E2E M4: เปิดบิลจากนัด … | T-0039 T-0250 T-0252 T-0258 T-0260 |
| [H-14](H-14.md) | 6 | human | - |  | Release B: UAT + ตัดสินใจปล่อยร้านนำร่อง (M4) | T-0219 T-0220 T-0221 T-0222 T-0223 T-0224 T-0225 T-0226 … |

## M5 — Pet Hotel & Daycare (41 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [T-0264](T-0264.md) | 1 | domain | L |  | Rule R-26 สร้างงานดูแลรายวัน (care tasks) | H-01 T-0012 |
| [T-0265](T-0265.md) | 1 | api | M |  | API roomTypes.list, roomTypes.create, roomTypes.update | T-0007 T-0172 T-0038 |
| [T-0266](T-0266.md) | 1 | api | S |  | API roomTypes.setRates | T-0007 T-0172 |
| [T-0267](T-0267.md) | 1 | api | M |  | API roomUnits.list, roomUnits.upsert, roomUnits.housekeeping | T-0007 |
| [T-0268](T-0268.md) | 1 | api | M |  | API daycareTypes.list, daycareTypes.upsert | T-0007 |
| [T-0269](T-0269.md) | 1 | api | M |  | API availability.hotel, availability.daycare | T-0007 T-0040 T-0100 T-0102 T-0103 |
| [T-0270](T-0270.md) | 1 | api | L |  | API quotes.create (hotel+daycare) | T-0007 T-0092 T-0094 T-0096 T-0097 T-0111 |
| [T-0271](T-0271.md) | 1 | api | L | ⚠️ | API bookings.create (hotel+daycare) | T-0007 T-0035 T-0010 T-0040 T-0041 T-0092 T-0093 T-0094 … |
| [T-0272](T-0272.md) | 1 | api | L |  | API calendar.day (hotel+daycare) | T-0007 T-0115 T-0112 T-0051 T-0048 |
| [T-0273](T-0273.md) | 1 | api | M |  | API stays.today, stays.get, stays.signAgreement | T-0007 T-0112 T-0051 T-0056 T-0038 |
| [T-0274](T-0274.md) | 2 | api | L |  | API stays.saveIntake | T-0007 T-0014 T-0264 T-0038 T-0273 T-0056 T-0112 T-0051 |
| [T-0275](T-0275.md) | 2 | api | L |  | API stays.checkIn | T-0007 T-0035 T-0010 T-0099 T-0264 T-0273 T-0056 T-0112 … |
| [T-0276](T-0276.md) | 2 | api | M |  | API stays.changeRoom, stays.addAddon, stays.removeAddon | T-0007 T-0112 T-0051 T-0273 T-0056 |
| [T-0277](T-0277.md) | 1 | api | L |  | API stays.changeDates | T-0007 T-0092 T-0102 T-0112 T-0051 |
| [T-0278](T-0278.md) | 2 | api | S |  | API stays.postUpdate | T-0007 T-0010 T-0008 T-0038 T-0273 T-0056 T-0112 T-0051 |
| [T-0279](T-0279.md) | 2 | api | L |  | API stays.checkOut | T-0007 T-0035 T-0273 T-0056 T-0112 T-0051 |
| [T-0280](T-0280.md) | 1 | api | S |  | API roomMap.get | T-0007 T-0102 T-0112 T-0051 |
| [T-0281](T-0281.md) | 2 | api | M |  | API careTasks.list, careTasks.done, careTasks.skip | T-0007 T-0273 T-0035 T-0038 |
| [T-0282](T-0282.md) | 1 | api | M |  | API daycare.list, daycare.check_in, daycare.check_out | T-0007 T-0112 T-0051 T-0035 T-0099 |
| [T-0283](T-0283.md) | 1 | api | L | ⚠️ | API bills.open (hotel+daycare) | T-0007 T-0151 T-0229 T-0051 T-0050 |
| [T-0284](T-0284.md) | 2 | api | M |  | API liff.hotelAvailability, liff.daycareAvailability, liff.stayUpdates | T-0007 T-0100 T-0102 T-0149 T-0269 T-0103 T-0056 |
| [T-0285](T-0285.md) | 1 | api | L | ⚠️ | API liff.quote (hotel+daycare) | T-0007 T-0092 T-0094 T-0096 T-0099 T-0149 T-0176 T-0111 |
| [T-0286](T-0286.md) | 1 | api | L | ⚠️ | API liff.createBooking (hotel+daycare) | T-0007 T-0010 T-0035 T-0092 T-0093 T-0094 T-0096 T-0097 … |
| [T-0287](T-0287.md) | 1 | job | M |  | Job handler care_task_overdue_scan | T-0036 T-0010 |
| [T-0288](T-0288.md) | 1 | notify | M |  | Notification templates (customer, M5): stay_checked_in, stay_update | T-0010 T-0149 |
| [T-0289](T-0289.md) | 1 | notify | M |  | Notification templates (staff, M5): vaccine_review | T-0010 T-0091 |
| [T-0290](T-0290.md) | 2 | ui | M |  | Screen C-03 สร้างใบจอง (หน้าร้าน) (hotel+daycare) | T-0070 T-0026 T-0072 T-0027 T-0050 T-0110 T-0269 T-0270 … |
| [T-0291](T-0291.md) | 3 | ui | M |  | Screen C-13 Room map | T-0070 T-0026 T-0071 T-0280 T-0276 T-0267 |
| [T-0292](T-0292.md) | 2 | ui | S |  | Screen C-14 เข้า-ออกวันนี้ | T-0070 T-0026 T-0273 |
| [T-0293](T-0293.md) | 3 | ui | L |  | Screen C-15 การพัก | T-0070 T-0026 T-0131 T-0071 T-0273 T-0274 T-0275 T-0276 … |
| [T-0294](T-0294.md) | 3 | ui | S |  | Screen C-16 งานดูแลรายวัน (มุมมองร้าน) | T-0070 T-0026 T-0027 T-0281 |
| [T-0295](T-0295.md) | 2 | ui | M |  | Screen C-17 Daycare วันนี้ | T-0070 T-0026 T-0071 T-0282 T-0165 T-0123 |
| [T-0296](T-0296.md) | 2 | ui | M |  | Screen C-39 ห้องพัก | T-0070 T-0026 T-0071 T-0265 T-0267 T-0057 T-0266 |
| [T-0297](T-0297.md) | 2 | ui | S |  | Screen C-40 Daycare | T-0070 T-0026 T-0268 T-0057 |
| [T-0298](T-0298.md) | 3 | ui | S |  | Screen S-04 งานดูแลวันนี้ | T-0130 T-0071 T-0281 |
| [T-0299](T-0299.md) | 3 | ui | S |  | Screen S-05 ส่งอัปเดตน้อง | T-0130 T-0026 T-0071 T-0273 T-0278 |
| [T-0300](T-0300.md) | 3 | ui | M |  | Screen L-05 จองโรงแรม | T-0195 T-0026 T-0071 T-0173 T-0284 T-0285 T-0286 |
| [T-0301](T-0301.md) | 3 | ui | S |  | Screen L-06 จอง Daycare | T-0195 T-0026 T-0173 T-0284 T-0285 T-0286 |
| [T-0302](T-0302.md) | 3 | ui | S |  | Screen L-10 อัปเดตน้องระหว่างพัก | T-0195 T-0026 T-0071 T-0284 |
| [T-0303](T-0303.md) | 4 | e2e | L |  | E2E M5: จอง Hotel ใน LIFF … | T-0039 T-0300 T-0293 T-0298 T-0299 T-0302 T-0291 |
| [H-15](H-15.md) | 5 | human | - |  | Milestone review M5: demo + ตรวจคุณภาพ | T-0264 T-0265 T-0266 T-0267 T-0268 T-0269 T-0270 T-0271 … |

## M6 — รายงาน + พร้อมนำร่องเต็มรูปแบบ (14 tasks)

| ID | wave | lane | size | review | title | depends on |
|---|---|---|---|---|---|---|
| [T-0304](T-0304.md) | 1 | api | L |  | API dashboard.today | T-0007 T-0012 |
| [T-0305](T-0305.md) | 1 | api | L |  | API reports.sales | T-0007 T-0012 |
| [T-0306](T-0306.md) | 1 | api | S |  | API reports.occupancy | T-0007 |
| [T-0307](T-0307.md) | 1 | api | S |  | API exports.csv | T-0007 T-0035 |
| [T-0308](T-0308.md) | 1 | api | S |  | API admin.analytics | T-0007 |
| [T-0309](T-0309.md) | 1 | job | M |  | Job handler owner_daily_summary | T-0036 T-0010 |
| [T-0310](T-0310.md) | 1 | notify | M |  | Notification templates (owner, M6): daily_summary | T-0010 T-0091 T-0011 |
| [T-0311](T-0311.md) | 2 | ui | M |  | Screen C-01 วันนี้ (Dashboard) | T-0070 T-0026 T-0304 |
| [T-0312](T-0312.md) | 2 | ui | S |  | Screen C-23 รายงานยอดขาย | T-0070 T-0073 T-0026 T-0027 T-0305 T-0307 |
| [T-0313](T-0313.md) | 2 | ui | S |  | Screen C-24 รายงานค่ามือ (ext-M6) | T-0070 T-0026 T-0027 T-0307 T-0254 |
| [T-0314](T-0314.md) | 2 | ui | S |  | Screen C-25 Occupancy | T-0070 T-0073 T-0026 T-0027 T-0306 |
| [T-0315](T-0315.md) | 2 | ui | S |  | Screen AD-06 Analytics นำร่อง | T-0025 T-0027 T-0308 |
| [T-0316](T-0316.md) | 3 | e2e | L |  | E2E M6: Dashboard + รายงานยอดขาย/ค่ามือ/occupancy ตรงกับข้อมูล seed + export CSV … | T-0039 T-0311 T-0312 T-0254 T-0314 |
| [H-16](H-16.md) | 4 | human | - |  | Release C: UAT + ตัดสินใจปล่อยร้านนำร่อง (M6) | T-0073 T-0304 T-0305 T-0306 T-0307 T-0308 T-0309 T-0310 … |

