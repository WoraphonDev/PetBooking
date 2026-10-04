import { GroomRemoveSurchargeParams, GroomRemoveSurchargeResponse } from "@app/contracts/endpoints/groom.removeSurcharge";
import { appointmentSurcharge, bill, billLine, booking, groomAppointment, groomStation, pet, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { groomRemoveSurcharge } from "../../../src/services/groom/removeSurcharge.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("groom.removeSurcharge", { params: GroomRemoveSurchargeParams }, groomRemoveSurcharge);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => {
  storage = createFakeStorage();
  setStorage(storage);
  resetRateLimits();
});

let seq = 0;
/** an appointment (own groomer + station) of a confirmed booking, optionally with a bill */
async function seedAppt(
  opts: { status?: typeof groomAppointment.$inferInsert.status; bill?: "open" | "paid"; startsAt?: Date; petId?: string } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const petId =
    opts.petId ??
    (
      await env.db
        .insert(pet)
        .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
        .returning()
    )[0]?.id ??
    "";
  const [b] = opts.bill
    ? await env.db
        .insert(bill)
        .values({
          ...tenant,
          customerId: org.customerId,
          openedBy: org.staff.owner,
          status: opts.bill,
          subtotalSatang: 40_000,
          totalSatang: 40_000,
          paidSatang: opts.bill === "paid" ? 40_000 : 0,
        })
        .returning()
    : [];
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      billId: b?.id ?? null,
      customerNote: "กลัวไดร์",
    })
    .returning();
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
  const startsAt = opts.startsAt ?? new Date(Date.UTC(2026, 10, 1, 3) + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId,
      groomerId: g?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
      status: opts.status ?? "checked_in",
    })
    .returning();
  return { id: a?.id ?? "", billId: b?.id ?? "", petId };
}
async function call(
  url: string,
  method: string,
  params: Record<string, string>,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const billRow = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];
const remove = (id: string, role?: "owner" | "front_desk" | "staff") =>
  call(`/appointment-surcharges/${id}`, "DELETE", { surchargeId: id }, undefined, role);
async function withSurcharge(opts: Parameters<typeof seedAppt>[0] = {}, org: SeedOrg = env.base) {
  const a = await seedAppt(opts, org);
  const [s] = await env.db
    .insert(appointmentSurcharge)
    .values({
      organizationId: org.orgId,
      appointmentId: a.id,
      name: "ขนพันกัน",
      amountSatang: 15_000,
      reason: "ขนพัน",
      createdBy: org.staff.owner,
    })
    .returning();
  await env.db.update(groomAppointment).set({ surchargeTotalSatang: 15_000 }).where(eq(groomAppointment.id, a.id));
  if (a.billId) {
    await env.db.insert(billLine).values({
      organizationId: org.orgId,
      billId: a.billId,
      lineType: "surcharge",
      refType: "appointment_surcharge",
      refId: s?.id,
      description: "ขนพันกัน",
      unitPriceSatang: 15_000,
      lineTotalSatang: 15_000,
    });
    if (opts.bill === "open") await env.db.update(bill).set({ subtotalSatang: 15_000, totalSatang: 15_000 }).where(eq(bill.id, a.billId));
  }
  return { ...a, surchargeId: s?.id ?? "" };
}

it("removes the surcharge, its open bill line and lowers both totals", async () => {
  const a = await withSurcharge({ bill: "open" });
  const res = await remove(a.surchargeId);
  expect(res.status).toBe(200);
  expect(GroomRemoveSurchargeResponse.parse(await res.json())).toMatchObject({ surchargeTotalSatang: 0, surcharges: [] });
  expect(await env.db.select().from(appointmentSurcharge).where(eq(appointmentSurcharge.id, a.surchargeId))).toEqual([]);
  expect(await env.db.select().from(billLine).where(eq(billLine.refId, a.surchargeId))).toEqual([]);
  expect(await billRow(a.billId)).toMatchObject({ subtotalSatang: 0, totalSatang: 0 });
});

it("a paid bill → BILL_NOT_OPEN and nothing is removed", async () => {
  const a = await withSurcharge({ bill: "paid" });
  expect(await codeOf(await remove(a.surchargeId))).toBe("BILL_NOT_OPEN");
  expect(await env.db.select().from(appointmentSurcharge).where(eq(appointmentSurcharge.id, a.surchargeId))).toHaveLength(1);
});

it("malformed id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await remove("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await remove((await withSurcharge()).surchargeId, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await remove((await withSurcharge({}, other)).surchargeId))).toBe("NOT_FOUND");
});
