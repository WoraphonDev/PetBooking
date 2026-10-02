import type { CustomersUpdateRequest, CustomersUpdateResponse } from "@app/contracts/endpoints/customers.update";
import { customer, ownerProfile } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerDetail } from "./get.ts";

const OWNER_FIELDS = [
  "firstName",
  "lastName",
  "nickname",
  "email",
  "birthDate",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
] as const;

/** R-22: null clears; anything else must normalize */
function phoneOrNull(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizePhone({ input: value });
  if (!normalized.e164) throw new AppError("INVALID_PHONE");
  return normalized.e164;
}

/** PATCH a customer: only the fields sent change (05#ep-customers.update). */
export async function customersUpdate(
  ctx: RequestContext,
  input: CustomersUpdateRequest & { customerId: string },
): Promise<CustomersUpdateResponse> {
  requireRole(ctx, "customers.update");
  // 05: deposit exemption is an owner decision
  if (input.depositExempt !== undefined && !(ctx.actor.type === "staff" && ctx.actor.role === "owner")) throw new AppError("FORBIDDEN");
  const phone = input.phone === undefined ? undefined : phoneOrNull(input.phone);
  const emergencyPhone = input.emergencyContactPhone === undefined ? undefined : phoneOrNull(input.emergencyContactPhone);

  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [current] = (await db.select(customer, eq(customer.id, input.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!current) throw new AppError("NOT_FOUND");

    const ownerSet: Partial<typeof ownerProfile.$inferInsert> = {};
    for (const key of OWNER_FIELDS) if (input[key] !== undefined) Object.assign(ownerSet, { [key]: input[key] });
    if (phone !== undefined) ownerSet.phoneE164 = phone;
    // owner_profile is shared; reached through the tenant-checked customer
    if (Object.keys(ownerSet).length)
      await tx
        .update(ownerProfile)
        .set({ ...ownerSet, updatedAt: ctx.now })
        .where(eq(ownerProfile.id, current.ownerProfileId));

    const customerSet: Partial<Omit<typeof customer.$inferInsert, "organizationId">> = {};
    if (input.emergencyContactName !== undefined) customerSet.emergencyContactName = input.emergencyContactName;
    if (emergencyPhone !== undefined) customerSet.emergencyContactPhone = emergencyPhone;
    if (input.internalNote !== undefined) customerSet.internalNote = input.internalNote;
    if (input.depositExempt !== undefined) customerSet.depositExempt = input.depositExempt;
    if (input.photoConsent !== undefined) {
      customerSet.photoConsent = input.photoConsent;
      customerSet.photoConsentAt = ctx.now;
    }
    const [updated] = (await db.update(
      customer,
      { ...customerSet, updatedAt: ctx.now },
      eq(customer.id, current.id),
    )) as (typeof customer.$inferSelect)[];
    if (!updated) throw new AppError("NOT_FOUND");
    return customerDetail(ctx, tx, updated);
  });
}
