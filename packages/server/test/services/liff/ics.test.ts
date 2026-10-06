// T-0178 liff.ics: the customer's booking as text/calendar — one VEVENT per appointment / stay / daycare visit.
import { LiffIcsParams, LiffIcsResponse } from "@app/contracts/endpoints/liff.ics";
import {
  booking,
  branch,
  customer,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  pet,
  roomType,
  roomUnit,
  service,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { buildCalendar, foldLine, icsText, liffIcs } from "../../../src/services/liff/ics.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.ics", { params: LiffIcsParams }, liffIcs);
const call = async (slug: string, s: SeedOrg, bookingId: string) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/bookings/${bookingId}/calendar.ics`, {
      headers: { cookie: `cid=${encodeURIComponent(token)}` },
    }),
    { params: { branchSlug: slug, bookingId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function addBooking(s: SeedOrg, customerId = s.customerId) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: s.orgId,
      branchId: s.branchId,
      customerId,
      bookingNo: `B-${crypto.randomUUID().slice(0, 8)}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  return bk;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

it("one VEVENT per grooming appointment, stay and daycare visit; cancelled lines left out; LOCATION + Google Maps URL", async () => {
  const s = await seedOrg(env.db, "ic1");
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  await env.db
    .update(branch)
    .set({ addressLine: "1 ถนนสุขุมวิท", district: "วัฒนา", province: "กรุงเทพมหานคร", latitude: 13.75, longitude: 100.5 })
    .where(eq(branch.id, s.branchId));
  const bk = await addBooking(s);
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const petId = mochi?.id ?? "";
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "โต๊ะ 1" })
    .returning();
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  const appt = (startsAt: string, status: "scheduled" | "cancelled") => ({
    ...tenant,
    bookingId: bk.id,
    petId,
    groomerId: s.staff.staff,
    groomerPreference: "any" as const,
    stationId: station?.id ?? "",
    startsAt: new Date(startsAt),
    endsAt: new Date(Date.parse(startsAt) + 3_600_000),
    blockedUntil: new Date(Date.parse(startsAt) + 3_600_000),
    status,
  });
  const [a] = await env.db
    .insert(groomAppointment)
    .values([appt("2026-11-01T03:00:00.000Z", "scheduled"), appt("2026-11-02T03:00:00.000Z", "cancelled")])
    .returning();
  await env.db
    .insert(groomAppointmentItem)
    .values({
      organizationId: s.orgId,
      appointmentId: a?.id ?? "",
      serviceId: svc?.id ?? "",
      nameSnapshot: "อาบน้ำ",
      priceSatang: 1,
      durationMinutes: 60,
    });
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "A1" })
    .returning();
  await env.db.insert(stay).values({
    ...tenant,
    bookingId: bk.id,
    petId,
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-12-01",
    checkOutDate: "2026-12-03",
    nights: 2,
    nightlyPriceSatang: 1,
    roomTotalSatang: 2,
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "morning", nameTh: "ครึ่งเช้า", startsAt: "08:00", endsAt: "12:00", capacity: 5 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...tenant, bookingId: bk.id, petId, sessionTypeId: session?.id ?? "", visitDate: "2026-12-05", priceSatang: 1 });

  const res = await call("shop-ic1", s, bk.id);
  expect(res.status).toBe(200);
  const ics = (await res.json()) as string;
  expect(LiffIcsResponse.safeParse(ics).success).toBe(true);
  const unfolded = ics.replace(/\r\n /g, "");
  expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(unfolded).toContain(`UID:groom-${a?.id}@pj8`);
  expect(unfolded).toContain("DTSTART:20261101T030000Z");
  expect(unfolded).toContain("DTEND:20261101T040000Z");
  expect(unfolded).toContain("SUMMARY:Shop ic1 · โมจิ · อาบน้ำ");
  expect(unfolded).toContain("DTSTART;VALUE=DATE:20261201");
  expect(unfolded).toContain("DTEND;VALUE=DATE:20261203");
  expect(unfolded).toContain("DTSTART:20261205T010000Z"); // 08:00 Bangkok
  expect(unfolded).toContain("LOCATION:1 ถนนสุขุมวิท วัฒนา กรุงเทพมหานคร");
  expect(unfolded).toContain("URL:https://www.google.com/maps/search/?api=1&query=13.75,100.5");
  expect(unfolded).not.toContain("20261102T030000Z");
});

it("another customer's / shop's booking → NOT_FOUND; bad id → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "ic2");
  const t = await seedOrg(env.db, "ic3");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: t.ownerProfileId }).returning();
  for (const id of [(await addBooking(s, someone?.id)).id, (await addBooking(t)).id])
    expect(await errorCode(await call("shop-ic2", s, id))).toBe("NOT_FOUND");
  expect(await errorCode(await call("shop-ic2", s, "nope"))).toBe("VALIDATION_FAILED");
});

it("RFC 5545 helpers: TEXT escaping, 75-octet folding, CRLF lines", () => {
  expect(icsText("a,b;c\\d\ne")).toBe("a\\,b;c\\\\d\\ne");
  const long = "SUMMARY:" + "ก".repeat(40);
  const folded = foldLine(long);
  for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  expect(folded.replace(/\r\n /g, "")).toBe(long);
  const cal = buildCalendar({ now: new Date("2026-10-06T00:00:00.000Z"), events: [], location: null, url: null });
  expect(cal.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
  expect(cal.endsWith("END:VCALENDAR\r\n")).toBe(true);
});
