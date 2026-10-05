import type { CareTasksDoneRequest, CareTasksDoneResponse } from "@app/contracts/endpoints/careTasks.done";
import { careTask } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { careTaskItems } from "./list.ts";

type TaskRow = typeof careTask.$inferSelect;

/** 05#ep-careTasks.done: pending → done with done_at = now, done_by = the user, note and an optional stay_update photo */
export async function careTasksDone(ctx: RequestContext, input: CareTasksDoneRequest & { taskId: string }): Promise<CareTasksDoneResponse> {
  requireRole(ctx, "careTasks.done");
  const row = await withTx(ctx, async (tx) => {
    const [t] = (await tenantDb(ctx, tx).select(careTask, eq(careTask.id, input.taskId))) as TaskRow[];
    if (!t) throw new AppError("NOT_FOUND");
    if (input.photoFileId) await commitFile(tx, ctx, input.photoFileId, "stay_update");
    return (await transition(tx, ctx, {
      table: careTask,
      id: t.id,
      machine: "care_task",
      to: "done",
      extraSet: {
        doneAt: ctx.now,
        doneBy: ctx.actor.id,
        note: input.note || null,
        photoFileId: input.photoFileId ?? null,
        updatedAt: ctx.now,
      },
    })) as TaskRow;
  });
  const [item] = await careTaskItems(ctx, getDb(), [row]);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}
