import { branch, careTask, organization, pet, roomUnit, staffUser, stay } from "@app/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { makeSystemCtx } from "../../context.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

const GRACE_MS = 30 * 60_000;

/**
 * 07 §2 care_task_overdue_scan (global, every 15 min): pending care_task with due_at + 30 min < now →
 * staff.care_task_overdue to every active staff. "ยังไม่เคยแจ้ง" = the `care_overdue:{taskId}` dedupe.
 */
export const handler: JobHandler = async (tx, ctx) => {
  const cutoff = new Date(ctx.now.getTime() - GRACE_MS);
  for (const org of await tx.select({ id: organization.id }).from(organization)) {
    const orgCtx = makeSystemCtx(org.id, ctx.now);
    const db = tenantDb(orgCtx, tx);
    const tasks = (await db.select(
      careTask,
      and(eq(careTask.status, "pending"), lt(careTask.dueAt, cutoff)),
    )) as (typeof careTask.$inferSelect)[];
    if (!tasks.length) continue;
    // Q-0064: staff_user has no branch — "active in the branch" = every active staff of the organization
    const staff = (await db.select(staffUser, eq(staffUser.status, "active"))) as (typeof staffUser.$inferSelect)[];
    for (const task of tasks) {
      const [s] = (await db.select(stay, eq(stay.id, task.stayId))) as (typeof stay.$inferSelect)[];
      const [room] = s ? ((await db.select(roomUnit, eq(roomUnit.id, s.roomUnitId))) as (typeof roomUnit.$inferSelect)[]) : [];
      const [br] = (await db.select(branch, eq(branch.id, task.branchId))) as (typeof branch.$inferSelect)[];
      if (!s || !room || !br) continue;
      // pet has no organization_id: reached through the org-checked stay row
      const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, s.petId));
      for (const member of staff)
        await enqueueNotification(
          tx,
          { ...orgCtx, branchId: br.id, timezone: br.timezone },
          {
            key: "staff.care_task_overdue",
            recipient: { type: "staff", id: member.id },
            payload: { title: task.title, petName: p?.name ?? "", roomCode: room.code },
            dedupeKey: `care_overdue:${task.id}`,
          },
        );
    }
  }
};
