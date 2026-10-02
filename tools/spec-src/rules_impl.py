# -*- coding: utf-8 -*-
"""
Reference implementations of the business rules (R-xx).
Used ONLY to compute the expected values in docs/spec/vectors/*.json.
The TypeScript implementation in packages/domain must produce identical output for every vector.
All inputs/outputs are JSON-compatible: money = integer satang, instants = ISO-8601 UTC strings
("2026-10-05T03:00:00.000Z"), local dates = "YYYY-MM-DD", local times = "HH:MM".
"""
import datetime as dt
import math
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc

# ---------------------------------------------------------------- helpers (R-20)
def parse_iso(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)

def iso(d):
    d = d.astimezone(UTC)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"

def local_dt(date_s, time_s, tz):
    y, m, d = map(int, date_s.split("-"))
    hh, mm = map(int, time_s.split(":"))
    return dt.datetime(y, m, d, hh, mm, tzinfo=ZoneInfo(tz)).astimezone(UTC)

def to_local(instant_s, tz):
    return parse_iso(instant_s).astimezone(ZoneInfo(tz))

def add_days(date_s, n):
    return (dt.date.fromisoformat(date_s) + dt.timedelta(days=n)).isoformat()

def days_between(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days

def r20_to_local_date(inp):
    return to_local(inp["instant"], inp["timezone"]).date().isoformat()

def r20_local_to_utc(inp):
    return iso(local_dt(inp["date"], inp["time"], inp["timezone"]))

def r20_local_day_bounds(inp):
    s = local_dt(inp["date"], "00:00", inp["timezone"])
    return {"start": iso(s), "end": iso(s + dt.timedelta(days=1))}

def overlaps(a0, a1, b0, b1):
    return a0 < b1 and b0 < a1

# ---------------------------------------------------------------- R-01 size tier
def r01_resolve_size_tier(inp):
    if inp["species"] not in ("dog", "cat"):
        return {"tierId": None, "reason": "no_tier"}
    w = inp["weightGrams"]
    if w is None:
        return {"tierId": None, "reason": "no_weight"}
    tiers = sorted([t for t in inp["tiers"] if t["species"] == inp["species"]], key=lambda t: t["minWeightGrams"])
    for t in tiers:
        if t["minWeightGrams"] <= w and (t["maxWeightGrams"] is None or w < t["maxWeightGrams"]):
            return {"tierId": t["id"], "reason": "matched"}
    return {"tierId": None, "reason": "no_tier"}

# ---------------------------------------------------------------- R-02 coat group & price lookup
COAT = {"short": "short", "hairless": "short", "wire": "short", "long": "long", "double": "long",
        "curly": "long", "unknown": "any"}

def r02_coat_group(inp):
    return COAT[inp["coatType"]]

def r02_lookup_price(inp):
    sid, tier, coat = inp["serviceId"], inp["sizeTierId"], inp["coatGroup"]
    rows = [p for p in inp["prices"] if p["serviceId"] == sid]
    order = []
    if tier is not None:
        if coat != "any":
            order.append((tier, coat, "tier+coat"))
        order.append((tier, "any", "tier+any"))
    if coat != "any":
        order.append((None, coat, "all+coat"))
    order.append((None, "any", "all+any"))
    for t, c, label in order:
        for p in rows:
            if p["sizeTierId"] == t and p["coatGroup"] == c:
                return {"priceSatang": p["priceSatang"], "durationMinutes": p["durationMinutes"], "matched": label}
    return None

# ---------------------------------------------------------------- R-03 quote
def r03_quote_booking(inp):
    buf = inp["bufferMinutes"]
    groom = []
    total = 0
    for g in inp.get("groom", []):
        price = sum(i["priceSatang"] for i in g["items"])
        dur = sum(i["durationMinutes"] for i in g["items"])
        if dur <= 0:
            return {"error": "DURATION_ZERO"}
        s = parse_iso(g["startsAt"])
        e = s + dt.timedelta(minutes=dur)
        groom.append({"servicesTotalSatang": price, "durationMinutes": dur, "endsAt": iso(e),
                      "blockedUntil": iso(e + dt.timedelta(minutes=buf))})
        total += price
    stays = []
    for st in inp.get("stays", []):
        nights = days_between(st["checkInDate"], st["checkOutDate"])
        if nights < 1:
            return {"error": "INVALID_DATE_RANGE"}
        room = nights * st["nightlyPriceSatang"]
        addons = []
        for a in st.get("addons", []):
            q = nights if a["perDay"] else a.get("quantity", 1)
            addons.append({"quantity": q, "totalSatang": q * a["unitPriceSatang"]})
        at = sum(a["totalSatang"] for a in addons)
        stays.append({"nights": nights, "roomTotalSatang": room, "addons": addons, "addonsTotalSatang": at})
        total += room + at
    dc = sum(d["priceSatang"] for d in inp.get("daycare", []))
    total += dc
    return {"groom": groom, "stays": stays, "daycareTotalSatang": dc, "estimatedTotalSatang": total}

# ---------------------------------------------------------------- R-04 grooming slot engine
def r04_slots(inp):
    tz = inp["timezone"]
    date = inp["date"]
    pol = inp["policy"]
    step, buf, dur = pol["slotStepMinutes"], pol["bufferMinutes"], inp["durationMinutes"]
    now = parse_iso(inp["now"])
    hours = inp["branchHours"]
    if hours["isClosed"]:
        return {"slots": [], "reason": "closed"}
    open_, close_ = local_dt(date, hours["opensAt"], tz), local_dt(date, hours["closesAt"], tz)
    if inp["channel"] == "online":
        today = now.astimezone(ZoneInfo(tz)).date().isoformat()
        if days_between(today, date) > pol["bookingHorizonDays"]:
            return {"slots": [], "reason": "beyond_horizon"}
        if date < today:
            return {"slots": [], "reason": "past"}
    closures = [(parse_iso(c["startsAt"]), parse_iso(c["endsAt"])) for c in inp["closures"]
                if c["scope"] in ("all", "grooming")]
    appts = [dict(a, s=parse_iso(a["startsAt"]), b=parse_iso(a["blockedUntil"])) for a in inp["appointments"]]
    stations = inp["stationIds"]
    groomers = sorted(inp["groomers"], key=lambda g: (g["sortOrder"], g["id"]))
    pref = inp["groomerPreference"]
    if pref["type"] == "specific":
        groomers = [g for g in groomers if g["id"] == pref["groomerId"]]
    max_day, max_g = pol.get("maxAppointmentsPerDay"), pol.get("maxAppointmentsPerGroomerDay")
    if max_day is not None and len(appts) >= max_day:
        return {"slots": [], "reason": "day_full"}
    booked_min = {g["id"]: sum(int((a["b"] - a["s"]).total_seconds() // 60) for a in appts if a["groomerId"] == g["id"])
                  for g in groomers}
    count_g = {g["id"]: sum(1 for a in appts if a["groomerId"] == g["id"]) for g in groomers}
    out = []
    t = open_
    while t + dt.timedelta(minutes=dur) <= close_:
        work_end = t + dt.timedelta(minutes=dur)
        block_end = work_end + dt.timedelta(minutes=buf)
        ok_time = True
        if inp["channel"] == "online" and t < now + dt.timedelta(minutes=pol["bookingLeadMinutes"]):
            ok_time = False
        if inp["channel"] == "staff" and t + dt.timedelta(minutes=step) <= now:  # walk-in ลงช่วงปัจจุบันได้
            ok_time = False
        if ok_time and any(overlaps(t, work_end, c0, c1) for c0, c1 in closures):
            ok_time = False
        if ok_time:
            free_station = next((sid for sid in stations
                                 if not any(a["stationId"] == sid and overlaps(t, block_end, a["s"], a["b"]) for a in appts)), None)
            if free_station is not None:
                cands = []
                for g in groomers:
                    wh = g["workingHours"]
                    if wh is None:
                        continue
                    ws, we = local_dt(date, wh["startsAt"], tz), local_dt(date, wh["endsAt"], tz)
                    if not (ws <= t and work_end <= we):
                        continue
                    if wh.get("breakStartsAt"):
                        bs, be = local_dt(date, wh["breakStartsAt"], tz), local_dt(date, wh["breakEndsAt"], tz)
                        if overlaps(t, work_end, bs, be):
                            continue
                    if any(overlaps(t, work_end, parse_iso(o["startsAt"]), parse_iso(o["endsAt"])) for o in g["timeOff"]):
                        continue
                    if any(a["groomerId"] == g["id"] and overlaps(t, block_end, a["s"], a["b"]) for a in appts):
                        continue
                    if max_g is not None and count_g[g["id"]] >= max_g:
                        continue
                    cands.append(g)
                if cands:
                    best = min(cands, key=lambda g: (booked_min[g["id"]], g["sortOrder"], g["id"]))
                    out.append({"startsAt": iso(t), "groomerId": best["id"], "stationId": free_station})
        t += dt.timedelta(minutes=step)
    return {"slots": out, "reason": "ok" if out else "no_capacity"}

# ---------------------------------------------------------------- R-05 slip QR + duplicate
def crc16(s):
    crc = 0xFFFF
    for ch in s.encode("ascii"):
        crc ^= ch << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"

def tlv_parse(s):
    out, i = {}, 0
    while i < len(s):
        if i + 4 > len(s):
            return None
        tag, ln = s[i:i + 2], s[i + 2:i + 4]
        if not ln.isdigit():
            return None
        n = int(ln)
        val = s[i + 4:i + 4 + n]
        if len(val) != n:
            return None
        out[tag] = val
        i += 4 + n
    return out

def r05_parse_slip_qr(inp):
    p = inp["payload"].strip()
    top = tlv_parse(p)
    if not top or "00" not in top or "91" not in top:
        return None
    # Q-0026: a CRC mismatch is flagged (crcValid = false), not rejected — bank CRC formats are confirmed in SP-02
    crc_valid = crc16(p[:-4]) == top["91"].upper()
    sub = tlv_parse(top["00"])
    if not sub or "02" not in sub:
        return None
    return {"bankCode": sub.get("01"), "transRef": sub["02"], "crcValid": crc_valid}

def r05_find_duplicate(inp):
    if not inp["transRef"]:
        return {"duplicateOfSlipId": None}
    for s in sorted(inp["existing"], key=lambda x: x["createdAt"]):
        if s["transRef"] == inp["transRef"] and s["status"] != "rejected":
            return {"duplicateOfSlipId": s["id"]}
    return {"duplicateOfSlipId": None}

def make_slip_payload(bank, ref):
    sub = f"0006000001" + f"01{len(bank):02d}{bank}" + f"02{len(ref):02d}{ref}"
    body = f"00{len(sub):02d}{sub}" + "5102TH" + "9104"
    return body + crc16(body)

# ---------------------------------------------------------------- R-06 deposit
def ceil_baht(satang):
    return int(math.ceil(satang / 100.0)) * 100

def r06_deposit(inp):
    total, pol, c = inp["estimatedTotalSatang"], inp["policy"], inp["customer"]
    if c["depositExempt"]:
        return {"depositRequiredSatang": 0, "reason": "exempt"}
    lvl = c["reliabilityLevel"]
    if lvl == 1:
        return {"depositRequiredSatang": total, "reason": "reliability_full_prepay"}
    typ, val = pol["type"], pol["value"]
    if typ == "none":
        if lvl == 2:
            return {"depositRequiredSatang": min(total, ceil_baht(total * 30 / 100)), "reason": "reliability_min_30"}
        return {"depositRequiredSatang": 0, "reason": "policy_none"}
    if typ == "fixed":
        amt = min(val, total)
    else:
        amt = min(total, ceil_baht(total * val / 100))
    if lvl == 2 and amt < ceil_baht(total * 30 / 100):
        return {"depositRequiredSatang": min(total, ceil_baht(total * 30 / 100)), "reason": "reliability_min_30"}
    return {"depositRequiredSatang": amt, "reason": "policy_" + typ}

# ---------------------------------------------------------------- R-07 cancellation
def r07_cancellation(inp):
    dep = inp["depositVerifiedSatang"]
    snap = inp["policySnapshot"]
    minutes_before = math.floor((parse_iso(inp["firstServiceAt"]) - parse_iso(inp["now"])).total_seconds() / 60)
    free = {"grooming": snap["groomingFreeCancelHours"], "hotel": snap["hotelFreeCancelHours"],
            "daycare": snap["daycareFreeCancelHours"]}
    free_h = max(free[m] for m in inp["modules"])
    if inp["kind"] == "shop_cancel":
        late, forfeit = False, 0
        mode = inp.get("customerChoice") or "refund"
    elif inp["kind"] == "no_show":
        late, forfeit = True, dep
        mode = None
    else:
        late = minutes_before < free_h * 60
        forfeit = (dep * snap["lateCancelForfeitPercent"]) // 100 if late else 0
        m = snap["cancelRefundMode"]
        mode = m if m != "customer_choice" else (inp.get("customerChoice") or "credit")
    ret = dep - forfeit
    if ret == 0:
        mode = "none"
    return {"isLate": late, "minutesBefore": minutes_before, "freeCancelHours": free_h, "forfeitSatang": forfeit,
            "returnSatang": ret, "returnMode": mode}

# ---------------------------------------------------------------- R-08 timeouts
def r08_deadlines(inp):
    created = parse_iso(inp["createdAt"])
    res = {"holdExpiresAt": None, "approvalDueAt": None}
    if inp["depositRequiredSatang"] > 0:
        res["holdExpiresAt"] = iso(created + dt.timedelta(minutes=inp["holdMinutes"]))
    if inp["requiresApproval"]:
        res["approvalDueAt"] = iso(created + dt.timedelta(minutes=inp["approvalTimeoutMinutes"]))
    return res

# ---------------------------------------------------------------- R-09 reliability
def r09_reliability(inp):
    if inp["override"] is not None:
        return {"level": inp["override"], "source": "override"}
    ns, lc, done = inp["noShowCount12m"], inp["lateCancelCount12m"], inp["completedVisits12m"]
    if ns >= 2 or (ns >= 1 and lc >= 2):
        lvl = 1
    elif ns == 1 or lc >= 2:
        lvl = 2
    elif done >= 5 and lc == 0 and ns == 0:
        lvl = 4
    else:
        lvl = 3
    return {"level": lvl, "source": "computed"}

# ---------------------------------------------------------------- R-10 room allocation / R-28 availability
def _unit_free(unit_id, ci, co, stays):
    return not any(s["roomUnitId"] == unit_id and s["checkInDate"] < co and ci < s["checkOutDate"] for s in stays)

def r10_allocate_room(inp):
    ci, co = inp["checkInDate"], inp["checkOutDate"]
    units = sorted([u for u in inp["units"] if u["roomTypeId"] == inp["roomTypeId"] and u["status"] == "active"],
                   key=lambda u: (u["sortOrder"], u["code"]))
    free = [u for u in units if _unit_free(u["id"], ci, co, inp["stays"])]
    if not free:
        return {"roomUnitId": None, "rule": "none_free"}
    for u in free:
        if any(s["roomUnitId"] == u["id"] and s["checkOutDate"] == ci for s in inp["stays"]):
            return {"roomUnitId": u["id"], "rule": "back_to_back_before"}
    for u in free:
        if any(s["roomUnitId"] == u["id"] and s["checkInDate"] == co for s in inp["stays"]):
            return {"roomUnitId": u["id"], "rule": "back_to_back_after"}
    return {"roomUnitId": free[0]["id"], "rule": "first_free"}

def r28_hotel_availability(inp):
    ci, co = inp["checkInDate"], inp["checkOutDate"]
    units = [u for u in inp["units"] if u["roomTypeId"] == inp["roomTypeId"] and u["status"] == "active"]
    avail = sum(1 for u in units if _unit_free(u["id"], ci, co, inp["stays"]))
    nights = []
    d = ci
    while d < co:
        nd = add_days(d, 1)
        nights.append({"date": d, "freeUnits": sum(1 for u in units if _unit_free(u["id"], d, nd, inp["stays"]))})
        d = nd
    closed = [c for c in inp.get("closedDates", []) if ci <= c < co]
    if closed:
        return {"availableUnits": 0, "byNight": nights, "reason": "closed"}
    return {"availableUnits": avail, "byNight": nights, "reason": "ok" if avail else "full"}

# ---------------------------------------------------------------- R-11 vaccine gate
def r11_vaccine_gate(inp):
    req = inp["requiredCodes"]
    missing, expired, pending = [], [], []
    for code in req:
        recs = [v for v in inp["vaccinations"] if v["code"] == code and v["status"] != "rejected"]
        if not recs:
            missing.append(code); continue
        valid_verified = [v for v in recs if v["status"] == "verified" and v["expiresOn"] >= inp["mustBeValidOn"]]
        if valid_verified:
            continue
        valid_pending = [v for v in recs if v["status"] == "pending_review" and v["expiresOn"] >= inp["mustBeValidOn"]]
        if valid_pending:
            pending.append(code)
        else:
            expired.append(code)
    return {"ok": not (missing or expired or pending), "missing": missing, "expired": expired, "pendingReview": pending}

# ---------------------------------------------------------------- R-12 eligibility
REACTIVE = {"bites", "dog_reactive", "cat_reactive"}

def r12_eligibility(inp):
    r = []
    c, p, pol = inp["customer"], inp["pet"], inp["policy"]
    if c["blacklisted"] and inp["channel"] == "online":
        r.append("CUSTOMER_BLACKLISTED")
    if p["status"] != "active":
        r.append("PET_INACTIVE")
    allowed = inp.get("speciesAllowed") or []
    if allowed and p["species"] not in allowed:
        r.append("SPECIES_NOT_ALLOWED")
    if p.get("breed") and p["breed"].strip().lower() in [b.strip().lower() for b in pol["rejectedBreeds"]]:
        r.append("BREED_REJECTED")
    limits = [x for x in (pol.get("maxPetWeightGrams"), (inp.get("roomType") or {}).get("maxWeightGrams")) if x]
    if p.get("weightGrams") and limits and p["weightGrams"] > min(limits):
        r.append("PET_TOO_HEAVY")
    rt = inp.get("roomType")
    if rt:
        if rt.get("minAgeMonths") and p.get("ageMonths") is not None and p["ageMonths"] < rt["minAgeMonths"]:
            r.append("PET_TOO_YOUNG")
        if inp.get("inHeat") and not rt["allowInHeat"]:
            r.append("IN_HEAT_NOT_ALLOWED")
        if (set(p.get("flags", [])) & REACTIVE) and not rt["allowReactive"]:
            r.append("REACTIVE_NOT_ALLOWED")
    return {"ok": not r, "reasons": r}

def r12_age_months(inp):
    on = dt.date.fromisoformat(inp["onDate"])
    if inp.get("birthDate"):
        b = dt.date.fromisoformat(inp["birthDate"])
        m = (on.year - b.year) * 12 + (on.month - b.month) - (1 if on.day < b.day else 0)
        return max(m, 0)
    if inp.get("ageEstimateMonths") is not None and inp.get("estimateRecordedOn"):
        r = dt.date.fromisoformat(inp["estimateRecordedOn"])
        m = (on.year - r.year) * 12 + (on.month - r.month) - (1 if on.day < r.day else 0)
        return inp["ageEstimateMonths"] + max(m, 0)
    return None

# ---------------------------------------------------------------- R-13 commission
ELIGIBLE = {"groom_service", "groom_addon", "surcharge", "package_redemption"}

def r13_commission(inp):
    lines = inp["lines"]
    disc = inp["billDiscountSatang"]
    pos = [l for l in lines if l["lineTotalSatang"] > 0]
    tot = sum(l["lineTotalSatang"] for l in pos)
    alloc = {l["billLineId"]: 0 for l in lines}
    if disc and tot:
        given = 0
        for l in pos:
            a = disc * l["lineTotalSatang"] // tot
            alloc[l["billLineId"]] = a
            given += a
        rem = disc - given
        if rem:
            biggest = max(pos, key=lambda l: (l["lineTotalSatang"], -lines.index(l)))
            alloc[biggest["billLineId"]] += rem
    out = []
    for l in lines:
        if l["lineType"] not in ELIGIBLE or not l.get("performerId"):
            continue
        base = l["packageUnitValueSatang"] if l["lineType"] == "package_redemption" else l["lineTotalSatang"] - alloc[l["billLineId"]]
        rules = inp["rules"]
        pick = None
        for svc, staff in ((l.get("serviceId"), l["performerId"]), (l.get("serviceId"), None), (None, l["performerId"]), (None, None)):
            if svc is None and staff is not None and l.get("serviceId") is None:
                pass
            pick = next((r for r in rules if r["serviceId"] == svc and r["staffUserId"] == staff), None)
            if pick:
                break
        if not pick:
            continue
        amt = base * pick["value"] // 10000 if pick["type"] == "percent" else pick["value"] * l["quantity"]
        out.append({"billLineId": l["billLineId"], "staffUserId": l["performerId"], "baseSatang": base,
                    "ruleId": pick["id"], "amountSatang": amt})
    return out

# ---------------------------------------------------------------- R-14 packages
def r14_package_terms(inp):
    unit = inp["priceSatang"] // inp["sessionsCount"]
    purchased_local = to_local(inp["purchasedAt"], inp["timezone"]).date().isoformat()
    exp = local_dt(add_days(purchased_local, inp["validityDays"] + 1), "00:00", inp["timezone"]) - dt.timedelta(milliseconds=1)
    return {"unitValueSatang": unit, "expiresAt": iso(exp)}

def r14_can_redeem(inp):
    p, a = inp["package"], inp["appointment"]
    if p["status"] != "active":
        return {"ok": False, "reason": "PACKAGE_NOT_ACTIVE"}
    if p["sessionsUsed"] >= p["sessionsTotal"]:
        return {"ok": False, "reason": "PACKAGE_EXHAUSTED"}
    if parse_iso(inp["now"]) > parse_iso(p["expiresAt"]):
        return {"ok": False, "reason": "PACKAGE_EXPIRED"}
    if p["serviceId"] != a["serviceId"]:
        return {"ok": False, "reason": "PACKAGE_SERVICE_MISMATCH"}
    if p["sizeTierId"] is not None and p["sizeTierId"] != a["sizeTierId"]:
        return {"ok": False, "reason": "PACKAGE_SIZE_MISMATCH"}
    if p["shareScope"] == "single_pet" and p["petId"] != a["petId"]:
        return {"ok": False, "reason": "PACKAGE_PET_MISMATCH"}
    return {"ok": True, "reason": None}

# ---------------------------------------------------------------- R-15 bill totals & payments
def r15_bill_totals(inp):
    sub = 0
    for l in inp["lines"]:
        gross = l["quantity"] * l["unitPriceSatang"]
        if l["lineDiscountSatang"] > gross or l["quantity"] <= 0:
            return {"error": "LINE_DISCOUNT_TOO_LARGE" if l["quantity"] > 0 else "INVALID_QUANTITY"}
        sub += gross - l["lineDiscountSatang"]
    if inp["billDiscountSatang"] > sub:
        return {"error": "BILL_DISCOUNT_TOO_LARGE"}
    total = sub - inp["billDiscountSatang"]
    paid = sum(p["amountSatang"] for p in inp["payments"] if p["status"] == "posted")
    return {"subtotalSatang": sub, "totalSatang": total, "paidSatang": paid, "dueSatang": total - paid,
            "canClose": total - paid == 0}

def r15_apply_payment(inp):
    due = inp["dueSatang"]
    m = inp["method"]
    if due <= 0:
        return {"error": "BILL_ALREADY_PAID"}
    if m == "cash":
        t = inp["tenderedSatang"]
        if t <= 0:
            return {"error": "INVALID_AMOUNT"}
        amt = min(t, due)
        return {"amountSatang": amt, "changeSatang": t - amt, "dueAfterSatang": due - amt}
    amt = inp["amountSatang"]
    if amt <= 0:
        return {"error": "INVALID_AMOUNT"}
    if amt > due:
        return {"error": "AMOUNT_EXCEEDS_DUE"}
    if m == "credit" and amt > inp.get("creditBalanceSatang", 0):
        return {"error": "INSUFFICIENT_CREDIT"}
    return {"amountSatang": amt, "changeSatang": 0, "dueAfterSatang": due - amt}

# ---------------------------------------------------------------- R-16 / R-23 numbering
def r16_receipt_no(inp):
    loc = to_local(inp["now"], inp["timezone"])
    year_be = loc.year + 543
    seq = inp["counter"]["nextSeq"] if inp["counter"]["yearBe"] == year_be else 1
    return {"receiptNo": f"{inp['prefix']}{year_be % 100:02d}-{seq:05d}", "counter": {"yearBe": year_be, "nextSeq": seq + 1}}

def r23_booking_no(inp):
    loc = to_local(inp["now"], inp["timezone"])
    key = f"{(loc.year + 543) % 100:02d}{loc.month:02d}"
    seq = inp["counter"]["nextSeq"] if inp["counter"]["month"] == key else 1
    return {"bookingNo": f"B{key}-{seq:04d}", "counter": {"month": key, "nextSeq": seq + 1}}

# ---------------------------------------------------------------- R-17 next groom
def r17_next_groom(inp):
    if inp["petStatus"] != "active":
        return {"dueDate": None, "remindOn": None, "intervalDays": None, "source": "pet_inactive"}
    visits = sorted(inp["visitDates"])
    if not visits:
        return {"dueDate": None, "remindOn": None, "intervalDays": None, "source": "no_visit"}
    if inp["shopIntervalDays"]:
        n, src = inp["shopIntervalDays"], "shop"
    else:
        last4 = visits[-4:]
        gaps = [days_between(a, b) for a, b in zip(last4, last4[1:]) if days_between(a, b) > 0]
        if len(gaps) >= 2:
            g = sorted(gaps)
            mid = len(g) // 2
            n = g[mid] if len(g) % 2 else (g[mid - 1] + g[mid] + 1) // 2
            src = "history"
        else:
            n, src = inp["defaultDays"], "default"
    due = add_days(visits[-1], n)
    if inp["hasFutureAppointment"]:
        return {"dueDate": due, "remindOn": None, "intervalDays": n, "source": src + ":has_future_appointment"}
    return {"dueDate": due, "remindOn": add_days(due, -3), "intervalDays": n, "source": src}

# ---------------------------------------------------------------- R-18 LINE quota
def r18_line_push(inp):
    q, used, cls = inp["monthlyQuota"], inp["usedThisMonth"], inp["messageClass"]
    if used >= q:
        return {"send": False, "skipReason": "quota_exhausted"}
    if inp["economyMode"] and inp["economyBehavior"] == "skip":
        return {"send": False, "skipReason": "economy_mode"}
    if cls == "marketing" and used * 100 >= q * 70:
        return {"send": False, "skipReason": "quota_exhausted"}
    if cls != "essential" and used * 100 >= q * 90:
        return {"send": False, "skipReason": "quota_exhausted"}
    return {"send": True, "skipReason": None}

# ---------------------------------------------------------------- R-19 channel selection
def r19_channel(inp):
    if inp["recipientType"] == "staff":
        if inp["activePushSubscriptions"] > 0:
            return {"channel": "web_push", "skipReason": None}
        if inp["isOwner"] and inp["hasEmail"]:
            return {"channel": "email", "skipReason": None}
        return {"channel": None, "skipReason": "no_recipient"}
    if not inp["hasLineIdentity"] or not inp["isFriend"]:
        return {"channel": None, "skipReason": "no_recipient"}
    if inp["templateAllowsReply"] and inp["replyTokenAgeSeconds"] is not None and inp["replyTokenAgeSeconds"] < 50:
        return {"channel": "line_reply", "skipReason": None}
    return {"channel": "line_push", "skipReason": None}

# ---------------------------------------------------------------- R-21 customer self-service
ACTIVE_FOR_CUSTOMER = {"awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"}

def r21_self_service(inp):
    now, first = parse_iso(inp["now"]), parse_iso(inp["firstServiceAt"])
    st = inp["status"]
    can_cancel = st in ACTIVE_FOR_CUSTOMER and now < first
    hb = (first - now).total_seconds() / 3600
    if st not in ("confirmed", "awaiting_approval"):
        rs, why = False, "STATUS_NOT_ALLOWED"
    elif hb < inp["rescheduleCutoffHours"]:
        rs, why = False, "TOO_LATE_TO_RESCHEDULE"
    elif inp["rescheduleCount"] >= 2:
        rs, why = False, "RESCHEDULE_LIMIT"
    else:
        rs, why = True, None
    return {"canCancel": can_cancel, "canReschedule": rs, "rescheduleBlockedReason": why}

# ---------------------------------------------------------------- R-22 phone
def r22_normalize_phone(inp):
    raw = inp["input"].strip()
    s = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if s.count("+") > 1 or ("+" in s and not s.startswith("+")):
        return {"e164": None, "error": "INVALID_PHONE"}
    digits = s.lstrip("+")
    if s.startswith("+"):
        if digits.startswith("66"):
            nat = digits[2:]
        else:
            if 8 <= len(digits) <= 15 and not digits.startswith("0"):
                return {"e164": "+" + digits, "error": None}
            return {"e164": None, "error": "INVALID_PHONE"}
    elif digits.startswith("66") and len(digits) in (10, 11):
        nat = digits[2:]
    elif digits.startswith("0"):
        nat = digits[1:]
    else:
        return {"e164": None, "error": "INVALID_PHONE"}
    if nat.startswith("0"):
        nat = nat[1:]
    if len(nat) == 9 and nat[0] in "689":
        return {"e164": "+66" + nat, "error": None}
    if len(nat) == 8 and nat[0] in "234573":
        return {"e164": "+66" + nat, "error": None}
    return {"e164": None, "error": "INVALID_PHONE"}

def r22_format_phone(inp):
    e = inp["e164"]
    if not e.startswith("+66"):
        return e
    nat = "0" + e[3:]
    if len(nat) == 10:
        return f"{nat[:3]}-{nat[3:6]}-{nat[6:]}"
    if len(nat) == 9 and nat[1] == "2":
        return f"{nat[:2]}-{nat[2:5]}-{nat[5:]}"
    if len(nat) == 9:
        return f"{nat[:3]}-{nat[3:6]}-{nat[6:]}"
    return nat

# ---------------------------------------------------------------- R-24 lockout
def r24_login_attempt(inp):
    now = parse_iso(inp["now"])
    locked = parse_iso(inp["lockedUntil"]) if inp["lockedUntil"] else None
    if locked and now < locked:
        return {"allowed": False, "failedLoginCount": inp["failedLoginCount"], "lockedUntil": inp["lockedUntil"], "error": "ACCOUNT_LOCKED"}
    if inp["passwordCorrect"]:
        return {"allowed": True, "failedLoginCount": 0, "lockedUntil": None, "error": None}
    n = inp["failedLoginCount"] + 1
    if n >= 5:
        return {"allowed": False, "failedLoginCount": 0, "lockedUntil": iso(now + dt.timedelta(minutes=15)), "error": "ACCOUNT_LOCKED"}
    return {"allowed": False, "failedLoginCount": n, "lockedUntil": None, "error": "INVALID_CREDENTIALS"}

def r24_password_policy(inp):
    p = inp["password"]
    if len(p) < 8:
        return {"ok": False, "error": "PASSWORD_TOO_SHORT"}
    if len(p) > 128:
        return {"ok": False, "error": "PASSWORD_TOO_LONG"}
    if p.isdigit():
        return {"ok": False, "error": "PASSWORD_ALL_DIGITS"}
    if inp.get("email") and p.lower() == inp["email"].split("@")[0].lower():
        return {"ok": False, "error": "PASSWORD_SAME_AS_EMAIL"}
    return {"ok": True, "error": None}

# ---------------------------------------------------------------- R-25 uploads
IMG = ["image/jpeg", "image/png", "image/webp"]
UPLOAD = {
    "pet_profile": (IMG, 2_000_000), "before": (IMG, 2_000_000), "after": (IMG, 2_000_000),
    "stay_update": (IMG + ["video/mp4"], 20_000_000), "vaccine_proof": (IMG + ["application/pdf"], 5_000_000),
    "slip": (IMG, 2_000_000), "signature": (["image/png"], 500_000), "logo": (IMG, 1_000_000),
    "room_photo": (IMG, 2_000_000), "service_photo": (IMG, 2_000_000), "feedback": (IMG, 2_000_000),
    "import_csv": (["text/csv"], 2_000_000), "proof": (IMG + ["application/pdf"], 5_000_000),
}

def r25_validate_upload(inp):
    k = inp["kind"]
    if k not in UPLOAD:
        return {"ok": False, "error": "UPLOAD_KIND_NOT_ALLOWED"}
    mimes, mx = UPLOAD[k]
    if inp["mimeType"] not in mimes:
        return {"ok": False, "error": "UPLOAD_TYPE_NOT_ALLOWED"}
    if inp["sizeBytes"] <= 0 or inp["sizeBytes"] > (mx if inp["mimeType"] != "video/mp4" else 20_000_000):
        return {"ok": False, "error": "UPLOAD_TOO_LARGE"}
    return {"ok": True, "error": None}

# ---------------------------------------------------------------- R-26 care tasks
def walk_times(n):
    if n <= 0:
        return []
    if n == 1:
        return ["16:00"]
    out = []
    for i in range(n):
        mins = 9 * 60 + round((8 * 60) * i / (n - 1) / 30) * 30
        out.append(f"{mins // 60:02d}:{mins % 60:02d}")
    return out

def r26_care_tasks(inp):
    tz = inp["timezone"]
    start = parse_iso(inp["checkedInAt"])
    end = local_dt(inp["checkOutDate"], inp.get("expectedCheckOutTime") or "12:00", tz)
    d = start.astimezone(ZoneInfo(tz)).date().isoformat()
    tasks = []
    while d <= inp["checkOutDate"]:
        day = []
        for t in inp["feedingTimes"]:
            day.append(("feed", "ให้อาหาร", t, None))
        for m in inp["medications"]:
            for t in m["times"]:
                day.append(("medication", f"ให้ยา {m['name']}", t, m["id"]))
        for t in walk_times(inp["walksPerDay"]):
            day.append(("walk", "พาเดินเล่น", t, None))
        day.append(("clean", "ทำความสะอาดห้อง", "10:00", None))
        for typ, title, t, mid in day:
            due = local_dt(d, t, tz)
            if start < due < end:
                tasks.append({"taskType": typ, "title": title, "dueAt": iso(due), "medicationId": mid})
        d = add_days(d, 1)
    tasks.sort(key=lambda x: (x["dueAt"], x["taskType"], x["title"]))
    return tasks

# ---------------------------------------------------------------- R-29 daycare availability
def r29_daycare_availability(inp):
    types = {t["session"]: t for t in inp["sessionTypes"] if t["status"] == "active"}
    cnt = {"full_day": 0, "morning": 0, "afternoon": 0}
    for v in inp["visits"]:
        if v["status"] in ("reserved", "checked_in", "checked_out"):
            cnt[v["session"]] += 1
    if inp.get("closed"):
        return {s: 0 for s in types}
    res = {}
    for s, t in types.items():
        if s == "full_day":
            cands = [t["capacity"] - cnt["full_day"]]
            for half in ("morning", "afternoon"):
                if half in types:
                    cands.append(types[half]["capacity"] - cnt[half] - cnt["full_day"])
            res[s] = max(0, min(cands))
        else:
            res[s] = max(0, t["capacity"] - cnt[s] - cnt["full_day"])
    return res

# ---------------------------------------------------------------- R-30 PromptPay QR
def r30_promptpay_payload(inp):
    typ, pid = inp["type"], "".join(ch for ch in inp["id"] if ch.isdigit())
    if typ == "phone":
        if len(pid) != 10 or not pid.startswith("0"):
            return {"error": "INVALID_PROMPTPAY_ID"}
        acc = "01" + "13" + "0066" + pid[1:]
    elif typ in ("national_id", "tax_id"):
        if len(pid) != 13:
            return {"error": "INVALID_PROMPTPAY_ID"}
        acc = "02" + "13" + pid
    else:
        if len(pid) != 15:
            return {"error": "INVALID_PROMPTPAY_ID"}
        acc = "03" + "15" + pid
    merchant = "0016A000000677010111" + acc
    amt = inp.get("amountSatang")
    s = "000201" + ("010212" if amt else "010211") + f"29{len(merchant):02d}{merchant}" + "5303764"
    if amt:
        a = f"{amt // 100}.{amt % 100:02d}"
        s += f"54{len(a):02d}{a}"
    s += "5802TH" + "6304"
    return {"payload": s + crc16(s)}

# ---------------------------------------------------------------- R-31 formatting
TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
TH_DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]

def r31_format_thb(inp):
    s = inp["satang"]
    neg = s < 0
    s = abs(s)
    baht, st = divmod(s, 100)
    txt = f"{baht:,}"
    if inp.get("decimals") == "always" or st:
        txt += f".{st:02d}"
    return ("-" if neg else "") + "฿" + txt

def r31_format_date(inp):
    d = dt.date.fromisoformat(inp["date"])
    s = f"{d.day} {TH_MONTH[d.month - 1]} {d.year + 543}"
    if inp.get("withWeekday"):
        s = f"{TH_DOW[d.weekday()]} {s}"
    return s

def r31_format_time(inp):
    loc = to_local(inp["instant"], inp["timezone"])
    return f"{loc.hour:02d}:{loc.minute:02d} น."

def r31_format_weight(inp):
    tenths = (inp["grams"] + 50) // 100          # integer math: ปัดครึ่งขึ้น (ไม่ใช้ float/banker's rounding)
    whole, frac = divmod(tenths, 10)
    return f"{whole}.{frac} กก." if frac else f"{whole} กก."
