# -*- coding: utf-8 -*-
"""Business rules R-01..R-31: documentation + test-vector inputs. Expected outputs are computed by rules_impl."""
import rules_impl as I

TZ = "Asia/Bangkok"
RULES = []

def rule(id, name, stories, file, ts, summary, steps, notes=None, vectors=None):
    RULES.append(dict(id=id, name=name, stories=stories, file=file, ts=ts, summary=summary, steps=steps,
                      notes=notes or [], vectors=vectors or []))

def V(export, fn, cases):
    return dict(export=export, fn=fn, cases=cases)

# ------------------------------------------------------------------ R-01
TIERS = [
    {"id": "t-xs", "species": "dog", "code": "XS", "minWeightGrams": 0, "maxWeightGrams": 3000},
    {"id": "t-s", "species": "dog", "code": "S", "minWeightGrams": 3000, "maxWeightGrams": 6000},
    {"id": "t-m", "species": "dog", "code": "M", "minWeightGrams": 6000, "maxWeightGrams": 12000},
    {"id": "t-l", "species": "dog", "code": "L", "minWeightGrams": 12000, "maxWeightGrams": 25000},
    {"id": "t-xl", "species": "dog", "code": "XL", "minWeightGrams": 25000, "maxWeightGrams": None},
    {"id": "c-s", "species": "cat", "code": "S", "minWeightGrams": 0, "maxWeightGrams": 5000},
    {"id": "c-l", "species": "cat", "code": "L", "minWeightGrams": 5000, "maxWeightGrams": None},
]
rule("R-01", "หาขนาด (size tier) จากน้ำหนัก", "US-04-02, US-11-03", "packages/domain/src/pricing/size-tier.ts",
 """type SizeTierInput = { species: "dog" | "cat" | "other"; weightGrams: number | null;
  tiers: { id: string; species: "dog" | "cat"; code: string; minWeightGrams: number; maxWeightGrams: number | null }[] };
type SizeTierResult = { tierId: string | null; reason: "matched" | "no_weight" | "no_tier" };
export function resolveSizeTier(input: SizeTierInput): SizeTierResult;""",
 "เลือก size_tier ของสาขาตามชนิดสัตว์และน้ำหนักล่าสุด (`pet.latest_weight_grams`)",
 ["species = other → `no_tier` (สัตว์อื่นใช้ราคาแถวที่ size_tier_id = null เท่านั้น)",
  "weightGrams = null → `no_weight` (LIFF ให้ลูกค้าเลือกขนาดเอง / หน้าร้านต้องชั่งก่อน)",
  "เรียง tier ของ species นั้นตาม min แล้วหาแถวแรกที่ `min ≤ w < max` (max = null คือไม่มีเพดาน)",
  "ไม่เจอ → `no_tier`"],
 ["ขอบบน exclusive: 6000 g อยู่ M ไม่ใช่ S", "การตั้ง tier ต้องไม่ซ้อนกัน — validate ตอนบันทึก tier (error `SIZE_TIER_OVERLAP`)"],
 [V("resolveSizeTier", I.r01_resolve_size_tier, [
  ("dog 5.2 kg → S", {"species": "dog", "weightGrams": 5200, "tiers": TIERS}),
  ("lower bound inclusive 6000 → M", {"species": "dog", "weightGrams": 6000, "tiers": TIERS}),
  ("2999 → XS", {"species": "dog", "weightGrams": 2999, "tiers": TIERS}),
  ("no ceiling 40 kg → XL", {"species": "dog", "weightGrams": 40000, "tiers": TIERS}),
  ("cat uses cat tiers", {"species": "cat", "weightGrams": 6000, "tiers": TIERS}),
  ("no weight", {"species": "dog", "weightGrams": None, "tiers": TIERS}),
  ("species other", {"species": "other", "weightGrams": 800, "tiers": TIERS}),
  ("no tier configured for cat", {"species": "cat", "weightGrams": 3000, "tiers": TIERS[:5]}),
 ])])

# ------------------------------------------------------------------ R-02
PRICES = [
    {"serviceId": "svc-bath", "sizeTierId": "t-s", "coatGroup": "short", "priceSatang": 35000, "durationMinutes": 60},
    {"serviceId": "svc-bath", "sizeTierId": "t-s", "coatGroup": "long", "priceSatang": 45000, "durationMinutes": 75},
    {"serviceId": "svc-bath", "sizeTierId": "t-m", "coatGroup": "any", "priceSatang": 55000, "durationMinutes": 90},
    {"serviceId": "svc-bath", "sizeTierId": None, "coatGroup": "any", "priceSatang": 60000, "durationMinutes": 90},
    {"serviceId": "svc-nail", "sizeTierId": None, "coatGroup": "any", "priceSatang": 10000, "durationMinutes": 10},
    {"serviceId": "svc-cut", "sizeTierId": "t-s", "coatGroup": "long", "priceSatang": 80000, "durationMinutes": 120},
]
rule("R-02", "กลุ่มขนและการหาราคา/เวลาของบริการ", "US-04-02, US-04-03", "packages/domain/src/pricing/price-lookup.ts",
 """type CoatType = "short" | "long" | "double" | "curly" | "wire" | "hairless" | "unknown";
type CoatGroup = "short" | "long" | "any";
export function coatGroupOf(input: { coatType: CoatType }): CoatGroup;
type PriceRow = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; priceSatang: number; durationMinutes: number };
type PriceLookupInput = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; prices: PriceRow[] };
type PriceLookupResult = { priceSatang: number; durationMinutes: number;
  matched: "tier+coat" | "tier+any" | "all+coat" | "all+any" } | null;
export function lookupServicePrice(input: PriceLookupInput): PriceLookupResult;""",
 "แปลง `pet.coat_type` → coat group แล้วหาแถว `service_price` (rate plan default ของสาขา) ตามลำดับความเฉพาะเจาะจง",
 ["coat group: short/hairless/wire → `short`; long/double/curly → `long`; unknown → `any`",
  "ลำดับค้นหา: (tier, coat) → (tier, any) → (null, coat) → (null, any) — ข้ามขั้นที่ใช้ coat เมื่อ coatGroup = any และข้ามขั้นที่ใช้ tier เมื่อ sizeTierId = null",
  "ไม่เจอ → `null` → API ตอบ `PRICE_NOT_FOUND` (บริการนี้ไม่เปิดให้ขนาด/ขนนี้)"],
 ["prices ที่ส่งเข้ามาต้องกรอง rate_plan เป็นแผน default ของสาขาแล้ว (MVP มีแผนเดียว)"],
 [V("coatGroupOf", I.r02_coat_group, [(f"{c}", {"coatType": c}) for c in ["short", "long", "double", "curly", "wire", "hairless", "unknown"]]),
  V("lookupServicePrice", I.r02_lookup_price, [
  ("exact tier+coat", {"serviceId": "svc-bath", "sizeTierId": "t-s", "coatGroup": "long", "prices": PRICES}),
  ("tier with 'any' row", {"serviceId": "svc-bath", "sizeTierId": "t-m", "coatGroup": "long", "prices": PRICES}),
  ("fallback to all sizes", {"serviceId": "svc-bath", "sizeTierId": "t-xl", "coatGroup": "short", "prices": PRICES}),
  ("unknown coat skips coat rows", {"serviceId": "svc-bath", "sizeTierId": "t-s", "coatGroup": "any", "prices": PRICES}),
  ("no size → all-size row", {"serviceId": "svc-nail", "sizeTierId": None, "coatGroup": "short", "prices": PRICES}),
  ("not offered for short coat", {"serviceId": "svc-cut", "sizeTierId": "t-s", "coatGroup": "short", "prices": PRICES}),
  ("not offered without size", {"serviceId": "svc-cut", "sizeTierId": None, "coatGroup": "long", "prices": PRICES}),
 ])])

# ------------------------------------------------------------------ R-03
rule("R-03", "ราคาประเมินและเวลาของใบจอง", "US-05-04, US-11-03, US-11-04, US-11-05, US-06-06", "packages/domain/src/pricing/quote.ts",
 """type QuoteInput = { bufferMinutes: number;
  groom?: { startsAt: string; items: { priceSatang: number; durationMinutes: number }[] }[];
  stays?: { checkInDate: string; checkOutDate: string; nightlyPriceSatang: number;
            addons?: { unitPriceSatang: number; perDay: boolean; quantity?: number }[] }[];
  daycare?: { priceSatang: number }[] };
type QuoteResult = { groom: { servicesTotalSatang: number; durationMinutes: number; endsAt: string; blockedUntil: string }[];
  stays: { nights: number; roomTotalSatang: number; addons: { quantity: number; totalSatang: number }[]; addonsTotalSatang: number }[];
  daycareTotalSatang: number; estimatedTotalSatang: number } | { error: "DURATION_ZERO" | "INVALID_DATE_RANGE" };
export function quoteBooking(input: QuoteInput): QuoteResult;""",
 "คำนวณยอดประเมิน `booking.estimated_total_satang` และเวลา `ends_at`/`blocked_until` ของแต่ละนัด",
 ["กรูมต่อ 1 ตัว: ราคา = Σ priceSatang ของ items (บริการหลัก + add-on), เวลา = Σ durationMinutes; เวลา = 0 → `DURATION_ZERO`",
  "`endsAt = startsAt + duration`, `blockedUntil = endsAt + branch_policy.buffer_minutes`",
  "พัก: nights = check_out_date − check_in_date (≥ 1 ไม่งั้น `INVALID_DATE_RANGE`), room = nights × nightly price",
  "add-on ของการพัก: perDay → quantity = nights, ไม่ใช่ perDay → quantity ที่ส่งมา (default 1)",
  "Daycare: ราคาต่อรอบ (daycare_rate) ต่อ 1 ตัว 1 วัน",
  "estimated = Σ ทุกส่วน — ยังไม่หักมัดจำ/ส่วนลด (ส่วนลดทำตอนปิดบิล R-15)"],
 ["ราคา snapshot ลง `groom_appointment_item.price_satang`, `stay.nightly_price_satang`, `stay_addon.unit_price_satang`, `daycare_visit.price_satang` ตอนสร้าง — ห้ามคำนวณใหม่จาก catalog ภายหลัง"],
 [V("quoteBooking", I.r03_quote_booking, [
  ("two pets grooming", {"bufferMinutes": 10, "groom": [
      {"startsAt": "2026-10-05T03:00:00.000Z", "items": [{"priceSatang": 45000, "durationMinutes": 75}, {"priceSatang": 10000, "durationMinutes": 10}]},
      {"startsAt": "2026-10-05T03:00:00.000Z", "items": [{"priceSatang": 35000, "durationMinutes": 60}]}]}),
  ("stay 3 nights + per-day addon + one-off addon", {"bufferMinutes": 10, "stays": [
      {"checkInDate": "2026-10-10", "checkOutDate": "2026-10-13", "nightlyPriceSatang": 50000,
       "addons": [{"unitPriceSatang": 5000, "perDay": True}, {"unitPriceSatang": 30000, "perDay": False}]}]}),
  ("stay + groom bundle + daycare", {"bufferMinutes": 15,
      "groom": [{"startsAt": "2026-10-13T04:00:00.000Z", "items": [{"priceSatang": 45000, "durationMinutes": 75}]}],
      "stays": [{"checkInDate": "2026-10-10", "checkOutDate": "2026-10-13", "nightlyPriceSatang": 50000}],
      "daycare": [{"priceSatang": 40000}]}),
  ("zero duration rejected", {"bufferMinutes": 10, "groom": [{"startsAt": "2026-10-05T03:00:00.000Z", "items": [{"priceSatang": 10000, "durationMinutes": 0}]}]}),
  ("same-day stay rejected", {"bufferMinutes": 10, "stays": [{"checkInDate": "2026-10-10", "checkOutDate": "2026-10-10", "nightlyPriceSatang": 50000}]}),
 ])])

