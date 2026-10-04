import { GroomSetItemsParams, GroomSetItemsRequest, GroomSetItemsResponse } from "@app/contracts/endpoints/groom.setItems";
import {
  auditLog,
  booking,
  branchPolicy,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  pet,
  ratePlan,
  service,
  servicePrice,
  sizeTier,
  staffUser,
} from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomSetItems } from "../../../src/services/groom/setItems.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const PUT = withStaff("groom.setItems", { body: GroomSetItemsRequest, params: GroomSetItemsParams }, groomSetItems);
const HOUR = 3_600_000;
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const ids = { small: "", medium: "", bath: "", spa: "", nails: "", noPrice: "", shared: { groomer: "", station: "" } };

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, bufferMinutes: 10 });
  const [s, m] = await env.db
    .insert(sizeTier)
    .values([
      { ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 },
      { ...tenant, species: "dog", code: "M", labelTh: "กลาง", minWeightGrams: 10_000, maxWeightGrams: null },
    ])
    .returning();
  ids.small = s?.id ?? "";
  ids.medium = m?.id ?? "";
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [bath, spa, nails, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, nameTh: "อาบน้ำ", category: "bath" },
      { ...tenant, nameTh: "สปา", category: "bath" },
      { ...tenant, nameTh: "ตัดเล็บ", category: "nail", isAddon: true },
      { ...tenant, nameTh: "ไม่มีราคา", category: "bath" },
    ])
    .returning();
  Object.assign(ids, { bath: bath?.id, spa: spa?.id, nails: nails?.id, noPrice: noPrice?.id });
  const price = (serviceId: string, tier: string | null, priceSatang: number, durationMinutes: number) => ({
    organizationId: env.base.orgId,
    serviceId,
    ratePlanId: plan?.id ?? "",
    sizeTierId: tier,
    coatGroup: "any" as const,
    priceSatang,
    durationMinutes,
  });
  await env.db
    .insert(servicePrice)
    .values([
      price(ids.bath, ids.small, 40_000, 60),
      price(ids.bath, ids.medium, 55_000, 75),
      price(ids.spa, null, 90_000, 120),
      price(ids.nails, null, 5_000, 15),
    ]);
  // one groomer + station shared by the SLOT_TAKEN test
  const [g] = await env.db
    .insert(staffUser)
    .values({
      ...{ organizationId: env.base.orgId },
      email: "shared@a.test",
      displayName: "ช่างร่วม",
      role: "staff",
      status: "active",
      isGroomer: true,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "ร่วม" })
    .returning();
  ids.shared = { groomer: g?.id ?? "", station: st?.id ?? "" };
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a 60-minute bath (S) at startsAt; own groomer/station unless `shared` */
async function seedAppt(
  opts: { status?: typeof groomAppointment.$inferInsert.status; startsAt?: Date; shared?: boolean } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      estimatedTotalSatang: 40_000,
    })
    .returning();
  let groomerId = ids.shared.groomer;
  let stationId = ids.shared.station;
  if (!opts.shared) {
    const [st] = await env.db
      .insert(groomStation)
      .values({ ...tenant, name: `T${seq}` })
      .returning();
    const [g] = await env.db
      .insert(staffUser)
      .values({
        organizationId: org.orgId,
        email: `g${seq}@${org.orgId}.test`,
        displayName: `ช่าง ${seq}`,
        role: "staff",
        status: "active",
        isGroomer: true,
      })
      .returning();
    groomerId = g?.id ?? "";
    stationId = st?.id ?? "";
  }
  const startsAt = opts.startsAt ?? new Date(Date.UTC(2026, 10, 1, 3) + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId,
      stationId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      blockedUntil: new Date(startsAt.getTime() + HOUR + 10 * 60_000),
      status: opts.status ?? "scheduled",
      sizeTierId: org === env.base ? ids.small : null,
      servicesTotalSatang: 40_000,
    })
    .returning();
  if (org === env.base)
    await env.db.insert(groomAppointmentItem).values({
      organizationId: org.orgId,
      appointmentId: a?.id ?? "",
      serviceId: ids.bath,
      nameSnapshot: "อาบน้ำ",
      priceSatang: 40_000,
      durationMinutes: 60,
    });
  return { id: a?.id ?? "", bookingId: bk?.id ?? "", startsAt };
}
async function put(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/items`, {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const appt = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];
const itemsOf = (id: string) =>
  env.db.select().from(groomAppointmentItem).where(eq(groomAppointmentItem.appointmentId, id)).orderBy(asc(groomAppointmentItem.isAddon));

it("new size tier + add-on: fresh price snapshots, longer times, estimate moved by the difference", async () => {
  const a = await seedAppt();
  const res = await put(a.id, { serviceIds: [ids.bath], addonIds: [ids.nails], sizeTierId: ids.medium });
  expect(res.status).toBe(200);
  const card = GroomSetItemsResponse.parse(await res.json());
  expect(card).toMatchObject({ id: a.id, servicesTotalSatang: 60_000 });
  expect((await itemsOf(a.id)).map((i) => [i.serviceId, i.nameSnapshot, i.isAddon, i.priceSatang, i.durationMinutes])).toEqual([
    [ids.bath, "อาบน้ำ", false, 55_000, 75],
    [ids.nails, "ตัดเล็บ", true, 5_000, 15],
  ]);
  const saved = await appt(a.id);
  expect(saved).toMatchObject({ sizeTierId: ids.medium, servicesTotalSatang: 60_000 });
  expect(saved?.endsAt).toEqual(new Date(a.startsAt.getTime() + 90 * 60_000));
  expect(saved?.blockedUntil).toEqual(new Date(a.startsAt.getTime() + 100 * 60_000));
  expect((await env.db.select().from(booking).where(eq(booking.id, a.bookingId)))[0]?.estimatedTotalSatang).toBe(60_000);
  expect(await env.db.select().from(auditLog).where(eq(auditLog.entityId, a.id))).toEqual([]);
});

it("price override: item at the given price + audit booking.price_override with catalog → override", async () => {
  const a = await seedAppt({ status: "checked_in" });
  const res = await put(a.id, {
    serviceIds: [ids.bath],
    priceOverrides: [{ serviceId: ids.bath, priceSatang: 35_000, reason: "ลูกค้าประจำ" }],
  });
  expect(res.status).toBe(200);
  expect((await itemsOf(a.id))[0]?.priceSatang).toBe(35_000);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, a.id));
  expect(audit).toMatchObject({
    action: "booking.price_override",
    entityType: "groom_appointment",
    reason: "ลูกค้าประจำ",
    before: { priceSatang: 40_000 },
    after: { priceSatang: 35_000 },
  });
});

it("a longer job that now overlaps the groomer's next appointment → SLOT_TAKEN, nothing saved", async () => {
  const start = new Date(Date.UTC(2026, 11, 20, 3));
  const a = await seedAppt({ shared: true, startsAt: start });
  await seedAppt({ shared: true, startsAt: new Date(start.getTime() + 80 * 60_000) });
  expect(await codeOf(await put(a.id, { serviceIds: [ids.spa] }))).toBe("SLOT_TAKEN");
  expect((await itemsOf(a.id)).map((i) => i.serviceId)).toEqual([ids.bath]);
  expect((await appt(a.id))?.endsAt).toEqual(new Date(start.getTime() + HOUR));
});

it("PRICE_NOT_FOUND when a service has no price for the size", async () => {
  expect(await codeOf(await put((await seedAppt()).id, { serviceIds: [ids.noPrice] }))).toBe("PRICE_NOT_FOUND");
});

it.each(["done", "picked_up", "no_show", "cancelled"] as const)("a %s appointment → STATUS_NOT_ALLOWED (Q-0100)", async (status) => {
  expect(await codeOf(await put((await seedAppt({ status })).id, { serviceIds: [ids.bath] }))).toBe("STATUS_NOT_ALLOWED");
});

it.each([
  ["no main service", { serviceIds: [] }],
  ["add-on given as main", { serviceIds: [ids.nails] }],
  ["duplicate service", { serviceIds: [ids.bath, ids.bath] }],
  [
    "override of a service not chosen",
    { serviceIds: [ids.bath], priceOverrides: [{ serviceId: ids.spa, priceSatang: 1, reason: "ทดสอบ" }] },
  ],
  ["override without reason", { serviceIds: [ids.bath], priceOverrides: [{ serviceId: ids.bath, priceSatang: 1, reason: "" }] }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await put((await seedAppt()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's appointment → NOT_FOUND", async () => {
  expect(await codeOf(await put((await seedAppt()).id, { serviceIds: [ids.bath] }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await put((await seedAppt({}, other)).id, { serviceIds: [ids.bath] }))).toBe("NOT_FOUND");
});
