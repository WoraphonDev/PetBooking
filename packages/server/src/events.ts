import { booking, bookingEvent } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "./context.ts";
import type { Tx } from "./db.ts";
import { AppError } from "./errors.ts";
import { tenantDb } from "./repo/tenant.ts";

export type BookingEventEntry = {
  bookingId: string;
  entityType: "booking" | "groom_appointment" | "stay" | "daycare_visit" | "deposit";
  entityId: string;
  from: string | null;
  to: string;
  reason?: string | null;
};
export async function writeBookingEvent(tx: Tx, ctx: RequestContext, entry: BookingEventEntry): Promise<void> {
  const db = tenantDb(ctx, tx);
  if (!(await db.select(booking, eq(booking.id, entry.bookingId)))[0]) throw new AppError("NOT_FOUND");
  await db.insert(bookingEvent, {
    bookingId: entry.bookingId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    fromStatus: entry.from,
    toStatus: entry.to,
    reason: entry.reason ?? null,
    actorType: ctx.actor.type === "admin" ? "platform_admin" : ctx.actor.type,
    actorId: ctx.actor.id,
    createdAt: ctx.now,
  });
}