# ------------------------------------------------------------------ R-04
SLOT_BASE = {
    "date": "2026-10-05", "timezone": TZ, "now": "2026-10-04T05:00:00.000Z", "channel": "online",
    "policy": {"slotStepMinutes": 30, "bufferMinutes": 15, "bookingLeadMinutes": 120, "bookingHorizonDays": 60,
               "maxAppointmentsPerDay": None, "maxAppointmentsPerGroomerDay": None},
    "branchHours": {"isClosed": False, "opensAt": "09:00", "closesAt": "18:00"},
    "closures": [], "stationIds": ["st-1", "st-2"],
    "groomers": [
        {"id": "g-a", "sortOrder": 1, "workingHours": {"startsAt": "09:00", "endsAt": "18:00", "breakStartsAt": "12:00", "breakEndsAt": "13:00"}, "timeOff": []},
        {"id": "g-b", "sortOrder": 2, "workingHours": {"startsAt": "10:00", "endsAt": "17:00", "breakStartsAt": None, "breakEndsAt": None}, "timeOff": []},
    ],
    "appointments": [{"groomerId": "g-a", "stationId": "st-1", "startsAt": "2026-10-05T02:00:00.000Z", "blockedUntil": "2026-10-05T03:45:00.000Z"}],
    "durationMinutes": 90, "groomerPreference": {"type": "any"},
}
import copy
def S(**kw):
    d = copy.deepcopy(SLOT_BASE)
    for k, v in kw.items():
        if k == "policy":
            d["policy"].update(v)
        else:
            d[k] = v
    return d
g_b_off = copy.deepcopy(SLOT_BASE["groomers"])
g_b_off[1]["timeOff"] = [{"startsAt": "2026-10-04T17:00:00.000Z", "endsAt": "2026-10-05T17:00:00.000Z"}]
rule("R-04", "Slot engine กรูม (เวลาว่าง + เลือกช่าง/โต๊ะอัตโนมัติ)", "US-05-01, US-05-04, US-11-03, US-05-08",
 "packages/domain/src/availability/groom-slots.ts",
 """type SlotInput = { date: string; timezone: string; now: string; channel: "online" | "staff";
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
export function computeGroomSlots(input: SlotInput): SlotResult;""",
 "คืนเวลาเริ่มที่จองได้ของน้อง 1 ตัวในวันที่เลือก พร้อมช่างและโต๊ะที่ระบบเลือกให้ — ต้องให้ผลสอดคล้องกับ exclusion constraint ใน DB เสมอ",
 ["วันปิด (`branch_hours.is_closed`) → `closed`; online: วันที่ < วันนี้ → `past`, เกิน `booking_horizon_days` → `beyond_horizon`; จำนวนนัดทั้งวัน ≥ `max_appointments_per_day` → `day_full`",
  "เวลาเริ่มที่เป็นไปได้ t = opensAt + k × slot_step โดยงานต้องจบภายในเวลาปิด (`t + duration ≤ closesAt`); buffer เลยเวลาปิดได้",
  "online: ตัด t < now + booking_lead_minutes; staff: ตัด slot ที่ช่วง step ผ่านไปแล้วทั้งช่วง (`t + step ≤ now`) — walk-in ลงช่วงปัจจุบันได้",
  "ช่วงทำงาน W = [t, t+duration) ห้ามทับ closure ที่ scope = all/grooming",
  "ช่วงกัน B = [t, t+duration+buffer) — โต๊ะ: เลือกโต๊ะแรกตาม sort_order ที่ไม่มีนัด [startsAt, blockedUntil) ทับ B",
  "ช่างที่มีสิทธิ์: มี working hours วันนั้น, W อยู่ในเวลางานทั้งหมด, W ไม่ทับเวลาพักและ time off, B ไม่ทับนัดของช่างคนนั้น, จำนวนนัดของช่าง < max ต่อวัน",
  "preference = specific → พิจารณาเฉพาะช่างคนนั้น; any → เลือกช่างที่ booked minutes (Σ blockedUntil−startsAt) น้อยสุดในวันนั้น, เสมอกันใช้ sortOrder แล้ว id",
  "ผลเรียงตาม startsAt; ว่างทั้งหมด → reason `no_capacity`"],
 ["ทุกเวลาเป็น UTC ISO; working hours/branch hours เป็นเวลาท้องถิ่นของ `date` แปลงด้วย R-20",
  "หลายตัวในใบจองเดียว: เรียกทีละตัว โดยใส่นัดของตัวก่อนหน้า (ที่ยังไม่บันทึก) ลงใน `appointments`",
  "ตอนบันทึกจริง ถ้า DB ตอบ `23P01` (มีคนจองตัดหน้า) → API ตอบ `SLOT_TAKEN` และ UI โหลด slot ใหม่",
  "การเลือกช่างไม่ดูทักษะใน MVP (ช่างทุกคนที่ is_groomer ทำได้ทุกบริการ)"],
 [V("computeGroomSlots", I.r04_slots, [
  ("any groomer, next day, online", S()),
  ("specific groomer g-b", S(groomerPreference={"type": "specific", "groomerId": "g-b"})),
  ("same day online respects 120 min lead", S(now="2026-10-05T02:20:00.000Z")),
  ("closure 15:00-18:00 for grooming", S(closures=[{"startsAt": "2026-10-05T08:00:00.000Z", "endsAt": "2026-10-05T11:00:00.000Z", "scope": "grooming"}])),
  ("hotel-only closure is ignored", S(closures=[{"startsAt": "2026-10-05T08:00:00.000Z", "endsAt": "2026-10-05T11:00:00.000Z", "scope": "hotel"}])),
  ("single station shared by both groomers", S(stationIds=["st-1"], appointments=SLOT_BASE["appointments"] + [
      {"groomerId": "g-b", "stationId": "st-1", "startsAt": "2026-10-05T06:00:00.000Z", "blockedUntil": "2026-10-05T07:45:00.000Z"}])),
  ("branch closed", S(branchHours={"isClosed": True, "opensAt": None, "closesAt": None})),
  ("specific groomer on time off", S(groomers=g_b_off, groomerPreference={"type": "specific", "groomerId": "g-b"})),
  ("staff walk-in at 10:07 can take the 10:00 slot", S(channel="staff", now="2026-10-05T03:07:00.000Z")),
  ("max 1 appointment per groomer", S(policy={"maxAppointmentsPerGroomerDay": 1})),
  ("max per day reached", S(policy={"maxAppointmentsPerDay": 1})),
  ("beyond horizon", S(now="2026-07-01T05:00:00.000Z")),
 ])])

# ------------------------------------------------------------------ R-05
P1 = I.make_slip_payload("004", "014242082547BPM04988")
P2 = I.make_slip_payload("014", "202610051030451234")
rule("R-05", "อ่าน QR บนสลิป + จับสลิปซ้ำ", "US-07-02, US-11-07", "packages/domain/src/payment/slip.ts",
 """type SlipQr = { bankCode: string | null; transRef: string; crcValid: boolean } | null;
export function parseSlipQr(input: { payload: string }): SlipQr;
export function findDuplicateSlip(input: { transRef: string | null;
  existing: { id: string; transRef: string | null; status: "submitted" | "verified" | "rejected"; createdAt: string }[] }):
  { duplicateOfSlipId: string | null };""",
 "สลิปธนาคารไทยมี mini-QR (TLV แบบ EMVCo) ที่มีเลขอ้างอิงธุรกรรม — ใช้จับสลิปเดิมที่ถูกส่งซ้ำ (ไม่ใช่การยืนยันว่าเงินเข้าจริง; ร้านต้องเช็คบัญชีเองเสมอ)",
 ["ฝั่ง client ถอด QR จากรูปสลิปด้วยไลบรารีฟรี (เช่น jsQR / zxing) แล้วส่ง `qrPayload` มากับการอัปโหลด — อ่านไม่ได้ส่ง null",
  "parse TLV ชั้นนอก (tag 2 หลัก + ความยาว 2 หลัก) ต้องมี tag `00` และ `91`; tag `00` ข้างในมี `01` = รหัสธนาคารผู้โอน, `02` = เลขอ้างอิง (transRef)",
  "CRC16-CCITT (tag 91) ไม่ตรง → ยัง parse ได้ แต่ `crcValid = false` (รูปแบบจริงของแต่ละธนาคารยืนยันใน SP-02)",
  "ซ้ำ = มีสลิปในองค์กรเดียวกันที่ transRef เท่ากันและสถานะไม่ใช่ rejected → เก็บ `payment_slip.duplicate_of_slip_id` และ UI แสดงป้ายแดง \"สลิปนี้เคยใช้แล้ว\"",
  "สลิปซ้ำยังบันทึกได้ (สถานะ submitted) แต่ปุ่ม \"ยืนยัน\" ต้องกดยืนยันซ้ำ 2 ชั้น"],
 ["⚠️ รูปแบบ payload ในเวกเตอร์สร้างตามโครงสร้างที่คาดไว้ — SP-02 ต้องเพิ่มเวกเตอร์จากสลิปจริง ≥ 6 ธนาคาร (มนุษย์อนุมัติ) ก่อนปิด US-07-02"],
 [V("parseSlipQr", I.r05_parse_slip_qr, [
  ("KBank-style payload", {"payload": P1}),
  ("SCB-style payload", {"payload": P2}),
  ("tampered CRC is flagged, still parsed", {"payload": P1[:-4] + "0000"}),
  ("not a slip QR (PromptPay payment QR)", {"payload": I.r30_promptpay_payload({"type": "phone", "id": "0812345678", "amountSatang": 15000})["payload"]}),
  ("garbage", {"payload": "hello world"}),
 ]),
  V("findDuplicateSlip", I.r05_find_duplicate, [
  ("first time", {"transRef": "014242082547BPM04988", "existing": []}),
  ("duplicate of verified slip", {"transRef": "014242082547BPM04988", "existing": [
      {"id": "slip-1", "transRef": "014242082547BPM04988", "status": "verified", "createdAt": "2026-10-01T03:00:00.000Z"}]}),
  ("rejected slip does not count", {"transRef": "014242082547BPM04988", "existing": [
      {"id": "slip-1", "transRef": "014242082547BPM04988", "status": "rejected", "createdAt": "2026-10-01T03:00:00.000Z"}]}),
  ("earliest match wins", {"transRef": "X1", "existing": [
      {"id": "slip-3", "transRef": "X1", "status": "submitted", "createdAt": "2026-10-03T03:00:00.000Z"},
      {"id": "slip-2", "transRef": "X1", "status": "verified", "createdAt": "2026-10-02T03:00:00.000Z"}]}),
  ("no QR read", {"transRef": None, "existing": [{"id": "slip-1", "transRef": None, "status": "submitted", "createdAt": "2026-10-01T03:00:00.000Z"}]}),
 ])])

# ------------------------------------------------------------------ R-06
def D(total, typ="none", val=0, exempt=False, lvl=3):
    return {"estimatedTotalSatang": total, "policy": {"type": typ, "value": val},
            "customer": {"depositExempt": exempt, "reliabilityLevel": lvl}}
