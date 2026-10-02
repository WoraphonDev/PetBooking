import { SizeTiersListRequest, SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { branch, sizeTier } from "@app/db/schema";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { sizeTiersList } from "../../../src/services/sizeTiers/list.ts";
import { otherOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("sizeTiers.list", { query: SizeTiersListRequest }, sizeTiersList);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => {
  await env.close();
});

const tier = (
  organizationId: string,
  branchId: string,
  species: "dog" | "cat",
  code: string,
  min: number,
  max: number | null,
  sortOrder: number,
) => ({
  organizationId,
  branchId,
  species,
  code,
  labelTh: `${species}-${code}`,
  minWeightGrams: min,
  maxWeightGrams: max,
  sortOrder,
});
async function token(role: "owner" | "front_desk" | "staff", base = env.base) {
  return (
    await createSession(
      env.db,
      { subjectType: "staff", subjectId: base.staff[role], organizationId: base.orgId, branchId: base.branchId },
      new Date(),
    )
  ).token;
}
const request = (sid: string, qs = "") =>
  GET(new Request(`https://petbooking.test/api/v1/staff/size-tiers${qs}`, { headers: { cookie: `sid=${sid}` } }));

it.each(["owner", "front_desk", "staff"] as const)(
  "lists this branch's tiers (species enum order dog → cat, then sort_order) with every SizeTierItem field for %s",
  async (role) => {
    const { orgId, branchId } = env.base;
    const [l, s, c] = await env.db
      .insert(sizeTier)
      .values([
        tier(orgId, branchId, "dog", "L", 12000, null, 2),
        tier(orgId, branchId, "dog", "S", 0, 12000, 1),
        tier(orgId, branchId, "cat", "S", 0, 5000, 1),
      ])
      .returning();
    const response = await request(await token(role));
    expect(response.status).toBe(200);
    const body = SizeTiersListResponse.parse(await response.json());
    expect(body).toEqual([
      { id: s?.id, species: "dog", code: "S", labelTh: "dog-S", minWeightGrams: 0, maxWeightGrams: 12000, sortOrder: 1 },
      { id: l?.id, species: "dog", code: "L", labelTh: "dog-L", minWeightGrams: 12000, maxWeightGrams: null, sortOrder: 2 },
      { id: c?.id, species: "cat", code: "S", labelTh: "cat-S", minWeightGrams: 0, maxWeightGrams: 5000, sortOrder: 1 },
    ]);
  },
);

it("never returns another organization's or another branch's tiers", async () => {
  const other = await otherOrg(env.db);
  await env.db.insert(sizeTier).values(tier(other.orgId, other.branchId, "dog", "M", 0, null, 1));
  const [secondBranch] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "shop-a-2" })
    .returning();
  await env.db.insert(sizeTier).values(tier(env.base.orgId, secondBranch?.id ?? "", "dog", "M", 0, null, 1));
  const response = await request(await token("owner"));
  expect(SizeTiersListResponse.parse(await response.json())).toEqual([]);
  const otherBody = SizeTiersListResponse.parse(await (await request(await token("owner", other))).json());
  expect(otherBody.map((t) => t.code)).toEqual(["M"]);
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await request(await token("owner"), "?branchId=x");
  expect(response.status).toBe(422);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});

it("requires a staff session", async () => {
  expect((await request("missing")).status).toBe(401);
});
