import { LineSkippedQuery, LineSkippedResponse } from "@app/contracts/endpoints/line.skipped";
import { branch, notification } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { lineSkipped } from "../../../src/services/line/skipped.ts";
import { otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreignBranch: string;
let ownIds: string[];
const GET = withStaff("line.skipped", { query: LineSkippedQuery }, lineSkipped);
beforeAll(async () => {
  env = await setupTestDb();
  const foreign = await otherOrg(env.db);
  foreignBranch = foreign.branchId;
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "second-skips" })
    .returning();
  const base = {
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    recipientType: "customer" as const,
    recipientId: env.base.customerId,
    channel: "line_push" as const,
    templateKey: "customer.ready_for_pickup",
    payload: { petName: "Mali", shopName: "Shop", bookingUrl: "https://example.test/book" },
    monthKey: "2026-10",
    status: "skipped" as const,
    skipReason: "quota_exhausted" as const,
    createdAt: TEST_NOW,
  };
  const rows = await env.db
    .insert(notification)
    .values([
      { ...base, dedupeKey: "now" },
      { ...base, dedupeKey: "edge", createdAt: new Date(TEST_NOW.getTime() - 7 * 86_400_000) },
      { ...base, dedupeKey: "old", createdAt: new Date(TEST_NOW.getTime() - 7 * 86_400_000 - 1) },
      { ...base, dedupeKey: "future", createdAt: new Date(TEST_NOW.getTime() + 1) },
      { ...base, dedupeKey: "sent", status: "sent" },
      {
        ...base,
        dedupeKey: "staff",
        channel: "web_push",
        recipientType: "staff",
        recipientId: env.base.staff.owner,
        templateKey: "staff.groom_done",
        payload: { petName: "Mali", bookingNo: "B1" },
      },
      { ...base, dedupeKey: "other-branch", branchId: second?.id },
      { ...base, dedupeKey: "foreign", organizationId: foreign.orgId, branchId: foreign.branchId, recipientId: foreign.customerId },
      { ...base, dedupeKey: "foreign-recipient", recipientId: foreign.customerId },
    ])
    .returning();
  ownIds = rows.filter((r) => ["now", "edge", "staff", "foreign-recipient"].includes(r.dedupeKey)).map((r) => r.id);
});
afterAll(async () => {
  await env.close();
});
async function cookie(role: "owner" | "front_desk" | "staff") {
  const s = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return `sid=${s.token}`;
}
it("returns exact rendered DTOs, names and the inclusive time window for only the session branch", async () => {
  const result = await lineSkipped(staffCtx(env.base, "owner"), LineSkippedQuery.parse({}));
  expect(result.map((r) => r.id).sort()).toEqual(ownIds.sort());
  expect(LineSkippedResponse.parse(result)).toEqual(result);
  expect(result[result.length - 1]?.createdAt).toBe("2026-09-28T03:00:00.000Z");
  const named = result.find((r) => r.recipientName !== null);
  expect(named?.recipientName).toBe("Owner a");
  expect(named?.text).toContain("Mali");
  expect(named?.text).not.toContain("{petName}");
  expect(named?.skipReason).toBe("quota_exhausted");
  expect(result.filter((r) => r.recipientName === null)).toHaveLength(2);
});
it("uses the explicit days value and returns an empty list when no skips fall inside", async () => {
  expect((await lineSkipped(staffCtx(env.base, "owner"), { days: 1 })).length).toBe(3);
  expect(await lineSkipped({ ...staffCtx(env.base, "owner"), now: new Date("2027-01-01T00:00:00Z") }, { days: 30 })).toEqual([]);
});
it.each(["owner", "front_desk"] as const)("allows the %s GET route", async (role) => {
  const r = await GET(
    new Request("https://petbooking.test/api/v1/staff/notifications/skipped", { headers: { cookie: await cookie(role) } }),
  );
  expect(r.status).toBe(200);
  expect(LineSkippedResponse.safeParse(await r.json()).success).toBe(true);
});
it.each(["0", "31", "1.5", "invalid"])("rejects invalid days %s through the HTTP schema", async (days) => {
  const r = await GET(
    new Request(`https://petbooking.test/api/v1/staff/notifications/skipped?days=${days}`, { headers: { cookie: await cookie("owner") } }),
  );
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
it("denies staff and unauthenticated requests and rejects foreign branch contexts", async () => {
  await expect(lineSkipped(staffCtx(env.base, "staff"), { days: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(lineSkipped({ ...staffCtx(env.base, "owner"), branchId: foreignBranch }, { days: 7 })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect((await GET(new Request("https://petbooking.test/api/v1/staff/notifications/skipped"))).status).toBe(401);
});
