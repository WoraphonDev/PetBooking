import { bill, booking, customer, groomAppointment, groomStation, pet, scheduledJob } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/recompute_reliability.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
let seq = 0;
// TEST_NOW = 2026-10-05 → the 12-month window starts 2025-10-05
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());

async function seedBooking(org: SeedOrg, values: Partial<typeof booking.$inferInsert> = {}) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: `B-${++seq}`,
      createdByType: "staff",
      policySnapshot: {},
      status: "confirmed",
      depositStatus: "not_required",
      ...values,
    })
    .returning();
  return bk?.id ?? "";
}
async function seedGroom(org: SeedOrg, bookingId: string, startsAt: Date, status: "no_show" | "picked_up") {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `p${++seq}`, species: "dog" })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ organizationId: org.orgId, branchId: org.branchId, name: `T${++seq}` })
    .returning();
  const end = new Date(startsAt.getTime() + 3_600_000);
  await env.db.insert(groomAppointment).values({
    organizationId: org.orgId,
    branchId: org.branchId,
    bookingId,
    petId: p?.id ?? "",
    groomerId: org.staff.staff,
    stationId: st?.id ?? "",
    groomerPreference: "any",
    startsAt,
    endsAt: end,
    blockedUntil: end,
    status,
  });
}
const customerOf = async (org: SeedOrg) => (await env.db.select().from(customer).where(eq(customer.id, org.customerId)))[0];

it("recounts no-shows and late cancels over the last 12 months and resets stale counts (R-09)", async () => {
  await seedGroom(env.base, await seedBooking(env.base, { status: "closed" }), new Date("2026-09-01T03:00:00Z"), "no_show");
  await seedGroom(
    env.base,
    await seedBooking(env.base, { status: "closed", createdAt: new Date("2025-09-01T00:00:00Z") }),
    new Date("2025-09-01T03:00:00Z"),
    "no_show",
  );
  await seedBooking(env.base, { status: "cancelled", cancelIsLate: true, cancelledAt: new Date("2026-08-01T00:00:00Z") });
  await seedBooking(env.base, {
    status: "cancelled",
    cancelIsLate: true,
    cancelledAt: new Date("2025-08-01T00:00:00Z"),
    createdAt: new Date("2025-07-01T00:00:00Z"),
  });
  await seedBooking(env.base, { status: "cancelled", cancelIsLate: false, cancelledAt: new Date("2026-08-02T00:00:00Z") });
  // the other shop's customer had counts long ago and nothing since
  await env.db
    .update(customer)
    .set({ noShowCount12m: 2, lateCancelCount12m: 2, reliabilityLevel: 1 })
    .where(eq(customer.id, other.customerId));

  await env.db
    .insert(scheduledJob)
    .values({
      organizationId: null,
      jobType: "recompute_reliability",
      runAt: TEST_NOW,
      payload: {},
      dedupeKey: "recompute_reliability:2026-10-05",
    });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { recompute_reliability: handler })).toEqual({ processed: 1, failed: 0 });

  expect(await customerOf(env.base)).toMatchObject({ noShowCount12m: 1, lateCancelCount12m: 1, reliabilityLevel: 2, updatedAt: TEST_NOW });
  expect(await customerOf(other)).toMatchObject({ noShowCount12m: 0, lateCancelCount12m: 0, reliabilityLevel: 3 });
});

it("raises a loyal customer to level 4 and leaves unchanged rows alone on the next run", async () => {
  await env.db.delete(groomAppointment);
  await env.db.update(booking).set({ cancelIsLate: null }).where(eq(booking.organizationId, env.base.orgId));
  for (let i = 0; i < 5; i++) {
    const [b] = await env.db
      .insert(bill)
      .values({
        organizationId: env.base.orgId,
        branchId: env.base.branchId,
        customerId: env.base.customerId,
        openedBy: env.base.staff.owner,
        status: "paid",
        closedAt: new Date(`2026-0${i + 4}-10T03:00:00Z`),
      })
      .returning();
    await seedGroom(
      env.base,
      await seedBooking(env.base, { status: "closed", billId: b?.id }),
      new Date(`2026-0${i + 4}-10T03:00:00Z`),
      "picked_up",
    );
  }
  const later = new Date(TEST_NOW.getTime() + 86_400_000);
  const ctx = makeSystemCtx(null, later);
  await withTx(ctx, (tx) => handler(tx, ctx, {} as never));
  expect(await customerOf(env.base)).toMatchObject({ noShowCount12m: 0, lateCancelCount12m: 0, reliabilityLevel: 4, updatedAt: later });
  const again = makeSystemCtx(null, new Date(later.getTime() + 86_400_000));
  await withTx(again, (tx) => handler(tx, again, {} as never));
  expect((await customerOf(env.base))?.updatedAt).toEqual(later);
});
