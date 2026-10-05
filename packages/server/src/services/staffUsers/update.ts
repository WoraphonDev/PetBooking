import type { StaffUsersUpdateRequest, StaffUsersUpdateResponse } from "@app/contracts/endpoints/staffUsers.update";
import { groomAppointment, staffUser } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import { revokeAllFor } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { staffUserItems } from "./list.ts";

type StaffRow = typeof staffUser.$inferSelect;

/**
 * 05#ep-staffUsers.update: profile fields (R-22 phone), role (audit staff.role_change), status active ↔ disabled only
 * (audit staff.disable; disabling signs the person out everywhere). The organization keeps at least one active owner
 * (LAST_OWNER). A disabled groomer's future appointments stay: warning GROOMER_HAS_FUTURE_APPOINTMENTS (Q-0116).
 * photoFileId waits for a staff-photo file kind (Q-0116) → VALIDATION_FAILED.
 */
export async function staffUsersUpdate(
  ctx: RequestContext,
  input: StaffUsersUpdateRequest & { staffUserId: string },
): Promise<StaffUsersUpdateResponse> {
  requireRole(ctx, "staffUsers.update");
  if (input.photoFileId) throw new AppError("VALIDATION_FAILED", { fields: { photoFileId: "no staff photo file kind yet (Q-0116)" } });
  let phone: string | undefined;
  if (input.phone !== undefined) {
    const p = normalizePhone({ input: input.phone });
    if (p.error || !p.e164) throw new AppError(p.error ?? "INVALID_PHONE", { field: "phone" });
    phone = p.e164;
  }
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(staffUser, eq(staffUser.id, input.staffUserId)).for("update")) as StaffRow[];
    if (!s) throw new AppError("NOT_FOUND");
    if (input.status && input.status !== s.status && s.status === "invited") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
    const role = input.role ?? s.role;
    const status = input.status ?? s.status;
    if (s.role === "owner" && s.status === "active" && (role !== "owner" || status !== "active")) {
      const owners = await db.select(staffUser, and(eq(staffUser.role, "owner"), eq(staffUser.status, "active"), ne(staffUser.id, s.id)));
      if (owners.length === 0) throw new AppError("LAST_OWNER");
    }

    const { staffUserId: _id, photoFileId: _photo, ...fields } = input;
    const [row] = (await db.update(
      staffUser,
      { ...fields, ...(phone ? { phone } : {}), updatedAt: ctx.now },
      eq(staffUser.id, s.id),
    )) as StaffRow[];
    if (!row) throw new AppError("NOT_FOUND");
    if (role !== s.role)
      await writeAudit(tx, ctx, {
        action: "staff.role_change",
        entityType: "staff_user",
        entityId: s.id,
        before: { role: s.role },
        after: { role },
      });
    const warnings: NonNullable<StaffUsersUpdateResponse["warnings"]> = [];
    if (status !== s.status) {
      if (status === "disabled") {
        await writeAudit(tx, ctx, {
          action: "staff.disable",
          entityType: "staff_user",
          entityId: s.id,
          before: { status: s.status },
          after: { status },
        });
        await revokeAllFor(tx, { type: "staff", id: s.id });
        const future = (await db.select(
          groomAppointment,
          and(
            eq(groomAppointment.groomerId, s.id),
            inArray(groomAppointment.status, ["scheduled", "checked_in", "in_progress"]),
            gt(groomAppointment.endsAt, ctx.now),
          ),
        )) as (typeof groomAppointment.$inferSelect)[];
        if (future.length)
          warnings.push({
            code: "GROOMER_HAS_FUTURE_APPOINTMENTS",
            message: `ช่างยังมีนัดที่ค้างอยู่ ${future.length} นัด`,
            data: { appointmentIds: future.map((a) => a.id) },
          });
      } else {
        await writeAudit(tx, ctx, {
          action: "staff.disable",
          entityType: "staff_user",
          entityId: s.id,
          before: { status: s.status },
          after: { status },
        });
      }
    }
    const [item] = await staffUserItems(ctx, tx, [row]);
    if (!item) throw new AppError("NOT_FOUND");
    return warnings.length ? { ...item, warnings } : item;
  });
}
