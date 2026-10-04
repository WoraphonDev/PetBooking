import { BookingsListQuery, BookingsListResponse } from "@app/contracts/endpoints/bookings.list";
import {
  booking,
  customer,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  ownerProfile,
  pet,
  service,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsList } from "../../../src/services/bookings/list.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bookings.list", { query: BookingsListQuery }, bookingsList);
let env: TestEnv;
let other: SeedOrg;
let svc = "";
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const [s] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  svc = s?.id ?? "";
  for (const org of [other])
    await env.db.insert(service).values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "x", category: "bath" });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

let seq = 0;
/** a booking (default awaiting approval) with one grooming appointment of its own groomer/station */
async function seedBooking(
  values: Partial<typeof booking.$inferInsert> = {},
  org: SeedOrg = env.base,
  startsAt = new Date(Date.now() + 3 * 86_400_000),
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
      bookingNo: `B6910-${String(seq).padStart(4, "0")}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "awaiting_approval",
      policySnapshot: {},
      firstServiceAt: startsAt,
      estimatedTotalSatang: 60_000,
      ...values,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const [groomer] = await env.db
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
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: groomer?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning();
  await env.db.insert(groomAppointmentItem).values({
    organizationId: org.orgId,
    appointmentId: a?.id ?? "",
    serviceId: svc,
    nameSnapshot: "อาบน้ำ",
    priceSatang: 60_000,
    durationMinutes: 60,
  });
  return { id: bk?.id ?? "", apptId: a?.id ?? "", petName: p?.name ?? "" };
}
async function call(
  path: string,
  init: { method: string; body?: unknown },
  params: Record<string, string> = {},
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bookings${path}`, {
      method: init.method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const list = async (query = "", role: "owner" | "front_desk" | "staff" = "front_desk") => call(query, { method: "GET" }, {}, role);

it("lists the branch's bookings latest service first with BookingListItem fields", async () => {
  await env.db.update(ownerProfile).set({ firstName: "มะลิ", nickname: "ลิ" }).where(eq(ownerProfile.id, env.base.ownerProfileId));
  const early = await seedBooking(
    { status: "confirmed", depositStatus: "pending", depositRequiredSatang: 18_000 },
    env.base,
    new Date("2026-11-01T03:00:00Z"),
  );
  const late = await seedBooking({}, env.base, new Date("2026-11-02T03:00:00Z"));
  await seedBooking({}, other, new Date("2026-11-03T03:00:00Z"));
  const res = await list("?from=2026-11-01&to=2026-11-02");
  expect(res.status).toBe(200);
  const body = BookingsListResponse.parse(await res.json());
  expect(body.items.map((b) => b.id)).toEqual([late.id, early.id]);
  expect(body.items[1]).toMatchObject({
    bookingNo: expect.stringMatching(/^B6910-/),
    status: "confirmed",
    channel: "line_liff",
    customerId: env.base.customerId,
    customerName: "มะลิ (ลิ)",
    firstServiceAt: "2026-11-01T03:00:00.000Z",
    modules: ["grooming"],
    petNames: [early.petName],
    estimatedTotalSatang: 60_000,
    depositStatus: "pending",
    depositRequiredSatang: 18_000,
  });
  expect(body.nextCursor).toBeNull();
});

it("filters by several statuses and by customer, and pages with a cursor", async () => {
  const day = new Date("2026-12-01T03:00:00Z");
  const a = await seedBooking({ status: "cancelled" }, env.base, day);
  const b = await seedBooking({ status: "expired" }, env.base, new Date(day.getTime() + 3_600_000));
  const page1 = BookingsListResponse.parse(
    await (await list("?from=2026-12-01&to=2026-12-01&status=cancelled&status=expired&limit=1")).json(),
  );
  expect(page1.items.map((x) => x.id)).toEqual([b.id]);
  const page2 = BookingsListResponse.parse(
    await (await list(`?from=2026-12-01&to=2026-12-01&status=cancelled&status=expired&limit=1&cursor=${page1.nextCursor}`)).json(),
  );
  expect(page2.items.map((x) => x.id)).toEqual([a.id]);
  expect(page2.nextCursor).toBeNull();
  const byCustomer = BookingsListResponse.parse(await (await list(`?customerId=${other.customerId}`)).json());
  expect(byCustomer.items).toEqual([]);
});

it.each(["?status=open", "?from=2026-13-01", "?from=2026-11-02&to=2026-11-01", "?cursor=zzz", "?customerId=x"])(
  "%s → VALIDATION_FAILED",
  async (q) => {
    expect(await codeOf(await list(q))).toBe("VALIDATION_FAILED");
  },
);

it("role staff → FORBIDDEN; another org's customer filter → empty (no leak)", async () => {
  expect(await codeOf(await list("", "staff"))).toBe("FORBIDDEN");
  const c = (await env.db.select().from(customer).where(eq(customer.id, other.customerId)))[0];
  expect(BookingsListResponse.parse(await (await list(`?customerId=${c?.id}`)).json()).items).toEqual([]);
});
