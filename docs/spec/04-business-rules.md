# 04 — Business Rules + Test Vectors

> **กติกาสำหรับ AI agent:** ฟังก์ชันใน `packages/domain` ต้อง pure (ไม่แตะ DB/เวลา/สุ่ม — รับ `now` เป็น input) และ signature ตรงตามที่เขียนไว้ทุกตัวอักษร
> เทสต์ของแต่ละ rule = วนอ่าน `docs/spec/vectors/<R-xx>.<export>.json` แล้ว `expect(fn(c.input)).toEqual(c.expected)` — **ห้ามแก้ไฟล์ vectors** (CI ปฏิเสธ PR ที่แก้ ถ้าไม่มี label `spec-change` ที่มนุษย์อนุมัติ)
> ถ้าคิดว่า vector ผิด: หยุด, เขียนเหตุผลใน `docs/questions.md`, ไม่ต้องทำให้เทสต์ผ่านด้วยการเลี่ยง

## สารบัญ

| Rule | ชื่อ | Module | Exports | Vectors | Stories |
|---|---|---|---|---|---|
| [R-01](#r-01) | หาขนาด (size tier) จากน้ำหนัก | `packages/domain/src/pricing/size-tier.ts` | `resolveSizeTier` | 8 | US-04-02, US-11-03 |
| [R-02](#r-02) | กลุ่มขนและการหาราคา/เวลาของบริการ | `packages/domain/src/pricing/price-lookup.ts` | `coatGroupOf`, `lookupServicePrice` | 14 | US-04-02, US-04-03 |
| [R-03](#r-03) | ราคาประเมินและเวลาของใบจอง | `packages/domain/src/pricing/quote.ts` | `quoteBooking` | 5 | US-05-04, US-11-03, US-11-04, US-11-05, US-06-06 |
| [R-04](#r-04) | Slot engine กรูม (เวลาว่าง + เลือกช่าง/โต๊ะอัตโนมัติ) | `packages/domain/src/availability/groom-slots.ts` | `computeGroomSlots` | 12 | US-05-01, US-05-04, US-11-03, US-05-08 |
| [R-05](#r-05) | อ่าน QR บนสลิป + จับสลิปซ้ำ | `packages/domain/src/payment/slip.ts` | `parseSlipQr`, `findDuplicateSlip` | 10 | US-07-02, US-11-07 |
| [R-06](#r-06) | คำนวณมัดจำ | `packages/domain/src/payment/deposit.ts` | `computeDeposit` | 10 | US-07-03, US-11-03, US-03-09 |
| [R-07](#r-07) | ผลของการยกเลิก / no-show (ริบ-คืน-เครดิต) | `packages/domain/src/payment/cancellation.ts` | `computeCancellation` | 9 | US-07-04, US-07-05, US-07-07, US-11-08, US-05-08 |
| [R-08](#r-08) | เวลาหมดอายุของการล็อกคิวและการรออนุมัติ | `packages/domain/src/booking/deadlines.ts` | `computeBookingDeadlines` | 4 | US-05-02, US-05-05, US-11-07 |
| [R-09](#r-09) | ระดับความน่าเชื่อถือลูกค้า (1–4) | `packages/domain/src/customer/reliability.ts` | `computeReliability` | 8 | US-03-09, US-07-07 |
| [R-10](#r-10) | จัดห้องอัตโนมัติ (room unit allocation) | `packages/domain/src/availability/room-allocation.ts` | `allocateRoom` | 5 | US-06-03, US-11-04 |
| [R-11](#r-11) | ตรวจวัคซีนก่อนรับฝาก (vaccine gate) | `packages/domain/src/pet/vaccine-gate.ts` | `checkVaccines` | 7 | US-06-05, US-11-04, US-11-05 |
| [R-12](#r-12) | เงื่อนไขรับจอง (ลูกค้า/น้อง/ประเภทห้อง) | `packages/domain/src/booking/eligibility.ts` | `checkEligibility`, `ageInMonths` | 13 | US-06-01, US-11-03, US-11-04, US-03-11 |
| [R-13](#r-13) | ค่ามือ (commission) | `packages/domain/src/commission/commission.ts` | `computeCommissions` | 4 | US-09-02, US-09-05, US-12-03 |
| [R-14](#r-14) | แพ็กเกจ: มูลค่าต่อครั้ง วันหมดอายุ และสิทธิ์ใช้ | `packages/domain/src/package/package.ts` | `packageTerms`, `canRedeemPackage` | 10 | US-10-05, US-10-06, US-08-03 |
| [R-15](#r-15) | ยอดบิล ส่วนลด และการรับชำระ | `packages/domain/src/billing/totals.ts` | `computeBillTotals`, `applyPayment` | 10 | US-08-01, US-08-02, US-08-03, US-08-04 |
| [R-16](#r-16) | เลขที่ใบเสร็จ | `packages/domain/src/ids/receipt-no.ts` | `nextReceiptNo` | 3 | US-08-05 |
| [R-17](#r-17) | วันครบรอบกรูมถัดไป | `packages/domain/src/aftercare/next-groom.ts` | `nextGroomDue` | 7 | US-10-04 |
| [R-18](#r-18) | โควตาข้อความ LINE (push) และโหมดประหยัด | `packages/domain/src/notify/line-quota.ts` | `decideLinePush` | 8 | US-13-06, US-02-06 |
| [R-19](#r-19) | เลือกช่องทางส่งข้อความ | `packages/domain/src/notify/channel.ts` | `selectChannel` | 7 | US-13-05, US-13-06, US-09-04 |
| [R-20](#r-20) | เวลาและวันที่ท้องถิ่น | `packages/domain/src/time/local-time.ts` | `toLocalDate`, `localToUtc`, `localDayBounds` | 5 | US-13-03 |
| [R-21](#r-21) | สิทธิ์ลูกค้าเลื่อน/ยกเลิกเอง | `packages/domain/src/booking/self-service.ts` | `customerSelfService` | 5 | US-11-08 |
| [R-22](#r-22) | เบอร์โทร: normalize และแสดงผล | `packages/domain/src/format/phone.ts` | `normalizePhone`, `formatPhone` | 16 | US-03-01, US-03-10, US-11-01 |
| [R-23](#r-23) | เลขที่ใบจอง | `packages/domain/src/ids/booking-no.ts` | `nextBookingNo` | 3 | US-05-04, US-11-03 |
| [R-24](#r-24) | ล็อกบัญชีเมื่อใส่รหัสผิด + นโยบายรหัสผ่าน | `packages/domain/src/auth/lockout.ts` | `loginAttempt`, `checkPasswordPolicy` | 9 | US-01-02 |
| [R-25](#r-25) | ข้อจำกัดการอัปโหลดไฟล์ | `packages/domain/src/files/upload-policy.ts` | `validateUpload` | 6 | US-13-04, US-03-06, US-07-02 |
| [R-26](#r-26) | สร้างงานดูแลรายวัน (care tasks) | `packages/domain/src/care/care-tasks.ts` | `generateCareTasks` | 2 | US-06-09, US-06-08 |
| [R-27](#r-27) | Audit log — การกระทำที่ต้องบันทึก | `packages/server/src/audit.ts` | — | 0 | US-13-07, US-13-11 |
| [R-28](#r-28) | ห้องว่างของประเภทห้อง (hotel availability) | `packages/domain/src/availability/hotel-availability.ts` | `hotelAvailability` | 3 | US-06-03, US-11-04, US-06-04 |
| [R-29](#r-29) | ที่ว่าง Daycare | `packages/domain/src/availability/daycare-availability.ts` | `daycareAvailability` | 5 | US-06-13, US-11-05 |
| [R-30](#r-30) | PromptPay QR (EMVCo payload) | `packages/domain/src/payment/promptpay.ts` | `promptPayPayload` | 5 | US-07-01, US-07-08, US-08-04 |
| [R-31](#r-31) | รูปแบบการแสดงผลไทย (เงิน วันที่ เวลา น้ำหนัก) | `packages/domain/src/format/thai.ts` | `formatTHB`, `formatThaiDate`, `formatTime`, `formatWeight` | 14 | US-13-03 |

<a id="R-01"></a>

## R-01

### หาขนาด (size tier) จากน้ำหนัก

Stories: US-04-02, US-11-03 · Module: `packages/domain/src/pricing/size-tier.ts`

เลือก size_tier ของสาขาตามชนิดสัตว์และน้ำหนักล่าสุด (`pet.latest_weight_grams`)

```ts
type SizeTierInput = { species: "dog" | "cat" | "other"; weightGrams: number | null;
  tiers: { id: string; species: "dog" | "cat"; code: string; minWeightGrams: number; maxWeightGrams: number | null }[] };
type SizeTierResult = { tierId: string | null; reason: "matched" | "no_weight" | "no_tier" };
export function resolveSizeTier(input: SizeTierInput): SizeTierResult;
```

**อัลกอริทึม**

1. species = other → `no_tier` (สัตว์อื่นใช้ราคาแถวที่ size_tier_id = null เท่านั้น)
2. weightGrams = null → `no_weight` (LIFF ให้ลูกค้าเลือกขนาดเอง / หน้าร้านต้องชั่งก่อน)
3. เรียง tier ของ species นั้นตาม min แล้วหาแถวแรกที่ `min ≤ w < max` (max = null คือไม่มีเพดาน)
4. ไม่เจอ → `no_tier`

**หมายเหตุ**

- ขอบบน exclusive: 6000 g อยู่ M ไม่ใช่ S
- การตั้ง tier ต้องไม่ซ้อนกัน — validate ตอนบันทึก tier (error `SIZE_TIER_OVERLAP`)

**Vectors `resolveSizeTier`** → `docs/spec/vectors/R-01.resolveSizeTier.json` (8 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | dog 5.2 kg → S | `{"tierId": "t-s", "reason": "matched"}` |
| 2 | lower bound inclusive 6000 → M | `{"tierId": "t-m", "reason": "matched"}` |
| 3 | 2999 → XS | `{"tierId": "t-xs", "reason": "matched"}` |
| 4 | no ceiling 40 kg → XL | `{"tierId": "t-xl", "reason": "matched"}` |
| 5 | cat uses cat tiers | `{"tierId": "c-l", "reason": "matched"}` |
| 6 | no weight | `{"tierId": null, "reason": "no_weight"}` |
| 7 | species other | `{"tierId": null, "reason": "no_tier"}` |
| 8 | no tier configured for cat | `{"tierId": null, "reason": "no_tier"}` |

<a id="R-02"></a>

## R-02

### กลุ่มขนและการหาราคา/เวลาของบริการ

Stories: US-04-02, US-04-03 · Module: `packages/domain/src/pricing/price-lookup.ts`

แปลง `pet.coat_type` → coat group แล้วหาแถว `service_price` (rate plan default ของสาขา) ตามลำดับความเฉพาะเจาะจง

```ts
type CoatType = "short" | "long" | "double" | "curly" | "wire" | "hairless" | "unknown";
type CoatGroup = "short" | "long" | "any";
export function coatGroupOf(input: { coatType: CoatType }): CoatGroup;
type PriceRow = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; priceSatang: number; durationMinutes: number };
type PriceLookupInput = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; prices: PriceRow[] };
type PriceLookupResult = { priceSatang: number; durationMinutes: number;
  matched: "tier+coat" | "tier+any" | "all+coat" | "all+any" } | null;
export function lookupServicePrice(input: PriceLookupInput): PriceLookupResult;
```

**อัลกอริทึม**

1. coat group: short/hairless/wire → `short`; long/double/curly → `long`; unknown → `any`
2. ลำดับค้นหา: (tier, coat) → (tier, any) → (null, coat) → (null, any) — ข้ามขั้นที่ใช้ coat เมื่อ coatGroup = any และข้ามขั้นที่ใช้ tier เมื่อ sizeTierId = null
3. ไม่เจอ → `null` → API ตอบ `PRICE_NOT_FOUND` (บริการนี้ไม่เปิดให้ขนาด/ขนนี้)

**หมายเหตุ**

- prices ที่ส่งเข้ามาต้องกรอง rate_plan เป็นแผน default ของสาขาแล้ว (MVP มีแผนเดียว)

**Vectors `coatGroupOf`** → `docs/spec/vectors/R-02.coatGroupOf.json` (7 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | short | `"short"` |
| 2 | long | `"long"` |
| 3 | double | `"long"` |
| 4 | curly | `"long"` |
| 5 | wire | `"short"` |
| 6 | hairless | `"short"` |
| 7 | unknown | `"any"` |

**Vectors `lookupServicePrice`** → `docs/spec/vectors/R-02.lookupServicePrice.json` (7 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | exact tier+coat | `{"priceSatang": 45000, "durationMinutes": 75, "matched": "tier+coat"}` |
| 2 | tier with 'any' row | `{"priceSatang": 55000, "durationMinutes": 90, "matched": "tier+any"}` |
| 3 | fallback to all sizes | `{"priceSatang": 60000, "durationMinutes": 90, "matched": "all+any"}` |
| 4 | unknown coat skips coat rows | `{"priceSatang": 60000, "durationMinutes": 90, "matched": "all+any"}` |
| 5 | no size → all-size row | `{"priceSatang": 10000, "durationMinutes": 10, "matched": "all+any"}` |
| 6 | not offered for short coat | `null` |
| 7 | not offered without size | `null` |

<a id="R-03"></a>

## R-03

### ราคาประเมินและเวลาของใบจอง

Stories: US-05-04, US-11-03, US-11-04, US-11-05, US-06-06 · Module: `packages/domain/src/pricing/quote.ts`

คำนวณยอดประเมิน `booking.estimated_total_satang` และเวลา `ends_at`/`blocked_until` ของแต่ละนัด

```ts
type QuoteInput = { bufferMinutes: number;
  groom?: { startsAt: string; items: { priceSatang: number; durationMinutes: number }[] }[];
  stays?: { checkInDate: string; checkOutDate: string; nightlyPriceSatang: number;
            addons?: { unitPriceSatang: number; perDay: boolean; quantity?: number }[] }[];
  daycare?: { priceSatang: number }[] };
type QuoteResult = { groom: { servicesTotalSatang: number; durationMinutes: number; endsAt: string; blockedUntil: string }[];
  stays: { nights: number; roomTotalSatang: number; addons: { quantity: number; totalSatang: number }[]; addonsTotalSatang: number }[];
  daycareTotalSatang: number; estimatedTotalSatang: number } | { error: "DURATION_ZERO" | "INVALID_DATE_RANGE" };
export function quoteBooking(input: QuoteInput): QuoteResult;
```

**อัลกอริทึม**

1. กรูมต่อ 1 ตัว: ราคา = Σ priceSatang ของ items (บริการหลัก + add-on), เวลา = Σ durationMinutes; เวลา = 0 → `DURATION_ZERO`
2. `endsAt = startsAt + duration`, `blockedUntil = endsAt + branch_policy.buffer_minutes`
3. พัก: nights = check_out_date − check_in_date (≥ 1 ไม่งั้น `INVALID_DATE_RANGE`), room = nights × nightly price
4. add-on ของการพัก: perDay → quantity = nights, ไม่ใช่ perDay → quantity ที่ส่งมา (default 1)
5. Daycare: ราคาต่อรอบ (daycare_rate) ต่อ 1 ตัว 1 วัน
6. estimated = Σ ทุกส่วน — ยังไม่หักมัดจำ/ส่วนลด (ส่วนลดทำตอนปิดบิล R-15)

**หมายเหตุ**

- ราคา snapshot ลง `groom_appointment_item.price_satang`, `stay.nightly_price_satang`, `stay_addon.unit_price_satang`, `daycare_visit.price_satang` ตอนสร้าง — ห้ามคำนวณใหม่จาก catalog ภายหลัง

**Vectors `quoteBooking`** → `docs/spec/vectors/R-03.quoteBooking.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | two pets grooming | `{"groom": [{"servicesTotalSatang": 55000, "durationMinutes": 85, "endsAt": "2026-10-05T04:25:00.000Z", "blockedUntil": "2026-10-05T04:35:…` |
| 2 | stay 3 nights + per-day addon + one-off addon | `{"groom": [], "stays": [{"nights": 3, "roomTotalSatang": 150000, "addons": [{"quantity": 3, "totalSatang": 15000}, {"quantity": 1, "total…` |
| 3 | stay + groom bundle + daycare | `{"groom": [{"servicesTotalSatang": 45000, "durationMinutes": 75, "endsAt": "2026-10-13T05:15:00.000Z", "blockedUntil": "2026-10-13T05:30:…` |
| 4 | zero duration rejected | `{"error": "DURATION_ZERO"}` |
| 5 | same-day stay rejected | `{"error": "INVALID_DATE_RANGE"}` |

<a id="R-04"></a>

## R-04

### Slot engine กรูม (เวลาว่าง + เลือกช่าง/โต๊ะอัตโนมัติ)

Stories: US-05-01, US-05-04, US-11-03, US-05-08 · Module: `packages/domain/src/availability/groom-slots.ts`

คืนเวลาเริ่มที่จองได้ของน้อง 1 ตัวในวันที่เลือก พร้อมช่างและโต๊ะที่ระบบเลือกให้ — ต้องให้ผลสอดคล้องกับ exclusion constraint ใน DB เสมอ

```ts
type SlotInput = { date: string; timezone: string; now: string; channel: "online" | "staff";
  policy: { slotStepMinutes: number; bufferMinutes: number; bookingLeadMinutes: number; bookingHorizonDays: number;
            maxAppointmentsPerDay: number | null; maxAppointmentsPerGroomerDay: number | null };
  branchHours: { isClosed: boolean; opensAt: string | null; closesAt: string | null };
  closures: { startsAt: string; endsAt: string; scope: "all" | "grooming" | "hotel" | "daycare" }[];
  stationIds: string[];                       // active stations ordered by sort_order
  groomers: { id: string; sortOrder: number;
              workingHours: { startsAt: string; endsAt: string; breakStartsAt: string | null; breakEndsAt: string | null } | null;
              timeOff: { startsAt: string; endsAt: string }[] }[];
  appointments: { groomerId: string; stationId: string; startsAt: string; blockedUntil: string }[]; // active, same local day
  durationMinutes: number;
  groomerPreference: { type: "any" } | { type: "specific"; groomerId: string } };
type SlotResult = { slots: { startsAt: string; groomerId: string; stationId: string }[];
  reason: "ok" | "closed" | "past" | "beyond_horizon" | "day_full" | "no_capacity" };
export function computeGroomSlots(input: SlotInput): SlotResult;
```

**อัลกอริทึม**

1. วันปิด (`branch_hours.is_closed`) → `closed`; online: วันที่ < วันนี้ → `past`, เกิน `booking_horizon_days` → `beyond_horizon`; จำนวนนัดทั้งวัน ≥ `max_appointments_per_day` → `day_full`
2. เวลาเริ่มที่เป็นไปได้ t = opensAt + k × slot_step โดยงานต้องจบภายในเวลาปิด (`t + duration ≤ closesAt`); buffer เลยเวลาปิดได้
3. online: ตัด t < now + booking_lead_minutes; staff: ตัด slot ที่ช่วง step ผ่านไปแล้วทั้งช่วง (`t + step ≤ now`) — walk-in ลงช่วงปัจจุบันได้
4. ช่วงทำงาน W = [t, t+duration) ห้ามทับ closure ที่ scope = all/grooming
5. ช่วงกัน B = [t, t+duration+buffer) — โต๊ะ: เลือกโต๊ะแรกตาม sort_order ที่ไม่มีนัด [startsAt, blockedUntil) ทับ B
6. ช่างที่มีสิทธิ์: มี working hours วันนั้น, W อยู่ในเวลางานทั้งหมด, W ไม่ทับเวลาพักและ time off, B ไม่ทับนัดของช่างคนนั้น, จำนวนนัดของช่าง < max ต่อวัน
7. preference = specific → พิจารณาเฉพาะช่างคนนั้น; any → เลือกช่างที่ booked minutes (Σ blockedUntil−startsAt) น้อยสุดในวันนั้น, เสมอกันใช้ sortOrder แล้ว id
8. ผลเรียงตาม startsAt; ว่างทั้งหมด → reason `no_capacity`

**หมายเหตุ**

- ทุกเวลาเป็น UTC ISO; working hours/branch hours เป็นเวลาท้องถิ่นของ `date` แปลงด้วย R-20
- หลายตัวในใบจองเดียว: เรียกทีละตัว โดยใส่นัดของตัวก่อนหน้า (ที่ยังไม่บันทึก) ลงใน `appointments`
- ตอนบันทึกจริง ถ้า DB ตอบ `23P01` (มีคนจองตัดหน้า) → API ตอบ `SLOT_TAKEN` และ UI โหลด slot ใหม่
- การเลือกช่างไม่ดูทักษะใน MVP (ช่างทุกคนที่ is_groomer ทำได้ทุกบริการ)

**Vectors `computeGroomSlots`** → `docs/spec/vectors/R-04.computeGroomSlots.json` (12 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | any groomer, next day, online | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 2 | specific groomer g-b | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 3 | same day online respects 120 min lead | `{"slots": [{"startsAt": "2026-10-05T04:30:00.000Z", "groomerId": "g-b", "stationId": "st-1"}, {"startsAt": "2026-10-05T05:00:00.000Z", "g…` |
| 4 | closure 15:00-18:00 for grooming | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 5 | hotel-only closure is ignored | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 6 | single station shared by both groomers | `{"slots": [{"startsAt": "2026-10-05T04:00:00.000Z", "groomerId": "g-b", "stationId": "st-1"}, {"startsAt": "2026-10-05T08:00:00.000Z", "g…` |
| 7 | branch closed | `{"slots": [], "reason": "closed"}` |
| 8 | specific groomer on time off | `{"slots": [], "reason": "no_capacity"}` |
| 9 | staff walk-in at 10:07 can take the 10:00 slot | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 10 | max 1 appointment per groomer | `{"slots": [{"startsAt": "2026-10-05T03:00:00.000Z", "groomerId": "g-b", "stationId": "st-2"}, {"startsAt": "2026-10-05T03:30:00.000Z", "g…` |
| 11 | max per day reached | `{"slots": [], "reason": "day_full"}` |
| 12 | beyond horizon | `{"slots": [], "reason": "beyond_horizon"}` |

<a id="R-05"></a>

## R-05

### อ่าน QR บนสลิป + จับสลิปซ้ำ

Stories: US-07-02, US-11-07 · Module: `packages/domain/src/payment/slip.ts`

สลิปธนาคารไทยมี mini-QR (TLV แบบ EMVCo) ที่มีเลขอ้างอิงธุรกรรม — ใช้จับสลิปเดิมที่ถูกส่งซ้ำ (ไม่ใช่การยืนยันว่าเงินเข้าจริง; ร้านต้องเช็คบัญชีเองเสมอ)

```ts
type SlipQr = { bankCode: string | null; transRef: string; crcValid: boolean } | null;
export function parseSlipQr(input: { payload: string }): SlipQr;
export function findDuplicateSlip(input: { transRef: string | null;
  existing: { id: string; transRef: string | null; status: "submitted" | "verified" | "rejected"; createdAt: string }[] }):
  { duplicateOfSlipId: string | null };
```

**อัลกอริทึม**

1. ฝั่ง client ถอด QR จากรูปสลิปด้วยไลบรารีฟรี (เช่น jsQR / zxing) แล้วส่ง `qrPayload` มากับการอัปโหลด — อ่านไม่ได้ส่ง null
2. parse TLV ชั้นนอก (tag 2 หลัก + ความยาว 2 หลัก) ต้องมี tag `00` และ `91`; tag `00` ข้างในมี `01` = รหัสธนาคารผู้โอน, `02` = เลขอ้างอิง (transRef)
3. CRC16-CCITT (tag 91) ไม่ตรง → ยัง parse ได้ แต่ `crcValid = false` (รูปแบบจริงของแต่ละธนาคารยืนยันใน SP-02)
4. ซ้ำ = มีสลิปในองค์กรเดียวกันที่ transRef เท่ากันและสถานะไม่ใช่ rejected → เก็บ `payment_slip.duplicate_of_slip_id` และ UI แสดงป้ายแดง "สลิปนี้เคยใช้แล้ว"
5. สลิปซ้ำยังบันทึกได้ (สถานะ submitted) แต่ปุ่ม "ยืนยัน" ต้องกดยืนยันซ้ำ 2 ชั้น

**หมายเหตุ**

- ⚠️ รูปแบบ payload ในเวกเตอร์สร้างตามโครงสร้างที่คาดไว้ — SP-02 ต้องเพิ่มเวกเตอร์จากสลิปจริง ≥ 6 ธนาคาร (มนุษย์อนุมัติ) ก่อนปิด US-07-02

**Vectors `parseSlipQr`** → `docs/spec/vectors/R-05.parseSlipQr.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | KBank-style payload | `{"bankCode": "004", "transRef": "014242082547BPM04988"}` |
| 2 | SCB-style payload | `{"bankCode": "014", "transRef": "202610051030451234"}` |
| 3 | tampered CRC is flagged, still parsed | `null` |
| 4 | not a slip QR (PromptPay payment QR) | `null` |
| 5 | garbage | `null` |

**Vectors `findDuplicateSlip`** → `docs/spec/vectors/R-05.findDuplicateSlip.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | first time | `{"duplicateOfSlipId": null}` |
| 2 | duplicate of verified slip | `{"duplicateOfSlipId": "slip-1"}` |
| 3 | rejected slip does not count | `{"duplicateOfSlipId": null}` |
| 4 | earliest match wins | `{"duplicateOfSlipId": "slip-2"}` |
| 5 | no QR read | `{"duplicateOfSlipId": null}` |

<a id="R-06"></a>

## R-06

### คำนวณมัดจำ

Stories: US-07-03, US-11-03, US-03-09 · Module: `packages/domain/src/payment/deposit.ts`

มัดจำต่อ 1 ใบจอง (ไม่ใช่ต่อตัว) จากนโยบายสาขา (`branch_policy.default_deposit_*`) และระดับความน่าเชื่อถือ (R-09)

```ts
type DepositInput = { estimatedTotalSatang: number; policy: { type: "none" | "fixed" | "percent"; value: number };
  customer: { depositExempt: boolean; reliabilityLevel: 1 | 2 | 3 | 4 } };
export function computeDeposit(input: DepositInput): { depositRequiredSatang: number;
  reason: "exempt" | "reliability_full_prepay" | "reliability_min_30" | "policy_none" | "policy_fixed" | "policy_percent" };
```

**อัลกอริทึม**

1. `customer.deposit_exempt` → 0 เสมอ
2. ระดับ 1 (เสี่ยงสูง) → มัดจำ = ยอดประเมินเต็ม (จ่ายล่วงหน้าทั้งหมด) และใบจองต้องรออนุมัติ (R-08)
3. percent: `ceil(total × pct / 10000) × 100` = ปัดขึ้นเป็นบาทเต็ม (integer math เท่านั้น) แล้วไม่เกิน total
4. fixed: `min(value, total)`
5. ระดับ 2 (เฝ้าระวัง): อย่างน้อย 30% ของ total (ปัดขึ้นบาทเต็ม) แม้นโยบายเป็น none หรือต่ำกว่า 30%
6. ผลเป็น 0 → `booking.deposit_status = not_required`

**หมายเหตุ**

- ร้านลงนัดเอง (walk-in/โทร/แชท): ใช้ค่านี้เป็นค่าเริ่มต้น แต่หน้าร้านแก้เป็น 0 ได้พร้อมเหตุผล (เข้า audit_log `booking.deposit_waived`)

**Vectors `computeDeposit`** → `docs/spec/vectors/R-06.computeDeposit.json` (10 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | policy none | `{"depositRequiredSatang": 0, "reason": "policy_none"}` |
| 2 | percent 30 exact | `{"depositRequiredSatang": 25500, "reason": "policy_percent"}` |
| 3 | percent 30 rounds up to whole baht | `{"depositRequiredSatang": 37100, "reason": "policy_percent"}` |
| 4 | fixed larger than total | `{"depositRequiredSatang": 15000, "reason": "policy_fixed"}` |
| 5 | fixed | `{"depositRequiredSatang": 20000, "reason": "policy_fixed"}` |
| 6 | exempt wins | `{"depositRequiredSatang": 0, "reason": "exempt"}` |
| 7 | level 1 full prepay | `{"depositRequiredSatang": 80000, "reason": "reliability_full_prepay"}` |
| 8 | level 2 with policy none → 30% | `{"depositRequiredSatang": 25500, "reason": "reliability_min_30"}` |
| 9 | level 2 keeps higher policy | `{"depositRequiredSatang": 42500, "reason": "policy_percent"}` |
| 10 | level 2 raises low fixed | `{"depositRequiredSatang": 30000, "reason": "reliability_min_30"}` |

<a id="R-07"></a>

## R-07

### ผลของการยกเลิก / no-show (ริบ-คืน-เครดิต)

Stories: US-07-04, US-07-05, US-07-07, US-11-08, US-05-08 · Module: `packages/domain/src/payment/cancellation.ts`

ใช้ `booking.policy_snapshot` (นโยบาย ณ เวลาจอง) เสมอ — ไม่ใช้นโยบายปัจจุบันของร้าน

```ts
type CancelInput = { now: string; firstServiceAt: string; modules: ("grooming" | "hotel" | "daycare")[];
  kind: "customer_cancel" | "shop_cancel" | "no_show"; depositVerifiedSatang: number;
  policySnapshot: { groomingFreeCancelHours: number; hotelFreeCancelHours: number; daycareFreeCancelHours: number;
                    lateCancelForfeitPercent: number; cancelRefundMode: "refund" | "credit" | "customer_choice" };
  customerChoice?: "refund" | "credit" };
type CancelResult = { isLate: boolean; minutesBefore: number; freeCancelHours: number; forfeitSatang: number;
  returnSatang: number; returnMode: "refund" | "credit" | "none" | null };
export function computeCancellation(input: CancelInput): CancelResult;
```

**อัลกอริทึม**

1. minutesBefore = floor((firstServiceAt − now) / 60 000) — `booking.first_service_at` คือบริการแรกของใบจอง
2. ใบจองหลายโมดูล: freeCancelHours = ค่าที่มากที่สุดของโมดูลในใบจอง (เข้มสุด)
3. customer_cancel (ลูกค้ายกเลิกเอง หรือร้านยกเลิกตามคำขอลูกค้า): late ถ้า minutesBefore < freeCancelHours × 60; forfeit = late ? floor(deposit × pct / 100) : 0
4. shop_cancel (ร้านเป็นฝ่ายยกเลิก): ไม่ริบ, คืนเต็ม, mode = refund (หรือ credit ถ้าลูกค้าเลือก)
5. no_show: ริบมัดจำทั้งหมด (100%) ไม่ขึ้นกับ pct
6. return = deposit − forfeit; mode ตาม `cancel_refund_mode` (customer_choice → ตามที่ลูกค้าเลือก, ไม่เลือก = credit); return = 0 → `none`

**หมายเหตุ**

- ผล: credit → เขียน `credit_ledger` (+) reason `cancellation_credit` และอัปเดต `customer.credit_balance_satang` ใน transaction เดียวกัน
- refund → สร้าง `refund` สถานะรอโอน (ร้านโอนคืนเองแล้วแนบหลักฐาน); booking.deposit_status = refunded / credited / forfeited
- late cancel และ no-show นับเข้า `customer.late_cancel_count_12m` / `no_show_count_12m` แล้วคำนวณ R-09 ใหม่

**Vectors `computeCancellation`** → `docs/spec/vectors/R-07.computeCancellation.json` (9 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 30h before grooming → full credit | `{"isLate": false, "minutesBefore": 1800, "freeCancelHours": 24, "forfeitSatang": 0, "returnSatang": 30000, "returnMode": "credit"}` |
| 2 | 1 minute inside window → forfeit all | `{"isLate": true, "minutesBefore": 1439, "freeCancelHours": 24, "forfeitSatang": 30000, "returnSatang": 0, "returnMode": "none"}` |
| 3 | exactly 24h before is not late | `{"isLate": false, "minutesBefore": 1440, "freeCancelHours": 24, "forfeitSatang": 0, "returnSatang": 30000, "returnMode": "credit"}` |
| 4 | late with 50% forfeit, odd amount | `{"isLate": true, "minutesBefore": 420, "freeCancelHours": 24, "forfeitSatang": 16666, "returnSatang": 16667, "returnMode": "credit"}` |
| 5 | hotel rule (72h) dominates mixed booking | `{"isLate": true, "minutesBefore": 2880, "freeCancelHours": 72, "forfeitSatang": 30000, "returnSatang": 0, "returnMode": "none"}` |
| 6 | shop cancels 1h before | `{"isLate": false, "minutesBefore": 60, "freeCancelHours": 24, "forfeitSatang": 0, "returnSatang": 30000, "returnMode": "refund"}` |
| 7 | no-show forfeits everything | `{"isLate": true, "minutesBefore": -60, "freeCancelHours": 24, "forfeitSatang": 30000, "returnSatang": 0, "returnMode": "none"}` |
| 8 | customer_choice → refund | `{"isLate": false, "minutesBefore": 4320, "freeCancelHours": 24, "forfeitSatang": 0, "returnSatang": 30000, "returnMode": "refund"}` |
| 9 | no deposit | `{"isLate": true, "minutesBefore": 420, "freeCancelHours": 24, "forfeitSatang": 0, "returnSatang": 0, "returnMode": "none"}` |

<a id="R-08"></a>

## R-08

### เวลาหมดอายุของการล็อกคิวและการรออนุมัติ

Stories: US-05-02, US-05-05, US-11-07 · Module: `packages/domain/src/booking/deadlines.ts`

กำหนด `booking.hold_expires_at` และ `booking.approval_due_at` ตอนลูกค้าสร้างใบจองออนไลน์

```ts
export function computeBookingDeadlines(input: { createdAt: string; depositRequiredSatang: number; requiresApproval: boolean;
  holdMinutes: number; approvalTimeoutMinutes: number }): { holdExpiresAt: string | null; approvalDueAt: string | null };
```

**อัลกอริทึม**

1. ต้องจ่ายมัดจำ → hold_expires_at = createdAt + hold_minutes (สถานะ awaiting_deposit) และตั้ง job `expire_hold` ที่เวลานั้น
2. ต้องอนุมัติ (`auto_confirm_*` = false ของโมดูลใดโมดูลหนึ่ง หรือ reliability = 1) → approval_due_at = createdAt + approval_timeout_minutes และตั้ง job `approval_overdue`
3. ลูกค้าส่งสลิปก่อนหมดเวลา → สถานะ deposit_review และล้าง hold_expires_at (คิวยังถูกกันไว้จนร้านตรวจ)
4. ร้านปฏิเสธสลิป → กลับ awaiting_deposit พร้อม hold ใหม่ = now + hold_minutes (โอกาสแก้ 1 ครั้ง; ปฏิเสธครั้งที่ 2 → expired)
5. job `expire_hold` ทำงานเฉพาะเมื่อสถานะยังเป็น awaiting_deposit และ hold_expires_at ≤ now (idempotent)

**หมายเหตุ**

- ร้านลงนัดเอง (channel walk_in/phone/chat) ไม่มี hold — สถานะ confirmed ทันที แม้มีมัดจำค้าง (deposit_status = pending)

**Vectors `computeBookingDeadlines`** → `docs/spec/vectors/R-08.computeBookingDeadlines.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | deposit only | `{"holdExpiresAt": "2026-10-05T03:15:00.000Z", "approvalDueAt": null}` |
| 2 | approval only | `{"holdExpiresAt": null, "approvalDueAt": "2026-10-05T05:00:00.000Z"}` |
| 3 | both | `{"holdExpiresAt": "2026-10-05T03:30:00.000Z", "approvalDueAt": "2026-10-05T04:00:00.000Z"}` |
| 4 | neither → confirmed immediately | `{"holdExpiresAt": null, "approvalDueAt": null}` |

<a id="R-09"></a>

## R-09

### ระดับความน่าเชื่อถือลูกค้า (1–4)

Stories: US-03-09, US-07-07 · Module: `packages/domain/src/customer/reliability.ts`

ระดับเก็บใน `customer.reliability_level` (ค่าที่ใช้จริง = override ถ้ามี); นับย้อนหลัง 12 เดือนจากวันนี้

```ts
export function computeReliability(input: { noShowCount12m: number; lateCancelCount12m: number; completedVisits12m: number;
  override: 1 | 2 | 3 | 4 | null }): { level: 1 | 2 | 3 | 4; source: "override" | "computed" };
```

**อัลกอริทึม**

1. override มีค่า → ใช้ override
2. no-show ≥ 2 หรือ (no-show ≥ 1 และ late cancel ≥ 2) → 1 เสี่ยงสูง
3. no-show = 1 หรือ late cancel ≥ 2 → 2 เฝ้าระวัง
4. มาใช้บริการสำเร็จ ≥ 5 ครั้ง และไม่มี late cancel/no-show → 4 ดีเยี่ยม
5. นอกนั้น → 3 ปกติ (ค่าเริ่มต้นลูกค้าใหม่)
6. ผลต่อระบบ: 1 → มัดจำเต็ม + ต้องอนุมัติ (R-06/R-08); 2 → มัดจำ ≥ 30%; 3/4 → ปกติ (4 แสดงป้าย ⭐ เท่านั้น)

**หมายเหตุ**

- completed = นัด/การพัก/daycare ที่บิลปิดสถานะ paid; คำนวณใหม่เมื่อ: กด no-show, late cancel, ปิดบิล, และ job `recompute_reliability` ทุกคืน 03:00 (ให้นับ 12 เดือนเลื่อนออก)
- blacklisted แยกจากระดับ: blacklisted → จองออนไลน์ไม่ได้ (R-12) ไม่ว่าระดับใด

**Vectors `computeReliability`** → `docs/spec/vectors/R-09.computeReliability.json` (8 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | new customer | `{"level": 3, "source": "computed"}` |
| 2 | 1 no-show | `{"level": 2, "source": "computed"}` |
| 3 | 2 late cancels | `{"level": 2, "source": "computed"}` |
| 4 | 2 no-shows | `{"level": 1, "source": "computed"}` |
| 5 | 1 no-show + 2 late | `{"level": 1, "source": "computed"}` |
| 6 | loyal | `{"level": 4, "source": "computed"}` |
| 7 | loyal but 1 late | `{"level": 3, "source": "computed"}` |
| 8 | override wins | `{"level": 3, "source": "override"}` |

<a id="R-10"></a>

## R-10

### จัดห้องอัตโนมัติ (room unit allocation)

Stories: US-06-03, US-11-04 · Module: `packages/domain/src/availability/room-allocation.ts`

ลูกค้าเลือก 'ประเภทห้อง' ระบบเลือก 'ห้อง' ให้ — 1 การพักอยู่ห้องเดียวตลอด (MVP ไม่ย้ายห้อง)

```ts
type RoomUnit = { id: string; code: string; roomTypeId: string; status: "active" | "maintenance" | "archived"; sortOrder: number };
type ActiveStay = { roomUnitId: string; checkInDate: string; checkOutDate: string };   // status reserved | checked_in
export function allocateRoom(input: { roomTypeId: string; checkInDate: string; checkOutDate: string; units: RoomUnit[]; stays: ActiveStay[] }):
  { roomUnitId: string | null; rule: "back_to_back_before" | "back_to_back_after" | "first_free" | "none_free" };
```

**อัลกอริทึม**

1. ผู้สมัคร = ห้องของประเภทนั้นที่ status = active และไม่มีการพักทับช่วง [checkIn, checkOut) (วันเช็คเอาท์ของคนก่อน = วันเช็คอินได้)
2. เลือกห้องที่มีแขกเช็คเอาท์วันเดียวกับ checkIn ก่อน (ลดช่องว่าง), ถัดมาห้องที่มีแขกเช็คอินวันเดียวกับ checkOut, ไม่งั้นห้องแรกตาม sortOrder, code
3. ไม่มีห้องว่าง → `none_free` → API `ROOM_TAKEN`

**หมายเหตุ**

- ร้านเปลี่ยนห้องเองได้บน Room map (ต้องผ่าน exclusion constraint)
- housekeeping = dirty ไม่กันการจองอนาคต (แสดงเตือนบน Room map วันนี้เท่านั้น)

**Vectors `allocateRoom`** → `docs/spec/vectors/R-10.allocateRoom.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | prefer room vacated the same day | `{"roomUnitId": "A2", "rule": "back_to_back_before"}` |
| 2 | prefer room whose next guest arrives on our checkout | `{"roomUnitId": "A2", "rule": "back_to_back_after"}` |
| 3 | first free by sort order | `{"roomUnitId": "A1", "rule": "first_free"}` |
| 4 | maintenance room never chosen → none | `{"roomUnitId": null, "rule": "none_free"}` |
| 5 | other room type | `{"roomUnitId": "B1", "rule": "first_free"}` |

<a id="R-11"></a>

## R-11

### ตรวจวัคซีนก่อนรับฝาก (vaccine gate)

Stories: US-06-05, US-11-04, US-11-05 · Module: `packages/domain/src/pet/vaccine-gate.ts`

วัคซีนที่บังคับมาจาก `branch_policy.required_vaccines_dog/cat`; ต้องมีผลถึงวัน `mustBeValidOn`

```ts
export function checkVaccines(input: { requiredCodes: string[];
  vaccinations: { code: string; expiresOn: string; status: "pending_review" | "verified" | "rejected" }[]; mustBeValidOn: string }):
  { ok: boolean; missing: string[]; expired: string[]; pendingReview: string[] };
```

**อัลกอริทึม**

1. mustBeValidOn: Hotel = check_out_date, Daycare = visit_date, กรูม (ถ้า enforce_vaccines_grooming) = วันที่นัด
2. ต่อรหัส: ไม่มีบันทึก (หรือมีแต่ rejected) → missing; มี verified ที่ expiresOn ≥ mustBeValidOn → ผ่าน; มีแต่ pending_review ที่ยังไม่หมดอายุ → pendingReview; นอกนั้น → expired
3. ok = ไม่มีทั้งสามรายการ
4. LIFF: ไม่ ok → ให้ลูกค้าอัปโหลดรูปสมุดวัคซีน (status pending_review) แล้วจองได้แต่ใบจองต้องรออนุมัติ
5. หน้าร้าน: ไม่ ok → เช็คอินไม่ได้ เว้นแต่กด override พร้อมเหตุผล (`stay.vaccine_override_reason`, audit `stay.vaccine_override`)

**Vectors `checkVaccines`** → `docs/spec/vectors/R-11.checkVaccines.json` (7 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | all valid | `{"ok": true, "missing": [], "expired": [], "pendingReview": []}` |
| 2 | expires before checkout | `{"ok": false, "missing": [], "expired": ["DOG_DHPPL"], "pendingReview": []}` |
| 3 | expiry day itself is valid | `{"ok": true, "missing": [], "expired": [], "pendingReview": []}` |
| 4 | pending review | `{"ok": false, "missing": [], "expired": [], "pendingReview": ["DOG_KENNEL_COUGH"]}` |
| 5 | missing | `{"ok": false, "missing": ["DOG_LEPTO"], "expired": [], "pendingReview": []}` |
| 6 | rejected counts as missing | `{"ok": false, "missing": ["DOG_RABIES"], "expired": [], "pendingReview": []}` |
| 7 | nothing required | `{"ok": true, "missing": [], "expired": [], "pendingReview": []}` |

<a id="R-12"></a>

## R-12

### เงื่อนไขรับจอง (ลูกค้า/น้อง/ประเภทห้อง)

Stories: US-06-01, US-11-03, US-11-04, US-03-11 · Module: `packages/domain/src/booking/eligibility.ts`

ตรวจก่อนแสดง/ยืนยันการจอง — reasons คือ error code ตามลำดับที่ตรวจ (แสดงข้อความไทยตาม 05-api §Errors)

```ts
type EligibilityInput = { channel: "online" | "staff"; customer: { blacklisted: boolean };
  pet: { status: "active" | "deceased" | "rehomed"; species: "dog" | "cat" | "other"; breed: string | null; weightGrams: number | null;
         ageMonths: number | null; flags: string[] };
  policy: { rejectedBreeds: string[]; maxPetWeightGrams: number | null };
  speciesAllowed: ("dog" | "cat" | "other")[];            // service.species_allowed or room_type.species_allowed; [] = all
  roomType: { maxWeightGrams: number | null; minAgeMonths: number | null; allowInHeat: boolean; allowReactive: boolean } | null;
  inHeat: boolean };
export function checkEligibility(input: EligibilityInput): { ok: boolean; reasons: string[] };
export function ageInMonths(input: { onDate: string; birthDate?: string | null; ageEstimateMonths?: number | null;
  estimateRecordedOn?: string | null }): number | null;
```

**อัลกอริทึม**

1. online + blacklisted → `CUSTOMER_BLACKLISTED` (หน้าร้านลงนัดให้ได้)
2. pet.status ≠ active → `PET_INACTIVE`
3. speciesAllowed ไม่ว่างและไม่มี species → `SPECIES_NOT_ALLOWED`
4. breed ตรงกับ rejectedBreeds (trim + ไม่สนตัวพิมพ์) → `BREED_REJECTED`
5. น้ำหนัก > min(policy.maxPetWeightGrams, roomType.maxWeightGrams) → `PET_TOO_HEAVY` (ไม่รู้น้ำหนัก = ไม่ตรวจ)
6. มี roomType: อายุ < minAgeMonths → `PET_TOO_YOUNG`; inHeat และไม่ allowInHeat → `IN_HEAT_NOT_ALLOWED`; มีป้าย bites/dog_reactive/cat_reactive และไม่ allowReactive → `REACTIVE_NOT_ALLOWED`
7. ageInMonths: จาก birthDate (เดือนเต็ม) หรือ age_estimate_months + เดือนที่ผ่านไปตั้งแต่บันทึก (`pet.created_at`) ไม่รู้ → null

**Vectors `checkEligibility`** → `docs/spec/vectors/R-12.checkEligibility.json` (9 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | ok grooming | `{"ok": true, "reasons": []}` |
| 2 | blacklisted online | `{"ok": false, "reasons": ["CUSTOMER_BLACKLISTED"]}` |
| 3 | blacklisted but staff books | `{"ok": true, "reasons": []}` |
| 4 | rejected breed case-insensitive | `{"ok": false, "reasons": ["BREED_REJECTED"]}` |
| 5 | too heavy for room | `{"ok": false, "reasons": ["PET_TOO_HEAVY"]}` |
| 6 | reactive dog + room disallows | `{"ok": false, "reasons": ["REACTIVE_NOT_ALLOWED"]}` |
| 7 | in heat | `{"ok": false, "reasons": ["IN_HEAT_NOT_ALLOWED"]}` |
| 8 | too young + cat not allowed | `{"ok": false, "reasons": ["SPECIES_NOT_ALLOWED", "PET_TOO_YOUNG"]}` |
| 9 | pet deceased | `{"ok": false, "reasons": ["PET_INACTIVE"]}` |

**Vectors `ageInMonths`** → `docs/spec/vectors/R-12.ageInMonths.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | from birth date | `30` |
| 2 | birthday later this month | `11` |
| 3 | from estimate | `32` |
| 4 | unknown | `null` |

<a id="R-13"></a>

## R-13

### ค่ามือ (commission)

Stories: US-09-02, US-09-05, US-12-03 · Module: `packages/domain/src/commission/commission.ts`

สร้าง `commission_entry` ตอนปิดบิล (status paid) — 1 แถวต่อ bill_line ที่มีช่าง

```ts
type CommissionLine = { billLineId: string; lineType: string; serviceId: string | null; performerId: string | null;
  lineTotalSatang: number; quantity: number; packageUnitValueSatang?: number };
type CommissionRule = { id: string; serviceId: string | null; staffUserId: string | null; type: "percent" | "fixed"; value: number };
export function computeCommissions(input: { lines: CommissionLine[]; billDiscountSatang: number; rules: CommissionRule[] }):
  { billLineId: string; staffUserId: string; baseSatang: number; ruleId: string; amountSatang: number }[];
```

**อัลกอริทึม**

1. กระจายส่วนลดท้ายบิลตามสัดส่วน line_total ของบรรทัดที่ > 0: floor ทีละบรรทัด เศษที่เหลือใส่บรรทัดที่ยอดมากสุด (เสมอกันเอาบรรทัดแรก)
2. บรรทัดที่คิดค่ามือ: groom_service, groom_addon, surcharge, package_redemption และต้องมี performer_id
3. ฐาน = line_total − ส่วนลดที่กระจายมา; package_redemption ฐาน = unit_value ของแพ็กเกจ (R-14) ไม่หักส่วนลด
4. เลือกกติกา: (บริการ, ช่าง) → (บริการ, ทุกช่าง) → (ทุกบริการ, ช่าง) → (ทุกบริการ, ทุกช่าง); ไม่มี → ไม่มีค่ามือ
5. percent: floor(base × bps / 10000); fixed: value × quantity
6. Void บิล → commission_entry.status = reversed (ไม่ลบ)

**Vectors `computeCommissions`** → `docs/spec/vectors/R-13.computeCommissions.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | full example with bill discount | `[{"billLineId": "L1", "staffUserId": "g-a", "baseSatang": 44735, "ruleId": "r1", "amountSatang": 8947}, {"billLineId": "L2", "staffUserId…` |
| 2 | no rules → nothing | `[]` |
| 3 | only catch-all rule | `[{"billLineId": "L1", "staffUserId": "g-a", "baseSatang": 50000, "ruleId": "r4", "amountSatang": 5000}, {"billLineId": "L2", "staffUserId…` |
| 4 | fixed × quantity | `[{"billLineId": "L2", "staffUserId": "g-a", "baseSatang": 20000, "ruleId": "r3", "amountSatang": 10000}]` |

<a id="R-14"></a>

## R-14

### แพ็กเกจ: มูลค่าต่อครั้ง วันหมดอายุ และสิทธิ์ใช้

Stories: US-10-05, US-10-06, US-08-03 · Module: `packages/domain/src/package/package.ts`

ขายแพ็กเกจเป็น bill_line `package_sale`; ใช้สิทธิ์เป็น bill_line `package_redemption` ราคา 0

```ts
export function packageTerms(input: { priceSatang: number; sessionsCount: number; validityDays: number; purchasedAt: string; timezone: string }):
  { unitValueSatang: number; expiresAt: string };
export function canRedeemPackage(input: { now: string;
  package: { status: string; sessionsUsed: number; sessionsTotal: number; expiresAt: string; serviceId: string;
             sizeTierId: string | null; shareScope: "single_pet" | "household"; petId: string | null };
  appointment: { serviceId: string; sizeTierId: string | null; petId: string } }): { ok: boolean; reason: string | null };
```

**อัลกอริทึม**

1. unit_value = floor(price / sessions) — ใช้เป็นฐานค่ามือและรายงานรายได้ตามการใช้
2. expiresAt = สิ้นวัน (23:59:59.999 เวลาท้องถิ่น) ของวันที่ซื้อ + validity_days
3. ใช้ได้เมื่อ: status active, used < total, now ≤ expiresAt, บริการตรง, size tier ตรง (ถ้าแพ็กเกจกำหนด), single_pet ต้องเป็นน้องตัวเดียวกัน — ตรวจตามลำดับนี้และคืน reason แรกที่ไม่ผ่าน
4. ใช้ครบ → status exhausted; job `package_expiry` ทุกวัน 00:10 เปลี่ยน active ที่หมดอายุ → expired
5. Void บิลที่ใช้สิทธิ์ → package_redemption.reversed_at และ sessions_used − 1 (status กลับเป็น active ถ้ายังไม่หมดอายุ)

**Vectors `packageTerms`** → `docs/spec/vectors/R-14.packageTerms.json` (2 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 5 sessions 2,000 baht 1 year | `{"unitValueSatang": 40000, "expiresAt": "2027-10-05T16:59:59.999Z"}` |
| 2 | odd split floors | `{"unitValueSatang": 33333, "expiresAt": "2027-01-04T16:59:59.999Z"}` |

**Vectors `canRedeemPackage`** → `docs/spec/vectors/R-14.canRedeemPackage.json` (8 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | ok | `{"ok": true, "reason": null}` |
| 2 | exhausted | `{"ok": false, "reason": "PACKAGE_EXHAUSTED"}` |
| 3 | expired | `{"ok": false, "reason": "PACKAGE_EXPIRED"}` |
| 4 | service mismatch | `{"ok": false, "reason": "PACKAGE_SERVICE_MISMATCH"}` |
| 5 | size mismatch | `{"ok": false, "reason": "PACKAGE_SIZE_MISMATCH"}` |
| 6 | other pet on single_pet | `{"ok": false, "reason": "PACKAGE_PET_MISMATCH"}` |
| 7 | household share ok | `{"ok": true, "reason": null}` |
| 8 | void package | `{"ok": false, "reason": "PACKAGE_NOT_ACTIVE"}` |

<a id="R-15"></a>

## R-15

### ยอดบิล ส่วนลด และการรับชำระ

Stories: US-08-01, US-08-02, US-08-03, US-08-04 · Module: `packages/domain/src/billing/totals.ts`

MVP ออก 'ใบเสร็จรับเงิน' (ไม่ใช่ใบกำกับภาษี) — ไม่คิด VAT

```ts
export function computeBillTotals(input: { lines: { quantity: number; unitPriceSatang: number; lineDiscountSatang: number }[];
  billDiscountSatang: number; payments: { method: string; amountSatang: number; status: "posted" | "voided" }[] }):
  { subtotalSatang: number; totalSatang: number; paidSatang: number; dueSatang: number; canClose: boolean }
  | { error: "LINE_DISCOUNT_TOO_LARGE" | "INVALID_QUANTITY" | "BILL_DISCOUNT_TOO_LARGE" };
export function applyPayment(input: { dueSatang: number; method: "cash" | "promptpay" | "bank_transfer" | "card_edc" | "deposit" | "credit";
  tenderedSatang?: number; amountSatang?: number; creditBalanceSatang?: number }):
  { amountSatang: number; changeSatang: number; dueAfterSatang: number }
  | { error: "BILL_ALREADY_PAID" | "INVALID_AMOUNT" | "AMOUNT_EXCEEDS_DUE" | "INSUFFICIENT_CREDIT" };
```

**อัลกอริทึม**

1. line_total = qty × unit − line_discount (ส่วนลดเกินยอด → error); subtotal = Σ line_total
2. bill_discount ≤ subtotal; total = subtotal − bill_discount; ส่วนลด > 0 ต้องมีเหตุผล และ front_desk ให้ส่วนลดได้ไม่เกิน 20% ของ subtotal (เกินต้อง owner) — audit `bill.discount`
3. paid = Σ payment ที่ posted; due = total − paid; ปิดบิลได้เมื่อ due = 0
4. เปิดบิลจากใบจองที่มีมัดจำ verified → สร้าง payment method `deposit` อัตโนมัติ = min(deposit_verified, total)
5. เงินสด: amount = min(tendered, due), change = tendered − amount; วิธีอื่น: amount ต้อง ≤ due; credit ต้อง ≤ เครดิตคงเหลือ
6. ส่งคำขอชำระพร้อม `expectedPaidSatang` (ยอด paid ที่หน้าจอเห็น) — ไม่ตรงกับ DB → `STALE_BILL` (กันกดซ้ำ/สองเครื่อง)

**หมายเหตุ**

- มัดจำที่เกิน total ของบิล → ส่วนเกินเข้าเครดิตลูกค้า (credit_ledger reason `deposit_credit`) ตอนปิดบิล

**Vectors `computeBillTotals`** → `docs/spec/vectors/R-15.computeBillTotals.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | lines + bill discount + deposit | `{"subtotalSatang": 63000, "totalSatang": 60000, "paidSatang": 20000, "dueSatang": 40000, "canClose": false}` |
| 2 | fully paid | `{"subtotalSatang": 45000, "totalSatang": 45000, "paidSatang": 45000, "dueSatang": 0, "canClose": true}` |
| 3 | line discount too large | `{"error": "LINE_DISCOUNT_TOO_LARGE"}` |
| 4 | bill discount too large | `{"error": "BILL_DISCOUNT_TOO_LARGE"}` |

**Vectors `applyPayment`** → `docs/spec/vectors/R-15.applyPayment.json` (6 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | cash with change | `{"amountSatang": 40000, "changeSatang": 10000, "dueAfterSatang": 0}` |
| 2 | partial cash | `{"amountSatang": 30000, "changeSatang": 0, "dueAfterSatang": 10000}` |
| 3 | transfer exact | `{"amountSatang": 40000, "changeSatang": 0, "dueAfterSatang": 0}` |
| 4 | transfer over due | `{"error": "AMOUNT_EXCEEDS_DUE"}` |
| 5 | credit insufficient | `{"error": "INSUFFICIENT_CREDIT"}` |
| 6 | already paid | `{"error": "BILL_ALREADY_PAID"}` |

<a id="R-16"></a>

## R-16

### เลขที่ใบเสร็จ

Stories: US-08-05 · Module: `packages/domain/src/ids/receipt-no.ts`

รูปแบบ `{prefix}{ปี พ.ศ. 2 หลัก}-{ลำดับ 5 หลัก}` เช่น R69-00042 — เรียงต่อเนื่อง ไม่ข้าม ไม่ซ้ำ ต่อสาขา

```ts
export function nextReceiptNo(input: { prefix: string; now: string; timezone: string; counter: { yearBe: number; nextSeq: number } }):
  { receiptNo: string; counter: { yearBe: number; nextSeq: number } };
```

**อัลกอริทึม**

1. ปี = ปีปฏิทินท้องถิ่นของเวลาปิดบิล + 543; ขึ้นปีใหม่ → เริ่ม 1
2. ออกเลขตอนปิดบิลเท่านั้น (บิล open ไม่มีเลข) ใน transaction เดียวกับการปิด: `SELECT receipt_year_be, receipt_next_seq FROM branch WHERE id = $1 FOR UPDATE` แล้ว update counter
3. บิล void ยังคงเลขเดิม (ไม่นำเลขกลับมาใช้)

**Vectors `nextReceiptNo`** → `docs/spec/vectors/R-16.nextReceiptNo.json` (3 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | normal | `{"receiptNo": "R69-00042", "counter": {"yearBe": 2569, "nextSeq": 43}}` |
| 2 | new year local time (UTC still Dec 31) | `{"receiptNo": "R70-00001", "counter": {"yearBe": 2570, "nextSeq": 2}}` |
| 3 | first receipt ever | `{"receiptNo": "PC69-00001", "counter": {"yearBe": 2569, "nextSeq": 2}}` |

<a id="R-17"></a>

## R-17

### วันครบรอบกรูมถัดไป

Stories: US-10-04 · Module: `packages/domain/src/aftercare/next-groom.ts`

visitDates = วันท้องถิ่นของนัดกรูมที่สถานะ picked_up/done ของน้องตัวนั้นที่ร้านนี้

```ts
export function nextGroomDue(input: { visitDates: string[]; shopIntervalDays: number | null; defaultDays: number;
  hasFutureAppointment: boolean; petStatus: "active" | "deceased" | "rehomed" }):
  { dueDate: string | null; remindOn: string | null; intervalDays: number | null; source: string };
```

**อัลกอริทึม**

1. pet ไม่ active → ไม่เตือน; ไม่มีประวัติ → ไม่เตือน
2. รอบ = `pet_shop_profile.groom_interval_days` → (มี ≥ 2 ช่วงห่างจาก 4 ครั้งล่าสุด) median ของช่วงห่าง (จำนวนคู่ = เฉลี่ยสองค่ากลางปัดขึ้น) → `branch_policy.next_groom_default_days`
3. dueDate = ครั้งล่าสุด + รอบ; remindOn = dueDate − 3 วัน; ส่งเวลา 10:00 ท้องถิ่น
4. มีนัดในอนาคตแล้ว → remindOn = null (ไม่เตือน)
5. job: เมื่อน้องถูกรับกลับ (picked_up) ตั้ง `next_groom_reminder` ที่ remindOn 10:00 (dedupe ต่อ pet); ตอนรันตรวจซ้ำ (มีนัดใหม่/สถานะเปลี่ยน → ยกเลิก)
6. ข้อความเป็นคลาส marketing (R-18)

**Vectors `nextGroomDue`** → `docs/spec/vectors/R-17.nextGroomDue.json` (7 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | default interval | `{"dueDate": "2026-09-29", "remindOn": "2026-09-26", "intervalDays": 28, "source": "default"}` |
| 2 | shop interval wins | `{"dueDate": "2026-09-22", "remindOn": "2026-09-19", "intervalDays": 21, "source": "shop"}` |
| 3 | median of history | `{"dueDate": "2026-09-29", "remindOn": "2026-09-26", "intervalDays": 30, "source": "history"}` |
| 4 | even count median rounds up | `{"dueDate": "2026-09-22", "remindOn": "2026-09-19", "intervalDays": 28, "source": "history"}` |
| 5 | future appointment suppresses reminder | `{"dueDate": "2026-09-29", "remindOn": null, "intervalDays": 28, "source": "default:has_future_appointment"}` |
| 6 | pet rehomed | `{"dueDate": null, "remindOn": null, "intervalDays": null, "source": "pet_inactive"}` |
| 7 | no visits | `{"dueDate": null, "remindOn": null, "intervalDays": null, "source": "no_visit"}` |

<a id="R-18"></a>

## R-18

### โควตาข้อความ LINE (push) และโหมดประหยัด

Stories: US-13-06, US-02-06 · Module: `packages/domain/src/notify/line-quota.ts`

reply message ฟรีไม่นับโควตา; push/multicast นับโควตาของ OA ร้าน — ระบบนับเองจาก `notification` ที่ channel = line_push, status = sent, month_key เดือนนี้

```ts
export function decideLinePush(input: { monthlyQuota: number; usedThisMonth: number;
  messageClass: "essential" | "helpful" | "marketing"; economyMode: boolean; economyBehavior: "send" | "skip" }):
  { send: boolean; skipReason: "quota_exhausted" | "economy_mode" | null };
```

**อัลกอริทึม**

1. used ≥ quota → ข้าม `quota_exhausted`
2. economy mode เปิด และ template กำหนด economy = skip → ข้าม `economy_mode`
3. marketing: ใช้ไปแล้ว ≥ 70% → ข้าม (สงวนโควตา)
4. helpful: ใช้ไปแล้ว ≥ 90% → ข้าม (สงวน 10% ไว้ให้ essential)
5. essential ส่งจนหมดโควตา
6. ข้ามแล้ว: บันทึก notification status skipped + skip_reason และแสดงในหน้า "ข้อความที่ไม่ได้ส่ง" ให้หน้าร้านกดส่งเองผ่านแชท (copy ข้อความ)
7. ใช้ไปถึง 80% → แจ้งเจ้าของร้าน (web push, ครั้งเดียวต่อเดือน)

**หมายเหตุ**

- งบต่อ 1 การใช้บริการ ≤ 4 push: ยืนยันจอง (essential, ใช้ reply ถ้าได้), เตือน 24 ชม. (helpful), พร้อมรับ/report card (helpful รวมเป็นข้อความเดียว), เตือนรอบถัดไป (marketing)

**Vectors `decideLinePush`** → `docs/spec/vectors/R-18.decideLinePush.json` (8 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | normal helpful | `{"send": true, "skipReason": null}` |
| 2 | quota exhausted | `{"send": false, "skipReason": "quota_exhausted"}` |
| 3 | essential at 95% | `{"send": true, "skipReason": null}` |
| 4 | helpful at 90% reserved | `{"send": false, "skipReason": "quota_exhausted"}` |
| 5 | marketing at 70% | `{"send": false, "skipReason": "quota_exhausted"}` |
| 6 | marketing below 70% | `{"send": true, "skipReason": null}` |
| 7 | economy skip | `{"send": false, "skipReason": "economy_mode"}` |
| 8 | economy send | `{"send": true, "skipReason": null}` |

<a id="R-19"></a>

## R-19

### เลือกช่องทางส่งข้อความ

Stories: US-13-05, US-13-06, US-09-04 · Module: `packages/domain/src/notify/channel.ts`

ลูกค้าได้รับทาง LINE ของร้านเท่านั้น; พนักงานได้รับทาง Web Push (อีเมลสำรองเฉพาะเจ้าของร้าน)

```ts
export function selectChannel(input: { recipientType: "customer" | "staff"; hasLineIdentity: boolean; isFriend: boolean;
  templateAllowsReply: boolean; replyTokenAgeSeconds: number | null; activePushSubscriptions: number; isOwner: boolean; hasEmail: boolean }):
  { channel: "line_reply" | "line_push" | "web_push" | "email" | null; skipReason: "no_recipient" | null };
```

**อัลกอริทึม**

1. ลูกค้า: ไม่มี line_identity หรือไม่ได้เป็นเพื่อน OA (`is_friend` = false) → ข้าม `no_recipient` (หน้าร้านเห็นในรายการข้อความที่ไม่ได้ส่ง)
2. มี reply token อายุ < 50 วินาที (จากข้อความที่ลูกค้าเพิ่งส่งเข้ามา — ดู SP-03) และ template อนุญาต → `line_reply` (ฟรี)
3. ไม่งั้น `line_push` แล้วผ่าน R-18
4. พนักงาน: มี web_push_subscription ที่ไม่ disabled → `web_push` ทุกอุปกรณ์; ไม่มีแต่เป็น owner ที่มีอีเมล → `email`; ไม่งั้นข้าม

**Vectors `selectChannel`** → `docs/spec/vectors/R-19.selectChannel.json` (7 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | customer push | `{"channel": "line_push", "skipReason": null}` |
| 2 | customer reply token fresh | `{"channel": "line_reply", "skipReason": null}` |
| 3 | reply token too old | `{"channel": "line_push", "skipReason": null}` |
| 4 | not a friend | `{"channel": null, "skipReason": "no_recipient"}` |
| 5 | staff with device | `{"channel": "web_push", "skipReason": null}` |
| 6 | owner fallback email | `{"channel": "email", "skipReason": null}` |
| 7 | staff no device | `{"channel": null, "skipReason": "no_recipient"}` |

<a id="R-20"></a>

## R-20

### เวลาและวันที่ท้องถิ่น

Stories: US-13-03 · Module: `packages/domain/src/time/local-time.ts`

DB เก็บ UTC; ทุกการตัดสินใจเรื่อง 'วันนี้/วันไหน' ใช้ `branch.timezone` (Asia/Bangkok) — ห้ามใช้ timezone ของ server หรือ browser

```ts
export function toLocalDate(input: { instant: string; timezone: string }): string;               // "YYYY-MM-DD"
export function localToUtc(input: { date: string; time: string; timezone: string }): string;        // ISO UTC
export function localDayBounds(input: { date: string; timezone: string }): { start: string; end: string };
```

**อัลกอริทึม**

1. ใช้ไลบรารี date-fns + @date-fns/tz (หรือ Temporal เมื่อพร้อม) — ห้าม `new Date('YYYY-MM-DD')` กับวันท้องถิ่น (จะกลายเป็น UTC)
2. คอลัมน์ date (check_in_date ฯลฯ) เป็น string ตลอดทาง
3. รายงาน/สรุปรายวัน: ช่วงวัน = localDayBounds

**Vectors `toLocalDate`** → `docs/spec/vectors/R-20.toLocalDate.json` (2 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | evening UTC is next local day | `"2026-10-06"` |
| 2 | morning | `"2026-10-05"` |

**Vectors `localToUtc`** → `docs/spec/vectors/R-20.localToUtc.json` (2 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 09:00 Bangkok | `"2026-10-05T02:00:00.000Z"` |
| 2 | 00:30 Bangkok is previous UTC day | `"2026-10-04T17:30:00.000Z"` |

**Vectors `localDayBounds`** → `docs/spec/vectors/R-20.localDayBounds.json` (1 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | day bounds | `{"start": "2026-10-04T17:00:00.000Z", "end": "2026-10-05T17:00:00.000Z"}` |

<a id="R-21"></a>

## R-21

### สิทธิ์ลูกค้าเลื่อน/ยกเลิกเอง

Stories: US-11-08 · Module: `packages/domain/src/booking/self-service.ts`

หน้า 'นัดของฉัน' แสดงปุ่มตามผลนี้; API ตรวจซ้ำทุกครั้ง

```ts
export function customerSelfService(input: { now: string; firstServiceAt: string; status: string; rescheduleCutoffHours: number;
  rescheduleCount: number }): { canCancel: boolean; canReschedule: boolean;
  rescheduleBlockedReason: "STATUS_NOT_ALLOWED" | "TOO_LATE_TO_RESCHEDULE" | "RESCHEDULE_LIMIT" | null };
```

**อัลกอริทึม**

1. ยกเลิกได้เมื่อสถานะ awaiting_deposit/deposit_review/awaiting_approval/confirmed และยังไม่ถึงเวลาบริการแรก (ผลเงินตาม R-07 — แสดงให้ลูกค้าเห็นก่อนกดยืนยัน)
2. เลื่อนได้เมื่อสถานะ confirmed/awaiting_approval, เหลือเวลา ≥ reschedule_cutoff_hours และเลื่อนมาแล้ว < 2 ครั้ง
3. การเลื่อน = เปลี่ยนเวลาของนัดเดิม (มัดจำติดไปด้วย) และ reschedule_count + 1; ต่อจากนี้ต้องติดต่อร้าน

**Vectors `customerSelfService`** → `docs/spec/vectors/R-21.customerSelfService.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | plenty of time | `{"canCancel": true, "canReschedule": true, "rescheduleBlockedReason": null}` |
| 2 | inside cutoff | `{"canCancel": true, "canReschedule": false, "rescheduleBlockedReason": "TOO_LATE_TO_RESCHEDULE"}` |
| 3 | limit reached | `{"canCancel": true, "canReschedule": false, "rescheduleBlockedReason": "RESCHEDULE_LIMIT"}` |
| 4 | awaiting deposit can only cancel | `{"canCancel": true, "canReschedule": false, "rescheduleBlockedReason": "STATUS_NOT_ALLOWED"}` |
| 5 | after start | `{"canCancel": false, "canReschedule": false, "rescheduleBlockedReason": "TOO_LATE_TO_RESCHEDULE"}` |

<a id="R-22"></a>

## R-22

### เบอร์โทร: normalize และแสดงผล

Stories: US-03-01, US-03-10, US-11-01 · Module: `packages/domain/src/format/phone.ts`

เก็บ E.164 (`+66812345678`) ทุกคอลัมน์เบอร์; ค้นหาด้วยเบอร์ให้ normalize คำค้นก่อน

```ts
export function normalizePhone(input: { input: string }): { e164: string | null; error: "INVALID_PHONE" | null };
export function formatPhone(input: { e164: string }): string;
```

**อัลกอริทึม**

1. ตัดช่องว่าง ขีด วงเล็บ; รับ 0XXXXXXXXX, 66XXXXXXXXX, +66XXXXXXXXX, +66 0XXXXXXXXX
2. มือถือไทย: 9 หลักหลังตัด 0 ขึ้นต้น 6/8/9; บ้าน: 8 หลักขึ้นต้น 2/3/4/5/7
3. ต่างประเทศ: + ตามด้วย 8–15 หลัก (ไม่ใช่ +66) เก็บตามเดิม
4. แสดงผล: มือถือ 081-234-5678, กทม. 02-123-4567, ต่างจังหวัด 038-123-456, ต่างประเทศแสดง E.164

**Vectors `normalizePhone`** → `docs/spec/vectors/R-22.normalizePhone.json` (12 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 081-234-5678 | `{"e164": "+66812345678", "error": null}` |
| 2 | 0812345678 | `{"e164": "+66812345678", "error": null}` |
| 3 | +66812345678 | `{"e164": "+66812345678", "error": null}` |
| 4 | 66812345678 | `{"e164": "+66812345678", "error": null}` |
| 5 | +66 081 234 5678 | `{"e164": "+66812345678", "error": null}` |
| 6 | (02) 123-4567 | `{"e164": "+6621234567", "error": null}` |
| 7 | 038 123 456 | `{"e164": "+6638123456", "error": null}` |
| 8 | +14155552671 | `{"e164": "+14155552671", "error": null}` |
| 9 | 12345 | `{"e164": null, "error": "INVALID_PHONE"}` |
| 10 | 081234567 | `{"e164": null, "error": "INVALID_PHONE"}` |
| 11 | 0712345678 | `{"e164": null, "error": "INVALID_PHONE"}` |
| 12 | +66-2-123-4567 | `{"e164": "+6621234567", "error": null}` |

**Vectors `formatPhone`** → `docs/spec/vectors/R-22.formatPhone.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | +66812345678 | `"081-234-5678"` |
| 2 | +6621234567 | `"02-123-4567"` |
| 3 | +6638123456 | `"038-123-456"` |
| 4 | +14155552671 | `"+14155552671"` |

<a id="R-23"></a>

## R-23

### เลขที่ใบจอง

Stories: US-05-04, US-11-03 · Module: `packages/domain/src/ids/booking-no.ts`

รูปแบบ `B{ปี พ.ศ. 2 หลัก}{เดือน 2 หลัก}-{ลำดับ ≥4 หลัก}` เช่น B6910-0042 — ใช้สื่อสารกับลูกค้า (สั้น อ่านง่าย)

```ts
export function nextBookingNo(input: { now: string; timezone: string; counter: { month: string; nextSeq: number } }):
  { bookingNo: string; counter: { month: string; nextSeq: number } };
```

**อัลกอริทึม**

1. counter ต่อสาขาใน `branch.booking_seq_month` / `booking_next_seq` ล็อกแถวเหมือน R-16
2. ขึ้นเดือนใหม่ (เวลาท้องถิ่น) → เริ่ม 1; เกิน 9999 ใช้ 5 หลักต่อได้

**Vectors `nextBookingNo`** → `docs/spec/vectors/R-23.nextBookingNo.json` (3 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | normal | `{"bookingNo": "B6910-0042", "counter": {"month": "6910", "nextSeq": 43}}` |
| 2 | month rollover in local time | `{"bookingNo": "B6911-0001", "counter": {"month": "6911", "nextSeq": 2}}` |
| 3 | beyond 9999 | `{"bookingNo": "B6910-10000", "counter": {"month": "6910", "nextSeq": 10001}}` |

<a id="R-24"></a>

## R-24

### ล็อกบัญชีเมื่อใส่รหัสผิด + นโยบายรหัสผ่าน

Stories: US-01-02 · Module: `packages/domain/src/auth/lockout.ts`

ใช้กับ `staff_user.failed_login_count`, `staff_user.locked_until` และ `platform_admin.failed_login_count`, `platform_admin.locked_until` (กฎการนับ/ล็อก/สำเร็จเหมือนกัน)

```ts
export function loginAttempt(input: { now: string; failedLoginCount: number; lockedUntil: string | null; passwordCorrect: boolean }):
  { allowed: boolean; failedLoginCount: number; lockedUntil: string | null; error: "ACCOUNT_LOCKED" | "INVALID_CREDENTIALS" | null };
export function checkPasswordPolicy(input: { password: string; email?: string | null }): { ok: boolean; error: string | null };
```

**อัลกอริทึม**

1. ถูกล็อกอยู่ (now < lockedUntil) → ปฏิเสธโดยไม่ตรวจรหัส
2. รหัสถูก → reset count = 0
3. ผิดครั้งที่ 5 ติดกัน → ล็อก 15 นาที และ reset count = 0
4. ข้อความ error ต่อผู้ใช้ไม่บอกว่าอีเมลมีอยู่หรือไม่ (`INVALID_CREDENTIALS` เหมือนกัน)
5. รหัสผ่าน 8–128 ตัว, ห้ามเป็นตัวเลขล้วน, ห้ามเท่ากับส่วนหน้าของอีเมล
6. hash: argon2id (memoryCost 19456 KiB, timeCost 2, parallelism 1) ผ่านแพ็กเกจ @node-rs/argon2

**Vectors `loginAttempt`** → `docs/spec/vectors/R-24.loginAttempt.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | success resets | `{"allowed": true, "failedLoginCount": 0, "lockedUntil": null, "error": null}` |
| 2 | 4th failure | `{"allowed": false, "failedLoginCount": 4, "lockedUntil": null, "error": "INVALID_CREDENTIALS"}` |
| 3 | 5th failure locks 15 min | `{"allowed": false, "failedLoginCount": 0, "lockedUntil": "2026-10-05T03:15:00.000Z", "error": "ACCOUNT_LOCKED"}` |
| 4 | locked even with right password | `{"allowed": false, "failedLoginCount": 0, "lockedUntil": "2026-10-05T03:15:00.000Z", "error": "ACCOUNT_LOCKED"}` |
| 5 | lock expired | `{"allowed": true, "failedLoginCount": 0, "lockedUntil": null, "error": null}` |

**Vectors `checkPasswordPolicy`** → `docs/spec/vectors/R-24.checkPasswordPolicy.json` (4 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | ok | `{"ok": true, "error": null}` |
| 2 | short | `{"ok": false, "error": "PASSWORD_TOO_SHORT"}` |
| 3 | digits | `{"ok": false, "error": "PASSWORD_ALL_DIGITS"}` |
| 4 | same as email | `{"ok": false, "error": "PASSWORD_SAME_AS_EMAIL"}` |

<a id="R-25"></a>

## R-25

### ข้อจำกัดการอัปโหลดไฟล์

Stories: US-13-04, US-03-06, US-07-02 · Module: `packages/domain/src/files/upload-policy.ts`

อัปโหลดตรงไป object storage ด้วย presigned PUT (อายุ 5 นาที) แล้ว commit กับข้อมูล — server ไม่รับไฟล์ผ่าน body

```ts
export function validateUpload(input: { kind: string; mimeType: string; sizeBytes: number }): { ok: boolean; error: string | null };
```

**อัลกอริทึม**

1. client ย่อรูปก่อนส่ง: ด้านยาวสุด 1600 px, WebP/JPEG quality 0.8, ลบ EXIF (ตำแหน่ง GPS) — เป้าหมาย ≤ 1.5 MB
2. server ตรวจตามตาราง kind → MIME/ขนาดสูงสุด (สลิป/รูปทั่วไป 2 MB, เอกสารวัคซีน 5 MB, วิดีโอ stay_update 20 MB ≤ 30 วินาที, ลายเซ็น PNG 500 KB, CSV 2 MB)
3. storage key: `org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}`; อ่านผ่าน signed GET URL อายุ 1 ชม. (ไม่มี public bucket)
4. file_object.committed_at = null เกิน 24 ชม. → ลบทิ้ง (job ใน cron ทุกวัน)

**Vectors `validateUpload`** → `docs/spec/vectors/R-25.validateUpload.json` (6 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | photo ok | `{"ok": true, "error": null}` |
| 2 | photo too big | `{"ok": false, "error": "UPLOAD_TOO_LARGE"}` |
| 3 | video on stay update | `{"ok": true, "error": null}` |
| 4 | video not allowed for slip | `{"ok": false, "error": "UPLOAD_TYPE_NOT_ALLOWED"}` |
| 5 | pdf vaccine | `{"ok": true, "error": null}` |
| 6 | unknown kind | `{"ok": false, "error": "UPLOAD_KIND_NOT_ALLOWED"}` |

<a id="R-26"></a>

## R-26

### สร้างงานดูแลรายวัน (care tasks)

Stories: US-06-09, US-06-08 · Module: `packages/domain/src/care/care-tasks.ts`

สร้างตอนเช็คอิน (stay → checked_in) จากฟอร์มรับฝาก; แก้ฟอร์มระหว่างพัก → ลบ task pending ในอนาคตแล้วสร้างใหม่

```ts
export function generateCareTasks(input: { checkedInAt: string; checkOutDate: string; expectedCheckOutTime: string | null; timezone: string;
  feedingTimes: string[]; medications: { id: string; name: string; times: string[] }[]; walksPerDay: number }):
  { taskType: "feed" | "medication" | "walk" | "clean"; title: string; dueAt: string; medicationId: string | null }[];
```

**อัลกอริทึม**

1. ทุกวันท้องถิ่นตั้งแต่วันเช็คอินถึงวันเช็คเอาท์: feed ตาม feeding_times, medication ตามเวลาของยาแต่ละตัว, walk ตาม walks_per_day, clean 10:00
2. เวลาเดิน: 1 ครั้ง = 16:00; n ≥ 2 = กระจาย 09:00–17:00 เท่า ๆ กัน ปัดเป็นช่วง 30 นาที (ปัดครึ่งขึ้น) — walks_per_day 0–6
3. เก็บเฉพาะ task ที่ checkedInAt < dueAt < เวลาออก (check_out_date + expected_check_out_time หรือ 12:00)
4. เรียงตาม dueAt, taskType, title
5. เลยกำหนด 30 นาทียัง pending → job `care_task_overdue_scan` (ทุก 15 นาที) แจ้งพนักงานผ่าน Web Push (ครั้งเดียวต่อ task)

**Vectors `generateCareTasks`** → `docs/spec/vectors/R-26.generateCareTasks.json` (2 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 2 nights with meds and 2 walks | `[{"taskType": "walk", "title": "พาเดินเล่น", "dueAt": "2026-10-10T10:00:00.000Z", "medicationId": null}, {"taskType": "feed", "title": "ใ…` |
| 2 | 1 night, default checkout 12:00, no walks | `[{"taskType": "feed", "title": "ให้อาหาร", "dueAt": "2026-10-11T00:30:00.000Z", "medicationId": null}, {"taskType": "clean", "title": "ทำ…` |

<a id="R-27"></a>

## R-27

### Audit log — การกระทำที่ต้องบันทึก

Stories: US-13-07, US-13-11 · Module: `packages/server/src/audit.ts`

เขียนใน transaction เดียวกับการเปลี่ยนแปลงเสมอ (ถ้าบันทึกไม่ได้ การเปลี่ยนแปลงต้อง rollback) — before/after เก็บเฉพาะฟิลด์ที่เปลี่ยน

```ts
export async function writeAudit(tx: Tx, entry: { organizationId: string | null; actor: Actor; action: AuditAction;
  entityType: string; entityId: string | null; before?: unknown; after?: unknown; reason?: string | null }): Promise<void>;
```

**อัลกอริทึม**

1. รายการ action (type AuditAction): `bill.discount`, `bill.close`, `bill.void`, `bill.reopen_forbidden_attempt`, `payment.create`, `payment.void`, `slip.verify`, `slip.reject`, `deposit.waive`, `refund.create`, `credit.adjust`, `booking.cancel`, `booking.no_show`, `booking.price_override`, `stay.vaccine_override`, `customer.blacklist`, `customer.reliability_override`, `customer.merge_link_approve`, `staff.invite`, `staff.role_change`, `staff.disable`, `policy.update`, `promptpay.update`, `line_channel.update`, `commission_rule.update`, `data.export`, `pdpa.erase`, `support.session_start`, `support.session_end`, `import.commit`, `organization.status_change`
2. ทุก action ที่มีคำว่า void/cancel/waive/override/adjust/blacklist ต้องมี reason (API บังคับ ≥ 3 ตัวอักษร)
3. หน้าดู audit log: owner เท่านั้น (filter ตาม action/ช่วงวัน/ผู้ทำ)

<a id="R-28"></a>

## R-28

### ห้องว่างของประเภทห้อง (hotel availability)

Stories: US-06-03, US-11-04, US-06-04 · Module: `packages/domain/src/availability/hotel-availability.ts`

จำนวนห้องที่ว่าง **ตลอดช่วง** (ไม่ใช่รายคืน) เพราะไม่ย้ายห้อง — byNight ใช้แสดงปฏิทิน

```ts
export function hotelAvailability(input: { roomTypeId: string; checkInDate: string; checkOutDate: string; units: RoomUnit[];
  stays: ActiveStay[]; closedDates?: string[] }): { availableUnits: number; byNight: { date: string; freeUnits: number }[];
  reason: "ok" | "full" | "closed" };
```

**อัลกอริทึม**

1. availableUnits = จำนวนห้อง active ของประเภทนั้นที่ว่างทั้งช่วง [checkIn, checkOut)
2. byNight: ทุกคืน d ใน [checkIn, checkOut) นับห้องว่างของคืน [d, d+1)
3. closedDates = วันที่สาขาปิดโมดูล hotel (branch_closure scope all/hotel) ที่ตกในช่วงคืนพัก → availableUnits = 0, reason closed
4. LIFF แสดงประเภทห้องที่ availableUnits > 0 เท่านั้น

**Vectors `hotelAvailability`** → `docs/spec/vectors/R-28.hotelAvailability.json` (3 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | one room free whole range | `{"availableUnits": 0, "byNight": [{"date": "2026-10-09", "freeUnits": 1}, {"date": "2026-10-10", "freeUnits": 1}, {"date": "2026-10-11", …` |
| 2 | full | `{"availableUnits": 0, "byNight": [{"date": "2026-10-10", "freeUnits": 0}], "reason": "full"}` |
| 3 | closed date inside range | `{"availableUnits": 0, "byNight": [{"date": "2026-10-20", "freeUnits": 2}, {"date": "2026-10-21", "freeUnits": 2}, {"date": "2026-10-22", …` |

<a id="R-29"></a>

## R-29

### ที่ว่าง Daycare

Stories: US-06-13, US-11-05 · Module: `packages/domain/src/availability/daycare-availability.ts`

capacity ของรอบ morning/afternoon = จำนวนตัวในพื้นที่ครึ่งวันนั้น; full_day กินที่ทั้งสองครึ่ง และมีเพดานของตัวเอง

```ts
export function daycareAvailability(input: { sessionTypes: { session: "full_day" | "morning" | "afternoon"; capacity: number; status: string }[];
  visits: { session: "full_day" | "morning" | "afternoon"; status: string }[]; closed?: boolean }): Partial<Record<"full_day" | "morning" | "afternoon", number>>;
```

**อัลกอริทึม**

1. นับ visit ที่สถานะ reserved/checked_in/checked_out ของวันนั้น
2. morning ว่าง = cap_morning − (morning + full_day); afternoon เช่นเดียวกัน
3. full_day ว่าง = min(cap_full − full_day, ว่างของแต่ละครึ่งที่มีรอบ active)
4. ค่าติดลบ → 0; สาขาปิดโมดูล daycare → 0 ทุกรอบ

**Vectors `daycareAvailability`** → `docs/spec/vectors/R-29.daycareAvailability.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | empty day | `{"full_day": 6, "morning": 10, "afternoon": 10}` |
| 2 | busy morning limits full day | `{"full_day": 1, "morning": 1, "afternoon": 7}` |
| 3 | full day cap reached | `{"full_day": 0, "morning": 4, "afternoon": 4}` |
| 4 | only full_day offered | `{"full_day": 5}` |
| 5 | closed | `{"full_day": 0, "morning": 0, "afternoon": 0}` |

<a id="R-30"></a>

## R-30

### PromptPay QR (EMVCo payload)

Stories: US-07-01, US-07-08, US-08-04 · Module: `packages/domain/src/payment/promptpay.ts`

สร้าง QR ฟรีโดยไม่ผ่าน payment gateway — เงินเข้าบัญชีร้านโดยตรง; แสดงเป็นรูป QR ด้วยไลบรารี `qrcode` (ECC M)

```ts
export function promptPayPayload(input: { type: "phone" | "national_id" | "tax_id" | "ewallet"; id: string; amountSatang?: number | null }):
  { payload: string } | { error: "INVALID_PROMPTPAY_ID" };
```

**อัลกอริทึม**

1. TLV: `000201` + (`010212` มียอด / `010211` ไม่มียอด) + tag 29 [AID `A000000677010111` + `01` เบอร์ 0066+9 หลัก | `02` เลขบัตร/ภาษี 13 หลัก | `03` e-wallet 15 หลัก]
2. + `5303764` (THB) + `54` ยอด `บาท.สตางค์` (ถ้ามี) + `5802TH` + `6304` + CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) ตัวพิมพ์ใหญ่ 4 หลัก
3. id ตัดอักขระที่ไม่ใช่ตัวเลขก่อน; เบอร์ต้อง 10 หลักขึ้นต้น 0
4. แสดงชื่อบัญชี `branch.promptpay_account_name` และยอดใต้ QR เสมอ ให้ลูกค้าเทียบก่อนโอน

**หมายเหตุ**

- ทดสอบเพิ่มด้วยมือ: สแกน QR จากแอปธนาคารอย่างน้อย 3 ธนาคารก่อนปิด US-07-01 (ใส่ผลใน PR)

**Vectors `promptPayPayload`** → `docs/spec/vectors/R-30.promptPayPayload.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | phone with amount | `{"payload": "00020101021229370016A0000006770101110113006681234567853037645406150.005802TH6304C40C"}` |
| 2 | phone with satang amount | `{"payload": "00020101021229370016A00000067701011101130066812345678530376454071234.565802TH630471D1"}` |
| 3 | national id static | `{"payload": "00020101021129370016A0000006770101110213123456789012353037645802TH630433FC"}` |
| 4 | ewallet | `{"payload": "00020101021229390016A000000677010111031500499901234567853037645406500.005802TH6304C5C9"}` |
| 5 | invalid phone | `{"error": "INVALID_PROMPTPAY_ID"}` |

<a id="R-31"></a>

## R-31

### รูปแบบการแสดงผลไทย (เงิน วันที่ เวลา น้ำหนัก)

Stories: US-13-03 · Module: `packages/domain/src/format/thai.ts`

ทุกหน้าจอใช้ฟังก์ชันชุดนี้เท่านั้น (ห้าม toLocaleString เอง เพื่อให้ผลเหมือนกันทั้ง server/client)

```ts
export function formatTHB(input: { satang: number; decimals?: "auto" | "always" }): string;
export function formatThaiDate(input: { date: string; withWeekday?: boolean }): string;
export function formatTime(input: { instant: string; timezone: string }): string;
export function formatWeight(input: { grams: number }): string;
```

**อัลกอริทึม**

1. เงิน: `฿1,234` (auto ซ่อน .00) / `฿1,234.00` (always — ใช้ในใบเสร็จและบิล), ติดลบ `-฿500`
2. วันที่: `5 ต.ค. 2569`, มีวัน: `จ. 5 ต.ค. 2569` (ปี พ.ศ. เสมอ)
3. เวลา: `14:30 น.` ตาม timezone สาขา
4. น้ำหนัก: กิโลกรัม 1 ตำแหน่ง ปัดครึ่งขึ้น ซ่อน .0 — `5.2 กก.`, `5 กก.`

**Vectors `formatTHB`** → `docs/spec/vectors/R-31.formatTHB.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | auto whole | `"฿1,234"` |
| 2 | auto with satang | `"฿1,234.50"` |
| 3 | always | `"฿500.00"` |
| 4 | negative | `"-฿500"` |
| 5 | zero | `"฿0"` |

**Vectors `formatThaiDate`** → `docs/spec/vectors/R-31.formatThaiDate.json` (3 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | plain | `"5 ต.ค. 2569"` |
| 2 | weekday | `"จ. 5 ต.ค. 2569"` |
| 3 | sunday | `"อา. 11 ต.ค. 2569"` |

**Vectors `formatTime`** → `docs/spec/vectors/R-31.formatTime.json` (1 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | afternoon | `"14:30 น."` |

**Vectors `formatWeight`** → `docs/spec/vectors/R-31.formatWeight.json` (5 cases)

| # | case | expected (ย่อ) |
|---|---|---|
| 1 | 5.2 | `"5.2 กก."` |
| 2 | half up | `"5.3 กก."` |
| 3 | whole | `"5 กก."` |
| 4 | small | `"0.8 กก."` |
| 5 | heavy | `"32 กก."` |
