// Throwaway proof: independent TS implementations must reproduce the Python-generated vectors exactly.
import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { TZDate } from "@date-fns/tz";

const DIR = new URL("../../../docs/spec/vectors/", import.meta.url).pathname; // repo-relative
const iso = (d: Date) => d.toISOString();
const localToUtc = (date: string, time: string, tz: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, 0, tz).getTime());
};
const localDate = (instant: Date, tz: string) => {
  const z = new TZDate(instant.getTime(), tz);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
};
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
const MIN = 60000;

// ---------------- R-04
function computeGroomSlots(inp: any) {
  const { timezone: tz, date, policy: pol } = inp;
  const step = pol.slotStepMinutes, buf = pol.bufferMinutes, dur = inp.durationMinutes;
  const now = Date.parse(inp.now);
  if (inp.branchHours.isClosed) return { slots: [], reason: "closed" };
  const open = localToUtc(date, inp.branchHours.opensAt, tz).getTime(), close = localToUtc(date, inp.branchHours.closesAt, tz).getTime();
  if (inp.channel === "online") {
    const today = localDate(new Date(now), tz);
    if (daysBetween(today, date) > pol.bookingHorizonDays) return { slots: [], reason: "beyond_horizon" };
    if (date < today) return { slots: [], reason: "past" };
  }
  const closures = inp.closures.filter((c: any) => c.scope === "all" || c.scope === "grooming").map((c: any) => [Date.parse(c.startsAt), Date.parse(c.endsAt)]);
  const appts = inp.appointments.map((a: any) => ({ ...a, s: Date.parse(a.startsAt), b: Date.parse(a.blockedUntil) }));
  let groomers = [...inp.groomers].sort((a: any, b: any) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (inp.groomerPreference.type === "specific") groomers = groomers.filter((g: any) => g.id === inp.groomerPreference.groomerId);
  if (pol.maxAppointmentsPerDay != null && appts.length >= pol.maxAppointmentsPerDay) return { slots: [], reason: "day_full" };
  const booked: Record<string, number> = {}, count: Record<string, number> = {};
  for (const g of groomers) {
    booked[g.id] = appts.filter((a: any) => a.groomerId === g.id).reduce((s: number, a: any) => s + Math.floor((a.b - a.s) / MIN), 0);
    count[g.id] = appts.filter((a: any) => a.groomerId === g.id).length;
  }
  const out: any[] = [];
  for (let t = open; t + dur * MIN <= close; t += step * MIN) {
    const workEnd = t + dur * MIN, blockEnd = workEnd + buf * MIN;
    if (inp.channel === "online" && t < now + pol.bookingLeadMinutes * MIN) continue;
    if (inp.channel === "staff" && t + step * MIN <= now) continue;
    if (closures.some(([c0, c1]: number[]) => overlaps(t, workEnd, c0!, c1!))) continue;
    const station = inp.stationIds.find((sid: string) => !appts.some((a: any) => a.stationId === sid && overlaps(t, blockEnd, a.s, a.b)));
    if (station === undefined) continue;
    const cands = groomers.filter((g: any) => {
      const wh = g.workingHours; if (!wh) return false;
      const ws = localToUtc(date, wh.startsAt, tz).getTime(), we = localToUtc(date, wh.endsAt, tz).getTime();
      if (!(ws <= t && workEnd <= we)) return false;
      if (wh.breakStartsAt && overlaps(t, workEnd, localToUtc(date, wh.breakStartsAt, tz).getTime(), localToUtc(date, wh.breakEndsAt, tz).getTime())) return false;
      if (g.timeOff.some((o: any) => overlaps(t, workEnd, Date.parse(o.startsAt), Date.parse(o.endsAt)))) return false;
      if (appts.some((a: any) => a.groomerId === g.id && overlaps(t, blockEnd, a.s, a.b))) return false;
      if (pol.maxAppointmentsPerGroomerDay != null && count[g.id]! >= pol.maxAppointmentsPerGroomerDay) return false;
      return true;
    });
    if (!cands.length) continue;
    const best = cands.reduce((a: any, b: any) => (booked[b.id]! < booked[a.id]! ? b : a));
    out.push({ startsAt: iso(new Date(t)), groomerId: best.id, stationId: station });
  }
  return { slots: out, reason: out.length ? "ok" : "no_capacity" };
}

// ---------------- R-07
function computeCancellation(inp: any) {
  const dep = inp.depositVerifiedSatang, snap = inp.policySnapshot;
  const minutesBefore = Math.floor((Date.parse(inp.firstServiceAt) - Date.parse(inp.now)) / MIN);
  const free: Record<string, number> = { grooming: snap.groomingFreeCancelHours, hotel: snap.hotelFreeCancelHours, daycare: snap.daycareFreeCancelHours };
  const freeH = Math.max(...inp.modules.map((m: string) => free[m]!));
  let late: boolean, forfeit: number, mode: string | null;
  if (inp.kind === "shop_cancel") { late = false; forfeit = 0; mode = inp.customerChoice ?? "refund"; }
  else if (inp.kind === "no_show") { late = true; forfeit = dep; mode = null; }
  else {
    late = minutesBefore < freeH * 60;
    forfeit = late ? Math.floor((dep * snap.lateCancelForfeitPercent) / 100) : 0;
    mode = snap.cancelRefundMode !== "customer_choice" ? snap.cancelRefundMode : inp.customerChoice ?? "credit";
  }
  const ret = dep - forfeit;
  if (ret === 0) mode = "none";
  return { isLate: late, minutesBefore, freeCancelHours: freeH, forfeitSatang: forfeit, returnSatang: ret, returnMode: mode };
}

// ---------------- R-13
function computeCommissions(inp: any) {
  const lines = inp.lines, disc = inp.billDiscountSatang;
  const pos = lines.filter((l: any) => l.lineTotalSatang > 0);
  const tot = pos.reduce((s: number, l: any) => s + l.lineTotalSatang, 0);
  const alloc: Record<string, number> = Object.fromEntries(lines.map((l: any) => [l.billLineId, 0]));
  if (disc && tot) {
    let given = 0;
    for (const l of pos) { const a = Math.floor((disc * l.lineTotalSatang) / tot); alloc[l.billLineId] = a; given += a; }
    const rem = disc - given;
    if (rem) { const big = pos.reduce((a: any, b: any) => (b.lineTotalSatang > a.lineTotalSatang ? b : a)); alloc[big.billLineId]! += rem; }
  }
  const ELIG = new Set(["groom_service", "groom_addon", "surcharge", "package_redemption"]);
  const out: any[] = [];
  for (const l of lines) {
    if (!ELIG.has(l.lineType) || !l.performerId) continue;
    const base = l.lineType === "package_redemption" ? l.packageUnitValueSatang : l.lineTotalSatang - alloc[l.billLineId]!;
    let pick: any = null;
    for (const [svc, st] of [[l.serviceId ?? null, l.performerId], [l.serviceId ?? null, null], [null, l.performerId], [null, null]]) {
      pick = inp.rules.find((r: any) => r.serviceId === svc && r.staffUserId === st); if (pick) break;
    }
    if (!pick) continue;
    const amt = pick.type === "percent" ? Math.floor((base * pick.value) / 10000) : pick.value * l.quantity;
    out.push({ billLineId: l.billLineId, staffUserId: l.performerId, baseSatang: base, ruleId: pick.id, amountSatang: amt });
  }
  return out;
}

// ---------------- R-26
function walkTimes(n: number) {
  if (n <= 0) return [];
  if (n === 1) return ["16:00"];
  return Array.from({ length: n }, (_, i) => {
    const steps = Math.floor((32 * i + (n - 1)) / (2 * (n - 1)));
    const mins = 540 + steps * 30;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  });
}
function generateCareTasks(inp: any) {
  const tz = inp.timezone, start = Date.parse(inp.checkedInAt);
  const end = localToUtc(inp.checkOutDate, inp.expectedCheckOutTime ?? "12:00", tz).getTime();
  const tasks: any[] = [];
  for (let d = localDate(new Date(start), tz); d <= inp.checkOutDate; d = addDays(d, 1)) {
    const day: [string, string, string, string | null][] = [];
    for (const t of inp.feedingTimes) day.push(["feed", "ให้อาหาร", t, null]);
    for (const m of inp.medications) for (const t of m.times) day.push(["medication", `ให้ยา ${m.name}`, t, m.id]);
    for (const t of walkTimes(inp.walksPerDay)) day.push(["walk", "พาเดินเล่น", t, null]);
    day.push(["clean", "ทำความสะอาดห้อง", "10:00", null]);
    for (const [taskType, title, t, medicationId] of day) {
      const due = localToUtc(d, t, tz).getTime();
      if (start < due && due < end) tasks.push({ taskType, title, dueAt: iso(new Date(due)), medicationId });
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return tasks.sort((a, b) => cmp(a.dueAt, b.dueAt) || cmp(a.taskType, b.taskType) || cmp(a.title, b.title));
}

// ---------------- R-30
function crc16(s: string) {
  let crc = 0xffff;
  for (const ch of Buffer.from(s, "ascii")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function promptPayPayload(inp: any) {
  const id = String(inp.id).replace(/\D/g, "");
  let acc: string;
  if (inp.type === "phone") { if (id.length !== 10 || !id.startsWith("0")) return { error: "INVALID_PROMPTPAY_ID" }; acc = `0113${"0066" + id.slice(1)}`; }
  else if (inp.type === "national_id" || inp.type === "tax_id") { if (id.length !== 13) return { error: "INVALID_PROMPTPAY_ID" }; acc = `0213${id}`; }
  else { if (id.length !== 15) return { error: "INVALID_PROMPTPAY_ID" }; acc = `0315${id}`; }
  const merchant = `0016A000000677010111${acc}`;
  const amt = inp.amountSatang;
  let s = `000201${amt ? "010212" : "010211"}29${String(merchant.length).padStart(2, "0")}${merchant}5303764`;
  if (amt) { const a = `${Math.floor(amt / 100)}.${String(amt % 100).padStart(2, "0")}`; s += `54${String(a.length).padStart(2, "0")}${a}`; }
  s += "5802TH6304";
  return { payload: s + crc16(s) };
}

// ---------------- R-22 / R-31
function normalizePhone(inp: any) {
  const s = inp.input.trim().replace(/[^\d+]/g, "");
  if ((s.match(/\+/g) ?? []).length > 1 || (s.includes("+") && !s.startsWith("+"))) return { e164: null, error: "INVALID_PHONE" };
  const digits = s.replace(/^\+/, "");
  let nat: string;
  if (s.startsWith("+")) {
    if (digits.startsWith("66")) nat = digits.slice(2);
    else return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0") ? { e164: `+${digits}`, error: null } : { e164: null, error: "INVALID_PHONE" };
  } else if (digits.startsWith("66") && (digits.length === 10 || digits.length === 11)) nat = digits.slice(2);
  else if (digits.startsWith("0")) nat = digits.slice(1);
  else return { e164: null, error: "INVALID_PHONE" };
  if (nat.startsWith("0")) nat = nat.slice(1);
  if (nat.length === 9 && "689".includes(nat[0]!)) return { e164: `+66${nat}`, error: null };
  if (nat.length === 8 && "234573".includes(nat[0]!)) return { e164: `+66${nat}`, error: null };
  return { e164: null, error: "INVALID_PHONE" };
}
function formatTHB(inp: any) {
  const neg = inp.satang < 0, s = Math.abs(inp.satang), baht = Math.floor(s / 100), st = s % 100;
  let t = baht.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (inp.decimals === "always" || st) t += `.${String(st).padStart(2, "0")}`;
  return `${neg ? "-" : ""}฿${t}`;
}
function formatWeight(inp: any) {
  const tenths = Math.floor((inp.grams + 50) / 100), whole = Math.floor(tenths / 10), frac = tenths % 10;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""} กก.`;
}
const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
function formatThaiDate(inp: any) {
  const d = new Date(`${inp.date}T00:00:00Z`);
  const s = `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
  return inp.withWeekday ? `${DOW[d.getUTCDay()]} ${s}` : s;
}

const impl: Record<string, (i: any) => unknown> = {
  computeGroomSlots, computeCancellation, computeCommissions, generateCareTasks, promptPayPayload, normalizePhone, formatTHB, formatWeight, formatThaiDate,
};
let pass = 0, fail = 0;
for (const f of readdirSync(DIR).filter((x) => /^R-\d\d\./.test(x))) {
  const v = JSON.parse(readFileSync(DIR + f, "utf8"));
  const fn = impl[v.export]; if (!fn) continue;
  for (const c of v.cases) {
    const got = fn(structuredClone(c.input));
    if (isDeepStrictEqual(got, c.expected)) pass++;
    else { fail++; console.log("FAIL", f, c.name, "\n got:", JSON.stringify(got).slice(0, 400), "\n exp:", JSON.stringify(c.expected).slice(0, 400)); }
  }
}
console.log(`TS proof: ${pass} passed, ${fail} failed`);