rule("R-06", "คำนวณมัดจำ", "US-07-03, US-11-03, US-03-09", "packages/domain/src/payment/deposit.ts",
 """type DepositInput = { estimatedTotalSatang: number; policy: { type: "none" | "fixed" | "percent"; value: number };
  customer: { depositExempt: boolean; reliabilityLevel: 1 | 2 | 3 | 4 } };
export function computeDeposit(input: DepositInput): { depositRequiredSatang: number;
  reason: "exempt" | "reliability_full_prepay" | "reliability_min_30" | "policy_none" | "policy_fixed" | "policy_percent" };""",
 "มัดจำต่อ 1 ใบจอง (ไม่ใช่ต่อตัว) จากนโยบายสาขา (`branch_policy.default_deposit_*`) และระดับความน่าเชื่อถือ (R-09)",
 ["`customer.deposit_exempt` → 0 เสมอ",
  "ระดับ 1 (เสี่ยงสูง) → มัดจำ = ยอดประเมินเต็ม (จ่ายล่วงหน้าทั้งหมด) และใบจองต้องรออนุมัติ (R-08)",
  "percent: `ceil(total × pct / 10000) × 100` = ปัดขึ้นเป็นบาทเต็ม (integer math เท่านั้น) แล้วไม่เกิน total",
  "fixed: `min(value, total)`",
  "ระดับ 2 (เฝ้าระวัง): อย่างน้อย 30% ของ total (ปัดขึ้นบาทเต็ม) แม้นโยบายเป็น none หรือต่ำกว่า 30%",
  "ผลเป็น 0 → `booking.deposit_status = not_required`"],
 ["ร้านลงนัดเอง (walk-in/โทร/แชท): ใช้ค่านี้เป็นค่าเริ่มต้น แต่หน้าร้านแก้เป็น 0 ได้พร้อมเหตุผล (เข้า audit_log `booking.deposit_waived`)"],
 [V("computeDeposit", I.r06_deposit, [
  ("policy none", D(85000)),
  ("percent 30 exact", D(85000, "percent", 30)),
  ("percent 30 rounds up to whole baht", D(123456, "percent", 30)),
  ("fixed larger than total", D(15000, "fixed", 20000)),
  ("fixed", D(80000, "fixed", 20000)),
  ("exempt wins", D(80000, "percent", 50, exempt=True, lvl=1)),
  ("level 1 full prepay", D(80000, "percent", 30, lvl=1)),
  ("level 2 with policy none → 30%", D(85000, lvl=2)),
  ("level 2 keeps higher policy", D(85000, "percent", 50, lvl=2)),
  ("level 2 raises low fixed", D(100000, "fixed", 10000, lvl=2)),
 ])])

# ------------------------------------------------------------------ R-07
SNAP = {"groomingFreeCancelHours": 24, "hotelFreeCancelHours": 72, "daycareFreeCancelHours": 24,
        "lateCancelForfeitPercent": 100, "cancelRefundMode": "credit"}
def C(now, kind="customer_cancel", modules=("grooming",), dep=30000, snap=None, choice=None):
    d = {"now": now, "firstServiceAt": "2026-10-10T03:00:00.000Z", "modules": list(modules), "kind": kind,
         "depositVerifiedSatang": dep, "policySnapshot": dict(SNAP, **(snap or {}))}
    if choice: d["customerChoice"] = choice
    return d
rule("R-07", "ผลของการยกเลิก / no-show (ริบ-คืน-เครดิต)", "US-07-04, US-07-05, US-07-07, US-11-08, US-05-08",
 "packages/domain/src/payment/cancellation.ts",
 """type CancelInput = { now: string; firstServiceAt: string; modules: ("grooming" | "hotel" | "daycare")[];
  kind: "customer_cancel" | "shop_cancel" | "no_show"; depositVerifiedSatang: number;
  policySnapshot: { groomingFreeCancelHours: number; hotelFreeCancelHours: number; daycareFreeCancelHours: number;
                    lateCancelForfeitPercent: number; cancelRefundMode: "refund" | "credit" | "customer_choice" };
  customerChoice?: "refund" | "credit" };
type CancelResult = { isLate: boolean; minutesBefore: number; freeCancelHours: number; forfeitSatang: number;
  returnSatang: number; returnMode: "refund" | "credit" | "none" | null };
export function computeCancellation(input: CancelInput): CancelResult;""",
 "ใช้ `booking.policy_snapshot` (นโยบาย ณ เวลาจอง) เสมอ — ไม่ใช้นโยบายปัจจุบันของร้าน",
 ["minutesBefore = floor((firstServiceAt − now) / 60 000) — `booking.first_service_at` คือบริการแรกของใบจอง",
  "ใบจองหลายโมดูล: freeCancelHours = ค่าที่มากที่สุดของโมดูลในใบจอง (เข้มสุด)",
  "customer_cancel (ลูกค้ายกเลิกเอง หรือร้านยกเลิกตามคำขอลูกค้า): late ถ้า minutesBefore < freeCancelHours × 60; forfeit = late ? floor(deposit × pct / 100) : 0",
  "shop_cancel (ร้านเป็นฝ่ายยกเลิก): ไม่ริบ, คืนเต็ม, mode = refund (หรือ credit ถ้าลูกค้าเลือก)",
  "no_show: ริบมัดจำทั้งหมด (100%) ไม่ขึ้นกับ pct",
  "return = deposit − forfeit; mode ตาม `cancel_refund_mode` (customer_choice → ตามที่ลูกค้าเลือก, ไม่เลือก = credit); return = 0 → `none`"],
 ["ผล: credit → เขียน `credit_ledger` (+) reason `cancellation_credit` และอัปเดต `customer.credit_balance_satang` ใน transaction เดียวกัน",
  "refund → สร้าง `refund` สถานะรอโอน (ร้านโอนคืนเองแล้วแนบหลักฐาน); booking.deposit_status = refunded / credited / forfeited",
  "late cancel และ no-show นับเข้า `customer.late_cancel_count_12m` / `no_show_count_12m` แล้วคำนวณ R-09 ใหม่"],
 [V("computeCancellation", I.r07_cancellation, [
  ("30h before grooming → full credit", C("2026-10-08T21:00:00.000Z")),
  ("1 minute inside window → forfeit all", C("2026-10-09T03:01:00.000Z")),
  ("exactly 24h before is not late", C("2026-10-09T03:00:00.000Z")),
  ("late with 50% forfeit, odd amount", C("2026-10-09T20:00:00.000Z", dep=33333, snap={"lateCancelForfeitPercent": 50})),
  ("hotel rule (72h) dominates mixed booking", C("2026-10-08T03:00:00.000Z", modules=("grooming", "hotel"))),
  ("shop cancels 1h before", C("2026-10-10T02:00:00.000Z", kind="shop_cancel")),
  ("no-show forfeits everything", C("2026-10-10T04:00:00.000Z", kind="no_show", snap={"lateCancelForfeitPercent": 50})),
  ("customer_choice → refund", C("2026-10-07T03:00:00.000Z", snap={"cancelRefundMode": "customer_choice"}, choice="refund")),
  ("no deposit", C("2026-10-09T20:00:00.000Z", dep=0)),
 ])])

# ------------------------------------------------------------------ R-08
rule("R-08", "เวลาหมดอายุของการล็อกคิวและการรออนุมัติ", "US-05-02, US-05-05, US-11-07", "packages/domain/src/booking/deadlines.ts",
 """export function computeBookingDeadlines(input: { createdAt: string; depositRequiredSatang: number; requiresApproval: boolean;
  holdMinutes: number; approvalTimeoutMinutes: number }): { holdExpiresAt: string | null; approvalDueAt: string | null };""",
 "กำหนด `booking.hold_expires_at` และ `booking.approval_due_at` ตอนลูกค้าสร้างใบจองออนไลน์",
 ["ต้องจ่ายมัดจำ → hold_expires_at = createdAt + hold_minutes (สถานะ awaiting_deposit) และตั้ง job `expire_hold` ที่เวลานั้น",
  "ต้องอนุมัติ (`auto_confirm_*` = false ของโมดูลใดโมดูลหนึ่ง หรือ reliability = 1) → approval_due_at = createdAt + approval_timeout_minutes และตั้ง job `approval_overdue`",
  "ลูกค้าส่งสลิปก่อนหมดเวลา → สถานะ deposit_review และล้าง hold_expires_at (คิวยังถูกกันไว้จนร้านตรวจ)",
  "ร้านปฏิเสธสลิป → กลับ awaiting_deposit พร้อม hold ใหม่ = now + hold_minutes (โอกาสแก้ 1 ครั้ง; ปฏิเสธครั้งที่ 2 → expired)",
  "job `expire_hold` ทำงานเฉพาะเมื่อสถานะยังเป็น awaiting_deposit และ hold_expires_at ≤ now (idempotent)"],
 ["ร้านลงนัดเอง (channel walk_in/phone/chat) ไม่มี hold — สถานะ confirmed ทันที แม้มีมัดจำค้าง (deposit_status = pending)"],
 [V("computeBookingDeadlines", I.r08_deadlines, [
  ("deposit only", {"createdAt": "2026-10-05T03:00:00.000Z", "depositRequiredSatang": 20000, "requiresApproval": False, "holdMinutes": 15, "approvalTimeoutMinutes": 120}),
  ("approval only", {"createdAt": "2026-10-05T03:00:00.000Z", "depositRequiredSatang": 0, "requiresApproval": True, "holdMinutes": 15, "approvalTimeoutMinutes": 120}),
  ("both", {"createdAt": "2026-10-05T03:00:00.000Z", "depositRequiredSatang": 20000, "requiresApproval": True, "holdMinutes": 30, "approvalTimeoutMinutes": 60}),
  ("neither → confirmed immediately", {"createdAt": "2026-10-05T03:00:00.000Z", "depositRequiredSatang": 0, "requiresApproval": False, "holdMinutes": 15, "approvalTimeoutMinutes": 120}),
 ])])

# ------------------------------------------------------------------ R-09
def RL(ns=0, lc=0, done=0, ov=None):
    return {"noShowCount12m": ns, "lateCancelCount12m": lc, "completedVisits12m": done, "override": ov}
rule("R-09", "ระดับความน่าเชื่อถือลูกค้า (1–4)", "US-03-09, US-07-07", "packages/domain/src/customer/reliability.ts",
 """export function computeReliability(input: { noShowCount12m: number; lateCancelCount12m: number; completedVisits12m: number;
  override: 1 | 2 | 3 | 4 | null }): { level: 1 | 2 | 3 | 4; source: "override" | "computed" };""",
 "ระดับเก็บใน `customer.reliability_level` (ค่าที่ใช้จริง = override ถ้ามี); นับย้อนหลัง 12 เดือนจากวันนี้",
 ["override มีค่า → ใช้ override",
  "no-show ≥ 2 หรือ (no-show ≥ 1 และ late cancel ≥ 2) → 1 เสี่ยงสูง",
  "no-show = 1 หรือ late cancel ≥ 2 → 2 เฝ้าระวัง",
  "มาใช้บริการสำเร็จ ≥ 5 ครั้ง และไม่มี late cancel/no-show → 4 ดีเยี่ยม",
  "นอกนั้น → 3 ปกติ (ค่าเริ่มต้นลูกค้าใหม่)",
  "ผลต่อระบบ: 1 → มัดจำเต็ม + ต้องอนุมัติ (R-06/R-08); 2 → มัดจำ ≥ 30%; 3/4 → ปกติ (4 แสดงป้าย ⭐ เท่านั้น)"],
 ["completed = นัด/การพัก/daycare ที่บิลปิดสถานะ paid; คำนวณใหม่เมื่อ: กด no-show, late cancel, ปิดบิล, และ job `recompute_reliability` ทุกคืน 03:00 (ให้นับ 12 เดือนเลื่อนออก)",
  "blacklisted แยกจากระดับ: blacklisted → จองออนไลน์ไม่ได้ (R-12) ไม่ว่าระดับใด"],
 [V("computeReliability", I.r09_reliability, [
  ("new customer", RL()), ("1 no-show", RL(ns=1)), ("2 late cancels", RL(lc=2)), ("2 no-shows", RL(ns=2)),
  ("1 no-show + 2 late", RL(ns=1, lc=2)), ("loyal", RL(done=5)), ("loyal but 1 late", RL(lc=1, done=8)),
  ("override wins", RL(ns=3, ov=3)),
 ])])

