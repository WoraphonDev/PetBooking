import type { CareTaskItem } from "@app/contracts/dto/care-task-item";
import type { CareTasksListRequest, CareTasksListResponse } from "@app/contracts/endpoints/careTasks.list";
import { branch, careTask, pet, roomUnit, staffUser, stay, stayMedication } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";

type TaskRow = typeof careTask.$inferSelect;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/** 05#dto-CareTaskItem for org-checked task rows: pet name, room code, done-by name, signed photo, "medication dose" */
export async function careTaskItems(ctx: RequestContext, db: Executor, rows: TaskRow[]): Promise<CareTaskItem[]> {
  if (rows.length === 0) return [];
  const repo = tenantDb(ctx, db);
  const stays = (await repo.select(stay, inArray(stay.id, unique(rows.map((t) => t.stayId))))) as (typeof stay.$inferSelect)[];
  // pet has no organization_id: reached through the org-checked stays
  const pets = await db
    .select({ id: pet.id, name: pet.name })
    .from(pet)
    .where(inArray(pet.id, unique(stays.map((s) => s.petId))));
  const unitIds = unique(stays.flatMap((s) => (s.roomUnitId ? [s.roomUnitId] : [])));
  const units = unitIds.length ? ((await repo.select(roomUnit, inArray(roomUnit.id, unitIds))) as (typeof roomUnit.$inferSelect)[]) : [];
  const doers = unique(rows.flatMap((t) => (t.doneBy ? [t.doneBy] : [])));
  const staff = doers.length ? ((await repo.select(staffUser, inArray(staffUser.id, doers))) as (typeof staffUser.$inferSelect)[]) : [];
  const medIds = unique(rows.flatMap((t) => (t.medicationId ? [t.medicationId] : [])));
  const meds = medIds.length
    ? ((await repo.select(stayMedication, inArray(stayMedication.id, medIds))) as (typeof stayMedication.$inferSelect)[])
    : [];
  return Promise.all(
    rows.map(async (t) => {
      const s = stays.find((x) => x.id === t.stayId);
      const med = meds.find((m) => m.id === t.medicationId);
      return {
        id: t.id,
        stayId: t.stayId,
        petName: pets.find((p) => p.id === s?.petId)?.name ?? "",
        roomCode: units.find((u) => u.id === s?.roomUnitId)?.code ?? null,
        taskType: t.taskType,
        title: t.title,
        dueAt: t.dueAt.toISOString(),
        status: t.status,
        doneAt: t.doneAt?.toISOString() ?? null,
        doneByName: staff.find((x) => x.id === t.doneBy)?.displayName ?? null,
        note: t.note,
        photoUrl: t.photoFileId ? await signedUrl(db, ctx, t.photoFileId) : null,
        medication: med ? `${med.name} ${med.dose}` : null,
      };
    }),
  );
}

/** 05#ep-careTasks.list: the session branch's tasks due on the branch-local `date`, optional status / stay, by due time */
export async function careTasksList(ctx: RequestContext, input: CareTasksListRequest): Promise<CareTasksListResponse> {
  requireRole(ctx, "careTasks.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const repo = tenantDb(ctx, db);
  const [br] = (await repo.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const { start, end } = localDayBounds({ date: input.date, timezone: br.timezone });
  const rows = (await repo
    .select(
      careTask,
      and(
        eq(careTask.branchId, br.id),
        gte(careTask.dueAt, new Date(start)),
        lt(careTask.dueAt, new Date(end)),
        input.status ? eq(careTask.status, input.status) : undefined,
        input.stayId ? eq(careTask.stayId, input.stayId) : undefined,
      ),
    )
    .orderBy(asc(careTask.dueAt), asc(careTask.taskType), asc(careTask.title), asc(careTask.id))) as TaskRow[];
  return careTaskItems(ctx, db, rows);
}
