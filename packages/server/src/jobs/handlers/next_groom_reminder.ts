import { booking, branch, branchPolicy, groomAppointment, pet, petShopProfile } from "@app/db/schema";
import { nextGroomDue } from "@app/domain/aftercare/next-groom";
import { formatThaiDate } from "@app/domain/format/thai";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, inArray, notInArray } from "drizzle-orm";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

/** 07 §2 next_groom_reminder: recompute R-17 at run time; remindOn still today → customer.next_groom_reminder. */
export const handler: JobHandler = async (tx, ctx, job) => {
  const { petId } = job.payload as { petId: string; organizationId: string };
  const db = tenantDb(ctx, tx);
  const visits = (
    (await db.select(
      groomAppointment,
      and(eq(groomAppointment.petId, petId), inArray(groomAppointment.status, ["done", "picked_up"])),
    )) as (typeof groomAppointment.$inferSelect)[]
  ).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const last = visits.at(-1);
  if (!last) return;
  // pet has no organization_id: reached through this organization's appointments
  const [p] = await tx.select().from(pet).where(eq(pet.id, petId));
  const [br] = (await db.select(branch, eq(branch.id, last.branchId))) as (typeof branch.$inferSelect)[];
  const [bk] = (await db.select(booking, eq(booking.id, last.bookingId))) as (typeof booking.$inferSelect)[];
  if (!p || !br || !bk) return;
  const tz = br.timezone;
  const [profile] = (await db.select(petShopProfile, eq(petShopProfile.petId, petId))) as (typeof petShopProfile.$inferSelect)[];
  // branch_policy is keyed by the org-checked branch; a missing row means the column default
  const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
  const future = await db.select(
    groomAppointment,
    and(
      eq(groomAppointment.petId, petId),
      gt(groomAppointment.startsAt, ctx.now),
      notInArray(groomAppointment.status, ["cancelled", "no_show"]),
    ),
  );

  const due = nextGroomDue({
    visitDates: visits.map((v) => toLocalDate({ instant: v.startsAt.toISOString(), timezone: tz })),
    shopIntervalDays: profile?.groomIntervalDays ?? null,
    defaultDays: policy?.nextGroomDefaultDays ?? 28,
    hasFutureAppointment: future.length > 0,
    petStatus: p.status,
  });
  if (!due.dueDate || due.remindOn !== toLocalDate({ instant: ctx.now.toISOString(), timezone: tz })) return;

  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: tz },
    {
      key: "customer.next_groom_reminder",
      recipient: { type: "customer", id: bk.customerId },
      payload: {
        petName: p.name,
        dueDate: formatThaiDate({ date: due.dueDate }),
        // Q-0067: L-04 grooming booking, APP_BASE_URL as in Q-0040
        bookUrl: new URL(`/liff/${br.bookingSlug}/book/grooming`, process.env.APP_BASE_URL).toString(),
      },
      dedupeKey: `next_groom:${petId}:${due.dueDate}`,
    },
  );
};