# ------------------------------------------------------------------ R-10 / R-28
UNITS = [
    {"id": "A1", "code": "A1", "roomTypeId": "rt-std", "status": "active", "sortOrder": 1},
    {"id": "A2", "code": "A2", "roomTypeId": "rt-std", "status": "active", "sortOrder": 2},
    {"id": "A3", "code": "A3", "roomTypeId": "rt-std", "status": "maintenance", "sortOrder": 3},
    {"id": "B1", "code": "B1", "roomTypeId": "rt-vip", "status": "active", "sortOrder": 1},
]
STAYS = [{"roomUnitId": "A1", "checkInDate": "2026-10-10", "checkOutDate": "2026-10-12"},
         {"roomUnitId": "A2", "checkInDate": "2026-10-08", "checkOutDate": "2026-10-10"}]
def RA(ci, co, stays=STAYS, rt="rt-std"):
    return {"roomTypeId": rt, "checkInDate": ci, "checkOutDate": co, "units": UNITS, "stays": stays}
rule("R-10", "จัดห้องอัตโนมัติ (room unit allocation)", "US-06-03, US-11-04", "packages/domain/src/availability/room-allocation.ts",
 """type RoomUnit = { id: string; code: string; roomTypeId: string; status: "active" | "maintenance" | "archived"; sortOrder: number };
type ActiveStay = { roomUnitId: string; checkInDate: string; checkOutDate: string };   // status reserved | checked_in
export function allocateRoom(input: { roomTypeId: string; checkInDate: string; checkOutDate: string; units: RoomUnit[]; stays: ActiveStay[] }):
  { roomUnitId: string | null; rule: "back_to_back_before" | "back_to_back_after" | "first_free" | "none_free" };""",
 "ลูกค้าเลือก 'ประเภทห้อง' ระบบเลือก 'ห้อง' ให้ — 1 การพักอยู่ห้องเดียวตลอด (MVP ไม่ย้ายห้อง)",
 ["ผู้สมัคร = ห้องของประเภทนั้นที่ status = active และไม่มีการพักทับช่วง [checkIn, checkOut) (วันเช็คเอาท์ของคนก่อน = วันเช็คอินได้)",
  "เลือกห้องที่มีแขกเช็คเอาท์วันเดียวกับ checkIn ก่อน (ลดช่องว่าง), ถัดมาห้องที่มีแขกเช็คอินวันเดียวกับ checkOut, ไม่งั้นห้องแรกตาม sortOrder, code",
  "ไม่มีห้องว่าง → `none_free` → API `ROOM_TAKEN`"],
 ["ร้านเปลี่ยนห้องเองได้บน Room map (ต้องผ่าน exclusion constraint)", "housekeeping = dirty ไม่กันการจองอนาคต (แสดงเตือนบน Room map วันนี้เท่านั้น)"],
 [V("allocateRoom", I.r10_allocate_room, [
  ("prefer room vacated the same day", RA("2026-10-10", "2026-10-13")),
  ("prefer room whose next guest arrives on our checkout", RA("2026-10-05", "2026-10-08")),
  ("first free by sort order", RA("2026-10-20", "2026-10-22")),
  ("maintenance room never chosen → none", RA("2026-10-09", "2026-10-11", stays=STAYS + [{"roomUnitId": "A2", "checkInDate": "2026-10-10", "checkOutDate": "2026-10-11"}])),
  ("other room type", RA("2026-10-10", "2026-10-12", rt="rt-vip")),
 ])])
rule("R-28", "ห้องว่างของประเภทห้อง (hotel availability)", "US-06-03, US-11-04, US-06-04", "packages/domain/src/availability/hotel-availability.ts",
 """export function hotelAvailability(input: { roomTypeId: string; checkInDate: string; checkOutDate: string; units: RoomUnit[];
  stays: ActiveStay[]; closedDates?: string[] }): { availableUnits: number; byNight: { date: string; freeUnits: number }[];
  reason: "ok" | "full" | "closed" };""",
 "จำนวนห้องที่ว่าง **ตลอดช่วง** (ไม่ใช่รายคืน) เพราะไม่ย้ายห้อง — byNight ใช้แสดงปฏิทิน",
 ["availableUnits = จำนวนห้อง active ของประเภทนั้นที่ว่างทั้งช่วง [checkIn, checkOut)",
  "byNight: ทุกคืน d ใน [checkIn, checkOut) นับห้องว่างของคืน [d, d+1)",
  "closedDates = วันที่สาขาปิดโมดูล hotel (branch_closure scope all/hotel) ที่ตกในช่วงคืนพัก → availableUnits = 0, reason closed",
  "LIFF แสดงประเภทห้องที่ availableUnits > 0 เท่านั้น"],
 [],
 [V("hotelAvailability", I.r28_hotel_availability, [
  ("one room free whole range", RA("2026-10-09", "2026-10-12")),
  ("full", dict(RA("2026-10-10", "2026-10-11", stays=STAYS + [{"roomUnitId": "A2", "checkInDate": "2026-10-10", "checkOutDate": "2026-10-11"}]))),
  ("closed date inside range", dict(RA("2026-10-20", "2026-10-23"), closedDates=["2026-10-21"])),
 ])])

# ------------------------------------------------------------------ R-11
VAX = [{"code": "DOG_RABIES", "expiresOn": "2027-01-01", "status": "verified"},
       {"code": "DOG_DHPPL", "expiresOn": "2026-10-11", "status": "verified"},
       {"code": "DOG_KENNEL_COUGH", "expiresOn": "2027-05-01", "status": "pending_review"}]
rule("R-11", "ตรวจวัคซีนก่อนรับฝาก (vaccine gate)", "US-06-05, US-11-04, US-11-05", "packages/domain/src/pet/vaccine-gate.ts",
 """export function checkVaccines(input: { requiredCodes: string[];
  vaccinations: { code: string; expiresOn: string; status: "pending_review" | "verified" | "rejected" }[]; mustBeValidOn: string }):
  { ok: boolean; missing: string[]; expired: string[]; pendingReview: string[] };""",
 "วัคซีนที่บังคับมาจาก `branch_policy.required_vaccines_dog/cat`; ต้องมีผลถึงวัน `mustBeValidOn`",
 ["mustBeValidOn: Hotel = check_out_date, Daycare = visit_date, กรูม (ถ้า enforce_vaccines_grooming) = วันที่นัด",
  "ต่อรหัส: ไม่มีบันทึก (หรือมีแต่ rejected) → missing; มี verified ที่ expiresOn ≥ mustBeValidOn → ผ่าน; มีแต่ pending_review ที่ยังไม่หมดอายุ → pendingReview; นอกนั้น → expired",
  "ok = ไม่มีทั้งสามรายการ",
  "LIFF: ไม่ ok → ให้ลูกค้าอัปโหลดรูปสมุดวัคซีน (status pending_review) แล้วจองได้แต่ใบจองต้องรออนุมัติ",
  "หน้าร้าน: ไม่ ok → เช็คอินไม่ได้ เว้นแต่กด override พร้อมเหตุผล (`stay.vaccine_override_reason`, audit `stay.vaccine_override`)"],
 [],
 [V("checkVaccines", I.r11_vaccine_gate, [
  ("all valid", {"requiredCodes": ["DOG_RABIES"], "vaccinations": VAX, "mustBeValidOn": "2026-10-12"}),
  ("expires before checkout", {"requiredCodes": ["DOG_RABIES", "DOG_DHPPL"], "vaccinations": VAX, "mustBeValidOn": "2026-10-12"}),
  ("expiry day itself is valid", {"requiredCodes": ["DOG_DHPPL"], "vaccinations": VAX, "mustBeValidOn": "2026-10-11"}),
  ("pending review", {"requiredCodes": ["DOG_KENNEL_COUGH"], "vaccinations": VAX, "mustBeValidOn": "2026-10-12"}),
  ("missing", {"requiredCodes": ["DOG_LEPTO"], "vaccinations": VAX, "mustBeValidOn": "2026-10-12"}),
  ("rejected counts as missing", {"requiredCodes": ["DOG_RABIES"], "vaccinations": [{"code": "DOG_RABIES", "expiresOn": "2027-01-01", "status": "rejected"}], "mustBeValidOn": "2026-10-12"}),
  ("nothing required", {"requiredCodes": [], "vaccinations": [], "mustBeValidOn": "2026-10-12"}),
 ])])

# ------------------------------------------------------------------ R-12
PET = {"status": "active", "species": "dog", "breed": "Shih Tzu", "weightGrams": 6500, "ageMonths": 30, "flags": []}
POL = {"rejectedBreeds": ["Pit Bull Terrier"], "maxPetWeightGrams": 40000}
RT = {"maxWeightGrams": 15000, "minAgeMonths": 4, "allowInHeat": False, "allowReactive": False}
def E(pet=None, pol=None, rt=None, blacklisted=False, channel="online", inHeat=False, species=None):
    return {"customer": {"blacklisted": blacklisted}, "pet": dict(PET, **(pet or {})), "policy": dict(POL, **(pol or {})),
            "roomType": rt, "inHeat": inHeat, "channel": channel, "speciesAllowed": species or []}
