import type { CustomersCreateRequest, CustomersCreateResponse } from "@app/contracts/endpoints/customers.create";
import { customer, ownerProfile } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerDetail } from "./get.ts";

/** Walk-in customer: owner_profile (created in this org) + customer in one transaction (05#ep-customers.create). */
export async function customersCreate(ctx: RequestContext, input: CustomersCreateRequest): Promise<CustomersCreateResponse> {
  requireRole(ctx, "customers.create");
  const orgId = ctx.orgId;
  if (!orgId) throw new AppError("NOT_FOUND");
  let phoneE164: string | null = null;
  if (input.phone) {
    const normalized = normalizePhone({ input: input.phone });
    if (!normalized.e164) throw new AppError("INVALID_PHONE");
    phoneE164 = normalized.e164;
  }
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    // customers of this shop that already use the number (a warning, not an error)
    const duplicateCustomerIds = phoneE164
      ? (
          (await db.select(
            customer,
            inArray(
              customer.ownerProfileId,
              tx.select({ id: ownerProfile.id }).from(ownerProfile).where(eq(ownerProfile.phoneE164, phoneE164)),
            ),
          )) as (typeof customer.$inferSelect)[]
        ).map((c) => c.id)
      : [];

    const [owner] = await tx
      .insert(ownerProfile)
      .values({
        createdInOrgId: orgId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        nickname: input.nickname ?? null,
        phoneE164,
        email: input.email ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!owner) throw new Error("customers.create: owner_profile insert returned nothing");
    const [created] = (await db.insert(customer, {
      ownerProfileId: owner.id,
      sourceChannel: input.sourceChannel,
      referralNote: input.referralNote ?? null,
      internalNote: input.internalNote ?? null,
      photoConsent: input.photoConsent,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof customer.$inferSelect)[];
    if (!created) throw new Error("customers.create: customer insert returned nothing");

    const detail = await customerDetail(ctx, tx, created);
    if (duplicateCustomerIds.length === 0) return detail;
    return {
      ...detail,
      warnings: [{ code: "DUPLICATE_PHONE", message: "เบอร์นี้ซ้ำกับลูกค้าเดิมในร้าน", data: { duplicateCustomerIds } }],
    };
  });
}
