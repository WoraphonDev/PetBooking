import { booking, branch, branchPolicy, daycareSessionType, daycareVisit, groomAppointment, pet, stay } from "@app/db/schema";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

type Payload = { bookingId: string; entityType: "groom_appointment" | "stay" | "daycare_visit"; entityId: string };
type Visit = { petId: string; bookingId: string; date: string; startsAt: string | null };
const DAY_MS = 86_400_000;
// Q-0063: enum-labels service_scope
const SERVICE = { groom_appointment: "กรูม", stay: "โรงแรม", daycare_visit: "Daycare" } as const;

/** 07 §2 reminder_24h: still-active visit + branch_policy.reminder_24h_enabled → customer.reminder_24h. */
export const handler: JobHandler = async (tx, ctx, job) => {
  const { bookingId, entityType, entityId } = job.payload as Payload;
  const db = tenantDb(ctx, tx);
  const [bk] = (await db.select(booking, eq(booking.id, bookingId))) as (typeof booking.$inferSelect)[];
  if (bk?.status !== "confirmed") return;
  const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  // branch_policy is keyed by the org-checked branch; a missing row means the column default (true)
  const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, bk.branchId));
  if (!br || policy?.reminder24hEnabled === false) return;
  const tz = br.timezone;

  let visit: Visit | undefined;
  if (entityType === "groom_appointment") {
    const [g] = (await db.select(groomAppointment, eq(groomAppointment.id, entityId))) as (typeof groomAppointment.$inferSelect)[];
    if (g?.status === "scheduled") {
      const startsAt = g.startsAt.toISOString();
      visit = { ...g, date: toLocalDate({ instant: startsAt, timezone: tz }), startsAt };
    }
  } else if (entityType === "stay") {
    const [s] = (await db.select(stay, eq(stay.id, entityId))) as (typeof stay.$inferSelect)[];
    if (s?.status === "reserved") {
      const time = s.expectedCheckInTime?.slice(0, 5);
      visit = { ...s, date: s.checkInDate, startsAt: time ? localToUtc({ date: s.checkInDate, time, timezone: tz }) : null };
    }
  } else {
    const [d] = (await db.select(daycareVisit, eq(daycareVisit.id, entityId))) as (typeof daycareVisit.$inferSelect)[];
    const [session] = d
      ? ((await db.select(daycareSessionType, eq(daycareSessionType.id, d.sessionTypeId))) as (typeof daycareSessionType.$inferSelect)[])
      : [];
    if (d?.status === "reserved" && session) {
      const time = session.startsAt.slice(0, 5);
      visit = { ...d, date: d.visitDate, startsAt: localToUtc({ date: d.visitDate, time, timezone: tz }) };
    }
  }
  if (!visit || visit.bookingId !== bk.id) return;
  // rescheduled since this job was set (run_at = starts_at − 24 h): the reschedule set its own job
  const due = new Date(job.runAt.getTime() + DAY_MS);
  if (
    visit.startsAt ? Date.parse(visit.startsAt) !== due.getTime() : visit.date !== toLocalDate({ instant: due.toISOString(), timezone: tz })
  )
    return;

  // pet has no organization_id: reached through the org-checked visit row
  const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, visit.petId));
  if (!p) return;
  const date = formatThaiDate({ date: visit.date });
  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: tz },
    {
      key: "customer.reminder_24h",
      recipient: { type: "customer", id: bk.customerId },
      payload: {
        petName: p.name,
        dateTime: visit.startsAt ? `${date} ${formatTime({ instant: visit.startsAt, timezone: tz })}` : date,
        service: SERVICE[entityType],
        // L-09 booking detail, APP_BASE_URL as in Q-0040
        bookingUrl: new URL(`/liff/${br.bookingSlug}/bookings/${bk.id}`, process.env.APP_BASE_URL).toString(),
      },
      dedupeKey: `reminder_24h:${entityId}`,
    },
  );
};