rule("R-12", "เงื่อนไขรับจอง (ลูกค้า/น้อง/ประเภทห้อง)", "US-06-01, US-11-03, US-11-04, US-03-11", "packages/domain/src/booking/eligibility.ts",
 """type EligibilityInput = { channel: "online" | "staff"; customer: { blacklisted: boolean };
  pet: { status: "active" | "deceased" | "rehomed"; species: "dog" | "cat" | "other"; breed: string | null; weightGrams: number | null;
         ageMonths: number | null; flags: string[] };
  policy: { rejectedBreeds: string[]; maxPetWeightGrams: number | null };
  speciesAllowed: ("dog" | "cat" | "other")[];            // service.species_allowed or room_type.species_allowed; [] = all
  roomType: { maxWeightGrams: number | null; minAgeMonths: number | null; allowInHeat: boolean; allowReactive: boolean } | null;
  inHeat: boolean };
export function checkEligibility(input: EligibilityInput): { ok: boolean; reasons: string[] };
export function ageInMonths(input: { onDate: string; birthDate?: string | null; ageEstimateMonths?: number | null;
  estimateRecordedOn?: string | null }): number | null;""",
 "ตรวจก่อนแสดง/ยืนยันการจอง — reasons คือ error code ตามลำดับที่ตรวจ (แสดงข้อความไทยตาม 05-api §Errors)",
 ["online + blacklisted → `CUSTOMER_BLACKLISTED` (หน้าร้านลงนัดให้ได้)",
  "pet.status ≠ active → `PET_INACTIVE`",
  "speciesAllowed ไม่ว่างและไม่มี species → `SPECIES_NOT_ALLOWED`",
  "breed ตรงกับ rejectedBreeds (trim + ไม่สนตัวพิมพ์) → `BREED_REJECTED`",
  "น้ำหนัก > min(policy.maxPetWeightGrams, roomType.maxWeightGrams) → `PET_TOO_HEAVY` (ไม่รู้น้ำหนัก = ไม่ตรวจ)",
  "มี roomType: อายุ < minAgeMonths → `PET_TOO_YOUNG`; inHeat และไม่ allowInHeat → `IN_HEAT_NOT_ALLOWED`; มีป้าย bites/dog_reactive/cat_reactive และไม่ allowReactive → `REACTIVE_NOT_ALLOWED`",
  "ageInMonths: จาก birthDate (เดือนเต็ม) หรือ age_estimate_months + เดือนที่ผ่านไปตั้งแต่บันทึก (`pet.created_at`) ไม่รู้ → null"],
 [],
 [V("checkEligibility", I.r12_eligibility, [
  ("ok grooming", E()),
  ("blacklisted online", E(blacklisted=True)),
  ("blacklisted but staff books", E(blacklisted=True, channel="staff")),
  ("rejected breed case-insensitive", E(pet={"breed": " pit bull terrier "})),
  ("too heavy for room", E(pet={"weightGrams": 18000}, rt=RT)),
  ("reactive dog + room disallows", E(pet={"flags": ["dog_reactive", "anxious"]}, rt=RT)),
  ("in heat", E(rt=RT, inHeat=True)),
  ("too young + cat not allowed", E(pet={"species": "cat", "ageMonths": 3}, rt=RT, species=["dog"])),
  ("pet deceased", E(pet={"status": "deceased"})),
 ]),
  V("ageInMonths", I.r12_age_months, [
  ("from birth date", {"onDate": "2026-10-05", "birthDate": "2024-03-10"}),
  ("birthday later this month", {"onDate": "2026-10-05", "birthDate": "2025-10-06"}),
  ("from estimate", {"onDate": "2026-10-05", "ageEstimateMonths": 24, "estimateRecordedOn": "2026-01-20"}),
  ("unknown", {"onDate": "2026-10-05"}),
 ])])

# ------------------------------------------------------------------ R-13
LINES = [
    {"billLineId": "L1", "lineType": "groom_service", "serviceId": "svc-bath", "performerId": "g-a", "lineTotalSatang": 50000, "quantity": 1},
    {"billLineId": "L2", "lineType": "groom_addon", "serviceId": "svc-nail", "performerId": "g-a", "lineTotalSatang": 10000, "quantity": 1},
    {"billLineId": "L3", "lineType": "surcharge", "serviceId": None, "performerId": "g-a", "lineTotalSatang": 20000, "quantity": 1},
    {"billLineId": "L4", "lineType": "quick_item", "serviceId": None, "performerId": None, "lineTotalSatang": 15000, "quantity": 1},
    {"billLineId": "L5", "lineType": "package_redemption", "serviceId": "svc-bath", "performerId": "g-b", "lineTotalSatang": 0, "quantity": 1, "packageUnitValueSatang": 45000},
]
CRULES = [
    {"id": "r1", "serviceId": "svc-bath", "staffUserId": "g-a", "type": "percent", "value": 2000},
    {"id": "r2", "serviceId": "svc-bath", "staffUserId": None, "type": "percent", "value": 1500},
    {"id": "r3", "serviceId": None, "staffUserId": "g-a", "type": "fixed", "value": 5000},
    {"id": "r4", "serviceId": None, "staffUserId": None, "type": "percent", "value": 1000},
]
rule("R-13", "ค่ามือ (commission)", "US-09-02, US-09-05, US-12-03", "packages/domain/src/commission/commission.ts",
 """type CommissionLine = { billLineId: string; lineType: string; serviceId: string | null; performerId: string | null;
  lineTotalSatang: number; quantity: number; packageUnitValueSatang?: number };
type CommissionRule = { id: string; serviceId: string | null; staffUserId: string | null; type: "percent" | "fixed"; value: number };
export function computeCommissions(input: { lines: CommissionLine[]; billDiscountSatang: number; rules: CommissionRule[] }):
  { billLineId: string; staffUserId: string; baseSatang: number; ruleId: string; amountSatang: number }[];""",
 "สร้าง `commission_entry` ตอนปิดบิล (status paid) — 1 แถวต่อ bill_line ที่มีช่าง",
 ["กระจายส่วนลดท้ายบิลตามสัดส่วน line_total ของบรรทัดที่ > 0: floor ทีละบรรทัด เศษที่เหลือใส่บรรทัดที่ยอดมากสุด (เสมอกันเอาบรรทัดแรก)",
  "บรรทัดที่คิดค่ามือ: groom_service, groom_addon, surcharge, package_redemption และต้องมี performer_id",
  "ฐาน = line_total − ส่วนลดที่กระจายมา; package_redemption ฐาน = unit_value ของแพ็กเกจ (R-14) ไม่หักส่วนลด",
  "เลือกกติกา: (บริการ, ช่าง) → (บริการ, ทุกช่าง) → (ทุกบริการ, ช่าง) → (ทุกบริการ, ทุกช่าง); ไม่มี → ไม่มีค่ามือ",
  "percent: floor(base × bps / 10000); fixed: value × quantity",
  "Void บิล → commission_entry.status = reversed (ไม่ลบ)"],
 [],
 [V("computeCommissions", I.r13_commission, [
  ("full example with bill discount", {"lines": LINES, "billDiscountSatang": 10000, "rules": CRULES}),
  ("no rules → nothing", {"lines": LINES, "billDiscountSatang": 0, "rules": []}),
  ("only catch-all rule", {"lines": LINES[:2], "billDiscountSatang": 0, "rules": [CRULES[3]]}),
  ("fixed × quantity", {"lines": [dict(LINES[1], quantity=2, lineTotalSatang=20000)], "billDiscountSatang": 0, "rules": [CRULES[2]]}),
 ])])

# ------------------------------------------------------------------ R-14
PKG = {"status": "active", "sessionsUsed": 3, "sessionsTotal": 5, "expiresAt": "2027-10-05T16:59:59.999Z",
       "serviceId": "svc-bath", "sizeTierId": "t-s", "shareScope": "single_pet", "petId": "p-1"}
APPT = {"serviceId": "svc-bath", "sizeTierId": "t-s", "petId": "p-1"}
def PR(now="2026-12-01T03:00:00.000Z", **kw):
    p = dict(PKG); a = dict(APPT)
    for k, v in kw.items():
        (a if k.startswith("a_") else p)[k[2:] if k.startswith("a_") else k] = v
    return {"now": now, "package": p, "appointment": a}
rule("R-14", "แพ็กเกจ: มูลค่าต่อครั้ง วันหมดอายุ และสิทธิ์ใช้", "US-10-05, US-10-06, US-08-03", "packages/domain/src/package/package.ts",
 """export function packageTerms(input: { priceSatang: number; sessionsCount: number; validityDays: number; purchasedAt: string; timezone: string }):
  { unitValueSatang: number; expiresAt: string };
export function canRedeemPackage(input: { now: string;
  package: { status: string; sessionsUsed: number; sessionsTotal: number; expiresAt: string; serviceId: string;
             sizeTierId: string | null; shareScope: "single_pet" | "household"; petId: string | null };
  appointment: { serviceId: string; sizeTierId: string | null; petId: string } }): { ok: boolean; reason: string | null };""",
 "ขายแพ็กเกจเป็น bill_line `package_sale`; ใช้สิทธิ์เป็น bill_line `package_redemption` ราคา 0",
 ["unit_value = floor(price / sessions) — ใช้เป็นฐานค่ามือและรายงานรายได้ตามการใช้",
  "expiresAt = สิ้นวัน (23:59:59.999 เวลาท้องถิ่น) ของวันที่ซื้อ + validity_days",
  "ใช้ได้เมื่อ: status active, used < total, now ≤ expiresAt, บริการตรง, size tier ตรง (ถ้าแพ็กเกจกำหนด), single_pet ต้องเป็นน้องตัวเดียวกัน — ตรวจตามลำดับนี้และคืน reason แรกที่ไม่ผ่าน",
  "ใช้ครบ → status exhausted; job `package_expiry` ทุกวัน 00:10 เปลี่ยน active ที่หมดอายุ → expired",
  "Void บิลที่ใช้สิทธิ์ → package_redemption.reversed_at และ sessions_used − 1 (status กลับเป็น active ถ้ายังไม่หมดอายุ)"],
 [],
 [V("packageTerms", I.r14_package_terms, [
  ("5 sessions 2,000 baht 1 year", {"priceSatang": 200000, "sessionsCount": 5, "validityDays": 365, "purchasedAt": "2026-10-05T03:00:00.000Z", "timezone": TZ}),
  ("odd split floors", {"priceSatang": 100000, "sessionsCount": 3, "validityDays": 90, "purchasedAt": "2026-10-05T18:30:00.000Z", "timezone": TZ}),
 ]),
  V("canRedeemPackage", I.r14_can_redeem, [
  ("ok", PR()), ("exhausted", PR(sessionsUsed=5)), ("expired", PR(now="2027-10-05T17:00:00.000Z")),
  ("service mismatch", PR(a_serviceId="svc-cut")), ("size mismatch", PR(a_sizeTierId="t-m")),
  ("other pet on single_pet", PR(a_petId="p-2")), ("household share ok", PR(a_petId="p-2", shareScope="household")),
  ("void package", PR(status="void")),
 ])])

# ------------------------------------------------------------------ R-15
rule("R-15", "ยอดบิล ส่วนลด และการรับชำระ", "US-08-01, US-08-02, US-08-03, US-08-04", "packages/domain/src/billing/totals.ts",
 """export function computeBillTotals(input: { lines: { quantity: number; unitPriceSatang: number; lineDiscountSatang: number }[];
  billDiscountSatang: number; payments: { method: string; amountSatang: number; status: "posted" | "voided" }[] }):
  { subtotalSatang: number; totalSatang: number; paidSatang: number; dueSatang: number; canClose: boolean }
  | { error: "LINE_DISCOUNT_TOO_LARGE" | "INVALID_QUANTITY" | "BILL_DISCOUNT_TOO_LARGE" };
export function applyPayment(input: { dueSatang: number; method: "cash" | "promptpay" | "bank_transfer" | "card_edc" | "deposit" | "credit";
  tenderedSatang?: number; amountSatang?: number; creditBalanceSatang?: number }):
  { amountSatang: number; changeSatang: number; dueAfterSatang: number }
  | { error: "BILL_ALREADY_PAID" | "INVALID_AMOUNT" | "AMOUNT_EXCEEDS_DUE" | "INSUFFICIENT_CREDIT" };""",
 "MVP ออก 'ใบเสร็จรับเงิน' (ไม่ใช่ใบกำกับภาษี) — ไม่คิด VAT",
 ["line_total = qty × unit − line_discount (ส่วนลดเกินยอด → error); subtotal = Σ line_total",
  "bill_discount ≤ subtotal; total = subtotal − bill_discount; ส่วนลด > 0 ต้องมีเหตุผล และ front_desk ให้ส่วนลดได้ไม่เกิน 20% ของ subtotal (เกินต้อง owner) — audit `bill.discount`",
  "paid = Σ payment ที่ posted; due = total − paid; ปิดบิลได้เมื่อ due = 0",
  "เปิดบิลจากใบจองที่มีมัดจำ verified → สร้าง payment method `deposit` อัตโนมัติ = min(deposit_verified, total)",
  "เงินสด: amount = min(tendered, due), change = tendered − amount; วิธีอื่น: amount ต้อง ≤ due; credit ต้อง ≤ เครดิตคงเหลือ",
  "ส่งคำขอชำระพร้อม `expectedPaidSatang` (ยอด paid ที่หน้าจอเห็น) — ไม่ตรงกับ DB → `STALE_BILL` (กันกดซ้ำ/สองเครื่อง)"],
 ["มัดจำที่เกิน total ของบิล → ส่วนเกินเข้าเครดิตลูกค้า (credit_ledger reason `deposit_credit`) ตอนปิดบิล"],
 [V("computeBillTotals", I.r15_bill_totals, [
  ("lines + bill discount + deposit", {"lines": [{"quantity": 1, "unitPriceSatang": 45000, "lineDiscountSatang": 0},
      {"quantity": 2, "unitPriceSatang": 10000, "lineDiscountSatang": 2000}], "billDiscountSatang": 3000,
      "payments": [{"method": "deposit", "amountSatang": 20000, "status": "posted"}, {"method": "cash", "amountSatang": 5000, "status": "voided"}]}),
  ("fully paid", {"lines": [{"quantity": 1, "unitPriceSatang": 45000, "lineDiscountSatang": 0}], "billDiscountSatang": 0,
      "payments": [{"method": "promptpay", "amountSatang": 45000, "status": "posted"}]}),
  ("line discount too large", {"lines": [{"quantity": 1, "unitPriceSatang": 1000, "lineDiscountSatang": 1500}], "billDiscountSatang": 0, "payments": []}),
  ("bill discount too large", {"lines": [{"quantity": 1, "unitPriceSatang": 1000, "lineDiscountSatang": 0}], "billDiscountSatang": 1001, "payments": []}),
 ]),
  V("applyPayment", I.r15_apply_payment, [
  ("cash with change", {"dueSatang": 40000, "method": "cash", "tenderedSatang": 50000}),
  ("partial cash", {"dueSatang": 40000, "method": "cash", "tenderedSatang": 30000}),
  ("transfer exact", {"dueSatang": 40000, "method": "promptpay", "amountSatang": 40000}),
  ("transfer over due", {"dueSatang": 40000, "method": "bank_transfer", "amountSatang": 40001}),
  ("credit insufficient", {"dueSatang": 40000, "method": "credit", "amountSatang": 10000, "creditBalanceSatang": 5000}),
  ("already paid", {"dueSatang": 0, "method": "cash", "tenderedSatang": 100}),
 ])])

