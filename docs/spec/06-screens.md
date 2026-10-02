# 06 — Screen Specs (field-level: แสดง/กรอก/บันทึกที่ไหน)

> ทุกหน้าระบุ: route, สิทธิ์, stories, API ที่โหลด, **ทุกฟิลด์** (โหมด, ป้าย, แหล่งข้อมูล `table.column`, รูปแบบ UI, กติกา) และปุ่ม → endpoint
> โหมด: **แสดง** = read-only · **กรอก** = ช่องใหม่ · **แสดง+แก้** = prefill จากค่าเดิมแล้วแก้ได้ · **ตัวกรอง** = ไม่บันทึก
> รูปแบบ: `money` = R-31 formatTHB · `date` = formatThaiDate (พ.ศ.) · `time` = formatTime · `phone` = R-22 formatPhone · `weight` = formatWeight · `enum` = ป้ายไทยจาก `docs/spec/enum-labels.th.json`
> UI kit: Tailwind + shadcn/ui; ภาษาไทยทั้งหมดผ่าน next-intl (`th`); ทุกหน้าใช้ได้ที่ความกว้าง 360px (LIFF/Staff) และ 1024px (Console)

## กติการ่วมทุกหน้า

- Loading: skeleton; Error: แสดง `error.message` จาก API + ปุ่มลองใหม่; Empty: ข้อความ + ปุ่ม action หลัก
- ฟอร์ม: validate ด้วย zod schema เดียวกับ API (`packages/contracts`) ก่อนส่ง; แสดง error ใต้ช่อง; ปุ่ม submit disabled ระหว่างส่ง (กันกดซ้ำ)
- ปุ่มที่เปลี่ยนสถานะต้องแสดงตามสถานะปัจจุบันเท่านั้น (ตาม 03) และ refetch หลังสำเร็จ
- ตัวเลขเงินทุกที่มาจาก server — client ห้ามคำนวณยอดเงินเอง (ยกเว้นพรีวิวเงินทอนบนปุ่มลัด)
- รูปทุกใบผ่าน signed URL; อัปโหลดผ่าน `*.uploadUrl` + presigned PUT (R-25)
- ช่องเบอร์ใช้ `inputmode=tel`, เงิน `inputmode=decimal` (รับบาท แปลงเป็นสตางค์ก่อนส่ง), น้ำหนักรับ กก. 1 ตำแหน่ง แปลงเป็นกรัม

### Admin shell (Q-0024)

- AD-01 `/admin/login` เป็น public และอยู่นอก guard; parent layout จัด providers เท่านั้น
- Guard + shell อยู่ที่ layout ของ `/admin/organizations` (รวม AD-02/AD-03), `/admin/feedback`, `/admin/data-requests`, `/admin/analytics`, `/admin/holidays`
- Guard ใช้ `resolveAdmin` เดิมจาก `@app/server/http`: อ่าน `aid`, ตรวจ token hash/expiry และ platform_admin active; ไม่มี/หมดอายุ/disabled/subject ผิด → redirect `/admin/login`
- Platform admin ไม่มีลำดับ role ย่อย: กติกา role ไม่ถึง → 403 ไม่ใช้กับ admin shell; ไม่เพิ่ม route 403 หรือ experimental authInterrupts
- Guard เป็น request entry: ตั้ง now ครั้งเดียวให้ resolver สร้าง ctx; หลังจากนั้นเวลาใช้ ctx.now เท่านั้น
- เมนู AD-* disabled จน screen task เปิด entry ใน `apps/web/src/components/shell-admin/navigation/<SCREEN-ID>.ts`; AD-03 ต้องมี orgId ปัจจุบันที่เป็นรูปธรรมจึงสร้างลิงก์ได้ (ไม่มี → disabled)

## สารบัญ

