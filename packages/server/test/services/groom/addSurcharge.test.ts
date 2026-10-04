import { GroomAddSurchargeParams, GroomAddSurchargeRequest, GroomAddSurchargeResponse } from "@app/contracts/endpoints/groom.addSurcharge";
import {
  appointmentSurcharge,
  bill,
  billLine,
  booking,
  groomAppointment,
  groomStation,
  pet,
  staffUser,
  surchargeType,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { groomAddSurcharge } from "../../../src/services/groom/addSurcharge.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("groom.addSurcharge", { body: GroomAddSurchargeRequest, params: GroomAddSurchargeParams }, groomAddSurcharge);
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
const appt = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];
const billRow = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];
const add = (id: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call(`/groom-appointments/${id}/surcharges`, "POST", { appointmentId: id }, body, role);
const matted = { name: "ขนพันกัน", amountSatang: 15_000, reason: "ขนพันทั้งตัว" };

it("adds a surcharge: row, appointment total, open bill line + totals", async () => {
  const a = await seedAppt({ bill: "open" });
  const [type] = await env.db
    .insert(surchargeType)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, nameTh: "ขนพันกัน", defaultAmountSatang: 15_000 })
    .returning();
  const res = await add(a.id, { ...matted, surchargeTypeId: type?.id });
  expect(res.status).toBe(200);
  const card = GroomAddSurchargeResponse.parse(await res.json());
  expect(card).toMatchObject({ surchargeTotalSatang: 15_000, surcharges: [{ name: "ขนพันกัน", amountSatang: 15_000, reason: "ขนพันทั้งตัว" }] });
  const [s] = await env.db.select().from(appointmentSurcharge).where(eq(appointmentSurcharge.appointmentId, a.id));
  expect(s).toMatchObject({ surchargeTypeId: type?.id, createdBy: env.base.staff.front_desk });
  expect((await appt(a.id))?.surchargeTotalSatang).toBe(15_000);
  const [line] = await env.db
    .select()
    .from(billLine)
    .where(eq(billLine.refId, s?.id ?? ""));
  expect(line).toMatchObject({
    billId: a.billId,
    lineType: "surcharge",
    refType: "appointment_surcharge",
    description: "ขนพันกัน",
    unitPriceSatang: 15_000,
    lineTotalSatang: 15_000,
    petId: a.petId,
  });
  expect(await billRow(a.billId)).toMatchObject({ subtotalSatang: 15_000, totalSatang: 15_000 });
});

it("without a bill only the appointment changes", async () => {
  const a = await seedAppt();
  expect((await add(a.id, matted)).status).toBe(200);
  expect((await appt(a.id))?.surchargeTotalSatang).toBe(15_000);
});

it("a paid bill → BILL_NOT_OPEN; a cancelled appointment → STATUS_NOT_ALLOWED", async () => {
  expect(await codeOf(await add((await seedAppt({ bill: "paid" })).id, matted))).toBe("BILL_NOT_OPEN");
  expect(await codeOf(await add((await seedAppt({ status: "cancelled" })).id, matted))).toBe("STATUS_NOT_ALLOWED");
});

it.each([
  ["empty name", { ...matted, name: "" }],
  ["amount 0", { ...matted, amountSatang: 0 }],
  ["reason too short", { ...matted, reason: "ab" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await add((await seedAppt()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's appointment or surcharge type → NOT_FOUND", async () => {
  expect(await codeOf(await add((await seedAppt()).id, matted, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await add((await seedAppt({}, other)).id, matted))).toBe("NOT_FOUND");
  const [foreign] = await env.db
    .insert(surchargeType)
    .values({ organizationId: other.orgId, branchId: other.branchId, nameTh: "x" })
    .returning();
  expect(await codeOf(await add((await seedAppt()).id, { ...matted, surchargeTypeId: foreign?.id }))).toBe("NOT_FOUND");
});
