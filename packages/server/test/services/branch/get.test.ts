import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { branch, branchHours, branchPolicy } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { branchGet } from "../../../src/services/branch/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  await env.db
    .insert(branchPolicy)
    .values({ branchId: env.base.branchId, defaultDepositType: "fixed", defaultDepositValue: 10000, economyMode: true });
  await env.db.insert(branchHours).values(
    Array.from({ length: 7 }, (_, weekday) => ({
      branchId: env.base.branchId,
      weekday,
      isClosed: weekday === 0,
      opensAt: weekday === 0 ? null : "09:00",
      closesAt: weekday === 0 ? null : "18:00",
    })),
  );
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "0812345678", promptpayAccountName: "Private" })
    .where(eq(branch.id, env.base.branchId));
});
afterAll(async () => {
  await env.close();
});
it.each(["owner", "front_desk", "staff"] as const)("%s reads branch and complete policy/hours", async (role) => {
  const result = BranchGetResponse.parse(await branchGet(staffCtx(env.base, role), {}));
  expect(result).toMatchObject({
    id: env.base.branchId,
    name: "Shop a",
    bookingSlug: "shop-a",
    phone: null,
    logoUrl: null,
    modules: { grooming: true, hotel: false, daycare: false },
    policy: { defaultDepositType: "fixed", defaultDepositValue: 10000, economyMode: true, dailySummaryTime: "20:00" },
  });
  expect(result.hours).toEqual(
    Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      isClosed: weekday === 0,
      opensAt: weekday === 0 ? null : "09:00",
      closesAt: weekday === 0 ? null : "18:00",
    })),
  );
  expect(result.promptpay).toEqual({ type: "phone", idMasked: "*******678", accountName: "Private" });
  expect(result).not.toHaveProperty("organizationId");
});
it("hides another organization's branch", async () => {
  await expect(branchGet({ ...staffCtx(env.base, "owner"), branchId: foreign.branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("masks a national ID and returns nulls for an unconfigured account", async () => {
  await env.db
    .update(branch)
    .set({ promptpayType: "national_id", promptpayId: "1234567890123", promptpayAccountName: "Account" })
    .where(eq(branch.id, env.base.branchId));
  expect((await branchGet(staffCtx(env.base, "owner"), {})).promptpay).toEqual({
    type: "national_id",
    idMasked: "**********123",
    accountName: "Account",
  });
  await env.db
    .update(branch)
    .set({ promptpayType: null, promptpayId: null, promptpayAccountName: null })
    .where(eq(branch.id, env.base.branchId));
  expect((await branchGet(staffCtx(env.base, "owner"), {})).promptpay).toEqual({ type: null, idMasked: null, accountName: null });
});
