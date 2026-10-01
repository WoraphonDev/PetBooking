# 08 — Permission Matrix

> สร้างจาก 05-api (ฟิลด์ roles) — ตรวจใน middleware ของ `/api/v1/staff/*` ด้วย `requireRole(key)` ที่อ่านจากตาราง `packages/server/src/auth/permissions.ts` ซึ่งต้องตรงกับไฟล์นี้ (มีเทสต์เทียบกับ `docs/spec/vectors/permissions.json`)

| endpoint key | หน้าที่ | owner | front_desk | staff | หมายเหตุ |
|---|---|---|---|---|---|
| `auth.staffLogout` | ออกจากระบบ | ✓ | ✓ | ✓ |  |
| `auth.me` | ข้อมูล session | ✓ | ✓ | ✓ |  |
| `staffMe.linkLine` | ผูก LINE กับบัญชีพนักงาน | ✓ | ✓ | ✓ |  |
| `staffMe.sessions` | อุปกรณ์ที่ล็อกอินอยู่ | ✓ | ✓ | ✓ |  |
| `staffMe.revokeSession` | ออกจากระบบอุปกรณ์อื่น | ✓ | ✓ | ✓ |  |
| `staffMe.pushSubscribe` | ลงทะเบียน Web Push | ✓ | ✓ | ✓ |  |
| `staffMe.pushUnsubscribe` | ยกเลิก Web Push | ✓ | ✓ | ✓ |  |
| `staffMe.commissions` | ค่ามือของฉัน | ✓ | ✓ | ✓ |  |
| `staff.uploadUrl` | ขอ URL อัปโหลดไฟล์ | ✓ | ✓ | ✓ |  |
| `branch.get` | ตั้งค่าสาขา | ✓ | ✓ | ✓ |  |
| `branch.update` | แก้ข้อมูลร้าน | ✓ |  |  |  |
| `branch.setHours` | ตั้งเวลาเปิด-ปิด 7 วัน | ✓ |  |  |  |
| `branch.setModules` | เปิด/ปิดโมดูล | ✓ |  |  |  |
| `branch.updatePolicy` | แก้นโยบายร้าน | ✓ |  |  |  |
| `branch.setPromptpay` | ตั้งบัญชี PromptPay | ✓ |  |  |  |
| `closures.list` | วันปิด/ช่วงปิด | ✓ | ✓ | ✓ |  |
| `closures.create` | เพิ่มวันปิด | ✓ | ✓ |  |  |
| `closures.delete` | ลบวันปิด | ✓ | ✓ |  |  |
| `closures.importHolidays` | เพิ่มวันหยุดราชการเป็นวันปิด | ✓ |  |  |  |
| `stations.list` | โต๊ะกรูม | ✓ | ✓ | ✓ |  |
| `stations.upsert` | ตั้งค่าโต๊ะกรูม | ✓ |  |  |  |
| `line.status` | สถานะ LINE และโควตา | ✓ | ✓ |  |  |
| `line.skipped` | ข้อความที่ไม่ได้ส่ง | ✓ | ✓ |  |  |
| `staffUsers.list` | รายชื่อพนักงาน | ✓ | ✓ | ✓ | role staff เห็นเฉพาะ id, displayName, isGroomer, photoUrl |
| `staffUsers.invite` | เชิญพนักงาน | ✓ |  |  |  |
| `staffUsers.update` | แก้ข้อมูล/สิทธิ์พนักงาน | ✓ |  |  |  |
| `staffUsers.resendInvite` | ส่งคำเชิญใหม่ | ✓ |  |  |  |
| `workingHours.set` | ตั้งเวลาทำงานรายสัปดาห์ | ✓ | ✓ |  |  |
| `timeOff.list` | วันลา | ✓ | ✓ | ✓ |  |
| `timeOff.create` | เพิ่มวันลา | ✓ | ✓ |  |  |
| `timeOff.delete` | ลบวันลา | ✓ | ✓ |  |  |
| `search.quick` | ค้นหาเร็ว (ชื่อ ชื่อเล่น เบอร์ ชื่อน้อง เลขใบจอง) | ✓ | ✓ | ✓ |  |
| `customers.list` | รายการลูกค้า | ✓ | ✓ |  |  |
| `customers.create` | เพิ่มลูกค้า (หน้าร้าน) | ✓ | ✓ |  |  |
| `customers.get` | รายละเอียดลูกค้า | ✓ | ✓ | ✓ | role staff: ไม่เห็น phone, email, address, internalNote, creditBalance (ตัดออกจาก response) |
| `customers.update` | แก้ข้อมูลลูกค้า | ✓ | ✓ |  |  |
| `customers.blacklist` | ตั้ง/ยกเลิก blacklist | ✓ |  |  |  |
| `customers.reliabilityOverride` | กำหนดระดับความน่าเชื่อถือเอง | ✓ |  |  |  |
| `customers.timeline` | ประวัติทั้งหมด | ✓ | ✓ |  |  |
| `customers.credit` | ปรับเครดิตลูกค้าเอง | ✓ |  |  |  |
| `customers.packages` | แพ็กเกจของลูกค้า | ✓ | ✓ |  |  |
| `pets.create` | เพิ่มน้อง | ✓ | ✓ |  |  |
| `pets.get` | รายละเอียดน้อง | ✓ | ✓ | ✓ |  |
| `pets.update` | แก้ข้อมูลน้อง | ✓ | ✓ |  |  |
| `pets.setStatus` | น้องจากไป/ย้ายบ้าน | ✓ | ✓ |  |  |
| `pets.updateShopProfile` | ข้อมูลกรูม/สุขภาพ/โน้ตของร้าน | ✓ | ✓ | ✓ |  |
| `pets.addWeight` | บันทึกน้ำหนัก | ✓ | ✓ | ✓ |  |
| `pets.setFlags` | ตั้งป้ายนิสัย | ✓ | ✓ | ✓ |  |
| `vaccinations.create` | เพิ่มวัคซีน (ร้านบันทึก = verified) | ✓ | ✓ |  |  |
| `vaccinations.verify` | ยืนยันวัคซีนที่ลูกค้าส่ง | ✓ | ✓ |  |  |
| `vaccinations.reject` | ปฏิเสธหลักฐานวัคซีน | ✓ | ✓ |  |  |
| `photos.list` | คลังรูปน้อง | ✓ | ✓ | ✓ |  |
| `photos.add` | เพิ่มรูปน้อง | ✓ | ✓ | ✓ |  |
| `linkRequests.list` | คำขอจับคู่บัญชี LINE | ✓ | ✓ |  |  |
| `linkRequests.approve` | ยืนยันว่าเป็นลูกค้าเดิม | ✓ | ✓ |  |  |
| `linkRequests.reject` | ไม่ใช่ลูกค้าเดิม | ✓ | ✓ |  |  |
| `sizeTiers.list` | ขนาด | ✓ | ✓ | ✓ |  |
| `sizeTiers.set` | ตั้งช่วงขนาดของชนิดสัตว์ | ✓ |  |  |  |
| `services.list` | บริการ | ✓ | ✓ | ✓ |  |
| `services.create` | เพิ่มบริการ/add-on | ✓ |  |  |  |
| `services.update` | แก้บริการ/ปิดใช้งาน | ✓ |  |  |  |
| `services.setPrices` | ตารางราคา × ขนาด × ขน | ✓ |  |  |  |
| `services.setAddonLinks` | add-on ใช้กับบริการไหน | ✓ |  |  |  |
| `surchargeTypes.list` | ค่าบริการเพิ่ม | ✓ | ✓ | ✓ |  |
| `surchargeTypes.upsert` | ตั้งค่าบริการเพิ่ม | ✓ |  |  |  |
| `roomTypes.list` | ประเภทห้อง | ✓ | ✓ | ✓ |  |
| `roomTypes.create` | เพิ่มประเภทห้อง | ✓ |  |  |  |
| `roomTypes.update` | แก้ประเภทห้อง | ✓ |  |  |  |
| `roomTypes.setRates` | ราคาห้องต่อคืน | ✓ |  |  |  |
| `roomUnits.list` | ห้อง | ✓ | ✓ | ✓ |  |
| `roomUnits.upsert` | ตั้งค่าห้อง | ✓ |  |  |  |
| `roomUnits.housekeeping` | สถานะทำความสะอาด | ✓ | ✓ | ✓ |  |
| `daycareTypes.list` | รอบ Daycare | ✓ | ✓ | ✓ |  |
| `daycareTypes.upsert` | ตั้งรอบและราคา Daycare | ✓ |  |  |  |
| `packageTemplates.list` | แพ็กเกจที่ขาย | ✓ | ✓ | ✓ |  |
| `packageTemplates.upsert` | ตั้งแพ็กเกจ | ✓ |  |  |  |
| `commissionRules.list` | กติกาค่ามือ | ✓ |  |  |  |
| `commissionRules.set` | ตั้งกติกาค่ามือ | ✓ |  |  |  |
| `imports.create` | อัปโหลด CSV เพื่อตรวจ | ✓ |  |  |  |
| `imports.get` | ผลตรวจ CSV | ✓ |  |  |  |
| `imports.commit` | นำเข้าจริง | ✓ |  |  |  |
| `availability.groomSlots` | หาเวลาว่างกรูม (หน้าร้าน) | ✓ | ✓ |  |  |
| `availability.hotel` | ห้องว่าง | ✓ | ✓ |  |  |
| `availability.daycare` | ที่ว่าง Daycare | ✓ | ✓ |  |  |
| `quotes.create` | คำนวณราคา+มัดจำก่อนบันทึก | ✓ | ✓ |  |  |
| `bookings.create` | ร้านสร้างใบจอง | ✓ | ✓ |  |  |
| `bookings.list` | รายการใบจอง | ✓ | ✓ |  |  |
| `bookings.get` | รายละเอียดใบจอง | ✓ | ✓ | ✓ |  |
| `bookings.approve` | อนุมัติใบจอง | ✓ | ✓ |  |  |
| `bookings.decline` | ปฏิเสธใบจอง | ✓ | ✓ |  |  |
| `bookings.cancelPreview` | ดูผลเงินก่อนยกเลิก | ✓ | ✓ |  |  |
| `bookings.cancel` | ยกเลิกทั้งใบจอง | ✓ | ✓ |  |  |
| `bookings.recordDeposit` | บันทึกรับมัดจำ (เงินสด/โอนที่ร้านเห็นแล้ว) | ✓ | ✓ |  |  |
| `bookings.waiveDeposit` | ยกเว้นมัดจำ | ✓ | ✓ |  |  |
| `bookings.balanceLink` | สร้างลิงก์จ่ายยอดคงเหลือ | ✓ | ✓ |  |  |
| `calendar.day` | ปฏิทินคิว | ✓ | ✓ | ✓ | role staff เห็นทุกนัดแต่ไม่เห็นเบอร์ลูกค้า |
| `groom.reschedule` | เลื่อนนัด/ย้ายช่าง (ลากบนปฏิทิน) | ✓ | ✓ |  |  |
| `groom.setItems` | เปลี่ยนบริการ/ขนาด (เช่นตอนเช็คอินชั่งแล้วขนาดเปลี่ยน) | ✓ | ✓ |  |  |
| `groom.checkIn` | เช็คอินกรูม | ✓ | ✓ |  |  |
| `groom.start` | เริ่มงาน | ✓ | ✓ | ✓ | role staff ทำได้เฉพาะนัดของตัวเอง |
| `groom.finish` | เสร็จงาน | ✓ | ✓ | ✓ |  |
| `groom.notifyPickup` | แจ้งลูกค้ามารับ | ✓ | ✓ |  |  |
| `groom.pickUp` | ลูกค้ารับน้องแล้ว | ✓ | ✓ |  |  |
| `groom.noShow` | ลูกค้าไม่มา | ✓ | ✓ |  |  |
| `groom.cancel` | ยกเลิกนัดตัวเดียวในใบจอง | ✓ | ✓ |  |  |
| `groom.addSurcharge` | เพิ่มค่าบริการหน้างาน | ✓ | ✓ |  |  |
| `groom.removeSurcharge` | ลบค่าบริการเพิ่ม (ก่อนปิดบิล) | ✓ | ✓ |  |  |
| `groom.jobCard` | Job card | ✓ | ✓ | ✓ |  |
| `groom.myQueue` | คิวของฉันวันนี้ (Staff app) | ✓ | ✓ | ✓ |  |
| `stays.today` | รายชื่อเข้า-ออก/อยู่ในร้าน | ✓ | ✓ | ✓ |  |
| `stays.get` | รายละเอียดการพัก | ✓ | ✓ | ✓ |  |
| `stays.saveIntake` | ฟอร์มรับฝาก | ✓ | ✓ |  |  |
| `stays.signAgreement` | เซ็นข้อตกลงรับฝาก | ✓ | ✓ |  |  |
| `stays.checkIn` | เช็คอินโรงแรม | ✓ | ✓ |  |  |
| `stays.changeRoom` | ย้ายห้อง (Room map) | ✓ | ✓ |  |  |
| `stays.changeDates` | ขยาย/ลดวันพัก | ✓ | ✓ |  |  |
| `stays.addAddon` | เพิ่ม add-on ระหว่างพัก | ✓ | ✓ |  |  |
| `stays.removeAddon` | ลบ add-on (ก่อนปิดบิล) | ✓ | ✓ |  |  |
| `stays.postUpdate` | ส่งรูป/วิดีโออัปเดตน้อง | ✓ | ✓ | ✓ |  |
| `stays.checkOut` | เช็คเอาท์ | ✓ | ✓ |  |  |
| `stays.noShow` | ไม่มาเช็คอิน | ✓ | ✓ |  |  |
| `stays.cancel` | ยกเลิกการพักตัวเดียว | ✓ | ✓ |  |  |
| `roomMap.get` | Room map | ✓ | ✓ | ✓ |  |
| `careTasks.list` | งานดูแลวันนี้ | ✓ | ✓ | ✓ |  |
| `careTasks.done` | ทำงานดูแลแล้ว | ✓ | ✓ | ✓ |  |
| `careTasks.skip` | ข้ามงาน | ✓ | ✓ | ✓ |  |
| `daycare.list` | Daycare วันนี้ | ✓ | ✓ | ✓ |  |
| `daycare.check_in` | Daycare check-in | ✓ | ✓ |  |  |
| `daycare.check_out` | Daycare check-out | ✓ | ✓ |  |  |
| `daycare.no_show` | Daycare no-show | ✓ | ✓ |  |  |
| `daycare.cancel` | Daycare cancel | ✓ | ✓ |  |  |
| `slips.list` | สลิปรอตรวจ | ✓ | ✓ |  |  |
| `slips.verify` | ยืนยันสลิป (ร้านเช็คเงินเข้าบัญชีแล้ว) | ✓ | ✓ |  |  |
| `slips.reject` | ปฏิเสธสลิป | ✓ | ✓ |  |  |
| `refunds.create` | บันทึกการคืนเงิน (หลังโอนคืนแล้ว) | ✓ | ✓ |  |  |
| `bills.open` | เปิดบิล | ✓ | ✓ |  |  |
| `bills.list` | รายการบิล | ✓ | ✓ |  |  |
| `bills.get` | รายละเอียดบิล | ✓ | ✓ |  |  |
| `bills.addLine` | เพิ่มรายการ (สินค้า/ขายแพ็กเกจ/ใช้แพ็กเกจ) | ✓ | ✓ |  |  |
| `bills.updateLine` | ส่วนลดรายบรรทัด/เปลี่ยนช่าง | ✓ | ✓ |  |  |
| `bills.removeLine` | ลบรายการ (quick_item/package) | ✓ | ✓ |  |  |
| `bills.setDiscount` | ส่วนลดท้ายบิล | ✓ | ✓ |  |  |
| `bills.addPayment` | รับชำระ | ✓ | ✓ |  |  |
| `bills.voidPayment` | ยกเลิกรายการรับเงิน (บิลยัง open) | ✓ | ✓ |  |  |
| `bills.promptpayQr` | QR PromptPay ยอดค้าง | ✓ | ✓ |  |  |
| `bills.close` | ปิดบิล | ✓ | ✓ |  |  |
| `bills.void` | Void บิลที่ปิดแล้ว | ✓ |  |  |  |
| `bills.receipt` | ข้อมูลใบเสร็จสำหรับพิมพ์ | ✓ | ✓ |  |  |
| `bills.sendReceipt` | ส่งใบเสร็จทาง LINE อีกครั้ง | ✓ | ✓ |  |  |
| `reportCards.list` | Report card | ✓ | ✓ | ✓ | role staff เห็นเฉพาะที่ตัวเองสร้าง |
| `reportCards.get` | รายละเอียด Report card | ✓ | ✓ | ✓ |  |
| `reportCards.update` | กรอก Report card | ✓ | ✓ | ✓ |  |
| `reportCards.submit` | ส่ง Report card | ✓ | ✓ | ✓ |  |
| `reportCards.approve` | หน้าร้านตรวจแล้วส่ง | ✓ | ✓ |  |  |
| `dashboard.today` | Dashboard วันนี้ | ✓ | ✓ |  | front_desk ไม่เห็น sales.* |
| `reports.sales` | รายงานยอดขาย | ✓ |  |  |  |
| `reports.commissions` | รายงานค่ามือ | ✓ |  |  |  |
| `reports.occupancy` | Occupancy | ✓ |  |  |  |
| `exports.csv` | Export CSV (customers \| pets \| bills \| bill_lines \| commissions \| bookings) | ✓ |  |  |  |
| `audit.list` | Audit log | ✓ |  |  |  |
| `feedback.create` | แจ้งปัญหา/ขอ feature | ✓ | ✓ | ✓ |  |

## ข้อจำกัดระดับแถว/ฟิลด์

- role `staff`: groom.start/finish เฉพาะนัดที่ตนเป็น groomer; reportCards เห็นเฉพาะของตน; customers.get / calendar ไม่เห็นข้อมูลติดต่อ
- `front_desk`: ส่วนลดรวมต่อบิล ≤ 20% ของ subtotal (R-15) ไม่งั้น `DISCOUNT_LIMIT_EXCEEDED`; ไม่เห็นยอดขายใน dashboard
- ลูกค้า (LIFF): เข้าถึงเฉพาะ customer/pets/bookings ของตัวเองในร้านนั้น — ทุก query กรอง `customer_id = session.customerId`
- Platform admin: ไม่มีสิทธิ์เขียนข้อมูลร้าน ยกเว้น line_channel/สถานะร้าน; ดูข้อมูลร้านผ่าน support mode (อ่านอย่างเดียว + audit)

