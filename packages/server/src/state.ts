import * as bill from "@app/domain/state/bill";
import * as booking from "@app/domain/state/booking";
import * as care_task from "@app/domain/state/care_task";
import * as customer_link_request from "@app/domain/state/customer_link_request";
import * as customer_package from "@app/domain/state/customer_package";
import * as daycare_visit from "@app/domain/state/daycare_visit";
import * as deposit from "@app/domain/state/deposit";
import * as groom_appointment from "@app/domain/state/groom_appointment";
import * as line_channel from "@app/domain/state/line_channel";
import * as notification from "@app/domain/state/notification";
import * as payment_slip from "@app/domain/state/payment_slip";
import * as pet_vaccination from "@app/domain/state/pet_vaccination";
import * as report_card from "@app/domain/state/report_card";
import * as scheduled_job from "@app/domain/state/scheduled_job";
import * as staff_user from "@app/domain/state/staff_user";
import * as stay from "@app/domain/state/stay";
import { and, eq, getTableColumns, getTableName, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { RequestContext } from "./context.ts";
import type { Tx } from "./db.ts";
import { AppError } from "./errors.ts";
import { type BookingEventEntry, writeBookingEvent } from "./events.ts";
import { type TenantTable, tenantDb } from "./repo/tenant.ts";

const machines = {
  booking,
  deposit,
  groom_appointment,
  stay,
  daycare_visit,
  bill,
  payment_slip,
  report_card,
  customer_link_request,
  pet_vaccination,
  care_task,
  customer_package,
  staff_user,
  scheduled_job,
  notification,
  line_channel,
};
type Machine = keyof typeof machines;
type Table = TenantTable & { id: PgColumn };
type Input<T extends Table> = {
  table: T;
  id: string;
  machine: Machine;
  to: string;
  extraSet?: Partial<Omit<T["$inferInsert"], "id" | "organizationId" | "status" | "depositStatus">>;
  reason?: string | null;
};

export async function transition<T extends Table>(tx: Tx, ctx: RequestContext, input: Input<T>) {
  const table = input.table;
  if (getTableName(table) !== (input.machine === "deposit" ? "booking" : input.machine)) throw new Error("State machine/table mismatch");
  const db = tenantDb(ctx, tx);
  const [current] = await db.select(table, eq(table.id, input.id)).for("update");
  if (!current) throw new AppError("NOT_FOUND");
  const row = current as Record<string, unknown>;
  const key = input.machine === "deposit" ? "depositStatus" : "status";
  const columns = getTableColumns(table);
  const column = columns[key];
  if (!column) throw new Error("State machine/status column mismatch");
  const machine = machines[input.machine];
  const from = machine.STATES.filter((state) => machine.canTransition(state, input.to));
  if (!from.length) throw new AppError("INVALID_TRANSITION");
  const set = { ...input.extraSet, [key]: input.to, ...("updatedAt" in table ? { updatedAt: ctx.now } : {}) } as Partial<
    Omit<T["$inferInsert"], "organizationId">
  >;
  const [updated] = (await db.update(table, set, and(eq(table.id, input.id), inArray(column, from)))) as T["$inferSelect"][];
  if (!updated) throw new AppError("INVALID_TRANSITION");
  if (["booking", "deposit", "groom_appointment", "stay", "daycare_visit"].includes(input.machine)) {
    await writeBookingEvent(tx, ctx, {
      bookingId: input.machine === "booking" || input.machine === "deposit" ? input.id : (row.bookingId as string),
      entityType: input.machine as BookingEventEntry["entityType"],
      entityId: input.id,
      from: row[key] as string,
      to: input.to,
      reason: input.reason,
    });
  }
  return updated;
}
