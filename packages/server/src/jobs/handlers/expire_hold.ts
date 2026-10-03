import { booking, branch, daycareVisit, groomAppointment, stay } from "@app/db/schema";
import * as daycareState from "@app/domain/state/daycare_visit";
import * as groomState from "@app/domain/state/groom_appointment";
import * as stayState from "@app/domain/state/stay";
import { eq } from "drizzle-orm";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import type { JobHandler } from "../runner.ts";

const children = [
  { table: groomAppointment, machine: "groom_appointment", canTransition: groomState.canTransition },
  { table: stay, machine: "stay", canTransition: stayState.canTransition },
  { table: daycareVisit, machine: "daycare_visit", canTransition: daycareState.canTransition },
] as const;

/** 07 §2 expire_hold: an unpaid hold past hold_expires_at → booking expired, children cancelled, customer.hold_expired. */
export const handler: JobHandler = async (tx, ctx, job) => {
  const { bookingId } = job.payload as { bookingId: string };
  const db = tenantDb(ctx, tx);
  const [bk] = (await db.select(booking, eq(booking.id, bookingId)).for("update")) as (typeof booking.$inferSelect)[];
  // idempotent: paid, cancelled or re-held (slips.reject sets a later hold) → nothing to do
  if (bk?.status !== "awaiting_deposit" || !bk.holdExpiresAt || bk.holdExpiresAt > ctx.now) return;

  await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "expired" });
  for (const child of children) {
    const rows = (await db.select(child.table, eq(child.table.bookingId, bk.id))) as { id: string; status: string }[];
    for (const row of rows)
      if (child.canTransition(row.status as never, "cancelled"))
        await transition(tx, ctx, { table: child.table, id: row.id, machine: child.machine, to: "cancelled" });
  }

  const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new Error("expire_hold: booking branch missing");
  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: br.timezone },
    {
      key: "customer.hold_expired",
      recipient: { type: "customer", id: bk.customerId },
      // Q-0061: book again from the LIFF home (L-02), APP_BASE_URL as in Q-0040
      payload: { bookingNo: bk.bookingNo, bookAgainUrl: new URL(`/liff/${br.bookingSlug}`, process.env.APP_BASE_URL).toString() },
      dedupeKey: `hold_expired:${bk.id}`,
    },
  );
};
