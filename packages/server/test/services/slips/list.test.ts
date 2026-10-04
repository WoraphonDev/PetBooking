import { SlipsListQuery, SlipsListResponse } from "@app/contracts/endpoints/slips.list";
import { booking, fileObject, groomAppointment, groomStation, ownerProfile, paymentSlip, pet, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { slipsList } from "../../../src/services/slips/list.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("slips.list", { query: SlipsListQuery }, slipsList);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  setStorage(createFakeStorage());
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

let seq = 0;
/** a booking in deposit_review with one appointment and a submitted slip (+ earlier rejected ones) */
async function seedSlip(
  opts: { bookingStatus?: typeof booking.$inferInsert.status; rejectedBefore?: number } = {},
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
      bookingNo: `B6910-${String(seq).padStart(4, "0")}`,
      channel: "line_liff",
      createdByType: "customer",
      status: opts.bookingStatus ?? "deposit_review",
      depositStatus: "submitted",
      depositRequiredSatang: 30_000,
      policySnapshot: {},
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
  const startsAt = new Date(Date.now() + 72 * 3_600_000 + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: g?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning();
  const slip = async (status: "submitted" | "rejected") => {
    const key = `org/${org.orgId}/slip/2026/10/s${++seq}.jpg`;
    const [f] = await env.db
      .insert(fileObject)
      .values({
        organizationId: org.orgId,
        kind: "slip",
        storageKey: key,
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "customer",
        committedAt: new Date(),
      })
      .returning();
    const [s] = await env.db
      .insert(paymentSlip)
      .values({
        ...tenant,
        bookingId: bk?.id,
        fileId: f?.id ?? "",
        uploadedByType: "customer",
        amountExpectedSatang: 30_000,
        transRef: `TX${seq}`,
        status,
        createdAt: new Date(Date.now() - 1_000 + seq),
      })
      .returning();
    return { id: s?.id ?? "", key };
  };
  for (let i = 0; i < (opts.rejectedBefore ?? 0); i++) await slip("rejected");
  const s = await slip("submitted");
  return { bookingId: bk?.id ?? "", apptId: a?.id ?? "", slipId: s.id, key: s.key, bookingNo: bk?.bookingNo ?? "" };
}
async function call(
  path: string,
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
    new Request(`https://petbooking.test/api/v1/staff/slips${path}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const list = (q = "", role?: "owner" | "front_desk" | "staff") => call(q, "GET", {}, undefined, role);

it("lists submitted slips of the branch, oldest first, as SlipItem", async () => {
  await env.db.update(ownerProfile).set({ firstName: "มะลิ" }).where(eq(ownerProfile.id, env.base.ownerProfileId));
  const a = await seedSlip();
  const b = await seedSlip({ rejectedBefore: 1 });
  await seedSlip({}, other);
  const res = await list();
  expect(res.status).toBe(200);
  const body = SlipsListResponse.parse(await res.json());
  expect(body.map((s) => s.id)).toEqual([a.slipId, b.slipId]);
  expect(body[0]).toMatchObject({
    bookingId: a.bookingId,
    bookingNo: a.bookingNo,
    billId: null,
    customerName: "มะลิ",
    imageUrl: `https://storage.test/${a.key}?op=get&expires=3600`,
    amountExpectedSatang: 30_000,
    isDuplicate: false,
    status: "submitted",
    reviewedAt: null,
    rejectReason: null,
  });
});

it("status filter returns rejected ones", async () => {
  const c = await seedSlip({ rejectedBefore: 1 });
  const body = SlipsListResponse.parse(await (await list("?status=rejected")).json());
  expect(body.every((s) => s.status === "rejected")).toBe(true);
  expect(body.some((s) => s.bookingId === c.bookingId)).toBe(true);
});

it("unknown status → VALIDATION_FAILED; role staff → FORBIDDEN", async () => {
  expect(await codeOf(await list("?status=pending"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await list("", "staff"))).toBe("FORBIDDEN");
});