# ------------------------------------------------------------------ R-16 / R-23
rule("R-16", "เลขที่ใบเสร็จ", "US-08-05", "packages/domain/src/ids/receipt-no.ts",
 """export function nextReceiptNo(input: { prefix: string; now: string; timezone: string; counter: { yearBe: number; nextSeq: number } }):
  { receiptNo: string; counter: { yearBe: number; nextSeq: number } };""",
 "รูปแบบ `{prefix}{ปี พ.ศ. 2 หลัก}-{ลำดับ 5 หลัก}` เช่น R69-00042 — เรียงต่อเนื่อง ไม่ข้าม ไม่ซ้ำ ต่อสาขา",
 ["ปี = ปีปฏิทินท้องถิ่นของเวลาปิดบิล + 543; ขึ้นปีใหม่ → เริ่ม 1",
  "ออกเลขตอนปิดบิลเท่านั้น (บิล open ไม่มีเลข) ใน transaction เดียวกับการปิด: `SELECT receipt_year_be, receipt_next_seq FROM branch WHERE id = $1 FOR UPDATE` แล้ว update counter",
  "บิล void ยังคงเลขเดิม (ไม่นำเลขกลับมาใช้)"],
 [],
 [V("nextReceiptNo", I.r16_receipt_no, [
  ("normal", {"prefix": "R", "now": "2026-10-05T03:00:00.000Z", "timezone": TZ, "counter": {"yearBe": 2569, "nextSeq": 42}}),
  ("new year local time (UTC still Dec 31)", {"prefix": "R", "now": "2026-12-31T17:30:00.000Z", "timezone": TZ, "counter": {"yearBe": 2569, "nextSeq": 1234}}),
  ("first receipt ever", {"prefix": "PC", "now": "2026-10-05T03:00:00.000Z", "timezone": TZ, "counter": {"yearBe": 0, "nextSeq": 1}}),
 ])])
rule("R-23", "เลขที่ใบจอง", "US-05-04, US-11-03", "packages/domain/src/ids/booking-no.ts",
 """export function nextBookingNo(input: { now: string; timezone: string; counter: { month: string; nextSeq: number } }):
  { bookingNo: string; counter: { month: string; nextSeq: number } };""",
 "รูปแบบ `B{ปี พ.ศ. 2 หลัก}{เดือน 2 หลัก}-{ลำดับ ≥4 หลัก}` เช่น B6910-0042 — ใช้สื่อสารกับลูกค้า (สั้น อ่านง่าย)",
 ["counter ต่อสาขาใน `branch.booking_seq_month` / `booking_next_seq` ล็อกแถวเหมือน R-16", "ขึ้นเดือนใหม่ (เวลาท้องถิ่น) → เริ่ม 1; เกิน 9999 ใช้ 5 หลักต่อได้"],
 [],
 [V("nextBookingNo", I.r23_booking_no, [
  ("normal", {"now": "2026-10-05T03:00:00.000Z", "timezone": TZ, "counter": {"month": "6910", "nextSeq": 42}}),
  ("month rollover in local time", {"now": "2026-10-31T17:05:00.000Z", "timezone": TZ, "counter": {"month": "6910", "nextSeq": 980}}),
  ("beyond 9999", {"now": "2026-10-05T03:00:00.000Z", "timezone": TZ, "counter": {"month": "6910", "nextSeq": 10000}}),
 ])])

# ------------------------------------------------------------------ R-17
def NG(visits, shop=None, default=28, future=False, status="active"):
    return {"visitDates": visits, "shopIntervalDays": shop, "defaultDays": default, "hasFutureAppointment": future, "petStatus": status}
rule("R-17", "วันครบรอบกรูมถัดไป", "US-10-04", "packages/domain/src/aftercare/next-groom.ts",
 """export function nextGroomDue(input: { visitDates: string[]; shopIntervalDays: number | null; defaultDays: number;
  hasFutureAppointment: boolean; petStatus: "active" | "deceased" | "rehomed" }):
  { dueDate: string | null; remindOn: string | null; intervalDays: number | null; source: string };""",
 "visitDates = วันท้องถิ่นของนัดกรูมที่สถานะ picked_up/done ของน้องตัวนั้นที่ร้านนี้",
 ["pet ไม่ active → ไม่เตือน; ไม่มีประวัติ → ไม่เตือน",
  "รอบ = `pet_shop_profile.groom_interval_days` → (มี ≥ 2 ช่วงห่างจาก 4 ครั้งล่าสุด) median ของช่วงห่าง (จำนวนคู่ = เฉลี่ยสองค่ากลางปัดขึ้น) → `branch_policy.next_groom_default_days`",
  "dueDate = ครั้งล่าสุด + รอบ; remindOn = dueDate − 3 วัน; ส่งเวลา 10:00 ท้องถิ่น",
  "มีนัดในอนาคตแล้ว → remindOn = null (ไม่เตือน)",
  "job: เมื่อน้องถูกรับกลับ (picked_up) ตั้ง `next_groom_reminder` ที่ remindOn 10:00 (dedupe ต่อ pet); ตอนรันตรวจซ้ำ (มีนัดใหม่/สถานะเปลี่ยน → ยกเลิก)",
  "ข้อความเป็นคลาส marketing (R-18)"],
 [],
 [V("nextGroomDue", I.r17_next_groom, [
  ("default interval", NG(["2026-09-01"])),
  ("shop interval wins", NG(["2026-08-01", "2026-09-01"], shop=21)),
  ("median of history", NG(["2026-06-01", "2026-07-01", "2026-07-29", "2026-08-30"])),
  ("even count median rounds up", NG(["2026-07-01", "2026-07-21", "2026-08-25"])),
  ("future appointment suppresses reminder", NG(["2026-09-01"], future=True)),
  ("pet rehomed", NG(["2026-09-01"], status="rehomed")),
  ("no visits", NG([])),
 ])])

# ------------------------------------------------------------------ R-18
def Q(used, cls="helpful", eco=False, beh="send", quota=300):
    return {"monthlyQuota": quota, "usedThisMonth": used, "messageClass": cls, "economyMode": eco, "economyBehavior": beh}
rule("R-18", "โควตาข้อความ LINE (push) และโหมดประหยัด", "US-13-06, US-02-06", "packages/domain/src/notify/line-quota.ts",
 """export function decideLinePush(input: { monthlyQuota: number; usedThisMonth: number;
  messageClass: "essential" | "helpful" | "marketing"; economyMode: boolean; economyBehavior: "send" | "skip" }):
  { send: boolean; skipReason: "quota_exhausted" | "economy_mode" | null };""",
 "reply message ฟรีไม่นับโควตา; push/multicast นับโควตาของ OA ร้าน — ระบบนับเองจาก `notification` ที่ channel = line_push, status = sent, month_key เดือนนี้",
 ["used ≥ quota → ข้าม `quota_exhausted`",
  "economy mode เปิด และ template กำหนด economy = skip → ข้าม `economy_mode`",
  "marketing: ใช้ไปแล้ว ≥ 70% → ข้าม (สงวนโควตา)",
  "helpful: ใช้ไปแล้ว ≥ 90% → ข้าม (สงวน 10% ไว้ให้ essential)",
  "essential ส่งจนหมดโควตา",
  "ข้ามแล้ว: บันทึก notification status skipped + skip_reason และแสดงในหน้า \"ข้อความที่ไม่ได้ส่ง\" ให้หน้าร้านกดส่งเองผ่านแชท (copy ข้อความ)",
  "ใช้ไปถึง 80% → แจ้งเจ้าของร้าน (web push, ครั้งเดียวต่อเดือน)"],
 ["งบต่อ 1 การใช้บริการ ≤ 4 push: ยืนยันจอง (essential, ใช้ reply ถ้าได้), เตือน 24 ชม. (helpful), พร้อมรับ/report card (helpful รวมเป็นข้อความเดียว), เตือนรอบถัดไป (marketing)"],
 [V("decideLinePush", I.r18_line_push, [
  ("normal helpful", Q(100)), ("quota exhausted", Q(300, "essential")), ("essential at 95%", Q(285, "essential")),
  ("helpful at 90% reserved", Q(270)), ("marketing at 70%", Q(210, "marketing")), ("marketing below 70%", Q(209, "marketing")),
  ("economy skip", Q(10, "helpful", eco=True, beh="skip")), ("economy send", Q(10, "helpful", eco=True, beh="send")),
 ])])

# ------------------------------------------------------------------ R-19
def CH(**kw):
    d = {"recipientType": "customer", "hasLineIdentity": True, "isFriend": True, "templateAllowsReply": True,
         "replyTokenAgeSeconds": None, "activePushSubscriptions": 0, "isOwner": False, "hasEmail": False}
    d.update(kw); return d
