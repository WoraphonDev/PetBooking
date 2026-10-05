import { StaffUsersUpdateParams, StaffUsersUpdateRequest, StaffUsersUpdateResponse } from "@app/contracts/endpoints/staffUsers.update";
import { auditLog, booking, groomAppointment, groomStation, pet, session, staffUser } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staffUsersUpdate } from "../../../src/services/staffUsers/update.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("staffUsers.update", { body: StaffUsersUpdateRequest, params: StaffUsersUpdateParams }, staffUsersUpdate);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function call(
  method: string,
  url: string,
  params: Record<string, string>,
  body: unknown,
  role: "owner" | "front_desk" | "staff" = "owner",
  org: SeedOrg = env.base,
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const update = (id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "owner") =>
  call("PATCH", `/api/v1/staff/staff-users/${id}`, { staffUserId: id }, body, role);
let seq = 0;
async function newStaff(over: Partial<typeof staffUser.$inferInsert> = {}) {
  const [s] = await env.db
    .insert(staffUser)
    .values({
      organizationId: env.base.orgId,
      email: `u${++seq}@x.test`,
      displayName: `คน${seq}`,
      role: "staff",
      status: "active",
      ...over,
    })
    .returning();
  return s?.id ?? "";
}
const row = async (id: string) => (await env.db.select().from(staffUser).where(eq(staffUser.id, id)))[0];

it("updates profile fields (R-22 phone) and a role change is audited", async () => {
  const id = await newStaff();
  const res = await update(id, { displayName: "พี่บี", phone: "081-234-5678", isGroomer: true, sortOrder: 3, role: "front_desk" });
  expect(res.status).toBe(200);
  const item = StaffUsersUpdateResponse.parse(await res.json());
  expect(item).toMatchObject({ displayName: "พี่บี", phone: "+66812345678", isGroomer: true, sortOrder: 3, role: "front_desk" });
  expect(item).not.toHaveProperty("warnings");
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, "staff.role_change"), eq(auditLog.entityId, id)));
  expect(audit).toMatchObject({ before: { role: "staff" }, after: { role: "front_desk" } });
});

it("disabling signs the person out and warns about a groomer's future appointments (kept)", async () => {
  const id = await newStaff({ isGroomer: true });
  await createSession(
    env.db,
    { subjectType: "staff", subjectId: id, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      bookingNo: "B-S1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "S1" })
    .returning();
  const startsAt = new Date(Date.now() + 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: id,
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning();
  const item = StaffUsersUpdateResponse.parse(await (await update(id, { status: "disabled" })).json());
  expect(item.status).toBe("disabled");
  expect(item.warnings).toEqual([
    { code: "GROOMER_HAS_FUTURE_APPOINTMENTS", message: "ช่างยังมีนัดที่ค้างอยู่ 1 นัด", data: { appointmentIds: [a?.id] } },
  ]);
  expect(await env.db.select().from(session).where(eq(session.subjectId, id))).toEqual([]);
  expect(
    (
      await env.db
        .select()
        .from(groomAppointment)
        .where(eq(groomAppointment.id, a?.id ?? ""))
    )[0]?.status,
  ).toBe("scheduled");
  expect(
    (
      await env.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, "staff.disable"), eq(auditLog.entityId, id)))
    ).length,
  ).toBe(1);
  // and back to active
  expect(StaffUsersUpdateResponse.parse(await (await update(id, { status: "active" })).json()).status).toBe("active");
});

it("the last active owner cannot be demoted or disabled (LAST_OWNER); with a second owner it can", async () => {
  expect(await codeOf(await update(env.base.staff.owner, { role: "staff" }))).toBe("LAST_OWNER");
  expect(await codeOf(await update(env.base.staff.owner, { status: "disabled" }))).toBe("LAST_OWNER");
  const second = await newStaff({ role: "owner" });
  expect((await update(second, { status: "disabled" })).status).toBe(200);
  expect((await row(env.base.staff.owner))?.role).toBe("owner");
});

it("an invited person cannot be switched to active here; a photo waits for its file kind (Q-0116)", async () => {
  const invited = await newStaff({ status: "invited" });
  expect(await codeOf(await update(invited, { status: "active" }))).toBe("STATUS_NOT_ALLOWED");
  expect(await codeOf(await update(invited, { photoFileId: "00000000-0000-4000-8000-000000000001" }))).toBe("VALIDATION_FAILED");
});

it.each([
  ["status invited", { status: "invited" }],
  ["unknown field", { email: "x@y.test" }],
  ["empty name", { displayName: "" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await update(await newStaff(), body))).toBe("VALIDATION_FAILED");
});

it("a bad phone → INVALID_PHONE; front_desk → FORBIDDEN; another org's staff → NOT_FOUND", async () => {
  expect(await codeOf(await update(await newStaff(), { phone: "123" }))).toBe("INVALID_PHONE");
  expect(await codeOf(await update(await newStaff(), { displayName: "x" }, "front_desk"))).toBe("FORBIDDEN");
  expect(await codeOf(await update(other.staff.staff, { displayName: "x" }))).toBe("NOT_FOUND");
});
