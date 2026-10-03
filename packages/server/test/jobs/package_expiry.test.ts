import { bill, customerPackage, packageTemplate, scheduledJob, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/package_expiry.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());

const at = (ms: number) => new Date(TEST_NOW.getTime() + ms);
async function seedPackages(org: SeedOrg, rows: Partial<typeof customerPackage.$inferInsert>[]) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: svc?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [b] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner })
    .returning();
  return env.db
    .insert(customerPackage)
    .values(
      rows.map((extra) => ({
        organizationId: org.orgId,
        customerId: org.customerId,
        templateId: tpl?.id ?? "",
        sessionsTotal: 5,
        unitValueSatang: 40_000,
        purchasedBillId: b?.id ?? "",
        expiresAt: at(-1),
        ...extra,
      })),
    )
    .returning();
}
const statusOf = async (id: string) => (await env.db.select().from(customerPackage).where(eq(customerPackage.id, id)))[0]?.status;

it("expires every organization's active packages past expires_at and leaves the rest", async () => {
  const [expired, boundary, future, exhausted, voided] = await seedPackages(env.base, [
    {},
    { expiresAt: TEST_NOW },
    { expiresAt: at(60_000) },
    { status: "exhausted", sessionsUsed: 5 },
    { status: "void" },
  ]);
  const [foreign] = await seedPackages(other, [{}]);
  await env.db
    .insert(scheduledJob)
    .values({ organizationId: null, jobType: "package_expiry", runAt: TEST_NOW, payload: {}, dedupeKey: "package_expiry:2026-10-05" });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { package_expiry: handler })).toEqual({ processed: 1, failed: 0 });

  expect(await statusOf(expired?.id ?? "")).toBe("expired");
  expect(await statusOf(foreign?.id ?? "")).toBe("expired");
  // 03 guard: now > expires_at — a package expiring exactly now is still usable
  expect(await statusOf(boundary?.id ?? "")).toBe("active");
  expect(await statusOf(future?.id ?? "")).toBe("active");
  expect(await statusOf(exhausted?.id ?? "")).toBe("exhausted");
  expect(await statusOf(voided?.id ?? "")).toBe("void");
  expect(
    (
      await env.db
        .select()
        .from(customerPackage)
        .where(eq(customerPackage.id, expired?.id ?? ""))
    )[0]?.updatedAt,
  ).toEqual(TEST_NOW);

  // a second run (retry) changes nothing
  const ctx = makeSystemCtx(null, TEST_NOW);
  await withTx(ctx, (tx) => handler(tx, ctx, {} as never));
  expect(await statusOf(boundary?.id ?? "")).toBe("active");
  expect(await statusOf(expired?.id ?? "")).toBe("expired");
});