rule("R-19", "เลือกช่องทางส่งข้อความ", "US-13-05, US-13-06, US-09-04", "packages/domain/src/notify/channel.ts",
 """export function selectChannel(input: { recipientType: "customer" | "staff"; hasLineIdentity: boolean; isFriend: boolean;
  templateAllowsReply: boolean; replyTokenAgeSeconds: number | null; activePushSubscriptions: number; isOwner: boolean; hasEmail: boolean }):
  { channel: "line_reply" | "line_push" | "web_push" | "email" | null; skipReason: "no_recipient" | null };""",
 "ลูกค้าได้รับทาง LINE ของร้านเท่านั้น; พนักงานได้รับทาง Web Push (อีเมลสำรองเฉพาะเจ้าของร้าน)",
 ["ลูกค้า: ไม่มี line_identity หรือไม่ได้เป็นเพื่อน OA (`is_friend` = false) → ข้าม `no_recipient` (หน้าร้านเห็นในรายการข้อความที่ไม่ได้ส่ง)",
  "มี reply token อายุ < 50 วินาที (จากข้อความที่ลูกค้าเพิ่งส่งเข้ามา — ดู SP-03) และ template อนุญาต → `line_reply` (ฟรี)",
  "ไม่งั้น `line_push` แล้วผ่าน R-18",
  "พนักงาน: มี web_push_subscription ที่ไม่ disabled → `web_push` ทุกอุปกรณ์; ไม่มีแต่เป็น owner ที่มีอีเมล → `email`; ไม่งั้นข้าม"],
 [],
 [V("selectChannel", I.r19_channel, [
  ("customer push", CH()), ("customer reply token fresh", CH(replyTokenAgeSeconds=12)), ("reply token too old", CH(replyTokenAgeSeconds=55)),
  ("not a friend", CH(isFriend=False)), ("staff with device", CH(recipientType="staff", activePushSubscriptions=2)),
  ("owner fallback email", CH(recipientType="staff", isOwner=True, hasEmail=True)), ("staff no device", CH(recipientType="staff")),
 ])])

# ------------------------------------------------------------------ R-20
rule("R-20", "เวลาและวันที่ท้องถิ่น", "US-13-03", "packages/domain/src/time/local-time.ts",
 """export function toLocalDate(input: { instant: string; timezone: string }): string;               // "YYYY-MM-DD"
export function localToUtc(input: { date: string; time: string; timezone: string }): string;        // ISO UTC
export function localDayBounds(input: { date: string; timezone: string }): { start: string; end: string };""",
 "DB เก็บ UTC; ทุกการตัดสินใจเรื่อง 'วันนี้/วันไหน' ใช้ `branch.timezone` (Asia/Bangkok) — ห้ามใช้ timezone ของ server หรือ browser",
 ["ใช้ไลบรารี date-fns + @date-fns/tz (หรือ Temporal เมื่อพร้อม) — ห้าม `new Date('YYYY-MM-DD')` กับวันท้องถิ่น (จะกลายเป็น UTC)",
  "คอลัมน์ date (check_in_date ฯลฯ) เป็น string ตลอดทาง",
  "รายงาน/สรุปรายวัน: ช่วงวัน = localDayBounds"],
 [],
 [V("toLocalDate", I.r20_to_local_date, [
  ("evening UTC is next local day", {"instant": "2026-10-05T17:30:00.000Z", "timezone": TZ}),
  ("morning", {"instant": "2026-10-05T02:00:00.000Z", "timezone": TZ}),
 ]),
  V("localToUtc", I.r20_local_to_utc, [("09:00 Bangkok", {"date": "2026-10-05", "time": "09:00", "timezone": TZ}),
                                     ("00:30 Bangkok is previous UTC day", {"date": "2026-10-05", "time": "00:30", "timezone": TZ})]),
  V("localDayBounds", I.r20_local_day_bounds, [("day bounds", {"date": "2026-10-05", "timezone": TZ})]),
 ])

# ------------------------------------------------------------------ R-21
def SS(now, status="confirmed", count=0):
    return {"now": now, "firstServiceAt": "2026-10-10T03:00:00.000Z", "status": status, "rescheduleCutoffHours": 24, "rescheduleCount": count}
rule("R-21", "สิทธิ์ลูกค้าเลื่อน/ยกเลิกเอง", "US-11-08", "packages/domain/src/booking/self-service.ts",
 """export function customerSelfService(input: { now: string; firstServiceAt: string; status: string; rescheduleCutoffHours: number;
  rescheduleCount: number }): { canCancel: boolean; canReschedule: boolean;
  rescheduleBlockedReason: "STATUS_NOT_ALLOWED" | "TOO_LATE_TO_RESCHEDULE" | "RESCHEDULE_LIMIT" | null };""",
 "หน้า 'นัดของฉัน' แสดงปุ่มตามผลนี้; API ตรวจซ้ำทุกครั้ง",
 ["ยกเลิกได้เมื่อสถานะ awaiting_deposit/deposit_review/awaiting_approval/confirmed และยังไม่ถึงเวลาบริการแรก (ผลเงินตาม R-07 — แสดงให้ลูกค้าเห็นก่อนกดยืนยัน)",
  "เลื่อนได้เมื่อสถานะ confirmed/awaiting_approval, เหลือเวลา ≥ reschedule_cutoff_hours และเลื่อนมาแล้ว < 2 ครั้ง",
  "การเลื่อน = เปลี่ยนเวลาของนัดเดิม (มัดจำติดไปด้วย) และ reschedule_count + 1; ต่อจากนี้ต้องติดต่อร้าน"],
 [],
 [V("customerSelfService", I.r21_self_service, [
  ("plenty of time", SS("2026-10-07T03:00:00.000Z")), ("inside cutoff", SS("2026-10-09T05:00:00.000Z")),
  ("limit reached", SS("2026-10-07T03:00:00.000Z", count=2)), ("awaiting deposit can only cancel", SS("2026-10-07T03:00:00.000Z", status="awaiting_deposit")),
  ("after start", SS("2026-10-10T03:30:00.000Z")),
 ])])

# ------------------------------------------------------------------ R-22
rule("R-22", "เบอร์โทร: normalize และแสดงผล", "US-03-01, US-03-10, US-11-01", "packages/domain/src/format/phone.ts",
 """export function normalizePhone(input: { input: string }): { e164: string | null; error: "INVALID_PHONE" | null };
export function formatPhone(input: { e164: string }): string;""",
 "เก็บ E.164 (`+66812345678`) ทุกคอลัมน์เบอร์; ค้นหาด้วยเบอร์ให้ normalize คำค้นก่อน",
 ["ตัดช่องว่าง ขีด วงเล็บ; รับ 0XXXXXXXXX, 66XXXXXXXXX, +66XXXXXXXXX, +66 0XXXXXXXXX",
  "มือถือไทย: 9 หลักหลังตัด 0 ขึ้นต้น 6/8/9; บ้าน: 8 หลักขึ้นต้น 2/3/4/5/7",
  "ต่างประเทศ: + ตามด้วย 8–15 หลัก (ไม่ใช่ +66) เก็บตามเดิม",
  "แสดงผล: มือถือ 081-234-5678, กทม. 02-123-4567, ต่างจังหวัด 038-123-456, ต่างประเทศแสดง E.164"],
 [],
 [V("normalizePhone", I.r22_normalize_phone, [(s, {"input": s}) for s in
   ["081-234-5678", "0812345678", "+66812345678", "66812345678", "+66 081 234 5678", "(02) 123-4567", "038 123 456",
    "+14155552671", "12345", "081234567", "0712345678", "+66-2-123-4567"]]),
  V("formatPhone", I.r22_format_phone, [(s, {"e164": s}) for s in ["+66812345678", "+6621234567", "+6638123456", "+14155552671"]]),
 ])

# ------------------------------------------------------------------ R-24
rule("R-24", "ล็อกบัญชีเมื่อใส่รหัสผิด + นโยบายรหัสผ่าน", "US-01-02", "packages/domain/src/auth/lockout.ts",
 """export function loginAttempt(input: { now: string; failedLoginCount: number; lockedUntil: string | null; passwordCorrect: boolean }):
  { allowed: boolean; failedLoginCount: number; lockedUntil: string | null; error: "ACCOUNT_LOCKED" | "INVALID_CREDENTIALS" | null };
export function checkPasswordPolicy(input: { password: string; email?: string | null }): { ok: boolean; error: string | null };""",
 "ใช้กับ `staff_user.failed_login_count`, `staff_user.locked_until` และ `platform_admin.failed_login_count`, `platform_admin.locked_until` (กฎการนับ/ล็อก/สำเร็จเหมือนกัน)",
 ["ถูกล็อกอยู่ (now < lockedUntil) → ปฏิเสธโดยไม่ตรวจรหัส", "รหัสถูก → reset count = 0", "ผิดครั้งที่ 5 ติดกัน → ล็อก 15 นาที และ reset count = 0",
  "ข้อความ error ต่อผู้ใช้ไม่บอกว่าอีเมลมีอยู่หรือไม่ (`INVALID_CREDENTIALS` เหมือนกัน)", "รหัสผ่าน 8–128 ตัว, ห้ามเป็นตัวเลขล้วน, ห้ามเท่ากับส่วนหน้าของอีเมล",
  "hash: argon2id (memoryCost 19456 KiB, timeCost 2, parallelism 1) ผ่านแพ็กเกจ @node-rs/argon2"],
 [],
 [V("loginAttempt", I.r24_login_attempt, [
  ("success resets", {"now": "2026-10-05T03:00:00.000Z", "failedLoginCount": 3, "lockedUntil": None, "passwordCorrect": True}),
  ("4th failure", {"now": "2026-10-05T03:00:00.000Z", "failedLoginCount": 3, "lockedUntil": None, "passwordCorrect": False}),
  ("5th failure locks 15 min", {"now": "2026-10-05T03:00:00.000Z", "failedLoginCount": 4, "lockedUntil": None, "passwordCorrect": False}),
  ("locked even with right password", {"now": "2026-10-05T03:10:00.000Z", "failedLoginCount": 0, "lockedUntil": "2026-10-05T03:15:00.000Z", "passwordCorrect": True}),
  ("lock expired", {"now": "2026-10-05T03:15:00.000Z", "failedLoginCount": 0, "lockedUntil": "2026-10-05T03:15:00.000Z", "passwordCorrect": True}),
 ]),
  V("checkPasswordPolicy", I.r24_password_policy, [
  ("ok", {"password": "groom2026!"}), ("short", {"password": "abc123"}), ("digits", {"password": "12345678"}),
  ("same as email", {"password": "somchai.pet", "email": "Somchai.Pet@example.com"}),
 ])])

# ------------------------------------------------------------------ R-25
rule("R-25", "ข้อจำกัดการอัปโหลดไฟล์", "US-13-04, US-03-06, US-07-02", "packages/domain/src/files/upload-policy.ts",
 """export function validateUpload(input: { kind: string; mimeType: string; sizeBytes: number }): { ok: boolean; error: string | null };""",
 "อัปโหลดตรงไป object storage ด้วย presigned PUT (อายุ 5 นาที) แล้ว commit กับข้อมูล — server ไม่รับไฟล์ผ่าน body",
 ["client ย่อรูปก่อนส่ง: ด้านยาวสุด 1600 px, WebP/JPEG quality 0.8, ลบ EXIF (ตำแหน่ง GPS) — เป้าหมาย ≤ 1.5 MB",
  "server ตรวจตามตาราง kind → MIME/ขนาดสูงสุด (สลิป/รูปทั่วไป 2 MB, เอกสารวัคซีน 5 MB, วิดีโอ stay_update 20 MB ≤ 30 วินาที, ลายเซ็น PNG 500 KB, CSV 2 MB)",
  "storage key: `org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}`; อ่านผ่าน signed GET URL อายุ 1 ชม. (ไม่มี public bucket)",
  "file_object.committed_at = null เกิน 24 ชม. → ลบทิ้ง (job ใน cron ทุกวัน)"],
 [],
 [V("validateUpload", I.r25_validate_upload, [
  ("photo ok", {"kind": "after", "mimeType": "image/webp", "sizeBytes": 850_000}),
  ("photo too big", {"kind": "after", "mimeType": "image/jpeg", "sizeBytes": 2_500_000}),
  ("video on stay update", {"kind": "stay_update", "mimeType": "video/mp4", "sizeBytes": 15_000_000}),
  ("video not allowed for slip", {"kind": "slip", "mimeType": "video/mp4", "sizeBytes": 1_000_000}),
  ("pdf vaccine", {"kind": "vaccine_proof", "mimeType": "application/pdf", "sizeBytes": 3_000_000}),
  ("unknown kind", {"kind": "selfie", "mimeType": "image/jpeg", "sizeBytes": 1000}),
 ])])

