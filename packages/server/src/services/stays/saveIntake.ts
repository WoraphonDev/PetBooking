import type { StaysSaveIntakeRequest, StaysSaveIntakeResponse } from "@app/contracts/endpoints/stays.saveIntake";
import { branch, careTask, stay, stayBelonging, stayIntake, stayMedication } from "@app/db/schema";
import { generateCareTasks } from "@app/domain/care/care-tasks";
import { normalizePhone } from "@app/domain/format/phone";
import { and, eq, gt, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { stayDetail } from "./get.ts";

type Med = typeof stayMedication.$inferSelect;
const hhmm = (t: string) => t.slice(0, 5);
const medKey = (m: { name: string; dose: string; times: string[]; instructions?: string | null }) =>
  JSON.stringify([m.name, m.dose, m.times.map(hhmm), m.instructions || null]);

/**
 * 05#ep-stays.saveIntake (reserved / checked_in, else STATUS_NOT_ALLOWED): upserts stay_intake (R-22 emergency phone),
 * commits condition / belonging photos (stay_update files), replaces medications (an unchanged one keeps its id and task
 * history, Q-0111) and belongings; complete → completed_at = now (by the user). A checked-in stay gets R-26 again: its future
 * pending tasks are rebuilt from the new form.
 */
export async function staysSaveIntake(
  ctx: RequestContext,
  input: StaysSaveIntakeRequest & { stayId: string },
): Promise<StaysSaveIntakeResponse> {
  requireRole(ctx, "stays.saveIntake");
  const phone = normalizePhone({ input: input.emergencyContactPhone });
  if (phone.error || !phone.e164) throw new AppError(phone.error ?? "INVALID_PHONE", { field: "emergencyContactPhone" });
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId)).for("update")) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    if (s.status !== "reserved" && s.status !== "checked_in") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
    const photoIds = [...new Set(input.conditionPhotoIds ?? [])];
    for (const id of photoIds) await commitFile(tx, ctx, id, "stay_update");
    for (const b of input.belongings ?? []) if (b.photoFileId) await commitFile(tx, ctx, b.photoFileId, "stay_update");

    const [existing] = (await db.select(stayIntake, eq(stayIntake.stayId, s.id))) as (typeof stayIntake.$inferSelect)[];
    const fields = {
      foodBrand: input.foodBrand || null,
      foodAmount: input.foodAmount || null,
      feedingTimes: input.feedingTimes,
      foodProvidedByOwner: input.foodProvidedByOwner,
      walksPerDay: input.walksPerDay,
      conditionNote: input.conditionNote || null,
      conditionPhotoIds: photoIds,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: phone.e164,
      vetClinicName: input.vetClinicName || null,
      vetClinicPhone: input.vetClinicPhone || null,
      ...(input.complete ? { completedAt: ctx.now, completedBy: ctx.actor.id } : {}),
      updatedAt: ctx.now,
    };
    if (existing) await db.update(stayIntake, fields, eq(stayIntake.stayId, s.id));
    else await db.insert(stayIntake, { stayId: s.id, ...fields, createdAt: ctx.now });

    // medications: keep unchanged rows (their care tasks reference them, cascade on delete), replace the rest
    const meds = (await db.select(stayMedication, eq(stayMedication.stayId, s.id))) as Med[];
    const wanted = (input.medications ?? []).map((m) => ({ ...m, key: medKey(m) }));
    const keep = new Set<string>();
    for (const w of wanted) {
      const match = meds.find((m) => !keep.has(m.id) && medKey(m) === w.key);
      if (match) keep.add(match.id);
    }
    const drop = meds.filter((m) => !keep.has(m.id)).map((m) => m.id);
    // tenantDb has no delete: filter by the tenant key explicitly
    const org = ctx.orgId ?? "";
    if (drop.length) await tx.delete(stayMedication).where(and(eq(stayMedication.organizationId, org), inArray(stayMedication.id, drop)));
    const kept = meds.filter((m) => keep.has(m.id)).map(medKey);
    for (const w of wanted) {
      const i = kept.indexOf(w.key);
      if (i >= 0) {
        kept.splice(i, 1);
        continue;
      }
      await db.insert(stayMedication, {
        stayId: s.id,
        name: w.name,
        dose: w.dose,
        times: w.times,
        instructions: w.instructions || null,
        createdAt: ctx.now,
      });
    }
    await tx.delete(stayBelonging).where(and(eq(stayBelonging.organizationId, org), eq(stayBelonging.stayId, s.id)));
    for (const b of input.belongings ?? [])
      await db.insert(stayBelonging, {
        stayId: s.id,
        item: b.item,
        quantity: b.quantity,
        photoFileId: b.photoFileId ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });

    if (s.status === "checked_in" && s.checkedInAt) await rebuildFutureTasks(tx, ctx, s, input);
  });
  return stayDetail(ctx, getDb(), input.stayId);
}

/** R-26 "แก้ฟอร์มระหว่างพัก → ลบ task pending ในอนาคตแล้วสร้างใหม่" */
async function rebuildFutureTasks(tx: Tx, ctx: RequestContext, s: typeof stay.$inferSelect, input: StaysSaveIntakeRequest) {
  const db = tenantDb(ctx, tx);
  await tx
    .delete(careTask)
    .where(
      and(
        eq(careTask.organizationId, ctx.orgId ?? ""),
        eq(careTask.stayId, s.id),
        eq(careTask.status, "pending"),
        gt(careTask.dueAt, ctx.now),
      ),
    );
  const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
  const meds = (await db.select(stayMedication, eq(stayMedication.stayId, s.id))) as Med[];
  const plan = generateCareTasks({
    checkedInAt: (s.checkedInAt ?? ctx.now).toISOString(),
    checkOutDate: s.checkOutDate,
    expectedCheckOutTime: s.expectedCheckOutTime ? hhmm(s.expectedCheckOutTime) : null,
    timezone: br?.timezone ?? ctx.timezone,
    feedingTimes: input.feedingTimes,
    medications: meds.map((m) => ({ id: m.id, name: m.name, times: m.times.map(hhmm) })),
    walksPerDay: input.walksPerDay,
  });
  for (const t of plan)
    if (new Date(t.dueAt) > ctx.now)
      await db.insert(careTask, {
        branchId: s.branchId,
        stayId: s.id,
        taskType: t.taskType,
        title: t.title,
        dueAt: new Date(t.dueAt),
        medicationId: t.medicationId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
}
