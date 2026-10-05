import type { CareTasksSkipRequest, CareTasksSkipResponse } from "@app/contracts/endpoints/careTasks.skip";
import { careTask } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { careTaskItems } from "./list.ts";

type TaskRow = typeof careTask.$inferSelect;

/** 05#ep-careTasks.skip: pending → skipped with the reason in note */
export async function careTasksSkip(ctx: RequestContext, input: CareTasksSkipRequest & { taskId: string }): Promise<CareTasksSkipResponse> {
  requireRole(ctx, "careTasks.skip");
  const row = await withTx(ctx, async (tx) => {
    const [t] = (await tenantDb(ctx, tx).select(careTask, eq(careTask.id, input.taskId))) as TaskRow[];
    if (!t) throw new AppError("NOT_FOUND");
    return (await transition(tx, ctx, {
      table: careTask,
      id: t.id,
      machine: "care_task",
      to: "skipped",
      extraSet: { note: input.note, updatedAt: ctx.now },
    })) as TaskRow;
  });
  const [item] = await careTaskItems(ctx, getDb(), [row]);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}