# ------------------------------------------------------------------ R-26
rule("R-26", "สร้างงานดูแลรายวัน (care tasks)", "US-06-09, US-06-08", "packages/domain/src/care/care-tasks.ts",
 """export function generateCareTasks(input: { checkedInAt: string; checkOutDate: string; expectedCheckOutTime: string | null; timezone: string;
  feedingTimes: string[]; medications: { id: string; name: string; times: string[] }[]; walksPerDay: number }):
  { taskType: "feed" | "medication" | "walk" | "clean"; title: string; dueAt: string; medicationId: string | null }[];""",
 "สร้างตอนเช็คอิน (stay → checked_in) จากฟอร์มรับฝาก; แก้ฟอร์มระหว่างพัก → ลบ task pending ในอนาคตแล้วสร้างใหม่",
 ["ทุกวันท้องถิ่นตั้งแต่วันเช็คอินถึงวันเช็คเอาท์: feed ตาม feeding_times, medication ตามเวลาของยาแต่ละตัว, walk ตาม walks_per_day, clean 10:00",
  "เวลาเดิน: 1 ครั้ง = 16:00; n ≥ 2 = กระจาย 09:00–17:00 เท่า ๆ กัน ปัดเป็นช่วง 30 นาที (ปัดครึ่งขึ้น) — walks_per_day 0–6",
  "เก็บเฉพาะ task ที่ checkedInAt < dueAt < เวลาออก (check_out_date + expected_check_out_time หรือ 12:00)",
  "เรียงตาม dueAt, taskType, title",
  "เลยกำหนด 30 นาทียัง pending → job `care_task_overdue_scan` (ทุก 15 นาที) แจ้งพนักงานผ่าน Web Push (ครั้งเดียวต่อ task)"],
 [],
 [V("generateCareTasks", I.r26_care_tasks, [
  ("2 nights with meds and 2 walks", {"checkedInAt": "2026-10-10T07:00:00.000Z", "checkOutDate": "2026-10-12", "expectedCheckOutTime": "11:00",
      "timezone": TZ, "feedingTimes": ["08:00", "18:00"], "medications": [{"id": "m-1", "name": "Apoquel", "times": ["09:00"]}], "walksPerDay": 2}),
  ("1 night, default checkout 12:00, no walks", {"checkedInAt": "2026-10-10T10:30:00.000Z", "checkOutDate": "2026-10-11", "expectedCheckOutTime": None,
      "timezone": TZ, "feedingTimes": ["07:30", "17:30"], "medications": [], "walksPerDay": 0}),
 ])])

# ------------------------------------------------------------------ R-27 (docs only)
rule("R-27", "Audit log — การกระทำที่ต้องบันทึก", "US-13-07, US-13-11", "packages/server/src/audit.ts",
 """export async function writeAudit(tx: Tx, entry: { organizationId: string | null; actor: Actor; action: AuditAction;
  entityType: string; entityId: string | null; before?: unknown; after?: unknown; reason?: string | null }): Promise<void>;""",
 "เขียนใน transaction เดียวกับการเปลี่ยนแปลงเสมอ (ถ้าบันทึกไม่ได้ การเปลี่ยนแปลงต้อง rollback) — before/after เก็บเฉพาะฟิลด์ที่เปลี่ยน",
 ["รายการ action (type AuditAction): `bill.discount`, `bill.close`, `bill.void`, `bill.reopen_forbidden_attempt`, `payment.create`, `payment.void`, "
  "`slip.verify`, `slip.reject`, `deposit.waive`, `refund.create`, `credit.adjust`, `booking.cancel`, `booking.no_show`, `booking.price_override`, "
  "`stay.vaccine_override`, `customer.blacklist`, `customer.reliability_override`, `customer.merge_link_approve`, `staff.invite`, `staff.role_change`, "
  "`staff.disable`, `policy.update`, `promptpay.update`, `line_channel.update`, `commission_rule.update`, `data.export`, `pdpa.erase`, "
  "`support.session_start`, `support.session_end`, `import.commit`, `organization.status_change`",
  "ทุก action ที่มีคำว่า void/cancel/waive/override/adjust/blacklist ต้องมี reason (API บังคับ ≥ 3 ตัวอักษร)",
  "หน้าดู audit log: owner เท่านั้น (filter ตาม action/ช่วงวัน/ผู้ทำ)"],
 [], [])

# ------------------------------------------------------------------ R-29
DST = [{"session": "full_day", "capacity": 6, "status": "active"}, {"session": "morning", "capacity": 10, "status": "active"},
       {"session": "afternoon", "capacity": 10, "status": "active"}]
def DV(fd=0, m=0, a=0, cancelled=0):
    v = [{"session": "full_day", "status": "reserved"}] * fd + [{"session": "morning", "status": "checked_in"}] * m + \
        [{"session": "afternoon", "status": "reserved"}] * a + [{"session": "morning", "status": "cancelled"}] * cancelled
    return v
rule("R-29", "ที่ว่าง Daycare", "US-06-13, US-11-05", "packages/domain/src/availability/daycare-availability.ts",
 """export function daycareAvailability(input: { sessionTypes: { session: "full_day" | "morning" | "afternoon"; capacity: number; status: string }[];
  visits: { session: "full_day" | "morning" | "afternoon"; status: string }[]; closed?: boolean }): Partial<Record<"full_day" | "morning" | "afternoon", number>>;""",
 "capacity ของรอบ morning/afternoon = จำนวนตัวในพื้นที่ครึ่งวันนั้น; full_day กินที่ทั้งสองครึ่ง และมีเพดานของตัวเอง",
 ["นับ visit ที่สถานะ reserved/checked_in/checked_out ของวันนั้น",
  "morning ว่าง = cap_morning − (morning + full_day); afternoon เช่นเดียวกัน",
  "full_day ว่าง = min(cap_full − full_day, ว่างของแต่ละครึ่งที่มีรอบ active)", "ค่าติดลบ → 0; สาขาปิดโมดูล daycare → 0 ทุกรอบ"],
 [],
 [V("daycareAvailability", I.r29_daycare_availability, [
  ("empty day", {"sessionTypes": DST, "visits": []}),
  ("busy morning limits full day", {"sessionTypes": DST, "visits": DV(fd=2, m=7, a=1, cancelled=3)}),
  ("full day cap reached", {"sessionTypes": DST, "visits": DV(fd=6)}),
  ("only full_day offered", {"sessionTypes": DST[:1], "visits": DV(fd=1)}),
  ("closed", {"sessionTypes": DST, "visits": [], "closed": True}),
 ])])

# ------------------------------------------------------------------ R-30
rule("R-30", "PromptPay QR (EMVCo payload)", "US-07-01, US-07-08, US-08-04", "packages/domain/src/payment/promptpay.ts",
 """export function promptPayPayload(input: { type: "phone" | "national_id" | "tax_id" | "ewallet"; id: string; amountSatang?: number | null }):
  { payload: string } | { error: "INVALID_PROMPTPAY_ID" };""",
 "สร้าง QR ฟรีโดยไม่ผ่าน payment gateway — เงินเข้าบัญชีร้านโดยตรง; แสดงเป็นรูป QR ด้วยไลบรารี `qrcode` (ECC M)",
 ["TLV: `000201` + (`010212` มียอด / `010211` ไม่มียอด) + tag 29 [AID `A000000677010111` + `01` เบอร์ 0066+9 หลัก | `02` เลขบัตร/ภาษี 13 หลัก | `03` e-wallet 15 หลัก]",
  "+ `5303764` (THB) + `54` ยอด `บาท.สตางค์` (ถ้ามี) + `5802TH` + `6304` + CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) ตัวพิมพ์ใหญ่ 4 หลัก",
  "id ตัดอักขระที่ไม่ใช่ตัวเลขก่อน; เบอร์ต้อง 10 หลักขึ้นต้น 0",
  "แสดงชื่อบัญชี `branch.promptpay_account_name` และยอดใต้ QR เสมอ ให้ลูกค้าเทียบก่อนโอน"],
 ["ทดสอบเพิ่มด้วยมือ: สแกน QR จากแอปธนาคารอย่างน้อย 3 ธนาคารก่อนปิด US-07-01 (ใส่ผลใน PR)"],
 [V("promptPayPayload", I.r30_promptpay_payload, [
  ("phone with amount", {"type": "phone", "id": "081-234-5678", "amountSatang": 15000}),
  ("phone with satang amount", {"type": "phone", "id": "0812345678", "amountSatang": 123456}),
  ("national id static", {"type": "national_id", "id": "1-2345-67890-12-3"}),
  ("ewallet", {"type": "ewallet", "id": "004999012345678", "amountSatang": 50000}),
  ("invalid phone", {"type": "phone", "id": "812345678", "amountSatang": 1000}),
 ])])

# ------------------------------------------------------------------ R-31
rule("R-31", "รูปแบบการแสดงผลไทย (เงิน วันที่ เวลา น้ำหนัก)", "US-13-03", "packages/domain/src/format/thai.ts",
 """export function formatTHB(input: { satang: number; decimals?: "auto" | "always" }): string;
export function formatThaiDate(input: { date: string; withWeekday?: boolean }): string;
export function formatTime(input: { instant: string; timezone: string }): string;
export function formatWeight(input: { grams: number }): string;""",
 "ทุกหน้าจอใช้ฟังก์ชันชุดนี้เท่านั้น (ห้าม toLocaleString เอง เพื่อให้ผลเหมือนกันทั้ง server/client)",
 ["เงิน: `฿1,234` (auto ซ่อน .00) / `฿1,234.00` (always — ใช้ในใบเสร็จและบิล), ติดลบ `-฿500`",
  "วันที่: `5 ต.ค. 2569`, มีวัน: `จ. 5 ต.ค. 2569` (ปี พ.ศ. เสมอ)", "เวลา: `14:30 น.` ตาม timezone สาขา",
  "น้ำหนัก: กิโลกรัม 1 ตำแหน่ง ปัดครึ่งขึ้น ซ่อน .0 — `5.2 กก.`, `5 กก.`"],
 [],
 [V("formatTHB", I.r31_format_thb, [("auto whole", {"satang": 123400}), ("auto with satang", {"satang": 123450}),
                                   ("always", {"satang": 50000, "decimals": "always"}), ("negative", {"satang": -50000}), ("zero", {"satang": 0})]),
  V("formatThaiDate", I.r31_format_date, [("plain", {"date": "2026-10-05"}), ("weekday", {"date": "2026-10-05", "withWeekday": True}),
                                          ("sunday", {"date": "2026-10-11", "withWeekday": True})]),
  V("formatTime", I.r31_format_time, [("afternoon", {"instant": "2026-10-05T07:30:00.000Z", "timezone": TZ})]),
  V("formatWeight", I.r31_format_weight, [("5.2", {"grams": 5200}), ("half up", {"grams": 5250}), ("whole", {"grams": 5000}),
                                          ("small", {"grams": 840}), ("heavy", {"grams": 32040})]),
 ])

RULES.sort(key=lambda r: int(r["id"][2:]))
