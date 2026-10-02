import { AdminAnalyticsQuery, AdminAnalyticsResponse } from "@app/contracts/endpoints/admin.analytics";
import {
  bill,
  booking,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  notification,
  pet,
  platformAdmin,
  reportCard,
  roomType,
  roomUnit,
  stay,
} from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withAdmin } from "../../../src/http.ts";
import { adminAnalytics } from "../../../src/services/admin/analytics.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let second: SeedOrg;
const GET = withAdmin("admin.analytics", { query: AdminAnalyticsQuery }, adminAnalytics);
const at = (day: string, hour = "03") => new Date(`2026-10-${day}T${hour}:00:00Z`);
const range = { from: "2026-10-01", to: "2026-10-07" };
beforeAll(async () => {
  env = await setupTestDb();
  second = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [subject] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mali", species: "dog" })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "Table" })
    .returning();
  const bookings = await env.db
    .insert(booking)
    .values(
      (
        [
          ["A1", "line_liff", "customer", at("01")],
          ["A2", "phone", "staff", at("07")],
          ["A3", "booking_link", "customer", new Date("2026-09-30T17:00:00Z")],
          ["A4", "chat", "staff", new Date("2026-10-07T17:00:00Z")],
        ] as const
      ).map(([bookingNo, channel, createdByType, createdAt]) => ({
        ...tenant,
        customerId: org.customerId,
        bookingNo,
        channel,
        createdByType,
        status: "confirmed" as const,
        policySnapshot: {},
        createdAt,
      })),
    )
    .returning();
  const base = { ...tenant, bookingId: bookings[0]?.id ?? "", petId: subject?.id ?? "" };
  await env.db.insert(groomAppointment).values(
    (
      [
        ["02", "03", "no_show"],
        ["03", "03", "done"],
        ["07", "16", "scheduled"],
        ["04", "03", "cancelled"],
      ] as const
    ).map(([day, hour, status]) => ({
      ...base,
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any" as const,
      startsAt: at(day, hour),
      endsAt: new Date(at(day, hour).getTime() + 3600000),
      blockedUntil: new Date(at(day, hour).getTime() + 3600000),
      status,
    })),
  );
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "R1" })
    .returning();
  await env.db.insert(stay).values({
    ...base,
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-10-04",
    checkOutDate: "2026-10-05",
    expectedCheckInTime: "09:00",
    nights: 1,
    nightlyPriceSatang: 0,
    roomTotalSatang: 0,
    status: "no_show",
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "Day", startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...base, sessionTypeId: session?.id ?? "", visitDate: "2026-10-05", priceSatang: 0, status: "checked_out" });
  await env.db.insert(bill).values([
    { ...tenant, openedBy: org.staff.owner, createdAt: at("05"), status: "paid", closedAt: at("06") },
    { ...tenant, openedBy: org.staff.owner, createdAt: at("05"), status: "void", closedAt: at("06") },
  ]);
  await env.db.insert(reportCard).values({
    ...tenant,
    kind: "grooming",
    petId: subject?.id ?? "",
    customerId: org.customerId,
    appointmentId: (await env.db.select().from(groomAppointment))[0]?.id,
    createdBy: org.staff.staff,
    status: "sent",
    sentAt: at("06"),
  });
  await env.db.insert(notification).values([
    {
      ...tenant,
      recipientType: "customer",
      recipientId: org.customerId,
      channel: "line_push",
      templateKey: "customer.booking_confirmed",
      payload: {},
      dedupeKey: "analytics-push",
      monthKey: "2026-10",
      status: "sent",
      sentAt: at("06"),
    },
    {
      ...tenant,
      recipientType: "customer",
      recipientId: org.customerId,
      channel: "line_reply",
      templateKey: "customer.booking_confirmed",
      payload: {},
      dedupeKey: "analytics-reply",
      monthKey: "2026-10",
      status: "sent",
      sentAt: at("06"),
    },
  ]);
});
afterAll(async () => {
  await env.close();
});
const ctx = () => ({ ...staffCtx(env.base, "owner"), now: at("07", "12") });
it("calculates approved whole percentages, due-item no-shows and all seven channels per organization", async () => {
  const result = await adminAnalytics(ctx(), range);
  expect(AdminAnalyticsResponse.parse(result)).toEqual(result);
  expect(result.orgs.find((o) => o.orgId === env.base.orgId)).toEqual({
    orgId: env.base.orgId,
    activeDays7: 3,
    bookingsByChannel: { walk_in: 0, phone: 1, chat: 0, line_liff: 1, booking_link: 1, ota: 0, import: 0 },
    onlineShare: 67,
    noShowRate: 50,
    pushUsed: 1,
    reportCardsSent: 1,
    billsClosed: 1,
  });
  expect(result.orgs.find((o) => o.orgId === second.orgId)).toMatchObject({
    activeDays7: 0,
    onlineShare: 0,
    noShowRate: 0,
    pushUsed: 0,
    billsClosed: 0,
  });
});
it("anchors activity to seven days ending on to independently of from", async () => {
  const result = await adminAnalytics(ctx(), { from: "2026-10-07", to: "2026-10-07" });
  expect(result.orgs.find((o) => o.orgId === env.base.orgId)).toMatchObject({
    activeDays7: 3,
    onlineShare: 0,
    noShowRate: 0,
    billsClosed: 0,
  });
});
async function adminCookie() {
  const [a] = await env.db
    .insert(platformAdmin)
    .values({ email: `${crypto.randomUUID()}@example.test`, displayName: "Admin", passwordHash: "unused" })
    .returning();
  const s = await createSession(env.db, { subjectType: "platform_admin", subjectId: a?.id ?? "" }, new Date());
  return `aid=${s.token}`;
}
it("serves platform admins and denies absent or staff-only sessions", async () => {
  const url = "https://petbooking.test/api/v1/admin/analytics/pilot?from=2026-10-01&to=2026-10-07";
  const response = await GET(new Request(url, { headers: { cookie: await adminCookie() } }));
  expect(response.status).toBe(200);
  expect(AdminAnalyticsResponse.safeParse(await response.json()).success).toBe(true);
  expect((await GET(new Request(url))).status).toBe(401);
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  expect((await GET(new Request(url, { headers: { cookie: `sid=${staff.token}` } }))).status).toBe(401);
});
it.each(["", "?from=2026-02-30&to=2026-10-07", "?from=2026-10-08&to=2026-10-07"])("rejects invalid range %s", async (query) => {
  const r = await GET(
    new Request(`https://petbooking.test/api/v1/admin/analytics/pilot${query}`, { headers: { cookie: await adminCookie() } }),
  );
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