| ID | App | Route | หน้า | สิทธิ์ | Stories |
|---|---|---|---|---|---|
| [A-01](#scr-A-01) | auth | `/login` | เข้าสู่ระบบ (ร้าน) | public | US-01-02 |
| [A-02](#scr-A-02) | auth | `/forgot-password` | ลืมรหัสผ่าน | public | US-01-02 |
| [A-03](#scr-A-03) | auth | `/reset-password?token=` | ตั้งรหัสผ่านใหม่ | public | US-01-02 |
| [A-04](#scr-A-04) | auth | `/invite/[token]` | รับคำเชิญเข้าร้าน | public | US-01-04 |
| [P-01](#scr-P-01) | public | `/b/[bookingSlug]` | หน้าลิงก์จองของร้าน | public | US-02-07 |
| [P-02](#scr-P-02) | public | `/legal/[doc]` | เอกสารกฎหมาย | public | US-13-08 |
| [C-01](#scr-C-01) | console | `/console` | วันนี้ (Dashboard) | OF | US-12-01 |
| [C-02](#scr-C-02) | console | `/console/calendar?date=&view=day\|week` | ปฏิทินคิว | OFS | US-05-03 |
| [C-02D](#scr-C-02D) | console | `(drawer บน C-02 / C-05 / C-01)` | รายละเอียดนัดกรูม (drawer) | OFS | US-05-03, US-05-08, US-05-09, US-07-07, US-04-05 |
| [C-03](#scr-C-03) | console | `/console/bookings/new` | สร้างใบจอง (หน้าร้าน) | OF | US-05-04, US-06-03, US-06-07, US-06-13 |
| [C-04](#scr-C-04) | console | `/console/bookings?tab=approval\|deposit\|upcoming\|all` | ใบจอง | OF | US-05-05, US-07-03 |
| [C-05](#scr-C-05) | console | `/console/bookings/[bookingId]` | รายละเอียดใบจอง | OF | US-05-04, US-05-08, US-07-02..05, US-07-08 |
| [C-06](#scr-C-06) | console | `(dialog บน C-02/C-05)` | เช็คอินกรูม | OF | US-05-06 |
| [C-07](#scr-C-07) | console | `/console/slips` | สลิปรอตรวจ | OF | US-07-02 |
| [C-08](#scr-C-08) | console | `/console/customers` | ลูกค้า | OF | US-03-01, US-03-10 |
| [C-09](#scr-C-09) | console | `/console/customers/[customerId]?tab=info\|pets\|timeline\|packages\|credit` | ลูกค้า | OF | US-03-01, US-03-08, US-03-09, US-07-05, US-10-05 |
| [C-10](#scr-C-10) | console | `/console/customers/new \| /console/customers/[customerId]/edit` | ฟอร์มลูกค้า | OF | US-03-01 |
| [C-11](#scr-C-11) | console | `/console/pets/[petId]?tab=profile\|grooming\|health\|vaccines\|photos\|weight` | น้อง | OFS | US-03-02, US-03-03, US-03-04, US-03-05, US-03-06, US-03-07, US-03-11 |
| [C-12](#scr-C-12) | console | `/console/link-requests` | คำขอจับคู่บัญชี LINE | OF | US-11-01 |
| [C-13](#scr-C-13) | console | `/console/hotel?date=` | Room map | OFS | US-06-04 |
| [C-14](#scr-C-14) | console | `/console/hotel/today?date=` | เข้า-ออกวันนี้ | OFS | US-06-12 |
| [C-15](#scr-C-15) | console | `/console/stays/[stayId]?step=intake\|checkin\|stay\|checkout` | การพัก | OF | US-06-05, US-06-06, US-06-08, US-06-09, US-06-11 |
| [C-16](#scr-C-16) | console | `/console/hotel/tasks?date=` | งานดูแลรายวัน (มุมมองร้าน) | OFS | US-06-09 |
| [C-17](#scr-C-17) | console | `/console/daycare?date=` | Daycare วันนี้ | OFS | US-06-13 |
| [C-18](#scr-C-18) | console | `/console/bills/[billId]` | บิล (คิดเงิน) | OF | US-08-01, US-08-02, US-08-03, US-08-04, US-10-05, US-07-01 |
| [C-19](#scr-C-19) | console | `/console/bills?status=&date=` | รายการบิล | OF | US-08-01, US-08-06 |
| [C-20](#scr-C-20) | console | `/console/bills/[billId]/receipt` | ใบเสร็จ (พิมพ์) | OF | US-08-05 |
| [C-21](#scr-C-21) | console | `/console/report-cards` | Report card รอตรวจ | OF | US-10-01 |
| [C-22](#scr-C-22) | console | `/console/messages` | ข้อความที่ไม่ได้ส่ง | OF | US-13-06 |
| [C-23](#scr-C-23) | console | `/console/reports/sales` | รายงานยอดขาย | O | US-12-02, US-12-06 |
| [C-24](#scr-C-24) | console | `/console/reports/commissions` | รายงานค่ามือ | O | US-12-03 |
| [C-25](#scr-C-25) | console | `/console/reports/occupancy` | Occupancy | O | US-12-04 |
| [C-26](#scr-C-26) | console | `/console/settings/audit` | Audit log | O | US-13-07 |
| [C-30](#scr-C-30) | console | `/console/settings/shop` | ข้อมูลร้าน | O | US-02-01 |
| [C-31](#scr-C-31) | console | `/console/settings/hours` | เวลาเปิด-ปิดและวันหยุด | OF | US-02-01, US-02-05 |
| [C-32](#scr-C-32) | console | `/console/settings/modules` | บริการที่เปิด | O | US-02-02 |
| [C-33](#scr-C-33) | console | `/console/settings/policy` | นโยบายร้าน | O | US-02-04, US-07-03, US-07-04, US-05-05, US-06-05, US-07-06, US-10-04, US-13-06, US-12-05 |
| [C-34](#scr-C-34) | console | `/console/settings/payment` | บัญชีรับเงิน PromptPay | O | US-02-03, US-07-01 |
| [C-35](#scr-C-35) | console | `/console/settings/line` | LINE OA และลิงก์จอง | O | US-02-06, US-02-07, US-13-06 |
| [C-36](#scr-C-36) | console | `/console/settings/staff` | พนักงานและตารางงาน | OF | US-01-04, US-09-01 |
| [C-37](#scr-C-37) | console | `/console/settings/services?scope=grooming\|hotel\|daycare` | บริการและราคา | O | US-04-01, US-04-02, US-04-03, US-04-04, US-04-05, US-06-06 |
| [C-38](#scr-C-38) | console | `/console/settings/size-tiers` | ขนาดตามน้ำหนัก | O | US-04-02 |
| [C-39](#scr-C-39) | console | `/console/settings/rooms` | ห้องพัก | O | US-06-01, US-06-02 |
| [C-40](#scr-C-40) | console | `/console/settings/daycare` | Daycare | O | US-06-13 |
| [C-41](#scr-C-41) | console | `/console/settings/packages` | แพ็กเกจ | O | US-10-05 |
| [C-42](#scr-C-42) | console | `/console/settings/commissions` | ค่ามือ | O | US-09-02 |
| [C-43](#scr-C-43) | console | `/console/settings/stations` | โต๊ะกรูม | O | US-05-01 |
| [C-44](#scr-C-44) | console | `/console/settings/import` | นำเข้าข้อมูล CSV | O | US-02-08 |
| [C-45](#scr-C-45) | console | `/console/account` | บัญชีของฉัน | OFS | US-01-05, US-13-05, US-01-03 |
| [C-46](#scr-C-46) | console | `(ปุ่มลอยทุกหน้า)` | แจ้งปัญหา / ขอ feature | OFS | US-13-13 |
| [S-01](#scr-S-01) | staff | `/staff` | คิวของฉันวันนี้ | OFS | US-09-03 |
| [S-02](#scr-S-02) | staff | `/staff/appointments/[appointmentId]` | Job card | OFS | US-05-07, US-09-03, US-13-04 |
| [S-03](#scr-S-03) | staff | `/staff/report-cards/[reportCardId]` | Report card | OFS | US-10-01, US-10-02 |
| [S-04](#scr-S-04) | staff | `/staff/care` | งานดูแลวันนี้ | OFS | US-06-09 |
| [S-05](#scr-S-05) | staff | `/staff/stays/[stayId]/update` | ส่งอัปเดตน้อง | OFS | US-06-10 |
| [S-06](#scr-S-06) | staff | `/staff/me/commissions` | ค่ามือของฉัน | OFS | US-09-05 |
| [S-07](#scr-S-07) | staff | `/staff/me` | ฉัน | OFS | US-09-04, US-01-03 |
| [L-01](#scr-L-01) | liff | `/liff/[branchSlug]/register` | ลงทะเบียน | customer | US-01-01, US-11-01, US-13-08, US-03-12 |
| [L-02](#scr-L-02) | liff | `/liff/[branchSlug]` | หน้าแรก | customer | US-11-03, US-11-08 |
| [L-03](#scr-L-03) | liff | `/liff/[branchSlug]/pets \| /liff/[branchSlug]/pets/new \| /liff/[branchSlug]/pets/[petId]` | น้องของฉัน | customer | US-11-02, US-06-05 |
| [L-04](#scr-L-04) | liff | `/liff/[branchSlug]/book/grooming` | จองกรูม | customer | US-11-03 |
| [L-05](#scr-L-05) | liff | `/liff/[branchSlug]/book/hotel` | จองโรงแรม | customer | US-11-04, US-11-06 |
| [L-06](#scr-L-06) | liff | `/liff/[branchSlug]/book/daycare` | จอง Daycare | customer | US-11-05 |
| [L-07](#scr-L-07) | liff | `/liff/[branchSlug]/bookings/[bookingId]/pay` | จ่ายมัดจำ | customer | US-11-07, US-07-01, US-05-02 |
| [L-08](#scr-L-08) | liff | `/liff/[branchSlug]/bookings` | นัดของฉัน | customer | US-11-08 |
| [L-09](#scr-L-09) | liff | `/liff/[branchSlug]/bookings/[bookingId]` | รายละเอียดนัด | customer | US-11-08, US-11-10 |
| [L-10](#scr-L-10) | liff | `/liff/[branchSlug]/stays/[stayId]` | อัปเดตน้องระหว่างพัก | customer | US-06-10 |
| [L-11](#scr-L-11) | liff | `/liff/[branchSlug]/report-cards/[reportCardId]` | Report card | customer | US-10-01, US-10-02, US-10-03 |
| [L-12](#scr-L-12) | liff | `/liff/[branchSlug]/packages` | แพ็กเกจของฉัน | customer | US-10-06 |
| [L-13](#scr-L-13) | liff | `/liff/[branchSlug]/receipts/[billId]` | ใบเสร็จ | customer | US-08-05 |
| [L-14](#scr-L-14) | liff | `/liff/[branchSlug]/pay/[billId]` | จ่ายยอดคงเหลือ | customer | US-07-08 |
| [L-15](#scr-L-15) | liff | `/liff/[branchSlug]/me` | โปรไฟล์ของฉัน | customer | US-11-01, US-03-12, US-13-08 |
| [AD-01](#scr-AD-01) | admin | `/admin/login` | Admin login | public | US-13-10 |
| [AD-02](#scr-AD-02) | admin | `/admin/organizations` | ร้านทั้งหมด | admin | US-13-10, US-13-14 |
| [AD-03](#scr-AD-03) | admin | `/admin/organizations/[orgId]` | ร้าน (admin) | admin | US-02-06, US-13-10, US-13-11 |
| [AD-04](#scr-AD-04) | admin | `/admin/feedback` | Feedback | admin | US-13-13 |
| [AD-05](#scr-AD-05) | admin | `/admin/data-requests` | คำขอ PDPA | admin | US-13-08 |
| [AD-06](#scr-AD-06) | admin | `/admin/analytics` | Analytics นำร่อง | admin | US-13-12 |
| [AD-07](#scr-AD-07) | admin | `/admin/holidays` | วันหยุดราชการ | admin | US-13-03 |

## หน้าเข้าสู่ระบบ


<a id="scr-A-01"></a>

### A-01

#### เข้าสู่ระบบ (ร้าน)

Route: `/login` · สิทธิ์: public · Stories: US-01-02  
จุดประสงค์: พนักงานเข้าสู่ระบบด้วยอีเมล หรือปุ่ม LINE (สำหรับช่าง)  
โหลดข้อมูล: —

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | อีเมล | `staff_user.email` | email input, autocomplete=username | บังคับ, trim+lowercase |
| กรอก | รหัสผ่าน | `staff_user.password_hash` | password input + ปุ่มแสดงรหัส | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เข้าสู่ระบบ | `auth.staffLogin` | ฟอร์มครบ | → /console (owner/front_desk) หรือ /staff (staff) |
| เข้าด้วย LINE | `auth.staffLine` | เสมอ | LINE Login ของแพลตฟอร์ม → /staff |
| ลืมรหัสผ่าน | `—` |  | → /forgot-password |

- error INVALID_CREDENTIALS / ACCOUNT_LOCKED แสดงใต้ฟอร์ม (ไม่ล้างอีเมล)

<a id="scr-A-02"></a>

### A-02

#### ลืมรหัสผ่าน

Route: `/forgot-password` · สิทธิ์: public · Stories: US-01-02  
จุดประสงค์: ขอลิงก์รีเซ็ต  
โหลดข้อมูล: —

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | อีเมล | `staff_user.email` | email input | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่งลิงก์ | `auth.resetRequest` |  | แสดงข้อความเดียวกันเสมอ 'ถ้ามีบัญชีนี้ เราได้ส่งลิงก์ไปแล้ว' |


<a id="scr-A-03"></a>

### A-03

#### ตั้งรหัสผ่านใหม่

Route: `/reset-password?token=` · สิทธิ์: public · Stories: US-01-02  
จุดประสงค์: ตั้งรหัสใหม่จากลิงก์  
โหลดข้อมูล: —

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | รหัสผ่านใหม่ | `staff_user.password_hash` | password + ตัวชี้ความแข็งแรง | R-24 |
| กรอก | ยืนยันรหัสผ่าน | `calc: ต้องตรงกับช่องแรก (ไม่ส่ง server)` | password | ตรงกัน |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `auth.resetConfirm` |  | → /login พร้อม toast 'ตั้งรหัสผ่านแล้ว' |


<a id="scr-A-04"></a>

### A-04

#### รับคำเชิญเข้าร้าน

Route: `/invite/[token]` · สิทธิ์: public · Stories: US-01-04  
จุดประสงค์: พนักงานใหม่ตั้งชื่อ/รหัส หรือผูก LINE  
โหลดข้อมูล: —

**ข้อมูลร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อร้าน | `organization.name` | text |  |
| แสดง | ตำแหน่ง | `staff_user.role` | enum |  |

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อเล่นที่ลูกค้าเห็น | `staff_user.display_name` | text | 1–40 บังคับ |
| กรอก | อีเมล | `staff_user.email` | email | แสดงเมื่อคำเชิญไม่มีอีเมล |
| กรอก | รหัสผ่าน | `staff_user.password_hash` | password | R-24; ไม่บังคับถ้ากดใช้ LINE |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เริ่มใช้งาน | `auth.inviteAccept` |  | → /console หรือ /staff ตาม role |
| ใช้ LINE แทนรหัสผ่าน | `auth.inviteAccept + staffMe.linkLine` |  | → /staff |

- owner รับคำเชิญครั้งแรก: แสดงเงื่อนไขการใช้บริการ + DPA ให้กดยอมรับ (insert consent_record subject organization)

## หน้าเว็บสาธารณะ


<a id="scr-P-01"></a>

### P-01

#### หน้าลิงก์จองของร้าน

Route: `/b/[bookingSlug]` · สิทธิ์: public · Stories: US-02-07  
จุดประสงค์: หน้าเว็บสาธารณะจาก QR โปสเตอร์ — พาไปจองใน LINE  
โหลดข้อมูล: `public.branch`

**หัวร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | โลโก้ | `branch.logo_file_id` | image 96px |  |
| แสดง | ชื่อร้าน | `branch.name` | h1 |  |
| แสดง | ที่อยู่ | `branch.address_line` | text + ลิงก์แผนที่ |  |
| แสดง | เบอร์โทร | `branch.phone` | phone + tel: link |  |
| แสดง | เวลาเปิด | `branch_hours.opens_at` | ตาราง 7 วัน 'จ. 09:00–18:00' / 'ปิด' |  |

**บริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อบริการ | `service.name_th` | text |  |
| แสดง | ราคาเริ่มต้น | `calc: min(service_price.price_satang)` | money 'เริ่ม ฿350' |  |
| แสดง | ประเภทห้อง | `room_type.name_th` | text |  |
| แสดง | ราคาต่อคืนเริ่ม | `calc: min(room_rate.nightly_price_satang)` | money |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| จองผ่าน LINE | `—` | line_channel.status = active | เปิด liffUrl |
| เพิ่มเพื่อน | `—` | มี bot_basic_id | เปิด addFriendUrl |

- ไม่มี LINE เชื่อม → ซ่อนปุ่มจอง แสดงปุ่มโทร
- SEO: title = ชื่อร้าน + จังหวัด, OG image = โลโก้

<a id="scr-P-02"></a>

### P-02

#### เอกสารกฎหมาย

Route: `/legal/[doc]` · สิทธิ์: public · Stories: US-13-08  
จุดประสงค์: แสดง Privacy Notice / Terms / DPA ฉบับปัจจุบัน (ลิงก์จาก L-01, L-15, A-04)  
โหลดข้อมูล: —

**เอกสาร**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อเอกสาร | `calc: LEGAL_DOCS[doc]` | h1 ตาม enum legal_doc |  |
| แสดง | ฉบับ | `calc: LEGAL_DOCS[doc].version (ค่าเดียวกับ consent_record.version ที่บันทึกตอนยอมรับ)` | 'ฉบับวันที่ 1 ต.ค. 2569' (version จาก 10-reference-data) |  |
| แสดง | เนื้อหา | `calc: ไฟล์ markdown ใน LEGAL_DOCS[doc].file` | markdown → HTML (static, build time) |  |

- doc ∈ privacy | terms | dpa (ตาม route ใน 10-reference-data); อื่น ๆ → 404
- หน้า static ไม่เรียก API — อ่านไฟล์ตอน build

## Console ร้าน (owner / front_desk) — desktop/tablet


<a id="scr-C-01"></a>

### C-01

#### วันนี้ (Dashboard)

Route: `/console` · สิทธิ์: OF · Stories: US-12-01  
จุดประสงค์: ภาพรวมวันนี้ + สิ่งที่ต้องทำ  
โหลดข้อมูล: `dashboard.today`

**การ์ดตัวเลข**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | กรูมวันนี้ | `calc: DashboardToday.groom.total` | number + แยกสถานะ (badge) |  |
| แสดง | เข้า/ออก/พักอยู่ | `calc: DashboardToday.hotel.*` | 3 ตัวเลข |  |
| แสดง | Occupancy | `calc: DashboardToday.hotel.occupancyPercent` | percent 0 ตำแหน่ง |  |
| แสดง | Daycare | `calc: DashboardToday.daycare.count` | number |  |
| แสดง | ยอดรับเงินวันนี้ | `calc: DashboardToday.sales.paidTotalSatang` | money | owner เท่านั้น |

**ต้องทำ (กดแล้วไปหน้าที่เกี่ยวข้อง)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | สลิปรอตรวจ | `calc: count payment_slip submitted` | badge แดงถ้า > 0 → C-07 |  |
| แสดง | รออนุมัติ | `calc: count booking awaiting_approval` | badge → C-04 tab |  |
| แสดง | งานดูแลเลยเวลา | `calc: care_task overdue` | badge → C-16 |  |
| แสดง | Report card รอตรวจ | `calc: report_card pending_review` | → C-21 |  |
| แสดง | ข้อความไม่ได้ส่ง | `calc: notification skipped วันนี้` | → C-22 |  |
| แสดง | รับน้องแล้วยังไม่ปิดบิล | `calc: DashboardToday.todo.pickupsWithoutBill` | → C-19 |  |
| แสดง | คำขอจับคู่ LINE | `calc: customer_link_request pending` | → C-12 |  |

**คิวถัดไป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `groom_appointment.starts_at` | time |  |
| แสดง | น้อง | `pet.name` | ชื่อ + ป้ายนิสัย |  |
| แสดง | ช่าง | `staff_user.display_name` | text |  |
| แสดง | สถานะ | `groom_appointment.status` | enum badge |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| + จองใหม่ | `—` |  | → C-03 |

- รีเฟรชอัตโนมัติทุก 60 วินาที และเมื่อได้ web push

<a id="scr-C-02"></a>

### C-02

#### ปฏิทินคิว

Route: `/console/calendar?date=&view=day|week` · สิทธิ์: OFS · Stories: US-05-03  
จุดประสงค์: ตารางคิวกรูมรายวัน (คอลัมน์ = ช่าง) ลากเพื่อย้ายเวลา/ช่าง  
โหลดข้อมูล: `calendar.day`

**แถบบน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | วันที่ | `calc: query date` | date picker + ปุ่มวันนี้/←/→ |  |
| ตัวกรอง | มุมมอง | `calc: view` | segmented วัน/สัปดาห์ |  |
| ตัวกรอง | ช่าง | `groom_appointment.groomer_id` | select (ทุกคน) |  |
| แสดง | ปิดร้าน/ปิดบางช่วง | `branch_closure.starts_at` | แถบเทาทับช่วงเวลา + เหตุผล |  |

**การ์ดนัด (ในตาราง)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `groom_appointment.starts_at` | time–time (ends_at) |  |
| แสดง | ช่วง buffer | `groom_appointment.blocked_until` | แถบลาย |  |
| แสดง | ชื่อน้อง | `pet.name` | ตัวหนา |  |
| แสดง | พันธุ์/ขนาด | `pet.breed` | เล็ก + size_tier.code |  |
| แสดง | ป้ายนิสัย | `pet_temperament_flag.flag` | ไอคอน 🦷 กัด ฯลฯ |  |
| แสดง | บริการ | `groom_appointment_item.name_snapshot` | ย่อ 1 บรรทัด |  |
| แสดง | สถานะ | `groom_appointment.status` | สีการ์ด |  |
| แสดง | มัดจำ | `booking.deposit_status` | ไอคอน ✓/รอ |  |
| แสดง | ระดับลูกค้า | `customer.reliability_level` | จุดสี 1 แดง 2 ส้ม 4 ทอง |  |
| แสดง | โต๊ะ | `groom_station.name` | เล็กมุมล่าง |  |
| แสดง | เบอร์ลูกค้า | `owner_profile.phone_e164` | phone | ซ่อนจาก role staff |

**แถบข้าง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | Hotel วันนี้ | `calc: CalendarDay.hotel.*` | เข้า/ออก/พัก |  |
| แสดง | Daycare | `calc: CalendarDay.daycare.count` |  |  |
| แสดง | ช่วงพัก/ลาของช่าง | `staff_time_off.starts_at` | แถบเทา |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ลากการ์ดไปเวลา/ช่างใหม่ | `groom.reschedule` | OF, status scheduled | ยืนยัน dialog 'แจ้งลูกค้าไหม' → รีโหลด; SLOT_TAKEN → การ์ดเด้งกลับ + toast |
| คลิกช่องว่าง | `—` | OF | เปิด C-03 พร้อมวัน/เวลา/ช่าง |
| คลิกการ์ด | `—` |  | เปิด C-02D (drawer รายละเอียดนัด) |

- ช่วงเวลาแกน Y = เวลาเปิด–ปิดของวัน ทีละ slot_step
- role staff: อ่านอย่างเดียว ลากไม่ได้

<a id="scr-C-02D"></a>

### C-02D

#### รายละเอียดนัดกรูม (drawer)

Route: `(drawer บน C-02 / C-05 / C-01)` · สิทธิ์: OFS · Stories: US-05-03, US-05-08, US-05-09, US-07-07, US-04-05  
จุดประสงค์: ดูนัดเดียวแบบเร็วและกดเปลี่ยนสถานะ โดยไม่ออกจากปฏิทิน  
โหลดข้อมูล: `groom.jobCard`

**หัว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `groom_appointment.starts_at` | date + time–time (ends_at) |  |
| แสดง | สถานะ | `groom_appointment.status` | enum badge ใหญ่ |  |
| แสดง | เลขใบจอง | `booking.booking_no` | mono ลิงก์ → C-05 |  |
| แสดง | ช่าง | `staff_user.display_name` | + ป้าย 'ลูกค้าเลือก' ถ้า groomer_preference = requested |  |
| แสดง | โต๊ะ | `groom_station.name` |  |  |

**น้องและเจ้าของ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง | `pet.name` | รูป + ชื่อ + พันธุ์ + size_tier.code → ลิงก์ C-11 |  |
| แสดง | ป้ายนิสัย | `pet_temperament_flag.flag` | แถบแดง |  |
| แสดง | แพ้/ห้ามใช้ | `pet_shop_profile.allergies` | แดง + shampoo_avoid |  |
| แสดง | เจ้าของ | `owner_profile.first_name` | ลิงก์ → C-09 |  |
| แสดง | เบอร์ | `owner_profile.phone_e164` | phone + ปุ่มโทร | ซ่อนจาก role staff |
| แสดง | ระดับลูกค้า | `customer.reliability_level` | badge (R-09) |  |
| แสดง | มัดจำ | `booking.deposit_status` | enum badge |  |

**บริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `groom_appointment_item.name_snapshot` | แถว: ชื่อ + (add-on) + duration_minutes + money (price_satang); ใช้แพ็กเกจ → ป้าย 'แพ็กเกจ' |  |
| แสดง | ค่าบริการเพิ่ม | `appointment_surcharge.name` | แถว: ชื่อ + money (amount_satang) + reason + ปุ่มลบ (OF) |  |
| แสดง | รวมบริการ | `groom_appointment.services_total_satang` | money |  |
| แสดง | รวมค่าเพิ่ม | `groom_appointment.surcharge_total_satang` | money |  |

**หน้างาน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เช็คอินเมื่อ | `groom_appointment.checked_in_at` | time |  |
| แสดง | น้ำหนักวันนี้ | `groom_appointment.weight_grams_checkin` | weight |  |
| แสดง | สภาพที่พบ | `groom_appointment.condition_flags` | ป้าย + condition_note |  |
| แสดง | ใบยินยอม | `calc: JobCard.consentSigned` | ✓ เซ็นแล้ว / — |  |
| แสดง | เสร็จเมื่อ | `groom_appointment.done_at` | time |  |
| แสดง | โน้ตช่าง | `groom_appointment.staff_note` |  |  |
| แสดง | โน้ตลูกค้า | `booking.customer_note` | quote |  |

**ค่าบริการเพิ่ม (dialog)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ประเภท | `appointment_surcharge.surcharge_type_id` | select surcharge_type active (prefill ชื่อ + default_amount_satang) | บังคับ |
| กรอก | ชื่อที่แสดงในบิล | `appointment_surcharge.name` | text | 1–60 |
| กรอก | ยอด | `appointment_surcharge.amount_satang` | money input | > 0 |
| กรอก | เหตุผล | `appointment_surcharge.reason` | text (ลูกค้าเห็นในบิล) | ≤ 200 |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เช็คอิน | `groom.checkIn` | OF, status scheduled, วันนี้ | เปิด dialog C-06 |
| เริ่มงาน | `groom.start` | status checked_in | การ์ดเปลี่ยนสี in_progress |
| เสร็จงาน | `groom.finish` | status in_progress | สร้าง report card draft → ช่างกรอกที่ S-03 |
| แจ้งลูกค้ามารับ | `groom.notifyPickup` | OF, status done | ส่ง LINE ข้อความ 'พร้อมรับ' (notification ready_for_pickup, นับโควตา R-18; dedupe ต่อนัด — กดซ้ำไม่ส่งซ้ำ) แล้ว toast 'แจ้งลูกค้าแล้ว' |
| ลูกค้ารับน้องแล้ว | `groom.pickUp` | OF, status done | ถ้ายังไม่มีบิล → ปุ่ม 'เปิดบิล' (bills.open) → C-18 |
| ลูกค้าไม่มา | `groom.noShow` | OF, status scheduled, now ≥ starts_at + branch_policy.no_show_grace_minutes | dialog เหตุผล + แสดงผลมัดจำ (R-07) และผลต่อระดับลูกค้า (R-09) ก่อนยืนยัน |
| ยกเลิกนัดตัวนี้ | `groom.cancel` | OF, status scheduled\|checked_in | dialog เหตุผล (ยกเลิกทั้งใบ → ไป C-05) |
| ค่าบริการเพิ่มหน้างาน | `groom.addSurcharge / groom.removeSurcharge` | OF, status checked_in\|in_progress\|done และบิลยังไม่ปิด | dialog: ประเภท (surcharge_type) + ยอด + เหตุผล; ลบได้จนกว่าบิลปิด |

- ปุ่มแสดงตาม state machine groom_appointment (03) และ role — ไม่ซ่อนด้วยเงื่อนไขอื่นที่ไม่อยู่ในตารางนี้
- หลังทุก action สำเร็จ: ปิด/คงเปิด drawer ตามที่ระบุ แล้ว invalidate calendar.day + bookings.get

<a id="scr-C-03"></a>

### C-03

#### สร้างใบจอง (หน้าร้าน)

Route: `/console/bookings/new` · สิทธิ์: OF · Stories: US-05-04, US-06-03, US-06-07, US-06-13  
จุดประสงค์: ลงนัดให้ลูกค้าที่โทร/ทักแชท/walk-in  
โหลดข้อมูล: `search.quick`, `availability.groomSlots`, `availability.hotel`, `availability.daycare`, `quotes.create`

**1. ลูกค้า**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ค้นหาลูกค้า | `owner_profile.phone_e164` | search box (ชื่อ/เบอร์/ชื่อน้อง) | R-22 สำหรับเบอร์ |
| แสดง | ลูกค้าที่เลือก | `owner_profile.first_name` | ชื่อ + เบอร์ + badge ระดับ (R-09) + blacklisted แดง |  |
| กรอก | ช่องทาง | `booking.channel` | segmented walk_in/phone/chat | บังคับ |

**2. บริการ (เลือกได้หลายแท็บ)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้อง | `groom_appointment.pet_id` | chips น้องของลูกค้า (หลายตัวได้) | pet.status active |
| กรอก | บริการหลัก | `groom_appointment_item.service_id` | รายการ + ราคาตามขนาด/ขน (R-02) | ≥ 1 |
| กรอก | Add-on | `groom_appointment_item.service_id` | checkbox (เฉพาะที่ link กับบริการหลัก) |  |
| กรอก | ขนาด (ถ้าไม่รู้น้ำหนัก) | `groom_appointment.size_tier_id` | select | แสดงเมื่อ R-01 = no_weight |
| กรอก | ใช้แพ็กเกจ | `groom_appointment_item.customer_package_id` | select แพ็กเกจที่ R-14 canRedeem = ok |  |
| กรอก | ช่าง | `groom_appointment.groomer_id` | select ใครก็ได้/ระบุ |  |
| กรอก | วันที่ | `calc: date` | date picker |  |
| กรอก | เวลา | `groom_appointment.starts_at` | grid ปุ่ม slot (R-04) แสดงชื่อช่างที่ระบบเลือก | ต้องเลือกจากผล |
| กรอก | Hotel: ประเภทห้อง | `stay.room_type_id` | การ์ดประเภท + ห้องว่าง (R-28) + ราคา/คืน |  |
| กรอก | เช็คอิน–เช็คเอาท์ | `stay.check_in_date` | date range | ≤ 30 คืน |
| กรอก | เวลาที่จะมา/รับ | `stay.expected_check_in_time` | time select |  |
| กรอก | ห้อง (ไม่บังคับ) | `stay.room_unit_id` | select ห้องว่าง; ไม่เลือก = ระบบจัดห้องให้อัตโนมัติ (R-10) | ต้องว่างทุกคืน (R-10) |
| กรอก | ติดสัด | `stay.in_heat` | toggle | เพศเมีย |
| กรอก | Add-on ระหว่างพัก | `stay_addon.service_id` | checkbox |  |
| กรอก | อาบน้ำก่อนกลับ | `stay.bundle_appointment_id` | toggle → เลือกบริการ + slot วันเช็คเอาท์ | US-06-07 |
| กรอก | Daycare: วัน | `daycare_visit.visit_date` | date |  |
| กรอก | รอบ | `daycare_visit.session_type_id` | segmented + ที่ว่าง (R-29) |  |

**3. สรุป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการและราคา | `calc: Quote` | ตาราง money |  |
| แสดง | ยอดประเมิน | `booking.estimated_total_satang` | money ตัวใหญ่ |  |
| แสดง | มัดจำที่แนะนำ | `booking.deposit_required_satang` | money + เหตุผล (R-06) |  |
| แสดง+แก้ | ปรับมัดจำ | `booking.deposit_required_satang` | money input | เหตุผลบังคับเมื่อแก้ |
| กรอก | โน้ตจากลูกค้า | `booking.customer_note` | textarea | ≤ 500 |
| แสดง | คำเตือน | `calc: R-11/R-12 warnings` | กล่องเหลือง (วัคซีนไม่ครบ ฯลฯ) — ไม่บล็อก |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกการจอง | `bookings.create` | สรุปถูกต้อง | → C-05 + toast เลขใบจอง; SLOT_TAKEN → กลับขั้นเลือกเวลา |

- ถ้าลูกค้าใหม่: ปุ่ม 'เพิ่มลูกค้า' เปิด C-10 แบบ dialog แล้วกลับมาขั้นตอนเดิม

<a id="scr-C-04"></a>

### C-04

#### ใบจอง

Route: `/console/bookings?tab=approval|deposit|upcoming|all` · สิทธิ์: OF · Stories: US-05-05, US-07-03  
จุดประสงค์: คิวงานอนุมัติ/ตามมัดจำ  
โหลดข้อมูล: `bookings.list`

**แท็บ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | รออนุมัติ | `booking.status` | tab + จำนวน | awaiting_approval |
| ตัวกรอง | รอมัดจำ | `booking.status` | tab | awaiting_deposit, deposit_review |
| ตัวกรอง | กำลังจะมา | `booking.status` | tab | confirmed, first_service_at ≥ วันนี้ |
| ตัวกรอง | ทั้งหมด | `booking.status` | tab + filter สถานะ/วันที่ |  |

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เลขใบจอง | `booking.booking_no` | mono |  |
| แสดง | ลูกค้า | `owner_profile.first_name` | ชื่อ + ระดับ |  |
| แสดง | น้อง | `pet.name` | chips |  |
| แสดง | บริการ | `calc: modules` | ไอคอน ✂️/🏨/🌞 |  |
| แสดง | วันเวลาเริ่ม | `booking.first_service_at` | date + time |  |
| แสดง | ยอด | `booking.estimated_total_satang` | money |  |
| แสดง | มัดจำ | `booking.deposit_status` | enum badge + ยอด |  |
| แสดง | หมดเวลา | `booking.hold_expires_at` | นับถอยหลัง mm:ss (awaiting_deposit) |  |
| แสดง | อนุมัติภายใน | `booking.approval_due_at` | นับถอยหลัง, แดงเมื่อเลย |  |
| แสดง | ช่องทาง | `booking.channel` | enum |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| อนุมัติ | `bookings.approve` | awaiting_approval | แถวหายจากแท็บ |
| ปฏิเสธ | `bookings.decline` | awaiting_approval | dialog เหตุผล (ลูกค้าเห็น) |


<a id="scr-C-05"></a>

### C-05

#### รายละเอียดใบจอง

Route: `/console/bookings/[bookingId]` · สิทธิ์: OF · Stories: US-05-04, US-05-08, US-07-02..05, US-07-08  
จุดประสงค์: จัดการใบจองทั้งใบ  
โหลดข้อมูล: `bookings.get`

**หัว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เลขใบจอง | `booking.booking_no` | h1 mono |  |
| แสดง | สถานะ | `booking.status` | enum badge ใหญ่ |  |
| แสดง | ช่องทาง | `booking.channel` | enum |  |
| แสดง | สร้างเมื่อ | `booking.created_at` | date time |  |
| แสดง | ลูกค้า | `owner_profile.first_name` | ลิงก์ → C-09 + เบอร์ + ระดับ |  |

**บริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | นัดกรูม | `groom_appointment.starts_at` | การ์ด AppointmentCard ต่อน้อง + ปุ่มตามสถานะ |  |
| แสดง | การพัก | `stay.check_in_date` | การ์ด StayCard → C-15 |  |
| แสดง | Daycare | `daycare_visit.visit_date` | แถว + สถานะ |  |

**เงิน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยอดประเมิน | `booking.estimated_total_satang` | money |  |
| แสดง | มัดจำที่ต้องจ่าย | `booking.deposit_required_satang` | money |  |
| แสดง | มัดจำที่ยืนยันแล้ว | `booking.deposit_verified_satang` | money |  |
| แสดง | สถานะมัดจำ | `booking.deposit_status` | enum badge |  |
| แสดง | สลิป | `payment_slip.file_id` | thumbnail → C-07 dialog |  |
| แสดง | บิล | `booking.bill_id` | ลิงก์ → C-18 |  |

**นโยบาย ณ เวลาจอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยกเลิกฟรีก่อน | `booking.policy_snapshot` | 'กรูม 24 ชม. / โรงแรม 72 ชม. / ริบ 100%' |  |

**ประวัติ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เหตุการณ์ | `booking_event.to_status` | timeline: เวลา + จาก→ไป + ผู้ทำ + เหตุผล |  |

**โน้ต**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | โน้ตจากลูกค้า | `booking.customer_note` | quote |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| อนุมัติ/ปฏิเสธ | `bookings.approve / bookings.decline` | awaiting_approval |  |
| รับมัดจำ | `bookings.recordDeposit` | deposit pending/rejected | dialog: วิธี, ยอด, เลขอ้างอิง, รูปหลักฐาน |
| ยกเว้นมัดจำ | `bookings.waiveDeposit` | deposit pending | dialog เหตุผล |
| ยกเลิกใบจอง | `bookings.cancelPreview → bookings.cancel` | status active | dialog: ใครยกเลิก (ลูกค้าขอ/ร้าน), แสดงผลเงิน R-07 ก่อนยืนยัน, ช่องเหตุผล |
| เปิดบิล | `bills.open` | confirmed และมี child เสร็จแล้ว | → C-18 |
| ส่งลิงก์จ่ายยอดคงเหลือ | `bookings.balanceLink` | มีบิล open | copy link / ส่ง LINE |
| คลิกการ์ดนัดกรูม | `—` |  | เปิด C-02D (ปุ่มเช็คอิน/ไม่มา/ยกเลิก/ค่าเพิ่ม อยู่ใน drawer) |
| ยกเลิกการพักตัวนี้ | `stays.cancel` | stay reserved | dialog เหตุผล |
| ยกเลิก Daycare วันนี้ | `daycare.cancel` | daycare_visit reserved | dialog เหตุผล |


<a id="scr-C-06"></a>

### C-06

#### เช็คอินกรูม

Route: `(dialog บน C-02/C-05)` · สิทธิ์: OF · Stories: US-05-06  
จุดประสงค์: รับน้องเข้าร้าน + ใบยินยอม  
โหลดข้อมูล: `groom.jobCard`

**น้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ/พันธุ์/ป้ายนิสัย | `pet.name` | header |  |
| แสดง | น้ำหนักล่าสุด | `pet.latest_weight_grams` | weight |  |
| แสดง | บริการที่จอง | `groom_appointment_item.name_snapshot` | list + ราคา |  |

**ตรวจรับ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้ำหนักวันนี้ (กก.) | `groom_appointment.weight_grams_checkin` | number 0.1 กก. → แปลงเป็นกรัม | 0.1–150 |
| กรอก | สภาพที่พบ | `groom_appointment.condition_flags` | checkbox: เห็บหมัด / แผล / ขนพันกัน / ผิวหนังมีปัญหา |  |
| กรอก | รายละเอียด | `groom_appointment.condition_note` | textarea | ≤ 500 |

**ใบยินยอม (แสดงเมื่อเลือก ขนพันกัน/ผิวหนัง หรือกดเพิ่มเอง)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | เหตุผล | `consent_document.reasons` | checkbox: ต้องไถขน / สูงวัย / โรคประจำตัว / ดุ / อื่นๆ | ≥ 1 |
| แสดง | ข้อความใบยินยอม | `branch_policy.grooming_consent_text` | กล่องข้อความเลื่อนอ่านได้ |  |
| กรอก | ชื่อผู้เซ็น | `consent_document.signer_name` | text | บังคับ |
| กรอก | ลายเซ็น | `consent_document.signature_file_id` | signature pad (canvas → PNG อัปโหลด kind signature) | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เช็คอิน | `groom.checkIn` |  | ปิด dialog; ถ้า response.warnings มี SIZE_CHANGED → dialog 'ขนาดเปลี่ยนเป็น X ราคาใหม่ ฿xxx ปรับไหม' |
| ปรับบริการ/ขนาดตามน้ำหนักวันนี้ | `groom.setItems` | หลังเช็คอิน และผู้ใช้กดยืนยันใน dialog ราคาใหม่ | อัปเดตรายการ + ราคา (R-02/R-03) |


<a id="scr-C-07"></a>

### C-07

#### สลิปรอตรวจ

Route: `/console/slips` · สิทธิ์: OF · Stories: US-07-02  
จุดประสงค์: ตรวจสลิปที่ลูกค้าส่ง (ร้านต้องเช็คยอดเข้าบัญชีจริงก่อนกดยืนยัน)  
โหลดข้อมูล: `slips.list`

**รายการ (เรียงเก่า→ใหม่)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รูปสลิป | `payment_slip.file_id` | thumbnail คลิกขยาย |  |
| แสดง | ใบจอง | `booking.booking_no` | ลิงก์ |  |
| แสดง | ลูกค้า | `owner_profile.first_name` | text |  |
| แสดง | ยอดที่ต้องจ่าย | `payment_slip.amount_expected_satang` | money |  |
| แสดง | เลขอ้างอิงสลิป | `payment_slip.trans_ref` | mono, '-' ถ้าอ่าน QR ไม่ได้ |  |
| แสดง | สลิปซ้ำ | `payment_slip.duplicate_of_slip_id` | badge แดง 'เคยใช้แล้ว' + ลิงก์สลิปเดิม |  |
| แสดง | ส่งเมื่อ | `payment_slip.created_at` | time ago |  |
| แสดง | คิวถูกกันถึง | `booking.hold_expires_at` | แสดงเมื่อมีค่า |  |

**ยืนยัน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ยอดที่เข้าจริง | `payment.amount_satang` | money input (prefill = ยอดที่ต้องจ่าย) | > 0 |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ยืนยัน (เงินเข้าแล้ว) | `slips.verify` | submitted | สลิปซ้ำ → dialog ยืนยันชั้นที่ 2 (confirmDuplicate) |
| ยืนยัน + อนุมัติจอง | `slips.verify (approveBooking=true)` | booking ต้องอนุมัติ |  |
| ปฏิเสธ | `slips.reject` | submitted | dialog เหตุผล (ลูกค้าเห็น) |


<a id="scr-C-08"></a>

### C-08

#### ลูกค้า

Route: `/console/customers` · สิทธิ์: OF · Stories: US-03-01, US-03-10  
จุดประสงค์: ค้นหา/ดูลูกค้าทั้งหมด  
โหลดข้อมูล: `customers.list`

**ค้นหา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ค้นหา | `owner_profile.first_name` | search (ชื่อ ชื่อเล่น เบอร์ ชื่อน้อง) | debounce 300ms, ≥ 2 ตัว |
| ตัวกรอง | เรียง | `customer.last_visit_at` | select ล่าสุด/ชื่อ/ใหม่ |  |

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `owner_profile.first_name` | ชื่อ + (ชื่อเล่น) |  |
| แสดง | เบอร์ | `owner_profile.phone_e164` | phone |  |
| แสดง | น้อง | `pet.name` | chips + ไอคอนชนิด |  |
| แสดง | มาล่าสุด | `customer.last_visit_at` | date |  |
| แสดง | จำนวนครั้ง | `customer.visit_count` | number |  |
| แสดง | ระดับ | `customer.reliability_level` | badge (override ถ้ามี) |  |
| แสดง | เครดิต | `customer.credit_balance_satang` | money ซ่อนถ้า 0 |  |
| แสดง | LINE | `calc: มี line_identity` | ไอคอน LINE |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| + เพิ่มลูกค้า | `—` |  | → C-10 |
| คลิกแถว | `—` |  | → C-09 |


<a id="scr-C-09"></a>

### C-09

#### ลูกค้า

Route: `/console/customers/[customerId]?tab=info|pets|timeline|packages|credit` · สิทธิ์: OF · Stories: US-03-01, US-03-08, US-03-09, US-07-05, US-10-05  
จุดประสงค์: ข้อมูลลูกค้าครบในหน้าเดียว  
โหลดข้อมูล: `customers.get`, `customers.timeline`, `customers.packages`

**หัว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `owner_profile.first_name` | h1 ชื่อ นามสกุล (ชื่อเล่น) |  |
| แสดง | เบอร์ | `owner_profile.phone_e164` | phone + ปุ่มโทร |  |
| แสดง | LINE | `line_identity.display_name` | รูป + ชื่อ + 'เป็นเพื่อน/ยังไม่เป็นเพื่อน' |  |
| แสดง | ระดับ | `customer.reliability_level` | badge + tooltip ที่มา (R-09) |  |
| แสดง | Blacklist | `customer.blacklisted` | แถบแดง + เหตุผล |  |
| แสดง | เครดิต | `customer.credit_balance_satang` | money |  |

**แท็บข้อมูล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | อีเมล | `owner_profile.email` | text |  |
| แสดง | วันเกิด | `owner_profile.birth_date` | date |  |
| แสดง | ที่อยู่ | `owner_profile.address_line` | รวม ตำบล อำเภอ จังหวัด รหัส |  |
| แสดง | ผู้ติดต่อฉุกเฉิน | `customer.emergency_contact_name` | ชื่อ + phone |  |
| แสดง | รู้จักร้านจาก | `customer.source_channel` | enum + referral_note |  |
| แสดง | ยินยอมใช้รูป | `customer.photo_consent` | enum badge |  |
| แสดง | ยกเว้นมัดจำ | `customer.deposit_exempt` | ใช่/ไม่ |  |
| แสดง | โน้ตภายใน | `customer.internal_note` | กล่องเหลือง 'ลูกค้าไม่เห็น' |  |
| แสดง | ยกเลิกกระชั้น/ไม่มา 12 เดือน | `customer.late_cancel_count_12m` | x / y (no_show_count_12m) |  |
| แสดง | มาครั้งแรก/ล่าสุด | `customer.first_visit_at` | date / date (last_visit_at) |  |

**แท็บน้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | การ์ดน้อง | `pet.name` | รูป + ชื่อ + พันธุ์ + อายุ (R-12) + น้ำหนัก + ป้าย + สถานะวัคซีน → C-11 |  |

**แท็บประวัติ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `calc: customers.timeline` | timeline ไอคอนตามประเภท + จำนวนเงิน |  |

**แท็บแพ็กเกจ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | แพ็กเกจ | `customer_package.status` | ชื่อ + น้อง + เหลือ x/y + หมดอายุ (date) |  |
| แสดง | ประวัติการใช้สิทธิ์ | `package_redemption.redeemed_at` | แถวย่อย: วันที่ + น้อง + ช่าง + เลขใบเสร็จ; reversed_at มีค่า → ขีดฆ่า 'ยกเลิก (void บิล)' |  |

**แท็บเครดิต**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยอดคงเหลือ | `customer.credit_balance_satang` | money |  |
| แสดง | ประวัติ | `credit_ledger.delta_satang` | ตาราง: เวลา, +/−money, เหตุผล (enum), อ้างอิง |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| แก้ไข | `—` |  | → C-10 |
| + เพิ่มน้อง | `pets.create` |  | dialog ฟอร์มน้อง (ฟิลด์เดียวกับ C-11 แท็บโปรไฟล์) |
| จองให้ลูกค้านี้ | `—` |  | → C-03 พร้อมลูกค้า |
| Blacklist | `customers.blacklist` | owner | dialog เหตุผล |
| กำหนดระดับเอง | `customers.reliabilityOverride` | owner | dialog 1–4/อัตโนมัติ + เหตุผล |
| ปรับเครดิต | `customers.credit` | owner | dialog +/− ยอด + เหตุผล |
| บันทึกคืนเงิน | `refunds.create` | OF | dialog |


<a id="scr-C-10"></a>

### C-10

#### ฟอร์มลูกค้า

Route: `/console/customers/new | /console/customers/[customerId]/edit` · สิทธิ์: OF · Stories: US-03-01  
จุดประสงค์: เพิ่ม/แก้ลูกค้า  
โหลดข้อมูล: `customers.get`

**ข้อมูลหลัก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `owner_profile.first_name` | text | บังคับ 1–60 |
| แสดง+แก้ | นามสกุล | `owner_profile.last_name` | text | ≤ 60 |
| แสดง+แก้ | ชื่อเล่น | `owner_profile.nickname` | text | ≤ 30 |
| แสดง+แก้ | เบอร์โทร | `owner_profile.phone_e164` | tel input แสดงแบบ 081-234-5678 | R-22; เบอร์ซ้ำ → แถบเตือน + ลิงก์ลูกค้าเดิม |
| แสดง+แก้ | อีเมล | `owner_profile.email` | email |  |
| แสดง+แก้ | วันเกิด | `owner_profile.birth_date` | date (พ.ศ.) |  |

**ที่อยู่**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ที่อยู่ | `owner_profile.address_line` | text |  |
| แสดง+แก้ | ตำบล/แขวง | `owner_profile.subdistrict` | autocomplete จากรหัสไปรษณีย์ |  |
| แสดง+แก้ | อำเภอ/เขต | `owner_profile.district` | autocomplete |  |
| แสดง+แก้ | จังหวัด | `owner_profile.province` | select 77 จังหวัด |  |
| แสดง+แก้ | รหัสไปรษณีย์ | `owner_profile.postal_code` | text 5 หลัก | ^\d{5}$ |

**ข้อมูลของร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รู้จักร้านจาก | `customer.source_channel` | select |  |
| แสดง+แก้ | รายละเอียด | `customer.referral_note` | text |  |
| แสดง+แก้ | ผู้ติดต่อฉุกเฉิน | `customer.emergency_contact_name` | text |  |
| แสดง+แก้ | เบอร์ฉุกเฉิน | `customer.emergency_contact_phone` | tel | R-22 |
| แสดง+แก้ | ยินยอมใช้รูปน้อง | `customer.photo_consent` | radio ยินยอม/ไม่ยินยอม/ยังไม่ถาม |  |
| แสดง+แก้ | ยกเว้นมัดจำ | `customer.deposit_exempt` | toggle | owner เท่านั้น |
| แสดง+แก้ | โน้ตภายใน | `customer.internal_note` | textarea | ≤ 2000 |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `customers.create / customers.update` |  | → C-09 |


<a id="scr-C-11"></a>

### C-11

#### น้อง

Route: `/console/pets/[petId]?tab=profile|grooming|health|vaccines|photos|weight` · สิทธิ์: OFS · Stories: US-03-02, US-03-03, US-03-04, US-03-05, US-03-06, US-03-07, US-03-11  
จุดประสงค์: โปรไฟล์น้องครบทุกมิติ  
โหลดข้อมูล: `pets.get`, `photos.list`

**แท็บโปรไฟล์ (ข้อมูลกลางของน้อง)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รูปโปรไฟล์ | `pet.profile_file_id` | image upload crop 1:1 | R-25 |
| แสดง+แก้ | ชื่อ | `pet.name` | text | บังคับ 1–40 |
| แสดง+แก้ | ชนิด | `pet.species` | segmented หมา/แมว/อื่นๆ | บังคับ |
| แสดง+แก้ | ระบุชนิด | `pet.species_other` | text | บังคับเมื่อ อื่นๆ |
| แสดง+แก้ | พันธุ์ | `pet.breed` | combobox รายการพันธุ์ + พิมพ์เอง |  |
| แสดง+แก้ | เพศ | `pet.sex` | segmented |  |
| แสดง+แก้ | วันเกิด | `pet.birth_date` | date | ≤ วันนี้ |
| แสดง+แก้ | อายุโดยประมาณ (เดือน) | `pet.age_estimate_months` | number | แสดงเมื่อไม่มีวันเกิด |
| แสดง+แก้ | ทำหมัน | `pet.neutered` | ใช่/ไม่/ไม่ทราบ |  |
| แสดง+แก้ | สี | `pet.color` | text |  |
| แสดง+แก้ | ไมโครชิป | `pet.microchip_no` | text | 15 หลัก |
| แสดง+แก้ | ประเภทขน | `pet.coat_type` | select + รูปตัวอย่าง | บังคับ (ใช้คิดราคา R-02) |
| แสดง | สถานะ | `pet.status` | enum badge |  |
| แสดง | อายุ | `calc: R-12 ageInMonths` | '2 ปี 6 เดือน' |  |

**แท็บกรูม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ทรงที่ชอบ | `pet_shop_profile.preferred_style` | text |  |
| แสดง+แก้ | เบอร์ใบมีด | `pet_shop_profile.blade_no` | text |  |
| แสดง+แก้ | แชมพูที่ใช้ได้ | `pet_shop_profile.shampoo_ok` | text |  |
| แสดง+แก้ | แชมพูที่ห้ามใช้ | `pet_shop_profile.shampoo_avoid` | text (แดง) |  |
| แสดง+แก้ | รูปทรงโปรด | `pet_shop_profile.favorite_style_photo_id` | เลือกจากคลังรูป |  |
| แสดง+แก้ | รอบกรูม (วัน) | `pet_shop_profile.groom_interval_days` | number | 7–180, ว่าง = อัตโนมัติ R-17 |
| แสดง | กรูมล่าสุด | `pet_shop_profile.last_groomed_at` | date |  |
| แสดง | ครบรอบถัดไป | `calc: R-17` | date + ที่มา |  |

**แท็บสุขภาพ & นิสัย**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | แพ้ | `pet_shop_profile.allergies` | textarea |  |
| แสดง+แก้ | โรคประจำตัว | `pet_shop_profile.conditions` | textarea |  |
| แสดง+แก้ | ยาที่ทานประจำ | `pet_shop_profile.medications` | textarea |  |
| แสดง+แก้ | คลินิกประจำ | `pet_shop_profile.vet_clinic_name` | text |  |
| แสดง+แก้ | เบอร์คลินิก | `pet_shop_profile.vet_clinic_phone` | tel | R-22 |
| แสดง+แก้ | ป้ายนิสัย | `pet_temperament_flag.flag` | multi-select chips + โน้ตต่อป้าย |  |
| แสดง+แก้ | โน้ตภายใน | `pet_shop_profile.internal_note` | textarea เหลือง 'ลูกค้าไม่เห็น' |  |
| แสดง+แก้ | โน้ตถึงลูกค้า | `pet_shop_profile.shared_note` | textarea ฟ้า 'ลูกค้าเห็นใน LINE' |  |

**แท็บวัคซีน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `pet_vaccination.vaccine_code` | ตาราง: ชื่อวัคซีน, วันที่ฉีด, หมดอายุ (แดงถ้าหมด/ใกล้หมด 30 วัน), สถานะ, ที่มา, รูปหลักฐาน |  |
| กรอก | เพิ่ม: วัคซีน | `pet_vaccination.vaccine_code` | select ตาม species |  |
| กรอก | วันที่ฉีด | `pet_vaccination.administered_on` | date |  |
| กรอก | หมดอายุ | `pet_vaccination.expires_on` | date (prefill + default_validity_months) |  |
| กรอก | รูปสมุดวัคซีน | `pet_vaccination.proof_file_id` | upload |  |

**แท็บรูป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | คลังรูป | `pet_photo.file_id` | grid + filter ก่อน/หลัง/ระหว่างพัก + วันที่ (taken_at) |  |
| แสดง | คำบรรยาย | `pet_photo.caption` | text |  |

**แท็บน้ำหนัก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | กราฟ | `pet_weight.weight_grams` | line chart ตาม measured_at |  |
| กรอก | เพิ่มน้ำหนัก | `pet_weight.weight_grams` | number กก. | 0.1–150 |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก (แต่ละแท็บ) | `pets.update / pets.updateShopProfile / pets.setFlags` | OF (staff แก้แท็บกรูม/สุขภาพได้) | toast |
| เพิ่มวัคซีน | `vaccinations.create` | OF |  |
| ยืนยัน/ปฏิเสธวัคซีน | `vaccinations.verify / vaccinations.reject` | status pending_review |  |
| เพิ่มรูป | `staff.uploadUrl → photos.add` |  |  |
| บันทึกน้ำหนัก | `pets.addWeight` |  |  |
| น้องจากไป / ย้ายบ้าน | `pets.setStatus` | OF | dialog ยืนยัน + ข้อความเห็นใจ; หยุดแจ้งเตือนทั้งหมด |


<a id="scr-C-12"></a>

### C-12

#### คำขอจับคู่บัญชี LINE

Route: `/console/link-requests` · สิทธิ์: OF · Stories: US-11-01  
จุดประสงค์: ยืนยันว่าลูกค้าที่สมัครใน LINE คือลูกค้าเดิม (กันคนอื่นใช้เบอร์)  
โหลดข้อมูล: `linkRequests.list`

**คำขอ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | LINE | `line_identity.display_name` | รูป + ชื่อ |  |
| แสดง | เบอร์ที่กรอก | `customer_link_request.phone_entered` | phone |  |
| แสดง | ลูกค้าเดิมที่ตรง | `owner_profile.first_name` | ชื่อ + น้อง + มาล่าสุด |  |
| แสดง | ขอเมื่อ | `customer_link_request.created_at` | date time |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ใช่ คนเดียวกัน | `linkRequests.approve` |  |  |
| ไม่ใช่ | `linkRequests.reject` |  |  |

- คำแนะนำบนหน้า: ทักแชทถามชื่อน้องหรือวันที่มาครั้งล่าสุดก่อนยืนยัน

<a id="scr-C-13"></a>

### C-13

#### Room map

Route: `/console/hotel?date=` · สิทธิ์: OFS · Stories: US-06-04  
จุดประสงค์: ผังห้องรายวัน ลากย้ายห้อง ตั้งสถานะทำความสะอาด  
โหลดข้อมูล: `roomMap.get`

**ตัวกรอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | วันที่ | `calc: date` | date picker |  |
| ตัวกรอง | โซน | `room_unit.zone` | select |  |

**การ์ดห้อง (grid ตาม zone/sort_order)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รหัสห้อง | `room_unit.code` | ตัวใหญ่ |  |
| แสดง | ประเภท | `room_type.name_th` | เล็ก |  |
| แสดง | สถานะห้อง | `room_unit.status` | เทาถ้า maintenance |  |
| แสดง | ทำความสะอาด | `room_unit.housekeeping` | ไอคอน 🧹 ถ้า dirty |  |
| แสดง | น้องที่พัก | `pet.name` | ชื่อ + รูป + ป้ายนิสัย |  |
| แสดง | เช็คเอาท์ | `stay.check_out_date` | date + 'ออกวันนี้' ส้ม |  |
| แสดง | เข้าวันนี้ | `calc: RoomMap.units.arrivingToday` | ป้ายเขียว |  |
| แสดง | จองถัดไป | `calc: RoomMap.units.nextArrivalDate` | date เล็ก |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ลากน้องไปห้องอื่น | `stays.changeRoom` | OF | ROOM_TAKEN → เด้งกลับ |
| สลับ สะอาด/ต้องทำความสะอาด | `roomUnits.housekeeping` |  |  |
| คลิกน้อง | `—` |  | → C-15 |


<a id="scr-C-14"></a>

### C-14

#### เข้า-ออกวันนี้

Route: `/console/hotel/today?date=` · สิทธิ์: OFS · Stories: US-06-12  
จุดประสงค์: รายชื่อเช็คอิน/เช็คเอาท์/พักอยู่  
โหลดข้อมูล: `stays.today`

**3 คอลัมน์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เข้า | `stay.check_in_date` | การ์ด: เวลาที่จะมา (expected_check_in_time), น้อง, ห้อง, ฟอร์มรับฝาก ✓/✗, ข้อตกลง ✓/✗, วัคซีน (R-11) ✓/⚠ |  |
| แสดง | ออก | `stay.check_out_date` | การ์ด: เวลารับ, น้อง, ห้อง, add-on, อาบน้ำก่อนกลับ (bundle) สถานะ |  |
| แสดง | พักอยู่ | `stay.status` | การ์ด: น้อง, ห้อง, คืนที่ x/y, งานค้าง |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เช็คอิน | `—` | status reserved | → C-15 ขั้นรับฝาก |
| เช็คเอาท์ | `—` | checked_in | → C-15 ขั้นเช็คเอาท์ |


<a id="scr-C-15"></a>

### C-15

#### การพัก

Route: `/console/stays/[stayId]?step=intake|checkin|stay|checkout` · สิทธิ์: OF · Stories: US-06-05, US-06-06, US-06-08, US-06-09, US-06-11  
จุดประสงค์: ทำทุกขั้นของการรับฝากในหน้าเดียว  
โหลดข้อมูล: `stays.get`

**หัว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง | `pet.name` | รูป + ชื่อ + ป้ายนิสัย + แพ้ |  |
| แสดง | ห้อง | `room_unit.code` | + ประเภท |  |
| แสดง | วันที่ | `stay.check_in_date` | date → date (nights คืน) |  |
| แสดง | สถานะ | `stay.status` | enum badge |  |
| แสดง | วัคซีน | `calc: R-11` | ✓ / รายการที่ขาด-หมดอายุ (แดง) |  |

**ฟอร์มรับฝาก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ยี่ห้ออาหาร | `stay_intake.food_brand` | text |  |
| แสดง+แก้ | ปริมาณ | `stay_intake.food_amount` | text | เช่น 1 ถ้วย |
| แสดง+แก้ | เวลาให้อาหาร | `stay_intake.feeding_times` | chips เวลา + เพิ่ม | 0–6 |
| แสดง+แก้ | เจ้าของเตรียมอาหารมา | `stay_intake.food_provided_by_owner` | toggle |  |
| แสดง+แก้ | พาเดินต่อวัน | `stay_intake.walks_per_day` | stepper 0–6 |  |
| แสดง+แก้ | สภาพร่างกายตอนรับ | `stay_intake.condition_note` | textarea |  |
| แสดง+แก้ | รูปสภาพตอนรับ | `stay_intake.condition_photo_ids` | upload ≤ 6 |  |
| แสดง+แก้ | ผู้ติดต่อฉุกเฉิน | `stay_intake.emergency_contact_name` | text | บังคับ |
| แสดง+แก้ | เบอร์ฉุกเฉิน | `stay_intake.emergency_contact_phone` | tel | บังคับ R-22 |
| แสดง+แก้ | คลินิก | `stay_intake.vet_clinic_name` | text |  |
| แสดง+แก้ | เบอร์คลินิก | `stay_intake.vet_clinic_phone` | tel |  |
| แสดง+แก้ | ยา: ชื่อ | `stay_medication.name` | แถวซ้ำได้ |  |
| แสดง+แก้ | ยา: ขนาด | `stay_medication.dose` | text |  |
| แสดง+แก้ | ยา: เวลา | `stay_medication.times` | chips เวลา | ≥ 1 |
| แสดง+แก้ | ยา: วิธีให้ | `stay_medication.instructions` | text |  |
| แสดง+แก้ | ของที่นำมา | `stay_belonging.item` | แถวซ้ำได้: ชื่อ + จำนวน (quantity) + รูป (photo_file_id) |  |

**ข้อตกลงรับฝาก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ข้อความ | `branch_policy.boarding_agreement_text` | กล่องเลื่อนอ่าน |  |
| กรอก | วงเงินพาไปหาหมอฉุกเฉิน | `consent_document.emergency_vet_limit_satang` | money input | ≥ 0 |
| กรอก | ชื่อผู้เซ็น | `consent_document.signer_name` | text | บังคับ |
| กรอก | ลายเซ็น | `consent_document.signature_file_id` | signature pad | บังคับ |

**เช็คอิน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้ำหนักวันเข้า | `stay.weight_grams_in` | number กก. |  |
| กรอก | เหตุผลข้ามการตรวจวัคซีน | `stay.vaccine_override_reason` | textarea (แสดงเมื่อ R-11 ไม่ผ่าน) | ≥ 3 — บันทึก audit |

**ระหว่างพัก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | งานวันนี้ | `care_task.title` | checklist + เวลา + ผู้ทำ |  |
| แสดง | Add-on | `stay_addon.name_snapshot` | list + จำนวน + money |  |
| แสดง | อัปเดตที่ส่งลูกค้า | `pet_photo.file_id` | grid รูป stay |  |
| แสดง+แก้ | วันเช็คเอาท์ | `stay.check_out_date` | date | ขยาย/ลด (R-28) |

**เช็คเอาท์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้ำหนักวันออก | `stay.weight_grams_out` | number กก. |  |
| กรอก | ของคืนครบ | `stay_belonging.returned_at` | checklist ของที่นำมา | ติ๊กครบ หรือใส่หมายเหตุ |
| แสดง | สรุปค่าใช้จ่าย | `calc: room_total + addons + bundle` | money → ปุ่มไปบิล |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกฟอร์ม | `stays.saveIntake` |  |  |
| เซ็นข้อตกลง | `stays.signAgreement` |  |  |
| เช็คอิน | `stays.checkIn` | reserved + ฟอร์มครบ + เซ็นแล้ว |  |
| เพิ่ม add-on | `stays.addAddon` |  |  |
| เปลี่ยนวัน | `stays.changeDates` |  |  |
| ส่งอัปเดตรูป | `stays.postUpdate` | checked_in |  |
| เช็คเอาท์ | `stays.checkOut` | checked_in | → C-18 บิล |
| ไม่มา | `stays.noShow` | reserved |  |
| ลบ add-on | `stays.removeAddon` | บิลยังไม่ปิด | ยืนยันก่อนลบ |
| ยกเลิกการพัก | `stays.cancel` | reserved | dialog เหตุผล + ผลเงิน R-07 |


<a id="scr-C-16"></a>

### C-16

#### งานดูแลรายวัน (มุมมองร้าน)

Route: `/console/hotel/tasks?date=` · สิทธิ์: OFS · Stories: US-06-09  
จุดประสงค์: ตารางงานดูแลทุกตัว  
โหลดข้อมูล: `careTasks.list`

**ตาราง (จัดกลุ่มตามเวลา)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `care_task.due_at` | time |  |
| แสดง | งาน | `care_task.title` | ไอคอนตาม task_type |  |
| แสดง | น้อง/ห้อง | `pet.name` | + room_unit.code |  |
| แสดง | สถานะ | `care_task.status` | checkbox; แดงถ้าเลยกำหนด 30 นาที |  |
| แสดง | ทำโดย/เมื่อ | `care_task.done_by` | ชื่อ + time (done_at) |  |
| แสดง | โน้ต | `care_task.note` |  |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ทำแล้ว | `careTasks.done` | pending |  |
| ข้าม | `careTasks.skip` | pending | เหตุผลบังคับ |


<a id="scr-C-17"></a>

### C-17

#### Daycare วันนี้

Route: `/console/daycare?date=` · สิทธิ์: OFS · Stories: US-06-13  
จุดประสงค์: เช็คอิน/เอาท์ Daycare  
โหลดข้อมูล: `daycare.list`

**รายการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง | `pet.name` | รูป + ป้าย |  |
| แสดง | รอบ | `daycare_session_type.name_th` |  |  |
| แสดง | สถานะ | `daycare_visit.status` | enum |  |
| แสดง | เข้า/ออก | `daycare_visit.checked_in_at` | time / time (checked_out_at) |  |
| แสดง | วัคซีน | `calc: R-11` | ✓/⚠ |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เช็คอิน | `daycare.check_in` | reserved |  |
| เช็คเอาท์ | `daycare.check_out` | checked_in |  |
| ไม่มา | `daycare.no_show` | reserved |  |
| ยกเลิก | `daycare.cancel` | reserved | dialog เหตุผล |


<a id="scr-C-18"></a>

### C-18

#### บิล (คิดเงิน)

Route: `/console/bills/[billId]` · สิทธิ์: OF · Stories: US-08-01, US-08-02, US-08-03, US-08-04, US-10-05, US-07-01  
จุดประสงค์: รวมทุกรายการ หักมัดจำ/เครดิต/แพ็กเกจ รับชำระ ปิดบิล  
โหลดข้อมูล: `bills.get`

**ลูกค้า**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `owner_profile.first_name` | ลิงก์ C-09 |  |
| แสดง | เครดิตคงเหลือ | `customer.credit_balance_satang` | money |  |
| แสดง | แพ็กเกจที่ใช้ได้ | `customer_package.sessions_used` | chips 'อาบน้ำ เหลือ 3' |  |

**รายการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `bill_line.description` | ชื่อ + ชื่อน้อง (pet_id) |  |
| แสดง | ประเภท | `bill_line.line_type` | ไอคอน |  |
| แสดง | จำนวน | `bill_line.quantity` | number |  |
| แสดง | ราคา/หน่วย | `bill_line.unit_price_satang` | money always |  |
| แสดง+แก้ | ส่วนลด | `bill_line.line_discount_satang` | money input + เหตุผล | R-15 |
| แสดง | รวม | `bill_line.line_total_satang` | money always |  |
| แสดง+แก้ | ช่าง | `bill_line.performer_id` | select (บรรทัดบริการ) |  |

**เพิ่มรายการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | สินค้า/บริการด่วน | `bill_line.description` | text + ราคา (unit_price_satang) + จำนวน |  |
| กรอก | ขายแพ็กเกจ | `bill_line.ref_id` | select package_template + น้อง |  |
| กรอก | ใช้สิทธิ์แพ็กเกจ | `bill_line.ref_id` | select customer_package ที่ R-14 ok |  |

**สรุป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รวม | `bill.subtotal_satang` | money always |  |
| แสดง+แก้ | ส่วนลดท้ายบิล | `bill.bill_discount_satang` | money + เหตุผล (bill_discount_reason) | R-15 front_desk ≤ 20% |
| แสดง | ยอดสุทธิ | `bill.total_satang` | money always ตัวใหญ่ |  |
| แสดง | ชำระแล้ว | `bill.paid_satang` | money |  |
| แสดง | ค้างชำระ | `calc: total − paid` | money แดง |  |
| แสดง | เงินทอน | `bill.change_satang` | money เขียว |  |

**การชำระ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการรับเงิน | `payment.method` | แถว: วิธี (enum), money, เลขอ้างอิง, เวลา, สถานะ |  |
| กรอก | วิธีรับเงิน | `payment.method` | ปุ่มใหญ่: เงินสด / PromptPay QR / โอน / บัตร / เครดิต |  |
| กรอก | รับเงินสด | `payment.tendered_satang` | money keypad + ปุ่มลัด ฿100 ฿500 ฿1000 พอดี | R-15 |
| กรอก | ยอด (วิธีอื่น) | `payment.amount_satang` | money (prefill = ค้าง) | ≤ ค้าง |
| กรอก | เลขอ้างอิง | `payment.reference` | text | บัตร: บังคับ |
| แสดง | QR PromptPay | `calc: R-30` | QR + ยอด + ชื่อบัญชี (เมื่อเลือก PromptPay) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เพิ่มรายการ | `bills.addLine` | status open | สินค้า/บริการด่วน, ขายแพ็กเกจ, ใช้สิทธิ์แพ็กเกจ (R-14) |
| แก้บรรทัด (ส่วนลด/ช่าง/จำนวน) | `bills.updateLine` | status open | ส่วนลดเกินสิทธิ์ role → DISCOUNT_LIMIT_EXCEEDED (R-15) |
| ลบบรรทัด | `bills.removeLine` | status open, เฉพาะ quick_item/package | บรรทัดจากบริการลบไม่ได้ (ต้องแก้ที่นัด) |
| ส่วนลดท้ายบิล | `bills.setDiscount` | status open | เหตุผลบังคับ |
| แสดง QR PromptPay | `bills.promptpayQr` | status open, ค้าง > 0, เลือกวิธี PromptPay | QR ยอดค้าง (R-30) — ลูกค้าโอนแล้วกด 'รับเงิน' วิธี promptpay |
| รับเงิน | `bills.addPayment` | status open, ค้าง > 0 | อัปเดตยอด; STALE_BILL → รีโหลด |
| ยกเลิกรายการรับเงิน | `bills.voidPayment` | open | เหตุผล |
| ปิดบิล | `bills.close` | ค้าง = 0 | → C-20 ใบเสร็จ + ส่ง LINE อัตโนมัติ |
| Void บิล | `bills.void` | owner, paid | dialog เหตุผล + สรุปผลกระทบ |

- หน้าจอใช้ได้บนแท็บเล็ต (ปุ่ม ≥ 44px)
- ห้ามคำนวณยอดเองฝั่ง client — แสดงค่าจาก server (ป้องกันยอดไม่ตรง)

<a id="scr-C-19"></a>

### C-19

#### รายการบิล

Route: `/console/bills?status=&date=` · สิทธิ์: OF · Stories: US-08-01, US-08-06  
จุดประสงค์: ดูบิลวันนี้/ค้นบิล  
โหลดข้อมูล: `bills.list`

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เลขใบเสร็จ | `bill.receipt_no` | mono ('—' ถ้ายัง open) |  |
| แสดง | ลูกค้า | `owner_profile.first_name` | text |  |
| แสดง | ยอด | `bill.total_satang` | money |  |
| แสดง | ชำระแล้ว | `bill.paid_satang` | money |  |
| แสดง | วิธีจ่าย | `payment.method` | ไอคอน |  |
| แสดง | สถานะ | `bill.status` | enum badge |  |
| แสดง | เวลา | `bill.closed_at` | time (หรือ opened_at) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| + บิลขายของ | `bills.open` |  | → C-18 (customerId ว่างได้) |


<a id="scr-C-20"></a>

### C-20

#### ใบเสร็จ (พิมพ์)

Route: `/console/bills/[billId]/receipt` · สิทธิ์: OF · Stories: US-08-05  
จุดประสงค์: ใบเสร็จรับเงินขนาด 58/80 มม. หรือ A5  
โหลดข้อมูล: `bills.receipt`

**ใบเสร็จ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | โลโก้/ชื่อร้าน/ที่อยู่/โทร | `branch.name` | หัวกระดาษ |  |
| แสดง | เลขที่ | `bill.receipt_no` |  |  |
| แสดง | วันที่ | `bill.closed_at` | date + time |  |
| แสดง | ลูกค้า | `calc: ชื่อ-นามสกุล` |  |  |
| แสดง | รายการ | `bill_line.description` | qty × ราคา = รวม (money always) |  |
| แสดง | ส่วนลด | `bill.bill_discount_satang` | money |  |
| แสดง | ยอดสุทธิ | `bill.total_satang` | money always ตัวหนา |  |
| แสดง | ชำระโดย | `payment.method` | วิธี + money |  |
| แสดง | เงินทอน | `bill.change_satang` | money |  |
| แสดง | แพ็กเกจคงเหลือ | `customer_package.sessions_used` | 'อาบน้ำ เหลือ 3 ครั้ง หมดอายุ …' |  |
| แสดง | ผู้รับเงิน | `staff_user.display_name` |  |  |
| แสดง | VOID | `bill.status` | ลายน้ำ 'ยกเลิก' เมื่อ void |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| พิมพ์ | `—` |  | window.print() + CSS @page 58mm/80mm/A5 ตาม SP-05 |
| ส่ง LINE อีกครั้ง | `bills.sendReceipt` | ลูกค้ามี LINE |  |

- หัวเอกสาร 'ใบเสร็จรับเงิน' (ไม่ใช่ใบกำกับภาษี)

<a id="scr-C-21"></a>

### C-21

#### Report card รอตรวจ

Route: `/console/report-cards` · สิทธิ์: OF · Stories: US-10-01  
จุดประสงค์: ตรวจก่อนส่งลูกค้า (เมื่อเปิด report_card_requires_review)  
โหลดข้อมูล: `reportCards.list`

**การ์ด**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง | `pet.name` | รูป after |  |
| แสดง | ช่าง | `staff_user.display_name` | text |  |
| แสดง | ผลตรวจ | `report_card.skin` | ป้าย ผิว/หู/เล็บ/ฟัน/ปรสิต (enum) |  |
| แสดง+แก้ | ข้อความถึงลูกค้า | `report_card.staff_note` | textarea | ≤ 500 |
| แสดง+แก้ | คำแนะนำ | `report_card.recommendation` | textarea |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `reportCards.update` |  |  |
| ส่งลูกค้า | `reportCards.approve` | pending_review |  |


<a id="scr-C-22"></a>

### C-22

#### ข้อความที่ไม่ได้ส่ง

Route: `/console/messages` · สิทธิ์: OF · Stories: US-13-06  
จุดประสงค์: ข้อความที่ระบบข้าม (โควตาหมด/ไม่ใช่เพื่อน/โหมดประหยัด) ให้ร้านส่งเองในแชท  
โหลดข้อมูล: `line.skipped`, `line.status`

**โควตา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ใช้ไป/โควตา | `calc: LineStatus.usedThisMonth` | progress bar (ส้ม ≥ 70%, แดง ≥ 90%) |  |
| แสดง | โหมดประหยัด | `branch_policy.economy_mode` | สถานะ + ลิงก์ไปตั้งค่า |  |

**รายการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ถึง | `calc: ชื่อลูกค้า` |  |  |
| แสดง | เรื่อง | `notification.template_key` | ป้ายภาษาไทยของ template |  |
| แสดง | เหตุผล | `notification.skip_reason` | enum |  |
| แสดง | ข้อความ | `calc: render template` | กล่องข้อความ + ปุ่มคัดลอก |  |
| แสดง | เวลา | `notification.created_at` | time ago |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| คัดลอกข้อความ | `—` |  | copy to clipboard แล้วเปิดแชท LINE OA Manager |


<a id="scr-C-23"></a>

### C-23

#### รายงานยอดขาย

Route: `/console/reports/sales` · สิทธิ์: O · Stories: US-12-02, US-12-06  
จุดประสงค์: ยอดขายตามวัน/บริการ/ช่าง/วิธีจ่าย  
โหลดข้อมูล: `reports.sales`

**ตัวกรอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ช่วงวันที่ | `calc: from/to` | date range + ปุ่มลัด วันนี้/7 วัน/เดือนนี้/เดือนก่อน | ≤ 366 วัน |
| ตัวกรอง | จัดกลุ่ม | `calc: groupBy` | segmented |  |

**ผล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยอดรวม/ส่วนลด/สุทธิ | `calc: SalesReport.totals` | การ์ด money |  |
| แสดง | กราฟ | `calc: SalesReport.rows` | bar chart ตามวัน |  |
| แสดง | ตาราง | `calc: SalesReport.rows` | key, จำนวนบิล, gross, discount, net (money) |  |
| แสดง | แยกวิธีจ่าย | `payment.method` | ตาราง money |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| Export CSV | `exports.csv` |  | ดาวน์โหลด bills.csv / bill_lines.csv |


<a id="scr-C-24"></a>

### C-24

#### รายงานค่ามือ

Route: `/console/reports/commissions` · สิทธิ์: O · Stories: US-12-03  
จุดประสงค์: สรุปค่ามือต่อช่าง  
โหลดข้อมูล: `reports.commissions`

**ตัวกรอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ช่วงวันที่ | `calc: from/to` | date range |  |

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ช่าง | `staff_user.display_name` | text |  |
| แสดง | จำนวนงาน | `calc: count` | number |  |
| แสดง | ยอดฐาน | `commission_entry.base_satang` | money |  |
| แสดง | ค่ามือ | `commission_entry.amount_satang` | money ตัวหนา |  |
| แสดง | รายละเอียด | `commission_entry.bill_line_id` | expand: วันที่, ใบเสร็จ, บริการ, ฐาน, กติกา, ยอด |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| Export CSV | `exports.csv` |  | commissions.csv |


<a id="scr-C-25"></a>

### C-25

#### Occupancy

Route: `/console/reports/occupancy` · สิทธิ์: O · Stories: US-12-04  
จุดประสงค์: อัตราเข้าพักรายวัน  
โหลดข้อมูล: `reports.occupancy`

**ผล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ช่วงวันที่ | `calc: from/to` | date range |  |
| แสดง | กราฟ | `calc: OccupancyReport.days` | line chart % |  |
| แสดง | ตามประเภทห้อง | `calc: OccupancyReport.byRoomType` | ตาราง |  |


<a id="scr-C-26"></a>

### C-26

#### Audit log

Route: `/console/settings/audit` · สิทธิ์: O · Stories: US-13-07  
จุดประสงค์: ดูการกระทำสำคัญย้อนหลัง  
โหลดข้อมูล: `audit.list`

**ตัวกรอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | การกระทำ | `audit_log.action` | select ป้ายภาษาไทย |  |
| ตัวกรอง | ช่วงวันที่ | `calc: from/to` | date range |  |

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `audit_log.created_at` | date time |  |
| แสดง | ผู้ทำ | `audit_log.actor_id` | ชื่อ + 'ผ่านทีมช่วยเหลือ' ถ้า support |  |
| แสดง | การกระทำ | `audit_log.action` | ป้ายไทย |  |
| แสดง | รายการ | `audit_log.entity_type` | ลิงก์ไปเอกสาร |  |
| แสดง | เหตุผล | `audit_log.reason` |  |  |
| แสดง | ก่อน/หลัง | `audit_log.before` | diff (after) |  |


<a id="scr-C-30"></a>

### C-30

#### ข้อมูลร้าน

Route: `/console/settings/shop` · สิทธิ์: O · Stories: US-02-01  
จุดประสงค์: ข้อมูลที่ลูกค้าเห็น  
โหลดข้อมูล: `branch.get`

**ร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อร้าน | `branch.name` | text | 1–80 |
| แสดง+แก้ | โลโก้ | `branch.logo_file_id` | upload crop 1:1 | R-25 |
| แสดง+แก้ | เบอร์โทร | `branch.phone` | tel | R-22 |
| แสดง+แก้ | Facebook | `branch.facebook_url` | url |  |
| แสดง+แก้ | Instagram | `branch.instagram_url` | url |  |
| แสดง | ลิงก์จอง | `branch.booking_slug` | copy URL /b/{slug} |  |

**ที่อยู่**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ที่อยู่ | `branch.address_line` | text |  |
| แสดง+แก้ | ตำบล/แขวง | `branch.subdistrict` | autocomplete |  |
| แสดง+แก้ | อำเภอ/เขต | `branch.district` | autocomplete |  |
| แสดง+แก้ | จังหวัด | `branch.province` | select |  |
| แสดง+แก้ | รหัสไปรษณีย์ | `branch.postal_code` | text | 5 หลัก |
| แสดง+แก้ | ตำแหน่งบนแผนที่ | `branch.latitude` | ปุ่ม 'ใช้ตำแหน่งปัจจุบัน' + ช่อง lat/lng (longitude) |  |

**ใบเสร็จ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | อักษรนำหน้าเลขใบเสร็จ | `branch.receipt_prefix` | text A-Z 1–3 |  |
| แสดง | ตัวอย่าง | `calc: R-16` | 'R69-00001' |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `branch.update` |  | toast |


<a id="scr-C-31"></a>

### C-31

#### เวลาเปิด-ปิดและวันหยุด

Route: `/console/settings/hours` · สิทธิ์: OF · Stories: US-02-01, US-02-05  
จุดประสงค์: ตั้งเวลาร้านและวันปิด  
โหลดข้อมูล: `branch.get`, `closures.list`

**เวลาเปิดรายสัปดาห์ (owner)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | วัน | `branch_hours.weekday` | แถว จ.–อา. |  |
| แสดง+แก้ | ปิดทั้งวัน | `branch_hours.is_closed` | toggle |  |
| แสดง+แก้ | เปิด | `branch_hours.opens_at` | time select ทีละ 30 นาที |  |
| แสดง+แก้ | ปิด | `branch_hours.closes_at` | time select | > เปิด |

**วันปิด/ช่วงพิเศษ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `branch_closure.starts_at` | ตาราง: ช่วงเวลา, ขอบเขต (scope enum), เหตุผล, ที่มา (source) |  |
| กรอก | เริ่ม | `branch_closure.starts_at` | date + time |  |
| กรอก | สิ้นสุด | `branch_closure.ends_at` | date + time | > เริ่ม |
| กรอก | ปิดเฉพาะ | `branch_closure.scope` | select ทั้งร้าน/กรูม/โรงแรม/Daycare |  |
| กรอก | เหตุผล | `branch_closure.reason` | text |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกเวลา | `branch.setHours` | owner | warnings → dialog รายการนัดที่ได้รับผล |
| เพิ่มวันปิด | `closures.create` |  | affected → dialog |
| ลบ | `closures.delete` |  |  |
| เพิ่มวันหยุดราชการ | `closures.importHolidays` | owner | dialog เลือกวันจาก public_holiday |


<a id="scr-C-32"></a>

### C-32

#### บริการที่เปิด

Route: `/console/settings/modules` · สิทธิ์: O · Stories: US-02-02  
จุดประสงค์: เปิด/ปิด กรูม · โรงแรม · Daycare  
โหลดข้อมูล: `branch.get`

**โมดูล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | กรูมมิ่ง | `branch.module_grooming` | toggle + คำอธิบาย |  |
| แสดง+แก้ | โรงแรม | `branch.module_hotel` | toggle |  |
| แสดง+แก้ | Daycare | `branch.module_daycare` | toggle |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `branch.setModules` |  | warnings ใบจองค้าง |


<a id="scr-C-33"></a>

### C-33

#### นโยบายร้าน

Route: `/console/settings/policy` · สิทธิ์: O · Stories: US-02-04, US-07-03, US-07-04, US-05-05, US-06-05, US-07-06, US-10-04, US-13-06, US-12-05  
จุดประสงค์: มัดจำ ยกเลิก การจอง วัคซีน ใบยินยอม การแจ้งเตือน  
โหลดข้อมูล: `branch.get`

**มัดจำ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ประเภทมัดจำ | `branch_policy.default_deposit_type` | radio ไม่เก็บ/จำนวนคงที่/เปอร์เซ็นต์ |  |
| แสดง+แก้ | ค่ามัดจำ | `branch_policy.default_deposit_value` | money input (fixed) หรือ % (percent) | fixed ≥ 0, percent 0–100 |
| แสดง | ตัวอย่าง | `calc: R-06 กับยอด ฿850` | 'ลูกค้าจ่ายมัดจำ ฿255' |  |

**ยกเลิก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | กรูม ยกเลิกฟรีก่อน (ชม.) | `branch_policy.grooming_free_cancel_hours` | number | 0–168 |
| แสดง+แก้ | โรงแรม (ชม.) | `branch_policy.hotel_free_cancel_hours` | number | 0–336 |
| แสดง+แก้ | Daycare (ชม.) | `branch_policy.daycare_free_cancel_hours` | number |  |
| แสดง+แก้ | ยกเลิกกระชั้น ริบ (%) | `branch_policy.late_cancel_forfeit_percent` | slider 0–100 step 10 |  |
| แสดง+แก้ | ส่วนที่ไม่ริบ คืนเป็น | `branch_policy.cancel_refund_mode` | radio เงินคืน/เครดิต/ให้ลูกค้าเลือก |  |
| แสดง+แก้ | ลูกค้าเลื่อน/ยกเลิกเองได้ถึง (ชม. ก่อนนัด) | `branch_policy.reschedule_cutoff_hours` | number |  |
| แสดง+แก้ | กด no-show ได้หลังเวลานัด (นาที) | `branch_policy.no_show_grace_minutes` | number |  |
| แสดง+แก้ | ข้อความนโยบายที่ลูกค้าเห็น | `branch_policy.policy_text` | textarea + ปุ่ม 'สร้างจากค่าข้างบน' | ≤ 2000 |

**การจอง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | จองออนไลน์ล่วงหน้าอย่างน้อย (นาที) | `branch_policy.booking_lead_minutes` | select 0/30/60/120/240/1440 |  |
| แสดง+แก้ | จองล่วงหน้าได้ไกลสุด (วัน) | `branch_policy.booking_horizon_days` | number | 1–180 |
| แสดง+แก้ | ช่วงเวลาเริ่มทุก | `branch_policy.slot_step_minutes` | select 5/10/15/30 |  |
| แสดง+แก้ | เวลาเผื่อทำความสะอาดหลังแต่ละคิว | `branch_policy.buffer_minutes` | number | 0–60 |
| แสดง+แก้ | รับคิวกรูมสูงสุดต่อวัน | `branch_policy.max_appointments_per_day` | number (ว่าง = ไม่จำกัด) |  |
| แสดง+แก้ | สูงสุดต่อช่างต่อวัน | `branch_policy.max_appointments_per_groomer_day` | number |  |
| แสดง+แก้ | เวลาให้ลูกค้าโอนมัดจำ (นาที) | `branch_policy.hold_minutes` | select 10/15/30/60 |  |
| แสดง+แก้ | ยืนยันอัตโนมัติ: กรูม | `branch_policy.auto_confirm_grooming` | toggle |  |
| แสดง+แก้ | ยืนยันอัตโนมัติ: โรงแรม | `branch_policy.auto_confirm_hotel` | toggle |  |
| แสดง+แก้ | ยืนยันอัตโนมัติ: Daycare | `branch_policy.auto_confirm_daycare` | toggle |  |
| แสดง+แก้ | เตือนร้านถ้ายังไม่อนุมัติภายใน (นาที) | `branch_policy.approval_timeout_minutes` | number |  |

**เงื่อนไขรับสัตว์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | วัคซีนที่ต้องมี (หมา) | `branch_policy.required_vaccines_dog` | multi-select vaccine_type |  |
| แสดง+แก้ | วัคซีนที่ต้องมี (แมว) | `branch_policy.required_vaccines_cat` | multi-select |  |
| แสดง+แก้ | ตรวจวัคซีนกับกรูมด้วย | `branch_policy.enforce_vaccines_grooming` | toggle |  |
| แสดง+แก้ | สายพันธุ์ที่ไม่รับ | `branch_policy.rejected_breeds` | tag input |  |
| แสดง+แก้ | น้ำหนักสูงสุดที่รับ (กก.) | `branch_policy.max_pet_weight_grams` | number กก. |  |

**เอกสาร**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ใบยินยอมก่อนกรูม | `branch_policy.grooming_consent_text` | textarea + ปุ่มใช้แม่แบบ |  |
| แสดง+แก้ | ข้อตกลงรับฝาก | `branch_policy.boarding_agreement_text` | textarea + แม่แบบ |  |

**หลังบริการ & ข้อความ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | เตือนลูกค้าก่อนนัด 24 ชม. | `branch_policy.reminder_24h_enabled` | toggle |  |
| แสดง+แก้ | โหมดประหยัดข้อความ LINE | `branch_policy.economy_mode` | toggle + อธิบายว่าข้อความไหนจะไม่ส่ง (template economy = skip) |  |
| แสดง+แก้ | รอบกรูมตั้งต้น (วัน) | `branch_policy.next_groom_default_days` | number | 7–180 |
| แสดง+แก้ | ลิงก์รีวิว Google | `branch_policy.google_review_url` | url |  |
| แสดง+แก้ | ตรวจ Report card ก่อนส่ง | `branch_policy.report_card_requires_review` | toggle |  |
| แสดง+แก้ | เวลาส่งสรุปรายวัน | `branch_policy.daily_summary_time` | time |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `branch.updatePolicy` |  | toast 'มีผลกับการจองใหม่เท่านั้น' |


<a id="scr-C-34"></a>

### C-34

#### บัญชีรับเงิน PromptPay

Route: `/console/settings/payment` · สิทธิ์: O · Stories: US-02-03, US-07-01  
จุดประสงค์: ตั้งบัญชีที่ลูกค้าโอนมัดจำ/ยอดค้าง  
โหลดข้อมูล: `branch.get`

**บัญชี**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ประเภท | `branch.promptpay_type` | radio เบอร์มือถือ/เลขบัตรประชาชน/เลขผู้เสียภาษี/e-Wallet |  |
| แสดง+แก้ | หมายเลข PromptPay | `branch.promptpay_id` | text (แสดงแบบปิดบัง) | R-30 |
| แสดง+แก้ | ชื่อบัญชี | `branch.promptpay_account_name` | text | บังคับ |
| กรอก | รหัสผ่านของคุณ (ยืนยัน) | `calc: ไม่บันทึก` | password | บังคับ |
| แสดง | QR ทดสอบ ฿1 | `calc: R-30 amount 100` | QR ให้ทดลองสแกน |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `branch.setPromptpay` |  | แจ้งเจ้าของร้านทุกคน |


<a id="scr-C-35"></a>

### C-35

#### LINE OA และลิงก์จอง

Route: `/console/settings/line` · สิทธิ์: O · Stories: US-02-06, US-02-07, US-13-06  
จุดประสงค์: สถานะการเชื่อม + QR โปสเตอร์ + โควตา  
โหลดข้อมูล: `line.status`

**สถานะ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | การเชื่อม | `line_channel.status` | enum badge + 'ทีมงานตั้งค่าให้' ถ้ายัง pending |  |
| แสดง | LINE ID | `line_channel.bot_basic_id` | @xxx |  |
| แสดง | โควตา push/เดือน | `line_channel.monthly_push_quota` | number |  |
| แสดง | ใช้ไปเดือนนี้ | `calc: LineStatus.usedThisMonth` | progress |  |

**ลิงก์และโปสเตอร์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ลิงก์จองใน LINE | `calc: LineStatus.liffUrl` | copy |  |
| แสดง | ลิงก์หน้าร้าน | `branch.booking_slug` | copy /b/{slug} |  |
| แสดง | QR โปสเตอร์ | `calc: QR ของ /b/{slug}` | พรีวิว A4/A5 + ปุ่มดาวน์โหลด PNG/PDF (สร้างฝั่ง client) |  |


<a id="scr-C-36"></a>

### C-36

#### พนักงานและตารางงาน

Route: `/console/settings/staff` · สิทธิ์: OF · Stories: US-01-04, US-09-01  
จุดประสงค์: เชิญพนักงาน กำหนดสิทธิ์ ตั้งเวลาทำงาน วันลา  
โหลดข้อมูล: `staffUsers.list`, `timeOff.list`

**รายชื่อ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `staff_user.display_name` | รูป + ชื่อ |  |
| แสดง | บทบาท | `staff_user.role` | enum |  |
| แสดง | เป็นช่าง | `staff_user.is_groomer` | ✓ |  |
| แสดง | สถานะ | `staff_user.status` | enum badge |  |
| แสดง | LINE | `calc: line linked` | ไอคอน |  |
| แสดง | เข้าล่าสุด | `staff_user.last_login_at` | time ago |  |

**เชิญ (owner)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ชื่อเล่น | `staff_user.display_name` | text | บังคับ |
| กรอก | อีเมล | `staff_user.email` | email | ไม่บังคับ |
| กรอก | บทบาท | `staff_user.role` | radio + คำอธิบายสิทธิ์ |  |
| กรอก | เป็นช่างกรูม | `staff_user.is_groomer` | toggle |  |

**ตารางงานรายสัปดาห์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | วันทำงาน | `staff_working_hours.weekday` | แถว จ.–อา. toggle |  |
| แสดง+แก้ | เริ่ม | `staff_working_hours.starts_at` | time |  |
| แสดง+แก้ | เลิก | `staff_working_hours.ends_at` | time | > เริ่ม |
| แสดง+แก้ | พัก | `staff_working_hours.break_starts_at` | time–time (break_ends_at) | อยู่ในช่วงทำงาน |

**วันลา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `staff_time_off.starts_at` | ช่วงเวลา + เหตุผล |  |
| กรอก | ช่วงลา | `staff_time_off.starts_at` | date-time range (ends_at) |  |
| กรอก | เหตุผล | `staff_time_off.reason` | text |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เชิญ | `staffUsers.invite` | owner | dialog แสดงลิงก์เชิญ + ปุ่มคัดลอก/ส่ง LINE |
| แก้ไข/ปิดใช้งาน | `staffUsers.update` | owner |  |
| ส่งคำเชิญใหม่ | `staffUsers.resendInvite` | owner, invited |  |
| บันทึกตารางงาน | `workingHours.set` |  | warnings |
| เพิ่มวันลา | `timeOff.create` |  | affected |
| ลบวันลา | `timeOff.delete` |  |  |


<a id="scr-C-37"></a>

### C-37

#### บริการและราคา

Route: `/console/settings/services?scope=grooming|hotel|daycare` · สิทธิ์: O · Stories: US-04-01, US-04-02, US-04-03, US-04-04, US-04-05, US-06-06  
จุดประสงค์: เมนูบริการ add-on ราคาตามขนาด/ขน เวลา ค่าบริการเพิ่ม  
โหลดข้อมูล: `services.list`, `sizeTiers.list`, `surchargeTypes.list`

**รายการบริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `service.name_th` | + ป้าย add-on |  |
| แสดง | หมวด | `service.category` | enum |  |
| แสดง | ราคาเริ่ม | `calc: min price` | money |  |
| แสดง | จองออนไลน์ | `service.online_bookable` | toggle inline |  |
| แสดง | สถานะ | `service.status` | enum |  |

**ฟอร์มบริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อบริการ | `service.name_th` | text | บังคับ |
| แสดง+แก้ | หมวด | `service.category` | select |  |
| แสดง+แก้ | คำอธิบาย | `service.description` | textarea |  |
| แสดง+แก้ | รูป | `service.photo_file_id` | upload |  |
| แสดง+แก้ | ชนิดสัตว์ที่รับ | `service.species_allowed` | multi-check (ว่าง = ทุกชนิด) |  |
| แสดง+แก้ | เป็น add-on | `service.is_addon` | toggle |  |
| แสดง+แก้ | คิดต่อวัน (โรงแรม) | `service.addon_per_day` | toggle | scope hotel |
| แสดง+แก้ | ใช้กับบริการหลัก | `service_addon_link.base_service_id` | multi-select | add-on เท่านั้น |
| แสดง+แก้ | ต้นทุนโดยประมาณ | `service.est_cost_satang` | money |  |
| แสดง+แก้ | ลำดับ | `service.sort_order` | drag handle |  |

**ตารางราคา (แถว = ขนาด, คอลัมน์ = ขนสั้น/ขนยาว หรือ 'ทุกแบบ')**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ราคา | `service_price.price_satang` | money cell | ≥ 0; ช่องว่าง = ไม่เปิดให้ขนาดนี้ |
| แสดง+แก้ | เวลา (นาที) | `service_price.duration_minutes` | number cell | 0–600 |
| แสดง+แก้ | แยกตามขน | `service_price.coat_group` | toggle ทั้งตาราง |  |

**ค่าบริการเพิ่มหน้างาน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `surcharge_type.name_th` | text |  |
| แสดง+แก้ | ราคาตั้งต้น | `surcharge_type.default_amount_satang` | money |  |
| แสดง+แก้ | ใช้งาน | `surcharge_type.status` | toggle |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกบริการ | `services.create / services.update` |  |  |
| บันทึกราคา | `services.setPrices` |  |  |
| บันทึก add-on link | `services.setAddonLinks` |  |  |
| บันทึกค่าบริการเพิ่ม | `surchargeTypes.upsert` |  |  |


<a id="scr-C-38"></a>

### C-38

#### ขนาดตามน้ำหนัก

Route: `/console/settings/size-tiers` · สิทธิ์: O · Stories: US-04-02  
จุดประสงค์: กำหนดช่วงน้ำหนัก S/M/L  
โหลดข้อมูล: `sizeTiers.list`

**แท็บหมา/แมว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รหัส | `size_tier.code` | text | A-Z 1–4 |
| แสดง+แก้ | ชื่อที่แสดง | `size_tier.label_th` | text |  |
| แสดง+แก้ | ตั้งแต่ (กก.) | `size_tier.min_weight_grams` | number กก. | แถวแรก 0; = ขอบบนแถวก่อน |
| แสดง+แก้ | ไม่ถึง (กก.) | `size_tier.max_weight_grams` | number กก. (แถวสุดท้ายว่าง) | > ตั้งแต่ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `sizeTiers.set` |  | SIZE_TIER_OVERLAP ไฮไลต์แถว |


<a id="scr-C-39"></a>

### C-39

#### ห้องพัก

Route: `/console/settings/rooms` · สิทธิ์: O · Stories: US-06-01, US-06-02  
จุดประสงค์: ประเภทห้อง เงื่อนไข ราคา และห้องรายยูนิต  
โหลดข้อมูล: `roomTypes.list`, `roomUnits.list`, `sizeTiers.list`

**ประเภทห้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `room_type.name_th` | text | บังคับ |
| แสดง+แก้ | คำอธิบาย | `room_type.description` | textarea |  |
| แสดง+แก้ | รูป | `room_type.photo_file_id` | upload |  |
| แสดง+แก้ | ชนิดสัตว์ | `room_type.species_allowed` | multi-check |  |
| แสดง+แก้ | น้ำหนักสูงสุด (กก.) | `room_type.max_weight_grams` | number |  |
| แสดง+แก้ | อายุขั้นต่ำ (เดือน) | `room_type.min_age_months` | number |  |
| แสดง+แก้ | รับติดสัด | `room_type.allow_in_heat` | toggle |  |
| แสดง+แก้ | รับน้องดุ/ไม่ถูกกับตัวอื่น | `room_type.allow_reactive` | toggle |  |
| แสดง+แก้ | สิ่งอำนวยความสะดวก | `room_type.amenities` | chips |  |
| แสดง+แก้ | รวมในราคา | `room_type.included_text` | textarea |  |
| แสดง+แก้ | จองออนไลน์ | `room_type.online_bookable` | toggle |  |
| แสดง+แก้ | ใช้งาน | `room_type.status` | toggle |  |

**ราคาต่อคืน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ทุกขนาด / ตามขนาด | `room_rate.size_tier_id` | toggle แยกตามขนาด |  |
| แสดง+แก้ | ราคา/คืน | `room_rate.nightly_price_satang` | money ต่อแถว | ≥ 0 |

**ห้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รหัสห้อง | `room_unit.code` | text | ไม่ซ้ำ |
| แสดง+แก้ | ประเภท | `room_unit.room_type_id` | select |  |
| แสดง+แก้ | โซน | `room_unit.zone` | text |  |
| แสดง+แก้ | สถานะ | `room_unit.status` | select ใช้งาน/ซ่อม/เลิกใช้ |  |
| แสดง+แก้ | ลำดับ | `room_unit.sort_order` | drag |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกประเภท | `roomTypes.create / roomTypes.update` |  |  |
| บันทึกราคา | `roomTypes.setRates` |  |  |
| บันทึกห้อง | `roomUnits.upsert` |  | IN_USE/CODE_TAKEN |


<a id="scr-C-40"></a>

### C-40

#### Daycare

Route: `/console/settings/daycare` · สิทธิ์: O · Stories: US-06-13  
จุดประสงค์: รอบ ความจุ ราคา  
โหลดข้อมูล: `daycareTypes.list`, `sizeTiers.list`

**รอบ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รอบ | `daycare_session_type.session` | fixed: เต็มวัน/เช้า/บ่าย |  |
| แสดง+แก้ | ชื่อ | `daycare_session_type.name_th` | text |  |
| แสดง+แก้ | เวลา | `daycare_session_type.starts_at` | time–time (ends_at) |  |
| แสดง+แก้ | รับได้ (ตัว) | `daycare_session_type.capacity` | number | 1–200 |
| แสดง+แก้ | ใช้งาน | `daycare_session_type.status` | toggle |  |
| แสดง+แก้ | ราคา | `daycare_rate.price_satang` | money ต่อขนาด (size_tier_id) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `daycareTypes.upsert` |  |  |


<a id="scr-C-41"></a>

### C-41

#### แพ็กเกจ

Route: `/console/settings/packages` · สิทธิ์: O · Stories: US-10-05  
จุดประสงค์: แพ็กเกจหลายครั้งที่ขาย  
โหลดข้อมูล: `packageTemplates.list`, `services.list`

**แพ็กเกจ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `package_template.name_th` | text |  |
| แสดง+แก้ | บริการ | `package_template.service_id` | select |  |
| แสดง+แก้ | ขนาด | `package_template.size_tier_id` | select (ทุกขนาด) |  |
| แสดง+แก้ | จำนวนครั้ง | `package_template.sessions_count` | number | 2–50 |
| แสดง+แก้ | ราคา | `package_template.price_satang` | money | > 0 |
| แสดง | ตกครั้งละ | `calc: R-14 unitValue` | money |  |
| แสดง+แก้ | อายุ (วัน) | `package_template.validity_days` | number | 1–730 |
| แสดง+แก้ | ใช้ร่วมกัน | `package_template.share_scope` | radio น้องตัวเดียว/ทุกตัวในบ้าน |  |
| แสดง+แก้ | ขายอยู่ | `package_template.status` | toggle |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `packageTemplates.upsert` |  |  |


<a id="scr-C-42"></a>

### C-42

#### ค่ามือ

Route: `/console/settings/commissions` · สิทธิ์: O · Stories: US-09-02  
จุดประสงค์: กติกาค่ามือ (เจาะจงชนะกว้าง)  
โหลดข้อมูล: `commissionRules.list`, `services.list`, `staffUsers.list`

**กติกา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | บริการ | `commission_rule.service_id` | select (ทุกบริการ) |  |
| แสดง+แก้ | ช่าง | `commission_rule.staff_user_id` | select (ทุกคน) |  |
| แสดง+แก้ | แบบ | `commission_rule.type` | segmented % / บาท |  |
| แสดง+แก้ | ค่า | `commission_rule.value` | % (2 ตำแหน่ง → bps) หรือ money |  |
| แสดง | ลำดับที่ใช้ | `calc: R-13 precedence` | คำอธิบายใต้ตาราง |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `commissionRules.set` |  |  |


<a id="scr-C-43"></a>

### C-43

#### โต๊ะกรูม

Route: `/console/settings/stations` · สิทธิ์: O · Stories: US-05-01  
จุดประสงค์: จำนวนโต๊ะ = คิวพร้อมกันสูงสุด  
โหลดข้อมูล: `stations.list`

**โต๊ะ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `groom_station.name` | text |  |
| แสดง+แก้ | ลำดับ | `groom_station.sort_order` | drag |  |
| แสดง+แก้ | ใช้งาน | `groom_station.status` | toggle |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `stations.upsert` |  |  |


<a id="scr-C-44"></a>

### C-44

#### นำเข้าข้อมูล CSV

Route: `/console/settings/import` · สิทธิ์: O · Stories: US-02-08  
จุดประสงค์: ย้ายข้อมูลลูกค้า/น้อง/บริการจากระบบเดิม  
โหลดข้อมูล: `imports.get`

**ขั้นที่ 1**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ชนิดข้อมูล | `import_job.kind` | radio ลูกค้า-น้อง / บริการ |  |
| แสดง | ไฟล์ตัวอย่าง | `calc: template CSV` | ปุ่มดาวน์โหลด |  |
| กรอก | ไฟล์ | `import_job.file_id` | upload .csv | R-25 |

**ขั้นที่ 2 ผลตรวจ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ทั้งหมด/ถูก/ผิด | `import_job.total_rows` | 3 ตัวเลข (valid_rows, error_rows) |  |
| แสดง | รายการผิด | `import_job.errors` | ตาราง แถว, คอลัมน์, ข้อความ |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ตรวจไฟล์ | `imports.create` |  |  |
| นำเข้า | `imports.commit` | error_rows = 0 | toast จำนวนที่นำเข้า |


<a id="scr-C-45"></a>

### C-45

#### บัญชีของฉัน

Route: `/console/account` · สิทธิ์: OFS · Stories: US-01-05, US-13-05, US-01-03  
จุดประสงค์: อุปกรณ์ที่ล็อกอิน แจ้งเตือน และ LINE  
โหลดข้อมูล: `auth.me`, `staffMe.sessions`

**โปรไฟล์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อ | `staff_user.display_name` | text |  |
| แสดง | อีเมล | `staff_user.email` | text |  |
| แสดง | บทบาท | `staff_user.role` | enum |  |

**อุปกรณ์**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `session.user_agent` | ชื่ออุปกรณ์ + last_seen_at + 'เครื่องนี้' |  |

**แจ้งเตือน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | เปิดแจ้งเตือนบนเครื่องนี้ | `web_push_subscription.endpoint` | ปุ่ม (ขอ permission → subscribe) | iOS ต้อง Add to Home Screen ก่อน (คู่มือ SP-04) |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ออกจากระบบเครื่องอื่น | `staffMe.revokeSession` |  |  |
| เปิดแจ้งเตือน | `staffMe.pushSubscribe` |  |  |
| ปิดแจ้งเตือนเครื่องนี้ | `staffMe.pushUnsubscribe` | มี subscription ของเครื่องนี้ |  |
| ผูก LINE | `staffMe.linkLine` |  |  |


<a id="scr-C-46"></a>

### C-46

#### แจ้งปัญหา / ขอ feature

Route: `(ปุ่มลอยทุกหน้า)` · สิทธิ์: OFS · Stories: US-13-13  
จุดประสงค์: ส่ง feedback พร้อมภาพหน้าจอ  
โหลดข้อมูล: —

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | เล่าปัญหา/สิ่งที่อยากได้ | `feedback_report.message` | textarea | 5–2000 |
| กรอก | ภาพหน้าจอ | `feedback_report.screenshot_file_id` | แนบ (ไม่บังคับ) |  |
| แสดง | หน้าปัจจุบัน | `feedback_report.page_url` | auto |  |
| แสดง | เวอร์ชัน | `feedback_report.app_version` | auto |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่ง | `feedback.create` |  | toast ขอบคุณ |


## Staff app (PWA มือถือ) — ช่าง/ผู้ดูแล


<a id="scr-S-01"></a>

### S-01

#### คิวของฉันวันนี้

Route: `/staff` · สิทธิ์: OFS · Stories: US-09-03  
จุดประสงค์: ช่างเห็นงานของตัวเองเรียงตามเวลา  
โหลดข้อมูล: `groom.myQueue`

**การ์ดคิว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `groom_appointment.starts_at` | time ตัวใหญ่ |  |
| แสดง | น้อง | `pet.name` | รูป + ชื่อ + พันธุ์ |  |
| แสดง | ป้ายนิสัย | `pet_temperament_flag.flag` | ไอคอนแดงเด่น |  |
| แสดง | บริการ | `groom_appointment_item.name_snapshot` | list |  |
| แสดง | สถานะ | `groom_appointment.status` | สีการ์ด |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| แตะการ์ด | `—` |  | → S-02 |

- ดึงลงเพื่อรีเฟรช; ทำงาน offline อ่านอย่างเดียว (cache ล่าสุด)

<a id="scr-S-02"></a>

### S-02

#### Job card

Route: `/staff/appointments/[appointmentId]` · สิทธิ์: OFS · Stories: US-05-07, US-09-03, US-13-04  
จุดประสงค์: ข้อมูลที่ช่างต้องรู้ + ถ่ายรูปก่อน/หลัง + เริ่ม/เสร็จ  
โหลดข้อมูล: `groom.jobCard`

**สำคัญ (บนสุด)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ป้ายนิสัย | `pet_temperament_flag.flag` | แถบแดง + note |  |
| แสดง | แพ้ | `pet_shop_profile.allergies` | แดง |  |
| แสดง | ห้ามใช้แชมพู | `pet_shop_profile.shampoo_avoid` | แดง |  |
| แสดง | โรคประจำตัว | `pet_shop_profile.conditions` | ส้ม |  |

**งาน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | บริการ + add-on | `groom_appointment_item.name_snapshot` | checklist |  |
| แสดง | ทรงที่ชอบ | `pet_shop_profile.preferred_style` |  |  |
| แสดง | เบอร์ใบมีด | `pet_shop_profile.blade_no` |  |  |
| แสดง | แชมพูที่ใช้ได้ | `pet_shop_profile.shampoo_ok` |  |  |
| แสดง | รูปทรงโปรด | `pet_shop_profile.favorite_style_photo_id` | รูปใหญ่ |  |
| แสดง | โน้ตร้าน | `pet_shop_profile.internal_note` |  |  |
| แสดง | โน้ตลูกค้า | `booking.customer_note` |  |  |
| แสดง | สภาพตอนรับ | `groom_appointment.condition_flags` | ป้าย + condition_note |  |
| แสดง | น้ำหนักวันนี้ | `groom_appointment.weight_grams_checkin` | weight |  |
| แสดง | ครั้งก่อน | `calc: JobCard.lastVisit` | รูป after ครั้งก่อน + โน้ตช่าง |  |

**รูป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | รูปก่อนทำ | `pet_photo.file_id` | กล้อง (ย่อรูป R-25) kind before | แนะนำ ≥ 1 |
| กรอก | รูปหลังทำ | `pet_photo.file_id` | กล้อง kind after | ≥ 1 ก่อนกดเสร็จ ถ้า photo_consent ≠ denied |

**ปิดงาน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | โน้ตถึงร้าน | `groom_appointment.staff_note` | textarea | ≤ 1000 |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เริ่มงาน | `groom.start` | checked_in |  |
| ถ่ายรูป | `staff.uploadUrl → photos.add` |  | ย่อรูปฝั่ง client ก่อนอัปโหลด (R-25) |
| เสร็จงาน | `groom.finish` | in_progress | → S-03 Report card |
| แจ้งลูกค้ามารับ | `groom.notifyPickup` | role owner/front_desk, status done | ซ่อนปุ่มสำหรับ role staff |


<a id="scr-S-03"></a>

### S-03

#### Report card

Route: `/staff/report-cards/[reportCardId]` · สิทธิ์: OFS · Stories: US-10-01, US-10-02  
จุดประสงค์: ช่างกรอกผลตรวจสั้น ๆ ภายใน 1 นาที  
โหลดข้อมูล: `reportCards.get`

**ผลตรวจ (ปุ่มใหญ่แตะเลือก)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ผิวหนัง | `report_card.skin` | segmented ปกติ/แห้ง/แดง/มีแผล | grooming บังคับ |
| แสดง+แก้ | หู | `report_card.ears` | segmented |  |
| แสดง+แก้ | เล็บ | `report_card.nails` | segmented |  |
| แสดง+แก้ | ฟัน | `report_card.teeth` | segmented |  |
| แสดง+แก้ | เห็บหมัด | `report_card.parasites` | segmented |  |
| แสดง+แก้ | ความร่วมมือ | `report_card.cooperation` | ดาว 1–5 |  |

**ข้อความ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ถึงเจ้าของ | `report_card.staff_note` | textarea + คำแนะนำสำเร็จรูป (chips) | ≤ 500 |
| แสดง+แก้ | คำแนะนำ | `report_card.recommendation` | textarea | ≤ 300 |

**พรีวิว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รูปก่อน/หลัง | `pet_photo.file_id` | 2 รูป side-by-side |  |
| แสดง | รอบถัดไป | `calc: R-17` | date |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `reportCards.update` |  |  |
| ส่ง | `reportCards.submit` | draft | → S-01 + toast 'ส่งแล้ว' หรือ 'รอหน้าร้านตรวจ' |


<a id="scr-S-04"></a>

### S-04

#### งานดูแลวันนี้

Route: `/staff/care` · สิทธิ์: OFS · Stories: US-06-09  
จุดประสงค์: checklist งานโรงแรมตามเวลา  
โหลดข้อมูล: `careTasks.list`

**ตามเวลา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เวลา | `care_task.due_at` | time; แดงถ้าเลย 30 นาที |  |
| แสดง | งาน | `care_task.title` | ไอคอน + ชื่อยา/ขนาด (medication) |  |
| แสดง | น้อง/ห้อง | `pet.name` | + room_unit.code |  |
| กรอก | โน้ต | `care_task.note` | chips ด่วน 'กินหมด/เหลือครึ่ง/ไม่กิน' + text |  |
| กรอก | รูป | `care_task.photo_file_id` | กล้อง (ไม่บังคับ) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ทำแล้ว | `careTasks.done` | pending |  |
| ข้าม | `careTasks.skip` | pending | เหตุผล |


<a id="scr-S-05"></a>

### S-05

#### ส่งอัปเดตน้อง

Route: `/staff/stays/[stayId]/update` · สิทธิ์: OFS · Stories: US-06-10  
จุดประสงค์: ถ่ายรูป/วิดีโอส่งเจ้าของ  
โหลดข้อมูล: `stays.get`

**อัปเดต**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง/ห้อง | `pet.name` | + room_unit.code |  |
| กรอก | รูป/วิดีโอ | `pet_photo.file_id` | กล้อง 1–6 ไฟล์ (วิดีโอ ≤ 30 วิ) | R-25 |
| กรอก | ข้อความ | `pet_photo.caption` | text + chips สำเร็จรูป | ≤ 200 |
| แสดง | ส่งวันนี้แล้ว | `calc: มี notification stay_update วันนี้` | แจ้ง 'ลูกค้าจะเห็นในหน้าเดิม ไม่ส่งข้อความซ้ำ' |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่ง | `stays.postUpdate` | checked_in |  |


<a id="scr-S-06"></a>

### S-06

#### ค่ามือของฉัน

Route: `/staff/me/commissions` · สิทธิ์: OFS · Stories: US-09-05  
จุดประสงค์: ดูค่ามือสะสม  
โหลดข้อมูล: `staffMe.commissions`

**สรุป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | ช่วง | `calc: from/to` | segmented วันนี้/สัปดาห์/เดือนนี้ |  |
| แสดง | รวม | `commission_entry.amount_satang` | money ตัวใหญ่ |  |
| แสดง | รายการ | `commission_entry.base_satang` | วันที่, น้อง, บริการ, money |  |


<a id="scr-S-07"></a>

### S-07

#### ฉัน

Route: `/staff/me` · สิทธิ์: OFS · Stories: US-09-04, US-01-03  
จุดประสงค์: ตั้งค่าแจ้งเตือนและ LINE บนมือถือ  
โหลดข้อมูล: `auth.me`

**ตั้งค่า**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | แจ้งเตือน | `web_push_subscription.endpoint` | ปุ่มเปิด + สถานะ |  |
| แสดง | LINE | `calc: lineLinked` | ผูกแล้ว/ปุ่มผูก |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เปิดแจ้งเตือน | `staffMe.pushSubscribe` |  |  |
| ปิดแจ้งเตือน | `staffMe.pushUnsubscribe` |  |  |
| ผูก LINE | `staffMe.linkLine` |  |  |
| ออกจากระบบ | `auth.staffLogout` |  |  |


## LIFF ลูกค้า (ใน LINE)


<a id="scr-L-01"></a>

### L-01

#### ลงทะเบียน

Route: `/liff/[branchSlug]/register` · สิทธิ์: customer · Stories: US-01-01, US-11-01, US-13-08, US-03-12  
จุดประสงค์: ครั้งแรกที่เปิด LINE ของร้าน  
โหลดข้อมูล: `liff.session`, `liff.shop`

**ต้อนรับ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | โลโก้/ชื่อร้าน | `branch.name` | header |  |
| แสดง | รูป/ชื่อ LINE | `line_identity.display_name` | avatar |  |

**ข้อมูล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ชื่อ | `owner_profile.first_name` | text (prefill จากชื่อ LINE) | บังคับ |
| กรอก | นามสกุล | `owner_profile.last_name` | text |  |
| กรอก | ชื่อเล่น | `owner_profile.nickname` | text |  |
| กรอก | เบอร์โทร | `owner_profile.phone_e164` | tel inputmode=numeric | บังคับ R-22 |

**ความยินยอม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ยอมรับนโยบายความเป็นส่วนตัว | `consent_record.accepted` | checkbox + ลิงก์อ่านฉบับเต็ม (privacy_notice) | บังคับ |
| กรอก | ยอมรับเงื่อนไขการใช้บริการ | `consent_record.accepted` | checkbox (terms_of_service) | บังคับ |
| กรอก | ยินยอมให้ร้านใช้รูปน้อง | `customer.photo_consent` | toggle (ไม่บังคับ) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เริ่มใช้งาน | `liff.register` |  | → L-02; มีคำขอจับคู่ → ข้อความ 'ร้านกำลังตรวจสอบประวัติเดิมของคุณ' |


<a id="scr-L-02"></a>

### L-02

#### หน้าแรก

Route: `/liff/[branchSlug]` · สิทธิ์: customer · Stories: US-11-03, US-11-08  
จุดประสงค์: เมนูหลักใน LINE  
โหลดข้อมูล: `liff.shop`, `liff.bookings`

**ร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ชื่อร้าน | `branch.name` | header |  |
| แสดง | เวลาเปิดวันนี้ | `branch_hours.opens_at` | 'เปิด 09:00–18:00' |  |

**นัดถัดไป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | การ์ด | `booking.first_service_at` | date time + น้อง + สถานะ + ปุ่ม 'จ่ายมัดจำ' ถ้าค้าง |  |

**เมนู**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | จองกรูม | `branch.module_grooming` | ปุ่ม (แสดงเมื่อเปิดโมดูล) |  |
| แสดง | จองโรงแรม | `branch.module_hotel` | ปุ่ม |  |
| แสดง | จอง Daycare | `branch.module_daycare` | ปุ่ม |  |
| แสดง | นัดของฉัน / น้องของฉัน / แพ็กเกจ / โปรไฟล์ | `calc: links` | ไอคอน |  |


<a id="scr-L-03"></a>

### L-03

#### น้องของฉัน

Route: `/liff/[branchSlug]/pets | /liff/[branchSlug]/pets/new | /liff/[branchSlug]/pets/[petId]` · สิทธิ์: customer · Stories: US-11-02, US-06-05  
จุดประสงค์: ดู/เพิ่ม/แก้ข้อมูลน้อง + ส่งวัคซีน  
โหลดข้อมูล: `liff.pets`

**รายการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | การ์ดน้อง | `pet.name` | รูป + ชื่อ + พันธุ์ + อายุ + วัคซีนใกล้หมด (แดง) |  |

**ฟอร์มน้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | รูป | `pet.profile_file_id` | upload |  |
| แสดง+แก้ | ชื่อ | `pet.name` | text | บังคับ |
| แสดง+แก้ | ชนิด | `pet.species` | การ์ดเลือก หมา/แมว/อื่นๆ | บังคับ |
| แสดง+แก้ | พันธุ์ | `pet.breed` | combobox ค้นหา |  |
| แสดง+แก้ | เพศ | `pet.sex` | segmented | บังคับ |
| แสดง+แก้ | วันเกิด | `pet.birth_date` | date (หรือ 'ไม่ทราบ' → อายุโดยประมาณ) |  |
| แสดง+แก้ | อายุโดยประมาณ | `pet.age_estimate_months` | ปี + เดือน |  |
| แสดง+แก้ | ทำหมัน | `pet.neutered` | ใช่/ไม่/ไม่ทราบ |  |
| แสดง+แก้ | ประเภทขน | `pet.coat_type` | การ์ดพร้อมรูปตัวอย่าง | บังคับ |
| กรอก | น้ำหนักล่าสุด (กก.) | `pet_weight.weight_grams` | number | ไม่บังคับ |

**โน้ตจากร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | โน้ต | `pet_shop_profile.shared_note` | กล่องฟ้า (เฉพาะ shared_note) |  |

**วัคซีน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รายการ | `pet_vaccination.vaccine_code` | ชื่อ + หมดอายุ + สถานะ (รอร้านตรวจ/ยืนยันแล้ว/ไม่ผ่าน+เหตุผล) |  |
| กรอก | เพิ่ม: วัคซีน | `pet_vaccination.vaccine_code` | select |  |
| กรอก | หมดอายุ | `pet_vaccination.expires_on` | date | บังคับ |
| กรอก | รูปสมุดวัคซีน | `pet_vaccination.proof_file_id` | กล้อง/อัลบั้ม | บังคับ |

**รูป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รูปก่อน-หลังจากร้าน | `pet_photo.file_id` | grid (เฉพาะ kind before/after/stay) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `liff.createPet / liff.updatePet` |  |  |
| ส่งวัคซีน | `customer.uploadUrl → liff.addVaccination` |  | อัปโหลดรูปสมุดวัคซีนก่อน (R-25) แล้วส่ง; toast 'ร้านจะตรวจสอบ' |


<a id="scr-L-04"></a>

### L-04

#### จองกรูม

Route: `/liff/[branchSlug]/book/grooming` · สิทธิ์: customer · Stories: US-11-03  
จุดประสงค์: 4 ขั้น: น้อง → บริการ → วันเวลา → ยืนยัน  
โหลดข้อมูล: `liff.shop`, `liff.pets`, `liff.groomSlots`, `liff.quote`

**1. น้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | เลือกน้อง | `groom_appointment.pet_id` | การ์ดน้อง (หลายตัวได้) | pet active |
| กรอก | ขนาด (ถ้าไม่รู้น้ำหนัก) | `groom_appointment.size_tier_id` | การ์ดขนาด + ช่วง กก. | แสดงเมื่อ no_weight |

**2. บริการ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | บริการหลัก | `groom_appointment_item.service_id` | การ์ด + รูป + ราคาของน้องตัวนี้ (R-02) + เวลา | ≥ 1; online_bookable |
| กรอก | Add-on | `groom_appointment_item.service_id` | checkbox + ราคา |  |

**3. วันเวลา**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | วันที่ | `calc: date` | แถบวัน 14 วัน (ปิดวันที่ร้านปิด) | R-04 horizon |
| กรอก | ช่าง | `groom_appointment.groomer_id` | avatar ช่าง + 'ใครก็ได้' |  |
| กรอก | เวลา | `groom_appointment.starts_at` | grid ปุ่มเวลา (R-04) | ว่าง → 'วันนี้เต็ม ลองวันอื่น' |

**4. ยืนยัน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | สรุป | `calc: Quote` | น้อง, บริการ, วันเวลา, ช่าง, ราคาประเมิน (money) |  |
| แสดง | มัดจำ | `calc: R-06` | money + 'ต้องโอนภายใน 15 นาที' |  |
| แสดง | นโยบายยกเลิก | `branch_policy.policy_text` | กล่องข้อความ |  |
| กรอก | โน้ตถึงร้าน | `booking.customer_note` | textarea | ≤ 300 |
| กรอก | ยอมรับนโยบาย | `calc: acceptedPolicy` | checkbox | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ยืนยันการจอง | `liff.createBooking` |  | มัดจำ → L-07; ไม่มี → หน้า 'จองสำเร็จ' / 'รอร้านยืนยัน'; SLOT_TAKEN → กลับขั้น 3 + toast |

- ราคาในขั้น 2 เป็น 'ราคาประเมิน' — อาจเปลี่ยนตามน้ำหนักจริงตอนเช็คอิน (แสดงหมายเหตุ)

<a id="scr-L-05"></a>

### L-05

#### จองโรงแรม

Route: `/liff/[branchSlug]/book/hotel` · สิทธิ์: customer · Stories: US-11-04, US-11-06  
จุดประสงค์: น้อง → วันที่ → ประเภทห้อง → add-on → ยืนยัน  
โหลดข้อมูล: `liff.pets`, `liff.hotelAvailability`, `liff.quote`

**1. น้องและวันที่**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้อง | `stay.pet_id` | การ์ด (หลายตัว = หลายการพัก) |  |
| กรอก | วันเข้า–ออก | `stay.check_in_date` | range calendar (check_out_date) | ≥ 1 คืน ≤ 30 |
| กรอก | เวลามาส่ง/รับ | `stay.expected_check_in_time` | select ตามเวลาเปิด (expected_check_out_time) |  |
| กรอก | น้องติดสัด | `stay.in_heat` | toggle (เพศเมีย) |  |

**2. ห้อง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ประเภทห้อง | `room_type.name_th` | การ์ด + รูป + สิ่งอำนวยความสะดวก + ราคา/คืน (money) + 'เหลือ x ห้อง' |  |
| แสดง | ไม่รับน้องตัวนี้ | `calc: R-12 reasons` | การ์ดเทา + เหตุผลภาษาไทย |  |
| กรอก | เลือก | `stay.room_type_id` | radio |  |

**3. เพิ่มเติม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | Add-on | `stay_addon.service_id` | checkbox + ราคา (ต่อวัน) |  |
| กรอก | อาบน้ำก่อนกลับบ้าน | `stay.bundle_appointment_id` | toggle → เลือกบริการ + เวลาในวันเช็คเอาท์ (R-04) | US-11-06 |

**4. วัคซีน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ผลตรวจ | `calc: R-11` | ✓ ครบ / รายการที่ขาด + ปุ่มอัปโหลด (→ ใบจองรออนุมัติ) |  |

**5. ยืนยัน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | สรุป | `calc: Quote` | คืน × ราคา + add-on + อาบน้ำ = รวม |  |
| แสดง | มัดจำ | `calc: R-06` | money |  |
| แสดง | นโยบาย | `branch_policy.policy_text` |  |  |
| กรอก | ยอมรับนโยบาย | `calc: acceptedPolicy` | checkbox | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ยืนยัน | `liff.createBooking` |  | → L-07 หรือหน้าสำเร็จ |


<a id="scr-L-06"></a>

### L-06

#### จอง Daycare

Route: `/liff/[branchSlug]/book/daycare` · สิทธิ์: customer · Stories: US-11-05  
จุดประสงค์: น้อง → วัน+รอบ → ยืนยัน  
โหลดข้อมูล: `liff.pets`, `liff.daycareAvailability`, `liff.quote`

**เลือก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | น้อง | `daycare_visit.pet_id` | การ์ด |  |
| กรอก | วันที่ | `daycare_visit.visit_date` | แถบวัน (หลายวันได้) |  |
| กรอก | รอบ | `daycare_visit.session_type_id` | การ์ด เต็มวัน/เช้า/บ่าย + ที่ว่าง (R-29) + ราคา | เต็ม = กดไม่ได้ |
| แสดง | วัคซีน | `calc: R-11` |  |  |

**ยืนยัน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | สรุป | `calc: Quote` | money |  |
| กรอก | ยอมรับนโยบาย | `calc: acceptedPolicy` | checkbox | บังคับ |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ยืนยัน | `liff.createBooking` |  |  |


<a id="scr-L-07"></a>

### L-07

#### จ่ายมัดจำ

Route: `/liff/[branchSlug]/bookings/[bookingId]/pay` · สิทธิ์: customer · Stories: US-11-07, US-07-01, US-05-02  
จุดประสงค์: QR PromptPay + อัปโหลดสลิป ภายในเวลาที่กันคิว  
โหลดข้อมูล: `liff.booking`

**QR**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยอดที่ต้องโอน | `booking.deposit_required_satang` | money ตัวใหญ่ (− deposit_verified) |  |
| แสดง | QR PromptPay | `calc: R-30` | QR 240px + ปุ่มบันทึกรูป QR |  |
| แสดง | ชื่อบัญชี | `branch.promptpay_account_name` | 'ตรวจชื่อก่อนโอน' |  |
| แสดง | เหลือเวลา | `booking.hold_expires_at` | นับถอยหลัง mm:ss; หมด → หน้าแจ้งหมดเวลา |  |

**ส่งสลิป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | รูปสลิป | `payment_slip.file_id` | เลือกจากอัลบั้ม/กล้อง | R-25 |
| กรอก | QR บนสลิป | `payment_slip.qr_payload` | อ่านอัตโนมัติจากรูป (jsQR) ไม่แสดงผู้ใช้ |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่งสลิป | `customer.uploadUrl → liff.uploadSlip` | awaiting_deposit และ now < hold_expires_at | → L-09 สถานะ 'รอร้านตรวจสลิป'; HOLD_EXPIRED → หน้าแจ้งหมดเวลา + ปุ่มจองใหม่ |


<a id="scr-L-08"></a>

### L-08

#### นัดของฉัน

Route: `/liff/[branchSlug]/bookings` · สิทธิ์: customer · Stories: US-11-08  
จุดประสงค์: นัดที่จะมาและที่ผ่านมา  
โหลดข้อมูล: `liff.bookings`

**แท็บ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| ตัวกรอง | กำลังจะมา/ที่ผ่านมา | `calc: scope` | tabs |  |

**การ์ด**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | วันเวลา | `booking.first_service_at` | date (weekday) + time |  |
| แสดง | น้อง | `pet.name` | chips |  |
| แสดง | บริการ | `calc: summary` |  |  |
| แสดง | สถานะ | `booking.status` | ป้ายภาษาไทย |  |
| แสดง | มัดจำ | `booking.deposit_status` | ป้าย + ปุ่มจ่ายถ้าค้าง |  |
| แสดง | เลขใบจอง | `booking.booking_no` | เล็ก |  |


<a id="scr-L-09"></a>

### L-09

#### รายละเอียดนัด

Route: `/liff/[branchSlug]/bookings/[bookingId]` · สิทธิ์: customer · Stories: US-11-08, US-11-10  
จุดประสงค์: ดู/เลื่อน/ยกเลิก/เพิ่มลงปฏิทิน/นำทาง  
โหลดข้อมูล: `liff.booking`

**รายละเอียด**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | สถานะ | `booking.status` | ป้ายใหญ่ |  |
| แสดง | เลขใบจอง | `booking.booking_no` |  |  |
| แสดง | กรูม | `groom_appointment.starts_at` | date time + น้อง + ช่าง + บริการ |  |
| แสดง | โรงแรม | `stay.check_in_date` | เข้า–ออก + ประเภทห้อง |  |
| แสดง | Daycare | `daycare_visit.visit_date` | วัน + รอบ |  |
| แสดง | ยอดประเมิน | `booking.estimated_total_satang` | money |  |
| แสดง | มัดจำ | `booking.deposit_verified_satang` | money + สถานะ |  |

**ยกเลิก**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ผลถ้ายกเลิกตอนนี้ | `calc: R-07 cancelPreview` | 'คืนเครดิต ฿300' / 'ไม่คืนมัดจำ' (แดง) |  |
| กรอก | รับเงินคืนเป็น | `calc: customerChoice` | radio (เฉพาะ customer_choice) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เพิ่มลงปฏิทิน | `liff.ics` |  | ดาวน์โหลด .ics |
| นำทาง | `—` |  | เปิด Google Maps (branch.latitude/longitude) |
| เลื่อนนัด | `liff.groomSlots → liff.reschedule` | R-21 canReschedule | เลือกเวลาใหม่ |
| ยกเลิก | `liff.cancel` | R-21 canCancel | dialog ยืนยัน + ผลเงิน |
| จ่ายมัดจำ | `—` | awaiting_deposit | → L-07 |
| โทรหาร้าน | `—` |  | tel: branch.phone |

- เหตุผลที่เลื่อนไม่ได้แสดงเป็นข้อความ (TOO_LATE_TO_RESCHEDULE / RESCHEDULE_LIMIT)

<a id="scr-L-10"></a>

### L-10

#### อัปเดตน้องระหว่างพัก

Route: `/liff/[branchSlug]/stays/[stayId]` · สิทธิ์: customer · Stories: US-06-10  
จุดประสงค์: ดูรูป/วิดีโอและงานดูแลที่ทำแล้ว  
โหลดข้อมูล: `liff.stayUpdates`

**หัว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | น้อง | `pet.name` | รูป + ชื่อ |  |
| แสดง | ช่วงพัก | `stay.check_in_date` | date – date (check_out_date) |  |

**ฟีด**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รูป/วิดีโอ | `pet_photo.file_id` | การ์ดใหม่→เก่า + caption + เวลา (taken_at) |  |
| แสดง | งานที่ทำแล้ววันนี้ | `care_task.title` | '🍽 ให้อาหาร 08:05 – กินหมด' (done_at, note) |  |


<a id="scr-L-11"></a>

### L-11

#### Report card

Route: `/liff/[branchSlug]/report-cards/[reportCardId]` · สิทธิ์: customer · Stories: US-10-01, US-10-02, US-10-03  
จุดประสงค์: ผลหลังบริการ + ให้ดาว + ลิงก์รีวิว  
โหลดข้อมูล: `liff.reportCard`

**ผล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รูปก่อน/หลัง | `pet_photo.file_id` | slider before/after |  |
| แสดง | บริการที่ทำ | `groom_appointment_item.name_snapshot` | list |  |
| แสดง | ผลตรวจ | `report_card.skin` | ไอคอน + ข้อความไทย ผิว/หู/เล็บ/ฟัน/เห็บหมัด |  |
| แสดง | ความร่วมมือ | `report_card.cooperation` | ดาว |  |
| แสดง | ข้อความจากช่าง | `report_card.staff_note` | ชื่อช่าง + ข้อความ |  |
| แสดง | คำแนะนำ | `report_card.recommendation` |  |  |
| แสดง | รอบถัดไป | `calc: R-17` | date + ปุ่มจองเลย |  |

**ให้คะแนน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ความพอใจ | `report_card.customer_rating` | ดาว 1–5 |  |
| แสดง+แก้ | ข้อความถึงร้าน | `report_card.customer_feedback` | textarea (ร้านเห็นเท่านั้น) | ≤ 1000 |

**รีวิว**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | รีวิวบน Google | `branch_policy.google_review_url` | ปุ่มแสดงกับทุกคน ไม่ขึ้นกับดาว |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่งคะแนน | `liff.rate` |  | ขอบคุณ |
| รีวิวบน Google | `liff.reviewClick` | มี google_review_url | เปิดลิงก์ภายนอก |
| จองรอบถัดไป | `—` |  | → L-04 |


<a id="scr-L-12"></a>

### L-12

#### แพ็กเกจของฉัน

Route: `/liff/[branchSlug]/packages` · สิทธิ์: customer · Stories: US-10-06  
จุดประสงค์: สิทธิ์คงเหลือ  
โหลดข้อมูล: `liff.packages`

**การ์ด**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | แพ็กเกจ | `package_template.name_th` |  |  |
| แสดง | น้อง | `pet.name` | หรือ 'ทุกตัวในบ้าน' |  |
| แสดง | คงเหลือ | `calc: sessions_total − sessions_used` | 'เหลือ 3/5 ครั้ง' + progress |  |
| แสดง | หมดอายุ | `customer_package.expires_at` | date; ส้มถ้า < 30 วัน |  |
| แสดง | สถานะ | `customer_package.status` | ป้าย |  |


<a id="scr-L-13"></a>

### L-13

#### ใบเสร็จ

Route: `/liff/[branchSlug]/receipts/[billId]` · สิทธิ์: customer · Stories: US-08-05  
จุดประสงค์: ใบเสร็จอิเล็กทรอนิกส์  
โหลดข้อมูล: `liff.receipt`

**ใบเสร็จ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ร้าน | `branch.name` | หัว |  |
| แสดง | เลขที่/วันที่ | `bill.receipt_no` | + closed_at |  |
| แสดง | รายการ | `bill_line.description` | qty × ราคา = รวม |  |
| แสดง | ส่วนลด | `bill.bill_discount_satang` | money |  |
| แสดง | ยอดสุทธิ | `bill.total_satang` | money always |  |
| แสดง | ชำระโดย | `payment.method` |  |  |
| แสดง | แพ็กเกจคงเหลือ | `customer_package.sessions_used` |  |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกรูป | `—` |  | html → PNG (client) เพื่อแชร์ |


<a id="scr-L-14"></a>

### L-14

#### จ่ายยอดคงเหลือ

Route: `/liff/[branchSlug]/pay/[billId]` · สิทธิ์: customer · Stories: US-07-08  
จุดประสงค์: QR ยอดค้างของบิล + ส่งสลิป  
โหลดข้อมูล: `liff.payPage`

**QR**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ยอดค้าง | `calc: bill.total_satang − bill.paid_satang` | money ตัวใหญ่ |  |
| แสดง | QR | `calc: R-30` | QR |  |
| แสดง | ชื่อบัญชี | `branch.promptpay_account_name` |  |  |

**สลิป**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | รูปสลิป | `payment_slip.file_id` | upload |  |
| กรอก | QR บนสลิป | `payment_slip.qr_payload` | อ่านอัตโนมัติ |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ส่งสลิป | `liff.payUploadSlip` | bill open และค้าง > 0 | ข้อความรอร้านตรวจ |


<a id="scr-L-15"></a>

### L-15

#### โปรไฟล์ของฉัน

Route: `/liff/[branchSlug]/me` · สิทธิ์: customer · Stories: US-11-01, US-03-12, US-13-08  
จุดประสงค์: แก้ข้อมูลติดต่อ ความยินยอม และสิทธิ์ PDPA  
โหลดข้อมูล: `liff.me`

**ข้อมูล**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ชื่อ | `owner_profile.first_name` | text | บังคับ |
| แสดง+แก้ | นามสกุล | `owner_profile.last_name` | text |  |
| แสดง+แก้ | ชื่อเล่น | `owner_profile.nickname` | text |  |
| แสดง+แก้ | เบอร์โทร | `owner_profile.phone_e164` | tel | R-22 |
| แสดง+แก้ | อีเมล | `owner_profile.email` | email |  |

**เครดิต**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | เครดิตคงเหลือ | `customer.credit_balance_satang` | money |  |

**ความยินยอม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | ให้ร้านใช้รูปน้อง | `customer.photo_consent` | toggle | บันทึก consent_record ใหม่ |

**สิทธิ์ของฉัน (PDPA)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ขอสำเนาข้อมูล / ขอลบข้อมูล | `data_request.type` | 2 ปุ่ม + dialog อธิบายผล |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `liff.updateMe` |  |  |
| ส่งคำขอ | `liff.dataRequest` |  | toast 'ทีมงานจะติดต่อภายใน 30 วัน' |


## Platform admin


<a id="scr-AD-01"></a>

### AD-01

#### Admin login

Route: `/admin/login` · สิทธิ์: public · Stories: US-13-10  
จุดประสงค์: ทีมแพลตฟอร์มเข้าระบบ  
โหลดข้อมูล: —

**ฟอร์ม**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | อีเมล | `platform_admin.email` | email |  |
| กรอก | รหัสผ่าน | `platform_admin.password_hash` | password |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เข้าสู่ระบบ | `admin.login` |  | → AD-02 |


<a id="scr-AD-02"></a>

### AD-02

#### ร้านทั้งหมด

Route: `/admin/organizations` · สิทธิ์: admin · Stories: US-13-10, US-13-14  
จุดประสงค์: ดูและสร้างร้านนำร่อง  
โหลดข้อมูล: `admin.orgs`

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ร้าน | `organization.name` | text |  |
| แสดง | slug | `organization.slug` | mono |  |
| แสดง | สถานะ | `organization.status` | enum |  |
| แสดง | เจ้าของ | `staff_user.email` | text |  |
| แสดง | LINE | `line_channel.status` | enum |  |
| แสดง | ใช้งานล่าสุด | `calc: lastActivityAt` | time ago |  |

**สร้างร้าน**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | ชื่อธุรกิจ | `organization.name` | text |  |
| กรอก | slug | `organization.slug` | text | a-z0-9- |
| กรอก | ชื่อสาขา | `branch.name` | text |  |
| กรอก | ลิงก์จอง | `branch.booking_slug` | text | a-z0-9- |
| กรอก | อีเมลเจ้าของ | `staff_user.email` | email |  |
| กรอก | ชื่อเจ้าของ | `staff_user.display_name` | text |  |
| กรอก | โมดูล | `branch.module_grooming` | 3 checkbox (module_hotel, module_daycare) |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| สร้าง | `admin.createOrg` |  | แสดงลิงก์เชิญเจ้าของ |


<a id="scr-AD-03"></a>

### AD-03

#### ร้าน (admin)

Route: `/admin/organizations/[orgId]` · สิทธิ์: admin · Stories: US-02-06, US-13-10, US-13-11  
จุดประสงค์: ตั้งค่า LINE ของร้าน สถานะ และเข้าโหมดช่วยเหลือ  
โหลดข้อมูล: `admin.orgs`

**สถานะ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | สถานะร้าน | `organization.status` | select |  |

**LINE OA (ตาม ADR-001)**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | Provider ID | `line_channel.provider_id` | text |  |
| แสดง+แก้ | Messaging channel ID | `line_channel.messaging_channel_id` | text |  |
| กรอก | Channel secret | `line_channel.channel_secret_enc` | password (ไม่แสดงค่าเดิม) |  |
| กรอก | Channel access token | `line_channel.channel_access_token_enc` | password |  |
| แสดง+แก้ | LINE Login channel ID | `line_channel.login_channel_id` | text |  |
| แสดง+แก้ | LIFF ID | `line_channel.liff_id` | text |  |
| แสดง+แก้ | Basic ID | `line_channel.bot_basic_id` | text @xxx |  |
| แสดง+แก้ | โควตา push/เดือน | `line_channel.monthly_push_quota` | number |  |
| แสดง | Webhook URL | `calc: /api/webhooks/line/{messagingChannelId}` | copy |  |
| แสดง | ตรวจล่าสุด | `line_channel.webhook_verified_at` | date time |  |
| แสดง | สถานะการเชื่อม | `line_channel.status` | enum badge |  |

**โหมดช่วยเหลือ**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| กรอก | เหตุผล | `support_access_log.reason` | textarea | ≥ 10 |
| กรอก | อ้างอิง | `support_access_log.ticket_ref` | text |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึกสถานะ | `admin.updateOrg` |  |  |
| บันทึก LINE | `admin.setLineChannel` |  |  |
| ทดสอบ + ตั้ง webhook | `admin.verifyLine` |  |  |
| เข้าโหมดช่วยเหลือ | `admin.supportStart` |  | เปิด console ของร้านแบบอ่านอย่างเดียว (แถบแดงด้านบน) |
| จบโหมดช่วยเหลือ | `admin.supportEnd` | มี support session เปิดอยู่ | ปุ่มบนแถบแดงใน console ด้วย — หมดอายุเองใน 60 นาที |


<a id="scr-AD-04"></a>

### AD-04

#### Feedback

Route: `/admin/feedback` · สิทธิ์: admin · Stories: US-13-13  
จุดประสงค์: แจ้งปัญหาจากร้าน  
โหลดข้อมูล: `admin.feedback`

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ร้าน | `organization.name` | text |  |
| แสดง | ผู้แจ้ง | `staff_user.display_name` | text |  |
| แสดง | ข้อความ | `feedback_report.message` | text |  |
| แสดง | หน้า | `feedback_report.page_url` | link |  |
| แสดง | ภาพ | `feedback_report.screenshot_file_id` | thumbnail |  |
| แสดง+แก้ | สถานะ | `feedback_report.status` | select |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| เปลี่ยนสถานะ | `admin.updateFeedback` |  |  |


<a id="scr-AD-05"></a>

### AD-05

#### คำขอ PDPA

Route: `/admin/data-requests` · สิทธิ์: admin · Stories: US-13-08  
จุดประสงค์: จัดการคำขอดู/ลบข้อมูล ภายใน 30 วัน  
โหลดข้อมูล: `admin.dataRequests`

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ร้าน | `organization.name` | text |  |
| แสดง | ประเภท | `data_request.type` | enum |  |
| แสดง | สถานะ | `data_request.status` | enum |  |
| แสดง | ขอเมื่อ | `data_request.created_at` | date + วันคงเหลือจาก 30 |  |
| กรอก | บันทึก | `data_request.note` | textarea |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| ดำเนินการ | `admin.resolveDataRequest` | open | dialog ยืนยัน (ลบ = ย้อนไม่ได้) |


<a id="scr-AD-06"></a>

### AD-06

#### Analytics นำร่อง

Route: `/admin/analytics` · สิทธิ์: admin · Stories: US-13-12  
จุดประสงค์: วัดผลร้านนำร่อง  
โหลดข้อมูล: `admin.analytics`

**ตาราง**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง | ร้าน | `organization.name` | text |  |
| แสดง | วันที่ใช้งานใน 7 วัน | `calc: activeDays7` | number |  |
| แสดง | จองออนไลน์ % | `calc: onlineShare` | percent |  |
| แสดง | No-show % | `calc: noShowRate` | percent |  |
| แสดง | Push ที่ใช้ | `calc: pushUsed` | number |  |
| แสดง | บิลที่ปิด | `calc: billsClosed` | number |  |


<a id="scr-AD-07"></a>

### AD-07

#### วันหยุดราชการ

Route: `/admin/holidays` · สิทธิ์: admin · Stories: US-13-03  
จุดประสงค์: seed วันหยุดประจำปี  
โหลดข้อมูล: —

**ปี**

| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |
|---|---|---|---|---|
| แสดง+แก้ | วันที่ | `public_holiday.holiday_date` | date |  |
| แสดง+แก้ | ชื่อวันหยุด | `public_holiday.name_th` | text |  |

**ปุ่ม/การกระทำ**

| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |
|---|---|---|---|
| บันทึก | `admin.holidays` |  |  |

